/* GHOST · CONTEXT — service worker (app shell offline) */
const VER = 'ghost-v4';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icons/icon.svg', 'kb-prebuilt.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).catch(()=>{}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // never cache the Ollama API or cross-origin CDN libs
  if (url.port === '11434' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(VER).then(c => c.put(req, clone)).catch(()=>{});
      }
      return res;
    } catch {
      return cached || new Response('offline', { status: 503 });
    }
  })());
});
