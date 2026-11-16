/* Vorab-Startseite, Suchmaschinen und Link-Vorschauen (16.11.2026): Was vor dem JavaScript im Quelltext steht.
   Node-Prüfung von index.html, og-image.png und den Build-Dateien robots.txt/sitemap.xml. Kein Browser-Test;
   Darstellung ohne und mit JavaScript wurde mit Playwright (Chromium) angesehen. */
const fs = require('fs'), path = require('path'), assert = require('assert'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const URL = 'https://freadeax.github.io/Reiseplaner/';
const head = html.slice(0, html.indexOf('</head>'));
const meta = (attr, name) => (new RegExp('<meta ' + attr + '="' + name + '" content="([^"]*)"').exec(head) || [])[1];

/* 1. Kopf: Titel, Beschreibung, canonical, Open Graph, Twitter, strukturierte Daten – alles im <head>. */
assert(/^<!doctype html><html lang="de" data-layout="book">/.test(html), 'Sprache Deutsch, Reisetagebuch-Stil schon vor dem Skript');
const title = (/<title>([^<]+)<\/title>/.exec(head) || [])[1];
assert(title && title.startsWith('Reiseplaner') && title.length <= 70, 'aussagekräftiger Titel im head (≤ 70 Zeichen): ' + title);
assert.equal((html.match(/<title>/g) || []).length, 1, 'genau ein Titel');
const desc = meta('name', 'description');
assert(desc && desc.length >= 80 && desc.length <= 170, 'Beschreibung 80–170 Zeichen: ' + (desc || '').length);
assert(head.includes('<link rel="canonical" href="' + URL + '">'), 'canonical');
for (const p of ['og:type', 'og:site_name', 'og:locale', 'og:title', 'og:description', 'og:image:alt']) assert(meta('property', p), p);
assert.equal(meta('property', 'og:url'), URL);
assert.equal(meta('property', 'og:image'), URL + 'og-image.png', 'Vorschaubild mit absoluter Adresse (WhatsApp & Co. brauchen sie)');
assert.equal(meta('property', 'og:image:width'), '1200'); assert.equal(meta('property', 'og:image:height'), '630');
assert.equal(meta('name', 'twitter:card'), 'summary_large_image');
assert.equal(meta('name', 'twitter:image'), URL + 'og-image.png');
const ld = JSON.parse((/<script type="application\/ld\+json">([^<]+)<\/script>/.exec(head) || [])[1]);
assert.equal(ld['@type'], 'WebApplication'); assert.equal(ld.url, URL); assert.equal(ld.isAccessibleForFree, true); assert.equal(ld.offers.price, '0');

/* 2. Vorschaubild: PNG 1200 × 630, klein genug für Messenger (WhatsApp lädt Bilder bis etwa 300 KB zuverlässig). */
const png = fs.readFileSync(path.join(ROOT, 'og-image.png'));
assert.equal(png.toString('ascii', 1, 4), 'PNG');
assert.equal(png.readUInt32BE(16), 1200); assert.equal(png.readUInt32BE(20), 630);
assert(png.length < 300 * 1024, 'og-image.png unter 300 KB: ' + png.length);

/* 3. Statischer Inhalt in #view: echte Überschrift und Text statt nur „lädt …“, Ladehinweis als Status, Hinweis ohne JavaScript. */
const view = html.slice(html.indexOf('<main id="view"'), html.indexOf('</main>'));
assert(/<h1>[^<]{10,}<\/h1>/.test(view), 'Überschrift im Quelltext');
assert(!/<h1>Reiseplaner lädt/.test(view), 'nicht mehr nur „Reiseplaner lädt …“');
assert(view.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length > 600, 'genug lesbarer Text für Suchmaschinen');
assert(/role="status"[^>]*>.*aufgeschlagen/.test(view), 'Ladezustand als Status für Vorlesehilfen');
assert(/<noscript>/.test(view) && /<noscript><style>#view \.vorab-laedt,#view \.vorab-hilfe\{display:none\}<\/style><\/noscript>/.test(head), 'ohne JavaScript: klarer Hinweis, kein ewiges „lädt“');
assert(/<a class="start-weg" href="#planen">/.test(view) && /<a class="start-weg" href="#entdecken">/.test(view), 'Startwege als echte Links (Planungswege seit fd8adda unter #planen)');
/* Keine persönlichen Reisedaten im öffentlichen Quelltext (Projektregel). */
for (const bad of ['Hattenhofen', '30.12.', '2027', '@', 'Philipp']) assert(!view.includes(bad), 'keine persönlichen Angaben: ' + bad);
/* Keine Inline-Skripte außer den strukturierten Daten (Service Worker und Tests lesen nur <script src>). */
assert.equal((html.match(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/g) || []).length, 0, 'kein ausführbares Inline-Skript');

/* 4. Build: Adresse ersetzbar, robots.txt und sitemap.xml, Vorschaubild im Artefakt. */
const tmp = fs.mkdtempSync(path.join(ROOT, '.startseite-test-')); /* im Repo, damit rename nicht über Laufwerke geht */
const run = envx => execFileSync(process.execPath, [path.join(ROOT, 'scripts/build.mjs')], { cwd: ROOT, env: Object.assign({}, process.env, { RP_SUPABASE_URL: '', RP_SUPABASE_PUBLISHABLE_KEY: '', RP_SITE_URL: '', RP_PUBLIC_URL: '' }, envx), stdio: 'pipe' });
try {
  /* Build schreibt nach public/; vorher vorhandenes public/ sichern und danach zurücklegen. */
  const pub = path.join(ROOT, 'public'), had = fs.existsSync(pub);
  if (had) fs.renameSync(pub, path.join(tmp, 'public-vorher'));
  try {
    run({});
    const out = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
    assert(out.includes('<link rel="canonical" href="' + URL + '">'), 'GitHub-Pages-Adresse bleibt Standard');
    assert(fs.existsSync(path.join(pub, 'og-image.png')), 'og-image.png im Artefakt');
    assert.equal(fs.readFileSync(path.join(pub, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\n\nSitemap: ' + URL + 'sitemap.xml\n');
    assert(/<loc>https:\/\/freadeax\.github\.io\/Reiseplaner\/<\/loc><lastmod>\d{4}-\d\d-\d\d<\/lastmod>/.test(fs.readFileSync(path.join(pub, 'sitemap.xml'), 'utf8')));
    run({ RP_PUBLIC_URL: 'https://reiseplaner.example.org/', RP_BASE_PATH: '/' });
    const cf = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
    assert(!cf.includes(URL), 'andere Adresse ersetzt alle GitHub-Pages-Verweise');
    assert(cf.includes('<meta property="og:image" content="https://reiseplaner.example.org/og-image.png">'));
    assert(fs.readFileSync(path.join(pub, 'robots.txt'), 'utf8').includes('https://reiseplaner.example.org/sitemap.xml'));
    assert.throws(() => run({ RP_PUBLIC_URL: 'http://unsicher.example/' }), 'nur https-Adressen');
  } finally {
    fs.rmSync(pub, { recursive: true, force: true });
    if (had) fs.renameSync(path.join(tmp, 'public-vorher'), pub);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

console.log('Startseite: Titel, Beschreibung, canonical, Open Graph/Twitter, strukturierte Daten, Vorschaubild 1200×630, statischer Inhalt mit Ladezustand und Hinweis ohne JavaScript, keine persönlichen Angaben, robots.txt/sitemap.xml und Adresswechsel im Build geprüft.');
