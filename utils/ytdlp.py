import threading
import time
import logging

import yt_dlp

from utils.formatting import format_date

log = logging.getLogger('shimatube')

url_cache = {}
url_cache_lock = threading.Lock()

def get_video_url(vid, qual="720", audio_only=False):
    """Extract direct YouTube CDN URL via yt-dlp library, with 4h cache."""
    cache_key = f"{vid}:{'audio' if audio_only else qual}"
    with url_cache_lock:
        cached = url_cache.get(cache_key)
        if cached and time.time() < cached["expiry"]:
            return cached["url"], cached.get("headers", {}), cached["meta"]

    try:
        if audio_only:
            fmt = "bestaudio[ext=m4a]/bestaudio"
        else:
            fmt = f"best[ext=mp4][height<={qual}]/best[ext=mp4]/best"
        ydl_opts = {
            'format': fmt,
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            d = ydl.extract_info(f"https://www.youtube.com/watch?v={vid}", download=False)

        is_live = d.get('is_live') or d.get('live_status') == 'is_live'

        meta = {
            "title": d.get('title'),
            "description": d.get('description'),
            "author": d.get('uploader'),
            "channelId": d.get('channel_id'),
            "viewCount": d.get('view_count'),
            "uploadDate": format_date(d.get('upload_date')),
            "thumbnail": d.get('thumbnail'),
            "is_live": is_live,
        }

        if is_live:
            # 生放送: HLS m3u8 URL を取得（キャッシュなし）
            hls_url = None
            for f in sorted(d.get('formats', []), key=lambda x: x.get('height') or 0, reverse=True):
                if f.get('protocol') in ('m3u8', 'm3u8_native') and f.get('url'):
                    hls_url = f['url']
                    break
            if not hls_url:
                hls_url = d.get('manifest_url') or d.get('url')
            meta['hls_url'] = hls_url
            headers = d.get('http_headers', {})
            return hls_url, headers, meta

        source = d
        stream_url = d.get('url')
        if not stream_url and d.get('requested_formats'):
            source = d['requested_formats'][0]
            stream_url = source.get('url')

        headers = source.get('http_headers', {})

        if stream_url:
            with url_cache_lock:
                url_cache[cache_key] = {
                    "url": stream_url,
                    "headers": headers,
                    "meta": meta,
                    "expiry": time.time() + 14400
                }

        return stream_url, headers, meta
    except Exception as e:
        log.error(f"get_video_url error for {vid}: {e}")
        return None, {}, {}
