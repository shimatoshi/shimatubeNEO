import urllib.parse
import urllib.request
import urllib.error
import re
import ssl
import logging

from utils.ytdlp import get_video_url, url_cache, url_cache_lock

# SSL証明書設定（APK内ではcertifiを使用）
try:
    import certifi
    _ssl_ctx = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _ssl_ctx = None

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
    fmt = params.get('format', ['video'])[0]  # 'video' or 'audio'
    audio_only = fmt == 'audio'

    stream_url, cdn_headers, meta = get_video_url(vid, qual, audio_only=audio_only)
    if not stream_url:
        handler.send_error(502, "Could not get stream URL")
        return

    # dl=1(DLボタン)時はvideo/mp4のままだとWebViewがインライン再生を試みてナビゲーションをコミットしてしまい、
    # onDownloadStartが発火しない(=DownloadManager通知が出ない)。描画不能なoctet-streamにしてDL扱いを確定させる。
    if is_download:
        content_type = 'application/octet-stream'
    else:
        content_type = 'audio/mp4' if audio_only else 'video/mp4'
    file_ext = 'm4a' if audio_only else 'mp4'

    try:
        req = urllib.request.Request(stream_url)
        for k, v in cdn_headers.items():
            req.add_header(k, v)

        range_header = handler.headers.get('Range')
        if range_header:
            req.add_header('Range', range_header)

        resp = urllib.request.urlopen(req, timeout=10, context=_ssl_ctx)

        handler.send_response(resp.status)
        handler.send_header('Content-Type', content_type)
        handler.send_header('Accept-Ranges', 'bytes')

        if is_download:
            title = re.sub(r'[<>:"/\\|?*\n]', '_', meta.get('title') or vid)
            safe_title = urllib.parse.quote(title)
            handler.send_header('Content-Disposition',
                f"attachment; filename=\"{vid}.{file_ext}\"; filename*=UTF-8''{safe_title}.{file_ext}")

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
            cache_key = f"{vid}:{'audio' if audio_only else qual}"
            with url_cache_lock:
                url_cache.pop(cache_key, None)
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
