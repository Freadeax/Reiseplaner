/* Check- und Packlisten nach Ziel, Reiseart und Wetter (Claude 16.11.2026, docs/CHECK_PACKLISTE.md).
   Node-Test ohne Netz: Open-Meteo-Antworten sind Attrappen. Kein Browser-/iPhone-Test, keine echte Abfrage. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const P = require('../packlogic.js');
let n = 0; const ok = () => n++;

const trip = o => Object.assign({ id: 't1', type: 'winter', travel: 'auto', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', nights: 4, dest: '' }, o || {});
const keys = g => g ? g[1].map(i => i[0]) : [];
const text = g => g ? g[1].map(i => i[1] + ' ' + i[2]).join(' | ') : '';

/* Horizont: W1 */
{
  assert.deepEqual(P.weatherPlan(trip(), '2026-11-16').mode, 'climate', '44 Tage voraus → Klima');
  assert.equal(P.weatherPlan(trip(), '2026-11-16').forecastFrom, '2026-12-15', 'Vorhersage ab 16 Tage vorher');
  const f = P.weatherPlan(trip(), '2026-12-20');
  assert.deepEqual([f.mode, f.from, f.to, f.cut], ['forecast', '2026-12-30', '2027-01-03', false]);
  const cut = P.weatherPlan(trip(), '2026-12-18');
  assert.deepEqual([cut.mode, cut.to, cut.cut], ['forecast', '2027-01-02', true], 'nur bis zum letzten Vorhersagetag, kein erfundener Wert');
  assert.equal(P.weatherPlan(trip(), '2027-01-01').from, '2027-01-01', 'laufende Reise ab heute');
  assert.equal(P.weatherPlan(trip(), '2027-01-04').mode, 'past');
  assert.equal(P.weatherPlan(trip({ dateMode: 'open' }), '2026-11-16').mode, 'none', 'ohne festes Datum kein Abruf');
  ok();
}
/* Adressen: gerundete Koordinaten, keine weiteren Reisedaten */
{
  const u = P.forecastUrl({ lat: 47.51234, lon: 10.41789 }, { from: '2026-12-30', to: '2027-01-03' });
  assert.ok(u.startsWith('https://api.open-meteo.com/v1/forecast?latitude=47.51&longitude=10.42&'), u);
  assert.ok(/start_date=2026-12-30&end_date=2027-01-03$/.test(u));
  const c = P.climateUrls({ lat: 47.5, lon: 10.4 }, { from: '2026-12-30', to: '2027-01-03' }, '2026-11-16');
  assert.deepEqual(c.map(x => x.year), [2025, 2024, 2023], 'drei vollständige Jahre vor der Reise');
  assert.ok(c[0].url.includes('archive-api.open-meteo.com') && c[0].url.includes('start_date=2025-12-30&end_date=2026-01-03'), 'Jahreswechsel bleibt zusammen');
  assert.equal(P.shiftYears('2028-02-29', 1), '2027-02-28', '29.02. im Nicht-Schaltjahr');
  assert.equal(P.shiftYears('2028-02-29', 4), '2024-02-29');
  ok();
}
/* Normierung Vorhersage, W2 Regen, W3 unbekannt, W5 Schnee + Auto, W6 stabile Schlüssel */
const fcJson = { daily: { time: ['2026-12-30', '2026-12-31', '2027-01-01'], temperature_2m_max: [2, 0.5, 4], temperature_2m_min: [-3, -7.2, -1],
  precipitation_probability_max: [20, 70, null], precipitation_sum: [0, 4.2, 0], snowfall_sum: [0, 3.5, 0], wind_speed_10m_max: [12, 55, 10], weather_code: [1, 73, 3], uv_index_max: [1, 1, 2] } };
{
  const wx = P.normForecast(fcJson);
  assert.equal(wx.days.length, 3);
  assert.equal(wx.days[2].pop, null, 'null bleibt null');
  assert.equal(P.dayText(wx.days[2], 'forecast'), '-1 bis 4 °C · Regen: keine Angabe · bedeckt', 'W3 Anzeige keine Angabe');
  assert.equal(P.dayText(wx.days[1], 'forecast'), '-7,2 bis 0,5 °C · Regen 70 % · Schnee 3,5 cm · Schneefall', 'Symbol nie ohne Text');
  const g = P.weatherGroup(trip(), wx);
  assert.equal(g[0], 'Packliste: wegen Wetter', 'Gruppenname beginnt mit Packliste (Packtag in Fristen zählt mit)');
  assert.deepEqual(keys(g), ['p-w-regen', 'p-w-kalt', 'p-w-frost', 'p-w-wind', 'p-w-schnee', 'p-w-ketten']);
  assert.ok(g[1][0][2].includes('Do 31.12. (70 %)'), 'W2 Grund mit Tag und Wahrscheinlichkeit: ' + g[1][0][2]);
  assert.ok(!keys(P.weatherGroup(trip({ travel: 'bahn' }), wx)).includes('p-w-ketten'), 'W5 Ketten nur mit Auto');
  const dry = P.normForecast({ daily: { time: ['2026-12-30'], temperature_2m_max: [null], temperature_2m_min: [null], precipitation_probability_max: [null] } });
  assert.equal(P.weatherGroup(trip(), dry), null, 'W3 unbekannt erzeugt keinen Punkt');
  assert.deepEqual(keys(P.weatherGroup(trip(), P.normForecast(fcJson))), keys(g), 'W6 gleiche Schlüssel bei neuem Abruf');
  assert.throws(() => P.normForecast({}), /ohne Tageswerte/);
  const hot = P.normForecast({ daily: { time: ['2027-07-01'], temperature_2m_max: [31], temperature_2m_min: [18], precipitation_probability_max: [10], uv_index_max: [8.4] } });
  assert.deepEqual(keys(P.weatherGroup(trip({ type: 'strand' }), hot)), ['p-w-hitze', 'p-w-uv']);
  ok();
}
/* W4 veraltet */
{
  const now = Date.parse('2026-11-16T22:00:00Z');
  assert.equal(P.isStale({ fetchedAt: '2026-11-16T09:00:00Z' }, now), true, '13 Std. alt');
  assert.equal(P.isStale({ fetchedAt: '2026-11-16T11:00:00Z' }, now), false);
  assert.equal(P.cacheKey({ lat: 47.512, lon: 10.418 }, { from: '2026-12-30', to: '2027-01-03' }, 'climate'), '47.51,10.42,2026-12-30,2027-01-03,climate', 'W7 Schlüssel nur Ort und Datum');
  ok();
}
/* Klima: Durchschnitt, als solcher benannt */
{
  const plan = { from: '2026-12-30', to: '2027-01-03' };
  const yr = (y, pr, sn) => ({ year: y, data: { daily: { time: [y + '-12-30', y + '-12-31', (y + 1) + '-01-01', (y + 1) + '-01-02', (y + 1) + '-01-03'],
    temperature_2m_max: [2, 3, 4, 1, 0], temperature_2m_min: [-4, -2, -1, -6, -8], precipitation_sum: pr, snowfall_sum: sn, wind_speed_10m_max: [10, 20, 30, 15, 12] } } });
  const cl = P.normClimate([yr(2025, [0, 3, 0, 5, 0], [0, 2, 0, 0, 0]), yr(2024, [2, 0, 0, 1, 0], [1.5, 0, 0, 0, 0]), yr(2023, [0, 0, 0, 0, 0], [0, 0, 0, 0, 0])], plan);
  assert.deepEqual(cl.years, [2023, 2024, 2025]);
  assert.equal(cl.days[0].date, '2026-12-30', 'Reisedaten, nicht Archivdaten');
  assert.equal(cl.days[3].rainShare, 2 / 3);
  const g = P.weatherGroup(trip(), cl);
  assert.ok(text(g).includes('Durchschnitt, keine Vorhersage'), 'Klima ausdrücklich keine Vorhersage');
  assert.deepEqual(keys(g), ['p-w-regen', 'p-w-kalt', 'p-w-frost', 'p-w-schnee', 'p-w-ketten']);
  assert.ok(P.dayText(cl.days[3], 'climate').includes('Niederschlag in 67 % der Jahre'));
  assert.throws(() => P.normClimate([], plan), /keine Archivwerte/);
  ok();
}
/* Länder ableiten: nie geraten */
{
  const cat = { 'zell': { country: 'AT' }, 'luzern': { country: 'CH' }, 'ulm': { country: 'DE' } };
  const place = id => cat[id] || null;
  assert.deepEqual(P.tripCountries(trip({ place: 'tannheim' })).list, ['AT'], 'eingebaut Tannheimer Tal');
  assert.deepEqual(P.tripCountries(trip({ destGeo: { lat: 47, lon: 8, place: 'luzern' } }), { place }).list, ['CH']);
  assert.deepEqual(P.tripCountries(trip({ legs: [{ place: 'ulm' }, { place: 'zell' }, { place: 'zell' }] }), { place }).list, ['DE', 'AT'], 'Etappen ohne Dubletten');
  const unk = P.tripCountries(trip({ dest: 'Irgendwo' }), { place });
  assert.deepEqual([unk.list, unk.unknown], [[], true], 'freier Text ohne Ortssuche bleibt unbekannt');
  assert.deepEqual(P.tripCountries(trip({ dest: 'Rom' }), { geo: { lat: 41.9, lon: 12.5, country: 'IT' } }).list, ['IT'], 'Ortssuche auf dem Gerät');
  const f5 = P.tripCountries(trip({ countries: ['US'], place: 'tannheim' }));
  assert.deepEqual([f5.list, f5.confirmed], [['US'], true], 'Format-5-Bestätigung geht vor');
  assert.deepEqual(P.destPoint(trip({ place: 'oberjoch' })), { lat: 47.52, lon: 10.41, label: '', src: 'katalog' });
  assert.equal(P.destPoint(trip({ destGeo: { lat: 0, lon: 0 } })), null, '0/0 ist kein Ort');
  ok();
}
/* Dokumente: nur Prüfpunkte mit amtlichem Link, keine Regeln */
{
  assert.equal(P.docGroup(trip(), { list: ['DE'], unknown: false }), null, 'Inland: keine Dokumentgruppe');
  assert.equal(P.docGroup(trip(), { list: [], unknown: true }), null, 'unbekannt, Auto: nichts erfinden');
  assert.deepEqual(keys(P.docGroup(trip({ travel: 'flug' }), { list: [], unknown: true })), ['d-land'], 'Flug ohne Land: Hinweis Land festlegen');
  const at = P.docGroup(trip(), { list: ['AT'], unknown: false });
  assert.equal(at[0], 'Dokumente & Einreise: Österreich');
  assert.deepEqual(keys(at), ['d-gueltig', 'd-dokument', 'd-ehic', 'd-kv', 'd-fuehrerschein', 'd-vignette', 'd-verkehr', 'd-kopie']);
  assert.ok(at[1][0][1].includes('03.01.2027'), 'Rückkehrdatum genannt');
  assert.equal(at[1][0][4].url, P.LINKS.aa.url, 'amtliche Quelle verlinkt');
  assert.ok(!keys(at).includes('d-einreise') && !keys(at).includes('d-geld') && !keys(at).includes('d-roaming'), 'EU/Euro/EWR: kein Visum-, Währungs-, Roamingpunkt');
  const ch = P.docGroup(trip(), { list: ['CH'], unknown: false });
  assert.deepEqual(keys(ch).filter(k => ['d-einreise', 'd-impf', 'd-geld', 'd-roaming', 'd-vignette'].includes(k)), ['d-impf', 'd-geld', 'd-roaming', 'd-vignette'], 'Schweiz: Schengen ohne Visumpunkt, Franken, Roaming');
  assert.ok(text(ch).includes('Währung CHF'));
  const us = P.docGroup(trip({ travel: 'flug' }), { list: ['US'], unknown: false });
  assert.ok(keys(us).includes('d-einreise') && keys(us).includes('d-impf') && keys(us).includes('d-name'));
  assert.equal(us[1].find(i => i[0] === 'd-impf')[4].url, P.LINKS.aaHealth.url);
  const xx = P.docGroup(trip(), { list: ['ZZ'], unknown: false });
  assert.ok(keys(xx).includes('d-einreise') && text(xx).includes('Währung des Reiselands prüfen'), 'unbekanntes Land: allgemeine Prüfpunkte');
  /* keine festen Regeln: kein Punkt behauptet Visumfreiheit, Monate oder Impfpflicht */
  [at, ch, us, xx].forEach(g => g[1].forEach(i => { assert.ok(!/visumfrei|kein Visum|\d+ Monate|Pflichtimpfung/i.test(i[1] + i[2]), 'keine erfundene Regel: ' + i[1]); }));
  /* Format 5: Ausweise mit Ablaufdatum über RPV5.idDocCheck */
  const V5 = require('../v5logic.js');
  const t5 = trip({ party: [{ id: 'p1', name: 'Anna' }], idDocs: [{ id: 'd1', who: 'p1', kind: 'pass', validUntil: '2026-12-31' }] });
  const g5 = P.docGroup(t5, { list: ['AT'], unknown: false }, { idDocCheck: V5.idDocCheck, party: t5.party });
  const row = g5[1].find(i => i[0] === 'iddoc:d1');
  assert.ok(row[1] === 'Reisepass · Anna' && row[2].includes('läuft vor der Rückkehr ab'), row.join(' '));
  ok();
}
/* Passend zur Reise: Dauer, Anreise, Zielart, keine Dubletten */
{
  const g = P.fitGroup(trip({ travel: 'flug', type: 'strand', nights: 9, end: '2027-01-08' }), ['Badesachen', 'Sonnenhut'], ['baden', 'therme', 'berge'], 9);
  assert.deepEqual(keys(g), ['p-x-kleidung', 'p-x-waschmittel', 'p-x-medis', 'p-x-handgepaeck', 'p-x-akku', 'p-x-schuhe']);
  assert.equal(g[1][0][1], 'Kleidung für 10 Tage');
  assert.ok(!text(g).includes('Badesachen und'), 'Badesachen stehen schon in der Grundliste');
  const day = P.fitGroup(trip({ type: 'tag', travel: 'bahn' }), [], [], 0);
  assert.deepEqual(keys(day), ['p-x-bahn', 'p-x-tag', 'p-x-tagplan'], 'Tagesausflug ohne Kleidung/Medikamente');
  assert.deepEqual(keys(P.fitGroup(trip({ type: 'wellness' }), [], [], 2)).slice(-3), ['p-x-kultur', 'p-x-schlaf', 'p-x-sauna'], 'Reisestil Wellness');
  assert.ok(keys(P.fitGroup(trip({ type: 'familie' }), [], [], 4)).includes('p-x-kinderapo'), 'Reisestil Familie');
  ok();
}
/* Einbindung in die App: checklist(t), Gerätespeicher, Wetterkarte */
{
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  assert.ok(html.indexOf('src="packlogic.js"') > 0 && html.indexOf('src="app/packliste.js"') > 0, 'index.html lädt beide Teile');
  /* offline verfügbar: Der Service Worker liest seine Dateiliste aus index.html (docs/OFFLINE.md §4.1) */
  let code = require('./app-code.cjs')(html);
  code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
  const store = {};
  const context = {
    window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js'), RPPack: P, RPV5: require('../v5logic.js') },
    document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    setTimeout: () => 0, clearTimeout() {}, console, Date,
  };
  vm.createContext(context);
  vm.runInContext(code, context);
  const a = context.window.__app;
  const t = a.newTrip({ title: 'Tannheim', type: 'winter', travel: 'auto', place: 'tannheim', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03' });
  const before = JSON.stringify(t);
  let names = a.checklist(t).map(g => g[0]);
  assert.equal(names[0], 'Buchen & Anfragen', 'Mappe nimmt weiter Gruppe 0');
  assert.equal(names[1], 'Dokumente & Einreise: Österreich');
  assert.ok(names.includes('Packliste: passend zur Reise') && !names.includes('Packliste: wegen Wetter'), 'ohne Abruf keine Wetterpunkte');
  assert.equal(names[names.length - 1], 'Eigene Punkte');
  /* Wetter im Gerätespeicher → Gruppe erscheint, Reise bleibt unverändert */
  const plan = P.weatherPlan(t, context.wxToday());
  const wx = Object.assign(P.normForecast(fcJson), { fetchedAt: new Date().toISOString() });
  store['rp-wetter'] = JSON.stringify({ [P.cacheKey(P.BUILTIN.tannheim, plan, plan.mode)]: wx });
  names = a.checklist(t).map(g => g[0]);
  assert.ok(names.includes('Packliste: wegen Wetter'));
  assert.equal(JSON.stringify(t), before, 'Wetter wird nie in die Reise geschrieben');
  /* bestehende Häkchen bleiben an ihren Schlüsseln */
  t.check = { 'p-Skibrille': true, 'p-w-regen': true };
  const all = [].concat(...a.checklist(t).map(g => g[1])).map(i => i[0]);
  assert.ok(all.includes('p-Skibrille') && all.includes('p-w-regen'));
  /* Wetterkarte: Hinweis, Quelle, kaputter Speicher */
  vm.runInContext("UI.tab='check'", context);
  const panel = context.wxPanel(t);
  assert.ok(panel.includes('Open-Meteo') && panel.includes('CC BY 4.0') && panel.includes('Neu laden'));
  store['rp-wetter'] = '{kaputt';
  assert.ok(context.wxPanel(t).includes('Sendet nur die gerundete Lage'), 'kaputter Speicher: Karte mit Laden-Knopf statt Fehler');
  assert.ok(context.wxPanel(a.newTrip({ dateMode: 'open' })).includes('feste An- und Abreisedaten'));
  /* Checkliste rendert Links der Dokumentpunkte */
  const view = context.tCheck(t);
  assert.ok(view.includes('Wetter am Ziel') && view.includes(P.LINKS.aa.url), 'Wetterkarte und amtlicher Link in der Checkliste');
  ok();
}
console.log('Check- und Packlisten: ' + n + ' Prüfungen bestanden (Horizont W1, Adressen, W2–W7, Klima, Länder, Dokumente ohne erfundene Regeln, passend zur Reise, Einbindung). Kein Browser-/iPhone-Test, keine echte Abfrage.');
