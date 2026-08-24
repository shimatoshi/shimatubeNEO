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

# YouTube側の仕様変更に古いyt-dlpが追従できないと、抽出が
# "The page needs to be reloaded."(YouTubeが返す拒否文言) で全滅する。
# 2026-08-24に本番で発生。実測(2026-08-25, 実機同等構成):
#   <=2025.10.14 → 全動画で失敗 / >=2025.10.22 → 解消
# ただし公式画質のmuxed HLSが取れるかは版とplayer_clientの組み合わせ次第なので、
# 下限は「再生経路を通しで検証済みの版」に置く。
YTDLP_MIN_VERSION = (2026, 8, 19)
_MIN_VERSION_STR = '.'.join(str(n) for n in YTDLP_MIN_VERSION)

# YouTubeがリクエストごと拒否した時の文言。これが出たらまずyt-dlpが古い。
_PAGE_RELOAD_ERR = 'the page needs to be reloaded'

# 抽出に使う player_client。1つでは足りず、役割の違う3つを併用する:
#   default    … progressive(itag18) とメタデータの主力
#   tv_simply  … 生放送。これが無いと live で "Requested format is not available"
#                (2026-08-15コミットの経緯。2026.08.19版でも依然必須と再確認)
#   web_safari … VOD の muxed HLS(公式画質 144-1080)。yt-dlp 2026.08.19 では
#                default+tv_simply だけだと muxed HLS が0件になり公式画質が消える
_PLAYER_CLIENTS = ['default', 'tv_simply', 'web_safari']


def _version_tuple(s):
    out = []
    for chunk in s.split('.')[:3]:
        try:
            out.append(int(chunk))
        except ValueError:
            return ()
    return tuple(out)


def check_ytdlp_version():
    """起動時に1回呼ぶ。古いyt-dlpは再生不能の直接原因なので大きく警告する。"""
    cur = yt_dlp.version.__version__
    if _version_tuple(cur) < YTDLP_MIN_VERSION:
        log.error(f"yt-dlp {cur} is older than required {_MIN_VERSION_STR}. "
                  f"Playback will fail with 'The page needs to be reloaded.' "
                  f"Fix: pip install -U yt-dlp")
        return False
    log.info(f"yt-dlp {cur} (>= {_MIN_VERSION_STR}) OK")
    return True


def _run_extract(ydl_opts, vid):
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)


def _log_extract_failure(vid, err):
    """server.log だけ見れば原因と対処が分かるようにしておく。"""
    log.error(f"extract error for {vid}: {err}")
    if _PAGE_RELOAD_ERR in str(err).lower():
        log.error(f"{vid}: YouTube rejected this yt-dlp build "
                  f"(installed {yt_dlp.version.__version__}, "
                  f"need >= {_MIN_VERSION_STR}). Fix: pip install -U yt-dlp")


def _extract_with_cookie_fallback(ydl_opts, vid):
    """cookies付きで抽出し、失敗したらcookies無しで1回だけ再試行する。
    期限切れcookieはYouTubeにセッションごと拒否されうるので、素の状態も試す。
    両方失敗したら None（呼び出し側は再生不可として扱う）。"""
    try:
        return _run_extract(ydl_opts, vid)
    except Exception as e:
        if 'cookiefile' not in ydl_opts:
            _log_extract_failure(vid, e)
            return None
        log.warning(f"extract with cookies failed for {vid}, retrying without: {e}")

    retry_opts = dict(ydl_opts)
    retry_opts.pop('cookiefile', None)
    try:
        return _run_extract(retry_opts, vid)
    except Exception as e:
        _log_extract_failure(vid, e)
        return None


# 1動画につき extract_info は1回だけ。1回の抽出から
#   - metadata
#   - progressive(itag18, 360p, /stream中継&DLフォールバック用)
#   - muxed HLS {height: m3u8_url}（itag91-96/300等, 公式画質720p/1080p用）
# を全部取り出し、共有キャッシュ(v:<vid>)に4h保存する。
# player_client は絞らない（web には HLS muxed が無く default 集合に有るため）。
_EXTRACT_FMT = "18/best[acodec!=none][vcodec!=none]"


def _audio_lang_score(f):
    """オリジナル音声を優先するスコア(大きいほど優先)。
    自動吹替(auto-dub)動画では同じheightに複数言語が並び、formatsリストは
    吹替が先に来る(実測: 91-0 en-US lp=5 '(default)' → 91-1 ja lp=10 '(original)')。
    先頭を素朴に拾うと英語吹替を掴むため、note='original' を第一キー、
    language_preference を第二キーにする。"""
    note = (f.get('format_note') or '').lower()
    lp = f.get('language_preference')
    lp = lp if lp is not None else 0
    if 'original' in note:
        return 1000 + lp
    if 'dub' in note:  # 'dubbed', 'dubbed-auto'
        return -1000 + lp
    return lp


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
        'extractor_args': {'youtube': {'player_client': _PLAYER_CLIENTS}},
    }
    if os.path.exists(COOKIES_FILE):
        ydl_opts['cookiefile'] = COOKIES_FILE

    if not _extract_sem.acquire(timeout=_SEM_WAIT):
        log.warning(f"extract semaphore busy, skip {vid}")
        return None
    try:
        d = _extract_with_cookie_fallback(ydl_opts, vid)
    finally:
        _extract_sem.release()
    if d is None:
        return None

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
    prog_score = float('-inf')
    hls = {}          # height -> m3u8 url（muxed のみ）
    hls_score = {}    # height -> 音声言語スコア（original優先）
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
                # 同height複数本(自動吹替の言語違い等)は original 音声を優先。
                # スコア同点は最初の1本（fps低い方が先に来る傾向）でよい
                sc = _audio_lang_score(f)
                if sc > hls_score.get(h, float('-inf')):
                    hls[h] = url
                    hls_score[h] = sc
            if live_hls is None:
                live_hls = url
        elif muxed and proto in ('https', 'http') and f.get('height'):
            # progressive(itag18/22)。original音声 > itag18 の順で優先。
            base_id = (f.get('format_id') or '').split('-')[0]
            sc = _audio_lang_score(f) * 2 + (1 if base_id == '18' else 0)
            if sc > prog_score:
                prog_url, prog_headers, prog_score = url, f.get('http_headers', {}), sc

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
        d = _extract_with_cookie_fallback(ydl_opts, vid)
    finally:
        _extract_sem.release()
    if d is None:
        return None, {}, {}
    meta = {"title": d.get('title'), "author": d.get('uploader'),
            "channelId": d.get('channel_id'), "is_live": False}
    url = d.get('url')
    headers = d.get('http_headers', {})
    if url:
        with url_cache_lock:
            url_cache[cache_key] = {"url": url, "headers": headers, "meta": meta,
                                    "expiry": time.time() + 14400}
    return url, headers, meta
