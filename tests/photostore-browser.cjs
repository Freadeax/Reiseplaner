/* RPPhotos im echten Browser (Chromium über Playwright): Canvas-Codec browserCodec(), EXIF-Drehung durch
   createImageBitmap, echte IndexedDB "rp-media", Web Crypto, Anzeige aus den gespeicherten Bytes.
   Läuft nicht in npm test (braucht Playwright und Chromium wie tests/browser.cjs). Kein Safari/WebKit- und kein iPhone-Test.
   Aufruf: node tests/photostore-browser.cjs */
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const root = path.join(__dirname, '..');
const PIL = '/9j/4AAQSkZJRgABAQAAAQABAAD/4QD6RXhpZgAATU0AKgAAAAgABAEPAAIAAAAIAAAAPgESAAMAAAABAAYAAIdpAAQAAAABAAAARoglAAQAAAABAAAAjAAAAABUZXN0Q2FtAAADkAMAAgAAABQAAABwkBEAAgAAAAcAAACEkpEAAgAAAAQyNTAAAAAAADIwMjY6MTI6MzEgMTU6NDI6MDcAKzAxOjAwAAAABAABAAIAAAACTgAAAAACAAUAAAADAAAAwgADAAIAAAACRQAAAAAEAAUAAAADAAAA2gAAAAAAAAAvAAAAAQAAACEAAAABAAAAJAAAAAEAAAAKAAAAAQAAAA0AAAABAAAADAAAAAH/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAQABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCSiiivGPWCiiigD//Z';

