// ============================================
// SERVICE WORKER - ULTRA MODERN 2025
// Enhanced caching strategy with Stale-While-Revalidate
// ============================================

const CACHE_NAME = 'radio-cache-v112';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/stations.json',
  '/manifest.json',
  '/ping.txt'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // Skip waiting to activate immediately
      return self.skipWaiting();
    })
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients
      return self.clients.claim();
    })
  );
  
  // Notify clients about cache update
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({ type: 'CACHE_UPDATED', cacheVersion: CACHE_NAME });
    });
  });
});

// Fetch event - intelligent caching strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Handle API requests differently (network first)
  if (url.hostname.includes('api.radio-browser.info')) {
    event.respondWith(
      fetch(request)
        .then(response => response)
        .catch(() => {
          return new Response(JSON.stringify({ error: 'Network error' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }
  
  // Stale-While-Revalidate for stations.json
  if (request.url.endsWith('stations.json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request, { 
            cache: 'no-store',
            signal: new AbortController().signal 
          }).then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          }).catch(() => {
            // If network fails, return cached response or fallback
            return cachedResponse || new Response(JSON.stringify({}), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          });
          
          // Return cached response if available, otherwise wait for network
          return cachedResponse || fetchPromise;
        });
      })
    );
    return;
  }
  
  // Cache-first strategy for static assets with network fallback
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Return cached response, but update in background
        const fetchPromise = fetch(request).then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, networkResponse.clone());
          });
          return networkResponse;
        }).catch(() => {
          // Network failed, keep using cached version
          return cachedResponse;
        });
        
        return cachedResponse;
      }
      
      // Not in cache, try network
      return fetch(request).then((networkResponse) => {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, networkResponse.clone());
        });
        return networkResponse;
      }).catch(() => {
        // Network failed and not in cache - return fallback
        return caches.match('/index.html');
      });
    })
  );
});

// ===== Network Status Monitoring =====
let wasOnline = navigator.onLine;
let checkInterval = null;

function startNetworkCheck() {
  if (!checkInterval) {
    checkInterval = setInterval(() => {
      fetch('/ping.txt', { method: 'HEAD', cache: 'no-store' })
        .then(() => {
          if (!wasOnline) {
            wasOnline = true;
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({ type: 'NETWORK_STATUS', online: true });
              });
            });
            stopNetworkCheck();
          }
        })
        .catch(() => {
          if (wasOnline) {
            wasOnline = false;
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({ type: 'NETWORK_STATUS', online: false });
              });
            });
          }
        });
    }, 2000);
  }
}

function stopNetworkCheck() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}

self.addEventListener('online', () => {
  if (!wasOnline) {
    wasOnline = true;
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'NETWORK_STATUS', online: true });
      });
    });
    stopNetworkCheck();
  }
});

self.addEventListener('offline', () => {
  if (wasOnline) {
    wasOnline = false;
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'NETWORK_STATUS', online: false });
      });
    });
    startNetworkCheck();
  }
});

// Start initial check if already offline
if (!navigator.onLine && wasOnline) {
  wasOnline = false;
  startNetworkCheck();
}