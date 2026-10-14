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

/* Nächste Schritte: rein abgeleitet, dringende Zahlungen zuerst, Tagesausflüge ohne Hotelpflicht. */
{
  const t=a.newTrip({nights:0,budget:0,origin:'',dest:''}),before=JSON.stringify(t);
  const steps=a.planningNextSteps(t);
  assert(steps.some(x=>x.id==='destination'));assert(steps.some(x=>x.id==='dates'));assert(steps.some(x=>x.id==='budget'));
  assert(!steps.some(x=>x.id==='stay'),'Tagesausflug braucht keine Unterkunft');
  assert.equal(JSON.stringify(t),before);
  const own=a.customActFromForm({title:'Offene Idee',cat:'eigen',cost:'',hours:'',per:'pp'},'cnext');
  t.customActs=[own];t.items=[{uid:'next1',act:own.id,day:0,slot:'morgen'}];
  t.extraCosts=[{id:'kurgent',t:'Eintritt',c:20}];t.ledger={'xc:kurgent':{status:'gebucht',amount:20,paid:0,due:'2020-01-01'}};
  const urgent=a.planningNextSteps(t);
  assert.equal(urgent[0].id,'payments');
  assert(urgent.some(x=>x.id==='costs'));assert(urgent.some(x=>x.id==='duration'));
  assert(!urgent.some(x=>x.id==='ideas'),'geplantes Programm nicht künstlich auffüllen');
  assert(a.nextStepsBlock(t).includes('data-next-steps'));
  assert(a.nextStepsBlock(t).includes('weitere Hinweise'));
  assert(a.nextStepsBlock(t).includes('data-go="r-'+t.id+'-kosten"'));
  t.ledger['xc:kurgent'].paid=20;
  assert(!a.planningNextSteps(t).some(x=>x.id==='payments'),'bezahlte Posten sind nicht überfällig');
  t.items=[];t.customActs=[];t.dest='Museum <script>';assert(!a.planningNextSteps(t).some(x=>x.id==='destination'));
  const rich=a.newTrip({dateMode:'fix',start:'2027-05-01',end:'2027-05-02',dest:'Berlin',origin:'Ulm',travel:'bahn',ticket:20,budget:1});
  assert(a.planningNextSteps(rich).some(x=>x.id==='budget'&&x.reason.includes('über der Vorgabe')));
}

/* Unterkunfts- und Ortswechsel: unverändernde Vorschau, kein Verlust gebundener Aufenthalte. */
{
  const t=a.silvesterTemplate();t.check.stay=true;
  assert.throws(()=>a.stayChangePreview(t,'place','oberstaufen'),/Nicht geändert/);
  assert.throws(()=>a.stayChangePreview(t,'select','os-holidu'),/Nicht geändert/);
  const same=a.stayChangePreview(t,'select',t.stayId);
  assert.equal(same.candidate.check.stay,true,'erneute Auswahl erhält Buchung');
  t.customStays.push({id:'scustom',custom:true,name:'Hotel X',priceNight:120});
  const inactive=a.stayChangePreview(t,'remove','scustom');
  assert.equal(inactive.candidate.check.stay,true,'unbenutzte Unterkunft darf entfernt werden');
  t.check.stay=false;
  const original=JSON.stringify(t),draft=a.stayChangePreview(t,'place','oberstaufen');
  assert.equal(JSON.stringify(t),original);
  assert(draft.removed>0);
  t.budget+=1;
  assert.throws(()=>a.applyStayChange(t,draft),/geändert/);
  const fresh=a.stayChangePreview(t,'place','oberstaufen');a.applyStayChange(t,fresh);
  assert.equal(t.place,'oberstaufen');assert.equal(t.stayId,'');
  t.customStays=[{id:'scustom',custom:true,name:'Hotel X',priceNight:120}];t.stayId='scustom';t.check.stay=true;
  assert.throws(()=>a.stayChangePreview(t,'remove','scustom'),/Nicht geändert/);
  assert.throws(()=>a.stayChangePreview(t,'add',{id:'snew',name:'Neu',custom:true,priceNight:10}),/Nicht geändert/);
}

