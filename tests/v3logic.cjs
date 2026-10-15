/* Rechenfälle aus docs/SCHEMA_V3.md (S1–S10, U1–U3, T1–T7) gegen v3logic.js. Reine Logik, nicht in der App verdrahtet. */
const assert = require('assert');
const V = require('../v3logic.js');

/* ---------- Storno und Erstattungen ---------- */
const R = (amount, id) => ({ id: id || 'rf' + Math.round(amount * 100), on: '2027-01-10', amount });
const C = (fee) => ({ on: '2027-01-05', fee });
const cases = [
  ['S1', { paid: 20, cancel: C(100) }, 100, { netPaid: 20, cost: 100, feeOpen: 80, refundOpen: 0 }],
  ['S2', { paid: 200, cancel: C(50) }, 200, { netPaid: 200, cost: 50, feeOpen: 0, refundOpen: 150 }],
  ['S3', { paid: 200, refunds: [R(150)], cancel: C(50) }, 200, { netPaid: 50, cost: 50, feeOpen: 0, refundOpen: 0 }],
  ['S4', { paid: 200, refunds: [R(100)], cancel: C(50) }, 200, { netPaid: 100, cost: 50, feeOpen: 0, refundOpen: 50 }],
  ['S5', { paid: 0, cancel: C(0) }, 80, { netPaid: 0, cost: 0, feeOpen: 0, refundOpen: 0 }],
  ['S6', { paid: 200, refunds: [R(200)], cancel: C(50) }, 200, { netPaid: 0, cost: 50, feeOpen: 50, refundOpen: 0 }],
  ['S7', { paid: 200, refunds: [R(150)], cancel: C(100) }, 200, { netPaid: 50, cost: 100, feeOpen: 50, refundOpen: 0 }],
  ['S10', { paid: 200, refunds: [R(150)] }, 200, { netPaid: 50, cost: 200, open: 150, refundOpen: 0 }]
];
for (const [name, e, plan, exp] of cases) {
  V.validateMoneyMoves(e, name);
  const m = V.cancelMath(e, plan);
  for (const k of Object.keys(exp)) assert.equal(m[k], exp[k], name + ' ' + k);
}
/* S8 Gebühr unbekannt: nicht 0, nichts „erledigt“ */
const s8 = V.cancelMath({ paid: 200, cancel: C(null) }, 200);
assert(s8.unknown && s8.cost === null && s8.feeOpen === null && s8.refundOpen === null && s8.netPaid === 200);
/* S9 = S1 + S2: getrennt summiert, kein Saldo 70 */
const s9 = V.sumCancel([V.cancelMath({ paid: 20, cancel: C(100) }, 100), V.cancelMath({ paid: 200, cancel: C(50) }, 200)]);
assert.deepEqual([s9.cost, s9.feeOpen, s9.refundOpen], [150, 80, 150]);
assert.equal(V.sumCancel([s8]).unknown, 1);
/* Cent genau */
assert.equal(V.cancelMath({ paid: 0.3, refunds: [R(0.1, 'rfa1')], cancel: C(0.1) }, 1).refundOpen, 0.1);
/* Validierung */
assert.throws(() => V.validateMoneyMoves({ paid: 100, refunds: [R(60, 'rfa1'), R(50, 'rfa2')] }, 'X'), /übersteigen/);
assert.throws(() => V.validateMoneyMoves({ paid: 100, refunds: [R(10, 'rfa1'), R(10, 'rfa1')] }, 'X'), /doppelte/);
assert.throws(() => V.validateMoneyMoves({ paid: 100, cancel: { on: '2027-01-05' } }, 'X'), /fehlt/);
assert.throws(() => V.validateMoneyMoves({ paid: 100, cancel: { on: '2027-02-30', fee: 1 } }, 'X'), /Stornodatum/);
assert.throws(() => V.validateMoneyMoves({ paid: 100, cancel: { on: '2027-01-05', fee: 1.005 } }, 'X'), /Nachkommastellen/);
assert.throws(() => V.validateMoneyMoves({ paid: 100, cancel: { on: '2027-01-05', fee: 1, extra: 1 } }, 'X'), /unbekanntes Feld/);
assert.throws(() => V.validateMoneyMoves({ paid: 100, refunds: [{ id: 'rfa1', on: '2027-01-01', amount: 0 }] }, 'X'), /größer als 0/);
assert.throws(() => V.validateMoneyMoves(JSON.parse('{"paid":1,"refunds":[{"id":"rfa1","on":"2027-01-01","amount":1,"__proto__":1}]}'), 'X'));

