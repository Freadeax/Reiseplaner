/* Foto-Import und Fotoansicht (Paket 8, PLAN_IOS_APP §6.1–6.2): app/fotos.js in Node mit kleiner DOM-Attrappe.
   Geprüft: Sperre ohne Format 4 (mediaCommit), Import nacheinander mit echtem RPPhotos.prepare und Test-Codec,
   Ablage vor dem Speichern, Doppelte, Fehler je Datei, Prüfliste „passt / ändern“ mit Korb „ohne Tag“, Speichern nur über
   mediaCommit (Stub von Paket 7) mit bestätigter Wahl, Fehlschlag lässt die Liste offen, Abbrechen räumt die Ablage,
   Ansicht je Tag, Ort als Text und Kartenlink, Hinweis „keine Sicherung“, Reisebuch-URL, Löschen mit Bestätigung.
   Kein Browser-, Canvas-, Safari- oder iPhone-Test. Test-JPEG-Helfer übernommen aus tests/photostore.cjs. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const nodeCrypto = require('crypto');
const P = require('../photostore.js');
const V4 = require('../v4logic.js');
const C = x => JSON.parse(JSON.stringify(x));
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const FOTOS_JS = fs.readFileSync(__dirname + '/../app/fotos.js', 'utf8');
const INTEGRATED = html.includes('<script src="app/fotos.js"></script>');
if (INTEGRATED) assert(html.indexOf('app/fotos.js') > html.indexOf('app/reisebuch.js') && html.indexOf('app/fotos.js') < html.indexOf('app/start.js'), 'Ladereihenfolge: nach reisebuch.js, vor start.js');

/* ---------- Test-JPEGs (aus tests/photostore.cjs) ---------- */
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
const sha = u => nodeCrypto.createHash('sha256').update(u).digest('hex');
/* Foto mit Aufnahmezeit (Ortszeit) und optional GPS (Nord/Ost, Dezimalgrad) */
function photo(when, gps, tag) {
  const dms = v => { const d = Math.floor(v), m = Math.floor((v - d) * 60), s = Math.round(((v - d) * 60 - m) * 60 * 100); return [R(d), R(m), R(s, 100)]; };
  return jpeg({ w: 3000, h: 2000, tag, tiff: tiff(true, [{ tag: 0x010F, type: 2, v: 'Kamera' }], when ? [{ tag: 0x9003, type: 2, v: when }] : [{ tag: 0x010F, type: 2, v: 'x' }],
    gps ? [{ tag: 1, type: 2, v: 'N' }, { tag: 2, type: 5, v: dms(gps[0]) }, { tag: 3, type: 2, v: 'E' }, { tag: 4, type: 5, v: dms(gps[1]) }] : null) });
}
function codec() {
  return {
    async decode(bytes) { const e = P.readExif(bytes); return { w: e.width, h: e.height, img: sha(bytes).slice(0, 12) }; },
    async encode(src, w, h) { return jpeg({ w, h, tag: src.img + '-' + w + 'x' + h }); }
  };
}
/* Einfache Ablage mit der Schnittstelle von RPPhotos.create (put/get/remove); fail: Foto-ID → Fehler */
function memStore() {
  const S = { data: new Map(), failPuts: 0, puts: [], removed: [] };
  S.put = async (id, files) => { if (S.failPuts > 0) { S.failPuts--; throw new Error('Fotoablage: Speicher des Browsers ist voll.'); } S.puts.push(id); for (const v of Object.keys(files)) S.data.set(id + ':' + v, { type: files[v].type, bytes: files[v].bytes.slice().buffer, size: files[v].bytes.length }); return { id }; };
  S.get = async (id, v) => { const r = S.data.get(id + ':' + (v || 'work')); return r ? Object.assign({ damaged: false }, r) : null; };
  S.remove = async id => { S.removed.push(id); for (const v of ['work', 'thumb', 'original']) S.data.delete(id + ':' + v); return true; };
  return S;
}

