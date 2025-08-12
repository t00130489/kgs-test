// Service Worker 改善 (#12): バージョン一元管理 + 柔軟な戦略
// version.js が self スコープにあれば利用。無ければ埋め込みのフォールバック。
const EMBEDDED_VERSION = '813-1t';
const APP_VERSION = self.APP_VERSION || EMBEDDED_VERSION;
const CACHE_NAME = `kgs-quiz-cache-v${APP_VERSION}`;
// バージョン付き参照と素のパス双方をプリキャッシュ（HTML は network-first で常に更新されるので最低限）
const PRECACHE_URLS = [
  '/',
  '/index.html',
  `/style.css?v=${APP_VERSION}`,
  `/script.js?v=${APP_VERSION}`,
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-k.png'
];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

// =============================
// Fetch Strategy
// - HTML(navigate): Network-first（オフライン時はキャッシュ）
// - 静的アセット（CSS/JS/画像等）: Stale-While-Revalidate
// =============================
self.addEventListener('fetch', evt => {
  if (evt.request.method !== 'GET') return;
  const url = new URL(evt.request.url);
  const isNavigate = evt.request.mode === 'navigate';
  const isAsset = /\.(?:css|js|png|jpg|jpeg|gif|webp|svg|ico)$/.test(url.pathname);

  if (isNavigate) {
    // Network-first for HTML
    evt.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const resp = await fetch(evt.request, { cache: 'no-store' });
        cache.put(evt.request, resp.clone());
        return resp;
      } catch (e) {
        const cached = await caches.match('/index.html');
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

  if (isAsset) {
    // SWR for static assets
    evt.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(evt.request);
      const fetchPromise = fetch(evt.request).then(resp => {
        cache.put(evt.request, resp.clone());
        return resp;
      }).catch(() => undefined);
      return cached || (await fetchPromise) || new Response('', { status: 204 });
    })());
    return;
  }

  // その他はデフォルト: キャッシュ優先→ネットワーク
  evt.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(evt.request);
    if (cached) return cached;
    try {
      const resp = await fetch(evt.request);
      cache.put(evt.request, resp.clone());
      return resp;
    } catch (e) {
      return new Response('', { status: 204 });
    }
  })());
});
