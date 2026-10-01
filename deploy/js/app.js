// Backend URL: resolved from url-board at startup, fallback to same-origin
let BACKEND = '';

// 通信・JSONの受信を含めて期限を設け、待ちっぱなしを防ぐ。
async function fetchJSON(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) {
            const error = new Error(`HTTP ${res.status}`);
            error.status = res.status;
            throw error;
        }
        return await res.json();
    } finally { clearTimeout(timer); }
}

async function resolveBackend() {
    // 前回値をキャッシュから即セット（ネットワーク待ち前に使える）
    const cached = localStorage.getItem('shimatube_backend');
    if (cached) BACKEND = cached;

    const URL_BOARD = 'https://url-board.vercel.app/api/resolve/shimatube';
    try {
        const data = await fetchJSON(URL_BOARD);
        if (data.url) {
            BACKEND = data.url.replace(/\/$/, '');
            localStorage.setItem('shimatube_backend', BACKEND);
            console.log('Backend resolved:', BACKEND);
        }
    } catch (e) {
        console.warn('url-board unreachable, using same-origin', e);
        if (!BACKEND) BACKEND = '';
    }
}

// ユーザーID: クロスオリジン(Vercel→トンネル)ではcookieが送られないため、
// localStorageで永続化したuidを全APIリクエストに ?uid= で付与する。
// WebViewのストレージ削減でlocalStorageだけ消えるケースに備え、
// 自オリジンcookieにもミラーして相互復元する (両方消えたら設定の「データ復旧」で引き取る)
function _getUidCookie() {
    const m = document.cookie.match(/(?:^|;\s*)st_uid=([A-Za-z0-9_-]{8,64})/);
    return m ? m[1] : null;
}
function UID() {
    let id = localStorage.getItem('shimatube_uid') || _getUidCookie();
    if (!id) {
        id = (crypto.randomUUID && crypto.randomUUID())
            || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));
    }
    localStorage.setItem('shimatube_uid', id);
    document.cookie = `st_uid=${id}; Path=/; Max-Age=315360000; SameSite=Lax`;
    return id;
}
// ストレージの自動削減(eviction)をブラウザに抑止してもらう
if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
}

function B(path) {
    const sep = path.includes('?') ? '&' : '?';
    return BACKEND + path + sep + 'uid=' + encodeURIComponent(UID());
}

function toast(msg, duration = 2000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
}

const app = {
    currentVideoId: null,
    currentChannelId: null,
    currentVideoMeta: null,
    navStack: [],
    userData: null,
    homeState: 'feed',
    currentSearchPage: 1,
    currentSearchQuery: '',
    currentChannelPage: 1,
    currentFilter: '',
    isLoadingMore: false,
    hasMoreResults: true,
    scrollObserver: null,
    currentPlaylist: null,
    playlistIndex: -1,

    loadUserData: async () => {
        app.userDataLoading = true;
        app.userDataError = false;
        try {
            const data = await fetchJSON(B('/api/user_data'));
            if (!data || !Array.isArray(data.categories)) throw new Error('Invalid settings');
            app.userData = data;
            return true;
        } catch (e) {
            app.userDataError = true;
            console.error(e);
            return false;
        } finally { app.userDataLoading = false; }
    },

    retryUserData: async () => {
        if (app.userDataLoading) return;
        app.userDataLoading = true;
        app.userDataError = false;
        app.renderHome();
        await resolveBackend();
        await app.loadUserData();
        if (app.homeState === 'feed' && app.navStack.at(-1) === 'home') app.renderHome();
    }
};
