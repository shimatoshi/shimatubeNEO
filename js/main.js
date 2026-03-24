app.init = async () => {
    app.navStack = ['home'];
    app.updateBackBtn();
    app.switchTab('home', false);
    await app.loadUserData();

    // Migrate localStorage → server (one-time)
    if (!localStorage.getItem('shimatube_migrated')) {
        const oldSubs = localStorage.getItem('shimatube_subs');
        if (oldSubs) {
            for (const ch of JSON.parse(oldSubs)) {
                await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(ch)
                });
            }
        }
        const oldHist = localStorage.getItem('shimatube_history');
        if (oldHist) {
            for (const v of JSON.parse(oldHist).reverse()) {
                await fetch('/api/history', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(v)
                });
            }
        }
        localStorage.setItem('shimatube_migrated', '1');
        await app.loadUserData();
    }

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
