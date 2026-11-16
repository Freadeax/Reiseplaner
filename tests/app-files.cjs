/* P0.6 / OFFLINE O1: Jede in index.html eingebundene lokale Datei existiert, und der Service Worker liest seine
   Dateiliste bei der Installation aus index.html (keine Handliste mehr, docs/OFFLINE.md §4.1). */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const api = new Function(sw + '\nreturn {assetsFrom, EXTRA};')();
const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"#?:]+\.(?:js|css))"/g)].map(m => './' + m[1]);
assert(refs.length > 20, 'index.html bindet die App-Dateien ein');
assert.deepStrictEqual(api.assetsFrom(html), refs, 'Service Worker findet genau die eingebundenen Dateien');
/* Nachgeladene Dateien (nicht in index.html) stehen in EXTRA: Supabase-Bibliothek aus cloud.js, Katalog-Offline-Kopie */
const lib = /var LIB = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'cloud.js'), 'utf8'))[1];
assert(api.EXTRA.includes('./' + lib), 'sw.js EXTRA enthält ' + lib);
assert(api.EXTRA.includes('./catalog-data.js'), 'sw.js EXTRA enthält catalog-data.js');
for (const f of refs.concat(api.EXTRA)) assert(fs.existsSync(path.join(ROOT, f)), f + ' existiert');
for (const f of require('./app-code.cjs').appFiles(html)) assert(fs.existsSync(path.join(ROOT, f)), f + ' existiert');
console.log('App-Dateien: ' + refs.length + ' eingebundene Dateien, Service Worker liest dieselbe Liste aus index.html.');
