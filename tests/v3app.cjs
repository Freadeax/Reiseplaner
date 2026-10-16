/* Lese-Release Format 3 in der App (Claude, #8): lesen, prüfen, rechnen, unverändert rundlaufen, schreibgeschützt.
   Node-Test mit index.html + v3logic.js, kein Browser-/DB-Test. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const store = new Map(), alerts = [];
const context = {
  window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js') },
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  setTimeout: () => 0, clearTimeout() {}, console, alert: m => alerts.push(m)
};
vm.createContext(context);
vm.runInContext(code, context);
const a = context.window.__app;
const J = x => JSON.parse(JSON.stringify(x));

/* v3-Reise: Auto zum Flughafen (eigene km), Flug p. P. mit Gepäck, Rückflug ohne Preis; stornierte Unternehmung */
const t = a.silvesterTemplate();
t.schemaVersion = 3;
t.transport = { out: [
  { id: 'szubr', mode: 'auto', from: 'Hattenhofen', to: 'STR', km: 45, dep: { date: '2026-12-30', time: '05:30', tz: 'Europe/Berlin' }, arr: { date: '2026-12-30', time: '06:15', tz: 'Europe/Berlin' } },
  { id: 'sflug', mode: 'flug', fromCode: 'STR', toCode: 'MUC', cost: 89, per: 'pp', dep: { date: '2026-12-30', time: '08:30', tz: 'Europe/Berlin' }, arr: { date: '2026-12-30', time: '09:30', tz: 'Europe/Berlin' }, addons: [{ id: 'abag', label: 'Aufgabegepäck', cost: 30, per: 'pp' }] }
], back: [{ id: 'srueck', mode: 'flug', fromCode: 'MUC', toCode: 'STR', dep: { date: '2027-01-03', time: null, tz: null } }] };
const actKey = Object.keys(a.cost(t).lines.reduce((m, l) => (l.key && l.key.startsWith('act:') ? (m[l.key] = 1) : 0, m), {}))[0];
t.ledger = { 'tr:sflug': { status: 'gebucht', amount: null, paid: 178, due: '' }, [actKey]: { status: 'gebucht', amount: null, paid: 60, due: '', refunds: [{ id: 'rfone', on: '2026-12-01', amount: 40 }], cancel: { on: '2026-11-30', fee: 20 } } };
a.validateExtras(t);
const before = J(t);

/* Rechnung: Anreise nur aus Abschnitten, Storno mit Gebühr, offene Preise sichtbar */
const c = a.cost(t);
const anreise = c.lines.filter(l => l.cat === 'anreise');
assert(anreise.some(l => l.key === 'tr:sflug' && l.c === 178), 'Flug 89 × 2');
assert(anreise.some(l => l.key === 'tr:sflug:abag' && l.c === 60), 'Gepäck als eigener Posten');
assert(anreise.some(l => l.key === 'tr:szubr' && Math.abs(l.c - 45 * 7.5 / 100 * 2.15) < 0.01), 'Zubringer aus eigenen 45 km, nicht aus der Zielstrecke');
assert(anreise.some(l => l.key === 'tr:srueck' && l.open && l.c === 0), 'Rückflug ohne Preis: offen, nicht als Summe behauptet');
assert(!anreise.some(l => /^Sprit · ≈/.test(l.t)), 'keine v2-Spritrechnung zusätzlich');
const canc = c.lines.find(l => l.key === actKey);
assert(canc.cancelled && canc.c === 20, 'stornierte Unternehmung zählt mit Gebühr');
const oc = a.openCosts(t).join(' | ');
assert(/Rück: Flug.*Preis offen/.test(oc), 'offener Rückflugpreis in openCosts'); assert(!/Fahrstrecke fehlt|Ticketpreis fehlt/.test(oc));
/* Zahlungen: netto für „offen“, Erstattungen getrennt */
const f = a.financeSummary(t);
const row = f.rows.find(r => r.key === actKey);
assert.deepEqual([row.netPaid, row.cost, row.open, row.refundOpen], [20, 20, 0, 0], '60 bezahlt − 40 erstattet = 20 = Gebühr');
assert.equal(f.v3.refundsReceived, 40); assert.equal(f.v3.unknownFee, 0);
t.ledger[actKey].cancel.fee = null;
const f2 = a.financeSummary(t);
assert.equal(f2.v3.unknownFee, 1); assert(/Stornogebühr unbekannt/.test(a.openCosts(t).join(' ')), 'unbekannte Gebühr sichtbar, nicht 0');
assert.equal(f2.rows.find(r => r.key === actKey).open, 0); t.ledger[actKey].cancel.fee = 20;

