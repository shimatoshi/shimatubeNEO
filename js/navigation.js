Object.assign(app, {
    switchTab: (tabName, pushStack = true) => {
        if (pushStack && app.navStack[app.navStack.length - 1] !== tabName) {
            app.navStack.push(tabName);
        }
        app.updateBackBtn();
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

        if (tabName !== 'player' && app.currentVideoId) {
            UI.showMiniPlayer(app.currentVideoMeta ? app.currentVideoMeta.title : 'Playing');
        } else {
            UI.hideMiniPlayer();
        }

        if (tabName === 'home') {
            document.getElementById('view-home').classList.add('active');
            document.querySelectorAll('.nav-item')[0].classList.add('active');
        } else if (tabName === 'subs') {
            document.getElementById('view-subs').classList.add('active');
            document.querySelectorAll('.nav-item')[1].classList.add('active');
            UI.renderChannelList(Storage.getSubs(), 'subs-list');
        } else if (tabName === 'history') {
            document.getElementById('view-history').classList.add('active');
            document.querySelectorAll('.nav-item')[2].classList.add('active');
            UI.renderVideoList(Storage.getHistory(), 'history-list');
        } else if (tabName === 'player') {
            document.getElementById('view-player').classList.add('active');
        }
    },

    goBack: () => {
        if (app.navStack.length > 1) {
            app.navStack.pop();
            app.switchTab(app.navStack[app.navStack.length - 1], false);
        }
    },

    updateBackBtn: () => {
        document.getElementById('back-btn').style.display = app.navStack.length > 1 ? 'block' : 'none';
    },

    handleHomeClick: () => {
        if (app.navStack[app.navStack.length - 1] === 'home' && app.homeState !== 'feed') {
            app.currentFilter = '';
            app.renderHome();
            document.getElementById('search-input').value = '';
        } else {
            app.switchTab('home');
        }
    },

    setupInfiniteScroll: (loadMoreFn) => {
        app.destroyInfiniteScroll();
        app.hasMoreResults = true;
        app.isLoadingMore = false;
        const sentinel = document.getElementById('scroll-sentinel');
        if (!sentinel) return;
        app.scrollObserver = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !app.isLoadingMore && app.hasMoreResults) {
                loadMoreFn();
            }
        }, { rootMargin: '300px' });
        app.scrollObserver.observe(sentinel);
    },

    destroyInfiniteScroll: () => {
        if (app.scrollObserver) {
            app.scrollObserver.disconnect();
            app.scrollObserver = null;
        }
    },

    setFilter: (filter) => {
        if (app.currentFilter === filter) return;
        app.currentFilter = filter;
        if (app.homeState === 'search') app.search(1);
        else if (app.homeState === 'channel') app.openChannel(app.currentChannelId, 1);
    }
});
