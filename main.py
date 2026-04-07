"""ShimaTube NEO - Android APK entry point.

Starts the HTTP backend server in a background thread,
then shows a fullscreen WebView pointing to localhost.
"""

import os
import sys
import threading
import logging

# Set working directory to where main.py lives (for static file serving)
os.chdir(os.path.dirname(os.path.abspath(__file__)))

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from kivy.app import App
from kivy.clock import Clock
from kivy.utils import platform

PORT = 8080


def start_server():
    """Start the ShimaTube HTTP server in background."""
    import http.server
    import socketserver
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
    from handlers.user_data import (handle_user_data_get, handle_user_data_post,
                                     handle_subscribe, handle_history)

    logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
    log = logging.getLogger('shimatube')

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
    with ThreadingHTTPServer(("127.0.0.1", PORT), CustomHandler) as httpd:
        httpd.serve_forever()


class ShimaTubeApp(App):
    def build(self):
        # Start server in background thread
        server_thread = threading.Thread(target=start_server, daemon=True)
        server_thread.start()

        if platform == 'android':
            # Request INTERNET permission
            from android.permissions import request_permissions, Permission
            request_permissions([Permission.INTERNET])

            # Use Android WebView via pyjnius
            Clock.schedule_once(self._start_webview_android, 1.5)
        else:
            # Desktop fallback: open in browser
            Clock.schedule_once(self._open_browser, 1.0)

        from kivy.uix.label import Label
        return Label(text='ShimaTube NEO\nLoading...', halign='center',
                     font_size='24sp', color=(1, 1, 1, 1))

    def _start_webview_android(self, dt):
        """Launch Android WebView activity."""
        from jnius import autoclass, cast
        from android.runnable import run_on_ui_thread

        PythonActivity = autoclass('org.kivy.android.PythonActivity')
        WebView = autoclass('android.webkit.WebView')
        WebViewClient = autoclass('android.webkit.WebViewClient')
        WebSettings = autoclass('android.webkit.WebSettings')
        LinearLayout = autoclass('android.widget.LinearLayout')
        LayoutParams = autoclass('android.widget.LinearLayout$LayoutParams')
        activity = PythonActivity.mActivity

        @run_on_ui_thread
        def create_webview():
            webview = WebView(activity)
            settings = webview.getSettings()
            settings.setJavaScriptEnabled(True)
            settings.setDomStorageEnabled(True)
            settings.setMediaPlaybackRequiresUserGesture(False)
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW)
            webview.setWebViewClient(WebViewClient())

            layout = LinearLayout(activity)
            layout.setOrientation(LinearLayout.VERTICAL)
            layout.addView(webview, LayoutParams(
                LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))

            activity.setContentView(layout)
            webview.loadUrl(f'http://127.0.0.1:{PORT}')

        create_webview()

    def _open_browser(self, dt):
        """Desktop fallback."""
        import webbrowser
        webbrowser.open(f'http://127.0.0.1:{PORT}')


if __name__ == '__main__':
    ShimaTubeApp().run()
