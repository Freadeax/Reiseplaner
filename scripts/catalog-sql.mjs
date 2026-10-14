#!/usr/bin/env node
/* Erzeugt aus catalog-data.js (einzige Quelle) die Seed-Migration und die Datei für den SQL-Editor (Issue #7).
     node scripts/catalog-sql.mjs           Dateien schreiben
     node scripts/catalog-sql.mjs --check   nur prüfen, ob Daten gültig und Dateien aktuell sind (Teil von npm test)
   Neue Katalogversion: "version" in catalog-data.js erhöhen und das Skript mit --stamp JJJJMMTTHHMMSS ausführen.
   So entsteht eine NEUE Seed-Migration; bereits eingespielte Migrationen werden nie geändert. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = path.join(root, 'supabase', 'migrations');
const SCHEMA = '20261014160000_catalog.sql';
const KINDS = ['natur', 'wasser', 'berge', 'stadt', 'kultur', 'burg', 'therme', 'familie', 'genuss', 'technik', 'winter', 'unterwelt'];
const SLOTS = ['', 'morgen', 'mittag', 'nachm', 'abend'];
/* Preise und Öffnungszeiten gehören nicht in den Katalog (AGENTS.md: nichts erfinden) */
const FORBIDDEN = [[/€|\bEUR\b|\bEuro\b|kostenlos|gratis|umsonst|eintritt frei/i, 'Preisangabe'], [/\b\d{1,2}[:.]\d{2}\s*Uhr|\bab \d{1,2} Uhr|\bbis \d{1,2} Uhr/i, 'Uhrzeit/Öffnungszeit']];

export async function loadCatalog(file = path.join(root, 'catalog-data.js')) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(await fs.readFile(file, 'utf8'), ctx);
  return JSON.parse(JSON.stringify(ctx.window.RP_CATALOG));
}

function air(a, b) {
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function validateCatalog(c) {
  const errs = [], ids = new Set();
  const e = m => errs.push(m);
  if (!Number.isInteger(c.version) || c.version < 1) e('version muss eine positive ganze Zahl sein');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.checked || '')) e('checked (Prüfdatum JJJJ-MM-TT) fehlt');
  if (!Array.isArray(c.places) || !c.places.length) { e('places fehlt'); return errs; }
  const months = (m, w) => { if (!Array.isArray(m) || m.some(x => !Number.isInteger(x) || x < 1 || x > 12) || new Set(m).size !== m.length) e(w + ': months ungültig'); };
  const point = (o, w) => { if (!(Math.abs(o.lat) <= 90 && Math.abs(o.lon) <= 180) || typeof o.lat !== 'number' || typeof o.lon !== 'number') e(w + ': Koordinaten ungültig'); };
  const text = (s, w) => { for (const [re, l] of FORBIDDEN) if (re.test(s || '')) e(w + ': ' + l + ' im Text'); };
  for (const p of c.places) {
    const w = 'Ziel ' + p.id;
    if (!/^[a-z0-9-]{2,40}$/.test(p.id || '')) e(w + ': id ungültig');
    if (ids.has(p.id)) e(w + ': id doppelt'); ids.add(p.id);
    if (!p.name || p.name.length > 120) e(w + ': name');
    if (!/^[A-Z]{2}$/.test(p.country || '')) e(w + ': country');
    point(p, w); months(p.months, w);
    if (!Array.isArray(p.kinds) || !p.kinds.length || p.kinds.some(k => !KINDS.includes(k))) e(w + ': kinds');
    if (!Array.isArray(p.nights) || p.nights.length !== 2 || !(p.nights[0] >= 0 && p.nights[1] >= p.nights[0] && p.nights[1] <= 60)) e(w + ': nights');
    if (!p.summary || p.summary.length > 300) e(w + ': summary');
    text(p.summary, w); text(p.angle, w);
    if (!Array.isArray(p.spots) || p.spots.length < 3) e(w + ': mindestens 3 Attraktionen');
    for (const s of p.spots || []) {
      const ws = 'Attraktion ' + s.id;
      if (!/^[a-z0-9-]{2,80}$/.test(s.id || '') || !s.id.startsWith(p.id + '-')) e(ws + ': id muss mit „' + p.id + '-“ beginnen');
      if (ids.has(s.id)) e(ws + ': id doppelt'); ids.add(s.id);
      if (!s.name || s.name.length > 160) e(ws + ': name');
      if (!KINDS.includes(s.kind)) e(ws + ': kind');
      point(s, ws);
      if (!(s.hours > 0 && s.hours <= 12)) e(ws + ': hours');
      if (s.months) months(s.months, ws);
      if (!SLOTS.includes(s.slot || '')) e(ws + ': slot');
      if (!s.summary || s.summary.length > 300) e(ws + ': summary');
      text(s.summary, ws); text(s.tip, ws);
      if (Math.abs(p.lat) <= 90 && Math.abs(s.lat) <= 90 && air(p, s) > 60) e(ws + ': liegt ' + Math.round(air(p, s)) + ' km vom Ziel entfernt (höchstens 60)');
      for (const k of Object.keys(s)) if (!['id', 'name', 'kind', 'lat', 'lon', 'hours', 'indoor', 'family', 'months', 'slot', 'summary', 'tip'].includes(k)) e(ws + ': unbekanntes Feld ' + k);
    }
    for (const k of Object.keys(p)) if (!['id', 'name', 'region', 'country', 'lat', 'lon', 'kinds', 'months', 'nights', 'summary', 'angle', 'spots'].includes(k)) e(w + ': unbekanntes Feld ' + k);
  }
  return errs;
}

