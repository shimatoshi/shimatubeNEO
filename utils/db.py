import sqlite3
import os
import json
import logging
import threading
from contextlib import contextmanager

log = logging.getLogger('shimatube')

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shimatube.db')

_db_lock = threading.Lock()

@contextmanager
def get_conn():
    with _db_lock:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        try:
            yield conn
        finally:
            conn.close()

def init_db():
    with get_conn() as conn:
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
        log.info("Migrated user_data.json -> SQLite (_legacy_ user)")
    except Exception as e:
        log.warning(f"JSON migration failed: {e}")

def ensure_user(user_id):
    with get_conn() as conn:
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
            # 新規ユーザーのデフォルトカテゴリなし
            # (旧デフォルトの Trending/News は海外結果ばかりで不評→日本の急上昇 /api/trending に置換)
        conn.commit()

ADOPT_FLAG = os.path.join(os.path.dirname(DB_PATH), '.orphan_adopted')

def adopt_orphan_data(user_id, force=False):
    """旧cookie時代(クロスオリジンでcookie不達→毎リクエスト新規uuid)に
    散在した history/subscriptions 等を、最初に来た実ユーザーへ一度だけ統合する。
    e2eテスト用の 'test-' 接頭辞uidには渡さない。
    force=True (設定画面の「データ復旧」ボタン): WebViewストレージ消失等で
    uidが再生成された時に、旧uidのデータを現uidへ引き取り直す。"""
    if user_id.startswith('test-') or user_id == '_legacy_':
        return
    if not force and os.path.exists(ADOPT_FLAG):
        return
    with get_conn() as conn:
        # history: video_idごとに最新watched_atの行を採用して引き取る
        conn.execute(
            "INSERT OR REPLACE INTO history(user_id, video_id, title, thumbnail, length_seconds, view_count, watched_at) "
            "SELECT ?, video_id, title, thumbnail, length_seconds, view_count, MAX(watched_at) "
            "FROM history WHERE user_id != ? GROUP BY video_id",
            (user_id, user_id))
        conn.execute("DELETE FROM history WHERE user_id != ?", (user_id,))
        conn.execute(
            "DELETE FROM history WHERE user_id=? AND video_id NOT IN "
            "(SELECT video_id FROM history WHERE user_id=? ORDER BY watched_at DESC LIMIT 50)",
            (user_id, user_id))
        # subscriptions / block系 / categories も統合
        for sql in [
            "INSERT OR IGNORE INTO subscriptions(user_id, channel_id, title, thumbnail) "
            "SELECT ?, channel_id, title, thumbnail FROM subscriptions WHERE user_id != ?",
            "INSERT OR IGNORE INTO blocked_channels(user_id, channel_id, name) "
            "SELECT ?, channel_id, name FROM blocked_channels WHERE user_id != ?",
            "INSERT OR IGNORE INTO blocked_keywords(user_id, keyword) "
            "SELECT ?, keyword FROM blocked_keywords WHERE user_id != ?",
            "INSERT OR IGNORE INTO categories(user_id, name, sort_order) "
            "SELECT ?, name, sort_order FROM categories WHERE user_id != ?",
        ]:
            conn.execute(sql, (user_id, user_id))
        for t in ['subscriptions', 'blocked_channels', 'blocked_keywords', 'categories']:
            conn.execute(f"DELETE FROM {t} WHERE user_id != ?", (user_id,))
        # 幽霊ユーザー行の掃除
        conn.execute("DELETE FROM users WHERE user_id != ?", (user_id,))
        conn.execute("INSERT OR IGNORE INTO users(user_id) VALUES(?)", (user_id,))
        conn.commit()
    open(ADOPT_FLAG, 'w').close()
    log.info(f"orphan data adopted by {user_id}")

# --- Read ---

def get_user_data(user_id):
    with get_conn() as conn:
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
    return {
        'categories': cats,
        'blocked_channels': bc,
        'blocked_keywords': bk,
        'subscriptions': subs,
        'history': hist
    }

def filter_blocked(items, user_id):
    """Filter out blocked items in a single DB query."""
    with get_conn() as conn:
        blocked_chs = set(r['channel_id'] for r in conn.execute(
            "SELECT channel_id FROM blocked_channels WHERE user_id=?", (user_id,)))
        keywords = [r['keyword'].lower() for r in conn.execute(
            "SELECT keyword FROM blocked_keywords WHERE user_id=?", (user_id,))]
    result = []
    for item in items:
        ch_id = item.get('channelId', '')
        if ch_id and ch_id in blocked_chs:
            continue
        title = item.get('title', '').lower()
        if any(kw in title for kw in keywords):
            continue
        result.append(item)
    return result

# --- Categories ---

def update_categories(user_id, cat_list):
    with get_conn() as conn:
        conn.execute("DELETE FROM categories WHERE user_id=?", (user_id,))
        for i, name in enumerate(cat_list):
            conn.execute("INSERT INTO categories(user_id, name, sort_order) VALUES(?,?,?)",
                        (user_id, name, i))
        conn.commit()

# --- Block ---

def block_channel(user_id, channel_id, name):
    with get_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO blocked_channels(user_id, channel_id, name) VALUES(?,?,?)",
                    (user_id, channel_id, name))
        conn.commit()

def unblock_channel(user_id, channel_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM blocked_channels WHERE user_id=? AND channel_id=?", (user_id, channel_id))
        conn.commit()

def block_keyword(user_id, keyword):
    with get_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO blocked_keywords(user_id, keyword) VALUES(?,?)", (user_id, keyword))
        conn.commit()

def unblock_keyword(user_id, keyword):
    with get_conn() as conn:
        conn.execute("DELETE FROM blocked_keywords WHERE user_id=? AND keyword=?", (user_id, keyword))
        conn.commit()

# --- Subscriptions ---

def add_subscription(user_id, channel_id, title, thumbnail):
    with get_conn() as conn:
        conn.execute("INSERT OR IGNORE INTO subscriptions(user_id, channel_id, title, thumbnail) VALUES(?,?,?,?)",
                    (user_id, channel_id, title, thumbnail))
        conn.commit()

def remove_subscription(user_id, channel_id):
    with get_conn() as conn:
        conn.execute("DELETE FROM subscriptions WHERE user_id=? AND channel_id=?", (user_id, channel_id))
        conn.commit()

def is_subscribed(user_id, channel_id):
    with get_conn() as conn:
        row = conn.execute("SELECT 1 FROM subscriptions WHERE user_id=? AND channel_id=?",
                          (user_id, channel_id)).fetchone()
    return row is not None

# --- History ---

def add_history(user_id, video):
    with get_conn() as conn:
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
