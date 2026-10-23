/* Format 4 im echten Browser (Chromium über Playwright, Paket 7): Foto über RPPhotos.prepare und echte IndexedDB
   "rp-media" ablegen, mediaCommit mit Bestätigung, Knopf „Mit Fotos sichern“ → Download einer .reiseplaner-Datei,
   dann auf einem frischen Browserprofil über „Sicherung importieren“ wiederherstellen und das Bild aus der Ablage anzeigen.
   Läuft nicht in npm test (braucht Playwright und Chromium wie tests/browser.cjs). Kein Safari/WebKit- und kein iPhone-Test.
   Aufruf: node tests/format4-browser.cjs */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
let pw = null;
try { pw = require('playwright'); } catch (e) { try { pw = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright')); } catch (x) { pw = null; } }
if (!pw) { console.log('Format-4-Browsertest übersprungen: Playwright nicht installiert.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  if (/[\\/]app[\\/]format4\.js$/.test(f)) { /* Schreibweg prüfen, auch wenn die Datei als Lese-Release ausgeliefert wird */
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); res.end(fs.readFileSync(f, 'utf8').replace('const F4_WRITE=false;', 'const F4_WRITE=true;')); return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, errors = [];
  const browser = await pw.chromium.launch();
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'rp-f4-'));
  try {
    /* Gerät A: Reise mit Foto anlegen und sichern */
    const ctxA = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: true, viewport: { width: 390, height: 844 } });
    const a = await ctxA.newPage(); a.on('pageerror', e => errors.push('A: ' + e.message));
    await a.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await a.goto(base + '/index.html');
    const made = await a.evaluate(async () => {
      const app = window.__app, P = window.RPPhotos, S = P.create();
      const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 1200, 800); g.addColorStop(0, '#2a6'); g.addColorStop(1, '#fd3'); x.fillStyle = g; x.fillRect(0, 0, 1200, 800);
      const bytes = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9))).arrayBuffer());
      const t = app.newTrip({ title: 'Allgäu mit Foto', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03' }); t.schemaVersion = 3;
      app.Store.put(t);
      const prep = await P.prepare({ bytes }, { existing: [], keepLocation: true }, P.browserCodec(window));
      await S.put(prep.entry.id, prep.files);
      const r0 = window.mediaCommit(app.Store.get(t.id), [prep.entry]);
      const before = localStorage.getItem('rp-trips');
      const r1 = window.f4Commit(r0.candidate, { confirmed: true });
      return { id: t.id, mid: prep.entry.id, sha: prep.entry.sha256, needs: r0.needsConfirm, notice: /Format 4 umgestellt/.test(r0.notice || ''), unchangedBefore: before === localStorage.getItem('rp-trips') ? 'gleich' : 'geändert', ok: r1.ok, sv: app.Store.get(t.id).schemaVersion };
    });
    assert.equal(made.needs, 'format4'); assert(made.notice); assert(made.ok && made.sv === 4, 'Reise mit Foto in Format 4 gespeichert');
    assert.equal(made.unchangedBefore, 'geändert', 'nach Bestätigung gespeichert');
    /* Klickweg: Reisen → „Mit Fotos sichern“ → Datei erstellen → Download */
    await a.evaluate(() => { window.__app.go('reisen'); });
    await a.waitForSelector('[data-f4="export-open"][data-scope="all"]');
    assert(await a.isVisible('[data-f4-json-note]'), 'Hinweis „Fotos nicht in JSON“ sichtbar');
    await a.click('[data-f4="export-open"][data-scope="all"]');
    await a.waitForSelector('[data-f4-sheet]');
    assert.equal(await a.isChecked('#f4-keep-location'), false, 'Standort standardmäßig aus');
    const [dl] = await Promise.all([a.waitForEvent('download'), a.click('[data-f4="export-run"]')]);
    assert(/\.reiseplaner$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    const file = path.join(tmp, dl.suggestedFilename()); await dl.saveAs(file);
    const zipHead = fs.readFileSync(file).subarray(0, 2).toString('latin1'); assert.equal(zipHead, 'PK', 'ZIP-Datei');
    const status = await a.evaluate(() => document.body.innerText);
    assert(/1 Fotos und 1 Reisen gesichert \(ohne Standorte\)/.test(status), 'Rückmeldung nach dem Export');

    /* Gerät B: frisches Profil, Sicherung importieren, Bild aus der Ablage anzeigen */
    const ctxB = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
    const b = await ctxB.newPage(); b.on('pageerror', e => errors.push('B: ' + e.message));
    await b.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await b.goto(base + '/index.html');
    await b.setInputFiles('#import-file', file);
    await b.waitForSelector('[data-act="import-skip"]');
    const info = await b.textContent('#sheet-root');
    assert(/Archiv \.reiseplaner/.test(info) && /1 Fotos lesbar/.test(info) && /ohne Fotostandorte/.test(info), 'Vorschau nennt Archiv und Fotos');
    await b.click('[data-act="import-skip"]');
    await b.waitForFunction(id => !!window.__app.Store.get(id), made.id);
    const got = await b.evaluate(async (m) => {
      const app = window.__app, t = app.Store.get(m.id), S = window.RPPhotos.create();
      const w = await S.get(m.mid, 'work'), th = await S.get(m.mid, 'thumb');
      const img = new Image(); img.src = URL.createObjectURL(new Blob([th.bytes], { type: th.type })); await img.decode();
      return { sv: t.schemaVersion, media: t.media.length, lat: 'lat' in t.media[0], sha: await window.RPPhotos.sha256(new Uint8Array(w.bytes)), thumb: [img.naturalWidth, img.naturalHeight], check: await S.check(m.mid) };
    }, made);
    assert(got.sv === 4 && got.media === 1 && !got.lat, 'Reise mit Foto-Eintrag ohne Standort wiederhergestellt');
    assert.equal(got.sha, made.sha, 'Arbeitskopie bytegleich (Prüfsumme)');
    assert(got.check.ok && got.thumb[0] === 400, 'Vorschau 400 px anzeigbar, Ablage geprüft');
    assert.deepEqual(errors, [], 'keine Skriptfehler');
    console.log('Format 4 im Browser (Chromium): Foto über echte Fotoablage, Bestätigung, „Mit Fotos sichern“ als Download, Import auf frischem Profil mit Prüfsumme und Vorschau geprüft.');
  } finally { await browser.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exit(1); });