/* ---------- Unterkunft U1–U3 ---------- */
const total = o => o.price;
const offers = [{ id: 'oalt', price: 280, paid: 100, booked: true, cancel: C(50) }, { id: 'oneu', price: 300 }, { id: 'okand', price: 250 }];
let st = V.stayAggregate(offers, 'oneu', total);
assert.equal(st.cost, 350, 'U1: 50 Gebühr + 300 aktiv'); assert.deepEqual(st.unknown, []);
assert.equal(st.parts.find(p => p.id === 'oalt').refundOpen, 50, 'U1: 100 bezahlt − 50 Gebühr → 50 Erstattung offen, getrennt');
st = V.stayAggregate([Object.assign({}, offers[0], { cancel: C(null) }), offers[1]], 'oneu', total);
assert.equal(st.cost, 300); assert.deepEqual(st.unknown, ['oalt'], 'U2: Gebühr unbekannt, nicht 0');
assert.equal(V.canLeaveOffer({ id: 'x', booked: true }).ok, false, 'U3');
assert.equal(V.canLeaveOffer({ id: 'x', paid: 10 }).ok, false);
assert.equal(V.canLeaveOffer({ id: 'x', paid: 10, cancel: C(null) }).ok, true);
assert.equal(V.canLeaveOffer({ id: 'x' }).ok, true);

/* ---------- Anreise-Abschnitte T1–T7 ---------- */
const seg = (o) => Object.assign({ id: 'sg' + Math.random().toString(36).slice(2, 8), mode: 'auto', dep: { date: '2027-05-01', time: null, tz: null } }, o);
const t1 = V.validateTransport({ out: [
  seg({ id: 'sauto', mode: 'auto', from: 'Göppingen', to: 'STR', km: 40, dep: { date: '2027-05-01', time: '05:30', tz: 'Europe/Berlin' }, arr: { date: '2027-05-01', time: '06:10', tz: 'Europe/Berlin' }, addons: [{ id: 'apark', label: 'Parken P14', cost: 49 }] }),
  seg({ id: 'sflug', mode: 'flug', fromCode: 'STR', toCode: 'PMI', number: 'XY 1234', cost: 120, per: 'pp', dep: { date: '2027-05-01', time: '08:30', tz: 'Europe/Berlin' }, arr: { date: '2027-05-01', time: '10:45', tz: 'Europe/Madrid' }, addons: [{ id: 'abag', label: 'Aufgabegepäck', cost: 35, per: 'pp' }] }),
  seg({ id: 'strans', mode: 'transfer', from: 'PMI', to: 'Hotel', cost: 30, dep: { date: '2027-05-01', time: '11:30', tz: 'Europe/Madrid' }, arr: { date: '2027-05-01', time: '12:15', tz: 'Europe/Madrid' } })
], back: [] });
const c1 = V.transportCost(t1, { persons: 2, verb: 7, preis: 2 });
assert.equal(c1.total, 5.6 + 49 + 240 + 70 + 30, 'T1: Summe der Abschnitte inkl. Zusatzposten');
assert.deepEqual(c1.open, []);
assert(c1.lines.some(l => l.key === 'tr:sflug:abag' && l.c === 70), 'T6: Gepäck als eigener Posten (Schlüssel für Buchungsbuch)');
const tl1 = V.transportTimeline(t1, { start: '2027-05-01' });
assert.deepEqual(tl1.arrival, { date: '2027-05-01', time: '12:15', tz: 'Europe/Madrid' });
assert(tl1.checks.some(c => /nur 140 Min\. am Flughafen/.test(c.text)) === false, 'Auto-Ankunft 06:10, Abflug 08:30 = 140 Min., über Richtwert');
/* T2 Flug ohne Preis */
const t2 = V.validateTransport({ out: [seg({ id: 'sfl2', mode: 'flug' })] });
assert.deepEqual(V.transportCost(t2, { persons: 2 }).open.length, 1); assert.equal(V.transportCost(t2, { persons: 2 }).total, 0);
/* T3 über Mitternacht mit Zeitzone */
const t3 = V.validateTransport({ out: [seg({ id: 'sfl3', mode: 'flug', dep: { date: '2027-05-01', time: '22:30', tz: 'Europe/Berlin' }, arr: { date: '2027-05-02', time: '01:15', tz: 'Europe/Athens' } })] });
const tl3 = V.transportTimeline(t3, { start: '2027-05-01' });
assert(tl3.checks.some(c => /Folgetag/.test(c.text)), 'T3: Ankunft am Folgetag');
assert(tl3.checks.some(c => c.level === 'warn' && /nach dem Reisebeginn/.test(c.text)), 'T3: Ankunft nach Reisebeginn');
assert.equal((V.zonedMs('2027-05-02', '01:15', 'Europe/Athens') - V.zonedMs('2027-05-01', '22:30', 'Europe/Berlin')) / 60000, 105, '1:45 Std. Flugzeit über Zeitzonen');
/* T4 knapper Umstieg */
const t4 = V.validateTransport({ out: [
  seg({ id: 'sfla', mode: 'flug', dep: { date: '2027-05-01', time: '08:00', tz: 'Europe/Berlin' }, arr: { date: '2027-05-01', time: '09:10', tz: 'Europe/Berlin' } }),
  seg({ id: 'sflb', mode: 'flug', dep: { date: '2027-05-01', time: '09:40', tz: 'Europe/Berlin' }, arr: { date: '2027-05-01', time: '12:00', tz: 'Europe/Berlin' } })] });
