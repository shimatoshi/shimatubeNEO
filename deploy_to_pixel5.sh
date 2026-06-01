#!/data/data/com.termux/files/usr/bin/bash
# deploy_to_pixel5.sh — Pixel 3a から Pixel 5 へ ShimaTube バックエンドを移して配信させる
#   1. リポジトリを rsync（DB/ログ/ビルド成果物は除外）
#   2. Pixel 5 側で依存を確認 → server.py 起動 → cloudflared トンネル起動(urls.json更新)
#   3. Pixel 3a 側の server.py / cloudflared を停止
set -uo pipefail

P5_USER="u0_a214"
P5_HOST="100.125.190.125"
P5_PORT="8022"
P5_PASS="meronpan"
SRC="$HOME/shimatubeNEO"
DST="shimatubeNEO"

SSH="sshpass -p $P5_PASS ssh -p $P5_PORT -o StrictHostKeyChecking=no -o ConnectTimeout=15 $P5_USER@$P5_HOST"
RSH="ssh -p $P5_PORT -o StrictHostKeyChecking=no -o ConnectTimeout=15"

log(){ echo "[$(date '+%H:%M:%S')] $*"; }
fail(){ echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; exit 1; }

# --- 0. 到達性確認 ---
log "Pixel 5 reachability check..."
probe=$($SSH 'echo reachable; getprop ro.product.model' 2>&1) || fail "Pixel 5 unreachable"
log "Pixel 5: $(echo "$probe" | tr '\n' ' ')"

# --- 1. コード同期 (DB/ログ/ビルド除外) ---
log "rsync code -> Pixel 5..."
sshpass -p "$P5_PASS" rsync -az -e "$RSH" \
  --exclude='.git' --exclude='.buildozer' --exclude='android' \
  --exclude='bin' --exclude='dist' --exclude='__pycache__' \
  --exclude='*.pyc' --exclude='server.log' --exclude='tunnel*.log' \
  --exclude='*.db' --exclude='.vercel' \
  "$SRC/" "$P5_USER@$P5_HOST:$DST/" || fail "rsync failed"
log "rsync done"

# --- 1b. DB が Pixel 5 に無ければ seed として送る (既存は壊さない) ---
if ! $SSH "test -f $DST/shimatube.db"; then
  log "no db on Pixel 5 -> seeding shimatube.db"
  sshpass -p "$P5_PASS" rsync -az -e "$RSH" "$SRC/shimatube.db" "$P5_USER@$P5_HOST:$DST/shimatube.db"
else
  log "Pixel 5 has existing db -> kept as-is"
fi

# --- 2. 依存確認 / 起動 / トンネル ---
log "ensure deps + start server + tunnel on Pixel 5..."
$SSH "bash -s" <<'REMOTE'
set -uo pipefail
export PATH=/data/data/com.termux/files/usr/bin:$PATH
cd ~/shimatubeNEO || exit 1

# deps
python3 -c 'import yt_dlp, curl_cffi' 2>/dev/null || {
  echo "[p5] installing deps..."; pip install -q -U yt-dlp curl_cffi 2>&1 | tail -2
}
python3 -c 'import yt_dlp, curl_cffi' 2>/dev/null && echo "[p5] DEPS_OK" || { echo "[p5] DEPS_FAIL"; exit 2; }

# (re)start server
pkill -f 'python3 server.py' 2>/dev/null; sleep 1
nohup python3 server.py > server.log 2>&1 &
sleep 3
code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/version)
echo "[p5] local server /api/version -> $code"
[ "$code" = "200" ] || { echo "[p5] SERVER_FAIL"; tail -5 server.log; exit 3; }

# (re)start tunnel (start_tunnel.sh が urls.json を host=pixel5 で更新)
pkill -f 'cloudflared.*8080' 2>/dev/null; sleep 1
if [ -f ~/.github_token ]; then
  nohup bash start_tunnel.sh > tunnel_boot.log 2>&1 &
  for i in $(seq 1 30); do
    url=$(grep -aoE 'https://[a-z0-9-]+\.trycloudflare\.com' tunnel_boot.log 2>/dev/null | head -1)
    [ -n "$url" ] && break; sleep 1
  done
  echo "[p5] TUNNEL_URL=${url:-NONE}"
  grep -a 'urls.json updated' tunnel_boot.log 2>/dev/null && echo "[p5] urls.json updated OK" || echo "[p5] WARN urls.json not confirmed"
else
  echo "[p5] WARN: ~/.github_token missing -> tunnel/urls.json NOT started"
fi
echo "[p5] DONE"
REMOTE
rc=$?
[ $rc -eq 0 ] || fail "remote setup failed (rc=$rc)"

# --- 3. Pixel 3a 側を停止 (配信を Pixel 5 へ完全移譲) ---
log "stopping local (Pixel 3a) server + tunnel..."
pkill -f 'cloudflared.*8080' 2>/dev/null && log "local cloudflared stopped" || log "local cloudflared not running"
pkill -f 'python3 server.py' 2>/dev/null && log "local server stopped" || log "local server not running"

log "=== DEPLOY COMPLETE: ShimaTube now served from Pixel 5 ==="
