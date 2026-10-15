/* Feldtreue (SCHEMA_V3 §5, Review 4): Felder, die eine Bearbeitung nicht betrifft, bleiben unverändert erhalten –
   auch unbekannte Zusatzfelder und Zusatzschlüssel in Buchungsbuch-Einträgen. Node-Test, kein Browser-/DB-Test. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const store = new Map();
const context = {
  window: { addEventListener() {} },
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  setTimeout: () => 0, clearTimeout() {}, console
};
vm.createContext(context);
vm.runInContext(code, context);
const a = context.window.__app;
const J = x => JSON.parse(JSON.stringify(x));

/* Voll befüllte v2-Reise mit Zusatzdaten, die keine Bearbeitung betrifft */
const t = a.silvesterTemplate();
Object.assign(t, { kmSrc: 'route', routeMin: 140, routeHomeMin: 150, departTime: '08:15', checkinTime: '15:00', tz: 'Europe/Berlin',
  originGeo: { lat: 48.7, lon: 9.6 }, destGeo: { lat: 47.5, lon: 10.4 }, customChecks: [{ id: 'kx1', t: 'Eigener Punkt' }],
  zukunft: { a: 1, b: [1, 2, 3] } });
t.extraCosts = [a.costEntryFromForm({ title: 'Parken', amount: '25' }, 'kpark')];
a.setLedger(t, 'xc:kpark', 'amount', '30'); a.setLedger(t, 'xc:kpark', 'paid', '10');
t.ledger['xc:kpark'].zusatz = { note: 'künftiges Feld' };
const keep = x => J({ kmSrc: x.kmSrc, routeMin: x.routeMin, departTime: x.departTime, tz: x.tz, originGeo: x.originGeo, destGeo: x.destGeo,
  customChecks: x.customChecks, zukunft: x.zukunft, items: x.items, offers: x.offers || [], extra: x.ledger && x.ledger['xc:kpark'] && x.ledger['xc:kpark'].zusatz });
const base = keep(t);

/* 1. Bearbeitungen einzelner Felder */
a.setField(t, 'title', 'Silvester neu'); a.setField(t, 'notes', 'Notiz'); a.setField(t, 'persons', '3'); a.setField(t, 'budget', '1600');
assert.deepEqual(keep(t), base, 'setField verändert keine anderen Felder');
/* 2. Buchungsbuch: Eintrag mit Zusatzschlüssel gilt nie als leer */
a.setLedger(t, 'xc:kpark', 'paid', ''); a.setLedger(t, 'xc:kpark', 'amount', ''); a.setLedger(t, 'xc:kpark', 'status', 'offen');
assert(t.ledger['xc:kpark'], 'Eintrag mit Zusatzfeld nicht gelöscht');
assert.deepEqual(t.ledger['xc:kpark'].zusatz, { note: 'künftiges Feld' });
/* wirklich leerer Eintrag wird weiterhin entfernt */
t.extraCosts.push(a.costEntryFromForm({ title: 'Maut', amount: '9' }, 'kmaut'));
a.setLedger(t, 'xc:kmaut', 'paid', '5'); a.setLedger(t, 'xc:kmaut', 'paid', '');
assert(!t.ledger['xc:kmaut'], 'leerer Eintrag weiter aufgeräumt');
/* 3. Sync-Serialisierung */
const srv = a.toServer(t);
assert.equal(srv.schemaVersion, 2); assert.deepEqual(keep(srv), base, 'toServer erhält alle Felder');
assert.equal(J(t).schemaVersion === undefined || J(t).schemaVersion === 2, true);
/* 4. Export → Import als Kopie */
const raw = J(a.backupData([t]));
const back = a.validateBackup(raw)[0];
assert.deepEqual(keep(back), base, 'Export/Import erhält alle Felder');
a.Store.setScope('guest'); a.Store.put(t);
const ids = a.importTrips(raw, 'copy');
const copy = a.Store.get(ids[0]);
assert.notEqual(copy.id, t.id); assert.deepEqual(keep(copy), base, 'Importkopie erhält alle Felder');
/* 5. Speichern → Neuladen aus dem Browser-Speicher */
a.Store.setScope('guest');
assert.deepEqual(keep(a.Store.get(t.id)), base, 'Neuladen erhält alle Felder');
console.log('Feldtreue: setField, Buchungsbuch (Zusatzschlüssel nie „leer“), toServer, Export/Import, Importkopie und Neuladen erhalten unbetroffene und unbekannte Felder.');
