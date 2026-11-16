/* Wege und Tageskarte (app/wege.js, docs/WEGE.md): Schätzung je Verkehrsmittel, unbekannte Lage, gleicher Ort,
   Tageslast, Berechnung mit nachgebildetem Netz (Nominatim/OSRM), Gerätespeicher, Format-5-Eintrag, Darstellung.
   Node-Test ohne echtes Netz, kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const C = require('../catalog.js');
const V5 = require('../v5logic.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let code = require('./app-code.cjs')(html);
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const mem = new Map();
const storage = { getItem(k) { return mem.has(k) ? mem.get(k) : null; }, setItem(k, v) { mem.set(k, String(v)); }, removeItem(k) { mem.delete(k); } };
const win = { addEventListener() {}, RPCatalog: C };
const ctx = { window: win, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, head: { appendChild() {} } },
  localStorage: storage, setTimeout, clearTimeout, console, navigator: {} };
vm.createContext(ctx); vm.runInContext(code, ctx);
const a = win.__app;
let n = 0;

const ULM = { lat: 48.3984, lon: 9.9916 };
function trip(extra) {
  const t = a.newTrip(Object.assign({ nights: 2, dest: 'Ulm', origin: 'Göppingen', budget: 500, km: 60, travel: 'auto' }, extra || {}));
  t.destGeo = Object.assign({}, ULM);
  t.customActs = [
    { id: 'cmuenster', custom: true, t: 'Münster <Turm>', cat: 'eigen', cost: 0, per: 'pp', hours: 2, dur: 'ca. 2 Std.', ort: 'Ulm', geo: { lat: 48.3985, lon: 9.9925 } },
    { id: 'cblau', custom: true, t: 'Blautopf', cat: 'eigen', cost: 0, per: 'pp', hours: 1.5, dur: 'ca. 1,5 Std.', ort: 'Blaubeuren', geo: { lat: 48.4167, lon: 9.7850 } },
    { id: 'cnirgends', custom: true, t: 'Lesen', cat: 'eigen', cost: 0, per: 'pp', hours: 1, dur: 'ca. 1 Std.' },
    { id: 'csuche', custom: true, t: 'Kloster Wiblingen', cat: 'eigen', cost: 0, per: 'pp', hours: 1, dur: 'ca. 1 Std.', map: 'Kloster Wiblingen, Ulm' }
  ];
  t.items = [];
  return t;
}
const plan = (t, list) => { t.items = list.map(([act, day, slot, time], i) => Object.assign({ uid: 'i' + i, act, day, slot }, time ? { time } : {})); return t; };

/* 1 · Schätzung mit dem Auto: Unterkunft (Ortsmitte) → Münster (gleicher Ort) → Blautopf → zurück */
{
  mem.clear(); vm.runInContext('wegeMem=null', ctx);
  const t = plan(trip(), [['cmuenster', 1, 'morgen'], ['cblau', 1, 'nachm']]);
  const before = JSON.stringify(t), w = a.dayWays(t, 1);
  assert.equal(w.mode, 'auto', 'Auto als Standard bei Anreise mit dem Auto');
  assert.equal(w.legs.length, 3);
  assert.equal(w.legs[0].src, 'gleich', 'unter 300 m = am selben Ort');
  assert.equal(w.legs[1].src, 'schaetzung');
  const air = C.airKm(t.customActs[0].geo, t.customActs[1].geo), e = a.wegeEstimate(air, 'auto');
  assert.equal(w.legs[1].km, Math.round(air * 1.3)); assert.equal(w.legs[1].min, e.min);
  assert(w.legs[1].min % 5 === 0 && w.legs[1].min >= 15, 'auf 5 Min. gerundet, mit Parken');
  assert.equal(w.unknown, 0); assert.equal(w.min, w.legs[1].min + w.legs[2].min);
  assert(w.base.approx, 'ohne Unterkunft: Ortsmitte, sichtbar markiert');
  assert.equal(JSON.stringify(t), before, 'Ableitung ändert die Reise nicht');
  const html1 = a.wegeSection(t, 1);
  assert(html1.includes('Lage der Unterkunft unbekannt'), 'Ortsmitte erklärt');
  assert(html1.includes('(geschätzt)') && html1.includes('am selben Ort'));
  assert(html1.includes('Münster &lt;Turm&gt;') && !html1.includes('<Turm>'), 'Titel maskiert');
  assert(html1.includes('<svg') && html1.includes('gestrichelt = Luftlinie'), 'Skizze ohne Kacheln');
  assert(!/tile\.openstreetmap|maps\.googleapis/.test(html1), 'keine Kartenkacheln oder Google-Schnittstelle');
  assert(html1.includes('travelmode=driving') && html1.includes('engine=fossgis_osrm_car'));
  assert.equal(a.wegZeile(t, 1, 'i0'), '', 'gleicher Ort: keine Wegzeile');
  assert(a.wegZeile(t, 1, 'i1').includes('geschätzt'));
  n++;
}

