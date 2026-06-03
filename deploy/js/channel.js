Object.assign(app, {
    openChannel: async (channelId, page = 1, append = false, tab = null, isBack = false) => {
        if (!append) app.switchTab('home');
        app.homeState = 'channel';
        // 別チャンネルを開いたらタイトルキャッシュをリセット（タブ切替時は保持）
        if (!append && app._chTitleId !== channelId) { app.currentChannelTitle = null; app._chTitleId = channelId; }
        app.currentChannelId = channelId;
        app.currentChannelPage = page;
        app.currentPlaylist = null;
        if (tab !== null) app.currentChannelTab = tab;
        if (!app.currentChannelTab) app.currentChannelTab = 'videos';
        const ctab = app.currentChannelTab;
        if (!append && !isBack) {
            app.pushHomeState({ type: 'channel', key: 'channel:' + channelId, channelId, tab: ctab });
        }

        const container = document.getElementById('home-list');
        if (!append) {
            container.innerHTML = '<div style="padding:20px;">Loading Channel...</div>';
        }

        app.isLoadingMore = true;
        try {
            const res = await API.getChannelVideos(channelId, page, ctab);
            if (res.channel && res.channel.title && res.channel.title !== 'Unknown') {
                app.currentChannelTitle = res.channel.title;
            }
            const ctitle = app.currentChannelTitle || (res.channel && res.channel.title) || 'Channel';
            if (!append) {
                const tabBtn = (key, label) =>
                    `<button class="filter-btn ${ctab === key ? 'active' : ''}" onclick="app.setChannelTab('${key}')">${label}</button>`;
                container.innerHTML = `
                    <div class="cat-header" style="font-size:16px;">${esc(ctitle)}</div>
                    <div class="filter-bar">
                        ${tabBtn('videos', '動画')}
                        ${tabBtn('live', 'ライブ')}
                        ${tabBtn('playlists', '再生リスト')}
                    </div>
                    <div id="channel-v-list"></div>
                    <div id="scroll-sentinel" class="scroll-sentinel"><div class="loader"></div></div>
                `;
            }
            const vids = res.videos || [];
            if (vids.length < 20) {
                app.hasMoreResults = false;
                const s = document.getElementById('scroll-sentinel');
                if (s) s.style.display = 'none';
            }
            UI.renderVideoList(vids, 'channel-v-list', append);
            if (!append && vids.length === 0) {
                const lst = document.getElementById('channel-v-list');
                if (lst) lst.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">ここには何もありません</div>';
            }
            if (!append) {
                app.setupInfiniteScroll(() => app.openChannel(channelId, app.currentChannelPage + 1, true));
                window.scrollTo(0, 0);
            }
        } catch (e) {
            const lst = document.getElementById('channel-v-list');
            if (lst) lst.innerHTML = '<div style="padding:24px;text-align:center;color:#888;">読み込みエラー</div>';
            else if (!append) container.innerHTML = '<div style="padding:20px;">Error loading channel.</div>';
        }
        app.isLoadingMore = false;
    },

    setChannelTab: (tab) => {
        if (app.currentChannelTab === tab) return;
        app.openChannel(app.currentChannelId, 1, false, tab);
    },

    openChannelFromPlayer: () => { if (app.currentChannelId) app.openChannel(app.currentChannelId, 1, false, 'videos'); }
});
