const API_BASE = '/api_proxy/api/v1';

const API = {
    // 検索 (type追加, page追加)
    search: async (query, type='video', page=1) => {
        const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}&type=${type}&page=${page}`);
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
    getChannelVideos: async (channelId, page = 1) => {
        const res = await fetch(`${API_BASE}/channels/${channelId}?page=${page}`);
        return await res.json();
    }
};