assert(V.transportTimeline(t4).checks.some(c => c.level === 'warn' && /Umstieg nur 30 Min\./.test(c.text)), 'T4');
/* Flughafenpuffer und Anschluss vor Ankunft */
const tb = V.validateTransport({ out: [
  seg({ id: 'szub', mode: 'bahn', dep: { date: '2027-05-01', time: '06:00', tz: 'Europe/Berlin' }, arr: { date: '2027-05-01', time: '07:30', tz: 'Europe/Berlin' } }),
  seg({ id: 'sflx', mode: 'flug', dep: { date: '2027-05-01', time: '08:30', tz: 'Europe/Berlin' }, arr: { date: '2027-05-01', time: '07:00', tz: 'Europe/London' } })] });
const tlb = V.transportTimeline(tb).checks;
assert(tlb.some(c => /nur 60 Min\. am Flughafen/.test(c.text) && /Richtwert/.test(c.text)));
/* fehlende Zeiten: ungeprüft statt „passt“ */
assert(V.transportTimeline(t2).checks.some(c => /ungeprüft/.test(c.text)));
/* T5: leer → keine Kosten aus Abschnitten (Rückfall auf v2 macht die App) */
assert.equal(V.transportCost(V.validateTransport({ out: [], back: [] }), {}).lines.length, 0);
/* T7: Auto ohne eigenes km → Preis offen, kein t.km */
const t7 = V.validateTransport({ out: [seg({ id: 'sauto7', mode: 'auto' }), seg({ id: 'sflug7', mode: 'flug', cost: 99 })] });
const c7 = V.transportCost(t7, { persons: 1, verb: 7, preis: 2, km: 400 });
assert.equal(c7.total, 99); assert.equal(c7.open.length, 1, 'T7: Zubringer offen, nicht 400 km gerechnet');
/* Validierung Transport */
assert.throws(() => V.validateTransport({ out: [seg({ id: 'sbad', mode: 'rakete' })] }), /Verkehrsmittel/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'sdup' }), seg({ id: 'sdup' })] }), /doppelte/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'scode', mode: 'bahn', fromCode: 'STR' })] }), /Flughafencode/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'skmx', mode: 'flug', km: 10 })] }), /Kilometer/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'stzx', dep: { date: '2027-05-01', time: '25:00', tz: null } })] }), /Uhrzeit/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'stz2', dep: { date: '2027-05-01', time: '10:00', tz: 'Mars/Base' } })] }), /Zeitzone/);
assert.throws(() => V.validateTransport({ out: Array.from({ length: 13 }, (_, i) => seg({ id: 'sm' + String(i).padStart(3, '0') })) }), /12 Abschnitte/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'sxxx', foo: 1 })] }), /unbekanntes Feld/);
/* Kalender: UTC mit Zeitzone, ganztägig ohne Zeit */
const ics = V.transportIcs(t3, { tripId: 'tabc', now: new Date('2027-01-01T00:00:00Z') })[0].join('\n');
assert(/DTSTART:20270501T203000Z/.test(ics) && /DTEND:20270501T221500Z/.test(ics), 'Berlin 22:30 = 20:30Z, Athen 01:15 = 22:15Z');
assert(/DTSTART;VALUE=DATE:20270501/.test(V.transportIcs(t2)[0].join('\n')));
/* ---------- Review-Runde 2 ---------- */
/* R2-1: Zeitumstellung, fehlende Angaben, kein geratenes Datum */
assert.throws(() => V.validateTransport({ out: [seg({ id: 'sgap', dep: { date: '2026-03-29', time: '02:30', tz: 'Europe/Berlin' } })] }), /Zeitumstellung nicht/, 'Berlin 29.03.2026 02:30 existiert nicht');
assert.equal(V.resolveLocal('2026-10-25', '02:30', 'Europe/Berlin').status, 'ambiguous', 'Berlin 25.10.2026 02:30 doppelt');
assert.equal(V.resolveLocal('2026-10-25', '03:30', 'Europe/Berlin').status, 'ok');
assert.equal(V.resolveLocal('2026-05-01', '10:00', null).status, 'incomplete', 'Uhrzeit ohne Zeitzone ist kein Zeitpunkt');
const amb = V.validateTransport({ out: [
  seg({ id: 'samb', mode: 'bahn', dep: { date: '2026-10-25', time: '01:00', tz: 'Europe/Berlin' }, arr: { date: '2026-10-25', time: '02:30', tz: 'Europe/Berlin' } }),
  seg({ id: 'snxt', mode: 'bahn', dep: { date: '2026-10-25', time: '02:35', tz: 'Europe/Berlin' }, arr: { date: '2026-10-25', time: '04:00', tz: 'Europe/Berlin' } })] });
