const Storage = {
    getHistory: () => {
        return (app.userData && app.userData.history) ? app.userData.history : [];
    },
    addToHistory: async (video) => {
        try {
            await fetch('/api/history', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(video)
            });
            if (app.userData) {
                app.userData.history = app.userData.history.filter(v => v.videoId !== video.videoId);
                app.userData.history.unshift(video);
                if (app.userData.history.length > 50) app.userData.history.pop();
            }
        } catch (e) { console.error(e); }
    },
    getSubs: () => {
        return (app.userData && app.userData.subscriptions) ? app.userData.subscriptions : [];
    },
    toggleSub: async (channel) => {
        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(channel)
            });
            const data = await res.json();
            if (data.subscribed) {
                app.userData.subscriptions.push(channel);
            } else {
                app.userData.subscriptions = app.userData.subscriptions.filter(
                    c => c.channelId !== channel.channelId);
            }
            return data.subscribed;
        } catch (e) { console.error(e); return false; }
    },
    isSubscribed: (channelId) => {
        return Storage.getSubs().some(c => c.channelId === channelId);
    }
};
