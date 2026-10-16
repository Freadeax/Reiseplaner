/* Konto-Lebenszyklus (Migration 20261016120000) über die ECHTE Supabase-API eines lokal laufenden Stacks:
   Eigentümerwechsel, Kontoübersicht, Kontoexport, Kontolöschung. Start: npm run test:db (nach supabase-api.cjs).
   Ohne laufenden Stack: Test wird übersprungen (mit REQUIRE_DB=1: Fehler). */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const { execSync } = require('child_process');

function stackEnv() {
  try { return JSON.parse(execSync('supabase status -o json', { cwd: path.join(__dirname, '..', '..'), stdio: ['ignore', 'pipe', 'ignore'] }).toString()); }
  catch (e) { return null; }
}
const env = stackEnv();
if (!env || !env.API_URL) {
  if (process.env.REQUIRE_DB) { console.error('Supabase-Stack läuft nicht.'); process.exit(1); }
  console.log('Datenbanktest übersprungen: lokaler Supabase-Stack läuft nicht (supabase start).');
  process.exit(0);
}
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'vendor', 'supabase-js-2.117.2.js'), 'utf8');
vm.runInThisContext(src + '\n;globalThis.__supabaseLib = supabase;');
const { createClient } = globalThis.__supabaseLib;

const URL_ = env.API_URL, KEY = env.PUBLISHABLE_KEY || env.ANON_KEY, MAIL = env.MAILPIT_URL || env.INBUCKET_URL;
const SITE = 'http://127.0.0.1:8080/Reiseplaner/';
const run = Date.now().toString(36);
const memStore = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const client = () => createClient(URL_, KEY, { auth: { flowType: 'pkce', storage: memStore(), persistSession: true, autoRefreshToken: false, detectSessionInUrl: false } });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function mailLink(to, subjectRe) {
  for (let i = 0; i < 40; i++) {
    const r = await (await fetch(MAIL + '/api/v1/search?query=' + encodeURIComponent('to:' + to))).json();
    const m = (r.messages || []).find(x => subjectRe.test(x.Subject));
    if (m) {
      const full = await (await fetch(MAIL + '/api/v1/message/' + m.ID)).json();
      const link = ((full.Text || '') + ' ' + (full.HTML || '')).match(/https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify[^\s"'<>)]*/);
      if (link) return link[0].replace(/&amp;/g, '&');
    }
    await sleep(250);
  }
  throw new Error('Keine E-Mail an ' + to);
}
async function followToCode(link) {
  const res = await fetch(link, { redirect: 'manual' });
  const loc = res.headers.get('location') || '';
  const code = new URL(loc, URL_).searchParams.get('code');
  assert(code, 'Kein PKCE-Code in der Weiterleitung: ' + loc);
  assert(loc.startsWith(SITE), 'Weiterleitung nicht auf die erlaubte Website: ' + loc);
  return code;
}
async function register(name) {
  const c = client(), email = name + '.' + run + '@example.test', password = 'Passwort-' + run + '-' + name;
  const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: SITE } });
  assert.ifError(error);
  assert.equal(data.session, null, 'Ohne E-Mail-Bestätigung darf keine Sitzung entstehen');
  const { error: e2 } = await c.auth.signInWithPassword({ email, password });
  assert(e2, 'Anmeldung vor Bestätigung muss scheitern');
  const code = await followToCode(await mailLink(email, /confirm/i));
  const { data: s, error: e3 } = await c.auth.exchangeCodeForSession(code);
  assert.ifError(e3);
  assert.equal(s.user.email, email);
  return { c, email, password, id: s.user.id };
}
const doc = (id, title, extra) => Object.assign({ id, title, type: 'stadt', status: 'planung', dateMode: 'fix', start: '2027-05-01', end: '2027-05-04', persons: 2, items: [], schemaVersion: 2 }, extra || {});

