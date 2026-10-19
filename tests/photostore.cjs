/* Lokale Fotoablage RPPhotos (Paket 5, PLAN_IOS_APP §6.1–6.3, SCHEMA_V4 §2): SHA-256, Dateiart, EXIF-Leser
   (Aufnahmezeit, Ausrichtung, GPS, SOF-Maße), Standort entfernen, Größen, Zuordnungsvorschlag mit Bestätigung,
   Import mit Test-Codec, IndexedDB-Ablage (atomar, Kontingent, Rücklesevergleich, Ersetzen nur ausdrücklich).
   Node-Test mit eigenem In-Memory-IndexedDB-Ersatz (wie tests/rpstore.cjs, Werte per structuredClone) und kleinen
   Test-JPEGs als Bytes; eines davon hat Pillow geschrieben (unabhängiger EXIF-Schreiber). Kein Browser-, Canvas- oder
   iPhone-Test: browserCodec() ist hier nicht ausgeführt. */
const assert = require('assert');
const nodeCrypto = require('crypto');
const P = require('../photostore.js');
const V4 = require('../v4logic.js');

/* ---------- In-Memory-IndexedDB (Teilmenge: open/upgrade, createObjectStore(keyPath), get/put/delete/getAll/getAllKeys) ----------
   Transaktionen laufen nacheinander. F.fail({op,store,value}) → Fehler im Request (z. B. Kontingent),
   F.tamper({store,value}) → verfälscht den gespeicherten Wert, F.openFail → Fehler beim Öffnen, F.hang → keine Antwort. */
function fakeIDB() {
  const dbs = {}, later = f => setTimeout(f, 0), clone = v => v === undefined ? undefined : structuredClone(v);
  const err = (name, msg) => Object.assign(new Error(msg || name), { name });
  const F = { fail: null, tamper: null, openFail: null, hang: false, dbs, opened: [] };
  F.open = (name, version) => {
    const req = { result: null, error: null };
    F.opened.push(name);
    later(() => {
      if (F.hang) return;
      if (F.openFail) { req.error = F.openFail; if (req.onerror) req.onerror({ preventDefault() {} }); return; }
      let d = dbs[name];
      if (d && version < d.version) { req.error = err('VersionError'); if (req.onerror) req.onerror({ preventDefault() {} }); return; }
      const upgrade = !d || version > d.version;
      if (!d) d = dbs[name] = { version: 0, stores: {}, lock: Promise.resolve() };
      const conn = {
        objectStoreNames: { contains: n => !!d.stores[n] },
        createObjectStore(n, o) { d.stores[n] = { keyPath: o.keyPath, data: new Map() }; },
        close() { conn.closed = true; },
        transaction(names, mode) {
          if (conn.closed) throw err('InvalidStateError');
          names = [].concat(names); names.forEach(n => { if (!d.stores[n]) throw err('NotFoundError'); });
          return transaction(d, names, mode || 'readonly');
        }
      };
      req.result = conn;
      if (upgrade) { d.version = version; if (req.onupgradeneeded) req.onupgradeneeded({}); }
      if (req.onsuccess) req.onsuccess({});
    });
    return req;
  };
  function transaction(d, names, mode) {
    const writes = [], queue = [];
    let started = false, running = false, done = false, release = () => {};
    const tx = { error: null, mode, oncomplete: null, onerror: null, onabort: null };
    const view = n => { const m = new Map(d.stores[n].data); writes.filter(w => w[0] === n).forEach(w => w[1] === 'put' ? m.set(w[2], w[3]) : m.delete(w[2])); return m; };
    function abort(e) { if (done) return; done = true; tx.error = e; release(); later(() => { if (tx.onabort) tx.onabort({}); }); }
    function commit() {
      if (done) return;
      writes.forEach(([n, op, key, v]) => { if (op === 'put') d.stores[n].data.set(key, F.tamper ? F.tamper({ store: n, value: clone(v) }) : clone(v)); else d.stores[n].data.delete(key); });
      done = true; release(); later(() => { if (tx.oncomplete) tx.oncomplete({}); });
    }
    function step() {
      if (done) return;
      const item = queue.shift();
      if (!item) { running = false; commit(); return; }
      try { item.r.result = item.fn(); }
      catch (e) { item.r.error = e; if (item.r.onerror) item.r.onerror({ preventDefault() {} }); if (tx.onerror) tx.onerror({ preventDefault() {} }); abort(e); return; }
      try { if (item.r.onsuccess) item.r.onsuccess({}); } catch (e) { abort(e); return; }
      later(step);
    }
    const kick = () => { if (started && !running && !done) { running = true; later(step); } };
    const request = fn => { const r = { result: undefined, error: null }; if (done) throw err('TransactionInactiveError'); queue.push({ r, fn }); kick(); return r; };
    const rw = () => { if (mode !== 'readwrite') throw err('ReadOnlyError'); };
    tx.objectStore = n => {
      if (!names.includes(n)) throw err('NotFoundError');
      return {
        get: key => request(() => clone(view(n).get(key))),
        getAll: () => request(() => [...view(n).entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).map(e => clone(e[1]))),
        getAllKeys: () => request(() => [...view(n).keys()].sort()),
        put: value => request(() => { rw(); const e = F.fail && F.fail({ op: 'put', store: n, value }); if (e) throw e; const key = value[d.stores[n].keyPath]; writes.push([n, 'put', key, clone(value)]); return key; }),
        delete: key => request(() => { rw(); writes.push([n, 'del', key]); })
      };
    };
    tx.abort = () => { if (done) throw err('InvalidStateError'); abort(err('AbortError')); };
    d.lock = d.lock.then(() => new Promise(rel => { release = rel; started = true; if (queue.length) kick(); else later(() => { if (!queue.length && !running) commit(); }); }));
    return tx;
  }
  F.keys = store => { const d = dbs[P.DB_NAME]; return d && d.stores[store] ? [...d.stores[store].data.keys()].sort() : []; };
  return F;
}

