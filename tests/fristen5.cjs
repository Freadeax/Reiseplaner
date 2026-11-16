/* Fristen aus Format 5 (Claude, 16.11.2026): Storno-Stufen (cancel:<key>:<n>), offene Raten (plan:<offer>:<rate>) und eigene
   Aufgaben (task:<id>) in deadlines(). Rein, stabile IDs, Unbekanntes bleibt unbekannt, vergangene Stufen entfallen,
   Format 3/4 unverändert. Node-Test, kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const ctx = {
  window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: require('../v4logic.js'), RPV5: require('../v5logic.js'), RPCatalog: require('../catalog.js') },
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  setTimeout: () => 0, clearTimeout() {}, console,
};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const a = ctx.window.__app;
const J = x => JSON.parse(JSON.stringify(x));
const now = new Date('2026-11-20T10:00:00Z');
const fees = Object.fromEntries(['tax', 'cleaning', 'parking', 'wellness', 'mandatory'].map(k => [k, { state: 'included', amount: 0 }]));
const feats = Object.fromEntries(['sauna', 'kitchen', 'breakfast', 'cancel', 'quiet', 'accessible', 'parking'].map(k => [k, 'unknown']));

function trip(o) {
  o = o || {};
  const t = a.silvesterTemplate();
  const offer = { id: 'ohaus', stayId: t.stayId, name: 'Haus am See', location: 'Füssen', provider: 'direkt', type: 'fewo', start: t.start, end: t.end, persons: t.persons,
    price: o.price == null ? 680 : o.price, basis: 'stay', url: 'https://example.org/haus', checkedAt: '2026-11-01', validUntil: '2026-12-01', availability: 'available', terms: '',
    paid: o.paid == null ? 204 : o.paid, deposit: 0, booked: true, features: feats, fees,
    cancelTerms: { freeUntil: { date: '2026-12-01', time: '23:59', tz: 'Europe/Berlin' }, steps: [{ from: { date: '2026-12-02', time: null, tz: 'Europe/Berlin' }, pct: 30 }, { from: { date: '2026-12-20', time: null, tz: 'Europe/Berlin' }, pct: 80 }], src: 'Mail Vermieter', checkedAt: '2026-11-01' },
    payPlan: [{ id: 'anzahlung', label: 'Anzahlung', due: '2026-11-10', pct: 30 }, { id: 'restzahlung', label: 'Restzahlung', due: '2026-12-15', rest: true }] };
  t.schemaVersion = 5; t.offers = [offer]; t.activeOfferId = 'ohaus';
  t.party = [{ id: 'pphil', name: 'Philipp' }];
  t.tasks = [{ id: 'reifen', title: 'Winterreifen prüfen', due: { date: '2026-12-20', time: null, tz: null }, done: false, by: 'pphil' },
    { id: 'kette', title: 'Schneeketten leihen', due: null, done: false },
    { id: 'ausweis', title: 'Ausweis verlängern', due: { date: '2026-11-15', time: null, tz: null }, done: true, doneAt: '2026-11-14T08:00:00Z' }];
  t.extraCosts = [a.costEntryFromForm({ title: 'Skikurs', amount: '200' }, 'kurs')];
  a.setLedger(t, 'xc:kurs', 'status', 'gebucht'); a.setLedger(t, 'xc:kurs', 'amount', '200');
  t.ledger['xc:kurs'].cancelTerms = { freeUntil: null, steps: [{ from: { date: '2026-12-10', time: null, tz: 'Europe/Berlin' }, fee: 50 }], src: 'AGB', checkedAt: '2026-11-01' };
  return t;
}
let n = 0;
/* 1. Storno, Raten, Aufgaben mit stabilen IDs */
{
  const t = trip(); a.validateOffer(t.offers[0]); a.validateExtras(t);
  const before = JSON.stringify(t), d = a.deadlines(t, now);
  assert.equal(JSON.stringify(t), before, 'keine Mutation');
  assert.deepEqual(J(a.deadlines(t, now)), J(d), 'deterministisch');
  const by = Object.fromEntries(d.map(x => [x.id, x]));
  /* Storno Unterkunft: kostenlos bis 01.12., dann 30 %, dann 80 % von 680 € */
  assert.equal(by['cancel:stay:0'].kind, 'storno'); assert.equal(by['cancel:stay:0'].at.date, '2026-12-01');
  assert(/Kostenlos stornierbar bis: Haus am See/.test(by['cancel:stay:0'].label));
  assert(/^Jetzt: noch 11 Tage kostenlos/.test(by['cancel:stay:0'].detail), by['cancel:stay:0'].detail);
  assert.equal(by['cancel:stay:1'].detail, 'Ab dann: Stornogebühr 30 % = 204,00 €'); assert.equal(by['cancel:stay:1'].amount, 204);
  assert.equal(by['cancel:stay:2'].amount, 544, '80 % von 680 € auf den Cent');
  /* Buchungsbuch-Posten mit fester Gebühr */
  assert.equal(by['cancel:xc:kurs:1'].detail, 'Ab dann: Stornogebühr 50,00 €'); assert.equal(by['cancel:xc:kurs:1'].go, 'kosten');
  /* Raten: 204 € bezahlt deckt die Anzahlung (30 % = 204 €), Rest 476 € offen */
  assert(!by['plan:ohaus:anzahlung'], 'bezahlte Rate ist keine Frist');
  assert.equal(by['plan:ohaus:restzahlung'].kind, 'rate'); assert.equal(by['plan:ohaus:restzahlung'].amount, 476); assert.equal(by['plan:ohaus:restzahlung'].state, 'due');
  /* Aufgaben: datiert, ohne Datum, erledigt */
  assert.equal(by['task:reifen'].detail, 'zuständig: Philipp'); assert.equal(by['task:reifen'].state, 'due');
  assert.equal(by['task:kette'].state, 'unknown'); assert.equal(by['task:kette'].when, 'ohne Frist');
  assert.equal(by['task:ausweis'].state, 'done'); assert(/^erledigt/.test(by['task:ausweis'].when));
  /* Reihenfolge chronologisch, Abfahrt am selben Tag zuletzt */
  const dated = d.filter(x => x.at).map(x => x.at.date);
  assert.deepEqual(dated, dated.slice().sort(), 'chronologisch');
  /* Fahrplan und „Als Nächstes“ nehmen erledigte Aufgaben nicht auf */
  const plan = a.departurePlan(t, now);
  assert(plan.items.some(x => x.id === 'cancel:stay:0') && !plan.items.some(x => x.id === 'task:ausweis'));
  n++;
}
/* 2. Zeit läuft: vergangene Stufen entfallen, Raten werden überfällig, „erledigt“-Markierung gilt */
{
  const t = trip(), later = new Date('2026-12-16T10:00:00Z');
  const ids = a.deadlines(t, later).map(x => x.id);
  assert(!ids.includes('cancel:stay:0') && !ids.includes('cancel:stay:1') && ids.includes('cancel:stay:2'), 'nur künftige Storno-Stufen');
  assert(!ids.includes('cancel:xc:kurs:1'));
  assert.equal(a.deadlines(t, later).find(x => x.id === 'plan:ohaus:restzahlung').state, 'overdue');
  t.deadlineAck = { 'cancel:stay:2': { at: '2026-12-16T09:00:00Z', note: '' } };
  assert.equal(a.deadlines(t, later).find(x => x.id === 'cancel:stay:2').state, 'done', 'Markierung über die stabile ID');
  n++;
}
/* 3. Unbekannt bleibt unbekannt: Preis fehlt → Prozentgebühr und Rest ohne Betrag */
{
  const t = trip(); t.offers[0].fees = Object.assign({}, fees, { tax: { state: 'unknown', amount: null } });
  const by = Object.fromEntries(a.deadlines(t, now).map(x => [x.id, x]));
  assert.equal(by['cancel:stay:1'].amount, null); assert(/unbekannten Preis/.test(by['cancel:stay:1'].detail));
  assert.equal(by['plan:ohaus:restzahlung'].amount, null); assert(/Betrag noch unbekannt/.test(by['plan:ohaus:restzahlung'].detail));
  assert(by['plan:ohaus:anzahlung'] && by['plan:ohaus:anzahlung'].amount == null, 'Prozent-Rate ohne Preis ist offen, nicht bezahlt');
  n++;
}
/* 4. Nicht gebucht oder storniert: keine Storno-Fristen; ohne Format 5 nichts Neues */
{
  const t = trip(); t.offers[0].booked = false; t.ledger['xc:kurs'].status = 'offen';
  assert(!a.deadlines(t, now).some(x => x.kind === 'storno'), 'nicht gebucht → nichts zu stornieren');
  const v4 = trip(); v4.schemaVersion = 4;
  assert(!a.deadlines(v4, now).some(x => ['storno', 'rate', 'aufgabe'].includes(x.kind)), 'Format 4 liest die v5-Felder nicht');
  n++;
}
console.log('Fristen aus Format 5: ' + n + ' Prüfungen bestanden (Storno-Stufen Unterkunft und Buchungsbuch, Raten, Aufgaben, Zeitablauf, erledigt, unbekannte Beträge, nicht gebucht, Format 4 unverändert). Kein Browser-/iPhone-Test.');
