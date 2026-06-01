#!/data/data/com.termux/files/usr/bin/bash
# tunnel_manager.sh — cloudflared自動復帰 + URL自動更新
set -uo pipefail

PROJECT="shimatube"
PORT=8080
URLS_REPO="shimatoshi/project-urls"
GH_TOKEN=$(cat ~/.github_token)
LOG_DIR="$HOME/shimatube"
TUNNEL_LOG="$LOG_DIR/tunnel.log"
PID_FILE="$LOG_DIR/tunnel.pid"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

update_project_urls() {
  local new_url="$1"
  python3 - "$new_url" "$GH_TOKEN" "$URLS_REPO" "$PROJECT" << 'PYEOF'
import sys, json, base64, urllib.request
from datetime import datetime, timezone

url, token, repo, project = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
api = f"https://api.github.com/repos/{repo}/contents/urls.json"
headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}

try:
    data = json.loads(urllib.request.urlopen(urllib.request.Request(api, headers=headers)).read())
    content = json.loads(base64.b64decode(data["content"]))
    content.setdefault("projects", {})[project] = {
        "url": url, "description": "ShimaTube NEO - YouTube proxy",
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "host": "pixel5"
    }
    body = json.dumps({"message": f"update {project} tunnel url",
        "content": base64.b64encode(json.dumps(content, indent=2, ensure_ascii=False).encode()).decode(),
        "sha": data["sha"]}).encode()
    urllib.request.urlopen(urllib.request.Request(api, data=body, headers={**headers, "Content-Type": "application/json"}, method="PUT"))
    print(f"Updated urls.json: {url}")
except Exception as e:
    print(f"ERROR updating urls.json: {e}", file=sys.stderr)
PYEOF
}

extract_tunnel_url() {
  grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | tail -1
}

start_tunnel() {
  [ -f "$PID_FILE" ] && kill "$(cat "$PID_FILE")" 2>/dev/null; sleep 1
  > "$TUNNEL_LOG"
  cloudflared tunnel --url "http://localhost:$PORT" --edge 198.41.192.67:7844 --protocol http2 --no-autoupdate > "$TUNNEL_LOG" 2>&1 &
  echo $! > "$PID_FILE"
  log "Started cloudflared (PID: $(cat "$PID_FILE"))"

  for i in $(seq 1 30); do
    url=$(extract_tunnel_url)
    if [ -n "$url" ]; then
      log "Tunnel URL: $url"
      echo "$url" > "$LOG_DIR/tunnel_url.txt"
      update_project_urls "$url"
      return 0
    fi
    sleep 1
  done
  log "ERROR: Tunnel URL not found after 30s"
  return 1
}

# --- メインループ ---
log "=== Tunnel Manager Started ==="
while true; do
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    local_url=$(extract_tunnel_url)
    if [ -n "$local_url" ] && curl -sf -o /dev/null --max-time 10 "$local_url/api/version" 2>/dev/null; then
      sleep 30
      continue
    else
      log "Tunnel not responding, restarting..."
    fi
  fi
  log "Starting/restarting tunnel..."
  start_tunnel || log "Tunnel start failed, will retry in 30s"
  sleep 30
done
