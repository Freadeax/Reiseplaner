/* Format 5 in der App, Lese-Release (SCHEMA_V5 §8 Schritt 3, F5_WRITE=false): v5-Reisen werden gelesen, geprüft und
   unverändert zurückgeschrieben (Bearbeiten, Sicherung, Import, Sync), keine Rückstufung, Fotos in v5-Reisen, ältere
   Stände lesen v5 nur. Node-Test mit index.html und den echten Logikdateien; Server nachgebildet. Kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.indexOf('<script src="v5logic.js"></script>') > html.indexOf('<script src="v4logic.js"></script>'), 'index.html lädt v5logic.js nach v4logic.js');
const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
assert(/const F5_WRITE=(true|false);/.test(code), 'Schalter F5_WRITE vorhanden');
const P = require('../photostore.js');
const J = x => JSON.parse(JSON.stringify(x));

function fakeServer(allowed) {
  const S = { rows: {}, user: null, calls: [], allowed: allowed || [2, 3, 4, 5] };
  const out = (r, u) => ({ id: r.id, data: J(r.data), version: r.version, owner_id: r.owner, deleted_at: r.deleted_at, updated_at: new Date().toISOString(), role: r.members[u] });
  const check = data => { if (!S.allowed.includes(data.schemaVersion)) { const e = new Error('check constraint "trips_schema_version_check"'); e.code = '23514'; throw e; }
    const prev = S.rows[data.id]; if (prev && (data.schemaVersion || 2) < (prev.data.schemaVersion || 2)) { const e = new Error('neueren App-Version'); e.code = '23514'; throw e; } };
  S.api = { enabled: () => true, onAuth() {}, async init() { return S.user ? { id: S.user } : null; }, async signOut() { S.user = null; },
    async listTrips(u) { S.calls.push('list'); return Object.values(S.rows).filter(r => r.members[u]).map(r => out(r, u)); },
    async getTrip(id) { const r = S.rows[id]; return r && r.members[S.user] ? out(r, S.user) : null; },
    async insertTrip(id, data) { S.calls.push('insert ' + id); check(data); S.rows[id] = { id, data, version: 1, owner: S.user, deleted_at: null, members: { [S.user]: 'owner' } }; return out(S.rows[id], S.user); },
    async updateTrip(id, data, v) { S.calls.push('update ' + id); check(data); const r = S.rows[id]; if (!r || r.version !== v) return null; r.data = data; r.version++; return out(r, S.user); },
    async deleteTrip() { return null; } };
  return S;
}
function makeApp(o) {
  o = o || {};
  const store = o.store || new Map(), alerts = [];
  const photos = new Map();
  const RPPhotos = Object.assign({}, P, { create: () => ({ async put(id) { photos.set(id, 1); return { id }; }, async get() { return null; }, async has(id) { return { work: photos.has(id), thumb: photos.has(id) }; }, async remove(id) { photos.delete(id); return true; } }) });
  const syncEl = { className: '', querySelector() { return syncEl._s; }, _s: { textContent: '' } };
  const ctx = {
    window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: require('../v4logic.js'), RPV5: o.noV5 ? undefined : require('../v5logic.js'),
      RPBook: require('../bookgen.js'), RPCatalog: require('../catalog.js'), RPPhotos, RPCloud: o.server ? o.server.api : undefined },
    location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
    navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: k => k === '#sync' ? syncEl : null, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, visibilityState: 'visible' },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL, Blob, TextEncoder, TextDecoder, crypto: globalThis.crypto, alert: m => alerts.push(m)
  };
  ctx.window.document = ctx.document; ctx.window.crypto = globalThis.crypto;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.alertMsg = m => alerts.push(m); ctx.render = () => {};
  return { ctx, a: ctx.window.__app, F: vm.runInContext('RPF4', ctx), store, alerts };
}
/* Eine gültige Format-5-Reise aus der Silvester-Vorlage: v5-Felder aus mehreren Modulen */
function v5trip(a) {
  const t = a.silvesterTemplate();
  return Object.assign(t, { schemaVersion: 5, party: [{ id: 'pphil', name: 'Philipp' }],
    tasks: [{ id: 'task1', title: 'Winterreifen prüfen', due: { date: '2026-12-20', time: null, tz: null }, done: false, by: 'pphil' }],
    deadlineAck: { depart: { at: '2026-11-16T09:00:00Z', note: '' } },
    criteria: { must: ['sauna'], budgetWish: 1200, budgetMax: 1500 },
    guestCards: [{ id: 'gcard', cardId: null, name: 'Gästekarte', scope: { stayId: t.stayId || 'os-holidu' }, status: 'unbestaetigt', evidence: null, persons: null }],
    docs: [{ id: 'doc1', kind: 'bestaetigung', title: 'Hotel', secret: { label: 'Buchungsnummer', value: 'HX-4711' }, share: 'mitglieder', cloud: { state: 'none' } }],
    zukunft: { feld: 1 } });
}
const V5KEYS = ['tasks', 'deadlineAck', 'criteria', 'guestCards', 'docs', 'party', 'zukunft'];
const pick = t => J(V5KEYS.reduce((o, k) => (o[k] = t[k], o), {}));

