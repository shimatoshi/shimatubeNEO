import subprocess
import json
import threading
import time
import logging

from utils.formatting import format_date

log = logging.getLogger('shimatube')

url_cache = {}
url_cache_lock = threading.Lock()

def get_video_url(vid, qual="720"):
    """Extract direct YouTube CDN URL via yt-dlp, with 4h cache."""
    cache_key = f"{vid}:{qual}"
    with url_cache_lock:
        cached = url_cache.get(cache_key)
        if cached and time.time() < cached["expiry"]:
            return cached["url"], cached.get("headers", {}), cached["meta"]

    try:
        fmt = f"best[ext=mp4][height<={qual}]/best[ext=mp4]/best"
        cmd = ["yt-dlp", "--dump-json", "-f", fmt,
               f"https://www.youtube.com/watch?v={vid}"]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=20)
        d = json.loads(r.stdout)

        source = d
        stream_url = d.get('url')
        if not stream_url and d.get('requested_formats'):
            source = d['requested_formats'][0]
            stream_url = source.get('url')

        headers = source.get('http_headers', {})

        meta = {
            "title": d.get('title'),
            "description": d.get('description'),
            "author": d.get('uploader'),
            "channelId": d.get('channel_id'),
            "viewCount": d.get('view_count'),
            "uploadDate": format_date(d.get('upload_date')),
            "thumbnail": d.get('thumbnail')
        }

        if stream_url:
            with url_cache_lock:
                url_cache[cache_key] = {
                    "url": stream_url,
                    "headers": headers,
                    "meta": meta,
                    "expiry": time.time() + 14400
                }

        return stream_url, headers, meta
    except Exception as e:
        log.error(f"get_video_url error for {vid}: {e}")
        return None, {}, {}