/* Rundlauf: Sync, Sicherung, Import, Neuladen – alle v3-Felder unverändert */
assert.deepEqual(a.toServer(t), J(t), 'toServer unverändert, Version bleibt 3');
const raw = J(a.backupData([t]));
assert.deepEqual(a.validateBackup(raw)[0], J(t), 'Sicherung unverändert');
assert.equal(a.serverRowProblem({ id: t.id, version: 1, data: J(t) }), null, 'Serverzeile v3 lesbar');
a.Store.setScope('guest');
const ids = a.importTrips(raw, 'skip');
assert.deepEqual(ids, [t.id]);
a.Store.setScope('guest');
assert.deepEqual(J(a.Store.get(t.id)).transport, before.transport, 'nach Neuladen erhalten');

/* Schreibsperre: Änderungen an Format-3-Reisen werden abgelehnt und im Speicher zurückgenommen */
assert.equal(a.V3_EDIT, false);
const loaded = a.Store.get(t.id); loaded.title = 'geändert'; loaded.transport.out = [];
assert.equal(a.Store.put(loaded), false);
assert.equal(a.Store.get(t.id).title, before.title); assert.equal(a.Store.get(t.id).transport.out.length, 2, 'nichts verloren');
assert(a.v3Banner(a.Store.get(t.id)).includes('Nur ansehen'));
assert.equal(a.v3Banner(a.silvesterTemplate()), '', 'Format 2 ohne Hinweis');

/* Verpflichtungsschutz für Format 3 (vorbereitet für die Freischaltung) */
{
  const b = J(t), ci = a.commitmentIssues;
  const noSeg = J(b); noSeg.transport.out = noSeg.transport.out.filter(x => x.id !== 'sflug');
  assert(ci(b, noSeg).some(x => /Anreise-Abschnitt/.test(x)), 'gebuchter Flug darf nicht still entfernt werden');
  const chg = J(b); chg.transport.out[1].cost = 50;
  assert(ci(b, chg).some(x => /Anreise-Abschnitt/.test(x)), 'gebuchter Flug darf nicht still geändert werden');
  const noRef = J(b); noRef.ledger[actKey].refunds = [];
  assert(ci(b, noRef).some(x => /Zahlungsangaben/.test(x)), 'Erstattungen bleiben unveränderlich');
  const actId = actKey.slice(4), moved = J(b); moved.items.forEach(it => { if (it.act === actId) it.slot = it.slot === 'abend' ? 'morgen' : 'abend'; });
  assert(!ci(b, moved).some(x => /Termin/.test(x)), 'abgeschlossen storniert (60 − 40 = 20 = Gebühr): Termin frei');
  const open = J(b); open.ledger[actKey].cancel.fee = null; const moved2 = J(open); moved2.items.forEach(it => { if (it.act === actId) it.slot = it.slot === 'abend' ? 'morgen' : 'abend'; });
  assert(ci(open, moved2).some(x => /Termin/.test(x)), 'Gebühr unbekannt: Termin bleibt gebunden');
}

