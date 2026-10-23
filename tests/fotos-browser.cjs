/* Foto-Import und Fotoansicht (Paket 8) im echten Chromium (Playwright) mit der ganzen App:
   Datei wählen → Canvas-Codec → echte IndexedDB rp-media → Prüfliste → Speichern über einen mediaCommit-Stub (Paket 7 fehlt noch;
   der Stub hält t.media nur im Arbeitsspeicher, rp-trips bleibt unverändert) → Vorschaubilder je Tag, Erinnerungen, Fotoblatt
   mit Ort und Kartenlink, Löschen mit Bestätigung. Bei 390 px, 320 px dunkel und Desktop. Kein Safari/WebKit- und kein iPhone-Test.
   Aufruf: node tests/fotos-browser.cjs (nicht in npm test, braucht Playwright und Chromium wie tests/browser.cjs). */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }
const ROOT = path.join(__dirname, '..');
/* JPEG von Pillow (aus tests/photostore-browser.cjs): 24×16, Aufnahme 31.12.2026 15:42:07 +01:00, GPS N 47,56 E 10,22 */
const PIL = Buffer.from(fs.readFileSync(path.join(__dirname, 'photostore-browser.cjs'), 'utf8').match(/const PIL = '([^']+)'/)[1], 'base64');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory() || /\/sw\.js$/.test(f)) { res.writeHead(404) /* kein Service Worker im Test */; res.end(); return; }
  if (/[\\/]app[\\/]format4\.js$/.test(f)) { /* Schreibweg prüfen, auch wenn die Datei als Lese-Release ausgeliefert wird */
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); res.end(fs.readFileSync(f, 'utf8').replace('const F4_WRITE=false;', 'const F4_WRITE=true;')); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const STUB = () => {
  window.__commits = 0;
  window.mediaCommit = (t, entries) => { const S = window.__app.Store, cur = S.get(t.id); S.trips[t.id] = Object.assign({}, cur, { media: (cur.media || []).concat(entries), schemaVersion: 4 }); window.__commits++; return Promise.resolve({ ok: true, trip: S.trips[t.id] }); };
  window.mediaRemove = (t, id, o) => { const S = window.__app.Store, r = window.RPV4.removeMedia(S.get(t.id), id, o); if (!r.ok) return { ok: false, error: 'im Buch' }; S.trips[t.id] = r.trip; return { ok: true, trip: r.trip }; };
};
async function run(browser, base, name, opts) {
  const ctx = await browser.newContext(opts), p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|Failed to load resource|fetching the script/.test(m.text())) errors.push(m.text()); });
  await p.goto(base + '/#reisen'); await p.waitForFunction(() => window.__app && window.__app.Store);
  const tid = await p.evaluate(() => { const t = window.__app.silvesterTemplate(); window.__app.Store.put(t, true); return t.id; });
  const raw0 = await p.evaluate(() => localStorage.getItem('rp-trips'));
  await p.evaluate(id => { location.hash = '#r-' + id + '-plan'; }, tid);
  await p.waitForSelector('[data-fotos] [data-foto-nobackup]');
  assert.match(await p.textContent('[data-fotos] [data-foto-nobackup]'), /Lokale Fotos sind keine Sicherung/);
  /* Zwei Dateien, die zweite ist dasselbe Bild */
  await p.setInputFiles('#foto-input', [{ name: 'see.jpg', mimeType: 'image/jpeg', buffer: PIL }, { name: 'see-kopie.jpg', mimeType: 'image/jpeg', buffer: PIL }]);
  await p.waitForSelector('[data-foto-review]');
  const rv = await p.textContent('[data-foto-review]');
  assert.match(rv, /Zuordnung prüfen · 1 Foto/); assert.match(rv, /Aufgenommen 31\.12\.2026, 15:42 Uhr/); assert.match(rv, /Ort 47,56000° N, 10,22000° O/);
  assert.match(await p.textContent('[data-foto-msg]'), /1 Foto war schon in der Reise/);
  assert.equal(await p.evaluate(() => localStorage.getItem('rp-trips')), raw0, 'vor der Bestätigung nichts gespeichert');
  assert(await p.evaluate(() => { const i = document.querySelector('[data-foto-review] img'); return i && i.complete && i.naturalWidth > 0; }), 'Vorschaubild in der Prüfliste');
  await p.click('[data-foto-act="commit"]');
  /* Erstes Foto: Umstellung auf Format 4 nur nach ausdrücklicher Bestätigung (app/format4.js) */
  await p.waitForSelector('[data-foto-confirm] [data-f4-upgrade]');
  assert.equal(await p.evaluate(() => localStorage.getItem('rp-trips')), raw0, 'Hinweis allein speichert nichts');
  await p.click('[data-foto-act="commit-confirm"]');
  await p.waitForSelector('[data-foto-group="2026-12-31"] img');
  await p.waitForFunction(() => [...document.querySelectorAll('[data-foto-group] img')].every(i => i.complete && i.naturalWidth > 0));
  assert.equal(await p.evaluate(id => window.__app.Store.get(id).schemaVersion, tid), 4, 'Format 4');
  assert.match(await p.textContent('[data-foto-msg]'), /1 Foto gespeichert/);
  const media = await p.evaluate(id => window.__app.Store.get(id).media, tid);
  assert.equal(media.length, 1); assert.equal(media[0].day, '2026-12-31'); assert(Math.abs(media[0].lat - 47.56) < 1e-6, 'Standort behalten');
  assert.equal(media[0].w, 16); assert.equal(media[0].h, 24); // Ausrichtung 6: hochkant gedreht
  /* IndexedDB rp-media: Arbeitskopie und Vorschau, kein Original */
  const keys = await p.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('rp-media'); r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').getAllKeys(); q.onsuccess = () => { r.result.close(); res(q.result); }; q.onerror = rej; }; r.onerror = rej; }));
  assert.deepEqual(keys.sort(), [media[0].id + ':thumb', media[0].id + ':work']);
  /* Tagesspalte (am Handy nur der gewählte Tag sichtbar) */
  assert.equal(await p.locator('.dcol[data-day="1"] .foto-strip .foto-thumb').count(), 1);
  /* Größen und Überlauf */
  const geo = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > window.innerWidth + 1,
    small: [...document.querySelectorAll('[data-fotos] button, [data-fotos] .foto-pick, .foto-strip button')].filter(b => b.offsetParent).map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44).length }));
  assert.equal(geo.over, false, name + ': kein seitliches Scrollen'); assert.equal(geo.small, 0, name + ': Ziele ≥ 44 px');
  /* Fotoblatt */
  await p.click('[data-foto-group="2026-12-31"] .foto-thumb');
  await p.waitForSelector('.sheet [data-foto-full] img');
  const sh = await p.textContent('.sheet');
  assert.match(sh, /31\.12\.2026, 15:42 Uhr/); assert.match(sh, /47,56000° N, 10,22000° O/); assert.match(sh, /Lokale Fotos sind keine Sicherung/);
  assert.equal(await p.getAttribute('.sheet a[href*="openstreetmap"]', 'href'), 'https://www.openstreetmap.org/?mlat=47.56000&mlon=10.22000#map=16/47.56000/10.22000');
  assert(await p.evaluate(() => { const i = document.querySelector('.sheet [data-foto-full] img'); return i.complete && i.naturalWidth === 16 && /^Foto vom 31\.12\.2026/.test(i.alt); }), 'Arbeitskopie mit Alternativtext');
  /* Erinnerungen und Reisebuch-Vorschau */
  await p.click('.sheet .x');
  await p.evaluate(() => { location.hash = '#erinnerungen'; });
  await p.waitForSelector('[data-foto-memories] img');
  assert.match(await p.textContent('[data-foto-memories]'), /Fotos eurer Reisen/);
  await p.click('[data-book-act="make"]');
  await p.waitForFunction(() => !!document.querySelector('[data-book-page]'));
  /* Löschen mit Bestätigung */
  await p.click('[data-foto-memories] .foto-thumb');
  await p.waitForSelector('.sheet [data-foto-act="del"]');
  await p.click('.sheet [data-foto-act="del"]');
  await p.waitForSelector('.sheet [data-foto-act="del-yes"]');
  assert.match(await p.textContent('.sheet'), /Foto löschen\?/);
  assert.equal((await p.evaluate(id => window.__app.Store.get(id).media, tid)).length, 1, 'Nachfrage löscht nichts');
  await p.click('.sheet [data-foto-act="del-yes"]');
  await p.waitForFunction(id => window.__app.Store.get(id).media.length === 0, tid);
  const left = await p.evaluate(() => new Promise(res => { const r = indexedDB.open('rp-media'); r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').count(); q.onsuccess = () => { r.result.close(); res(q.result); }; }; }));
  assert.equal(left, 0, 'Datei aus rp-media entfernt');
  assert.equal(await p.evaluate(id => { const t = JSON.parse(localStorage.getItem('rp-trips'))[id]; return t.schemaVersion + ':' + t.media.length; }, tid), '4:0', 'rp-trips: Reise bleibt Format 4, Foto entfernt');
  assert.deepEqual(errors, [], name + ': keine Fehler auf der Seite: ' + JSON.stringify(errors));
  await ctx.close();
  console.log('Fotos ' + name + ': Import (Canvas, IndexedDB), doppelt erkannt, Prüfliste, Speichern über Format 4 mit Bestätigung, Tagesspalte, Fotoblatt mit Ort und Kartenlink, Erinnerungen, Löschen mit Bestätigung, Ziele ≥ 44 px, kein Überlauf geprüft.');
}
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  try {
    await run(browser, base, '390 px', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await run(browser, base, '320 px dunkel', { viewport: { width: 320, height: 640 }, colorScheme: 'dark' });
    await run(browser, base, 'Desktop', { viewport: { width: 1280, height: 900 } });
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
