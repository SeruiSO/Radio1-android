const CACHE_NAME = 'radio-pwa-v2.0.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-256.png',
  '/icon-512.png',
  '/stations.json',
  '/ping.txt',
  '/src/css/base.css',
  '/src/css/layout.css',
  '/src/css/components.css',
  '/src/css/player.css',
  '/src/css/responsive.css',
  '/src/js/app.js',
  '/src/js/audio.js',
  '/src/js/stations.js',
  '/src/js/favorites.js',
  '/src/js/history.js',
  '/src/js/storage.js',
  '/src/js/ui.js',
  '/src/js/media-session.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
    .then(() => self.clients.claim())
  );
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // API requests - Network First
  if (url.hostname === 'de1.api.radio-browser.info') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => {
          return new Response(JSON.stringify({ error: 'Network error' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Audio streams - Network Only, never cache
  if (url.pathname.match(/\.(mp3|aac|m3u8|pls)$/) || 
      request.headers.get('accept')?.includes('audio') ||
      url.hostname.includes('stream') || 
      url.hostname.includes('radio') ||
      url.hostname.includes('icecast') ||
      url.hostname.includes('shoutcast')) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .catch(() => new Response(null, { status: 503 }))
    );
    return;
  }

  // Static assets - Cache First, fallback to network
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          // Return cached response, but fetch fresh in background
          event.waitUntil(
            fetch(request)
              .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                  const clone = networkResponse.clone();
                  caches.open(CACHE_NAME).then((cache) => {
                    cache.put(request, clone);
                  });
                }
              })
              .catch(() => {})
          );
          return cachedResponse;
        }
        
        // Not in cache - fetch from network
        return fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone);
              });
            }
            return networkResponse;
          })
          .catch(() => {
            // Return fallback for HTML
            if (request.headers.get('accept')?.includes('text/html')) {
              return caches.match('/index.html');
            }
            return new Response(null, { status: 404 });
          });
      })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

async function syncFavorites() {
  try {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();
    for (const request of requests) {
      if (request.url.includes('/sync/favorites')) {
        const response = await fetch(request);
        if (response.ok) {
          await cache.delete(request);
        }
      }
    }
  } catch (error) {
    console.warn('Sync failed:', error);
  }
}