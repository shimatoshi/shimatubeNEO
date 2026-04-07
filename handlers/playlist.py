import re
import logging

import yt_dlp

from utils.formatting import format_date

log = logging.getLogger('shimatube')

_VALID_PID = re.compile(r'^[a-zA-Z0-9_-]{10,60}$')

def handle_playlist(handler):
    pid = handler.path.split('/')[-1].split('?')[0]
    if not _VALID_PID.match(pid):
        handler.send_error(400, "Invalid playlist ID")
        return
    try:
        log.info(f"Playlist: {pid}")

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'playlistend': 200,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(
                f"https://www.youtube.com/playlist?list={pid}", download=False)

        videos = []
        ptitle = result.get('title') or "Playlist" if result else "Playlist"
        entries = result.get('entries', []) if result else []

        for v in entries:
            if v is None or not v.get('id'):
                continue
            videos.append({
                "type": "video",
                "videoId": v.get('id'),
                "title": v.get('title'),
                "author": v.get('channel') or v.get('uploader') or '',
                "channelId": v.get('channel_id'),
                "lengthSeconds": v.get('duration'),
                "viewCount": v.get('view_count'),
                "uploadDate": format_date(v.get('upload_date')),
                "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg"
            })

        handler.send_json({"title": ptitle, "videos": videos})
    except Exception as e:
        log.error(f"Playlist error: {e}")
        handler.send_error(500, str(e))