const ambC = V.transportTimeline(amb).checks;
assert(ambC.some(c => /doppelt vorhanden/.test(c.text)) && ambC.some(c => /Anschluss ungeprüft/.test(c.text)), 'mehrdeutig → ungeprüft, kein „Umstieg passt“');
assert(!ambC.some(c => /Umstieg nur/.test(c.text)));
const noTz = V.validateTransport({ out: [seg({ id: 'snotz', mode: 'flug', dep: { date: '2027-05-01', time: '22:30', tz: null }, arr: { date: null, time: '01:15', tz: null } })] });
const ntl = V.transportTimeline(noTz, { start: '2027-05-01' });
assert(!ntl.checks.some(c => /Folgetag|nach dem Reisebeginn/.test(c.text)), 'kein geratenes Datum + 1 aus 22:30 → 01:15');
assert.equal(ntl.arrival, null);
assert(/DTSTART;VALUE=DATE:20270501/.test(V.transportIcs(noTz)[0].join('\n')), 'Uhrzeit ohne Zeitzone: ganztägig statt falscher UTC-Zeit');
const noDate = V.validateTransport({ out: [seg({ id: 'snodt', mode: 'flug', dep: { date: null, time: null, tz: null } })] });
assert.equal(V.transportIcs(noDate).length, 0, 'ohne Datum kein erfundener Termin');
assert(/DTSTART;VALUE=DATE:20261025/.test(V.transportIcs(amb)[0].join('\n')) === false && /DTSTART:2026102/.test(V.transportIcs(amb)[0].join('\n')), 'Abfahrt 01:00 eindeutig → UTC');
{ const ev = V.transportIcs({ out: [amb.out[1]], back: [] })[0].join('\n'); assert(/DTSTART;VALUE=DATE:20261025/.test(ev) && !/DTSTART:2026/.test(ev), 'Abfahrt 02:35 am 25.10.: doppelt → ganztägig, kein UTC-Termin'); }
/* R2-2: unbekannte Gebühr ist nie abgeschlossen; Erstattung ohne Storno senkt keine Kosten */
assert.equal(V.cancelSettled(V.cancelMath({ paid: 200, cancel: C(null) }, 200)), false);
assert.equal(V.cancelSettled(V.cancelMath({ paid: 200, refunds: [R(150)], cancel: C(50) }, 200)), true, 'S3 abgeschlossen');
assert.equal(V.cancelSettled(V.cancelMath({ paid: 200, cancel: C(50) }, 200)), false, 'S2: Erstattung offen');
assert.equal(V.cancelSettled(V.cancelMath({ paid: 0 }, 0)), false, 'nicht storniert bindet weiter nach bestehenden Regeln');
assert.equal(V.cancelMath({ paid: 200, refunds: [R(50)] }, 200).cost, 200, 'Erstattung ohne Storno senkt keine Kosten');
assert(V.cancelWarnings({ paid: 0, cancel: C(300) }, 200).some(w => /über dem bisherigen Betrag/.test(w)), 'Gebühr über Betrag: Warnung, keine Ablehnung');
V.validateMoneyMoves({ paid: 0, cancel: C(300) }, 'X');
/* Review API-Repro 1: ohne bekannten Planbetrag keine Überzahlung/Forderung */
for (const pc of [null, undefined, NaN, -5, Infinity]) { const m = V.cancelMath({ paid: 50 }, pc); assert(m.unknown && m.cost === null && m.open === null && m.refundOpen === null, 'planCost ' + pc); }
assert.deepEqual([V.cancelMath({ paid: 50 }, 0).cost, V.cancelMath({ paid: 50 }, 0).refundOpen], [0, 50], 'planCost 0 ist bekannt: Überzahlung 50');
assert.deepEqual([V.cancelMath({ paid: 50 }, 50).open, V.cancelMath({ paid: 50 }, 50).refundOpen], [0, 0]);
{ const st2 = V.stayAggregate([{ id: 'oakt', price: null }], 'oakt', o => o.price); assert.deepEqual(st2.unknown, ['oakt'], 'unbekannter Unterkunftspreis nicht 0'); assert.equal(st2.cost, 0); }
/* Review API-Repro 2: Storno ist selbst Verpflichtung bis abgeschlossen; gleiche Definition wie der App-Schutz */
assert.equal(V.segmentRemovalCheck({ 'tr:segx1': { status: 'offen', paid: 0, cancel: { on: '2026-10-15', fee: null } } }, 'segx1').ok, false);
assert.equal(V.segmentRemovalCheck({ 'tr:segx1': { status: 'offen', paid: 0, cancel: { on: '2026-10-15', fee: 100 } } }, 'segx1').ok, false, 'Gebühr 100 unbezahlt');
assert.equal(V.segmentRemovalCheck({ 'tr:segx1': { status: 'offen', paid: 100, cancel: { on: '2026-10-15', fee: 100 } } }, 'segx1').ok, true, 'Gebühr bezahlt, nichts offen');
assert.equal(V.segmentRemovalCheck({ 'tr:segx1': { status: 'angefragt', paid: 0 } }, 'segx1').ok, false, 'angefragt bindet');
assert.equal(V.segmentRemovalCheck({ 'tr:segx1': { status: 'offen', paid: 0, due: '2027-01-01' } }, 'segx1').ok, false, 'Fälligkeit bindet');
assert.equal(V.segmentRemovalCheck({ 'tr:segx1': { status: 'offen', paid: 0 } }, 'segx1').ok, true, 'ungebunden');

