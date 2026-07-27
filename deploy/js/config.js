Object.assign(app, {
    // データ復旧: uid再生成で見えなくなった旧uidの購読/履歴をサーバー側で現uidへ統合
    recoverData: async () => {
        if (!confirm('サーバーに残っている旧IDの購読・履歴を現在のIDへ引き取ります。よい？')) return;
        try {
            const res = await fetch(B('/api/adopt'), { method: 'POST' });
            const data = await res.json();
            if (data.status) {
                app.userData = data.data;
                toast(`復旧完了: 購読${data.data.subscriptions.length}件 / 履歴${data.data.history.length}件`);
                app.refreshConfig();
                app.renderHome();
            } else {
                toast('復旧失敗');
            }
        } catch (e) { toast('復旧失敗: ' + e.message); }
    },

    forceUpdate: async () => {
        toast('Updating...');
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        }
        window.location.href = window.location.pathname + '?t=' + Date.now();
    },

    toggleConfig: () => {
        const modal = document.getElementById('config-modal');
        const isShow = modal.style.display === 'block';
        modal.style.display = isShow ? 'none' : 'block';
        if (!isShow) {
            app.refreshConfig();
            // 開いている間だけ Escape を受ける。✕以外に閉じ方が無いと、
            // 全画面オーバーレイが背後のタップを黙って吸い続ける
            app._configEsc = (e) => { if (e.key === 'Escape') app.toggleConfig(); };
            document.addEventListener('keydown', app._configEsc);
        } else if (app._configEsc) {
            document.removeEventListener('keydown', app._configEsc);
            app._configEsc = null;
        }
    },

    // 背景(モーダル自身)のクリックで閉じる。中身のクリックでは閉じない
    initConfigDismiss: () => {
        const modal = document.getElementById('config-modal');
        if (!modal) return;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) app.toggleConfig();
        });
    },

    refreshConfig: () => {
        if (!app.userData) return;
        app.renderTags('cat-list', app.userData.categories, app.removeCategory);
        app.renderTags('kw-list', app.userData.blocked_keywords, app.removeBlockKeyword);
        const bcList = document.getElementById('bc-list');
        bcList.innerHTML = '';
        app.userData.blocked_channels.forEach(c => {
            bcList.innerHTML += `<div class="tag"><span>${esc(c.name)}</span><span class="tag-del" onclick="app.unblockChannel('${esc(c.id)}')">✕</span></div>`;
        });
    },

    renderTags: (elId, list, removeFunc) => {
        const el = document.getElementById(elId);
        el.innerHTML = '';
        list.forEach(item => {
            // onclick属性にJSON.stringifyを埋めると " で属性が壊れるためJSで結線する
            const tag = document.createElement('div');
            tag.className = 'tag';
            const label = document.createElement('span');
            label.textContent = item;
            const del = document.createElement('span');
            del.className = 'tag-del';
            del.textContent = '✕';
            del.onclick = () => removeFunc(item);
            tag.append(label, del);
            el.appendChild(tag);
        });
    },

    updateServer: async (action, payload) => {
        await fetch(B('/'), { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action, payload }) });
        await app.loadUserData();
    },

    addCategory: async () => {
        const val = document.getElementById('cat-input').value;
        if (val && !app.userData.categories.includes(val)) {
            await app.updateServer('update_categories', [...app.userData.categories, val]);
            document.getElementById('cat-input').value = '';
            app.refreshConfig(); app.renderHome();
        }
    },

    removeCategory: async (val) => {
        await app.updateServer('update_categories', app.userData.categories.filter(c => c !== val));
        app.refreshConfig(); app.renderHome();
    },

    blockChannel: async (id, name) => {
        if (confirm(`Block channel "${name}"?`)) {
            await app.updateServer('block_channel', { id, name });
            toast('Blocked');
        }
    },

    unblockChannel: async (id) => {
        await app.updateServer('unblock_channel', { id });
        app.refreshConfig();
    },

    addBlockKeyword: async () => {
        const val = document.getElementById('kw-input').value;
        if (val) {
            await app.updateServer('block_keyword', val);
            document.getElementById('kw-input').value = '';
            app.refreshConfig();
        }
    },

    removeBlockKeyword: async (val) => {
        await app.updateServer('unblock_keyword', val);
        app.refreshConfig();
    }
});
