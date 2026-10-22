Object.assign(app, {
    openPlaylist: async (playlistId, isBack = false) => {
        app.switchTab('home');
        app.homeState = 'playlist';
        if (!isBack) app.pushHomeState({ type: 'playlist', key: 'pl:' + playlistId, playlistId });
        const container = document.getElementById('home-list');
        container.innerHTML = '<div class="state-msg">再生リストを読み込み中…</div>';

        try {
            const res = await API.getPlaylist(playlistId);
            app.currentPlaylist = { id: playlistId, title: res.title, videos: res.videos };
            app.playlistIndex = -1;

            container.innerHTML = `
                <div class="cat-header lg">
                    <span>${esc(res.title)}</span>
                    <button class="btn btn-sm" onclick="app.playAllPlaylist()">▶ すべて再生</button>
                </div>
                <div class="meta-note">${res.videos.length} videos</div>
                <div id="playlist-v-list"></div>
            `;
            UI.renderVideoList(res.videos, 'playlist-v-list');
        } catch (e) {
            container.innerHTML = '<div class="state-msg">再生リストを読み込めませんでした。時間をおいて再試行してください</div>';
        }
    },

    playAllPlaylist: () => {
        if (app.currentPlaylist && app.currentPlaylist.videos.length > 0) {
            app.playlistIndex = 0;
            app.playVideo(app.currentPlaylist.videos[0].videoId);
        }
    }
});
