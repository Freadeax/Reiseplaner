/* Umkreis-Katalog (Issue #7): Daten, Entfernungsregel, Bewertung, Stopps, Tagesgerüst und Übernahme in eine Reise.
   Node-Test, kein Browser- und kein Datenbanktest (Gleichlauf mit public.catalog_search prüft tests/db/supabase-api.cjs). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const C = require('../catalog.js');

const dctx = { window: {} }; vm.createContext(dctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'catalog-data.js'), 'utf8'), dctx);
const DATA = JSON.parse(JSON.stringify(dctx.window.RP_CATALOG));

/* Daten gültig und Migrationen aktuell (gleiche Prüfung wie scripts/catalog-sql.mjs --check) */
execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'catalog-sql.mjs'), '--check'], { stdio: 'pipe' });
assert(DATA.places.length >= 40, 'mindestens 40 Ziele');
const allSpots = DATA.places.flatMap(p => p.spots);
assert(allSpots.length >= 200, 'mindestens 200 Attraktionen');
for (const k of Object.keys(C.KINDS)) assert(DATA.places.some(p => p.kinds.includes(k)), 'Thema ohne Ziel: ' + k);
const countries = new Set(DATA.places.map(p => p.country));
assert(countries.size >= 5, 'Ziele in mehreren Ländern');
assert(!/€|kostenlos|gratis/i.test(fs.readFileSync(path.join(ROOT, 'catalog-data.js'), 'utf8')), 'keine Preisangaben im Katalog');

/* Haversine: bekannte Strecke Berlin–München ≈ 504 km Luftlinie */
const berlin = { lat: 52.520, lon: 13.405 }, muenchen = { lat: 48.137, lon: 11.575 };
assert(Math.abs(C.airKm(berlin, muenchen) - 504) < 3, 'Luftlinie Berlin–München');
assert.equal(C.airKm(berlin, berlin), 0);
assert.equal(C.roadKm(100), 130);
assert.equal(C.driveMin(100), 100); // 130 km bei 80 km/h ≈ 97,5 → auf 5 Minuten gerundet
assert.equal(C.durText(95), '1 Std. 35 Min.');

/* Abfrage prüfen */
assert.throws(() => C.checkQuery({ lat: 99, lon: 0, maxKm: 100 }), /Koordinaten/);
assert.throws(() => C.checkQuery({ lat: 48, lon: 9, maxKm: 0 }), /höchstens/);
assert.throws(() => C.checkQuery({ lat: 48, lon: 9, maxKm: 5000 }), /höchstens/);
assert.throws(() => C.checkQuery({ lat: 48, lon: 9, maxKm: 100, minKm: 100 }), /kleiner/);

/* Kilometerbereich: alle Treffer innerhalb [min, max] geschätzter Straßen-km, sortiert nach Luftlinie */
const goe = { lat: 48.703, lon: 9.652 }; // Göppingen
const near = C.searchLocal(DATA, { lat: goe.lat, lon: goe.lon, maxKm: 150 });
assert(near.places.length >= 3);
for (const p of near.places) assert(p.airKm * C.ROAD_FACTOR <= 150 + 0.1);
for (let i = 1; i < near.places.length; i++) assert(near.places[i].airKm >= near.places[i - 1].airKm);
assert.equal(near.places[0].id, 'bad-urach');
const far = C.searchLocal(DATA, { lat: goe.lat, lon: goe.lon, minKm: 400, maxKm: 900 });
assert(far.places.length >= 5);
for (const p of far.places) { const r = p.airKm * C.ROAD_FACTOR; assert(r >= 399.9 && r <= 900.1, p.id + ' außerhalb'); }
assert(!far.places.some(p => near.places.some(q => q.id === p.id)), 'Bereiche ohne Überschneidung');
/* Themenfilter: nur Ziele mit mindestens einem gewählten Thema */
const caves = C.searchLocal(DATA, { lat: goe.lat, lon: goe.lon, maxKm: 600, kinds: ['unterwelt'] });
assert(caves.places.length >= 3 && caves.places.every(p => p.kinds.includes('unterwelt')));
/* Ein anderer Abfahrtsort ergibt andere Ziele: Hamburg nah = Norden */
const hh = C.searchLocal(DATA, { lat: 53.551, lon: 9.994, maxKm: 200 });
assert(hh.places.some(p => p.id === 'luebeck') && !hh.places.some(p => p.id === 'bad-urach'));

