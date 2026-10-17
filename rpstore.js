/* RPStore · Speicheradapter für die Reisedaten (P0.4, docs/PLAN_IOS_APP.md §5.1).

   Zwei Speicher mit derselben Schnittstelle (get, update atomar, remove, keys):
     * localStorage: wie bisher rp-trips, rp-history, rp-u:<Konto>[:history].
     * IndexedDB: Datenbank "reiseplaner", Objektspeicher "kv" mit einem Datensatz je Schlüssel
       {key, raw, rev, at, by} (raw ist exakt derselbe Text wie in localStorage) und "meta" mit dem Migrationsmarker.

   Gewählte Strategie: localStorage bleibt Commit-Punkt, IndexedDB ist die durchgeschriebene Zweitkopie.
   1. Die App schreibt jeden Stand wie bisher synchron und vollständig nach localStorage. Scheitert das
      (z. B. QuotaExceededError), gilt der Stand als NICHT gespeichert und IndexedDB wird nicht angefasst.
      Erst nach erfolgreichem localStorage-Schreiben schreibt write() denselben Text nach IndexedDB durch.
   2. rp-trips wird weder gelöscht noch eingefroren, sondern bei jedem Speichern mitgeschrieben. Begründung:
      Eine ältere App-Version kennt nur localStorage. Ein eingefrorener Spiegel würde ihr nach einem Zurückrollen
      alle seitherigen Änderungen verbergen, und ihre eigenen Änderungen gingen beim Rückweg verloren. So sieht jede
      Version den aktuellen Stand; Änderungen einer alten Version übernimmt diese beim nächsten Laden (Regel 3).
      Mehr Platz als localStorage bietet dieser Schritt deshalb bewusst nicht; Fotos kommen getrennt (§5.2).
   3. Abgleich beim Laden eines Bereichs, siehe decide():
      * localStorage gleich der Kopie: nichts zu tun.
      * localStorage vorhanden und anders (Abbruch zwischen beiden Schreibvorgängen, alte App-Version, Tab ohne
        RPStore): localStorage gilt, die Kopie wird nachgezogen. Die App legt den abweichenden Kopie-Stand als
        Sicherungspunkt ab, falls er dort noch fehlt.
      * localStorage war beim Laden leer, die Kopie stammt aus einer früheren Sitzung (Browser hat nur localStorage
        geräumt): Kopie wiederherstellen und nach localStorage zurückschreiben.
      * localStorage ungültig/beschädigt: Kopie bleibt unverändert als Rückhalt, nichts wird überschrieben.
   4. Zwei Tabs: Der bestehende Fremdänderungsschutz der App (Vergleich mit dem zuletzt gelesenen localStorage-Text
      und storage-Ereignis) greift unverändert, weil weiterhin jeder Stand durch localStorage läuft. Zusätzlich prüft
      jeder IndexedDB-Schreibvorgang in derselben Transaktion, dass localStorage noch genau diesen Text enthält
      (sonst ist er veraltet und wird verworfen), zählt die Versionsnummer rev hoch und meldet die Änderung über
      BroadcastChannel ("reiseplaner-store") an andere Tabs.
   5. Fehler (kein IndexedDB, privater Modus, Zeitüberschreitung/blockiert, Kontingent, Rücklesevergleich)
      schalten für diese Sitzung auf Modus "local": die App arbeitet wie bisher nur mit localStorage weiter und zeigt
      einen Hinweis. Nie stiller Erfolg: write()/reconcile() liefern ok:false bzw. state:'local' mit Grund.
   Löschen eines Kontobereichs: remove() setzt zuerst synchron eine Löschmarke (rp-store-drop) in localStorage,
   damit auch ein abgebrochenes Löschen beim nächsten Start nachgeholt wird und die Kopie nie wiederhergestellt wird.
   Ohne Browser-Abhängigkeit testbar: create(env) mit eigenem indexedDB/localStorage/BroadcastChannel. */
