const CACHE_VERSION = 'toeic15-v3';

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/srs.js',
  './js/speech.js',
  './js/wakelock.js',
  './js/data.js',
  './js/picker.js',
  './js/screens/home.js',
  './js/screens/session.js',
  './js/screens/result.js',
  './js/screens/settings.js',
  './js/screens/listening.js',
  './js/screens/listenthrough.js',
  './js/screens/records.js',
  './js/screens/vocab.js',
  './data/words.json',
  './data/part2.json',
  './data/part5.json',
  './data/dictation.json',
  './data/part34.json',
  './icons/icon-192.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));

      // cache-first: serve cached immediately if present, still refresh cache in background.
      return cached || networkFetch;
    })
  );
});
