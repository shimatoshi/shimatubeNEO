#!/data/data/com.termux/files/usr/bin/bash
# wait_and_deploy_p5.sh — Pixel 5 が起きてくるのを待ち、ssh が通ったら deploy_to_pixel5.sh を実行
set -uo pipefail
export PATH=/data/data/com.termux/files/usr/bin:$PATH

P5_USER="u0_a214"; P5_HOST="100.125.190.125"; P5_PORT="8022"; P5_PASS="meronpan"
LOG="$HOME/shimatubeNEO/p5_deploy.log"
MAX_MIN=720   # 最大12時間待つ

log(){ echo "[$(date '+%m-%d %H:%M:%S')] $*" | tee -a "$LOG"; }

log "waiting for Pixel 5 to wake up (poll 60s, max ${MAX_MIN}m)..."
for i in $(seq 1 "$MAX_MIN"); do
  if sshpass -p "$P5_PASS" ssh -p "$P5_PORT" -o StrictHostKeyChecking=no \
       -o ConnectTimeout=10 -o BatchMode=no "$P5_USER@$P5_HOST" 'true' 2>/dev/null; then
    log "Pixel 5 is UP (after ${i} min) -> deploying"
    bash "$HOME/shimatubeNEO/deploy_to_pixel5.sh" 2>&1 | tee -a "$LOG"
    log "deploy finished (rc=${PIPESTATUS[0]})"
    exit 0
  fi
  sleep 60
done
log "TIMEOUT: Pixel 5 did not come up within ${MAX_MIN} min"
exit 1
