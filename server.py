import os
import socketserver
import logging

from utils.db import init_db
from handlers.handler import CustomHandler

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('shimatube')

# 予備サーバー(shimabook等)では8080が別用途で埋まっているので環境変数で移せるようにする
PORT = int(os.environ.get("SHIMATUBE_PORT", 8080))


class ThreadingHTTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


init_db()
log.info(f"ShimaTube NEO server running on port {PORT}")
log.info("Stream mode: proxy (no disk storage)")
with ThreadingHTTPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
