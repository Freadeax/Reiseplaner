/* Datenvertrag v5 (docs/SCHEMA_V5.md, v5logic.js): Version, Feldtreue, Prüfung, Rechenfälle aus den Modulen
   M02 R1–R9, M08 O3–O9, M05 V2/V3/V8, M09 G-R10/G-R12, M04 L1–L7, M11 U-R1–U-R3. Node-Test, kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const V5 = require('../v5logic.js');
const V4 = require('../v4logic.js');
const V3 = require('../v3logic.js');
const J = x => JSON.parse(JSON.stringify(x));
let n = 0; const test = (name, fn) => { try { fn(); n++; } catch (e) { e.message = name + ': ' + e.message; throw e; } };
const throws = (fn, re, what) => assert.throws(fn, re, what);

/* ---------- Grundreise Format 5 ---------- */
function base() {
  return {
    id: 'tbase1', title: 'Silvester', schemaVersion: 5, dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', persons: 2, budget: 1500,
    party: [{ id: 'pphil', name: 'Philipp', member: '0f8fad5b-d9cb-469f-a165-70867728950e' }, { id: 'ppart', name: 'Partnerin', attend: { 'os-aquaria': 'ja' } }],
    transport: { out: [{ id: 'seg1', mode: 'flug', from: 'STR', to: 'VIE', terminal: '1', baggage: { cabin: 1, hold: null }, who: ['pphil'], arrActual: { date: '2026-12-30', time: '11:05', tz: 'Europe/Vienna' } }], back: [] },
    expenses: [{ id: 'exp1', on: '2026-12-31', label: 'Fondue', amount: 53.76, cat: 'essen', paidBy: 'pphil', fx: { cur: 'CHF', orig: 50, rate: 0.93, on: '2026-12-31', src: 'ecb' } }],
    items: [{ uid: 'u1', act: 'os-aquaria', day: 1, slot: 'nachm', ref: { type: 'spot', id: 'os-aquaria', ver: 3 } }],
    offers: [{ id: 'o1', name: 'Hotel', price: 680, basis: 'stay', persons: 2, paid: 204, booked: true, kind: 'stay', minNights: 3, board: 'half',
      history: [{ at: '2026-10-01', price: 620, basis: 'stay', availability: 'available', src: 'Anbieterseite' }, { at: '2026-10-19', price: 680, basis: 'stay' }],
      payPlan: [{ id: 'pay1', label: 'Anzahlung', due: '2026-10-20', pct: 30 }, { id: 'pay2', label: 'Rest', due: '2026-11-30', rest: true }],
      payments: [{ id: 'zah1', on: '2026-10-20', amount: 204, by: 'pphil' }],
      cancelTerms: { freeUntil: { date: '2026-12-01', time: null, tz: null }, steps: [{ from: { date: '2026-12-02', time: null, tz: null }, pct: 50, fee: null }, { from: { date: '2026-12-20', time: null, tz: null }, pct: 100, fee: null }], src: 'AGB Hotel', checkedAt: '2026-10-19' } }],
    activeOfferId: 'o1',
    ledger: { stay: { status: 'gebucht', amount: 680, paid: 204, payments: [{ id: 'zah2', on: '2026-10-20', amount: 204 }] } },
    checkoutTime: '10:00',
    tasks: [{ id: 'task1', title: 'Winterreifen prüfen', due: { date: '2026-12-20', time: null, tz: null }, done: false, by: 'pphil', src: 'user' }],
    deadlineAck: { 'pay:stay': { at: '2026-10-20T08:00:00Z', note: 'überwiesen' } },
    packing: { custom: [{ id: 'pack1', label: 'Schneeschuhe', group: 'Winter', who: 'ppart', qty: '2' }], hidden: ['Packliste:Sonnencreme'] },
    countries: ['AT'], idDocs: [{ id: 'iddo1', who: 'pphil', kind: 'perso', validUntil: '2030-05-01' }],
    insurance: [{ id: 'ins1', kind: 'kranken', provider: 'Kasse', phone: '+49 1', from: '2026-01-01', to: '2026-12-31', who: null }],
    emergency: { homeContact: { name: 'Eltern', phone: '+49 2' }, stayPhone: null, note: '' },
    variant: { group: 'grsilv', label: 'Wellness/Ruhe', state: 'offen', from: 'tbase0', at: '2026-11-15T10:00:00Z' },
    assumptions: { fuel: { low: 1.6, high: 2.0 }, acts: null, stay: null, note: '' }, prosCons: { pros: ['Sauna'], cons: [], open: ['Kurtaxe'] },
    criteria: { must: ['sauna'], like: ['schnee'], avoid: ['party'], budgetWish: 1200, budgetMax: 1500, returnBy: { date: '2027-01-03', time: '17:00' }, maxDriveMin: 180, cancel: 'frei', notes: '' },
    origin_tpl: { id: 'silvester', version: 1, kind: 'builtin', at: '2026-11-01T09:00:00Z' },
    guestCards: [{ id: 'gcard', cardId: 'oberstaufen-plus', name: 'Oberstaufen PLUS', scope: { offerId: 'o1' }, status: 'enthalten', evidence: { on: '2026-10-19', url: 'https://example.org/beleg', note: 'Mail Gastgeber' }, persons: null }],
    docs: [{ id: 'doc1', kind: 'bestaetigung', title: 'Hotelbestätigung', link: { key: 'offer:o1' }, valid: { from: '2026-12-30', to: '2027-01-03' },
      file: { sha256: 'a'.repeat(64), bytes: 120000, mime: 'application/pdf', pages: 2 }, secret: { label: 'Buchungsnummer', value: 'HX-4711' }, share: 'mitglieder', cloud: { state: 'none' } },
      { id: 'doc2', kind: 'ticket', title: 'Bordkarte', link: { key: 'tr:seg1' }, secret: { label: 'PNR', value: null, local: true }, share: 'ich', owner: 'pphil', cloud: { state: 'none' } }],
    stayRef: { id: 'os-holidu', ver: 2 },
    dayRoutes: { 1: { order: ['u1'], km: 4.2, min: 9, src: 'osrm', at: '2026-11-15T10:00:00Z' } }
  };
}

