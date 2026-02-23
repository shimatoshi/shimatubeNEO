import http.server
import socketserver
import subprocess
import json
import urllib.parse
import urllib.request
import urllib.error
import os
import threading
import re
import logging
import hashlib
import time

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('shimatube')

PORT = 8080
DATA_FILE = "user_data.json"
AUTH_PASSWORD = os.environ.get('SHIMATUBE_PASS', 'shimatube')

# URL cache: vid:qual -> {"url": str, "meta": dict, "expiry": float}
url_cache = {}
url_cache_lock = threading.Lock()

def make_token(password):
    return hashlib.sha256(f"shimatube-neo:{password}".encode()).hexdigest()

def format_date(date_str):
    if not date_str:
        return ""
    try:
        return f"{date_str[:4]}/{date_str[4:6]}/{date_str[6:]}"
    except (IndexError, TypeError):
        return str(date_str)

def load_data():
    default_data = {
        "subscriptions": [],
        "history": [],
        "categories": ["Trending", "News"],
        "blocked_channels": [],
        "blocked_keywords": []
    }
    if not os.path.exists(DATA_FILE):
        return default_data
    try:
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
            for k, v in default_data.items():
                if k not in data:
                    data[k] = v
            return data
    except (json.JSONDecodeError, IOError) as e:
        log.warning(f"Failed to load {DATA_FILE}: {e}")
        return default_data

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

def is_blocked(item, data):
    for bc in data.get('blocked_channels', []):
        if item.get('channelId') == bc.get('id'):
            return True
    title = item.get('title', '').lower()
    for kw in data.get('blocked_keywords', []):
        if kw.lower() in title:
            return True
    return False


