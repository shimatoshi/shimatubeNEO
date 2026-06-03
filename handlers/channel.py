import urllib.parse
import re
import logging

import yt_dlp

from utils.db import filter_blocked
from utils.formatting import format_date

log = logging.getLogger('shimatube')

_VALID_CID = re.compile(r'^[a-zA-Z0-9_@-]{2,60}$')

# フロントの tab 値 -> YouTube チャンネルタブ
_TAB_MAP = {
    'videos': 'videos',
    'live': 'streams',
    'playlists': 'playlists',
}


def handle_channel(handler):
    parsed = urllib.parse.urlparse(handler.path)
    params = urllib.parse.parse_qs(parsed.query)
    page = int(params.get('page', ['1'])[0])
    # tab優先。旧 filter=live は後方互換で tab=live 扱い
    tab = params.get('tab', [''])[0]
    if not tab:
        tab = 'live' if params.get('filter', [''])[0] == 'live' else 'videos'
    if tab not in _TAB_MAP:
        tab = 'videos'
    yt_tab = _TAB_MAP[tab]

    cid = handler.path.split('/')[-1].split('?')[0]
    if not _VALID_CID.match(cid):
        handler.send_error(400, "Invalid channel ID")
        return
    try:
        per_page = 20
        start = (page - 1) * per_page + 1
        end = page * per_page

        log.info(f"Channel: {cid}, tab={yt_tab}, page={page}")

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'playliststart': start,
            'playlistend': end,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(
                f"https://www.youtube.com/channel/{cid}/{yt_tab}", download=False)

        entries = result.get('entries', []) if result else []
        ctitle = "Unknown"
        items = []

        if tab == 'playlists':
            for v in entries:
                if v is None or not v.get('id'):
                    continue
                thumbs = v.get('thumbnails') or []
                items.append({
                    "type": "playlist",
                    "playlistId": v.get('id'),
                    "title": v.get('title'),
                    "thumbnail": thumbs[-1]['url'] if thumbs else '',
                })
        else:
            for v in entries:
                if v is None or not v.get('id'):
                    continue
                if ctitle == "Unknown":
                    ctitle = v.get('uploader') or v.get('channel') or "Unknown"
                entry_is_live = v.get('is_live') or v.get('live_status') == 'is_live'
                items.append({
                    "type": "video",
                    "videoId": v.get('id'),
                    "title": v.get('title'),
                    "lengthSeconds": v.get('duration'),
                    "viewCount": v.get('view_count'),
                    "uploadDate": format_date(v.get('upload_date')),
                    "channelId": cid,
                    "thumbnail": f"https://i.ytimg.com/vi/{v.get('id')}/mqdefault.jpg",
                    "author": ctitle,
                    "is_live": entry_is_live,
                })
            items = filter_blocked(items, handler.user_id)

        if ctitle == "Unknown" and result:
            ctitle = (result.get('uploader') or result.get('channel')
                      or (result.get('title') or '').split(' - ')[0] or "Unknown")

        handler.send_json({"channel": {"title": ctitle}, "videos": items})
    except Exception as e:
        # ライブ(streams)タブが無いチャンネル等は yt-dlp が例外を投げる。
        # エラー画面にせず「該当なし(空)」として200で返し、UIはタブを保ったまま空表示にする。
        log.info(f"Channel tab empty/err ({cid}, {yt_tab}): {e}")
        handler.send_json({"channel": {"title": "Unknown"}, "videos": []})
