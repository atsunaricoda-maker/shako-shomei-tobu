/* 車庫証明かんたん作成（静岡県東部）— Service Worker
   オフライン動作のためアプリ一式をキャッシュ。更新時は CACHE のバージョンを上げる。 */
const CACHE = "shako-tobu-v51";
const ASSETS = [
  "./",
  "./index.html",
  "./qr.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})));
});

/* ページから「SKIP_WAITING」を受け取ったら待機中の新SWを即時有効化（ワンタップ更新用）。
   自動 skipWaiting はしない＝入力中に勝手に切り替わらないよう、適用はユーザー操作のときだけ。 */
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* キャッシュ優先・ネットワークフォールバック。オフライン時の最終手段は index.html。 */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // 地図の中継API（/api/*）は常にネットワーク直行・キャッシュしない
  if (new URL(e.request.url).pathname.startsWith("/api/")) return;
  e.respondWith(
    caches.match(e.request).then((hit) =>
      hit ||
      fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match("./index.html"))
    )
  );
});
