// Dayclock service worker: the app opens offline after the first visit.
// Stale-while-revalidate: serves instantly from cache, refreshes it in the background.
// It never touches your shift data (that lives in localStorage / IndexedDB).
const CACHE = "dayclock-shell-v3";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // also precache the hashed JS/CSS the page needs, so the very first offline open works
      try {
        const html = await (await fetch("./index.html", { cache: "reload" })).text();
        const assets = [...html.matchAll(/(?:src|href)="(\.?\/?[^"\/:]+\.(?:js|css))"/g)].map((m) => (m[1].startsWith(".") ? m[1] : "./" + m[1]));
        await cache.addAll(assets);
      } catch (e) {
        /* runtime caching below will fill in */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: true });
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone()); // clone synchronously, before the body is used
          return res;
        })
        .catch(() => null);
      if (hit) {
        event.waitUntil(refresh);
        return hit;
      }
      const res = await refresh;
      if (res) return res;
      if (req.mode === "navigate") return (await cache.match("./index.html")) || Response.error();
      return Response.error();
    })(),
  );
});
