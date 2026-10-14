#!/usr/bin/env node
/* Erzeugt das Website-Artefakt in public/ (Issue #6). Kein Framework, kein Bundler:
   nur die Dateien, die der Browser braucht. Docs, Tests, SQL und Entwicklungsdateien bleiben draußen.
   Öffentliche Konfiguration aus Umgebungsvariablen:
     RP_SUPABASE_URL                 z. B. https://<ref>.supabase.co   (leer = Gastmodus)
     RP_SUPABASE_PUBLISHABLE_KEY     sb_publishable_…                  (niemals Secret/service_role)
     RP_SITE_URL                     optional, feste Weiterleitungsadresse für E-Mails
     RP_BASE_PATH                    Pfad der Website, Standard /Reiseplaner/ (GitHub Pages), / für Cloudflare Pages */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkArtifact } from './check-artifact.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public');
const FILES = ['index.html', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'cloud.js', 'catalog.js', 'catalog-data.js',
  'vendor/supabase-js-2.117.2.js', 'vendor/supabase-js-LICENSE.txt'];

const env = process.env;
const url = (env.RP_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (env.RP_SUPABASE_PUBLISHABLE_KEY || '').trim();
const site = (env.RP_SITE_URL || '').trim();
const base = (env.RP_BASE_PATH || '/Reiseplaner/').trim();

function fail(msg) { console.error('Build abgebrochen: ' + msg); process.exit(1); }
function jwtRole(k) { try { return JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role; } catch (e) { return null; } }

if (!!url !== !!key) fail('RP_SUPABASE_URL und RP_SUPABASE_PUBLISHABLE_KEY nur gemeinsam setzen.');
if (/\.supabase\.com$/i.test(url)) fail('RP_SUPABASE_URL endet auf .supabase.com. Projektadressen enden auf .supabase.co (ohne m), z. B. https://<ref>.supabase.co');
if (url && !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) fail('RP_SUPABASE_URL ist keine gültige https-Projektadresse.');
if (key) {
  if (/^sb_secret_/.test(key)) fail('Secret Key erkannt. Im Frontend ist nur der Publishable Key erlaubt.');
  const legacy = key.startsWith('eyJ');
  if (legacy && jwtRole(key) !== 'anon') fail('Legacy-Schlüssel ist nicht der anon-Schlüssel (z. B. service_role). Abgebrochen.');
  if (!legacy && !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) fail('Unbekanntes Schlüsselformat. Erwartet sb_publishable_…');
}
if (site && !/^https?:\/\//.test(site)) fail('RP_SITE_URL muss mit https:// beginnen.');
if (!/^\/([A-Za-z0-9._-]+\/)*$/.test(base)) fail('RP_BASE_PATH muss mit / beginnen und enden.');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'vendor'), { recursive: true });
for (const f of FILES) await fs.copyFile(path.join(root, f), path.join(out, f));

const commit = (env.GITHUB_SHA || '').slice(0, 12);
await fs.writeFile(path.join(out, 'config.js'),
  '/* Erzeugt von scripts/build.mjs. Nur öffentliche Werte. */\n' +
  'window.RP_CONFIG = ' + JSON.stringify({ supabaseUrl: url, supabaseKey: key, siteUrl: site || undefined }, null, 2) + ';\n' +
  'window.RP_BUILD = ' + JSON.stringify({ commit, builtAt: new Date().toISOString() }) + ';\n');
/* GitHub Pages: keine Jekyll-Verarbeitung. Unbekannte Pfade zurück zur App (Hash-Routing). */
await fs.writeFile(path.join(out, '.nojekyll'), '');
await fs.writeFile(path.join(out, '404.html'),
  '<!doctype html><meta charset="utf-8"><title>Reiseplaner</title><meta name="robots" content="noindex">' +
  '<script>location.replace(' + JSON.stringify(base) + '+location.search+location.hash)</script>' +
  '<p><a href="' + base + '">Zum Reiseplaner</a></p>\n');

const problems = await checkArtifact(out);
if (problems.length) fail('Artefaktprüfung:\n - ' + problems.join('\n - '));
const list = (await fs.readdir(out, { recursive: true, withFileTypes: true })).filter(d => d.isFile()).map(d => path.relative(out, path.join(d.parentPath || d.path, d.name))).sort();
console.log('public/ erstellt (' + list.length + ' Dateien, Basis ' + base + ', Supabase ' + (url ? 'konfiguriert' : 'nicht konfiguriert – Gastmodus') + '):\n  ' + list.join('\n  '));
