/* Unterlagen & Buchungen (M11.1/M11.3, docs/UNTERLAGEN.md): Ablage RPFiles (docstore.js) mit In-Memory-IndexedDB
   (Ersatz aus tests/photostore.cjs übernommen), Format-5-Spiegel toTripDoc gegen RPV5.validateV5, Buchungsüberblick,
   Unterlagen für heute, Darstellung und Speichern im App-Code (vm). Node-Test, kein Browser- oder iPhone-Test. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const nodeCrypto = require('crypto');
const F = require('../docstore.js');
const V5 = require('../v5logic.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* In-Memory-IndexedDB aus tests/photostore.cjs (eine Quelle, kein Nachbau) */
const psrc = fs.readFileSync(path.join(__dirname, 'photostore.cjs'), 'utf8');
const a0 = psrc.indexOf('function fakeIDB() {'), a1 = psrc.indexOf('\n}\n', a0);
const fakeIDB = new Function('structuredClone', 'setTimeout', psrc.slice(a0, a1) + '\n}\nreturn fakeIDB;')(structuredClone, setTimeout);

/* Format-5-Grundreise aus tests/v5logic.cjs */
const vsrc = fs.readFileSync(path.join(__dirname, 'v5logic.cjs'), 'utf8');
const b0 = vsrc.indexOf('function base() {'), b1 = vsrc.indexOf('\n}\n', b0);
const v5base = new Function(vsrc.slice(b0, b1) + '\n}\nreturn base;')();
let n = 0; const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const sha = u => nodeCrypto.createHash('sha256').update(u).digest('hex');
const pdf = (tag, size) => { const b = Buffer.alloc(size || 600, 32); Buffer.from('%PDF-1.7\n% ' + (tag || 'x') + '\n').copy(b); return new Uint8Array(b); };
const png = tag => new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from(tag || 'p')]));
const jpg = tag => new Uint8Array(Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from(tag || 'j')]));
let seq = 0;
const store = idb => F.create({ indexedDB: () => idb, now: () => '2026-11-16T10:00:00.000Z', timeoutMs: 300, newId: () => 'dtest' + (++seq) });

