app.init = async () => {
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

    const verEl = document.getElementById('app-version');
    if (verEl) verEl.textContent = 'ShimaTube NEO ' + APP_VERSION;
};

app.init();
