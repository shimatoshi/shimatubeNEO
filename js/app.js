function toast(msg, duration = 2000) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), duration);
}

const app = {
    currentVideoId: null,
    currentChannelId: null,
    currentVideoMeta: null,
    navStack: [],
    userData: null,
    homeState: 'feed',
    currentSearchPage: 1,
    currentSearchQuery: '',
    currentChannelPage: 1,
    currentFilter: '',
    isLoadingMore: false,
    hasMoreResults: true,
    scrollObserver: null,
    currentPlaylist: null,
    playlistIndex: -1,

    loadUserData: async () => {
        try {
            const res = await fetch('/api/user_data');
            app.userData = await res.json();
        } catch (e) { console.error(e); }
    }
};
