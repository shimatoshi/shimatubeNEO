import os
import threading
import time
import logging

import yt_dlp

from utils.formatting import format_date

log = logging.getLogger('shimatube')

url_cache = {}
url_cache_lock = threading.Lock()

# 同時 yt-dlp 抽出数の上限。電話のCPUは非力なので、prefetch等で大量並列に
# 撃たれると全抽出が遅延しスレッドが累積→サーバ全体(/api/version等)まで巻き添えで
# 遅くなる。同時実行を絞り、待てない分は早期に諦めてスレッドを溜めない。
_extract_sem = threading.BoundedSemaphore(2)
_SEM_WAIT = 20  # この秒数 acquire できなければ503で即返す

# cookies.txt でログイン認証している前提。サーバは単一の progressive URL を
# 中継する方式（音声+映像が1本になった形式が必須）なので、progressive(itag 18/22)
# を返す web/mweb を使う。tv 等は adaptive(分離) しか返さず "format not available" になる。
PLAYER_CLIENTS = ['web', 'mweb']
# ~/shimatube/cookies.txt があればログイン状態で抽出（最も確実な回避策）。
COOKIES_FILE = os.path.expanduser('~/shimatube/cookies.txt')

def get_hls_url(vid, height=720):
    """muxed HLS(音声+映像結合, itag 91-96/300等)のm3u8 URLを取得。
    web クライアントには無いので player_client を絞らずデフォルト集合を使う。
    返り値: (m3u8_url, http_headers)。4hキャッシュ。"""
    cache_key = f"hls:{vid}:{height}"
    with url_cache_lock:
        c = url_cache.get(cache_key)
        if c and time.time() < c["expiry"]:
            return c["url"], c.get("headers", {})

    fmt = (f"best[protocol*=m3u8][height<={height}][vcodec!=none][acodec!=none]/"
           f"best[protocol*=m3u8][vcodec!=none][acodec!=none]")
    ydl_opts = {
        'format': fmt,
        'quiet': True,
        'no_warnings': True,
        'js_runtimes': {'node': {}},
        'remote_components': ['ejs:github'],
        'socket_timeout': 15,
        'retries': 1,
    }
    if os.path.exists(COOKIES_FILE):
        ydl_opts['cookiefile'] = COOKIES_FILE
    if not _extract_sem.acquire(timeout=_SEM_WAIT):
        log.warning(f"hls semaphore busy, skip {vid}")
        return None, {}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            d = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
    except Exception as e:
        log.error(f"get_hls_url error for {vid}: {e}")
        return None, {}
    finally:
        _extract_sem.release()

    url = d.get('url')
    headers = d.get('http_headers', {})
    if url:
        with url_cache_lock:
            url_cache[cache_key] = {"url": url, "headers": headers, "expiry": time.time() + 14400}
    return url, headers


def get_cached_meta(vid, qual="720"):
    """キャッシュ済みメタデータがあれば返す (yt-dlp呼び出しなし)"""
    cache_key = f"{vid}:{qual}"
    with url_cache_lock:
        cached = url_cache.get(cache_key)
        if cached and time.time() < cached["expiry"]:
            return cached["url"], cached.get("headers", {}), cached["meta"]
    return None, None, None


def get_video_url(vid, qual="720", audio_only=False):
    """Extract direct YouTube CDN URL via yt-dlp library, with 4h cache."""
    cache_key = f"{vid}:{'audio' if audio_only else qual}"
    with url_cache_lock:
        cached = url_cache.get(cache_key)
        if cached and time.time() < cached["expiry"]:
            return cached["url"], cached.get("headers", {}), cached["meta"]

    try:
        if audio_only:
            fmt = "bestaudio[ext=m4a]/bestaudio"
        else:
            # progressive(音声+映像が1本)のみ。acodec/vcodec 両方ありを強制し、
            # 720p progressive(itag22)→任意progressive→itag18(360p) の順でフォールバック。
            fmt = (f"best[ext=mp4][height<={qual}][acodec!=none][vcodec!=none]/"
                   f"best[height<={qual}][acodec!=none][vcodec!=none]/18/best")
        ydl_opts = {
            'format': fmt,
            'quiet': True,
            'no_warnings': True,
            'extractor_args': {'youtube': {'player_client': PLAYER_CLIENTS}},
            # YouTube の n-signature チャレンジを解くため Node を JS ランタイムに使い
            # （yt-dlp はデフォルト deno のみ有効）、EJS 解決スクリプトを github から取得する。
            # これが無いと formats が全部ドロップされ "Requested format is not available" になる。
            'js_runtimes': {'node': {}},
            'remote_components': ['ejs:github'],
            # ハングした抽出が90秒スピンしてスレッドを溜めるのを防ぐ
            'socket_timeout': 15,
            'retries': 1,
        }
        if os.path.exists(COOKIES_FILE):
            ydl_opts['cookiefile'] = COOKIES_FILE
        # 同時抽出数を制限（待てなければ諦めてスレッドを溜めない）
        if not _extract_sem.acquire(timeout=_SEM_WAIT):
            log.warning(f"extract semaphore busy, skip {vid}")
            return None, {}, {}
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                d = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
        finally:
            _extract_sem.release()

        is_live = d.get('is_live') or d.get('live_status') == 'is_live'

        meta = {
            "title": d.get('title'),
            "description": d.get('description'),
            "author": d.get('uploader'),
            "channelId": d.get('channel_id'),
            "viewCount": d.get('view_count'),
            "uploadDate": format_date(d.get('upload_date')),
            "thumbnail": d.get('thumbnail'),
            "is_live": is_live,
        }

        if is_live:
            # 生放送: HLS m3u8 URL を取得（キャッシュなし）
            hls_url = None
            for f in sorted(d.get('formats', []), key=lambda x: x.get('height') or 0, reverse=True):
                if f.get('protocol') in ('m3u8', 'm3u8_native') and f.get('url'):
                    hls_url = f['url']
                    break
            if not hls_url:
                hls_url = d.get('manifest_url') or d.get('url')
            meta['hls_url'] = hls_url
            headers = d.get('http_headers', {})
            return hls_url, headers, meta

        source = d
        stream_url = d.get('url')
        if not stream_url and d.get('requested_formats'):
            source = d['requested_formats'][0]
            stream_url = source.get('url')

        headers = source.get('http_headers', {})

        if stream_url:
            with url_cache_lock:
                url_cache[cache_key] = {
                    "url": stream_url,
                    "headers": headers,
                    "meta": meta,
                    "expiry": time.time() + 14400
                }

        return stream_url, headers, meta
    except Exception as e:
        log.error(f"get_video_url error for {vid}: {e}")
        return None, {}, {}
