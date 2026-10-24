/* Format 4 in der App (Paket 7, SCHEMA_V4 §6): Anhebung nur mit Bestätigung und Feldtreue, Schreibwege für Fotos und
   Reisebücher, keine Rückstufung, toServer/Sicherung/Import, Sync-Grenze des Servers (Format 4 bleibt lokal), ZIP und
   Archiv .reiseplaner mit Fotoablage. Node-Test mit index.html und den echten Logikdateien; Fotoablage und Server sind
   nachgebildet. Kein Browser-, iPhone- oder Datenbanktest. */
const fs = require('fs');
const vm = require('vm');
const zlib = require('zlib');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(/<script src="app\/format4\.js">/.test(html), 'index.html lädt app/format4.js (siehe pakete/format4-app/EINBINDUNG.md)');
/* Schreibweg prüfen: die veröffentlichte Datei kann als Lese-Release F4_WRITE=false tragen. */
const baseCode = require('./app-code.cjs')(html).replace('const F4_WRITE=false;', 'const F4_WRITE=true;').replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const P = require('../photostore.js');
const J = x => JSON.parse(JSON.stringify(x));
const u8 = b => b instanceof Uint8Array ? b : new Uint8Array(b);

/* Nachgebildete Fotoablage mit dem Verhalten von RPPhotos.create(): anderes Bild unter derselben ID wird abgelehnt */
function fakePhotos() {
  const m = new Map();
  return { m,
    async put(id, files) { const sha = await P.sha256(u8(files.work.bytes)); const cur = m.get(id);
      if (cur && cur.sha !== sha) { const e = new Error('Fotoablage: unter dieser ID liegt schon ein anderes Bild.'); e.name = 'ConstraintError'; throw e; }
      m.set(id, { sha, work: u8(files.work.bytes).slice(), thumb: u8(files.thumb.bytes).slice() }); return { id }; },
    async get(id, v) { const r = m.get(id); if (!r) return null; const b = v === 'thumb' ? r.thumb : r.work; return { bytes: b.slice().buffer, size: b.length, damaged: false }; },
    async has(id) { return { work: m.has(id), thumb: m.has(id), original: false }; },
    async remove(id) { m.delete(id); return true; } };
}
/* Nachgebildeter Server wie tests/sync.cjs, mit dem CHECK der Datenbank: vor 20261024060000 schema_version in (2, 3), danach S.allowed = [2, 3, 4] */
function fakeServer() {
  const S = { rows: {}, user: null, calls: [], allowed: [2, 3] };
  const out = (r, u) => ({ id: r.id, data: J(r.data), version: r.version, owner_id: r.owner, deleted_at: r.deleted_at, updated_at: new Date().toISOString(), role: r.members[u] });
  const check = data => { if (!S.allowed.includes(data.schemaVersion)) { const e = new Error('new row for relation "trips" violates check constraint "trips_schema_version_check"'); e.code = '23514'; throw e; } };
  S.api = { enabled: () => true, onAuth() {}, async init() { return S.user ? { id: S.user } : null; }, async signOut() { S.user = null; },
    async listTrips(u) { S.calls.push('list'); return Object.values(S.rows).filter(r => r.members[u]).map(r => out(r, u)); },
    async getTrip(id) { const r = S.rows[id]; return r && r.members[S.user] ? out(r, S.user) : null; },
    async insertTrip(id, data) { S.calls.push('insert ' + id); check(data); if (S.rows[id]) { const e = new Error('duplicate'); e.code = '23505'; throw e; }
      S.rows[id] = { id, data, version: 1, owner: S.user, deleted_at: null, members: { [S.user]: 'owner' } }; return out(S.rows[id], S.user); },
    async updateTrip(id, data, v) { S.calls.push('update ' + id); check(data); const r = S.rows[id]; if (!r || r.version !== v) return null; r.data = data; r.version++; return out(r, S.user); },
    async deleteTrip() { return null; } };
  return S;
}
function makeApp(o) {
  o = o || {};
  const store = o.store || new Map(), alerts = [], photos = fakePhotos(), sheets = [];
  const real = P;
  const RPPhotos = Object.assign({}, real, { create: () => photos,
    readExif: b => u8(b)[4] === 0x47 ? { gps: { lat: 47.5, lon: 10.2 } } : real.readExif(b) }); /* Byte 4 = 'G': Testbild mit Standort */
  const syncEl = { className: '', querySelector() { return syncEl._s; }, _s: { textContent: '' } };
  const ctx = {
    window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: o.noV4 ? undefined : require('../v4logic.js'),
      RPBook: require('../bookgen.js'), RPCatalog: require('../catalog.js'), RPPhotos, RPCloud: o.server ? o.server.api : undefined },
    location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
    navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: k => k === '#sync' ? syncEl : null, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, visibilityState: 'visible' },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => { if (ctx.failWrites) throw new Error('QuotaExceededError'); store.set(k, String(v)); }, removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL, Blob, TextEncoder, TextDecoder, crypto: globalThis.crypto, alert: m => alerts.push(m)
  };
  ctx.window.document = ctx.document; ctx.window.crypto = globalThis.crypto;
  vm.createContext(ctx);
  vm.runInContext(o.code || baseCode, ctx);
  ctx.alertMsg = m => alerts.push(m); ctx.sheetImport = () => sheets.push(1); ctx.render = () => {};
  return { ctx, a: ctx.window.__app, F: vm.runInContext('RPF4', ctx), store, alerts, photos, syncText: () => syncEl._s.textContent, sheets };
}
async function jpeg(seed, gps) { const b = new Uint8Array(64); b.set([0xFF, 0xD8, 0xFF, 0xD9]); b[4] = gps ? 0x47 : 0x10; for (let i = 5; i < 64; i++) b[i] = (seed * 31 + i * 7) & 255; return b; }
async function photo(id, bytes, extra) { return Object.assign({ id, takenAt: '2026-12-31T14:00:00', w: 2048, h: 1536, bytes: bytes.length, sha256: await P.sha256(bytes), caption: 'Alpsee', day: '2026-12-31' }, extra || {}); }

