"""ShimaTube NEO - Android APK entry point.

Starts the HTTP backend server in a background thread,
then shows a fullscreen WebView pointing to localhost.
"""

import os
import sys
import threading
import socketserver
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
    from utils.db import init_db
    from handlers.handler import CustomHandler

    logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
    log = logging.getLogger('shimatube')

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
            # キャッシュ無効化
            settings.setCacheMode(WebSettings.LOAD_NO_CACHE)
            settings.setAppCacheEnabled(False)
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
