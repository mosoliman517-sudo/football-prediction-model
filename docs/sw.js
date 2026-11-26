// ballknowledge service worker: network first, so players always get the newest build, with the last copy kept for when they are offline.
const CACHE = "bk-v4";
const SHELL = ["./", "./football/", "./basketball/", "./chess/", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];   // installed app: the four pages work offline after the first visit
self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
  keepOpenPages();   // not awaited: page requests must not wait for it
});
// The first visit loads its code and data before this worker is in charge, so nothing would be saved until a second visit.
// Save the files of the pages that are open right now (they come from the browser's own cache, not a second download).
async function keepOpenPages() {
  const cache = await caches.open(CACHE), wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const names = (t) => t.match(/\b(?:app|data|old|events)\.[0-9a-f]{10}\.js/g) || [];
  for (const w of wins) {
    try {
      const page = new URL(w.url), dir = new URL(page.pathname.replace(/[^/]*$/, ""), page.origin), todo = names(await (await fetch(page.pathname)).text()), seen = new Set();
      while (todo.length) {
        const n = todo.shift(); if (seen.has(n)) continue; seen.add(n);
        const u = new URL(n, dir).href, r = (await cache.match(u)) || (await fetch(u)); if (r.status !== 200) continue;
        if (!(await cache.match(u))) await cache.put(u, r.clone());
        if (n.startsWith("data.")) todo.push(...names(await r.text()));   // the data file names the parts loaded later
      }
    } catch (e) { /* offline or storage full: the next visit saves them */ }
  }
}
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (/\/voice\/[^/]+\.mp3$/.test(u.pathname) || e.request.headers.has("range")) return;   // voice clips go straight to the network: thousands of files would pile up in the cache, and part-responses (206) cannot be stored
  if (/\/engine\/[^/]+\.(js|wasm)$/.test(u.pathname)) {   // the chess engine never changes under the same name (voice clips are left to the browser: Safari wants range requests for audio)
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; })));
    return;
  }
  const hm = /\/(app|data|old|events)\.[0-9a-f]{10}\.js$/.exec(u.pathname) || /\/(crests)\/[0-9a-f]{10}\.[a-z]+$/.exec(u.pathname);
  if (hm) {   // game code and game data: each name changes only when its content does, so a cached copy is always right
    const kind = hm[1] === "crests" ? /^$/ : new RegExp("/" + hm[1] + "\\.[0-9a-f]{10}\\.js$");   /* badges are kept (many files); code and data drop the previous copy */
    e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok) { const c = r.clone(), dir = u.pathname.replace(/[^/]*$/, ""); caches.open(CACHE).then((x) => x.put(e.request, c).then(() => x.keys()).then((ks) => ks.forEach((k) => { const p = new URL(k.url).pathname; if (p !== u.pathname && p.startsWith(dir) && kind.test(p)) x.delete(k); }))); } return r; })));   // and drop the previous copy of the same kind
    return;
  }
  e.respondWith(fetch(e.request).then((r) => { if (r.status === 200) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match("./"))));
});
