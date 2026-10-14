/* Tagesplan v3.2 (Issue #8): Auslastung je Tag mit Fahrzeit, Plan-Check, Tage tauschen mit Buchungsschutz,
   Tagesroute, Rundreise-Etappen, Packhinweise und Sicherungsprüfung. Node-Test, kein Browsertest. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const C = require('../catalog.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const win = { addEventListener() {}, RPCatalog: C };
const ctx = { window: win, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, head: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, console, navigator: {} };
vm.createContext(ctx); vm.runInContext(code, ctx);
const a = win.__app;

/* Eigene Ideen: Preis und Dauer bleiben unbekannt bis zur ausdrücklichen Angabe. */
{
  const form = { title: 'Eigenes Museum', cat: 'eigen', per: 'pp', cost: '', hours: '', link: '', note: '' };
  const idea = a.customActFromForm(form, 'cmanual');
  assert(idea.costOpen && idea.cost === 0);
  assert.equal(a.actHours(idea), null);
  assert.equal(a.actCost(a.newTrip(), idea).free, false);
  const indoor = a.customActFromForm({ ...form, cost: '6.5', hours: '1.5', indoor: true, bring: 'Handtuch\n\nJacke\nHandtuch' }, 'cindoor');
  assert.equal(indoor.hours, 1.5);
  assert.equal(indoor.cost, 6.5);
  assert.equal(indoor.costOpen, false);
  assert.deepEqual(Array.from(indoor.bring), ['Handtuch', 'Jacke']);
  const free = a.customActFromForm({ ...form, free: true }, 'cfree');
  assert.equal(free.costOpen, false);
  assert(a.actCost(a.newTrip(), free).free);
  for (const change of [{ cost: '-1' }, { cost: 'abc' }, { cost: '0' }, { hours: '-2' }, { hours: '0' }, { hours: '25' }, { free: true, cost: '9' }, { link: 'javascript:alert(1)' }, { bring: 'x'.repeat(81) }, { bring: Array(11).fill('x').join('\n') }]) {
    assert.throws(() => a.customActFromForm({ ...form, ...change }, 'cbad'));
  }
  const own = a.newTrip({ nights: 2, catalog: 'none' });
  own.customActs = [idea, indoor]; own.items = [{ uid: 'manual1', act: idea.id, day: 1, slot: 'morgen' }, { uid: 'manual2', act: indoor.id, day: 1, slot: 'nachm' }];
  assert(a.openCosts(own).some(x => x.includes('Eigenes Museum')));
  assert.equal(a.dayLoad(own)[1].unknown, 1);
  assert.equal(a.dayLoad(own)[1].planned, 1.5);
  assert(a.rainIdeas(own, 0).some(x => x.id === indoor.id));
  assert(a.checklist(own).some(g => g[1].some(x => /Handtuch/.test(x[1]))));
  assert.equal(a.validateBackup({ format: 'reiseplaner-backup', version: 2, trips: [JSON.parse(JSON.stringify(own))] })[0].customActs[1].hours, 1.5);
  assert(a.tUnternehmen(own).includes('id="ca-hours"'));
}

let n = 0; const uid = p => p + 'u' + (++n);
const act = (t, h, extra) => Object.assign({ id: 'c' + (++n), custom: true, t, cat: 'ausflug', cost: 0, per: 'pp', dur: h == null ? '' : 'ca. ' + String(h).replace('.', ',') + ' Std.' }, extra);
const trip = o => a.newTrip(Object.assign({ id: 'tplan', title: 'Plan', nights: 2, origin: 'A', dest: 'B', travel: 'auto', km: 240 }, o));

/* Dauer: Zahl im Feld hours vor Freitext; unbekannt bleibt unbekannt */
assert.equal(a.actHours({ hours: 2.5, dur: 'ca. 9 Std.' }), 2.5);
assert.equal(a.actHours({ dur: 'ca. 1,5 Std.' }), 1.5);
assert.equal(a.actHours({ dur: 'abends' }), null);

/* Fahrzeit: 240 km bei 80 km/h = 180 Min. am An- und Abreisetag, nichts dazwischen; Tagesausflug hin und zurück am selben Tag */
let t = trip();
assert.deepEqual(Array.from(a.driveByDay(t)), [180, 0, 180]);
assert.deepEqual(Array.from(a.driveByDay(trip({ nights: 0 }))), [360]);
assert.deepEqual(Array.from(a.driveByDay(trip({ travel: 'bahn' }))), [0, 0, 0], 'Bahn: keine Autofahrzeit eingerechnet');