/* ---------- 1. Reine Regeln ---------- */
test('Dateiart an den Bytes, Größe, Name ohne Pfad', () => {
  assert.equal(F.sniff(pdf()), 'application/pdf');
  assert.equal(F.sniff(png()), 'image/png');
  assert.equal(F.sniff(jpg()), 'image/jpeg');
  assert.equal(F.sniff(new Uint8Array(Buffer.from('<html>%PDF'))), null, 'PDF-Kennung muss mit Bindestrich kommen');
  assert.equal(F.sniff(new Uint8Array(Buffer.concat([Buffer.alloc(100, 10), Buffer.from('%PDF-1.4')]))), 'application/pdf', 'Vorspann bis 1 KB');
  assert.throws(() => F.checkFile(new Uint8Array(Buffer.from('GIF89a....'))), /PDF, JPEG und PNG/);
  assert.throws(() => F.checkFile(new Uint8Array(0)), /leer/);
  assert.throws(() => F.checkFile(new Uint8Array(F.LIMITS.fileBytes + 1)), /höchstens 15 MB/);
  assert.equal(F.checkFile(pdf(), 'C:\\Users\\x\\Downloads\\ticket.pdf').name, 'ticket.pdf');
});
test('Eingabe prüfen: Pflichtfelder, Gültigkeit, Code, Verknüpfung', () => {
  const ok = F.normalize({ kind: 'ticket', title: '  Bahn  ', link: 'tr:seg1', valid: { from: '2026-12-30', to: '' }, secret: { label: '', value: ' ABC123 ' }, note: '' });
  assert.deepEqual(ok, { kind: 'ticket', title: 'Bahn', link: 'tr:seg1', valid: { from: '2026-12-30', to: null }, secret: { label: 'Buchungsnummer', value: 'ABC123' }, note: null });
  assert.equal(F.normalize({ kind: 'gutschein', title: 'x', secret: { label: 'PIN', value: '  ' } }).secret, null, 'leerer Code = kein Code');
  assert.throws(() => F.normalize({ kind: 'reisepass', title: 'x' }), /Art/);
  assert.throws(() => F.normalize({ kind: 'ticket', title: ' ' }), /Titel fehlt/);
  assert.throws(() => F.normalize({ kind: 'ticket', title: 'x'.repeat(81) }), /80 Zeichen/);
  assert.throws(() => F.normalize({ kind: 'ticket', title: 'x', valid: { from: '2027-01-03', to: '2026-12-30' } }), /vor/);
  assert.throws(() => F.normalize({ kind: 'ticket', title: 'x', valid: { from: '2026-02-30' } }), /Datum ungültig/);
  assert.throws(() => F.normalize({ kind: 'ticket', title: 'x', link: 'javascript:alert(1)' }), /Verknüpfung/);
});
test('Code verdeckt anzeigen', () => {
  assert.equal(F.mask('HX-4711'), '•••• 11');
  assert.equal(F.mask('1234'), '••••', 'kurze Codes ganz verdeckt');
  assert.equal(F.mask(''), '');
});
test('Format 5 (Stufe 2): toTripDoc ohne Code besteht validateV5', () => {
  const m1 = { id: 'dabc1', kind: 'bestaetigung', title: 'Hotel', link: 'offer:o1', valid: { from: '2026-12-30', to: null }, secret: { label: 'Buchungsnummer', value: 'HX-4711' }, note: 'privat', file: { sha256: 'b'.repeat(64), bytes: 1200, mime: 'application/pdf', name: 'hotel.pdf' }, scope: 'guest', trip: 'tbase1' };
  const m2 = { id: 'dabc2', kind: 'ticket', title: 'Bahn', link: null, valid: null, secret: null, note: null, file: null };
  const t = v5base();
  t.docs = [F.toTripDoc(m1), F.toTripDoc(m2, 'pphil')];
  V5.validateV5(t);
  const s = JSON.stringify(t.docs);
  assert(!s.includes('HX-4711') && !s.includes('privat') && !s.includes('hotel.pdf') && !s.includes('guest'), 'kein Code, keine Notiz, kein Dateiname, kein Konto');
  assert.deepEqual(t.docs[0].secret, { label: 'Buchungsnummer', value: null, local: true });
  assert.equal(t.docs[1].share, 'ich');
});

