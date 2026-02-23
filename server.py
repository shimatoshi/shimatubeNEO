import http.server
import socketserver
import subprocess
import json
import urllib.parse
import os
import threading
import re
import logging

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('shimatube')

PORT = 8080
DATA_FILE = "user_data.json"
DOWNLOAD_DIR = "downloads"

download_lock = threading.Lock()
download_states = {}

if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)

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

def download_worker(video_id, quality="720"):
    target_path = os.path.join(DOWNLOAD_DIR, f"{video_id}.mp4")
    if os.path.exists(target_path):
        with download_lock:
            download_states[video_id] = {"status": "ready"}
        return
    with download_lock:
        download_states[video_id] = {"status": "downloading"}
    try:
        fmt = f"bestvideo[ext=mp4][height<={quality}]+bestaudio[ext=m4a]/best[ext=mp4][height<={quality}]"
        command = [
            "yt-dlp", "--downloader", "aria2c", "--downloader-args", "aria2c:-x 16 -k 1M",
            "--extractor-args", "youtube:player_client=android", "-f", fmt,
            "--merge-output-format", "mp4", "-o", target_path,
            f"https://www.youtube.com/watch?v={video_id}"
        ]
        subprocess.run(command, check=True)
        with download_lock:
            download_states[video_id] = {"status": "ready"}
        log.info(f"Download complete: {video_id}")
    except subprocess.CalledProcessError as e:
        log.error(f"Download failed for {video_id}: {e}")
        with download_lock:
            download_states[video_id] = {"status": "error"}

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # suppress default access logs

    def do_POST(self):
        try:
            length = int(self.headers['Content-Length'])
            req = json.loads(self.rfile.read(length).decode('utf-8'))
            action = req.get('action')
            payload = req.get('payload')
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
        if self.path == "/api/user_data":
            self.send_json(load_data())
            return

        if self.path.startswith("/api_proxy/api/v1/search"):
            self.handle_search()
            return
        elif self.path.startswith("/api_proxy/api/v1/channels/"):
            self.handle_channel()
            return
        elif self.path.startswith("/api_proxy/api/v1/videos/"):
            self.handle_video_details()
            return
        elif self.path.startswith("/api_proxy/api/v1/comments/"):
            self.handle_comments()
            return
        elif self.path.startswith("/downloads/"):
            self.serve_file(self.path.strip("/"))
            return
        else:
            super().do_GET()

    def handle_search(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        query = params.get('q', [''])[0]
        stype = params.get('type', ['video'])[0]
        page = int(params.get('page', ['1'])[0])
        udata = load_data()

        try:
            per_page = 20
            start = (page - 1) * per_page + 1
            end = page * per_page

            log.info(f"Search: '{query}', Page: {page}, Items: {start}-{end}")

            command = [
                "yt-dlp",
                f"ytsearch{end}:{query}",
                "--playlist-start", str(start),
                "--playlist-end", str(end),
                "--dump-json", "--flat-playlist", "--no-playlist", "--skip-download"
            ]
            result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
            items = []
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
                            "thumbnail": f"https://ui-avatars.com/api/?name={cname}&background=random"
                        }
                        if not is_blocked(item, udata):
                            items.append(item)
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
                        items.append(item)

            self.send_json(items)
        except Exception as e:
            log.error(f"Search error: {e}")
            self.send_error(500, str(e))

    def handle_channel(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        page = int(params.get('page', ['1'])[0])
        cid = self.path.split('/')[-1].split('?')[0]
        udata = load_data()
        try:
            per_page = 20
            start = (page - 1) * per_page + 1
            end = page * per_page
            log.info(f"Channel: {cid}, Page: {page}, Items: {start}-{end}")
            cmd = [
                "yt-dlp", f"https://www.youtube.com/channel/{cid}/videos",
                "--playlist-start", str(start), "--playlist-end", str(end),
                "--dump-json", "--flat-playlist", "--skip-download"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8')
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
        except Exception as e:
            log.error(f"Channel error: {e}")
            self.send_error(500, str(e))

    def handle_video_details(self):
        vid = self.path.split('/')[-1].split('?')[0]
        parsed = urllib.parse.urlparse(self.path)
        qual = urllib.parse.parse_qs(parsed.query).get('quality', ['720'])[0]
        meta = {}
        try:
            cmd = ["yt-dlp", "--dump-json", "--skip-download", f"https://www.youtube.com/watch?v={vid}"]
            r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=15)
            d = json.loads(r.stdout)
            meta = {
                "title": d.get('title'),
                "description": d.get('description'),
                "author": d.get('uploader'),
                "channelId": d.get('channel_id'),
                "viewCount": d.get('view_count'),
                "uploadDate": format_date(d.get('upload_date')),
                "thumbnail": d.get('thumbnail')
            }
        except subprocess.TimeoutExpired:
            log.warning(f"Timeout fetching metadata for {vid}")
        except (json.JSONDecodeError, subprocess.CalledProcessError) as e:
            log.warning(f"Failed to get metadata for {vid}: {e}")

        tpath = os.path.join(DOWNLOAD_DIR, f"{vid}.mp4")
        st = "ready" if os.path.exists(tpath) else "downloading"
        with download_lock:
            if st == "downloading" and download_states.get(vid, {}).get("status") != "downloading":
                threading.Thread(target=download_worker, args=(vid, qual), daemon=True).start()

        self.send_json({"status": st, "url": f"/downloads/{vid}.mp4" if st == "ready" else None, "metadata": meta})

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

    def send_json(self, data):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        b = json.dumps(data).encode('utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def serve_file(self, path_with_query):
        parsed = urllib.parse.urlparse(path_with_query)
        path = parsed.path.strip("/")
        query = urllib.parse.parse_qs(parsed.query)
        is_download = query.get('dl', ['0'])[0] == '1'

        # パストラバーサル防止
        real_path = os.path.realpath(path)
        allowed_dir = os.path.realpath(DOWNLOAD_DIR)
        if not real_path.startswith(allowed_dir):
            self.send_error(403)
            return

        if not os.path.exists(path):
            self.send_error(404)
            return

        try:
            file_size = os.path.getsize(path)
            range_header = self.headers.get('Range')

            start, end, length = 0, file_size - 1, file_size
            status_code = 200
            headers = {}

            if is_download:
                filename = os.path.basename(path)
                headers['Content-Disposition'] = f'attachment; filename="{filename}"'

            if range_header:
                byte_range = re.search(r'bytes=(\d+)-(\d*)', range_header)
                if byte_range:
                    start = int(byte_range.group(1))
                    if byte_range.group(2):
                        end = int(byte_range.group(2))
                    length = end - start + 1
                    status_code = 206
                    headers['Content-Range'] = f'bytes {start}-{end}/{file_size}'

            self.send_response(status_code)
            for k, v in headers.items():
                self.send_header(k, v)

            self.send_header('Content-Length', str(length))
            self.send_header('Content-Type', 'video/mp4')
            self.send_header('Accept-Ranges', 'bytes')
            self.end_headers()

            buffer_size = 4 * 1024 * 1024  # 4MB

            with open(path, 'rb') as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    read_size = min(buffer_size, remaining)
                    chunk = f.read(read_size)
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except (BrokenPipeError, ConnectionResetError):
                        break
                    remaining -= len(chunk)

        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:
            log.error(f"Stream error: {e}")


class ThreadingHTTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

log.info(f"ShimaTube NEO server running on port {PORT}")
with ThreadingHTTPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