/* Manuelle Änderungen dürfen Verpflichtungen und absolute Termine nicht umgehen. */
{
  const t = a.newTrip({ dateMode: 'fix', start: '2027-05-01', end: '2027-05-04', persons: 2 });
  const idea = a.customActFromForm({ title: 'Museum', cat: 'eigen', cost: '12', per: 'pp', hours: '2' }, 'cprotected');
  t.customActs = [idea]; t.items = [{ uid: 'protected1', act: idea.id, day: 1, slot: 'morgen' }];
  const original = JSON.stringify(t);
  assert.equal(a.protectedPlanChange(t, 'move', { uid: 'protected1', day: 2, slot: 'abend' }).items[0].day, 2);
  assert.equal(JSON.stringify(t), original, 'Kandidat verändert Original nicht');
  assert.throws(() => a.protectedPlanChange(t, 'move', { uid: 'protected1', day: 99, slot: 'abend' }), /gültigen/);
  assert.equal(a.protectedPlanChange(t, 'clear').items.length, 0);
  for (const e of [{status:'gebucht',paid:0}, {status:'angefragt',paid:0}, {status:'offen',paid:1}, {status:'offen',paid:0,due:'2027-04-01'}]) {
    t.ledger = { 'act:cprotected': e };
    const snapshot = JSON.stringify(t);
    for (const [op,args] of [['move',{uid:'protected1',day:2,slot:'morgen'}],['remove',{uid:'protected1'}],['clear',{}],['package',{id:a.PKGS[0].id}]]) {
      assert.throws(() => a.protectedPlanChange(t,op,args), /Nicht geändert/);
      assert.equal(JSON.stringify(t),snapshot);
    }
    const dateDraft = JSON.parse(JSON.stringify(t));dateDraft.start='2027-05-02';dateDraft.end='2027-05-05';
    assert.throws(() => a.protectedPlanChange(t,'edit',{draft:dateDraft}), /Nicht geändert/, 'gleicher Tagesindex aber anderer echter Tag gesperrt');
    const peopleDraft = JSON.parse(JSON.stringify(t));peopleDraft.persons=3;
    assert.throws(() => a.protectedPlanChange(t,'edit',{draft:peopleDraft}), /Nicht geändert/);
    const safeDraft = JSON.parse(JSON.stringify(t));safeDraft.title='Neuer Reisetitel';safeDraft.budget=900;
    assert.equal(a.protectedPlanChange(t,'edit',{draft:safeDraft}).title,'Neuer Reisetitel');
    assert.equal(a.protectedPlanChange(t,'move',{uid:'protected1',day:1,slot:'morgen'}).items[0].day,1, 'identischer Termin weiterhin möglich');
  }
  delete t.ledger;t.check['b-cprotected']=true;
  assert.throws(() => a.protectedPlanChange(t,'remove',{uid:'protected1'}), /Nicht geändert/);
  delete t.check['b-cprotected'];t.check.stay=true;
  const draft=JSON.parse(JSON.stringify(t));draft.dateMode='flex';draft.month='2027-05';
  assert.throws(() => a.protectedPlanChange(t,'edit',{draft}), /Nicht geändert/);
  t.check.stay=false;delete t.ledger;
  assert.equal(a.protectedPlanChange(t,'edit',{draft}).dateMode,'flex');
}

