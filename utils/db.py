import sqlite3
import os
import json
import logging

log = logging.getLogger('shimatube')

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shimatube.db')

def get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            name    TEXT DEFAULT '',
            created TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS categories (
            user_id    TEXT NOT NULL,
            name       TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, name)
        );
        CREATE TABLE IF NOT EXISTS blocked_channels (
            user_id    TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            name       TEXT DEFAULT '',
            PRIMARY KEY (user_id, channel_id)
        );
        CREATE TABLE IF NOT EXISTS blocked_keywords (
            user_id TEXT NOT NULL,
            keyword TEXT NOT NULL,
            PRIMARY KEY (user_id, keyword)
        );
        CREATE TABLE IF NOT EXISTS subscriptions (
            user_id    TEXT NOT NULL,
            channel_id TEXT NOT NULL,
            title      TEXT DEFAULT '',
            thumbnail  TEXT DEFAULT '',
            PRIMARY KEY (user_id, channel_id)
        );
        CREATE TABLE IF NOT EXISTS history (
            user_id        TEXT NOT NULL,
            video_id       TEXT NOT NULL,
            title          TEXT DEFAULT '',
            thumbnail      TEXT DEFAULT '',
            length_seconds INTEGER DEFAULT 0,
            view_count     INTEGER DEFAULT 0,
            watched_at     TEXT DEFAULT (datetime('now')),
            PRIMARY KEY (user_id, video_id)
        );
        CREATE INDEX IF NOT EXISTS idx_history_watched ON history(user_id, watched_at DESC);
    """)
    conn.commit()
    _migrate_json(conn)
    conn.close()

def _migrate_json(conn):
    json_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'user_data.json')
    if not os.path.exists(json_path):
        return
    try:
        with open(json_path) as f:
            old = json.load(f)
        conn.execute("INSERT OR IGNORE INTO users(user_id) VALUES('_legacy_')")
        for i, cat in enumerate(old.get('categories', [])):
            conn.execute("INSERT OR IGNORE INTO categories(user_id, name, sort_order) VALUES(?,?,?)",
                        ('_legacy_', cat, i))
        for bc in old.get('blocked_channels', []):
            conn.execute("INSERT OR IGNORE INTO blocked_channels(user_id, channel_id, name) VALUES(?,?,?)",
                        ('_legacy_', bc['id'], bc.get('name', '')))
        for kw in old.get('blocked_keywords', []):
            conn.execute("INSERT OR IGNORE INTO blocked_keywords(user_id, keyword) VALUES(?,?)",
                        ('_legacy_', kw))
        conn.commit()
        os.rename(json_path, json_path + '.bak')
        log.info("Migrated user_data.json → SQLite (_legacy_ user)")
    except Exception as e:
        log.warning(f"JSON migration failed: {e}")

def ensure_user(user_id):
    conn = get_conn()
    inserted = conn.execute("INSERT OR IGNORE INTO users(user_id) VALUES(?)", (user_id,)).rowcount
    if inserted:
        legacy = conn.execute("SELECT 1 FROM users WHERE user_id='_legacy_'").fetchone()
        if legacy:
            conn.execute("INSERT OR IGNORE INTO categories(user_id, name, sort_order) "
                        "SELECT ?, name, sort_order FROM categories WHERE user_id='_legacy_'", (user_id,))
            conn.execute("INSERT OR IGNORE INTO blocked_channels(user_id, channel_id, name) "
                        "SELECT ?, channel_id, name FROM blocked_channels WHERE user_id='_legacy_'", (user_id,))
            conn.execute("INSERT OR IGNORE INTO blocked_keywords(user_id, keyword) "
                        "SELECT ?, keyword FROM blocked_keywords WHERE user_id='_legacy_'", (user_id,))
            for t in ['categories', 'blocked_channels', 'blocked_keywords']:
                conn.execute(f"DELETE FROM {t} WHERE user_id='_legacy_'")
            conn.execute("DELETE FROM users WHERE user_id='_legacy_'")
        else:
            for i, cat in enumerate(["Trending", "News"]):
                conn.execute("INSERT INTO categories(user_id, name, sort_order) VALUES(?,?,?)",
                            (user_id, cat, i))
    conn.commit()
    conn.close()

# --- Read ---

def get_user_data(user_id):
    conn = get_conn()
    cats = [r['name'] for r in conn.execute(
        "SELECT name FROM categories WHERE user_id=? ORDER BY sort_order", (user_id,))]
    bc = [{'id': r['channel_id'], 'name': r['name']} for r in conn.execute(
        "SELECT channel_id, name FROM blocked_channels WHERE user_id=?", (user_id,))]
    bk = [r['keyword'] for r in conn.execute(
        "SELECT keyword FROM blocked_keywords WHERE user_id=?", (user_id,))]
    subs = [{'channelId': r['channel_id'], 'title': r['title'], 'thumbnail': r['thumbnail']}
            for r in conn.execute(
        "SELECT channel_id, title, thumbnail FROM subscriptions WHERE user_id=?", (user_id,))]
    hist = [{'videoId': r['video_id'], 'title': r['title'], 'thumbnail': r['thumbnail'],
             'lengthSeconds': r['length_seconds'], 'viewCount': r['view_count'], 'type': 'video'}
            for r in conn.execute(
        "SELECT video_id, title, thumbnail, length_seconds, view_count FROM history "
        "WHERE user_id=? ORDER BY watched_at DESC LIMIT 50", (user_id,))]
    conn.close()
    return {
        'categories': cats,
        'blocked_channels': bc,
        'blocked_keywords': bk,
        'subscriptions': subs,
        'history': hist
    }

def is_blocked(item, user_id):
    conn = get_conn()
    ch_id = item.get('channelId', '')
    if ch_id:
        row = conn.execute("SELECT 1 FROM blocked_channels WHERE user_id=? AND channel_id=?",
                          (user_id, ch_id)).fetchone()
        if row:
            conn.close()
            return True
    title = item.get('title', '').lower()
    keywords = [r['keyword'] for r in conn.execute(
        "SELECT keyword FROM blocked_keywords WHERE user_id=?", (user_id,))]
    conn.close()
    for kw in keywords:
        if kw.lower() in title:
            return True
    return False

# --- Categories ---

def update_categories(user_id, cat_list):
    conn = get_conn()
    conn.execute("DELETE FROM categories WHERE user_id=?", (user_id,))
    for i, name in enumerate(cat_list):
        conn.execute("INSERT INTO categories(user_id, name, sort_order) VALUES(?,?,?)",
                    (user_id, name, i))
    conn.commit()
    conn.close()

# --- Block ---

def block_channel(user_id, channel_id, name):
    conn = get_conn()
    conn.execute("INSERT OR IGNORE INTO blocked_channels(user_id, channel_id, name) VALUES(?,?,?)",
                (user_id, channel_id, name))
    conn.commit()
    conn.close()

def unblock_channel(user_id, channel_id):
    conn = get_conn()
    conn.execute("DELETE FROM blocked_channels WHERE user_id=? AND channel_id=?", (user_id, channel_id))
    conn.commit()
    conn.close()

def block_keyword(user_id, keyword):
    conn = get_conn()
    conn.execute("INSERT OR IGNORE INTO blocked_keywords(user_id, keyword) VALUES(?,?)", (user_id, keyword))
    conn.commit()
    conn.close()

def unblock_keyword(user_id, keyword):
    conn = get_conn()
    conn.execute("DELETE FROM blocked_keywords WHERE user_id=? AND keyword=?", (user_id, keyword))
    conn.commit()
    conn.close()

# --- Subscriptions ---

def add_subscription(user_id, channel_id, title, thumbnail):
    conn = get_conn()
    conn.execute("INSERT OR IGNORE INTO subscriptions(user_id, channel_id, title, thumbnail) VALUES(?,?,?,?)",
                (user_id, channel_id, title, thumbnail))
    conn.commit()
    conn.close()

def remove_subscription(user_id, channel_id):
    conn = get_conn()
    conn.execute("DELETE FROM subscriptions WHERE user_id=? AND channel_id=?", (user_id, channel_id))
    conn.commit()
    conn.close()

def is_subscribed(user_id, channel_id):
    conn = get_conn()
    row = conn.execute("SELECT 1 FROM subscriptions WHERE user_id=? AND channel_id=?",
                      (user_id, channel_id)).fetchone()
    conn.close()
    return row is not None

# --- History ---

def add_history(user_id, video):
    conn = get_conn()
    conn.execute(
        "INSERT OR REPLACE INTO history(user_id, video_id, title, thumbnail, length_seconds, view_count, watched_at) "
        "VALUES(?,?,?,?,?,?, datetime('now'))",
        (user_id, video['videoId'], video.get('title', ''), video.get('thumbnail', ''),
         video.get('lengthSeconds', 0), video.get('viewCount', 0)))
    conn.execute(
        "DELETE FROM history WHERE user_id=? AND video_id NOT IN "
        "(SELECT video_id FROM history WHERE user_id=? ORDER BY watched_at DESC LIMIT 50)",
        (user_id, user_id))
    conn.commit()
    conn.close()
