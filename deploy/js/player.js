Object.assign(app, {
    playVideo: async (videoId) => {
        app.currentVideoId = videoId;
        app.switchTab('player');
        UI.showPlayerLoading(videoId);   // タップ直後に即フィードバック(サムネ+読み込み中)
        try {
            const data = await API.getVideo(videoId);
            if (app.currentVideoId !== videoId) return;  // 待機中に別動画へ切替えられたら破棄
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
            tabEls[0].textContent = '再生リスト';
            document.getElementById('player-list').innerHTML = '';
            UI.renderVideoList(app.currentPlaylist.videos, 'player-list');
            return;
        }

        tabEls[0].textContent = '関連';
        const vid = app.currentVideoId;
        if (!vid) return;
        document.getElementById('player-list').innerHTML = '読み込み中…';
        try {
            // YouTube本来のおすすめ(関連, Shorts除外)
            const res = await API.getRelated(vid);
            if (app.currentVideoId !== vid) return;
            app.relatedVideos = (res || []).filter(v => v.videoId !== vid);
            UI.renderVideoList(app.relatedVideos, 'player-list');
        } catch {
            document.getElementById('player-list').innerHTML = '<div class="state-msg">読み込めませんでした。時間をおいて再試行してください</div>';
        }
    },

    toggleAutoplay: () => {
        app.autoplay = !app.autoplay;
        localStorage.setItem('shimatube_autoplay', app.autoplay ? '1' : '0');
        UI.updateAutoplayBtn();
        toast(app.autoplay ? '自動再生 ON' : '自動再生 OFF');
    },

    loadComments: async () => {
        if (!app.currentVideoId) return;
        document.querySelectorAll('#player-view .tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#player-view .tab')[1].classList.add('active');
        document.getElementById('player-list').innerHTML = 'コメントを読み込み中…';
        try {
            const comments = await API.getComments(app.currentVideoId);
            const container = document.getElementById('player-list');
            container.innerHTML = '';
            if (comments.length === 0) {
                container.innerHTML = '<div class="state-msg">コメントはありません</div>';
                return;
            }
            comments.forEach(c => {
                const div = document.createElement('div');
                div.className = 'comment';
                div.innerHTML = `<div class="comment-author">${esc(c.author)}</div><div>${esc(c.text)}</div>`;
                container.appendChild(div);
            });
        } catch {
            document.getElementById('player-list').innerHTML = '<div class="state-msg">コメントを読み込めませんでした。時間をおいて再試行してください</div>';
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
        toast('URLをコピーしました');
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
            // メタデータ未ロードだとrequestPictureInPictureが弾かれるので待つ
            if (v.readyState < 1) {
                await new Promise((res) => {
                    const done = () => { v.removeEventListener('loadedmetadata', done); res(); };
                    v.addEventListener('loadedmetadata', done);
                    setTimeout(done, 3000);
                });
            }
            // standalone PWAでは pictureInPictureEnabled が false でもメソッドは使える事があるので、
            // フラグには依存せずメソッドの有無で判定して実行する
            if (typeof v.requestPictureInPicture === 'function' && !v.disablePictureInPicture) {
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
            toast(isSub ? '登録しました' : '登録を解除しました');
        }
        return isSub;
    }
});
