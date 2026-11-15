/* Reiseplaner · Regeln für den Datenvertrag v5 (docs/SCHEMA_V5.md), Claude 15.11.2026.
   Format 5 ist EINE gemeinsame Version nach Format 4 (Entscheidung Philipp 23.10.2026, D00 §5.1) für die Felder aller
   Module: Aufgaben und Fristen (M02), Packliste (M03), Ausland und Notfall (M04), Varianten (M05), Mitreisende ↔ Konto (M06),
   Registerverweise (M07), Angebote mit Preisständen, Zahlungsplan und Teilzahlungen (M08), Gästekarten (M09),
   Kriterien (M10), Unterlagen-Mappe (M11) und Tagesrouten (M12).
   Reine Funktionen ohne Speicher-, DOM-, Netz- oder App-Zugriff. NOCH NICHT in der App verdrahtet und ohne
   Datenbankmigration: Format 5 bleibt gesperrt, bis Vertrag, Lese-Release und Migration freigegeben sind (SCHEMA_V5 §8).
   Geld rechnet in ganzen Cent. Unbekannt bleibt null, nie 0 (Projektanweisungen §11).
   UMD wie v3logic.js/v4logic.js: window.RPV5 im Browser, module.exports in Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RPV5 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCHEMA_MAX = 5;
  /* Grenzen (SCHEMA_V5 §3, aus den Modulen §5) */
  var LIMITS = Object.freeze({
    tasks: 300, title: 120, note: 200, longNote: 500, ack: 500,
    packing: 300, packLabel: 80, packGroup: 40, packQty: 20, hidden: 500,
    countries: 30, idDocs: 40, insurance: 20, provider: 80, phone: 40, contactName: 40,
    prosCons: 10, prosConsText: 120, variantLabel: 60,
    criteriaKeys: 40, guestCards: 10, gcName: 80, gcNote: 300, gcBenefits: 50,
    docs: 200, docTitle: 80, secretLabel: 40, secretValue: 120, docBytes: 15 * 1024 * 1024,
    history: 50, src: 200, payPlan: 12, payLabel: 60, payments: 100,
    steps: 10, terminal: 20, dayRoutes: 366, routeStops: 30
  });
  var MAX_MONEY = 1e9;

  var ID = /^[a-z][a-z0-9]{3,40}$/, DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  var ISO2 = /^[A-Z]{2}$/, ACT = /^[A-Za-z0-9_-]{1,60}$/, REF_ID = /^[a-z0-9][a-z0-9-]{0,79}$/, KEY = /^[a-z][a-z0-9_-]{0,39}$/;
  var SHA = /^[0-9a-f]{64}$/, UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var STAMP = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?Z$/;
  /* Fristen-IDs aus app/fristen.js (pay:, offer:, checkin:, book:, refund:, cancelfee:) und neu cancel:, task:, plan: */
  var FRIST_ID = /^[a-z]+(:[A-Za-z0-9_:.-]{1,120})?$/;

  var own = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  var plain = function (o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; var p = Object.getPrototypeOf(o); return p === null || Object.getPrototypeOf(p) === null; };
  var copy = function (x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); };
  function fail(msg) { throw new Error(msg); }
  function onlyKeys(o, keys, what) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) < 0) fail(what + ': unbekanntes Feld „' + String(k).slice(0, 30) + '“.'); }); }
  function validDate(s) { if (typeof s !== 'string' || !DATE.test(s)) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
  function stamp(v) { var m = typeof v === 'string' && STAMP.exec(v); return !!m && validDate(m[1]); }
  function int(v, min, max) { return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max; }
  function num(v, min, max) { return typeof v === 'number' && isFinite(v) && v >= min && v <= max; }
  function money(v) { return num(v, 0, MAX_MONEY); }
  function bool(v) { return v === true || v === false; }
  function str(v, max, what, required) {
    if (v == null || v === '') { if (required) fail(what + ' fehlt.'); return; }
    if (typeof v !== 'string') fail(what + ': muss Text sein.');
    if (v.length > max) fail(what + ': höchstens ' + max + ' Zeichen.');
    if (required && !v.trim()) fail(what + ' fehlt.');
  }
  function oneOf(v, list, what, nullable) { if (nullable && v == null) return; if (list.indexOf(v) < 0) fail(what + ': ungültiger Wert.'); }
  function list(v, max, what) { if (!Array.isArray(v)) fail(what + ': muss eine Liste sein.'); if (v.length > max) fail(what + ': höchstens ' + max + ' Einträge.'); return v; }
  function useId(seen, id, what) {
    if (typeof id !== 'string' || !ID.test(id)) fail(what + ': ungültige ID.');
    if (own(seen, id)) fail(what + ': doppelte ID „' + id + '“.');
    seen[id] = 1;
  }
  function validTz(z) { if (typeof z !== 'string' || !z || z.length > 60) return false; try { new Intl.DateTimeFormat('de-DE', { timeZone: z }); return true; } catch (e) { return false; } }
  var cents = function (x) { return Math.round(x * 100); };
  var eur = function (c) { return c == null ? null : c / 100; };
  function fmtEur(c) { var s = (Math.abs(c) / 100).toFixed(2).split('.'); return (c < 0 ? '−' : '') + s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + s[1] + ' €'; }
  function fmtDate(d) { return d.slice(8, 10) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4); }
  function addDays(d, n) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  function dayDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5); }

  /* ---------- Zeitpunkte {date,time,tz} (wie Format 3, SCHEMA_V3 §2) ---------- */
  function tzOffsetMin(z, ms) {
    var p = {}; new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000);
  }
  function zonedToUtc(date, min, z) { var base = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + min * 60000; var ms = base - tzOffsetMin(z, base) * 60000; return base - tzOffsetMin(z, ms) * 60000; }
  function localDate(ms, z) { var off = z ? tzOffsetMin(z, ms) : -new Date(ms).getTimezoneOffset(); return new Date(ms + off * 60000).toISOString().slice(0, 10); }
  var minutes = function (t) { return +t.slice(0, 2) * 60 + +t.slice(3, 5); };
  /* Zeitpunkt in ms. Ohne Uhrzeit: Tagesbeginn (edge 'start') oder Tagesende (edge 'end', „frei bis 01.12.“ gilt den ganzen Tag).
     Ohne Zone: opt.tz, sonst Gerätezeit. */
  function instant(at, edge, fallbackTz) {
    var z = at.tz || fallbackTz || null, m = at.time ? minutes(at.time) : (edge === 'end' ? 1440 : 0);
    if (z) return zonedToUtc(at.date, m, z);
    var d = new Date(+at.date.slice(0, 4), +at.date.slice(5, 7) - 1, +at.date.slice(8, 10)); return d.getTime() + m * 60000;
  }
  function validAt(a, what, opt) {
    if (a == null && opt && opt.nullable) return;
    if (!plain(a)) fail(what + ': ungültiger Zeitpunkt.');
    onlyKeys(a, ['date', 'time', 'tz'], what);
    if (!(opt && opt.dateOptional && a.date == null) && !validDate(a.date)) fail(what + ': Datum fehlt oder ist ungültig.');
    if (a.time != null && !(typeof a.time === 'string' && TIME.test(a.time))) fail(what + ': Uhrzeit ungültig.');
    if (a.tz != null && !validTz(a.tz)) fail(what + ': Zeitzone unbekannt.');
    if (a.time != null && a.tz && a.date) { var ms = zonedToUtc(a.date, minutes(a.time), a.tz), back = localDate(ms, a.tz); var hm = new Date(ms + tzOffsetMin(a.tz, ms) * 60000).toISOString().slice(11, 16); if (back !== a.date || hm !== a.time) fail(what + ': Diese Uhrzeit gibt es wegen der Zeitumstellung nicht.'); }
  }

  /* ---------- Felder (SCHEMA_V5 §2) ---------- */
  var TRIP_FIELDS = ['checkoutTime', 'tasks', 'deadlineAck', 'packing', 'countries', 'idDocs', 'insurance', 'emergency',
    'variant', 'assumptions', 'prosCons', 'criteria', 'origin_tpl', 'guestCards', 'docs', 'stayRef', 'dayRoutes'];
  var OFFER_FIELDS = ['kind', 'ref', 'history', 'minNights', 'board', 'payPlan', 'payments', 'cancelTerms'];
  var LEDGER_FIELDS = ['payments', 'cancelTerms'];
  var SEG_FIELDS = ['terminal', 'baggage', 'who', 'arrActual'];
  var PARTY_FIELDS = ['member', 'attend'];
  var EXPENSE_FIELDS = ['fx'];
  var ITEM_FIELDS = ['ref'];

  var nonEmpty = function (v) { return v != null && v !== '' && !(Array.isArray(v) && !v.length) && !(plain(v) && !Object.keys(v).length); };
  function segs(t) { var tr = t && t.transport; return plain(tr) ? [].concat(Array.isArray(tr.out) ? tr.out : [], Array.isArray(tr.back) ? tr.back : []) : []; }
  function ledgerEntries(t) { var l = t && t.ledger; return plain(l) ? Object.keys(l).map(function (k) { return l[k]; }) : []; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  /* Alle Orte, an denen v5-Felder stehen können: [Objekt, Feldliste] */
  function holders(t) {
    var out = [[t, TRIP_FIELDS]];
    arr(t.offers).forEach(function (o) { if (plain(o)) out.push([o, OFFER_FIELDS]); });
    ledgerEntries(t).forEach(function (e) { if (plain(e)) out.push([e, LEDGER_FIELDS]); });
    segs(t).forEach(function (s) { if (plain(s)) out.push([s, SEG_FIELDS]); });
    arr(t.party).forEach(function (p) { if (plain(p)) out.push([p, PARTY_FIELDS]); });
    arr(t.expenses).forEach(function (x) { if (plain(x)) out.push([x, EXPENSE_FIELDS]); });
    arr(t.items).forEach(function (x) { if (plain(x)) out.push([x, ITEM_FIELDS]); });
    return out;
  }
  /* Braucht die Reise Format 5? Leere Listen und leere Objekte zählen nicht. */
  function needsV5(t) { return !!t && plain(t) && holders(t).some(function (h) { return h[1].some(function (k) { return nonEmpty(h[0][k]); }); }); }
  /* Zielversion: nie niedriger als gespeichert. opt.needsV4/needsV3 = Prüffunktionen aus v4logic/v3logic. */
  function targetVersion(t, opt) {
    var cur = t && typeof t.schemaVersion === 'number' && isFinite(t.schemaVersion) ? t.schemaVersion : 2;
    var need = needsV5(t) ? 5 : opt && typeof opt.needsV4 === 'function' && opt.needsV4(t) ? 4 : opt && typeof opt.needsV3 === 'function' && opt.needsV3(t) ? 3 : 2;
    return Math.max(cur, need);
  }
  function assertNoDowngrade(prevVersion, next) {
    var nv = next && next.schemaVersion;
    if (typeof prevVersion === 'number' && (typeof nv !== 'number' || nv < prevVersion)) fail('Diese Reise hat Format ' + prevVersion + ' und darf nicht auf Format ' + nv + ' zurückgestuft werden.');
    return true;
  }
  /* Format < 5 schreibt keine (auch keine leeren) v5-Felder; Format 5 läuft unverändert rund (Feldtreue). */
  function serializeTrip5(t) {
    var d = copy(t);
    if (d.schemaVersion === 5) return d;
    if (typeof d.schemaVersion === 'number' && d.schemaVersion > 5) fail('Format ' + d.schemaVersion + ' ist neuer als dieser Stand.');
    if (needsV5(d)) fail('Diese Reise enthält Angaben des Formats 5 und kann nicht als Format ' + (d.schemaVersion || 2) + ' gespeichert werden.');
    holders(d).forEach(function (h) { h[1].forEach(function (k) { delete h[0][k]; }); });
    return d;
  }
  function readable(t, max) {
    var sv = t && typeof t.schemaVersion === 'number' ? t.schemaVersion : 2, m = max == null ? SCHEMA_MAX : max;
    return { ok: sv <= m, newer: sv > m, schema: sv };
  }

  /* ---------- Prüfung je Feld ---------- */
  function partyIds(t) { var p = Object.create(null); arr(t.party).forEach(function (x) { if (x && typeof x.id === 'string') p[x.id] = 1; }); return p; }
  function partyRef(ids, v, what) { if (typeof v !== 'string' || !own(ids, v)) fail(what + ': Person „' + String(v).slice(0, 41) + '“ gibt es in dieser Reise nicht.'); }
  function partyList(ids, v, what, nullable) { if (v == null && nullable) return; list(v, 20, what).forEach(function (x) { partyRef(ids, x, what); }); }

  function validateCancelTerms(c, what) {
    if (!plain(c)) fail(what + ': ungültig.');
    onlyKeys(c, ['freeUntil', 'steps', 'src', 'checkedAt'], what);
    validAt(c.freeUntil, what + ' kostenlos bis', { nullable: true });
    list(c.steps, LIMITS.steps, what + ' Stufen');
    var prev = null;
    c.steps.forEach(function (s, i) {
      var w = what + ' Stufe ' + (i + 1);
      if (!plain(s)) fail(w + ': ungültig.');
      onlyKeys(s, ['from', 'pct', 'fee'], w);
      validAt(s.from, w, {});
      var hasPct = s.pct != null, hasFee = s.fee != null;
      if (hasPct === hasFee) fail(w + ': genau eins von Prozent oder fester Gebühr angeben.');
      if (hasPct && !num(s.pct, 0, 100)) fail(w + ': Prozent 0–100.');
      if (hasFee && !money(s.fee)) fail(w + ': Gebühr ungültig.');
      var key = s.from.date + (s.from.time || '');
      if (prev != null && key <= prev) fail(w + ': Stufen müssen zeitlich aufsteigen.');
      prev = key;
    });
    if (c.freeUntil && c.steps.length && (c.freeUntil.date + (c.freeUntil.time || '99')) >= (c.steps[0].from.date + (c.steps[0].from.time || ''))) fail(what + ': „kostenlos bis“ muss vor der ersten Stufe liegen.');
    str(c.src, LIMITS.src, what + ' Quelle');
    if (c.checkedAt != null && !validDate(c.checkedAt)) fail(what + ': Prüfdatum ungültig.');
  }
  function validatePayments(v, paid, what, ids) {
    list(v, LIMITS.payments, what);
    var seen = Object.create(null), sum = 0;
    v.forEach(function (p, i) {
      var w = what + ' ' + (i + 1);
      if (!plain(p)) fail(w + ': ungültig.');
      onlyKeys(p, ['id', 'on', 'amount', 'by'], w);
      useId(seen, p.id, w);
      if (!validDate(p.on)) fail(w + ': Datum ungültig.');
      if (!money(p.amount) || p.amount === 0) fail(w + ': Betrag muss größer als 0 sein.');
      if (p.by != null) partyRef(ids, p.by, w);
      sum += cents(p.amount);
    });
    /* paid bleibt die Summe (Format 2/3 lesen nur paid). Abweichung = Datenfehler, nicht still korrigieren. */
    if (v.length && sum !== cents(+paid || 0)) fail(what + ': Summe der Teilzahlungen (' + fmtEur(sum) + ') weicht von „bezahlt“ (' + fmtEur(cents(+paid || 0)) + ') ab.');
  }
  function validatePayPlan(v, price, what) {
    list(v, LIMITS.payPlan, what);
    var seen = Object.create(null), rest = 0;
    v.forEach(function (p, i) {
      var w = what + ' ' + (i + 1);
      if (!plain(p)) fail(w + ': ungültig.');
      onlyKeys(p, ['id', 'label', 'due', 'amount', 'pct', 'rest'], w);
      useId(seen, p.id, w);
      str(p.label, LIMITS.payLabel, w + ' Bezeichnung', true);
      if (!validDate(p.due)) fail(w + ': Fälligkeit fehlt oder ist ungültig.');
      var n = (p.amount != null ? 1 : 0) + (p.pct != null ? 1 : 0) + (p.rest === true ? 1 : 0);
      if (n !== 1) fail(w + ': genau eins von Betrag, Prozent oder Restbetrag angeben.');
      if (p.rest != null && p.rest !== true) fail(w + ': „rest“ nur als true.');
      if (p.amount != null && (!money(p.amount) || p.amount === 0)) fail(w + ': Betrag ungültig.');
      if (p.pct != null && !(num(p.pct, 0, 100) && p.pct > 0)) fail(w + ': Prozent 0–100.');
      if (p.rest) rest++;
    });
    if (rest > 1) fail(what + ': höchstens ein Restbetrag.');
    var s = payPlanSchedule(v, price);
    if (s.over) fail(what + ': Summe (' + fmtEur(s.sumKnown) + ') übersteigt den Preis (' + fmtEur(cents(price)) + ').');
  }
  function validateHistory(v, what) {
    list(v, LIMITS.history, what);
    var prev = '';
    v.forEach(function (h, i) {
      var w = what + ' ' + (i + 1);
      if (!plain(h)) fail(w + ': ungültig.');
      onlyKeys(h, ['at', 'price', 'basis', 'availability', 'src', 'note'], w);
      if (!validDate(h.at)) fail(w + ': Datum ungültig.');
      if (h.at < prev) fail(w + ': Preisstände müssen nach Datum aufsteigen.');
      prev = h.at;
      if (h.price != null && !money(h.price)) fail(w + ': Preis ungültig.');
      oneOf(h.basis, ['stay', 'night', 'person', 'personNight'], w + ' Preisbasis', true);
      oneOf(h.availability, ['unknown', 'available', 'unavailable'], w + ' Verfügbarkeit', true);
      str(h.src, LIMITS.src, w + ' Quelle'); str(h.note, LIMITS.note, w + ' Notiz');
    });
  }
  function validateOffer5(o, i, ids) {
    var w = 'Angebot ' + (i + 1);
    oneOf(o.kind, ['stay', 'transport', 'activity', 'package', 'insurance'], w + ' Art', true);
    if (o.ref != null) { if (!plain(o.ref)) fail(w + ': Verweis ungültig.'); onlyKeys(o.ref, ['type', 'id'], w + ' Verweis'); oneOf(o.ref.type, ['lodging', 'spot', 'place', 'transport'], w + ' Verweisart'); if (typeof o.ref.id !== 'string' || !o.ref.id || o.ref.id.length > 80) fail(w + ': Verweis-ID ungültig.'); }
    if (o.history != null) validateHistory(o.history, w + ' Preisstand');
    if (o.minNights != null && !int(o.minNights, 1, 60)) fail(w + ': Mindestnächte 1–60.');
    oneOf(o.board, ['none', 'breakfast', 'half', 'full', 'allinc'], w + ' Verpflegung', true);
    if (o.payPlan != null) validatePayPlan(o.payPlan, o.price == null || o.price === '' ? null : +o.price, w + ' Zahlungsplan');
    if (o.payments != null) validatePayments(o.payments, o.paid, w + ' Teilzahlung', ids);
    if (o.cancelTerms != null) validateCancelTerms(o.cancelTerms, w + ' Stornobedingungen');
  }
  function validateTasks(v, ids) {
    var seen = Object.create(null);
    list(v, LIMITS.tasks, 'Aufgaben').forEach(function (x, i) {
      var w = 'Aufgabe ' + (i + 1);
      if (!plain(x)) fail(w + ': ungültig.');
      onlyKeys(x, ['id', 'title', 'due', 'done', 'doneAt', 'by', 'doneBy', 'src'], w);
      useId(seen, x.id, w);
      str(x.title, LIMITS.title, w + ' Titel', true);
      validAt(x.due, w + ' fällig', { nullable: true });
      if (!bool(x.done)) fail(w + ': erledigt muss ja/nein sein.');
      if (x.doneAt != null && !stamp(x.doneAt)) fail(w + ': Zeitpunkt „erledigt“ ungültig.');
      if (!x.done && x.doneAt != null) fail(w + ': offene Aufgabe mit Erledigt-Zeitpunkt.');
      if (x.by != null) partyRef(ids, x.by, w);
      if (x.doneBy != null) partyRef(ids, x.doneBy, w);
      if (x.src != null && !(x.src === 'user' || /^rule:[a-z0-9-]{1,40}$/.test(x.src))) fail(w + ': Herkunft ungültig.');
    });
  }
  function validateAck(v) {
    if (!plain(v)) fail('Erledigte Fristen: ungültig.');
    var keys = Object.keys(v); if (keys.length > LIMITS.ack) fail('Erledigte Fristen: zu viele Einträge.');
    keys.forEach(function (k) {
      if (!FRIST_ID.test(k) || k.length > 160) fail('Erledigte Fristen: ungültige Frist-ID.');
      var a = v[k]; if (!plain(a)) fail('Erledigte Frist: ungültig.');
      onlyKeys(a, ['at', 'note'], 'Erledigte Frist');
      if (!stamp(a.at)) fail('Erledigte Frist: Zeitpunkt ungültig.');
      str(a.note, LIMITS.note, 'Erledigte Frist Notiz');
    });
  }
  function validatePacking(v, ids) {
    if (!plain(v)) fail('Packliste: ungültig.');
    onlyKeys(v, ['custom', 'hidden'], 'Packliste');
    var seen = Object.create(null);
    list(v.custom || [], LIMITS.packing, 'Packliste').forEach(function (x, i) {
      var w = 'Packpunkt ' + (i + 1);
      if (!plain(x)) fail(w + ': ungültig.');
      onlyKeys(x, ['id', 'label', 'group', 'who', 'qty'], w);
      useId(seen, x.id, w); str(x.label, LIMITS.packLabel, w, true); str(x.group, LIMITS.packGroup, w + ' Gruppe'); str(x.qty, LIMITS.packQty, w + ' Menge');
      if (x.who != null) partyRef(ids, x.who, w);
    });
    list(v.hidden || [], LIMITS.hidden, 'Ausgeblendete Packpunkte').forEach(function (k) { if (typeof k !== 'string' || !k || k.length > 120) fail('Ausgeblendeter Packpunkt: ungültig.'); });
  }
  function validateAbroad(t, ids) {
    if (t.countries != null) { var c = Object.create(null); list(t.countries, LIMITS.countries, 'Reiseländer').forEach(function (x) { if (typeof x !== 'string' || !ISO2.test(x)) fail('Reiseland: zweistelliger Ländercode (ISO 3166-1).'); if (c[x]) fail('Reiseland „' + x + '“ doppelt.'); c[x] = 1; }); }
    if (t.idDocs != null) {
      var s1 = Object.create(null);
      list(t.idDocs, LIMITS.idDocs, 'Reisedokumente').forEach(function (d, i) {
        var w = 'Reisedokument ' + (i + 1);
        if (!plain(d)) fail(w + ': ungültig.');
        onlyKeys(d, ['id', 'who', 'kind', 'label', 'validUntil'], w); /* bewusst ohne Dokumentnummer */
        useId(s1, d.id, w); partyRef(ids, d.who, w);
        oneOf(d.kind, ['perso', 'pass', 'kinderpass', 'fuehrerschein', 'gesundheitskarte', 'sonst'], w + ' Art');
        str(d.label, 60, w + ' Bezeichnung');
        if (d.validUntil != null && !validDate(d.validUntil)) fail(w + ': Ablaufdatum ungültig.');
      });
    }
    if (t.insurance != null) {
      var s2 = Object.create(null);
      list(t.insurance, LIMITS.insurance, 'Versicherungen').forEach(function (x, i) {
        var w = 'Versicherung ' + (i + 1);
        if (!plain(x)) fail(w + ': ungültig.');
        onlyKeys(x, ['id', 'kind', 'provider', 'phone', 'from', 'to', 'who', 'note'], w);
        useId(s2, x.id, w); oneOf(x.kind, ['kranken', 'ruecktritt', 'gepaeck', 'sonst'], w + ' Art');
        str(x.provider, LIMITS.provider, w + ' Anbieter'); str(x.phone, LIMITS.phone, w + ' Telefon'); str(x.note, LIMITS.note, w + ' Notiz');
        if (x.from != null && !validDate(x.from)) fail(w + ': Beginn ungültig.');
        if (x.to != null && !validDate(x.to)) fail(w + ': Ende ungültig.');
        if (x.from && x.to && x.to < x.from) fail(w + ': Ende vor Beginn.');
        partyList(ids, x.who, w, true);
      });
    }
    if (t.emergency != null) {
      var e = t.emergency; if (!plain(e)) fail('Notfallblatt: ungültig.');
      onlyKeys(e, ['homeContact', 'stayPhone', 'note'], 'Notfallblatt');
      if (e.homeContact != null) { if (!plain(e.homeContact)) fail('Notfallkontakt: ungültig.'); onlyKeys(e.homeContact, ['name', 'phone'], 'Notfallkontakt'); str(e.homeContact.name, LIMITS.contactName, 'Notfallkontakt Name'); str(e.homeContact.phone, LIMITS.phone, 'Notfallkontakt Telefon'); }
      str(e.stayPhone, LIMITS.phone, 'Telefon Unterkunft'); str(e.note, LIMITS.longNote, 'Notfallblatt Notiz');
    }
  }
  function validateVariant(t) {
    if (t.variant != null) {
      var v = t.variant; if (!plain(v)) fail('Variante: ungültig.');
      onlyKeys(v, ['group', 'label', 'state', 'from', 'at'], 'Variante');
      if (typeof v.group !== 'string' || !ID.test(v.group)) fail('Variante: Gruppen-ID ungültig.');
      str(v.label, LIMITS.variantLabel, 'Variante Bezeichnung', true);
      oneOf(v.state, ['offen', 'gewaehlt', 'verworfen'], 'Variante Zustand');
      if (v.from != null && (typeof v.from !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(v.from))) fail('Variante: Ursprungsreise ungültig.');
      if (v.at != null && !stamp(v.at)) fail('Variante: Zeitpunkt ungültig.');
    }
    if (t.assumptions != null) {
      var a = t.assumptions; if (!plain(a)) fail('Annahmen: ungültig.');
      onlyKeys(a, ['fuel', 'acts', 'stay', 'note'], 'Annahmen');
      ['fuel', 'acts', 'stay'].forEach(function (k) {
        var r = a[k]; if (r == null) return;
        if (!plain(r)) fail('Annahme ' + k + ': ungültig.'); onlyKeys(r, ['low', 'high'], 'Annahme ' + k);
        var lim = k === 'fuel' ? 20 : MAX_MONEY; /* Sprit als €/l, sonst Euro-Betrag */
        if (!num(r.low, 0, lim) || !num(r.high, 0, lim) || r.low > r.high) fail('Annahme ' + k + ': Spanne „günstig ≤ konservativ“ angeben.');
      });
      str(a.note, LIMITS.longNote, 'Annahmen Notiz');
    }
    if (t.prosCons != null) {
      var p = t.prosCons; if (!plain(p)) fail('Für und Wider: ungültig.');
      onlyKeys(p, ['pros', 'cons', 'open'], 'Für und Wider');
      ['pros', 'cons', 'open'].forEach(function (k) { if (p[k] != null) list(p[k], LIMITS.prosCons, 'Für und Wider').forEach(function (x) { str(x, LIMITS.prosConsText, 'Für und Wider', true); }); });
    }
  }
  function validateCriteria(t) {
    if (t.criteria != null) {
      var c = t.criteria; if (!plain(c)) fail('Kriterien: ungültig.');
      onlyKeys(c, ['must', 'like', 'avoid', 'budgetWish', 'budgetMax', 'returnBy', 'maxDriveMin', 'cancel', 'notes'], 'Kriterien');
      var seen = Object.create(null);
      ['must', 'like', 'avoid'].forEach(function (k) {
        if (c[k] == null) return;
        list(c[k], LIMITS.criteriaKeys, 'Kriterien').forEach(function (x) {
          if (typeof x !== 'string' || !KEY.test(x)) fail('Kriterium: ungültiger Schlüssel.');
          if (seen[x]) fail('Kriterium „' + x + '“ steht in mehreren Gruppen.'); seen[x] = 1;
        });
      });
      ['budgetWish', 'budgetMax'].forEach(function (k) { if (c[k] != null && !money(c[k])) fail('Kriterien: Budget ungültig.'); });
      if (c.budgetWish != null && c.budgetMax != null && c.budgetWish > c.budgetMax) fail('Kriterien: Wunschbudget über der Obergrenze.');
      if (c.returnBy != null) { if (!plain(c.returnBy)) fail('Heimkehr: ungültig.'); onlyKeys(c.returnBy, ['date', 'time'], 'Heimkehr'); if (c.returnBy.date != null && !validDate(c.returnBy.date)) fail('Heimkehr: Datum ungültig.'); if (typeof c.returnBy.time !== 'string' || !TIME.test(c.returnBy.time)) fail('Heimkehr: Uhrzeit fehlt.'); }
      if (c.maxDriveMin != null && !int(c.maxDriveMin, 1, 3000)) fail('Kriterien: maximale Fahrzeit ungültig.');
      oneOf(c.cancel, ['frei', 'egal'], 'Kriterien Stornierbarkeit', true);
      str(c.notes, LIMITS.longNote, 'Kriterien Notiz');
    }
    if (t.origin_tpl != null) {
      var o = t.origin_tpl; if (!plain(o)) fail('Vorlagen-Herkunft: ungültig.');
      onlyKeys(o, ['id', 'version', 'kind', 'at'], 'Vorlagen-Herkunft');
      if (typeof o.id !== 'string' || !o.id || o.id.length > 64) fail('Vorlagen-Herkunft: ID ungültig.');
      if (!int(o.version, 1, 1e6)) fail('Vorlagen-Herkunft: Version ungültig.');
      oneOf(o.kind, ['builtin', 'user'], 'Vorlagen-Herkunft Art');
      if (!stamp(o.at)) fail('Vorlagen-Herkunft: Zeitpunkt ungültig.');
    }
  }
  var GC_STATUS = ['enthalten', 'nicht', 'unbestaetigt'];
  function validateGuestCards(v, t, ids) {
    var seen = Object.create(null), offers = Object.create(null);
    arr(t.offers).forEach(function (o) { if (o && o.id) offers[o.id] = 1; });
    list(v, LIMITS.guestCards, 'Gästekarten').forEach(function (g, i) {
      var w = 'Gästekarte ' + (i + 1);
      if (!plain(g)) fail(w + ': ungültig.');
      onlyKeys(g, ['id', 'cardId', 'name', 'scope', 'status', 'evidence', 'persons', 'custom'], w);
      useId(seen, g.id, w);
      if (g.cardId != null && (typeof g.cardId !== 'string' || !REF_ID.test(g.cardId))) fail(w + ': Karten-ID ungültig.');
      str(g.name, LIMITS.gcName, w + ' Name', true);
      if (!plain(g.scope)) fail(w + ': Bezug fehlt.');
      onlyKeys(g.scope, ['stayId', 'offerId'], w + ' Bezug');
      var n = (g.scope.stayId != null ? 1 : 0) + (g.scope.offerId != null ? 1 : 0);
      if (n !== 1) fail(w + ': genau eine Unterkunft oder ein Angebot als Bezug.');
      if (g.scope.stayId != null && (typeof g.scope.stayId !== 'string' || !g.scope.stayId || g.scope.stayId.length > 80)) fail(w + ': Unterkunft ungültig.');
      /* Angebot darf fehlen (Historie: Karte gehörte zu einem entfernten Angebot), wirkt dann aber nicht */
      if (g.scope.offerId != null && (typeof g.scope.offerId !== 'string' || !/^o[a-z0-9]+$/i.test(g.scope.offerId))) fail(w + ': Angebot ungültig.');
      oneOf(g.status, GC_STATUS, w + ' Status');
      if (g.evidence != null) {
        var e = g.evidence; if (!plain(e)) fail(w + ': Beleg ungültig.');
        onlyKeys(e, ['on', 'url', 'note', 'by'], w + ' Beleg');
        if (e.on != null && !validDate(e.on)) fail(w + ': Belegdatum ungültig.');
        if (e.url != null && !(typeof e.url === 'string' && /^https:\/\/[^\s]{3,500}$/.test(e.url))) fail(w + ': Beleg-Link muss mit https:// beginnen.');
        str(e.note, LIMITS.gcNote, w + ' Belegnotiz');
        if (e.by != null) partyRef(ids, e.by, w);
      }
      if (g.status === 'enthalten' && g.evidence == null) fail(w + ': „enthalten“ braucht einen Beleg (Datum, Link oder Notiz).');
      partyList(ids, g.persons, w + ' Personen', true);
      if (g.custom != null) {
        if (!plain(g.custom)) fail(w + ': eigene Regeln ungültig.'); onlyKeys(g.custom, ['benefits', 'limits'], w + ' eigene Regeln');
        list(g.custom.benefits || [], LIMITS.gcBenefits, w + ' Leistungen').forEach(function (b) {
          if (!plain(b)) fail(w + ': Leistung ungültig.'); onlyKeys(b, ['spotId', 'label', 'kind', 'value', 'per', 'limitGroup', 'combinable'], w + ' Leistung');
          str(b.label, LIMITS.gcName, w + ' Leistung', true); oneOf(b.kind, ['frei', 'preis', 'rabatt_eur', 'rabatt_pct'], w + ' Leistungsart');
          if (b.kind !== 'frei' && !(b.value == null || (b.kind === 'rabatt_pct' ? num(b.value, 0, 100) : money(b.value)))) fail(w + ': Leistungswert ungültig.');
          oneOf(b.per, ['pp', 'grp'], w + ' je', true);
          if (b.spotId != null && !REF_ID.test(String(b.spotId))) fail(w + ': Attraktion ungültig.');
          if (b.limitGroup != null && !KEY.test(String(b.limitGroup))) fail(w + ': Limitgruppe ungültig.');
          if (b.combinable != null && !bool(b.combinable)) fail(w + ': Kombinierbarkeit ja/nein/unbekannt.');
        });
        list(g.custom.limits || [], 20, w + ' Limits').forEach(function (l) {
          if (!plain(l)) fail(w + ': Limit ungültig.'); onlyKeys(l, ['group', 'perDay', 'perStay'], w + ' Limit');
          if (!KEY.test(String(l.group))) fail(w + ': Limitgruppe ungültig.');
          ['perDay', 'perStay'].forEach(function (k) { if (l[k] != null && !int(l[k], 0, 100)) fail(w + ': Limit ungültig.'); });
        });
      }
    });
  }
  var DOC_KINDS = ['ticket', 'bordkarte', 'bestaetigung', 'versicherung', 'gutschein', 'sonstiges'];
  var DOC_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
  function validateDocs(v, ids) {
    var seen = Object.create(null), sums = Object.create(null);
    list(v, LIMITS.docs, 'Unterlagen').forEach(function (d, i) {
      var w = 'Unterlage ' + (i + 1);
      if (!plain(d)) fail(w + ': ungültig.');
      onlyKeys(d, ['id', 'kind', 'title', 'link', 'valid', 'file', 'secret', 'share', 'owner', 'cloud'], w);
      useId(seen, d.id, w); oneOf(d.kind, DOC_KINDS, w + ' Art'); str(d.title, LIMITS.docTitle, w + ' Titel', true);
      if (d.link != null) {
        if (!plain(d.link)) fail(w + ': Verknüpfung ungültig.'); onlyKeys(d.link, ['key'], w + ' Verknüpfung');
        /* Verknüpfung auf gelöschten Abschnitt bleibt stehen (M11 Regel 5): Form prüfen, Existenz nicht */
        if (d.link.key != null && !(typeof d.link.key === 'string' && /^(tr|offer|act|ledger):[A-Za-z0-9_:.-]{1,100}$/.test(d.link.key))) fail(w + ': Verknüpfung ungültig.');
      }
      if (d.valid != null) {
        if (!plain(d.valid)) fail(w + ': Gültigkeit ungültig.'); onlyKeys(d.valid, ['from', 'to'], w + ' Gültigkeit');
        ['from', 'to'].forEach(function (k) { if (d.valid[k] != null && !validDate(d.valid[k])) fail(w + ': Gültigkeitsdatum ungültig.'); });
        if (d.valid.from && d.valid.to && d.valid.to < d.valid.from) fail(w + ': gültig bis vor gültig ab.');
      }
      if (d.file != null) {
        var f = d.file; if (!plain(f)) fail(w + ': Datei ungültig.'); onlyKeys(f, ['sha256', 'bytes', 'mime', 'pages'], w + ' Datei');
        if (typeof f.sha256 !== 'string' || !SHA.test(f.sha256)) fail(w + ': Prüfsumme ungültig.');
        if (own(sums, f.sha256)) fail(w + ': dieselbe Datei steckt schon in „' + sums[f.sha256] + '“.'); sums[f.sha256] = d.id;
        if (!int(f.bytes, 1, LIMITS.docBytes)) fail(w + ': Datei höchstens 15 MB.');
        oneOf(f.mime, DOC_MIME, w + ' Dateityp');
        if (f.pages != null && !int(f.pages, 1, 2000)) fail(w + ': Seitenzahl ungültig.');
      }
      if (d.secret != null) {
        var s = d.secret; if (!plain(s)) fail(w + ': Code ungültig.'); onlyKeys(s, ['label', 'value', 'local'], w + ' Code');
        str(s.label, LIMITS.secretLabel, w + ' Code-Bezeichnung', true);
        if (s.local === true) { if (s.value != null) fail(w + ': nur auf dem Gerät gespeicherter Code darf nicht in der Reise stehen.'); }
        else { if (s.local != null) fail(w + ': „local“ nur als true.'); str(s.value, LIMITS.secretValue, w + ' Code'); }
      }
      oneOf(d.share, ['ich', 'mitglieder'], w + ' Sichtbarkeit');
      if (d.owner != null) partyRef(ids, d.owner, w);
      if (d.share === 'ich' && d.owner == null) fail(w + ': „nur ich“ braucht eine Person als Besitzer.');
      if (!plain(d.cloud)) fail(w + ': Cloud-Zustand fehlt.'); onlyKeys(d.cloud, ['state', 'path'], w + ' Cloud');
      oneOf(d.cloud.state, ['none', 'queued', 'done', 'error'], w + ' Cloud-Zustand');
      if ((d.cloud.state === 'done') !== (typeof d.cloud.path === 'string')) fail(w + ': Cloud-Pfad nur und genau bei „done“.');
      if (d.cloud.path != null && !/^[A-Za-z0-9_-]{1,64}\/[a-z][a-z0-9]{3,40}$/.test(d.cloud.path)) fail(w + ': Cloud-Pfad ungültig.');
      if (d.cloud.state !== 'none' && d.file == null) fail(w + ': ohne Datei gibt es nichts hochzuladen.');
    });
  }
  function validateRoutes(v) {
    if (!plain(v)) fail('Tagesrouten: ungültig.');
    var keys = Object.keys(v); if (keys.length > LIMITS.dayRoutes) fail('Tagesrouten: zu viele Tage.');
    keys.forEach(function (k) {
      if (!/^(0|[1-9]\d{0,2})$/.test(k)) fail('Tagesroute: Tag muss ein Index sein.');
      var r = v[k]; if (!plain(r)) fail('Tagesroute: ungültig.');
      onlyKeys(r, ['order', 'km', 'min', 'src', 'at'], 'Tagesroute');
      list(r.order, LIMITS.routeStops, 'Tagesroute').forEach(function (u) { if (typeof u !== 'string' || !ACT.test(u)) fail('Tagesroute: Termin ungültig.'); });
      if (r.km != null && !num(r.km, 0, 5000)) fail('Tagesroute: km ungültig.');
      if (r.min != null && !int(r.min, 0, 3000)) fail('Tagesroute: Minuten ungültig.');
      oneOf(r.src, ['schaetzung', 'osrm'], 'Tagesroute Quelle');
      if (r.at != null && !stamp(r.at)) fail('Tagesroute: Zeitpunkt ungültig.');
      if (r.src === 'osrm' && r.at == null) fail('Tagesroute: berechnete Route braucht den Abrufzeitpunkt.');
    });
  }
  function validateNested(t, ids) {
    arr(t.offers).forEach(function (o, i) { if (plain(o)) validateOffer5(o, i, ids); });
    var l = plain(t.ledger) ? t.ledger : {};
    Object.keys(l).forEach(function (k) {
      var e = l[k]; if (!plain(e)) return;
      if (e.payments != null) validatePayments(e.payments, e.paid, 'Buchungsbuch „' + k + '“ Teilzahlung', ids);
      if (e.cancelTerms != null) validateCancelTerms(e.cancelTerms, 'Buchungsbuch „' + k + '“ Stornobedingungen');
    });
    segs(t).forEach(function (s, i) {
      if (!plain(s)) return; var w = 'Abschnitt ' + (i + 1);
      if (s.terminal != null) { str(s.terminal, LIMITS.terminal, w + ' Terminal'); if (s.mode !== 'flug') fail(w + ': Terminal nur bei Flügen.'); }
      if (s.baggage != null) { if (!plain(s.baggage)) fail(w + ': Gepäck ungültig.'); onlyKeys(s.baggage, ['cabin', 'hold'], w + ' Gepäck'); ['cabin', 'hold'].forEach(function (k) { if (s.baggage[k] != null && !int(s.baggage[k], 0, 40)) fail(w + ': Gepäckstücke 0–40.'); }); }
      if (s.who != null) partyList(ids, s.who, w + ' Mitreisende');
      if (s.arrActual != null) validAt(s.arrActual, w + ' tatsächliche Ankunft', {});
    });
    arr(t.party).forEach(function (p, i) {
      if (!plain(p)) return; var w = 'Person ' + (i + 1);
      if (p.member != null && !(typeof p.member === 'string' && UUID.test(p.member))) fail(w + ': Konto-Verknüpfung ungültig.');
      if (p.attend != null) { if (!plain(p.attend)) fail(w + ': Teilnahme ungültig.'); var ks = Object.keys(p.attend); if (ks.length > 500) fail(w + ': zu viele Teilnahme-Angaben.'); ks.forEach(function (k) { if (!ACT.test(k)) fail(w + ': Teilnahme-Termin ungültig.'); oneOf(p.attend[k], ['ja', 'vielleicht', 'nein'], w + ' Teilnahme'); }); }
    });
    var members = Object.create(null);
    arr(t.party).forEach(function (p) { if (p && p.member) { if (members[p.member]) fail('Ein Konto ist mit zwei Mitreisenden verknüpft.'); members[p.member] = 1; } });
    arr(t.expenses).forEach(function (x, i) {
      if (!plain(x) || x.fx == null) return; var w = 'Ausgabe ' + (i + 1), f = x.fx;
      if (!plain(f)) fail(w + ': Währung ungültig.'); onlyKeys(f, ['cur', 'orig', 'rate', 'on', 'src'], w + ' Währung');
      if (typeof f.cur !== 'string' || !/^[A-Z]{3}$/.test(f.cur) || f.cur === 'EUR') fail(w + ': Währungscode (ISO 4217, nicht EUR).');
      if (!money(f.orig) || f.orig === 0) fail(w + ': Betrag in Fremdwährung ungültig.');
      if (f.rate != null && !(num(f.rate, 0, 1e6) && f.rate > 0)) fail(w + ': Kurs muss größer als 0 sein.');
      if (f.rate == null && x.amount != null) fail(w + ': ohne Kurs bleibt der Euro-Betrag offen (null).');
      if (f.rate != null && !validDate(f.on)) fail(w + ': Kursdatum fehlt.');
      oneOf(f.src, ['ecb', 'manual'], w + ' Kursquelle', f.rate == null);
    });
    arr(t.items).forEach(function (x, i) {
      if (!plain(x) || x.ref == null) return; var w = 'Termin ' + (i + 1), r = x.ref;
      if (!plain(r)) fail(w + ': Registerverweis ungültig.'); onlyKeys(r, ['type', 'id', 'ver'], w + ' Registerverweis');
      oneOf(r.type, ['spot', 'place', 'lodging'], w + ' Verweisart');
      if (typeof r.id !== 'string' || !REF_ID.test(r.id)) fail(w + ': Verweis-ID ungültig.');
      if (r.ver != null && !int(r.ver, 1, 1e9)) fail(w + ': Katalogversion ungültig.');
    });
  }
  /* v5-Felder prüfen. In Reisen unter Format 5 verboten (leere ausgenommen, die serializeTrip5 entfernt). */
  function validateV5(t) {
    if (!plain(t)) fail('Reise: ungültig.');
    if (t.schemaVersion !== 5) { if (needsV5(t)) fail('Diese Angaben gibt es erst ab Format 5.'); return true; }
    var ids = partyIds(t);
    if (t.checkoutTime != null && !(typeof t.checkoutTime === 'string' && TIME.test(t.checkoutTime))) fail('Check-out-Zeit ungültig.');
    if (t.tasks != null) validateTasks(t.tasks, ids);
    if (t.deadlineAck != null) validateAck(t.deadlineAck);
    if (t.packing != null) validatePacking(t.packing, ids);
    validateAbroad(t, ids);
    validateVariant(t);
    validateCriteria(t);
    if (t.guestCards != null) validateGuestCards(t.guestCards, t, ids);
    if (t.docs != null) validateDocs(t.docs, ids);
    if (t.stayRef != null) { if (!plain(t.stayRef)) fail('Unterkunft-Verweis ungültig.'); onlyKeys(t.stayRef, ['id', 'ver'], 'Unterkunft-Verweis'); if (typeof t.stayRef.id !== 'string' || !REF_ID.test(t.stayRef.id)) fail('Unterkunft-Verweis: ID ungültig.'); if (t.stayRef.ver != null && !int(t.stayRef.ver, 1, 1e9)) fail('Unterkunft-Verweis: Version ungültig.'); }
    if (t.dayRoutes != null) validateRoutes(t.dayRoutes);
    validateNested(t, ids);
    return true;
  }
  /* Wo wird eine Person verwendet? Vor dem Entfernen aus t.party zeigen (sonst lehnt validateV5 ab). */
  function partyUses(t, id) {
    var out = [];
    arr(t.tasks).forEach(function (x) { if (x.by === id || x.doneBy === id) out.push('task:' + x.id); });
    arr(t.packing && t.packing.custom).forEach(function (x) { if (x.who === id) out.push('pack:' + x.id); });
    arr(t.idDocs).forEach(function (x) { if (x.who === id) out.push('iddoc:' + x.id); });
    arr(t.insurance).forEach(function (x) { if (arr(x.who).indexOf(id) >= 0) out.push('insurance:' + x.id); });
    arr(t.guestCards).forEach(function (x) { if (arr(x.persons).indexOf(id) >= 0 || x.evidence && x.evidence.by === id) out.push('guestcard:' + x.id); });
    arr(t.docs).forEach(function (x) { if (x.owner === id) out.push('doc:' + x.id); });
    segs(t).forEach(function (s) { if (arr(s.who).indexOf(id) >= 0) out.push('tr:' + s.id); });
    arr(t.offers).forEach(function (o) { arr(o.payments).forEach(function (p) { if (p.by === id) out.push('offer:' + o.id + ':' + p.id); }); });
    var l = plain(t.ledger) ? t.ledger : {};
    Object.keys(l).forEach(function (k) { arr(l[k] && l[k].payments).forEach(function (p) { if (p.by === id) out.push('ledger:' + k + ':' + p.id); }); });
    return out;
  }

  /* ---------- Stornogebühr-Vorschau (M02.2, R1–R9) ---------- */
  /* terms: cancelTerms oder null; amount: gebuchter Preis (Euro) oder null; at: Stichtag (Date oder ms).
     opt.cancel: vorhandenes Storno (Format 3) → R9. opt.tz: Zone für Zeitpunkte ohne Zone (sonst Gerätezeit). */
  function cancelFee(terms, amount, at, opt) {
    var o = opt || {}, ms = at instanceof Date ? at.getTime() : at;
    if (o.cancel) { /* R9: bereits storniert, keine Frist mehr; Gebühr laut cancel.fee (SCHEMA_V3 §1) */
      var f = o.cancel.fee;
      return f == null ? { state: 'storniert', fee: null, text: 'Storniert, Gebühr noch unbekannt' } : { state: 'storniert', fee: eur(cents(f)), text: 'Storniert, Gebühr ' + fmtEur(cents(f)) };
    }
    if (!terms || (!terms.freeUntil && !arr(terms.steps).length)) return { state: 'unbekannt', fee: null, task: 'Stornobedingungen klären', text: 'Stornobedingungen nicht erfasst' }; /* R5 */
    if (typeof ms !== 'number' || !isFinite(ms)) fail('Stornovorschau: Stichtag fehlt.');
    var fu = terms.freeUntil, zone = function (a) { return a.tz || o.tz || null; };
    if (fu && ms < instant(fu, 'end', o.tz)) {
      var today = localDate(ms, zone(fu)), days = dayDiff(today, fu.date);
      return { state: 'frei', fee: 0, freeDays: days, until: fu, text: days <= 0 ? 'heute noch kostenlos' + (fu.time ? ' bis ' + fu.time + (fu.tz ? ' (' + fu.tz + ')' : '') : '') : 'noch ' + days + (days === 1 ? ' Tag' : ' Tage') + ' kostenlos' };
    }
    var step = null, idx = -1;
    arr(terms.steps).forEach(function (s, i) { if (ms >= instant(s.from, 'start', o.tz)) { step = s; idx = i; } });
    if (!step) return { state: 'unbekannt', fee: null, task: 'Stornobedingungen klären', text: fu ? 'Zwischen „kostenlos bis“ und der ersten Stufe ist nichts erfasst' : 'Vor der ersten erfassten Stufe: Bedingungen prüfen' };
    if (step.fee != null) return { state: 'gebuehr', fee: eur(cents(step.fee)), step: idx, text: 'Stornogebühr ' + fmtEur(cents(step.fee)) }; /* R7 */
    if (amount == null || amount === '' || !isFinite(+amount)) return { state: 'unbekannt', fee: null, step: idx, text: step.pct + ' % von einem noch unbekannten Preis' }; /* R6 */
    var c = Math.round(cents(+amount) * step.pct / 100); /* R4: kaufmännisch auf Cent */
    return { state: 'gebuehr', fee: eur(c), step: idx, text: 'Stornogebühr ' + step.pct + ' % = ' + fmtEur(c) };
  }
  /* Fristen aus Stornobedingungen, stabile IDs cancel:<key>:<stufe> (0 = Ende kostenlos, i+1 = Stufe i). */
  function cancelDeadlines(key, terms) {
    var out = []; if (!terms) return out;
    if (terms.freeUntil) out.push({ id: 'cancel:' + key + ':0', at: copy(terms.freeUntil), label: 'Kostenlos stornierbar bis' });
    arr(terms.steps).forEach(function (s, i) { out.push({ id: 'cancel:' + key + ':' + (i + 1), at: copy(s.from), label: 'Stornogebühr steigt' + (s.pct != null ? ' auf ' + s.pct + ' %' : ' auf ' + fmtEur(cents(s.fee))) }); });
    return out;
  }

  /* ---------- Zahlungsplan (Soll) und Teilzahlungen (Ist), M08 O7/O8 ---------- */
  /* Beträge der Raten in Cent. Prozent wird kaufmännisch gerundet; der Restbetrag ist Preis − gerundete Raten, damit die
     Summe exakt dem Preis entspricht (O7). Preis unbekannt: Prozent-/Restraten bleiben null. */
  function payPlanSchedule(plan, price) {
    var p = price == null || !isFinite(+price) ? null : cents(+price), rows = [], known = 0, open = false;
    arr(plan).forEach(function (x) {
      var c = x.amount != null ? cents(x.amount) : x.pct != null ? (p == null ? null : Math.round(p * x.pct / 100)) : null;
      if (c == null && !x.rest) open = true; else if (c != null) known += c;
      rows.push({ id: x.id, label: x.label, due: x.due, cents: c, rest: !!x.rest });
    });
    rows.forEach(function (r) { if (r.rest) { if (p == null) { r.cents = null; open = true; } else r.cents = p - known; } });
    var sum = rows.reduce(function (s, r) { return s + (r.cents || 0); }, 0);
    return { rows: rows.map(function (r) { return { id: r.id, label: r.label, due: r.due, amount: eur(r.cents), rest: r.rest }; }), sumKnown: sum, over: p != null && (known > p || rows.some(function (r) { return r.cents != null && r.cents < 0; })), open: open, price: eur(p), unplanned: p == null || open ? null : eur(p - sum) };
  }
  /* Raten mit den Zahlungen abgleichen: Zahlungen füllen die Raten nach Fälligkeit (älteste zuerst). today: 'YYYY-MM-DD'. */
  function payPlanStatus(plan, price, paid, today) {
    var s = payPlanSchedule(plan, price), pool = cents(+paid || 0);
    var rows = s.rows.slice().sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; }).map(function (r) {
      if (r.amount == null) return { id: r.id, label: r.label, due: r.due, amount: null, paid: null, open: null, state: 'unbekannt' };
      var c = cents(r.amount), take = Math.min(pool, c); pool -= take;
      var st = take >= c ? 'bezahlt' : r.due < today ? 'ueberfaellig' : take > 0 ? 'teilweise' : 'offen';
      return { id: r.id, label: r.label, due: r.due, amount: r.amount, paid: eur(take), open: eur(c - take), state: st };
    });
    return { rows: rows, extra: eur(pool), open: s.open };
  }

  /* ---------- Angebote: Preisstand, Passung, Vergleichbarkeit (M08 O3–O6, O9) ---------- */
  function offerPriceState(o, today) {
    var h = arr(o && o.history), last = h.length ? h[h.length - 1] : null, first = h.length ? h[0] : null, out = { current: o && o.price != null && o.price !== '' ? +o.price : null, hints: [] };
    if (last && first && last !== first && last.price != null && first.price != null && last.basis === first.basis) {
      var d = cents(last.price) - cents(first.price);
      out.change = { abs: eur(d), pct: first.price ? Math.round(d / cents(first.price) * 1000) / 10 : null, since: first.at };
    }
    if (o && o.booked) {
      /* O4: gebucht bleibt gebucht – Reisekosten nutzen den Buchungsbetrag, neuer Preisstand ist nur ein Hinweis */
      if (last && last.price != null && out.current != null && (!last.basis || last.basis === o.basis) && cents(last.price) < cents(out.current)) out.hints.push({ kind: 'guenstiger', text: 'Aktuell günstiger (' + fmtEur(cents(last.price)) + ' am ' + fmtDate(last.at) + '): Umbuchung prüfen' });
    } else if (last && last.price != null && out.current != null && (!last.basis || last.basis === o.basis) && cents(last.price) !== cents(out.current)) {
      out.hints.push({ kind: 'abweichung', text: 'Preis weicht vom letzten Preisstand ab – bitte prüfen' });
    }
    if (o && !o.booked && o.validUntil && today && o.validUntil < today) { out.expired = true; out.hints.push({ kind: 'abgelaufen', text: 'Angebot abgelaufen: Preis veraltet, neu prüfen' }); }
    return out;
  }
  function offerFits(o, nights, persons) {
    var issues = [];
    if (o && o.minNights != null && nights != null && nights < o.minNights) issues.push('passt nicht zur Reise (mind. ' + o.minNights + ' Nächte)');
    if (o && persons != null && o.persons != null && +o.persons !== +persons) issues.push('für ' + o.persons + ' statt ' + persons + ' Personen');
    return { ok: !issues.length, issues: issues };
  }
  function comparable(rows) {
    var keys = ['persons', 'nights'], diff = [];
    keys.forEach(function (k) { var v = rows.map(function (r) { return r[k]; }).filter(function (x) { return x != null; }); if (v.some(function (x) { return x !== v[0]; })) diff.push(k === 'persons' ? 'Personen' : 'Nächte'); });
    return { ok: !diff.length, text: diff.length ? 'nicht vergleichbar: ' + diff.join(', ') : '' };
  }

  /* ---------- Budget (M05 V2/V3, M10) ---------- */
  /* known: bekannte Summe in Euro, open: Liste offener Posten (Text); max: Obergrenze (criteria.budgetMax ?? t.budget). */
  function budgetVerdict(known, open, max) {
    if (max == null || !isFinite(+max)) return { state: 'ohne', text: 'Keine Obergrenze erfasst' };
    var k = cents(+known || 0), m = cents(+max), o = arr(open);
    if (k > m) return { state: 'ueber', over: eur(k - m), text: 'über der Obergrenze um ' + fmtEur(k - m) };
    if (o.length) return { state: 'unsicher', room: eur(m - k), text: 'nicht sicher im Budget (' + o.join(', ') + ' offen)' };
    return { state: 'im', room: eur(m - k), text: 'im Budget, ' + fmtEur(m - k) + ' Spielraum' };
  }
  function budgetMax(t) { return t && t.criteria && t.criteria.budgetMax != null ? t.criteria.budgetMax : t && t.budget != null && t.budget !== '' ? +t.budget : null; }

  /* ---------- Varianten (M05 V8) ---------- */
  function variantConflicts(trips) {
    var g = Object.create(null);
    arr(trips).forEach(function (t) { var v = t && t.variant; if (v && v.state === 'gewaehlt') (g[v.group] = g[v.group] || []).push(t.id); });
    return Object.keys(g).filter(function (k) { return g[k].length > 1; }).map(function (k) { return { group: k, trips: g[k], text: 'zwei gewählte Varianten – bitte eine auswählen' }; });
  }

  /* ---------- Gästekarten (M09.3, G-R10/G-R12) ---------- */
  /* Status für die aktuelle Unterkunft. ctx: {stayId, offerId (aktives Angebot), stayCard (true|'?'|false aus Katalog)}.
     Format < 5: genau wie cardStatusOf in app/gaestekarten.js (aus t.cardConfirmed). Format 5: Eintrag mit passendem Bezug;
     ein Eintrag einer früheren Unterkunft wirkt nicht (G-R10). cardConfirmed wird ab Format 5 nicht mehr gelesen. */
  function guestCardStatus(t, ctx) {
    var c = ctx || {}, hasStay = !!(c.stayId || c.offerId);
    if (!t || t.schemaVersion !== 5) {
      if (hasStay && t && t.cardConfirmed === true) return { status: 'enthalten', entry: null, from: 'cardConfirmed' };
      return { status: hasStay && (c.stayCard === true || c.stayCard === '?') ? 'unbestaetigt' : 'nicht', entry: null, from: 'katalog' };
    }
    var hit = null;
    arr(t.guestCards).forEach(function (g) { if (!hit && (c.offerId && g.scope.offerId === c.offerId || c.stayId && g.scope.stayId === c.stayId)) hit = g; });
    if (hit) return { status: hit.status, entry: hit.id, from: 'eintrag' };
    return { status: hasStay && (c.stayCard === true || c.stayCard === '?') ? 'unbestaetigt' : 'nicht', entry: null, from: 'katalog', stale: arr(t.guestCards).length ? 'gehört zur früheren Unterkunft' : null };
  }

  /* ---------- Anheben auf Format 5 ---------- */
  /* Kandidat: fn ändert eine Kopie. Hebt auf 5, sobald needsV5, übernimmt dabei t.cardConfirmed in t.guestCards (G-R12),
     damit cost() vor und nach dem Anheben gleich rechnet. Nie still: upgrade:true heißt „vor dem Speichern bestätigen“. */
  function candidate5(t, fn, ctx) {
    if (!plain(t)) fail('Reise fehlt.');
    var from = typeof t.schemaVersion === 'number' ? t.schemaVersion : 2;
    if (from > 5) fail('Diese Reise hat Format ' + from + ' und ist neuer als diese App-Version.');
    var c = copy(t); if (fn) fn(c);
    var upgrade = from < 5 && needsV5(c), migrated = [];
    if (upgrade) {
      var before = guestCardStatus(t, ctx);
      c.schemaVersion = 5;
      if (before.from === 'cardConfirmed' && !arr(c.guestCards).some(function (g) { return ctx && (g.scope.stayId === ctx.stayId || g.scope.offerId === ctx.offerId); })) {
        var scope = ctx && ctx.offerId ? { offerId: ctx.offerId } : { stayId: ctx.stayId };
        c.guestCards = arr(c.guestCards).concat([{ id: freeId(arr(c.guestCards), 'gcard'), cardId: ctx && ctx.cardId || null, name: (ctx && ctx.cardName || 'Gästekarte').slice(0, LIMITS.gcName), scope: scope, status: 'enthalten', evidence: { on: null, note: 'aus früherer Bestätigung übernommen' }, persons: null }]);
        migrated.push('guestCards');
      }
      if (guestCardStatus(c, ctx).status !== before.status) fail('Interner Fehler: Gästekartenstatus hätte sich beim Anheben geändert. Nichts gespeichert.');
    }
    assertNoDowngrade(from, c.schemaVersion == null ? Object.assign({}, c, { schemaVersion: 2 }) : c);
    validateV5(c);
    return { trip: c, upgrade: upgrade, from: from, migrated: migrated };
  }
  function freeId(listv, base) { var have = Object.create(null); listv.forEach(function (x) { have[x.id] = 1; }); var i = 1, id = base; while (have[id]) id = base + (++i); return id; }

  /* ---------- Ausland (M04 L1–L7) ---------- */
  function fxToEur(orig, rate) { if (rate == null || !(rate > 0) || orig == null) return null; return Math.round(cents(orig) / rate) / 100; }
  function monthsDays(a, b) { /* volle Monate und Resttage von a bis b (a ≤ b) */
    var y = +a.slice(0, 4), m = +a.slice(5, 7), d = +a.slice(8, 10), months = 0, cur = a;
    for (;;) { var nm = m + months + 1, ny = y + Math.floor((nm - 1) / 12), mm = ((nm - 1) % 12) + 1, last = new Date(Date.UTC(ny, mm, 0)).getUTCDate(); var next = ny + '-' + String(mm).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0'); if (next > b) break; months++; cur = next; }
    return { months: months, days: dayDiff(cur, b) };
  }
  function addMonths(a, n) { var y = +a.slice(0, 4), m = +a.slice(5, 7) + n, d = +a.slice(8, 10), ny = y + Math.floor((m - 1) / 12), mm = ((m - 1) % 12 + 12) % 12 + 1, last = new Date(Date.UTC(ny, mm, 0)).getUTCDate(); return ny + '-' + String(mm).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0'); }
  function spanText(md) { var p = []; if (md.months) p.push(md.months + (md.months === 1 ? ' Monat' : ' Monate')); if (md.days || !md.months) p.push(md.days + (md.days === 1 ? ' Tag' : ' Tage')); return p.join(' '); }
  /* L1–L3: minMonths = Mindestgültigkeit nach Rückkehr (Eingabe, Quelle Auswärtiges Amt), null = nicht erfasst. */
  function idDocCheck(doc, returnDate, minMonths) {
    if (!doc || !doc.validUntil) return { state: 'ungeprueft', text: 'nicht geprüft (Ablaufdatum fehlt)' };
    if (!validDate(returnDate)) return { state: 'ungeprueft', text: 'nicht geprüft (Rückkehr ohne Datum)' };
    if (doc.validUntil < returnDate) return { state: 'abgelaufen', text: 'läuft vor der Rückkehr ab (' + fmtDate(doc.validUntil) + ')' };
    var after = monthsDays(returnDate, doc.validUntil);
    if (minMonths == null) return { state: 'gueltig-ohne-regel', text: 'gültig über die Reise hinaus; Mindestgültigkeit nicht erfasst – beim Auswärtigen Amt prüfen' };
    if (doc.validUntil < addMonths(returnDate, minMonths)) return { state: 'reicht-nicht', text: 'reicht nicht (endet ' + spanText(after) + ' nach Rückkehr, verlangt ' + minMonths + (minMonths === 1 ? ' Monat' : ' Monate') + ')' };
    return { state: 'gueltig', text: 'gültig, auch mit ' + minMonths + (minMonths === 1 ? ' Monat' : ' Monaten') + ' Mindestgültigkeit' };
  }
  /* L4: Lücken der Versicherung im Reisezeitraum */
  function coverageGaps(ins, start, end) {
    if (!validDate(start) || !validDate(end)) return { state: 'ungeprueft', text: 'Reisezeitraum offen' };
    if (!ins || (!ins.from && !ins.to)) return { state: 'ungeprueft', text: 'Gültigkeit nicht erfasst' };
    var gaps = [];
    if (ins.from && ins.from > start) gaps.push({ from: start, to: ins.from < end ? addDays(ins.from, -1) : end });
    if (ins.to && ins.to < end) gaps.push({ from: ins.to >= start ? addDays(ins.to, 1) : start, to: end });
    if (!gaps.length) return { state: 'deckt', text: 'deckt den ganzen Reisezeitraum' };
    return { state: 'luecke', gaps: gaps, text: 'deckt nicht den ganzen Zeitraum (' + gaps.map(function (g) { return g.from === g.to ? 'am ' + fmtDate(g.from) : fmtDate(g.from) + '–' + fmtDate(g.to); }).join(', ') + ' nicht)' };
  }

  /* ---------- Ausgabefilter (D03, M11 Regel 1, U-R1–U-R3) ---------- */
  /* purpose: 'mappe' (alles), 'backup' (Codes nur mit opt.withSecrets), sonst 'plan' | 'share' | 'book' | 'ics' | 'template':
     keine Unterlagen, keine Ausweise, keine Versicherungen, kein Notfallblatt, keine Konto-Verknüpfungen. */
  var PURPOSES = ['mappe', 'backup', 'plan', 'share', 'book', 'ics', 'template'];
  function outputFilter(t, purpose, opt) {
    if (PURPOSES.indexOf(purpose) < 0) fail('Ausgabefilter: unbekannter Zweck.');
    var c = copy(t);
    if (purpose === 'mappe') return c;
    if (purpose === 'backup') {
      if (!(opt && opt.withSecrets)) arr(c.docs).forEach(function (d) { if (d.secret && d.secret.value != null) d.secret.value = null; });
      return c;
    }
    ['docs', 'idDocs', 'insurance', 'emergency'].forEach(function (k) { delete c[k]; });
    arr(c.party).forEach(function (p) { delete p.member; });
    return c;
  }

  return {
    SCHEMA_MAX: SCHEMA_MAX, LIMITS: LIMITS, GC_STATUS: GC_STATUS, DOC_KINDS: DOC_KINDS, PURPOSES: PURPOSES,
    FIELDS: { trip: TRIP_FIELDS, offer: OFFER_FIELDS, ledger: LEDGER_FIELDS, segment: SEG_FIELDS, party: PARTY_FIELDS, expense: EXPENSE_FIELDS, item: ITEM_FIELDS },
    needsV5: needsV5, targetVersion: targetVersion, assertNoDowngrade: assertNoDowngrade, serializeTrip5: serializeTrip5, readable: readable,
    validateV5: validateV5, partyUses: partyUses, candidate5: candidate5,
    cancelFee: cancelFee, cancelDeadlines: cancelDeadlines, payPlanSchedule: payPlanSchedule, payPlanStatus: payPlanStatus,
    offerPriceState: offerPriceState, offerFits: offerFits, comparable: comparable, budgetVerdict: budgetVerdict, budgetMax: budgetMax,
    variantConflicts: variantConflicts, guestCardStatus: guestCardStatus,
    fxToEur: fxToEur, idDocCheck: idDocCheck, coverageGaps: coverageGaps, outputFilter: outputFilter
  };
});
