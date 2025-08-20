// Service Worker 改善 (#12): バージョン一元管理 + 柔軟な戦略
// SW 自身の更新検知: 登録時の sw.js?v=APP_VERSION のクエリから SW_VERSION を取得
// フォールバック（万一クエリ無の場合）は埋め込みの固定文字列
const EMBEDDED_VERSION = '1m-3';
const SW_VERSION = (() => {
  try { return new URL(self.location.href).searchParams.get('v') || EMBEDDED_VERSION; } catch(_) { return EMBEDDED_VERSION; }
})();
const CACHE_NAME = `kgs-quiz-cache-v${SW_VERSION}`;
// バージョン付き参照と素のパス双方をプリキャッシュ（HTML は network-first なのでオフライン用に最低限）
const PRECACHE_URLS = [
  '/',
  '/index.html',
  `/style.css?v=${SW_VERSION}`,
  `/script.js?v=${SW_VERSION}`,
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
      .then(async ()=>{
        // 新しい SW が有効化されたら全クライアントへ通知し、一度だけ自動リロードを促す
        try {
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          clients.forEach(c => c.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION }));
        } catch(_) {}
      })
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

  // version.js は常に network-first + no-store（確実に最新を取得）
  if (url.pathname.endsWith('/version.js')) {
    evt.respondWith((async () => {
      try {
        return await fetch(evt.request, { cache: 'no-store' });
      } catch (e) {
        const cached = await caches.match(evt.request);
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
    return;
  }

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
