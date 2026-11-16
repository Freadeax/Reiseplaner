/* OFFLINE O1 im Browser (Chromium): gebaute Website (public/) mit Service Worker.
   Online laden → offline neu laden → neue Version ausliefern → gescheiterte Installation → langsames Netz.
   Vorher: npm run build. Kein iPhone-/Safari-Test. */
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), assert = require('assert');
const { chromium } = require('playwright');
const PUB = path.join(__dirname, '..', 'public');
if (!fs.existsSync(path.join(PUB, 'sw.js'))) { console.error('Erst npm run build ausführen.'); process.exit(1); }
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-offline-'));
fs.cpSync(PUB, DIR, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const state = { slowNav: 0, missing: null, down: false };
const srv = http.createServer(async (req, res) => {
  /* Offline auch serverseitig: setOffline greift in CI nicht zuverlässig für Anfragen des Service Workers */
  if (state.down) { req.socket.destroy(); return; }
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/Reiseplaner/, '');
  if (p === '/' || p === '') p = '/index.html';
  if (req.headers['sec-fetch-mode'] === 'navigate' && state.slowNav) await new Promise(r => setTimeout(r, state.slowNav));
  const f = path.join(DIR, path.normalize(p));
  if (p === state.missing || !f.startsWith(DIR) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'max-age=600' });
  fs.createReadStream(f).pipe(res);
});
const swStand = () => /const STAND = "([^"]+)"/.exec(fs.readFileSync(path.join(DIR, 'sw.js'), 'utf8'))[1];
/* Neue Version simulieren: start.js mit Marker, neuer ?v= in index.html, neuer Stand in sw.js */
function release(tag) {
  const js = path.join(DIR, 'app/start.js');
  fs.appendFileSync(js, '\nwindow.RP_TESTSTAND=' + JSON.stringify(tag) + ';\n');
  const idx = path.join(DIR, 'index.html');
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace(/app\/start\.js\?v=[a-z0-9]+/, 'app/start.js?v=' + tag));
  const sw = path.join(DIR, 'sw.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const STAND = "[^"]+"/, 'const STAND = "' + tag + '"'));
}
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/Reiseplaner/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const text = () => p.locator('#view').innerText();
  const keys = () => p.evaluate(() => caches.keys().then(k => k.filter(x => x.startsWith('reiseplaner-')).sort()));
  const waitStand = async s => { for (let i = 0; i < 150; i++) { const k = (await keys()).filter(x => !x.includes('laufzeit')); if (k.length === 1 && k[0] === 'reiseplaner-' + s) return; await p.waitForTimeout(100); } throw new Error('Stand ' + s + ' nicht aktiv: ' + (await keys()).join(', ')); };

  /* 1. Online laden, Stand installiert */
  await p.goto(base);
  await p.evaluate(() => navigator.serviceWorker.ready);
  const s1 = swStand();
  await waitStand(s1);
  await p.reload();
  await p.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await p.click('[data-go="neu"]');
  await p.fill('#draft [data-f="title"]', 'Offline-Test');
  await p.click('[data-act="create"]');

  /* 1b. „Auf diesem Gerät“ (O3) nennt den Offline-Start ehrlich */
  await p.goto(base + '#konto');
  await p.waitForFunction(() => /Ohne Internet startbar\s*Ja/i.test(document.querySelector('[data-device]') ? document.querySelector('[data-device]').innerText : ''), null, { timeout: 5000 });
  assert(/Reisen in diesem Browser\s*1/i.test(await p.locator('[data-device]').innerText()), 'Auf diesem Gerät: Zahl der Reisen');

  /* 1c. „Für unterwegs bereit?“ in der Reisemappe (O4/O5) */
  const tid = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('rp-trips') || '{}'))[0]);
  await p.goto(base + '#r-' + tid + '-mappe');
  await p.waitForFunction(() => { const s = document.querySelector('[data-ready]'); return s && /startet auch ohne Netz/.test(s.innerText); }, null, { timeout: 8000 });
  let ready = await p.locator('[data-ready]').innerText();
  assert(/Reise als Datei sichern/.test(ready) && /einmal als PDF sichern/.test(ready) && /In Dateien sichern/.test(ready), 'Bereit-Prüfung unvollständig: ' + ready);
  await p.evaluate(() => { window.print = () => {}; });
  await p.locator('[data-ready] [data-act="mappe-print"]').click();
  await p.waitForFunction(() => /Druckdialog zuletzt am/.test(document.querySelector('[data-ready]').innerText), null, { timeout: 8000 });

  /* 2. Offline: App startet aus dem Stand, Reise bleibt, neue Reise offline anlegbar */
  await ctx.setOffline(true); state.down = true;
  await p.goto(base + '#reisen'); await p.reload();
  await p.waitForTimeout(300); const syncTxt = await p.locator('#sync').innerText();
  assert(/Offline ·/i.test(syncTxt), 'Kopfzeile zeigt Offline ohne Konto: ' + syncTxt + ' / onLine=' + await p.evaluate(() => navigator.onLine));
  await p.goto(base + '#reisen'); await p.reload();
  assert((await text()).includes('Offline-Test'), 'offline: Reise fehlt');
  await p.click('[data-go="neu"]');
  await p.fill('#draft [data-f="title"]', 'Ohne Netz angelegt');
  await p.click('[data-act="create"]');
  await p.goto(base + '#reisen'); await p.reload();
  assert((await text()).includes('Ohne Netz angelegt'), 'offline: offline angelegte Reise nach Neuladen weg');

  /* 3. Neue Version, Installation scheitert (fehlende Datei): alter Stand bleibt vollständig */
  await ctx.setOffline(false); state.down = false;
  release('neu1'); state.missing = '/app/start.js';
  /* Bis die Installation tatsächlich gescheitert ist (in CI langsamer als lokal) */
  const failed = await p.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    await r.update().catch(() => {});
    const w = r.installing || r.waiting; if (!w) return 'keine Installation';
    return await new Promise(res => { const f = () => { if (w.state === 'redundant' || w.state === 'activated') res(w.state); }; w.addEventListener('statechange', f); f(); setTimeout(() => res('Zeitlimit ' + w.state), 20000); });
  });
  assert.strictEqual(failed, 'redundant', 'neue Installation mit fehlender Datei muss scheitern');
  assert.deepStrictEqual((await keys()).filter(k => !k.includes('laufzeit')), ['reiseplaner-' + s1], 'gescheiterte Installation: nur der alte Stand');
  state.missing = null;
  await ctx.setOffline(true); state.down = true;
  await p.goto(base + '#reisen'); await p.reload();
  assert((await text()).includes('Ohne Netz angelegt'), 'nach gescheiterter Installation offline nicht startbar');
  assert.strictEqual(await p.evaluate(() => window.RP_TESTSTAND || null), null, 'offline darf der neue Teil nicht im alten Stand landen');

  /* 4. Neue Version vollständig: wird installiert, ersetzt den alten Stand, offline kommt der neue */
  await ctx.setOffline(false); state.down = false;
  await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await waitStand('neu1');
  await ctx.setOffline(true); state.down = true;
  await p.goto(base + '#reisen'); await p.reload();
  assert.strictEqual(await p.evaluate(() => window.RP_TESTSTAND || null), 'neu1', 'offline: neuer Stand nicht aktiv');
  assert((await text()).includes('Offline-Test'), 'Reisen nach Versionswechsel weg');

  /* 4b. Nach neuer Version suchen (Wunsch Philipp 16.11.): Knopf, Hinweis „Neue Version verfügbar“, Jetzt laden */
  await ctx.setOffline(false); state.down = false;
  await p.goto(base + '#konto'); await p.reload();
  await p.waitForSelector('[data-offline-act="update-check"]');
  await p.click('[data-offline-act="update-check"]');
  await p.waitForFunction(() => /neueste Version/i.test(document.querySelector('[data-device]').innerText), null, { timeout: 15000 });
  assert.strictEqual(await p.locator('#rp-update').count(), 0, 'kein Hinweis ohne neue Version');
  release('neu2');
  await p.click('[data-offline-act="update-check"]');
  await p.waitForSelector('#rp-update', { timeout: 20000 });
  assert(/Neue Version verfügbar/.test(await p.locator('#rp-update').innerText()));
  assert.strictEqual(await p.evaluate(() => window.RP_TESTSTAND || null), 'neu1', 'vor dem Laden läuft noch die alte Version');
  await Promise.all([p.waitForEvent('load'), p.click('[data-offline-act="update-now"]')]);
  assert.strictEqual(await p.evaluate(() => window.RP_TESTSTAND || null), 'neu2', 'Jetzt laden: neue Version aktiv');
  assert.strictEqual(await p.locator('#rp-update').count(), 0, 'nach dem Laden kein Hinweis mehr');
  await p.goto(base + '#reisen');

  /* 5. Langsames Netz: Start nach Zeitlimit aus dem Stand */
  await ctx.setOffline(false); state.down = false;
  await p.goto(base + '#reisen');
  state.slowNav = 9000;
  const t0 = Date.now();
  await p.reload({ timeout: 15000 });
  const ms = Date.now() - t0;
  state.slowNav = 0;
  assert(ms < 8000, 'langsames Netz: Start dauerte ' + ms + ' ms');
  await p.waitForSelector('#view :text("Offline-Test")', { timeout: 5000 }).catch(() => {});
  assert((await text()).includes('Offline-Test'), 'langsames Netz: App nicht gestartet (' + ms + ' ms): ' + (await text()).slice(0, 600) + ' URL ' + p.url());

  assert.deepStrictEqual(errors, [], 'Seitenfehler: ' + errors.join(' | '));
  await browser.close(); srv.close(); fs.rmSync(DIR, { recursive: true, force: true });
  console.log('Offline im Browser (Chromium, gebaute Website): Offline-Start, Reisen offline anlegen, gescheiterte Installation ohne Mischstand, Versionswechsel, „Für unterwegs bereit?“, Nach neuer Version suchen mit Hinweis und Jetzt laden, langsames Netz (' + ms + ' ms) geprüft. Kein iPhone-/Safari-Test.');
})().catch(async e => { console.error(e); srv.close(); process.exit(1); });
