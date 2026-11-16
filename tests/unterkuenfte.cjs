/* Unterkunft-Reiter (Claude, 16.11.2026; lodging.js, app/unterkuenfte.js): Register nur mit Quelle und ohne Preise,
   Arten und Portale stimmig, Stand der gewählten Unterkunft, Merkliste aus dem Register ohne Auswahlwechsel,
   Angebot zu einer Unterkunft (Profil bleibt, Art bleibt beim Auswählen), eigene Unterkunft ohne Preis = offen.
   Node-Test mit index.html und den echten Logikdateien. Kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const LG = require('../lodging.js');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.includes('<script src="lodging.js"></script>') && html.includes('<script src="app/unterkuenfte.js"></script>'));
assert(fs.readFileSync(__dirname + '/../scripts/build.mjs', 'utf8').includes("'lodging.js'"), 'Build liefert lodging.js aus');
let n = 0;
/* 1 · Register */
assert.deepEqual(LG.validate(), []); n++;
assert(LG.KINDS.length >= 25 && ['baumhaus', 'iglu', 'hausboot', 'glamping', 'berghuette', 'kloster', 'schloss', 'leuchtturm', 'jurte', 'heuhotel', 'weinfass', 'tinyhouse'].every(k => LG.kindById(k))); n++;
assert(LG.ENTRIES.every(e => e.src && e.src.checked && !('price' in e))); n++;
assert(LG.portalsFor('berghuette').some(p => p.id === 'huetten') && LG.portalsFor('hausboot').some(p => p.id === 'kuhnle')); n++;
assert(LG.PORTALS.filter(p => p.mode === 'search').every(p => ['booking', 'airbnb', 'fewo'].includes(p.offerProvider)), 'Suchlinks nur mit geprüftem Muster'); n++;
const hatt = { lat: 48.67, lon: 9.62 };
let f = LG.find({ kind: 'iglu', from: hatt });
assert.deepEqual(f.map(x => x.e.id), ['lg-iglulodge-nebelhorn', 'lg-iglu-dorf-kuehtai'], 'nach Entfernung sortiert'); assert(f[0].km > 100 && f[0].km < 200); n++;
assert.equal(LG.find({ text: 'salach' })[0].e.id, 'lg-burg-staufeneck'); assert.equal(LG.find({ kind: 'iglu', from: hatt, maxKm: 100 }).length, 0); n++;
assert(/unbestätigt/.test(LG.factText(LG.ENTRIES.find(e => e.id === 'lg-tripsdrill-naturresort'), 'familie'))); n++;
const bad = JSON.parse(JSON.stringify(LG.ENTRIES[0])); bad.id = 'lg-test'; bad.src = { url: 'https://x.de', type: 'magazin', checked: '2026-11-16' }; bad.price = 99;
LG.ENTRIES.push(bad); const errs = LG.validate(); LG.ENTRIES.pop();
assert(errs.some(e => /Keine Preise/.test(e)) && errs.some(e => /offizieller Quelle/.test(e)), 'Preise und „bestätigt“ ohne offizielle Quelle abgelehnt'); n++;

/* 2 · App */
const base = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const store = new Map(), alerts = [];
const ctx = { window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: require('../v4logic.js'), RPV5: require('../v5logic.js'), RPBook: require('../bookgen.js'), RPCatalog: require('../catalog.js'), RPLodging: LG },
  location: { hash: '', href: 'http://x/' }, history: { replaceState() {} }, scrollTo() {}, navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: { addEventListener() {}, querySelector: () => null, querySelectorAll() { return []; }, getElementById: () => null, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL, Blob, TextEncoder, TextDecoder, crypto: globalThis.crypto };
