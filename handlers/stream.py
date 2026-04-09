import urllib.parse
import urllib.request
import urllib.error
import re
import logging

from utils.ytdlp import get_video_url, url_cache, url_cache_lock

log = logging.getLogger('shimatube')

_VALID_VID = re.compile(r'^[a-zA-Z0-9_-]{6,20}$')

def handle_stream(handler):
    """Proxy stream from YouTube CDN to client. No disk storage."""
    parts = handler.path.split('?')[0].strip('/').split('/')
    vid = parts[-1] if parts else ''
    if not _VALID_VID.match(vid):
        handler.send_error(400, "Invalid video ID")
        return

    parsed = urllib.parse.urlparse(handler.path)
    params = urllib.parse.parse_qs(parsed.query)
    is_download = params.get('dl', ['0'])[0] == '1'
    qual = params.get('quality', ['720'])[0]

    stream_url, cdn_headers, meta = get_video_url(vid, qual)
    if not stream_url:
        handler.send_error(502, "Could not get stream URL")
        return

    try:
        req = urllib.request.Request(stream_url)
        for k, v in cdn_headers.items():
            req.add_header(k, v)

        range_header = handler.headers.get('Range')
        if range_header:
            req.add_header('Range', range_header)

        resp = urllib.request.urlopen(req, timeout=10)

        handler.send_response(resp.status)
        handler.send_header('Content-Type', 'video/mp4')
        handler.send_header('Accept-Ranges', 'bytes')

        if is_download:
            title = re.sub(r'[<>:"/\\|?*\n]', '_', meta.get('title') or vid)
            safe_title = urllib.parse.quote(title)
            handler.send_header('Content-Disposition',
                f"attachment; filename=\"{vid}.mp4\"; filename*=UTF-8''{safe_title}.mp4")

        for h in ['Content-Length', 'Content-Range']:
            val = resp.headers.get(h)
            if val:
                handler.send_header(h, val)

        handler.end_headers()

        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            try:
                handler.wfile.write(chunk)
            except (BrokenPipeError, ConnectionResetError):
                break

        resp.close()

    except urllib.error.HTTPError as e:
        if e.code == 403:
            with url_cache_lock:
                url_cache.pop(f"{vid}:{qual}", None)
            log.warning(f"Stream URL expired for {vid}, cleared cache")
            handler.send_error(502, "Stream URL expired, please retry")
        else:
            log.error(f"Stream proxy HTTP error: {e.code}")
            handler.send_error(502, str(e))
    except (BrokenPipeError, ConnectionResetError):
        pass
    except Exception as e:
        log.error(f"Stream error: {e}")
        try:
            handler.send_error(503, "Stream unavailable")
        except Exception:
            pass
