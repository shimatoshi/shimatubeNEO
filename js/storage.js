const Storage = {
    getHistory: () => {
        const raw = localStorage.getItem('shimatube_history');
        return raw ? JSON.parse(raw) : [];
    },
    addToHistory: (video) => {
        let list = Storage.getHistory();
        list = list.filter(v => v.videoId !== video.videoId);
        list.unshift(video);
        if (list.length > 50) list.pop();
        localStorage.setItem('shimatube_history', JSON.stringify(list));
    },
    getSubs: () => {
        const raw = localStorage.getItem('shimatube_subs');
        return raw ? JSON.parse(raw) : [];
    },
    toggleSub: (channel) => {
        let list = Storage.getSubs();
        const exists = list.find(c => c.channelId === channel.channelId);
        if (exists) {
            list = list.filter(c => c.channelId !== channel.channelId);
        } else {
            list.push(channel);
        }
        localStorage.setItem('shimatube_subs', JSON.stringify(list));
        return !exists;
    },
    isSubscribed: (channelId) => {
        return Storage.getSubs().some(c => c.channelId === channelId);
    }
};
