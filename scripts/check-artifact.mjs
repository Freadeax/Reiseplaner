#!/usr/bin/env node
/* Prüft das Website-Artefakt: nur erlaubte Dateien, keine vertraulichen Schlüssel, keine internen Dateien. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOWED = new Set(['index.html', '404.html', '.nojekyll', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'app.css', 'cloud.js', 'config.js', 'catalog.js', 'v3logic.js', 'v3forms.js', 'v3editor.js', 'rpstore.js', 'v3journal.js', 'v3split.js', 'catalog-data.js', 'vendor/supabase-js-2.117.2.js', 'vendor/supabase-js-LICENSE.txt']);
const SECRET = [
  [/sb_secret_[A-Za-z0-9_-]{8,}/, 'Supabase Secret Key'],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*cm9sZSI6InNlcnZpY2Vfcm9sZS[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+/, 'service_role-JWT'],
  [/postgres(ql)?:\/\/[^\s'"]+:[^\s'"@]+@/, 'Datenbank-Verbindung mit Passwort'],
  [/SUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY\s*[:=]/, 'service_role-Variable'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'privater Schlüssel']
];

export async function checkArtifact(dir) {
  const problems = [];
  const files = (await fs.readdir(dir, { recursive: true, withFileTypes: true })).filter(d => d.isFile()).map(d => path.relative(dir, path.join(d.parentPath || d.path, d.name)).split(path.sep).join('/'));
  for (const f of files) {
    if (!ALLOWED.has(f) && !/^catalog\/(index|t-[a-z0-9]+)\.js$/.test(f) && !/^app\/[a-z0-9-]+\.js$/.test(f)) problems.push('nicht vorgesehene Datei im Artefakt: ' + f);
    if (/\.(png)$/.test(f)) continue;
    const text = await fs.readFile(path.join(dir, f), 'utf8');
    for (const [re, label] of SECRET) if (re.test(text)) problems.push(label + ' in ' + f);
  }
  for (const must of ['index.html', 'config.js', 'cloud.js', 'sw.js', 'catalog.js', 'v3logic.js', 'v3forms.js', 'v3editor.js', 'rpstore.js', 'v3journal.js', 'v3split.js', 'catalog-data.js', 'catalog/index.js', 'app.css', 'app/start.js']) if (!files.includes(must)) problems.push('fehlt: ' + must);
  /* P0.6: Jede in index.html eingebundene lokale Datei (Skripte, Stylesheet) muss im Artefakt liegen. */
  if (files.includes('index.html')) {
    const html = await fs.readFile(path.join(dir, 'index.html'), 'utf8');
    for (const m of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"#?]+)(?:\?[^"]*)?"/g)) {
      const ref = m[1];
      if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue;
      if (!files.includes(ref.replace(/^\.\//, ''))) problems.push('index.html verweist auf fehlende Datei: ' + ref);
    }
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] || 'public');
  const p = await checkArtifact(dir);
  if (p.length) { console.error('Artefaktprüfung fehlgeschlagen:\n - ' + p.join('\n - ')); process.exit(1); }
  console.log('Artefaktprüfung bestanden: ' + dir);
}
