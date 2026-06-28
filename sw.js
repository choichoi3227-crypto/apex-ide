const CACHE = 'apex-ide-v2';
const SHELL = ['/', '/index.html', '/app.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(()=>{})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.hostname === 'open.bigmodel.cn' || url.hostname.includes('cdnjs') || url.hostname.includes('monaco')) {
    e.respondWith(caches.match(e.request).then(cached => {
      const fresh = fetch(e.request).then(r => { if(r.ok){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));} return r; });
      return cached || fresh;
    }));
    return;
  }
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
