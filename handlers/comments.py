import re
import logging

import yt_dlp

log = logging.getLogger('shimatube')

_VALID_VID = re.compile(r'^[a-zA-Z0-9_-]{6,20}$')

def handle_comments(handler):
    vid = handler.path.split('/')[-1]
    if not _VALID_VID.match(vid):
        handler.send_error(400, "Invalid video ID")
        return
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'skip_download': True,
            'getcomments': True,
            'extractor_args': {'youtube': {'max_comments': ['20'], 'player_client': ['android']}},
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            d = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)

        cmts = []
        for c in d.get('comments', []):
            cmts.append({"author": c.get('author'), "text": c.get('text')})

        handler.send_json(cmts)
    except Exception as e:
        log.error(f"Comments error: {e}")
        handler.send_json([])