ctx.window.document = ctx.document; vm.createContext(ctx); vm.runInContext(base, ctx); ctx.alertMsg = m => alerts.push(m); ctx.render = () => {};
const run = s => vm.runInContext(s, ctx), a = ctx.window.__app; a.Store.setScope('guest');
const t = a.newTrip({ id: 'tunterk', title: 'Test', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', nights: 4, persons: 2, dest: 'Oberstdorf' });
t.originGeo = hatt;
assert.equal(run('uStand')(t).state, 'keine'); n++;
const s = run('uRegAdd')(t, 'lg-iglulodge-nebelhorn');
assert.equal(t.stayId || '', '', 'Merkliste ändert die Auswahl nicht'); assert.equal(s.kind, 'iglu'); assert.equal(s.priceOpen, true); assert(s.geo && s.reg === 'lg-iglulodge-nebelhorn'); n++;
assert.throws(() => run('uRegAdd')(t, 'lg-iglulodge-nebelhorn'), /schon auf eurer Merkliste/); n++;
a.Store.put(JSON.parse(JSON.stringify(t)));
const t1 = a.Store.get('tunterk'); assert.equal(t1.customStays[0].kind, 'iglu', 'Art bleibt beim Speichern erhalten'); n++;
t1.stayId = s.id;
assert.equal(run('uStand')(t1).state, 'offen'); assert.equal(a.cost(t1).lines.find(l => l.key === 'stay').open, true, 'offen ≠ 0 €'); n++;
const seed = run('uOfferSeed')(t1, t1.customStays[0]);
assert.deepEqual(JSON.parse(JSON.stringify(seed)), { name: 'Iglu Lodge am Nebelhorn', location: 'Oberstdorf', type: 'other', stayId: s.id, url: s.url }); n++;
const fe = Object.fromEntries(['tax', 'cleaning', 'parking', 'wellness', 'mandatory'].map(k => [k, { state: 'included', amount: 0 }]));
const o = Object.assign({ id: 'oiglu', provider: 'direkt', start: t1.start, end: t1.end, persons: 2, price: 600, basis: 'stay', checkedAt: '2026-11-16', validUntil: '', availability: 'available', terms: '', paid: 0, deposit: 0, booked: false, features: Object.fromEntries(['sauna', 'kitchen', 'breakfast', 'cancel', 'quiet', 'accessible', 'parking'].map(k => [k, 'unknown'])), fees: fe }, seed);
t1.offers = [o]; a.applyOffer(t1, o);
const prof = t1.customStays.find(x => x.id === s.id);
assert.equal(prof.kind, 'iglu'); assert.equal(prof.reg, 'lg-iglulodge-nebelhorn'); assert(prof.geo, 'Art, Register und Lage bleiben beim Auswählen'); n++;
assert.equal(run('uStand')(t1, new Date('2026-11-20T12:00:00Z')).state, 'angebot'); n++;
assert.equal(run('uStand')(t1, new Date('2026-12-28T12:00:00Z')).state, 'alt', 'nach 31 Tagen neu prüfen'); n++;
o.booked = true; assert.equal(run('uStand')(t1, new Date('2026-12-28T12:00:00Z')).state, 'gebucht'); n++;
const extra = run('uStayExtra')(t1, prof);
assert(/1 Angebot erfasst/.test(extra) && /gebucht/.test(extra) && /Register/.test(extra) && /Anbieter-Website/.test(extra)); n++;
run('UI').uKind = 'iglu'; const ar = run('uArten')(t1);
assert(/Iglu Lodge am Nebelhorn/.test(ar) && /auf der Merkliste/.test(ar) && /Iglu-Dorf Kühtai/.test(ar) && /Luftlinie/.test(ar) && /keine Live-Anbindung/.test(ar)); n++;
run('UI').uKind = 'baumhaus'; assert(/booking\.com\/searchresults/.test(run('uArten')(t1)), 'Booking mit Ziel und Datum'); n++;
console.log('Unterkunft-Reiter: ' + n + ' Prüfungen bestanden (Register mit Quellen ohne Preise, Arten, Portale, Stand, Merkliste, Angebot je Unterkunft). Node-Test, kein Browser-/iPhone-Test.');
