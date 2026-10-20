/* Nicht lesbare Serverzeilen (z. B. neuere Speicherversion): nie still überspringen, nie überschreiben (Claude, #8).
   Gleiches nachgebildetes Supabase-Verhalten wie tests/sync.cjs. Node-Test, kein Browser-/DB-Test. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const code = require("./app-code.cjs")(html).replace("go(location.hash||'reisen',true);", '');

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
  S.user = 'uA'; Auth.switchTo({ id: 'uA', email: 'a@x' });
  const v3 = d => { d.schemaVersion = 5; /* Format über der höchsten bekannten Version (seit Lese-Release v4) */ d.ledger = { 'xc:a': { status: 'gebucht', amount: 50, paid: 20, due: '', cancel: { on: '2027-04-01', fee: 100, refund: 0 } } }; };

  /* 1. Reproduktion des Datenverlusts: jetzt geschützt */
  const t = trip('Basis'); Store.put(t); await run();
  S.remoteEdit(t.id, d => { v3(d); d.title = 'v3 vom neuen Client'; });
  const serverBefore = JSON.stringify(S.rows[t.id].data);
  await run();
  const m = Store.meta[t.id];
  assert(m.unreadable && m.unreadable.newer && m.unreadable.schema === 5, 'als neuere Version markiert');
  assert.equal(Store.get(t.id).title, 'Basis', 'lokaler Stand bleibt lesbar erhalten');
  assert.equal(a.tripSyncState(t.id), 'nicht-lesbar');
  assert(/Konflikt bei 1 Reise/.test(status()), 'sichtbar im Status');
  assert(a.unreadableBlock(Store.get(t.id)).includes('neuere App-Version'));
  /* Bearbeiten wird im Speicher abgelehnt, nicht nur im UI */
  const loc = Store.get(t.id); loc.title = 'alter Client bearbeitet';
  assert.equal(Store.put(loc), false, 'Store.put lehnt ab');
  assert.equal(Store.get(t.id).title, 'Basis', 'Änderung im Speicher zurückgenommen');
  await run();
  assert.equal(JSON.stringify(S.rows[t.id].data), serverBefore, 'Server unverändert');
  await assert.rejects(() => Store.remove(t.id), /nicht lesen/);
  assert.throws(() => Sync.resolve(t.id, 'mine'), /weder überschrieben/);
  assert.throws(() => Sync.resolve(t.id, 'server'));
  assert.throws(() => Sync.resolve(t.id, 'discard'));
  /* Eigene Kopie behalten: neue ID, Original auf dem Server unberührt, Platzhalter bleibt */
  Sync.resolve(t.id, 'copy'); await run();
  const copy = Object.values(S.rows).find(r => r.data.title === 'Basis (eigene Kopie)');
  assert(copy && copy.id !== t.id && copy.data.schemaVersion === 2, 'Kopie online als v2');
  assert.equal(JSON.stringify(S.rows[t.id].data), serverBefore, 'Original weiter unverändert');
  assert(!Store.get(t.id) && Store.meta[t.id].unreadable, 'Platzhalter ohne lokale Daten');
  assert(a.unreadableShelf().includes('v3 vom neuen Client'), 'Platzhalter im Reiseregal sichtbar');
  /* Speicher bleibt nach Neuladen lesbar (Platzhalter steckt nur in meta) */
  Store.setScope('uA'); assert(!Store.localError, 'Kontospeicher nach Neuladen gültig'); assert(Store.meta[t.id].unreadable);

  /* 2. Lokale Änderung war schon ausstehend, als die v3-Fassung kam */
  const t2 = trip('Zwei'); Store.put(t2); await run();
  S.remoteEdit(t2.id, v3);
  const l2 = Store.get(t2.id); l2.title = 'Zwei lokal'; Store.put(l2);
  await run();
  assert(Store.meta[t2.id].unreadable, 'beim Pull erkannt');
  assert.equal(Store.get(t2.id).title, 'Zwei lokal', 'lokale Änderung nicht verloren');
  assert.throws(() => Sync.resolve(t2.id, 'mine'));
  await run();
  assert.equal(S.rows[t2.id].data.schemaVersion, 5, 'neuere Fassung nie überschrieben');
  /* Export erhält den lokalen Stand */
  assert(JSON.stringify(a.backupData(Store.list())).includes('Zwei lokal'), 'lokaler Stand exportierbar');

  /* 3. Neue, noch nie gesehene v3-Reise eines anderen Kontos (Leserecht): nur Platzhalter, kein ungültiger Datensatz im Speicher */
  S.rows.tforeign = { id: 'tforeign', data: Object.assign(trip('Fremd neu'), { id: 'tforeign', schemaVersion: 5 }), version: 4, owner: 'uB', deleted_at: null, members: { uB: 'owner', uA: 'viewer' } };
  await run();
  assert(!Store.get('tforeign') && Store.meta.tforeign.unreadable, 'kein ungültiger Datensatz lokal');
  assert(a.unreadableShelf().includes('Fremd neu'));

  /* 4. Ungültig ohne neuere Version: neutral als nicht lesbar, mit Prüfgrund */
  const t4 = trip('Vier'); Store.put(t4); await run();
  S.remoteEdit(t4.id, d => { d.kmSrc = 'erfunden'; });
  await run();
  assert(Store.meta[t4.id].unreadable && !Store.meta[t4.id].unreadable.newer, 'nicht als neuere Version ausgegeben');
  assert(a.unreadableBlock(Store.get(t4.id)).includes('Prüfung'));

  /* 5. Wird die Online-Fassung wieder lesbar, wird sie normal übernommen */
  S.remoteEdit(t4.id, d => { delete d.kmSrc; d.title = 'Vier repariert'; });
  await run();
  assert(!Store.meta[t4.id].unreadable); assert.equal(Store.get(t4.id).title, 'Vier repariert');
  assert.equal(a.tripSyncState(t4.id), 'online');

  /* 6. Online gelöscht oder Zugriff entzogen: Platzhalter verschwindet */
  S.rows.tforeign.deleted_at = 'x'; S.rows.tforeign.version++;
  await run(); assert(!Store.meta.tforeign, 'gelöschter Platzhalter entfernt');
  delete S.rows[t.id].members.uA; await run();
  assert(!Store.meta[t.id], 'Platzhalter nach Rechteentzug entfernt');

  /* 7. Kontogrenze: Markierung gehört zum Konto */
  S.user = 'uB'; Auth.switchTo({ id: 'uB', email: 'b@x' });
  assert.equal(a.unreadableList().length, 0, 'anderes Konto sieht keine fremden Markierungen');
  S.user = 'uA'; Auth.switchTo({ id: 'uA', email: 'a@x' });
  assert(Store.meta[t2.id] && Store.meta[t2.id].unreadable, 'eigene Markierung nach Kontowechsel erhalten');

  console.log('Nicht lesbare Serverzeilen: Repro ohne Datenverlust, Store.put/remove/push/resolve geschützt, Platzhalter, eigene Kopie, Export, Erholung, Löschung/Entzug, Kontogrenze geprüft.');
})().catch(e => { console.error(e); process.exit(1); });
