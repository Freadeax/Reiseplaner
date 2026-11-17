/* Reisestil (docs/REISESTIL.md): Stil aus t.type, Tempo, leise Teile, Startteil, Bereichsnamen, Hinweise, Vorlagen.
   Node-Test mit der ganzen App im vm-Kontext. Kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(html.indexOf('app/reisestil.js') > html.indexOf('app/kosten.js') && html.indexOf('app/reisestil.js') < html.indexOf('app/aufbau.js'), 'Ladereihenfolge: nach kosten.js, vor aufbau.js');
let code = require('./app-code.cjs')(html);
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const stored = new Map();
const win = { addEventListener() {} };
const ctx = { window: win, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, head: { appendChild() {} } },
  localStorage: { getItem(k) { return stored.has(k) ? stored.get(k) : null; }, setItem(k, v) { stored.set(k, String(v)); } }, setTimeout, clearTimeout, console, navigator: {} };
vm.createContext(ctx); vm.runInContext(code, ctx);
const a = win.__app, g = name => vm.runInContext(name, ctx);
const styleOf = g('styleOf'), stilTeile = g('stilTeile'), stilLeise = g('stilLeise'), stilSchritte = g('stilSchritte'), aufbauZiel = g('aufbauZiel'), aufbauTeile = g('aufbauTeile'), aufbauLeiste = g('aufbauLeiste');
const TYPES = g('TYPES'), STILE = g('STILE'), naechstes = g('naechstes'), stilAlleSetzen = g('stilAlleSetzen'), stilAusProfil = g('stilAusProfil');
const now = new Date('2026-11-16T10:00:00Z');

/* Jeder Stil ist in der Art-Auswahl, jede Art hat einen Stil */
assert.deepEqual(Object.keys(TYPES).sort(), Object.keys(STILE).sort());
assert.equal(TYPES.wellness, 'Wellness-Auszeit'); assert.equal(TYPES.familie, 'Familienurlaub'); assert.equal(TYPES.rund, 'Rundreise & Roadtrip');

/* styleOf: Stil aus t.type, unbekannt wie Wochenende; Tempo aus t.pace (gemischt = normal), sonst Stilvorgabe */
assert.deepEqual(JSON.parse(JSON.stringify(styleOf(a.newTrip({ type: 'wellness' })))), { key: 'wellness', label: 'Wellness-Auszeit', kurz: STILE.wellness.kurz, pace: 'ruhig', paceSrc: 'stil' });
assert.equal(styleOf(a.newTrip({ type: 'stadt' })).pace, 'normal', 'aktiv nur als eigene Wahl');
assert.equal(styleOf(a.newTrip({ type: 'xyz' })).key, 'wochenende');
assert.equal(styleOf(null).key, 'wochenende');
assert.equal(styleOf(a.newTrip({ type: 'familie', pace: 'aktiv' })).pace, 'aktiv');
assert.equal(styleOf(a.newTrip({ type: 'familie', pace: 'aktiv' })).paceSrc, 'reise');
assert.equal(styleOf(a.newTrip({ type: 'stadt', pace: 'gemischt' })).pace, 'normal');
assert.equal(styleOf(a.newTrip({ type: 'familie', pace: 'quatsch' })).pace, 'ruhig', 'ungültiges Tempo fällt auf den Stil zurück');

/* Leise Teile: Tagesausflug ohne Angebotsvergleich; Pakete nur mit Katalog; Inhalt oder geöffneter Teil bleibt sichtbar */
const tag = a.newTrip({ type: 'tag', nights: 0 });
assert.deepEqual([...stilLeise(tag)].sort(), ['angebote', 'suche']);
assert.deepEqual([...stilTeile(tag, ['unterkunft', 'suche', 'angebote'], 'unterkunft')], ['unterkunft']);
assert.deepEqual([...stilTeile(tag, ['unterkunft', 'suche', 'angebote'], 'suche')], ['unterkunft', 'suche'], 'geöffneter Teil bleibt sichtbar');
const tagMitAngebot = Object.assign(a.newTrip({ type: 'tag', nights: 0 }), { offers: [{ id: 'o1' }] });
assert(stilTeile(tagMitAngebot, ['unterkunft', 'suche', 'angebote'], 'unterkunft').includes('suche'), 'Teil mit Inhalt bleibt sichtbar');
const winter = a.newTrip({ type: 'winter', catalog: 'allgaeu' });
assert.deepEqual([...stilLeise(winter)], [], 'Paket-Katalog: Pakete sichtbar');
assert.deepEqual([...stilLeise(a.newTrip({ type: 'stadt' }))], ['angebote']);
assert.deepEqual([...stilLeise(a.newTrip({ type: 'stadt', packageId: 'x' }))], [], 'übernommenes Paket bleibt sichtbar');