(function (root, factory) {
  'use strict';
  const lib = factory();
  if (typeof module === 'object' && module.exports) module.exports = lib;
  else if (root) root.RPStore = Object.assign(lib.create(lib.browserEnv(root)), { lib });
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const DB_NAME = 'reiseplaner', DB_VERSION = 1, KV = 'kv', META = 'meta';
  const MIGRATION = 1; /* Version des Migrationsmarkers in "meta" */
  const KEYS = /^(rp-trips|rp-history|rp-u:[^:]+(:history)?)$/;
  const DROP_KEY = 'rp-store-drop', CHANNEL = 'reiseplaner-store', TIMEOUT = 4000;

  function reason(e) {
    const n = e && e.name || '';
    if (n === 'QuotaExceededError') return 'Speicherplatz für IndexedDB erschöpft (QuotaExceededError)';
    if (n === 'InvalidStateError' || n === 'SecurityError') return 'IndexedDB ist in diesem Browsermodus nicht nutzbar (' + n + ')';
    if (n === 'VersionError') return 'IndexedDB gehört zu einer neueren App-Version (VersionError)';
    if (n === 'TimeoutError') return 'IndexedDB antwortet nicht (Zeitüberschreitung)';
    return String(e && e.message || e || 'Unbekannter Fehler').slice(0, 200);
  }

  /* Abgleichsregel für einen Schlüssel (Kopf, Regel 3). lsRaw: localStorage jetzt, rec: IndexedDB-Datensatz.
     o.absentAtStart: localStorage war beim Laden dieses Bereichs leer. o.lsValid: localStorage-Text ist lesbar.
     o.drop: diesen Kopie-Text verwerfen (beschädigter Stand, den die App gerade bewusst entfernt hat).
     o.self: Kennung dieser Sitzung; eine in dieser Sitzung geschriebene Kopie ist nie eine Wiederherstellung. */
  function decide(lsRaw, rec, o) {
    o = o || {};
    if (rec && o.drop != null && rec.raw === o.drop) return 'drop';
    if (!rec) return lsRaw == null ? 'empty' : o.lsValid === false ? 'keep' : 'migrate';
    if (lsRaw != null && rec.raw === lsRaw) return 'same';
    if (o.absentAtStart && !(o.self && rec.by === o.self)) return 'restore';
    if (lsRaw == null) return 'foreign';
    if (o.lsValid === false) return 'backup';
    return 'adopt';
  }

  /* localStorage mit derselben Semantik wie die IndexedDB-Seite (rev gibt es dort nicht). */
  function localBackend(getLs) {
    const rec = (key, raw) => raw == null ? null : { key, raw, rev: null };
    return {
      name: 'localStorage',
      async get(key) { return rec(key, getLs().getItem(key)); },
      async update(key, fn) {
        const s = getLs(), cur = rec(key, s.getItem(key)), next = fn(cur);
        if (next === undefined) return { changed: false, rec: cur };
        if (next === null) { s.removeItem(key); return { changed: true, rec: null }; }
        s.setItem(key, next); return { changed: true, rec: rec(key, next) };
      },
      async remove(key) { getLs().removeItem(key); },
      async keys() { const s = getLs(), out = []; for (let i = 0; i < s.length; i++) out.push(s.key(i)); return out; }
    };
  }

  function idbBackend(db) {
    /* Ergebnis erst nach dem Commit der Transaktion; Abbruch (z. B. Kontingent) lehnt ab. */
    const tx = (stores, mode, work) => new Promise((resolve, reject) => {
      let t, out, fail = null;
      try { t = db.transaction(stores, mode); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out);
      t.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); };
      t.onabort = () => reject(fail || t.error || new Error('IndexedDB-Transaktion abgebrochen'));
      const abort = e => { fail = e; try { t.abort(); } catch (x) { reject(e); } };
      try { work(t, v => { out = v; }, abort); } catch (e) { abort(e); }
    });
    const on = (r, cb, abort) => { r.onsuccess = () => { try { cb(r.result); } catch (e) { abort(e); } }; };
    return {
      name: 'IndexedDB',
      get: key => tx([KV], 'readonly', (t, done, abort) => on(t.objectStore(KV).get(key), v => done(v || null), abort)),
      update: (key, fn, by) => tx([KV], 'readwrite', (t, done, abort) => {
        const s = t.objectStore(KV);
        on(s.get(key), cur => {
          cur = cur || null;
          const next = fn(cur);
          if (next === undefined) { done({ changed: false, rec: cur }); return; }
          if (next === null) { s.delete(key); done({ changed: true, rec: null }); return; }
          const rec = { key, raw: next, rev: (cur && cur.rev || 0) + 1, at: new Date().toISOString(), by: by || null };
          s.put(rec); done({ changed: true, rec });
        }, abort);
      }),
      remove: key => tx([KV], 'readwrite', (t, done) => { t.objectStore(KV).delete(key); done(true); }),
      keys: () => tx([KV], 'readonly', (t, done, abort) => on(t.objectStore(KV).getAllKeys(), v => done(v || []), abort)),
      getMeta: id => tx([META], 'readonly', (t, done, abort) => on(t.objectStore(META).get(id), v => done(v || null), abort)),
      putMeta: rec => tx([META], 'readwrite', (t, done) => { t.objectStore(META).put(rec); done(rec); })
    };
  }

  function openDb(factory, ms, timers) {
    return new Promise((resolve, reject) => {
      let settled = false, r = null;
      const finish = (err, db) => {
        if (settled) { if (db) try { db.close(); } catch (e) {} return; }
        settled = true; timers.clear(timer); if (err) reject(err); else resolve(db);
      };
      const timer = timers.set(() => finish(Object.assign(new Error('IndexedDB antwortet nicht (Zeitüberschreitung)'), { name: 'TimeoutError' })), ms);
      try { r = factory.open(DB_NAME, DB_VERSION); } catch (e) { finish(e); return; }
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV, { keyPath: 'key' });
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
      };
      r.onsuccess = () => finish(null, r.result);
      r.onerror = ev => { if (ev && ev.preventDefault) ev.preventDefault(); finish(r.error || new Error('IndexedDB konnte nicht geöffnet werden')); };
      r.onblocked = () => {}; /* wartet auf andere Tabs; die Zeitüberschreitung greift */
    });
  }

  function browserEnv(root) {
    return {
      indexedDB: () => root.indexedDB || null,
      localStorage: () => root.localStorage,
      BroadcastChannel: typeof root.BroadcastChannel === 'function' ? root.BroadcastChannel : null,
      setTimeout: (f, ms) => root.setTimeout(f, ms), clearTimeout: t => root.clearTimeout(t)
    };
  }

  function create(env) {
    env = env || {};
    const id = env.id || 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    const timers = { set: env.setTimeout || ((f, ms) => setTimeout(f, ms)), clear: env.clearTimeout || (t => clearTimeout(t)) };
    const ls = () => { const s = env.localStorage && env.localStorage(); if (!s) throw new Error('localStorage nicht verfügbar'); return s; };
    const st = { mode: 'init', reason: '', opened: false, unsupported: false, marker: null, migrated: [], skipped: [] };
    const statusFns = [], remoteFns = [], queues = {};
    let db = null, be = null, initP = null, chan = null;
    let valid = (k, raw) => { try { JSON.parse(raw); return true; } catch (e) { return false; } };

    const status = () => ({ mode: st.mode, reason: st.reason, marker: st.marker, migrated: st.migrated.slice(), skipped: st.skipped.slice(), id });
    function setMode(mode, why) {
      if (st.mode === 'local') return; /* Rückfall gilt für die ganze Sitzung und wird nur einmal gemeldet */
      st.mode = mode; st.reason = why || '';
      if (mode === 'local') { be = null; if (db) { try { db.close(); } catch (e) {} db = null; } }
      statusFns.forEach(f => { try { f(status()); } catch (e) {} });
    }
    const post = m => { try { if (chan) chan.postMessage(Object.assign({ from: id }, m)); } catch (e) {} };
    function drops() { try { const l = JSON.parse(ls().getItem(DROP_KEY) || '[]'); return Array.isArray(l) ? l.filter(k => typeof k === 'string' && KEYS.test(k)) : []; } catch (e) { return []; } }
    function setDrops(l) { try { if (l.length) ls().setItem(DROP_KEY, JSON.stringify(l)); else ls().removeItem(DROP_KEY); return true; } catch (e) { return false; } }

    function init(o) {
      if (o && typeof o.valid === 'function') valid = o.valid;
      if (initP) return initP;
      initP = (async () => {
        let factory = null;
        try { factory = env.indexedDB ? env.indexedDB() : null; } catch (e) { setMode('local', reason(e)); return status(); }
        if (!factory) { st.unsupported = true; setMode('local', 'IndexedDB ist in diesem Browser nicht verfügbar'); return status(); }
        try { db = await openDb(factory, env.timeoutMs || TIMEOUT, timers); } catch (e) { setMode('local', reason(e)); return status(); }
        st.opened = true;
        db.onversionchange = () => setMode('local', 'Eine neuere App-Version in einem anderen Tab übernimmt den Speicher. Bitte diese Seite neu laden.');
        db.onclose = () => setMode('local', 'Der Browser hat IndexedDB geschlossen');
        be = idbBackend(db);
        try {
          /* abgebrochene Löschungen nachholen, bevor irgendetwas gelesen oder wiederhergestellt wird */
          const dl = drops(); for (const k of dl) await be.remove(k);
          if (dl.length) setDrops(drops().filter(k => !dl.includes(k)));
          let marker = await be.getMeta('marker');
          if (!marker || !(marker.version >= MIGRATION)) {
            const s = ls(), keys = [];
            for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && KEYS.test(k)) keys.push(k); }
            for (const k of keys.sort()) {
              const raw = s.getItem(k); if (raw == null) continue;
              if (!valid(k, raw)) { st.skipped.push(k); continue; } /* Beschädigtes bleibt nur in localStorage (App-Rettungsweg) */
              await be.update(k, () => raw, id);
              const back = await be.get(k);
              if (!back || back.raw !== raw) throw new Error('Rücklesevergleich nach dem Kopieren fehlgeschlagen (' + k + ')');
              st.migrated.push(k);
            }
            marker = { id: 'marker', version: MIGRATION, migratedAt: new Date().toISOString(), from: 'localStorage', keys: st.migrated.slice(), skipped: st.skipped.slice() };
            await be.putMeta(marker);
          }
          st.marker = marker;
          try {
            if (env.BroadcastChannel) {
              chan = new env.BroadcastChannel(CHANNEL);
              chan.onmessage = ev => { const m = ev && ev.data; if (!m || m.from === id) return; remoteFns.forEach(f => { try { f(m); } catch (e) {} }); };
            }
          } catch (e) { chan = null; }
          setMode('idb');
        } catch (e) { setMode('local', 'Kopie nach IndexedDB nicht abgeschlossen: ' + reason(e)); }
        return status();
      })();
      return initP;
    }

    /* Durchschreiben nach erfolgreichem localStorage-Schreiben. Je Schlüssel der Reihe nach, zusammengefasst auf den
       neuesten Stand; veraltete Texte (localStorage enthält inzwischen anderes) werden verworfen. */
    function write(key, raw) {
      if (typeof raw !== 'string' || !KEYS.test(key)) return Promise.resolve({ ok: false, reason: 'Schlüssel oder Inhalt nicht vorgesehen' });
      const q = queues[key] || (queues[key] = { next: undefined, waiters: [], running: null });
      q.next = raw;
      const p = new Promise(res => q.waiters.push(res));
      if (!q.running) q.running = drain(key, q);
      return p;
    }
    async function drain(key, q) {
      await init();
      while (q.next !== undefined) {
        const raw = q.next, ws = q.waiters; q.next = undefined; q.waiters = [];
        let r;
        if (st.mode !== 'idb' || !be) r = { ok: false, skipped: true, reason: st.reason || 'IndexedDB nicht aktiv' };
        else {
          try {
            let stale = false;
            const u = await be.update(key, cur => {
              let now; try { now = ls().getItem(key); } catch (e) { now = undefined; }
              if (now !== raw) { stale = true; return undefined; }
              return cur && cur.raw === raw ? undefined : raw;
            }, id);
            r = { ok: true, changed: u.changed, stale, rev: u.rec ? u.rec.rev : null };
            if (u.changed) post({ type: 'put', key, rev: u.rec.rev });
          } catch (e) { setMode('local', 'Schreiben nach IndexedDB fehlgeschlagen: ' + reason(e)); r = { ok: false, reason: st.reason, error: e && e.name || 'Error' }; }
        }
        ws.forEach(w => w(r));
      }
      q.running = null;
    }
    const settled = key => queues[key] && queues[key].running ? queues[key].running : Promise.resolve();
    const flush = () => Promise.all(Object.keys(queues).map(settled)).then(() => undefined);

    async function reconcile(key, o) {
      o = o || {};
      await init();
      if (st.mode !== 'idb' || !be) return { state: 'local', reason: st.reason };
      await settled(key);
      try {
        if (drops().includes(key)) { await be.remove(key); setDrops(drops().filter(k => k !== key)); post({ type: 'remove', key }); return { state: 'dropped' }; }
        let lsRaw; try { lsRaw = ls().getItem(key); } catch (e) { return { state: 'local', reason: 'localStorage nicht lesbar' }; }
        const rec = await be.get(key);
        const lsValid = o.lsValid === undefined ? lsRaw == null || valid(key, lsRaw) : o.lsValid;
        const state = decide(lsRaw, rec, { absentAtStart: !!o.absentAtStart, lsValid, drop: o.drop, self: id });
        const out = { state, rec, lsRaw };
        if (state === 'migrate' || state === 'adopt') {
          const w = await write(key, lsRaw);
          if (!w.ok) return { state: 'local', reason: w.reason, rec };
          const back = await be.get(key);
          let now; try { now = ls().getItem(key); } catch (e) { now = undefined; }
          if (now === lsRaw && (!back || back.raw !== lsRaw)) { setMode('local', 'Rücklesevergleich in IndexedDB fehlgeschlagen (' + key + ')'); return { state: 'local', reason: st.reason, rec }; }
        } else if (state === 'drop') { await be.remove(key); post({ type: 'remove', key }); }
        else if (state === 'restore' && o.autoRestore && lsRaw == null) {
          try { ls().setItem(key, rec.raw); out.restored = true; } catch (e) { out.restoreError = reason(e); }
        }
        return out;
      } catch (e) { setMode('local', 'Abgleich mit IndexedDB fehlgeschlagen: ' + reason(e)); return { state: 'local', reason: st.reason }; }
    }

    /* Kopien eines Bereichs entfernen (Abmelden, Kontolöschung). Löschmarke zuerst und synchron. */
    function remove(keys) {
      keys = (keys || []).filter(k => typeof k === 'string' && KEYS.test(k));
      if (!keys.length) return Promise.resolve(true);
      if (!st.unsupported) setDrops([...new Set(drops().concat(keys))]);
      return (async () => {
        await init();
        if (st.unsupported) { setDrops(drops().filter(k => !keys.includes(k))); return true; } /* nie eine Kopie gehabt */
        if (st.mode !== 'idb' || !be) return false; /* Marke bleibt, nächster Start löscht */
        try {
          for (const k of keys) { await settled(k); await be.remove(k); post({ type: 'remove', key: k }); }
          setDrops(drops().filter(k => !keys.includes(k)));
          return true;
        } catch (e) { setMode('local', 'Löschen in IndexedDB fehlgeschlagen: ' + reason(e)); return false; }
      })();
    }

    return {
      id, init, status, reconcile, write, remove, flush, decide,
      read: async key => { await init(); return be ? be.get(key) : null; },
      onStatus(fn) { statusFns.push(fn); },
      onRemote(fn) { remoteFns.push(fn); }
    };
  }

  return { create, decide, browserEnv, localBackend, idbBackend, openDb, DB_NAME, DB_VERSION, MIGRATION, KEYS, DROP_KEY, CHANNEL };
});