def get_video_url(vid, qual="720"):
    """Extract direct YouTube CDN URL via yt-dlp, with 4h cache."""
    cache_key = f"{vid}:{qual}"
    with url_cache_lock:
        cached = url_cache.get(cache_key)
        if cached and time.time() < cached["expiry"]:
            return cached["url"], cached["meta"]

    try:
        fmt = f"best[ext=mp4][height<={qual}]/best[ext=mp4]/best"
        cmd = ["yt-dlp", "--dump-json", "-f", fmt,
               f"https://www.youtube.com/watch?v={vid}"]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=20)
        d = json.loads(r.stdout)

        stream_url = d.get('url')
        if not stream_url and d.get('requested_formats'):
            stream_url = d['requested_formats'][0].get('url')

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
                    "meta": meta,
                    "expiry": time.time() + 14400  # 4 hours
                }

        return stream_url, meta
    except Exception as e:
        log.error(f"get_video_url error for {vid}: {e}")
        return None, {}


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def check_auth(self):
        # Header auth
        auth = self.headers.get('Authorization', '')
        if auth.startswith('Bearer '):
            if auth[7:] == make_token(AUTH_PASSWORD):
                return True
        # Query param auth (for <video> src and download links)
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        token = params.get('token', [''])[0]
        if token and token == make_token(AUTH_PASSWORD):
            return True
        return False

    def require_auth(self):
        if not self.check_auth():
            self.send_response(401)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Unauthorized"}).encode())
            return False
        return True

    def do_POST(self):
        try:
            length = int(self.headers['Content-Length'])
            req = json.loads(self.rfile.read(length).decode('utf-8'))
            action = req.get('action')
            payload = req.get('payload')

            if action == 'login':
                if payload == AUTH_PASSWORD:
                    self.send_json({"status": True, "token": make_token(AUTH_PASSWORD)})
                else:
                    self.send_response(401)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Wrong password"}).encode())
                return

            if not self.require_auth():
                return

            data = load_data()
            if action == 'update_categories':
                data['categories'] = payload
            elif action == 'block_channel':
                if not any(x['id'] == payload['id'] for x in data['blocked_channels']):
                    data['blocked_channels'].append(payload)
            elif action == 'unblock_channel':
                data['blocked_channels'] = [x for x in data['blocked_channels'] if x['id'] != payload['id']]
            elif action == 'block_keyword':
                if payload not in data['blocked_keywords']:
                    data['blocked_keywords'].append(payload)
            elif action == 'unblock_keyword':
                data['blocked_keywords'] = [x for x in data['blocked_keywords'] if x != payload]

            save_data(data)
            self.send_json({"status": True, "data": data})
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            log.error(f"POST error: {e}")
            self.send_error(400, str(e))
        except Exception as e:
            log.error(f"POST internal error: {e}")
            self.send_error(500, str(e))

    def do_GET(self):
        if self.path == "/api/auth_check":
            if self.check_auth():
                self.send_json({"authenticated": True})
            else:
                self.send_response(401)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"authenticated": False}).encode())
            return

        # Static files (no auth)
        if not self.path.startswith("/api") and not self.path.startswith("/stream"):
            super().do_GET()
            return

        # All API/stream endpoints require auth
        if not self.require_auth():
            return

        if self.path == "/api/user_data":
            self.send_json(load_data())
        elif self.path.startswith("/api_proxy/api/v1/search"):
            self.handle_search()
        elif self.path.startswith("/api_proxy/api/v1/channels/"):
            self.handle_channel()
        elif self.path.startswith("/api_proxy/api/v1/videos/"):
            self.handle_video_details()
        elif self.path.startswith("/api_proxy/api/v1/comments/"):
            self.handle_comments()
        elif self.path.startswith("/api_proxy/api/v1/playlists/"):
            self.handle_playlist()
        elif self.path.startswith("/stream/"):
            self.handle_stream()
        else:
            self.send_error(404)

    def handle_search(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        query = params.get('q', [''])[0]
        stype = params.get('type', ['video'])[0]
        page = int(params.get('page', ['1'])[0])
        live_filter = params.get('filter', [''])[0]
        udata = load_data()

        try:
            per_page = 20
            fetch_count = page * per_page

            log.info(f"Search: '{query}', type={stype}, filter={live_filter}, page={page}")

            if live_filter == 'live':
                command = [
                    "yt-dlp",
                    f"ytsearch{fetch_count}:{query}",
                    "--dump-json", "--skip-download",
                    "--match-filter", "live_status = was_live"
                ]
            else:
                command = [
                    "yt-dlp",
                    f"ytsearch{fetch_count}:{query}",
                    "--dump-json", "--flat-playlist", "--skip-download"
                ]

            result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8', timeout=120)
            all_items = []
            seen_channels = set()

            for line in result.stdout.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    v = json.loads(line)
                except json.JSONDecodeError:
                    continue

                cid = v.get('channel_id') or v.get('id')
                cname = v.get('channel') or v.get('uploader') or v.get('title')

                if stype == 'channel':
                    if cid and cid not in seen_channels:
                        seen_channels.add(cid)
                        item = {
                            "type": "channel",
                            "channelId": cid,
                            "title": cname,
                            "thumbnail": f"https://ui-avatars.com/api/?name={urllib.parse.quote(str(cname))}&background=random"
                        }
                        if not is_blocked(item, udata):
                            all_items.append(item)
                else:
                    if not v.get('id'):
                        continue
                    item = {
                        "type": "video",
                        "videoId": v.get('id'),
                        "title": v.get('title'),
                        "author": cname,
                        "channelId": v.get('channel_id'),
                        "lengthSeconds": v.get('duration'),
                        "viewCount": v.get('view_count'),
                        "uploadDate": format_date(v.get('upload_date')),
                        "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg"
                    }
                    if not is_blocked(item, udata):
                        all_items.append(item)

            # Slice for the requested page
            start_idx = (page - 1) * per_page
            items = all_items[start_idx:start_idx + per_page]
            self.send_json(items)
        except subprocess.TimeoutExpired:
            log.warning(f"Search timeout: {query}")
            self.send_json([])
        except Exception as e:
            log.error(f"Search error: {e}")
            self.send_error(500, str(e))

    def handle_channel(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        page = int(params.get('page', ['1'])[0])
        live_filter = params.get('filter', [''])[0]
        cid = self.path.split('/')[-1].split('?')[0]
        udata = load_data()

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
                item = {
                    "type": "video",
                    "videoId": v.get('id'),
                    "title": v.get('title'),
                    "lengthSeconds": v.get('duration'),
                    "viewCount": v.get('view_count'),
                    "uploadDate": format_date(v.get('upload_date')),
                    "channelId": cid,
                    "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
                    "author": ctitle
                }
                if not is_blocked(item, udata):
                    vids.append(item)
            self.send_json({"channel": {"title": ctitle}, "videos": vids})
        except subprocess.TimeoutExpired:
            log.warning(f"Channel timeout: {cid}")
            self.send_json({"channel": {"title": "Unknown"}, "videos": []})
        except Exception as e:
            log.error(f"Channel error: {e}")
            self.send_error(500, str(e))

    def handle_video_details(self):
        vid = self.path.split('/')[-1].split('?')[0]
        parsed = urllib.parse.urlparse(self.path)
        qual = urllib.parse.parse_qs(parsed.query).get('quality', ['720'])[0]

        stream_url, meta = get_video_url(vid, qual)

        self.send_json({
            "status": "ready" if stream_url else "error",
            "url": f"/stream/{vid}" if stream_url else None,
            "metadata": meta
        })

    def handle_stream(self):
        """Proxy stream from YouTube CDN to client. No disk storage."""
        parts = self.path.split('?')[0].strip('/').split('/')
        vid = parts[-1] if parts else ''
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        is_download = params.get('dl', ['0'])[0] == '1'
        qual = params.get('quality', ['720'])[0]

        stream_url, meta = get_video_url(vid, qual)
        if not stream_url:
            self.send_error(502, "Could not get stream URL")
            return

        try:
            req = urllib.request.Request(stream_url)
            req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')

            # Forward Range header for seeking
            range_header = self.headers.get('Range')
            if range_header:
                req.add_header('Range', range_header)

            resp = urllib.request.urlopen(req, timeout=10)

            self.send_response(resp.status)
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Accept-Ranges', 'bytes')

            if is_download:
                title = re.sub(r'[<>:"/\\|?*\n]', '_', meta.get('title') or vid)
                self.send_header('Content-Disposition', f'attachment; filename="{title}.mp4"')

            for h in ['Content-Length', 'Content-Range']:
                val = resp.headers.get(h)
                if val:
                    self.send_header(h, val)

            self.end_headers()

            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    break

            resp.close()

        except urllib.error.HTTPError as e:
            if e.code == 403:
                # URL expired, clear cache
                with url_cache_lock:
                    url_cache.pop(f"{vid}:{qual}", None)
                log.warning(f"Stream URL expired for {vid}, cleared cache")
                self.send_error(502, "Stream URL expired, please retry")
            else:
                log.error(f"Stream proxy HTTP error: {e.code}")
                self.send_error(502, str(e))
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            log.error(f"Stream error: {e}")

    def handle_comments(self):
        vid = self.path.split('/')[-1]
        try:
            cmd = [
                "yt-dlp", "--write-comments", "--extractor-args",
                "youtube:max_comments=20;player_client=android",
                "--dump-json", "--skip-download",
                f"https://www.youtube.com/watch?v={vid}"
            ]
            r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=30)
            cmts = []
            for line in r.stdout.strip().split('\n'):
                if not line:
                    continue
                try:
                    d = json.loads(line)
                    for c in d.get('comments', []):
                        cmts.append({"author": c.get('author'), "text": c.get('text')})
                except json.JSONDecodeError:
                    continue
            self.send_json(cmts)
        except subprocess.TimeoutExpired:
            log.warning(f"Timeout fetching comments for {vid}")
            self.send_json([])
        except Exception as e:
            log.error(f"Comments error: {e}")
            self.send_error(500, str(e))

    def handle_playlist(self):
        pid = self.path.split('/')[-1].split('?')[0]
        try:
            log.info(f"Playlist: {pid}")
            cmd = [
                "yt-dlp", f"https://www.youtube.com/playlist?list={pid}",
                "--playlist-end", "200",
                "--dump-json", "--flat-playlist", "--skip-download"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=60)

            videos = []
            ptitle = "Playlist"
            for line in res.stdout.strip().split('\n'):
                if not line:
                    continue
                try:
                    v = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if ptitle == "Playlist":
                    ptitle = v.get('playlist_title') or v.get('playlist') or "Playlist"
                if not v.get('id'):
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

            self.send_json({"title": ptitle, "videos": videos})
        except subprocess.TimeoutExpired:
            log.warning(f"Playlist timeout: {pid}")
            self.send_json({"title": "Playlist", "videos": []})
        except Exception as e:
            log.error(f"Playlist error: {e}")
            self.send_error(500, str(e))

    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        b = json.dumps(data).encode('utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)


class ThreadingHTTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

log.info(f"ShimaTube NEO server running on port {PORT}")
log.info(f"Password: {'*' * len(AUTH_PASSWORD)} (set SHIMATUBE_PASS env to change)")
log.info("Stream mode: proxy (no disk storage)")
with ThreadingHTTPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
