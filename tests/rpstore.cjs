/* Speicheradapter RPStore (P0.4): Migration rp-trips → IndexedDB, Rücklesevergleich, Marker, rp-trips bleibt,
   Rückfall ohne IndexedDB, Kontingentfehler ohne falschen Erfolg, zwei Tabs, Wiederherstellung, Zurückrollen,
   Konto-Bereich entfernen. Node-Test mit eigenem In-Memory-IndexedDB-Ersatz (kein fake-indexeddb installiert);
   kein Browser- oder iPhone-Test. Der echte Browserfall steht in tests/browser.cjs (storageAdapter). */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const L = require('../rpstore.js');

/* ---------- In-Memory-Ersatz für die genutzte IndexedDB-Teilmenge ----------
   open/onupgradeneeded/onsuccess/onerror, createObjectStore(keyPath), transaction(readonly|readwrite) mit
   get/put/delete/getAllKeys, oncomplete/onabort, abort(), Auto-Commit nach dem letzten Request.
   Transaktionen einer Datenbank laufen strikt nacheinander (stärker als die Spezifikation verlangt).
   Fehlerinjektion: F.fail({op,store,value}) → Error im Request, F.failCommit({writes}) → Abbruch beim Commit,
   F.tamper(value) → verfälscht den gespeicherten Wert (Rücklesevergleich), F.openFail, F.hang. */
function fakeIDB() {
  const dbs = {}, later = f => setTimeout(f, 0), clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const err = (name, msg) => Object.assign(new Error(msg || name), { name });
  const F = { fail: null, failCommit: null, tamper: null, openFail: null, hang: false, dbs };
  F.open = (name, version) => {
    const req = { result: null, error: null };
    later(() => {
      if (F.hang) return;
      if (F.openFail) { req.error = F.openFail; if (req.onerror) req.onerror({ preventDefault() {} }); return; }
      let d = dbs[name];
      if (d && version < d.version) { req.error = err('VersionError'); if (req.onerror) req.onerror({ preventDefault() {} }); return; }
      const upgrade = !d || version > d.version;
      if (!d) d = dbs[name] = { version: 0, stores: {}, conns: new Set(), lock: Promise.resolve() };
      const conn = connection(d);
      req.result = conn;
      if (upgrade) { d.version = version; if (req.onupgradeneeded) req.onupgradeneeded({}); }
      d.conns.add(conn);
      if (req.onsuccess) req.onsuccess({});
    });
    return req;
  };
  function connection(d) {
    const conn = {
      closed: false, onversionchange: null, onclose: null,
      objectStoreNames: { contains: n => !!d.stores[n] },
      createObjectStore(n, o) { d.stores[n] = { keyPath: o.keyPath, data: new Map() }; },
      close() { conn.closed = true; d.conns.delete(conn); },
      transaction(names, mode) {
        if (conn.closed) throw err('InvalidStateError', 'Verbindung geschlossen');
        names = [].concat(names); names.forEach(n => { if (!d.stores[n]) throw err('NotFoundError'); });
        return transaction(d, names, mode || 'readonly');
      }
    };
    return conn;
  }
  function transaction(d, names, mode) {
    const writes = [], queue = [];
    let started = false, running = false, done = false, release = () => {};
    const tx = { error: null, mode, oncomplete: null, onerror: null, onabort: null };
    const readKey = (n, key) => { for (let i = writes.length - 1; i >= 0; i--) { const w = writes[i]; if (w[0] === n && w[2] === key) return w[1] === 'put' ? w[3] : undefined; } return d.stores[n].data.get(key); };
    function abort(e) { if (done) return; done = true; tx.error = e; release(); later(() => { if (tx.onabort) tx.onabort({}); }); }
    function commit() {
      if (done) return;
      const e = F.failCommit && F.failCommit({ writes: writes.slice() });
      if (e) { abort(e); return; }
      writes.forEach(([n, op, key, v]) => { if (op === 'put') d.stores[n].data.set(key, F.tamper ? F.tamper(clone(v)) : clone(v)); else d.stores[n].data.delete(key); });
      done = true; release(); later(() => { if (tx.oncomplete) tx.oncomplete({}); });
    }
    function step() {
      if (done) return;
      const item = queue.shift();
      if (!item) { running = false; commit(); return; }
      try { item.r.result = item.fn(); }
      catch (e) { item.r.error = e; if (item.r.onerror) item.r.onerror({ preventDefault() {} }); if (tx.onerror) tx.onerror({ preventDefault() {} }); abort(e); return; }
      try { if (item.r.onsuccess) item.r.onsuccess({}); } catch (e) { abort(e); return; }
      later(step);
    }
    const kick = () => { if (started && !running && !done) { running = true; later(step); } };
    const request = fn => { const r = { result: undefined, error: null }; if (done) throw err('TransactionInactiveError'); queue.push({ r, fn }); kick(); return r; };
    const rw = () => { if (mode !== 'readwrite') throw err('ReadOnlyError'); };
    tx.objectStore = n => {
      if (!names.includes(n)) throw err('NotFoundError');
      return {
        get: key => request(() => clone(readKey(n, key))),
        put: value => request(() => { rw(); const e = F.fail && F.fail({ op: 'put', store: n, value }); if (e) throw e; const key = value[d.stores[n].keyPath]; writes.push([n, 'put', key, clone(value)]); return key; }),
        delete: key => request(() => { rw(); const e = F.fail && F.fail({ op: 'delete', store: n, key }); if (e) throw e; writes.push([n, 'del', key]); }),
        getAllKeys: () => request(() => { const ks = new Set(d.stores[n].data.keys()); writes.filter(w => w[0] === n).forEach(w => w[1] === 'put' ? ks.add(w[2]) : ks.delete(w[2])); return [...ks].sort(); })
      };
    };
    tx.abort = () => { if (done) throw err('InvalidStateError'); abort(err('AbortError')); };
    d.lock = d.lock.then(() => new Promise(rel => { release = rel; started = true; if (queue.length) kick(); else later(() => { if (!queue.length && !running) commit(); }); }));
    return tx;
  }
  F.raw = key => { const d = dbs[L.DB_NAME]; const r = d && d.stores.kv && d.stores.kv.data.get(key); return r ? r.raw : undefined; };
  F.rec = key => { const d = dbs[L.DB_NAME]; return d && d.stores.kv && clone(d.stores.kv.data.get(key)); };
  F.marker = () => { const d = dbs[L.DB_NAME]; return d && d.stores.meta && clone(d.stores.meta.data.get('marker')); };
  F.keys = () => { const d = dbs[L.DB_NAME]; return d && d.stores.kv ? [...d.stores.kv.data.keys()].sort() : []; };
  return F;
}
/* localStorage-Ersatz mit Kontingentfehler je Schlüssel */
function fakeLS() {
  const m = new Map(), quota = new Set();
  return {
    m, quota,
    get length() { return m.size; }, key: i => [...m.keys()][i] ?? null,
    getItem: k => m.has(k) ? m.get(k) : null,
    setItem: (k, v) => { if (quota.has(k)) throw Object.assign(new Error('Testkontingent'), { name: 'QuotaExceededError' }); m.set(k, String(v)); },
    removeItem: k => { m.delete(k); }
  };
}
/* BroadcastChannel-Ersatz: verteilt an alle anderen Kanäle gleichen Namens */
function fakeBC() {
  const hub = new Set();
  return class { constructor(name) { this.name = name; hub.add(this); } postMessage(msg) { const data = JSON.parse(JSON.stringify(msg)); hub.forEach(o => { if (o !== this && o.name === this.name && o.onmessage) setTimeout(() => o.onmessage({ data }), 0); }); } close() { hub.delete(this); } };
}
const world = () => ({ idb: fakeIDB(), ls: fakeLS(), BC: fakeBC() });
const store = (w, extra) => L.create(Object.assign({ indexedDB: () => w.idb, localStorage: () => w.ls, BroadcastChannel: w.BC, timeoutMs: 200 }, extra || {}));
const tick = (ms) => new Promise(r => setTimeout(r, ms || 5));
async function until(fn, what, ms) { const end = Date.now() + (ms || 2000); while (Date.now() < end) { if (fn()) return; await tick(5); } throw new Error('Zeitüberschreitung: ' + what); }

