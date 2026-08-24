#!/usr/bin/env bash
# deploy/ を「Vercel(shimatube.vercel.app)へ配信するバニラJSフロント」の最新状態に揃える。
#
# リポジトリ直下の index.html / js / css / manifest.json / icon.png / sw.js が
# バニラJSフロントの正本（Redmi等のバックエンドが handlers/handler.py 経由で
# そのまま配信しているもの）。deploy/ はそれをVercelに置くための静的バンドルで、
# 手動コピー運用だったため過去に取りこぼしが出た（例: NEOビジュアル刷新が
# css/style.css だけに入り deploy/css/style.css に入らなかった）。
# 配信前に必ずこれを実行して差分を無くす。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DST="$ROOT/deploy"

[ -d "$DST" ] || { echo "deploy/ が見つかりません: $DST" >&2; exit 1; }

# vercel.json / .gitignore は deploy/ 固有なのでコピー対象に含めない
for f in index.html manifest.json icon.png sw.js; do
    cp -p "$ROOT/$f" "$DST/$f"
done
for d in js css; do
    rm -rf "${DST:?}/$d"
    cp -Rp "$ROOT/$d" "$DST/$d"
done

echo "synced: $ROOT -> $DST"
git -C "$ROOT" status --short -- deploy || true