/* Auslastung: Anreisetag 10 − 3 = 7 Std. verfügbar */
const big = act('Große Wanderung', 6), more = act('Museum', 2.5), open = act('Abendessen', null);
t.customActs = [big, more, open];
t.items = [{ uid: 'i1', act: big.id, day: 0, slot: 'nachm' }, { uid: 'i2', act: more.id, day: 0, slot: 'abend' }, { uid: 'i3', act: open.id, day: 1, slot: 'abend' }];
let L = a.dayLoad(t);
assert.equal(L[0].cap, 7); assert.equal(L[0].planned, 8.5); assert.equal(L[0].over, true);
assert.equal(L[1].over, false); assert.equal(L[1].unknown, 1, 'Dauer offen wird gezählt, nicht geraten');
let chk = a.checks(t).map(x => x[1]).join(' | ');
assert(/ca\. 8,5 Std\. Programm, verfügbar ca\. 7 Std\./.test(chk), 'Plan-Check warnt vor überladenem Anreisetag');
/* Tauschen: Programm vom Anreisetag auf Tag 2 */
const sw = a.swapDays(t, 0, 1);
assert.deepEqual(sw.items.map(i => i.day), [1, 1, 0]);
assert.equal(t.items[0].day, 0, 'Original unverändert');
assert(!a.dayLoad(sw).some(x => x.over), 'nach dem Tausch kein überladener Tag');
/* Buchungsschutz: gebuchter Termin darf nicht durch Tausch wandern */
t.ledger = { ['act:' + big.id]: { status: 'gebucht', amount: 40, paid: 0 } };
assert(a.commitmentIssues(t, sw).length >= 1, 'gebuchter Termin blockiert den Tausch');
delete t.ledger;

/* Tagesroute: Stationen des Tages, Start/Ziel am Reiseziel, keine Weiterfahrt-Punkte */
t = trip({ dest: 'Bad Urach' });
const w1 = act('Uracher Wasserfall', 2, { map: 'Uracher Wasserfall, Bad Urach' }), w2 = act('Hohenurach', 2, { map: 'Burgruine Hohenurach, Bad Urach' }), tr = act('Weiterfahrt', 2, { map: 'Ulm', transit: true });
t.customActs = [w1, w2, tr];
t.items = [{ uid: 'r1', act: w1.id, day: 1, slot: 'morgen' }, { uid: 'r2', act: w2.id, day: 1, slot: 'nachm' }, { uid: 'r3', act: tr.id, day: 1, slot: 'morgen' }];
const url = a.dayRouteUrl(t, 1);
assert(url.startsWith('https://www.google.com/maps/dir/?api=1&origin=Bad%20Urach&destination=Bad%20Urach&waypoints='));
assert(decodeURIComponent(url).includes('Uracher Wasserfall, Bad Urach|Burgruine Hohenurach, Bad Urach') && !decodeURIComponent(url).includes('Ulm'));
assert.equal(a.dayRouteUrl(t, 0), '', 'ohne Stationen kein Link');
assert.equal(a.dayLoad(t)[1].planned, 4, 'Weiterfahrt zählt nicht als Programm');

/* Rundreise-Etappen: Fahrzeit an Wechseltagen, Heimfahrt aus der Gesamtstrecke */
t = trip({ nights: 4, km: 400, legs: [{ place: 'x', name: 'X', lat: 50, lon: 10, nights: 2, roadKm: 160 }, { place: 'y', name: 'Y', lat: 51, lon: 11, nights: 2, roadKm: 240 }] });
assert.deepEqual(Array.from(a.driveByDay(t)), [120, 0, 180, 0, 300], 'Anreise 160 km, Wechsel 240 km, Heimfahrt 800 − 400 = 400 km');
const legBackup = { format: 'reiseplaner-backup', version: 2, trips: [JSON.parse(JSON.stringify(Object.assign(t, { id: 'tleg1' })))] };
assert.equal(a.validateBackup(legBackup)[0].legs.length, 2);
const badLeg = JSON.parse(JSON.stringify(legBackup)); badLeg.trips[0].legs[0].lat = 300;
assert.throws(() => a.validateBackup(badLeg), /Etappen/);
const badBring = JSON.parse(JSON.stringify(legBackup)); badBring.trips[0].customActs = [act('X', 1, { bring: 'Jacke' })];
assert.throws(() => a.validateBackup(badBring), /Unternehmung/);
const badHours = JSON.parse(JSON.stringify(legBackup)); badHours.trips[0].customActs = [act('X', 1, { hours: 99 })];
assert.throws(() => a.validateBackup(badHours), /Unternehmung/);

/* Packliste: Packhinweise aus übernommenen Katalog-Ideen landen in der bestehenden Liste, mit „für:“ */
t = trip();
const cave = C.toAct({ id: 's1', name: 'Tropfsteinhöhle', kind: 'unterwelt', hours: 1.5, summary: 'Höhle', indoor: true, months: [] }, { name: 'Ort' }, uid);
t.customActs = [cave]; t.items = [{ uid: 'p1', act: cave.id, day: 1, slot: 'nachm' }];
const packs = a.checklist(t).find(g => /für eure Unternehmungen/.test(g[0]));
assert(packs && packs[1].some(x => /Jacke/.test(x[1]) && /Tropfsteinhöhle/.test(x[2])), 'Packhinweis mit Herkunft');