/* ---------- 2. Ablage ---------- */
test('Hinzufügen mit Datei, Liste, Lesen mit Prüfsumme, Belegung', async () => {
  const S = store(fakeIDB()), f = pdf('hotel');
  const m = await S.add('guest', 'tsil', { kind: 'bestaetigung', title: 'Hotel', link: 'offer:o1' }, { bytes: f, name: 'hotel.pdf' });
  assert.equal(m.file.sha256, sha(f)); assert.equal(m.file.bytes, f.length); assert.equal(m.file.mime, 'application/pdf');
  const n2 = await S.add('guest', 'tsil', { kind: 'ticket', title: 'Nur Code', secret: { label: 'PNR', value: 'QWE123' } });
  assert.equal(n2.file, null);
  assert.deepEqual((await S.list('guest', 'tsil')).map(x => x.title), ['Hotel', 'Nur Code']);
  const r = await S.get(m.id); assert.equal(r.state, 'ok'); assert.equal(sha(new Uint8Array(r.bytes)), sha(f));
  assert.equal((await S.get(n2.id)).state, 'nofile');
  assert.deepEqual(await S.usage('guest', 'tsil'), { count: 2, files: 1, bytes: f.length });
});
test('Konten und Reisen getrennt', async () => {
  const S = store(fakeIDB());
  await S.add('guest', 'tsil', { kind: 'ticket', title: 'Gast' });
  await S.add('user-1', 'tsil', { kind: 'ticket', title: 'Konto' });
  await S.add('guest', 'tandere', { kind: 'ticket', title: 'Andere Reise' });
  assert.deepEqual((await S.list('guest', 'tsil')).map(x => x.title), ['Gast']);
  assert.deepEqual((await S.list('user-1', 'tsil')).map(x => x.title), ['Konto']);
  assert.deepEqual(await S.trips('guest'), { tsil: 1, tandere: 1 });
  assert.equal(await S.removeTrip('guest', 'tsil'), 1);
  assert.deepEqual((await S.list('user-1', 'tsil')).map(x => x.title), ['Konto'], 'anderes Konto unberührt');
});
test('Dublette abgelehnt, Grenze je Reise', async () => {
  const S = store(fakeIDB()), f = png('x');
  await S.add('guest', 'tsil', { kind: 'ticket', title: 'A' }, { bytes: f });
  await assert.rejects(() => S.add('guest', 'tsil', { kind: 'ticket', title: 'B' }, { bytes: f }), /schon in dieser Reise \(Unterlage „A“\)/);
  await S.add('guest', 'tandere', { kind: 'ticket', title: 'B' }, { bytes: f }); /* andere Reise darf */
  assert.equal((await S.list('guest', 'tsil')).length, 1);
});
test('Kontingent voll: kein Eintrag, nichts Halbes', async () => {
  const idb = fakeIDB(), S = store(idb);
  idb.fail = ({ op, store: st }) => op === 'put' && st === 'data' ? Object.assign(new Error('voll'), { name: 'QuotaExceededError' }) : null;
  await assert.rejects(() => S.add('guest', 'tsil', { kind: 'ticket', title: 'Bahn' }, { bytes: pdf() }), /Kein Speicherplatz/);
  idb.fail = null;
  assert.deepEqual(await S.list('guest', 'tsil'), [], 'kein Eintrag ohne Datei angelegt');
});
test('Rücklesevergleich und beschädigte Datei', async () => {
  const idb = fakeIDB(), S = store(idb);
  idb.tamper = ({ store: st, value }) => st === 'data' ? Object.assign({}, value, { bytes: new Uint8Array([1, 2, 3]).buffer }) : value;
  await assert.rejects(() => S.add('guest', 'tsil', { kind: 'ticket', title: 'Bahn' }, { bytes: pdf() }), /Rücklesevergleich/);
  idb.tamper = null;
  assert.deepEqual(await S.list('guest', 'tsil'), [], 'nichts liegen geblieben');
  const m = await S.add('guest', 'tsil', { kind: 'ticket', title: 'Bahn' }, { bytes: pdf('ok') });
  /* nachträglich beschädigt: Eintrag bleibt, Anzeige meldet es */
  const data = idb.dbs['rp-files'].stores.data.data;
  assert(data.get(m.id), 'Datensatz gefunden');
  data.set(m.id, { id: m.id, bytes: pdf('anders').buffer });
  assert.equal((await S.get(m.id)).state, 'damaged');
  assert.equal((await S.list('guest', 'tsil')).length, 1);
});
test('Ändern lässt Datei und Prüfsumme, Löschen entfernt beides', async () => {
  const S = store(fakeIDB()), f = jpg('k');
  const m = await S.add('guest', 'tsil', { kind: 'ticket', title: 'Skipass' }, { bytes: f });
  const u = await S.update(m.id, { kind: 'gutschein', title: 'Skipass-Gutschein', secret: { label: 'Code', value: 'SKI-1' } });
  assert.equal(u.file.sha256, sha(f)); assert.equal(u.secret.value, 'SKI-1'); assert.equal(u.trip, 'tsil'); assert.equal(u.scope, 'guest');
  await S.remove(m.id);
  assert.equal(await S.get(m.id), null);
  assert.deepEqual(await S.usage('guest'), { count: 0, files: 0, bytes: 0 });
});
test('Kein IndexedDB, privates Fenster: verständliche Meldung', async () => {
  await assert.rejects(() => F.create({ indexedDB: () => null }).list('guest', 'tsil'), /IndexedDB fehlt/);
  const a = fakeIDB(); a.openFail = Object.assign(new Error('x'), { name: 'InvalidStateError' });
  await assert.rejects(() => F.create({ indexedDB: () => a }).list('guest', 'tsil'), /privates Fenster/);
  await assert.rejects(() => store(fakeIDB()).list('guest', '../x'), /Reise ungültig/);
});

