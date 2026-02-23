const CACHE_NAME = 'shimatube-app-v1';
const VIDEO_CACHE_NAME = 'shimatube-videos-v1';

// アプリの基本ファイルをキャッシュ（オフライン起動用）
const APP_ASSETS = [
    '/',
    '/index.html',
    '/app.js',
    '/manifest.json',
    '/icon.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(APP_ASSETS);
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. 動画ファイルのストリーミング/ダウンロード要求
    if (url.pathname.startsWith('/downloads/')) {
        event.respondWith(
            caches.open(VIDEO_CACHE_NAME).then((cache) => {
                return cache.match(event.request).then((cachedResponse) => {
                    // キャッシュにあればそれを返す（完全オフライン再生）
                    if (cachedResponse) return cachedResponse;
                    // なければサーバーから取りに行く
                    return fetch(event.request);
                });
            })
        );
        return;
    }

    // 2. その他のAPIやアプリ本体
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
