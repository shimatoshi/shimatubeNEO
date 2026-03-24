import json
import logging

from utils.data_file import load_data, save_data

log = logging.getLogger('shimatube')

def handle_user_data_get(handler):
    handler.send_json(load_data())

def handle_user_data_post(handler):
    try:
        length = int(handler.headers['Content-Length'])
        req = json.loads(handler.rfile.read(length).decode('utf-8'))
        action = req.get('action')
        payload = req.get('payload')

        data = load_data()
        if action == 'update_categories':
            data['categories'] = payload
        elif action == 'block_channel':
            if not any(x['id'] == payload['id'] for x in data['blocked_channels']):
                data['blocked_channels'].append(payload)
        elif action == 'unblock_channel':
            data['blocked_channels'] = [x for x in data['blocked_channels'] if x['id'] != payload['id']]
        elif action == 'block_keyword':
            if payload not in data['blocked_keywords']:
                data['blocked_keywords'].append(payload)
        elif action == 'unblock_keyword':
            data['blocked_keywords'] = [x for x in data['blocked_keywords'] if x != payload]

        save_data(data)
        handler.send_json({"status": True, "data": data})
    except (json.JSONDecodeError, KeyError, TypeError) as e:
        log.error(f"POST error: {e}")
        handler.send_error(400, str(e))
    except Exception as e:
        log.error(f"POST internal error: {e}")
        handler.send_error(500, str(e))
