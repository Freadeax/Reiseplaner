/* Reiseplaner · Drei-Wege-Abgleich einer Reise (docs/PLAN_GEMEINSAM.md §4, Stufe G1).
   Rein und ohne Seiteneffekte: merge3(basis, meine, online) führt unabhängige Änderungen zusammen und meldet nur echte
   Widersprüche. Die Prüfung des Ergebnisses (validateExtras) übernimmt der Aufrufer (app/speicher.js).

   Einheiten:
   - Oberste Felder einzeln; gekoppelte Gruppen (GROUPS) nur zusammen, damit z. B. Anreise und Nächte nie gemischt werden.
   - Listen, deren Einträge alle eine eindeutige Text-`id` haben, je Eintrag; ein Eintrag gilt als Ganzes.
   - Objekte der obersten Ebene (z. B. `check`, `ledger`, `packing`) je Schlüssel, ihre Werte als Ganzes bzw. je Eintrag.
   - Alles andere als Ganzes.
   Bei einem Widerspruch steht im Ergebnis zunächst die Online-Fassung; resolve() setzt je Punkt die gewählte Seite. */
(function (root) {
  'use strict';

  var GROUPS = [
    { key: 'zeitraum', label: 'Zeitraum', fields: ['dateMode', 'start', 'end', 'month', 'nights', 'tz'] },
    { key: 'zeiten', label: 'Abfahrt, Check-in und Check-out', fields: ['departTime', 'checkinTime', 'checkoutTime'] },
    { key: 'unterkunft', label: 'Ort und Unterkunft', fields: ['place', 'catalog', 'stayId', 'stayQuote', 'stayRef', 'activeOfferId', 'packageId'] },
    { key: 'anreise', label: 'Anreise und Fahrtkosten', fields: ['origin', 'originGeo', 'dest', 'destGeo', 'travel', 'km', 'kmSrc', 'routeKm', 'routeMin', 'routeHomeMin', 'routeAt', 'dayRoutes', 'verb', 'preis', 'ticket'] }
  ];
  var LABELS = {
    title: 'Titel', type: 'Reiseart', status: 'Status', persons: 'Personen', budget: 'Budget', food: 'Verpflegung',
    puffer: 'Puffer', online: 'Online-Suche', notes: 'Notizen', items: 'Tagesplan und Ideen', customActs: 'Eigene Unternehmungen',
    customStays: 'Eigene Unterkünfte', extraCosts: 'Zusatzkosten', customChecks: 'Eigene Checkpunkte', check: 'Checkliste',
    ledger: 'Zahlungsbuch', offers: 'Angebote', party: 'Mitreisende', expenses: 'Ausgaben', journal: 'Tagebuch', media: 'Fotos',
    books: 'Reisebücher', tasks: 'Aufgaben', legs: 'Reiseabschnitte', transport: 'Verkehrsmittel', docs: 'Unterlagen',
    guestCards: 'Gästekarten', cardConfirmed: 'Gästekarte', packing: 'Packliste', ratings: 'Bewertungen', search: 'Suche',
    searchProfiles: 'Suchprofile', deadlineAck: 'Erledigte Fristen', countries: 'Länder', idDocs: 'Ausweise', insurance: 'Versicherungen',
    emergency: 'Notfall', variant: 'Variante', assumptions: 'Annahmen', prosCons: 'Vor- und Nachteile', criteria: 'Wünsche und Grenzen'
  };
  var FIELD_TXT = { dateMode: 'Datumsart', start: 'Anreise', end: 'Abreise', month: 'Monat', nights: 'Nächte', tz: 'Zeitzone',
    departTime: 'Abfahrt', checkinTime: 'Check-in', checkoutTime: 'Check-out', place: 'Ort', stayId: 'Unterkunft', stayQuote: 'Preis Unterkunft',
    activeOfferId: 'Angebot', origin: 'Start', dest: 'Ziel', travel: 'Verkehrsmittel', km: 'km', routeKm: 'km', verb: 'Verbrauch', preis: 'Kraftstoffpreis', ticket: 'Ticket' };
  var SKIP = { id: 1, updated: 1, schemaVersion: 1 };
  var FIELD_GROUP = {};
  GROUPS.forEach(function (g) { g.fields.forEach(function (f) { FIELD_GROUP[f] = g; }); });

  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function eq(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false; return true; }
    var ka = Object.keys(a).filter(function (k) { return a[k] !== undefined; }), kb = Object.keys(b).filter(function (k) { return b[k] !== undefined; });
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) { if (!Object.prototype.hasOwnProperty.call(b, ka[j]) || !eq(a[ka[j]], b[ka[j]])) return false; }
    return true;
  }
  function copy(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }
  /* Liste mit eindeutigen Text-IDs (auch leer). */
  function idList(x) {
    if (!Array.isArray(x)) return false;
    var seen = {};
    for (var i = 0; i < x.length; i++) { var e = x[i]; if (!isObj(e) || typeof e.id !== 'string' || !e.id || seen['$' + e.id]) return false; seen['$' + e.id] = 1; }
    return true;
  }
  function byId(a) { var m = {}; (a || []).forEach(function (e) { m['$' + e.id] = e; }); return m; }
  function ids(a) { return (a || []).map(function (e) { return e.id; }); }
  function relOrder(a, b) { var inB = {}; b.forEach(function (x) { inB[x] = 1; }); return a.filter(function (x) { return inB[x]; }); }
  function nameOf(e) {
    if (!isObj(e)) return '';
    var n = e.title || e.name || e.label || e.text || e.what || e.note || '';
    return String(n).slice(0, 60);
  }
  function show(v) {
    if (v === undefined || v === null || v === '') return '(leer)';
    if (typeof v === 'boolean') return v ? 'ja' : 'nein';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v.slice(8, 10) + '.' + v.slice(5, 7) + '.' + v.slice(0, 4);
    if (typeof v === 'number' || typeof v === 'string') return String(v).slice(0, 80);
    if (Array.isArray(v)) return v.length + (v.length === 1 ? ' Eintrag' : ' Einträge');
    return nameOf(v) || 'geändert';
  }

  function Ctx() { this.conflicts = []; this.mine = 0; this.theirs = 0; }

  /* Wert als Ganzes. */
  function atom(ctx, b, m, t, info) {
    if (eq(m, t)) return { v: copy(t) };
    if (eq(b, m)) { ctx.theirs++; return { v: copy(t) }; }
    if (eq(b, t)) { ctx.mine++; return { v: copy(m) }; }
    ctx.conflicts.push(Object.assign({ mine: copy(m), theirs: copy(t), base: copy(b) }, info));
    return { v: copy(t) };
  }

  /* Liste je Eintrag (Einträge als Ganzes). */
  function list(ctx, b, m, t, path, label) {
    b = b || []; m = m || []; t = t || [];
    var B = byId(b), M = byId(m), T = byId(t), bI = ids(b), mI = ids(m), tI = ids(t);
    var mMoved = !eq(relOrder(mI, bI), relOrder(bI, mI)), tMoved = !eq(relOrder(tI, bI), relOrder(bI, tI));
    var lead = mMoved && !tMoved ? mI : tI, other = lead === mI ? tI : mI, order = lead.slice();
    other.forEach(function (id, i) {
      if (order.indexOf(id) >= 0) return;
      /* hinter den bisherigen Vorgänger, sonst vor den Nachfolger, sonst ans Ende */
      var at = -1, j, p;
      for (j = i - 1; j >= 0 && at < 0; j--) { p = order.indexOf(other[j]); if (p >= 0) { at = p + 1; while (at < order.length && !(('$' + order[at]) in B)) at++; } }
      for (j = i + 1; j < other.length && at < 0; j++) { p = order.indexOf(other[j]); if (p >= 0) at = p; }
      order.splice(at < 0 ? order.length : at, 0, id);
    });
    var out = [];
    order.forEach(function (id) {
      var k = '$' + id, inB = k in B, inM = k in M, inT = k in T;
      var info = { kind: 'entry', path: path.slice(), id: 'e:' + path.join('.') + ':' + id, entry: id, label: label, name: nameOf(M[k] || T[k] || B[k]) };
      if (inM && inT) { out.push(atom(ctx, B[k], M[k], T[k], info).v); return; }
      if (inM) {
        if (!inB) { ctx.mine++; out.push(copy(M[k])); return; }
        if (eq(B[k], M[k])) { ctx.theirs++; return; }
        ctx.conflicts.push(Object.assign(info, { what: 'online gelöscht, hier geändert', mine: copy(M[k]), theirs: undefined, base: copy(B[k]), after: prevIn(mI, id) }));
        return;
      }
      if (inT) {
        if (!inB) { ctx.theirs++; out.push(copy(T[k])); return; }
        if (eq(B[k], T[k])) { ctx.mine++; return; }
        ctx.conflicts.push(Object.assign(info, { what: 'hier gelöscht, online geändert', mine: undefined, theirs: copy(T[k]), base: copy(B[k]) }));
        out.push(copy(T[k]));
      }
    });
    if (mMoved && tMoved && !eq(relOrder(mI, tI), relOrder(tI, mI))) ctx.theirs++; /* beide umsortiert: Online-Reihenfolge gilt */
    return out;
  }
  function prevIn(arr, id) { var i = arr.indexOf(id); return i > 0 ? arr[i - 1] : null; }

  /* Ein Wert unterhalb der obersten Ebene oder ein oberstes Feld außerhalb der Gruppen. */
  function value(ctx, b, m, t, path, label, deep) {
    if (eq(m, t)) return copy(t);
    if (eq(b, m)) { ctx.theirs++; return copy(t); }
    if (eq(b, t)) { ctx.mine++; return copy(m); }
    if (idList(m) && idList(t) && (b === undefined || idList(b))) return list(ctx, b, m, t, path, label);
    if (deep && isObj(m) && isObj(t) && (b === undefined || isObj(b))) {
      var o = {}, keys = union(Object.keys(b || {}), Object.keys(m), Object.keys(t));
      keys.forEach(function (k) {
        var v = value(ctx, (b || {})[k], m[k], t[k], path.concat(k), label + ' · ' + k, false);
        if (v !== undefined) o[k] = v;
      });
      return o;
    }
    return atom(ctx, b, m, t, { kind: 'value', path: path.slice(), id: 'v:' + path.join('.'), label: label }).v;
  }
  function union() { var s = {}, out = []; for (var i = 0; i < arguments.length; i++) arguments[i].forEach(function (k) { if (!s['$' + k]) { s['$' + k] = 1; out.push(k); } }); return out; }

  /* merge3(basis, meine, online) → { result, conflicts, mine, theirs } oder { error } bei unpassenden Eingaben. */
  function merge3(base, mine, theirs) {
    if (!isObj(base) || !isObj(mine) || !isObj(theirs)) return { error: 'Keine Reise' };
    if (base.id !== mine.id || mine.id !== theirs.id) return { error: 'Reise-ID passt nicht' };
    var ctx = new Ctx(), out = {}, done = {};
    var keys = union(Object.keys(theirs), Object.keys(mine), Object.keys(base));
    GROUPS.forEach(function (g) {
      var mC = g.fields.some(function (f) { return !eq(base[f], mine[f]); }), tC = g.fields.some(function (f) { return !eq(base[f], theirs[f]); });
      var same = g.fields.every(function (f) { return eq(mine[f], theirs[f]); }), src = theirs;
      if (mC && !tC) { src = mine; ctx.mine++; } else if (tC && !mC) ctx.theirs++;
      else if (mC && tC && !same) {
        var pick = function (o) { var r = {}; g.fields.forEach(function (f) { if (o[f] !== undefined) r[f] = copy(o[f]); }); return r; };
        ctx.conflicts.push({ kind: 'group', id: 'g:' + g.key, group: g.key, label: g.label, fields: g.fields.slice(), mine: pick(mine), theirs: pick(theirs), base: pick(base) });
      }
      g.fields.forEach(function (f) { done[f] = 1; if (src[f] !== undefined) out[f] = copy(src[f]); });
    });
    keys.forEach(function (k) {
      if (done[k] || SKIP[k]) return;
      var v = value(ctx, base[k], mine[k], theirs[k], [k], LABELS[k] || k, true);
      if (v !== undefined) out[k] = v;
    });
    out.id = theirs.id;
    var sv = Math.max(Number(mine.schemaVersion) || 0, Number(theirs.schemaVersion) || 0);
    if (sv) out.schemaVersion = sv;
    var up = Math.max(Number(mine.updated) || 0, Number(theirs.updated) || 0);
    if (up) out.updated = up;
    /* Feldreihenfolge wie online, damit das Ergebnis lesbar bleibt */
    var res = {};
    union(Object.keys(theirs), Object.keys(mine)).concat(Object.keys(out)).forEach(function (k) { if (k in out && !(k in res)) res[k] = out[k]; });
    return { result: res, conflicts: ctx.conflicts, mine: ctx.mine, theirs: ctx.theirs };
  }

  function getAt(o, path) { var x = o; for (var i = 0; i < path.length; i++) { if (!isObj(x)) return undefined; x = x[path[i]]; } return x; }
  function setAt(o, path, v) {
    var x = o;
    for (var i = 0; i < path.length - 1; i++) { if (!isObj(x[path[i]])) x[path[i]] = {}; x = x[path[i]]; }
    var k = path[path.length - 1];
    if (v === undefined) delete x[k]; else x[k] = v;
  }

  /* Wahl je Widerspruch anwenden: choices = { <conflict.id>: 'mine' | 'theirs' }. Fehlende Wahl = online. */
  function resolve(result, conflicts, choices) {
    var r = copy(result);
    (conflicts || []).forEach(function (c) {
      if ((choices || {})[c.id] !== 'mine') return;
      if (c.kind === 'group') { c.fields.forEach(function (f) { if (c.mine[f] === undefined) delete r[f]; else r[f] = copy(c.mine[f]); }); return; }
      if (c.kind === 'value') { setAt(r, c.path, copy(c.mine)); return; }
      if (c.kind === 'entry') {
        var arr = getAt(r, c.path);
        if (!Array.isArray(arr)) { arr = []; setAt(r, c.path, arr); }
        var i = -1; for (var j = 0; j < arr.length; j++) if (arr[j] && arr[j].id === c.entry) { i = j; break; }
        if (c.mine === undefined) { if (i >= 0) arr.splice(i, 1); return; }
        if (i >= 0) { arr[i] = copy(c.mine); return; }
        var at = c.after ? arr.length : 0;
        if (c.after) for (var p = 0; p < arr.length; p++) if (arr[p] && arr[p].id === c.after) { at = p + 1; break; }
        arr.splice(at, 0, copy(c.mine));
      }
    });
    return r;
  }

  /* Kurzbeschreibung für die Oberfläche. */
  function describe(c) {
    if (c.kind === 'group') {
      var diff = c.fields.filter(function (f) { return !eq(c.mine[f], c.theirs[f]); });
      var txt = function (o) { return diff.map(function (f) { return (FIELD_TXT[f] ? FIELD_TXT[f] + ' ' : '') + show(o[f]); }).join(' · '); };
      return { title: c.label, mine: txt(c.mine), theirs: txt(c.theirs) };
    }
    if (c.kind === 'entry') {
      return { title: c.label + (c.name ? ': ' + c.name : ''), what: c.what || 'hier und online unterschiedlich geändert',
        mine: c.mine === undefined ? 'gelöscht' : 'geänderte Fassung', theirs: c.theirs === undefined ? 'gelöscht' : 'geänderte Fassung' };
    }
    return { title: c.label, mine: show(c.mine), theirs: show(c.theirs) };
  }

  var api = { merge3: merge3, resolve: resolve, describe: describe, GROUPS: GROUPS, LABELS: LABELS, eq: eq };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RPMerge = api;
})(typeof window !== 'undefined' ? window : null);
