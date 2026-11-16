/* Drei-Wege-Abgleich (merge3.js, docs/PLAN_GEMEINSAM.md §4): reine Fälle. */
const assert = require('assert');
const M = require('../merge3.js');
const C = x => JSON.parse(JSON.stringify(x));
const base = {
  id: 'tm1', schemaVersion: 3, title: 'Allgäu', persons: 2, budget: 1500, notes: '',
  dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', nights: 4,
  origin: 'Hattenhofen', dest: 'Oberstdorf', km: 180, travel: 'auto',
  stayId: 's1', stayQuote: 600, place: 'p1',
  items: [{ id: 'i1', title: 'Therme', day: 1 }, { id: 'i2', title: 'Rodeln', day: 2 }, { id: 'i3', title: 'Silvester', day: 2 }],
  extraCosts: [{ id: 'k1', label: 'Kurtaxe', amount: 20, paid: false }],
  check: { pass: false, auto: false }, updated: 1
};
let n = 0; const t = (name, fn) => { fn(); n++; };

t('unabhängige Felder und Einträge werden zusammengeführt', () => {
  const mine = C(base), theirs = C(base);
  mine.title = 'Allgäu Winter'; mine.items.push({ id: 'i4', title: 'Schneeschuh', day: 3 }); mine.check.pass = true;
  theirs.budget = 1400; theirs.extraCosts[0].paid = true; theirs.items[1].title = 'Rodeln Söllereck'; theirs.check.auto = true;
  const r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts.length, 0);
  assert.equal(r.result.title, 'Allgäu Winter'); assert.equal(r.result.budget, 1400);
  assert.deepEqual(r.result.items.map(x => x.id), ['i1', 'i2', 'i3', 'i4']);
  assert.equal(r.result.items[1].title, 'Rodeln Söllereck');
  assert.equal(r.result.extraCosts[0].paid, true);
  assert.deepEqual(r.result.check, { pass: true, auto: true });
  assert(r.mine >= 3 && r.theirs >= 3);
});

t('gleiche Änderung auf beiden Seiten ist kein Widerspruch', () => {
  const mine = C(base), theirs = C(base); mine.title = theirs.title = 'X';
  assert.equal(M.merge3(base, mine, theirs).conflicts.length, 0);
});

t('gleiches Feld unterschiedlich → Widerspruch, Ergebnis zunächst online, Wahl „meine“ setzt meine', () => {
  const mine = C(base), theirs = C(base); mine.title = 'Anna'; theirs.title = 'Ben'; mine.notes = 'Schlitten mitnehmen';
  const r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts.length, 1); assert.equal(r.conflicts[0].kind, 'value');
  assert.equal(r.result.title, 'Ben'); assert.equal(r.result.notes, 'Schlitten mitnehmen');
  assert.equal(M.resolve(r.result, r.conflicts, { [r.conflicts[0].id]: 'mine' }).title, 'Anna');
  assert.equal(M.resolve(r.result, r.conflicts, { [r.conflicts[0].id]: 'theirs' }).title, 'Ben');
  const d = M.describe(r.conflicts[0]); assert.equal(d.title, 'Titel'); assert.equal(d.mine, 'Anna'); assert.equal(d.theirs, 'Ben');
});

t('gekoppelte Gruppe: Anreisedatum hier, Nächte online → ein Widerspruch für den ganzen Zeitraum, nie gemischt', () => {
  const mine = C(base), theirs = C(base);
  mine.start = '2026-12-29'; theirs.nights = 3; theirs.end = '2027-01-02';
  const r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts.length, 1); assert.equal(r.conflicts[0].kind, 'group'); assert.equal(r.conflicts[0].group, 'zeitraum');
  assert.equal(r.result.start, '2026-12-30'); assert.equal(r.result.nights, 3);
  const m = M.resolve(r.result, r.conflicts, { 'g:zeitraum': 'mine' });
  assert.deepEqual([m.start, m.end, m.nights], ['2026-12-29', '2027-01-03', 4]);
});

t('Gruppe nur auf einer Seite geändert → ganze Gruppe von dort', () => {
  const mine = C(base), theirs = C(base);
  mine.stayId = 's2'; mine.stayQuote = 720; theirs.title = 'Y';
  const r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts.length, 0); assert.equal(r.result.stayId, 's2'); assert.equal(r.result.stayQuote, 720); assert.equal(r.result.title, 'Y');
});

t('ein Eintrag gilt als Ganzes: Betrag hier, bezahlt online → Widerspruch', () => {
  const mine = C(base), theirs = C(base);
  mine.extraCosts[0].amount = 24; theirs.extraCosts[0].paid = true;
  const r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts.length, 1); assert.equal(r.conflicts[0].kind, 'entry'); assert.equal(r.conflicts[0].entry, 'k1');
  assert.deepEqual(r.result.extraCosts[0], { id: 'k1', label: 'Kurtaxe', amount: 20, paid: true });
  assert.equal(M.describe(r.conflicts[0]).title, 'Zusatzkosten: Kurtaxe');
});