/* Bewertung: Saison, Dauer, Familie, Schlechtwetter; geschlossene Ideen ausgeblendet */
const ranked = C.rank(far, { kinds: ['stadt'], month: 1, nights: 2 });
assert(ranked[0].score >= ranked[ranked.length - 1].score);
const top = ranked[0];
assert(top.place.kinds.includes('stadt'), 'Themen-Treffer zuerst');
const sbg = C.rank(C.searchLocal(DATA, { lat: 47.8, lon: 13.04, maxKm: 30 }), { month: 1 }).find(x => x.place.id === 'salzburg');
assert(sbg && !sbg.spots.some(s => s.id === 'salzburg-eisriesenwelt'), 'Eishöhle im Januar ausgeblendet');
assert(sbg.closed >= 1);
const rainy = C.rank(near, { rainy: true });
assert(rainy[0].indoor >= 1, 'Schlechtwetter bevorzugt Ziele mit Drinnen-Ideen');
/* Überrasch mich: deterministisch mit eigener Zufallsquelle, nur aus den oberen Treffern */
assert.equal(C.surprise([], () => 0), null);
assert.equal(C.surprise(ranked, () => 0).place.id, ranked[0].place.id);
assert(ranked.slice(0, Math.max(3, Math.ceil(ranked.length / 3))).includes(C.surprise(ranked, () => 0.999)));

/* Zwischenstopps: Göppingen → Berlin führt über Franken/Thüringen/Sachsen, nicht über Bodensee oder Hamburg */
const all = DATA.places.map(C.normPlace);
const berlinPlace = all.find(p => p.id === 'berlin');
const stops = C.stopsAlong(all, goe, berlinPlace);
assert(stops.length >= 3, 'Stopps gefunden');
for (const s of stops) {
  assert(s.place.id !== 'berlin' && s.detourKm <= Math.round(25 * C.ROAD_FACTOR));
  assert(!['bodensee-nord', 'hamburg', 'ruegen', 'koeln'].includes(s.place.id), 'kein Umweg-Ziel: ' + s.place.id);
}
for (let i = 1; i < stops.length; i++) assert(stops[i].fromStart >= stops[i - 1].fromStart, 'Stopps in Fahrtrichtung sortiert');
assert.deepEqual(C.stopsAlong(all, goe, all.find(p => p.id === 'bad-urach')), [], 'kurze Strecke ohne Stopps');
/* Ausflüge vom Ziel: im Umkreis, ohne eigene Attraktionen */
const nb = C.nearbyFrom(all, all.find(p => p.id === 'colmar'), 50);
assert(nb.length && nb.every(n => n.place.id !== 'colmar' && n.airKm <= 50));
assert(nb.some(n => n.place.id === 'freiburg' || n.place.id === 'strassburg'));

/* Tagesgerüst */
const sp = (id, hours, extra) => Object.assign({ id, hours, indoor: false, slot: '' }, extra);
let plan = C.dayPlan([sp('a', 2), sp('b', 2), sp('c', 2), sp('d', 2)], 0);
assert.equal(plan.length, 2, 'Tagesausflug: Vormittag und Nachmittag, der Abend bleibt für Abend-Ideen');
assert(!plan.some(i => i.slot === 'abend'));
assert(plan.every(i => i.day === 0));
plan = C.dayPlan([sp('lang', 5), sp('kurz', 1), sp('drin', 2, { indoor: true }), sp('abend', 1, { slot: 'abend' })], 2);
const at = id => plan.find(i => i.spotId === id);
assert.equal(at('lang').slot, 'morgen'); assert.notEqual(at('lang').day, 0, 'ganztägige Tour nicht am Anreisetag'); assert.notEqual(at('lang').day, 2);
assert(!plan.some(i => i.day === 0 && i.slot === 'morgen'), 'Anreisetag erst ab Nachmittag');
assert(!plan.some(i => i.day === 2 && i.slot !== 'morgen'), 'Abreisetag nur vormittags');
assert.equal(at('abend').slot, 'abend');
assert.equal(at('drin').slot, 'nachm');
const keys = plan.map(i => i.day + i.slot); assert.equal(new Set(keys).size, keys.length, 'keine Doppelbelegung');
assert.equal(plan.find(i => i.spotId === 'lang' && i.day === at('lang').day && i.slot === 'nachm'), undefined);
assert(!plan.some(i => i.day === at('lang').day && i.slot === 'nachm'), 'Nachmittag nach ganztägiger Tour frei');

