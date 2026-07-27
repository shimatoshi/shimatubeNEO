// ネイティブ(sniffer-browser)がDL開始直後に呼ぶコールバック。
// 対象PWA以外(SnifferDLブリッジ無し)では単に何も起きない。
window.__snifferDLDone = (downloadId) => {
    if (app._pendingDLResolve) {
        const resolve = app._pendingDLResolve;
        app._pendingDLResolve = null;
        resolve(downloadId);
    }
};

// resumeDownload()の結果を非同期で受け取る(videoIdごとに1件のresolverを保持)
app._pendingResumeResolvers = {};
window.__snifferResumeDone = (videoId, ok) => {
    const resolve = app._pendingResumeResolvers[videoId];
    if (resolve) {
        delete app._pendingResumeResolvers[videoId];
        resolve(ok);
    }
};

const AUTODL_MB_PER_MIN = 7;  // 720p想定の概算ビットレート
const AUTODL_FAILED = 16;     // DownloadManager.STATUS_FAILED

Object.assign(app, {
    // 起動のたびに: 1) 失敗した自動DLの再試行 → 2) 容量が要れば古い順(非キープ)を実削除 →
    // 3) 購読チャンネルの未DL新着を自動DL、を行う（設定でONの時のみ）
    runAutoDL: async () => {
        if (!app.userData || !app.userData.autodl || !app.userData.autodl.enabled) return;
        try {
            await app.retryFailedAutoDL();

            const res = await fetch(B('/api/autodl/pending'));
            const data = await res.json();
            const videos = data.videos || [];
            if (!videos.length) return;

            const neededMb = videos.reduce((s, v) => s + app.estimateMb(v.lengthSeconds), 0);
            const remainingMb = data.remaining_mb ?? 0;
            if (neededMb > remainingMb) {
                await app.evictForSpace(neededMb - remainingMb);
            }

            let done = 0;
            for (const v of videos) {
                const downloadId = await app.triggerAutoDownload(v);
                await fetch(B('/api/autodl/complete'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        videoId: v.videoId, title: v.title,
                        lengthSeconds: v.lengthSeconds, downloadId
                    })
                });
                done++;
                await new Promise(r => setTimeout(r, 800));
            }
            if (done) {
                toast(`自動DL: ${done}件`);
                await app.loadUserData();
                app.refreshAutodlUI();
            }
        } catch (e) { console.error('autodl error', e); }
    },

    estimateMb: (lengthSeconds) => Math.max(5, Math.round((lengthSeconds || 0) / 60 * AUTODL_MB_PER_MIN)),

    // ネイティブブリッジ(SnifferDL)経由でDownloadManagerのエントリと実ファイルを消し、
    // quotaを空ける。ブリッジが無い(未更新の古いsniffer-browser)場合は何もしない
    // （新規DLは残quota分だけに自然と制限される）
    evictForSpace: async (needMb) => {
        if (typeof SnifferDL === 'undefined' || !SnifferDL.removeDownload) return;
        try {
            const res = await fetch(B(`/api/autodl/evict_candidates?need_mb=${needMb}`));
            const data = await res.json();
            for (const c of (data.candidates || [])) {
                if (!c.download_id) continue;
                let removed = false;
                try { removed = SnifferDL.removeDownload(c.download_id); } catch (e) { removed = false; }
                if (removed) {
                    await fetch(B('/api/autodl/evicted'), {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ videoId: c.video_id })
                    });
                }
            }
        } catch (e) { console.error('evict error', e); }
    },

    // 失敗(STATUS_FAILED)した自動DLを検知し、まず「続きから再開」を試す。
    // (DownloadManagerはFAILED後の公式resume APIが無いため、既存の部分ファイルへ
    //  自前でHTTP Range取得して追記するSnifferDL.resumeDownloadを使う。
    //  ブリッジが古い/失敗した場合のみ最初からやり直すフォールバック。)
    // 1回のセッションで最大3件まで
    retryFailedAutoDL: async () => {
        if (typeof SnifferDL === 'undefined' || !SnifferDL.getDownloadStatus) return;
        try {
            const res = await fetch(B('/api/autodl/list'));
            const data = await res.json();
            const items = data.items || [];
            const failed = items.filter(it => {
                if (!it.download_id) return false;
                try { return SnifferDL.getDownloadStatus(it.download_id) === AUTODL_FAILED; }
                catch (e) { return false; }
            }).slice(0, 3);

            let resumed = 0, restarted = 0;
            for (const it of failed) {
                let ok = false;
                if (SnifferDL.resumeDownload) {
                    ok = await app.resumeDownload(it.download_id, it.video_id);
                }
                if (ok) {
                    resumed++;
                    // 同じファイルに追記できたのでdownload_id/サイズ概算はそのまま。
                    // (DownloadManager上の表示は古いFAILEDのまま残るが実ファイルは完成している)
                    continue;
                }
                const downloadId = await app.triggerAutoDownload({ videoId: it.video_id, title: it.title });
                await fetch(B('/api/autodl/retry_id'), {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ videoId: it.video_id, downloadId })
                });
                restarted++;
                await new Promise(r => setTimeout(r, 800));
            }
            if (resumed) toast(`自動DL再開(続きから): ${resumed}件`);
            if (restarted) toast(`自動DL再試行(最初から): ${restarted}件`);
        } catch (e) { console.error('retry error', e); }
    },

    // ネイティブのSnifferDL.resumeDownloadを呼び、__snifferResumeDoneで結果を待つ(最大2分)
    resumeDownload: (downloadId, videoId) => {
        return new Promise((resolve) => {
            app._pendingResumeResolvers[videoId] = resolve;
            try {
                SnifferDL.resumeDownload(downloadId, videoId);
            } catch (e) {
                delete app._pendingResumeResolvers[videoId];
                resolve(false);
                return;
            }
            setTimeout(() => {
                if (app._pendingResumeResolvers[videoId] === resolve) {
                    delete app._pendingResumeResolvers[videoId];
                    resolve(false);
                }
            }, 120000);
        });
    },

    // 長押しDLと同じ location.assign 方式で起動し、ネイティブ側からの
    // __snifferDLDone コールバックで実際のDownloadManager idを受け取る（最大6秒待つ）
    triggerAutoDownload: (video) => {
        return new Promise((resolve) => {
            app._pendingDLResolve = resolve;
            window.location.assign(B(`/stream/${video.videoId}?dl=1`));
            setTimeout(() => {
                if (app._pendingDLResolve === resolve) {
                    app._pendingDLResolve = null;
                    resolve(null);
                }
            }, 6000);
        });
    },

    toggleAutodl: async (checked) => {
        await app.updateAutodlSettings({ enabled: checked, quota_mb: app.userData.autodl.quota_mb });
        if (checked) app.runAutoDL();
    },

    setAutodlQuota: async (mb) => {
        mb = Math.max(100, parseInt(mb) || 1000);
        await app.updateAutodlSettings({ enabled: app.userData.autodl.enabled, quota_mb: mb });
    },

    updateAutodlSettings: async (settings) => {
        try {
            const res = await fetch(B('/api/autodl/settings'), {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(settings)
            });
            const data = await res.json();
            if (data.status) {
                app.userData.autodl = data.autodl;
                app.refreshAutodlUI();
            }
        } catch (e) { console.error(e); }
    },

    refreshAutodlUI: () => {
        if (!app.userData || !app.userData.autodl) return;
        const { enabled, quota_mb, used_mb } = app.userData.autodl;
        const chk = document.getElementById('autodl-enabled');
        const quota = document.getElementById('autodl-quota');
        const usage = document.getElementById('autodl-usage');
        if (chk) chk.checked = enabled;
        if (quota) quota.value = quota_mb;
        if (usage) usage.textContent = `使用量(概算): ${used_mb} / ${quota_mb} MB`;
        app.loadAutodlList();
    },

    // キープ/リリース管理リストの描画
    loadAutodlList: async () => {
        const listEl = document.getElementById('autodl-list');
        if (!listEl) return;
        try {
            const res = await fetch(B('/api/autodl/list'));
            const data = await res.json();
            const items = data.items || [];
            if (!items.length) {
                listEl.innerHTML = '<div style="color:#666;font-size:12px;padding:4px 0;">自動DL済みはまだありません</div>';
                return;
            }
            listEl.innerHTML = '';
            items.forEach(it => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #333;font-size:12px;';
                const label = document.createElement('span');
                label.style.cssText = 'flex:1;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
                label.textContent = `${it.title || it.video_id} (${it.mb}MB)`;
                const btn = document.createElement('button');
                btn.className = 'btn';
                btn.style.cssText = 'padding:4px 8px;font-size:11px;flex-shrink:0;';
                btn.textContent = it.pinned ? '🔒キープ中' : '🔓リリース対象';
                btn.onclick = () => app.toggleAutodlPin(it.video_id, !it.pinned);
                row.append(label, btn);
                listEl.appendChild(row);
            });
        } catch (e) { console.error(e); }
    },

    toggleAutodlPin: async (videoId, pinned) => {
        try {
            await fetch(B('/api/autodl/pin'), {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ videoId, pinned })
            });
            app.loadAutodlList();
        } catch (e) { console.error(e); }
    }
});
