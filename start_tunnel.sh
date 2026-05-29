#!/data/data/com.termux/files/usr/bin/bash
# Start cloudflared tunnel for shimatube and register URL to url-board
export PATH=/data/data/com.termux/files/usr/bin:$PATH
export HOME=/data/data/com.termux/files/home
export GODEBUG=netdns=go

GITHUB_TOKEN=$(cat ~/.github_token)
REPO="shimatoshi/project-urls"
PORT=8080
LOG=$HOME/cloudflared_shimatube.log

# Kill old tunnel if any
pkill -f 'cloudflared.*tunnel.*8080' 2>/dev/null

echo "[tunnel] Starting cloudflared on port $PORT..."
cloudflared tunnel --url http://localhost:$PORT > "$LOG" 2>&1 &
CF_PID=$!

# Wait for URL to appear in log
TUNNEL_URL=""
for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1)
    if [ -n "$TUNNEL_URL" ]; then break; fi
    sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
    echo "[tunnel] ERROR: Could not get tunnel URL after 30s"
    cat "$LOG"
    exit 1
fi
echo "[tunnel] URL: $TUNNEL_URL"

# Update urls.json on GitHub
python3 - "$TUNNEL_URL" "$GITHUB_TOKEN" "$REPO" << 'PYEOF'
import sys, json, base64, urllib.request
from datetime import datetime, timezone

tunnel_url, token, repo = sys.argv[1], sys.argv[2], sys.argv[3]
api = f"https://api.github.com/repos/{repo}/contents/urls.json"
headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}

req = urllib.request.Request(api, headers=headers)
data = json.loads(urllib.request.urlopen(req).read())
sha = data["sha"]
content = json.loads(base64.b64decode(data["content"]))

content.setdefault("projects", {})["shimatube"] = {
    "url": tunnel_url,
    "description": "ShimaTube NEO - YouTube proxy",
    "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "host": "pixel5"
}

body = json.dumps({
    "message": "update shimatube tunnel url",
    "content": base64.b64encode(json.dumps(content, indent=2, ensure_ascii=False).encode()).decode(),
    "sha": sha
}).encode()
req = urllib.request.Request(api, data=body, headers={**headers, "Content-Type": "application/json"}, method="PUT")
urllib.request.urlopen(req)
print(f"[tunnel] urls.json updated: {tunnel_url}")
PYEOF

echo "[tunnel] Done. cloudflared PID: $CF_PID"
echo "[tunnel] To stop: kill $CF_PID"
# Keep script alive so nohup works
wait $CF_PID
