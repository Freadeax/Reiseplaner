/* RPFiles · lokale Ablage für Unterlagen und Buchungscodes (M11.1, docs/UNTERLAGEN.md, Vertrag SCHEMA_V5 Feld docs).
   Tickets, Bordkarten, Hotelbestätigungen, Mietwagen-Voucher, Eintrittskarten, Gutscheine, Versicherungsnachweise.

   Bausteine:
     * Ablage: eigene IndexedDB-Datenbank "rp-files" (getrennt von Fotos "rp-media" und Reisen). Objektspeicher "meta" mit
       Einträgen {id, scope, trip, kind, title, link, valid, secret, note, file, at, upd} und "data" mit {id, bytes:ArrayBuffer}.
       Bytes statt Blob wie photostore.js (ältere WebKit-Versionen). scope trennt Konten wie Store.scope ('guest' oder Benutzer-ID).
     * Ein Eintrag mit Datei wird in EINER Transaktion geschrieben, danach zurückgelesen und per SHA-256 verglichen.
       Kontingent- oder Lesefehler liefern immer eine Ablehnung mit Grund und lassen nichts Halbes liegen.
     * get() rechnet die Prüfsumme vor dem Anzeigen nach: beschädigt → {damaged:true}, Eintrag bleibt.
     * Codes (secret.value) stehen nur hier. toTripDoc() macht daraus einen t.docs-Eintrag für Format 5 ohne Code.
     * Meldungen nennen nie Titel, Code oder Dateiinhalt (M11 U-R8).
   UMD wie photostore.js: window.RPFiles im Browser, module.exports in Node. Braucht photostore.js (SHA-256). */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports;
  var deps = function () {
    var P = null;
    if (node) { try { P = require('./photostore.js'); } catch (e) { P = null; } }
    return { P: P || (root && root.RPPhotos) || null };
  };
  var api = factory(deps, root);
  if (node) module.exports = api;
  else if (root) root.RPFiles = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : this, function (deps, root) {
  'use strict';

  var DB_NAME = 'rp-files', DB_VERSION = 1, META = 'meta', DATA = 'data', TIMEOUT = 4000;
  var LIMITS = Object.freeze({ perTrip: 200, fileBytes: 15 * 1024 * 1024, tripBytes: 200 * 1024 * 1024, title: 80, note: 300, secretLabel: 40, secretValue: 120, fileName: 120 });
  /* Arten wie RPV5.DOC_KINDS; Reihenfolge = Auswahlliste */
  var KINDS = Object.freeze({ ticket: 'Ticket', bordkarte: 'Bordkarte', bestaetigung: 'Buchungsbestätigung', gutschein: 'Gutschein / Voucher', versicherung: 'Versicherung', sonstiges: 'Sonstiges' });
  var MIMES = ['application/pdf', 'image/jpeg', 'image/png'];
  var ID = /^[a-z][a-z0-9]{3,40}$/, SCOPE = /^[A-Za-z0-9_-]{1,64}$/, TRIP = /^[a-z0-9]{1,40}$/;
  var LINK = /^(tr|offer|act|ledger):[A-Za-z0-9_:.-]{1,100}$/, SHA = /^[0-9a-f]{64}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;

  function fail(msg, name) { var e = new Error(msg); if (name) e.name = name; throw e; }
  var own = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  var plain = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
  function validDate(s) { if (typeof s !== 'string' || !DATE.test(s)) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
  function P() { var p = deps().P; if (!p) fail('docstore.js braucht photostore.js (Prüfsumme).'); return p; }

  /* ---------- Bytes, Dateiart, Prüfsumme ---------- */
  function toU8(x) {
    if (x instanceof Uint8Array) return x;
    if (x instanceof ArrayBuffer) return new Uint8Array(x);
    if (x && ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
    fail('Unterlagen: Dateiinhalt fehlt.');
  }
  function bufOf(u8) { return u8.slice().buffer; }
  /* An den ersten Bytes erkennen (nicht an Name oder Angabe des Browsers). PDF darf bis 1 KB Vorspann haben. */
  function sniff(data) {
    var u = toU8(data);
    if (u.length >= 3 && u[0] === 0xFF && u[1] === 0xD8 && u[2] === 0xFF) return 'image/jpeg';
    if (u.length >= 8 && u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4E && u[3] === 0x47) return 'image/png';
    var n = Math.min(u.length - 4, 1024);
    for (var i = 0; i < n; i++) if (u[i] === 0x25 && u[i + 1] === 0x50 && u[i + 2] === 0x44 && u[i + 3] === 0x46 && u[i + 4] === 0x2D) return 'application/pdf';
    return null;
  }
  function sha256(data, env) { return P().sha256(data, env); }
  function ext(mime) { return { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[mime] || 'bin'; }
  function fmtBytes(n) {
    n = +n || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (Math.round(n / 102.4) / 10).toLocaleString('de-DE') + ' KB';
    return (Math.round(n / 104857.6) / 10).toLocaleString('de-DE') + ' MB';
  }
  function newId() {
    var c = (root && root.crypto) || (typeof crypto !== 'undefined' ? crypto : null), s = '';
    if (c && c.getRandomValues) { var b = new Uint8Array(10); c.getRandomValues(b); for (var i = 0; i < b.length; i++) s += (b[i] % 36).toString(36); }
    else s = Math.random().toString(36).slice(2, 12);
    return 'd' + s;
  }
  /* Code verdeckt anzeigen: nur die letzten zwei Zeichen, bei kurzen Codes nichts */
  function mask(v) { v = String(v == null ? '' : v); if (!v) return ''; return '••••' + (v.length >= 6 ? ' ' + v.slice(-2) : ''); }

  /* ---------- Eintrag prüfen (Eingabe aus dem Formular) ---------- */
  function str(v, max, what, req) {
    if (v == null || v === '') { if (req) fail(what + ' fehlt.'); return null; }
    if (typeof v !== 'string') fail(what + ' ungültig.');
    var s = v.trim();
    if (!s) { if (req) fail(what + ' fehlt.'); return null; }
    if (s.length > max) fail(what + ': höchstens ' + max + ' Zeichen.');
    return s;
  }
  /* input: {kind, title, link?, valid?:{from,to}, secret?:{label,value}, note?}. Liefert nur bekannte, gültige Felder. */
  function normalize(input) {
    if (!plain(input)) fail('Unterlage ungültig.');
    var o = {};
    if (!own(KINDS, input.kind)) fail('Bitte eine Art wählen.');
    o.kind = input.kind;
    o.title = str(input.title, LIMITS.title, 'Titel', true);
    var lk = input.link == null || input.link === '' ? null : input.link;
    if (lk != null && !(typeof lk === 'string' && LINK.test(lk))) fail('Verknüpfung ungültig.');
    o.link = lk;
    var v = input.valid, from = v && v.from ? v.from : null, to = v && v.to ? v.to : null;
    if (from != null && !validDate(from)) fail('Gültig ab: Datum ungültig.');
    if (to != null && !validDate(to)) fail('Gültig bis: Datum ungültig.');
    if (from && to && to < from) fail('„Gültig bis“ liegt vor „gültig ab“.');
    o.valid = from || to ? { from: from, to: to } : null;
    var s = input.secret, sv = s ? str(s.value, LIMITS.secretValue, 'Code') : null;
    o.secret = sv ? { label: str(s.label, LIMITS.secretLabel, 'Bezeichnung des Codes') || 'Buchungsnummer', value: sv } : null;
    o.note = str(input.note, LIMITS.note, 'Notiz');
    return o;
  }
  /* Datei prüfen: Art an den Bytes, Größe. name ist nur Anzeige (gekürzt, ohne Pfad). */
  function checkFile(bytes, name) {
    var u = toU8(bytes);
    if (!u.length) fail('Die Datei ist leer.');
    if (u.length > LIMITS.fileBytes) fail('Die Datei ist ' + fmtBytes(u.length) + ' groß. Erlaubt sind höchstens ' + fmtBytes(LIMITS.fileBytes) + '.', 'QuotaExceededError');
    var mime = sniff(u);
    if (!mime) fail('Dateiart nicht erkannt. Möglich sind PDF, JPEG und PNG.');
    var nm = typeof name === 'string' ? name.replace(/^.*[\\/]/, '').trim().slice(0, LIMITS.fileName) : '';
    return { u: u, mime: mime, name: nm || null };
  }

  /* ---------- Format 5 (Stufe 2): t.docs-Eintrag ohne Code ---------- */
  /* owner: Personen-ID aus t.party, falls „nur ich“; sonst 'mitglieder'. Ergebnis besteht RPV5.validateV5. */
  function toTripDoc(m, owner) {
    var d = { id: m.id, kind: m.kind, title: m.title, link: { key: m.link || null }, valid: m.valid ? { from: m.valid.from || null, to: m.valid.to || null } : null,
      file: m.file ? { sha256: m.file.sha256, bytes: m.file.bytes, mime: m.file.mime } : null,
      secret: m.secret ? { label: m.secret.label, value: null, local: true } : null,
      share: owner ? 'ich' : 'mitglieder', cloud: { state: 'none' } };
    if (owner) d.owner = owner;
    return d;
  }

  /* ---------- Ablage ---------- */
  function reason(e) {
    var n = e && e.name;
    if (n === 'QuotaExceededError') return 'Kein Speicherplatz mehr in diesem Browser. Nichts wurde gespeichert.';
    if (n === 'InvalidStateError' || n === 'SecurityError') return 'Unterlagen sind in diesem Browsermodus nicht nutzbar (z. B. privates Fenster).';
    if (n === 'TimeoutError') return 'Der Speicher antwortet nicht. Ist die App in einem zweiten Tab offen?';
    if (n === 'NotSupportedError') return 'Unterlagen: IndexedDB fehlt in diesem Browser.';
    return String(e && e.message || e || 'Unbekannter Fehler').slice(0, 200);
  }
  function wrap(e) { var x = new Error(reason(e)); x.name = e && e.name || 'Error'; x.cause = e; return x; }
  function checkScope(s) { if (typeof s !== 'string' || !SCOPE.test(s)) fail('Unterlagen: Konto-Bereich ungültig.'); }
  function checkTrip(s) { if (typeof s !== 'string' || !TRIP.test(s)) fail('Unterlagen: Reise ungültig.'); }
  function checkId(id) { if (typeof id !== 'string' || !ID.test(id)) fail('Unterlagen: ungültige ID.'); }

  function create(env) {
    env = env || {};
    var db = null, opening = null;
    var ms = env.timeoutMs || TIMEOUT, now = env.now || function () { return new Date().toISOString(); };
    function open() {
      if (db) return Promise.resolve(db);
      if (opening) return opening;
      opening = new Promise(function (resolve, reject) {
        var factory, done = false, r, timer;
        var finish = function (err, d) {
          if (done) { if (d) try { d.close(); } catch (e) { /* nichts */ } return; }
          done = true; clearTimeout(timer); opening = null;
          if (err) reject(wrap(err)); else { db = d; db.onversionchange = function () { try { db.close(); } catch (e) { /* nichts */ } db = null; }; resolve(db); }
        };
        try { factory = env.indexedDB ? env.indexedDB() : root && root.indexedDB; } catch (e) { finish(e); return; }
        if (!factory) { finish(Object.assign(new Error('IndexedDB fehlt'), { name: 'NotSupportedError' })); return; }
        timer = setTimeout(function () { finish(Object.assign(new Error('timeout'), { name: 'TimeoutError' })); }, ms);
        try { r = factory.open(DB_NAME, DB_VERSION); } catch (e) { finish(e); return; }
        r.onupgradeneeded = function () {
          var d = r.result;
          if (!d.objectStoreNames.contains(META)) d.createObjectStore(META, { keyPath: 'id' });
          if (!d.objectStoreNames.contains(DATA)) d.createObjectStore(DATA, { keyPath: 'id' });
        };
        r.onsuccess = function () { finish(null, r.result); };
        r.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); finish(r.error || new Error('Unterlagen-Speicher konnte nicht geöffnet werden')); };
        r.onblocked = function () { /* Zeitüberschreitung greift */ };
      });
      return opening;
    }
    function tx(stores, mode, work) {
      return open().then(function (d) {
        return new Promise(function (resolve, reject) {
          var t, out, err = null;
          try { t = d.transaction(stores, mode); } catch (e) { reject(wrap(e)); return; }
          t.oncomplete = function () { resolve(out); };
          t.onerror = function (ev) { if (ev && ev.preventDefault) ev.preventDefault(); };
          t.onabort = function () { reject(wrap(err || t.error || new Error('Speichern abgebrochen'))); };
          var abort = function (e) { err = e; try { t.abort(); } catch (x) { reject(wrap(e)); } };
          try { work(t, function (v) { out = v; }, abort); } catch (e) { abort(e); }
        });
      });
    }
    var on = function (req, cb, abort) { req.onsuccess = function () { try { cb(req.result); } catch (e) { abort(e); } }; };
    function allMeta() { return tx([META], 'readonly', function (t, done, abort) { on(t.objectStore(META).getAll(), function (v) { done(v || []); }, abort); }); }
    function sorted(list) {
      return list.slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)) || a.id.localeCompare(b.id); });
    }
    /* Einträge einer Reise (ohne Dateiinhalt) */
    async function list(scope, trip) {
      checkScope(scope); checkTrip(trip);
      return sorted((await allMeta()).filter(function (m) { return m.scope === scope && m.trip === trip; }));
    }
    async function meta(id) { checkId(id); return tx([META], 'readonly', function (t, done, abort) { on(t.objectStore(META).get(id), function (m) { done(m || null); }, abort); }); }
    function readData(id) { return tx([DATA], 'readonly', function (t, done, abort) { on(t.objectStore(DATA).get(id), function (d) { done(d || null); }, abort); }); }

    /* Neue Unterlage: input wie normalize(), file optional {bytes, name}. Prüft Grenzen der Reise und Dubletten. */
    async function add(scope, trip, input, file) {
      checkScope(scope); checkTrip(trip);
      var m = normalize(input), f = file ? checkFile(file.bytes, file.name) : null;
      var have = await list(scope, trip);
      if (have.length >= LIMITS.perTrip) fail('Diese Reise hat schon ' + LIMITS.perTrip + ' Unterlagen. Bitte erst alte entfernen.');
      m.id = env.newId ? env.newId() : newId();
      m.scope = scope; m.trip = trip; m.at = m.upd = now(); m.file = null;
      var data = null;
      if (f) {
        var sum = await sha256(f.u, env), used = have.reduce(function (a, x) { return a + (x.file ? x.file.bytes : 0); }, 0);
        var dup = have.find(function (x) { return x.file && x.file.sha256 === sum; });
        if (dup) fail('Diese Datei liegt schon in dieser Reise (Unterlage „' + dup.title + '“).', 'ConstraintError');
        if (used + f.u.length > LIMITS.tripBytes) fail('Für diese Reise sind höchstens ' + fmtBytes(LIMITS.tripBytes) + ' Unterlagen möglich. Belegt: ' + fmtBytes(used) + '.', 'QuotaExceededError');
        m.file = { sha256: sum, bytes: f.u.length, mime: f.mime, name: f.name };
        data = { id: m.id, bytes: bufOf(f.u) };
      }
      await tx([META, DATA], 'readwrite', function (t, done) {
        t.objectStore(META).put(m);
        if (data) t.objectStore(DATA).put(data);
        done(true);
      });
      /* Rücklesevergleich */
      var back = await meta(m.id), ok = !!back && back.title === m.title;
      if (ok && data) { var r = await readData(m.id); ok = !!(r && r.bytes) && toU8(r.bytes).length === m.file.bytes && await sha256(r.bytes, env) === m.file.sha256; }
      if (!ok) {
        try { await remove(m.id); } catch (e) { /* Meldung unten */ }
        fail('Rücklesevergleich fehlgeschlagen, Unterlage nicht gespeichert.', 'DataError');
      }
      return m;
    }
    /* Angaben ändern (nicht die Datei). Gibt den neuen Eintrag zurück. */
    async function update(id, input) {
      var cur = await meta(id); if (!cur) fail('Unterlage nicht gefunden.', 'NotFoundError');
      var m = Object.assign({}, cur, normalize(input), { upd: now() });
      await tx([META], 'readwrite', function (t, done) { t.objectStore(META).put(m); done(true); });
      return m;
    }
    /* Eintrag mit Dateiinhalt; Prüfsumme wird nachgerechnet. state: 'ok' | 'nofile' | 'missing' | 'damaged' */
    async function get(id) {
      var m = await meta(id); if (!m) return null;
      if (!m.file) return { meta: m, state: 'nofile', bytes: null };
      var r = await readData(id);
      if (!r || !r.bytes) return { meta: m, state: 'missing', bytes: null };
      var u = toU8(r.bytes);
      if (u.length !== m.file.bytes || await sha256(u, env) !== m.file.sha256) return { meta: m, state: 'damaged', bytes: null };
      return { meta: m, state: 'ok', bytes: bufOf(u) };
    }
    async function remove(id) {
      checkId(id);
      return tx([META, DATA], 'readwrite', function (t, done) { t.objectStore(META).delete(id); t.objectStore(DATA).delete(id); done(true); });
    }
    /* Alle Unterlagen einer Reise löschen (Reise gelöscht, ausdrücklich bestätigt). Liefert Anzahl. */
    async function removeTrip(scope, trip) {
      var l = await list(scope, trip);
      await tx([META, DATA], 'readwrite', function (t, done) { l.forEach(function (m) { t.objectStore(META).delete(m.id); t.objectStore(DATA).delete(m.id); }); done(l.length); });
      return l.length;
    }
    /* Belegung aus gespeicherten Größen; trip optional */
    async function usage(scope, trip) {
      checkScope(scope); if (trip != null) checkTrip(trip);
      var out = { count: 0, files: 0, bytes: 0 };
      (await allMeta()).forEach(function (m) {
        if (m.scope !== scope || (trip != null && m.trip !== trip)) return;
        out.count++; if (m.file) { out.files++; out.bytes += m.file.bytes; }
      });
      return out;
    }
    /* Reisen mit Unterlagen in diesem Konto-Bereich: {tripId: Anzahl} (für Aufräumen verwaister Reisen) */
    async function trips(scope) {
      checkScope(scope); var o = {};
      (await allMeta()).forEach(function (m) { if (m.scope === scope) o[m.trip] = (o[m.trip] || 0) + 1; });
      return o;
    }
    return { open: function () { return open().then(function () { return true; }); }, list: list, meta: meta, add: add, update: update, get: get, remove: remove, removeTrip: removeTrip, usage: usage, trips: trips };
  }

  return {
    DB_NAME: DB_NAME, DB_VERSION: DB_VERSION, LIMITS: LIMITS, KINDS: KINDS, MIMES: MIMES,
    sniff: sniff, sha256: sha256, ext: ext, fmtBytes: fmtBytes, mask: mask, newId: newId,
    normalize: normalize, checkFile: checkFile, toTripDoc: toTripDoc, create: create
  };
});