/* ---------- Test-JPEGs ---------- */
/* TIFF mit IFD0, optional Exif- und GPS-Verzeichnis. Einträge {tag, type, v}: type 2 ASCII (Text), 3 SHORT, 4 LONG,
   5 RATIONAL ([[z, n], …]). le = Intel (II), sonst Motorola (MM). */
function tiff(le, ifd0, exif, gps) {
  const enc = e => {
    if (e.type === 2) return Buffer.from(e.v + '\0', 'latin1');
    if (e.type === 3) { const b = Buffer.alloc(2 * e.v.length); e.v.forEach((x, i) => le ? b.writeUInt16LE(x, 2 * i) : b.writeUInt16BE(x, 2 * i)); return b; }
    if (e.type === 4) { const b = Buffer.alloc(4 * e.v.length); e.v.forEach((x, i) => le ? b.writeUInt32LE(x, 4 * i) : b.writeUInt32BE(x, 4 * i)); return b; }
    if (e.type === 5) { const b = Buffer.alloc(8 * e.v.length); e.v.forEach(([z, n], i) => { if (le) { b.writeUInt32LE(z, 8 * i); b.writeUInt32LE(n, 8 * i + 4); } else { b.writeUInt32BE(z, 8 * i); b.writeUInt32BE(n, 8 * i + 4); } }); return b; }
    throw new Error('Typ');
  };
  const count = e => e.type === 2 ? Buffer.byteLength(e.v, 'latin1') + 1 : e.v.length;
  const ifds = [ifd0.slice(), exif ? exif.slice() : null, gps ? gps.slice() : null];
  if (exif) ifds[0].push({ tag: 0x8769, type: 4, v: [0], ptr: 1 });
  if (gps) ifds[0].push({ tag: 0x8825, type: 4, v: [0], ptr: 2 });
  const at = [], sizes = ifds.map(l => l ? 2 + 12 * l.length + 4 : 0);
  let pos = 8; ifds.forEach((l, i) => { at[i] = pos; pos += sizes[i]; });
  ifds.forEach(l => l && l.forEach(e => { if (e.ptr) e.v = [at[e.ptr]]; }));
  const out = Buffer.alloc(pos + 4096); let data = pos;
  out.write(le ? 'II' : 'MM', 0, 'latin1');
  le ? out.writeUInt16LE(42, 2) : out.writeUInt16BE(42, 2);
  le ? out.writeUInt32LE(8, 4) : out.writeUInt32BE(8, 4);
  const w16 = (v, p) => le ? out.writeUInt16LE(v, p) : out.writeUInt16BE(v, p), w32 = (v, p) => le ? out.writeUInt32LE(v, p) : out.writeUInt32BE(v, p);
  ifds.forEach((l, i) => {
    if (!l) return;
    l.sort((a, b) => a.tag - b.tag);
    w16(l.length, at[i]);
    l.forEach((e, k) => {
      const p = at[i] + 2 + 12 * k, b = enc(e);
      w16(e.tag, p); w16(e.type, p + 2); w32(count(e), p + 4);
      if (b.length <= 4) b.copy(out, p + 8); else { w32(data, p + 8); b.copy(out, data); data += b.length + (b.length % 2); }
    });
    w32(0, at[i] + 2 + 12 * l.length);
  });
  return out.subarray(0, data);
}
const seg = (marker, body) => { const b = Buffer.alloc(4); b[0] = 0xFF; b[1] = marker; b.writeUInt16BE(body.length + 2, 2); return Buffer.concat([b, body]); };
const sof = (w, h) => seg(0xC0, Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]));
const scan = tag => Buffer.concat([seg(0xDA, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 63, 0])), Buffer.from('BILDDATEN-' + tag, 'latin1'), Buffer.from([0xFF, 0xD9])]);
function jpeg(o) {
  o = o || {};
  const parts = [Buffer.from([0xFF, 0xD8]), seg(0xE0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'))];
  if (o.tiff) parts.push(seg(0xE1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), o.tiff])));
  if (o.xmp) parts.push(seg(0xE1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta><exif:GPSLatitude>47,33.6N</exif:GPSLatitude></x:xmpmeta>', 'latin1')));
  if (o.iptc) parts.push(seg(0xED, Buffer.from('Photoshop 3.0\0 8BIM Ort: Oberstdorf', 'latin1')));
  parts.push(sof(o.w || 32, o.h || 24), scan(o.tag || 'x'));
  return new Uint8Array(Buffer.concat(parts));
}
const R = (z, n) => [z, n === undefined ? 1 : n];
const fullTiff = le => tiff(le,
  [{ tag: 0x0112, type: 3, v: [6] }, { tag: 0x010F, type: 2, v: 'Kamera' }],
  [{ tag: 0x9003, type: 2, v: '2026:12:31 15:42:07' }, { tag: 0x9011, type: 2, v: '-03:30' }, { tag: 0x9291, type: 2, v: '0457' }],
  [{ tag: 1, type: 2, v: 'S' }, { tag: 2, type: 5, v: [R(47), R(33), R(3600, 100)] }, { tag: 3, type: 2, v: 'W' }, { tag: 4, type: 5, v: [R(10), R(13), R(12)] }]);
/* Von Pillow 12.3 geschrieben (Motorola-Reihenfolge): 24×16, Ausrichtung 6, 2026:12:31 15:42:07, +01:00, Bruchteil 250,
   GPS N 47° 33' 36" = 47,56, E 10° 13' 12" = 10,22 */
const PIL = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/4QD6RXhpZgAATU0AKgAAAAgABAEPAAIAAAAIAAAAPgESAAMAAAABAAYAAIdpAAQAAAABAAAARoglAAQAAAABAAAAjAAAAABUZXN0Q2FtAAADkAMAAgAAABQAAABwkBEAAgAAAAcAAACEkpEAAgAAAAQyNTAAAAAAADIwMjY6MTI6MzEgMTU6NDI6MDcAKzAxOjAwAAAABAABAAIAAAACTgAAAAACAAUAAAADAAAAwgADAAIAAAACRQAAAAAEAAUAAAADAAAA2gAAAAAAAAAvAAAAAQAAACEAAAABAAAAJAAAAAEAAAAKAAAAAQAAAA0AAAABAAAADAAAAAH/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAQABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCSiiivGPWCiiigD//Z', 'base64'));
const near = (a, b, eps) => Math.abs(a - b) < (eps || 1e-9);
const sha = u => nodeCrypto.createHash('sha256').update(u).digest('hex');
const afterSos = u => { const b = Buffer.from(u); return b.subarray(b.indexOf(Buffer.from([0xFF, 0xDA]))); };

/* Test-Codec: „dekodiert“ über die SOF-Maße (HEIC: feste Größe), „kodiert“ ein kleines JPEG der verlangten Größe
   ohne EXIF; der Bildinhalt hängt von der Quelle ab, damit verschiedene Bilder verschiedene Prüfsummen haben. */
function codec(o) {
  o = o || {};
  return {
    decoded: 0, closed: 0,
    async decode(bytes, type) {
      this.decoded++;
      if (o.decodeFail) throw new Error('kaputt');
      const e = P.readExif(bytes), self = this;
      const size = type === 'image/heic' ? { w: 4032, h: 3024 } : P.orientedSize(e.width, e.height, e.orientation);
      return { w: size.w, h: size.h, img: sha(bytes).slice(0, 12), close() { self.closed++; } };
    },
    async encode(src, w, h) {
      if (o.png) return new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0]);
      const s = o.lie ? { w: w + 1, h } : { w, h };
      return jpeg({ w: s.w, h: s.h, tag: src.img + '-' + w + 'x' + h });
    }
  };
}

