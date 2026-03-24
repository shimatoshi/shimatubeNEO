import urllib.parse
import subprocess
import json
import logging

from utils.db import is_blocked
from utils.formatting import format_date

log = logging.getLogger('shimatube')

def handle_search(handler):
    parsed = urllib.parse.urlparse(handler.path)
    params = urllib.parse.parse_qs(parsed.query)
    query = params.get('q', [''])[0]
    page = int(params.get('page', ['1'])[0])
    live_filter = params.get('filter', [''])[0]
    try:
        per_page = 20
        fetch_count = page * per_page

        log.info(f"Search: '{query}', filter={live_filter}, page={page}")

        search_url = f"https://www.youtube.com/results?search_query={urllib.parse.quote(query)}"

        if live_filter == 'live':
            search_url += "&sp=EgJAAQ%3D%3D"

        command = [
            "yt-dlp", search_url,
            "--playlist-end", str(fetch_count),
            "--dump-json", "--flat-playlist", "--skip-download",
            "--cookies-from-browser", "chrome"
        ]

        result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', timeout=120)
        all_items = []

        for line in result.stdout.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                v = json.loads(line)
            except json.JSONDecodeError:
                continue

            ie_key = v.get('ie_key', '')
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
                if not is_blocked(item, handler.user_id):
                    all_items.append(item)
            elif ie_key == 'Youtube' or v.get('id'):
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
                if not is_blocked(item, handler.user_id):
                    all_items.append(item)

        start_idx = (page - 1) * per_page
        items = all_items[start_idx:start_idx + per_page]
        handler.send_json(items)
    except subprocess.TimeoutExpired:
        log.warning(f"Search timeout: {query}")
        handler.send_json([])
    except Exception as e:
        log.error(f"Search error: {e}")
        handler.send_error(500, str(e))
