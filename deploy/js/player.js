Object.assign(app, {
    playVideo: async (videoId) => {
        app.currentVideoId = videoId;
        app.switchTab('player');
        try {
            const data = await API.getVideo(videoId);
            app.currentVideoMeta = data.metadata;
            app.currentChannelId = data.metadata.channelId;
            UI.setupPlayer(data, videoId);
            await Storage.addToHistory({
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

    togglePip: async () => {
        const v = document.getElementById('main-video');
        if (!v) return;
        try {
            // Androidアプリ(WebView)はWeb PiP API非対応 → ネイティブPiPブリッジを使う
            if (window.AndroidPiP && typeof window.AndroidPiP.enterPiP === 'function') {
                if (v.readyState < 1 || v.paused) { try { await v.play(); } catch (_) {} }
                window.AndroidPiP.enterPiP();
                return;
            }
            // 既にPiP中なら解除（トグル動作）
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                return;
            }
            if (v.webkitPresentationMode === 'picture-in-picture') {
                v.webkitSetPresentationMode('inline');
                return;
            }
            // 再生が始まってないとPiP要求が弾かれるので保証
            if (v.readyState < 1 || v.paused) {
                try { await v.play(); } catch (_) {}
            }
            if (document.pictureInPictureEnabled && v.requestPictureInPicture && !v.disablePictureInPicture) {
                await v.requestPictureInPicture();
            } else if (v.webkitSupportsPresentationMode && v.webkitSupportsPresentationMode('picture-in-picture')) {
                v.webkitSetPresentationMode('picture-in-picture');
            } else {
                toast('この端末はPiP非対応');
            }
        } catch (e) {
            toast('PiP不可: ' + (e && (e.message || e.name) || ''));
        }
    },

    toggleSubFromPlayer: async () => {
        if (!app.currentChannelId || !app.currentVideoMeta) return;
        await app.toggleSubUniversal(app.currentChannelId, app.currentVideoMeta.author, app.currentVideoMeta.thumbnail);
        UI.updateSubButtonInPlayer(app.currentChannelId);
    },

    toggleSubUniversal: async (cid, title, thumb) => {
        const isSub = await Storage.toggleSub({ channelId: cid, title, thumbnail: thumb });
        if (app.navStack[app.navStack.length - 1] === 'subs') {
            UI.renderChannelList(Storage.getSubs(), 'subs-list');
        } else {
            toast(isSub ? 'Subscribed' : 'Unsubscribed');
        }
    }
});
