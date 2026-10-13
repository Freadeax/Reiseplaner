const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const context = {
  window: { addEventListener() {} },
  document: { addEventListener() {}, querySelector() { return null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {} },
  setTimeout, clearTimeout, console,
};
vm.createContext(context);
vm.runInContext(code, context);
const a = context.window.__app;
const sample = a.silvesterTemplate();
assert.equal(sample.budget, 1500);
assert.equal(a.daysOf(a.newTrip({ dateMode: 'fix', start: '2026-12-01', end: '2027-02-01' })).length, 63);
assert.equal(a.pd('2026-02-30'), null);
a.setField(sample, 'verb', -5);
assert.equal(sample.verb, 7.5);
sample.stayId = 'oj-haug';
sample.cardConfirmed = false;
sample.items = [{ uid: '1', act: 'oj-ueben', day: 1, slot: 'morgen' }];
assert.equal(a.cost(sample).saved, 0);
sample.stayId = 'oj-holidu';
assert.equal(a.cost(sample).saved, 0);
sample.cardConfirmed = true;
assert(a.cost(sample).saved > 0);
sample.place = 'oberstaufen';
sample.stayId = 'os-holidu';
sample.items = [{ uid: '1', act: 'os-hochgrat', day: 1, slot: 'morgen' }, { uid: '2', act: 'os-aquaria', day: 1, slot: 'nachm' }];
assert(a.cost(sample).lines.some(line => line.t === 'Aquaria: Saunen & Solebad' && line.c === 66));
sample.puffer = 10;
assert(!a.savingTips(sample).some(tip => tip.t.includes('Puffer')));
sample.start = '2026-12-29';
a.applyPkg(sample, a.PKGS[0]);
assert(sample.items.filter(item => item.act.startsWith('silv-')).every(item => item.day === 2));
sample.origin = 'Berlin'; sample.km = 0; sample.routeKm = null;
assert.equal(a.routeKm(sample), 0);
sample.routeKm = 600;
assert.equal(a.routeKm(sample), 600);
sample.stayQuote = 800; sample.check.stay = true;
a.resetStay(sample);
assert.equal(sample.stayQuote, null);
assert(!sample.check.stay && !sample.cardConfirmed);
assert(a.openCosts(sample).length > 0);

const copy = a.backupData([sample]);
assert.equal(a.validateBackup(copy).length, 1);
assert.equal(a.importTrips(copy, 'skip').length, 1);
const original = JSON.stringify(a.Store.get(sample.id));
assert.equal(a.importTrips(copy, 'skip').length, 0);
const ids = a.importTrips(copy, 'copy');
assert.equal(ids.length, 1);
assert.notEqual(ids[0], sample.id);
assert.equal(JSON.stringify(a.Store.get(sample.id)), original);
assert.equal(a.Store.get(ids[0]).status, 'idee');
assert.throws(() => a.validateBackup({ ...copy, version: 99 }));
assert.throws(() => a.validateBackup({ ...copy, trips: [sample, sample] }));
assert.throws(() => a.validateBackup({ ...copy, trips: [{ ...sample, budget: -1 }] }));
assert.throws(() => a.validateBackup({ ...copy, trips: [{ ...sample, start: '2026-02-30' }] }));
let stored='{beschädigt', writes=0;
context.localStorage.getItem=()=>stored;
context.localStorage.setItem=(_key,value)=>{writes++;stored=value};
context.localStorage.removeItem=()=>{stored=null};
a.Store.loadLocal();
assert.equal(a.Store.corruptRaw,'{beschädigt');
assert.equal(a.Store.saveLocal(),false);
assert.equal(stored,'{beschädigt');
assert.equal(writes,0); // Kein neuer Schreibzugriff auf die beschädigten Rohdaten.
assert.equal(a.Store.resetCorrupt(),true);
assert.equal(a.Store.corruptRaw,null);
assert.equal(stored,null);
assert.equal(a.Store.saveLocal(),true);
assert.equal(writes,1);
console.log('Speicherfehler: Rohdaten bleiben erhalten, Schreibsperre und explizites Zurücksetzen geprüft.');
console.log('Grundlogik, Export, Import, Konflikte und ungültige Daten geprüft.');

/* Lange Schneesport-Aufenthalte: keine stille Deckelung, Hochrechnungen als Schätzung markiert */
const longTrip = (place, stay, act, n) => {
  const tr = a.newTrip({ catalog: 'allgaeu', place, stayId: stay, dateMode: 'fix', start: '2027-01-10', end: '2027-01-' + (10 + n + 1), persons: 2 });
  tr.items = [...Array(n)].map((_, i) => ({ uid: 'u' + i, act, day: i + 1, slot: 'morgen' }));
  return tr;
};
const gearLine = tr => a.cost(tr).lines.find(l => l.t.startsWith('Verleih'));
const g5 = gearLine(longTrip('balder', a.STAYS.find(s => s.place === 'balder').id, 'bs-ueben', 5));
const g8 = gearLine(longTrip('balder', a.STAYS.find(s => s.place === 'balder').id, 'bs-ueben', 8));
assert.equal(g5.c, (123 + 20) * 2);
assert.equal(g8.c, (123 + 20 + 3 * (22 + 4)) * 2, '8 Verleihtage dürfen nicht wie 5 kosten');
assert.equal(g8.src, 'est');
assert(g8.s.includes('hochgerechnet'));
const bal = longTrip('balder', a.STAYS.find(s => s.place === 'balder').id, 'bs-ueben', 6);
const pass6 = a.cost(bal).lines.find(l => l.t.startsWith('Skipass'));
assert.equal(pass6.src, 'est');
assert(Math.abs(pass6.c - 135 / 3 * 6 * 2) < 0.01);
assert(a.openCosts(bal).some(x => x.includes('Skipass über 3 Tage')));
assert(a.openCosts(bal).some(x => x.includes('Verleih über 5 Tage')));
const bal3 = longTrip('balder', a.STAYS.find(s => s.place === 'balder').id, 'bs-ueben', 3);
assert.equal(a.cost(bal3).lines.find(l => l.t.startsWith('Skipass')).src, 'ok');
assert(!a.openCosts(bal3).some(x => /über (3|5) Tage/.test(x)));
const kurs5 = longTrip('balder', a.STAYS.find(s => s.place === 'balder').id, 'bs-kurs', 5);
const kl = a.cost(kurs5).lines.find(l => l.t.startsWith('Gruppenkurs'));
assert.equal(kl.src, 'est');
assert(a.openCosts(kurs5).some(x => x.includes('Kurs über 3 Tage')));
console.log('Lange Schneesport-Aufenthalte: Verleih, Skipass und Kurs ehrlich hochgerechnet und markiert.');

/* Tagesausflug: Anreise = Abreise ist gültig, ohne Übernachtung keine Unterkunftspflicht */
const day = a.newTrip({ type: 'tag', dateMode: 'fix', start: '2027-06-05', end: '2027-06-05', nights: 0, travel: 'bahn', ticket: 40 });
assert.equal(a.nightsOf(day), 0);
assert.equal(a.daysOf(day).length, 1);
assert(!a.openCosts(day).some(x => x.includes('Unterkunft')));
assert(!a.checks(day).some(x => x[1].includes('Unterkunft')));
assert(!a.checklist(day)[0][1].some(x => x[0] === 'stay'));
const dc = a.cost(day);
assert.equal(dc.lines.find(l => l.cat === 'essen').c, 20 * 1 * 2, 'Essen für genau einen Tag');
assert.equal(dc.byCat.unterkunft || 0, 0);
assert.equal(a.validateBackup(a.backupData([day])).length, 1);
assert.throws(() => a.validateBackup(a.backupData([{ ...day, end: '2027-06-04' }])));
/* Typwahl setzt die Dauer */
const dr = a.newTrip({ dateMode: 'open' });
assert.equal(a.nightsOf(dr), 3);
a.applyType(dr, 'tag'); assert.equal(dr.nights, 0);
a.applyType(dr, 'wochenende'); assert.equal(dr.nights, 2);
const fx = a.newTrip({ dateMode: 'fix', start: '2027-06-05', end: '2027-06-08' });
a.applyType(fx, 'tag'); assert.equal(fx.end, '2027-06-05');
a.applyType(fx, 'stadt'); assert.equal(fx.end, '2027-06-08');
const keep = a.newTrip({ type: 'stadt', nights: 5 }); a.applyType(keep, 'strand'); assert.equal(keep.nights, 5, 'Dauer bleibt bei Wechsel zwischen Mehrtagesarten');
console.log('Tagesausflug mit 0 Nächten und Dauer bei Typwahl geprüft.');
