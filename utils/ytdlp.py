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
_SEM_WAIT = 20

# ~/shimatube/cookies.txt があればログイン状態で抽出（ボット検出回避）。
COOKIES_FILE = os.path.expanduser('~/shimatube/cookies.txt')

# 1動画につき extract_info は1回だけ。1回の抽出から
#   - metadata
#   - progressive(itag18, 360p, /stream中継&DLフォールバック用)
#   - muxed HLS {height: m3u8_url}（itag91-96/300等, 公式画質720p/1080p用）
# を全部取り出し、共有キャッシュ(v:<vid>)に4h保存する。
# player_client は絞らない（web には HLS muxed が無く default 集合に有るため）。
_EXTRACT_FMT = "18/best[acodec!=none][vcodec!=none]"


def _extract_video(vid):
    """1動画を1回だけ抽出してキャッシュエントリ(dict)を返す。失敗時 None。"""
    ckey = f"v:{vid}"
    with url_cache_lock:
        c = url_cache.get(ckey)
        if c and time.time() < c["expiry"]:
            return c

    ydl_opts = {
        'format': _EXTRACT_FMT,
        'quiet': True,
        'no_warnings': True,
        # n-signature チャレンジ解決に Node + EJS が必須（無いと formats 全ドロップ）
        'js_runtimes': {'node': {}},
        'remote_components': ['ejs:github'],
        'socket_timeout': 15,
        'retries': 1,
    }
    if os.path.exists(COOKIES_FILE):
        ydl_opts['cookiefile'] = COOKIES_FILE

    if not _extract_sem.acquire(timeout=_SEM_WAIT):
        log.warning(f"extract semaphore busy, skip {vid}")
        return None
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            d = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
    except Exception as e:
        log.error(f"extract error for {vid}: {e}")
        return None
    finally:
        _extract_sem.release()

    is_live = bool(d.get('is_live') or d.get('live_status') == 'is_live')
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

    formats = d.get('formats', [])
    prog_url, prog_headers = None, {}
    hls = {}          # height -> m3u8 url（muxed のみ）
    live_hls = None   # 生放送用の任意 m3u8
    for f in formats:
        url = f.get('url')
        if not url:
            continue
        muxed = f.get('vcodec') not in (None, 'none') and f.get('acodec') not in (None, 'none')
        proto = f.get('protocol', '')
        if proto in ('m3u8', 'm3u8_native'):
            if muxed and f.get('height'):
                h = f['height']
                # 同じ height は最初の1本（fps低い方が先に来る傾向）でよい
                hls.setdefault(h, url)
            if live_hls is None:
                live_hls = url
        elif muxed and proto in ('https', 'http') and f.get('height'):
            # progressive(itag18/22)。itag18優先、無ければ最初の muxed-https。
            if prog_url is None or f.get('format_id') == '18':
                prog_url, prog_headers = url, f.get('http_headers', {})

    entry = {
        "meta": meta,
        "prog_url": prog_url,
        "prog_headers": prog_headers,
        "hls": hls,
        "live_hls": live_hls if is_live else None,
        "is_live": is_live,
        "expiry": time.time() + 14400,
    }
    # 何かしら再生ソースが取れた時だけキャッシュ
    if prog_url or hls or live_hls:
        with url_cache_lock:
            url_cache[ckey] = entry
    return entry


def get_play_info(vid):
    """プレイヤー用: 1抽出で {meta, prog_url, hls(heights), is_live, live_hls} を返す。"""
    return _extract_video(vid)


def get_hls_url(vid, height=720):
    """muxed HLS の m3u8 URL を返す（共有キャッシュを使うので追加抽出なし）。
    返り値: (m3u8_url, headers)。height 以下で最大、無ければ最小を選ぶ。"""
    e = _extract_video(vid)
    if not e:
        return None, {}
    hls = e.get("hls") or {}
    if e.get("is_live") and e.get("live_hls") and not hls:
        return e["live_hls"], {}
    if not hls:
        return None, {}
    avail = sorted(hls.keys())
    le = [h for h in avail if h <= height]
    pick = max(le) if le else min(avail)
    return hls.get(pick), {}


def get_cached_meta(vid, qual="720"):
    """キャッシュ済みなら (prog_url, headers, meta) を返す（yt-dlp呼び出しなし）。"""
    with url_cache_lock:
        e = url_cache.get(f"v:{vid}")
        if e and time.time() < e["expiry"]:
            return e.get("prog_url"), e.get("prog_headers", {}), e["meta"]
    return None, None, None


def get_video_url(vid, qual="720", audio_only=False):
    """progressive(=/stream中継用の単一URL)とメタを返す。HLSは get_hls_url 側。"""
    if audio_only:
        return _get_audio_url(vid)
    e = _extract_video(vid)
    if not e:
        return None, {}, {}
    # 生放送は HLS をそのまま返す（従来通り meta['hls_url']）
    if e.get("is_live") and e.get("live_hls"):
        meta = dict(e["meta"]); meta["hls_url"] = e["live_hls"]
        return e["live_hls"], {}, meta
    return e.get("prog_url"), e.get("prog_headers", {}), e["meta"]


_AUDIO_CLIENTS = ['web']


def _get_audio_url(vid):
    """音声のみ（バックグラウンド再生用）。軽い別抽出・短期キャッシュ。"""
    cache_key = f"audio:{vid}"
    with url_cache_lock:
        c = url_cache.get(cache_key)
        if c and time.time() < c["expiry"]:
            return c["url"], c.get("headers", {}), c["meta"]
    ydl_opts = {
        'format': "bestaudio[ext=m4a]/bestaudio",
        'quiet': True, 'no_warnings': True,
        'js_runtimes': {'node': {}}, 'remote_components': ['ejs:github'],
        'socket_timeout': 15, 'retries': 1,
    }
    if os.path.exists(COOKIES_FILE):
        ydl_opts['cookiefile'] = COOKIES_FILE
    if not _extract_sem.acquire(timeout=_SEM_WAIT):
        return None, {}, {}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            d = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)
    except Exception as e:
        log.error(f"audio extract error {vid}: {e}")
        return None, {}, {}
    finally:
        _extract_sem.release()
    meta = {"title": d.get('title'), "author": d.get('uploader'),
            "channelId": d.get('channel_id'), "is_live": False}
    url = d.get('url')
    headers = d.get('http_headers', {})
    if url:
        with url_cache_lock:
            url_cache[cache_key] = {"url": url, "headers": headers, "meta": meta,
                                    "expiry": time.time() + 14400}
    return url, headers, meta
