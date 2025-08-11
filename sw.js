// Service Worker 改善 (#12): バージョン一元管理 + 柔軟な戦略
// version.js が self スコープにあれば利用。無ければ埋め込みのフォールバック。
const EMBEDDED_VERSION = '812-1';
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
// Fetch Strategy: Network First
// できるだけ最新リソースを取得し、失敗時のみキャッシュへフォールバック。
// すべての GET リクエストで統一（HTML / JS / CSS / 画像 等）。
// 注意: ネットワーク遅延が増えるためパフォーマンス重視の場面では調整推奨。
// =============================
self.addEventListener('fetch', evt => {
  if (evt.request.method !== 'GET') return;
  evt.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    // ネットワーク取得を1秒でタイムアウト
    const fetchPromise = fetch(new Request(evt.request, {cache: 'no-store'})).then(resp => {
      // 成功時はキャッシュも更新
      cache.put(evt.request, resp.clone());
      return resp;
    });
    const timeout = new Promise(resolve => setTimeout(async () => {
      const cached = await caches.match(evt.request);
      if (cached) resolve(cached);
    }, 1000));
    try {
      // 1秒以内にネットワーク応答があればそれを返す。なければキャッシュ即返し。
      return await Promise.race([fetchPromise, timeout]) || await fetchPromise;
    } catch (err) {
      // 両方失敗時
      const cached = await caches.match(evt.request);
      if (cached) return cached;
      if (evt.request.mode === 'navigate') {
        return caches.match('/index.html');
      }
      throw err;
    }
  })());
});
