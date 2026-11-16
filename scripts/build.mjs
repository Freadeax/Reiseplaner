#!/usr/bin/env node
/* Erzeugt das Website-Artefakt in public/ (Issue #6). Kein Framework, kein Bundler:
   nur die Dateien, die der Browser braucht. Docs, Tests, SQL und Entwicklungsdateien bleiben draußen.
   Öffentliche Konfiguration aus Umgebungsvariablen:
     RP_SUPABASE_URL                 z. B. https://<ref>.supabase.co   (leer = Gastmodus)
     RP_SUPABASE_PUBLISHABLE_KEY     sb_publishable_…                  (niemals Secret/service_role)
     RP_SITE_URL                     optional, feste Weiterleitungsadresse für E-Mails
     RP_BASE_PATH                    Pfad der Website, Standard /Reiseplaner/ (GitHub Pages), / für Cloudflare Pages
     RP_PUBLIC_URL                   optional, öffentliche Adresse für Suchmaschinen und Link-Vorschauen (canonical, og:url,
                                     og:image, sitemap.xml). Standard: RP_SITE_URL, falls es auf / endet, sonst GitHub Pages. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { checkArtifact } from './check-artifact.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public');
const FILES = ['index.html', 'app.css', 'sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og-image.png', 'cloud.js', 'catalog.js', 'v3logic.js', 'v3forms.js', 'v3editor.js', 'v3split.js', 'istvergleich.js', 'rpstore.js', 'platform.js', 'v3journal.js', 'v4logic.js', 'v5logic.js', 'packlogic.js', 'merge3.js', 'bookgen.js', 'bookedit.js', 'bookprint.js', 'photostore.js', 'docstore.js', 'catalog-data.js',
  'vendor/supabase-js-2.117.2.js', 'vendor/supabase-js-LICENSE.txt'];
/* Kachel-Katalog: Index und Kacheln (nicht die Quelle catalog/src) */
/* App-Code seit P0.6 in app/*.js */
FILES.push(...(await fs.readdir(path.join(root, 'app'))).filter(f => /^[a-z0-9-]+\.js$/.test(f)).sort().map(f => 'app/' + f));
FILES.push('catalog/index.js', ...(await fs.readdir(path.join(root, 'catalog'))).filter(f => /^t-[a-z0-9]+\.js$/.test(f)).sort().map(f => 'catalog/' + f));

const env = process.env;
const url = (env.RP_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const key = (env.RP_SUPABASE_PUBLISHABLE_KEY || '').trim();
const site = (env.RP_SITE_URL || '').trim();
const base = (env.RP_BASE_PATH || '/Reiseplaner/').trim();
/* Adresse, die in index.html steht (canonical, Open Graph). Der Build ersetzt sie, wenn die Seite woanders liegt. */
const PAGES_URL = 'https://freadeax.github.io/Reiseplaner/';
const publicUrl = (env.RP_PUBLIC_URL || '').trim() || (/^https:\/\/.+\/$/.test(site) ? site : PAGES_URL);

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
if (!/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[A-Za-z0-9._~-]+)*\/$/i.test(publicUrl)) fail('RP_PUBLIC_URL muss mit https:// beginnen und mit / enden.');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'vendor'), { recursive: true });
await fs.mkdir(path.join(out, 'catalog'), { recursive: true });
await fs.mkdir(path.join(out, 'app'), { recursive: true });
for (const f of FILES) await fs.copyFile(path.join(root, f), path.join(out, f));

const commit = (env.GITHUB_SHA || '').slice(0, 12);
await fs.writeFile(path.join(out, 'config.js'),
  '/* Erzeugt von scripts/build.mjs. Nur öffentliche Werte. */\n' +
  'window.RP_CONFIG = ' + JSON.stringify({ supabaseUrl: url, supabaseKey: key, siteUrl: site || undefined }, null, 2) + ';\n' +
  'window.RP_BUILD = ' + JSON.stringify({ commit, builtAt: new Date().toISOString() }) + ';\n');
/* Suchmaschinen und Link-Vorschauen: öffentliche Adresse einsetzen, robots.txt und sitemap.xml erzeugen.
   Hinweis: Auf GitHub Pages (Projektseite unter /Reiseplaner/) lesen Suchmaschinen robots.txt nur im Wurzelpfad
   der Domain; die Datei wirkt erst mit eigener Domain oder Cloudflare Pages. Die Sitemap lässt sich trotzdem
   in der Google Search Console angeben. */
{
  const idx = path.join(out, 'index.html');
  const html = await fs.readFile(idx, 'utf8');
  if (!html.includes(PAGES_URL)) fail('index.html: öffentliche Adresse ' + PAGES_URL + ' fehlt (canonical/Open Graph).');
  await fs.writeFile(idx, html.split(PAGES_URL).join(publicUrl));
  await fs.writeFile(path.join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + publicUrl + 'sitemap.xml\n');
  await fs.writeFile(path.join(out, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>' + publicUrl + '</loc><lastmod>' + new Date().toISOString().slice(0, 10) + '</lastmod></url>\n</urlset>\n');
}
/* Cache-Bust: Lokale Skripte und das Stylesheet bekommen ?v=<Inhaltshash>, damit Browser- und CDN-Caches
   nach einer neuen Version keine alten Einzeldateien mit neuen mischen (seit P0.6 besteht die App aus vielen Dateien). */
{
  const idx = path.join(out, 'index.html');
  let html = await fs.readFile(idx, 'utf8');
  const hashes = new Map();
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"#?:]+\.(?:js|css))"/g)) {
    if (hashes.has(m[1])) continue;
    hashes.set(m[1], createHash('sha256').update(await fs.readFile(path.join(out, m[1]))).digest('hex').slice(0, 10));
  }
  html = html.replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=")([^"#?:]+\.(?:js|css))"/g, (all, pre, f) => pre + f + '?v=' + hashes.get(f) + '"');
  await fs.writeFile(idx, html);
}
/* Service Worker (docs/OFFLINE.md §4.1): STAND = Hash über alle ausgelieferten Dateien. So ändert sich sw.js bei jeder
   neuen Version, der Browser installiert einen vollständigen neuen Stand, und niemand zählt mehr Nummern von Hand hoch. */
{
  const swPath = path.join(out, 'sw.js');
  const sw = await fs.readFile(swPath, 'utf8');
  if (!/^const STAND = 'dev';$/m.test(sw)) fail("sw.js: Zeile const STAND = 'dev'; fehlt.");
  const all = (await fs.readdir(out, { recursive: true, withFileTypes: true })).filter(d => d.isFile()).map(d => path.relative(out, path.join(d.parentPath || d.path, d.name))).filter(f => f !== 'sw.js').sort();
  const h = createHash('sha256');
  for (const f of all) { h.update(f + '\0'); h.update(await fs.readFile(path.join(out, f))); }
  const stand = h.digest('hex').slice(0, 12);
  await fs.writeFile(swPath, sw.replace(/^const STAND = 'dev';$/m, 'const STAND = ' + JSON.stringify(stand) + ';'));
  console.log('Service Worker: Stand ' + stand);
}
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
