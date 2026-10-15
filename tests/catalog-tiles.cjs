/* Kachel-Katalog (Claude, #8, K1): Index und Kacheln sind aus derselben Quelle erzeugt und liefern für jeden
   Referenzpunkt und Umkreis dieselben Treffer wie die Gesamtdatei. Node-Test. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const C = require('../catalog.js');
global.window = {};
require('../catalog-data.js'); require('../catalog/index.js');
const D = window.RP_CATALOG, I = window.RP_CATALOG_INDEX;
const dir = path.join(__dirname, '..', 'catalog');
const tileFiles = fs.readdirSync(dir).filter(f => /^t-[a-z0-9]+\.js$/.test(f));
tileFiles.forEach(f => require(path.join(dir, f)));
const T = window.RP_CATALOG_TILES;
assert.equal(I.version, D.version); assert.equal(I.places.length, D.places.length);
assert.deepEqual(Object.keys(I.tiles).sort(), tileFiles.map(f => f.slice(2, -3)).sort(), 'Index und Kachel-Dateien passen');
Object.keys(T).forEach(k => { assert.equal(T[k].version, D.version); assert.equal(T[k].places.length, I.tiles[k].places); });
assert.equal(Object.values(T).reduce((s, t) => s + t.places.length, 0), D.places.length, 'jedes Ziel genau einmal');
/* Lage: jedes Ziel liegt in der Kachel, die der Index nennt */
I.places.forEach(p => { const b = I.tiles[p.tile].bbox; assert(p.lat >= b[0] && p.lat < b[2] && p.lon >= b[1] && p.lon < b[3], p.id); assert(T[p.tile].places.some(x => x.id === p.id)); });
/* Gleichwertigkeit: alle Referenzpunkte × Umkreise, mit und ohne „ab km“ und Themen */
let n = 0, loaded = 0;
for (const o of C.ORIGINS) for (const [minKm, maxKm] of [[0, 60], [0, 150], [80, 350], [200, 600], [400, 1200]]) for (const kinds of [[], ['natur', 'burg']]) {
  const q = { lat: o.lat, lon: o.lon, minKm, maxKm, kinds }, keys = C.tilesFor(I, q);
  const part = { version: I.version, places: [].concat(...keys.map(k => T[k].places)) };
  assert.deepEqual(C.searchLocal(part, q).places.map(p => p.id), C.searchLocal(D, q).places.map(p => p.id), o.label + ' ' + minKm + '–' + maxKm);
  n++; loaded += keys.length;
}
/* Größe: Index bleibt kompakt (ohne Attraktionen) */
assert(fs.statSync(path.join(dir, 'index.js')).size < fs.statSync(path.join(__dirname, '..', 'catalog-data.js')).size / 2, 'Index deutlich kleiner als die Gesamtdatei');
console.log('Kachel-Katalog: ' + Object.keys(T).length + ' Kacheln, Index ' + I.places.length + ' Ziele; ' + n + ' Suchen identisch zur Gesamtdatei (Ø ' + (loaded / n).toFixed(1) + ' Kacheln je Suche).');
