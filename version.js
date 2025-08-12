// version.js
// 単一箇所でアプリバージョンを管理。ブラウザ & Service Worker 共通利用。
// バージョンを更新する際はこの値のみを書き換える。
(function(global){
  const APP_VERSION = '812-4t';
  global.APP_VERSION = APP_VERSION;
  // コンソール出力は本番では不要
})(typeof self !== 'undefined' ? self : window);

// ESM 環境用エクスポート（script type="module" での import を想定）
export const APP_VERSION = typeof window !== 'undefined' ? window.APP_VERSION : (typeof self!=='undefined'?self.APP_VERSION:undefined);
