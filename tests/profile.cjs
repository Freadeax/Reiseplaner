/* Profil-Bewertung „Worauf habt ihr Lust?“ (Claude, #8, Plan C2/C5). Node-Test mit kleinen Testzielen und echtem Katalog. */
const assert = require('assert');
const C = require('../catalog.js');
const spot = (id, kind, o) => Object.assign({ id, name: id, kind, lat: 48, lon: 9, hours: 2, months: [] }, o || {});
const places = [
  { id: 'a', name: 'Therme Nah', lat: 48, lon: 9, kinds: ['therme', 'genuss'], months: [1, 2, 12], nights: [1, 3], airKm: 40,
    spots: [spot('a1', 'therme', { indoor: true }), spot('a2', 'genuss', { indoor: true }), spot('a3', 'natur')] },
  { id: 'b', name: 'Berge Weit', lat: 48, lon: 9, kinds: ['berge', 'natur'], months: [6, 7, 8], nights: [2, 5], airKm: 200,
    spots: [spot('b1', 'berge', { family: true }), spot('b2', 'therme', { indoor: true, months: [6, 7] }), spot('b3', 'natur', { family: true })] },
  { id: 'c', name: 'Stadt Mitte', lat: 48, lon: 9, kinds: ['stadt', 'kultur'], months: [], nights: [1, 2], airKm: 90,
    spots: [spot('c1', 'kultur', { indoor: true }), spot('c2', 'technik', { indoor: true, family: true })] }
];
const R = pr => C.rankProfile({ places }, pr);
const ids = pr => R(pr).map(x => x.place.id);

/* Eingaben werden bereinigt: unbekannte Arten/Stufen/Werte fallen weg */
assert.deepEqual(C.checkProfile({ kinds: { therme: 'must', foo: 'must', natur: 'egal' }, month: 13, pace: 'wild', maxMin: '90', travel: 'zug' }),
  { kinds: { therme: 'must' }, month: null, nights: null, pace: null, party: null, weatherSafe: false, maxMin: 90, travel: null, budgetPp: null });

/* Prototyp-Namen und fremde Typen werden abgewiesen */
const evil = JSON.parse('{"kinds":{"__proto__":"must","constructor":"like","toString":"avoid","therme":"__proto__","natur":"like"},"pace":"toString","party":"constructor","travel":"__proto__","weatherSafe":"true","month":[3],"maxMin":{}}');
assert.deepEqual(C.checkProfile(evil), { kinds: { natur: 'like' }, month: null, nights: null, pace: null, party: null, weatherSafe: false, maxMin: null, travel: null, budgetPp: null });
assert.deepEqual(C.checkProfile({ kinds: Object.create({ therme: 'must' }) }).kinds, {}, 'nur einfache Objekte');
assert.deepEqual(C.checkProfile(null).kinds, {}); assert.deepEqual(C.checkProfile([1]).kinds, {});
assert.equal(C.rankProfile({ places }, evil).length, 3, 'manipuliertes Profil bricht die Bewertung nicht');

/* unbedingt: erfüllt über Art des Ziels oder saisonal passende Attraktion; fehlend → mustOk false, ans Ende, aber sichtbar */
let r = R({ kinds: { therme: 'must' } });
assert.deepEqual(r.map(x => [x.place.id, x.mustOk]), [['a', true], ['b', true], ['c', false]]);
assert(r[2].why.some(w => w.type === 'minus' && /fehlt/.test(w.text)));
r = R({ kinds: { therme: 'must' }, month: 8 });
assert.equal(r.find(x => x.place.id === 'b').mustOk, false, 'Therme in b nur Juni/Juli: im August kein Muss-Treffer');

/* lieber nicht: weiche, erklärte Abwertung, kein Ausschluss */
r = R({ kinds: { therme: 'avoid' } });
assert.equal(r.length, 3); assert(r.every(x => x.mustOk));
assert.equal(r[r.length - 1].place.id, 'a', 'Therme-Ziel abgewertet');
assert(r.find(x => x.place.id === 'a').why.some(w => w.type === 'minus' && /lieber nicht/.test(w.text)));

/* Fahrzeit: nur mit bekannter Schätzung erfüllt; als Schätzung benannt */
r = R({ maxMin: 120 });
assert.deepEqual(r.filter(x => x.mustOk).map(x => x.place.id).sort(), ['a', 'c']);
assert(r.find(x => x.place.id === 'a').why.some(w => /Schätzung/.test(w.text)));
const noAir = C.rankProfile({ places: [Object.assign({}, places[0], { id: 'x', airKm: null })] }, { maxMin: 120 })[0];
assert.equal(noAir.mustOk, false); assert.deepEqual(noAir.must.unknown, ['fahrzeit']);

/* Bahn/Flug und Budget: nie erfüllt, als unbekannt ausgewiesen */
r = R({ travel: 'flug', maxMin: 600, budgetPp: 300 });
assert(r.every(x => !x.mustOk && x.must.unknown.includes('fahrzeit') && x.must.unknown.includes('budget')));
assert(r[0].why.some(w => w.type === 'unknown' && /Flugverbindung/.test(w.text)));
r = R({ budgetPp: 300 });
assert(r.every(x => x.mustOk && x.why.some(w => w.type === 'unknown' && /Budget nicht bewertet/.test(w.text))), 'Budget unbekannt schließt nicht aus');

/* Erklärung: x von y Wünschen; Familie, Regen, Tempo */
r = R({ kinds: { therme: 'like', natur: 'like' }, month: 1, party: 'familie', weatherSafe: true, pace: 'ruhig' });
const a = r.find(x => x.place.id === 'a');
assert.equal(a.wishes, 5); assert.equal(a.summary, 'passt zu ' + a.met + ' von 5 Wünschen');
assert(a.why.some(w => /drinnen/.test(w.text)) && a.why.some(w => /Annahme/.test(w.text)));
assert.equal(ids({ party: 'familie' })[0], 'b', 'meiste Kinder-Ideen zuerst');
/* deterministisch, Gleichstand nach Luftlinie und ID */
assert.deepEqual(ids({}), ['a', 'c', 'b']);
assert.deepEqual(ids({}), ids({}));

/* echter Katalog: läuft über alle Ziele, jedes Ergebnis mit Erklärung */
global.window = global.window || {}; require('../catalog-data.js'); const DATA = window.RP_CATALOG;
const found = C.searchLocal(DATA, { lat: 48.7, lon: 9.65, maxKm: 1200 });
const all = C.rankProfile(found, { kinds: { therme: 'must', unterwelt: 'avoid' }, month: 2, weatherSafe: true });
assert.equal(all.length, found.places.length); assert(all.length > 50);
assert(all.every(x => typeof x.summary === 'string' && Array.isArray(x.why)));
assert(all.filter(x => x.mustOk).every(x => x.must.met.includes('therme')));
console.log('Profil-Bewertung: Bereinigung, unbedingt nur mit bekannten Merkmalen, lieber nicht als erklärte Abwertung, Fahrzeit nur mit Schätzung, Bahn/Flug/Budget unbekannt, Erklärungen, Reihenfolge, echter Katalog (' + DATA.places.length + ' Ziele) geprüft.');
