const CACHE = 'fit-v7';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'css/fonts.css', 'css/theme.css',
  'fonts/FrankRuhlLibre-hebrew-0.woff2', 'fonts/FrankRuhlLibre-latin-1.woff2', 'fonts/Heebo-hebrew-2.woff2', 'fonts/Heebo-latin-3.woff2',
  'js/app.js', 'js/db.js', 'js/util.js', 'js/chart.js',
  'js/screens/home.js', 'js/screens/session.js', 'js/screens/history.js',
  'js/screens/measurements.js', 'js/screens/progress.js', 'js/screens/settings.js', 'js/screens/summary.js', 'js/stats.js', 'js/rest.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) => fetch(new Request(f, { cache: 'reload' })).then((r) => { if (!r.ok) throw new Error(f); return c.put(f, r); })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Network-first (bypassing HTTP cache) so updates show up immediately; cache is the offline fallback.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
