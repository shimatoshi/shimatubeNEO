import logging
import time
import threading
import urllib.parse

import yt_dlp

from utils.db import filter_blocked

log = logging.getLogger('shimatube')

# 日本の配信中ライブ (5分キャッシュ)。ライブはすぐ入れ替わるので trending より短く持つ。
# YouTube検索の sp=EgJAAQ%3D%3D は「ライブ」フィルタ。シードを複数使ってマージする。
_cache = {'items': None, 'expiry': 0}
_lock = threading.Lock()
_TTL = 300

_SEEDS = ['ライブ', '配信', 'live']
_SP_LIVE = 'EgJAAQ%3D%3D'


def _fetch_seed(seed, limit=25):
    url = (f"https://www.youtube.com/results?search_query={urllib.parse.quote(seed)}"
           f"&sp={_SP_LIVE}&gl=JP&hl=ja")
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': True,
        'skip_download': True,
        'playlistend': limit,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        result = ydl.extract_info(url, download=False)
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
            "lengthSeconds": None,
            "viewCount": v.get('view_count'),
            "uploadDate": "",
            "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
            "is_live": True,
        })
    return items


def _fetch_live():
    seen, merged = set(), []
    for seed in _SEEDS:
        try:
            for it in _fetch_seed(seed):
                if it['videoId'] in seen:
                    continue
                seen.add(it['videoId'])
                merged.append(it)
        except Exception as e:
            log.warning(f"Live seed '{seed}' failed: {e}")
    # 視聴者数(view_count)が取れるものは多い順。取れないものは検索順のまま後ろへ
    merged.sort(key=lambda x: x.get('viewCount') or 0, reverse=True)
    return merged[:40]


def handle_live(handler):
    """ライブメニュー用: 配信中の動画一覧 (5分キャッシュ)"""
    with _lock:
        cached = _cache['items'] if time.time() < _cache['expiry'] else None
    if cached is None:
        items = _fetch_live()
        if items:
            with _lock:
                _cache['items'] = items
                _cache['expiry'] = time.time() + _TTL
            cached = items
        else:
            cached = _cache['items'] or []
    handler.send_json(filter_blocked(cached, handler.user_id))