/* R2-4: Löschen behält Historie, gebunden und nicht abgeschlossen → blockiert */
const lg = { 'tr:sflug': { status: 'gebucht', amount: 240, paid: 240, due: '' }, 'tr:sflug:abag': { status: 'offen', amount: null, paid: 0, due: '' } };
let rc = V.segmentRemovalCheck(lg, 'sflug');
assert.equal(rc.ok, false); assert.deepEqual(rc.blocking, ['tr:sflug']); assert.deepEqual(rc.keep.sort(), ['tr:sflug', 'tr:sflug:abag']);
lg['tr:sflug'].cancel = C(40); lg['tr:sflug'].refunds = [R(200)];
assert.equal(V.segmentRemovalCheck(lg, 'sflug').ok, true, 'abgeschlossen storniert: entfernbar, Historie bleibt');
lg['tr:sflug'].cancel = C(null);
assert.equal(V.segmentRemovalCheck(lg, 'sflug').ok, false, 'Gebühr unbekannt: weiter gebunden');
/* R2-3: needsV3, Serialisierung, Referenzen */
const base2 = { id: 'tx', schemaVersion: 2, ledger: { 'xc:a': { status: 'offen', amount: null, paid: 5, due: '' } }, offers: [{ id: 'o1' }] };
assert.equal(V.needsV3(base2), false);
assert.equal(V.needsV3(Object.assign({}, base2, { transport: { out: [], back: [] }, party: [], journal: {} })), false, 'leere v3-Felder zählen nicht');
const stripped = V.serializeTrip(Object.assign({}, base2, { transport: { out: [], back: [] }, party: [], expenses: [] }));
assert(!('transport' in stripped) && !('party' in stripped) && !('expenses' in stripped), 'v2 schreibt keine leeren v3-Felder');
assert.equal(V.needsV3(Object.assign({}, base2, { offers: [{ id: 'o1', cancel: C(null) }] })), true);
assert.throws(() => V.serializeTrip(Object.assign({}, base2, { transport: { out: [seg({ id: 'svvv' })], back: [] } })), /Formats 3/);
const v3 = Object.assign({}, base2, { schemaVersion: 3, transport: { out: [], back: [] }, zukunft: 1 });
assert.deepEqual(V.serializeTrip(v3), JSON.parse(JSON.stringify(v3)), 'Format 3 läuft unverändert rund');
const refT = { transport: t1, ledger: { 'tr:sflug': { status: 'offen', paid: 0 }, 'tr:sflug:abag': { status: 'offen', paid: 0 } } };
V.validateReferences(refT);
assert.throws(() => V.validateReferences({ transport: t1, ledger: { 'tr:sweg': { status: 'offen', paid: 0 } } }), /verweist auf keinen/);
V.validateReferences({ transport: t1, ledger: { 'tr:sweg': { status: 'offen', paid: 10 } } });
assert.throws(() => V.validateReferences({ ledger: { 'tr:X!': { status: 'offen', paid: 1 } } }), /ungültiger/);
/* R2-4 Grenzen und Zahlen */
assert.throws(() => V.validateTransport({ out: [seg({ id: 'sadd', addons: Array.from({ length: 21 }, (_, i) => ({ id: 'ad' + String(i).padStart(3, '0'), label: 'x', cost: 1 })) })] }), /20 Zusatzposten/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'snan', mode: 'auto', km: NaN })] }), /Kilometer/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'sinf', cost: Infinity })] }), /Betrag/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'sdtx', dep: { date: '2027-02-30', time: null, tz: null } })] }), /Datum/);
assert.throws(() => V.validateTransport({ out: [seg({ id: 'sdupa', addons: [{ id: 'sdupa', label: 'x', cost: 1 }] })] }), /doppelte/, 'IDs über Abschnitte und Zusatzposten eindeutig');
assert.throws(() => V.validateTransport({ out: [seg({ id: 'sboth' })], back: [seg({ id: 'sboth' })] }), /doppelte/, 'IDs über Hin- und Rückweg eindeutig');

console.log('Datenvertrag-v3-Logik: Storno S1–S10 (Erstattungen getrennt, keine Verrechnung, Cent), Unterkunft U1–U3, Anreise T1–T7 (Kosten nur aus eigener Grundlage, Zeitzonen, Mitternacht, Umstiege, Flughafenpuffer als Richtwert, ungeprüft ohne Zeiten), Validierung und Kalender sowie Review-Runde 2 (Zeitumstellung, unvollständige Zeiten, kein geratenes Datum, unbekannte Gebühr nie abgeschlossen, Gebühr über Betrag als Warnung, Löschschutz mit Historie, needsV3/Serialisierung, Referenzen, Grenzen) geprüft.');
