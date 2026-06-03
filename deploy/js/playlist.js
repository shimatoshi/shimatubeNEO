Object.assign(app, {
    openPlaylist: async (playlistId, isBack = false) => {
        app.switchTab('home');
        app.homeState = 'playlist';
        if (!isBack) app.pushHomeState({ type: 'playlist', key: 'pl:' + playlistId, playlistId });
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
    }
});