const q = s => "'" + String(s ?? '').replace(/'/g, "''") + "'";
const arr = (a, t) => 'array[' + (a || []).map(x => t === 'text' ? q(x) : String(x)).join(',') + ']::' + t + '[]';
const n = x => Number(x).toString();

export function seedSql(c) {
  const v = c.version;
  const places = c.places.map(p => '  (' + [q(p.id), q(p.name), q(p.region), q(p.country), n(p.lat), n(p.lon), arr(p.kinds, 'text'), arr(p.months, 'smallint'),
    p.nights[0], p.nights[1], q(p.summary), q(p.angle), v].join(', ') + ')');
  const spots = [];
  c.places.forEach(p => p.spots.forEach((s, i) => spots.push('  (' + [q(s.id), q(p.id), q(s.name), q(s.kind), n(s.lat), n(s.lon), n(s.hours), !!s.indoor, !!s.family,
    arr(s.months || [], 'smallint'), q(s.slot || ''), q(s.summary), q(s.tip || ''), i, v].join(', ') + ')')));
  const set = cols => cols.map(k => k + ' = excluded.' + k).join(', ') + ', updated_at = now()';
  return '-- Reiseplaner · Umkreis-Katalog Version ' + v + ' (Stand ' + c.checked + ')\n' +
    '-- ERZEUGT von scripts/catalog-sql.mjs aus catalog-data.js. Nicht von Hand ändern.\n' +
    '-- ' + c.places.length + ' Ziele, ' + spots.length + ' Attraktionen. Ältere Katalogversionen werden am Ende entfernt.\n\n' +
    'insert into public.catalog_places (id, name, region, country, lat, lon, kinds, months, nights_min, nights_max, summary, angle, catalog_version) values\n' +
    places.join(',\n') + '\non conflict (id) do update set ' + set(['name', 'region', 'country', 'lat', 'lon', 'kinds', 'months', 'nights_min', 'nights_max', 'summary', 'angle', 'catalog_version']) + ';\n\n' +
    'insert into public.catalog_spots (id, place_id, name, kind, lat, lon, hours, indoor, family, months, slot, summary, tip, ord, catalog_version) values\n' +
    spots.join(',\n') + '\non conflict (id) do update set ' + set(['place_id', 'name', 'kind', 'lat', 'lon', 'hours', 'indoor', 'family', 'months', 'slot', 'summary', 'tip', 'ord', 'catalog_version']) + ';\n\n' +
    'delete from public.catalog_spots where catalog_version <> ' + v + ';\n' +
    'delete from public.catalog_places where catalog_version <> ' + v + ';\n';
}

function manualSql(schema, seed, seedName, version) {
  const hist = (ver, name) => "insert into supabase_migrations.schema_migrations (version, name) values ('" + ver + "', '" + name + "') on conflict (version) do nothing;";
  const [sv, ...sn] = SCHEMA.replace('.sql', '').split('_'), [dv, ...dn] = seedName.replace('.sql', '').split('_');
  /* Version 1 bringt das Schema mit; ab Version 2 liegt es schon in der Datenbank, die Datei enthält nur die Daten. */
  const withSchema = version === 1;
  return '-- NUR FALLS NÖTIG im Supabase-Dashboard unter "SQL Editor" ausführen: wenn die GitHub-Integration die Migration\n' +
    '-- ' + seedName + ' nach etwa einer Stunde nicht eingespielt hat (Katalog meldet weiter die alte Version).\n' +
    '-- ERZEUGT von scripts/catalog-sql.mjs. Läuft in einer Transaktion und trägt die Migration in die Historie ein,\n' +
    '-- damit Integration und `supabase db push` sie nicht doppelt ausführen.' + (withSchema ? ' Ist das Schema schon da, bricht die Datei\n-- beim ersten create table ohne Änderung ab.' : ' Wiederholtes Ausführen ändert nichts (Upsert).') + '\n\nbegin;\n\n' +
    (withSchema ? schema + '\n' : '') + seed + '\n' +
    'create schema if not exists supabase_migrations;\n' +
    'create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text);\n' +
    (withSchema ? hist(sv, sn.join('_')) + '\n' : '') + hist(dv, dn.join('_')) + '\n\ncommit;\n';
}

async function main() {
  const check = process.argv.includes('--check');
  const si = process.argv.indexOf('--stamp'), stamp = si > 0 ? process.argv[si + 1] : null;
  const c = await loadCatalog();
  const errs = validateCatalog(c);
  if (errs.length) { console.error('Katalog ungültig:\n - ' + errs.join('\n - ')); process.exit(1); }
  const files = await fs.readdir(MIG);
  const suffix = '_catalog_seed_v' + c.version + '.sql';
  let seedName = files.find(f => f.endsWith(suffix));
  if (!seedName) {
    if (check || !stamp || !/^\d{14}$/.test(stamp)) { console.error('Keine Seed-Migration für Katalogversion ' + c.version + '. Mit --stamp JJJJMMTTHHMMSS anlegen.'); process.exit(1); }
    seedName = stamp + suffix;
  }
  const seed = seedSql(c);
  const schema = await fs.readFile(path.join(MIG, SCHEMA), 'utf8');
  const manualName = path.join(root, 'supabase', 'manual', 'apply-catalog-v' + c.version + '.sql');
  const want = [[path.join(MIG, seedName), seed], [manualName, manualSql(schema, seed, seedName, c.version)]];
  let stale = [];
  for (const [f, content] of want) {
    let have = null; try { have = await fs.readFile(f, 'utf8'); } catch (e) {}
    if (have === content) continue;
    if (check) stale.push(path.relative(root, f));
    else { await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, content); console.log('geschrieben: ' + path.relative(root, f)); }
  }
  if (stale.length) { console.error('Veraltet (node scripts/catalog-sql.mjs ausführen):\n - ' + stale.join('\n - ')); process.exit(1); }
  const spots = c.places.reduce((s, p) => s + p.spots.length, 0);
  console.log('Katalog v' + c.version + ': ' + c.places.length + ' Ziele, ' + spots + ' Attraktionen, gültig' + (check ? ', Migrationen aktuell.' : '.'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
