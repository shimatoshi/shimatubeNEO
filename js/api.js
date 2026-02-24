const API_BASE = '/api_proxy/api/v1';

function authHeaders() {
    const token = Storage.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

async function apiFetch(url, opts = {}) {
    opts.headers = { ...authHeaders(), ...(opts.headers || {}) };
    const res = await fetch(url, opts);
    if (res.status === 401) {
        Storage.clearToken();
        if (typeof app !== 'undefined') app.showLogin();
        throw new Error('Unauthorized');
    }
    return res;
}

const API = {
    search: async (query, page = 1, filter = '') => {
        let url = `${API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}`;
        if (filter) url += `&filter=${filter}`;
        const res = await apiFetch(url);
        return await res.json();
    },
    getVideo: async (videoId) => {
        const res = await apiFetch(`${API_BASE}/videos/${videoId}?quality=720`);
        return await res.json();
    },
    getComments: async (videoId) => {
        const res = await apiFetch(`${API_BASE}/comments/${videoId}`);
        return await res.json();
    },
    getChannelVideos: async (channelId, page = 1, filter = '') => {
        let url = `${API_BASE}/channels/${channelId}?page=${page}`;
        if (filter) url += `&filter=${filter}`;
        const res = await apiFetch(url);
        return await res.json();
    },
    getPlaylist: async (playlistId) => {
        const res = await apiFetch(`${API_BASE}/playlists/${playlistId}`);
        return await res.json();
    }
};
