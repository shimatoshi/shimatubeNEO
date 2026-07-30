#!/usr/bin/env python3
"""shimatube.db の日次バックアップ（世代保持）。

P5が落ちた時にDBがP5にしか無くて購読が全部消えた反省から置いた。
sqlite3のオンラインバックアップAPIを使うので、サーバー稼働中でも整合性のあるコピーが取れる
（cpだとWAL中の書き込みと競合して壊れたコピーになりうる）。shimabookにsqlite3 CLIは無い。
"""
import os
import sqlite3
import shutil
import time

SRC = os.path.expanduser("~/srv/shimatube/shimatube.db")
DEST_DIR = os.path.expanduser("~/srv/backup/shimatube")
KEEP = 14  # 世代

def main():
    if not os.path.exists(SRC):
        return
    os.makedirs(DEST_DIR, exist_ok=True)
    stamp = time.strftime("%Y%m%d")
    dest = os.path.join(DEST_DIR, f"shimatube-{stamp}.db")
    tmp = dest + ".tmp"
    src = sqlite3.connect(f"file:{SRC}?mode=ro", uri=True)
    try:
        dst = sqlite3.connect(tmp)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    shutil.move(tmp, dest)

    # latest.db は「最新をすぐ拾える」用の固定名コピー
    shutil.copy2(dest, os.path.join(DEST_DIR, "latest.db"))

    gens = sorted(f for f in os.listdir(DEST_DIR)
                  if f.startswith("shimatube-") and f.endswith(".db"))
    for old in gens[:-KEEP]:
        os.remove(os.path.join(DEST_DIR, old))

if __name__ == "__main__":
    main()
