Object.assign(app, {
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

    openChannelFromPlayer: () => { if (app.currentChannelId) app.openChannel(app.currentChannelId); }
});
