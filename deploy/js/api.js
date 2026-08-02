const API_BASE_PATH = '/api_proxy/api/v1';

const API = {
    // url-board引き直しの多重実行を防ぐ（同時に何本もAPIが飛ぶので）
    _reresolving: null,

    // キャッシュしていたBACKENDが死んでいた時、url-boardを引き直して
    // URLのホスト部分だけ差し替えた新URLを返す。変わらなければ null。
    _reresolve: async (url) => {
        const old = BACKEND;
        if (!API._reresolving) {
            API._reresolving = resolveBackend().finally(() => { API._reresolving = null; });
        }
        await API._reresolving;
        if (BACKEND && BACKEND !== old) {
            console.warn('backend rotated:', old, '->', BACKEND);
            return old ? url.replace(old, BACKEND) : BACKEND + url;
        }
        return null;
    },

    // トンネルURLが回るとキャッシュ済みBACKENDが死ぬ（cloudflare quick tunnelは
    // P5が再起動する度に変わる）。落ちたら url-board を引き直して1回だけやり直す。
    _fetch: async (url, _retried) => {
        let res;
        try {
            res = await fetch(url);
        } catch (e) {
            // DNS解決不能/接続不能 = トンネルが消えた時の典型
            if (!_retried) {
                const next = await API._reresolve(url);
                if (next) return API._fetch(next, true);
            }
            throw e;
        }
        // 502/503/530 はcloudflareが「オリジンに繋がらない」時に返す
        if (!res.ok) {
            if (!_retried && (res.status === 404 || res.status >= 500)) {
                const next = await API._reresolve(url);
                if (next) return API._fetch(next, true);
            }
            throw new Error(`API ${res.status}: ${res.statusText}`);
        }
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