let finished = false;
process.on('exit', () => { if (!finished) { console.error('tests/photostore.cjs: nicht bis zum Ende gelaufen (hängendes Promise?)'); process.exitCode = 1; } });
(async () => {
  /* 1. SHA-256: Prüfvektoren, Vergleich mit Node-crypto an Blockgrenzen, Web Crypto und Rückfall gleich */
  assert.equal(P.sha256Sync(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(P.sha256Sync(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(P.sha256Sync(Buffer.from('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  for (let n = 0; n <= 300; n++) { const b = nodeCrypto.randomBytes(n); assert.equal(P.sha256Sync(b), sha(b), 'Länge ' + n); }
  { const big = nodeCrypto.randomBytes(3 * 1024 * 1024 + 17); assert.equal(P.sha256Sync(big), sha(big), '3 MB'); }
  { const b = nodeCrypto.randomBytes(1000);
    assert.equal(await P.sha256(b, { subtle: null }), sha(b), 'Rückfall ohne crypto.subtle (http im WLAN)');
    assert.equal(await P.sha256(b, { subtle: globalThis.crypto.subtle }), sha(b), 'Web Crypto');
    assert.equal(await P.sha256(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), { subtle: null }), sha(b), 'ArrayBuffer');
    assert.equal(await P.sha256(b, { subtle: { digest: () => Promise.reject(new Error('nein')) } }), sha(b), 'Fehler in Web Crypto: gleiches Ergebnis über den Rückfall'); }

  /* 2. Dateiart an den Bytes */
  assert.equal(P.sniff(jpeg()), 'image/jpeg');
  assert.equal(P.sniff(PIL), 'image/jpeg');
  assert.equal(P.sniff(Buffer.from('89504e470d0a1a0a0000', 'hex')), 'image/png');
  assert.equal(P.sniff(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic0000', 'latin1')])), 'image/heic');
  assert.equal(P.sniff(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypmif10000', 'latin1')])), 'image/heic');
  assert.equal(P.sniff(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypavif0000', 'latin1')])), 'image/avif');
  assert.equal(P.sniff(Buffer.from('RIFF0000WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(P.sniff(Buffer.from('GIF89a', 'latin1')), 'image/gif');
  assert.equal(P.sniff(Buffer.from('%PDF-1.7', 'latin1')), null);
  assert.equal(P.sniff(new Uint8Array([0xFF, 0xD8])), null, 'zu kurz');
  assert.throws(() => P.sniff('text'), /Bytes erwartet/);

  /* 3. EXIF lesen: beide Bytereihenfolgen, Pillow-Datei, fehlende und kaputte Angaben */
  for (const le of [true, false]) {
    const e = P.readExif(jpeg({ tiff: fullTiff(le), w: 4032, h: 3024 }));
    assert.equal(e.orientation, 6, 'Ausrichtung ' + le);
    assert.equal(e.takenAt, '2026-12-31T15:42:07.045-03:30', 'Zeit mit Bruchteil (abgeschnitten auf ms) und Versatz');
    assert(near(e.gps.lat, -(47 + 33 / 60 + 36 / 3600)) && near(e.gps.lon, -(10 + 13 / 60 + 12 / 3600)), 'Süd/West negativ');
    assert.deepEqual([e.width, e.height], [4032, 3024], 'SOF-Maße');
    assert(e.hasExif && !e.hasXmp && !e.warnings.length, JSON.stringify(e.warnings));
  }
  { const e = P.readExif(PIL);
    assert.equal(e.orientation, 6); assert.equal(e.takenAt, '2026-12-31T15:42:07.250+01:00');
    assert(near(e.gps.lat, 47.56) && near(e.gps.lon, 10.22), JSON.stringify(e.gps));
    assert.deepEqual([e.width, e.height], [24, 16]);
    assert.equal(V4.normalizeMedia({ id: 'fpil1', takenAt: e.takenAt, w: 24, h: 16, bytes: PIL.length, sha256: sha(PIL), lat: e.gps.lat, lon: e.gps.lon }).takenAt, e.takenAt, 'Vertrag v4'); }
  { const e = P.readExif(jpeg());
    assert.deepEqual([e.orientation, e.takenAt, e.gps, e.hasExif], [null, null, null, false], 'ohne EXIF nichts erfunden'); }
  { const e = P.readExif(jpeg({ tiff: tiff(true, [], [{ tag: 0x9003, type: 2, v: '2026:12:31 08:00:00' }]) }));
    assert.equal(e.takenAt, '2026-12-31T08:00:00', 'ohne Versatz bleibt es Ortszeit, keine erfundene Zone'); assert.equal(e.gps, null); }
  { /* nur Änderungszeit (0x0132) ist keine Aufnahmezeit */
    const e = P.readExif(jpeg({ tiff: tiff(true, [{ tag: 0x0132, type: 2, v: '2026:12:31 08:00:00' }], [{ tag: 0x9004, type: 2, v: '2026:12:31 08:00:00' }]) }));
    assert.equal(e.takenAt, null); }
  for (const [raw, want] of [['0000:00:00 00:00:00', null], ['2026:02:30 10:00:00', null], ['2026:12:31 24:00:00', null], ['    :  :     :  :  ', null], ['2026:12:31 23:59:59', '2026-12-31T23:59:59']])
    assert.equal(P.exifTime(raw), want, raw);
  assert.equal(P.exifTime('2026:12:31 10:00:00', '12', '+15:00'), '2026-12-31T10:00:00.12', 'unmöglicher Versatz wird weggelassen');
  assert.equal(P.exifTime('2026:12:31 10:00:00', 'ab', '+02:00'), '2026-12-31T10:00:00+02:00');
  { /* GPS: Nenner 0, fehlende Richtung, außerhalb des Bereichs → kein Standort */
    const g = (lat, ref) => P.readExif(jpeg({ tiff: tiff(true, [], null, [ref ? { tag: 1, type: 2, v: ref } : null, { tag: 2, type: 5, v: lat }, { tag: 3, type: 2, v: 'E' }, { tag: 4, type: 5, v: [R(10), R(0), R(0)] }].filter(Boolean)) }));
    assert.equal(g([R(47), R(1, 0), R(0)], 'N').gps, null, 'Nenner 0');
    assert.equal(g([R(47), R(0), R(0)], null).gps, null, 'ohne N/S unbekannt statt geraten');
    assert.equal(g([R(95), R(0), R(0)], 'N').gps, null, 'über 90°');
    assert(g([R(95), R(0), R(0)], 'N').warnings.length);
    assert(near(g([R(47), R(30), R(0)], 'N').gps.lat, 47.5)); }
  { /* Verweisschleife und Zeiger ins Leere: kein Absturz */
    const t = Buffer.from(tiff(true, [{ tag: 0x0112, type: 3, v: [3] }], [{ tag: 0x9003, type: 2, v: '2026:12:31 08:00:00' }]));
    const e8 = Buffer.from(t); e8.writeUInt32LE(8, 8 + 2 + 12 * 1 + 8);   /* Exif-Zeiger zeigt auf IFD0 */
    assert.doesNotThrow(() => P.readExif(jpeg({ tiff: e8 })));
    const far = Buffer.from(t); far.writeUInt32LE(0x7FFFFFF0, 8 + 2 + 12 * 1 + 8);
    const r = P.readExif(jpeg({ tiff: far }));
    assert.equal(r.takenAt, null); assert.equal(r.orientation, 3); assert(r.warnings.some(w => /unlesbar/.test(w))); }
  { /* Zufallsfehler: nie werfen, Aufnahmezeit immer vertragsgemäß oder null, Standort im Bereich oder null */
    const base = [jpeg({ tiff: fullTiff(true) }), jpeg({ tiff: fullTiff(false), xmp: true }), PIL];
    let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let k = 0; k < 3000; k++) {
      const b = base[k % 3].slice(), n = 1 + rnd(6);
      for (let j = 0; j < n; j++) b[rnd(Math.min(b.length, 300))] = rnd(256);
      const cut = rnd(4) === 0 ? b.subarray(0, rnd(b.length)) : b;
      const e = P.readExif(cut);
      if (e.takenAt) V4.normalizeMedia({ id: 'fuzz1', takenAt: e.takenAt, w: 1, h: 1, bytes: 1, sha256: 'a'.repeat(64) });
      if (e.gps) assert(Math.abs(e.gps.lat) <= 90 && Math.abs(e.gps.lon) <= 180);
      if (e.orientation != null) assert(e.orientation >= 1 && e.orientation <= 8);
      /* Standort entfernen: entweder Ablehnung oder sicher ohne Standort */
      let out = null; try { out = P.removeLocation(cut); } catch (x) { assert(/Standort entfernen/.test(x.message), x.message); }
      if (out) { const c = P.readExif(out.bytes); assert(!c.gps && !c.gpsEntries && !c.hasXmp && !c.hasIptc); }
    }
  }
  assert.doesNotThrow(() => P.readExif(new Uint8Array(0)));
  assert(/nur aus JPEG/.test(P.readExif(Buffer.from('89504e470d0a1a0a0000', 'hex')).warnings[0]));

  /* 4. Standort entfernen */
  for (const src of [jpeg({ tiff: fullTiff(true), xmp: true, iptc: true, tag: 'a' }), jpeg({ tiff: fullTiff(false), tag: 'b' }), PIL]) {
    const before = src.slice(), r = P.removeLocation(src), e = P.readExif(r.bytes), e0 = P.readExif(src);
    assert.deepEqual(src, before, 'Eingabe unverändert');
    assert.equal(e.gps, null, 'kein GPS'); assert(!e.hasXmp && !e.hasIptc);
    assert(e0.gpsEntries >= 4 && e.gpsEntries === 0, 'GPS-Verzeichnis geleert (auch Richtungsangaben)');
    assert.equal(e.takenAt, e0.takenAt, 'Aufnahmezeit bleibt'); assert.equal(e.orientation, e0.orientation, 'Ausrichtung bleibt');
    assert.deepEqual([e.width, e.height], [e0.width, e0.height]);
    assert(r.removed.gps && !r.removed.exif);
    assert.deepEqual(afterSos(r.bytes), afterSos(src), 'Bilddaten unverändert');
    assert(!Buffer.from(r.bytes).includes(Buffer.from('Oberstdorf')) && !Buffer.from(r.bytes).includes(Buffer.from('GPSLatitude')));
    /* keine Reste der Koordinaten (Rationals 47/1, 33/1) im Datenbereich */
    const t0 = Buffer.from(r.bytes); assert(!t0.includes(Buffer.from([0, 0, 0, 47, 0, 0, 0, 1])) && !t0.includes(Buffer.from([47, 0, 0, 0, 1, 0, 0, 0])), 'GPS-Werte überschrieben');
  }
  { const clean = jpeg({ tag: 'c' }); const r = P.removeLocation(clean); assert.deepEqual(r.bytes, clean, 'ohne Metadaten bleibt die Datei gleich'); assert(!r.removed.gps); }
  { /* EXIF mit kaputtem GPS-Verzeichnis: ganzes EXIF fällt weg, statt Reste zu riskieren */
    const t = Buffer.from(fullTiff(true)), n0 = t.readUInt16LE(8);
    for (let k = 0; k < n0; k++) { const p = 10 + 12 * k; if (t.readUInt16LE(p) === 0x8825) t.writeUInt32LE(0x7FFFFFF0, p + 8); }
    const r = P.removeLocation(jpeg({ tiff: t }));
    assert(r.removed.exif); assert.equal(P.readExif(r.bytes).hasExif, false); }
  assert.throws(() => P.removeLocation(Buffer.from('89504e470d0a1a0a0000', 'hex')), /nur JPEG/);
  assert.throws(() => P.removeLocation(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, 0xFF, 0xFF, 1])), /beschädigt/);

  /* 5. Größen */
  assert.deepEqual(P.fitSize(4032, 3024, 2048), { w: 2048, h: 1536, scaled: true });
  assert.deepEqual(P.fitSize(3024, 4032, 2048), { w: 1536, h: 2048, scaled: true });
  assert.deepEqual(P.fitSize(1000, 800, 2048), { w: 1000, h: 800, scaled: false }, 'nie vergrößern');
  assert.deepEqual(P.fitSize(2048, 2048, 2048), { w: 2048, h: 2048, scaled: false });
  assert.deepEqual(P.fitSize(30000, 10, 2048), { w: 2048, h: 1, scaled: true }, 'mindestens 1 px');
  assert.deepEqual(P.orientedSize(4032, 3024, 6), { w: 3024, h: 4032 });
  assert.deepEqual(P.orientedSize(4032, 3024, 3), { w: 4032, h: 3024 });
  assert.deepEqual(P.orientedSize(4032, 3024, null), { w: 4032, h: 3024 });
  { const p = P.planSizes(8064, 6048); assert.deepEqual([p.work.w, p.work.h, p.thumb.w, p.thumb.h], [2048, 1536, 400, 300]); }
  { const p = P.planSizes(300, 200); assert.deepEqual([p.work.w, p.work.h, p.thumb.w, p.thumb.h], [300, 200, 300, 200]); }
  for (const bad of [[0, 10], [10.5, 10], [-1, 5], ['10', 10], [NaN, 1]]) assert.throws(() => P.fitSize(bad[0], bad[1], 2048), /Bildgröße/);
  assert(!('bytes' in P.planSizes(4000, 3000).work), 'keine geschätzten Dateigrößen');

  /* 6. Zuordnungsvorschlag (§6.2) */
  const days = [0, 1, 2, 3, 4].map(i => ({ i, date: ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'][i] }));
  const base = { lat: 47.4, lon: 10.28 }, off = m => ({ lat: base.lat + m / 111195, lon: base.lon });   /* m Meter nach Norden */
  const ctx = {
    days,
    acts: [{ id: 'therme1', days: [1], geo: off(300), catalogSpot: 'therme-x' }, { id: 'rodeln', days: [2], geo: off(100) },
      { id: 'dorf-a', days: [3], ...off(400) }, { id: 'dorf-b', days: [3], ...off(450) }, { id: '__proto__', days: [1], geo: off(10) }, { id: 'ohne-ort', days: [1] }],
    spots: [{ id: 'aussicht-1', ...off(800) }, { id: 'weit-weg', ...off(5000) }]
  };
  const snap = JSON.stringify(ctx);
  { const s = P.suggest({ takenAt: '2026-12-31T14:00:00', gps: base }, ctx);
    assert.deepEqual([s.day, s.dayIndex, s.dayWhy, s.basket, s.actId, s.spotId, s.distanceM, s.placeWhy, s.needsReview], ['2026-12-31', 1, 'datum', false, 'therme1', 'therme-x', 300, 'unternehmung', true]); }
  { const s = P.suggest({ takenAt: '2027-01-01T23:59:00+01:00', lat: base.lat, lon: base.lon }, ctx);
    assert.equal(s.day, '2027-01-01', 'Datum aus der Ortszeit der Aufnahme, nicht UTC'); assert.equal(s.actId, 'rodeln'); }
  { const s = P.suggest({ takenAt: '2027-01-02T10:00:00', gps: base }, ctx);
    assert.equal(s.placeWhy, 'mehrdeutig'); assert.equal(s.actId, null); assert.deepEqual(s.candidates.map(c => c.id), ['dorf-a', 'dorf-b']); }
  { const s = P.suggest({ takenAt: '2026-12-30T10:00:00', gps: base }, ctx);
    assert.equal(s.actId, null, 'Unternehmung eines anderen Tages wird nicht vorgeschlagen'); assert.equal(s.spotId, 'aussicht-1'); assert.equal(s.placeWhy, 'attraktion'); assert.equal(s.distanceM, 800); }
  { const s = P.suggest({ takenAt: '2026-12-30T10:00:00', gps: off(-1500) }, ctx); assert.equal(s.placeWhy, 'nichts-im-umkreis'); assert.equal(s.spotId, null); }
  { const s = P.suggest({ takenAt: '2026-12-30T10:00:00', gps: off(-1500) }, Object.assign({}, ctx, { radiusKm: 3 })); assert.equal(s.spotId, 'aussicht-1'); }
  { const s = P.suggest({ takenAt: '2027-01-05T10:00:00', gps: base }, ctx);
    assert.deepEqual([s.day, s.dayWhy, s.basket, s.actId, s.spotId], [null, 'ausserhalb', true, null, null], 'außerhalb: Korb ohne Tag, kein Ortsvorschlag'); }
  { const s = P.suggest({ takenAt: null, gps: base }, ctx);
    assert.deepEqual([s.day, s.dayWhy, s.basket], [null, 'ohne-zeit', true]); assert.equal(s.actId, 'rodeln', 'ohne Tag: nächste Unternehmung aller Tage, nur als Vorschlag'); }
  { const s = P.suggest({ takenAt: '2026-12-31T10:00:00' }, ctx); assert.deepEqual([s.day, s.placeWhy, s.actId], ['2026-12-31', 'kein-standort', null]); }
  { const flex = { days: [{ i: 0, date: null }, { i: 1, date: null }], acts: [{ id: 'rodeln', days: [1], geo: off(100) }] };
    const s = P.suggest({ takenAt: '2026-12-31T10:00:00', gps: base }, flex);
    assert.deepEqual([s.day, s.dayWhy, s.basket, s.actId], [null, 'ohne-daten', true, 'rodeln'], 'Reise ohne feste Daten: kein geratener Tag'); }
  { const s = P.suggest({ takenAt: 'gestern', gps: base }, ctx); assert.equal(s.dayWhy, 'ohne-zeit'); }
  assert.equal(JSON.stringify(ctx), snap, 'Eingaben unverändert');
  { const L2 = P.reviewList([{ id: 'fb1', takenAt: null }, { id: 'fa1', takenAt: '2026-12-31T10:00:00' }, { id: 'fc1', takenAt: '2026-12-30T09:00:00' }, { id: 'fd1', takenAt: '2028-01-01T09:00:00' }], ctx);
    assert.deepEqual(L2.rows.map(r => r.id), ['fc1', 'fa1']); assert.deepEqual(L2.basket.map(r => r.id), ['fd1', 'fb1'], 'Korb: mit Zeit zuerst, ohne Zeit zuletzt'); }
  { const entry = V4.normalizeMedia({ id: 'fapp1', takenAt: '2026-12-31T14:00:00', w: 2048, h: 1536, bytes: 400000, sha256: 'b'.repeat(64) });
    const s = P.suggest({ takenAt: entry.takenAt, gps: base }, ctx);
    assert.throws(() => P.applyChoice(entry, s), /Bestätigung/, 'nie stillschweigend');
    assert.throws(() => P.applyChoice(entry, s, { confirmed: 'ja' }), /Bestätigung/);
    const ok = P.applyChoice(entry, { day: s.day, actId: s.actId, spotId: s.spotId }, { confirmed: true });
    assert.deepEqual([ok.day, ok.actId, ok.spotId], ['2026-12-31', 'therme1', 'therme-x']); assert.equal(entry.day, null, 'Original unverändert');
    V4.validateMedia([ok]);
    const back = P.applyChoice(ok, { day: null, actId: null, spotId: null }, { confirmed: true });
    assert.deepEqual([back.day, 'actId' in back, 'spotId' in back], [null, false, false], 'Zuordnung wieder lösen');
    assert.throws(() => P.applyChoice(entry, { day: '31.12.2026' }, { confirmed: true }), /Tag muss/, 'Vertrag prüft die Wahl'); }

  /* 7. Import (Test-Codec) */
  const src = jpeg({ tiff: fullTiff(true), xmp: true, w: 4032, h: 3024, tag: 'foto1' });
  { const c = codec(), r = await P.prepare({ bytes: src }, { id: 'fimp1', ctx }, c);
    assert.deepEqual([r.entry.w, r.entry.h], [1536, 2048], 'hochkant nach Ausrichtung 6');
    assert.deepEqual([r.files.thumb.w, r.files.thumb.h], [300, 400]);
    assert.equal(r.entry.bytes, r.files.work.bytes.length, 'Dateigröße gemessen, nicht geschätzt');
    assert.equal(r.entry.sha256, sha(r.files.work.bytes), 'Prüfsumme der Arbeitskopie');
    assert.equal(r.entry.takenAt, '2026-12-31T15:42:07.045-03:30');
    assert(!('lat' in r.entry), 'Standort intern nur auf Wunsch'); assert.equal(r.exif.hasGps, true);
    assert.equal(r.files.original, undefined, 'Original standardmäßig nicht gespeichert');
    assert.equal(r.suggestion.day, '2026-12-31'); assert.equal(r.entry.day, null, 'Vorschlag wird nicht eingetragen');
    assert.deepEqual(P.readExif(r.files.work.bytes).hasExif, false);
    V4.validateMedia([r.entry]); assert.deepEqual(V4.normalizeMedia(r.entry), r.entry, 'Eintrag ist bereits normalisiert');
    assert.equal(c.closed, 1, 'Dekodiertes Bild freigegeben');
    const again = await P.prepare({ bytes: src }, { id: 'fimp2', existing: [r.entry] }, codec());
    assert.equal(again.duplicate, 'fimp1', 'doppelter Import erkannt'); assert(!again.entry); }
  { const r = await P.prepare({ bytes: src }, { id: 'fimp3', keepOriginal: true }, codec());
    const o = P.readExif(r.files.original.bytes);
    assert.equal(o.gps, null, 'Original ohne Standort'); assert(!o.hasXmp); assert.equal(o.takenAt, '2026-12-31T15:42:07.045-03:30'); }
  { const r = await P.prepare({ bytes: src }, { id: 'fimp4', keepOriginal: true, keepLocation: true }, codec());
    assert.deepEqual(r.files.original.bytes, src, 'mit ausdrücklicher Wahl unverändert');
    assert(near(r.entry.lat, -(47 + 33 / 60 + 36 / 3600))); V4.validateMedia([r.entry]); }
  { const r = await P.prepare({ arrayBuffer: async () => PIL.buffer.slice(PIL.byteOffset, PIL.byteOffset + PIL.length) }, { id: 'fimp5' }, codec());
    assert.deepEqual([r.entry.w, r.entry.h], [16, 24], 'kleines Bild nicht vergrößert, Ausrichtung beachtet'); }
  { const heic = new Uint8Array(Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic0000', 'latin1'), Buffer.alloc(40)]));
    const r = await P.prepare({ bytes: heic }, { id: 'fimp6', keepOriginal: true }, codec());
    assert.equal(r.files.original, undefined); assert(r.notes.some(n => /Original nicht gespeichert/.test(n)));
    assert.equal(r.entry.takenAt, null); assert(r.notes.some(n => /Korb/.test(n)));
    assert.deepEqual([r.entry.w, r.entry.h], [2048, 1536]);
    await assert.rejects(() => P.prepare({ bytes: heic }, { id: 'fimp7' }, codec({ decodeFail: true })), /HEIC kann dieser Browser nicht lesen/); }
  await assert.rejects(() => P.prepare({ bytes: Buffer.from('%PDF-1.7 xxxxxxx') }, { id: 'fimp8' }, codec()), /kein unterstütztes Bildformat/);
  await assert.rejects(() => P.prepare({ bytes: src }, { id: 'fimp9' }, codec({ png: true })), /kein JPEG/);
  await assert.rejects(() => P.prepare({ bytes: src }, { id: 'fimp9' }, {}), /Codec fehlt/);
  await assert.rejects(() => P.prepare({ bytes: src }, { id: 'Falsch' }, codec()), /ungültige ID/);
  { const r = await P.prepare({ bytes: src }, { id: 'fimp10' }, codec({ lie: true }));
    assert.deepEqual([r.entry.w, r.entry.h], [1537, 2048], 'Maße aus der erzeugten Datei, nicht aus der Anforderung'); }
  { let k = 0; const id = P.newId({ random: b => b.fill(k++ * 7) }); assert(/^[a-z][a-z0-9]{3,40}$/.test(id), id);
    assert(/^[a-z][a-z0-9]{3,40}$/.test(P.newId())); assert.notEqual(P.newId(), P.newId()); }

  /* 8. Ablage in IndexedDB */
  const idb = fakeIDB(), now = () => '2026-10-19T08:00:00.000Z';
  const S = P.create({ indexedDB: () => idb, now, timeoutMs: 200 });
  const imp = await P.prepare({ bytes: src }, { id: 'fsto1', keepOriginal: true }, codec());
  { const w = await S.put('fsto1', imp.files);
    assert.deepEqual(w.variants, ['work', 'thumb', 'original']);
    assert.equal(w.bytes, imp.files.work.bytes.length + imp.files.thumb.bytes.length + imp.files.original.bytes.length);
    assert.deepEqual(idb.opened, ['rp-media'], 'eigene Datenbank, „reiseplaner“ wird nicht geöffnet');
    const g = await S.get('fsto1', 'work');
    assert.deepEqual(new Uint8Array(g.bytes), imp.files.work.bytes); assert(g.bytes instanceof ArrayBuffer);
    assert.deepEqual([g.type, g.size, g.w, g.h, g.sha256, g.at, g.damaged], ['image/jpeg', imp.files.work.bytes.length, 1536, 2048, imp.entry.sha256, now(), false]);
    assert.deepEqual(new Uint8Array((await S.get('fsto1', 'thumb')).bytes), imp.files.thumb.bytes);
    assert.deepEqual(await S.has('fsto1'), { work: true, thumb: true, original: true });
    assert.equal(await S.get('fsto1', 'egal').catch(e => e.message), 'Fotoablage: unbekannte Variante.');
    assert.equal(await S.get('fnix1', 'work'), null);
    assert.deepEqual(await S.check('fsto1'), { ok: true, damaged: [], missing: [] });
    /* gleiches Bild erneut ohne Original: Original bleibt */
    await S.put('fsto1', { work: imp.files.work, thumb: imp.files.thumb });
    assert.deepEqual(await S.has('fsto1'), { work: true, thumb: true, original: true }, 'erneutes Speichern löscht kein Original'); }
  { const other = await P.prepare({ bytes: jpeg({ w: 800, h: 600, tag: 'anderes' }) }, { id: 'fsto2' }, codec());
    await assert.rejects(() => S.put('fsto1', other.files), /schon ein anderes Bild/, 'kein stilles Überschreiben');
    assert.deepEqual(new Uint8Array((await S.get('fsto1', 'work')).bytes), imp.files.work.bytes, 'altes Bild unverändert');
    await S.put('fsto1', other.files, { replace: true });
    assert.deepEqual(await S.has('fsto1'), { work: true, thumb: true, original: false }, 'Ersetzen nimmt das alte Original mit');
    await S.put('fsto1', imp.files, { replace: true });
    await S.put('fsto2', other.files); }
  { const u = await S.usage();
    assert.equal(u.photos, 2); assert.equal(u.work.count, 2); assert.equal(u.original.count, 1);
    assert.equal(u.bytes, u.work.bytes + u.thumb.bytes + u.original.bytes);
    assert.equal(u.work.bytes, imp.files.work.bytes.length + (await S.get('fsto2', 'work')).size, 'gemessene Größen');
    assert.deepEqual(await S.ids(), ['fsto1', 'fsto2']); }
  { const trips = [{ id: 't1', media: [{ id: 'fsto1' }, { id: 'fweg1' }] }, { id: 't2' }, null];
    assert.deepEqual(await S.orphans(trips), ['fsto2'], 'Datei ohne Eintrag wird nur gemeldet');
    assert.deepEqual(await S.missing(trips), ['fweg1'], 'Eintrag ohne Datei auf diesem Gerät');
    assert.deepEqual(await S.ids(), ['fsto1', 'fsto2'], 'nichts automatisch gelöscht'); }
  { await S.removeVariant('fsto1', 'original');
    assert.deepEqual(await S.has('fsto1'), { work: true, thumb: true, original: false });
    await assert.rejects(() => S.removeVariant('fsto1', 'work'), /nur zusammen/);
    await S.remove('fsto2'); assert.deepEqual(await S.has('fsto2'), { work: false, thumb: false, original: false });
    assert.deepEqual(idb.keys('data'), ['fsto1:thumb', 'fsto1:work']); }
  { /* Kontingent beim zweiten Schreibvorgang: nichts Halbes, Ablehnung mit Grund */
    const x = await P.prepare({ bytes: jpeg({ w: 900, h: 600, tag: 'voll' }) }, { id: 'fsto3' }, codec());
    let n = 0; idb.fail = ({ op, store }) => op === 'put' && store === 'data' && ++n === 2 ? Object.assign(new Error('voll'), { name: 'QuotaExceededError' }) : null;
    await assert.rejects(() => S.put('fsto3', x.files), e => e.name === 'QuotaExceededError' && /Speicherplatz für Fotos erschöpft/.test(e.message));
    idb.fail = null;
    assert.deepEqual(await S.has('fsto3'), { work: false, thumb: false, original: false }, 'alle Varianten oder keine');
    /* Rücklesevergleich: verfälschte Daten → kein Erfolg, nichts bleibt liegen */
    idb.tamper = ({ store, value }) => { if (store === 'data' && value.key === 'fsto3:thumb') new Uint8Array(value.bytes)[5] ^= 1; return value; };
    await assert.rejects(() => S.put('fsto3', x.files), e => e.name === 'DataError' && /Rücklesevergleich/.test(e.message) && /thumb/.test(e.message));
    idb.tamper = null;
    assert.deepEqual(await S.has('fsto3'), { work: false, thumb: false, original: false });
    /* Beschädigung später erkennen */
    await S.put('fsto3', x.files);
    const rec = idb.dbs['rp-media'].stores.data.data.get('fsto3:work'); new Uint8Array(rec.bytes)[3] ^= 1;
    assert.deepEqual(await S.check('fsto3'), { ok: false, damaged: ['work'], missing: [] });
    idb.dbs['rp-media'].stores.data.data.get('fsto3:thumb').bytes = new ArrayBuffer(3);
    assert.equal((await S.get('fsto3', 'thumb')).damaged, true, 'abweichende Größe gemeldet'); }
  { /* Eingaben */
    await assert.rejects(() => S.put('X1', imp.files), /ungültige Foto-ID/);
    await assert.rejects(() => S.put('fsto4', { work: imp.files.work }), /Pflicht/);
    await assert.rejects(() => S.put('fsto4', { work: imp.files.work, thumb: { bytes: new Uint8Array(0) } }), /leere Datei/);
    await assert.rejects(() => S.get('a:b', 'work'), /ungültige Foto-ID/); }
  { /* Öffnen scheitert: immer Ablehnung mit Grund */
    const a = fakeIDB(); a.openFail = Object.assign(new Error('x'), { name: 'InvalidStateError' });
    await assert.rejects(() => P.create({ indexedDB: () => a }).open(), /in diesem Browsermodus nicht nutzbar/);
    await assert.rejects(() => P.create({ indexedDB: () => null }).put('fsto5', imp.files), /IndexedDB fehlt/);
    await assert.rejects(() => P.create({ indexedDB: () => { throw Object.assign(new Error('y'), { name: 'SecurityError' }); } }).ids(), /nicht nutzbar/);
    const h = fakeIDB(); h.hang = true;
    await assert.rejects(() => P.create({ indexedDB: () => h, timeoutMs: 30 }).open(), /Zeitüberschreitung/);
    const v = fakeIDB(); v.dbs['rp-media'] = { version: 9, stores: {}, lock: Promise.resolve() };
    await assert.rejects(() => P.create({ indexedDB: () => v }).open(), /neueren App-Version/); }
  { /* zweite Instanz (zweiter Tab) sieht dieselben Dateien */
    const S2 = P.create({ indexedDB: () => idb, now });
    assert.deepEqual(await S2.ids(), ['fsto1', 'fsto3']); S2.close(); S.close();
    assert.deepEqual(await S.ids(), ['fsto1', 'fsto3'], 'nach close() neu geöffnet'); }
  { /* Browserangabe ist als Schätzung gekennzeichnet */
    const e = await P.create({ indexedDB: () => idb, navigator: { storage: { estimate: async () => ({ usage: 10, quota: 100 }) } } }).estimate();
    assert.deepEqual(e, { usage: 10, quota: 100, source: 'browser-schaetzung' });
    assert.equal(await P.create({ indexedDB: () => idb, navigator: {} }).estimate(), null); }

  /* 9. Vertrag: eine v4-Reise mit importierten Fotos besteht die Prüfung von v4logic.js */
  { const list = [];
    for (const [i, t] of ['a', 'b', 'c'].entries()) list.push((await P.prepare({ bytes: jpeg({ tiff: fullTiff(i % 2 === 0), w: 3000 + i, h: 2000, tag: t }) }, { id: 'fv' + t + '01', keepLocation: i === 1 }, codec())).entry);
    V4.validateMedia(list);
    const trip = { id: 'reise1', title: 'Test', schemaVersion: 4, media: list, books: [] };
    assert.equal(V4.needsV4(trip), true); assert.equal(V4.stripLocation(list).some(m => 'lat' in m), false); }

  finished = true;
  console.log('RPPhotos: SHA-256 (mit und ohne Web Crypto), Dateiart, EXIF-Leser (II/MM, Pillow-Datei, kaputte Daten, 3000 Zufallsfehler), Standort entfernen (GPS, XMP, IPTC; Bilddaten unverändert), Größen 2048/400 ohne Vergrößern, Zuordnungsvorschlag nur mit Bestätigung, Import mit Test-Codec (Maße und Bytes gemessen, Doppelimport, Original optional ohne Standort), IndexedDB-Ablage rp-media (atomar, Kontingent, Rücklesevergleich, kein stilles Überschreiben, Waisen/fehlende Dateien) und v4-Vertrag geprüft (Node, In-Memory-IndexedDB; kein Browser-, Canvas- oder iPhone-Test).');
})().catch(e => { console.error(e); process.exit(1); });
