/* Offline-Start für den Reiseplaner.
   Netz zuerst: Ist eine Verbindung da, kommt immer der aktuelle Stand. Nur ohne Netz wird die
   zuletzt geladene Kopie aus dem Cache gezeigt. Reisedaten liegen weiterhin nur im Browser-Speicher
   (rp-trips in localStorage, Zweitkopie in IndexedDB über rpstore.js) und werden hier weder gelesen noch
   zwischengespeichert. */
const CACHE = 'reiseplaner-v16';
const FILES = ['./', './index.html', './config.js', './cloud.js', './catalog.js', './v3logic.js', './v3forms.js', './v3editor.js', './v3split.js', './rpstore.js', './v3journal.js', './v4logic.js', './bookgen.js', './bookedit.js', './catalog-data.js', './app.css', ...['basis', 'reise', 'v3', 'aufteilung', 'kosten', 'unterwegs', 'zahlungsbuch', 'speicher', 'routing', 'ansichten', 'blaetter', 'ereignisse', 'konto', 'entdecken', 'tagesplan', 'tagebuch', 'navigation', 'reisebuch', 'start'].map(n => './app/' + n + '.js'), './catalog/index.js', './vendor/supabase-js-2.117.2.js', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('reiseplaner-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* Ein Eintrag je Datei: Der Build hängt ?v=<Hash> an (P0.6). Gespeichert und gesucht wird ohne Abfrageteil, damit
   jede Online-Antwort die vorige Kopie ersetzt und offline nie eine ältere Installationskopie neben neuem index.html landet. */
const cacheKey = req => { const u = new URL(req.url); u.search = ''; return u.href; };
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(cacheKey(req), copy)); }
    return res;
  }).catch(() => caches.match(cacheKey(req))
    .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined))
    .then(hit => hit || Response.error())));
});