/* Formular-Mutatoren (Kandidaten, Quelle unverändert) */
{
  const src = J(t), L = key => ({ kind: 'ledger', key });
  const fe = a.financeEntry(src, L(actKey));
  assert.deepEqual([fe.math.netPaid, fe.math.cost, fe.math.cancelled], [20, 20, true]);
  /* gebundener Flug: Entfernen vor Storno blockiert, Ändern und Umsortieren ebenso */
  const noFlight = J(src.transport); noFlight.out = noFlight.out.filter(x => x.id !== 'sflug');
  assert.throws(() => a.setTransport(src, noFlight), /Gebuchte Anreise-Abschnitte/);
  const swapped = J(src.transport); swapped.out.reverse();
  a.setTransport(src, swapped); /* nur ein gebundener Abschnitt: dessen Inhalt bleibt gleich, Reihenfolgehinweis kommt aus dem Plan-Check */
  const two = J(src); two.ledger['tr:szubr'] = { status: 'gebucht', amount: null, paid: 0, due: '' };
  assert.throws(() => a.setTransport(two, swapped), /Gebuchte Anreise-Abschnitte/, 'zwei gebundene Abschnitte umsortiert');
  const cheaper = J(src.transport); cheaper.out[1].cost = 10;
  assert.throws(() => a.setTransport(src, cheaper), /Anreise-Abschnitt/);
  /* Ungebundenen Rückflug ändern geht */
  const back = J(src.transport); back.back[0].cost = 99;
  const cb = a.setTransport(src, back);
  assert.equal(cb.transport.back[0].cost, 99); assert.equal(cb.schemaVersion, 3); assert.deepEqual(J(src), J(t), 'Quelle unverändert');
  /* Storno des Flugs mit Gebühr, Erstattung, dann ist Entfernen erlaubt und die Historie bleibt */
  const c1 = a.cancelEntry(src, L('tr:sflug'), { on: '2026-11-20', fee: '50' });
  assert.deepEqual(c1.ledger['tr:sflug'].cancel, { on: '2026-11-20', fee: 50 });
  assert.equal(a.cost(c1).lines.find(l => l.key === 'tr:sflug').c, 50, 'Flug zählt mit Gebühr');
  assert.throws(() => a.setTransport(c1, noFlight), /Gebuchte Anreise-Abschnitte/, 'Erstattung noch offen: weiter gebunden');
  assert.throws(() => a.addRefund(c1, L('tr:sflug'), { id: 'rfbig', on: '2026-11-25', amount: '500' }), /übersteigen/);
  const c2 = a.addRefund(c1, L('tr:sflug'), { id: 'rftwo', on: '2026-11-25', amount: '128' });
  assert.deepEqual([a.financeEntry(c2, L('tr:sflug')).math.feeOpen, a.financeEntry(c2, L('tr:sflug')).math.refundOpen], [0, 0]);
  const c3 = a.setTransport(c2, noFlight);
  assert(c3.ledger['tr:sflug'] && c3.ledger['tr:sflug'].refunds.length === 1, 'Geldhistorie bleibt am ursprünglichen Posten');
  assert(!c3.transport.out.some(x => x.id === 'sflug'));
  /* Storno zurücknehmen: Erstattung bleibt (S10) */
  const c4 = a.uncancel(c2, L('tr:sflug'));
  assert(!c4.ledger['tr:sflug'].cancel && c4.ledger['tr:sflug'].refunds.length === 1);
  assert.equal(a.financeEntry(c4, L('tr:sflug')).math.open, 128, '178 Plan − (178 − 128 erstattet) netto = 128 offen');
  assert.throws(() => a.uncancel(src, L('tr:sflug')), /nicht storniert/);
  /* Eingaben und Ziele */
  assert.throws(() => a.cancelEntry(src, L('tr:sflug'), { on: '2026-11-20', fee: 'abc' }), /ungültig/);
  assert.throws(() => a.cancelEntry(src, L('tr:sflug'), { on: 'gestern', fee: 1 }), /Stornodatum/);
  assert.throws(() => a.cancelEntry(src, { kind: 'stay' }, { on: '2026-11-20', fee: 1 }), /Unbekannter Posten/);
  assert.throws(() => a.cancelEntry(src, L('xc:gibtsnicht'), { on: '2026-11-20', fee: 1 }), /nicht gefunden/);
  assert.equal(a.cancelEntry(src, L(actKey), { on: '2026-11-21', fee: null }).ledger[actKey].cancel.fee, null, 'Gebühr unbekannt');
  /* Format 2 wird beim ersten Storno zu Format 3, nie zurück */
  const v2t = a.silvesterTemplate(); v2t.schemaVersion = 2;
  const k2 = Object.keys(a.cost(v2t).lines.reduce((m, l) => (l.key && l.key.startsWith('act:') ? (m[l.key] = 1) : 0, m), {}))[0];
  const up = a.cancelEntry(v2t, L(k2), { on: '2026-11-21', fee: 0 });
  assert.equal(up.schemaVersion, 3); assert.equal(v2t.schemaVersion, 2, 'Quelle bleibt Format 2');
}

