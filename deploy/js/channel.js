Object.assign(app, {
    openChannel: async (channelId, page = 1, append = false, tab = null) => {
        if (!append) app.switchTab('home');
        app.homeState = 'channel';
        app.currentChannelId = channelId;
        app.currentChannelPage = page;
        app.currentPlaylist = null;
        if (tab !== null) app.currentChannelTab = tab;
        if (!app.currentChannelTab) app.currentChannelTab = 'videos';
        const ctab = app.currentChannelTab;

        const container = document.getElementById('home-list');
        if (!append) {
            container.innerHTML = '<div style="padding:20px;">Loading Channel...</div>';
        }

        app.isLoadingMore = true;
        try {
            const res = await API.getChannelVideos(channelId, page, ctab);
            if (!append) {
                const tabBtn = (key, label) =>
                    `<button class="filter-btn ${ctab === key ? 'active' : ''}" onclick="app.setChannelTab('${key}')">${label}</button>`;
                container.innerHTML = `
                    <div class="cat-header" style="font-size:16px;">${esc(res.channel.title)}</div>
                    <div class="filter-bar">
                        ${tabBtn('videos', '動画')}
                        ${tabBtn('live', 'ライブ')}
                        ${tabBtn('playlists', '再生リスト')}
                    </div>
                    <div id="channel-v-list"></div>
                    <div id="scroll-sentinel" class="scroll-sentinel"><div class="loader"></div></div>
                `;
            }
            if (!res.videos || res.videos.length < 20) {
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

    setChannelTab: (tab) => {
        if (app.currentChannelTab === tab) return;
        app.openChannel(app.currentChannelId, 1, false, tab);
    },

    openChannelFromPlayer: () => { if (app.currentChannelId) app.openChannel(app.currentChannelId, 1, false, 'videos'); }
});
