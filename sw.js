/* Offline-Start für den Reiseplaner (docs/OFFLINE.md §4.1).
   Vollständige Versionsstände: Bei der Installation wird index.html frisch geladen; alle Skripte und Stylesheets,
   die es einbindet (vom Build mit ?v=<Hash>), plus die Dateien in EXTRA kommen in einen eigenen Speicher
   reiseplaner-<Stand>. Fehlt eine Datei, scheitert die Installation und der vorige vollständige Stand bleibt aktiv.
   Netzantworten überschreiben diesen Stand nie; der nächste Stand kommt als eigene Installation.
   STAND setzt scripts/build.mjs (Hash über alle ausgelieferten Dateien), damit sich sw.js bei jeder neuen Version
   ändert und der Browser neu installiert. Ohne Build (Entwicklung) bleibt 'dev'; dann gilt überall Netz zuerst.
   Reisedaten liegen weiterhin nur im Browser-Speicher (rp-trips in localStorage, Zweitkopie in IndexedDB über
   rpstore.js, Fotos in photostore.js) und werden hier weder gelesen noch zwischengespeichert. */
const STAND = 'dev';
const CACHE = 'reiseplaner-' + STAND;
const RUNTIME = 'reiseplaner-laufzeit-' + STAND;
const EXTRA = ['./manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './catalog-data.js', './catalog/index.js'];
const NAV_TIMEOUT = 4000;
/* Lokale Skripte und Stylesheets aus index.html, genau wie eingebunden (mit ?v=, falls vorhanden). */
function assetsFrom(html) {
  const out = [];
  for (const m of String(html).matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"#:]+?\.(?:js|css)(?:\?[^"#]*)?)"/g)) {
    const f = './' + m[1].replace(/^\.\//, '');
    if (!out.includes(f)) out.push(f);
  }
  return out;
}
const stripQuery = href => { const u = new URL(href); u.search = ''; return u.href; };

if (typeof self !== 'undefined' && self.addEventListener) {
  self.addEventListener('install', e => {
    e.waitUntil((async () => {
      const page = await fetch('./index.html', { cache: 'reload' });
      if (!page.ok) throw new Error('index.html ' + page.status);
      const html = await page.clone().text();
      const files = assetsFrom(html).concat(EXTRA);
      const responses = await Promise.all(files.map(async f => {
        const r = await fetch(f, { cache: 'reload' });
        if (!r.ok) throw new Error(f + ' ' + r.status);
        return [f, r];
      }));
      const c = await caches.open(CACHE);
      /* Erst alles geladen, dann gespeichert: ein abgebrochener Download hinterlässt keinen halben Stand. */
      await Promise.all(responses.map(([f, r]) => c.put(f, r)));
      await c.put('./index.html', page);
      await self.skipWaiting();
    })());
  });
  self.addEventListener('activate', e => {
    e.waitUntil(caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('reiseplaner-') && k !== CACHE && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
  });
  /* Aus dem eigenen Stand: genaue Adresse; ohne Netz zur Not dieselbe Datei ohne ?v= (Laufzeit, Entwicklung). */
  const fromCache = async (req, loose) => {
    const own = await caches.open(CACHE);
    const hit = await own.match(req.url) || await (await caches.open(RUNTIME)).match(req.url);
    if (hit || !loose) return hit;
    return own.match(req.url, { ignoreSearch: true });
  };
  const offlinePage = async () => (await caches.open(CACHE)).match('./index.html') || caches.match('./index.html');
  self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    if (req.mode === 'navigate') {
      /* Seite: Netz mit Zeitlimit, sonst der gespeicherte vollständige Stand. Ein langsames Netz hält den Start nicht auf. */
      e.respondWith((async () => {
        const net = fetch(req);
        net.catch(() => {});
        const timer = new Promise(res => setTimeout(() => res(null), NAV_TIMEOUT));
        try {
          const res = await Promise.race([net, timer]);
          if (res) return res;
        } catch (err) { /* kein Netz */ }
        const page = await offlinePage();
        return page || net;
      })().catch(() => offlinePage().then(p => p || Response.error())));
      return;
    }
    const versioned = new URL(req.url).searchParams.has('v');
    e.respondWith((async () => {
      /* Datei mit ?v=<Hash> ist unveränderlich: zuerst aus dem Speicher. */
      if (versioned) { const hit = await fromCache(req, false); if (hit) return hit; }
      try {
        const res = await fetch(req);
        /* Nicht vorab gespeicherte Dateien (Katalogkacheln u. a.) für später merken, getrennt vom Versionsstand. */
        if (res.ok && !versioned) { const copy = res.clone(); caches.open(RUNTIME).then(c => c.put(stripQuery(req.url), copy)); }
        return res;
      } catch (err) {
        const hit = await fromCache(req, true);
        return hit || Response.error();
      }
    })());
  });
}
