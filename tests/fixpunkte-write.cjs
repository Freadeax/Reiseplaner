/* Fixpunkte und freie Zeit speichern (Format 5, über f5Commit). Node-Test, kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
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
      RPBook: require('../bookgen.js'), RPCatalog: require('../catalog.js') },
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

const act = (id, title, hours) => ({ id, custom: true, t: title, cat: 'eigen', cost: 0, per: 'grp', hours, dur: 'ca. ' + hours + ' Std.', note: '' });
let n = 0;
/* 1 · Fixpunkt von Hand: nur mit Uhrzeit, Anheben auf Format 5 nur nach Bestätigung, wird als Fixpunkt gewertet */
{
  const { a, run } = makeApp();
  const t = a.newTrip({ title: 'Fix', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', dest: 'Oberstdorf' });
  t.customActs = [act('ctour', 'Geführte Tour', 2), act('cski', 'Ski', 3)];
  t.items = [{ uid: 'tour', act: 'ctour', day: 1, slot: 'morgen', time: '10:00' }, { uid: 'ski', act: 'cski', day: 1, slot: 'nachm' }];
  assert(a.Store.put(J(t)));
  const r0 = run('fixSetFix')(a.Store.get(t.id), 'tour', true);
  assert.equal(r0.needsConfirm, 'format5', 'Umstellung auf Format 5 wird erst bestätigt');
  assert(!a.Store.get(t.id).items[0].fix, 'ohne Bestätigung nichts gespeichert');
  const r = run('fixSetFix')(a.Store.get(t.id), 'tour', true, { confirmed: true });
  assert(r.ok && r.upgraded);
  const s = a.Store.get(t.id);
  assert.equal(s.schemaVersion, 5); assert.equal(s.items[0].fix, true);
  assert.equal(run('fixPoints')(s).find(f => f.uid === 'tour').why, 'von Hand festgelegt');
  assert.throws(() => run('fixSetFix')(s, 'ski', true), /Zuerst eine Uhrzeit eintragen/);
  /* Uhrzeit entfernen löst die Markierung, statt eine ungültige Reise zu erzeugen */
  const moved = a.protectedPlanChange(s, 'move', { uid: 'tour', day: 2, slot: 'morgen', time: '' });
  assert(!('fix' in moved.items.find(i => i.uid === 'tour')));
  a.validateExtras(moved);
  assert(run('fixSetFix')(a.Store.get(t.id), 'tour', false).ok);
  assert(!('fix' in a.Store.get(t.id).items[0]));
  n++;
}
/* 2 · Tageszeit bewusst freihalten: gespeichert, geprüft, Lücken füllen lässt sie aus, wieder freigeben entfernt das Feld */
{
  const { a, run } = makeApp();
  const t = a.newTrip({ title: 'Frei', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', dest: 'Oberstdorf' });
  t.schemaVersion = 5;
  assert(a.Store.put(J(t)));
  assert(run('fixSetKeepFree')(a.Store.get(t.id), 2, 'nachm', 'wetter').ok);
  assert(run('fixSetKeepFree')(a.Store.get(t.id), 1, 'abend', 'erholung').ok);
  assert(run('fixSetKeepFree')(a.Store.get(t.id), 2, 'nachm', 'spontan').ok, 'gleicher Tag und Slot ersetzt den Grund');
  let s = a.Store.get(t.id);
  assert.deepEqual(J(s.keepFree), [{ day: 1, slot: 'abend', why: 'erholung' }, { day: 2, slot: 'nachm', why: 'spontan' }]);
  assert.throws(() => run('fixSetKeepFree')(s, 9, 'nachm', 'wetter'), /ungültig/);
  assert.throws(() => run('fixSetKeepFree')(s, 1, 'nachts', 'wetter'), /ungültig/);
  assert.throws(() => run('fixSetKeepFree')(s, 1, 'abend', 'party'), /Grund ungültig/);
  const tools = run('fixDayTools')(s, run('fixTrip')(s).days[2]);
  assert(/Nachmittag \(Spontanes\) wieder verplanbar/.test(tools) && /Vormittag freihalten/.test(tools));
  const src = fs.readFileSync(__dirname + '/../app/tagesplan.js', 'utf8');
  assert(/concat\(\(Array\.isArray\(t\.keepFree\)/.test(src), 'Lücken füllen zählt freigehaltene Zeit als belegt');
  assert(run('fixSetKeepFree')(a.Store.get(t.id), 1, 'abend', null).ok);
  assert(run('fixSetKeepFree')(a.Store.get(t.id), 2, 'nachm', null).ok);
  assert(!('keepFree' in a.Store.get(t.id)), 'leere Liste entfernt');
  n++;
}
/* 3 · Ohne F5_WRITE keine Bedienelemente */
{
  const { a, run } = makeApp({ noWrite: true });
  const t = a.newTrip({ title: 'Alt', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03' });
  assert(a.Store.put(J(t)));
  assert.equal(run('fixDayTools')(a.Store.get(t.id), run('fixTrip')(a.Store.get(t.id)).days[1]), '');
  n++;
}
console.log('Fixpunkte schreiben (Format 5): ' + n + ' Prüfungen bestanden (fix nur mit Uhrzeit, Bestätigung beim Anheben, Uhrzeit entfernen löst fix, keepFree ersetzen/prüfen/entfernen, Lücken füllen, Sperre ohne F5_WRITE). Kein Browser-/iPhone-Test.');
