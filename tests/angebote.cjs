/* Unterkunftsangebote vertiefen (Claude, 16.11.2026; app/angebote.js, M08 O2–O6, F2–F4, F6/F7):
   Link-Erkennung ohne Seitenabruf, Preisstände (erste Erfassung bleibt Bezug, gebucht behält Buchungsbetrag),
   Verpflegung ohne Doppelzählung im Essensansatz, Mindestnächte, Vergleich nur unter gleichen Annahmen.
   Node-Test mit index.html und den echten Logikdateien. Kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.includes('<script src="app/angebote.js"></script>'), 'index.html lädt app/angebote.js');
const base = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const J = x => JSON.parse(JSON.stringify(x));
function makeApp() {
  const store = new Map(), alerts = [];
  const ctx = {
    window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: require('../v4logic.js'), RPV5: require('../v5logic.js'),
      RPBook: require('../bookgen.js'), RPCatalog: require('../catalog.js') },
    location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
    navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL, Blob, TextEncoder, TextDecoder, crypto: globalThis.crypto, alert: m => alerts.push(m)
  };
  ctx.window.document = ctx.document; ctx.window.crypto = globalThis.crypto;
  vm.createContext(ctx); vm.runInContext(base, ctx);
  ctx.alertMsg = m => alerts.push(m); ctx.render = () => {};
  return { a: ctx.window.__app, run: s => vm.runInContext(s, ctx), alerts };
}
const fees = (st, amt) => Object.fromEntries(['tax', 'cleaning', 'parking', 'wellness', 'mandatory'].map(k => [k, { state: st || 'included', amount: amt || 0 }]));
const feats = Object.fromEntries(['sauna', 'kitchen', 'breakfast', 'cancel', 'quiet', 'accessible', 'parking'].map(k => [k, 'unknown']));
function offer(t, x) {
  return Object.assign({ id: 'ohaus', name: 'Haus am See', location: 'Füssen', provider: 'direkt', type: 'fewo', start: t.start, end: t.end, persons: t.persons,
    price: 620, basis: 'stay', url: 'https://example.org/haus', checkedAt: '2026-10-01', validUntil: '', availability: 'available', terms: '', paid: 0, deposit: 0, booked: false, features: J(feats), fees: fees() }, x || {});
}
let n = 0;
const { a, run } = makeApp(); a.Store.setScope('guest');

/* 1 · Link-Erkennung: nur was offen in der Adresse steht, keine Seite abgerufen */
const L = run('angebotAusLink');
let r = L('https://www.booking.com/hotel/de/haus.de.html?checkin=2026-12-30&checkout=2027-01-03&group_adults=2&no_rooms=1');
assert.deepEqual(J(r), { provider: 'booking', host: 'booking.com', start: '2026-12-30', end: '2027-01-03', persons: 2 }); n++;
r = L('https://www.airbnb.de/rooms/123?check_in=2026-12-30&check_out=2027-01-03&adults=3');
assert.equal(r.provider, 'airbnb'); assert.equal(r.start, '2026-12-30'); assert.equal(r.persons, 3); n++;
assert.equal(L('https://www.fewo-direkt.de/ferienwohnung/p123?startDate=2026-12-30&endDate=2027-01-03&adults=2').provider, 'fewo'); n++;
assert.equal(L('https://hotel.check24.de/x').provider, 'check24'); assert.equal(L('https://www.holidu.de/d/1').provider, 'holidu'); n++;
assert.equal(L('https://gasthof-beispiel.de/zimmer').provider, 'direkt', 'unbekannte Seite = direkt beim Gastgeber'); n++;
assert.equal(L('http://www.booking.com/x'), null, 'ohne HTTPS nichts'); assert.equal(L('kein link'), null); n++;
r = L('https://www.booking.com/x?checkin=2027-01-03&checkout=2026-12-30&group_adults=99');
assert.equal(r.start, null); assert.equal(r.persons, null, 'widersinnige Daten und Personen werden nicht übernommen'); n++;

