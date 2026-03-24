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
            listDiv.style.minHeight = '50px';
            listDiv.innerHTML = '<div style="padding:10px;font-size:12px;color:#666;">Loading...</div>';
            container.appendChild(listDiv);

            if (index > 0) app.toggleCategory(index);

            API.search(cat).then(res => {
                UI.renderVideoList(res, listId);
            }).catch(() => {
                const el = document.getElementById(listId);
                if (el) el.innerHTML = '<div style="padding:10px;">Error</div>';
            });
        });
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