t('Löschen gegen Ändern', () => {
  let mine = C(base), theirs = C(base);
  mine.items = mine.items.filter(x => x.id !== 'i2'); theirs.items[1].day = 3;
  let r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts.length, 1); assert.equal(r.conflicts[0].what, 'hier gelöscht, online geändert');
  assert(r.result.items.some(x => x.id === 'i2'), 'standardmäßig bleibt der online geänderte Eintrag');
  assert(!M.resolve(r.result, r.conflicts, { [r.conflicts[0].id]: 'mine' }).items.some(x => x.id === 'i2'));
  mine = C(base); theirs = C(base);
  mine.items[1].title = 'Rodeln abends'; theirs.items = theirs.items.filter(x => x.id !== 'i2');
  r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts[0].what, 'online gelöscht, hier geändert');
  assert(!r.result.items.some(x => x.id === 'i2'));
  const back = M.resolve(r.result, r.conflicts, { [r.conflicts[0].id]: 'mine' });
  assert.deepEqual(back.items.map(x => x.id), ['i1', 'i2', 'i3'], 'wieder an alter Stelle');
  assert.equal(back.items[1].title, 'Rodeln abends');
});

t('Löschen ohne Änderung auf der anderen Seite wird übernommen; beidseitig gelöscht bleibt gelöscht', () => {
  const mine = C(base), theirs = C(base);
  mine.items = mine.items.filter(x => x.id !== 'i1'); theirs.items = theirs.items.filter(x => x.id !== 'i3' && x.id !== 'i1');
  const r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts.length, 0); assert.deepEqual(r.result.items.map(x => x.id), ['i2']);
});

t('Reihenfolge: nur hier umsortiert → meine; neue Online-Einträge bleiben an ihrem Platz', () => {
  const mine = C(base), theirs = C(base);
  mine.items = [mine.items[2], mine.items[0], mine.items[1]];
  theirs.items.splice(1, 0, { id: 'i9', title: 'Museum', day: 1 });
  const r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(r.result.items.map(x => x.id), ['i3', 'i1', 'i9', 'i2']);
});

t('unbekannte und Format-5-Felder laufen durch, Format sinkt nie', () => {
  const mine = C(base), theirs = C(base);
  theirs.schemaVersion = 5; theirs.tasks = [{ id: 'a1', title: 'Skipass kaufen', done: false, due: null }]; theirs.zukunft = { x: 1 };
  mine.tasks = [{ id: 'a2', title: 'Schneeketten', done: false, due: null }];
  const r = M.merge3(base, mine, theirs);
  assert.equal(r.conflicts.length, 0); assert.equal(r.result.schemaVersion, 5);
  assert.deepEqual(r.result.tasks.map(x => x.id), ['a1', 'a2']); assert.deepEqual(r.result.zukunft, { x: 1 });
});

t('Listen ohne eindeutige IDs gelten als Ganzes', () => {
  const b = Object.assign(C(base), { countries: ['DE'] }), mine = C(b), theirs = C(b);
  mine.countries = ['DE', 'AT']; theirs.countries = ['DE', 'CH'];
  const r = M.merge3(b, mine, theirs);
  assert.equal(r.conflicts.length, 1); assert.equal(r.conflicts[0].kind, 'value');
});

t('Objekte der obersten Ebene je Schlüssel, darin Werte als Ganzes', () => {
  const b = Object.assign(C(base), { assumptions: { fuel: { low: 1.6, high: 1.9 }, note: '' } }), mine = C(b), theirs = C(b);
  mine.assumptions.fuel.low = 1.7; theirs.assumptions.fuel.high = 2.0; theirs.assumptions.note = 'ADAC';
  const r = M.merge3(b, mine, theirs);
  assert.equal(r.conflicts.length, 1, 'fuel low/high werden nicht gemischt');
  assert.equal(r.result.assumptions.note, 'ADAC');
});

t('Ergebnis ist eine eigene Kopie, Eingaben bleiben unverändert', () => {
  const mine = C(base), theirs = C(base), m0 = C(mine), t0 = C(theirs); mine.title = 'A';
  const r = M.merge3(base, mine, theirs); r.result.items[0].title = 'verändert';
  assert.deepEqual(theirs, t0); assert.equal(mine.items[0].title, m0.items[0].title);
});

t('falsche Eingaben → Fehler statt Abgleich', () => {
  assert(M.merge3(base, Object.assign(C(base), { id: 'tx' }), C(base)).error);
  assert(M.merge3(null, C(base), C(base)).error);
});

console.log('merge3: ' + n + ' Prüfgruppen bestanden');
