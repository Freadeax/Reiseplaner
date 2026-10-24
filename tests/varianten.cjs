/* Varianten anlegen (M05.1, docs/planung M05 §6 V1): variantCopy kopiert nur Planinhalte, die Quelle bleibt unverändert,
   die Kopie besteht die Sicherungsprüfung. Node-Test, kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let code = require('./app-code.cjs')(html);
/* Bis zur Einbindung lädt index.html app/varianten.js noch nicht: dann hier anhängen */
if (!/app\/varianten\.js/.test(html)) code += '\n' + fs.readFileSync(path.join(__dirname, '../app/varianten.js'), 'utf8');
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const context = {
  window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js') },
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  setTimeout: () => 0, clearTimeout() {}, console,
};
vm.createContext(context);
vm.runInContext(code, context);
const a = context.window.__app, g = context;
const J = x => JSON.parse(JSON.stringify(x));
let n = 0; const test = (name, fn) => { fn(); n++; };

function offer(t) {
  return { id: 'o123', name: 'Testtarif', location: 'Oberjoch', provider: 'booking', type: 'hotel', start: t.start, end: t.end, persons: 2, price: 100, basis: 'personNight',
    url: 'https://www.booking.com/test', checkedAt: '2026-10-13', validUntil: '2027-01-04', availability: 'available',
    features: { sauna: 'yes', kitchen: 'unknown', breakfast: 'no', cancel: 'unknown', quiet: 'yes', accessible: 'unknown', parking: 'yes' },
    fees: { tax: { state: 'extra', amount: 20 }, cleaning: { state: 'included', amount: 0 }, parking: { state: 'included', amount: 0 }, wellness: { state: 'included', amount: 0 }, mandatory: { state: 'included', amount: 0 } },
    terms: 'Tarif inklusive Sauna', paid: 0, deposit: 200, drive: 150, rating: 8.4 };
}
/* Reise mit gebuchter, bezahlter Unterkunft, gebuchtem Zusatzposten, abgehakter Checkliste und Geschichte */
function bookedTrip() {
  const t = a.newTrip({ title: 'Silvester Allgäu', status: 'gebucht', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', nights: 4, persons: 2, budget: 1500, dest: 'Oberjoch', notes: 'Buchungsnr. 4711' });
  const o = offer(t); t.offers = [o]; a.applyOffer(t, o);
  o.booked = true; o.paid = 300;
  t.extraCosts = [a.costEntryFromForm({ title: 'Skikurs', amount: '200' }, 'kurs')];
  a.setLedger(t, 'xc:kurs', 'status', 'gebucht'); a.setLedger(t, 'xc:kurs', 'amount', '240'); a.setLedger(t, 'xc:kurs', 'paid', '100');
  t.check = { stay: true, pack: true };
  t.customChecks = [{ id: 'kx1', t: 'Schneeketten' }];
  t.deadlineAck = { 'pay:xc:kurs': '2026-11-01' };
  return t;
}

test('V1: keine Buchung, keine Zahlung, Kosten = Planwerte', () => {
  const t = bookedTrip(), before = JSON.stringify(t);
  const r = g.variantCopy(t, { label: 'Wellness & Ruhe', today: '2026-10-24' });
  assert.strictEqual(JSON.stringify(t), before, 'Quelle bleibt unverändert');
  const v = r.trip;
  assert.notStrictEqual(v.id, t.id); assert.ok(/^t[a-z0-9]+$/i.test(v.id));
  assert.strictEqual(r.from, t.id);
  assert.strictEqual(v.title, 'Silvester Allgäu · Wellness & Ruhe');
  assert.strictEqual(v.status, 'planung', 'gebucht wird nie mitkopiert');
  assert.strictEqual(v.created, '2026-10-24');
  assert.strictEqual(v.ledger, undefined, 'kein Buchungsbuch');
  assert.deepStrictEqual(J(v.check), {}, 'Checkliste nicht abgehakt, auch nicht „Unterkunft gebucht“');
  assert.strictEqual(v.offers[0].booked, false); assert.strictEqual(v.offers[0].paid, 0);
  assert.strictEqual(v.offers[0].deposit, 200, 'Kaution ist Plangröße');
  assert.strictEqual(v.activeOfferId, 'o123', 'gleicher Planpreis, aber nicht gebucht');
  assert.ok(!a.stayCommitted(v), 'Unterkunft in der Variante frei änderbar');
  assert.strictEqual(v.notes, '', 'Notizen nur auf Wunsch');
  assert.deepStrictEqual(J(v.customChecks), J(t.customChecks));
  assert.strictEqual(v.deadlineAck, undefined);
  /* Kosten der Kopie = Kosten der Quelle ohne Buchungsangaben */
  const plan = J(t); delete plan.ledger; plan.offers[0].booked = false; plan.offers[0].paid = 0; plan.check = {};
  assert.strictEqual(a.cost(v).total, a.cost(plan).total);
  assert.strictEqual(a.cost(v).byCat.unterkunft, 820);
  assert.ok(a.cost(t).total > a.cost(v).total, 'Buchungsbetrag 240 statt Plan 200 bleibt in der Quelle');
  const fs5 = a.financeSummary(v); assert.strictEqual(fs5.paid, 0);
  assert.ok(r.dropped.includes('Buchungsstatus und Zahlungen'));
  assert.ok(r.dropped.includes('abgehakte Checkliste')); assert.ok(r.dropped.includes('Notizen'));
  assert.ok(r.dropped.includes('Buchung und Zahlungen der Angebote')); assert.ok(r.dropped.includes('erledigte Fristen'));
  assert.ok(r.notes.some(x => /gebucht oder bezahlt/.test(x)));
  assert.deepStrictEqual(J(r.unknown), []);
});

test('Kopie besteht die Sicherungsprüfung und ist eine eigene Reise', () => {
  const v = g.variantCopy(bookedTrip()).trip;
  const back = a.validateBackup({ format: 'reiseplaner-backup', version: 2, trips: [J(v)] });
  assert.strictEqual(back[0].id, v.id);
  v.items.push({ uid: 'ix', act: 'x', day: 0, slot: 'morgen' }); v.customStays[0].name = 'geändert';
  const t = bookedTrip(); const w = g.variantCopy(t).trip; w.customStays[0].name = 'anders';
  assert.notStrictEqual(t.customStays[0].name, 'anders', 'tiefe Kopie');
  assert.strictEqual(w.title, 'Silvester Allgäu (Variante)');
});

test('Ohne Buchung: Idee bleibt Idee, Notizen auf Wunsch, Titel ≤ 80', () => {
  const t = a.newTrip({ title: 'X'.repeat(80), status: 'idee', notes: 'Merken' });
  const r = g.variantCopy(t, { label: 'Y'.repeat(70), notes: true });
  assert.strictEqual(r.trip.status, 'idee'); assert.strictEqual(r.trip.notes, 'Merken');
  assert.ok(r.trip.title.length <= 80); assert.ok(r.trip.title.endsWith(' · ' + 'Y'.repeat(60)));
  assert.deepStrictEqual(J(r.dropped), []); assert.deepStrictEqual(J(r.notes), []);
  assert.strictEqual(g.variantCopy(a.newTrip({ status: 'vorbei' })).trip.status, 'planung');
});

test('Storniertes Angebot wird nicht gewählt, Erstattung und Zahler entfallen', () => {
  const t = bookedTrip(); Object.assign(t.offers[0], { cancel: { on: '2026-11-02', fee: 50 }, refunds: [{ id: 'r1', on: '2026-11-05', amount: 250 }], paidBy: 'p1' });
  const r = g.variantCopy(t);
  assert.strictEqual(r.trip.activeOfferId, null);
  const o = r.trip.offers[0];
  assert.strictEqual(o.cancel, undefined); assert.strictEqual(o.refunds, undefined); assert.strictEqual(o.paidBy, undefined);
  assert.ok(r.notes.some(x => /storniert/.test(x)));
});

test('Format 3/4: Anreise-Abschnitte und Mitreisende bleiben, Geschichte entfällt, Version bleibt', () => {
  const t = bookedTrip();
  Object.assign(t, { schemaVersion: 4, party: [{ id: 'p1', name: 'Anna' }], expenses: [{ id: 'e1', amount: 12 }], journal: { days: {} }, ratings: { a1: 4 },
    media: [{ id: 'm1' }], books: [{ id: 'b1' }], transport: { out: [{ id: 'sabcd', mode: 'auto', cost: 80 }], back: [] }, zukunft: { a: 1 } });
  const r = g.variantCopy(t);
  assert.strictEqual(r.trip.schemaVersion, 4, 'kein Herabstufen');
  assert.deepStrictEqual(J(r.trip.party), J(t.party)); assert.deepStrictEqual(J(r.trip.transport), J(t.transport));
  ['expenses', 'journal', 'ratings', 'media', 'books'].forEach(k => assert.strictEqual(r.trip[k], undefined, k));
  ['Ausgaben unterwegs', 'Reisetagebuch', 'Bewertungen', 'Fotos', 'Reisebücher'].forEach(k => assert.ok(r.dropped.includes(k), k));
  assert.deepStrictEqual(J(r.unknown), ['zukunft'], 'unbekanntes Feld wird genannt, nicht still kopiert');
  assert.strictEqual(r.trip.zukunft, undefined);
  assert.throws(() => g.variantCopy(null), /Keine Reise/);
});

test('Jedes Feld einer neuen Reise ist einer Liste zugeordnet', () => {
  const known = new Set(vm.runInContext('[...VARIANT_PLAN,...VARIANT_RESET,...VARIANT_HISTORY]', context));
  Object.keys(a.newTrip()).forEach(k => assert.ok(known.has(k), k));
});

console.log('Varianten: ' + n + ' Prüfungen (V1, Feldlisten, Format 3/4, Storno) bestanden. Kein Browser-/iPhone-Test.');
