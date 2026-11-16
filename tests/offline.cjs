/* OFFLINE O1 (docs/OFFLINE.md §4.1): Service Worker mit vollständigen Versionsständen, in Node mit nachgebildeten
   fetch/caches geprüft. Kein Browser-Test (der steht in tests/browser.cjs, Offline-Start). */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const ORIGIN = 'https://x.test/Reiseplaner/';
const abs = u => new URL(typeof u === 'string' ? u : u.url, ORIGIN).href;
const strip = h => { const u = new URL(h); u.search = ''; return u.href; };

function makeEnv(stand, server) {
  const store = new Map(); /* Name → Map(href → Response) */
  const listeners = {};
  const net = { online: true, slow: 0, log: [] };
  const caches = {
    async open(n) { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n);
      return { async put(k, r) { m.set(abs(k), r.clone()); }, async match(k, o) { const h = abs(k); if (m.has(h)) return m.get(h).clone(); if (o && o.ignoreSearch) for (const [kk, v] of m) if (strip(kk) === strip(h)) return v.clone(); return undefined; } }; },
    async keys() { return [...store.keys()]; },
    async delete(n) { return store.delete(n); },
    async match(k) { for (const m of store.values()) if (m.has(abs(k))) return m.get(abs(k)).clone(); return undefined; }
  };
  const fetch = async (u, o) => {
    const h = abs(u); net.log.push([strip(h).slice(ORIGIN.length), o && o.cache]);
    if (!net.online) throw new TypeError('offline');
    if (net.slow) await new Promise(r => setTimeout(r, net.slow));
    const body = server(strip(h).slice(ORIGIN.length));
    return body == null ? new Response('nope', { status: 404 }) : new Response(body, { status: 200 });
  };
  const self = { location: { origin: 'https://x.test' }, addEventListener: (t, f) => { listeners[t] = f; }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  const code = SW.replace(/^const STAND = 'dev';$/m, 'const STAND = ' + JSON.stringify(stand) + ';').replace(/const NAV_TIMEOUT = \d+;/, 'const NAV_TIMEOUT = 30;');
  const api = new Function('self', 'caches', 'fetch', 'Response', 'URL', 'setTimeout', code + '\nreturn {CACHE, RUNTIME};')(self, caches, fetch, Response, URL, setTimeout);
  const wait = async ev => { let p; ev.waitUntil = x => { p = x; }; listeners[ev.type](ev); return p; };
  return {
    api, store, net,
    install: () => wait({ type: 'install' }),
    activate: () => wait({ type: 'activate' }),
    async get(u, mode) { let p; const ev = { request: { url: abs(u), method: 'GET', mode: mode || 'no-cors' }, respondWith: x => { p = x; } }; listeners.fetch(ev); if (!p) return 'durchgereicht'; const r = await p; return r && r.status === 200 ? await r.clone().text() : 'FEHLER'; }
  };
}
(async () => {
  global.Response = global.Response || require('undici').Response;
  const html = v => '<link rel="stylesheet" href="app.css?v=c' + v + '"><script src="config.js?v=k' + v + '"></script><script src="app/start.js?v=s' + v + '"></script>';
  const files = v => ({ 'index.html': html(v), 'app.css': 'css' + v, 'config.js': 'cfg' + v, 'app/start.js': 'start' + v, 'manifest.webmanifest': '{}', 'icon-192.png': 'i', 'icon-512.png': 'i', 'apple-touch-icon.png': 'i', 'catalog-data.js': 'cat' + v, 'catalog/index.js': 'idx' + v });
  let srv = files(1);
  const env = makeEnv('aaa111', f => srv[f || 'index.html']);

  /* 1. Installation: alle eingebundenen Dateien mit cache:'reload', Speicher reiseplaner-<Stand> */
  await env.install(); await env.activate();
  assert.strictEqual(env.api.CACHE, 'reiseplaner-aaa111');
  const c1 = env.store.get('reiseplaner-aaa111');
  for (const k of ['index.html', 'app.css?v=c1', 'config.js?v=k1', 'app/start.js?v=s1', 'catalog-data.js', 'catalog/index.js']) assert(c1.has(ORIGIN + k), 'vorab gespeichert: ' + k);
  assert(env.net.log.every(([, c]) => c === 'reload'), 'Installation lädt am HTTP-Cache vorbei');

  /* 2. Offline: Seite und Dateien aus dem vollständigen Stand */
  env.net.online = false;
  assert.strictEqual(await env.get('./', 'navigate'), html(1), 'offline: Seite aus dem Stand');
  assert.strictEqual(await env.get('app/start.js?v=s1'), 'start1');
  assert.strictEqual(await env.get('https://fonts.example/x.css'), 'durchgereicht', 'fremde Adressen nicht angefasst');

  /* 3. Online neuer Stand auf dem Server, alter Service Worker noch aktiv: Seite vom Netz, neue Dateien vom Netz,
        der gespeicherte Stand bleibt unverändert (keine Mischung) */
  env.net.online = true; srv = files(2);
  assert.strictEqual(await env.get('./', 'navigate'), html(2));
  assert.strictEqual(await env.get('app/start.js?v=s2'), 'start2');
  assert.strictEqual(await env.get('app/start.js?v=s1'), 'start1', 'Datei mit ?v= kommt unverändert aus dem Stand');
  assert.strictEqual(await c1.get(ORIGIN + 'index.html').clone().text(), html(1), 'Netzantwort überschreibt den Stand nicht');
  env.net.online = false;
  assert.strictEqual(await env.get('./', 'navigate'), html(1), 'offline weiter der alte, vollständige Stand');

  /* 4. Neue Installation scheitert, wenn eine Datei fehlt: alter Stand bleibt */
  env.net.online = true; srv = files(3); delete srv['app/start.js'];
  const env2 = makeEnv('bbb222', f => srv[f || 'index.html']);
  env2.store.set('reiseplaner-aaa111', c1);
  await assert.rejects(env2.install(), /start\.js\?v=s3 404/);
  assert(!env2.store.has('reiseplaner-bbb222') || env2.store.get('reiseplaner-bbb222').size === 0, 'kein halber Stand gespeichert');
  assert(env2.store.has('reiseplaner-aaa111'), 'voriger Stand bleibt');

  /* 5. Vollständige neue Installation ersetzt den alten Stand erst bei Aktivierung */
  srv = files(3);
  await env2.install();
  assert(env2.store.has('reiseplaner-aaa111'), 'alter Stand bis zur Aktivierung erhalten');
  await env2.activate();
  assert.deepStrictEqual([...env2.store.keys()].sort(), ['reiseplaner-bbb222'], 'nach Aktivierung nur der neue Stand');
  env2.net.online = false;
  assert.strictEqual(await env2.get('./', 'navigate'), html(3));

  /* 6. Langsames Netz: nach Zeitlimit der gespeicherte Stand */
  env2.net.online = true; env2.net.slow = 200; srv = files(4);
  assert.strictEqual(await env2.get('./', 'navigate'), html(3), 'langsames Netz: gespeicherter Stand nach Zeitlimit');
  env2.net.slow = 0;

  /* 7. Nicht vorab gespeicherte Datei (Katalogkachel): online gemerkt, offline wieder da */
  srv['catalog/t-n47e10.js'] = 'kachel';
  assert.strictEqual(await env2.get('catalog/t-n47e10.js'), 'kachel');
  await new Promise(r => setTimeout(r, 5));
  env2.net.online = false;
  assert.strictEqual(await env2.get('catalog/t-n47e10.js'), 'kachel', 'Kachel offline aus dem Laufzeitspeicher');
  assert.strictEqual(await env2.get('catalog/t-s00e00.js'), 'FEHLER', 'nie geladene Kachel offline: Fehler statt Hängen');

  /* 8. Build setzt den Stand ein */
  assert(/^const STAND = 'dev';$/m.test(SW), 'sw.js enthält die Platzhalterzeile für den Build');
  console.log('Offline (Service Worker): vollständiger Stand, kein Mischen, gescheiterte Installation, Zeitlimit, Laufzeitspeicher geprüft. Kein Browser-Test.');
})().catch(e => { console.error(e); process.exit(1); });
