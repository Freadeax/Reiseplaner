/* Reiseplaner · Rechenregeln für den Datenvertrag v3 (docs/SCHEMA_V3.md, Stand c69c6ab).
   Reine Funktionen ohne Speicherzugriff. Noch NICHT in der App verdrahtet: Format 3 bleibt gesperrt, bis der Vertrag
   gemeinsam freigegeben ist. Geld intern in Cent, nach außen Euro. Nichts wird erfunden: fehlende Preise und Zeiten
   bleiben „offen“ bzw. „ungeprüft“. UMD wie catalog.js (window.RPV3 im Browser, module.exports in Node). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RPV3 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MODES = { auto: 'Auto', bahn: 'Bahn', flug: 'Flug', bus: 'Fernbus', faehre: 'Fähre', mietwagen: 'Mietwagen', transfer: 'Transfer', taxi: 'Taxi', rad: 'Fahrrad' };
  var CAR = { auto: 1, mietwagen: 1 };
  var ID = /^[a-z][a-z0-9]{3,40}$/, DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/, IATA = /^[A-Z]{3}$/;
  /* Richtwerte, als solche benannt (SCHEMA_V3 §2, Frage 3) */
  var MIN_FLIGHT_CONNECT = 45, MIN_RAIL_CONNECT = 10, MIN_AIRPORT_BUFFER = 120;

  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var plain = function (o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; var p = Object.getPrototypeOf(o); return p === null || Object.getPrototypeOf(p) === null; };
  function fail(msg) { throw new Error(msg); }
  function onlyKeys(o, keys, what) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) < 0) fail(what + ': unbekanntes Feld „' + k + '“.'); }); }
  function validDate(s) { if (typeof s !== 'string' || !DATE.test(s)) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
  function validTz(tz) { if (typeof tz !== 'string' || !tz || tz.length > 64) return false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; } }
  function text(v, max, what, required) {
    if (v == null || v === '') { if (required) fail(what + ' fehlt.'); return ''; }
    if (typeof v !== 'string' || v.length > max) fail(what + ': höchstens ' + max + ' Zeichen.');
    return v.trim();
  }
  /* Geld: null = unbekannt, 0 = ausdrücklich kostenlos, sonst endlich mit höchstens 2 Nachkommastellen */
  function money(v, what) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1e9) fail(what + ': ungültiger Betrag.');
    if (Math.abs(Math.round(v * 100) - v * 100) > 1e-6) fail(what + ': höchstens zwei Nachkommastellen.');
    return v;
  }
  var cents = function (v) { return Math.round(v * 100); };
  var euro = function (c) { return Math.round(c) / 100; };

  /* ---------- Zeitzonen ---------- */
  function tzOffsetMin(ms, tz) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var p = {}; f.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
  }
  /* Ortszeit → Zeitpunkt (R2-1). status: 'ok' | 'incomplete' (Datum, Uhrzeit oder Zeitzone fehlt) | 'gap' (existiert wegen
     Zeitumstellung nicht) | 'ambiguous' (doppelt, ohne ausdrückliche Auflösung ungeprüft). Nur bei 'ok' gibt es ms. */
  function resolveLocal(date, time, tz) {
    if (!date || !time || !tz || !validDate(date) || !TIME.test(time) || !validTz(tz)) return { status: 'incomplete', ms: null };
    var local = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) + (+time.slice(0, 2) * 60 + +time.slice(3)) * 60000;
    var offs = [tzOffsetMin(local - 864e5, tz), tzOffsetMin(local + 864e5, tz)], hits = [];
    offs.forEach(function (o) { var u = local - o * 60000; if (tzOffsetMin(u, tz) === o && hits.indexOf(u) < 0) hits.push(u); });
    if (!hits.length) return { status: 'gap', ms: null };
    if (hits.length > 1) return { status: 'ambiguous', ms: null };
    return { status: 'ok', ms: hits[0] };
  }
  function zonedMs(date, time, tz) { return resolveLocal(date, time, tz).ms; }

  /* ---------- Anreise-Abschnitte (SCHEMA_V3 §2) ---------- */
  function point(p, what, required) {
    if (p == null) { if (required) fail(what + ' fehlt.'); return null; }
    if (!plain(p)) fail(what + ': ungültig.');
    onlyKeys(p, ['date', 'time', 'tz'], what);
    if (p.date != null && !validDate(p.date)) fail(what + ': Datum ungültig.');
    if (p.time != null && (typeof p.time !== 'string' || !TIME.test(p.time))) fail(what + ': Uhrzeit ungültig (HH:MM).');
    if (p.tz != null && !validTz(p.tz)) fail(what + ': Zeitzone unbekannt.');
    var q = { date: p.date == null ? null : p.date, time: p.time == null ? null : p.time, tz: p.tz == null ? null : p.tz };
    if (resolveLocal(q.date, q.time, q.tz).status === 'gap') fail(what + ': ' + q.time + ' Uhr gibt es am ' + q.date + ' in ' + q.tz + ' wegen der Zeitumstellung nicht.');
    return q;
  }
  function validateTransport(tr) {
    if (tr == null) return null;
    if (!plain(tr)) fail('Anreise: ungültige Struktur.');
    onlyKeys(tr, ['out', 'back'], 'Anreise');
    var ids = {}, out = {};
    var useId = function (id, what) { if (typeof id !== 'string' || !ID.test(id)) fail(what + ': ungültige ID.'); if (own(ids, id)) fail(what + ': doppelte ID.'); ids[id] = 1; return id; };
    ['out', 'back'].forEach(function (dir) {
      var list = tr[dir] == null ? [] : tr[dir];
      if (!Array.isArray(list) || list.length > 12) fail('Anreise: höchstens 12 Abschnitte je Richtung.');
      out[dir] = list.map(function (s, i) {
        var w = (dir === 'out' ? 'Hinweg' : 'Rückweg') + ' Abschnitt ' + (i + 1);
        if (!plain(s)) fail(w + ': ungültig.');
        onlyKeys(s, ['id', 'mode', 'from', 'to', 'fromCode', 'toCode', 'dep', 'arr', 'carrier', 'number', 'cost', 'per', 'km', 'addons', 'checkin'], w);
        if (typeof s.mode !== 'string' || !own(MODES, s.mode)) fail(w + ': Verkehrsmittel unbekannt.');
        var seg = { id: useId(s.id, w), mode: s.mode, from: text(s.from, 80, w + ' von'), to: text(s.to, 80, w + ' nach'),
          dep: point(s.dep, w + ' Abfahrt', false), arr: point(s.arr, w + ' Ankunft', false),
          carrier: text(s.carrier, 40, w + ' Anbieter'), number: text(s.number, 40, w + ' Nummer'),
          cost: money(s.cost, w + ' Preis'), per: s.per == null ? 'grp' : s.per, km: null, addons: [], checkin: null };
        ['fromCode', 'toCode'].forEach(function (k) {
          if (s[k] == null || s[k] === '') return;
          if (s.mode !== 'flug' || typeof s[k] !== 'string' || !IATA.test(s[k])) fail(w + ': Flughafencode nur bei Flug, drei Großbuchstaben.');
          seg[k] = s[k];
        });
        if (seg.per !== 'pp' && seg.per !== 'grp') fail(w + ': Preisbasis ungültig.');
        if (s.km != null) {
          if (!own(CAR, s.mode)) fail(w + ': Kilometer nur bei Auto oder Mietwagen.');
          if (typeof s.km !== 'number' || !isFinite(s.km) || s.km < 0 || s.km > 20000) fail(w + ': Kilometer ungültig.');
          seg.km = s.km;
        }
        var ad = s.addons == null ? [] : s.addons;
        if (!Array.isArray(ad) || ad.length > 20) fail(w + ': höchstens 20 Zusatzposten.');
        seg.addons = ad.map(function (a, j) {
          var wa = w + ' Zusatz ' + (j + 1);
          if (!plain(a)) fail(wa + ': ungültig.');
          onlyKeys(a, ['id', 'label', 'cost', 'per'], wa);
          var per = a.per == null ? 'grp' : a.per; if (per !== 'pp' && per !== 'grp') fail(wa + ': Preisbasis ungültig.');
          return { id: useId(a.id, wa), label: text(a.label, 60, wa + ' Bezeichnung', true), cost: money(a.cost, wa + ' Preis'), per: per };
        });
        if (s.checkin != null) {
          if (!plain(s.checkin)) fail(w + ': Check-in ungültig.');
          onlyKeys(s.checkin, ['opens', 'note'], w + ' Check-in');
          seg.checkin = { opens: point(s.checkin.opens, w + ' Check-in ab', false), note: text(s.checkin.note, 200, w + ' Check-in-Hinweis') };
        }
        return seg;
      });
    });
    return out;
  }

  /* Kosten nur aus eigener Grundlage des Abschnitts; kein Rückfall auf t.km (Review 2). */
  function transportCost(tr, opt) {
    opt = opt || {};
    var P = Math.max(1, Math.round(+opt.persons || 1)), verb = +opt.verb, preis = +opt.preis;
    var lines = [], open = [], total = 0;
    var add = function (key, label, c, per) {
      if (c == null) { open.push(label); lines.push({ key: key, label: label, c: null, open: true }); return; }
      var v = cents(c) * (per === 'pp' ? P : 1); total += v; lines.push({ key: key, label: label, c: euro(v), open: false });
    };
    ['out', 'back'].forEach(function (dir) {
      (tr && tr[dir] || []).forEach(function (s) {
        var label = (dir === 'out' ? 'Hin: ' : 'Rück: ') + MODES[s.mode] + (s.from || s.to ? ' ' + [s.from, s.to].filter(Boolean).join(' → ') : '');
        if (s.cost != null) add('tr:' + s.id, label, s.cost, s.per);
        else if (own(CAR, s.mode) && s.km != null && verb > 0 && preis > 0) add('tr:' + s.id, label + ' (' + s.km + ' km, Sprit geschätzt)', Math.round(s.km * verb / 100 * preis * 100) / 100, 'grp');
        else add('tr:' + s.id, label, null, s.per);
        (s.addons || []).forEach(function (a) { add('tr:' + s.id + ':' + a.id, label + ' · ' + a.label, a.cost, a.per); });
      });
    });
    return { total: euro(total), lines: lines, open: open };
  }

  /* Zeitkette je Richtung (R2-1): Prüfungen nur mit vollständigen, eindeutigen Zeitpunkten, sonst „ungeprüft“.
     Kein geratenes Datum: Folgetag/Reisebeginn nur aus eingetragenen Daten. */
  function transportTimeline(tr, opt) {
    opt = opt || {};
    var checks = [], res = {};
    var chk = function (level, dir, id, txt) { checks.push({ level: level, dir: dir, id: id, text: txt }); };
    var why = { incomplete: 'Datum, Uhrzeit oder Zeitzone fehlt', ambiguous: 'Uhrzeit wegen Zeitumstellung doppelt vorhanden', gap: 'Uhrzeit existiert nicht' };
    ['out', 'back'].forEach(function (dir) {
      var list = tr && tr[dir] || [], prev = null, prevArr = null;
      list.forEach(function (s, i) {
        var nm = (dir === 'out' ? 'Hinweg' : 'Rückweg') + ' ' + (i + 1) + ' (' + MODES[s.mode] + ')';
        var dep = s.dep ? resolveLocal(s.dep.date, s.dep.time, s.dep.tz) : { status: 'incomplete', ms: null };
        var arr = s.arr ? resolveLocal(s.arr.date, s.arr.time, s.arr.tz) : { status: 'incomplete', ms: null };
        if (dep.status !== 'ok') chk('info', dir, s.id, nm + ': Abfahrt ungeprüft (' + why[dep.status] + ').');
        if (arr.status !== 'ok') chk('info', dir, s.id, nm + ': Ankunft ungeprüft (' + why[arr.status] + ').');
        if (dep.ms != null && arr.ms != null && arr.ms < dep.ms) chk('warn', dir, s.id, nm + ': Ankunft liegt vor der Abfahrt.');
        if (s.dep && s.arr && s.dep.date && s.arr.date && s.arr.date > s.dep.date) chk('info', dir, s.id, nm + ': Ankunft am ' + (s.arr.date === nextDay(s.dep.date) ? 'Folgetag' : s.arr.date) + ' (Ortszeit laut Eingabe).');
        if (prev) {
          if (dep.ms != null && prevArr != null) {
            var gap = Math.round((dep.ms - prevArr) / 60000);
            if (gap < 0) chk('warn', dir, s.id, nm + ': startet vor Ankunft des vorherigen Abschnitts.');
            else if (s.mode === 'flug' && prev.mode === 'flug' && gap < MIN_FLIGHT_CONNECT) chk('warn', dir, s.id, nm + ': Umstieg nur ' + gap + ' Min. (unverbindlicher Richtwert ab ' + MIN_FLIGHT_CONNECT + ' Min.).');
            else if (s.mode === 'flug' && prev.mode !== 'flug' && gap < MIN_AIRPORT_BUFFER) chk('warn', dir, s.id, nm + ': nur ' + gap + ' Min. am Flughafen vor Abflug (unverbindlicher Richtwert ab ' + MIN_AIRPORT_BUFFER + ' Min.).');
            else if (s.mode === 'bahn' && prev.mode === 'bahn' && gap < MIN_RAIL_CONNECT) chk('warn', dir, s.id, nm + ': Umstieg nur ' + gap + ' Min. (unverbindlicher Richtwert ab ' + MIN_RAIL_CONNECT + ' Min.).');
          } else chk('info', dir, s.id, nm + ': Anschluss ungeprüft.');
        }
        prev = s; prevArr = arr.ms;
      });
      var last = list.length ? list[list.length - 1] : null;
      res[dir] = last && last.arr && last.arr.date ? { date: last.arr.date, time: last.arr.time, tz: last.arr.tz } : null;
    });
    if (opt.start && res.out && res.out.date > opt.start) chk('warn', 'out', null, 'Ankunft (' + res.out.date + ') liegt nach dem Reisebeginn (' + opt.start + ').');
    if (opt.end && tr && tr.back && tr.back.length && tr.back[0].dep && tr.back[0].dep.date && tr.back[0].dep.date < opt.end) chk('info', 'back', tr.back[0].id, 'Rückreise beginnt vor dem Abreisetag der Unterkunft.');
    return { arrival: res.out || null, homecoming: res.back || null, checks: checks };
  }
  function nextDay(d) { var x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); }

  /* Kalendereinträge (Zeilen je VEVENT) in UTC; ohne bekannte Zeit ganztägig mit Hinweis. */
  function transportIcs(tr, opt) {
    opt = opt || {};
    var esc = function (s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); };
    var stamp = (opt.now || new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    var utc = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); };
    var out = [];
    ['out', 'back'].forEach(function (dir) {
      (tr && tr[dir] || []).forEach(function (s) {
        var title = MODES[s.mode] + (s.number ? ' ' + s.number : '') + ': ' + [s.fromCode || s.from, s.toCode || s.to].filter(Boolean).join(' → ');
        if (!s.dep || !s.dep.date) return; /* ohne Datum kein erfundener Termin (R2-1) */
        var dep = zonedMs(s.dep.date, s.dep.time, s.dep.tz), arr = s.arr ? zonedMs(s.arr.date, s.arr.time, s.arr.tz) : null;
        var ev = ['BEGIN:VEVENT', 'UID:' + (opt.tripId || 'reise') + '-' + s.id + '@reiseplaner', 'DTSTAMP:' + stamp];
        if (dep != null) { ev.push('DTSTART:' + utc(dep)); if (arr != null && arr > dep) ev.push('DTEND:' + utc(arr)); }
        else { var d = s.dep.date.replace(/-/g, ''); ev.push('DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + nextDay(s.dep.date).replace(/-/g, '')); }
        ev.push('SUMMARY:' + esc(title), 'DESCRIPTION:' + esc((dep == null ? 'Uhrzeit, Zeitzone oder eindeutige Zeit fehlt, daher ganztägig. ' : '') + 'Planstand aus dem Reiseplaner, keine Buchungsbestätigung.'), 'END:VEVENT');
        out.push(ev);
      });
    });
    return out;
  }

  /* ---------- Storno und Erstattungen (SCHEMA_V3 §1) ---------- */
  function validateMoneyMoves(e, what) {
    if (!plain(e)) fail(what + ': ungültig.');
    var paid = e.paid == null ? 0 : e.paid;
    if (typeof paid !== 'number' || !isFinite(paid) || paid < 0 || paid > 1e9) fail(what + ': bezahlter Betrag ungültig.');
    var ids = {}, sum = 0;
    var refunds = e.refunds == null ? [] : e.refunds;
    if (!Array.isArray(refunds) || refunds.length > 50) fail(what + ': höchstens 50 Erstattungen.');
    refunds.forEach(function (r, i) {
      var w = what + ' Erstattung ' + (i + 1);
      if (!plain(r)) fail(w + ': ungültig.');
      onlyKeys(r, ['id', 'on', 'amount'], w);
      if (typeof r.id !== 'string' || !ID.test(r.id) || own(ids, r.id)) fail(w + ': ungültige oder doppelte ID.'); ids[r.id] = 1;
      if (!validDate(r.on)) fail(w + ': Datum ungültig.');
      var a = money(r.amount, w); if (a == null || a <= 0) fail(w + ': Betrag muss größer als 0 sein.');
      sum += cents(a);
    });
    if (sum > cents(paid)) fail(what + ': Erstattungen (' + euro(sum) + ' €) übersteigen das Bezahlte (' + paid + ' €).');
    if (e.cancel != null) {
      if (!plain(e.cancel)) fail(what + ': Storno ungültig.');
      onlyKeys(e.cancel, ['on', 'fee'], what + ' Storno');
      if (!validDate(e.cancel.on)) fail(what + ': Stornodatum ungültig.');
      money(e.cancel.fee, what + ' Stornogebühr');
      if (!own(e.cancel, 'fee')) fail(what + ': Stornogebühr fehlt (null = unbekannt).');
    }
    return true;
  }
  /* Rechnung je Posten. planCost = Kosten ohne Storno (gebuchter Betrag oder Planwert). */
  function cancelMath(e, planCost) {
    var paidC = cents(e && e.paid || 0), refC = (e && e.refunds || []).reduce(function (s, r) { return s + cents(r.amount); }, 0), net = paidC - refC;
    var res = { netPaid: euro(net), refundsReceived: euro(refC), cancelled: !!(e && e.cancel), unknown: false, cost: null, open: null, feeOpen: null, refundOpen: null };
    if (e && e.cancel) {
      if (e.cancel.fee == null) { res.unknown = true; return res; }
      var fee = cents(e.cancel.fee);
      res.cost = euro(fee); res.feeOpen = euro(Math.max(0, fee - net)); res.refundOpen = euro(Math.max(0, net - fee)); res.open = res.feeOpen;
      return res;
    }
    /* Ohne bekannten Plan- oder Buchungsbetrag keine Überzahlung oder Forderung ableiten (Review: planCost null/NaN/negativ) */
    if (planCost === null || planCost === undefined || typeof planCost !== 'number' || !isFinite(planCost) || planCost < 0) { res.unknown = true; return res; }
    var c = cents(planCost);
    res.cost = euro(c); res.open = euro(Math.max(0, c - net)); res.refundOpen = euro(Math.max(0, net - c));
    return res;
  }
  /* Bindet ein stornierter Posten noch? (R2-2) Frei nur bei BEKANNTER Gebühr, Gebühr offen 0 und Erstattung offen 0. */
  function cancelSettled(m) { return !!(m && m.cancelled && !m.unknown && m.feeOpen === 0 && m.refundOpen === 0); }
  /* Hinweise statt Ablehnung: Gebühr über dem bisherigen Betrag ist möglich, aber auffällig */
  function cancelWarnings(e, planCost) {
    var w = [];
    if (e && e.cancel && e.cancel.fee != null && planCost != null && cents(e.cancel.fee) > cents(planCost)) w.push('Stornogebühr (' + e.cancel.fee + ' €) liegt über dem bisherigen Betrag (' + planCost + ' €). Bitte mit der Buchungsbestätigung prüfen.');
    if (e && e.cancel && e.cancel.fee == null) w.push('Stornogebühr noch unbekannt: Der Posten ist nicht abgeschlossen.');
    return w;
  }
  /* Summen ohne Verrechnung zwischen Posten */
  function sumCancel(results) {
    var f = 0, r = 0, o = 0, u = 0, c = 0;
    results.forEach(function (x) { if (x.unknown) { u++; return; } c += cents(x.cost); o += cents(x.open || 0); if (x.cancelled) f += cents(x.feeOpen); r += cents(x.refundOpen); });
    return { cost: euro(c), open: euro(o), feeOpen: euro(f), refundOpen: euro(r), unknown: u };
  }
  /* Unterkunft: aktives Angebot (bzw. seine Gebühr) + Gebühren aller anderen stornierten Angebote (Review 1). */
  function stayAggregate(offers, activeId, totalOf) {
    var parts = [], unknown = [], c = 0;
    (offers || []).forEach(function (o) {
      var active = o.id === activeId;
      if (!active && !o.cancel) return;
      var m = cancelMath(o, active ? totalOf(o) : null);
      if (m.unknown) { unknown.push(o.id); parts.push({ id: o.id, kind: active ? 'aktiv-storniert' : 'storniert', cost: null }); return; }
      c += cents(m.cost);
      parts.push({ id: o.id, kind: o.cancel ? (active ? 'aktiv-storniert' : 'storniert') : 'aktiv', cost: m.cost, feeOpen: m.feeOpen, refundOpen: m.refundOpen, open: m.open });
    });
    return { cost: euro(c), unknown: unknown, parts: parts };
  }
  /* Wechsel weg von einem Angebot mit Verpflichtung nur zusammen mit dessen Storno (U3). */
  function canLeaveOffer(o) {
    if (!o) return { ok: true };
    var bound = !!o.booked || (+o.paid || 0) > 0 || (o.refunds && o.refunds.length);
    if (bound && !o.cancel) return { ok: false, reason: 'Das bisherige Angebot ist gebucht oder bezahlt. Bitte zuerst stornieren (Gebühr oder „unbekannt“ eintragen), dann wechseln.' };
    return { ok: true };
  }

  /* Verpflichtung wie im bestehenden Schutz der App (costEntryCommitted/commitmentIssues: gebucht, angefragt, bezahlt,
     Fälligkeit) plus Erstattungen und Storno, die selbst Historie bzw. Verpflichtung sind (Review R2). */
  function committed(e) {
    return !!e && (e.status === 'gebucht' || e.status === 'angefragt' || (+e.paid || 0) > 0 || !!e.due || !!(e.refunds && e.refunds.length) || !!e.cancel);
  }
  /* Entfernen eines Abschnitts oder Zusatzpostens (R2-4): Buchungsbuch-Historie bleibt immer erhalten (kein stilles
     Aufräumen). Gebunden (gebucht/bezahlt/erstattet) und nicht abgeschlossen storniert → blockiert. */
  function segmentRemovalCheck(ledger, segId) {
    var keys = Object.keys(ledger || {}).filter(function (k) { return k === 'tr:' + segId || k.indexOf('tr:' + segId + ':') === 0; });
    var blocking = keys.filter(function (k) {
      var e = ledger[k];
      if (!committed(e)) return false;
      return !(e.cancel && cancelSettled(cancelMath(e, null)));
    });
    return { ok: !blocking.length, keep: keys, blocking: blocking };
  }

  /* ---------- Reiseebene (R2-3) ---------- */
  var V3_FIELDS = ['transport', 'party', 'expenses', 'journal', 'ratings'];
  var V3_ENTRY = ['refunds', 'cancel', 'paidBy'];
  var nonEmpty = function (v) { return v != null && !(Array.isArray(v) && !v.length) && !(plain(v) && !Object.keys(v).length) && !(plain(v) && Array.isArray(v.out) && Array.isArray(v.back) && !v.out.length && !v.back.length && Object.keys(v).length === 2); };
  /* Braucht die Reise Format 3? Leere v3-Felder zählen nicht. */
  function needsV3(t) {
    if (!t) return false;
    if (V3_FIELDS.some(function (k) { return nonEmpty(t[k]); })) return true;
    var entries = Object.keys(t.ledger || {}).map(function (k) { return t.ledger[k]; }).concat(t.offers || []);
    return entries.some(function (e) { return e && V3_ENTRY.some(function (k) { return nonEmpty(e[k]); }); });
  }
  /* Format-2-Reisen dürfen keine (auch leeren) v3-Felder mitschreiben; Format 3 bleibt unverändert. */
  function serializeTrip(t) {
    var d = JSON.parse(JSON.stringify(t));
    if (d.schemaVersion === 3) return d;
    if (needsV3(d)) fail('Diese Reise enthält Angaben des Formats 3 und kann nicht als Format 2 gespeichert werden.');
    V3_FIELDS.forEach(function (k) { delete d[k]; });
    Object.keys(d.ledger || {}).forEach(function (k) { V3_ENTRY.forEach(function (x) { delete d.ledger[k][x]; }); });
    (d.offers || []).forEach(function (o) { V3_ENTRY.forEach(function (x) { delete o[x]; }); });
    return d;
  }
  /* Referenzen im Buchungsbuch: tr:<seg>[:<zusatz>] muss existieren – außer als Historie mit Geldbewegung oder Storno. */
  function validateReferences(t) {
    var known = {};
    ['out', 'back'].forEach(function (dir) { (t.transport && t.transport[dir] || []).forEach(function (s) { known['tr:' + s.id] = 1; (s.addons || []).forEach(function (a) { known['tr:' + s.id + ':' + a.id] = 1; }); }); });
    Object.keys(t.ledger || {}).forEach(function (k) {
      if (k.indexOf('tr:') !== 0) return;
      if (!/^tr:[a-z][a-z0-9]{3,40}(:[a-z][a-z0-9]{3,40})?$/.test(k)) fail('Buchungsbuch: ungültiger Anreise-Schlüssel.');
      var e = t.ledger[k], hist = (+e.paid || 0) > 0 || (e.refunds && e.refunds.length) || e.cancel || e.status === 'gebucht';
      if (!own(known, k) && !hist) fail('Buchungsbuch: „' + k + '“ verweist auf keinen Anreise-Abschnitt.');
    });
    return true;
  }

  return { MODES: MODES, V3_FIELDS: V3_FIELDS, needsV3: needsV3, serializeTrip: serializeTrip, validateReferences: validateReferences,
    segmentRemovalCheck: segmentRemovalCheck, committed: committed, cancelSettled: cancelSettled, cancelWarnings: cancelWarnings, resolveLocal: resolveLocal, RULES: { flightConnect: MIN_FLIGHT_CONNECT, railConnect: MIN_RAIL_CONNECT, airportBuffer: MIN_AIRPORT_BUFFER },
    validateTransport: validateTransport, transportCost: transportCost, transportTimeline: transportTimeline, transportIcs: transportIcs,
    zonedMs: zonedMs, validateMoneyMoves: validateMoneyMoves, cancelMath: cancelMath, sumCancel: sumCancel, stayAggregate: stayAggregate,
    canLeaveOffer: canLeaveOffer };
});