(async () => {
  const A = await register('alma'), B = await register('bodo'), C = await register('cleo');
  const solo = 't' + run + 'solo', shared = 't' + run + 'shr', given = 't' + run + 'giv', bTrip = 't' + run + 'btr';
  for (const [id, title] of [[solo, 'Allein'], [shared, 'Geteilt'], [given, 'Übergabe']]) {
    const r = await A.c.from('trips').insert({ id, data: doc(id, title) }); assert.ifError(r.error);
  }
  let r = await B.c.from('trips').insert({ id: bTrip, data: doc(bTrip, 'Bodos Reise') }); assert.ifError(r.error);
  const join = async (owner, trip, who, role) => { const t = await owner.c.rpc('create_trip_invite', { p_trip: trip, p_role: role, p_hours: 24 }); assert.ifError(t.error); const j = await who.c.rpc('accept_trip_invite', { p_token: t.data }); assert.ifError(j.error); };
  await join(A, shared, B, 'editor'); await join(A, given, B, 'viewer'); await join(B, bTrip, A, 'editor');
  /* A bearbeitet Bodos Reise: updated_by = A, damit die Löschung den Fremdschlüssel "set null" auslöst */
  r = await A.c.from('trips').update({ data: doc(bTrip, 'Bodos Reise (Alma war hier)') }).eq('id', bTrip).eq('version', 1).select('updated_by,version').single();
  assert.ifError(r.error); assert.equal(r.data.updated_by, A.id);

  /* Übersicht */
  r = await A.c.rpc('my_account_summary'); assert.ifError(r.error);
  assert.equal(r.data.email, A.email);
  assert.deepEqual(r.data.owned.map(t => [t.id, t.members.length]).sort(), [[given, 1], [shared, 1], [solo, 0]].sort());
  assert.deepEqual(r.data.member_of.map(t => [t.id, t.role]), [[bTrip, 'editor']]);
  r = await client().rpc('my_account_summary'); assert(r.error, 'ohne Anmeldung keine Übersicht');

  /* Eigentümerwechsel: nur Eigentümer, nur an Mitglieder, atomar, alter Eigentümer wird Bearbeiter */
  r = await B.c.rpc('transfer_trip_ownership', { p_trip: given, p_new_owner: B.id }); assert(r.error, 'Mitglied kann sich nicht selbst zum Eigentümer machen');
  r = await A.c.rpc('transfer_trip_ownership', { p_trip: given, p_new_owner: C.id }); assert(r.error && /Mitglied/.test(r.error.message), 'nur an bestehende Mitglieder');
  r = await A.c.rpc('transfer_trip_ownership', { p_trip: given, p_new_owner: A.id }); assert(r.error, 'nicht an sich selbst');
  r = await A.c.rpc('transfer_trip_ownership', { p_trip: given, p_new_owner: B.id }); assert.ifError(r.error);
  r = await B.c.from('trips').select('owner_id,version,title').eq('id', given).single();
  assert.equal(r.data.owner_id, B.id); assert.equal(r.data.title, 'Übergabe'); assert.equal(r.data.version, 2, 'Wechsel ist als Änderung sichtbar');
  r = await B.c.rpc('trip_member_list', { p_trip: given }); assert.deepEqual(r.data.map(m => [m.email, m.role]).sort(), [[A.email, 'editor'], [B.email, 'owner']].sort());
  r = await A.c.from('trips').update({ deleted_at: new Date().toISOString() }).eq('id', given).select(); assert(r.error, 'alter Eigentümer darf nicht mehr löschen');
  r = await B.c.from('trips').update({ owner_id: A.id }).eq('id', given); assert(r.error, 'owner_id bleibt für Clients unveränderlich');

  /* Export: alle zugänglichen Reisen mit Rolle, keine fremden */
  r = await A.c.rpc('export_my_account'); assert.ifError(r.error);
  assert.equal(r.data.format, 'reiseplaner-kontoexport'); assert.equal(r.data.account.email, A.email);
  assert.deepEqual(r.data.trips.map(t => [t.id, t.role]).sort(), [[bTrip, 'editor'], [given, 'editor'], [shared, 'owner'], [solo, 'owner']].sort());
  assert.equal(r.data.trips.find(t => t.id === solo).data.title, 'Allein', 'vollständiges Reisedokument');
  assert(r.data.invites_created.length >= 2);
  r = await C.c.rpc('export_my_account'); assert.deepEqual(r.data.trips, [], 'fremde Reisen nicht im Export');

  /* Löschung: Bestätigung, geteilte Reisen nicht still, dann vollständig */
  r = await A.c.rpc('delete_my_account', { p_confirm_email: 'falsch@example.test' }); assert(r.error && /E-Mail-Adresse/.test(r.error.message));
  r = await A.c.rpc('delete_my_account', { p_confirm_email: A.email }); assert(r.error && /geteilte Reise/.test(r.error.message), 'geteilte Reise blockiert ohne Zustimmung');
  r = await A.c.from('trips').select('id').eq('id', solo); assert.equal(r.data.length, 1, 'abgelehnte Löschung ändert nichts');
  r = await B.c.rpc('delete_my_account', { p_confirm_email: A.email }); assert(r.error, 'nur das eigene Konto');
  r = await A.c.rpc('delete_my_account', { p_confirm_email: ' ' + A.email.toUpperCase() + ' ', p_delete_shared: true }); assert.ifError(r.error);
  assert.deepEqual(r.data, { deleted_trips: 2, deleted_shared_trips: 1 });
  r = await B.c.from('trips').select('id,owner_id,updated_by,version,title').in('id', [solo, shared, given, bTrip]);
  assert.deepEqual(r.data.map(t => t.id).sort(), [bTrip, given].sort(), 'eigene Reisen weg, übergebene und fremde bleiben');
  const bt = r.data.find(t => t.id === bTrip);
  assert.equal(bt.updated_by, null); assert.equal(bt.version, 2, 'Fremdschlüssel ändert keine Version'); assert.equal(bt.title, 'Bodos Reise (Alma war hier)');
  r = await B.c.rpc('trip_member_list', { p_trip: given }); assert.deepEqual(r.data.map(m => m.role), ['owner'], 'Mitgliedschaft des gelöschten Kontos entfernt');
  r = await client().auth.signInWithPassword({ email: A.email, password: A.password }); assert(r.error, 'Anmeldung mit gelöschtem Konto unmöglich');
  r = await A.c.from('trips').select('id'); assert(r.error || !(r.data || []).length, 'alte Sitzung sieht nichts mehr');
  r = await B.c.from('trips').update({ data: doc(bTrip, 'Bodo weiter') }).eq('id', bTrip).eq('version', 2).select('version').single();
  assert.ifError(r.error); assert.equal(r.data.version, 3, 'Reise nach Kontolöschung des Bearbeiters normal bearbeitbar');
  console.log('Konto-Lebenszyklus: Übersicht, Eigentümerwechsel (nur Eigentümer, nur Mitglieder, owner_id wandert mit), Export (alle zugänglichen Reisen mit Rolle), Löschung (Bestätigung, geteilte Reisen nur ausdrücklich, Fremdschlüssel ohne Versionssprung, keine Anmeldung danach) geprüft.');
})().catch(e => { console.error(e); process.exit(1); });
