const CACHE_NAME = 'kgs-quiz-cache-v24l';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  // 必要に応じて他のリソースも追加
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => {
      // activate時にクライアントを強制リロード
      return self.clients.claim().then(() => {
        return self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.navigate(client.url);
          });
        });
      });
    })
  );
});

self.addEventListener('fetch', event => {
  // HTML, CSS, JS, manifestは必ずネットワーク優先で取得
  if (event.request.mode === 'navigate' || event.request.destination === 'document' || event.request.url.endsWith('.html') || event.request.url.endsWith('.css') || event.request.url.endsWith('.js') || event.request.url.endsWith('manifest.json')) {
    event.respondWith(
      fetch(event.request).then(response => {
        // 最新をキャッシュにも保存
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request);
      })
    );
  }
});
