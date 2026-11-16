/* Gemeinsam planen G6 (Migration 20261116200000_mitreisende): Konto mit einem Eintrag der Reisegruppe verknüpfen
   (party[].member) über die ECHTE Supabase-API eines lokal laufenden Stacks. Nur die Person selbst verknüpft sich;
   Schutz im Trigger trips_party_guard, Weg für Leser über claim_party. Ohne Stack übersprungen (REQUIRE_DB=1: Fehler). */
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
const rejects = (r, re, msg) => { assert(r.error, msg + ' (kein Fehler)'); if (re) assert(re.test(r.error.message), msg + ': ' + r.error.message); };

setTimeout(() => { console.error('Zeitüberschreitung im Datenbanktest'); process.exit(1); }, 150000);
const party = () => [{ id: 'p1', name: 'Olga' }, { id: 'p2', name: 'Emil' }, { id: 'p3', name: 'Vera' }, { id: 'p4', name: 'Kind' }];
const doc5 = (id, extra) => Object.assign({ id, title: 'Gruppe', type: 'stadt', status: 'planung', dateMode: 'open', persons: 4, items: [], schemaVersion: 5, party: party() }, extra || {});
const members = d => Object.fromEntries((d.party || []).filter(p => p.member).map(p => [p.id, p.member]));
(async () => {
  const O = await register('olga'), E = await register('emil'), V = await register('vera'), X = await register('xaver');
  const trip = 't' + run + 'mit';
  /* Anlegen: fremde Verknüpfung wird entfernt, eigene bleibt */
  let r = await O.c.from('trips').insert({ id: trip, data: doc5(trip, { party: [{ id: 'p1', name: 'Olga', member: O.id }, { id: 'p2', name: 'Emil', member: E.id }, { id: 'p3', name: 'Vera' }, { id: 'p4', name: 'Kind' }] }) }).select('data,version').single();
  assert.ifError(r.error);
  assert.deepEqual(members(r.data.data), { p1: O.id }, 'beim Anlegen nur eigene Verknüpfung');
  const join = async (who, role) => { const t = await O.c.rpc('create_trip_invite', { p_trip: trip, p_role: role, p_hours: 24 }); assert.ifError(t.error); const j = await who.c.rpc('accept_trip_invite', { p_token: t.data }); assert.ifError(j.error); };
  await join(E, 'editor'); await join(V, 'viewer');
  const get = async () => { const g = await O.c.from('trips').select('data,version').eq('id', trip).single(); assert.ifError(g.error); return g.data; };

  /* claim_party: Bearbeiter und Leser verknüpfen sich selbst */
  r = await E.c.rpc('claim_party', { p_trip: trip, p_party: 'p2', p_link: true }); assert.ifError(r.error);
  r = await V.c.rpc('claim_party', { p_trip: trip, p_party: 'p3', p_link: true }); assert.ifError(r.error);
  let cur = await get(); assert.deepEqual(members(cur.data), { p1: O.id, p2: E.id, p3: V.id });
  rejects(await V.c.rpc('claim_party', { p_trip: trip, p_party: 'p2', p_link: true }), /anderen Konto/, 'besetzte Person übernehmen');
  rejects(await X.c.rpc('claim_party', { p_trip: trip, p_party: 'p4', p_link: true }), /Kein Zugriff/, 'Fremder');
  rejects(await V.c.rpc('claim_party', { p_trip: trip, p_party: 'zz', p_link: true }), /nicht gefunden/, 'unbekannte Person');
  rejects(await V.c.rpc('claim_party', { p_trip: trip, p_party: 'p2', p_link: false }), /selbst oder der Eigentümer/, 'Leser löst fremde Verknüpfung');
  /* Wechsel: Vera wählt p4, p3 wird frei */
  r = await V.c.rpc('claim_party', { p_trip: trip, p_party: 'p4', p_link: true }); assert.ifError(r.error);
  cur = await get(); assert.deepEqual(members(cur.data), { p1: O.id, p2: E.id, p4: V.id }, 'Wechsel löst alte eigene Verknüpfung');
  const v0 = cur.version;
  r = await V.c.rpc('claim_party', { p_trip: trip, p_party: 'p4', p_link: true }); assert.ifError(r.error);
  assert.equal(r.data, v0, 'nichts geändert → keine neue Version');

  /* Direktes Speichern durch Bearbeiter: fremde Verknüpfungen bleiben, eigene darf er setzen/lösen */
  let d = cur.data; d.party = party(); d.party[2].member = O.id; d.notes = 'Emil speichert alten Stand';
  r = await E.c.from('trips').update({ data: d }).eq('id', trip).eq('version', cur.version).select('data,version').single();
  assert.ifError(r.error);
  assert.deepEqual(members(r.data.data), { p1: O.id, p4: V.id }, 'fremde Verknüpfungen bleiben, eigene (p2) entfernt, fremdes Konto nicht verknüpfbar');
  assert.equal(r.data.data.notes, 'Emil speichert alten Stand', 'übrige Änderung kommt an');
  /* Bearbeiter verknüpft sich selbst direkt; zweimal dasselbe Konto scheitert */
  d = r.data.data; d.party[1].member = E.id;
  r = await E.c.from('trips').update({ data: d }).eq('id', trip).eq('version', r.data.version).select('data,version').single(); assert.ifError(r.error);
  assert.deepEqual(members(r.data.data), { p1: O.id, p2: E.id, p4: V.id });
  d = r.data.data; d.party[2].member = E.id;
  rejects(await E.c.from('trips').update({ data: d }).eq('id', trip).eq('version', r.data.version).select('version'), /zwei Mitreisenden/, 'Konto doppelt');
  /* Eigentümer überschreibt fremde Verknüpfung nicht, darf sie aber lösen */
  cur = await get(); d = cur.data; d.party[3].member = O.id; d.party[0].member = undefined; d = JSON.parse(JSON.stringify(d));
  r = await O.c.from('trips').update({ data: d }).eq('id', trip).eq('version', cur.version).select('data,version').single(); assert.ifError(r.error);
  assert.deepEqual(members(r.data.data), { p2: E.id, p4: V.id }, 'Eigentümer überschreibt Vera nicht');
  r = await O.c.rpc('claim_party', { p_trip: trip, p_party: 'p4', p_link: false }); assert.ifError(r.error);
  cur = await get(); assert.deepEqual(members(cur.data), { p2: E.id }, 'Eigentümer löst Veras Verknüpfung');
  /* Eintrag der Reisegruppe löschen nimmt die Verknüpfung mit */
  d = cur.data; d.party = d.party.filter(p => p.id !== 'p2');
  r = await O.c.from('trips').update({ data: d }).eq('id', trip).eq('version', cur.version).select('data').single(); assert.ifError(r.error);
  assert.deepEqual(members(r.data.data), {});
  /* Ehemaliges Mitglied: Verknüpfung darf jeder Bearbeiter lösen */
  r = await V.c.rpc('claim_party', { p_trip: trip, p_party: 'p3', p_link: true }); assert.ifError(r.error);
  r = await O.c.from('trip_members').delete().eq('trip_id', trip).eq('user_id', V.id).select(); assert.equal(r.data.length, 1);
  r = await E.c.rpc('claim_party', { p_trip: trip, p_party: 'p3', p_link: true }); assert.ifError(r.error);
  cur = await get(); assert.deepEqual(members(cur.data), { p3: E.id }, 'Platz eines ehemaligen Mitglieds übernehmbar');
  rejects(await V.c.rpc('claim_party', { p_trip: trip, p_party: 'p3', p_link: false }), /Kein Zugriff/, 'ehemaliges Mitglied');

  /* Reise unter Format 5: claim_party verweigert */
  const old = 't' + run + 'v4';
  r = await O.c.from('trips').insert({ id: old, data: { id: old, title: 'Alt', type: 'stadt', status: 'idee', dateMode: 'open', persons: 2, items: [], schemaVersion: 4 } }); assert.ifError(r.error);
  rejects(await O.c.rpc('claim_party', { p_trip: old, p_party: 'p1', p_link: true }), /neue Version/, 'Format unter 5');

  /* Verlauf: Ereignis für Mitreisende */
  r = await O.c.rpc('trip_changes_since', { p_trip: trip }); assert.ifError(r.error);
  assert(r.data.some(e => (e.kinds || []).length), 'Verlauf hat Einträge');
  console.log('Mitreisende verknüpfen (G6): alle Prüfungen bestanden.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
