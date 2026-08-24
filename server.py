import utils.dnsfix  # Android/Bionic DNS fallback (must be imported first)
import os
import socketserver
import logging

from utils.db import init_db
from utils.ytdlp import check_ytdlp_version
from handlers.handler import CustomHandler

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(message)s', datefmt='%H:%M:%S')
log = logging.getLogger('shimatube')

# 予備サーバー(shimabook等)では8080が別用途で埋まっているので環境変数で移せるようにする
PORT = int(os.environ.get("SHIMATUBE_PORT", 8080))


class ThreadingHTTPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


init_db()
# 古いyt-dlpだと全動画が再生不能になる。起動ログの先頭で分かるようにしておく
# （落とさないのは、検索・履歴など抽出以外の機能は動くため）。
check_ytdlp_version()
log.info(f"ShimaTube NEO server running on port {PORT}")
log.info("Stream mode: proxy (no disk storage)")
with ThreadingHTTPServer(("", PORT), CustomHandler) as httpd:
    httpd.serve_forever()
