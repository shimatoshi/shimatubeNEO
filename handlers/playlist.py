import subprocess
import json
import logging

from utils.formatting import format_date

log = logging.getLogger('shimatube')

def handle_playlist(handler):
    pid = handler.path.split('/')[-1].split('?')[0]
    try:
        log.info(f"Playlist: {pid}")
        cmd = [
            "yt-dlp", f"https://www.youtube.com/playlist?list={pid}",
            "--playlist-end", "200",
            "--dump-json", "--flat-playlist", "--skip-download"
        ]
        res = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=60)

        videos = []
        ptitle = "Playlist"
        for line in res.stdout.strip().split('\n'):
            if not line:
                continue
            try:
                v = json.loads(line)
            except json.JSONDecodeError:
                continue
            if ptitle == "Playlist":
                ptitle = v.get('playlist_title') or v.get('playlist') or "Playlist"
            if not v.get('id'):
                continue
            videos.append({
                "type": "video",
                "videoId": v.get('id'),
                "title": v.get('title'),
                "author": v.get('channel') or v.get('uploader') or '',
                "channelId": v.get('channel_id'),
                "lengthSeconds": v.get('duration'),
                "viewCount": v.get('view_count'),
                "uploadDate": format_date(v.get('upload_date')),
                "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg"
            })

        handler.send_json({"title": ptitle, "videos": videos})
    except subprocess.TimeoutExpired:
        log.warning(f"Playlist timeout: {pid}")
        handler.send_json({"title": "Playlist", "videos": []})
    except Exception as e:
        log.error(f"Playlist error: {e}")
        handler.send_error(500, str(e))
