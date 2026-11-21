// ballknowledge service worker: network first, so players always get the newest build, with the last copy kept for when they are offline.
const CACHE = "bk-v2";
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (/\/app\.[0-9a-f]{10}\.js$/.test(u.pathname)) {   // game code: the name changes with every build, so a cached copy is always right
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(), dir = u.pathname.replace(/[^/]*$/, ""); caches.open(CACHE).then((x) => x.put(e.request, c).then(() => x.keys()).then((ks) => ks.forEach((k) => { const p = new URL(k.url).pathname; if (p !== u.pathname && p.startsWith(dir) && /\/app\.[0-9a-f]{10}\.js$/.test(p)) x.delete(k); }))); } return r; })));   // and drop the previous build's copy
    return;
  }
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match("./"))));
});
