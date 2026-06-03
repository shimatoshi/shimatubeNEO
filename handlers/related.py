import os
import re
import json
import logging
import urllib.parse
import urllib.request
import http.cookiejar

log = logging.getLogger('shimatube')

_VALID_VID = re.compile(r'^[a-zA-Z0-9_-]{6,20}$')
COOKIES_FILE = os.path.expanduser('~/shimatube/cookies.txt')
_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
_CVER = '2.20240620.05.00'


def _innertube_next(vid):
    """InnerTube next エンドポイントで watch-next(おすすめ/関連) を取得。cookieで個人化。"""
    cj = http.cookiejar.MozillaCookieJar(COOKIES_FILE)
    if os.path.exists(COOKIES_FILE):
        try:
            cj.load(ignore_discard=True, ignore_expires=True)
        except Exception:
            pass
    body = {
        "context": {"client": {"clientName": "WEB", "clientVersion": _CVER, "hl": "ja", "gl": "JP"}},
        "videoId": vid,
    }
    req = urllib.request.Request(
        "https://www.youtube.com/youtubei/v1/next?prettyPrint=false",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "User-Agent": _UA,
                 "Origin": "https://www.youtube.com",
                 "X-Youtube-Client-Name": "1", "X-Youtube-Client-Version": _CVER})
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    return json.load(op.open(req, timeout=15))


def _txt_vm(p):
    try:
        return p['text']['content']
    except (KeyError, TypeError):
        return None


def _txt(node):
    if not node:
        return None
    if 'simpleText' in node:
        return node['simpleText']
    runs = node.get('runs')
    if runs:
        return ''.join(r.get('text', '') for r in runs)
    return None


def _dur_to_sec(s):
    if not s:
        return None
    parts = s.split(':')
    try:
        parts = [int(p) for p in parts]
    except ValueError:
        return None
    sec = 0
    for p in parts:
        sec = sec * 60 + p
    return sec


def _lockup_duration(lvm):
    """サムネ overlay の時間バッジから秒数を取る。Live/無しは None。"""
    try:
        overlays = lvm['contentImage']['thumbnailViewModel']['overlays']
    except (KeyError, TypeError):
        return None
    for o in overlays or []:
        b = o.get('thumbnailOverlayBadgeViewModel')
        if not b:
            continue
        for tb in b.get('thumbnailBadges', []):
            t = (tb.get('thumbnailBadgeViewModel', {}) or {}).get('text', '')
            if t and ':' in t:
                return _dur_to_sec(t)
    return None


def _lockup_is_live(lvm):
    try:
        overlays = lvm['contentImage']['thumbnailViewModel']['overlays']
    except (KeyError, TypeError):
        return False
    for o in overlays or []:
        b = o.get('thumbnailOverlayBadgeViewModel')
        if not b:
            continue
        for tb in b.get('thumbnailBadges', []):
            t = (tb.get('thumbnailBadgeViewModel', {}) or {}).get('text', '') or ''
            if 'ライブ' in t or 'LIVE' in t.upper():
                return True
    return False


def _parse(data):
    """secondaryResults から通常動画のみ抽出。Shorts(reelShelf)・MIX/プレイリストは除外。"""
    out = []
    try:
        results = (data["contents"]["twoColumnWatchNextResults"]
                       ["secondaryResults"]["secondaryResults"]["results"])
    except (KeyError, TypeError):
        return out
    for item in results:
        lvm = item.get('lockupViewModel')
        if not lvm:
            continue  # reelShelfRenderer(Shorts) / continuationItemRenderer 等
        if lvm.get('contentType') != 'LOCKUP_CONTENT_TYPE_VIDEO':
            continue  # MIX/プレイリストは除外
        vid = lvm.get('contentId')
        if not vid:
            continue
        md = lvm.get('metadata', {}).get('lockupMetadataViewModel', {})
        title = (md.get('title', {}) or {}).get('content')
        rows = (md.get('metadata', {}).get('contentMetadataViewModel', {})
                  .get('metadataRows', []))
        author = view_text = date_text = None
        if len(rows) >= 1:
            r0 = rows[0].get('metadataParts', [])
            if r0:
                author = _txt_vm(r0[0])
        if len(rows) >= 2:
            r1 = rows[1].get('metadataParts', [])
            if len(r1) >= 1:
                view_text = _txt_vm(r1[0])
            if len(r1) >= 2:
                date_text = _txt_vm(r1[1])
        out.append({
            "type": "video",
            "videoId": vid,
            "title": title,
            "author": author,
            "channelId": None,
            "lengthSeconds": _lockup_duration(lvm),
            "viewCount": None,
            "viewText": view_text,
            "uploadDate": date_text,
            "thumbnail": f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
            "is_live": _lockup_is_live(lvm),
        })
    return out


def handle_related(handler):
    """/api/related/<vid>?debug=1  -> YouTubeのおすすめ(関連, Shorts除外) リスト"""
    parsed = urllib.parse.urlparse(handler.path)
    vid = parsed.path.split('/')[-1]
    if not _VALID_VID.match(vid):
        handler.send_error(400, "Invalid video ID")
        return
    debug = urllib.parse.parse_qs(parsed.query).get('debug', ['0'])[0] == '1'
    try:
        data = _innertube_next(vid)
    except Exception as e:
        log.error(f"related error {vid}: {e}")
        handler.send_json([])
        return
    if debug:
        out = []
        try:
            sr = (data["contents"]["twoColumnWatchNextResults"]
                      ["secondaryResults"]["secondaryResults"]["results"])
            for x in sr:
                lvm = x.get('lockupViewModel')
                if not lvm:
                    out.append({"k": list(x.keys())[0]}); continue
                ci = lvm.get('contentImage', {})
                md = lvm.get('metadata', {}).get('lockupMetadataViewModel', {})
                rows = (md.get('metadata', {}).get('contentMetadataViewModel', {})
                          .get('metadataRows', []))
                out.append({
                    "ct": lvm.get('contentType'),
                    "id": lvm.get('contentId'),
                    "thumb": list(ci.keys())[0] if ci else None,
                    "title": (md.get('title', {}) or {}).get('content'),
                    "rows": [[_txt_vm(p) for p in r.get('metadataParts', [])] for r in rows],
                })
        except Exception as e:
            out = [f"ERR:{e}"]
        handler.send_json(out)
        return
    handler.send_json(_parse(data))
