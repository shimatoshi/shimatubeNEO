import urllib.parse
import re

from utils.ytdlp import get_video_url

_VALID_VID = re.compile(r'^[a-zA-Z0-9_-]{6,20}$')

def handle_video_details(handler):
    vid = handler.path.split('/')[-1].split('?')[0]
    if not _VALID_VID.match(vid):
        handler.send_error(400, "Invalid video ID")
        return

    parsed = urllib.parse.urlparse(handler.path)
    qual = urllib.parse.parse_qs(parsed.query).get('quality', ['720'])[0]

    stream_url, _, meta = get_video_url(vid, qual)

    is_live = meta.get('is_live', False)
    handler.send_json({
        "status": "ready" if stream_url else "error",
        "url": f"/stream/{vid}" if (stream_url and not is_live) else None,
        "is_live": is_live,
        "hls_url": meta.get('hls_url') if is_live else None,
        "metadata": meta
    })
