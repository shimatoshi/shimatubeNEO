"""共通HTTPハンドラー: server.pyとmain.pyで共有"""
import http.server
import os
import uuid

from utils.response import JsonResponseMixin
from utils.db import ensure_user
from utils.auth import get_user_id, set_user_cookie
from handlers.search import handle_search
from handlers.channel import handle_channel
from handlers.video import handle_video_details
from handlers.stream import handle_stream
from handlers.playlist import handle_playlist
from handlers.comments import handle_comments
from handlers.user_data import handle_user_data_get, handle_user_data_post, handle_subscribe, handle_history
from handlers.feed import handle_feed, handle_feed_refresh

GET_ROUTES = [
    ("/api/feed/refresh/",          handle_feed_refresh),
    ("/api/feed",                   handle_feed),
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

# 静的ファイル配信ディレクトリ: frontend/dist/ があればそちら、なければプロジェクトルート
_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DIST_DIR = os.path.join(_PROJECT_ROOT, 'frontend', 'dist')
STATIC_DIR = _DIST_DIR if os.path.isdir(_DIST_DIR) else _PROJECT_ROOT


class CustomHandler(JsonResponseMixin, http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

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
        # キャッシュ無効化
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        self.ensure_user_id()
        # API/ストリーム以外は静的ファイル配信
        if not self.path.startswith("/api") and not self.path.startswith("/stream"):
            # SPAフォールバック: 存在しないパスはindex.htmlを返す
            clean_path = self.path.split('?')[0]
            file_path = os.path.join(STATIC_DIR, clean_path.lstrip('/'))
            if not os.path.isfile(file_path) and not clean_path.startswith('/assets'):
                self.path = '/index.html'
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
