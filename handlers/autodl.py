"""自動DL（オフライン視聴用）の台帳API。

実際のダウンロードはクライアント側（sniffer-browserのDownloadManagerブリッジ）が行い、
このサーバーは「どの動画をDL済みか」「見積り容量」「キープ指定」だけを持つ。
フロントは js/autodl.js。見積りMBの式は utils.db.estimate_mb と共有する。

呼び出しの流れ:
  起動 → /api/autodl/list で失敗分を検知して再試行(retry_id)
       → /api/autodl/pending で未DL新着と残容量を取得
       → 足りなければ /api/autodl/evict_candidates → 実削除 → /api/autodl/evicted
       → 各動画をDL → /api/autodl/complete で台帳に記録
"""
import json
import logging
import urllib.parse

from utils.db import (get_autodl_settings, set_autodl_settings, list_autodl, autodl_ids,
                      add_autodl_item, set_autodl_pin, set_autodl_download_id,
                      remove_autodl_item, autodl_evict_candidates, estimate_mb,
                      get_user_data)
from handlers.feed import _fetch_channel_videos

log = logging.getLogger('shimatube')

# 1回の巡回で拾う上限（チャンネル毎 / 全体）。多すぎるとDLが終わらないまま端末が寝る
PER_CHANNEL_LIMIT = 3
TOTAL_LIMIT = 10


def _body(handler):
    length = int(handler.headers.get('Content-Length') or 0)
    if not length:
        return {}
    return json.loads(handler.rfile.read(length).decode('utf-8'))


def handle_autodl_settings(handler):
    """GET: 現在の設定 / POST: {enabled, quota_mb} を保存"""
    try:
        if handler.command == 'POST':
            req = _body(handler)
            autodl = set_autodl_settings(handler.user_id, req.get('enabled'), req.get('quota_mb'))
            log.info(f"AutoDL settings: enabled={autodl['enabled']} quota={autodl['quota_mb']}MB")
        else:
            autodl = get_autodl_settings(handler.user_id)
        handler.send_json({"status": True, "autodl": autodl})
    except Exception as e:
        log.error(f"AutoDL settings error: {e}")
        handler.send_error(400, str(e))


def handle_autodl_list(handler):
    try:
        handler.send_json({"items": list_autodl(handler.user_id)})
    except Exception as e:
        log.error(f"AutoDL list error: {e}")
        handler.send_error(500, str(e))


def handle_autodl_pending(handler):
    """購読チャンネルの「未DL・未視聴」の新着と残容量を返す。

    枠(quota_mb)を超える分は返さない。残容量が足りない場合でも候補は返し、
    空け方(evict)はフロントに任せる（実ファイルを消せるのは端末側だけ）。
    """
    try:
        uid = handler.user_id
        settings = get_autodl_settings(uid)
        remaining_mb = max(0, settings['quota_mb'] - settings['used_mb'])

        if not settings['enabled']:
            handler.send_json({"videos": [], "remaining_mb": remaining_mb, "enabled": False})
            return

        user_data = get_user_data(uid)
        subs = user_data.get('subscriptions', [])
        watched = {v['videoId'] for v in user_data.get('history', [])}
        have = autodl_ids(uid)

        candidates = []
        for s in subs:
            videos = _fetch_channel_videos(s['channelId'], limit=10)
            picked = 0
            for v in videos:
                vid = v.get('videoId')
                if not vid or vid in have or vid in watched:
                    continue
                # 配信中/予約(duration無し)は実体が無いので対象外
                if not v.get('lengthSeconds'):
                    continue
                candidates.append(v)
                picked += 1
                if picked >= PER_CHANNEL_LIMIT:
                    break

        # extract_flatではupload_dateが取れずuploadDateが空になることが多い。
        # その場合このsortは安定ソートなので「チャンネル取得順(YouTube側の新着順)」が保たれる。
        # 枠(quota_mb)に収まる分だけ返す
        candidates.sort(key=lambda v: v.get('uploadDate') or '', reverse=True)
        videos, total_mb = [], 0
        for v in candidates:
            mb = estimate_mb(v.get('lengthSeconds'))
            if total_mb + mb > settings['quota_mb']:
                continue
            videos.append(v)
            total_mb += mb
            if len(videos) >= TOTAL_LIMIT:
                break

        log.info(f"AutoDL pending: {len(videos)}件 / 見積り{total_mb}MB / 残{remaining_mb}MB")
        handler.send_json({"videos": videos, "remaining_mb": remaining_mb,
                           "needed_mb": total_mb, "enabled": True})
    except Exception as e:
        log.error(f"AutoDL pending error: {e}")
        handler.send_error(500, str(e))


def handle_autodl_complete(handler):
    """DL開始できた動画を台帳に記録する（downloadIdはnullでも受ける）"""
    try:
        req = _body(handler)
        video_id = req['videoId']
        add_autodl_item(handler.user_id, video_id, req.get('title', ''),
                        req.get('lengthSeconds'), req.get('downloadId'))
        handler.send_json({"status": True, "autodl": get_autodl_settings(handler.user_id)})
    except Exception as e:
        log.error(f"AutoDL complete error: {e}")
        handler.send_error(400, str(e))


def handle_autodl_pin(handler):
    """キープ(消さない)指定の切り替え"""
    try:
        req = _body(handler)
        set_autodl_pin(handler.user_id, req['videoId'], req.get('pinned'))
        handler.send_json({"status": True})
    except Exception as e:
        log.error(f"AutoDL pin error: {e}")
        handler.send_error(400, str(e))


def handle_autodl_retry_id(handler):
    """最初からやり直した時の新しいdownloadIdを差し替える"""
    try:
        req = _body(handler)
        set_autodl_download_id(handler.user_id, req['videoId'], req.get('downloadId'))
        handler.send_json({"status": True})
    except Exception as e:
        log.error(f"AutoDL retry_id error: {e}")
        handler.send_error(400, str(e))


def handle_autodl_evict_candidates(handler):
    """need_mb分の空きを作るために消せる候補（古い順・非キープ）"""
    try:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(handler.path).query)
        need_mb = params.get('need_mb', ['0'])[0]
        try:
            need_mb = int(float(need_mb))
        except ValueError:
            need_mb = 0
        candidates, total_mb = autodl_evict_candidates(handler.user_id, need_mb)
        handler.send_json({"candidates": candidates, "freeable_mb": total_mb})
    except Exception as e:
        log.error(f"AutoDL evict_candidates error: {e}")
        handler.send_error(500, str(e))


def handle_autodl_evicted(handler):
    """端末側で実ファイルを消せたものを台帳から外す"""
    try:
        req = _body(handler)
        remove_autodl_item(handler.user_id, req['videoId'])
        handler.send_json({"status": True, "autodl": get_autodl_settings(handler.user_id)})
    except Exception as e:
        log.error(f"AutoDL evicted error: {e}")
        handler.send_error(400, str(e))
