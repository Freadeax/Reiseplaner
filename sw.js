/* Offline-Start für den Reiseplaner.
   Netz zuerst: Ist eine Verbindung da, kommt immer der aktuelle Stand. Nur ohne Netz wird die
   zuletzt geladene Kopie aus dem Cache gezeigt. Reisedaten liegen weiterhin nur im Browser-Speicher
   (rp-trips) und werden hier weder gelesen noch zwischengespeichert. */
const CACHE = 'reiseplaner-v8';
const FILES = ['./', './index.html', './config.js', './cloud.js', './catalog.js', './v3logic.js', './v3forms.js', './v3editor.js', './catalog-data.js', './catalog/index.js', './vendor/supabase-js-2.117.2.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('reiseplaner-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
    .then(hit => hit || Response.error())));
});
