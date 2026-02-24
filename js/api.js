const API_BASE = '/api_proxy/api/v1';

const API = {
    search: async (query, page = 1, filter = '') => {
        let url = `${API_BASE}/search?q=${encodeURIComponent(query)}&page=${page}`;
        if (filter) url += `&filter=${filter}`;
        const res = await fetch(url);
        return await res.json();
    },
    getVideo: async (videoId) => {
        const res = await fetch(`${API_BASE}/videos/${videoId}?quality=720`);
        return await res.json();
    },
    getComments: async (videoId) => {
        const res = await fetch(`${API_BASE}/comments/${videoId}`);
        return await res.json();
    },
    getChannelVideos: async (channelId, page = 1, filter = '') => {
        let url = `${API_BASE}/channels/${channelId}?page=${page}`;
        if (filter) url += `&filter=${filter}`;
        const res = await fetch(url);
        return await res.json();
    },
    getPlaylist: async (playlistId) => {
        const res = await fetch(`${API_BASE}/playlists/${playlistId}`);
        return await res.json();
    }
};
