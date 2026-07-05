import logging
import time
import threading
import urllib.parse

import yt_dlp

from utils.db import filter_blocked
from utils.formatting import format_date

log = logging.getLogger('shimatube')

# 日本の人気動画 (30分キャッシュ)
# 本家YouTubeは2025年に急上昇ページ(FEtrending)を廃止したため、
# 「今週アップロード×再生数順」検索(sp=CAMSAggD)を日本語シードで叩いて代替する。
# シード「の」はほぼ全ての日本語動画タイトルに含まれるため、実質「日本の今週人気」になる。
_cache = {'items': None, 'expiry': 0}
_lock = threading.Lock()
_TTL = 1800

_SEEDS = ['の', '【']  # 複数シードをマージして偏りを減らす
_SP_WEEK_VIEWS = 'CAMSAggD'  # filter:今週 + sort:再生数


def _fetch_seed(seed, limit=25):
    url = (f"https://www.youtube.com/results?search_query={urllib.parse.quote(seed)}"
           f"&sp={_SP_WEEK_VIEWS}&gl=JP&hl=ja")
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
            "lengthSeconds": v.get('duration'),
            "viewCount": v.get('view_count'),
            "uploadDate": format_date(v.get('upload_date')),
            "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
        })
    return items


def _fetch_trending():
    seen = set()
    merged = []
    for seed in _SEEDS:
        try:
            for it in _fetch_seed(seed):
                if it['videoId'] in seen:
                    continue
                seen.add(it['videoId'])
                merged.append(it)
        except Exception as e:
            log.warning(f"Trending seed '{seed}' failed: {e}")
    merged.sort(key=lambda x: x.get('viewCount') or 0, reverse=True)
    return merged[:30]


def handle_trending(handler):
    """日本の人気動画 (ホーム画面用、30分キャッシュ)"""
    with _lock:
        cached = _cache['items'] if time.time() < _cache['expiry'] else None
    if cached is None:
        items = _fetch_trending()
        if items:
            with _lock:
                _cache['items'] = items
                _cache['expiry'] = time.time() + _TTL
            cached = items
        else:
            cached = _cache['items'] or []  # 全滅時は期限切れでも古いのを出す
    handler.send_json(filter_blocked(cached, handler.user_id))