/* ---------- 3. App: Buchungsüberblick, Heute, Darstellung, Speichern ---------- */
function load(idb) {
  const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
  const memory = new Map(), sheets = [], msgs = [];
  const node = () => ({ innerHTML: '', hidden: false, style: {}, className: '', textContent: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k]; },
    querySelector() { return { style: {}, setAttribute() {} }; }, querySelectorAll() { return []; } });
  const dom = { '#view': node(), '#dock': node(), '#dock-nm': node(), '#dock-bar': node(), '#dock-sum': node(), '#app-nav': node(), '#sheet-root': node() };
  const win = { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js'), RPV3J: require('../v3journal.js'), RPV3S: require('../v3split.js'), RPV4: require('../v4logic.js'), RPV5: V5,
    RPPhotos: require('../photostore.js'), RPFiles: F, RPBook: require('../bookgen.js'), RPBookEdit: require('../bookedit.js') };
  const ctx = {
    window: win, history: { replaceState() {} }, URL: { createObjectURL: () => 'blob:t/1', revokeObjectURL() {} }, Blob: class { constructor(p, o) { this.type = o.type; } },
    document: { addEventListener() {}, querySelector: s => dom[s] || null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, style: {} }), body: { appendChild() {}, style: {} } },
    localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, console, alert() {}
  };
  vm.createContext(ctx);
  vm.runInContext(code + '\n;globalThis.__u={UNT,UI,Store,TABS,AREA_GROUPS,BEREICHE};', ctx);
  ctx.__u.UNT.store = store(idb || fakeIDB());
  ctx.openSheet = h => sheets.push(h); ctx.closeSheet = () => {}; ctx.alertMsg = m => msgs.push(m); ctx.render = () => {};
  return { a: win.__app, ctx, U: ctx.__u, sheets, msgs };
}
/* Silvester-Reise mit gebuchter Unterkunft, Bahn hin (gebucht), Auto zurück, gebuchter Therme am 31.12. */
function trip(ctx) {
  const t = ctx.__u.Store.get ? null : null; void t;
  const s = vm.runInContext('silvesterTemplate()', ctx);
  s.id = 'tsil'; s.title = 'Silvester im Schnee'; s.dateMode = 'fix'; s.start = '2026-12-30'; s.end = '2027-01-03';
  s.stayId = s.stayId || 'cstay1';
  s.offers = [{ id: 'ohotel', stayId: s.stayId, name: 'Hotel am See', location: 'Oberstaufen', start: '2026-12-30', end: '2027-01-03', persons: 2, booked: true, paid: 0, price: 680, basis: 'stay', provider: 'direkt', type: 'hotel', url: 'https://example.org/hotel', checkedAt: '2026-11-16', validUntil: '2027-01-04', availability: 'available',
    features: { sauna: 'yes', kitchen: 'unknown', breakfast: 'yes', cancel: 'unknown', quiet: 'unknown', accessible: 'unknown', parking: 'unknown' },
    fees: { tax: { state: 'unknown', amount: null }, cleaning: { state: 'unknown', amount: null }, parking: { state: 'unknown', amount: null }, wellness: { state: 'unknown', amount: null }, mandatory: { state: 'unknown', amount: null } }, terms: '', deposit: 0 }];
  s.activeOfferId = 'ohotel';
  s.transport = { out: [{ id: 'segbahn', mode: 'bahn', from: 'Göppingen', to: 'Oberstaufen', dep: { date: '2026-12-30', time: '09:12', tz: 'Europe/Berlin' }, carrier: 'DB', number: 'RE 5', cost: null, per: 'grp' }],
    back: [{ id: 'segauto', mode: 'auto', from: 'Oberstaufen', to: 'Hattenhofen', dep: { date: '2027-01-03', time: null, tz: null }, cost: null, per: 'grp' }] };
  s.customActs = (s.customActs || []).concat([{ id: 'ctherme', t: 'Therme', cat: 'eigen', cost: 60, per: 'grp', custom: true }]);
  s.items = (s.items || []).concat([{ uid: 'uth1', act: 'ctherme', day: 1, slot: 'nachm', time: '14:00' }]);
  s.ledger = Object.assign({}, s.ledger, { 'tr:segbahn': { status: 'gebucht', amount: 59.8, paid: 59.8, due: '' }, 'act:ctherme': { status: 'gebucht', amount: 60, paid: 0, due: '' } });
  return s;
}
test('Teil „Buchungen & Tickets“ im Bereich Unterlagen eingebunden', () => {
  const { U } = load();
  assert(U.TABS.some(x => x[0] === 'buchungen'));
  const g = U.AREA_GROUPS.find(x => x[0] === 'Unterlagen');
  assert.deepEqual(g[1], ['buchungen', 'check', 'notiz', 'mappe']);
});
test('Buchungsüberblick aus vorhandenen Daten, nach Datum', () => {
  const { ctx } = load(), t = trip(ctx);
  const rows = ctx.untRows(t), keys = rows.map(r => r.key);
  ['offer:ohotel', 'tr:segbahn', 'tr:segauto', 'act:ctherme'].forEach(k => assert(keys.includes(k), k));
  const bahn = rows.find(r => r.key === 'tr:segbahn'), auto = rows.find(r => r.key === 'tr:segauto'), th = rows.find(r => r.key === 'act:ctherme'), ho = rows.find(r => r.key === 'offer:ohotel');
  assert.equal(bahn.status, 'gebucht'); assert.equal(bahn.time, '09:12'); assert.match(bahn.label, /Hinreise · Bahn Göppingen → Oberstaufen/);
  assert.equal(auto.needDoc, false, 'eigenes Auto braucht kein Ticket'); assert.equal(auto.status, 'offen');
  assert.equal(th.date, '2026-12-31'); assert.equal(th.status, 'gebucht');
  assert.equal(ho.status, 'gebucht'); assert.equal(ho.date, '2026-12-30');
  assert(keys.indexOf('tr:segbahn') < keys.indexOf('act:ctherme') && keys.indexOf('act:ctherme') < keys.indexOf('tr:segauto'), 'zeitlich geordnet');
  assert.equal(ctx.untKindFor(bahn), 'ticket'); assert.equal(ctx.untKindFor(ho), 'bestaetigung');
  assert.equal(ctx.untKindFor({ type: 'tr', mode: 'flug' }), 'bordkarte'); assert.equal(ctx.untKindFor({ type: 'tr', mode: 'mietwagen' }), 'gutschein');
});
test('Zuordnung: fehlende Unterlage, verwaiste Verknüpfung, Heute', () => {
  const { ctx } = load(), t = trip(ctx);
  const docs = [{ id: 'd1', title: 'Bahnticket', link: 'tr:segbahn', kind: 'ticket' }, { id: 'd2', title: 'Alt', link: 'tr:weg', kind: 'ticket' },
    { id: 'd3', title: 'Versicherung', link: null, kind: 'versicherung', valid: { from: '2026-12-30', to: '2027-01-03' } },
    { id: 'd4', title: 'Hotel', link: 'offer:ohotel', kind: 'bestaetigung' }];
  const G = ctx.untGroups(t, docs);
  assert.equal(G.rows.find(r => r.key === 'tr:segbahn').docs[0].id, 'd1');
  assert.deepEqual(G.other.map(d => d.id), ['d3']); assert.deepEqual(G.lost.map(d => d.id), ['d2']);
  assert.equal(G.missing, 1, 'nur die Therme hat keine Unterlage (Auto zählt nicht, Hotel hat eine)');
  assert.deepEqual(ctx.untForDate(t, docs, '2026-12-30').map(x => x.doc.id).sort(), ['d1', 'd3', 'd4']);
  assert.deepEqual(ctx.untForDate(t, docs, '2026-12-31').map(x => x.doc.id), [], 'Gültigkeit zählt nur am ersten Tag');
  assert.deepEqual(ctx.untForDate(t, docs, '2027-01-03').map(x => x.doc.id), ['d4'], 'Hotel am Abreisetag');
  assert.equal(ctx.untValidText({ from: '2026-12-30', to: '2027-01-03' }, '2027-02-01'), 'gültig 30.12.2026 – 03.01.2027 · abgelaufen');
});
test('Darstellung: Laden, Liste, Datenschutzhinweis, Code nie im Überblick', async () => {
  const { ctx, U } = load(), t = trip(ctx);
  U.Store.put(t);
  let h = ctx.tBuchungen(t);
  assert.match(h, /data-unt-loading/);
  await ctx.untLoad(t.id);
  await U.UNT.store.add('guest', t.id, { kind: 'ticket', title: 'Bahnticket RE 5', link: 'tr:segbahn', secret: { label: 'Auftragsnummer', value: 'ZX-998877' } }, { bytes: pdf('bahn') });
  await ctx.untLoad(t.id, true);
  h = ctx.tBuchungen(t);
  assert.match(h, /nur auf diesem Gerät/i); assert.match(h, /Bahnticket RE 5/); assert.match(h, /✓ Gebucht/); assert.match(h, /mit Code/);
  assert.match(h, /data-unt-missing/, 'Hinweis bei gebuchter Therme ohne Unterlage');
  assert(!h.includes('ZX-998877'), 'Code steht nicht im Überblick');
  /* Ausgabewege der Reise kennen die Unterlagen nicht */
  const text = ctx.tripText(t, { notes: true }), ics = ctx.icsData(t, undefined, { reminders: true });
  assert(!text.includes('ZX-998877') && !text.includes('Bahnticket RE 5'));
  assert(!ics || !ics.text.includes('ZX-998877'));
  assert(!JSON.stringify(U.Store.get(t.id)).includes('ZX-998877'), 'Reise-JSON unverändert');
  /* Heute */
  const hh = ctx.untHeuteBlock(t, new Date(2026, 11, 30, 8));
  assert.match(hh, /Unterlagen für heute/); assert.match(hh, /Bahnticket RE 5/); assert.match(hh, /heute 09:12/);
});
test('Formular speichern, Ansicht mit verdecktem Code, Löschen in zwei Schritten', async () => {
  const { ctx, U, sheets, msgs } = load(), t = trip(ctx);
  U.Store.put(t);
  ctx.untOpenForm(t, null, 'act:ctherme');
  assert.match(sheets.at(-1), /value="act:ctherme" selected/); assert.match(sheets.at(-1), /<option value="ticket" selected>/);
  const vals = { kind: 'ticket', title: 'Therme 2 Personen', link: 'act:ctherme', from: '2026-12-31', to: '', slabel: 'Reservierung', svalue: 'TH-55', note: '' };
  const form = { getAttribute: k => ({ 'data-tid': t.id })[k] || null,
    querySelector: s => { const m = /name="(\w+)"/.exec(s); if (m) return m[1] === 'file' ? { files: [{ name: 'therme.png', arrayBuffer: async () => png('th').buffer }] } : { value: vals[m[1]] }; return { textContent: '', disabled: false }; } };
  await ctx.untSubmit(form);
  assert.deepEqual(msgs, ['Unterlage gespeichert, auf diesem Gerät.']);
  const list = ctx.untList(t.id).list; assert.equal(list.length, 1); assert.equal(list[0].file.mime, 'image/png'); assert.equal(list[0].file.name, 'therme.png');
  await ctx.untOpenView(t, list[0].id);
  let v = sheets.at(-1);
  assert.match(v, />••••</); assert(!v.includes('TH-55'), 'verdeckt'); assert.match(v, /<img src="blob:t\/1"/); assert.match(v, /gültig ab 31\.12\.2026/);
  U.UNT.reveal.add(list[0].id); await ctx.untOpenView(t, list[0].id); assert.match(sheets.at(-1), /TH-55/, 'aufgedeckt per Tipp');
  U.UNT.del = list[0].id; await ctx.untOpenView(t, list[0].id); assert.match(sheets.at(-1), /Ja, endgültig löschen/);
  await ctx.untDelete(t, list[0].id);
  assert.equal(ctx.untList(t.id).list.length, 0);
  /* Fehler im Formular: Meldung im Formular, nichts gespeichert */
  const out = { textContent: '' };
  const bad = { getAttribute: k => ({ 'data-tid': t.id })[k] || null, querySelector: s => { const m = /name="(\w+)"/.exec(s); if (m) return m[1] === 'file' ? { files: [] } : { value: m[1] === 'kind' ? 'ticket' : '' }; return /error/.test(s) ? out : { disabled: false }; } };
  await ctx.untSubmit(bad);
  assert.match(out.textContent, /Titel fehlt/);
  assert.equal(ctx.untList(t.id).list.length, 0);
});

