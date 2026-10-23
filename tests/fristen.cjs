/* Fristen M02.1 (Claude, 23.10.2026): deadlines(t,now) rein und deterministisch, stabile IDs, Text statt Farbe,
   Zeitzonen, „erledigt“, Fahrplan und Kalender aus derselben Liste. Node-Test, kein Browser-/iPhone-Test. */
/* Gerätezeitzone fest: „heute“ ist der Kalendertag auf dem Gerät (wie todayUTC). Fristen mit Zone sind davon unabhängig. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let code = require('./app-code.cjs')(html);
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const context = {
  window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js') },
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  setTimeout: () => 0, clearTimeout() {}, console,
};
vm.createContext(context);
vm.runInContext(code, context);
const a = context.window.__app;
const J = x => JSON.parse(JSON.stringify(x));
const now = new Date('2026-11-20T10:00:00Z');

function winterTrip() {
  const t = a.newTrip({ title: 'Allgäu', type: 'winter', travel: 'auto', origin: 'Göppingen', departTime: '08:30', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', nights: 4 });
  t.extraCosts = [a.costEntryFromForm({ title: 'Skikurs', amount: '200' }, 'kurs'), a.costEntryFromForm({ title: 'Alt', amount: '50' }, 'alt'), a.costEntryFromForm({ title: 'Heute', amount: '30' }, 'heute')];
  a.setLedger(t, 'xc:kurs', 'due', '2026-12-01'); a.setLedger(t, 'xc:kurs', 'paid', '50');
  a.setLedger(t, 'xc:alt', 'due', '2026-11-10');
  a.setLedger(t, 'xc:heute', 'due', '2026-11-20');
  return t;
}

/* Rein, deterministisch, Reihenfolge, IDs, Texte */
{
  const t = winterTrip(), before = JSON.stringify(t);
  const d = a.deadlines(t, now);
  assert.equal(JSON.stringify(t), before, 'keine Mutation');
  assert.deepEqual(J(a.deadlines(t, now)), J(d), 'gleiches now, gleiche Liste');
  const dated = d.filter(x => x.at);
  assert.deepEqual(dated.map(x => x.id), ['pay:xc:alt', 'pay:xc:heute', 'pay:xc:kurs', 'winter', 'pack', 'depart'], 'chronologisch, Abfahrt am Ende');
  assert.deepEqual(dated.map(x => x.state), ['overdue', 'due', 'due', 'due', 'due', 'due']);
  assert(d.slice(dated.length).every(x => !x.at && x.state === 'unknown' && x.kind === 'buchen' && /^book:/.test(x.id)), 'ohne Datum am Ende, nie mit erfundenem Datum');
  const by = id => d.find(x => x.id === id);
  assert.equal(by('pay:xc:alt').when, 'überfällig seit 10.11.2026', 'überfällig als Text');
  assert.equal(by('pay:xc:heute').when, 'heute');
  assert.equal(by('pay:xc:kurs').when, 'in 11 Tagen · 01.12.2026');
  assert.equal(by('pay:xc:kurs').amount, 150, 'offener Rest, nicht Gesamtbetrag');
  assert.equal(by('depart').at.time, '08:30');
  assert.equal(by('depart').when, 'in 40 Tagen · 30.12.2026 08:30');
  const tomorrow = a.deadlines(t, new Date('2026-11-30T10:00:00Z')).find(x => x.id === 'pay:xc:kurs');
  assert.equal(tomorrow.when, 'morgen');
  /* Packtag und Winter-Hinweis verschwinden nach ihrem Tag, Zahlungen bleiben überfällig sichtbar */
  const late = a.deadlines(t, new Date('2026-12-29T20:00:00Z'));
  assert(!late.some(x => x.id === 'winter') && late.some(x => x.id === 'pack') && late.find(x => x.id === 'pay:xc:kurs').state === 'overdue');
  /* bezahlt → keine Frist; IDs bleiben bei Änderungen anderer Posten stabil */
  const u = J(t); a.setLedger(u, 'xc:kurs', 'paid', '200'); a.setLedger(u, 'xc:alt', 'amount', '70');
  const d2 = a.deadlines(u, now);
  assert(!d2.some(x => x.id === 'pay:xc:kurs')); assert.equal(d2.find(x => x.id === 'pay:xc:alt').amount, 70);
}
console.log('Fristen: rein, deterministisch, Reihenfolge, stabile IDs, Restbetrag, Text überfällig/heute/morgen/in N Tagen geprüft.');