/* Regenzwilling tauschen: gleiche Stelle im Plan, neue Idee mit offenem Preis, alte bleibt als Idee; gebucht = gesperrt */
{
  const all = require('vm'); void all;
  t = trip();
  const out = C.toAct({ id: 'bad-urach-wasserfall', name: 'Uracher Wasserfall', kind: 'natur', hours: 2, summary: 'x', months: [] }, { name: 'Bad Urach' }, uid);
  t.customActs = [out]; t.items = [{ uid: 'w1', act: out.id, day: 1, slot: 'morgen' }];
  const twin = { spot: { id: 'bad-urach-albthermen', name: 'AlbThermen', kind: 'therme', hours: 3, indoor: true, summary: 'Thermalbad', months: [] }, place: { name: 'Bad Urach' }, airKm: 1.8, roadKm: 2 };
  const draft = { u: 'w1', trip: t.id, source: JSON.stringify(t.items), list: [twin] };
  const na = a.rainSwap(t, draft, 0);
  assert.equal(t.items.length, 1); assert.equal(t.items[0].act, na.id); assert.equal(t.items[0].day, 1); assert.equal(t.items[0].slot, 'morgen');
  assert(t.customActs.some(c => c.id === out.id), 'Draußen-Idee bleibt als Idee erhalten');
  assert.equal(a.actCost(t, na).txt, 'Preis offen, vor Ort prüfen');
  assert.throws(() => a.rainSwap(t, draft, 0), /geändert/, 'veralteter Vorschlag wird abgelehnt');
  const t2 = trip(); t2.customActs = [out]; t2.items = [{ uid: 'w2', act: out.id, day: 1, slot: 'morgen' }];
  t2.ledger = { ['act:' + out.id]: { status: 'gebucht', amount: 10, paid: 10 } };
  assert.throws(() => a.rainSwap(t2, { u: 'w2', trip: t2.id, source: JSON.stringify(t2.items), list: [twin] }, 0), /Nicht getauscht/);
  assert.equal(t2.items[0].act, out.id, 'gebuchter Termin unverändert');
}
/* Mini-Karte und Saisonstreifen: Text statt nur Farbe */
const strip = a.catSeasonStrip([5, 6, 7], 'Gute Reisemonate');
assert(/aria-label="Gute Reisemonate: Mai, Juni, Juli"/.test(strip) && (strip.match(/✓/g) || []).length === 3);
assert.equal(a.catSeasonStrip([]), '');
const mapHtml = a.catMap([{ place: { id: 'harz', lat: 51.8, lon: 10.8 } }, { place: { id: 'berlin', lat: 52.5, lon: 13.4 } }], { lat: 48.7, lon: 9.65 });
assert(/role="img"/.test(mapHtml) && /data-val="harz"/.test(mapHtml) && />2<\/text>/.test(mapHtml));
/* Wann wohin: Zählung je Monat, Beispiele, gewählter Monat hervorgehoben */
{
  a.catState().month = '7';
  const res = { places: [{ id: 'a', name: 'Sommerziel', months: [6, 7, 8], kinds: ['wasser'], airKm: 50 }, { id: 'b', name: 'Winterziel', months: [12, 1, 2], kinds: ['winter'], airKm: 80 }, { id: 'c', name: 'Ganzjahr', months: [1,2,3,4,5,6,7,8,9,10,11,12], kinds: ['stadt'], airKm: 20 }] };
  const y = a.catYear(res);
  assert(/data-val="7" aria-pressed="true"/.test(y), 'gewählter Monat markiert');
  const row = m => y.split('data-val="' + m + '"')[1].split('</tr>')[0];
  assert(/> 2<\/td>/.test(row(7)) && /Sommerziel/.test(row(7)) && !/Winterziel/.test(row(7)));
  assert(/> 2<\/td>/.test(row(1)) && /Winterziel/.test(row(1)));
  assert(/> 1<\/td>/.test(row(4)));
  assert.equal(a.catYear({ places: [] }), '');
  a.catState().month = '';
}
console.log('Tagesplan: Dauer, Fahrzeit (Auto/Bahn/Tagesausflug/Rundreise), Auslastung und Plan-Check, Tauschen mit Buchungsschutz, Tagesroute ohne Weiterfahrt, Etappen-Sicherung, Packhinweise, Saisonstreifen, Karte, Regenzwilling (Tausch, Erhalt, Buchungsschutz) und Jahresüberblick geprüft.');