/* ---------- 1. Version, Feldtreue, Rückstufung ---------- */
test('needsV5 und Zielversion', () => {
  assert.equal(V5.needsV5({ title: 'x' }), false);
  assert.equal(V5.needsV5({ tasks: [], packing: {}, criteria: null, checkoutTime: '' }), false, 'leere Felder zählen nicht');
  assert.equal(V5.needsV5({ tasks: [{ id: 'a' }] }), true);
  assert.equal(V5.needsV5({ offers: [{ id: 'o1', payments: [{}] }] }), true, 'verschachtelt im Angebot');
  assert.equal(V5.needsV5({ ledger: { stay: { cancelTerms: { steps: [] } } } }), true, 'Buchungsbuch');
  assert.equal(V5.needsV5({ transport: { out: [{ id: 'seg1', terminal: '2' }], back: [] } }), true, 'Abschnitt');
  assert.equal(V5.needsV5({ party: [{ id: 'p1', name: 'A', member: null }] }), false);
  assert.equal(V5.targetVersion({ schemaVersion: 4 }), 4, 'nie niedriger');
  assert.equal(V5.targetVersion({ media: [{}] }, { needsV4: V4.needsV4 }), 4);
  assert.equal(V5.targetVersion({ transport: { out: [{ mode: 'auto' }], back: [] } }, { needsV4: V4.needsV4, needsV3: V3.needsV3 }), 3);
  assert.equal(V5.targetVersion({ schemaVersion: 3, tasks: [{}] }), 5);
  throws(() => V5.assertNoDowngrade(5, { schemaVersion: 4 }), /zurückgestuft/);
  assert.deepEqual(V5.readable({ schemaVersion: 5 }), { ok: true, newer: false, schema: 5 });
  assert.equal(V5.readable({ schemaVersion: 6 }).newer, true);
  assert.equal(V5.readable({ schemaVersion: 5 }, 4).newer, true, 'Stand mit Format 4 liest v5 nur');
});
test('serializeTrip5: Format 5 unverändert, darunter keine v5-Felder', () => {
  const t = base();
  assert.deepEqual(V5.serializeTrip5(t), t, 'Feldtreue Format 5');
  const old = { schemaVersion: 4, title: 'x', tasks: [], offers: [{ id: 'o1', payments: [], history: [] }], ledger: { stay: { status: 'offen', paid: 0, payments: [] } }, party: [{ id: 'p1', name: 'A', member: null }] };
  const s = V5.serializeTrip5(old);
  assert(!('tasks' in s) && !('payments' in s.offers[0]) && !('history' in s.offers[0]) && !('payments' in s.ledger.stay) && !('member' in s.party[0]), 'leere v5-Felder entfernt');
  throws(() => V5.serializeTrip5({ schemaVersion: 4, tasks: [{ id: 'a' }] }), /Formats 5/);
  throws(() => V5.serializeTrip5({ schemaVersion: 6 }), /neuer/);
});
test('Ältere App-Stände lehnen Format 5 ab statt es umzuschreiben', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  let code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
  const ctx = { window: { addEventListener() {}, RPV3: V3, RPV4: V4, RPCatalog: require('../catalog.js') }, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, setTimeout: () => 0, clearTimeout() {}, console };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const a = ctx.window.__app, t = a.silvesterTemplate();
  t.schemaVersion = 5; t.tasks = [{ id: 'task1', title: 'x', due: null, done: false }];
  const bk = J(a.backupData([a.silvesterTemplate()])); bk.trips = [t];
  throws(() => a.validateBackup(bk), /Reiseversion|Format/i);
});

