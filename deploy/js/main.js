app.init = async () => {
    app.navStack = ['home'];
    app.relatedVideos = [];
    app.autoplay = localStorage.getItem('shimatube_autoplay') !== '0';  // 既定ON
    app.updateBackBtn();
    app.switchTab('home', false);
    // resolveBackend と loadUserData を並列実行
    await Promise.all([resolveBackend(), app.loadUserData()]);

    // Migrate localStorage → server (one-time)
    if (!localStorage.getItem('shimatube_migrated')) {
        const oldSubs = localStorage.getItem('shimatube_subs');
        if (oldSubs) {
            for (const ch of JSON.parse(oldSubs)) {
                await fetch(B('/api/subscribe'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(ch)
                });
            }
        }
        const oldHist = localStorage.getItem('shimatube_history');
        if (oldHist) {
            for (const v of JSON.parse(oldHist).reverse()) {
                await fetch(B('/api/history'), {
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
    const mainVideo = document.getElementById('main-video');
    mainVideo.addEventListener('ended', () => {
        if (app.currentVideoId) UI.clearProgress(app.currentVideoId);  // 最後まで見たら進捗クリア
        if (app.currentPlaylist && app.playlistIndex < app.currentPlaylist.videos.length - 1) {
            app.playlistIndex++;
            const next = app.currentPlaylist.videos[app.playlistIndex];
            toast(`Up next: ${next.title}`);
            app.playVideo(next.videoId);
            return;
        }
        // 関連動画オートプレイ（上から次へ再生し続ける）
        if (app.autoplay && app.relatedVideos && app.relatedVideos.length) {
            const next = app.relatedVideos.find(v => v.videoId !== app.currentVideoId && !v.is_live);
            if (next) { toast(`Up next: ${next.title}`); app.playVideo(next.videoId); }
        }
    });
    // 再生位置を5秒ごとに保存（続きから再生用）
    let _lastSave = 0;
    mainVideo.addEventListener('timeupdate', () => {
        const now = Date.now();
        if (now - _lastSave < 5000) return;
        _lastSave = now;
        if (app.currentVideoId && mainVideo.currentTime > 5) {
            UI.saveProgress(app.currentVideoId, mainVideo.currentTime);
        }
    });

    UI.updateAutoplayBtn();
    const verEl = document.getElementById('app-version');
    if (verEl) verEl.textContent = 'ShimaTube NEO ' + APP_VERSION;
};

app.init();
