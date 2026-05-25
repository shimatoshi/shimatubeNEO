Object.assign(app, {
    renderHome: async () => {
        app.destroyInfiniteScroll();
        app.currentPlaylist = null;
        const container = document.getElementById('home-list');
        container.innerHTML = '';
        app.homeState = 'feed';

        if (!app.userData || !app.userData.categories) {
            container.innerHTML = '<div style="padding:20px;">Loading settings...</div>';
            return;
        }

        // 購読フィードセクション（チャンネルごとの遅延ロード）
        const subs = Storage.getSubs();
        if (subs.length > 0) {
            const feedHdr = document.createElement('div');
            feedHdr.className = 'cat-header';
            feedHdr.innerHTML = '<span>Subscriptions</span><span class="cat-toggle" id="toggle-feed">▼</span>';
            feedHdr.onclick = () => {
                const c = document.getElementById('feed-content');
                const icon = document.getElementById('toggle-feed');
                c.classList.toggle('hidden');
                icon.classList.toggle('closed');
            };
            container.appendChild(feedHdr);

            const feedContent = document.createElement('div');
            feedContent.id = 'feed-content';
            feedContent.className = 'cat-content';
            container.appendChild(feedContent);

            subs.forEach(sub => {
                const row = document.createElement('div');
                row.className = 'feed-channel-row';
                row.dataset.loaded = '0';
                row.innerHTML = `
                    <div class="feed-ch-header" onclick="app.openChannel('${esc(sub.channelId)}')">
                        <img src="${esc(sub.thumbnail)}" class="c-thumb" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(sub.title)}'">
                        <span>${esc(sub.title)}</span>
                    </div>
                    <div class="feed-ch-videos" id="fch-${esc(sub.channelId)}">
                        <div style="padding:8px;color:#666;font-size:12px;">Loading...</div>
                    </div>
                `;
                feedContent.appendChild(row);

                // IntersectionObserverで画面内に入ったときだけ読み込む
                const obs = new IntersectionObserver(([entry]) => {
                    if (entry.isIntersecting && row.dataset.loaded === '0') {
                        row.dataset.loaded = '1';
                        obs.disconnect();
                        app.loadFeedChannel(sub.channelId);
                    }
                }, { rootMargin: '300px' });
                obs.observe(row);
            });
        }

        // カテゴリヘッダーを先に全部描画（折りたたみ状態も設定）
        app.userData.categories.forEach((cat, index) => {
            const listId = `list-${index}`;
            const header = document.createElement('div');
            header.className = 'cat-header';
            header.innerHTML = `<span>${esc(cat)}</span><span class="cat-toggle" id="toggle-${index}">▼</span>`;
            header.onclick = () => app.toggleCategory(index);
            container.appendChild(header);

            const listDiv = document.createElement('div');
            listDiv.id = listId;
            listDiv.className = 'cat-content';
            listDiv.innerHTML = '<div style="padding:10px;font-size:12px;color:#666;">Loading...</div>';
            container.appendChild(listDiv);

            if (index > 0) app.toggleCategory(index);
        });

        // カテゴリを1件ずつ逐次ロード（並列ではなく順番に）
        for (const [index, cat] of app.userData.categories.entries()) {
            const listId = `list-${index}`;
            try {
                const res = await API.search(cat);
                UI.renderVideoList(res, listId);
            } catch {
                const el = document.getElementById(listId);
                if (el) el.innerHTML = '<div style="padding:10px;color:#666;">Error</div>';
            }
        }
    },

    loadFeedChannel: async (channelId) => {
        const container = document.getElementById(`fch-${channelId}`);
        if (!container) return;
        try {
            const data = await API.getFeedChannel(channelId);
            const videos = [...(data.unwatched || []), ...(data.watched || [])];
            if (videos.length === 0) {
                container.innerHTML = '<div style="padding:8px;color:#666;font-size:12px;">No videos</div>';
                return;
            }
            container.innerHTML = '';
            videos.forEach(v => {
                const card = document.createElement('div');
                card.className = 'feed-ch-card';
                card.onclick = () => app.playVideo(v.videoId);
                const dur = v.is_live
                    ? '<span class="live-badge">LIVE</span>'
                    : `<span class="duration">${UI.formatDuration(v.lengthSeconds)}</span>`;
                card.innerHTML = `
                    <div class="thumb" style="width:140px;height:79px;margin-bottom:4px;">
                        <img src="${esc(v.thumbnail)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">
                        ${dur}
                    </div>
                    <div class="feed-ch-title">${esc(v.title)}</div>
                `;
                container.appendChild(card);
            });
        } catch {
            const el = document.getElementById(`fch-${channelId}`);
            if (el) el.innerHTML = '<div style="padding:8px;color:#666;font-size:12px;">Error</div>';
        }
    },

    toggleCategory: (index) => {
        const content = document.getElementById(`list-${index}`);
        const icon = document.getElementById(`toggle-${index}`);
        if (!content || !icon) return;
        content.classList.toggle('hidden');
        icon.classList.toggle('closed');
    },

    extractPlaylistId: (input) => {
        const m = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
        if (m) return m[1];
        if (/^PL[a-zA-Z0-9_-]{10,}$/.test(input.trim())) return input.trim();
        return null;
    },

    search: async (page = 1, append = false) => {
        const query = document.getElementById('search-input').value || app.currentSearchQuery;
        if (!query) return;

        const plId = app.extractPlaylistId(query);
        if (plId) { app.openPlaylist(plId); return; }

        if (app.navStack[app.navStack.length - 1] !== 'home') app.switchTab('home');

        app.homeState = 'search';
        app.currentSearchPage = page;
        app.currentSearchQuery = query;
        app.currentPlaylist = null;

        const container = document.getElementById('home-list');
        if (!append) {
            container.innerHTML = `
                <div class="cat-header">Search: ${esc(query)}</div>
                <div class="filter-bar">
                    <button class="filter-btn ${app.currentFilter === '' ? 'active' : ''}" onclick="app.setFilter('')">All</button>
                    <button class="filter-btn ${app.currentFilter === 'live' ? 'active' : ''}" onclick="app.setFilter('live')">Live</button>
                </div>
                <div id="search-res-list"></div>
                <div id="scroll-sentinel" class="scroll-sentinel"><div class="loader"></div></div>
            `;
        }

        app.isLoadingMore = true;
        try {
            const results = await API.search(query, page, app.currentFilter);
            if (results.length < 20) {
                app.hasMoreResults = false;
                const s = document.getElementById('scroll-sentinel');
                if (s) s.style.display = 'none';
            }
            UI.renderVideoList(results, 'search-res-list', append);
            if (!append) {
                app.setupInfiniteScroll(() => app.search(app.currentSearchPage + 1, true));
                window.scrollTo(0, 0);
            }
        } catch (e) {
            if (!append) toast('Search error');
        }
        app.isLoadingMore = false;
    }
});
