/* P0.6: Jede in index.html eingebundene lokale Datei liegt im Offline-Cache des Service Workers,
   und der Service Worker speichert ohne Abfrageteil (Build hängt ?v=<Hash> an). */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const files = new Function('self', 'caches', sw.replace(/self\.addEventListener[\s\S]*$/, '') + '\nreturn FILES;')({}, {});
const refs = [...html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"#?:]+\.(?:js|css))"/g)].map(m => './' + m[1]);
assert(refs.length > 20, 'index.html bindet die App-Dateien ein');
for (const r of refs) assert(files.includes(r), 'sw.js FILES enthält ' + r);
for (const f of require('./app-code.cjs').appFiles(html)) assert(fs.existsSync(path.join(ROOT, f)), f + ' existiert');
assert(/c\.put\(cacheKey\(req\)/.test(sw) && /caches\.match\(cacheKey\(req\)\)/.test(sw) && !/ignoreSearch/.test(sw), 'Cache ohne Abfrageteil');
console.log('App-Dateien: ' + refs.length + ' eingebundene Dateien im Offline-Cache, Cache-Schlüssel ohne ?v= geprüft.');