/* Teilleiste: Tagesausflug im Bereich Ziel ohne Leiste (nur ein Teil), Name angepasst; „Alle Teile zeigen“ holt alles zurück */
tag.id = 'tTag';
assert.equal(aufbauTeile(tag, 'unterkunft'), '', 'nur ein sichtbarer Teil: keine Teilleiste');
assert(aufbauLeiste(tag, 'ueber').includes('Ziel &amp; Anreise'));
assert(!aufbauLeiste(a.newTrip({ type: 'stadt' }), 'ueber').includes('Ziel &amp; Anreise'));
assert(aufbauTeile(tag, 'angebote').includes('data-seg="angebote"'), 'geöffneter leiser Teil bleibt erreichbar');
stilAlleSetzen(true);
assert.equal(stored.get('rp-stil'), '{"alle":true}');
assert.equal((aufbauTeile(tag, 'unterkunft').match(/data-seg=/g) || []).length, 2);
stilAlleSetzen(false);
assert.equal((aufbauTeile(tag, 'unterkunft').match(/data-seg=/g) || []).length, 0);
/* Rundreise: Bereichsname */
assert(aufbauLeiste(Object.assign(a.newTrip({ type: 'rund' }), { id: 'tR' }), 'ueber').includes('Route &amp; Unterkünfte'));

/* Startteil: Städtetrip öffnet Programm bei den Ideen, auch mit Terminen; andere wie bisher */
const stadt = Object.assign(a.newTrip({ type: 'stadt' }), { id: 'tStadt', items: [{ uid: 'u', act: 'x', day: 0, slot: 'morgen' }] });
assert.equal(aufbauZiel(stadt, 'programm'), 'unternehmen');
const wochenende = Object.assign(a.newTrip({ type: 'wochenende' }), { id: 'tW', items: [{ uid: 'u', act: 'x', day: 0, slot: 'morgen' }] });
assert.equal(aufbauZiel(wochenende, 'programm'), 'plan');

/* Hinweise: Rundreise */
const rund = a.newTrip({ type: 'rund', nights: 4 }), before = JSON.stringify(rund);
assert.deepEqual(stilSchritte(rund, now).map(x => x.id), ['stil:etappen']);
assert.equal(JSON.stringify(rund), before, 'reine Ableitung');
rund.legs = [{ name: 'Lyon', lat: 45.7, lon: 4.8, nights: 2, roadKm: 600 }, { name: 'Annecy', lat: 45.9, lon: 6.1, nights: 1, roadKm: 140 }];
const rs = stilSchritte(rund, now);
const widerspruch = rs.find(x => x.id === 'stil:etappen-naechte');
assert(widerspruch && widerspruch.level === 'warn' && /3 Nächte/.test(widerspruch.reason) && /die Reise hat 4/.test(widerspruch.reason));
assert(rs.some(x => x.id === 'stil:etappe-lang' && /Lyon/.test(x.title)), '600 km ≈ 7,5 Std.: lange Etappe');
rund.legs[1].nights = 2; rund.legs[0].roadKm = 300;
assert.deepEqual(stilSchritte(rund, now).map(x => x.id), [], 'Nächte stimmen, Etappen kurz');
/* in „Als Nächstes“ eingereiht, Warnung vor normalen Hinweisen */
rund.legs[1].nights = 5;
const nx = naechstes(Object.assign(rund, { id: 'tRund' }), now);
assert(nx.some(x => x.id === 'stil:etappen-naechte' && x.level === 'warn'));

