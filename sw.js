/* ===================================================
   APEX IDE — Service Worker
   Offline-first caching strategy
   =================================================== */

const CACHE_NAME = 'apex-ide-v1.0.0';
const RUNTIME_CACHE = 'apex-runtime-v1';

// Core shell assets — cached on install
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
];

// CDN assets to cache on first use
const CDN_PATTERNS = [
  'cdnjs.cloudflare.com',
];

// ===== INSTALL =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_ASSETS).catch(err => {
        console.warn('[SW] Shell cache partial failure:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ===== ACTIVATE =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ===== FETCH =====
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API calls
  if (request.method !== 'GET') return;
  if (url.hostname === 'api.anthropic.com') return;

  // CDN assets: cache-first
  if (CDN_PATTERNS.some(p => url.hostname.includes(p))) {
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
    return;
  }

  // Shell assets: stale-while-revalidate
  if (SHELL_ASSETS.includes(url.pathname) || url.pathname === '/') {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(networkFirst(request));
});

// ===== STRATEGIES =====
async function cacheFirst(request, cacheName = CACHE_NAME) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ===== BACKGROUND SYNC =====
self.addEventListener('sync', event => {
  if (event.tag === 'apex-save') {
    event.waitUntil(syncPendingSaves());
  }
});

async function syncPendingSaves() {
  // Future: sync local saves to cloud storage
  console.log('[SW] Background sync: apex-save');
}

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Apex IDE', {
      body: data.body || 'Notification from Apex IDE',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: 'apex-notification',
    })
  );
});

// ===== MESSAGE HANDLING =====
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CACHE_CLEAR') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
  if (event.data?.type === 'VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_NAME });
  }
});