/* ---------- 2. Prüfung ---------- */
test('vollständige Format-5-Reise ist gültig', () => { assert.equal(V5.validateV5(base()), true); });
test('v5-Felder unter Format 5 abgelehnt', () => {
  throws(() => V5.validateV5({ schemaVersion: 4, criteria: { budgetMax: 1500 } }), /Format 5/);
  assert.equal(V5.validateV5({ schemaVersion: 4, tasks: [] }), true, 'leere Liste stört nicht');
});
const bad = (mut, re, what) => { const t = base(); mut(t); throws(() => V5.validateV5(t), re, what); };
test('Prüfregeln je Modul', () => {
  bad(t => { t.tasks[0].by = 'pxxx'; }, /gibt es in dieser Reise nicht/, 'Aufgabe: unbekannte Person');
  bad(t => { t.tasks[0].doneAt = '2026-11-15T10:00:00Z'; }, /offene Aufgabe/);
  bad(t => { t.tasks.push(J(t.tasks[0])); }, /doppelte ID/);
  bad(t => { t.tasks[0].extra = 1; }, /unbekanntes Feld/);
  bad(t => { t.checkoutTime = '25:00'; }, /Check-out/);
  bad(t => { t.deadlineAck['pay:stay'].at = 'gestern'; }, /Zeitpunkt/);
  bad(t => { t.idDocs[0].number = 'L01X00T47'; }, /unbekanntes Feld/, 'keine Dokumentnummer');
  bad(t => { t.countries.push('at'); }, /Ländercode/);
  bad(t => { t.insurance[0].to = '2025-12-31'; }, /Ende vor Beginn/);
  bad(t => { t.variant.state = 'vielleicht'; }, /Zustand/);
  bad(t => { t.assumptions.fuel = { low: 2.1, high: 1.9 }; }, /Spanne/);
  bad(t => { t.criteria.like.push('sauna'); }, /mehreren Gruppen/);
  bad(t => { t.criteria.budgetWish = 1600; }, /Wunschbudget über/);
  bad(t => { t.criteria.returnBy = { date: '2027-01-03' }; }, /Uhrzeit/);
  bad(t => { t.guestCards[0].evidence = null; }, /braucht einen Beleg/);
  bad(t => { t.guestCards[0].scope = { offerId: 'o1', stayId: 'x' }; }, /genau eine/);
  bad(t => { t.guestCards[0].evidence.url = 'http://example.org'; }, /https/);
  bad(t => { t.docs[1].owner = undefined; delete t.docs[1].owner; }, /Besitzer/);
  bad(t => { t.docs[1].secret.value = 'ABC123'; }, /nur auf dem Gerät/);
  bad(t => { t.docs[0].cloud = { state: 'done' }; }, /Cloud-Pfad/);
  bad(t => { t.docs[1].cloud = { state: 'queued' }; }, /nichts hochzuladen/);
  bad(t => { t.docs[1].file = J(t.docs[0].file); }, /dieselbe Datei/);
  bad(t => { t.docs[0].file.bytes = 16 * 1024 * 1024; }, /15 MB/);
  bad(t => { t.offers[0].kind = 'ferienhaus'; }, /Art/);
  bad(t => { t.offers[0].history.reverse(); }, /aufsteigen/);
  bad(t => { t.offers[0].minNights = 0; }, /Mindestnächte/);
  bad(t => { t.offers[0].payments[0].amount = 200; }, /weicht von „bezahlt“/, 'paid bleibt die Summe');
  bad(t => { t.ledger.stay.payments.push({ id: 'zah3', on: '2026-10-21', amount: 0 }); }, /größer als 0/);
  bad(t => { t.offers[0].cancelTerms.steps[0].fee = 10; }, /genau eins/);
  bad(t => { t.offers[0].cancelTerms.steps.reverse(); }, /aufsteigen/);
  bad(t => { t.offers[0].cancelTerms.freeUntil.date = '2026-12-05'; }, /vor der ersten Stufe/);
  bad(t => { t.offers[0].cancelTerms.steps[0].from = { date: '2027-03-28', time: '02:30', tz: 'Europe/Berlin' }; t.offers[0].cancelTerms.steps.splice(1); }, /Zeitumstellung/);
  bad(t => { t.transport.out[0].mode = 'bahn'; }, /nur bei Flügen/);
  bad(t => { t.transport.out[0].who = ['pzzz']; }, /gibt es in dieser Reise nicht/);
  bad(t => { t.party[1].member = t.party[0].member; }, /zwei Mitreisenden/);
  bad(t => { t.party[0].member = 'philipp@example.org'; }, /Konto-Verknüpfung/, 'keine E-Mail in der Reise');
  bad(t => { t.expenses[0].fx.rate = null; }, /Euro-Betrag offen/);
  bad(t => { t.expenses[0].fx.cur = 'EUR'; }, /nicht EUR/);
  bad(t => { t.items[0].ref.type = 'hotel'; }, /Verweisart/);
  bad(t => { t.dayRoutes[1].at = null; }, /Abrufzeitpunkt/);
});
test('partyUses zeigt alle Verweise auf eine Person', () => {
  const u = V5.partyUses(base(), 'pphil');
  ['task:task1', 'iddoc:iddo1', 'doc:doc2', 'tr:seg1', 'offer:o1:zah1'].forEach(k => assert(u.includes(k), k));
  assert.deepEqual(V5.partyUses(base(), 'ppart'), ['pack:pack1']);
});