/* ---------- 4. Stufe 2: Eintrag in der Reise, zweites Gerät, Notizen, Reise löschen ---------- */
function formOf(t, vals, files, extra) {
  const attrs = Object.assign({ 'data-tid': t.id }, extra || {}), out = { textContent: '' }, btn = { textContent: 'Speichern', disabled: false };
  return { out, btn, attrs, getAttribute: k => attrs[k] == null ? null : attrs[k], setAttribute: (k, v) => { attrs[k] = String(v); },
    querySelector: s => { const m = /name="(\w+)"/.exec(s); if (m) { if (m[1] === 'file') return { files: files || [] }; if (m[1] === 'mirror') return { checked: !!vals.mirror, disabled: false }; return { value: vals[m[1]] == null ? '' : vals[m[1]] }; }
      return /error/.test(s) ? out : btn; } };
}
test('Findet Buchungsnummern in Notizen, ersetzt nur die Fundstelle', () => {
  const txt = 'Hotel am See\nBuchungsnummer: HX-4711\nPNR ABC12D, Tel 0831 123\nBooking reference #9988776\nSpinat 1234 kaufen\nCode: hallo';
  const f = F.findCodes(txt);
  assert.deepEqual(f.map(x => [x.label, x.value]), [['Buchungsnummer', 'HX-4711'], ['PNR', 'ABC12D'], ['Booking reference', '9988776']]);
  assert.equal(F.moveCodeText(txt, f[0]).split('\n')[1], 'Buchungsnummer: (in „Tickets“)');
  assert.throws(() => F.moveCodeText(txt.replace('HX-4711', 'HX-4712'), f[0]), /geändert/);
  assert.deepEqual(F.findCodes(''), []); assert.deepEqual(F.findCodes(null), []);
});
test('Vorgegebene ID (Datei zu Eintrag aus der Reise nachtragen)', async () => {
  const S = store(fakeIDB());
  const m = await S.add('guest', 'tsil', { kind: 'ticket', title: 'Bahn' }, { bytes: pdf('id') }, { id: 'dfremd1' });
  assert.equal(m.id, 'dfremd1');
  await assert.rejects(() => S.add('guest', 'tsil', { kind: 'ticket', title: 'Bahn 2' }, null, { id: 'dfremd1' }), /schon vor/);
  await assert.rejects(() => S.add('guest', 'tsil', { kind: 'ticket', title: 'x' }, null, { id: '../x' }), /ungültige ID/);
});
test('In der Reise vermerken: Bestätigung vor dem Anheben, ohne Code, zweites Gerät, Entfernen', async () => {
  const A = load(), t = trip(A.ctx);
  A.U.Store.put(t);
  assert((+A.U.Store.get(t.id).schemaVersion || 2) < 5, 'Ausgangsreise unter Format 5');
  A.ctx.untOpenForm(A.U.Store.get(t.id), null, 'tr:segbahn');
  assert.match(A.sheets.at(-1), /name="mirror"(?! checked)/, 'bei Reise unter Format 5 nicht vorausgewählt');
  const vals = { kind: 'ticket', title: 'Bahnticket', link: 'tr:segbahn', slabel: 'Auftragsnummer', svalue: 'ZX-998877', mirror: true };
  const f1 = formOf(t, vals, [{ name: 'bahn.pdf', arrayBuffer: async () => pdf('bahn2').buffer }]);
  await A.ctx.untSubmit(f1);
  assert.match(f1.out.textContent, /Format 5/); assert.equal(f1.btn.textContent, 'Speichern und Reise umstellen');
  await A.ctx.untLoad(t.id, true);
  assert.equal(A.ctx.untList(t.id).list.length, 0, 'vor der Bestätigung nichts gespeichert');
  await A.ctx.untSubmit(f1);
  const saved = A.U.Store.get(t.id), list = A.ctx.untList(t.id).list;
  assert.equal(list.length, 1); assert.equal(saved.schemaVersion, 5);
  assert.equal(saved.docs.length, 1); assert.equal(saved.docs[0].id, list[0].id); assert.equal(saved.docs[0].link.key, 'tr:segbahn');
  assert.deepEqual(saved.docs[0].secret, { label: 'Auftragsnummer', value: null, local: true });
  assert(!JSON.stringify(saved).includes('ZX-998877') && !JSON.stringify(saved).includes('bahn.pdf'), 'kein Code, kein Dateiname in der Reise');
  V5.validateV5(saved);
  assert.match(A.msgs.at(-1), /In der Reise vermerkt/);
  /* Zweites Gerät: gleiche Reise, leerer Gerätespeicher */
  const B = load(); B.U.Store.put(JSON.parse(JSON.stringify(saved)));
  await B.ctx.untLoad(t.id, true);
  const tb = B.U.Store.get(t.id), h = B.ctx.tBuchungen(tb);
  assert.match(h, /Bahnticket/); assert.match(h, /Datei auf einem anderen Gerät/);
  assert.match(h, /data-unt-missing/, 'ohne Datei hier gilt die Buchung weiter als ohne Unterlage auf diesem Gerät');
  await B.ctx.untOpenView(tb, saved.docs[0].id);
  assert.match(B.sheets.at(-1), /Die Datei liegt auf einem anderen Gerät/); assert.match(B.sheets.at(-1), /Datei hier hinzufügen/);
  /* Datei auf Gerät B nachtragen: gleiche ID, Eintrag bleibt einer */
  const fb = formOf(tb, { kind: 'ticket', title: 'Bahnticket', link: 'tr:segbahn' }, [{ name: 'b.pdf', arrayBuffer: async () => pdf('bahn2').buffer }], { 'data-id': saved.docs[0].id, 'data-remote': '1' });
  await B.ctx.untSubmit(fb);
  assert.equal(fb.out.textContent, '');
  assert.equal(B.ctx.untList(t.id).list[0].id, saved.docs[0].id);
  assert.equal(B.U.Store.get(t.id).docs.length, 1);
  assert(!B.ctx.tBuchungen(B.U.Store.get(t.id)).includes('Datei auf einem anderen Gerät'));
  /* Löschen auf Gerät A entfernt auch den Eintrag in der Reise */
  await A.ctx.untDelete(A.U.Store.get(t.id), list[0].id);
  assert(!A.U.Store.get(t.id).docs, 'Eintrag entfernt');
  V5.validateV5(A.U.Store.get(t.id));
});
test('Notizen-Assistent: übernimmt Code verdeckt, ändert nur die Fundstelle', async () => {
  const { ctx, U, msgs } = load(), t = trip(ctx);
  t.notes = 'Hotel: Gästehaus\nBuchungsnummer: HX-4711\nAnreise ab 15 Uhr';
  U.Store.put(t);
  await ctx.untLoad(t.id, true);
  const h = ctx.tBuchungen(U.Store.get(t.id));
  assert.match(h, /In euren Notizen gefunden/); assert(!h.includes('HX-4711'), 'Code im Vorschlag verdeckt');
  await ctx.untCodeMove(U.Store.get(t.id), 0);
  assert.equal(U.Store.get(t.id).notes, 'Hotel: Gästehaus\nBuchungsnummer: (in „Tickets“)\nAnreise ab 15 Uhr');
  const m = ctx.untList(t.id).list[0];
  assert.equal(m.secret.value, 'HX-4711'); assert.equal(m.kind, 'bestaetigung');
  assert.match(msgs.at(-1), /übernommen/);
  assert(!ctx.tBuchungen(U.Store.get(t.id)).includes('In euren Notizen gefunden'));
});
test('Reise löschen nennt und entfernt die Unterlagen dieses Geräts', async () => {
  const { ctx, U } = load(), t = trip(ctx);
  U.Store.put(t);
  await U.UNT.store.add('guest', t.id, { kind: 'ticket', title: 'A' }, { bytes: pdf('a', 2048) });
  await U.UNT.store.add('guest', t.id, { kind: 'ticket', title: 'B' });
  await U.UNT.store.add('guest', 'tandere', { kind: 'ticket', title: 'C' });
  await ctx.untLoad(t.id, true);
  assert.match(ctx.untDeleteNote(t), /auch 2 Unterlagen \(2 KB\) auf diesem Gerät/);
  assert.equal(await ctx.untTripRemoved(t.id), 2);
  assert.deepEqual(await U.UNT.store.trips('guest'), { tandere: 1 }, 'andere Reise bleibt');
});

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n++; } catch (e) { e.message = name + ': ' + e.message; throw e; } }
  console.log('Unterlagen: ' + n + ' Prüfungen bestanden (Ablage, Format-5-Spiegel, Buchungsüberblick, Heute, Formular).');
})().catch(e => { console.error(e); process.exit(1); });
