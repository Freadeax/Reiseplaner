/* Rechte-, Auth- und Konfliktprüfung über die ECHTE Supabase-API (Auth + PostgREST) eines lokal
   laufenden Supabase-Stacks (`supabase start`). Prüft nicht nur Bedienelemente, sondern was die
   Datenbank tatsächlich erlaubt. Start: npm run test:db
   Voraussetzung: Docker + Supabase CLI, Stack läuft. Ohne laufenden Stack: Test wird übersprungen. */
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
  const anon = client();
  const A = await register('anna'), B = await register('ben'), C = await register('carla');
  const tid = 't' + run + 'x';

  /* Anlegen: Eigentümer und Version kommen vom Server */
  let r = await A.c.from('trips').insert({ id: tid, data: doc(tid, 'Wien') }).select().single();
  assert.ifError(r.error);
  assert.equal(r.data.owner_id, A.id); assert.equal(r.data.version, 1); assert.equal(r.data.title, 'Wien');
  assert.equal(r.data.start_date, '2027-05-01'); assert.equal(r.data.date_mode, 'fix');
  r = await A.c.from('trips').insert({ id: 't' + run + 'y', owner_id: B.id, data: doc('t' + run + 'y', 'X') });
  assert(r.error, 'owner_id darf nicht vom Client gesetzt werden');
  r = await A.c.from('trips').insert({ id: 't' + run + 'z', data: doc('tANDERS', 'X') });
  assert(r.error, 'data.id muss zur Zeilen-ID passen');
  r = await A.c.from('trips').insert({ id: 't' + run + 'w', data: doc('t' + run + 'w', 'X', { end: null }) });
  assert(r.error, 'festes Datum ohne Abreise wird abgewiesen');
  r = await A.c.from('trips').insert({ id: 't' + run + 'v', data: doc('t' + run + 'v', 'X', { schemaVersion: 1 }) });
  assert(r.error, 'nur schemaVersion 2');

  /* Unangemeldet und unberechtigt: nichts sichtbar, nichts änderbar */
  r = await anon.from('trips').select('id'); assert.deepEqual(r.data || [], []);
  r = await anon.from('trips').insert({ id: 't' + run + 'anon', data: doc('t' + run + 'anon', 'X') }); assert(r.error);
  r = await C.c.from('trips').select('id').eq('id', tid); assert.deepEqual(r.data, []);
  r = await C.c.from('trips').update({ data: doc(tid, 'gehackt') }).eq('id', tid).select(); assert.deepEqual(r.data || [], []);
  r = await C.c.from('trips').delete().eq('id', tid).select(); assert.deepEqual(r.data || [], []);
  r = await C.c.from('trip_members').insert({ trip_id: tid, user_id: C.id, role: 'editor' }); assert(r.error, 'keine Selbst-Mitgliedschaft');
  r = await C.c.rpc('trip_member_list', { p_trip: tid }); assert(r.error);
  r = await C.c.rpc('create_trip_invite', { p_trip: tid, p_role: 'editor', p_hours: 24 }); assert(r.error);
  r = await A.c.from('trips').select('version').eq('id', tid).single(); assert.equal(r.data.version, 1, 'unberechtigte Änderung hat nichts verändert');

  /* Einladung als Bearbeiter */
  r = await A.c.rpc('create_trip_invite', { p_trip: tid, p_role: 'owner', p_hours: 24 }); assert(r.error, 'keine Eigentümer-Einladung');
  r = await A.c.rpc('create_trip_invite', { p_trip: tid, p_role: 'editor', p_hours: 0 }); assert(r.error, 'Gültigkeit begrenzt');
  r = await A.c.rpc('create_trip_invite', { p_trip: tid, p_role: 'editor', p_hours: 24 }); assert.ifError(r.error);
  const tokenB = r.data;
  r = await A.c.from('trip_invites').select('token_hash'); assert(r.data.every(x => x.token_hash !== tokenB), 'Token nur als Hash gespeichert');
  r = await B.c.rpc('accept_trip_invite', { p_token: tokenB }); assert.ifError(r.error); assert.equal(r.data, tid);
  r = await C.c.rpc('accept_trip_invite', { p_token: tokenB }); assert(r.error, 'Einladung nur einmal verwendbar');
  r = await B.c.from('trip_invites').select('id'); assert.deepEqual(r.data, [], 'Nicht-Eigentümer sehen keine Einladungen');
  r = await B.c.rpc('trip_member_list', { p_trip: tid }); assert.ifError(r.error);
  assert.deepEqual(r.data.map(x => x.role).sort(), ['editor', 'owner']);

  /* Gleichzeitige Bearbeitung: nur die Version, die der Client kannte, wird überschrieben */
  r = await B.c.from('trips').update({ data: doc(tid, 'Wien (Ben)') }).eq('id', tid).eq('version', 1).select().single();
  assert.ifError(r.error); assert.equal(r.data.version, 2); assert.equal(r.data.updated_by, B.id);
  r = await A.c.from('trips').update({ data: doc(tid, 'Wien (Anna, veraltet)') }).eq('id', tid).eq('version', 1).select();
  assert.ifError(r.error); assert.deepEqual(r.data, [], 'veraltete Version wird nicht gespeichert');
  r = await A.c.from('trips').select('title,version').eq('id', tid).single(); assert.deepEqual(r.data, { title: 'Wien (Ben)', version: 2 });

  /* Bearbeiter darf sich nicht hochstufen, nicht löschen, nicht einladen, Eigentümer nicht ändern */
  r = await B.c.from('trip_members').update({ role: 'owner' }).eq('trip_id', tid).eq('user_id', B.id).select(); assert(r.error || !r.data.length);
  r = await B.c.from('trip_members').update({ role: 'viewer' }).eq('trip_id', tid).eq('user_id', A.id).select(); assert(r.error || !r.data.length);
  r = await B.c.rpc('create_trip_invite', { p_trip: tid, p_role: 'viewer', p_hours: 24 }); assert(r.error);
  r = await B.c.from('trips').update({ deleted_at: new Date().toISOString() }).eq('id', tid).select(); assert(r.error, 'nur Eigentümer löscht');
  r = await B.c.from('trips').delete().eq('id', tid).select(); assert.deepEqual(r.data || [], []);
  r = await B.c.from('trips').update({ owner_id: B.id }).eq('id', tid); assert(r.error, 'owner_id nicht änderbar');
  r = await B.c.from('trips').update({ version: 99 }).eq('id', tid); assert(r.error, 'version nicht vom Client setzbar');

  /* Widerrufene Einladung, Leserecht, Rechteänderung, Entzug */
  r = await A.c.rpc('create_trip_invite', { p_trip: tid, p_role: 'viewer', p_hours: 24 }); const revoked = r.data;
  r = await A.c.from('trip_invites').update({ revoked_at: new Date().toISOString() }).is('used_at', null).is('revoked_at', null).eq('trip_id', tid).select(); assert.equal(r.data.length, 1);
  r = await C.c.rpc('accept_trip_invite', { p_token: revoked }); assert(r.error, 'widerrufene Einladung');
  r = await C.c.rpc('accept_trip_invite', { p_token: 'erfunden' }); assert(r.error);
  r = await A.c.rpc('create_trip_invite', { p_trip: tid, p_role: 'viewer', p_hours: 24 });
  r = await C.c.rpc('accept_trip_invite', { p_token: r.data }); assert.ifError(r.error);
  r = await C.c.from('trips').select('title').eq('id', tid); assert.equal(r.data.length, 1, 'Leser sieht die Reise');
  r = await C.c.from('trips').update({ data: doc(tid, 'Leser ändert') }).eq('id', tid).eq('version', 2).select(); assert.deepEqual(r.data || [], [], 'Leser kann nicht ändern');
  r = await A.c.from('trip_members').update({ role: 'viewer' }).eq('trip_id', tid).eq('user_id', B.id).select(); assert.equal(r.data[0].role, 'viewer');
  r = await B.c.from('trips').update({ data: doc(tid, 'Ben als Leser') }).eq('id', tid).eq('version', 2).select(); assert.deepEqual(r.data || [], [], 'herabgestufter Bearbeiter kann nicht ändern');
  r = await A.c.from('trip_members').delete().eq('trip_id', tid).eq('user_id', C.id).select(); assert.equal(r.data.length, 1);
  r = await C.c.from('trips').select('id').eq('id', tid); assert.deepEqual(r.data, [], 'nach Entzug kein Zugriff');
  r = await A.c.from('trip_members').delete().eq('trip_id', tid).eq('user_id', A.id).select(); assert.deepEqual(r.data || [], [], 'Eigentümer kann sich nicht entfernen');

  /* An E-Mail gebundene Einladung: falsches Konto abgewiesen, richtiges Konto angenommen */
  r = await A.c.rpc('create_trip_invite', { p_trip: tid, p_role: 'viewer', p_hours: 24, p_email: C.email.toUpperCase() }); assert.ifError(r.error);
  const bound = r.data;
  r = await B.c.rpc('accept_trip_invite', { p_token: bound }); assert(r.error && /andere E-Mail/.test(r.error.message), 'falsches Konto abgewiesen');
  r = await C.c.rpc('accept_trip_invite', { p_token: bound }); assert.ifError(r.error);
  r = await C.c.from('trips').select('id').eq('id', tid); assert.equal(r.data.length, 1);
  r = await A.c.from('trip_members').delete().eq('trip_id', tid).eq('user_id', C.id).select(); assert.equal(r.data.length, 1);

  /* Soft-Delete durch Eigentümer: Mitglieder sehen die Löschung (für Offline-Abgleich) */
  r = await A.c.from('trips').update({ deleted_at: new Date().toISOString() }).eq('id', tid).eq('version', 2).select().single();
  assert.ifError(r.error); assert(r.data.deleted_at); assert.equal(r.data.version, 3);
  r = await B.c.from('trips').select('deleted_at').eq('id', tid).single(); assert(r.data.deleted_at, 'Mitglied sieht Löschmarkierung');
  r = await A.c.rpc('create_trip_invite', { p_trip: tid, p_role: 'viewer', p_hours: 24 }); assert(r.error, 'keine Einladung zu gelöschter Reise');

  /* Passwort vergessen: E-Mail, Link mit PKCE-Code zurück auf die Website, neues Passwort */
  const R = client();
  r = await R.auth.resetPasswordForEmail(C.email, { redirectTo: SITE }); assert.ifError(r.error);
  const code = await followToCode(await mailLink(C.email, /reset/i));
  r = await R.auth.exchangeCodeForSession(code); assert.ifError(r.error);
  r = await R.auth.updateUser({ password: 'Neues-Passwort-' + run }); assert.ifError(r.error);
  r = await client().auth.signInWithPassword({ email: C.email, password: C.password }); assert(r.error, 'altes Passwort ungültig');
  const C2 = client(); r = await C2.auth.signInWithPassword({ email: C.email, password: 'Neues-Passwort-' + run }); assert.ifError(r.error);

  /* Abmelden: danach keine Daten mehr */
  await A.c.auth.signOut();
  r = await A.c.from('trips').select('id'); assert.deepEqual(r.data || [], []);
  console.log('Supabase-API: Registrierung mit Bestätigung, Anmeldung, Abmeldung, Passwort-Reset, Eigentümer/Bearbeiter/Leser, unberechtigtes Konto, Einladung einmalig/widerrufen, Rechteänderung/Entzug, Versionskonflikt, Soft-Delete geprüft.');
})().catch(e => { console.error(e); process.exit(1); });
