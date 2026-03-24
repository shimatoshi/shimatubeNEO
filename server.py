import http.server
import socketserver
import logging

from utils.response import JsonResponseMixin
from handlers.search import handle_search
from handlers.channel import handle_channel
from handlers.video import handle_video_details
from handlers.stream import handle_stream
from handlers.playlist import handle_playlist
from handlers.comments import handle_comments
from handlers.user_data import handle_user_data_get, handle_user_data_post

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('shimatube')

PORT = 8080

ROUTES = [
    ("/api/user_data",              handle_user_data_get),
    ("/api_proxy/api/v1/search",    handle_search),
    ("/api_proxy/api/v1/channels/", handle_channel),
    ("/api_proxy/api/v1/videos/",   handle_video_details),
    ("/api_proxy/api/v1/comments/", handle_comments),
    ("/api_proxy/api/v1/playlists/",handle_playlist),
    ("/stream/",                    handle_stream),
]


class CustomHandler(JsonResponseMixin, http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if not self.path.startswith("/api") and not self.path.startswith("/stream"):
            super().do_GET()
            return

        for prefix, handler_fn in ROUTES:
            if self.path == prefix or self.path.startswith(prefix):
                handler_fn(self)
                return
        self.send_error(404)

    def do_POST(self):
        handle_user_data_post(self)


class ThreadingHTTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


log.info(f"ShimaTube NEO server running on port {PORT}")
log.info("Stream mode: proxy (no disk storage)")
with ThreadingHTTPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
