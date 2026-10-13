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