const server = http.createServer((req, res) => {
  const name = req.url === '/' ? null : path.basename(req.url);
  if (!name) { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><script src="v4logic.js"></script><script src="catalog.js"></script><script src="photostore.js"></script>'); return; }
  if (!['v4logic.js', 'catalog.js', 'photostore.js'].includes(name)) { res.statusCode = 404; res.end(); return; }
  res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(root, name)));
});

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    const out = await page.evaluate(async (pil) => {
      const P = window.RPPhotos, V4 = window.RPV4, codec = P.browserCodec(window), r = {};
      const bytesOf = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const blobBytes = async (w, h, type, paint) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); paint(x, w, h);
        return new Uint8Array(await (await new Promise(res => c.toBlob(res, type, 0.9))).arrayBuffer());
      };
      r.secure = window.isSecureContext; r.subtle = !!(crypto && crypto.subtle);
      /* 1. Pillow-JPEG mit Ausrichtung 6: hochkant nach dem Dekodieren, nicht vergrößert, Vertrag v4 */
      const a = await P.prepare({ bytes: bytesOf(pil) }, { id: 'fbro1', keepOriginal: true }, codec);
      r.pil = { w: a.entry.w, h: a.entry.h, takenAt: a.entry.takenAt, workJpeg: P.sniff(a.files.work.bytes), origGps: P.readExif(a.files.original.bytes).gps, origOrientation: P.readExif(a.files.original.bytes).orientation };
      V4.validateMedia([a.entry]);
      /* 2. Großes Bild 4000×3000 → 2048×1536 und 400×300, Maße aus der erzeugten Datei */
      const big = await blobBytes(4000, 3000, 'image/jpeg', (x, w, h) => { const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#c63'); g.addColorStop(1, '#36c'); x.fillStyle = g; x.fillRect(0, 0, w, h); });
      const t0 = performance.now();
      const b = await P.prepare({ bytes: big }, { id: 'fbro2' }, codec);
      r.big = { work: [b.entry.w, b.entry.h], sof: [P.readExif(b.files.work.bytes).width, P.readExif(b.files.work.bytes).height], thumb: [b.files.thumb.w, b.files.thumb.h], bytes: b.entry.bytes, real: b.files.work.bytes.length, thumbBytes: b.files.thumb.bytes.length, ms: Math.round(performance.now() - t0) };
      const ref = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b.files.work.bytes))).map(v => v.toString(16).padStart(2, '0')).join('');
      r.big.shaOk = ref === b.entry.sha256 && P.sha256Sync(b.files.work.bytes) === ref;
      /* 3. Transparentes PNG: JPEG bekommt weißen Hintergrund */
      const png = await blobBytes(50, 40, 'image/png', (x) => { x.clearRect(0, 0, 50, 40); x.fillStyle = 'rgba(0,0,0,1)'; x.fillRect(0, 0, 10, 10); });
      const c = await P.prepare({ bytes: png }, { id: 'fbro3' }, codec);
      const bmp = await createImageBitmap(new Blob([c.files.work.bytes], { type: 'image/jpeg' }));
      const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height; const cx = cv.getContext('2d'); cx.drawImage(bmp, 0, 0);
      r.png = { corner: Array.from(cx.getImageData(45, 35, 1, 1).data), dark: Array.from(cx.getImageData(2, 2, 1, 1).data), notes: c.notes };
      /* 4. Echte IndexedDB: speichern, zurücklesen, anzeigen, prüfen, löschen */
      const S = P.create({});
      await S.put('fbro1', a.files); await S.put('fbro2', b.files);
      const g = await S.get('fbro2', 'work');
      const img = new Image(); img.src = URL.createObjectURL(new Blob([g.bytes], { type: g.type })); await img.decode();
      r.store = { shown: [img.naturalWidth, img.naturalHeight], ids: await S.ids(), check: await S.check('fbro2'), usage: await S.usage(), estimate: await S.estimate(), has1: await S.has('fbro1') };
      await assertReject(() => S.put('fbro1', b.files), r, 'overwrite');
      S.close();
      await new Promise(res => { const d = indexedDB.deleteDatabase('rp-media'); d.onsuccess = d.onerror = res; });
      r.dbs = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : null;
      async function assertReject(fn, o, k) { try { await fn(); o[k] = 'kein Fehler'; } catch (e) { o[k] = e.message; } }
      return r;
    }, PIL);
    assert.deepEqual(errors, []);
    assert(out.secure && out.subtle, 'sicherer Kontext mit Web Crypto');
    assert.deepEqual([out.pil.w, out.pil.h], [16, 24], 'EXIF-Ausrichtung 6 vom Browser angewandt: ' + JSON.stringify(out.pil));
    assert.equal(out.pil.takenAt, '2026-12-31T15:42:07.250+01:00'); assert.equal(out.pil.workJpeg, 'image/jpeg');
    assert.equal(out.pil.origGps, null); assert.equal(out.pil.origOrientation, 6);
    assert.deepEqual(out.big.work, [2048, 1536]); assert.deepEqual(out.big.sof, [2048, 1536]); assert.deepEqual(out.big.thumb, [400, 300]);
    assert.equal(out.big.bytes, out.big.real); assert(out.big.shaOk, 'Prüfsumme Web Crypto = eigene Umsetzung');
    assert(out.png.corner.slice(0, 3).every(v => v > 240), 'weißer Hintergrund statt schwarz: ' + out.png.corner);
    assert(out.png.dark.slice(0, 3).every(v => v < 30), 'Bildinhalt bleibt');
    assert(out.png.notes.some(n => /nur aus JPEG/.test(n)));
    assert.deepEqual(out.store.shown, [2048, 1536], 'aus IndexedDB angezeigt');
    assert.deepEqual(out.store.ids, ['fbro1', 'fbro2']); assert.equal(out.store.check.ok, true);
    assert.deepEqual(out.store.has1, { work: true, thumb: true, original: true });
    assert.equal(out.store.estimate.source, 'browser-schaetzung');
    assert(/schon ein anderes Bild/.test(out.overwrite), out.overwrite);
    if (out.dbs) assert(!out.dbs.includes('rp-media'), 'Testdatenbank wieder entfernt');
    console.log('RPPhotos im Browser (Chromium ' + browser.version() + '): EXIF-Drehung, 4000×3000 → 2048×1536/400×300 (Arbeitskopie ' + out.big.real + ' B, Vorschau ' + out.big.thumbBytes + ' B, ' + out.big.ms + ' ms, synthetischer Verlauf, kein Foto), weißer Hintergrund für PNG, Web Crypto = eigene SHA-256, echte IndexedDB rp-media mit Anzeige aus gespeicherten Bytes geprüft. Kein Safari/WebKit, kein iPhone.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