/* Erledigt markieren (F12): Frist bleibt in deadlines als done, fehlt im Fahrplan und Kalender, Buchung unverändert */
{
  const t = winterTrip(); t.deadlineAck = { 'pay:xc:alt': { at: '2026-11-15', note: 'mit Anbieter geklärt' } };
  const ledger = JSON.stringify(t.ledger);
  const d = a.deadlines(t, now).find(x => x.id === 'pay:xc:alt');
  assert.equal(d.state, 'done'); assert.equal(d.when, 'erledigt · 10.11.2026');
  assert(!a.departurePlan(t, now).items.some(x => x.id === 'pay:xc:alt'), 'Fahrplan ohne erledigte Frist');
  assert.equal(JSON.stringify(t.ledger), ledger, 'Zahlungsbuch unberührt');
  t.deadlineAck = ['kaputt']; assert.equal(a.deadlines(t, now).find(x => x.id === 'pay:xc:alt').state, 'overdue', 'ungültige Markierung wird ignoriert');
}
console.log('Fristen: „erledigt“ ohne Buchungsänderung geprüft.');

/* Fahrplan = Adapter, Kalender mit stabilen UIDs (N3/N6) */
{
  const t = winterTrip();
  const p = a.departurePlan(t, now), d = a.deadlines(t, now);
  assert.deepEqual(p.items.map(x => x.id), d.filter(x => x.at).map(x => x.id), 'Fahrplan aus derselben Liste');
  assert.deepEqual(p.undated.map(x => x.id), d.filter(x => !x.at).map(x => x.id));
  assert(a.departureBlock(t, now).includes('überfällig seit 10.11.2026'), 'Fahrplan zeigt den Text');
  const ics1 = a.icsData(t, now, { reminders: true }).text, ics2 = a.icsData(t, new Date('2026-11-21T10:00:00Z'), { reminders: true }).text;
  const uids = s => (s.match(/UID:[^\r\n]*-frist-[^\r\n]*/g) || []).map(x => x.slice(4)).sort();
  assert.deepEqual(uids(ics1), [t.id + '-frist-pack@reiseplaner', t.id + '-frist-pay-xc-heute@reiseplaner', t.id + '-frist-pay-xc-kurs@reiseplaner', t.id + '-frist-winter@reiseplaner'].sort(), 'überfällige ohne Erinnerung, Abfahrt ohne');
  const u = J(t); a.setLedger(u, 'xc:heute', 'paid', '30');
  assert.deepEqual(uids(a.icsData(u, now, { reminders: true }).text), uids(ics1).filter(x => !/heute/.test(x)), 'andere Fristen behalten ihre UID, wenn eine wegfällt');
  assert.deepEqual(uids(ics2).filter(x => !/heute/.test(x)), uids(ics1).filter(x => !/heute/.test(x)), 'erneuter Export, gleiche UIDs');
  assert.equal(a.departurePlan(a.newTrip({ dateMode: 'open' }), now), null);
}
console.log('Fristen: Fahrplan und Kalender-Erinnerungen aus deadlines(), stabile UIDs geprüft.');

/* Ohne feste Daten: Zahlungen bleiben Fristen, kein Packtag, keine Abfahrt */
{
  const t = a.newTrip({ dateMode: 'open' }); t.extraCosts = [a.costEntryFromForm({ title: 'Anzahlung', amount: '100' }, 'anz')];
  a.setLedger(t, 'xc:anz', 'due', '2026-12-01');
  const d = a.deadlines(t, now);
  assert(d.some(x => x.id === 'pay:xc:anz' && x.state === 'due'));
  assert(!d.some(x => ['pack', 'depart', 'winter'].includes(x.id)));
}
console.log('Fristen: Reise ohne feste Daten geprüft.');

