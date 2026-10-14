/* Abgleich Konto <-> Server mit nachgebildetem Supabase-Verhalten (Versionen, Rollen, Soft-Delete).
   Die echte Datenbankregel-Prüfung läuft separat in tests/db/supabase-api.cjs. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace("go(location.hash||'reisen',true);", '');

/* Nachgebildeter Server */
function fakeServer() {
  const S = { rows: {}, user: null, online: true, now: 1, calls: [] };
  const vis = (id, u) => { const r = S.rows[id]; return r && r.members[u] ? r : null; };
  const out = (r, u) => ({ id: r.id, data: JSON.parse(JSON.stringify(r.data)), version: r.version, owner_id: r.owner, deleted_at: r.deleted_at, updated_at: new Date(S.now++ * 1000).toISOString(), role: r.members[u] });
  const net = () => { if (!S.online) { const e = new Error('Failed to fetch'); e.network = true; throw e; } };
  S.api = {
    enabled: () => true, onAuth() {}, async init() { return S.user ? { id: S.user, email: S.user + '@x' } : null; },
    async signOut() { net(); S.user = null; },
    async listTrips(u) { net(); S.calls.push('list'); return Object.values(S.rows).filter(r => r.members[u]).map(r => out(r, u)); },
    async getTrip(id) { net(); const r = vis(id, S.user); return r ? out(r, S.user) : null; },
    async insertTrip(id, data) { net(); S.calls.push('insert ' + id); if (S.rows[id]) { const e = new Error('duplicate key'); e.code = '23505'; throw e; }
      if (!data.title || data.id !== id) { const e = new Error('check constraint'); e.code = '23514'; throw e; }
      S.rows[id] = { id, data, version: 1, owner: S.user, deleted_at: null, members: { [S.user]: 'owner' } }; return out(S.rows[id], S.user); },
    async updateTrip(id, data, v) { net(); S.calls.push('update ' + id + '@' + v); const r = vis(id, S.user); if (!r || !['owner', 'editor'].includes(r.members[S.user]) || r.version !== v) return null;
      r.data = data; r.version++; return out(r, S.user); },
    async deleteTrip(id, v) { net(); const r = vis(id, S.user); if (!r || r.version !== v) return null; if (r.members[S.user] !== 'owner') { const e = new Error('Nur der Eigentümer'); e.code = '42501'; throw e; }
      r.deleted_at = 'x'; r.version++; return out(r, S.user); }
  };
  /* Änderung durch ein anderes Konto direkt auf dem Server */
  S.remoteEdit = (id, fn) => { const r = S.rows[id]; fn(r.data); r.version++; };
  return S;
}
const S = fakeServer();
const store = new Map();
const syncEl = { className: '', textContent: '', querySelector() { return syncEl._s; }, _s: { textContent: '' } };
const el = () => ({ innerHTML: '', hidden: false, style: {}, textContent: '', className: '', querySelector() { return { textContent: '', style: {} }; } });
const els = Object.fromEntries(['#view', '#sheet-root', '#dock', '#dock-nm', '#dock-sum', '#dock-bar'].map(k => [k, el()]));
const ctx = {
  window: { addEventListener() {}, RPCloud: S.api }, location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
  navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: { addEventListener() {}, querySelector(k) { return k === '#sync' ? syncEl : els[k] || null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, visibilityState: 'visible' },
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL
};
ctx.window.document = ctx.document;
vm.createContext(ctx);
vm.runInContext(code, ctx);
const a = ctx.window.__app, { Store, Sync, Auth } = a;
const status = () => syncEl._s.textContent;
const trip = (title, o) => Object.assign(a.newTrip({ title, dateMode: 'fix', start: '2027-05-01', end: '2027-05-04' }), o || {});
const run = () => Sync.run();

(async () => {
  /* Gastmodus wie bisher */
  const g1 = trip('Gast-Reise'); Store.put(g1, true);
  assert.equal(Store.key(), 'rp-trips'); assert(store.get('rp-trips').includes('Gast-Reise'));

  /* Anmeldung: eigener, leerer Bereich; Gastdaten nicht sichtbar, nicht automatisch übertragen */
  S.user = 'uA'; Auth.switchTo({ id: 'uA', email: 'a@x' });
  assert.equal(Store.key(), 'rp-u:uA'); assert.equal(Store.list().length, 0);
  await run(); assert.equal(Object.keys(S.rows).length, 0, 'keine automatische Übertragung von Gastdaten');
  assert.equal(a.guestPendingCount(), 1);

  /* Anlegen: erst nach Serverbestätigung "online gespeichert" */
  const t1 = trip('Wien'); Store.put(t1, true);
  assert.equal(Store.pending(), 1); assert.equal(a.tripSyncState(t1.id), 'ausstehend'); assert.notEqual(status(), 'Online gespeichert');
  await run();
  assert.equal(S.rows[t1.id].version, 1); assert.equal(Store.pending(), 0); assert.equal(a.tripSyncState(t1.id), 'online'); assert.equal(status(), 'Online gespeichert');

  /* Offline: Änderung bleibt lokal und ausstehend, danach übertragen */
  S.online = false; ctx.navigator.onLine = false;
  Store.get(t1.id).title = 'Wien offline'; Store.put(Store.get(t1.id));
  await run(); assert(/Offline/.test(status())); assert.equal(Store.pending(), 1);
  ctx.navigator.onLine = true; await run(); assert(/Offline/.test(status()), 'Netzwerkfehler → offline, nicht "online gespeichert"');
  S.online = true; await run();
  assert.equal(S.rows[t1.id].data.title, 'Wien offline'); assert.equal(S.rows[t1.id].version, 2); assert.equal(status(), 'Online gespeichert');

  /* Gleichzeitige Bearbeitung: kein stilles Überschreiben */
  S.remoteEdit(t1.id, d => { d.title = 'Wien (Ben)'; });
  Store.get(t1.id).title = 'Wien (Anna)'; Store.put(Store.get(t1.id));
  await run();
  assert.equal(S.rows[t1.id].data.title, 'Wien (Ben)', 'Server unverändert');
  assert.equal(Store.get(t1.id).title, 'Wien (Anna)', 'lokale Änderung erhalten');
  assert(Store.meta[t1.id].conflict); assert.equal(a.tripSyncState(t1.id), 'konflikt'); assert(/Konflikt/.test(status()));
  assert(a.conflictBlock(Store.get(t1.id)).includes('Gleichzeitige Bearbeitung'));
  /* bewusst: meine Version speichern */
  Sync.resolve(t1.id, 'mine'); await run();
  assert.equal(S.rows[t1.id].data.title, 'Wien (Anna)'); assert.equal(S.rows[t1.id].version, 4); assert.equal(Store.pending(), 0);
  /* erneuter Konflikt → Online-Version übernehmen */
  S.remoteEdit(t1.id, d => { d.title = 'Wien v5'; }); Store.get(t1.id).title = 'lokal'; Store.put(Store.get(t1.id)); await run();
  Sync.resolve(t1.id, 'server'); assert.equal(Store.get(t1.id).title, 'Wien v5'); await run(); assert.equal(S.rows[t1.id].version, 5);
  /* Konflikt → als Kopie */
  S.remoteEdit(t1.id, d => { d.title = 'Wien v6'; }); Store.get(t1.id).title = 'meins'; Store.put(Store.get(t1.id)); await run();
  Sync.resolve(t1.id, 'copy'); await run();
  assert(Store.list().some(t => t.title === 'meins (eigene Kopie)')); assert.equal(Store.get(t1.id).title, 'Wien v6');
  assert(Object.values(S.rows).some(r => r.data.title === 'meins (eigene Kopie)'));

  /* Löschen offline → nach Abgleich Markierung auf dem Server, taucht nicht wieder auf */
  const t2 = trip('Lissabon'); Store.put(t2, true); await run();
  S.online = false; await Store.remove(t2.id); await run(); assert(!Store.get(t2.id)); assert.equal(Store.pending(), 1);
  S.online = true; await run(); await run();
  assert(S.rows[t2.id].deleted_at); assert(!Store.get(t2.id), 'gelöschte Reise taucht nicht wieder auf');

  /* Auf anderem Gerät gelöscht: ohne lokale Änderung entfernt, mit lokaler Änderung Konflikt */
  const t3 = trip('Prag'); Store.put(t3, true); await run();
  S.rows[t3.id].deleted_at = 'x'; S.rows[t3.id].version++; await run(); assert(!Store.get(t3.id));
  const t4 = trip('Rom'); Store.put(t4, true); await run();
  S.rows[t4.id].deleted_at = 'x'; S.rows[t4.id].version++; Store.get(t4.id).title = 'Rom geändert'; Store.put(Store.get(t4.id)); await run();
  assert.equal(Store.meta[t4.id].conflict.op, 'deleted'); assert.equal(Store.get(t4.id).title, 'Rom geändert', 'nichts verloren');
  Sync.resolve(t4.id, 'copy'); await run(); assert(Object.values(S.rows).some(r => r.data.title === 'Rom geändert (eigene Kopie)' && !r.deleted_at));

  /* Geteilte Reise eines anderen Kontos: Leserecht verhindert Speichern, Entzug entfernt sie */
  S.rows.tshared1 = { id: 'tshared1', data: Object.assign(trip('Geteilt'), { id: 'tshared1', schemaVersion: 2 }), version: 3, owner: 'uB', deleted_at: null, members: { uB: 'owner', uA: 'viewer' } };
  await run(); const sh = Store.get('tshared1'); assert(sh); assert.equal(Store.role('tshared1'), 'viewer');
  sh.title = 'heimlich geändert'; assert.equal(Store.put(sh), false); assert.equal(Store.get('tshared1').title, 'Geteilt', 'Leser-Änderung verworfen'); assert.equal(Store.pending(), 0);
  await assert.rejects(() => Store.remove('tshared1'), /Eigentümer/);
  S.rows.tshared1.members.uA = 'editor'; await run(); assert.equal(Store.role('tshared1'), 'editor');
  Store.get('tshared1').title = 'Anna bearbeitet'; Store.put(Store.get('tshared1')); await run(); assert.equal(S.rows.tshared1.data.title, 'Anna bearbeitet');
  delete S.rows.tshared1.members.uA; await run(); assert(!Store.get('tshared1'), 'nach Entzug nicht mehr auf dem Gerät');
  /* Entzug bei ausstehender Änderung: lokale Version bleibt erhalten */
  S.rows.tshared2 = { id: 'tshared2', data: Object.assign(trip('Geteilt 2'), { id: 'tshared2', schemaVersion: 2 }), version: 1, owner: 'uB', deleted_at: null, members: { uB: 'owner', uA: 'editor' } };
  await run(); S.online = false; Store.get('tshared2').title = 'lokal'; Store.put(Store.get('tshared2')); await run();
  delete S.rows.tshared2.members.uA; S.online = true; await run();
  assert(Store.meta.tshared2.lost); assert.equal(Store.get('tshared2').title, 'lokal'); assert.equal(a.tripSyncState('tshared2'), 'kein-zugriff');
  Sync.resolve('tshared2', 'copy'); await run(); assert(Object.values(S.rows).some(r => r.data.title === 'lokal (eigene Kopie)' && r.owner === 'uA'));

  /* Idempotenz: Anlegen erfolgreich, Antwort verloren → kein Duplikat */
  const t7 = trip('Antwort verloren'); Store.put(t7, true);
  const origInsert = S.api.insertTrip; S.api.insertTrip = async (id, d) => { await origInsert(id, d); const e = new Error('Failed to fetch'); e.network = true; throw e; };
  await run(); S.api.insertTrip = origInsert; assert.equal(Store.pending(), 1);
  await run();
  assert.equal(Object.values(S.rows).filter(r => r.data.title === 'Antwort verloren').length, 1, 'kein doppeltes Anlegen');
  assert.equal(Store.pending(), 0); assert.equal(a.tripSyncState(t7.id), 'online');

  /* ID bereits vergeben (anderes Konto) → neue ID statt Überschreiben */
  S.rows.tbelegt = { id: 'tbelegt', data: { id: 'tbelegt', title: 'fremd' }, version: 1, owner: 'uX', deleted_at: null, members: { uX: 'owner' } };
  const t5 = Object.assign(trip('Kollision'), { id: 'tbelegt' }); Store.put(t5, true); await run(); await run();
  assert.equal(S.rows.tbelegt.data.title, 'fremd'); assert(!Store.get('tbelegt'));
  assert(Object.values(S.rows).some(r => r.data.title === 'Kollision' && r.owner === 'uA' && r.id !== 'tbelegt'));

  /* Ungültige Reise (Server lehnt ab) → Speicherfehler sichtbar, lokal erhalten */
  const t6 = trip(''); t6.title = ''; Store.put(t6, true); await run();
  assert.equal(a.tripSyncState(t6.id), 'fehler'); assert(Store.get(t6.id));
  t6.title = 'Repariert'; Store.put(t6, true); await run(); assert.equal(a.tripSyncState(t6.id), 'online');

  /* Gast-Übernahme: Vorschau mit Validierung, bewusste Auswahl, Gastdaten bleiben */
  const guestRaw = JSON.parse(store.get('rp-trips')); guestRaw.tkaputt = { id: 'tkaputt', title: 'x', items: 'nein' };
  store.set('rp-trips', JSON.stringify(guestRaw));
  const pv = a.guestPreview(); assert.equal(pv.rows.length, 2); assert(pv.rows.find(r => r.trip.id === 'tkaputt').problem);
  const added = a.adoptGuestTrips([g1.id, 'tkaputt']); assert.equal(added.length, 1); await run();
  assert(Object.values(S.rows).some(r => r.data.title === 'Gast-Reise' && r.owner === 'uA'));
  assert(store.get('rp-trips').includes('Gast-Reise'), 'Gastkopie bleibt'); assert.equal(a.guestPendingCount(), 0);
  delete guestRaw.tkaputt; store.set('rp-trips', JSON.stringify(guestRaw));

  /* Kontowechsel: keine fremden Daten sichtbar */
  const aCount = Store.list().length;
  S.user = 'uB'; Auth.switchTo({ id: 'uB', email: 'b@x' }); assert.equal(Store.list().length, 0, 'Daten von A unsichtbar'); await run();
  assert(!Store.list().some(t => t.title === 'Wien v6'), 'B sieht nur eigene/freigegebene Reisen');
  S.user = 'uA'; Auth.switchTo({ id: 'uA', email: 'a@x' }); assert.equal(Store.list().length, aCount, 'Cache von A wieder da');

  /* Abmelden: mit ausstehenden Änderungen Rückfrage und Cache bleibt; ohne → Cache entfernt */
  S.online = false; Store.get(t1.id).title = 'ungesichert'; Store.put(Store.get(t1.id));
  await Auth.signOut(false); assert.equal(Auth.user.id, 'uA', 'Rückfrage statt sofortigem Abmelden');
  S.online = true; await Auth.signOut(true); assert.equal(Store.key(), 'rp-trips'); assert(store.get('rp-u:uA').includes('ungesichert'), 'ungesicherte Änderung bleibt für dieses Konto');
  assert(!Store.list().some(t => t.title === 'ungesichert'), 'nach Abmelden nicht sichtbar');
  S.user = 'uA'; Auth.switchTo({ id: 'uA', email: 'a@x' }); await run(); assert.equal(S.rows[t1.id].data.title, 'ungesichert', 'nach erneuter Anmeldung übertragen');
  await Auth.signOut(false); assert(!store.has('rp-u:uA'), 'ohne ausstehende Änderungen wird der Konto-Cache entfernt');
  console.log('Synchronisation: Gast/Konto getrennt, keine Auto-Übertragung, Bestätigung erst nach Server, offline, Konflikte (mine/server/copy), Löschungen, Leserecht, Entzug, ID-Kollision, Serverablehnung, Gast-Übernahme, Kontowechsel, Abmelden geprüft.');
})().catch(e => { console.error(e); process.exit(1); });
