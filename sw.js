/* =====================================================
   APEX IDE v3 — Service Worker
   Offline-first · CDN cache · Shell cache
   ===================================================== */

const SHELL_CACHE = 'apex-shell-v3';
const CDN_CACHE   = 'apex-cdn-v3';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
];

const CDN_HOSTS = [
  'cdnjs.cloudflare.com',
];

// ── INSTALL ──────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then(c => c.addAll(SHELL_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== CDN_CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never intercept Ollama API calls
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return;

  // CDN assets — cache-first (Monaco, xterm, etc.)
  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    e.respondWith(cdnCacheFirst(req));
    return;
  }

  // Shell assets — stale-while-revalidate
  if (SHELL_ASSETS.includes(url.pathname) || url.pathname === '/') {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Everything else — network-first
  e.respondWith(networkFirst(req));
});

// ── STRATEGIES ───────────────────────────────────────
async function cdnCacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(CDN_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response('CDN resource unavailable', { status: 503 });
  }
}

async function staleWhileRevalidate(req) {
  const cached = await caches.match(req);
  const fresh = fetch(req).then(res => {
    if (res.ok) caches.open(SHELL_CACHE).then(c => c.put(req, res.clone()));
    return res;
  }).catch(() => null);
  return cached || await fresh || new Response('Offline', { status: 503 });
}

async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const c = await caches.open(SHELL_CACHE);
      c.put(req, res.clone());
    }
    return res;
  } catch {
    return await caches.match(req) || new Response('Offline', { status: 503 });
  }
}

// ── MESSAGES ─────────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k))));
  }
  if (e.data?.type === 'VERSION') {
    e.ports[0]?.postMessage({ shell: SHELL_CACHE, cdn: CDN_CACHE });
  }
});
