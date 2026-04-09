import http.cookies

def get_user_id(handler):
    cookie_header = handler.headers.get('Cookie', '')
    cookie = http.cookies.SimpleCookie(cookie_header)
    morsel = cookie.get('stuid')
    if morsel:
        return morsel.value
    return None

def set_user_cookie(handler, user_id):
    handler.send_header('Set-Cookie', f'stuid={user_id}; Path=/; Max-Age=315360000; SameSite=Lax')
