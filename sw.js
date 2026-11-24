// Offline cache for the whole app. Bump VERSION whenever any file changes so phones pick it up.
const VERSION = 'forge-v3';
const FILES = [
  './', 'index.html', 'css/app.css', 'js/app.js', 'js/store.js', 'js/anim.js', 'js/consistency.js', 'js/body3d.js', 'vendor/three.module.min.js',
  'data/exercises.json', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Cache first (the app is fully static); fall back to the network, then to the app shell.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).catch(() => caches.match('index.html')))
  );
});
