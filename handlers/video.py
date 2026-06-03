import urllib.parse
import re

from utils.ytdlp import get_play_info

_VALID_VID = re.compile(r'^[a-zA-Z0-9_-]{6,20}$')

def handle_video_details(handler):
    vid = handler.path.split('/')[-1].split('?')[0]
    if not _VALID_VID.match(vid):
        handler.send_error(400, "Invalid video ID")
        return

    e = get_play_info(vid)
    if not e:
        handler.send_json({"status": "error", "url": None, "is_live": False,
                           "hls_url": None, "hls": [], "metadata": {}})
        return

    meta = e["meta"]
    is_live = e["is_live"]
    hls_heights = sorted(e["hls"].keys()) if e.get("hls") else []
    playable = bool(e.get("prog_url") or hls_heights or e.get("live_hls"))

    handler.send_json({
        "status": "ready" if playable else "error",
        # progressive(360p) は /stream 中継&DLフォールバック用。HLS優先で使われる。
        "url": f"/stream/{vid}" if (e.get("prog_url") and not is_live) else None,
        "is_live": is_live,
        "hls_url": e.get("live_hls") if is_live else None,
        # 公式画質: 利用可能な muxed HLS の height 一覧（例 [144,240,360,480,720,1080]）
        "hls": hls_heights,
        "metadata": meta,
    })
