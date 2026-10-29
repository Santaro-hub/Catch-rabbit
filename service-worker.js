const CACHE_NAME = 'rabbit-chase-v1';
const APP_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './pwa.js',
  './manifest.webmanifest',
  './icon.svg',
  './privacy.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_ASSETS.map((asset) => new URL(asset, self.registration.scope))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('rabbit-chase-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            event.waitUntil(
              caches.open(CACHE_NAME)
                .then((cache) => cache.put(event.request, response.clone()))
            );
          }
          return response;
        })
        .catch(async () => {
          const cachedPage = await caches.match(event.request);
          return cachedPage || caches.match(new URL('./index.html', self.registration.scope));
        })
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          event.waitUntil(
            caches.open(CACHE_NAME)
              .then((cache) => cache.put(event.request, response.clone()))
          );
        }
        return response;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        throw new Error(`No cached response is available for ${event.request.url}`);
      })
  );
});
