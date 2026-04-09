import urllib.parse
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

import yt_dlp

from utils.db import get_user_data
from utils.formatting import format_date

log = logging.getLogger('shimatube')

# チャンネルごとの動画キャッシュ（メモリ内、サーバー再起動でクリア）
# { channelId: [video, ...] }  最大50件保持
_channel_cache = {}


def _fetch_channel_videos(channel_id, limit=50):
    """1チャンネルの動画を取得（キャッシュ付き）"""
    if channel_id in _channel_cache:
        return _channel_cache[channel_id]

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
            })

        _channel_cache[channel_id] = videos
        return videos
    except Exception as e:
        log.error(f"Feed fetch error for {channel_id}: {e}")
        return []


def handle_feed(handler):
    """購読チャンネルの動画フィードをチャンネル別に返す"""
    user_data = get_user_data(handler.user_id)
    subs = user_data.get('subscriptions', [])

    if not subs:
        handler.send_json({"channels": []})
        return

    watched_ids = {v['videoId'] for v in user_data.get('history', [])}

    # 各チャンネルから並列取得（最大5並列）
    channel_videos = {}
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(_fetch_channel_videos, s['channelId']): s for s in subs}
        for future in as_completed(futures):
            sub = futures[future]
            videos = future.result()
            channel_videos[sub['channelId']] = {
                "sub": sub,
                "videos": videos,
            }

    # チャンネルごとに未視聴/視聴済みを分離して返す
    channels = []
    for s in subs:
        cid = s['channelId']
        data = channel_videos.get(cid, {"videos": []})
        all_vids = data["videos"]
        unwatched = [v for v in all_vids if v['videoId'] not in watched_ids]
        watched = [v for v in all_vids if v['videoId'] in watched_ids]

        channels.append({
            "channelId": cid,
            "title": s.get('title', 'Unknown'),
            "thumbnail": s.get('thumbnail', ''),
            "unwatched": unwatched,
            "watched": watched,
            "totalFetched": len(all_vids),
        })

    handler.send_json({"channels": channels})


def handle_feed_refresh(handler):
    """特定チャンネルのキャッシュをクリアして再取得"""
    cid = handler.path.split('/')[-1].split('?')[0]
    if cid in _channel_cache:
        del _channel_cache[cid]

    user_data = get_user_data(handler.user_id)
    watched_ids = {v['videoId'] for v in user_data.get('history', [])}

    videos = _fetch_channel_videos(cid, limit=50)
    unwatched = [v for v in videos if v['videoId'] not in watched_ids]
    watched = [v for v in videos if v['videoId'] in watched_ids]

    # チャンネル名をsubscriptionsから探す
    title = cid
    thumb = ''
    for s in user_data.get('subscriptions', []):
        if s['channelId'] == cid:
            title = s.get('title', cid)
            thumb = s.get('thumbnail', '')
            break

    handler.send_json({
        "channelId": cid,
        "title": title,
        "thumbnail": thumb,
        "unwatched": unwatched,
        "watched": watched,
        "totalFetched": len(videos),
    })
