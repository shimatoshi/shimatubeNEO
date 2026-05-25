import urllib.parse
import re
import logging

import yt_dlp

from utils.db import filter_blocked
from utils.formatting import format_date

log = logging.getLogger('shimatube')

_VALID_CID = re.compile(r'^[a-zA-Z0-9_@-]{2,60}$')

def handle_channel(handler):
    parsed = urllib.parse.urlparse(handler.path)
    params = urllib.parse.parse_qs(parsed.query)
    page = int(params.get('page', ['1'])[0])
    live_filter = params.get('filter', [''])[0]
    cid = handler.path.split('/')[-1].split('?')[0]
    if not _VALID_CID.match(cid):
        handler.send_error(400, "Invalid channel ID")
        return
    try:
        per_page = 20
        start = (page - 1) * per_page + 1
        end = page * per_page
        tab = "streams" if live_filter == "live" else "videos"

        log.info(f"Channel: {cid}, tab={tab}, page={page}")

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'playliststart': start,
            'playlistend': end,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(
                f"https://www.youtube.com/channel/{cid}/{tab}", download=False)

        vids = []
        ctitle = "Unknown"
        entries = result.get('entries', []) if result else []

        for v in entries:
            if v is None:
                continue
            if ctitle == "Unknown":
                ctitle = v.get('uploader') or v.get('channel') or "Unknown"
            entry_is_live = v.get('is_live') or v.get('live_status') == 'is_live'
            vids.append({
                "type": "video",
                "videoId": v.get('id'),
                "title": v.get('title'),
                "lengthSeconds": v.get('duration'),
                "viewCount": v.get('view_count'),
                "uploadDate": format_date(v.get('upload_date')),
                "channelId": cid,
                "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
                "author": ctitle,
                "is_live": entry_is_live,
            })

        if ctitle == "Unknown" and result:
            ctitle = result.get('uploader') or result.get('channel') or "Unknown"

        vids = filter_blocked(vids, handler.user_id)
        handler.send_json({"channel": {"title": ctitle}, "videos": vids})
    except Exception as e:
        log.error(f"Channel error: {e}")
        handler.send_error(500, str(e))