/* Zeitzonen: Uhrzeit gilt in der Zone der Frist (R8), Sommerzeitwechsel (N1) */
{
  assert.equal(a.deadlineMs({ date: '2026-12-29', time: '08:30', tz: 'Europe/Berlin' }), Date.UTC(2026, 11, 29, 7, 30));
  assert.equal(a.deadlineMs({ date: '2027-03-28', time: '09:00', tz: 'Europe/Berlin' }), Date.UTC(2027, 2, 28, 7, 0), 'Tag der Umstellung: 9:00 Sommerzeit');
  assert.equal(a.deadlineMs({ date: '2027-03-27', time: '09:00', tz: 'Europe/Berlin' }), Date.UTC(2027, 2, 27, 8, 0));
  assert.equal(a.deadlineMs({ date: '2026-12-29' }), null, 'nur Datum: kein erfundener Zeitpunkt');
  const t = winterTrip(); t.schemaVersion = 3;
  t.transport = { out: [{ id: 'sflug', mode: 'flug', fromCode: 'STR', toCode: 'VIE', number: 'OS 128', dep: { date: '2026-12-30', time: '12:00', tz: 'Europe/Berlin' }, arr: { date: '2026-12-30', time: '13:10', tz: 'Europe/Vienna' }, checkin: { opens: { date: '2026-12-01', time: '18:00', tz: 'Europe/Vienna' }, note: 'App der Airline' } }], back: [] };
  a.validateExtras(t);
  const at = n => a.deadlines(t, new Date(n)).find(x => x.id === 'checkin:sflug');
  assert.equal(at('2026-12-01T16:30:00Z').state, 'due', '17:30 Wien: noch nicht erreicht');
  assert.equal(at('2026-12-01T17:01:00Z').state, 'overdue', '18:01 Wien: Zeitpunkt vorbei');
  assert.equal(at('2026-12-01T16:30:00Z').when, 'heute 18:00 (Europe/Vienna)', 'Anzeige in Fristzone');
  assert(/OS 128 ab 18:00/.test(at('2026-11-20T10:00:00Z').label));
}
console.log('Fristen: Zeitpunkt in Fristzone, Sommerzeitwechsel, Check-in-Uhrzeit geprüft.');

/* Format 3: offene Erstattung und unbekannte Stornogebühr als Aufgabe ohne Datum, nie als 0 € */
{
  const t = a.silvesterTemplate(); t.schemaVersion = 3;
  const key = Object.keys(a.cost(t).lines.reduce((m, l) => (l.key && l.key.startsWith('act:') ? (m[l.key] = 1) : 0, m), {}))[0];
  t.ledger = { [key]: { status: 'gebucht', amount: null, paid: 60, due: '', refunds: [], cancel: { on: '2026-11-10', fee: 20 } } };
  a.validateExtras(t);
  let r = a.deadlines(t, now).find(x => x.id === 'refund:' + key);
  assert(r && r.state === 'unknown' && r.amount === 40 && !r.at, 'Erstattung 60 − 20 erwartet');
  t.ledger[key].cancel.fee = null;
  const d = a.deadlines(t, now);
  assert(!d.some(x => x.id === 'refund:' + key), 'ohne bekannte Gebühr keine geratene Erstattung');
  r = d.find(x => x.id === 'cancelfee:' + key);
  assert(r && r.state === 'unknown' && r.amount === null && /Stornogebühr klären/.test(r.label));
  assert(!a.departurePlan(t, now) || !a.departurePlan(t, now).undated.some(x => /cancelfee|refund/.test(x.id)), 'Fahrplan zeigt weiterhin nur Buchungsaufgaben ohne Frist');
}
console.log('Fristen: Erstattung erwartet und Stornogebühr unbekannt (Format 3) geprüft.');

/* Über alle Reisen: „Diese Woche fällig“ (F11) */
{
  const t1 = winterTrip(), t2 = a.newTrip({ title: 'Bodensee', dateMode: 'fix', start: '2026-11-24', end: '2026-11-25', nights: 1 });
  t2.extraCosts = [a.costEntryFromForm({ title: 'Schiff', amount: '40' }, 'schiff')]; a.setLedger(t2, 'xc:schiff', 'due', '2026-11-23');
  const w = a.upcomingDeadlines([t1, t2], now);
  assert.deepEqual(w.map(x => x.trip + '/' + x.id), [t1.id + '/pay:xc:alt', t1.id + '/pay:xc:heute', t2.id + '/pay:xc:schiff', t2.id + '/pack'], 'Überfälliges zuerst, dann chronologisch');
  assert(w.some(x => x.id === 'pay:xc:schiff' && x.tripTitle === 'Bodensee'));
  assert(!w.some(x => x.kind === 'abfahrt' || !x.at || x.at.date > '2026-11-27'), 'nur datierte Fristen innerhalb von 7 Tagen, ohne Abfahrt');
  assert.equal(a.upcomingDeadlines([], now).length, 0);
}
console.log('Fristen: Übersicht über alle Reisen (7 Tage) geprüft. Kein Browser-/iPhone-Test.');
