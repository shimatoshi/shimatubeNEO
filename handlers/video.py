import urllib.parse

from utils.ytdlp import get_video_url

def handle_video_details(handler):
    vid = handler.path.split('/')[-1].split('?')[0]
    parsed = urllib.parse.urlparse(handler.path)
    qual = urllib.parse.parse_qs(parsed.query).get('quality', ['720'])[0]

    stream_url, _, meta = get_video_url(vid, qual)

    handler.send_json({
        "status": "ready" if stream_url else "error",
        "url": f"/stream/{vid}" if stream_url else None,
        "metadata": meta
    })