/* ---------- echte App (index.html) mit RPStore im vm-Kontext, wie tests/sync.cjs ---------- */
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace("go(location.hash||'reisen',true);", '');
assert(/<script src="rpstore\.js"><\/script>\s*<script>/.test(html), 'rpstore.js wird vor dem App-Skript geladen');
function app(w, opts) {
  opts = opts || {};
  const R = store(w, opts.env);
  const msg = { textContent: '', hidden: false, style: {}, setAttribute() {} };
  const view = { innerHTML: '', hidden: false, style: {}, textContent: '', className: '', querySelector() { return { textContent: '', style: {} }; } };
  const syncEl = { className: '', textContent: '', querySelector() { return syncEl._s; }, _s: { textContent: '' } };
  const els = Object.fromEntries(['#sheet-root', '#dock', '#dock-nm', '#dock-sum', '#dock-bar'].map(k => [k, { innerHTML: '', hidden: false, style: {}, textContent: '', className: '', querySelector() { return { textContent: '', style: {} }; } }]));
  els['#view'] = view; els['#msg'] = msg; els['#sync'] = syncEl;
  const ctx = {
    window: { addEventListener() {}, RPStore: R, RPCloud: opts.cloud }, location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
    navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: k => els[k] || null, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, visibilityState: 'visible' },
    localStorage: w.ls, setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL
  };
  ctx.window.document = ctx.document;
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const a = ctx.window.__app;
  return { a, Store: a.Store, R, msg, view, ready: a.Store.backendReady };
}

