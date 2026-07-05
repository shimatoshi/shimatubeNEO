import json
import logging

from utils.db import (get_user_data, update_categories, block_channel,
                       unblock_channel, block_keyword, unblock_keyword,
                       add_subscription, remove_subscription,
                       is_subscribed, add_history, adopt_orphan_data)

log = logging.getLogger('shimatube')

def handle_adopt(handler):
    """データ復旧: WebViewストレージ消失等でuidが変わった時、
    旧uidに残った購読/履歴を現uidへ引き取る (設定画面のボタンから)"""
    try:
        adopt_orphan_data(handler.user_id, force=True)
        handler.send_json({"status": True, "data": get_user_data(handler.user_id)})
    except Exception as e:
        log.error(f"Adopt error: {e}")
        handler.send_error(500, str(e))

def handle_user_data_get(handler):
    handler.send_json(get_user_data(handler.user_id))

def handle_user_data_post(handler):
    try:
        length = int(handler.headers['Content-Length'])
        req = json.loads(handler.rfile.read(length).decode('utf-8'))
        action = req.get('action')
        payload = req.get('payload')
        uid = handler.user_id

        if action == 'update_categories':
            update_categories(uid, payload)
        elif action == 'block_channel':
            block_channel(uid, payload['id'], payload.get('name', ''))
        elif action == 'unblock_channel':
            unblock_channel(uid, payload['id'])
        elif action == 'block_keyword':
            block_keyword(uid, payload)
        elif action == 'unblock_keyword':
            unblock_keyword(uid, payload)

        handler.send_json({"status": True, "data": get_user_data(uid)})
    except Exception as e:
        log.error(f"POST error: {e}")
        handler.send_error(400, str(e))

def handle_subscribe(handler):
    try:
        length = int(handler.headers['Content-Length'])
        req = json.loads(handler.rfile.read(length).decode('utf-8'))
        uid = handler.user_id
        channel_id = req['channelId']

        if is_subscribed(uid, channel_id):
            remove_subscription(uid, channel_id)
            handler.send_json({"subscribed": False})
        else:
            add_subscription(uid, channel_id, req.get('title', ''), req.get('thumbnail', ''))
            handler.send_json({"subscribed": True})
    except Exception as e:
        log.error(f"Subscribe error: {e}")
        handler.send_error(400, str(e))

def handle_history(handler):
    try:
        length = int(handler.headers['Content-Length'])
        req = json.loads(handler.rfile.read(length).decode('utf-8'))
        add_history(handler.user_id, req)
        handler.send_json({"status": True})
    except Exception as e:
        log.error(f"History error: {e}")
        handler.send_error(400, str(e))
