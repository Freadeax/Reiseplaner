/* Nominatim-Nutzungsregeln: höchstens eine Anfrage je Sekunde (Streckenberechnung sucht Start und Ziel nacheinander),
   keine Suche beim Tippen. Node-Test mit eigener Uhr, kein Browser-Test. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
let now = 1e12; const calls = [];
const ctx = {
  window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js') },
  document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  setTimeout: (fn, ms) => { if (ms > 2000) return 0; /* Zeitlimit von catTimeout nie auslösen */ now += ms || 0; Promise.resolve().then(fn); return 1; }, clearTimeout() {}, console,
  fetch: url => { calls.push({ url, at: now }); return Promise.resolve({ ok: true, json: async () => [{ lat: '48.7', lon: '9.65', display_name: 'Göppingen, BW' }] }); }
};
vm.createContext(ctx);
vm.runInContext('Date.now=()=>globalThis.__now();', ctx); ctx.__now = () => now;
vm.runInContext(code, ctx);
(async () => {
  const geo = vm.runInContext('geoLookup', ctx);
  await geo('Hattenhofen'); await geo('Oberstaufen'); await geo('Oberjoch');
  assert.equal(calls.length, 3);
  for (let i = 1; i < calls.length; i++) assert(calls[i].at - calls[i - 1].at >= 1000, 'Abstand ' + (calls[i].at - calls[i - 1].at) + ' ms');
  /* Suche nur auf Knopfdruck/Enter: kein input-/keyup-Handler ruft Nominatim */
  const src = ['reise', 'entdecken'].map(n => fs.readFileSync(path.join(__dirname, '..', 'app', n + '.js'), 'utf8')).join('\n');
  assert(!/addEventListener\('(input|keyup)'[^\n]*(catGeoSearch|geoLookup)/.test(src), 'keine Suche beim Tippen');
  assert.equal((src.match(/nominatim\.openstreetmap\.org/g) || []).length, 2, 'alle Anfragen laufen über nominatimFetch');
  assert(!/fetch\('https:\/\/nominatim/.test(src), 'kein direkter fetch an Nominatim');
  console.log('Nominatim: Abstand ≥ 1 s zwischen Anfragen, keine Suche beim Tippen geprüft. Kein Browser-Test.');
})().catch(e => { console.error(e); process.exit(1); });
