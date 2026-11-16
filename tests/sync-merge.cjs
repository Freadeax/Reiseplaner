/* Drei-Wege-Abgleich im Sync (docs/PLAN_GEMEINSAM.md §4) gegen nachgebildeten Server: zwei Mitglieder bearbeiten
   dieselbe Reise gleichzeitig. */
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
  window: { addEventListener() {}, RPCloud: S.api, RPMerge: require('../merge3.js') }, location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
  navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  document: { addEventListener() {}, querySelector(k) { return k === '#sync' ? syncEl : els[k] || null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, visibilityState: 'visible' },
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL
};
ctx.window.document = ctx.document;
vm.createContext(ctx);
vm.runInContext(code, ctx);
const a = ctx.window.__app, { Store, Sync, Auth } = a;
const trip = (title, o) => Object.assign(a.newTrip({ title, dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', nights: 4 }), o || {});
const run = async () => { await Sync.run(); for (let i = 0; i < 50 && (Sync.running || Sync.again); i++) await new Promise(r => setImmediate(r)); };
const edit = (id, fn) => { const t = Store.get(id); fn(t); return Store.put(t); };

(async () => {
  S.user = 'uA'; Auth.switchTo({ id: 'uA', email: 'a@x' });
  const t = trip('Allgäu', { extraCosts: [{ id: 'k1', label: 'Kurtaxe', amount: 20 }], customChecks: [] });
  Store.put(t, true); await run();
  const id = t.id; S.rows[id].members.uB = 'editor';
  assert.equal(S.rows[id].version, 1);

  /* 1. Unabhängige Änderungen: Ben ändert Budget und ergänzt Zusatzkosten, Anna ändert Titel → beides online, kein Konflikt */
  S.remoteEdit(id, d => { d.budget = 1400; d.extraCosts.push({ id: 'k2', label: 'Parken', amount: 30 }); });
  edit(id, x => { x.title = 'Allgäu Winter'; x.extraCosts.push({ id: 'k3', label: 'Skiverleih', amount: 60 }); });
  assert(Store.meta[id].base, 'Basis beim ersten Bearbeiten gemerkt');
  await run();
  assert(!Store.meta[id].conflict, 'kein Konflikt');
  assert.equal(S.rows[id].data.title, 'Allgäu Winter'); assert.equal(S.rows[id].data.budget, 1400);
  assert.deepEqual(S.rows[id].data.extraCosts.map(x => x.id), ['k1', 'k2', 'k3']);
  assert.equal(S.rows[id].version, 3, 'eine Fremdänderung + ein zusammengeführtes Speichern');
  assert.equal(Store.pending(), 0); assert.equal(a.tripSyncState(id), 'online');
  assert.equal(Store.get(id).budget, 1400, 'Fremdänderung auch lokal sichtbar');
  assert(!Store.meta[id].base, 'Basis nach Erfolg entfernt');
  assert(/zusammengeführt/.test(Sync.notice));

  /* 2. Widerspruch: beide ändern den Titel, Anna zusätzlich Notizen, Ben die Personen */
  S.remoteEdit(id, d => { d.title = 'Allgäu (Ben)'; d.persons = 3; });
  edit(id, x => { x.title = 'Allgäu (Anna)'; x.notes = 'Schlitten mitnehmen'; });
  await run();
  const cf = Store.meta[id].conflict;
  assert(cf && cf.merge, 'Konflikt mit Einzelwahl'); assert.equal(cf.merge.conflicts.length, 1);
  assert.equal(S.rows[id].data.title, 'Allgäu (Ben)', 'Server unverändert');
  assert.equal(Store.get(id).title, 'Allgäu (Anna)', 'lokale Fassung unverändert bis zur Wahl');
  const html = a.conflictBlock(Store.get(id));
  assert(html.includes('Gleichzeitige Bearbeitung') && html.includes('Bitte je Punkt wählen') && html.includes('Meine: Allgäu (Anna)') && html.includes('Online: Allgäu (Ben)'));
  assert(html.includes('data-how="copy"'), 'bisherige Wege bleiben');
  assert.throws(() => Sync.resolve(id, 'pick', {}), /jeden Punkt/);
  Sync.resolve(id, 'pick', { [cf.merge.conflicts[0].id]: 'mine' });
  await run();
  assert.equal(S.rows[id].data.title, 'Allgäu (Anna)'); assert.equal(S.rows[id].data.notes, 'Schlitten mitnehmen'); assert.equal(S.rows[id].data.persons, 3);
  assert.equal(Store.pending(), 0); assert(!Store.meta[id].conflict);

  /* 3. Wahl „online“: Fremdfassung gilt, eigene unabhängige Änderung bleibt */
  S.remoteEdit(id, d => { d.extraCosts = d.extraCosts.filter(x => x.id !== 'k1'); });
  edit(id, x => { x.extraCosts.find(e => e.id === 'k1').amount = 24; x.budget = 1300; });
  await run();
  const c3 = Store.meta[id].conflict.merge.conflicts;
  assert.equal(c3.length, 1); assert.equal(c3[0].what, 'online gelöscht, hier geändert');
  Sync.resolve(id, 'pick', { [c3[0].id]: 'theirs' }); await run();
  assert(!S.rows[id].data.extraCosts.some(x => x.id === 'k1')); assert.equal(S.rows[id].data.budget, 1300);

  /* 4. Ohne gemerkte Basis (Änderung aus älterem App-Stand) bleibt es beim Konflikt der ganzen Reise */
  S.remoteEdit(id, d => { d.budget = 1250; });
  edit(id, x => { x.notes = 'ohne Basis'; }); delete Store.meta[id].base;
  await run();
  assert(Store.meta[id].conflict && !Store.meta[id].conflict.merge);
  assert(a.conflictBlock(Store.get(id)).includes('Meine Version als Kopie'));
  Sync.resolve(id, 'server'); await run();
  assert.equal(Store.get(id).budget, 1250);

  /* 5. Gleicher Inhalt auf beiden Seiten: nichts zu speichern, Online-Stand übernommen */
  S.remoteEdit(id, d => { d.notes = 'gleich'; });
  const v = S.rows[id].version;
  edit(id, x => { x.notes = 'gleich'; });
  await run();
  assert.equal(S.rows[id].version, v, 'kein unnötiges Speichern'); assert.equal(Store.pending(), 0); assert(!Store.meta[id].conflict);

  /* 6. Ohne RPMerge (älterer Stand / Ladefehler): bisheriges Verhalten */
  const keep = ctx.window.RPMerge; ctx.window.RPMerge = undefined;
  S.remoteEdit(id, d => { d.persons = 4; }); edit(id, x => { x.notes = 'alt'; }); await run();
  assert(Store.meta[id].conflict && !Store.meta[id].conflict.merge);
  ctx.window.RPMerge = keep; Sync.resolve(id, 'server'); await run();

  /* 7. Zusammengeführtes Ergebnis ungültig → kein Abgleich, Konflikt der ganzen Reise */
  const realMerge = keep.merge3; keep.merge3 = (b, m, th) => { const r = realMerge(b, m, th); r.result.persons = -1; r.result.items = 'kaputt'; return r; };
  S.remoteEdit(id, d => { d.budget = 999; }); edit(id, x => { x.notes = 'x'; }); await run();
  keep.merge3 = realMerge;
  assert(Store.meta[id].conflict && !Store.meta[id].conflict.merge, 'ungültiges Ergebnis wird nicht gespeichert');
  assert.notEqual(S.rows[id].data.items, 'kaputt');

  console.log('sync-merge: 7 Abläufe bestanden');
})().catch(e => { console.error(e); process.exit(1); });
