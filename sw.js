// Service Worker無効化: キャッシュを全削除して自己登録解除
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(k => caches.delete(k)))
        ).then(() => self.registration.unregister())
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(fetch(event.request));
});
