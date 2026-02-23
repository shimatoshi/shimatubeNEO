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
    currentSearchType: 'video',
    currentChannelPage: 1,

    init: async () => {
        app.navStack = ['home'];
        app.updateBackBtn();
        app.switchTab('home', false);
        await app.loadUserData();
        app.renderHome();
    },

    loadUserData: async () => {
        try {
            const res = await fetch('/api/user_data');
            app.userData = await res.json();
        } catch(e) { console.error(e); }
    },

    renderHome: async () => {
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
            header.innerHTML = `<span>${cat}</span><span class="cat-toggle" id="toggle-${index}">▼</span>`;
            header.onclick = () => app.toggleCategory(index);
            container.appendChild(header);

            const listDiv = document.createElement('div');
            listDiv.id = listId;
            listDiv.className = 'cat-content';
            listDiv.style.minHeight = '50px';
            listDiv.innerHTML = '<div style="padding:10px;font-size:12px;color:#666;">Loading...</div>';
            container.appendChild(listDiv);

            if (index > 0) app.toggleCategory(index);

            API.search(cat, 'video').then(res => {
                UI.renderVideoList(res, listId);
            }).catch(() => {
                document.getElementById(listId).innerHTML = '<div style="padding:10px;">Error</div>';
            });
        });
    },

    toggleCategory: (index) => {
        const content = document.getElementById(`list-${index}`);
        const icon = document.getElementById(`toggle-${index}`);
        if(content.classList.contains('hidden')) {
            content.classList.remove('hidden');
            icon.classList.remove('closed');
        } else {
            content.classList.add('hidden');
            icon.classList.add('closed');
        }
    },

    handleHomeClick: () => {
        if (app.navStack[app.navStack.length-1] === 'home' && app.homeState !== 'feed') {
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
            const prev = app.navStack[app.navStack.length - 1];
            app.switchTab(prev, false);
        }
    },

    updateBackBtn: () => {
        const btn = document.getElementById('back-btn');
        btn.style.display = app.navStack.length > 1 ? 'block' : 'none';
    },

    search: async (page = 1) => {
        const query = document.getElementById('search-input').value || app.currentSearchQuery;
        const type = document.getElementById('search-type').value;
        if (!query) return;

        if(app.navStack[app.navStack.length-1] !== 'home') app.switchTab('home');
        
        app.homeState = 'search';
        app.currentSearchPage = page;
        app.currentSearchQuery = query;
        app.currentSearchType = type;

        const container = document.getElementById('home-list');
        container.innerHTML = '<div style="padding:20px;">Searching...</div>';
        
        try {
            const results = await API.search(query, type, page);
            container.innerHTML = `
                <div class="cat-header">Search: ${esc(query)} (Page ${page})</div>
                <div id="search-res-list"></div>
                <div class="pager">
                    <button class="btn" onclick="app.search(${page - 1})" ${page <= 1 ? 'disabled' : ''}>Prev</button>
                    <span style="margin:0 15px;">Page ${page}</span>
                    <button class="btn" onclick="app.search(${page + 1})" ${results.length < 20 ? 'disabled' : ''}>Next</button>
                </div>
            `;
            UI.renderVideoList(results, 'search-res-list');
            window.scrollTo(0,0);
        } catch (e) { toast('Search error'); }
    },

    playVideo: async (videoId) => {
        app.currentVideoId = videoId;
        app.switchTab('player');
        try {
            const data = await API.getVideo(videoId);
            app.currentVideoMeta = data.metadata;
            app.currentChannelId = data.metadata.channelId;
            UI.setupPlayer(data, videoId);
            Storage.addToHistory({
                videoId: videoId, title: data.metadata.title,
                thumbnail: data.metadata.thumbnail, lengthSeconds: 0, 
                viewCount: data.metadata.viewCount, type: 'video'
            });
        } catch (e) { console.error(e); }
    },

    restorePlayer: () => { if(app.currentVideoId) app.switchTab('player'); },
    
    closeMiniPlayer: () => {
        const v = document.getElementById('main-video');
        v.pause();
        app.currentVideoId = null;
        UI.hideMiniPlayer();
    },

    openChannel: async (channelId, page = 1) => {
        app.switchTab('home');
        app.homeState = 'channel';
        app.currentChannelId = channelId;
        app.currentChannelPage = page;
        const container = document.getElementById('home-list');
        container.innerHTML = '<div style="padding:20px;">Loading Channel...</div>';
        try {
            const res = await API.getChannelVideos(channelId, page);
            container.innerHTML = `
                <div class="cat-header" style="font-size:16px;">${esc(res.channel.title)} (Page ${page})</div>
                <div id="channel-v-list"></div>
                <div class="pager">
                    <button class="btn" onclick="app.openChannel('${esc(channelId)}', ${page - 1})" ${page <= 1 ? 'disabled' : ''}>Prev</button>
                    <span style="margin:0 15px;">Page ${page}</span>
                    <button class="btn" onclick="app.openChannel('${esc(channelId)}', ${page + 1})" ${res.videos.length < 20 ? 'disabled' : ''}>Next</button>
                </div>
            `;
            UI.renderVideoList(res.videos, 'channel-v-list');
            window.scrollTo(0,0);
        } catch(e) {
            container.innerHTML = '<div style="padding:20px;">Error loading channel.</div>';
        }
    },
    
    openChannelFromPlayer: () => { if(app.currentChannelId) app.openChannel(app.currentChannelId); },

    showRelated: async (channelId = null) => {
        const cid = channelId || app.currentChannelId;
        if(!cid) return;
        document.querySelectorAll('#player-view .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#player-view .tab')[0].classList.add('active');
        document.getElementById('player-list').innerHTML = 'Loading...';
        const res = await API.getChannelVideos(cid);
        const filtered = res.videos.filter(v => v.videoId !== app.currentVideoId);
        UI.renderVideoList(filtered, 'player-list');
    },
    
    loadComments: async () => {
        if (!app.currentVideoId) return;
        document.querySelectorAll('#player-view .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#player-view .tab')[1].classList.add('active');
        document.getElementById('player-list').innerHTML = 'Loading comments...';
        const comments = await API.getComments(app.currentVideoId);
        const container = document.getElementById('player-list');
        container.innerHTML = '';
        comments.forEach(c => {
            const div = document.createElement('div');
            div.style.marginBottom = '15px'; div.style.fontSize = '13px';
            div.innerHTML = `<div style="font-weight:bold;color:#aaa;font-size:11px;">${esc(c.author)}</div><div>${esc(c.text)}</div>`;
            container.appendChild(div);
        });
    },

    toggleSub: () => {
        if(!app.currentChannelId || !app.currentVideoMeta) return;
        app.toggleSubUniversal(app.currentChannelId, app.currentVideoMeta.author, app.currentVideoMeta.thumbnail);
        UI.updateSubButtonInPlayer(app.currentChannelId);
    },
    toggleSubFromPlayer: () => { app.toggleSub(); },

    toggleSubUniversal: (cid, title, thumb) => {
        const channelObj = { channelId: cid, title: title, thumbnail: thumb };
        const isSub = Storage.toggleSub(channelObj);
        if(app.navStack[app.navStack.length-1] === 'subs') {
            UI.renderChannelList(Storage.getSubs(), 'subs-list');
        } else {
            toast(isSub ? 'Subscribed' : 'Unsubscribed');
        }
    },

    shareVideo: async () => {
        if(!app.currentVideoId) return;
        const url = `https://youtu.be/${app.currentVideoId}`;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
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

    toggleConfig: () => {
        const modal = document.getElementById('config-modal');
        const isShow = modal.style.display === 'block';
        modal.style.display = isShow ? 'none' : 'block';
        if (!isShow) app.refreshConfig();
    },
    refreshConfig: () => {
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
        await fetch('/', { method: 'POST', body: JSON.stringify({ action, payload }) });
        await app.loadUserData();
    },
    addCategory: async () => {
        const val = document.getElementById('cat-input').value;
        if(val && !app.userData.categories.includes(val)) {
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
        if(confirm(`Block channel "${name}"?`)) {
            await app.updateServer('block_channel', {id, name});
            toast('Blocked');
        }
    },
    unblockChannel: async (id) => {
        await app.updateServer('unblock_channel', {id});
        app.refreshConfig();
    },
    addBlockKeyword: async () => {
        const val = document.getElementById('kw-input').value;
        if(val) {
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