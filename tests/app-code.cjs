/* App-Code für Node-Tests (P0.6): Die App liegt seit 18.10. in app/*.js statt in einem Inline-Skript in index.html.
   appCode(html) liest die Dateien in der Reihenfolge der <script src="app/…">-Tags aus html und hängt sie aneinander,
   so wie der Browser sie nacheinander im selben globalen Gültigkeitsbereich ausführt. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
function appFiles(html) {
  const files = [...String(html).matchAll(/<script src="(app\/[a-z0-9-]+\.js)(?:\?[^"]*)?"><\/script>/g)].map(m => m[1]);
  if (!files.length) throw new Error('index.html lädt keine Dateien aus app/');
  return files;
}
function appCode(html) {
  return appFiles(html).map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
}
module.exports = appCode;
module.exports.appFiles = appFiles;