/* 2 · Verkehrsmittel: zu Fuß und Fahrrad langsamer, Bahnreise startet zu Fuß, Wahl je Reise im Gerätespeicher */
{
  mem.clear(); vm.runInContext('wegeMem=null', ctx);
  const t = plan(trip({ travel: 'bahn' }), [['cblau', 0, 'morgen']]);
  assert.equal(a.wegeMode(t), 'fuss');
  const foot = a.dayWays(t, 0).min;
  a.wegeSetMode(t, 'rad'); const bike = a.dayWays(t, 0).min;
  a.wegeSetMode(t, 'auto'); const car = a.dayWays(t, 0).min;
  assert(foot > bike && bike > car, 'zu Fuß > Fahrrad > Auto: ' + [foot, bike, car]);
  assert.equal(JSON.parse(mem.get(a.WEGE_KEY)).mode[t.id], 'auto', 'Wahl nur im Gerätespeicher');
  assert(!('wegeMode' in t), 'nicht in der Reise');
  assert.throws(() => a.wegeSetMode(t, 'flug'), /Unbekannt/);
  n++;
}

/* 3 · Unbekannte Lage bleibt unbekannt: keine 0 Min., Summe „mindestens“, Liste nennt fehlende Orte */
{
  mem.clear(); vm.runInContext('wegeMem=null', ctx);
  const t = plan(trip(), [['cblau', 1, 'morgen'], ['cnirgends', 1, 'nachm'], ['csuche', 1, 'abend']]);
  const w = a.dayWays(t, 1);
  assert.deepEqual(w.legs.map(l => l.src), ['schaetzung', 'unbekannt', 'unbekannt', 'unbekannt']);
  assert.equal(w.unknown, 3); assert(w.legs.filter(l => l.src === 'unbekannt').every(l => l.min === null && l.km === null));
  const h = a.wegeSection(t, 1);
  assert(h.includes('mindestens'), 'Summe als Untergrenze');
  assert(h.includes('Lesen (kein Ort eingetragen)') && h.includes('Kloster Wiblingen'));
  assert.equal(a.wegZeile(t, 1, 'i1'), '');
  n++;
}

/* 4 · Tageslast: Wegminuten verkürzen die verfügbaren Stunden */
{
  mem.clear(); vm.runInContext('wegeMem=null', ctx);
  const t = plan(trip(), [['cblau', 1, 'morgen'], ['cmuenster', 1, 'nachm']]);
  const L = a.dayLoad(t)[1], w = a.dayWays(t, 1);
  assert.equal(L.ways, w.min); assert(L.ways > 0);
  assert.equal(L.cap, Math.round((10 - L.drive / 60 - L.ways / 60) * 10) / 10);
  assert.equal(a.dayLoad(t)[0].ways, 0, 'leerer Tag ohne Wege');
  n++;
}

