import logging
import time
import threading

import yt_dlp

from utils.db import filter_blocked
from utils.formatting import format_date

log = logging.getLogger('shimatube')

# 日本の急上昇 (30分キャッシュ)
_cache = {'items': None, 'expiry': 0}
_lock = threading.Lock()
_TTL = 1800

TRENDING_URL = "https://www.youtube.com/feed/trending?gl=JP&hl=ja"


def _fetch_trending():
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'skip_download': True,
        'playlistend': 30,
        # 地域を日本に固定 (URLのgl=JPだけだとIP側の地域が勝つことがある)
        'geo_bypass_country': 'JP',
        'extractor_args': {'youtube': {'lang': ['ja']}},
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        result = ydl.extract_info(TRENDING_URL, download=False)
    items = []
    for v in (result.get('entries', []) if result else []):
        if v is None or not v.get('id'):
            continue
        items.append({
            "type": "video",
            "videoId": v.get('id'),
            "title": v.get('title'),
            "author": v.get('channel') or v.get('uploader') or '',
            "channelId": v.get('channel_id'),
            "lengthSeconds": v.get('duration'),
            "viewCount": v.get('view_count'),
            "uploadDate": format_date(v.get('upload_date')),
            "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
        })
    return items


def handle_trending(handler):
    """日本の急上昇動画 (ホーム画面用、30分キャッシュ)"""
    with _lock:
        cached = _cache['items'] if time.time() < _cache['expiry'] else None
    if cached is None:
        try:
            cached = _fetch_trending()
            with _lock:
                _cache['items'] = cached
                _cache['expiry'] = time.time() + _TTL
        except Exception as e:
            log.error(f"Trending fetch error: {e}")
            cached = _cache['items'] or []  # 期限切れでも古いのがあれば出す
    handler.send_json(filter_blocked(cached, handler.user_id))
