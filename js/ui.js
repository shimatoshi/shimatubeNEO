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
                    <button class="${btnClass}" onclick="app.toggleSubUniversal('${esc(v.channelId)}', ${JSON.stringify(v.title || '')}, ${JSON.stringify(v.thumbnail || '')})">${btnText}</button>
                `;
                container.appendChild(div);
            } else {
                const div = document.createElement('div');
                div.className = 'video-item';
                if (app.currentPlaylist && app.currentVideoId === v.videoId) {
                    div.classList.add('now-playing');
                }
                const dur = UI.formatDuration(v.lengthSeconds);
                div.innerHTML = `
                    <div class="thumb" onclick="app.playVideo('${esc(v.videoId)}')">
                        <img src="${esc(v.thumbnail)}" loading="lazy">
                        <span class="duration">${dur}</span>
                    </div>
                    <div class="details">
                        <div class="v-title" onclick="app.playVideo('${esc(v.videoId)}')">${esc(v.title)}</div>
                        <div class="v-meta">
                            ${esc(v.author)} • ${UI.formatViews(v.viewCount)}
                            ${v.channelId ? `<span class="block-btn" onclick="app.blockChannel('${esc(v.channelId)}', ${JSON.stringify(v.author || '')})">Block</span>` : ''}
                        </div>
                    </div>
                `;
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
                <button class="c-sub-btn subscribed" onclick="app.toggleSubUniversal('${esc(c.channelId)}', ${JSON.stringify(c.title || '')}, ${JSON.stringify(c.thumbnail || '')})">Subbed</button>
            `;
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
        nameEl.innerHTML = `${esc(author)} <span class="block-btn" onclick="event.stopPropagation();app.blockChannel('${esc(meta.channelId)}', ${JSON.stringify(author)})">Block</span>`;

        document.getElementById('desc-content').textContent = meta.description || '';
        document.getElementById('c-icon').src = meta.thumbnail || `https://ui-avatars.com/api/?name=${encodeURIComponent(author)}`;

        UI.updateSubButtonInPlayer(meta.channelId);

        const videoEl = document.getElementById('main-video');
        const currentSrc = videoEl.getAttribute('data-vid');
        if (currentSrc !== videoId) {
            videoEl.setAttribute('data-vid', videoId);
            if (data.status === 'ready' && data.url) {
                videoEl.src = data.url;
                UI.updateDownloadButton(data.url, true);
            } else {
                videoEl.src = '';
                UI.updateDownloadButton(null, false);
                UI.startPolling(videoId);
            }
            videoEl.play().catch(() => {});
        } else {
            if (data.status === 'ready') UI.updateDownloadButton(data.url, true);
        }

        app.showRelated(meta.channelId);
    },

    updateDownloadButton: (url, isReady) => {
        const el = document.getElementById('dl-container');
        if (isReady && url) {
            el.innerHTML = `<a href="${url}?dl=1" class="dl-ready" download>💾 DL</a>`;
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

    startPolling: (videoId) => {
        if (window.pollInterval) clearInterval(window.pollInterval);
        window.pollInterval = setInterval(async () => {
            try {
                const data = await API.getVideo(videoId);
                if (data.status === 'ready') {
                    clearInterval(window.pollInterval);
                    const videoEl = document.getElementById('main-video');
                    if (!videoEl.src || videoEl.src === window.location.href) {
                        videoEl.src = data.url;
                    }
                    UI.updateDownloadButton(data.url, true);
                }
            } catch {
                clearInterval(window.pollInterval);
            }
        }, 3000);
    },

    formatDuration: (sec) => {
        if (!sec) return '0:00';
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        return `${m}:${s.toString().padStart(2, '0')}`;
    },
    formatViews: (num) => {
        if (!num) return '';
        if (num > 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num > 1000) return (num / 1000).toFixed(1) + 'K';
        return String(num);
    }
};