/* ---------- 3. Stornogebühr R1–R9 (M02 §6) ---------- */
const terms = (free, steps) => ({ freeUntil: free ? { date: free, time: null, tz: null } : null, steps: (steps || []).map(s => ({ from: { date: s[0], time: null, tz: null }, pct: s[1], fee: s[2] == null ? null : s[2] })), src: 'Test', checkedAt: '2026-11-01' });
const at = (d, h) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), h == null ? 12 : h);
test('R1–R9', () => {
  const tz = { tz: 'Europe/Berlin' };
  let r = V5.cancelFee(terms('2026-12-01'), 800, at('2026-11-30'), tz);
  assert.equal(r.fee, 0); assert.equal(r.text, 'noch 1 Tag kostenlos', 'R1');
  r = V5.cancelFee(terms('2026-12-01', [['2026-12-02', 50]]), 800, at('2026-12-02'), tz); assert.equal(r.fee, 400, 'R2');
  r = V5.cancelFee(terms('2026-12-01', [['2026-12-02', 50], ['2026-12-20', 100]]), 800, at('2026-12-25'), tz); assert.equal(r.fee, 800, 'R3');
  r = V5.cancelFee(terms(null, [['2026-12-01', 33]]), 333.33, at('2026-12-01'), tz); assert.equal(r.fee, 110, 'R4 kaufmännisch auf Cent');
  r = V5.cancelFee(null, 800, at('2026-12-01'), tz); assert.equal(r.fee, null); assert.equal(r.task, 'Stornobedingungen klären', 'R5 kein „0 €“');
  r = V5.cancelFee(terms('2026-12-01', [['2026-12-02', 50]]), null, at('2026-12-02'), tz); assert.equal(r.fee, null); assert.equal(r.state, 'unbekannt', 'R6');
  r = V5.cancelFee(terms('2026-12-01', [['2026-12-02', null, 120]]), 800, at('2026-12-10'), tz); assert.equal(r.fee, 120, 'R7');
  /* R8: frei bis 01.12. 18:00 Europe/Vienna; 17:30 Berlin (= 16:30 UTC) noch frei, dieselbe Uhrzeit auf einem Gerät in New York ebenso,
     Anzeige in der Fristzone. 18:30 Wien ist nicht mehr frei. */
  const t8 = { freeUntil: { date: '2026-12-01', time: '18:00', tz: 'Europe/Vienna' }, steps: [{ from: { date: '2026-12-02', time: null, tz: 'Europe/Vienna' }, pct: 50, fee: null }] };
  r = V5.cancelFee(t8, 800, Date.UTC(2026, 11, 1, 16, 30), { tz: 'Europe/Berlin' }); assert.equal(r.state, 'frei'); assert.equal(r.text, 'heute noch kostenlos bis 18:00 (Europe/Vienna)');
  r = V5.cancelFee(t8, 800, Date.UTC(2026, 11, 1, 16, 30), { tz: 'America/New_York' }); assert.equal(r.state, 'frei', 'R8 Gerät in New York');
  r = V5.cancelFee(t8, 800, Date.UTC(2026, 11, 1, 17, 30), {}); assert.equal(r.state, 'unbekannt', 'Lücke bis zur ersten Stufe nicht als 0 €');
  r = V5.cancelFee(terms('2026-12-01'), 800, at('2026-12-05'), { cancel: { on: '2026-12-04', fee: null } }); assert.equal(r.fee, null); assert.equal(r.state, 'storniert', 'R9 Gebühr unbekannt');
  r = V5.cancelFee(terms('2026-12-01'), 800, at('2026-12-05'), { cancel: { on: '2026-12-04', fee: 80 } }); assert.equal(r.fee, 80, 'R9');
  assert.deepEqual(V5.cancelDeadlines('offer:o1', base().offers[0].cancelTerms).map(d => d.id), ['cancel:offer:o1:0', 'cancel:offer:o1:1', 'cancel:offer:o1:2'], 'stabile Frist-IDs');
});

