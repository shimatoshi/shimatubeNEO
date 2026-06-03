import base64
import re
import ssl
import logging
import urllib.parse
import urllib.request
import urllib.error

from utils.ytdlp import get_hls_url

try:
    import certifi
    _ssl_ctx = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _ssl_ctx = None

log = logging.getLogger('shimatube')

_VALID_VID = re.compile(r'^[a-zA-Z0-9_-]{6,20}$')
_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'


def _b64e(s):
    return base64.urlsafe_b64encode(s.encode()).decode()


def _b64d(s):
    return base64.urlsafe_b64decode(s.encode()).decode()


def _rewrite_m3u8(text, base_url):
    """m3u8内のセグメント/子プレイリスト/鍵URIを /hls_seg プロキシ経由に書き換える。"""
    out = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            out.append(line)
            continue
        if s.startswith('#'):
            # #EXT-X-KEY:...URI="...", #EXT-X-MAP:URI="..." 内のURIも書き換え
            def _sub(m):
                uri = m.group(1)
                absu = urllib.parse.urljoin(base_url, uri)
                return f'URI="/hls_seg?u={_b64e(absu)}"'
            out.append(re.sub(r'URI="([^"]+)"', _sub, line))
        else:
            absu = urllib.parse.urljoin(base_url, s)
            out.append(f'/hls_seg?u={_b64e(absu)}')
    return '\n'.join(out)


def handle_hls(handler):
    """/hls/<vid>?q=720  -> プロキシ書き換え済み m3u8 を返す"""
    parsed = urllib.parse.urlparse(handler.path)
    vid = parsed.path.split('/')[-1]
    if not _VALID_VID.match(vid):
        handler.send_error(400, "Invalid video ID")
        return
    params = urllib.parse.parse_qs(parsed.query)
    height = int(params.get('q', ['720'])[0])
    debug = params.get('debug', ['0'])[0] == '1'

    m3u8_url, _ = get_hls_url(vid, height)
    if not m3u8_url:
        handler.send_error(502, "No HLS stream")
        return

    try:
        req = urllib.request.Request(m3u8_url, headers={'User-Agent': _UA})
        raw = urllib.request.urlopen(req, timeout=15, context=_ssl_ctx).read().decode('utf-8', 'replace')
    except Exception as e:
        log.error(f"HLS fetch error {vid}: {e}")
        handler.send_error(502, "HLS fetch failed")
        return

    if debug:
        body = (f"# SRC: {m3u8_url}\n# ---RAW---\n{raw}").encode()
        handler.send_response(200)
        handler.send_header('Content-Type', 'text/plain; charset=utf-8')
        handler.send_header('Content-Length', str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
        return

    body = _rewrite_m3u8(raw, m3u8_url).encode()
    handler.send_response(200)
    handler.send_header('Content-Type', 'application/vnd.apple.mpegurl')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def handle_hls_segment(handler):
    """/hls_seg?u=<b64 absolute url>  -> セグメント or 子m3u8 を中継。
    子が m3u8 ならそれも書き換える（master->media の入れ子対応）。"""
    parsed = urllib.parse.urlparse(handler.path)
    params = urllib.parse.parse_qs(parsed.query)
    enc = params.get('u', [''])[0]
    if not enc:
        handler.send_error(400, "missing u")
        return
    try:
        url = _b64d(enc)
    except Exception:
        handler.send_error(400, "bad u")
        return
    if 'googlevideo.com' not in url and 'youtube.com' not in url and '.googleusercontent.com' not in url:
        handler.send_error(403, "host not allowed")
        return

    headers = {'User-Agent': _UA}
    rng = handler.headers.get('Range')
    if rng:
        headers['Range'] = rng
    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15, context=_ssl_ctx)
        ctype = resp.headers.get('Content-Type', '')
        data = resp.read()
    except urllib.error.HTTPError as e:
        handler.send_error(502, f"seg {e.code}")
        return
    except Exception as e:
        log.error(f"HLS seg error: {e}")
        handler.send_error(502, "seg failed")
        return

    # 子が m3u8 なら書き換えて返す
    if 'mpegurl' in ctype.lower() or url.split('?')[0].endswith('.m3u8') or data[:7] == b'#EXTM3U':
        body = _rewrite_m3u8(data.decode('utf-8', 'replace'), url).encode()
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/vnd.apple.mpegurl')
        handler.send_header('Content-Length', str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
        return

    handler.send_response(resp.status)
    handler.send_header('Content-Type', ctype or 'video/mp2t')
    cl = resp.headers.get('Content-Length')
    if cl:
        handler.send_header('Content-Length', cl)
    cr = resp.headers.get('Content-Range')
    if cr:
        handler.send_header('Content-Range', cr)
    handler.end_headers()
    try:
        handler.wfile.write(data)
    except (BrokenPipeError, ConnectionResetError):
        pass