/* Plan-Check, Ankunft, Kalender, Fahrplan aus Abschnitten */
{
  const x = J(t);
  x.transport.out[1].checkin = { opens: { date: '2026-12-29', time: '08:30', tz: 'Europe/Berlin' }, note: 'Lufthansa-App' };
  x.transport.out.push({ id: 'stransf', mode: 'transfer', from: 'MUC', to: 'Oberjoch', cost: 120, dep: { date: '2026-12-30', time: '10:00', tz: 'Europe/Berlin' }, arr: { date: '2026-12-30', time: '13:00', tz: 'Europe/Berlin' } });
  a.validateExtras(x);
  assert.equal(a.arrivalMin(x), 13 * 60, 'Ankunft aus letztem Hinweg-Abschnitt');
  const y = J(x); y.transport.out[2].arr.tz = null; assert.equal(a.arrivalMin(y), 13 * 60, 'Uhrzeit laut Eingabe am Anreisetag');
  assert(!a.checks(x).some(c => c[0] === 'warn' && /Anreise:/.test(c[1])), 'stimmige Kette ohne Anreise-Warnung');
  const late = J(x); late.transport.out[1].dep.time = '07:00';
  assert(a.checks(late).some(c => c[0] === 'warn' && /Anreise: .*Min\. am Flughafen/.test(c[1])), 'Flughafenpuffer als Plan-Check-Warnung');
  const ics = a.icsData(x, new Date('2026-11-01T00:00:00Z'));
  assert(/SUMMARY:Flug: STR → MUC/.test(ics.text) && /DTSTART:20261230T073000Z/.test(ics.text), 'Flug im Kalender in UTC');
  assert(/UID:.*-srueck@reiseplaner/.test(ics.text) && /DTSTART;VALUE=DATE:20270103/.test(ics.text), 'Rückflug ohne Zeit ganztägig');
  const dp = a.departurePlan(x, new Date('2026-11-01T10:00:00Z'));
  assert(dp.items.some(i => i.kind === 'checkin' && i.date === '2026-12-29' && /ab 08:30/.test(i.label)), 'Online-Check-in im Fahrplan');
}