/* ---------- 4. Zahlungsplan und Angebote (M08 §6) ---------- */
test('O7/O8 Zahlungsplan', () => {
  const s = V5.payPlanSchedule(base().offers[0].payPlan, 680);
  assert.deepEqual(s.rows.map(r => r.amount), [204, 476], 'O7'); assert.equal(s.sumKnown, 68000); assert.equal(s.over, false);
  const odd = V5.payPlanSchedule([{ id: 'a', label: 'A', due: '2026-10-01', pct: 33 }, { id: 'b', label: 'B', due: '2026-11-01', pct: 33 }, { id: 'c', label: 'C', due: '2026-12-01', rest: true }], 333.33);
  assert.equal(odd.rows.reduce((x, r) => x + Math.round(r.amount * 100), 0), 33333, 'Summe exakt Preis');
  bad(t => { t.offers[0].payPlan = [{ id: 'paya', label: 'A', due: '2026-10-01', amount: 500 }, { id: 'payb', label: 'B', due: '2026-11-01', amount: 300 }]; }, /übersteigt den Preis/, 'O8');
  assert.equal(V5.payPlanSchedule([{ id: 'a', label: 'A', due: '2026-10-01', pct: 30 }], null).rows[0].amount, null, 'Preis unbekannt → Rate unbekannt');
  const st = V5.payPlanStatus(base().offers[0].payPlan, 680, 204, '2026-12-05');
  assert.deepEqual(st.rows.map(r => r.state), ['bezahlt', 'ueberfaellig']); assert.equal(st.rows[1].open, 476);
});
test('O3–O6, O9, O10 Angebote', () => {
  const o = J(base().offers[0]); o.booked = false; o.validUntil = '2026-12-01';
  let p = V5.offerPriceState(o, '2026-11-15');
  assert.equal(p.current, 680); assert.deepEqual(p.change, { abs: 60, pct: 9.7, since: '2026-10-01' }, 'O3');
  const b = J(base().offers[0]); b.price = 620; b.history.push({ at: '2026-11-01', price: 580, basis: 'stay' });
  p = V5.offerPriceState(b, '2026-11-15'); assert.equal(p.current, 620, 'O4 Buchungsbetrag bleibt'); assert(/Umbuchung prüfen/.test(p.hints[0].text));
  o.validUntil = '2026-11-14'; p = V5.offerPriceState(o, '2026-11-15'); assert.equal(p.expired, true, 'O9'); assert(p.hints.some(h => /veraltet/.test(h.text)));
  assert.deepEqual(V5.offerFits({ minNights: 3, persons: 2 }, 2, 2).issues, ['passt nicht zur Reise (mind. 3 Nächte)'], 'O5');
  assert.equal(V5.comparable([{ persons: 2 }, { persons: 3 }]).text, 'nicht vergleichbar: Personen', 'O6');
  const v2 = { schemaVersion: 2, offers: [{ id: 'o1', name: 'Alt', price: 500 }] };
  assert.deepEqual(V5.serializeTrip5(v2), v2, 'O10 Angebot ohne kind bleibt unverändert');
});

