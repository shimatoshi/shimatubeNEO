import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import yt_dlp

from utils.db import get_user_data
from utils.formatting import format_date

log = logging.getLogger('shimatube')


def _fetch_channel_videos(channel_id, limit=10):
    """1チャンネルの最新動画を取得"""
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'playlistend': limit,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(
                f"https://www.youtube.com/channel/{channel_id}/videos", download=False)

        videos = []
        entries = result.get('entries', []) if result else []
        for v in entries:
            if v is None or not v.get('id'):
                continue
            videos.append({
                "type": "video",
                "videoId": v.get('id'),
                "title": v.get('title'),
                "author": v.get('uploader') or v.get('channel') or '',
                "channelId": channel_id,
                "lengthSeconds": v.get('duration'),
                "viewCount": v.get('view_count'),
                "uploadDate": format_date(v.get('upload_date')),
                "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
                "_sort_date": v.get('upload_date') or '',
            })
        return videos
    except Exception as e:
        log.error(f"Feed fetch error for {channel_id}: {e}")
        return []


def handle_feed(handler):
    """購読チャンネルの未視聴動画フィードを返す"""
    user_data = get_user_data(handler.user_id)
    subs = user_data.get('subscriptions', [])

    if not subs:
        handler.send_json([])
        return

    watched_ids = {v['videoId'] for v in user_data.get('history', [])}

    # 各チャンネルから並列取得（最大5並列）
    all_videos = []
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_fetch_channel_videos, s['channelId']): s for s in subs}
        for future in as_completed(futures):
            all_videos.extend(future.result())

    # 視聴済みを除外、日付降順ソート
    unwatched = [v for v in all_videos if v['videoId'] not in watched_ids]
    unwatched.sort(key=lambda v: v.get('_sort_date', ''), reverse=True)

    # ソート用キーを除去
    for v in unwatched:
        v.pop('_sort_date', None)

    handler.send_json(unwatched)