/* Übernahme als Unternehmung: Preis offen, Kartenlink, Herkunft */
let n = 0; const fakeUid = p => p + 'x' + (++n);
const act = C.toAct(DATA.places[0].spots[0], DATA.places[0], fakeUid);
assert(act.custom && act.costOpen === true && act.cost === 0 && act.catalogSpot === DATA.places[0].spots[0].id && act.map);
assert(/prüfen/.test(act.note));
assert.equal(C.toAct(Object.assign({}, DATA.places[0].spots[0], { kind: 'therme' }), DATA.places[0], fakeUid).cat, 'wellness');

/* v3.2: Packhinweise, Dauer aus Text, Rundreise, Nächte, Textsuche, Sortierung, Karte, Tageskapazität, Lücken */
assert.deepEqual(C.bringFor('unterwelt').length, 2); assert(C.bringFor('therme').some(x => /Badesachen/.test(x)));
assert.deepEqual(C.bringFor('gibtsnicht'), []);
const act2 = C.toAct(Object.assign({}, DATA.places[0].spots[0], { kind: 'unterwelt' }), DATA.places[0], fakeUid);
assert(act2.bring.some(x => /Jacke/.test(x)) && act2.hours === DATA.places[0].spots[0].hours);
assert.equal(C.parseHours('ca. 2,5 Std.'), 2.5); assert.equal(C.parseHours('90 Min.'), 1.5); assert.equal(C.parseHours('1 Std. 30 Min.'), 1.5);
assert.equal(C.parseHours('3 Std.'), 3); assert.equal(C.parseHours('abends'), null); assert.equal(C.parseHours(null), null);
{ /* Rundreise: kürzeste Reihenfolge, Heimfahrt, Nächte */
  const pts = ['berlin', 'dresden', 'prag', 'leipzig'].map(id => all.find(p => p.id === id));
  const r = C.roundTrip(goe, pts);
  assert.equal(r.order.length, 4); assert.equal(r.legs.length, 5, 'Etappen plus Heimfahrt');
  assert.equal(r.legs[r.legs.length - 1].to, goe);
  assert.equal(r.roadKm, r.legs.reduce((s, l) => s + l.roadKm, 0));
  const perm = a => a.length < 2 ? [a] : a.flatMap((x, i) => perm(a.slice(0, i).concat(a.slice(i + 1))).map(q => [x].concat(q)));
  const len = o => { let s = 0, c = goe; o.forEach(p => { s += C.airKm(c, p); c = p; }); return s + C.airKm(c, goe); };
  const best = Math.min(...perm(pts).map(len));
  assert(Math.abs(len(r.order) - best) < 0.5, 'Reihenfolge ist die kürzeste (4 Ziele, alle Varianten geprüft)');
  const n = C.splitNights(r.order, 7); assert.equal(n.reduce((a, b) => a + b, 0), 7); assert(n.every(x => x >= 1));
  assert.deepEqual(C.splitNights(r.order, 2), [1, 1, 1, 1], 'mindestens eine Nacht je Ziel');
}
{ /* Textsuche über Ziel und Attraktionen, mehrere Wörter = alle */
  const harz = all.find(p => p.id === 'harz');
  assert(C.textMatch(harz, 'Brocken')); assert(C.textMatch(harz, 'hängebrücke wernigerode')); assert(!C.textMatch(harz, 'Brocken Eiffelturm')); assert(C.textMatch(harz, '  '));
  const rk = C.rank(far, {});
  const nah = C.sortRanked(rk, 'nah'), weit = C.sortRanked(rk, 'weit');
  assert(nah[0].place.airKm <= nah[nah.length - 1].place.airKm && weit[0].place.airKm >= weit[weit.length - 1].place.airKm);
  assert.equal(C.sortRanked(rk, 'passend')[0], rk[0]);
}
{ /* Karte: Start in der Mitte, alles im Bild, Norden oben */
  const L = C.mapLayout(goe, far.places, 340, 230);
  assert.deepEqual(L.origin, { x: 170, y: 115 });
  assert(L.points.every(q => q.x >= 0 && q.x <= 340 && q.y >= 0 && q.y <= 230), 'alle Punkte im Bild');
  const hamburg = L.points.find(q => q.id === 'hamburg'); if (hamburg) assert(hamburg.y < 115, 'Norden oben');
  assert(L.rings.length >= 1);
}
assert.equal(C.dayCapacity(0, 3, 120), 8); assert.equal(C.dayCapacity(1, 3, 120), 10); assert.equal(C.dayCapacity(0, 1, 60), 8);
{ /* Lücken füllen: belegte Felder bleiben frei, Bereich je Etappe */
  const sp3 = [sp('x1', 2), sp('x2', 2), sp('x3', 2)];
  const p1 = C.dayPlan(sp3, 2, ['1|morgen', '1|nachm']);
  assert(!p1.some(i => i.day === 1 && (i.slot === 'morgen' || i.slot === 'nachm')), 'belegte Felder bleiben unberührt');
  const p2 = C.dayPlan(sp3, 4, [], { from: 2, to: 3 });
  assert(p2.length && p2.every(i => i.day >= 2 && i.day <= 3), 'nur Tage der Etappe');
}
assert(DATA.places.length >= 80 && countries.size >= 10, 'Katalog v2: mehr Ziele und Länder');
{ /* Kombi-Tagesideen: Highlight + ruhige Ergänzung, kurzer Weg, höchstens 7 Std., Saison/Kinder beachtet */
  const mu = all.find(p => p.id === 'muenchen');
  const cs = C.combos(mu, {});
  assert(cs.length >= 1 && cs.length <= 3);
  for (const x of cs) { assert(x.airKm <= 15 && x.hours <= 7 && x.highlight.hours <= 5 && x.highlight.id !== x.calm.id); assert(C.COMBOS.some(c => c[0] === x.highlight.kind && c[1] === x.calm.kind && c[2] === x.label)); }
  assert.equal(new Set(cs.map(x => x.highlight.id)).size, cs.length, 'jedes Highlight nur einmal');
  const sbg2 = all.find(p => p.id === 'salzburg');
  assert(!C.combos(sbg2, { month: 1 }).some(x => x.highlight.id === 'salzburg-hellbrunn' || x.calm.id === 'salzburg-hellbrunn'), 'geschlossene Saison nicht kombiniert');
  assert(C.combos(mu, { family: true }).every(x => x.highlight.family && x.calm.family));
  assert(all.filter(p => C.combos(p, {}).length).length >= 50, 'Kombis für die meisten Ziele');
}
{ /* Ähnliche Ziele und Direktsuche */
  const harz = all.find(p => p.id === 'harz');
  const sim = C.similar(harz, all, { origin: goe });
  assert(sim.length >= 1 && sim.length <= 4 && sim.every(x => x.place.id !== 'harz' && x.shared.length >= 2 && x.airKm > 0));
  for (let i = 1; i < sim.length; i++) assert(sim[i - 1].score >= sim[i].score);
  assert.equal(C.findPlaces(all, 'w').length, 0, 'mindestens 2 Zeichen');
  assert.equal(C.findPlaces(all, 'Wachau')[0].id, 'wachau');
  assert(C.findPlaces(all, 'salzbergwerk').some(p => p.id === 'krakau'), 'Suche über Attraktionen');
  const br = C.findPlaces(all, 'Bre'); assert(br[0].name.toLowerCase().startsWith('bre'), 'Namensanfang zuerst');
}
{ /* Zielvergleich: gleiche Zeilen für alle Spalten, Monat optional, ohne Start „Abfahrtsort fehlt“ */
  const rk = C.rank(C.searchLocal(DATA, { lat: goe.lat, lon: goe.lon, maxKm: 400 }), {}).slice(0, 3);
  const rows = C.compareRows(rk, { month: 7 });
  assert(rows.every(r => r.values.length === 3));
  assert(rows.some(r => r.label === 'Im Juli') && rows.find(r => r.label === 'Im Juli').values.every(v => /gute Reisezeit|Nebensaison|unbekannt/.test(v)));
  assert(rows.find(r => r.label === 'Entfernung (geschätzt)').values.every(v => /^≈ \d+ km/.test(v)));
  assert(!rows.some(r => /€|preis/i.test(r.label + r.values.join(''))), 'keine Preise');
  const noOrigin = C.compareRows([{ place: rk[0].place, roadKm: null, minutes: null, spots: rk[0].spots }], {});
  assert.equal(noOrigin[0].values[0], 'Abfahrtsort fehlt'); assert(!noOrigin.some(r => /^Im /.test(r.label)));
}
{ /* Weg im Nahbereich: 10 km Luftlinie = 13 km bei 50 km/h ≈ 15,6 + 10 Min. → 25 Min.; gleicher Ort 10 Min.; ungültig null */
  assert.equal(C.localTransferMin({ lat: 48, lon: 9 }, { lat: 48 + 10 / 111.2, lon: 9 }), 25);
  assert.equal(C.localTransferMin({ lat: 48, lon: 9 }, { lat: 48, lon: 9 }), 10);
  assert.equal(C.localTransferMin({ lat: 48, lon: 9 }, null), null);
  const ac = C.toAct(DATA.places[0].spots[0], DATA.places[0], fakeUid);
  assert.deepEqual(ac.geo, { lat: DATA.places[0].spots[0].lat, lon: DATA.places[0].spots[0].lon }, 'Lage wird mitgespeichert');
}
{ /* Routing-URL und Antwort (Format wie routing.openstreetmap.de, am 15.10.2026 geprüft) */
  const u = C.routeUrl([{ lat: 48.703, lon: 9.652 }, { lat: 48.491, lon: 9.399 }]);
  assert.equal(u, 'https://routing.openstreetmap.de/routed-car/route/v1/driving/9.65200,48.70300;9.39900,48.49100?overview=false');
  assert.throws(() => C.routeUrl([{ lat: 48, lon: 9 }]), /2 bis 25/);
  assert.throws(() => C.routeUrl([{ lat: 99, lon: 9 }, { lat: 48, lon: 9 }]), /gültige/);
  const r = C.parseRoute({ code: 'Ok', routes: [{ distance: 79070.1, duration: 5132.5, legs: [{ distance: 43209, duration: 3052.5 }, { distance: 35861.1, duration: 2080 }] }] });
  assert.deepEqual(r, { km: 79, minutes: 85, legs: [{ km: 43, minutes: 50 }, { km: 36, minutes: 35 }] });
  assert.throws(() => C.parseRoute({ code: 'NoRoute', message: 'Impossible route' }), /Keine Route.*Impossible/);
}
{ /* Regenzwilling: nächste Drinnen-Idee, nicht sie selbst, Saison und Ausschluss beachtet */
  const fall = C.findSpot(all, 'bad-urach-wasserfall');
  assert.equal(fall.place.id, 'bad-urach');
  const tw = C.rainTwins(fall.spot, all, {});
  assert(tw.length >= 1 && tw.every(x => x.spot.indoor && x.airKm <= 30), 'nur Drinnen-Ideen im Umkreis');
  assert.equal(tw[0].spot.id, 'bad-urach-albthermen', 'nächste zuerst');
  assert(!C.rainTwins(fall.spot, all, { exclude: { 'bad-urach-albthermen': true } }).some(x => x.spot.id === 'bad-urach-albthermen'));
  assert(!C.rainTwins(fall.spot, all, { month: 1 }).some(x => x.spot.id === 'bad-urach-baerenhoehle'), 'Bärenhöhle im Januar nicht');
  assert.equal(C.findSpot(all, 'gibt-es-nicht'), null);
}

