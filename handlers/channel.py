import urllib.parse
import subprocess
import json
import logging

from utils.db import filter_blocked
from utils.formatting import format_date

log = logging.getLogger('shimatube')

def handle_channel(handler):
    parsed = urllib.parse.urlparse(handler.path)
    params = urllib.parse.parse_qs(parsed.query)
    page = int(params.get('page', ['1'])[0])
    live_filter = params.get('filter', [''])[0]
    cid = handler.path.split('/')[-1].split('?')[0]
    try:
        per_page = 20
        start = (page - 1) * per_page + 1
        end = page * per_page
        tab = "streams" if live_filter == "live" else "videos"

        log.info(f"Channel: {cid}, tab={tab}, page={page}")

        cmd = [
            "yt-dlp", f"https://www.youtube.com/channel/{cid}/{tab}",
            "--playlist-start", str(start), "--playlist-end", str(end),
            "--dump-json", "--flat-playlist", "--skip-download"
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=60)

        vids = []
        ctitle = "Unknown"
        for line in res.stdout.strip().split('\n'):
            if not line:
                continue
            try:
                v = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ctitle == "Unknown":
                ctitle = v.get('uploader') or "Unknown"
            vids.append({
                "type": "video",
                "videoId": v.get('id'),
                "title": v.get('title'),
                "lengthSeconds": v.get('duration'),
                "viewCount": v.get('view_count'),
                "uploadDate": format_date(v.get('upload_date')),
                "channelId": cid,
                "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
                "author": ctitle
            })
        vids = filter_blocked(vids, handler.user_id)
        handler.send_json({"channel": {"title": ctitle}, "videos": vids})
    except subprocess.TimeoutExpired:
        log.warning(f"Channel timeout: {cid}")
        handler.send_json({"channel": {"title": "Unknown"}, "videos": []})
    except Exception as e:
        log.error(f"Channel error: {e}")
        handler.send_error(500, str(e))
