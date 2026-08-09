function esc(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = String(str);
    return d.innerHTML;
}

const UI = {
    renderVideoList: (videos, containerId, append = false) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!append) container.innerHTML = '';
        if (!videos || videos.length === 0) {
            if (!append) container.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No items</div>';
            return;
        }
        videos.forEach(v => {
            if (v.type === 'channel') {
                const div = document.createElement('div');
                div.className = 'channel-item';
                div.onclick = (e) => {
                    if (!e.target.classList.contains('c-sub-btn')) app.openChannel(v.channelId);
                };
                const isSub = Storage.isSubscribed(v.channelId);
                const btnText = isSub ? 'Subbed' : 'Subscribe';
                const btnClass = isSub ? 'c-sub-btn subscribed' : 'c-sub-btn';
                div.innerHTML = `
                    <img src="${esc(v.thumbnail)}" class="c-thumb" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(v.title)}'">
                    <div class="c-name">${esc(v.title)}</div>
                    <button class="${btnClass}">${btnText}</button>
                `;
                // 注: onclick属性にJSON.stringifyを埋めると " で属性が壊れるためJSで結線する
                div.querySelector('.c-sub-btn').onclick = async (e) => {
                    const btn = e.target;
                    const sub = await app.toggleSubUniversal(v.channelId, v.title || '', v.thumbnail || '');
                    btn.textContent = sub ? 'Subbed' : 'Subscribe';
                    btn.classList.toggle('subscribed', sub);
                };
                container.appendChild(div);
            } else if (v.type === 'playlist') {
                const div = document.createElement('div');
                div.className = 'video-item playlist-item';
                div.onclick = () => app.openPlaylist(v.playlistId);
                div.innerHTML = `
                    <div class="thumb">
                        <img src="${esc(v.thumbnail)}" loading="lazy" onerror="this.style.display='none'">
                        <span class="duration">LIST</span>
                    </div>
                    <div class="details">
                        <div class="v-title">${esc(v.title)}</div>
                        <div class="v-meta">Playlist</div>
                    </div>
                `;
                container.appendChild(div);
            } else {
                const div = document.createElement('div');
                div.className = 'video-item';
                if (app.currentPlaylist && app.currentVideoId === v.videoId) {
                    div.classList.add('now-playing');
                }
                // 履歴は lengthSeconds を持たない(0固定で保存される)ため、
                // 視聴時に記録した実尺で補う。どちらも無ければバッジ自体を出さない
                const prog = UI._getProgressEntry(v.videoId);
                const totalSec = v.lengthSeconds || (prog && prog.d) || 0;
                const dur = v.is_live
                    ? '<span class="live-badge">LIVE</span>'
                    : (totalSec ? `<span class="duration">${UI.formatDuration(totalSec)}</span>` : '');
                // 途中まで見た動画は続きの位置を示す(復元が効いていることを一覧で見せる)
                const watched = (prog && prog.p > 5 && totalSec)
                    ? `<div class="watch-bar"><div class="watch-bar-fill" style="width:${Math.min(100, prog.p / totalSec * 100).toFixed(1)}%"></div></div>`
                    : '';
                div.innerHTML = `
                    <div class="thumb" onclick="app.playVideo('${esc(v.videoId)}')">
                        <img src="${esc(v.thumbnail)}" loading="lazy">
                        ${dur}
                        ${watched}
                    </div>
                    <div class="details">
                        <div class="v-title" onclick="app.playVideo('${esc(v.videoId)}')">${esc(v.title)}</div>
                        <div class="v-meta">
                            ${esc(v.author)} • ${UI.formatViews(v.viewCount)}
                            ${v.channelId ? '<span class="block-btn">Block</span>' : ''}
                        </div>
                    </div>
                    <a class="dl-btn" href="${B('/stream/' + esc(v.videoId) + '?dl=1')}" download title="動画(mp4)で保存"
                       onclick="event.stopPropagation(); toast('💾 動画(mp4)で保存を開始しました', 4000)">💾</a>
                    <a class="dl-btn dl-audio" href="${B('/stream/' + esc(v.videoId) + '?dl=1&format=audio')}" download title="音声(楽曲)で保存"
                       onclick="event.stopPropagation(); toast('🎵 音声(m4a)で保存を開始しました', 4000)">🎵</a>
                `;
                const blockBtn = div.querySelector('.block-btn');
                if (blockBtn) blockBtn.onclick = (e) => {
                    e.stopPropagation();
                    app.blockChannel(v.channelId, v.author || '');
                };
                UI.addLongPress(div, v.videoId);
                container.appendChild(div);
            }
        });
    },

    renderChannelList: (channels, containerId) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (!channels || channels.length === 0) {
            container.innerHTML = '<div style="padding:20px; color:#aaa;">No subscriptions yet.</div>';
            return;
        }
        channels.forEach(c => {
            const div = document.createElement('div');
            div.className = 'channel-item';
            div.onclick = (e) => {
                if (!e.target.classList.contains('c-sub-btn')) app.openChannel(c.channelId);
            };
            div.innerHTML = `
                <img src="${esc(c.thumbnail)}" class="c-thumb" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(c.title)}'">
                <div class="c-name">${esc(c.title)}</div>
                <button class="c-sub-btn subscribed">Subbed</button>
            `;
            div.querySelector('.c-sub-btn').onclick = () =>
                app.toggleSubUniversal(c.channelId, c.title || '', c.thumbnail || '');
            container.appendChild(div);
        });
    },

    setupPlayer: (data, videoId) => {
        const meta = data.metadata || {};
        document.getElementById('v-title').textContent = meta.title || 'Unknown';
        document.getElementById('v-views').textContent = `${UI.formatViews(meta.viewCount)} views`;
        document.getElementById('v-date').textContent = meta.uploadDate || '';

        const nameEl = document.getElementById('c-name');
        const author = meta.author || 'Unknown';
        nameEl.innerHTML = `${esc(author)} <span class="block-btn">Block</span>`;
        nameEl.querySelector('.block-btn').onclick = (e) => {
            e.stopPropagation();
            app.blockChannel(meta.channelId, author);
        };

        document.getElementById('desc-content').textContent = meta.description || '';
        document.getElementById('c-icon').src = meta.thumbnail || `https://ui-avatars.com/api/?name=${encodeURIComponent(author)}`;

        UI.updateSubButtonInPlayer(meta.channelId);

        const videoEl = document.getElementById('main-video');
        const currentSrc = videoEl.getAttribute('data-vid');

        // LIVEバッジ表示
        const liveEl = document.getElementById('live-badge');
        if (liveEl) liveEl.style.display = data.is_live ? 'inline-block' : 'none';

        if (currentSrc !== videoId) {
            videoEl.setAttribute('data-vid', videoId);
            UI._destroyHls();
            const hlsHeights = data.hls || [];
            if (data.is_live && data.hls_url) {
                // 生放送: HLSを直接再生
                UI._playHls(videoEl, data.hls_url, true);
                UI.updateDownloadButton(null, false);
                UI._hideQuality();
            } else if (hlsHeights.length) {
                // 公式画質: muxed HLS を hls.js で再生（720p等）+ 画質セレクタ
                const q = UI._preferredQuality(hlsHeights);
                UI._playHls(videoEl, B(`/hls/${videoId}?q=${q}`), false,
                    data.url ? B(data.url) : null);
                UI._buildQuality(videoId, hlsHeights, q);
                UI.updateDownloadButton(data.url ? B(data.url) : null, !!data.url);
            } else if (data.status === 'ready' && data.url) {
                // フォールバック: progressive(360p) 直
                videoEl.src = B(data.url);
                UI.updateDownloadButton(B(data.url), true);
                UI._hideQuality();
            } else {
                videoEl.src = '';
                UI.updateDownloadButton(null, false);
                UI._hideQuality();
            }
            videoEl.play().catch(() => {});
            // 続きから再生: 保存位置へシーク
            if (!data.is_live) UI._resumeSeek(videoEl, videoId);
        } else {
            if (data.status === 'ready' && !data.is_live && data.url) UI.updateDownloadButton(B(data.url), true);
        }

        app.showRelated(meta.channelId);
    },

    updateDownloadButton: (url, isReady) => {
        const el = document.getElementById('dl-container');
        if (isReady && url) {
            // 動画(progressive 360p) と 音声(m4a) の2種
            // B()が ?uid= を付けるため、既にクエリがある場合は & で繋ぐ
            const sep = url.includes('?') ? '&' : '?';
            el.innerHTML =
                `<a href="${url}${sep}dl=1" class="dl-ready" download>💾動画</a>`
                + `<a href="${url}${sep}format=audio&dl=1" class="dl-ready" download style="margin-left:8px;">🎵音声</a>`;
        } else {
            el.innerHTML = `<span class="dl-wait">Wait...</span>`;
        }
    },

    updateSubButtonInPlayer: (channelId) => {
        const isSub = Storage.isSubscribed(channelId);
        const icon = document.getElementById('sub-icon');
        const text = document.getElementById('sub-text');
        if (isSub) {
            icon.textContent = '★'; text.textContent = 'Subbed'; icon.style.color = 'yellow';
        } else {
            icon.textContent = '☆'; text.textContent = 'Sub'; icon.style.color = '#fff';
        }
    },

    showMiniPlayer: (title) => {
        document.getElementById('mini-player').style.display = 'flex';
        document.getElementById('mini-info').textContent = title || 'Playing...';
    },
    hideMiniPlayer: () => {
        document.getElementById('mini-player').style.display = 'none';
    },

    formatDuration: (sec) => {
        if (!sec) return '0:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
    startDownload: (videoId) => {
        // JS合成の<a>.click()はWebViewでDownloadListenerに届かないことがあるため、
        // 実ナビゲーション(location.assign)で確実に発火させる。
        // attachment応答なので遷移はキャンセルされページは保持される。
        toast('💾 動画(mp4)で保存を開始しました', 4000);
        window.location.assign(B(`/stream/${videoId}?dl=1`));
    },

    addLongPress: (el, videoId) => {
        let timer = null;
        const start = () => {
            timer = setTimeout(() => {
                timer = null;
                UI.startDownload(videoId);
            }, 600);
        };
        const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
        el.addEventListener('touchstart', start, { passive: true });
        el.addEventListener('touchend', cancel);
        el.addEventListener('touchmove', cancel);
        el.addEventListener('mousedown', start);
        el.addEventListener('mouseup', cancel);
        el.addEventListener('mouseleave', cancel);
    },

    formatViews: (num) => {
        if (!num) return '';
        if (num > 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num > 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }
};

// --- HLS(公式画質) 再生まわり ---
Object.assign(UI, {
    _hls: null,
    _destroyHls() {
        if (UI._hls) { try { UI._hls.destroy(); } catch (e) {} UI._hls = null; }
    },
    // タップ直後の即時フィードバック: 前の動画を止め、サムネをposterに出して「読み込み中」表示
    showPlayerLoading(videoId) {
        const v = document.getElementById('main-video');
        if (v) {
            try { v.pause(); } catch (e) {}
            UI._destroyHls();
            v.removeAttribute('src');
            try { v.load(); } catch (e) {}
            v.setAttribute('data-vid', '');   // setupPlayer に「新規」と認識させる
            v.poster = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
        }
        const t = document.getElementById('v-title'); if (t) t.textContent = '読み込み中…';
        const vw = document.getElementById('v-views'); if (vw) vw.textContent = '';
        const dt = document.getElementById('v-date'); if (dt) dt.textContent = '';
        UI._hideQuality();
        const dl = document.getElementById('dl-container');
        if (dl) dl.innerHTML = '<span class="dl-wait">Wait</span>';
    },
    _preferredQuality(heights) {
        const saved = parseInt(localStorage.getItem('shimatube_quality') || '720', 10);
        const le = heights.filter(h => h <= saved);
        return le.length ? Math.max(...le) : Math.min(...heights);
    },
    _playHls(videoEl, url, isLive, fallbackUrl = null) {
        UI._destroyHls();
        if (window.Hls && Hls.isSupported()) {
            const hls = new Hls({ enableWorker: true, maxBufferLength: isLive ? 10 : 30 });
            UI._hls = hls;
            hls.loadSource(url);
            hls.attachMedia(videoEl);
            hls.on(Hls.Events.ERROR, (evt, d) => {
                if (!d || !d.fatal) return;
                if (!isLive && fallbackUrl) {
                    UI._destroyHls();
                    // HLS側（特に端末上のCloudflare tunnel）が落ちていても、
                    // APIが返したprogressive streamで再生を継続する。
                    videoEl.src = fallbackUrl;
                    videoEl.play().catch(() => {});
                } else if (d.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    hls.startLoad();
                } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    hls.recoverMediaError();
                } else {
                    UI._destroyHls();
                }
            });
        } else {
            // Safari等ネイティブHLS / 最後の手段
            videoEl.src = url;
        }
    },
    _hideQuality() {
        const c = document.getElementById('quality-container');
        if (c) c.style.display = 'none';
    },
    _buildQuality(vid, heights, current) {
        const c = document.getElementById('quality-container');
        if (!c) return;
        c.style.display = '';
        const opts = heights.slice().sort((a, b) => b - a)
            .map(h => `<option value="${h}" ${h === current ? 'selected' : ''}>${h}p</option>`).join('');
        c.innerHTML = `<select id="quality-sel" onchange="UI.switchQuality('${vid}', this.value)" `
            + `style="background:#222;color:#fff;border:1px solid #555;border-radius:4px;padding:3px 5px;font-size:12px;">${opts}</select>`;
    },
    switchQuality(vid, height) {
        height = parseInt(height, 10);
        localStorage.setItem('shimatube_quality', String(height));
        const v = document.getElementById('main-video');
        if (!v || v.getAttribute('data-vid') !== vid) return;
        const t = v.currentTime, wasPlaying = !v.paused;
        UI._playHls(v, B(`/hls/${vid}?q=${height}`), false);
        const onMeta = () => {
            v.removeEventListener('loadedmetadata', onMeta);
            try { v.currentTime = t; } catch (e) {}
            if (wasPlaying) v.play().catch(() => {});
        };
        v.addEventListener('loadedmetadata', onMeta);
    },

    // --- 続きから再生(進捗) ---
    _progressMap() {
        try { return JSON.parse(localStorage.getItem('shimatube_progress') || '{}'); }
        catch (e) { return {}; }
    },
    // 保存形式は {p: 位置秒, d: 実尺秒}。旧形式(数値のみ)も読めるようにしておく
    _getProgressEntry(vid) {
        if (!vid) return null;
        const e = UI._progressMap()[vid];
        if (e === undefined) return null;
        return (typeof e === 'number') ? { p: e, d: 0 } : e;
    },
    _getProgress(vid) {
        const e = UI._getProgressEntry(vid);
        return e ? (e.p || 0) : 0;
    },
    saveProgress(vid, sec, dur) {
        if (!vid || !sec || sec < 5) return;
        const m = UI._progressMap();
        const prev = UI._getProgressEntry(vid);
        m[vid] = {
            p: Math.floor(sec),
            d: Math.floor(dur && isFinite(dur) ? dur : (prev && prev.d) || 0),
        };
        const keys = Object.keys(m);
        if (keys.length > 200) delete m[keys[0]];
        localStorage.setItem('shimatube_progress', JSON.stringify(m));
    },
    clearProgress(vid) {
        const m = UI._progressMap();
        if (m[vid] !== undefined) { delete m[vid]; localStorage.setItem('shimatube_progress', JSON.stringify(m)); }
    },
    _resumeSeek(videoEl, vid) {
        const pos = UI._getProgress(vid);
        if (pos <= 5) return;
        const seekOnce = () => {
            videoEl.removeEventListener('loadedmetadata', seekOnce);
            const dur = videoEl.duration;
            if (dur && pos < dur - 15) {
                try { videoEl.currentTime = pos; } catch (e) {}
                toast('続きから再生');
            }
        };
        videoEl.addEventListener('loadedmetadata', seekOnce);
    },

    // --- 自動再生トグル表示 ---
    updateAutoplayBtn() {
        const ic = document.getElementById('autoplay-icon');
        const tx = document.getElementById('autoplay-text');
        if (ic) ic.style.opacity = app.autoplay ? '1' : '0.35';
        if (tx) tx.textContent = app.autoplay ? '自動ON' : '自動OFF';
    }
});