/* 2 · Preisstand rein: erste Erfassung bleibt Bezug, Datum geprüft, Obergrenze 50 */
const S = run('angebotStandAnwenden');
let t = a.silvesterTemplate(), o = offer(t);
let res = S(o, { at: '2026-10-19', price: 680, availability: 'available' }, '2026-11-16');
assert.equal(res.locked, false); assert.equal(o.price, 680); assert.equal(o.checkedAt, '2026-10-19');
assert.deepEqual(o.history.map(h => [h.at, h.price, h.src]), [['2026-10-01', 620, 'Erfassung'], ['2026-10-19', 680, 'Neu geprüft']]); n++;
let ps = a.Store && run('V5').offerPriceState(o, '2026-11-16');
assert.equal(ps.change.abs, 60); assert.equal(ps.change.pct, 9.7, 'O3: +60 € (+9,7 %)'); assert.equal(ps.hints.length, 0); n++;
assert.throws(() => S(o, { at: '2026-10-10', price: 600 }, '2026-11-16'), /vor dem letzten Preisstand/); n++;
assert.throws(() => S(o, { at: '2026-12-01', price: 600 }, '2026-11-16'), /Zukunft/); n++;
assert.throws(() => S(o, { at: '2026-11-01', price: '' }, '2026-11-16'), /Neuen Preis/); n++;
S(o, { at: '2026-11-01', same: true, availability: 'unknown' }, '2026-11-16');
assert.equal(o.price, 680); assert.equal(o.history.length, 3); assert.equal(o.availability, 'unknown'); n++;
o.validUntil = '2026-10-20'; S(o, { at: '2026-11-02', price: 690 }, '2026-11-16');
assert.equal(o.validUntil, '', 'abgelaufene Gültigkeit vor dem neuen Prüfdatum wird geleert'); n++;
for (let i = 0; i < 60; i++) S(o, { at: '2026-11-03', price: 700 + i }, '2026-11-16');
assert.equal(o.history.length, 50); assert.equal(o.history[0].src, 'Erfassung', 'erster Stand bleibt'); n++;
const ob = offer(t, { booked: true });
res = S(ob, { at: '2026-11-10', price: 580, availability: 'available' }, '2026-11-16');
assert.equal(res.locked, true); assert.equal(ob.price, 620, 'O4: gebucht bleibt Buchungsbetrag'); assert.equal(ob.checkedAt, '2026-10-01');
assert(/Umbuchung prüfen/.test(run('V5').offerPriceState(ob, '2026-11-16').hints.map(h => h.text).join()), 'Hinweis „aktuell günstiger“'); n++;

/* 3 · Schreiben über Format 5: Anheben nur nach Bestätigung, Kosten folgen dem neuen Preis */
t = a.silvesterTemplate(); t.offers = [offer(t)]; a.applyOffer(t, t.offers[0]); assert(a.Store.put(J(t)));
let cur = a.Store.get(t.id), before = a.cost(cur).total;
r = run('angebotPreisstand')(cur, 'ohaus', { at: '2026-10-19', price: 680, availability: 'available' });
assert.equal(r.ok, false); assert.equal(r.needsConfirm, 'format5'); assert.equal(a.Store.get(t.id).offers[0].price, 620, 'ohne Bestätigung nichts gespeichert'); n++;
r = run('angebotPreisstand')(cur, 'ohaus', { at: '2026-10-19', price: 680, availability: 'available' }, { confirmed: true });
assert(r.ok && r.upgraded); cur = a.Store.get(t.id);
assert.equal(cur.schemaVersion, 5); assert.equal(cur.offers[0].price, 680); assert.equal(cur.offers[0].history.length, 2);
assert.equal(Math.round(a.cost(cur).total - before), 60, 'Reisekosten nutzen den neuen Preis'); n++;
assert.equal(cur.customStays.find(s => s.id === cur.stayId).priceNight, 170, 'Planwert der gewählten Unterkunft mitgezogen'); n++;