function load() {
  const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '')
    .replace('function closeSheet(){', 'function closeSheet(){return;');
  const memory = new Map(), sheets = [];
  const node = () => ({ innerHTML: '', hidden: false, style: {}, className: '', textContent: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k]; },
    querySelector() { return { style: {}, setAttribute() {} }; }, querySelectorAll() { return []; } });
  const dom = { '#view': node(), '#dock': node(), '#dock-nm': node(), '#dock-bar': node(), '#dock-sum': node(), '#app-nav': node(), '#sheet-root': node() };
  const urls = { made: 0, revoked: 0 };
  const win = { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js'), RPV3J: require('../v3journal.js'), RPV3S: require('../v3split.js'), RPV4: V4, RPPhotos: P,
    RPBook: require('../bookgen.js'), RPBookEdit: require('../bookedit.js') };
  const ctx = {
    window: win, history: { replaceState() {} }, Blob: class { constructor(parts, o) { this.size = parts[0].byteLength; this.type = o.type; } },
    document: { addEventListener() {}, querySelector: s => dom[s] || null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, style: {} }), body: { appendChild() {}, style: {} } },
    localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, console, alert() {}
  };
  vm.createContext(ctx); vm.runInContext(code + (INTEGRATED ? '' : '\n' + FOTOS_JS) + '\n;globalThis.__f={FOTOS,fotosUrls,UI,Store,rbUrl:id=>typeof reisebuchPhotoUrl==="function"?reisebuchPhotoUrl(id):null};', ctx);
  const F = ctx.__f;
  F.FOTOS.store = memStore(); F.FOTOS.codec = codec();
  F.FOTOS.url = { createObjectURL: b => 'blob:t/' + (++urls.made), revokeObjectURL: () => { urls.revoked++; } };
  ctx.openSheet = h => sheets.push(h);
  return { a: win.__app, ctx, F, S: F.FOTOS.store, urls, sheets };
}

/* Reise 30.12.2026–03.01.2027 mit einer Unternehmung mit Ort am 31.12. (Tag 2) */
function trip(a) {
  const t = a.silvesterTemplate();
  t.id = 'tfoto'; t.title = 'Silvester im Schnee';
  t.customActs = (t.customActs || []).concat([{ id: 'cwander', t: 'Winterwanderung am See', cat: 'eigen', geo: { lat: 47.5000, lon: 10.2000 } },
    { id: 'cbad', t: 'Therme', cat: 'eigen', geo: { lat: 47.6000, lon: 10.3000 }, catalogSpot: 'therme-x' }]);
  t.items = (t.items || []).concat([{ uid: 'ufoto1', act: 'cwander', day: 1, slot: 'morgen' }, { uid: 'ufoto2', act: 'cbad', day: 2, slot: 'nachm' }]);
  return t;
}
/* Stub für Paket 7 (Format 4 im Speicher gibt es noch nicht): hängt geprüfte Einträge an und hält die Reise in saved,
   weil Store.put heute noch kein Format 4 schreibt. */
const saved = new Map();
function commitStub(ctx, log) {
  ctx.mediaCommit = (t, entries) => {
    log.push(C(entries));
    const next = C(saved.get(t.id) || t);
    next.media = (next.media || []).concat(entries); next.schemaVersion = 4;
    V4.validateMedia(next.media);
    saved.set(t.id, next);
    return Promise.resolve({ ok: true, trip: next });
  };
  ctx.mediaRemove = (t, id, o) => {
    const r = V4.removeMedia(saved.get(t.id), id, o);
    if (!r.ok) return { ok: false, uses: r.uses, error: 'Foto steckt in einem Reisebuch.' };
    saved.set(t.id, r.trip); return { ok: true, trip: r.trip };
  };
}

