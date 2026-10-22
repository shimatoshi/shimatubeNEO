// PC(マウス・キーボード)向けの操作補助。タッチ端末の挙動は変えない。
(() => {
    const typing = (t) => t && t.closest && t.closest('input, textarea, select, [contenteditable]');
    const playerActive = () => document.getElementById('view-player').classList.contains('active');
    const configOpen = () => document.getElementById('config-modal').style.display === 'block';

    // 横スクロール領域: ホイールの縦回転を横移動に変換し、ドラッグでも動かせるようにする
    const HSCROLL = '.feed-ch-videos, .action-bar';
    document.addEventListener('wheel', (e) => {
        const el = e.target.closest && e.target.closest(HSCROLL);
        if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        const max = el.scrollWidth - el.clientWidth;
        const next = Math.max(0, Math.min(max, el.scrollLeft + e.deltaY));
        if (next === el.scrollLeft) return;   // 端に達したら縦スクロールへ譲る
        el.scrollLeft = next;
        e.preventDefault();
    }, { passive: false });

    let drag = null, dragged = false;
    document.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        const el = e.target.closest && e.target.closest(HSCROLL);
        if (!el || typing(e.target)) return;
        drag = { el, x: e.clientX, left: el.scrollLeft };
        dragged = false;
    });
    document.addEventListener('mousemove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 5) { dragged = true; drag.el.classList.add('dragging'); }
        if (dragged) drag.el.scrollLeft = drag.left - dx;
    });
    document.addEventListener('mouseup', () => {
        if (drag) drag.el.classList.remove('dragging');
        drag = null;
    });
    // ドラッグ後に指を離した位置の要素が反応(再生など)しないようclickを1回捨てる
    document.addEventListener('click', (e) => {
        if (dragged) { dragged = false; e.stopPropagation(); e.preventDefault(); }
    }, true);

    // キーボードショートカット
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing || typing(e.target)) return;
        if (configOpen()) return;   // 設定中は Esc のみ config.js 側が処理
        const v = document.getElementById('main-video');
        const k = e.key;
        if (k === '/') { e.preventDefault(); document.getElementById('search-input').focus(); return; }
        if (k === 'Escape' || k === 'Backspace') {
            const back = document.getElementById('back-btn');
            if (back && back.style.display === 'block') { e.preventDefault(); app.goBack(); }
            return;
        }
        if (!playerActive() || !v) return;
        // 動画自体にフォーカスがある時はブラウザ標準操作に任せる(二重実行防止)
        if (e.target === v && (k === ' ' || k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown')) return;
        // ボタン等にフォーカス中のSpaceはそのボタンの操作を優先
        if (k === ' ' && e.target.closest && e.target.closest('button, a, [role="button"]')) return;
        const seek = (s) => { v.currentTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + s)); };
        if (k === ' ' || k === 'k') { e.preventDefault(); v.paused ? v.play() : v.pause(); }
        else if (k === 'ArrowLeft') { e.preventDefault(); seek(-5); }
        else if (k === 'ArrowRight') { e.preventDefault(); seek(5); }
        else if (k === 'j') seek(-10);
        else if (k === 'l') seek(10);
        else if (k === 'ArrowUp') { e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); }
        else if (k === 'ArrowDown') { e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); }
        else if (k === 'm') v.muted = !v.muted;
        else if (k === 'f') {
            if (document.fullscreenElement) document.exitFullscreen();
            else if (v.requestFullscreen) v.requestFullscreen();
        }
    });
})();