(async () => {
  let n = 0;
  /* 1. Lesen, prüfen, bearbeiten mit Feldtreue (Gast) */
  {
    const { a, ctx } = makeApp();
    assert.equal(vm.runInContext('SCHEMA_MAX', ctx), 5, 'mit v5logic.js liest die App Format 5');
    const t = v5trip(a); a.validateExtras(t);
    a.Store.setScope('guest'); assert(a.Store.put(J(t)));
    const s = a.Store.get(t.id); a.setField(s, 'title', 'Silvester neu');
    const after = a.Store.get(t.id);
    assert.equal(after.title, 'Silvester neu'); assert.equal(after.schemaVersion, 5);
    assert.deepEqual(pick(after), pick(t), 'Feldtreue: v5-Felder unverändert nach Bearbeiten');
    assert.throws(() => a.validateExtras(Object.assign(J(t), { tasks: [{ id: 'task1', title: 'x', due: null, done: false, by: 'pxxx' }] })), /gibt es in dieser Reise nicht/, 'ungültige v5-Felder abgelehnt');
    assert.throws(() => a.validateExtras(Object.assign(J(t), { schemaVersion: 4 })), /erst ab Format 5/, 'v5-Felder in Format 4 abgelehnt');
    assert.throws(() => a.validateExtras(Object.assign(J(t), { schemaVersion: 6 })), /Unbekannte Reiseversion/);
    n++;
    /* 2. Keine Rückstufung im Speicher */
    const down = J(a.Store.get(t.id)); down.schemaVersion = 4; V5KEYS.slice(0, 5).forEach(k => delete down[k]);
    assert.equal(a.Store.put(down), false, 'Rückstufung 5 → 4 abgelehnt'); assert.equal(a.Store.get(t.id).schemaVersion, 5);
    n++;
    /* 3. Sicherung und Import: unverändert rund, Kopie bleibt Format 5 */
    const raw = J(a.backupData([a.Store.get(t.id)]));
    assert.equal(raw.trips[0].docs[0].secret.value, 'HX-4711', 'vollständige Sicherung behält den Code (Mappe gehört zur Reise)');
    const back = a.validateBackup(raw)[0]; assert.deepEqual(pick(back), pick(after), 'Sicherung rund');
    const ids = a.importTrips(raw, 'copy'); const copy = a.Store.get(ids[0]);
    assert(copy.id !== t.id && copy.schemaVersion === 5 && copy.tasks[0].id === 'task1', 'Import als Kopie bleibt Format 5');
    n++;
    /* 4. Fotos in einer Format-5-Reise: bleibt 5, kein Anheben */
    const bytes = new Uint8Array(64).fill(3); bytes.set([0xFF, 0xD8, 0xFF, 0xD9]);
    const m = { id: 'fotoeins', takenAt: '2026-12-31T14:00:00', w: 2048, h: 1536, bytes: 64, sha256: await P.sha256(bytes), caption: '', day: '2026-12-31' };
    const cand = makeApp().F.mediaCommit(a.Store.get(t.id), [m]);
    assert.equal(cand.upgrade, false); assert.equal(cand.trip.schemaVersion, 5); assert.equal(cand.trip.media.length, 1);
    assert.deepEqual(pick(cand.trip), pick(after), 'Feldtreue beim Foto');
    n++;
    /* 5. Ältere Stände: ohne v5logic.js wird eine v5-Sicherung abgelehnt, nicht gekürzt */
    const old = makeApp({ noV5: true });
    assert.equal(vm.runInContext('SCHEMA_MAX', old.ctx), 4);
    assert.throws(() => old.a.validateBackup(raw), /Unbekannte Reiseversion/);
    assert(old.a.serverRowProblem({ id: t.id, data: raw.trips[0], version: 1 }).newer, 'alter Stand: Serverzeile v5 = neuere Version');
    assert.equal(a.serverRowProblem({ id: t.id, data: raw.trips[0], version: 1 }), null, 'neuer Stand: v5-Serverzeile lesbar');
    n++;
  }
  /* 6. Sync: Format 5 geht unverändert auf den Server und kommt unverändert zurück */
  {
    const S = fakeServer(); const { a } = makeApp({ server: S });
    S.user = 'uA'; a.Auth.switchTo({ id: 'uA' });
    const t = v5trip(a); a.Store.put(J(t)); await a.Sync.run();
    assert.equal(S.rows[t.id].data.schemaVersion, 5); assert.deepEqual(pick(S.rows[t.id].data), pick(t), 'Server erhält v5-Felder vollständig');
    const second = makeApp({ server: S }); second.a.Auth.switchTo({ id: 'uA' }); await second.a.Sync.run();
    assert.deepEqual(pick(second.a.Store.get(t.id)), pick(t), 'zweites Gerät liest v5 unverändert');
    const loc = second.a.Store.get(t.id); loc.title = 'Gerät 2'; second.a.Store.put(loc); await second.a.Sync.run();
    assert.equal(S.rows[t.id].version, 2); assert.deepEqual(pick(S.rows[t.id].data), pick(t), 'Bearbeitung auf Gerät 2 behält v5-Felder');
    n++;
  }
  console.log('Format 5 in der App (Lese-Release): ' + n + ' Prüfungen bestanden (SCHEMA_MAX 5, Prüfung, Feldtreue beim Bearbeiten, keine Rückstufung, Sicherung/Import, Fotos in v5, älterer Stand nur lesen, Sync über zwei Geräte). Kein Browser-/iPhone-Test.');
})().catch(e => { console.error(e); process.exit(1); });