let finished = false;
process.on('exit', () => { if (!finished) { console.error('tests/fotos.cjs: nicht bis zum Ende gelaufen'); process.exitCode = 1; } });
(async () => {
  /* 1. Reine Helfer */
  {
    const { ctx, a } = load(), t = trip(a);
    assert.equal(ctx.fotosTime('2026-12-31T15:42:07.250-03:30'), '31.12.2026, 15:42 Uhr', 'Ortszeit der Kamera, keine Umrechnung');
    assert.equal(ctx.fotosTime(null), '');
    assert.equal(ctx.fotosCoords(47.56, 10.22), '47,56000° N, 10,22000° O');
    assert.equal(ctx.fotosCoords(-33.9, -70.5), '33,90000° S, 70,50000° W');
    assert.equal(ctx.fotosCoords(undefined, 3), '', 'ohne Standort kein Text');
    assert.equal(ctx.fotosMapUrl(47.56, 10.22), 'https://www.openstreetmap.org/?mlat=47.56000&mlon=10.22000#map=16/47.56000/10.22000');
    assert.equal(ctx.fotosMapUrl(null, null), '');
    assert.equal(ctx.fotosDayLabel(t, '2026-12-31'), ctx.daysOf(t)[1].label);
    assert.match(ctx.fotosDayLabel(t, '2027-02-01'), /01\.02\.2027 \(außerhalb des Reisezeitraums\)/);
    assert.equal(ctx.fotosDayLabel(t, null), 'Ohne Tag');
    const cx = ctx.fotosCtx(t);
    assert.equal(cx.days.length, 5); assert.equal(cx.days[1].date, '2026-12-31');
    const w = cx.acts.find(x => x.id === 'cwander');
    assert.deepEqual(C(w.days), [1]); assert.equal(w.lat, 47.5);
  }
  /* 2. Ohne Format 4 (kein mediaCommit) ist der Import gesperrt, Hinweis sichtbar, nichts abgelegt */
  {
    const { ctx, a, S, F } = load(), t = trip(a);
    ctx.mediaCommit = undefined; ctx.mediaRemove = undefined; /* App-Version ohne Format 4 nachbilden */
    a.Store.put(t, true);
    const h = ctx.fotosSection(t);
    assert.match(h, /Lokale Fotos sind keine Sicherung/);
    assert.match(h, /erst mit Format 4/);
    assert(!/id="foto-input"/.test(h), 'kein Import-Knopf');
    const r = await ctx.fotosImport(t, [{ name: 'a.jpg', bytes: photo('2026:12:31 10:15:00', [47.5001, 10.2001], 'a') }]);
    assert.equal(r.review, null); assert.equal(S.puts.length, 0, 'nichts abgelegt');
  }
  /* 3. Import: nacheinander, abgelegt, Prüfliste mit Vorschlägen und Korb; noch nichts in der Reise */
  const L = load(), { ctx, a, S, F, urls } = L, log = [];
  commitStub(ctx, log);
  let t = trip(a); a.Store.put(t, true); t = a.Store.get('tfoto');
  {
    const h = ctx.fotosSection(t);
    assert.match(h, /<input type="file" id="foto-input" accept="image\/\*" multiple/);
    assert.match(h, /Lokale Fotos sind keine Sicherung/);
    assert.match(h, /Noch keine Fotos/);
    const files = [
      { name: 'see.jpg', bytes: photo('2026:12:31 10:15:00', [47.5005, 10.2004], 'see') },   // Tag 2, ~60 m von der Wanderung
      { name: 'ohne-zeit.jpg', bytes: photo(null, null, 'nz') },                             // Korb
      { name: 'see-kopie.jpg', bytes: photo('2026:12:31 10:15:00', [47.5005, 10.2004], 'see') }, // gleiches Bild → doppelt
      { name: 'kaputt.pdf', bytes: Buffer.from('%PDF-1.7 xxxxxxxxxx') },                      // Fehler, Rest läuft weiter
      { name: 'feb.jpg', bytes: photo('2027:02:01 12:00:00', [47.5, 10.2], 'feb') },          // außerhalb → Korb
      { name: 'neujahr.jpg', bytes: photo('2027:01:01 09:00:00', null, 'nj') }               // Tag 3 ohne Ort
    ];
    const steps = [];
    const R = await ctx.fotosImport(t, files, s => steps.push(s.done));
    assert.deepEqual(steps, [0, 1, 2, 3, 4, 5], 'eine Datei nach der anderen');
    assert.equal(R.busy, false); assert.equal(R.dups, 1); assert.equal(R.errors.length, 1);
    assert.equal(R.errors[0].name, 'kaputt.pdf'); assert.match(R.errors[0].error, /kein unterstütztes Bildformat/);
    assert.equal(R.review.rows.length, 4);
    assert.equal(S.puts.length, 4, 'vier Fotos in der Ablage');
    assert.equal(a.Store.get('tfoto').media, undefined, 'Reise unverändert vor der Bestätigung');
    const [see, nz, feb, nj] = R.review.rows;
    assert.equal(see.suggestion.day, '2026-12-31'); assert.equal(see.suggestion.actId, 'cwander'); assert.equal(see.mode, 'passt');
    assert.equal(see.entry.lat != null, true, 'Standort bleibt (keepLocation, Entscheidung 19.10.)');
    assert.equal(nz.suggestion.basket, true); assert.equal(nz.mode, 'aendern');
    assert.equal(feb.suggestion.dayWhy, 'ausserhalb');
    assert.equal(nj.suggestion.day, '2027-01-01'); assert.equal(nj.suggestion.actId, null);
    assert(S.data.get(see.entry.id + ':original') === undefined, 'kein Original (keepOriginal false)');
    /* Prüfliste */
    const h2 = ctx.fotosSection(t);
    assert.match(h2, /Zuordnung prüfen · 4 Fotos/);
    assert.match(h2, /Ohne Tag · 2/);
    assert.match(h2, /Winterwanderung am See \(\d+ m entfernt\)/);
    assert.match(h2, /Aufgenommen außerhalb des Reisezeitraums/);
    assert.match(h2, /Keine Aufnahmezeit im Foto/);
    assert.match(h2, /aria-pressed="true">Passt/);
    assert.match(h2, /Nicht übernommen: kaputt\.pdf/);
    assert(!/id="foto-input"/.test(h2), 'während der Prüfung kein zweiter Import');
    assert.match(h2, /Übernehmen und speichern/);
    assert.match(h2, /src="blob:t\/\d+"/, 'Vorschaubilder aus dem Import');
  }
  /* 4. Ändern: eigener Tag und eigene Unternehmung; Korb bleibt ohne Tag, wenn nichts gewählt */
  {
    const R = F.UI.fotos.review, nj = R.rows[3], feb = R.rows[2];
    nj.mode = 'aendern'; nj.choice = { day: '2027-01-01', actId: 'cbad' };
    assert.deepEqual(C(ctx.fotosChoice(t, nj)), { day: '2027-01-01', actId: 'cbad', spotId: 'therme-x' });
    feb.choice = { day: '', actId: '' };
    assert.deepEqual(C(ctx.fotosChoice(t, feb)), { day: null, actId: null, spotId: null });
    assert.deepEqual(C(ctx.fotosChoice(t, R.rows[0])), { day: '2026-12-31', actId: 'cwander', spotId: null });
    assert.deepEqual(C(ctx.fotosChoice(t, R.rows[1])), { day: null, actId: null, spotId: null }, 'Korb ohne Wahl → ohne Tag');
    assert.deepEqual(C(ctx.fotosChoice(t, Object.assign({}, R.rows[2], { mode: 'passt', choice: { day: '2026-12-30' } }))), { day: '2026-12-30', actId: null, spotId: null }, 'Korb hat keinen Vorschlag zum Übernehmen');
  }
  /* 5. Speichern scheitert → Liste bleibt, nichts gelöscht; dann gelingt es */
  {
    const real = ctx.mediaCommit;
    ctx.mediaCommit = async () => ({ ok: false, error: 'Speicher voll.' });
    const r1 = await ctx.fotosCommit(t);
    assert.equal(r1.ok, false); assert.match(F.UI.fotos.review.error, /Speicher voll\. Die Fotos bleiben/);
    assert.equal(S.removed.length, 0, 'Dateien bleiben für den zweiten Versuch');
    ctx.mediaCommit = () => { throw new Error('Netz weg'); };
    assert.equal((await ctx.fotosCommit(t)).ok, false);
    assert.match(ctx.fotosSection(t), /role="alert" data-foto-commit-error>Nicht gespeichert: Netz weg/);
    ctx.mediaCommit = real;
    const r2 = await ctx.fotosCommit(t);
    assert.equal(r2.ok, true, F.UI.fotos.review && F.UI.fotos.review.error); assert.equal(r2.count, 4);
    assert.equal(log.length, 1); assert.equal(log[0].length, 4);
    log[0].forEach(m => V4.normalizeMedia(m));
    assert.equal(log[0][0].day, '2026-12-31'); assert.equal(log[0][0].actId, 'cwander');
    assert.equal(log[0][3].actId, 'cbad'); assert.equal(log[0][3].spotId, 'therme-x');
    assert.equal(log[0][1].day, null); assert.equal(log[0][2].day, null);
    assert.equal(F.UI.fotos.review, null); assert.match(F.UI.fotos.msg, /4 Fotos gespeichert\. 1 doppelte übersprungen/);
  }
  /* 6. Anzeige je Tag, Korb, Tagesspalte, Erinnerungen, Reisebuch-URL */
  t = saved.get('tfoto');
  {
    const G = ctx.fotosByDay(t);
    assert.equal(G.count, 4); assert.equal(G.days[1].photos.length, 1); assert.equal(G.days[2].photos.length, 1); assert.equal(G.basket.length, 2);
    const h = ctx.fotosSection(t);
    assert.match(h, /data-foto-group="2026-12-31"/); assert.match(h, /data-foto-group="ohne-tag"/);
    assert.match(h, /aria-label="Foto vom 31\.12\.2026, 10:15 Uhr bei Winterwanderung am See – ansehen"/);
    assert.match(h, /aria-label="Foto ohne Aufnahmezeit – ansehen"/);
    assert(/<input type="file" id="foto-input"/.test(h), 'Import wieder möglich');
    assert.match(ctx.fotosDayStrip(t, 1), /data-foto-day="2026-12-31"/);
    assert.equal(ctx.fotosDayStrip(t, 0), '', 'Tag ohne Foto: nichts');
    const mem = ctx.fotosMemories([t]);
    assert.match(mem, /Fotos eurer Reisen/); assert.match(mem, /Lokale Fotos sind keine Sicherung/); assert.match(mem, /data-foto-trip="tfoto"/);
    assert.equal(ctx.fotosMemories([trip(a)]), '', 'Reise ohne Fotos erscheint nicht');
    const id = t.media[0].id;
    assert.match(F.rbUrl(id), /^blob:t\//, 'Reisebuch bekommt das Vorschaubild');
    /* Ausgeblendete Fotos erscheinen nicht */
    const hid = C(t); hid.media[0].hidden = true;
    assert.equal(ctx.fotosByDay(hid).count, 3);
    /* Mehr als 4 an einem Tag: „+n weitere“ */
    const many = C(t); for (let i = 0; i < 6; i++) many.media.push(Object.assign(C(t.media[0]), { id: 'fviele' + i, sha256: sha(Buffer.from('v' + i)) }));
    assert.match(ctx.fotosDayStrip(many, 1), /\+3 weitere/);
  }
  /* 7. Nachladen: fehlende Datei auf diesem Gerät, Eintrag bleibt; Platzhalter statt Bild */
  {
    const m = t.media[1];
    F.fotosUrls.clear(); S.data.delete(m.id + ':thumb'); S.data.delete(m.id + ':work');
    assert.match(ctx.fotosThumbInner(m.id), /Foto lädt/);
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    assert.match(ctx.fotosThumbInner(m.id), /Nicht auf diesem Gerät/);
    assert.equal(F.rbUrl(m.id), null);
    assert.match(ctx.fotosThumbInner(t.media[0].id), /Foto lädt|<img/);
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    assert.match(ctx.fotosThumbInner(t.media[0].id), /<img src="blob:t\//);
  }
  /* 8. Fotoblatt: Ort als Text und Kartenlink, Hinweis, Löschen nur mit Bestätigung */
  {
    const m = t.media[0];
    const s = ctx.fotosSheetHtml(t, m);
    assert.match(s, /Winterwanderung am See · 47,50\d+° N, 10,20\d+° O/);
    assert.match(s, /href="https:\/\/www\.openstreetmap\.org\/\?mlat=47\.50\d+&amp;mlon=10\.20\d+#map=16\//);
    assert.match(s, /Export und geteilte Reisebücher entfernen ihn/);
    assert.match(s, /Lokale Fotos sind keine Sicherung/);
    assert.match(s, /data-foto-act="del"/); assert(!/del-yes/.test(s), 'erst nachfragen');
    assert.match(ctx.fotosSheetHtml(t, t.media[1]), /Kein Aufnahmeort gespeichert/);
    F.UI.fotos.del = { id: m.id, error: '' };
    assert.match(ctx.fotosSheetHtml(t, m), /Foto löschen\?.*data-foto-act="del-yes"/s);
    /* Steckt im Reisebuch → mediaRemove verlangt confirm; fotosDelete bestätigt ausdrücklich */
    const r = await ctx.fotosDelete(t, m.id);
    assert.equal(r.ok, true); assert(S.removed.includes(m.id), 'Datei entfernt');
    assert.equal(saved.get('tfoto').media.length, 3);
    assert.match(F.UI.fotos.msg, /Foto gelöscht/);
    /* Fehler bei mediaRemove: nichts an der Datei */
    const before = S.removed.length;
    ctx.mediaRemove = () => ({ ok: false, error: 'nur lesen' });
    const r2 = await ctx.fotosDelete(saved.get('tfoto'), saved.get('tfoto').media[0].id);
    assert.equal(r2.ok, false); assert.equal(S.removed.length, before);
    delete ctx.mediaRemove;
    assert(!/data-foto-act="del"/.test(ctx.fotosSheetHtml(saved.get('tfoto'), saved.get('tfoto').media[0])), 'ohne mediaRemove kein Löschen-Knopf');
  }
  /* 9. Abbrechen räumt die Ablage, Reise bleibt unverändert */
  {
    const t2 = saved.get('tfoto'), n = t2.media.length, removedBefore = S.removed.length;
    const R = await ctx.fotosImport(t2, [{ name: 'neu.jpg', bytes: photo('2026:12:30 18:00:00', null, 'neu') }, { name: 'neu2.jpg', bytes: photo('2026:12:30 19:00:00', null, 'neu2') }]);
    assert.equal(R.review.rows.length, 2);
    const ids = R.review.rows.map(r => r.entry.id);
    const c = await ctx.fotosCancel(t2);
    assert.equal(c.removed, 2); assert.deepEqual(S.removed.slice(removedBefore), ids);
    assert.equal(saved.get('tfoto').media.length, n); assert.equal(F.UI.fotos.review, null);
    assert.match(F.UI.fotos.msg, /Import abgebrochen, nichts gespeichert/);
    /* Ablagefehler eines Fotos: nur dieses fehlt, die anderen kommen in die Prüfliste */
    S.failPuts = 1;
    const R2 = await ctx.fotosImport(t2, [{ name: 'voll.jpg', bytes: photo('2026:12:30 20:00:00', null, 'x1') }, { name: 'ok.jpg', bytes: photo('2026:12:30 21:00:00', null, 'x2') }]);
    assert.equal(R2.review.rows.length, 1); assert.equal(R2.review.rows[0].name, 'ok.jpg');
    assert.deepEqual(C(R2.errors), [{ name: 'voll.jpg', error: 'Fotoablage: Speicher des Browsers ist voll.' }]);
    await ctx.fotosCancel(t2);
  }
  /* 10. Doppelter Import gegen gespeicherte Fotos und gesperrte Reise */
  {
    const t3 = saved.get('tfoto');
    const R = await ctx.fotosImport(t3, [{ name: 'nochmal.jpg', bytes: photo('2027:01:01 09:00:00', null, 'nj') }]);
    assert.equal(R.review, null); assert.equal(R.dups, 1); assert.match(R.msg, /schon in der Reise/);
    ctx.v3CanEdit = () => false;
    assert.match(ctx.fotosBlocked(t3), /nur lesen/);
  }
  /* Integration mit dem echten Paket 7 (app/format4.js): erstes Foto hebt auf Format 4 nur nach Bestätigung, Standort bleibt */
  if (INTEGRATED) {
    const { ctx, a, S } = load();
    let t = trip(a); a.Store.put(t, true); t = a.Store.get('tfoto');
    const before = JSON.stringify(a.Store.get('tfoto'));
    const R = await ctx.fotosImport(t, [{ name: 'see.jpg', bytes: photo('2026:12:31 10:15:00', [47.5005, 10.2004], 'see') }]);
    assert.equal(R.review.rows.length, 1);
    const r1 = await ctx.fotosCommit(t);
    assert.equal(r1.needsConfirm, 'format4', 'erst bestätigen');
    assert.match(ctx.fotosSection(a.Store.get('tfoto')), /data-foto-act="commit-confirm"[^>]*>Umstellen und speichern/);
    assert.match(ctx.fotosSection(a.Store.get('tfoto')), /auf Format 4 umgestellt/);
    assert.equal(JSON.stringify(a.Store.get('tfoto')), before, 'vor der Bestätigung nichts gespeichert');
    const r2 = await ctx.fotosCommit(t, { confirmed: true });
    assert.equal(r2.ok, true, JSON.stringify(r2));
    const saved4 = a.Store.get('tfoto');
    assert.equal(saved4.schemaVersion, 4); assert.equal(saved4.media.length, 1);
    assert.equal(typeof saved4.media[0].lat, 'number', 'Standort bleibt (Philipp 19.10.)');
    assert.equal(S.puts.length, 1);
    /* zweites Foto ohne erneute Rückfrage, Löschen über das echte mediaRemove */
    await ctx.fotosImport(saved4, [{ name: 'nj.jpg', bytes: photo('2027:01:01 09:00:00', null, 'nj') }]);
    assert.equal((await ctx.fotosCommit(a.Store.get('tfoto'))).ok, true);
    assert.equal(a.Store.get('tfoto').media.length, 2);
    const del = await ctx.fotosDelete(a.Store.get('tfoto'), saved4.media[0].id);
    assert.equal(del.ok, true); assert.equal(a.Store.get('tfoto').media.length, 1); assert.equal(a.Store.get('tfoto').schemaVersion, 4);
  }
  finished = true;
  console.log('tests/fotos.cjs: alle Prüfungen bestanden' + (INTEGRATED ? '' : ' (fotos.js noch nicht in index.html, angehängt geladen)'));
})().catch(e => { console.error(e); process.exitCode = 1; });
