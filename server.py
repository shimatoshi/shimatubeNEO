import http.server
import socketserver
import logging
import uuid

from utils.response import JsonResponseMixin
from utils.db import init_db, ensure_user
from utils.auth import get_user_id, set_user_cookie
from handlers.search import handle_search
from handlers.channel import handle_channel
from handlers.video import handle_video_details
from handlers.stream import handle_stream
from handlers.playlist import handle_playlist
from handlers.comments import handle_comments
from handlers.user_data import handle_user_data_get, handle_user_data_post, handle_subscribe, handle_history

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('shimatube')

PORT = 8080

GET_ROUTES = [
    ("/api/user_data",              handle_user_data_get),
    ("/api_proxy/api/v1/search",    handle_search),
    ("/api_proxy/api/v1/channels/", handle_channel),
    ("/api_proxy/api/v1/videos/",   handle_video_details),
    ("/api_proxy/api/v1/comments/", handle_comments),
    ("/api_proxy/api/v1/playlists/",handle_playlist),
    ("/stream/",                    handle_stream),
]

POST_ROUTES = [
    ("/api/subscribe", handle_subscribe),
    ("/api/history",   handle_history),
]


class CustomHandler(JsonResponseMixin, http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def ensure_user_id(self):
        self.user_id = get_user_id(self)
        self._set_user_cookie = None
        if not self.user_id:
            self.user_id = str(uuid.uuid4())
            self._set_user_cookie = self.user_id
            ensure_user(self.user_id)

    def end_headers(self):
        if hasattr(self, '_set_user_cookie') and self._set_user_cookie:
            set_user_cookie(self, self._set_user_cookie)
            self._set_user_cookie = None
        # キャッシュ無効化: 古いキャッシュによるアップデート未反映を防止
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        self.ensure_user_id()
        if not self.path.startswith("/api") and not self.path.startswith("/stream"):
            super().do_GET()
            return

        for prefix, handler_fn in GET_ROUTES:
            if self.path == prefix or self.path.startswith(prefix):
                handler_fn(self)
                return
        self.send_error(404)

    def do_POST(self):
        self.ensure_user_id()
        for prefix, handler_fn in POST_ROUTES:
            if self.path == prefix:
                handler_fn(self)
                return
        if self.path == '/':
            handle_user_data_post(self)
        else:
            self.send_error(404)


class ThreadingHTTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


init_db()
log.info(f"ShimaTube NEO server running on port {PORT}")
log.info("Stream mode: proxy (no disk storage)")
with ThreadingHTTPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
