/* Reiseplaner · Bearbeitungsschritte für ein Reisebuch (docs/PLAN_IOS_APP.md §7.3, Paket 6).
   Reine, deterministische Funktionen ohne Speicher-, DOM-, Uhr- oder Zufallszugriff. Grundlage ist ein Buch aus
   RPBook.draft (bookgen.js) oder ein gespeichertes Buch aus t.books.
   Ablauf: start(book, {media, now}) → Zustand; apply(zustand, schritt) → neuer Zustand; undo/redo.
   - Jeder Schritt arbeitet auf einer Kopie. Der alte Zustand bleibt unverändert (Bücher im Zustand sind eingefroren).
   - Jedes Ergebnis besteht RPV4.validateBooks([book], media) (docs/SCHEMA_V4.md §3). Scheitert die Prüfung, bleibt der
     Zustand, wie er war, und das Ergebnis nennt den Grund (ok:false, error). Nichts wird still gekürzt oder verworfen.
   - Was Fotos von einer Seite nimmt (Layout mit weniger Plätzen), braucht confirm:true. Ohne Bestätigung kommt
     code 'bestaetigen' mit den betroffenen Fotos zurück.
   - Zeitpunkt nur vom Aufrufer: schritt.at (UTC) setzt updatedAt; ohne at bleibt updatedAt unverändert.
   - touched merkt, welche Seiten (und 'buch' für Titel, Untertitel, Titelbild, Thema, Format) von Hand geändert wurden.
     Damit kann ein späteres „Neu generieren“ manuelle Änderungen erhalten (§7.3); diese Datei generiert nichts neu.
   Datenschutz wie bookgen.js: Fotos werden nur als Verweis (ID) übernommen, nie Standort, Prüfsumme, Hochlader oder
   Cloudpfad. Texte mit IBAN oder Kartennummer lehnt der Vertrag ab; weiche Hinweise (z. B. „Buchungsnummer“) stehen in
   warnings. Buchungsbuch, Angebote, Notizen und Zahlungen kennt diese Datei nicht.
   UMD wie bookgen.js: window.RPBookEdit im Browser, module.exports in Node. Braucht v4logic.js (RPV4). */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports, V4 = node ? require('./v4logic.js') : root.RPV4;
  var api = factory(V4);
  if (node) module.exports = api;
  else root.RPBookEdit = api;
})(typeof self !== 'undefined' ? self : this, function (V4) {
  'use strict';
  if (!V4) throw new Error('bookedit.js braucht v4logic.js (RPV4).');

  var HISTORY = 50;
  /* Bildplätze je Layout (Namen aus RPV4.LAYOUTS; „Doppelseite“ aus §7.3 ist noch kein Vertragslayout) */
  var SLOTS = { 'nur-text': 0, 'text-foto': 1, '1-gross': 1, '2-nebeneinander': 2, '2-gestapelt': 2, '3-mosaik': 3, '4-raster': 4, 'karte': 0 };
  var LAYOUT_NAMES = { 'nur-text': 'Nur Text', 'text-foto': 'Text und Foto', '1-gross': 'Ein großes Foto', '2-nebeneinander': 'Zwei Fotos nebeneinander',
    '2-gestapelt': 'Zwei Fotos übereinander', '3-mosaik': 'Drei Fotos als Mosaik', '4-raster': 'Vier Fotos im Raster', 'karte': 'Karte' };
  var ZOOM = { min: 1, max: 4 };
  var STAMP = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?Z$/;
  var ID = /^[a-z][a-z0-9]{3,40}$/;
  var L = V4.LIMITS;

  var own = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  var copy = function (x) { return JSON.parse(JSON.stringify(x)); };
  function freeze(o) { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(function (k) { freeze(o[k]); }); } return o; }
  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function round4(v) { return Math.round(v * 1e4) / 1e4; }
  function clean(v) { return String(v).replace(/\r\n?/g, '\n').trim(); }
  function validStamp(s) { var m = typeof s === 'string' && STAMP.exec(s); if (!m) return false; var d = new Date(m[1] + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === m[1]; }

  /* Fotos der Reise nur mit den Feldern, die der Editor braucht (kein Standort, keine Prüfsumme, kein Hochlader) */
  function mediaView(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).filter(function (m) {
      if (!m || typeof m.id !== 'string' || !ID.test(m.id) || own(seen, m.id)) return false;
      seen[m.id] = 1; return true;
    }).map(function (m) {
      var w = finite(m.w) && m.w > 0 ? m.w : null, h = finite(m.h) && m.h > 0 ? m.h : null;
      return { id: m.id, caption: typeof m.caption === 'string' ? m.caption : '', day: typeof m.day === 'string' ? m.day : null,
        fav: m.fav === true, hidden: m.hidden === true, orient: w && h ? (h > w ? 'hoch' : 'quer') : 'unbekannt' };
    });
  }

  function err(state, code, msg, extra) { var r = { ok: false, state: state, code: code, error: msg }; if (extra) Object.keys(extra).forEach(function (k) { r[k] = extra[k]; }); return r; }
  function warnings(state) {
    var out = V4.bookWarnings(state.book, state.media), count = {};
    state.book.pages.forEach(function (p) { p.slots.forEach(function (s) { if (s.mediaId !== null) count[s.mediaId] = (count[s.mediaId] || 0) + 1; }); });
    Object.keys(count).forEach(function (id) { if (count[id] > 1) out.push({ kind: 'doppelt', mediaId: id, times: count[id] }); });
    return out;
  }
  function make(book, media, past, future, touched) {
    return freeze({ book: book, media: media, past: past, future: future, touched: touched });
  }

  /* ---------- Start ---------- */
  /* opts.media: t.media der Reise (Verweise müssen auflösbar sein); opts.now: UTC-Zeitpunkt, falls das Buch noch keinen hat */
  function start(book, opts) {
    opts = opts || {};
    var media = mediaView(opts.media);
    if (opts.now != null && !validStamp(opts.now)) return err(null, 'zeit', 'Ungültiger Zeitpunkt (UTC, z. B. new Date().toISOString()).');
    var b;
    try { b = V4.normalizeBook(copy(book), { now: opts.now, media: media }); }
    catch (e) { return err(null, 'vertrag', e.message); }
    var state = make(b, freeze(media), freeze([]), freeze([]), freeze([]));
    return { ok: true, state: state, warnings: warnings(state) };
  }

  /* ---------- Hilfen für die Oberfläche ---------- */
  function pageIndex(state, id) { for (var i = 0; i < state.book.pages.length; i++) if (state.book.pages[i].id === id) return i; return -1; }
  function mediaById(state, id) { for (var i = 0; i < state.media.length; i++) if (state.media[i].id === id) return state.media[i]; return null; }

  /* Mögliche Layouts einer Seite: wie viele Fotos fielen weg, ist es erlaubt (Karte nur mit Kartenorten)? */
  function layoutChoices(state, pageId) {
    var i = pageIndex(state, pageId); if (i < 0) return [];
    var p = state.book.pages[i], filled = p.slots.filter(function (s) { return s.mediaId !== null; }).length;
    return V4.LAYOUTS.map(function (l) {
      var n = SLOTS[l], allowed = l !== 'karte' || (Array.isArray(p.map) && p.map.length > 0);
      return { layout: l, name: LAYOUT_NAMES[l] || l, slots: n, allowed: allowed, current: p.layout === l, dropsPhotos: Math.max(0, filled - n) };
    });
  }
  /* Fotos zum Tauschen: zuerst die des Seitentags (Tagesauswahl), dann Lieblingsfotos, sonst Reihenfolge der Reise.
     Ausgeblendete Fotos fehlen. used = schon irgendwo im Buch. */
  function photoChoices(state, pageId) {
    var i = pageIndex(state, pageId); if (i < 0) return [];
    var day = state.book.pages[i].day || null, used = {};
    if (state.book.cover.mediaId) used[state.book.cover.mediaId] = 1;
    state.book.pages.forEach(function (p) { p.slots.forEach(function (s) { if (s.mediaId) used[s.mediaId] = 1; }); });
    return state.media.map(function (m, n) { return { m: m, n: n }; }).filter(function (x) { return !x.m.hidden; })
      .map(function (x) { return { id: x.m.id, caption: x.m.caption, orient: x.m.orient, fav: x.m.fav, sameDay: !!day && x.m.day === day, used: own(used, x.m.id), n: x.n }; })
      .sort(function (a, b) { return (b.sameDay - a.sameDay) || (b.fav - a.fav) || a.n - b.n; })
      .map(function (x) { delete x.n; return x; });
  }
  /* Zoomstufe aus einem Ausschnitt (für den Regler); null = ganzes Bild */
  function zoomOf(crop) { return crop && crop.w > 0 ? round4(1 / Math.max(crop.w, crop.h)) : 1; }

  /* ---------- Schritte ---------- */
  function text(v, max, what, required) {
    if (typeof v !== 'string') return { error: what + ': Text fehlt.' };
    var s = clean(v);
    if (required && !s) return { error: what + ' darf nicht leer sein.' };
    if (s.length > max) return { error: what + ': höchstens ' + max + ' Zeichen (jetzt ' + s.length + ').' };
    return { value: s };
  }
  function freeId(pages) {
    var ids = {}; pages.forEach(function (p) { ids[p.id] = 1; });
    for (var n = 1; ; n++) if (!own(ids, 'pgfrei' + n)) return 'pgfrei' + n;
  }
  function emptySlot() { return { mediaId: null, crop: null, fit: 'cover' }; }

  /* Wendet einen Schritt auf eine Kopie an. Rückgabe: { ok, state, warnings, page? } oder { ok:false, state (unverändert), code, error } */
  function apply(state, op) {
    if (!state || !state.book) return err(state, 'zustand', 'Kein Reisebuch geöffnet.');
    if (!op || typeof op.type !== 'string') return err(state, 'schritt', 'Unbekannter Bearbeitungsschritt.');
    if (op.at != null && !validStamp(op.at)) return err(state, 'zeit', 'Ungültiger Zeitpunkt (UTC, z. B. new Date().toISOString()).');
    var b = copy(state.book), pages = b.pages, touched = 'buch', page = null, idx = -1;
    var needPage = function () {
      idx = pageIndex(state, op.pageId);
      if (idx < 0) return 'Diese Seite gibt es im Buch nicht (mehr).';
      page = pages[idx]; touched = page.id; return null;
    };
    var needSlot = function () {
      if (!Number.isInteger(op.slot) || op.slot < 0 || op.slot >= page.slots.length) return 'Diesen Bildplatz gibt es auf der Seite nicht.';
      return null;
    };
    var t, e, m;
    switch (op.type) {
      case 'title':
        t = text(op.text, L.title, 'Der Buchtitel', true); if (t.error) return err(state, 'text', t.error);
        b.title = t.value; break;
      case 'subtitle':
        t = text(op.text, L.subtitle, 'Der Untertitel'); if (t.error) return err(state, 'text', t.error);
        b.subtitle = t.value; break;
      case 'heading':
        if ((e = needPage())) return err(state, 'seite', e);
        t = text(op.text, L.heading, 'Die Überschrift'); if (t.error) return err(state, 'text', t.error);
        page.heading = t.value; break;
      case 'text':
        if ((e = needPage())) return err(state, 'seite', e);
        t = text(op.text, L.text, 'Der Seitentext'); if (t.error) return err(state, 'text', t.error);
        page.text = t.value; break;
      case 'caption':
        if ((e = needPage()) || (e = needSlot())) return err(state, 'seite', e);
        if (page.slots[op.slot].mediaId === null) return err(state, 'leer', 'Auf diesem Platz ist noch kein Foto.');
        t = text(op.text, L.caption, 'Die Bildunterschrift'); if (t.error) return err(state, 'text', t.error);
        page.slots[op.slot].caption = t.value; break;
      case 'move': {
        if ((e = needPage())) return err(state, 'seite', e);
        var to = Number.isInteger(op.to) ? op.to : Number.isInteger(op.by) ? idx + op.by : NaN;
        if (!Number.isInteger(to)) return err(state, 'schritt', 'Ziel der Verschiebung fehlt.');
        to = Math.max(0, Math.min(pages.length - 1, to));
        if (to === idx) return err(state, 'rand', idx === 0 ? 'Die Seite steht schon am Anfang.' : 'Die Seite steht schon am Ende.');
        pages.splice(to, 0, pages.splice(idx, 1)[0]); break;
      }
      case 'delete':
        if ((e = needPage())) return err(state, 'seite', e);
        if (pages.length <= 1) return err(state, 'letzte', 'Ein Reisebuch braucht mindestens eine Seite.');
        pages.splice(idx, 1); break;
      case 'insert': {
        if (pages.length >= L.pages) return err(state, 'grenze', 'Höchstens ' + L.pages + ' Seiten je Buch.');
        var layout = op.layout == null ? 'nur-text' : op.layout;
        if (!own(SLOTS, layout) || V4.LAYOUTS.indexOf(layout) < 0) return err(state, 'layout', 'Unbekanntes Layout.');
        if (layout === 'karte') return err(state, 'layout', 'Eine Kartenseite braucht geplante Orte und entsteht nur im Entwurf.');
        var at;
        if (Number.isInteger(op.index)) at = Math.max(0, Math.min(pages.length, op.index));
        else if (op.after != null) { var ai = pageIndex(state, op.after); if (ai < 0) return err(state, 'seite', 'Diese Seite gibt es im Buch nicht (mehr).'); at = ai + 1; }
        else at = pages.length;
        var h = text(op.heading == null ? '' : op.heading, L.heading, 'Die Überschrift'); if (h.error) return err(state, 'text', h.error);
        var x = text(op.text == null ? '' : op.text, L.text, 'Der Seitentext'); if (x.error) return err(state, 'text', x.error);
        page = { id: freeId(pages), kind: 'frei', layout: layout, slots: [], heading: h.value, sub: '', text: x.value, items: [] };
        for (var k = 0; k < SLOTS[layout]; k++) page.slots.push(emptySlot());
        pages.splice(at, 0, page); touched = page.id; break;
      }
      case 'layout': {
        if ((e = needPage())) return err(state, 'seite', e);
        var nl = op.layout;
        if (!own(SLOTS, nl) || V4.LAYOUTS.indexOf(nl) < 0) return err(state, 'layout', 'Unbekanntes Layout.');
        if (nl === page.layout) return err(state, 'gleich', 'Die Seite hat dieses Layout schon.');
        if (nl === 'karte' && !(Array.isArray(page.map) && page.map.length)) return err(state, 'layout', 'Das Kartenlayout geht nur auf einer Seite mit geplanten Orten.');
        var n = SLOTS[nl];
        /* Fotos rücken nach vorn, leere Plätze fallen zuerst weg; die Reihenfolge der Fotos bleibt */
        var filled = page.slots.filter(function (s) { return s.mediaId !== null; }), empty = page.slots.filter(function (s) { return s.mediaId === null; });
        var drop = filled.slice(n);
        if (drop.length && op.confirm !== true) {
          return err(state, 'bestaetigen', 'Mit „' + LAYOUT_NAMES[nl] + '“ ' + (drop.length === 1 ? 'fällt ein Foto' : 'fallen ' + drop.length + ' Fotos') +
            ' von dieser Seite. Bestätigen oder ein Layout mit mehr Plätzen wählen. Rückgängig ist möglich.', { photos: drop.map(function (s) { return s.mediaId; }) });
        }
        var slots = filled.concat(empty).slice(0, n);
        while (slots.length < n) slots.push(emptySlot());
        page.slots = slots; page.layout = nl; break;
      }
      case 'photo': {
        if ((e = needPage()) || (e = needSlot())) return err(state, 'seite', e);
        var sl = page.slots[op.slot];
        if (op.mediaId === null) { page.slots[op.slot] = { mediaId: null, crop: null, fit: sl.fit }; break; }
        m = mediaById(state, op.mediaId);
        if (!m) return err(state, 'foto', 'Dieses Foto gibt es in der Reise nicht.');
        if (m.hidden) return err(state, 'ausgeblendet', 'Dieses Foto ist ausgeblendet. Erst wieder einblenden, dann ins Buch übernehmen.');
        if (sl.mediaId === m.id) return err(state, 'gleich', 'Dieses Foto steht schon auf dem Platz.');
        /* Bildunterschrift gehört zum Foto: neues Foto bringt seine eigene mit, Ausschnitt wieder ganzes Bild */
        page.slots[op.slot] = { mediaId: m.id, crop: null, fit: sl.fit, caption: m.caption.slice(0, L.caption) };
        break;
      }
      case 'zoom': {
        if ((e = needPage()) || (e = needSlot())) return err(state, 'seite', e);
        var s2 = page.slots[op.slot];
        if (s2.mediaId === null) return err(state, 'leer', 'Auf diesem Platz ist noch kein Foto.');
        if (!finite(op.zoom) || op.zoom < ZOOM.min || op.zoom > ZOOM.max) return err(state, 'zoom', 'Zoom zwischen ' + ZOOM.min + ' und ' + ZOOM.max + '.');
        var cx = op.x == null ? 0.5 : op.x, cy = op.y == null ? 0.5 : op.y;
        if (!finite(cx) || !finite(cy) || cx < 0 || cx > 1 || cy < 0 || cy > 1) return err(state, 'zoom', 'Bildmitte muss zwischen 0 und 1 liegen.');
        if (op.zoom === 1) s2.crop = null;
        else {
          var w = round4(1 / op.zoom);
          s2.crop = { x: Math.min(round4(Math.max(0, cx - w / 2)), round4(1 - w)), y: Math.min(round4(Math.max(0, cy - w / 2)), round4(1 - w)), w: w, h: w };
        }
        break;
      }
      case 'cover':
        if (op.mediaId !== null) {
          m = mediaById(state, op.mediaId);
          if (!m) return err(state, 'foto', 'Dieses Foto gibt es in der Reise nicht.');
          if (m.hidden) return err(state, 'ausgeblendet', 'Dieses Foto ist ausgeblendet. Erst wieder einblenden, dann ins Buch übernehmen.');
        }
        b.cover = { mediaId: op.mediaId }; break;
      case 'theme':
        if (typeof op.theme !== 'string') return err(state, 'schritt', 'Gestaltung fehlt.');
        b.theme = op.theme; break;
      case 'format':
        b.format = op.format; break;
      default:
        return err(state, 'schritt', 'Unbekannter Bearbeitungsschritt.');
    }
    if (op.at != null) b.updatedAt = op.at;
    try { V4.validateBooks([b], state.media); } catch (x2) { return err(state, 'vertrag', x2.message); }
    var tl = state.touched.indexOf(touched) < 0 ? state.touched.concat([touched]) : state.touched.slice();
    var past = state.past.concat([{ book: state.book, touched: state.touched }]);
    if (past.length > HISTORY) past = past.slice(past.length - HISTORY);
    var next = make(freeze(b), state.media, freeze(past), freeze([]), freeze(tl));
    return { ok: true, state: next, warnings: warnings(next), page: touched === 'buch' ? null : touched };
  }

  /* Rückgängig und Wiederholen über die gespeicherten Stände (höchstens HISTORY Schritte) */
  function undo(state) {
    if (!state || !state.past.length) return err(state, 'nichts', 'Es gibt nichts rückgängig zu machen.');
    var prev = state.past[state.past.length - 1];
    var next = make(prev.book, state.media, freeze(state.past.slice(0, -1)), freeze([{ book: state.book, touched: state.touched }].concat(state.future)), prev.touched);
    return { ok: true, state: next, warnings: warnings(next) };
  }
  function redo(state) {
    if (!state || !state.future.length) return err(state, 'nichts', 'Es gibt nichts zu wiederholen.');
    var nx = state.future[0];
    var next = make(nx.book, state.media, freeze(state.past.concat([{ book: state.book, touched: state.touched }])), freeze(state.future.slice(1)), nx.touched);
    return { ok: true, state: next, warnings: warnings(next) };
  }
  function canUndo(state) { return !!(state && state.past.length); }
  function canRedo(state) { return !!(state && state.future.length); }

  return { HISTORY: HISTORY, SLOTS: SLOTS, LAYOUT_NAMES: LAYOUT_NAMES, ZOOM: ZOOM,
    start: start, apply: apply, undo: undo, redo: redo, canUndo: canUndo, canRedo: canRedo,
    layoutChoices: layoutChoices, photoChoices: photoChoices, zoomOf: zoomOf, pageIndex: pageIndex };
});