/* Tagesausflug: viel Fahrzeit */
const weit = a.newTrip({ type: 'tag', nights: 0, km: 200 });
assert(stilSchritte(weit, now).some(x => x.id === 'stil:fahrzeit' && x.action === 'edit-trip'), '2 × 150 Min. > 4 Std.');
assert.deepEqual(stilSchritte(a.newTrip({ type: 'tag', nights: 0, km: 100 }), now).map(x => x.id), []);

/* Familie: Pause, Regenidee, Ermäßigung */
const fam = a.newTrip({ type: 'familie', km: 250 });
fam.customActs = [a.customActFromForm({ title: 'Zoo', cat: 'eigen', cost: '20', hours: '3', per: 'pp' }, 'cz')];
fam.items = [{ uid: 'u1', act: 'cz', day: 0, slot: 'morgen' }];
const fs1 = stilSchritte(fam, now).map(x => x.id);
assert.deepEqual(fs1.sort(), ['stil:ermaessigung', 'stil:pause', 'stil:regen']);
fam.customActs[0].indoor = true; fam.km = 100;
assert.deepEqual(stilSchritte(fam, now).map(x => x.id), ['stil:ermaessigung']);

/* Städtetrip mit Auto: Parken; Wellness mit Unterkunft und festen Daten: Spa-Termine */
assert(stilSchritte(a.newTrip({ type: 'stadt', travel: 'auto' }), now).some(x => x.id === 'stil:parken'));
assert(!stilSchritte(a.newTrip({ type: 'stadt', travel: 'bahn' }), now).some(x => x.id === 'stil:parken'));
const well = a.newTrip({ type: 'wellness', dateMode: 'fix', start: '2027-01-08', end: '2027-01-10', stayId: 'cs1', customStays: [{ id: 'cs1', name: 'Haus', custom: true, plan: 100 }] });
assert(stilSchritte(well, now).some(x => x.id === 'stil:spa'));
/* Hinweise haben die Form von „Als Nächstes“ */
for (const x of stilSchritte(fam, now).concat(stilSchritte(weit, now))) assert(['warn', 'info'].includes(x.level) && x.title && typeof x.rank === 'number' && x.label);

/* Vorlagen: Wellness legt den Stil an, Familienurlaub neu und gültig exportierbar, Silvester bleibt letztes Beispiel */
const tpl = id => a.TEMPLATES.find(x => x.id === id);
assert.equal(tpl('wellness').make().type, 'wellness');
const f = tpl('familie').make();
assert.equal(f.type, 'familie'); assert.equal(f.persons, 4); assert.equal(f.nights, 7); assert(f.customChecks.length >= 5);
assert.equal(a.validateBackup(a.backupData([f])).length, 1);
assert.equal(a.TEMPLATES[a.TEMPLATES.length - 1].id, 'silvester');
assert(g('TEMPLATE_GROUPS').find(x => x.id === 'urlaub').ids.includes('familie'));

/* Darstellung: Hinweis unter „Art“, Abschnitt im Überblick, maskiert, ohne Reiseänderung */
const hin = g('stilHinweis')(tag);
assert(hin.includes('So richtet sich der Planer ein') && hin.includes('Alles bleibt änderbar'));
const blk = g('stilBlock')(Object.assign(tag, { id: 'tTag' }));
assert(blk.includes('data-fold="stil"') && blk.includes('data-go="r-tTag-suche"') && blk.includes('data-stil-alle'));
assert(blk.includes('nie Kosten, Termine oder Buchungen'));

/* Entdecken: Profil mit Kindern und Übernachtung → Familie; Therme kurz → Wellness; sonst offen */
assert.equal(stilAusProfil({ party: 'familie', kinds: {} }, 3), 'familie');
assert.equal(stilAusProfil({ party: 'familie', kinds: {} }, 0), null, 'Tagesausflug bleibt Tagesausflug');
assert.equal(stilAusProfil({ kinds: { therme: 'must' } }, 2), 'wellness');
assert.equal(stilAusProfil({ kinds: { therme: 'like' }, pace: 'ruhig' }, 2), 'wellness');
assert.equal(stilAusProfil({ kinds: { therme: 'like' } }, 2), null);
assert.equal(stilAusProfil({ kinds: { therme: 'must' } }, 6), null);

