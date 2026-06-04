import re
import http.cookies
import urllib.parse

# uid: フロント(js/app.js UID())が生成する localStorage 永続ID。
# クロスオリジン(Vercelフロント→トンネル)では cookie が送受信されないため、
# ?uid= クエリを最優先で使う。cookie は同一オリジン(APK/ローカル)用フォールバック。
_VALID_UID = re.compile(r'^[A-Za-z0-9_-]{8,64}$')

def get_query_uid(handler):
    """?uid= クエリのuidを返す（無効/欠落ならNone）"""
    query = urllib.parse.urlparse(handler.path).query
    uid = urllib.parse.parse_qs(query).get('uid', [None])[0]
    if uid and _VALID_UID.match(uid):
        return uid
    return None

def get_user_id(handler):
    # 1) ?uid= クエリ（クロスオリジン対応の主経路）
    uid = get_query_uid(handler)
    if uid:
        return uid
    # 2) cookie（同一オリジン用フォールバック）
    cookie_header = handler.headers.get('Cookie', '')
    cookie = http.cookies.SimpleCookie(cookie_header)
    morsel = cookie.get('stuid')
    if morsel:
        return morsel.value
    return None

def set_user_cookie(handler, user_id):
    handler.send_header('Set-Cookie', f'stuid={user_id}; Path=/; Max-Age=315360000; SameSite=Lax')