/* ---------- 5. Budget und Varianten (M05 §6) ---------- */
test('V2/V3/V8', () => {
  assert.equal(V5.budgetVerdict(1420, [], 1500).text, 'im Budget, 80,00 € Spielraum', 'V2');
  const v3 = V5.budgetVerdict(1380, ['Kurtaxe'], 1500); assert.equal(v3.state, 'unsicher'); assert.equal(v3.text, 'nicht sicher im Budget (Kurtaxe offen)', 'V3');
  assert.equal(V5.budgetVerdict(1600, [], 1500).state, 'ueber');
  assert.equal(V5.budgetMax({ budget: 1200, criteria: { budgetMax: 1500 } }), 1500, 'Obergrenze vor Wunschbudget');
  assert.equal(V5.budgetMax({ budget: 1200 }), 1200);
  const a = base(), c = base(); a.id = 'ta'; c.id = 'tc'; a.variant.state = 'gewaehlt'; c.variant.state = 'gewaehlt';
  assert.deepEqual(V5.variantConflicts([a, c, base()])[0].trips, ['ta', 'tc'], 'V8 nichts automatisch zurückgesetzt');
});

/* ---------- 6. Gästekarten: G-R10 und G-R12 gegen die echte App ---------- */
test('G-R10 Unterkunftswechsel', () => {
  const t = base();
  assert.equal(V5.guestCardStatus(t, { offerId: 'o1' }).status, 'enthalten');
  const w = V5.guestCardStatus(t, { stayId: 'os-andere', stayCard: true });
  assert.equal(w.status, 'unbestaetigt'); assert.equal(w.stale, 'gehört zur früheren Unterkunft');
  assert.equal(V5.guestCardStatus(t, { stayId: 'os-andere', stayCard: false }).status, 'nicht');
  t.cardConfirmed = true; assert.equal(V5.guestCardStatus(t, { stayId: 'os-andere', stayCard: false }).status, 'nicht', 'cardConfirmed ab Format 5 nicht mehr gelesen');
});
test('G-R12 Anheben übernimmt cardConfirmed ohne Statuswechsel', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  let code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
  const ctx = { window: { addEventListener() {} }, document: { addEventListener() {}, querySelector() { return null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
    localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, console };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const run = s => vm.runInContext(s, ctx), a = ctx.window.__app, STAYS = run('STAYS'), PLACES = run('PLACES'), cost = run('cost');
  let checked = 0, migrated = 0;
  Object.keys(PLACES).forEach(place => STAYS.filter(s => s.place === place).forEach(st => [true, false].forEach(conf => {
    const t = a.silvesterTemplate(); t.place = place; t.stayId = st.id; t.cardConfirmed = conf;
    const before = cost(t).card.status;
    const r = V5.candidate5(t, c => { c.tasks = [{ id: 'task1', title: 'Gästekarte abholen', due: null, done: false }]; }, { stayId: st.id, stayCard: st.card, cardName: PLACES[place].card });
    assert.equal(r.upgrade, true); assert.equal(r.trip.schemaVersion, 5);
    assert.equal(V5.guestCardStatus(r.trip, { stayId: st.id, stayCard: st.card }).status, before, place + '/' + st.id + ' ' + conf);
    assert.equal(r.trip.cardConfirmed, conf, 'cardConfirmed bleibt gespeichert (Feldtreue)');
    if (r.migrated.length) { migrated++; assert.deepEqual(r.trip.guestCards[0].evidence, { on: null, note: 'aus früherer Bestätigung übernommen' }); }
    checked++;
  })));
  assert(checked > 20 && migrated > 0, 'genug Fälle: ' + checked + '/' + migrated);
  const t = a.silvesterTemplate(); assert.equal(V5.candidate5(t, null, {}).upgrade, false, 'ohne v5-Feld kein Anheben');
});

/* ---------- 7. Ausland L1–L7 (M04 §6) ---------- */
test('L1–L7', () => {
  assert.equal(V5.idDocCheck({ validUntil: '2027-02-15' }, '2027-01-03', 3).text, 'reicht nicht (endet 1 Monat 12 Tage nach Rückkehr, verlangt 3 Monate)', 'L1');
  assert.equal(V5.idDocCheck({ validUntil: '2027-02-15' }, '2027-01-03', null).state, 'gueltig-ohne-regel', 'L2');
  assert.equal(V5.idDocCheck({ validUntil: null }, '2027-01-03', 3).state, 'ungeprueft', 'L3');
  assert.equal(V5.idDocCheck({ validUntil: '2027-06-01' }, '2027-01-03', 3).state, 'gueltig');
  const c = V5.coverageGaps({ from: '2026-01-01', to: '2026-12-31' }, '2026-12-30', '2027-01-03');
  assert.equal(c.state, 'luecke'); assert.equal(c.text, 'deckt nicht den ganzen Zeitraum (01.01.2027–03.01.2027 nicht)', 'L4');
  assert.equal(V5.fxToEur(50, 0.93), 53.76, 'L5'); assert.equal(V5.fxToEur(50, null), null, 'L6'); assert.equal(V5.fxToEur(50, 0.95), 52.63, 'L7');
});

/* ---------- 8. Ausgabefilter (M11 §6) ---------- */
test('U-R1–U-R3', () => {
  ['book', 'share', 'ics', 'plan', 'template'].forEach(p => {
    const o = V5.outputFilter(base(), p), s = JSON.stringify(o);
    assert(!s.includes('HX-4711') && !('docs' in o) && !('idDocs' in o) && !('emergency' in o) && !s.includes('0f8fad5b'), p);
  });
  const b = V5.outputFilter(base(), 'backup');
  assert.equal(b.docs[0].secret.value, null, 'U-R3 Sicherung ohne Wahl'); assert.equal(b.docs[0].file.sha256, 'a'.repeat(64));
  assert.equal(V5.outputFilter(base(), 'backup', { withSecrets: true }).docs[0].secret.value, 'HX-4711', 'U-R4 mit Wahl');
  const t = base(); V5.outputFilter(t, 'book'); assert.equal(t.docs[0].secret.value, 'HX-4711', 'Quelle unverändert');
  throws(() => V5.outputFilter(t, 'irgendwas'), /unbekannter Zweck/);
});

console.log('Format 5 (v5logic): ' + n + ' Prüfungen bestanden (Version, Feldtreue, Prüfregeln, R1–R9, O3–O10, V2/V3/V8, G-R10/G-R12, L1–L7, U-R1–U-R4). Reine Funktionen. Kein Browser-/iPhone-Test.');
