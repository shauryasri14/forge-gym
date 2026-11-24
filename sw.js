// Offline cache for the whole app. Bump VERSION whenever any file changes so phones pick it up.
const VERSION = 'forge-v7';
const GIFS = 'forge-gifs'; // exercise GIFs from jsDelivr, kept across versions
const GIF_MAX = 400;
const FILES = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/consistency.js',
  'data/exercises.json', 'data/legacy.json', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION && k !== GIFS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cache first (the app is fully static); fall back to the network, then to the app shell.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.endsWith('.gif')) return e.respondWith(gif(e.request));
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('index.html')))
  );
});

// GIFs: cache first; keep the most recent GIF_MAX so storage stays bounded.
async function gif(req) {
  const c = await caches.open(GIFS);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await c.put(req, res.clone());
    const keys = await c.keys();
    for (const k of keys.slice(0, Math.max(0, keys.length - GIF_MAX))) await c.delete(k);
  }
  return res;
}