/* Kosten unabhängig vom Stil */
const base = a.silvesterTemplate(), c0 = a.cost(base).total;
for (const k of Object.keys(STILE)) { const x = JSON.parse(JSON.stringify(base)); x.type = k; if (k !== 'tag') assert.equal(a.cost(x).total, c0, k + ': gleiche Kosten'); }

/* Eigene Stile Camping, Aktivurlaub, Fernreise (Philipp 16.11.) */
assert.equal(TYPES.camping, 'Camping'); assert.equal(TYPES.aktivurlaub, 'Aktivurlaub'); assert.equal(TYPES.fernreise, 'Fernreise');
assert.equal(tpl('camping').make().type, 'camping'); assert.equal(tpl('aktiv').make().type, 'aktivurlaub'); assert.equal(tpl('fernreise').make().type, 'fernreise');
for (const id of ['camping', 'aktiv', 'fernreise']) assert.equal(a.validateBackup(a.backupData([tpl(id).make()])).length, 1, id + ': gültig exportierbar');
assert(aufbauLeiste(Object.assign(a.newTrip({ type: 'camping' }), { id: 'tC' }), 'ueber').includes('Platz &amp; Anreise'));
assert(aufbauLeiste(Object.assign(a.newTrip({ type: 'aktivurlaub' }), { id: 'tA' }), 'ueber').includes('Touren &amp; Programm'));
const camp = a.newTrip({ type: 'camping', dateMode: 'fix', start: '2027-01-08', end: '2027-01-11', stayId: 'cs1', customStays: [{ id: 'cs1', name: 'Platz', custom: true, plan: 30 }] });
assert.deepEqual(stilSchritte(camp, now).map(x => x.id).sort(), ['stil:platzregeln', 'stil:wintercamping']);
const campSommer = Object.assign(JSON.parse(JSON.stringify(camp)), { start: '2027-07-08', end: '2027-07-11' });
assert.deepEqual(stilSchritte(campSommer, now).map(x => x.id), ['stil:platzregeln']);
const akt = a.newTrip({ type: 'aktivurlaub', dateMode: 'fix', start: '2027-06-01', end: '2027-06-06' });
akt.customActs = [a.customActFromForm({ title: 'Tour', cat: 'eigen', cost: '', hours: '5', per: 'pp' }, 'ct')];
akt.items = [1, 2, 3, 4].map(d => ({ uid: 'u' + d, act: 'ct', day: d, slot: 'morgen' }));
assert.deepEqual(stilSchritte(akt, now).map(x => x.id).sort(), ['stil:ruhetag', 'stil:tourwetter']);
akt.items = akt.items.filter(i => i.day !== 3);
assert.deepEqual(stilSchritte(akt, now).map(x => x.id), ['stil:tourwetter'], 'ein freier Tag reicht');
const fern = a.newTrip({ type: 'fernreise', travel: 'flug', tz: '' });
assert.deepEqual(stilSchritte(fern, now).map(x => x.id), ['stil:zeitzone']);
fern.tz = 'Asia/Bangkok'; fern.customActs = akt.customActs; fern.items = [{ uid: 'a', act: 'ct', day: 0, slot: 'nachm' }, { uid: 'b', act: 'ct', day: 0, slot: 'abend' }];
assert.deepEqual(stilSchritte(fern, now).map(x => x.id), ['stil:ankunftstag']);
assert.equal(stilAusProfil({ kinds: { aktiv: 'must' } }, 3), 'aktivurlaub');
assert.equal(stilAusProfil({ kinds: { aktiv: 'must' } }, 0), null);

const stilDauer = g('stilDauer');
assert.equal(stilDauer(300), '5 Std.'); assert.equal(stilDauer(75), '1 Std. 15 Min.'); assert.equal(stilDauer(40), '40 Min.');
assert(stilSchritte(weit, now).find(x => x.id === 'stil:fahrzeit').reason.includes('5 Std.'));
console.log('reisestil: ok');