/* Bearbeiten/Löschen: unverändernde Vorschau, Metadaten/IDs erhalten, Verpflichtungen schützen. */
{
  const form = { title: 'Museum', cat: 'eigen', cost: '12', per: 'pp', hours: '2', note: '', link: '', bring: 'Jacke' };
  const idea = a.customActFromForm(form, 'cedit');
  idea.catalogSpot = 'source-spot'; idea.km = 8;
  const own = a.newTrip({ nights: 2, persons: 2 });
  own.customActs = [idea]; own.items = [{ uid: 'keepid', act: idea.id, day: 1, slot: 'morgen' }];
  const before = JSON.stringify(own);
  let preview = a.activityChangePreview(own, idea.id, { ...form, title: 'Museum mit Führung', cost: '20' });
  assert.equal(JSON.stringify(own), before, 'Vorschau verändert nichts');
  assert(preview.after > preview.before);
  a.applyActivityChange(own, preview);
  assert.equal(own.customActs[0].catalogSpot, 'source-spot');
  assert.equal(own.customActs[0].km, 8);
  assert.equal(own.items[0].uid, 'keepid');
  assert.equal(own.items[0].day, 1);
  assert.throws(() => a.applyActivityChange(own, preview), /geändert/);
  for (const commitment of [{ status: 'gebucht', paid: 0 }, { status: 'angefragt', paid: 0 }, { status: 'offen', paid: 1 }, { status: 'offen', paid: 0, due: '2026-12-01' }]) {
    own.ledger = { 'act:cedit': commitment };
    assert.throws(() => a.activityChangePreview(own, 'cedit', null, true), /Nicht gelöscht/);
    assert.throws(() => a.activityChangePreview(own, 'cedit', { ...form, cost: '30' }), /geschützt/);
    const safe = a.activityChangePreview(own, 'cedit', { ...form, title: 'Museum mit Führung', cost: '20', note: 'Treffpunkt am Eingang', indoor: true });
    assert.equal(safe.candidate.customActs[0].note, 'Treffpunkt am Eingang');
  }
  delete own.ledger; own.check['b-cedit'] = true;
  assert.throws(() => a.activityChangePreview(own, 'cedit', null, true), /Nicht gelöscht/);
  own.check['b-cedit'] = false;
  preview = a.activityChangePreview(own, 'cedit', null, true);
  own.ledger = { 'act:cedit': { status: 'gebucht', paid: 0 } };
  assert.throws(() => a.applyActivityChange(own, preview), /geändert/, 'Neue Verpflichtung sperrt alte Vorschau');
  delete own.ledger;
  preview = a.activityChangePreview(own, 'cedit', null, true);
  a.applyActivityChange(own, preview);
  assert.equal(own.customActs.length, 0); assert.equal(own.items.length, 0);
}

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
/* Etappen umsortieren: Punkte wandern blockweise, Weiterfahrten neu, km neu geschätzt, feste Daten und Buchungen geschützt */
{
  const legsT = () => {
    const tt = trip({ type: 'rund', nights: 4, km: 500, kmSrc: 'schaetzung', originGeo: { lat: 48.7, lon: 9.65 },
      legs: [{ place: 'muenchen', name: 'München', lat: 48.137, lon: 11.575, nights: 2, roadKm: 200 }, { place: 'salzburg', name: 'Salzburg', lat: 47.8, lon: 13.044, nights: 2, roadKm: 150 }] });
    const m1 = act('Museum M', 2), s1 = act('Festung S', 2), tr = act('Weiterfahrt nach Salzburg', 2, { transit: true });
    tt.customActs = [m1, s1, tr];
    tt.items = [{ uid: 'a', act: m1.id, day: 1, slot: 'morgen' }, { uid: 'b', act: tr.id, day: 2, slot: 'morgen' }, { uid: 'c', act: s1.id, day: 3, slot: 'morgen' }];
    return { tt, m1, s1 };
  };
  let { tt, m1, s1 } = legsT();
  assert.deepEqual(Array.from(a.legStarts(tt.legs)), [0, 2]);
  const r = a.reorderLegs(tt, [1, 0]);
  const c = r.trip;
  assert.deepEqual(c.legs.map(l => l.name), ['Salzburg', 'München']);
  assert.equal(c.items.find(i => i.act === s1.id).day, 1, 'Salzburg-Punkt wandert in die erste Etappe');
  assert.equal(c.items.find(i => i.act === m1.id).day, 3, 'München-Punkt wandert in die zweite Etappe');
  const trs = c.customActs.filter(x => x.transit);
  assert.equal(trs.length, 1); assert.equal(trs[0].t, 'Weiterfahrt nach München');
  assert.equal(c.items.find(i => i.act === trs[0].id).day, 2);
  assert(r.recalculated && c.legs[0].roadKm === C.roadKm(C.airKm({ lat: 48.7, lon: 9.65 }, c.legs[0])), 'Anfahrt neu geschätzt');
  assert.equal(c.dest, 'Salzburg → München');
  assert.equal(tt.legs[0].name, 'München', 'Original unverändert bis zur Übernahme');
  /* Nächte ändern: offene Daten → Gesamtdauer wächst */
  const r2 = a.reorderLegs(tt, [0, 1], [3, 2]);
  assert.equal(r2.trip.nights, 5); assert.equal(r2.trip.items.find(i => i.act === s1.id).day, 4, 'Salzburg beginnt später');
  /* feste Daten: Summe muss gleich bleiben */
  const fixed = Object.assign(a.newTrip({}), tt, { dateMode: 'fix', start: '2027-05-01', end: '2027-05-05' });
  assert.throws(() => a.reorderLegs(fixed, [0, 1], [3, 2]), /Summe der Nächte/);
  assert.equal(a.reorderLegs(fixed, [1, 0], [2, 2]).trip.dateMode, 'fix');
  assert.throws(() => a.reorderLegs(tt, [0, 0]), /Reihenfolge/);
  /* ohne Abfahrtskoordinaten: Anfahrt bleibt, Hinweis */
  const noGeo = Object.assign({}, tt); delete noGeo.originGeo;
  const r3 = a.reorderLegs(noGeo, [1, 0]);
  assert.equal(r3.recalculated, false); assert.equal(r3.trip.km, 500, 'km ohne Startkoordinaten unverändert');
  /* gebuchter Punkt: Prüfung meldet Verschiebung */
  tt.ledger = { ['act:' + m1.id]: { status: 'gebucht', amount: 20, paid: 0 } };
  assert(a.commitmentIssues(tt, a.reorderLegs(tt, [1, 0]).trip).length >= 1, 'gebuchter Termin blockiert Umsortieren');
  /* Abfahrtsort ändern entfernt veraltete Koordinaten */
  const o2 = Object.assign({}, tt); a.setField(o2, 'origin', 'Anderswo'); assert.equal(o2.originGeo, undefined);
  const bk = { format: 'reiseplaner-backup', version: 2, trips: [JSON.parse(JSON.stringify(Object.assign({}, legsT().tt, { id: 'tgeo1', originGeo: { lat: 99, lon: 0 } })))] };
  assert.throws(() => a.validateBackup(bk), /Abfahrtsorts/);
}
/* Mappe, Kalender, Teilen-Text: Dauer als Zahl ist keine Öffnungszeit; Ort aus map; Etappen und Tagesroute */
{
  assert.equal(a.openHoursText({ hours: 'vormittags, täglich' }), 'vormittags, täglich');
  assert.equal(a.openHoursText({ hours: 2.5 }), '', 'Dauer wird nicht als Öffnungszeit angezeigt');
  const tt = trip({ dateMode: 'fix', start: '2027-05-01', end: '2027-05-03', dest: 'Bad Urach',
    legs: [{ place: 'x', name: 'Bad Urach', lat: 48.49, lon: 9.4, nights: 2, roadKm: 40 }] });
  const w = act('Wasserfall', null, { hours: 2.5, map: 'Uracher Wasserfall, Bad Urach' }), old = act('Alt', null, { hours: 'vormittags, täglich', dur: '3 Std.' });
  tt.customActs = [w, old]; tt.items = [{ uid: 'k1', act: w.id, day: 1, slot: 'morgen' }, { uid: 'k2', act: old.id, day: 1, slot: 'nachm' }];
  const ics = a.icsData(tt, new Date('2027-04-01T00:00:00Z')).text.replace(/\r\n /g, '');
  const evW = ics.split('BEGIN:VEVENT').find(e => e.includes('SUMMARY:Wasserfall'));
  assert(/DTSTART:20270502T090000/.test(evW) && /DTEND:20270502T113000/.test(evW), 'Ende aus Dauer 2,5 Std.');
  assert(/LOCATION:Uracher Wasserfall\\, Bad Urach/.test(evW), 'Ort aus Kartenangabe');
  assert(evW.includes('Dauer ca. 2\\,5 Std.') && !/Laut Katalog/.test(evW));
  const evOld = ics.split('BEGIN:VEVENT').find(e => e.includes('SUMMARY:Alt'));
  assert(/DTEND:20270502T180000/.test(evOld) && /Laut Katalog \(unbestätigt\): vormittags/.test(evOld), 'Textzeiten bleiben Hinweis, Fenster unverändert');
  const txt = a.tripText(tt);
  assert(/Etappen: Bad Urach \(2 N\.\)/.test(txt) && /Route: https:\/\/www\.google\.com\/maps\/dir/.test(txt));
  const mp = a.tMappe(tt);
  assert(/<h3>Etappen<\/h3>/.test(mp) && /Tagesroute in Karte/.test(mp) && /Programm ≈ 5,5 Std\./.test(mp));
}
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
console.log('Tagesplan: Dauer, Fahrzeit (Auto/Bahn/Tagesausflug/Rundreise), Auslastung und Plan-Check, Tauschen mit Buchungsschutz, Tagesroute ohne Weiterfahrt, Etappen-Sicherung, Packhinweise, Saisonstreifen, Karte, Regenzwilling (Tausch, Erhalt, Buchungsschutz) Jahresüberblick und Etappen umsortieren (Blöcke, Weiterfahrt, km, feste Daten, Buchungsschutz), Mappe/Kalender/Teilen-Text geprüft.');
