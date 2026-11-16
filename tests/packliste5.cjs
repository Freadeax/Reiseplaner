/* Check- und Packliste anpassen über Format 5 (Claude 16.11. abends, M03.4/M04.3): Ausblenden mit stabilem Schlüssel,
   eigene Packpunkte mit Person und Menge, Ausweise mit Ablaufdatum (ohne Nummer), Reiseland bestätigen. Anheben nur nach
   Bestätigung (f5Commit). Node-Test mit index.html und den echten Logikdateien. Kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.indexOf('<script src="app/format5.js"></script>') > 0, 'index.html lädt app/format5.js');
assert(fs.readFileSync(__dirname + '/../index.html', 'utf8').includes('app/format5.js'), 'index.html bindet app/format5.js ein (Service Worker liest die Liste daraus)');
const base = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
assert(/const F5_WRITE=true;/.test(base), 'Schreiben freigeschaltet');
const J = x => JSON.parse(JSON.stringify(x));

function makeApp(o) {
  o = o || {};
  const store = new Map(), alerts = [], form = {};
  const code = o.noWrite ? base.replace('const F5_WRITE=true;', 'const F5_WRITE=false;') : base;
  const el = id => ({ get value() { return form[id] == null ? '' : form[id]; }, textContent: '', hidden: true, focus() {} });
  const ctx = {
    window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: require('../v4logic.js'), RPV5: require('../v5logic.js'),
      RPBook: require('../bookgen.js'), RPCatalog: require('../catalog.js'), RPPack: require('../packlogic.js') },
    location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
    navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: k => k[0] === '#' && k.slice(1) in form ? el(k.slice(1)) : null, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL, Blob, TextEncoder, TextDecoder, crypto: globalThis.crypto, alert: m => alerts.push(m)
  };
  ctx.window.document = ctx.document; ctx.window.crypto = globalThis.crypto;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.alertMsg = m => alerts.push(m); ctx.render = () => {};
  const run = s => vm.runInContext(s, ctx);
  return { ctx, a: ctx.window.__app, run, form, alerts };
}
let n = 0;
{
  const { a, run, form } = makeApp(); a.Store.setScope('guest');
  const t = a.newTrip({ title: 'Tannheim', type: 'winter', travel: 'auto', place: 'tannheim', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03' });
  t.party = [{ id: 'persanna1', name: 'Anna' }, { id: 'persben01', name: 'Ben' }];
  assert(a.Store.put(J(t)));
  const keys = x => [].concat(...a.checklist(x).map(g => g[1])).map(i => i[0]);
  assert(keys(a.Store.get(t.id)).includes('p-Skibrille') && keys(a.Store.get(t.id)).includes('d-vignette'));
  /* Ausblenden: erst Bestätigung fürs Anheben, dann weg, Schlüssel gemerkt, Häkchen anderer Punkte unberührt */
  let r = run('pkHide')(a.Store.get(t.id), 'p-Skibrille', true);
  assert.equal(r.needsConfirm, 'format5', 'Anheben nur nach Bestätigung');
  assert.equal(a.Store.get(t.id).schemaVersion, undefined);
  r = run('pkHide')(a.Store.get(t.id), 'p-Skibrille', true, { confirmed: true }); assert(r.ok && r.upgraded);
  r = run('pkHide')(a.Store.get(t.id), 'd-vignette', true); assert(r.ok && !r.upgraded);
  let cur = a.Store.get(t.id);
  assert.deepEqual(J(cur.packing), { hidden: ['p-Skibrille', 'd-vignette'] });
  assert(!keys(cur).includes('p-Skibrille') && !keys(cur).includes('d-vignette'));
  assert.deepEqual(J(run('PK_LAST_HIDDEN')[t.id]).map(x => x.key), ['d-vignette', 'p-Skibrille'], 'Ausgeblendetes bleibt aufgelistet');
  assert.throws(() => run('pkHide')(cur, 'stay', true), /nicht ausblenden/, 'Buchungsaufgaben lassen sich nicht ausblenden');
  assert.throws(() => run('pkHide')(cur, 'c-x', true), /nicht ausblenden/);
  /* Eigene Packpunkte */
  r = run('pkAdd')(cur, { label: 'Schlitten', group: 'Kinder', who: 'persben01', qty: '1' }); assert(r.ok);
  r = run('pkAdd')(a.Store.get(t.id), { label: 'Spielkarten' }); assert(r.ok);
  cur = a.Store.get(t.id);
  const groups = a.checklist(cur), names = groups.map(g => g[0]);
  assert(names.indexOf('Packliste: Kinder') === names.length - 3 && names.indexOf('Packliste: eigene Punkte') === names.length - 2 && names[names.length - 1] === 'Eigene Punkte', names.join(' | '));
  const kid = groups.find(g => g[0] === 'Packliste: Kinder')[1][0];
  assert.equal(kid[1], 'Schlitten'); assert.equal(kid[2], 'Menge: 1 · packt: Ben');
  assert.throws(() => run('pkAdd')(cur, { label: 'x', who: 'p9' }), /gibt es in dieser Reise nicht/, 'unbekannte Person abgelehnt');
  assert.throws(() => run('pkAdd')(cur, { label: '  ' }), /Bezeichnung fehlt/);
  /* Häkchen und Entfernen */
  const pid = cur.packing.custom[0].id;
  r = run('pkDel')(cur, pid); assert(r.ok);
  assert.equal(a.Store.get(t.id).packing.custom.length, 1);
  /* Ausweise: Ergebnis in der Dokumentgruppe, keine Nummer möglich */
  r = run('pkDocAdd')(a.Store.get(t.id), { who: 'persanna1', kind: 'pass', validUntil: '2027-01-02' }); assert(r.ok);
  cur = a.Store.get(t.id);
  const doc = a.checklist(cur).find(g => /^Dokumente/.test(g[0]))[1].find(i => /^iddoc:/.test(i[0]));
  assert.equal(doc[1], 'Reisepass · Anna'); assert(/läuft vor der Rückkehr ab \(02\.01\.2027\)/.test(doc[2]), doc[2]);
  assert.deepEqual(Object.keys(cur.idDocs[0]).sort(), ['id', 'kind', 'validUntil', 'who']);
  assert.throws(() => run('pkDocAdd')(cur, { who: '', kind: 'pass' }), /Person wählen/);
  assert.throws(() => run('pkDocAdd')(cur, { who: 'persanna1', kind: 'pass', validUntil: '2027-02-30' }), /Ablaufdatum/);
  r = run('pkDocDel')(cur, cur.idDocs[0].id); assert(r.ok); assert.equal(a.Store.get(t.id).idDocs, undefined);
  /* Reiseland bestätigen und ändern */
  r = run('pkSetCountries')(a.Store.get(t.id), ['AT', 'it', 'AT', 'xx1']); assert(r.ok);
  cur = a.Store.get(t.id); assert.deepEqual(J(cur.countries), ['AT', 'IT']);
  assert.equal(a.checklist(cur).find(g => /^Dokumente/.test(g[0]))[0], 'Dokumente & Einreise: Österreich, Italien');
  r = run('pkSetCountries')(cur, []); assert(r.ok); assert.equal(a.Store.get(t.id).countries, undefined);
  /* Wieder zeigen */
  r = run('pkHide')(a.Store.get(t.id), '*', false); assert(r.ok);
  assert(keys(a.Store.get(t.id)).includes('p-Skibrille'));
  /* Panel und Zeilenwerkzeuge */
  const view = run('tCheck')(a.Store.get(t.id));
  assert(view.includes('data-fold="check-anpassen"') && view.includes('data-pk-act="hide" data-id="p-Skibrille"') && view.includes('data-pk-act="del"'));
  assert(!view.includes('data-pk-act="hide" data-id="stay"'), 'kein Ausblenden für Buchungen');
  n++;
}
/* Ohne Schreibrecht: keine Werkzeuge, Liste wie bisher */
{
  const { a, run } = makeApp({ noWrite: true }); a.Store.setScope('guest');
  const t = a.newTrip({ type: 'winter', travel: 'auto', place: 'tannheim', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03' });
  assert(a.Store.put(J(t)));
  const view = run('tCheck')(a.Store.get(t.id));
  assert(!view.includes('data-pk-act') && !view.includes('check-anpassen'));
  n++;
}
console.log('Check-/Packliste anpassen (Format 5): ' + n + ' Prüfungen bestanden (Ausblenden, eigene Packpunkte mit Person und Menge, Ausweise mit Ablaufdatum, Reiseland, Bestätigung, ohne Schreibrecht). Kein Browser-/iPhone-Test.');
