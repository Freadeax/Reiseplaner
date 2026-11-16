/* OFFLINE O2 (docs/OFFLINE.md §4.2): Reisen in einem neueren Format sind kein Schaden. Eine ältere App-Version
   (z. B. offline aus dem Zwischenspeicher) sperrt Änderungen, bietet aber kein „Speicher zurücksetzen“ an und
   verändert die Daten nicht. Echte Beschädigung verhält sich wie bisher. Node-Test, kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const P = require('../photostore.js');
const J = x => JSON.parse(JSON.stringify(x));
function makeApp(o) {
  o = o || {};
  const store = o.store || new Map(), alerts = [];
  const photos = new Map();
  const RPPhotos = Object.assign({}, P, { create: () => ({ async put(id) { photos.set(id, 1); return { id }; }, async get() { return null; }, async has(id) { return { work: photos.has(id), thumb: photos.has(id) }; }, async remove(id) { photos.delete(id); return true; } }) });
  const syncEl = { className: '', querySelector() { return syncEl._s; }, _s: { textContent: '' } };
  const ctx = {
    window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: require('../v4logic.js'), RPV5: o.noV5 ? undefined : require('../v5logic.js'),
      RPBook: require('../bookgen.js'), RPCatalog: require('../catalog.js'), RPPhotos, RPCloud: o.server ? o.server.api : undefined },
    location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
    navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: k => k === '#sync' ? syncEl : null, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, visibilityState: 'visible' },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL, Blob, TextEncoder, TextDecoder, crypto: globalThis.crypto, alert: m => alerts.push(m)
  };
  ctx.window.document = ctx.document; ctx.window.crypto = globalThis.crypto;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.alertMsg = m => alerts.push(m); ctx.render = () => {};
  return { ctx, a: ctx.window.__app, F: vm.runInContext('RPF4', ctx), store, alerts };
}

const v5 = a => Object.assign(a.silvesterTemplate(), { schemaVersion: 5, party: [{ id: 'pphil', name: 'Philipp' }] });
let n = 0;
/* 1. Gast: neuer Stand speichert Format 5, alter Stand (ohne v5logic.js) öffnet denselben Speicher */
{
  const neu = makeApp(); neu.a.Store.setScope('guest');
  const t = v5(neu.a); assert(neu.a.Store.put(J(t)));
  const raw = neu.store.get('rp-trips');
  const old = makeApp({ noV5: true, store: neu.store }); old.a.Store.setScope('guest');
  assert.notStrictEqual(old.a.Store.corruptRaw, null, 'alter Stand sperrt');
  assert.strictEqual(old.a.Store.newerFormat, 5, 'alter Stand erkennt neueres Format');
  const block = vm.runInContext('storageRecoveryBlock()', old.ctx);
  assert(/neueren Version/.test(block) && /data-act="reload-app"/.test(block), 'Hinweis „neuere Version“ mit Aktualisieren');
  assert(!/corrupt-confirm|corrupt-reset/.test(block), 'kein Zurücksetzen angeboten');
  assert.strictEqual(old.a.Store.resetCorrupt(), false, 'Zurücksetzen verweigert');
  assert.strictEqual(old.store.get('rp-trips'), raw, 'Daten unverändert');
  assert(/neuerer App-Version/.test(old.ctx.document.querySelector('#sync')._s.textContent), 'Kopfzeile nennt die neuere Version');
  n++;
}
/* 2. Konto-Bereich und künftiges Format 6 im aktuellen Stand */
{
  const store = new Map();
  const t = v5(makeApp().a); t.schemaVersion = 6;
  store.set('rp-u:uA', JSON.stringify({ v: 1, trips: { [t.id]: t }, meta: {}, queue: {} }));
  const app = makeApp({ store }); app.a.Store.setScope('uA');
  assert.strictEqual(app.a.Store.newerFormat, 6, 'Format 6 im Kontospeicher erkannt');
  assert.strictEqual(app.a.Store.resetCorrupt(), false);
  assert(store.has('rp-u:uA'), 'Kontospeicher unverändert');
  n++;
}
/* 3. Echte Beschädigung: wie bisher mit Zurücksetzen */
{
  const store = new Map([['rp-trips', '{kaputt']]);
  const app = makeApp({ store }); app.a.Store.setScope('guest');
  assert.strictEqual(app.a.Store.newerFormat, 0);
  assert(/corrupt-confirm/.test(vm.runInContext('storageRecoveryBlock()', app.ctx)), 'Beschädigung: Zurücksetzen bleibt angeboten');
  assert.strictEqual(app.a.Store.resetCorrupt(), true);
  n++;
}
console.log('Neueres Format (Offline O2): ' + n + ' Prüfungen (alter Stand sperrt ohne Zurücksetzen, Daten unverändert, Format 6 im Konto, echte Beschädigung wie bisher). Kein Browser-/iPhone-Test.');
