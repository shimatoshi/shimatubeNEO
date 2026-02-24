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

    init: async () => {
        const token = Storage.getToken();
        if (!token) { app.showLogin(); return; }
        try {
            const res = await fetch('/api/auth_check', { headers: authHeaders() });
            if (!res.ok) { Storage.clearToken(); app.showLogin(); return; }
        } catch { /* network error, try anyway */ }

        document.getElementById('login-overlay').style.display = 'none';
        app.navStack = ['home'];
        app.updateBackBtn();
        app.switchTab('home', false);
        await app.loadUserData();
        app.renderHome();

        document.getElementById('search-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') app.search();
        });
        document.getElementById('main-video').addEventListener('ended', () => {
            if (app.currentPlaylist && app.playlistIndex < app.currentPlaylist.videos.length - 1) {
                app.playlistIndex++;
                const next = app.currentPlaylist.videos[app.playlistIndex];
                toast(`Up next: ${next.title}`);
                app.playVideo(next.videoId);
            }
        });
    },

    showLogin: () => {
        document.getElementById('login-overlay').style.display = 'flex';
    },

    doLogin: async () => {
        const pw = document.getElementById('login-password').value;
        if (!pw) return;
        try {
            const res = await fetch('/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'login', payload: pw })
            });
            if (res.ok) {
                const data = await res.json();
                Storage.setToken(data.token);
                app.init();
            } else {
                toast('Wrong password');
            }
        } catch { toast('Connection error'); }
    },

    logout: () => {
        Storage.clearToken();
        app.showLogin();
    },

    loadUserData: async () => {
        try {
            const res = await apiFetch('/api/user_data');
            app.userData = await res.json();
        } catch (e) { console.error(e); }
    },

    // === Home / Navigation ===

    renderHome: async () => {
        app.destroyInfiniteScroll();
        app.currentPlaylist = null;
        const container = document.getElementById('home-list');
        container.innerHTML = '';
        app.homeState = 'feed';

        if (!app.userData || !app.userData.categories) {
            container.innerHTML = '<div style="padding:20px;">Loading settings...</div>';
            return;
        }

        app.userData.categories.forEach((cat, index) => {
            const listId = `list-${index}`;
            const header = document.createElement('div');
            header.className = 'cat-header';
            header.innerHTML = `<span>${esc(cat)}</span><span class="cat-toggle" id="toggle-${index}">▼</span>`;
            header.onclick = () => app.toggleCategory(index);
            container.appendChild(header);

            const listDiv = document.createElement('div');
            listDiv.id = listId;
            listDiv.className = 'cat-content';
            listDiv.style.minHeight = '50px';
            listDiv.innerHTML = '<div style="padding:10px;font-size:12px;color:#666;">Loading...</div>';
            container.appendChild(listDiv);

            if (index > 0) app.toggleCategory(index);

            API.search(cat).then(res => {
                UI.renderVideoList(res, listId);
            }).catch(() => {
                const el = document.getElementById(listId);
                if (el) el.innerHTML = '<div style="padding:10px;">Error</div>';
            });
        });
    },

    toggleCategory: (index) => {
        const content = document.getElementById(`list-${index}`);
        const icon = document.getElementById(`toggle-${index}`);
        if (!content || !icon) return;
        content.classList.toggle('hidden');
        icon.classList.toggle('closed');
    },

    handleHomeClick: () => {
        if (app.navStack[app.navStack.length - 1] === 'home' && app.homeState !== 'feed') {
            app.currentFilter = '';
            app.renderHome();
            document.getElementById('search-input').value = '';
        } else {
            app.switchTab('home');
        }
    },

    switchTab: (tabName, pushStack = true) => {
        if (pushStack && app.navStack[app.navStack.length - 1] !== tabName) {
            app.navStack.push(tabName);
        }
        app.updateBackBtn();
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        if (tabName !== 'player' && app.currentVideoId) {
            UI.showMiniPlayer(app.currentVideoMeta ? app.currentVideoMeta.title : 'Playing');
        } else {
            UI.hideMiniPlayer();
        }

        if (tabName === 'home') {
            document.getElementById('view-home').classList.add('active');
            document.querySelectorAll('.nav-item')[0].classList.add('active');
        } else if (tabName === 'subs') {
            document.getElementById('view-subs').classList.add('active');
            document.querySelectorAll('.nav-item')[1].classList.add('active');
            UI.renderChannelList(Storage.getSubs(), 'subs-list');
        } else if (tabName === 'history') {
            document.getElementById('view-history').classList.add('active');
            document.querySelectorAll('.nav-item')[2].classList.add('active');
            UI.renderVideoList(Storage.getHistory(), 'history-list');
        } else if (tabName === 'player') {
            document.getElementById('view-player').classList.add('active');
        }
    },

    goBack: () => {
        if (app.navStack.length > 1) {
            app.navStack.pop();
            app.switchTab(app.navStack[app.navStack.length - 1], false);
        }
    },

    updateBackBtn: () => {
        document.getElementById('back-btn').style.display = app.navStack.length > 1 ? 'block' : 'none';
    },

    // === Infinite Scroll ===

    setupInfiniteScroll: (loadMoreFn) => {
        app.destroyInfiniteScroll();
        app.hasMoreResults = true;
        app.isLoadingMore = false;
        const sentinel = document.getElementById('scroll-sentinel');
        if (!sentinel) return;
        app.scrollObserver = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !app.isLoadingMore && app.hasMoreResults) {
                loadMoreFn();
            }
        }, { rootMargin: '300px' });
        app.scrollObserver.observe(sentinel);
    },

    destroyInfiniteScroll: () => {
        if (app.scrollObserver) {
            app.scrollObserver.disconnect();
            app.scrollObserver = null;
        }
    },

    // === Filter ===

    setFilter: (filter) => {
        if (app.currentFilter === filter) return;
        app.currentFilter = filter;
        if (app.homeState === 'search') app.search(1);
        else if (app.homeState === 'channel') app.openChannel(app.currentChannelId, 1);
    },

    // === Search ===

    extractPlaylistId: (input) => {
        const m = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        if (m) return m[1];
        if (/^PL[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
        return null;
    },

    search: async (page = 1, append = false) => {
        const query = document.getElementById('search-input').value || app.currentSearchQuery;
        if (!query) return;

        const plId = app.extractPlaylistId(query);
        if (plId) { app.openPlaylist(plId); return; }

        if (app.navStack[app.navStack.length - 1] !== 'home') app.switchTab('home');

        app.homeState = 'search';
        app.currentSearchPage = page;
        app.currentSearchQuery = query;
        app.currentPlaylist = null;

        const container = document.getElementById('home-list');
        if (!append) {
            container.innerHTML = `
                <div class="cat-header">Search: ${esc(query)}</div>
                <div class="filter-bar">
                    <button class="filter-btn ${app.currentFilter === '' ? 'active' : ''}" onclick="app.setFilter('')">All</button>
                    <button class="filter-btn ${app.currentFilter === 'live' ? 'active' : ''}" onclick="app.setFilter('live')">Live</button>
                </div>
                <div id="search-res-list"></div>
                <div id="scroll-sentinel" class="scroll-sentinel"><div class="loader"></div></div>
            `;
        }

        app.isLoadingMore = true;
        try {
            const results = await API.search(query, page, app.currentFilter);
            if (results.length < 20) {
                app.hasMoreResults = false;
                const s = document.getElementById('scroll-sentinel');
                if (s) s.style.display = 'none';
            }
            UI.renderVideoList(results, 'search-res-list', append);
            if (!append) {
                app.setupInfiniteScroll(() => app.search(app.currentSearchPage + 1, true));
                window.scrollTo(0, 0);
            }
        } catch (e) {
            if (!append) toast('Search error');
        }
        app.isLoadingMore = false;
    },

    // === Player ===

    playVideo: async (videoId) => {
        app.currentVideoId = videoId;
        app.switchTab('player');
        try {
            const data = await API.getVideo(videoId);
            app.currentVideoMeta = data.metadata;
            app.currentChannelId = data.metadata.channelId;
            UI.setupPlayer(data, videoId);
            Storage.addToHistory({
                videoId, title: data.metadata.title,
                thumbnail: data.metadata.thumbnail, lengthSeconds: 0,
                viewCount: data.metadata.viewCount, type: 'video'
            });
            if (app.currentPlaylist) {
                const idx = app.currentPlaylist.videos.findIndex(v => v.videoId === videoId);
                if (idx !== -1) app.playlistIndex = idx;
            }
        } catch (e) { console.error(e); }
    },

    restorePlayer: () => { if (app.currentVideoId) app.switchTab('player'); },

    closeMiniPlayer: () => {
        document.getElementById('main-video').pause();
        app.currentVideoId = null;
        app.currentPlaylist = null;
        app.playlistIndex = -1;
        UI.hideMiniPlayer();
    },

    // === Channel ===

    openChannel: async (channelId, page = 1, append = false) => {
        if (!append) app.switchTab('home');
        app.homeState = 'channel';
        app.currentChannelId = channelId;
        app.currentChannelPage = page;
        app.currentPlaylist = null;

        const container = document.getElementById('home-list');
        if (!append) {
            container.innerHTML = '<div style="padding:20px;">Loading Channel...</div>';
        }

        app.isLoadingMore = true;
        try {
            const res = await API.getChannelVideos(channelId, page, app.currentFilter);
            if (!append) {
                container.innerHTML = `
                    <div class="cat-header" style="font-size:16px;">${esc(res.channel.title)}</div>
                    <div class="filter-bar">
                        <button class="filter-btn ${app.currentFilter === '' ? 'active' : ''}" onclick="app.setFilter('')">Videos</button>
                        <button class="filter-btn ${app.currentFilter === 'live' ? 'active' : ''}" onclick="app.setFilter('live')">Live</button>
                    </div>
                    <div id="channel-v-list"></div>
                    <div id="scroll-sentinel" class="scroll-sentinel"><div class="loader"></div></div>
                `;
            }
            if (res.videos.length < 20) {
                app.hasMoreResults = false;
                const s = document.getElementById('scroll-sentinel');
                if (s) s.style.display = 'none';
            }
            UI.renderVideoList(res.videos, 'channel-v-list', append);
            if (!append) {
                app.setupInfiniteScroll(() => app.openChannel(channelId, app.currentChannelPage + 1, true));
                window.scrollTo(0, 0);
            }
        } catch (e) {
            if (!append) container.innerHTML = '<div style="padding:20px;">Error loading channel.</div>';
        }
        app.isLoadingMore = false;
    },

    openChannelFromPlayer: () => { if (app.currentChannelId) app.openChannel(app.currentChannelId); },

    // === Playlist ===

    openPlaylist: async (playlistId) => {
        app.switchTab('home');
        app.homeState = 'playlist';
        const container = document.getElementById('home-list');
        container.innerHTML = '<div style="padding:20px;">Loading Playlist...</div>';

        try {
            const res = await API.getPlaylist(playlistId);
            app.currentPlaylist = { id: playlistId, title: res.title, videos: res.videos };
            app.playlistIndex = -1;

            container.innerHTML = `
                <div class="cat-header" style="font-size:16px;">
                    <span>${esc(res.title)}</span>
                    <button class="btn" style="font-size:11px;padding:4px 10px;" onclick="app.playAllPlaylist()">▶ Play All</button>
                </div>
                <div style="padding:4px 10px;font-size:12px;color:#888;">${res.videos.length} videos</div>
                <div id="playlist-v-list"></div>
            `;
            UI.renderVideoList(res.videos, 'playlist-v-list');
        } catch (e) {
            container.innerHTML = '<div style="padding:20px;">Error loading playlist.</div>';
        }
    },

    playAllPlaylist: () => {
        if (app.currentPlaylist && app.currentPlaylist.videos.length > 0) {
            app.playlistIndex = 0;
            app.playVideo(app.currentPlaylist.videos[0].videoId);
        }
    },

    // === Related / Comments ===

    showRelated: async (channelId = null) => {
        const tabEls = document.querySelectorAll('#player-view .tab');
        tabEls.forEach(t => t.classList.remove('active'));
        tabEls[0].classList.add('active');

        if (app.currentPlaylist) {
            tabEls[0].textContent = 'Playlist';
            document.getElementById('player-list').innerHTML = '';
            UI.renderVideoList(app.currentPlaylist.videos, 'player-list');
            return;
        }

        tabEls[0].textContent = 'Related';
        const cid = channelId || app.currentChannelId;
        if (!cid) return;
        document.getElementById('player-list').innerHTML = 'Loading...';
        try {
            const res = await API.getChannelVideos(cid);
            const filtered = res.videos.filter(v => v.videoId !== app.currentVideoId);
            UI.renderVideoList(filtered, 'player-list');
        } catch {
            document.getElementById('player-list').innerHTML = '<div style="padding:10px;color:#666;">Error</div>';
        }
    },

    loadComments: async () => {
        if (!app.currentVideoId) return;
        document.querySelectorAll('#player-view .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#player-view .tab')[1].classList.add('active');
        document.getElementById('player-list').innerHTML = 'Loading comments...';
        try {
            const comments = await API.getComments(app.currentVideoId);
            const container = document.getElementById('player-list');
            container.innerHTML = '';
            if (comments.length === 0) {
                container.innerHTML = '<div style="padding:20px;color:#666;">No comments</div>';
                return;
            }
            comments.forEach(c => {
                const div = document.createElement('div');
                div.style.marginBottom = '15px'; div.style.fontSize = '13px';
                div.innerHTML = `<div style="font-weight:bold;color:#aaa;font-size:11px;">${esc(c.author)}</div><div>${esc(c.text)}</div>`;
                container.appendChild(div);
            });
        } catch {
            document.getElementById('player-list').innerHTML = '<div style="padding:20px;color:#666;">Error loading comments</div>';
        }
    },

    // === Subscriptions ===

    toggleSub: () => {
        if (!app.currentChannelId || !app.currentVideoMeta) return;
        app.toggleSubUniversal(app.currentChannelId, app.currentVideoMeta.author, app.currentVideoMeta.thumbnail);
        UI.updateSubButtonInPlayer(app.currentChannelId);
    },
    toggleSubFromPlayer: () => { app.toggleSub(); },

    toggleSubUniversal: (cid, title, thumb) => {
        const isSub = Storage.toggleSub({ channelId: cid, title, thumbnail: thumb });
        if (app.navStack[app.navStack.length - 1] === 'subs') {
            UI.renderChannelList(Storage.getSubs(), 'subs-list');
        } else {
            toast(isSub ? 'Subscribed' : 'Unsubscribed');
        }
    },

    // === Actions ===

    shareVideo: async () => {
        if (!app.currentVideoId) return;
        const url = `https://youtu.be/${app.currentVideoId}`;
        try { await navigator.clipboard.writeText(url); }
        catch {
            const ta = document.createElement('textarea');
            ta.value = url; document.body.appendChild(ta);
            ta.select(); document.execCommand('copy');
            document.body.removeChild(ta);
        }
        toast('URL copied');
    },

    toggleDesc: () => {
        const el = document.getElementById('desc-content');
        el.style.display = el.style.display === 'block' ? 'none' : 'block';
    },
    togglePip: () => {
        const v = document.getElementById('main-video');
        if (v && v.requestPictureInPicture) v.requestPictureInPicture();
        else if (v && v.webkitSetPresentationMode) v.webkitSetPresentationMode('picture-in-picture');
    },

    // === Config ===

    toggleConfig: () => {
        const modal = document.getElementById('config-modal');
        const isShow = modal.style.display === 'block';
        modal.style.display = isShow ? 'none' : 'block';
        if (!isShow) app.refreshConfig();
    },
    refreshConfig: () => {
        if (!app.userData) return;
        app.renderTags('cat-list', app.userData.categories, 'app.removeCategory');
        app.renderTags('kw-list', app.userData.blocked_keywords, 'app.removeBlockKeyword');
        const bcList = document.getElementById('bc-list');
        bcList.innerHTML = '';
        app.userData.blocked_channels.forEach(c => {
            bcList.innerHTML += `<div class="tag"><span>${esc(c.name)}</span><span class="tag-del" onclick="app.unblockChannel('${esc(c.id)}')">✕</span></div>`;
        });
    },
    renderTags: (elId, list, removeFuncStr) => {
        const el = document.getElementById(elId);
        el.innerHTML = '';
        list.forEach(item => {
            el.innerHTML += `<div class="tag"><span>${esc(item)}</span><span class="tag-del" onclick="${removeFuncStr}(${JSON.stringify(item)})">✕</span></div>`;
        });
    },
    updateServer: async (action, payload) => {
        await apiFetch('/', { method: 'POST', body: JSON.stringify({ action, payload }) });
        await app.loadUserData();
    },
    addCategory: async () => {
        const val = document.getElementById('cat-input').value;
        if (val && !app.userData.categories.includes(val)) {
            await app.updateServer('update_categories', [...app.userData.categories, val]);
            document.getElementById('cat-input').value = '';
            app.refreshConfig(); app.renderHome();
        }
    },
    removeCategory: async (val) => {
        await app.updateServer('update_categories', app.userData.categories.filter(c => c !== val));
        app.refreshConfig(); app.renderHome();
    },
    blockChannel: async (id, name) => {
        if (confirm(`Block channel "${name}"?`)) {
            await app.updateServer('block_channel', { id, name });
            toast('Blocked');
        }
    },
    unblockChannel: async (id) => {
        await app.updateServer('unblock_channel', { id });
        app.refreshConfig();
    },
    addBlockKeyword: async () => {
        const val = document.getElementById('kw-input').value;
        if (val) {
            await app.updateServer('block_keyword', val);
            document.getElementById('kw-input').value = '';
            app.refreshConfig();
        }
    },
    removeBlockKeyword: async (val) => {
        await app.updateServer('unblock_keyword', val);
        app.refreshConfig();
    }
};

app.init();