(async () => {
  /* ---------- 1. Anhebung v3 → v4 nur mit Bestätigung, Feldtreue ---------- */
  {
    const { a, ctx, F, store } = makeApp();
    assert.equal(vm.runInContext('SCHEMA_MAX', ctx), 4, 'mit v4logic.js liest die App Format 4');
    const t = a.silvesterTemplate();
    t.schemaVersion = 3; t.party = [{ id: 'pers1', name: 'Philipp' }, { id: 'pers2', name: 'Partnerin' }];
    t.journal = { '2026-12-31': { text: 'Silvester am See', mood: 5 } }; t.zukunft = { a: [1, 2] }; t.originGeo = { lat: 48.66, lon: 9.57 };
    a.validateExtras(t); a.Store.setScope('guest'); assert(a.Store.put(t));
    const before = J(a.Store.get(t.id)), rawBefore = store.get('rp-trips');
    const w1 = await jpeg(1), m1 = await photo('fotoeins', w1, { by: 'pers1', lat: 47.55, lon: 10.21 });
    const cand = F.mediaCommit(a.Store.get(t.id), [m1]);
    assert(cand.upgrade && cand.from === 3 && cand.trip.schemaVersion === 4, 'erstes Foto hebt auf Format 4');
    assert.equal(F.rest(cand.trip), F.rest(before), 'Feldtreue: alles außer Version/Fotos/Bücher unverändert');
    assert.deepEqual(a.Store.get(t.id), before, 'Quelle unverändert');
    const r0 = ctx.f4Commit(cand);
    assert(!r0.ok && r0.needsConfirm === 'format4' && /Format 4 umgestellt/.test(r0.notice) && /dauerhaft/.test(r0.notice), 'ohne Bestätigung nichts gespeichert, Hinweis wie bei Format 3');
    assert.equal(store.get('rp-trips'), rawBefore, 'rp-trips unverändert ohne Bestätigung');
    const r1 = ctx.f4Commit(cand, { confirmed: true });
    assert(r1.ok && r1.upgraded && r1.added[0] === 'fotoeins');
    a.Store.setScope('guest'); /* Neuladen aus dem Browser-Speicher */
    const back = a.Store.get(t.id);
    assert.equal(back.schemaVersion, 4); assert.deepEqual(back.media, [ctx.window.RPV4.normalizeMedia(m1)], 'Foto-Eintrag gespeichert, Standort bleibt in der App (Entscheidung 19.10.)');
    assert.deepEqual(back.zukunft, { a: [1, 2] }); assert.deepEqual(back.journal, t.journal); assert.deepEqual(back.party, t.party);
    /* zweites Foto: keine Bestätigung nötig; gleiches Bild wird übersprungen; gleiche ID mit anderem Bild abgelehnt */
    const w2 = await jpeg(2), m2 = await photo('fotozwei', w2, { day: null, takenAt: null });
    const r2 = ctx.mediaCommit(a.Store.get(t.id), [m2, Object.assign({}, m1, { id: 'fotodrei' })]);
    assert(r2.ok && !r2.upgraded && r2.added.join() === 'fotozwei' && r2.duplicates[0].existing === 'fotoeins', 'Doppelimport über Prüfsumme erkannt');
    const r3 = ctx.mediaCommit(a.Store.get(t.id), [m1]); assert(r3.ok && r3.noop, 'nur Dubletten: nichts zu speichern');
    assert.throws(() => ctx.mediaCommit(a.Store.get(t.id), [Object.assign({}, m2, { sha256: 'f'.repeat(64) })]), /schon vergeben/);
    assert.throws(() => ctx.mediaCommit(a.Store.get(t.id), [Object.assign({}, m2, { id: 'fotovier', sha256: 'e'.repeat(64), data: 'x' })]), /unbekanntes Feld/, 'keine Bilddaten in der Reise');
    assert.throws(() => ctx.mediaCommit(a.Store.get(t.id), [Object.assign({}, m2, { id: 'fotovier', sha256: 'e'.repeat(64), by: 'niemand' })]), /Person/);
    /* veralteter Kandidat */
    const stale = F.mediaPatch(a.Store.get(t.id), 'fotozwei', { caption: '  Bergblick ' });
    const tt = a.Store.get(t.id); a.setField(tt, 'notes', 'neu'); a.Store.put(tt);
    assert.throws(() => ctx.f4Commit(stale), /inzwischen geändert/, 'keine stille Übernahme veralteter Stände');
    const rp = ctx.mediaPatch(a.Store.get(t.id), 'fotozwei', { caption: '  Bergblick ', day: '2026-12-30', fav: true });
    assert(rp.ok && a.Store.get(t.id).media[1].caption === 'Bergblick' && a.Store.get(t.id).media[1].fav === true);
    assert.throws(() => ctx.mediaPatch(a.Store.get(t.id), 'fotozwei', { sha256: 'a'.repeat(64) }), /nicht ändern/);
    assert.equal(a.Store.get(t.id).notes, 'neu', 'Bearbeitung der Notiz blieb erhalten');

    /* ---------- 2. Keine Rückstufung; v3-Bearbeitung einer v4-Reise bleibt 4 ---------- */
    const down = J(a.Store.get(t.id)); down.schemaVersion = 3; delete down.media;
    assert.equal(a.Store.put(down), false, 'Store.put lehnt Rückstufung ab');
    assert.equal(a.Store.get(t.id).schemaVersion, 4); assert.equal(a.Store.get(t.id).media.length, 2, 'Fotos nicht verloren');
    const v4t = a.Store.get(t.id), key = Object.keys(a.cost(v4t).lines.reduce((m, l) => (l.key && l.key.startsWith('act:') ? (m[l.key] = 1) : 0, m), {}))[0];
    const canc = a.cancelEntry(v4t, { kind: 'ledger', key }, { on: '2026-12-01', fee: '' });
    assert.equal(canc.schemaVersion, 4, 'v3-Kandidat setzt Format 4 nicht auf 3 zurück'); assert.equal(canc.media.length, 2);
    assert(a.Store.put(canc)); a.Store.setScope('guest'); assert.equal(a.Store.get(t.id).schemaVersion, 4);
    assert(a.cost(a.Store.get(t.id)).lines.some(l => l.key === key), 'Kosten mit v3-Angaben in Format 4 berechnet');
    a.setField(a.Store.get(t.id), 'title', 'Silvester mit Fotos'); assert.equal(a.Store.get(t.id).media.length, 2);
    /* Anreise-Abschnitte (v3) zählen in Format 4 mit */
    const seg = { out: [{ id: 'sbahn', mode: 'bahn', from: 'Göppingen', to: 'Immenstadt', cost: 49, per: 'pp', dep: { date: '2026-12-30', time: '08:00', tz: 'Europe/Berlin' }, arr: { date: '2026-12-30', time: '11:30', tz: 'Europe/Berlin' } }], back: [] };
    const withSeg = a.setTransport(a.Store.get(t.id), seg);
    assert.equal(withSeg.schemaVersion, 4); assert(a.Store.put(withSeg));
    assert(a.cost(a.Store.get(t.id)).lines.some(l => l.key === 'tr:sbahn' && l.c === 98), 'Abschnittspreis 49 × 2 in Format 4 berechnet');
    /* Schutz im Kandidaten: nur media/books dürfen sich ändern */
    assert.throws(() => F.candidate(a.Store.get(t.id), c => { c.title = 'heimlich'; c.media = []; }), /andere Reisedaten/);

    /* ---------- 3. Reisebuch speichern ---------- */
    const B = ctx.window.RPBook, cur = () => a.Store.get(t.id);
    const d = B.draft(cur(), { days: [], acts: [] }, { at: '2026-10-20T08:00:00Z' }).book;
    const rb = ctx.bookSave(cur(), d, { now: '2026-10-20T08:05:00Z' });
    assert(rb.ok && cur().books.length === 1 && cur().books[0].updatedAt === '2026-10-20T08:05:00Z', 'Buch gespeichert, updatedAt = Speicherzeit');
    const d2 = J(cur().books[0]); d2.title = 'Unser Winter';
    assert(ctx.bookSave(cur(), d2, { now: '2026-10-20T09:00:00Z' }).ok && cur().books.length === 1 && cur().books[0].title === 'Unser Winter', 'gleiche ID ersetzt');
    const bad = J(d2); bad.pages[0].text = 'Zahlung an DE89 3704 0044 0532 0130 00';
    assert.throws(() => ctx.bookSave(cur(), bad, { now: '2026-10-20T09:00:00Z' }), /IBAN|Zahlung|Karte/i, 'keine Zahlungsdetails im Buch');
    const hint = J(d2); hint.subtitle = 'Buchungsnummer siehe Mail';
    assert(ctx.bookSave(cur(), hint, { now: '2026-10-20T09:10:00Z' }).warnings.some(w => w.kind === 'buchungsnummer'), 'weicher Hinweis bleibt Hinweis');
    /* Foto im Buch entfernen: nur mit Bestätigung, Plätze werden leer */
    const used = J(cur().books[0]); used.cover = { mediaId: 'fotoeins' };
    ctx.bookSave(cur(), used, { now: '2026-10-20T09:20:00Z' });
    const rm0 = ctx.mediaRemove(cur(), 'fotoeins');
    assert(!rm0.ok && rm0.needsConfirm === 'uses' && rm0.uses.length, 'Foto in Büchern: Rückfrage');
    assert(ctx.mediaRemove(cur(), 'fotoeins', { confirm: true }).ok && cur().books[0].cover.mediaId === null);
    assert(ctx.mediaRemove(cur(), 'fotozwei', { confirm: true }).ok && ctx.bookRemove(cur(), cur().books[0].id).ok);
    assert.equal(cur().schemaVersion, 4, 'einmal 4, immer 4'); assert.deepEqual([cur().media, cur().books], [[], []]);
    const srv = a.toServer(cur()); assert.deepEqual(srv.media, []); assert.equal(srv.schemaVersion, 4, 'leere Listen bleiben in Format 4');

    /* Buch als erstes v4-Feld einer v2-Reise */
    const t2 = a.newTrip({ title: 'Wochenende' }); t2.schemaVersion = 2; assert(a.Store.put(t2));
    const d3 = B.draft(t2, {}, { at: '2026-10-20T08:00:00Z' }).book;
    const rb2 = ctx.bookSave(a.Store.get(t2.id), d3, { now: '2026-10-20T08:00:00Z' });
    assert(!rb2.ok && rb2.needsConfirm === 'format4' && a.Store.get(t2.id).schemaVersion === 2, 'erstes Buch: Bestätigung');
    assert(ctx.f4Commit(rb2.candidate, { confirmed: true }).ok && a.Store.get(t2.id).schemaVersion === 4);
  }

  /* ---------- 4. Prüfung, Serialisierung, Sicherung, Import ---------- */
  {
    const { a, ctx } = makeApp();
    const t = a.newTrip({ title: 'Prüfung' }); t.schemaVersion = 3;
    const w = await jpeg(3), m = ctx.window.RPV4.normalizeMedia(await photo('fotoprue', w));
    assert.throws(() => a.validateExtras(Object.assign(J(t), { media: [m] })), /erst ab Format 4/, 'Fotos in Format 3 abgelehnt');
    assert.throws(() => a.toServer(Object.assign(J(t), { media: [m] })), /Format 4|Fotos/);
    const s3 = a.toServer(Object.assign(J(t), { media: [], books: [] })); assert(!('media' in s3) && !('books' in s3), 'Format 3 schreibt keine leeren v4-Felder');
    const t4 = Object.assign(J(t), { schemaVersion: 4, media: [m], books: [], zukunft: 1 });
    assert.deepEqual(a.toServer(t4), J(Object.assign({}, a.migrateTrip(t4))), 'Format 4 unverändert');
    assert.throws(() => a.validateExtras(Object.assign(J(t4), { schemaVersion: 5 })), /Unbekannte Reiseversion/);
    assert.equal(a.serverRowProblem({ id: t4.id, data: t4, version: 1 }), null, 'v4-Serverzeile lesbar');
    assert(a.serverRowProblem({ id: t4.id, data: Object.assign(J(t4), { schemaVersion: 5 }), version: 1 }).newer);
    /* JSON-Sicherung: Einträge erhalten, Fotos nicht enthalten → Hinweis */
    const raw = J(a.backupData([t4]));
    assert.deepEqual(a.validateBackup(raw)[0].media, [m]);
    assert(/nicht enthalten/.test(ctx.f4JsonNote([t4])) && ctx.f4JsonNote([t]) === '');
    a.Store.setScope('guest'); a.Store.put(J(t4));
    const changed = J(t4); changed.media[0].caption = 'anders';
    assert(a.importPreview([changed])[0].changed.includes('Fotos'), 'Vorschau nennt abweichende Fotos');
    const ids = a.importTrips(raw, 'copy'); const copy = a.Store.get(ids[0]);
    assert(copy.id !== t4.id && copy.schemaVersion === 4 && copy.media[0].id === m.id, 'Kopie verweist auf dieselbe Datei');
    /* Ältere App (ohne v4logic.js) lehnt Format 4 vollständig ab statt still zu kürzen */
    const old = makeApp({ noV4: true });
    assert.equal(vm.runInContext('SCHEMA_MAX', old.ctx), 3);
    assert.throws(() => old.a.validateBackup(raw), /Unbekannte Reiseversion/);
  }

  /* ---------- 5. Sync: Datenbank nimmt Format 4 nicht an (Stand vor der Migration, F4_SERVER_MAX=3) → bleibt sichtbar lokal ---------- */
  {
    const S = fakeServer(); const { a, ctx, F, syncText, store } = makeApp({ server: S, code: baseCode.replace('const F4_SERVER_MAX=4;', 'const F4_SERVER_MAX=3;') });
    const { Store, Sync, Auth } = a;
    S.user = 'uA'; Auth.switchTo({ id: 'uA' });
    const t = Object.assign(a.newTrip({ title: 'Konto', dateMode: 'fix', start: '2027-05-01', end: '2027-05-04' }), { schemaVersion: 3, journal: { '2027-05-01': { text: 'los' } } });
    const other = a.newTrip({ title: 'Andere' });
    Store.put(t); Store.put(other); await Sync.run();
    assert.equal(S.rows[t.id].version, 1); const serverV3 = JSON.stringify(S.rows[t.id].data);
    const cand = F.mediaCommit(Store.get(t.id), [await photo('fotokonto', await jpeg(4))]);
    const r0 = ctx.f4Commit(cand); assert(/Nur auf diesem Gerät/.test(r0.notice) && /Mitreisende/.test(r0.notice), 'Hinweis vor dem Anheben nennt die Grenze');
    assert(ctx.f4Commit(cand, { confirmed: true }).ok);
    const o2 = Store.get(other.id); o2.title = 'Andere neu'; Store.put(o2);
    await Sync.run();
    assert.equal(JSON.stringify(S.rows[t.id].data), serverV3, 'Server behält Format 3, nichts überschrieben');
    assert.equal(S.rows[other.id].data.title, 'Andere neu', 'andere Reisen synchronisieren weiter');
    assert(!S.calls.includes('update ' + t.id), 'Format 4 wird gar nicht erst gesendet');
    assert(Store.queue[t.id] && Store.meta[t.id].localOnly === 4 && !Store.meta[t.id].failed, 'bleibt in der Warteschlange, kein Fehlerzustand');
    assert.equal(a.tripSyncState(t.id), 'nur-lokal');
    assert(/1 Reise nur auf diesem Gerät \(Format 4\)/.test(syncText()), 'sichtbar im Status: ' + syncText());
    assert(Store.pending() >= 1, 'Abmelden fragt nach (ausstehend)');
    Store.setScope('uA'); assert.equal(Store.get(t.id).media.length, 1, 'nach Neuladen weiter vorhanden'); assert(Store.meta[t.id].localOnly);
    /* 5b. Nach der Migration (Datenbank nimmt 4, App mit F4_SERVER_MAX=4): die wartende Reise geht beim nächsten Abgleich hoch */
    S.allowed = [2, 3, 4];
    const n = makeApp({ server: S, store }); n.a.Auth.switchTo({ id: 'uA' }); await n.a.Sync.run();
    assert.equal(S.rows[t.id].data.schemaVersion, 4, 'Format 4 jetzt auf dem Server'); assert.equal(S.rows[t.id].version, 2);
    assert.equal(S.rows[t.id].data.media.length, 1); assert.equal(S.rows[t.id].data.journal['2027-05-01'].text, 'los', 'Feldtreue');
    assert(!n.a.Store.queue[t.id] && !(n.a.Store.meta[t.id] || {}).localOnly, 'nicht mehr nur lokal');
    assert.equal(n.a.tripSyncState(t.id), 'online');
  }

  /* ---------- 6. ZIP ---------- */
  {
    const { F } = makeApp();
    const enc = s => new TextEncoder().encode(s);
    const cat = ch => { const n = ch.reduce((x, c) => x + c.length, 0), out = new Uint8Array(n); let p = 0; ch.forEach(c => { out.set(c, p); p += c.length; }); return out; };
    const z = cat(F.zipWrite([{ name: 'a.txt', bytes: enc('Hallo') }, { name: 'media/fotoeins.jpg', bytes: new Uint8Array(1000).fill(7) }], { date: '2026-10-20T08:00:00Z' }));
    const L = F.zipList(z); assert.deepEqual(L.map(x => x.name), ['a.txt', 'media/fotoeins.jpg']);
    assert.equal(new TextDecoder().decode(await F.zipRead(z, L[0])), 'Hallo');
    assert.equal(F.crc32(enc('123456789')), 0xCBF43926, 'CRC-32 Prüfwert');
    const broken = z.slice(); broken[30 + 5 + 2] ^= 1; await assert.rejects(F.zipRead(broken, F.zipList(broken)[0]), /beschädigt/);
    assert.throws(() => F.zipList(enc('kein zip')), /keine ZIP/);
    assert.throws(() => F.zipWrite([{ name: 'x', bytes: enc('1') }, { name: 'x', bytes: enc('2') }]), /doppelt/);
    /* Deflate-Eintrag (anderes Packprogramm): mit übergebener Entpackfunktion lesbar, ohne abgelehnt */
    const data = enc('x'.repeat(5000)), comp = zlib.deflateRawSync(data), crc = F.crc32(data), nm = enc('trips.json');
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nm.length, 28);
    const cdOff = 30 + nm.length + comp.length, eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 8); eo.writeUInt16LE(1, 10); eo.writeUInt32LE(46 + nm.length, 12); eo.writeUInt32LE(cdOff, 16);
    const dz = Buffer.concat([lh, nm, comp, ch, nm, eo]), dl = F.zipList(dz);
    assert.equal((await F.zipRead(dz, dl[0], async b => zlib.inflateRawSync(b))).length, 5000);
    await assert.rejects(F.zipRead(dz, dl[0]), /gepackt/);
    const enc1 = Buffer.from(dz); enc1.writeUInt16LE(1, 30 + nm.length + comp.length + 8); assert.throws(() => F.zipList(enc1), /verschlüsselt/);
    /* Pfadprüfung vor dem Entpacken: Ordnerwechsel und fremde Dateien */
    for (const bad of ['../evil.jpg', 'media/../../x.jpg', 'media/Foto.jpg', 'C:/x.jpg', 'media\\x.jpg', 'script.js']) {
      const zz = cat(F.zipWrite([{ name: 'manifest.json', bytes: enc('{}') }, { name: 'trips.json', bytes: enc('{"trips":[]}') }, { name: bad, bytes: enc('x') }]));
      await assert.rejects(F.importParse(zz, { sha256: P.sha256 }), /unerwartete Datei|ungültiger Dateiname/, bad);
    }
    const nomani = cat(F.zipWrite([{ name: 'trips.json', bytes: enc('{"trips":[]}') }]));
    await assert.rejects(F.importParse(nomani, { sha256: P.sha256 }), /manifest\.json oder trips\.json fehlt/);
    const newer = cat(F.zipWrite([{ name: 'manifest.json', bytes: enc(JSON.stringify({ format: 'reiseplaner-archiv', archiveVersion: 2 })) }, { name: 'trips.json', bytes: enc('{"trips":[]}') }]));
    await assert.rejects(F.importParse(newer, { sha256: P.sha256 }), /neueren Stand/);
    const big = cat(F.zipWrite([{ name: 'manifest.json', bytes: enc('{}') }, { name: 'trips.json', bytes: new Uint8Array(2000) }]));
    await assert.rejects(F.importParse(big, { sha256: P.sha256, maxBytes: 1000 }), /zu groß/);
  }

  /* ---------- 7. Archiv .reiseplaner: Export mit Fotoablage, Import auf „neuem Gerät“ ---------- */
  {
    const src = makeApp(); const { a, ctx, photos } = src;
    const cat = ch => Buffer.concat(ch.map(c => Buffer.from(c)));
    const wA = await jpeg(5), wB = await jpeg(6), wGps = await jpeg(7, true), wMiss = await jpeg(8);
    const mA = await photo('fotoaaaa', wA, { lat: 47.5, lon: 10.2 }), mB = await photo('fotobbbb', wB), mG = await photo('fotogggg', wGps), mM = await photo('fotommmm', wMiss);
    for (const [m, w] of [[mA, wA], [mB, wB], [mG, wGps]]) await photos.put(m.id, { work: { bytes: w }, thumb: { bytes: w.slice(0, 32) } });
    const t = Object.assign(a.newTrip({ title: 'Archiv' }), { schemaVersion: 4, media: [mA, mB, mG, mM].map(m => ctx.window.RPV4.normalizeMedia(m)), books: [] });
    t.books = [ctx.window.RPV4.normalizeBook(ctx.window.RPBook.draft(t, {}, { at: '2026-10-20T08:00:00Z' }).book, { now: '2026-10-20T08:00:00Z', media: t.media })];
    a.Store.setScope('guest'); assert(a.Store.put(t));
    const ex = await ctx.f4ExportArchive([a.Store.get(t.id)], { dryRun: true });
    assert.equal(ex.photos, 2, 'zwei Fotos gesichert');
    assert.deepEqual(ex.problems.map(p => p.id).sort(), ['fotogggg', 'fotommmm'], 'fehlendes Foto und Datei mit Standort gemeldet, nicht still');
    const zip = cat(ex.chunks), F = src.F;
    const names = F.zipList(zip).map(x => x.name).sort();
    assert.deepEqual(names, ['manifest.json', 'media/fotoaaaa.jpg', 'media/fotobbbb.jpg', 'thumbs/fotoaaaa.jpg', 'thumbs/fotobbbb.jpg', 'trips.json']);
    const parsed = await F.importParse(zip, { sha256: P.sha256 });
    assert(parsed.manifest.locationStripped && !('lat' in parsed.backup.trips[0].media[0]), 'Standort standardmäßig entfernt');
    assert.equal(a.Store.get(t.id).media[0].lat, 47.5, 'Reise auf dem Gerät behält den Standort');
    assert.deepEqual(parsed.report.missing.sort(), ['fotogggg', 'fotommmm'], 'Einträge ohne Datei werden beim Import gemeldet');
    assert.deepEqual(Object.keys(parsed.files).sort(), ['fotoaaaa', 'fotobbbb']);
    const keep = await ctx.f4ExportArchive([a.Store.get(t.id)], { dryRun: true, keepLocation: true });
    const pk = await F.importParse(cat(keep.chunks), { sha256: P.sha256 });
    assert(!pk.manifest.locationStripped && pk.backup.trips[0].media[0].lat === 47.5 && keep.photos === 3, 'mit ausdrücklicher Wahl: Standort bleibt');

    /* Import auf einem anderen Gerät: Vorschau, dann Fotos ablegen, dann Reisen */
    const dst = makeApp(); const b = dst.a; b.Store.setScope('guest');
    const file = { name: 'Reiseplaner-Sicherung.reiseplaner', size: zip.length, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.length), slice: (s, e) => ({ arrayBuffer: async () => zip.buffer.slice(zip.byteOffset + s, zip.byteOffset + e) }) };
    await dst.ctx.readBackupFile(file);
    const UI = vm.runInContext('UI', dst.ctx);
    assert(UI.importDraft && UI.importDraft.length === 1 && dst.sheets.length === 1, 'gleiche Vorschau wie bei JSON');
    assert(/2 Fotos lesbar/.test(UI.importInfo) && /2 Fotos fehlen/.test(UI.importInfo) && /ohne Fotostandorte/.test(UI.importInfo), UI.importInfo);
    const added = await dst.ctx.f4ImportTrips('skip');
    const it = b.Store.get(added[0]);
    assert(it.schemaVersion === 4 && it.media.length === 4 && it.books.length === 1, 'Reise mit allen Einträgen importiert');
    assert.deepEqual([...dst.photos.m.keys()].sort(), ['fotoaaaa', 'fotobbbb'], 'Bilddateien in der Fotoablage');
    assert.equal(await P.sha256(dst.photos.m.get('fotoaaaa').work), mA.sha256, 'Prüfsumme der übernommenen Datei');
    assert(!UI.archive, 'Archivzustand verbraucht');

    /* Fehler beim Speichern der Reisen: neu abgelegte Fotos werden wieder entfernt, nichts halb übernommen */
    const dst2 = makeApp(); dst2.a.Store.setScope('guest');
    await dst2.ctx.readBackupFile(file); dst2.ctx.failWrites = true;
    await assert.rejects(dst2.ctx.f4ImportTrips('skip'), /nicht gespeichert/);
    assert.equal(dst2.photos.m.size, 0, 'Rückbau der Fotos'); assert.equal(dst2.a.Store.list().length, 0);
    /* anderes Bild unter derselben ID auf dem Zielgerät: Abbruch ohne Änderung */
    const dst3 = makeApp(); dst3.a.Store.setScope('guest');
    await dst3.photos.put('fotobbbb', { work: { bytes: await jpeg(99) }, thumb: { bytes: await jpeg(99) } });
    await dst3.ctx.readBackupFile(file);
    await assert.rejects(dst3.ctx.f4ImportTrips('skip'), /anderes Bild/);
    assert.equal(dst3.a.Store.list().length, 0); assert.deepEqual([...dst3.photos.m.keys()], ['fotobbbb'], 'vorhandenes Bild unberührt');
    /* beschädigte Datei im Archiv: gemeldet, nicht übernommen, Eintrag bleibt */
    const tampered = Buffer.from(zip), lst = F.zipList(tampered), ent = lst.find(x => x.name === 'media/fotoaaaa.jpg');
    const ds = ent.offset + 30 + ent.name.length; tampered[ds + 10] ^= 0xFF;
    const pt = await F.importParse(tampered, { sha256: P.sha256 });
    assert(pt.report.damaged.some(d => d.id === 'fotoaaaa') && !pt.files.fotoaaaa && pt.files.fotobbbb, 'beschädigte Datei gemeldet');
    /* Datei unversehrt, aber passt nicht zum Eintrag (andere Prüfsumme in trips.json) */
    const wrong = J(parsed.backup); wrong.trips[0].media.find(m => m.id === 'fotobbbb').sha256 = 'c'.repeat(64);
    const zw = Buffer.concat(F.zipWrite([{ name: 'manifest.json', bytes: Buffer.from(JSON.stringify(parsed.manifest)) }, { name: 'trips.json', bytes: Buffer.from(JSON.stringify(wrong)) }, { name: 'media/fotobbbb.jpg', bytes: wB }, { name: 'thumbs/fotobbbb.jpg', bytes: wB }]).map(c => Buffer.from(c)));
    const pw = await F.importParse(zw, { sha256: P.sha256 });
    assert(pw.report.damaged.some(d => d.id === 'fotobbbb' && /Prüfsumme/.test(d.reason)) && !pw.files.fotobbbb, 'Prüfsumme gegen den Eintrag verglichen');
    /* Thumb fehlt im Archiv: Arbeitskopie dient als Vorschau, gemeldet */
    const noThumb = Buffer.concat(F.zipWrite([{ name: 'manifest.json', bytes: Buffer.from(JSON.stringify(parsed.manifest)) }, { name: 'trips.json', bytes: Buffer.from(JSON.stringify(parsed.backup)) }, { name: 'media/fotoaaaa.jpg', bytes: wA }]).map(c => Buffer.from(c)));
    const pn = await F.importParse(noThumb, { sha256: P.sha256 });
    assert(pn.report.thumbFromWork.includes('fotoaaaa') && pn.files.fotoaaaa.thumb.length === wA.length);
    /* JSON-Sicherung weiterhin lesbar über denselben Weg */
    const jraw = JSON.stringify(a.backupData([a.Store.get(t.id)])), dst4 = makeApp(); dst4.a.Store.setScope('guest');
    await dst4.ctx.readBackupFile({ name: 'x.json', size: jraw.length, text: async () => jraw, slice: () => ({ arrayBuffer: async () => new TextEncoder().encode(jraw.slice(0, 2)).buffer }) });
    assert.equal((vm.runInContext('UI', dst4.ctx).importDraft || { length: dst4.alerts.join() }).length, 1, 'JSON-Import unverändert');
  }

  /* ---------- 8. Lese-Release (F4_WRITE = false): lesen und zurückschreiben ja, neu anheben nein ---------- */
  {
    const ro = makeApp({ code: baseCode.replace('const F4_WRITE=true;', 'const F4_WRITE=false;') });
    const t = ro.a.newTrip({ title: 'Nur lesen' }); t.schemaVersion = 3; ro.a.Store.setScope('guest'); ro.a.Store.put(t);
    const c = ro.F.mediaCommit(ro.a.Store.get(t.id), [await photo('fotoread', await jpeg(9))]);
    assert.throws(() => ro.ctx.f4Commit(c, { confirmed: true }), /noch nicht gespeichert/);
    assert.equal(ro.a.Store.get(t.id).schemaVersion, 3);
    const v4 = Object.assign(ro.a.newTrip({ title: 'Schon 4' }), { schemaVersion: 4, media: [ro.ctx.window.RPV4.normalizeMedia(await photo('fotoread', await jpeg(9)))], books: [] });
    assert(ro.a.Store.put(v4)); ro.a.setField(ro.a.Store.get(v4.id), 'title', 'Schon 4 neu');
    ro.a.Store.setScope('guest'); assert.equal(ro.a.Store.get(v4.id).media.length, 1, 'Lese-Release schreibt media unverändert zurück');
  }

  console.log('Format 4 in der App: Anhebung nur mit Bestätigung und Feldtreue, Fotos/Bücher speichern und entfernen, keine Rückstufung, v3-Bearbeitung bleibt 4, toServer/Sicherung/Import, ältere App lehnt ab, Sync hält v4 sichtbar lokal, ZIP (CRC, Deflate, Pfadprüfung), Archiv mit Fotoablage (Standort, Fehlendes, Beschädigtes, Rückbau) und Lese-Release geprüft.');
})().catch(e => { console.error(e); process.exit(1); });
