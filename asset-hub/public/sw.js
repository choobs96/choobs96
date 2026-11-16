// Offline shell: static files cache-first, API network-only (money data is never cached by the worker).
const CACHE = 'asset-hub-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'api.js', 'manifest.webmanifest', 'icons/icon.svg',
  'shared/money.js', 'shared/portfolio.js', 'shared/cashflow.js', 'shared/rules.js', 'shared/importers.js', 'shared/state.js', 'shared/demo-data.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Stale-while-revalidate for the app shell.
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
