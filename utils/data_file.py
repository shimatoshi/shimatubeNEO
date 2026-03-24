import os
import json
import logging

log = logging.getLogger('shimatube')

DATA_FILE = "user_data.json"

def load_data():
    default_data = {
        "subscriptions": [],
        "history": [],
        "categories": ["Trending", "News"],
        "blocked_channels": [],
        "blocked_keywords": []
    }
    if not os.path.exists(DATA_FILE):
        return default_data
    try:
        with open(DATA_FILE, 'r') as f:
            data = json.load(f)
            for k, v in default_data.items():
                if k not in data:
                    data[k] = v
            return data
    except (json.JSONDecodeError, IOError) as e:
        log.warning(f"Failed to load {DATA_FILE}: {e}")
        return default_data

def save_data(data):
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

def is_blocked(item, data):
    for bc in data.get('blocked_channels', []):
        if item.get('channelId') == bc.get('id'):
            return True
    title = item.get('title', '').lower()
    for kw in data.get('blocked_keywords', []):
        if kw.lower() in title:
            return True
    return False
