import subprocess
import json
import logging

log = logging.getLogger('shimatube')

def handle_comments(handler):
    vid = handler.path.split('/')[-1]
    try:
        cmd = [
            "yt-dlp", "--write-comments", "--extractor-args",
            "youtube:max_comments=20;player_client=android",
            "--dump-json", "--skip-download",
            f"https://www.youtube.com/watch?v={vid}"
        ]
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=30)
        cmts = []
        for line in r.stdout.strip().split('\n'):
            if not line:
                continue
            try:
                d = json.loads(line)
                for c in d.get('comments', []):
                    cmts.append({"author": c.get('author'), "text": c.get('text')})
            except json.JSONDecodeError:
                continue
        handler.send_json(cmts)
    except subprocess.TimeoutExpired:
        log.warning(f"Timeout fetching comments for {vid}")
        handler.send_json([])
    except Exception as e:
        log.error(f"Comments error: {e}")
        handler.send_error(500, str(e))
