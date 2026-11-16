/* Gemeinsam planen G7 (Migration 20261116220000_abstimmungen): Abstimmungen und Kommentare über die ECHTE Supabase-API eines
   lokal laufenden Stacks: Rechte, Grenzen, Einfach-/Mehrfachwahl, Schließen, Zurückziehen, Realtime, Export und Kontolöschung.
   Ohne Stack übersprungen (REQUIRE_DB=1: Fehler). */
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
(async () => {
  const O = await register('olga'), E = await register('emil'), V = await register('vera'), X = await register('xaver');
  const trip = 't' + run + 'abs';
  let r = await O.c.from('trips').insert({ id: trip, data: doc(trip, 'Abstimmen') }); assert.ifError(r.error);
  const join = async (who, role) => { const t = await O.c.rpc('create_trip_invite', { p_trip: trip, p_role: role, p_hours: 24 }); assert.ifError(t.error); const j = await who.c.rpc('accept_trip_invite', { p_token: t.data }); assert.ifError(j.error); };
  await join(E, 'editor'); await join(V, 'viewer');

  /* Anlegen: alle Mitglieder, auch Leser; Grenzen */
  r = await V.c.from('trip_polls').insert({ trip_id: trip, question: ' Wohin am Samstag? ', options: [' Therme ', 'Rodeln', 'Museum'] }).select().single();
  assert.ifError(r.error); const p1 = r.data;
  assert.equal(p1.author, V.id); assert.equal(p1.question, 'Wohin am Samstag?'); assert.deepEqual(p1.options, ['Therme', 'Rodeln', 'Museum']); assert.equal(p1.multi, false); assert.equal(p1.target, 'trip');
  rejects(await X.c.from('trip_polls').insert({ trip_id: trip, question: 'x', options: ['a', 'b'] }), null, 'Fremder legt an');
  rejects(await E.c.from('trip_polls').insert({ trip_id: trip, question: 'x', options: ['a'] }), null, 'nur eine Antwort');
  rejects(await E.c.from('trip_polls').insert({ trip_id: trip, question: 'x', options: ['a', ' a '] }), /doppelt/, 'doppelte Antwort');
  rejects(await E.c.from('trip_polls').insert({ trip_id: trip, question: 'x', options: ['a', 'b'], target: 'javascript:x' }), null, 'ungültiges Ziel');
  rejects(await E.c.from('trip_polls').insert({ trip_id: trip, question: 'x', options: ['a', 'b'], author: V.id }), /permission/, 'Autor nicht setzbar');
  r = await E.c.from('trip_polls').insert({ trip_id: trip, question: 'Was essen wir?', options: ['Fondue', 'Pizza', 'Käsespätzle'], multi: true, target: 'day:2027-05-02' }).select().single();
  assert.ifError(r.error); const p2 = r.data;
  r = await X.c.from('trip_polls').select('id'); assert.deepEqual(r.data, [], 'Fremder liest nichts');

  /* Abstimmen nur über vote_poll */
  rejects(await V.c.from('trip_poll_votes').insert({ poll_id: p1.id, user_id: V.id, option: 0 }), /permission/, 'direktes Einfügen');
  r = await V.c.rpc('vote_poll', { p_poll: p1.id, p_options: [0] }); assert.ifError(r.error);
  rejects(await V.c.rpc('vote_poll', { p_poll: p1.id, p_options: [0, 1] }), /Nur eine Antwort/, 'Einfachwahl');
  rejects(await V.c.rpc('vote_poll', { p_poll: p1.id, p_options: [3] }), /gibt es nicht/, 'Antwort außerhalb');
  rejects(await X.c.rpc('vote_poll', { p_poll: p1.id, p_options: [0] }), /Kein Zugriff/, 'Fremder stimmt');
  r = await V.c.rpc('vote_poll', { p_poll: p1.id, p_options: [1] }); assert.ifError(r.error);
  r = await E.c.rpc('vote_poll', { p_poll: p1.id, p_options: [1] }); assert.ifError(r.error);
  r = await O.c.from('trip_poll_votes').select('user_id,option').eq('poll_id', p1.id);
  assert.deepEqual(r.data.map(v => v.option).sort(), [1, 1], 'Stimme ersetzt, nicht ergänzt');
  r = await O.c.rpc('vote_poll', { p_poll: p2.id, p_options: [0, 2, 2] }); assert.ifError(r.error);
  r = await O.c.from('trip_poll_votes').select('option').eq('poll_id', p2.id); assert.deepEqual(r.data.map(v => v.option).sort(), [0, 2], 'Mehrfachwahl, doppelt zählt einmal');
  r = await O.c.rpc('vote_poll', { p_poll: p2.id, p_options: [] }); assert.ifError(r.error);
  r = await O.c.from('trip_poll_votes').select('option').eq('poll_id', p2.id); assert.deepEqual(r.data, [], 'Stimme zurückgenommen');
  r = await X.c.from('trip_poll_votes').select('*'); assert.deepEqual(r.data, []);

  /* Ändern nur durch den Autor und nur ohne Stimmen */
  rejects(await V.c.from('trip_polls').update({ options: ['A', 'B'] }).eq('id', p1.id).select(), /ersten Stimme/, 'nach Stimmen ändern');
  r = await E.c.from('trip_polls').update({ question: 'Was essen wir am Sonntag?' }).eq('id', p2.id).select().single(); assert.ifError(r.error);
  rejects(await V.c.from('trip_polls').update({ question: 'fremd' }).eq('id', p2.id).select(), /Nur die Person/, 'fremde Frage ändern');
  /* Schließen: Autor, Eigentümer, Bearbeiter; Leser nicht (fremde) */
  rejects(await V.c.from('trip_polls').update({ closed_at: new Date().toISOString() }).eq('id', p2.id).select(), /Schließen/, 'Leser schließt fremde');
  r = await E.c.from('trip_polls').update({ closed_at: new Date().toISOString() }).eq('id', p1.id).select().single(); assert.ifError(r.error);
  assert(r.data.closed_at); assert.equal(r.data.closed_by, E.id);
  rejects(await V.c.rpc('vote_poll', { p_poll: p1.id, p_options: [0] }), /geschlossen/, 'geschlossene Abstimmung');
  r = await V.c.from('trip_polls').update({ closed_at: null }).eq('id', p1.id).select().single(); assert.ifError(r.error); assert.equal(r.data.closed_by, null, 'Autor öffnet wieder');
  /* Zurückziehen: Autor oder Eigentümer */
  rejects(await E.c.from('trip_polls').update({ deleted_at: new Date().toISOString() }).eq('id', p1.id).select(), /zurückziehen/, 'Bearbeiter zieht fremde zurück');
  r = await O.c.from('trip_polls').update({ deleted_at: new Date().toISOString() }).eq('id', p2.id).select().single(); assert.ifError(r.error);
  rejects(await O.c.rpc('vote_poll', { p_poll: p2.id, p_options: [0] }), /zurückgezogen/, 'zurückgezogene Abstimmung');
  rejects(await O.c.from('trip_polls').delete().eq('id', p1.id).select(), null, 'kein hartes Löschen');

  /* Kommentare */
  r = await V.c.from('trip_comments').insert({ trip_id: trip, target: 'day:2027-05-02', body: ' Bitte früh los, Parkplatz ist klein. ' }).select().single();
  assert.ifError(r.error); const c1 = r.data; assert.equal(c1.body, 'Bitte früh los, Parkplatz ist klein.'); assert.equal(c1.author, V.id);
  r = await E.c.from('trip_comments').insert({ trip_id: trip, target: 'item:it_42', body: 'Tickets vorher online kaufen' }).select().single(); assert.ifError(r.error); const c2 = r.data;
  rejects(await X.c.from('trip_comments').insert({ trip_id: trip, body: 'Spam' }), null, 'Fremder kommentiert');
  rejects(await E.c.from('trip_comments').insert({ trip_id: trip, body: 'x'.repeat(1001) }), null, 'höchstens 1000 Zeichen');
  rejects(await E.c.from('trip_comments').insert({ trip_id: trip, body: 'x', target: 'day:morgen' }), null, 'ungültiges Ziel');
  rejects(await E.c.from('trip_comments').update({ body: 'fremd' }).eq('id', c1.id).select(), /Nur die Person/, 'fremden Kommentar ändern');
  r = await V.c.from('trip_comments').update({ body: 'Bitte um 8 Uhr los.' }).eq('id', c1.id).select().single(); assert.ifError(r.error); assert(r.data.edited_at, 'bearbeitet markiert');
  rejects(await V.c.from('trip_comments').update({ deleted_at: new Date().toISOString() }).eq('id', c2.id).select(), /zurückziehen/, 'Leser zieht fremden zurück');
  r = await O.c.from('trip_comments').update({ deleted_at: new Date().toISOString() }).eq('id', c2.id).select().single(); assert.ifError(r.error);
  rejects(await E.c.from('trip_comments').update({ body: 'wieder' }).eq('id', c2.id).select(), /zurückgezogen/, 'zurückgezogen bleibt zu');
  r = await X.c.from('trip_comments').select('id'); assert.deepEqual(r.data, []);

  /* Realtime: Mitglied bekommt neue Kommentare und Stimmen, Fremder nicht */
  const got = { E: [], X: [] };
  const sub = async (who, key) => { await who.c.realtime.setAuth((await who.c.auth.getSession()).data.session.access_token);
    return new Promise(res => { const ch = who.c.channel('rp7-' + key + run)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_comments' }, p => got[key].push(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_poll_votes' }, p => got[key].push(p))
      .subscribe((s, err) => { if (s === 'SUBSCRIBED') res(ch); else if (s !== 'CLOSED') console.error('Realtime', key, s, err && err.message); }); }); };
  await sub(E, 'E'); await sub(X, 'X'); await sleep(3000);
  r = await O.c.from('trip_comments').insert({ trip_id: trip, body: 'Neu von Olga' }); assert.ifError(r.error);
  r = await O.c.rpc('vote_poll', { p_poll: p1.id, p_options: [2] }); assert.ifError(r.error);
  for (let i = 0; i < 80 && got.E.length < 2; i++) await sleep(250);
  await sleep(500);
  assert(got.E.some(p => p.table === 'trip_comments'), 'Mitglied erhält Kommentar'); assert(got.E.some(p => p.table === 'trip_poll_votes'), 'Mitglied erhält Stimme');
  assert.equal(got.X.length, 0, 'Fremder erhält nichts');

  /* Export und Kontolöschung: Stimmen weg, Abstimmung und Kommentar bleiben ohne Autor */
  r = await V.c.rpc('export_my_account'); assert.ifError(r.error);
  assert.equal(r.data.version, 3); assert.equal(r.data.polls_created.length, 1); assert.equal(r.data.comments_created.length, 1); assert(r.data.poll_votes.length >= 1);
  r = await V.c.rpc('delete_my_account', { p_confirm_email: V.email }); assert.ifError(r.error);
  r = await O.c.from('trip_polls').select('author').eq('id', p1.id).single(); assert.equal(r.data.author, null);
  r = await O.c.from('trip_comments').select('author,body').eq('id', c1.id).single(); assert.equal(r.data.author, null); assert.equal(r.data.body, 'Bitte um 8 Uhr los.');
  r = await O.c.from('trip_poll_votes').select('user_id').eq('poll_id', p1.id); assert(!r.data.some(v => v.user_id === V.id), 'Stimmen der gelöschten Person weg');
  console.log('Abstimmungen und Kommentare (G7, Datenbank): Rechte, Grenzen, Einfach-/Mehrfachwahl, Ändern nur ohne Stimmen, Schließen, Zurückziehen, Kommentare, Realtime, Export und Kontolöschung geprüft.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
