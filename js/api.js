const API_BASE_PATH = '/api_proxy/api/v1';

const API = {
    _fetch: async (url) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
        return res.json();
    },
    // プリフェッチ済み動画データキャッシュ
    _videoCache: {},
    _prefetching: new Set(),

    prefetchVideos: (videoIds) => {
        const top = videoIds.slice(0, 3);
        top.forEach(id => {
            if (API._videoCache[id] || API._prefetching.has(id)) return;
            API._prefetching.add(id);
            API._fetch(B(`${API_BASE_PATH}/videos/${id}?quality=720`)).then(data => {
                API._videoCache[id] = data;
            }).catch(() => {}).finally(() => API._prefetching.delete(id));
        });
    },

    trending: () => {
        return API._fetch(B('/api/trending'));
    },
    search: (query, page = 1, filter = '', sort = '') => {
        let path = `${API_BASE_PATH}/search?q=${encodeURIComponent(query)}&page=${page}`;
        if (filter) path += `&filter=${filter}`;
        if (sort) path += `&sort=${sort}`;
        return API._fetch(B(path));
    },
    getVideo: async (videoId) => {
        // プリフェッチキャッシュがあれば即返す
        if (API._videoCache[videoId]) {
            const data = API._videoCache[videoId];
            delete API._videoCache[videoId];
            return data;
        }
        return API._fetch(B(`${API_BASE_PATH}/videos/${videoId}?quality=720`));
    },
    getComments: (videoId) => {
        return API._fetch(B(`${API_BASE_PATH}/comments/${videoId}`));
    },
    getChannelVideos: (channelId, page = 1, tab = '') => {
        let path = `${API_BASE_PATH}/channels/${channelId}?page=${page}`;
        if (tab) path += `&tab=${tab}`;
        return API._fetch(B(path));
    },
    getPlaylist: (playlistId) => {
        return API._fetch(B(`${API_BASE_PATH}/playlists/${playlistId}`));
    },
    getFeedChannel: (channelId) => {
        return API._fetch(B(`/api/feed/channel/${channelId}`));
    },
    getRelated: (videoId) => {
        return API._fetch(B(`/api/related/${videoId}`));
    }
};