/* App: Übernahme in eine Reise, Kosten „Preis offen“, Plan-Check, Sicherung bleibt gültig */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const win = { addEventListener() {}, RPCatalog: C, RP_CATALOG: DATA };
const ctx = { window: win, document: { addEventListener() {}, querySelector() { return null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, head: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, console, navigator: {} };
vm.createContext(ctx); vm.runInContext(code, ctx);
const a = win.__app;
(async () => {
  const r = await a.catalogQuery({ lat: goe.lat, lon: goe.lon, maxKm: 150, minKm: 0 });
  assert.equal(r.source, 'lokal', 'ohne Datenbank: Offline-Kopie');
  assert.deepEqual(r.places.map(p => p.id), near.places.map(p => p.id));
  const x = C.rank(r, {})[0], p = x.place;
  const t = a.newTrip({ nights: 2, origin: 'Göppingen', km: x.roadKm, kmSrc: 'schaetzung', destGeo: { lat: p.lat, lon: p.lon, place: p.id, v: 1 } });
  const picked = x.spots.slice(0, 3).map(s => ({ spot: s, place: p, kind: 'dest' }));
  const nb2 = C.nearbyFrom(all, p, 50)[0];
  picked.push({ spot: nb2.spot, place: nb2.place, kind: 'near', roadKm: nb2.roadKm });
  const res = a.catApply(t, picked, 2);
  assert.equal(res.acts, 4); assert.equal(t.customActs.length, 4);
  assert(res.planned >= 3, 'Ideen eingeplant');
  assert(t.items.every(i => t.customActs.some(c => c.id === i.act)), 'Tagesplan zeigt nur übernommene Ideen');
  const nearAct = t.customActs.find(c => c.catalogSpot === nb2.spot.id);
  assert.equal(nearAct.km, nb2.roadKm * 2, 'Ausflug vom Ziel: Hin- und Rückweg als Zusatz-km');
  const c0 = t.customActs[0];
  assert.equal(a.actCost(t, c0).txt, 'Preis offen, vor Ort prüfen');
  assert.equal(a.actCost(t, c0).free, false, 'offener Preis ist nicht kostenlos');
  const oc = a.openCosts(t).join(' | ');
  assert(/ohne Preis/.test(oc), 'Plan-Check meldet offene Preise');
  assert(/Fahrstrecke geschätzt/.test(oc), 'Plan-Check meldet geschätzte Fahrstrecke');
  /* geschätzte km fließen in die Anreisekosten ein */
  const anreise = a.cost(t).lines.filter(l => l.cat === 'anreise').reduce((s, l) => s + l.c, 0);
  assert(anreise > 0);
  /* Eigener Preis ersetzt „offen“ */
  c0.cost = 12; c0.costOpen = false;
  assert(/12/.test(a.actCost(t, c0).txt));
  /* Sicherung: neue Felder sind gültig, Unsinn wird abgelehnt */
  t.id = 'tcat1'; t.title = 'Katalogreise';
  const backup = { format: 'reiseplaner-backup', version: 2, trips: [JSON.parse(JSON.stringify(t))] };
  assert.equal(a.validateBackup(backup)[0].destGeo.place, p.id);
  const bad = JSON.parse(JSON.stringify(backup)); bad.trips[0].kmSrc = 'geraten';
  assert.throws(() => a.validateBackup(bad), /Fahrstrecke/);
  const bad2 = JSON.parse(JSON.stringify(backup)); bad2.trips[0].customActs[0].costOpen = 'ja';
  assert.throws(() => a.validateBackup(bad2), /Unternehmung/);
  const bad3 = JSON.parse(JSON.stringify(backup)); bad3.trips[0].destGeo = { lat: 200, lon: 0 };
  assert.throws(() => a.validateBackup(bad3), /Zielkoordinaten/);
  /* Reiseart */
  assert.equal(a.catTripType(all.find(q => q.id === 'berlin'), 0, ''), 'tag');
  assert.equal(a.catTripType(all.find(q => q.id === 'zillertal'), 5, '1'), 'winter');
  assert.equal(a.catTripType(all.find(q => q.id === 'berlin'), 3, ''), 'stadt');
  assert.equal(a.catTripType(all.find(q => q.id === 'harz'), 2, ''), 'wochenende');
  /* Datenbank-Antwort wird gleich behandelt; leerer Datenbank-Katalog fällt auf die Offline-Kopie zurück */
  win.RPCloud = { enabled: () => true, catalogSearch: async () => ({ version: 0, places: [] }) };
  const fb = await a.catalogQuery({ lat: goe.lat, lon: goe.lon, maxKm: 150 });
  assert.equal(fb.source, 'lokal'); assert(/leer/.test(fb.dbErr));
  win.RPCloud = { enabled: () => true, catalogSearch: async () => { throw new Error('PGRST202'); } };
  assert.equal((await a.catalogQuery({ lat: goe.lat, lon: goe.lon, maxKm: 150 })).source, 'lokal');
  const dbLike = { version: 1, places: near.places.map(q => Object.assign({}, q, { air_km: q.airKm, nights_min: q.nights[0], nights_max: q.nights[1], nights: undefined, airKm: undefined })) };
  win.RPCloud = { enabled: () => true, catalogSearch: async () => dbLike };
  const db = await a.catalogQuery({ lat: goe.lat, lon: goe.lon, maxKm: 150 });
  assert.equal(db.source, 'db');
  assert.deepEqual(db.places.map(q => [q.id, q.airKm, q.nights.join('-')]), near.places.map(q => [q.id, q.airKm, q.nights.join('-')]));
  console.log('Umkreis-Katalog: ' + DATA.places.length + ' Ziele/' + allSpots.length + ' Attraktionen gültig, Migration aktuell, Kilometerbereich, Themen, Saison, Stopps, Ausflüge, Tagesgerüst, Übernahme mit offenem Preis, Plan-Check, Sicherung und Datenbank-Rückfall geprüft.');
})().catch(e => { console.error(e); process.exit(1); });