/* 5 · Berechnen: fehlenden Ort suchen, eine Routenanfrage, Ergebnis nur auf dem Gerät, Reise unverändert */
(async () => {
  mem.clear(); vm.runInContext('wegeMem=null', ctx);
  const t = plan(trip({ travel: 'auto' }), [['cblau', 1, 'morgen'], ['csuche', 1, 'nachm']]);
  const before = JSON.stringify(t), asked = [], urls = [];
  const geo = async q => { asked.push(q); if (/wiblingen/.test(q)) return { lat: 48.3617, lon: 9.9862, label: 'Kloster Wiblingen' }; throw new Error('Ort „' + q + '“ nicht gefunden.'); };
  const osrm = { code: 'Ok', routes: [{ distance: 52000, duration: 3300, legs: [{ distance: 20000, duration: 1500 }, { distance: 22000, duration: 1200 }, { distance: 10000, duration: 600 }],
    geometry: { coordinates: Array.from({ length: 450 }, (_, i) => [9.99 - i * 0.0004, 48.39 + i * 0.00005]) } }] };
  const fetchMock = async u => { urls.push(u); return { ok: true, json: async () => osrm }; };
  const msg = await a.wegeCalc(t, 1, { geo, fetch: fetchMock });
  assert(/Wege berechnet/.test(msg), msg);
  assert(asked.includes('kloster wiblingen, ulm') && asked.includes('ulm'), 'Kloster und (wegen Ortsmitte) die Unterkunft/den Ort gesucht: ' + asked);
  assert.equal(urls.length, 1, 'eine Routenanfrage für den ganzen Tag');
  assert(/^https:\/\/routing\.openstreetmap\.de\/routed-car\/route\/v1\/driving\/[-0-9.,;]+\?overview=simplified&geometries=geojson$/.test(urls[0]), urls[0]);
  assert.equal(JSON.stringify(t), before, 'Berechnung ändert die Reise nicht');
  const w = a.dayWays(t, 1);
  assert.deepEqual(w.legs.map(l => l.src), ['osrm', 'osrm', 'osrm']);
  assert.deepEqual(w.legs.map(l => l.km), [20, 22, 10]);
  assert.deepEqual(w.legs.map(l => l.min), [25 + 10, 20 + 10, 10 + 10], 'Fahrzeit auf 5 Min. plus 10 Min. Parken/Fußweg');
  assert(w.osrm && w.geom.length <= 201 && w.geom.length > 100, 'Linie ausgedünnt');
  const saved = JSON.parse(mem.get(a.WEGE_KEY));
  assert.equal(Object.keys(saved.routes).length, 1); assert(saved.geo['kloster wiblingen, ulm'].lat);
  const h = a.wegeSection(t, 1);
  assert(h.includes('wege-linie') && h.includes('Routing FOSSGIS'), 'berechnete Linie mit Namensnennung');
  assert(!h.includes('(geschätzt)'));
  assert(a.wegZeile(t, 1, 'i1').includes('Auto</span>') && !a.wegZeile(t, 1, 'i1').includes('geschätzt'));

  /* Format 5: gültiger dayRoutes-Eintrag mit Abrufzeit */
  const rec = a.dayRouteRecord(t, 1);
  assert.equal(rec.src, 'osrm'); assert(rec.at); assert.deepEqual(rec.order, ['i0', 'i1']);
  assert.equal(rec.min, 85); assert.equal(rec.km, 52);
  let v5err = null; try { V5.validateV5({ schemaVersion: 5, dayRoutes: { 1: rec } }); } catch (e) { v5err = e.message; }
  assert(!v5err, 'Eintrag besteht die Tagesrouten-Prüfung: ' + v5err);

  /* Reihenfolge geändert: Route passt nicht mehr, Schätzung gilt wieder */
  const t2 = JSON.parse(JSON.stringify(t)); t2.items[0].slot = 'abend';
  assert(a.dayWays(t2, 1).legs.every(l => l.src !== 'osrm'), 'andere Reihenfolge = Schätzung');

  /* Nicht gefunden wird gemerkt und nicht erneut gefragt */
  const t3 = plan(trip(), [['cblau', 1, 'morgen'], ['cnirgends', 1, 'mittag']]);
  t3.customActs[2].ort = 'Gibtsnicht';
  asked.length = 0; await a.wegeCalc(t3, 1, { geo, fetch: fetchMock });
  assert(asked.includes('gibtsnicht'));
  asked.length = 0; await a.wegeCalc(t3, 1, { geo, fetch: fetchMock });
  assert(!asked.includes('gibtsnicht'), 'nicht gefundene Orte nicht erneut gesucht');
  assert(a.wegeSection(t3, 1).includes('Gibtsnicht') || a.wegeSection(t3, 1).includes('nicht gefunden'));

  /* Netzfehler: Meldung, Schätzung bleibt */
  mem.clear(); vm.runInContext('wegeMem=null', ctx);
  await assert.rejects(a.wegeCalc(t, 1, { geo, fetch: async () => ({ ok: false, status: 503 }) }), /503/);
  assert(a.dayWays(t, 1).legs.every(l => l.src !== 'osrm'));
  n++;

  /* 6 · Adresse für Fuß- und Radrouten, Grenzen, beschädigter Speicher */
  assert(/routed-foot\//.test(a.wegeRouteUrl('fuss', [ULM, { lat: 48.4, lon: 9.98 }])));
  assert(/routed-bike\//.test(a.wegeRouteUrl('rad', [ULM, { lat: 48.4, lon: 9.98 }])));
  assert.throws(() => a.wegeRouteUrl('auto', [ULM]), /2 bis 25/);
  assert.throws(() => a.wegeRouteUrl('auto', Array.from({ length: 26 }, () => ULM)), /2 bis 25/);
  mem.set(a.WEGE_KEY, '{kaputt'); vm.runInContext('wegeMem=null', ctx);
  assert.equal(a.dayWays(plan(trip(), [['cblau', 1, 'morgen']]), 1).legs[0].src, 'schaetzung', 'beschädigter Speicher: Schätzung');
  assert.equal(a.dayRouteRecord(plan(trip(), [['cnirgends', 1, 'morgen']]), 1), null, 'ohne bekannten Weg kein Eintrag');
  n++;

  /* 7 · Tagesplan zeigt Wegzeile und Abschnitt für den gewählten Tag */
  mem.clear(); vm.runInContext('wegeMem=null', ctx);
  const t7 = plan(trip(), [['cmuenster', 1, 'morgen', '10:00'], ['cblau', 1, 'nachm', '14:00']]);
  a.UI.planDay = 1;
  const p = a.render ? (() => { try { return vm.runInContext('tPlan', ctx)(t7); } catch (e) { return String(e); } })() : '';
  assert(p.includes('class="weg-zeile"'), 'Wegzeile im Zeitstrahl');
  assert(p.includes('Wege am '), 'Abschnitt für den gewählten Tag');
  assert(p.indexOf('weg-zeile') < p.indexOf('Blautopf<small'), 'Wegzeile vor dem Punkt');
  n++;

  console.log('Wege: ' + n + ' Prüfungen bestanden (Schätzung je Verkehrsmittel, unbekannte Lage, gleicher Ort, Tageslast, Berechnung mit nachgebildetem Netz, Gerätespeicher, Format-5-Eintrag, Darstellung). Kein Browser-/iPhone-Test, kein echtes Netz.');
})().catch(e => { console.error(e); process.exit(1); });