/* Finanzreview Claude 16.10.: Zusatzposten entfernen, Check-in nach Buchung, Mietwagen-Sprit, stornierte Unterkunft */
{
  const x = J(t);
  x.transport.out[1].addons.push({ id: 'bseat', label: 'Sitzplatz', cost: 10, per: 'pp' });
  x.ledger['tr:sflug:abag'] = { status: 'gebucht', amount: null, paid: 60, due: '' };
  x.ledger['tr:sflug:bseat'] = { status: 'offen', amount: 25, paid: 0, due: '' };
  a.validateExtras(x);
  const noSeat = J(x.transport); noSeat.out[1].addons = noSeat.out[1].addons.filter(q => q.id !== 'bseat');
  const r1 = a.setTransport(x, noSeat);
  assert(!r1.ledger['tr:sflug:bseat'] && r1.ledger['tr:sflug:abag'], 'ungebundener Zusatzposten samt Planwert entfernbar, gebundener bleibt');
  const noBag = J(x.transport); noBag.out[1].addons = noBag.out[1].addons.filter(q => q.id !== 'abag');
  assert.throws(() => a.setTransport(x, noBag), /Gebuchter Anreise-Abschnitt/, 'gebuchter Zusatzposten bleibt geschützt');
  const ci = J(x.transport); ci.out[1].checkin = { opens: { date: '2026-12-29', time: '08:30', tz: 'Europe/Berlin' }, note: 'App' };
  assert.deepEqual(a.setTransport(x, ci).transport.out[1].checkin.note, 'App', 'Check-in darf beim gebuchten Flug nachgetragen werden');
  const tm = J(x.transport); tm.out[1].dep.time = '09:00';
  assert.throws(() => a.setTransport(x, tm), /Gebuchter Anreise-Abschnitt/, 'Abflugzeit des gebuchten Flugs bleibt geschützt');
  const nr = J(x.transport); nr.out[1].number = 'LH 1';
  assert.throws(() => a.setTransport(x, nr), /Gebuchter Anreise-Abschnitt/, 'Flugnummer des gebuchten Flugs bleibt geschützt');

  const m = J(t); m.transport.back = [{ id: 'smiet', mode: 'mietwagen', cost: 200, km: 300 }]; a.validateExtras(m);
  const ml = a.cost(m).lines.filter(l => l.cat === 'anreise' && /Mietwagen/.test(l.t));
  assert(ml.some(l => l.key === 'tr:smiet' && l.c === 200) && ml.some(l => !l.key && Math.abs(l.c - 300 * 7.5 / 100 * 2.15) < 0.01), 'Mietwagen: Miete und Sprit getrennt, Sprit nicht buchbar');
  m.transport.back[0].km = null;
  assert(a.openCosts(m).some(x => /Mietwagen · Sprit \(eigene km fehlen\)/.test(x)), 'Mietwagen ohne km: Sprit offen statt 0 €');
  assert(a.openCosts(m).some(x => /Parken/.test(x)), 'Parken auch bei Auto-/Mietwagen-Abschnitten prüfen');

  const s = J(t);
  const o = { id: 'ofst', stayId: s.stayId, name: 'Testhaus', location: 'Testort', provider: 'direkt', type: 'hotel', start: s.start, end: s.end, persons: s.persons, price: 400, basis: 'stay', url: 'https://example.org/v3app-fixture', checkedAt: '2026-10-15', validUntil: '2027-01-04', availability: 'available', terms: 'Nur Testdaten', paid: 100, deposit: 0, booked: true,
    features: Object.fromEntries(['sauna', 'kitchen', 'breakfast', 'cancel', 'quiet', 'accessible', 'parking'].map(k => [k, 'unknown'])), fees: Object.fromEntries(['tax', 'cleaning', 'parking', 'wellness', 'mandatory'].map(k => [k, { state: 'included', amount: 0 }])) };
  s.offers = [o]; s.activeOfferId = 'ofst'; a.validateOffer(o); a.validateExtras(s);
  assert(!a.openCosts(s).some(x => /Unterkunft storniert/.test(x)), 'aktive Buchung ohne Storno: kein Hinweis');
  o.cancel = { on: '2026-11-01', fee: 0 }; o.refunds = [{ id: 'rfst', on: '2026-11-02', amount: 100 }]; a.validateExtras(s);
  const stayLine = a.cost(s).lines.find(l => l.key === 'stay');
  assert(stayLine.c === 0 && /storniert/.test(stayLine.t), 'stornierte Unterkunft zählt nur mit ihrer Gebühr');
  assert(a.openCosts(s).some(x => /Unterkunft storniert: neue Unterkunft fehlt, Kosten offen/.test(x)), 'stornierte aktive Unterkunft ist offene Pflicht, nicht 0 €');
}

/* Abgrenzung */
const v2 = a.silvesterTemplate(); v2.schemaVersion = 2;
assert.throws(() => a.validateExtras(Object.assign(J(v2), { transport: t.transport })), /Format 3|Formats 3/, 'v3-Felder in v2 abgelehnt');
assert.throws(() => a.validateExtras(Object.assign(J(v2), { ledger: { 'tr:sflug': { status: 'offen', amount: null, paid: 0, due: '' } } })), /erst ab Format 3/);
assert.throws(() => a.validateExtras(Object.assign(J(t), { party: [{ id: 'pa1', name: 'A' }] })), /kennt diese App-Version noch nicht/, '§3 noch nicht unterstützt → nicht lesbar');
assert.throws(() => a.validateExtras(Object.assign(J(t), { ledger: { 'tr:sweg': { status: 'offen', amount: null, paid: 0, due: '' } } })), /verweist auf keinen/);
assert.throws(() => a.validateExtras(Object.assign(J(t), { schemaVersion: 4 })), /Unbekannte Reiseversion/);
assert.notEqual(a.serverRowProblem({ id: t.id, version: 1, data: Object.assign(J(t), { party: [{ id: 'pa1', name: 'A' }] }) }), null, 'nicht unterstützte v3-Angaben → geschützt als nicht lesbar');
console.log('Format 3 (Lese-Release): Prüfung, Anreise aus Abschnitten (eigene km, p. P., Gepäck, offener Preis), Storno mit Gebühr, Nettozahlung und getrennte Erstattungen, unbekannte Gebühr sichtbar, unveränderter Rundlauf (Sync, Sicherung, Import, Neuladen), Schreibsperre, Verpflichtungsschutz, Formular-Mutatoren (Storno, Erstattung, Rücknahme, Abschnitte; Quelle unverändert, gebundene Abschnitte geschützt, Historie bleibt) und Abgrenzung zu Format 2/4 geprüft.');