/* 4 · Verpflegung ohne Doppelzählung (O2) und Mindestnächte */
const cut = run('boardCut');
assert.deepEqual([cut(45, 'none', false), cut(45, 'breakfast', false), cut(45, 'half', false), cut(45, 'full', false), cut(45, 'allinc', false), cut(20, 'none', true)], [0, 7, 28, 40, 45, 7]); n++;
const food = x => a.cost(x).lines.find(l => l.cat === 'essen');
cur.food = 'auswaerts'; assert(a.Store.put(J(cur))); cur = a.Store.get(t.id);
const f0 = food(cur).n != null ? food(cur).n : food(cur).c;
r = run('angebotBedingungen')(cur, 'ohaus', { board: 'half', minNights: '3' }); assert(r.ok, r.error); cur = a.Store.get(t.id);
assert.equal(cur.offers[0].board, 'half'); assert.equal(cur.offers[0].minNights, 3);
const f1 = food(cur).n != null ? food(cur).n : food(cur).c;
assert.equal(Math.round(f0 - f1), 28 * 4 * 2, 'Halbpension: 28 € p. P. und Nacht weniger Essensansatz (4 Nächte, 2 Personen)');
assert(/Halbpension inklusive/.test(food(cur).d || food(cur).sub || JSON.stringify(food(cur))), 'Hinweis in der Kostenzeile'); n++;
assert.throws(() => run('angebotBedingungen')(cur, 'ohaus', { minNights: '5' }), /mindestens 5 Nächte/, 'ausgewählte Unterkunft mit zu vielen Mindestnächten abgelehnt'); n++;
assert.throws(() => run('angebotBedingungen')(cur, 'ohaus', { minNights: '0' }), /1 bis 60/); n++;
r = run('angebotBedingungen')(cur, 'ohaus', { board: '', minNights: '' }); assert(r.ok); cur = a.Store.get(t.id);
assert(!('board' in cur.offers[0]) && !('minNights' in cur.offers[0]), 'leer = Feld entfernt'); n++;
const t2 = a.silvesterTemplate(), o2 = offer(t2, { id: 'omin', minNights: 7 }); t2.schemaVersion = 5; t2.offers = [o2];
assert.throws(() => a.applyOffer(t2, o2), /mindestens 7 Nächte/, 'Auswahl für Planung prüft Mindestnächte'); n++;
assert(/mindestens 7 Nächte, erfasst sind 4/.test(run('angebotPassung')(t2, o2).join()), 'Karte nennt den Widerspruch'); n++;

/* 5 · Vergleich nur unter gleichen Annahmen (O6) */
const tv = a.silvesterTemplate(), p1 = offer(tv, { id: 'oa' }), p2 = offer(tv, { id: 'ob', persons: 3, price: 900 });
let tbl = a.comparisonTable(tv, [p1, p2]);
assert(/nicht vergleichbar: Personen/.test(tbl)); assert(/Je Person und Nacht/.test(tbl)); assert(/Verpflegung/.test(tbl)); n++;
tbl = a.comparisonTable(tv, [p1, offer(tv, { id: 'oc', price: 500 })]);
assert(!/nicht vergleichbar/.test(tbl) && /direkt vergleichbar/.test(tbl)); n++;
const jn = run('angebotJeNacht')(offer(tv, { fees: Object.assign(fees(), { cleaning: { state: 'unknown', amount: '' } }) }));
assert.equal(jn.night, 155); assert.equal(jn.personNight, 77.5); assert.equal(jn.open, true, 'offene Gebühren bleiben offen'); n++;

/* 6 · Karte zeigt Verlauf und Knöpfe nur mit Schreibrecht */
const card = run('angebotKarteExtra')(cur, Object.assign(J(cur.offers[0]), { board: 'breakfast', minNights: 2 }));
assert(/Frühstück inklusive/.test(card) && /mind\. 2 Nächte/.test(card) && /Preisverlauf: 2 Stände/.test(card) && /je Nacht/.test(card)); n++;
assert(/Preis neu prüfen/.test(run('angebotKnoepfe')(cur, cur.offers[0]))); n++;
console.log('Unterkunftsangebote: ' + n + ' Prüfungen bestanden (Link-Erkennung, Preisstände, gebucht bleibt, Format 5, Verpflegung, Mindestnächte, Vergleichbarkeit). Node-Test, kein Browser-/iPhone-Test.');
