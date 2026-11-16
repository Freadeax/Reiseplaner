/* Gemeinsam planen G2–G5 (Migration 20261116120000_gemeinsam, docs/PLAN_GEMEINSAM.md) über die ECHTE Supabase-API eines
   lokal laufenden Stacks: Anzeigename, Mitgliederliste ohne fremde E-Mail, Ideen-Pinnwand, Stimmen, Verlauf, Realtime.
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
const rejects = (r, re, msg) => { assert(r.error, msg + ' (kein Fehler)'); if (re) assert(re.test(r.error.message), msg + ': ' + r.error.message); };

/* Ohne Wächter würde ein nie aufgelöstes Versprechen (z. B. Realtime) still mit Code 0 enden */
setTimeout(() => { console.error('Zeitüberschreitung im Datenbanktest'); process.exit(1); }, 150000);
(async () => {
  const O = await register('olga'), E = await register('emil'), V = await register('vera'), X = await register('xaver');
  const trip = 't' + run + 'gem';
  let r = await O.c.from('trips').insert({ id: trip, data: doc(trip, 'Allgäu gemeinsam') }); assert.ifError(r.error);
  const join = async (who, role) => { const t = await O.c.rpc('create_trip_invite', { p_trip: trip, p_role: role, p_hours: 24 }); assert.ifError(t.error); const j = await who.c.rpc('accept_trip_invite', { p_token: t.data }); assert.ifError(j.error); };
  await join(E, 'editor'); await join(V, 'viewer');

  /* G3 Anzeigename */
  r = await E.c.from('profiles').insert({ user_id: E.id, display_name: '  Emil  ' }); assert.ifError(r.error);
  r = await V.c.from('profiles').insert({ user_id: V.id, display_name: 'Vera' }); assert.ifError(r.error);
  rejects(await X.c.from('profiles').insert({ user_id: E.id, display_name: 'Fremd' }), null, 'fremdes Profil anlegen');
  rejects(await X.c.from('profiles').insert({ user_id: X.id, display_name: 'x'.repeat(41) }), null, 'Name über 40 Zeichen');
  rejects(await X.c.from('profiles').insert({ user_id: X.id, display_name: 'a\u0007b' }), null, 'Steuerzeichen');
  r = await X.c.from('profiles').select('*'); assert.deepEqual(r.data, [], 'fremde Profile nicht lesbar');
  r = await E.c.rpc('trip_member_list', { p_trip: trip }); assert.ifError(r.error);
  const byId = Object.fromEntries(r.data.map(m => [m.user_id, m]));
  assert.equal(byId[E.id].display_name, 'Emil', 'getrimmt');
  assert.equal(byId[E.id].email, E.email, 'eigene E-Mail sichtbar');
  assert.equal(byId[O.id].email, null, 'Bearbeiter sieht fremde E-Mail nicht'); assert.equal(byId[V.id].email, null);
  r = await O.c.rpc('trip_member_list', { p_trip: trip });
  assert.deepEqual(r.data.map(m => m.email).sort(), [O.email, E.email, V.email].sort(), 'Eigentümer sieht alle E-Mails');
  rejects(await X.c.rpc('trip_member_list', { p_trip: trip }), /Kein Zugriff/, 'Fremder');

  /* G4 Ideen: alle Mitglieder tragen ein, Fremde nicht */
  r = await V.c.from('trip_ideas').insert({ trip_id: trip, body: ' Rodeln am Söllereck ', link: 'https://example.test/rodeln' }).select().single();
  assert.ifError(r.error); const idea = r.data;
  assert.equal(idea.author, V.id); assert.equal(idea.status, 'neu'); assert.equal(idea.body, 'Rodeln am Söllereck');
  rejects(await X.c.from('trip_ideas').insert({ trip_id: trip, body: 'Spam' }), null, 'Fremder legt Idee an');
  rejects(await E.c.from('trip_ideas').insert({ trip_id: trip, body: 'x', link: 'javascript:alert(1)' }), null, 'nur https-Links');
  rejects(await E.c.from('trip_ideas').insert({ trip_id: trip, body: 'x'.repeat(501) }), null, 'höchstens 500 Zeichen');
  rejects(await E.c.from('trip_ideas').insert({ trip_id: trip, body: 'Therme', status: 'eingeplant' }), /permission/, 'Status beim Anlegen nicht setzbar');
  rejects(await E.c.from('trip_ideas').insert({ trip_id: trip, body: 'Therme', author: V.id }), /permission/, 'Autor nicht setzbar');
  r = await E.c.from('trip_ideas').insert({ trip_id: trip, body: 'Therme', day: '2027-05-02' }).select().single();
  assert.ifError(r.error); assert.equal(r.data.status, 'neu'); assert.equal(r.data.author, E.id); const idea2 = r.data;
  r = await X.c.from('trip_ideas').select('id').eq('trip_id', trip); assert.deepEqual(r.data, [], 'Fremder liest keine Ideen');
  /* Ändern: nur Autor den Text; Status nur Eigentümer/Bearbeiter */
  r = await E.c.from('trip_ideas').update({ body: 'Rodeln (Emil)' }).eq('id', idea.id).select(); rejects(r, /Nur die Person/, 'Bearbeiter ändert fremden Text');
  r = await V.c.from('trip_ideas').update({ body: 'Rodeln abends' }).eq('id', idea.id).select().single(); assert.ifError(r.error); assert.equal(r.data.body, 'Rodeln abends');
  rejects(await V.c.from('trip_ideas').update({ status: 'eingeplant' }).eq('id', idea.id).select(), /Status/, 'Leser setzt Status');
  r = await E.c.from('trip_ideas').update({ status: 'eingeplant' }).eq('id', idea.id).select().single(); assert.ifError(r.error);
  assert.equal(r.data.status, 'eingeplant'); assert.equal(r.data.status_by, E.id);
  rejects(await E.c.from('trip_ideas').update({ author: E.id }).eq('id', idea.id), null, 'Autor unveränderlich');
  rejects(await E.c.from('trip_ideas').delete().eq('id', idea.id).select(), null, 'kein hartes Löschen');
  /* Zurückziehen: Autor oder Eigentümer */
  rejects(await V.c.from('trip_ideas').update({ deleted_at: new Date().toISOString() }).eq('id', idea2.id).select(), /zurückziehen/, 'Leser zieht fremde Idee zurück');
  r = await O.c.from('trip_ideas').update({ deleted_at: new Date().toISOString() }).eq('id', idea2.id).select().single(); assert.ifError(r.error); assert(r.data.deleted_at);
  rejects(await E.c.from('trip_ideas').update({ body: 'wieder da' }).eq('id', idea2.id).select(), /zurückgezogen/, 'zurückgezogene Idee bleibt zu');

  /* Stimmen: je Person eine, nur eigene, Fremde nicht */
  r = await V.c.from('trip_idea_votes').insert({ idea_id: idea.id }); assert.ifError(r.error);
  rejects(await V.c.from('trip_idea_votes').insert({ idea_id: idea.id }), null, 'zweite Stimme derselben Person');
  r = await E.c.from('trip_idea_votes').insert({ idea_id: idea.id }); assert.ifError(r.error);
  rejects(await X.c.from('trip_idea_votes').insert({ idea_id: idea.id }), null, 'Fremder stimmt ab');
  rejects(await E.c.from('trip_idea_votes').insert({ idea_id: idea2.id }), null, 'Stimme auf zurückgezogene Idee');
  r = await O.c.from('trip_idea_votes').select('user_id').eq('idea_id', idea.id); assert.equal(r.data.length, 2);
  r = await O.c.from('trip_idea_votes').delete().eq('idea_id', idea.id).eq('user_id', V.id).select(); assert.equal(r.data.length, 0, 'fremde Stimme nicht löschbar');
  r = await V.c.from('trip_idea_votes').delete().eq('idea_id', idea.id).select(); assert.equal(r.data.length, 1, 'eigene Stimme zurücknehmen');
  r = await X.c.from('trip_idea_votes').select('*'); assert.deepEqual(r.data, []);

  /* G2 Realtime: Mitglied bekommt Ereignis zur Reise, Fremder nicht */
  const got = { E: [], X: [] };
  const sub = async (who, key) => { await who.c.realtime.setAuth((await who.c.auth.getSession()).data.session.access_token);
    return new Promise(res => { const ch = who.c.channel('rp-' + key + run).on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, p => got[key].push(p)).subscribe((s, err) => { if (s === 'SUBSCRIBED') res(ch); else if (s !== 'CLOSED') console.error('Realtime', key, s, err && err.message); }); }); };
  const chE = await sub(E, 'E'), chX = await sub(X, 'X');
  await sleep(3000); /* Realtime braucht nach dem Abonnieren einen Moment, bis Änderungen ankommen */
  r = await O.c.from('trips').update({ data: doc(trip, 'Allgäu gemeinsam', { notes: 'Schlitten', budget: 1400 }) }).eq('id', trip).eq('version', 1).select('version').single();
  assert.ifError(r.error); assert.equal(r.data.version, 2);
  for (let i = 0; i < 80 && !got.E.length; i++) await sleep(250);
  await sleep(500);
  assert(got.E.some(p => p.new && p.new.id === trip), 'Mitglied erhält Realtime-Ereignis');
  assert(!got.X.some(p => p.new && p.new.id === trip), 'Fremder erhält kein Ereignis');
  await chE.unsubscribe(); await chX.unsubscribe();

  /* G5 Verlauf: Bereiche ohne Inhalte, Gelesen-Marke */
  r = await E.c.rpc('trip_changes_since', { p_trip: trip }); assert.ifError(r.error);
  assert.equal(r.data.length, 1); assert.deepEqual(r.data[0].kinds, ['eckdaten', 'notizen']);
  assert.equal(r.data[0].by_me, false); assert(!JSON.stringify(r.data).includes('Schlitten'), 'keine Inhalte im Verlauf');
  r = await O.c.from('trip_events').select('kinds,actor').eq('trip_id', trip); assert.equal(r.data[0].actor, O.id);
  r = await E.c.from('trips').update({ data: doc(trip, 'Allgäu gemeinsam', { notes: 'Schlitten', budget: 1400, start: '2027-05-02' }) }).eq('id', trip).eq('version', 2).select('version').single();
  assert.ifError(r.error);
  r = await V.c.rpc('trip_changes_since', { p_trip: trip });
  assert.deepEqual(r.data.map(e => [e.version, e.actor_name, e.kinds.join()]), [[3, 'Emil', 'zeitraum'], [2, null, 'eckdaten,notizen']], 'neueste zuerst, Name statt E-Mail');
  r = await V.c.rpc('mark_trip_seen', { p_trip: trip, p_version: 3 }); assert.ifError(r.error);
  r = await V.c.rpc('mark_trip_seen', { p_trip: trip, p_version: 2 }); assert.ifError(r.error);
  r = await V.c.rpc('trip_changes_since', { p_trip: trip }); assert.deepEqual(r.data, [], 'Marke geht nie zurück');
  rejects(await X.c.rpc('trip_changes_since', { p_trip: trip }), /Kein Zugriff/, 'Fremder');
  rejects(await X.c.rpc('mark_trip_seen', { p_trip: trip, p_version: 1 }), /Kein Zugriff/, 'Fremder markiert');
  r = await X.c.from('trip_events').select('*'); assert.deepEqual(r.data, []);
  rejects(await O.c.from('trip_events').insert({ trip_id: trip, version: 9, kinds: ['x'] }), null, 'Verlauf nur per Trigger');
  r = await O.c.from('trips').update({ deleted_at: new Date().toISOString() }).eq('id', trip).select('version').single(); assert.ifError(r.error);
  r = await E.c.from('trip_events').select('kinds').eq('trip_id', trip).order('version', { ascending: false }).limit(1);
  assert.deepEqual(r.data[0].kinds, ['geloescht']);
  rejects(await E.c.from('trip_ideas').insert({ trip_id: trip, body: 'zu spät' }), /gelöscht/, 'keine Ideen in gelöschter Reise');
  r = await O.c.from('trips').update({ deleted_at: null }).eq('id', trip).select('version').single(); assert.ifError(r.error);

  /* Export und Kontolöschung: Profil und Ideen im Export; Ideen bleiben anonym, Stimmen und Profil weg */
  r = await V.c.rpc('export_my_account'); assert.ifError(r.error);
  assert(r.data.version >= 2); assert.equal(r.data.profile.display_name, 'Vera'); assert.equal(r.data.ideas_created.length, 1);
  r = await E.c.rpc('delete_my_account', { p_confirm_email: E.email }); assert.ifError(r.error);
  r = await O.c.from('trip_idea_votes').select('user_id').eq('idea_id', idea.id); assert.deepEqual(r.data, [], 'Stimme des gelöschten Kontos entfernt');
  r = await O.c.from('trip_events').select('actor,version').eq('trip_id', trip).eq('version', 3).single(); assert.equal(r.data.actor, null, 'Verlauf anonymisiert');
  r = await O.c.from('trip_ideas').select('status_by').eq('id', idea.id).single(); assert.equal(r.data.status_by, null);
  r = await O.c.rpc('trip_member_list', { p_trip: trip }); assert(!r.data.some(m => m.user_id === E.id));

  console.log('Gemeinsam planen (Datenbank): Anzeigename und E-Mail-Sichtbarkeit, Ideen (anlegen, Rechte, Status, Zurückziehen, Grenzen), Stimmen, Realtime nur für Mitglieder, Verlauf ohne Inhalte mit Gelesen-Marke, Export und Kontolöschung geprüft.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
