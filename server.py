import socketserver
import logging

from utils.db import init_db
from handlers.handler import CustomHandler

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('shimatube')

PORT = 8080


class ThreadingHTTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


init_db()
log.info(f"ShimaTube NEO server running on port {PORT}")
log.info("Stream mode: proxy (no disk storage)")
with ThreadingHTTPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
