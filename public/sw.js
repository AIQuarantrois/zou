/* ZOU : service worker (généré par scripts/pack-app.mjs depuis scripts/sw.src.js : ne pas modifier public/sw.js à la main).
   Toute l'application est mise en cache dès l'installation ; elle s'ouvre hors ligne. Les appels /api ne sont jamais mis en cache. */
const VERSION = "zou-72e4d73118";
const PRECACHE = [
  "/app.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/register-sw.js",
  "/assets/app.f90a9be218.css",
  "/assets/app.bffa036f29.js",
  "/assets/theme.62c8878b49.js",
  "/assets/fonts/bricolage-latin-ext.woff2",
  "/assets/fonts/bricolage-latin.woff2",
  "/assets/fonts/inter-4-latin-ext.woff2",
  "/assets/fonts/inter-4-latin.woff2",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("zou-") && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  // Pages : réseau d'abord. Seule l'application (« / ») remplace la copie locale, jamais une page d'erreur.
  // Sans réseau : la copie de l'application, sinon la page « Hors ligne ».
  if (req.mode === "navigate") {
    const isApp = url.pathname === "/" || url.pathname === "/app.html";
    e.respondWith(
      fetch(req).then((r) => {
        if (isApp && r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put("/app.html", copy)); }
        return r;
      }).catch(() => caches.open(VERSION).then((c) => (isApp ? c.match("/app.html") : Promise.resolve(undefined)).then((hit) => hit || c.match("/offline.html"))))
    );
    return;
  }
  // Fichiers versionnés (assets, icônes) et fichiers de l'application : cache d'abord.
  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/") || PRECACHE.includes(url.pathname)) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((r) => {
        if (r.ok && (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/"))) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return r;
      }))
    );
  }
});