let finished = false;
process.on('exit', () => { if (!finished) { console.error('tests/rpstore.cjs: nicht bis zum Ende gelaufen (hängendes Promise?)'); process.exitCode = 1; } });
(async () => {
  /* 1. Abgleichsregel */
  const d = L.decide, rec = (raw, by) => ({ raw, rev: 1, by: by || 'alt' });
  assert.equal(d(null, null, {}), 'empty');
  assert.equal(d('A', null, {}), 'migrate');
  assert.equal(d('{kaputt', null, { lsValid: false }), 'keep');
  assert.equal(d('A', rec('A'), {}), 'same');
  assert.equal(d('A', rec('A'), { absentAtStart: true }), 'same', 'gleicher Stand ist keine Wiederherstellung');
  assert.equal(d(null, rec('A'), { absentAtStart: true }), 'restore');
  assert.equal(d('B', rec('A'), { absentAtStart: true }), 'restore', 'leer beim Laden, schon neu gespeichert: vereinigen statt verwerfen');
  assert.equal(d('B', rec('A', 'ich'), { absentAtStart: true, self: 'ich' }), 'adopt', 'eigene Kopie dieser Sitzung wird nie „wiederhergestellt“');
  assert.equal(d(null, rec('A'), {}), 'foreign', 'während der Sitzung fremd entfernt: nichts anfassen');
  assert.equal(d('{kaputt', rec('A'), { lsValid: false }), 'backup', 'beschädigtes localStorage überschreibt die Kopie nie');
  assert.equal(d('B', rec('A'), {}), 'adopt', 'localStorage neuer (alte App-Version, Abbruch)');
  assert.equal(d(null, rec('{kaputt'), { drop: '{kaputt', absentAtStart: true }), 'drop');

  /* 2. Gleiche Semantik beider Speicher (get, update atomar, Überspringen, Löschen, keys) */
  {
    const w = world(), R = store(w); await R.init();
    const db = await new Promise(res => { const r = w.idb.open(L.DB_NAME, L.DB_VERSION); r.onsuccess = () => res(r.result); });
    const lsx = fakeLS();
    for (const be of [L.localBackend(() => lsx), L.idbBackend(db)]) {
      assert.equal(await be.get('rp-trips'), null, be.name + ': leer');
      let u = await be.update('rp-trips', cur => { assert.equal(cur, null); return '{"a":1}'; }, 'x');
      assert(u.changed); assert.equal((await be.get('rp-trips')).raw, '{"a":1}');
      u = await be.update('rp-trips', () => undefined); assert(!u.changed, be.name + ': undefined überspringt');
      assert.equal((await be.get('rp-trips')).raw, '{"a":1}');
      u = await be.update('rp-trips', cur => cur.raw.replace('1', '2')); assert.equal((await be.get('rp-trips')).raw, '{"a":2}');
      assert((await be.keys()).includes('rp-trips'));
      u = await be.update('rp-trips', () => null); assert.equal(await be.get('rp-trips'), null, be.name + ': null löscht');
    }
    const be = L.idbBackend(db); await be.update('rp-history', () => '[]'); await be.update('rp-history', () => '[1]');
    assert.equal((await be.get('rp-history')).rev, 2, 'Versionszähler je Datensatz');
    w.idb.fail = ({ op }) => op === 'put' ? Object.assign(new Error('voll'), { name: 'QuotaExceededError' }) : null;
    await assert.rejects(() => be.update('rp-history', () => '[2]'), e => e.name === 'QuotaExceededError', 'Kontingentfehler lehnt ab');
    w.idb.fail = null; assert.equal((await be.get('rp-history')).raw, '[1]', 'abgebrochene Transaktion ändert nichts');
  }

  /* 3. Erste Migration: alle Bereiche kopiert, zurückgelesen, Marker; rp-trips bleibt unverändert */
  const guest = { t1: { id: 't1', title: 'Wien' }, t2: { id: 't2', title: 'Prag' } };
  const seed = w => {
    w.ls.setItem('rp-trips', JSON.stringify(guest));
    w.ls.setItem('rp-history', JSON.stringify([{ at: '2026-10-01T10:00:00.000Z', raw: '{}' }]));
    w.ls.setItem('rp-u:uA', JSON.stringify({ v: 1, trips: { k1: { id: 'k1', title: 'Konto' } }, meta: {}, queue: {} }));
    w.ls.setItem('rp-u:uA:history', '[]');
    w.ls.setItem('rp-u:uB', '{kaputt');
    w.ls.setItem('rp-appearance', 'book'); w.ls.setItem('rp-adopted:uA', '[]');
  };
  {
    const w = world(); seed(w); const before = new Map(w.ls.m);
    const R = store(w); const s = await R.init();
    assert.equal(s.mode, 'idb', s.reason);
    assert.deepEqual(w.idb.keys(), ['rp-history', 'rp-trips', 'rp-u:uA', 'rp-u:uA:history'], 'genau die Reisebereiche kopiert, Beschädigtes und Fremdes nicht');
    for (const k of w.idb.keys()) assert.equal(w.idb.raw(k), w.ls.getItem(k), 'Gleichheit ' + k);
    const m = w.idb.marker(); assert.equal(m.version, L.MIGRATION); assert(m.migratedAt); assert.deepEqual(m.skipped, ['rp-u:uB']);
    assert.deepEqual([...w.ls.m], [...before], 'localStorage unverändert, rp-trips bleibt als Sicherung');
    /* zweiter Start: keine erneute Migration */
    const revs = w.idb.keys().map(k => w.idb.rec(k).rev), R2 = store(w); await R2.init();
    assert.equal(w.idb.marker().migratedAt, m.migratedAt); assert.deepEqual(w.idb.keys().map(k => w.idb.rec(k).rev), revs, 'Marker verhindert Doppelmigration');
    assert.deepEqual(R2.status().migrated, [], 'nichts erneut kopiert');
  }

  /* 4. Abbruch mitten in der Migration: kein Marker, localStorage unverändert, nächster Start vollständig */
  {
    const w = world(); seed(w); const before = new Map(w.ls.m);
    w.idb.fail = ({ op, value }) => op === 'put' && value && value.key === 'rp-u:uA' ? Object.assign(new Error('voll'), { name: 'QuotaExceededError' }) : null;
    let st = []; const R = store(w); R.onStatus(s => st.push(s));
    const s = await R.init();
    assert.equal(s.mode, 'local'); assert(/nicht abgeschlossen/.test(s.reason) && /QuotaExceededError/.test(s.reason), s.reason);
    assert.equal(st.length, 1, 'Rückfall wird gemeldet'); assert.equal(w.idb.marker(), undefined, 'kein Marker nach Abbruch');
    assert.deepEqual([...w.ls.m], [...before], 'localStorage unverändert');
    assert.deepEqual(await R.write('rp-trips', w.ls.getItem('rp-trips')), { ok: false, skipped: true, reason: s.reason }, 'kein stiller Erfolg im Rückfall');
    w.idb.fail = null; const R2 = store(w); assert.equal((await R2.init()).mode, 'idb');
    assert(w.idb.marker()); for (const k of ['rp-trips', 'rp-history', 'rp-u:uA', 'rp-u:uA:history']) assert.equal(w.idb.raw(k), w.ls.getItem(k));
  }

  /* 5. Rücklesevergleich schlägt fehl → Rückfall, kein Marker */
  {
    const w = world(); seed(w); w.idb.tamper = v => v && v.raw ? Object.assign(v, { raw: v.raw + ' ' }) : v;
    const s = await store(w).init(); assert.equal(s.mode, 'local'); assert(/Rücklesevergleich/.test(s.reason), s.reason); assert.equal(w.idb.marker(), undefined);
  }

  /* 6. Rückfall ohne IndexedDB, gesperrt, Zeitüberschreitung, Öffnungsfehler */
  {
    const w = world(); seed(w);
    const none = L.create({ indexedDB: () => null, localStorage: () => w.ls });
    let s = await none.init(); assert.equal(s.mode, 'local'); assert(/nicht verfügbar/.test(s.reason));
    assert.equal((await none.write('rp-trips', '{}')).ok, false); assert.equal((await none.reconcile('rp-trips')).state, 'local');
    assert.equal(await none.remove(['rp-u:uA']), true, 'ohne IndexedDB gibt es keine Kopie zu löschen'); assert.equal(w.ls.getItem(L.DROP_KEY), null);
    const sec = L.create({ indexedDB: () => { throw Object.assign(new Error('blockiert'), { name: 'SecurityError' }); }, localStorage: () => w.ls });
    s = await sec.init(); assert.equal(s.mode, 'local'); assert(/SecurityError/.test(s.reason));
    const w2 = world(); w2.idb.hang = true; s = await store(w2, { timeoutMs: 30 }).init(); assert.equal(s.mode, 'local'); assert(/Zeitüberschreitung/.test(s.reason));
    const w3 = world(); w3.idb.openFail = Object.assign(new Error('privat'), { name: 'InvalidStateError' }); s = await store(w3).init(); assert(/InvalidStateError/.test(s.reason));
  }

  /* 7. Durchschreiben: nur was localStorage enthält, zusammengefasst, veraltetes verworfen, Kontingent ohne falschen Erfolg */
  {
    const w = world(), R = store(w); await R.init(); await R.reconcile('rp-trips'); /* write() erst nach dem ersten Abgleich */
    w.ls.setItem('rp-trips', '{"a":1}'); const p1 = R.write('rp-trips', '{"a":1}');
    w.ls.setItem('rp-trips', '{"a":2}'); const p2 = R.write('rp-trips', '{"a":2}');
    w.ls.setItem('rp-trips', '{"a":3}'); const p3 = R.write('rp-trips', '{"a":3}');
    const r = await Promise.all([p1, p2, p3]); assert(r.every(x => x.ok)); assert.equal(w.idb.raw('rp-trips'), '{"a":3}');
    assert(w.idb.rec('rp-trips').rev <= 2, 'Schreibvorgänge zusammengefasst');
    const stale = await R.write('rp-trips', '{"a":2}'); assert(stale.ok && stale.stale && !stale.changed, 'veralteter Text wird verworfen');
    assert.equal(w.idb.raw('rp-trips'), '{"a":3}');
    assert.equal((await R.write('fremd', 'x')).ok, false, 'nur vorgesehene Schlüssel');
    w.idb.failCommit = () => Object.assign(new Error('voll'), { name: 'QuotaExceededError' });
    w.ls.setItem('rp-trips', '{"a":4}'); const q = await R.write('rp-trips', '{"a":4}');
    assert.equal(q.ok, false); assert.equal(q.error, 'QuotaExceededError'); assert.equal(R.status().mode, 'local'); assert(/QuotaExceededError/.test(R.status().reason));
    assert.equal(w.idb.raw('rp-trips'), '{"a":3}', 'abgebrochener Commit ändert die Kopie nicht');
    w.idb.failCommit = null; assert.equal((await R.write('rp-trips', '{"a":4}')).ok, false, 'Rückfall gilt für die Sitzung');
  }

  /* 7b. Speichern während des Ladens (Review 17.10.): ein write() vor dem ersten Abgleich ersetzt die Kopie einer früheren
     Sitzung nicht; reconcile() entscheidet auf dem alten Stand („restore“) und verwirft den eingereihten Teilstand. */
  {
    const w = world(), old = store(w, { id: 'alt' }); await old.init(); await old.reconcile('rp-trips');
    w.ls.setItem('rp-trips', '{"wien":1,"prag":1}'); assert((await old.write('rp-trips', '{"wien":1,"prag":1}')).ok);
    w.ls.removeItem('rp-trips'); /* Browser räumt nur localStorage */
    const R = store(w, { id: 'neu' });
    w.ls.setItem('rp-trips', '{"neu":1}'); const early = R.write('rp-trips', '{"neu":1}'); /* noch beim Laden */
    await R.init(); await new Promise(r => setImmediate(r));
    assert.equal(w.idb.raw('rp-trips'), '{"wien":1,"prag":1}', 'Kopie vor dem Abgleich unverändert');
    const d = await R.reconcile('rp-trips', { absentAtStart: true });
    assert.equal(d.state, 'restore'); assert.equal(d.rec.raw, '{"wien":1,"prag":1}');
    assert((await early).deferred, 'eingereihter Teilstand verworfen'); assert.equal(w.idb.raw('rp-trips'), '{"wien":1,"prag":1}');
    w.ls.setItem('rp-trips', '{"neu":1,"wien":1,"prag":1}'); assert((await R.write('rp-trips', '{"neu":1,"wien":1,"prag":1}')).ok);
    assert.equal(w.idb.raw('rp-trips'), '{"neu":1,"wien":1,"prag":1}', 'danach normales Durchschreiben');
  }

  /* 8. Zwei Tabs: Benachrichtigung, älterer Text überschreibt keinen neueren */
  {
    const w = world(), A = store(w, { id: 'A' }), B = store(w, { id: 'B' }); await A.init(); await B.init();
    await A.reconcile('rp-trips'); await B.reconcile('rp-trips');
    const seen = []; B.onRemote(m => seen.push(m));
    w.ls.setItem('rp-trips', '{"v":"A1"}'); await A.write('rp-trips', '{"v":"A1"}'); await until(() => seen.length, 'Broadcast');
    assert.equal(seen[0].key, 'rp-trips'); assert.equal(seen[0].from, 'A'); assert.equal(seen[0].type, 'put');
    w.ls.setItem('rp-trips', '{"v":"A2"}'); const slow = A.write('rp-trips', '{"v":"A2"}');
    w.ls.setItem('rp-trips', '{"v":"B1"}'); await B.write('rp-trips', '{"v":"B1"}'); await slow;
    assert.equal(w.idb.raw('rp-trips'), '{"v":"B1"}', 'Kopie folgt dem zuletzt bestätigten localStorage-Stand');
    assert.equal(w.idb.rec('rp-trips').by, 'B');
  }

  /* 9. Kontobereich entfernen: Löschmarke, Abbruch wird nachgeholt, Gast bleibt, keine Wiederherstellung */
  {
    const w = world(); seed(w); const R = store(w); await R.init();
    assert.equal(await R.remove(['rp-u:uA', 'rp-u:uA:history', 'fremd']), true);
    assert.deepEqual(w.idb.keys(), ['rp-history', 'rp-trips'], 'nur der Kontobereich entfernt'); assert.equal(w.ls.getItem(L.DROP_KEY), null, 'Löschmarke erledigt');
    seed(w); const R2 = store(w); await R2.init(); /* Marker vorhanden: Konto uA kommt erst über den Abgleich zurück */
    assert.equal((await R2.reconcile('rp-u:uA')).state, 'migrate');
    w.idb.fail = ({ op }) => op === 'delete' ? new Error('defekt') : null;
    w.ls.removeItem('rp-u:uA'); assert.equal(await R2.remove(['rp-u:uA']), false, 'Fehlschlag wird gemeldet');
    assert.deepEqual(JSON.parse(w.ls.getItem(L.DROP_KEY)), ['rp-u:uA'], 'Löschmarke bleibt'); assert(w.idb.raw('rp-u:uA'), 'Kopie noch da');
    w.idb.fail = null; const R3 = store(w); await R3.init();
    assert.equal(w.idb.raw('rp-u:uA'), undefined, 'nächster Start holt das Löschen nach'); assert.equal(w.ls.getItem(L.DROP_KEY), null);
    assert.equal((await R3.reconcile('rp-u:uA', { absentAtStart: true })).state, 'empty', 'gelöschtes Konto wird nicht wiederhergestellt');
    assert.equal(w.idb.raw('rp-trips'), w.ls.getItem('rp-trips'), 'Gastdaten unberührt');
  }

  /* ---------- App-Anbindung (echter Store aus index.html) ---------- */
  const trip = (a, title) => a.newTrip({ title, dateMode: 'fix', start: '2027-05-01', end: '2027-05-04' });
  /* 10. Start mit vorhandenen Gastreisen: Migration, Ladezustand, Durchschreiben, Sicherungspunkte */
  const w = world();
  {
    const boot = app(w); const t = trip(boot.a, 'Bestand'); boot.Store.put(t, true); await boot.R.flush();
  }
  const w1 = { idb: fakeIDB(), ls: w.ls, BC: w.BC }; /* vorhandene Daten, IndexedDB noch leer = erster Start mit Adapter */
  const rawBefore = w1.ls.getItem('rp-trips');
  let A = app(w1); assert.equal(A.Store.backend, 'laden', 'Ladezustand bis zum ersten Abgleich');
  assert.equal(A.Store.list().length, 1, 'Reisen sofort aus localStorage sichtbar');
  await A.ready; assert.equal(A.Store.backend, 'idb');
  assert.equal(w1.idb.raw('rp-trips'), rawBefore); assert.equal(w1.ls.getItem('rp-trips'), rawBefore, 'rp-trips bleibt erhalten'); assert(w1.idb.marker());
  const t2 = trip(A.a, 'Neu'); assert.equal(A.Store.put(t2, true), true);
  assert(w1.ls.getItem('rp-trips').includes('Neu'), 'localStorage synchron geschrieben'); await A.R.flush();
  assert.equal(w1.idb.raw('rp-trips'), w1.ls.getItem('rp-trips'), 'IndexedDB durchgeschrieben');
  assert.equal(w1.idb.raw('rp-history'), w1.ls.getItem('rp-history'), 'Sicherungspunkte ziehen mit'); assert(JSON.parse(w1.ls.getItem('rp-history')).length >= 1);

  /* 11. Kontingent in localStorage: kein Erfolg, Kopie unverändert; Neuladen zeigt den alten Stand */
  {
    const lsBefore = w1.ls.getItem('rp-trips'), idbBefore = w1.idb.raw('rp-trips');
    w1.ls.quota.add('rp-trips'); const t = A.Store.get(t2.id); t.title = 'Nicht gespeichert';
    assert.equal(A.Store.put(t, true), false, 'Speicherfehler gemeldet'); assert(A.Store.localError); await A.R.flush();
    assert.equal(w1.ls.getItem('rp-trips'), lsBefore); assert.equal(w1.idb.raw('rp-trips'), idbBefore, 'kein falscher Erfolg in IndexedDB');
    w1.ls.quota.delete('rp-trips');
    A = app(w1); await A.ready; assert.equal(A.Store.get(t2.id).title, 'Neu', 'nach Neuladen kein falscher Erfolg'); assert.equal(A.Store.backend, 'idb');
  }

  /* 12. Neuladen zeigt dieselben Reisen; nur localStorage geräumt → Wiederherstellung aus der Kopie */
  {
    const titles = A.Store.list().map(t => t.title).sort();
    w1.ls.removeItem('rp-trips');
    A = app(w1); assert.equal(A.Store.list().length, 0);
    assert(A.a.vReisen().includes('data-storage-loading'), 'Ladezustand statt „Noch keine Reise“');
    await A.ready; assert.deepEqual(A.Store.list().map(t => t.title).sort(), titles, 'aus IndexedDB wiederhergestellt');
    assert.equal(w1.ls.getItem('rp-trips'), w1.idb.raw('rp-trips'), 'localStorage zurückgeschrieben'); assert(/wiederhergestellt/.test(A.msg.textContent));
    assert(!A.a.vReisen().includes('data-storage-loading'));
  }

  /* 13. Zurückrollen: alte App-Version schreibt nur localStorage → beim nächsten Start gilt localStorage, alter Kopie-Stand bleibt Sicherungspunkt */
  {
    const prevCopy = w1.idb.raw('rp-trips'), s = JSON.parse(w1.ls.getItem('rp-trips'));
    s.told = Object.assign(trip(A.a, 'Von alter Version'), { id: 'told' }); const oldRaw = JSON.stringify(s);
    w1.ls.setItem('rp-history', '[]'); w1.ls.setItem('rp-trips', oldRaw); /* alte Version ohne RPStore, Sicherungspunkte geleert */
    A = app(w1); await A.ready;
    assert(A.Store.get('told'), 'Änderung der alten Version sichtbar'); assert.equal(w1.idb.raw('rp-trips'), oldRaw, 'Kopie nachgezogen');
    assert(JSON.parse(w1.ls.getItem('rp-history')).some(h => h.raw === prevCopy), 'abweichender Kopie-Stand als Sicherungspunkt erhalten');
  }

  /* 14. Beschädigtes localStorage: Kopie bleibt Rückhalt; Zurücksetzen holt den lesbaren Stand zurück */
  {
    const good = w1.idb.raw('rp-trips'); w1.ls.setItem('rp-trips', '{kaputt');
    A = app(w1); await A.ready;
    assert.equal(A.Store.corruptRaw, '{kaputt'); assert(A.Store.idbBackup, 'lesbare Kopie erkannt');
    assert.equal(w1.idb.raw('rp-trips'), good, 'Kopie nicht überschrieben'); assert.equal(w1.ls.getItem('rp-trips'), '{kaputt', 'Rohdaten nicht überschrieben');
    A.a.UI.view = 'reisen'; A.a.render(); assert(A.view.innerHTML.includes('Zweitkopie in IndexedDB'), 'Hinweis im Rettungsblock');
    assert.equal(A.Store.put(trip(A.a, 'gesperrt')), false, 'Schreiben bleibt gesperrt');
    assert.equal(A.Store.resetCorrupt(), true); await until(() => w1.ls.getItem('rp-trips') === good, 'Wiederherstellung nach Zurücksetzen');
    assert(A.Store.get('told')); assert.equal(A.Store.corruptRaw, null);
    /* beschädigter Text auch in der Kopie → wird beim Zurücksetzen mit entfernt, nichts wiederhergestellt */
    const wc = world(); wc.ls.setItem('rp-trips', '{kaputt'); const C = app(wc); await C.ready;
    assert.deepEqual(C.R.status().skipped, ['rp-trips'], 'Beschädigtes nicht kopiert');
    await new Promise(res => { const r = wc.idb.open(L.DB_NAME, L.DB_VERSION); r.onsuccess = () => { r.result.transaction(['kv'], 'readwrite').objectStore('kv').put({ key: 'rp-trips', raw: '{kaputt', rev: 1 }); setTimeout(res, 20); }; });
    C.Store.resetCorrupt(); await until(() => wc.idb.raw('rp-trips') === undefined, 'beschädigte Kopie entfernt');
    assert.equal(wc.ls.getItem('rp-trips'), null); assert.equal(C.Store.list().length, 0);
  }

  /* 15. Zwei Tabs der App: Fremdänderung erkannt, keine stille Überschreibung */
  {
    const T1 = app(w1), T2 = app(w1); await T1.ready; await T2.ready;
    const x = T1.Store.get('told'); x.title = 'Tab 1'; assert(T1.Store.put(x, true)); await T1.R.flush();
    await until(() => T2.Store.conflict, 'Tab 2 erkennt die Fremdänderung (BroadcastChannel)');
    const y = T2.Store.get('told'); y.title = 'Tab 2 veraltet'; assert.equal(T2.Store.put(y, true), false, 'veralteter Tab speichert nicht');
    await T2.R.flush(); assert(w1.ls.getItem('rp-trips').includes('Tab 1') && !w1.ls.getItem('rp-trips').includes('Tab 2 veraltet'));
    assert.equal(w1.idb.raw('rp-trips'), w1.ls.getItem('rp-trips'));
  }

  /* 16. IndexedDB-Kontingent beim Durchschreiben: Hinweis sichtbar, Reisen weiter in localStorage */
  {
    A = app(w1); await A.ready; const before = w1.idb.raw('rp-trips');
    w1.idb.failCommit = () => Object.assign(new Error('voll'), { name: 'QuotaExceededError' });
    const x = A.Store.get('told'); x.title = 'Nur lokal'; assert.equal(A.Store.put(x, true), true, 'localStorage-Commit gelingt');
    await A.R.flush(); await until(() => A.Store.backend === 'local', 'Rückfall');
    assert(/QuotaExceededError/.test(A.Store.backendNote)); assert(/nicht verfügbar/.test(A.msg.textContent), 'Hinweis gemeldet');
    assert(A.a.vReisen().includes('data-storage-backend'), 'Hinweis in der Reiseübersicht'); assert.equal(w1.idb.raw('rp-trips'), before);
    x.title = 'Weiter lokal'; assert.equal(A.Store.put(x, true), true); assert(w1.ls.getItem('rp-trips').includes('Weiter lokal'));
    w1.idb.failCommit = null;
    A = app(w1); await A.ready; assert.equal(A.Store.backend, 'idb'); assert.equal(w1.idb.raw('rp-trips'), w1.ls.getItem('rp-trips'), 'nächster Start zieht die Kopie nach');
  }

  /* 17. Ohne IndexedDB: Rückfall mit Hinweis, Speichern wie bisher */
  {
    const wn = world(); const N = app(wn, { env: { indexedDB: () => null } }); await N.ready;
    assert.equal(N.Store.backend, 'local'); assert(N.a.vReisen().includes('data-storage-backend'));
    assert.equal(N.Store.put(trip(N.a, 'Ohne IDB'), true), true); assert(wn.ls.getItem('rp-trips').includes('Ohne IDB'));
  }

  /* 18. Konto: Abmelden ohne Ausstehendes und Kontolöschung entfernen auch die IndexedDB-Kopie; Gastdaten bleiben */
  {
    const wa = { idb: w1.idb, ls: w1.ls, BC: w1.BC };
    const cloud = { enabled: () => true, onAuth() {}, async init() { return { id: 'uK', email: 'k@x' }; }, async signOut() {} };
    let K = app(wa, { cloud }); await K.ready; await until(() => K.Store.scope === 'uK', 'Anmeldung');
    K.Store.put(trip(K.a, 'Kontoreise'), true); await K.R.flush();
    assert(wa.idb.raw('rp-u:uK').includes('Kontoreise'), 'Kontobereich durchgeschrieben');
    /* mit ausstehender Änderung bleibt der Cache (wie bisher) */
    await K.a.Auth.signOut(true); assert(wa.ls.getItem('rp-u:uK') && wa.idb.raw('rp-u:uK'), 'Ausstehendes bleibt lokal und in der Kopie');
    K = app(wa, { cloud }); await K.ready; await until(() => K.Store.scope === 'uK', 'Anmeldung');
    K.Store.queue = {}; K.Store.saveLocal(); await K.R.flush(); /* alles bestätigt */
    const guestRaw = wa.ls.getItem('rp-trips'), guestCopy = wa.idb.raw('rp-trips');
    await K.a.Auth.signOut(false); await K.R.flush();
    assert.equal(wa.ls.getItem('rp-u:uK'), null); assert.equal(wa.idb.raw('rp-u:uK'), undefined, 'IndexedDB-Kopie des Kontos entfernt');
    assert.equal(wa.idb.raw('rp-u:uK:history'), undefined); assert.equal(wa.ls.getItem(L.DROP_KEY), null);
    assert.equal(wa.ls.getItem('rp-trips'), guestRaw); assert.equal(wa.idb.raw('rp-trips'), guestCopy, 'Gastdaten bleiben');
    assert.equal(K.Store.scope, 'guest');
    /* erneute Anmeldung: nichts wird aus einer alten Kopie zurückgeholt */
    K = app(wa, { cloud }); await K.ready; await until(() => K.Store.scope === 'uK', 'Anmeldung'); await tick(20);
    assert.equal(K.Store.list().length, 0); assert.equal(wa.ls.getItem('rp-u:uK'), null);
    /* forgetScope (genutzt von Abmelden und Kontolöschung) lehnt den Gastbereich ab */
    assert.equal(await K.Store.forgetScope('guest'), false); assert(wa.ls.getItem('rp-trips'));
    const del = html.match(/async function deleteAccountDo[\s\S]*?\n}\n/)[0], so = html.match(/async signOut\(force\)\{[\s\S]*?\n  \}/)[0];
    assert(/Store\.forgetScope\(scope\)/.test(del) && /Store\.forgetScope\(scope\)/.test(so), 'Abmelden und Kontolöschung nutzen forgetScope');
    assert(!/removeItem\('rp-u:'/.test(del + so), 'kein Kontolöschweg nur an localStorage vorbei');
  }
  finished = true;
  console.log('RPStore: Abgleichsregel, gleiche Semantik localStorage/IndexedDB, Migration mit Rücklesevergleich und Marker (rp-trips bleibt), Abbruch/Zeitüberschreitung/kein IndexedDB/Kontingent ohne falschen Erfolg, zwei Tabs, Wiederherstellung, Zurückrollen, beschädigter Speicher, Abmelden/Kontolöschung mit Löschmarke geprüft (Node, In-Memory-IndexedDB).');
})().catch(e => { console.error(e); process.exit(1); });
