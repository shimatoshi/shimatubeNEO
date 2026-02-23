// js/storage.js
// 複雑なDB操作を廃止し、localStorageのみを使用する軽量版

const Storage = {
    // 履歴の取得
    getHistory: () => {
        const raw = localStorage.getItem('shimatube_history');
        return raw ? JSON.parse(raw) : [];
    },

    // 履歴に追加 (重複排除して先頭に追加)
    addToHistory: (video) => {
        let list = Storage.getHistory();
        list = list.filter(v => v.videoId !== video.videoId); // 重複削除
        list.unshift(video); // 先頭に追加
        if (list.length > 50) list.pop(); // 50件制限
        localStorage.setItem('shimatube_history', JSON.stringify(list));
    },

    // チャンネル登録の取得
    getSubs: () => {
        const raw = localStorage.getItem('shimatube_subs');
        return raw ? JSON.parse(raw) : [];
    },

    // チャンネル登録の切り替え
    toggleSub: (channel) => {
        let list = Storage.getSubs();
        const exists = list.find(c => c.channelId === channel.channelId);
        if (exists) {
            list = list.filter(c => c.channelId !== channel.channelId);
        } else {
            list.push(channel);
        }
        localStorage.setItem('shimatube_subs', JSON.stringify(list));
        return !exists; // 登録されたらtrue
    },
    
    // 登録状態チェック
    isSubscribed: (channelId) => {
        const list = Storage.getSubs();
        return list.some(c => c.channelId === channelId);
    }
};

