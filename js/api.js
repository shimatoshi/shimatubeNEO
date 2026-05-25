const API_BASE = '/api_proxy/api/v1';

const API = {
    _fetch: async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
    },
    search: (query, page = 1, filter = '') => {
        let url = `${API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}`;
        if (filter) url += `&filter=${filter}`;
        return API._fetch(url);
    },
    getVideo: (videoId) => {
        return API._fetch(`${API_BASE}/videos/${videoId}?quality=720`);
    },
    getComments: (videoId) => {
        return API._fetch(`${API_BASE}/comments/${videoId}`);
    },
    getChannelVideos: (channelId, page = 1, filter = '') => {
        let url = `${API_BASE}/channels/${channelId}?page=${page}`;
        if (filter) url += `&filter=${filter}`;
        return API._fetch(url);
    },
    getPlaylist: (playlistId) => {
        return API._fetch(`${API_BASE}/playlists/${playlistId}`);
    },
    getFeedChannel: (channelId) => {
        return API._fetch(`/api/feed/channel/${channelId}`);
    }
};
