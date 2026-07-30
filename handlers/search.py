import urllib.parse
import logging
import time
import threading

import yt_dlp

from utils.db import filter_blocked
from utils.formatting import format_date

log = logging.getLogger('shimatube')

# 検索結果キャッシュ (5分TTL)
_search_cache = {}
_search_cache_lock = threading.Lock()
_SEARCH_CACHE_TTL = 300

def _cache_key(query, page, live_filter, sort):
    return f"{query}:{page}:{live_filter}:{sort}"

# YouTube検索の sp パラメータ (sort=降順のみ)
_SORT_SP = {
    'date': 'CAI%3D',   # アップロード日(新しい順)
    'views': 'CAM%3D',  # 視聴回数(多い順)
}

def handle_search(handler):
    parsed = urllib.parse.urlparse(handler.path)
    params = urllib.parse.parse_qs(parsed.query)
    query = params.get('q', [''])[0]
    page = int(params.get('page', ['1'])[0])
    live_filter = params.get('filter', [''])[0]
    sort = params.get('sort', [''])[0]
    # 空クエリはyt-dlp側で例外になり500を返してしまうので、ここで空配列を返す
    if not query.strip():
        handler.send_json([])
        return
    try:
        # キャッシュチェック
        ck = _cache_key(query, page, live_filter, sort)
        with _search_cache_lock:
            cached = _search_cache.get(ck)
            if cached and time.time() < cached['expiry']:
                log.info(f"Search cache hit: '{query}', page={page}")
                items = filter_blocked(cached['items'], handler.user_id)
                handler.send_json(items)
                return

        per_page = 20
        start = (page - 1) * per_page + 1
        end = page * per_page

        log.info(f"Search: '{query}', filter={live_filter}, sort={sort}, page={page}")

        search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}"
        # sp は1つしか指定できないので live を優先、無ければ sort を適用
        if live_filter == 'live':
            search_url += "&sp=EgJAAQ%3D%3D"
        elif sort in _SORT_SP:
            search_url += f"&sp={_SORT_SP[sort]}"

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'playliststart': start,
            'playlistend': end,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(search_url, download=False)

        all_items = []
        entries = result.get('entries', []) if result else []

        for v in entries:
            if v is None:
                continue
            ie_key = v.get('ie_key', '') or v.get('_type', '')
            url = v.get('url', '')
            cname = v.get('channel') or v.get('uploader') or v.get('title') or ''

            if ie_key == 'YoutubeTab' and '/playlist?list=' in url:
                item = {
                    "type": "playlist",
                    "playlistId": v.get('id'),
                    "title": v.get('title'),
                    "thumbnail": f"https://i.ytimg.com/vi/{v.get('id', '')}/mqdefault.jpg"
                }
                all_items.append(item)
            elif ie_key == 'YoutubeTab' and '/channel/' in url:
                item = {
                    "type": "channel",
                    "channelId": v.get('id'),
                    "title": cname,
                    "thumbnail": f"https://ui-avatars.com/api/?name={urllib.parse.quote(str(cname))}&background=random"
                }
                all_items.append(item)
            elif ie_key in ('Youtube', '') or v.get('id'):
                vid = v.get('id')
                if not vid:
                    continue
                item = {
                    "type": "video",
                    "videoId": vid,
                    "title": v.get('title'),
                    "author": cname,
                    "channelId": v.get('channel_id'),
                    "lengthSeconds": v.get('duration'),
                    "viewCount": v.get('view_count'),
                    "uploadDate": format_date(v.get('upload_date')),
                    "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
                }
                all_items.append(item)

        # キャッシュ保存 (ブロックフィルタ前のデータを保存)
        with _search_cache_lock:
            _search_cache[ck] = {'items': all_items, 'expiry': time.time() + _SEARCH_CACHE_TTL}
            # 古いエントリ掃除 (100件超えたら期限切れ削除)
            if len(_search_cache) > 100:
                now = time.time()
                expired = [k for k, v in _search_cache.items() if now >= v['expiry']]
                for k in expired:
                    del _search_cache[k]

        items = filter_blocked(all_items, handler.user_id)
        handler.send_json(items)
    except Exception as e:
        log.error(f"Search error: {e}")
        handler.send_error(500, str(e))
