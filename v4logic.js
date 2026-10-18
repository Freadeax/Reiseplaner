/* Reiseplaner · Regeln für den Datenvertrag v4: Fotos (t.media) und Reisebücher (t.books), docs/SCHEMA_V4.md.
   Reine Funktionen ohne Speicher-, DOM-, Datei- oder App-Zugriff. Noch NICHT in der App verdrahtet und ohne
   Datenbankmigration: Format 4 bleibt gesperrt, bis der Vertrag freigegeben ist.
   Fotos stehen nie in der Reise-JSON, nur ihre Beschreibung und Verweise. Die Bilddateien liegen getrennt
   (IndexedDB/App-Container, im Export unter media/<id>.jpg und thumbs/<id>.jpg).
   UMD wie v3logic.js: window.RPV4 im Browser, module.exports in Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RPV4 = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Grenzen (SCHEMA_V4 §4). media/books halten die Reise klein: ein Medieneintrag hat etwa 300 Byte,
     2000 Einträge also rund 0,6 MB JSON. Die Bilddateien zählen hier nicht mit. */
  var LIMITS = Object.freeze({
    media: 2000, caption: 500, side: 20000, bytes: 25 * 1024 * 1024,
    books: 20, title: 120, subtitle: 200, pages: 200, slots: 12, text: 2000, rule: 40,
    heading: 120, sub: 200, items: 100, itemLabel: 200, itemValue: 80, itemTitle: 120, glyphs: 10, map: 50, mapLabel: 80,
    archiveEntries: 2 * 2000 * 20 + 2
  });
  var KINDS = ['photo'];
  var CLOUD = ['none', 'queued', 'done', 'error'];
  var FORMATS = ['a5-quer', 'a4-hoch', 'quadrat-21'];
  var FITS = ['cover', 'contain'];
  var MEDIA_KEYS = ['id', 'kind', 'takenAt', 'lat', 'lon', 'w', 'h', 'bytes', 'sha256', 'caption', 'day', 'actId', 'spotId', 'by', 'fav', 'hidden', 'cloud'];
  var BOOK_KEYS = ['id', 'title', 'subtitle', 'theme', 'format', 'cover', 'pages', 'draft', 'updatedAt'];
  var PAGE_KEYS = ['id', 'kind', 'layout', 'slots', 'heading', 'sub', 'text', 'items', 'map', 'day'];
  var SLOT_KEYS = ['mediaId', 'crop', 'fit', 'caption'];
  /* Seitenarten und Layouts des Erstentwurfs (bookgen.js, Regel bookgen-1); „frei“ für selbst angelegte Seiten. */
  var PAGE_KINDS = ['titel', 'uebersicht', 'tag', 'weitere', 'highlights', 'zahlen', 'schluss', 'frei'];
  var LAYOUTS = ['nur-text', 'text-foto', '1-gross', '2-nebeneinander', '2-gestapelt', '3-mosaik', '4-raster', 'karte'];
  var ITEM_KINDS = ['fakt', 'stimmung', 'eintrag', 'bewertung', 'plan'];
  var ITEM_KEYS = ['kind', 'label', 'value', 'title', 'text', 'actId', 'stars', 'glyphs'];

  var ID = /^[a-z][a-z0-9]{3,40}$/, DATE = /^\d{4}-\d{2}-\d{2}$/, INDEX = /^d(0|[1-9]\d{0,3})$/;
  var SHA = /^[0-9a-f]{64}$/, ACT = /^[A-Za-z0-9_-]{1,60}$/, SPOT = /^[a-z0-9][a-z0-9-]{0,79}$/, NAME = /^[a-z][a-z0-9-]{1,39}$/;
  /* Aufnahmezeit aus EXIF: Ortszeit, Zeitzone oft unbekannt. Ohne Versatz ist sie kein Zeitpunkt, nur eine Ortszeit. */
  var TAKEN = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?(Z|[+-](0\d|1[0-4]):[0-5]\d)?$/;
  /* Maschinenzeitstempel (Entwurf erzeugt, zuletzt geändert): immer UTC */
  var STAMP = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{3})?Z$/;
  var RESERVED = ['__proto__', 'constructor', 'prototype'];

  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var plain = function (o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; var p = Object.getPrototypeOf(o); return p === null || Object.getPrototypeOf(p) === null; };
  var copy = function (x) { return JSON.parse(JSON.stringify(x)); };
  function fail(msg) { throw new Error(msg); }
  function onlyKeys(o, keys, what) { Object.keys(o).forEach(function (k) { if (keys.indexOf(k) < 0) fail(what + ': unbekanntes Feld „' + String(k).slice(0, 30) + '“.'); }); }
  function validDate(s) { if (typeof s !== 'string' || !DATE.test(s)) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
  function dayKey(v) { return typeof v === 'string' && (validDate(v) || INDEX.test(v)); }
  function stamp(v) { var m = typeof v === 'string' && STAMP.exec(v); return !!m && validDate(m[1]); }
  function int(v, min, max) { return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max; }
  function num(v, min, max) { return typeof v === 'number' && isFinite(v) && v >= min && v <= max; }
  function str(v, max, what, required) {
    if (v == null || v === '') { if (required) fail(what + ' fehlt.'); return; }
    if (typeof v !== 'string') fail(what + ': muss Text sein.');
    if (v.length > max) fail(what + ': höchstens ' + max + ' Zeichen.');
  }
  function useId(seen, id, what) {
    if (typeof id !== 'string' || !ID.test(id)) fail(what + ': ungültige ID.');
    if (own(seen, id)) fail(what + ': doppelte ID „' + id + '“.');
    seen[id] = 1;
  }

  /* ---------- Zahlungsdetails und Buchungsnummern (SCHEMA_V4 §3.3) ---------- */
  function ibanOk(raw) {
    var s = raw.replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
    var r = s.slice(4) + s.slice(0, 4), rest = 0;
    for (var i = 0; i < r.length; i++) {
      var c = r.charCodeAt(i), d = c >= 65 ? String(c - 55) : r[i];
      for (var j = 0; j < d.length; j++) rest = (rest * 10 + +d[j]) % 97;
    }
    return rest === 1;
  }
  function luhnOk(digits) {
    var sum = 0, alt = false;
    for (var i = digits.length - 1; i >= 0; i--) { var n = +digits[i]; if (alt) { n *= 2; if (n > 9) n -= 9; } sum += n; alt = !alt; }
    return sum % 10 === 0;
  }
  /* Harte Treffer: eine gültige IBAN oder eine Kartennummer (13–19 Ziffern mit Luhn-Prüfung). In einem Reisebuch gibt
     es dafür keinen Grund; validateBooks lehnt sie ab. */
  function paymentDetails(s) {
    var hits = [];
    if (typeof s !== 'string' || !s) return hits;
    /* Der Treffer kann in folgende Wörter hineinreichen; deshalb von hinten Wortgruppen abnehmen, bis die Prüfziffer passt. */
    (s.match(/\b[A-Za-z]{2}\d{2}(?:[ ]?[A-Za-z0-9]){11,30}\b/g) || []).forEach(function (m) {
      var parts = m.split(' ');
      for (var n = parts.length; n >= 1; n--) if (ibanOk(parts.slice(0, n).join(' '))) { hits.push('iban'); return; }
    });
    /* Kartennummern nur in typischer Form (Vierergruppen oder 13–19 Ziffern am Stück ab 3–6), damit Telefonnummern
       nicht zufällig über die Luhn-Prüfung abgelehnt werden. */
    (s.match(/\b(?:\d{4}[ -]){3}\d{1,7}\b|\b[3-6]\d{12,18}\b/g) || []).forEach(function (m) { var d = m.replace(/\D/g, ''); if (d.length >= 13 && d.length <= 19 && luhnOk(d)) hits.push('karte'); });
    return hits;
  }
  /* Weiche Treffer: Hinweiswörter auf Buchungs- oder Zahlungsangaben. Die Nummer selbst ist nicht erkennbar, deshalb
     nur ein Hinweis vor dem Teilen oder Exportieren, keine Ablehnung (eigener Text der Nutzer). */
  var HINTS = [
    { kind: 'buchungsnummer', re: /(buchungs|reservierungs|bestätigungs|bestaetigungs|auftrags|vorgangs|rechnungs)[\s-]*(nummer|nr\b|nr\.|code|kennung)|booking\s*(ref|reference|number|no\b|code)|confirmation\s*(number|code)|\bPNR\b|ticket[\s-]*(nummer|nr\b|nr\.|number)/i },
    { kind: 'zahlung', re: /\b(iban|bic|swift|cvv|cvc|kartennummer|kreditkartennummer|card\s*number|pin)\b/i }
  ];
  function bookTexts(b) {
    var out = [{ field: 'title', text: b && b.title }, { field: 'subtitle', text: b && b.subtitle }];
    (b && Array.isArray(b.pages) ? b.pages : []).forEach(function (p, i) {
      if (!p) return;
      var at = 'pages[' + i + ']';
      ['heading', 'sub', 'text'].forEach(function (k) { out.push({ field: at + '.' + k, text: p[k] }); });
      (Array.isArray(p.slots) ? p.slots : []).forEach(function (s, j) { out.push({ field: at + '.slots[' + j + '].caption', text: s && s.caption }); });
      (Array.isArray(p.items) ? p.items : []).forEach(function (it, j) { ['label', 'value', 'title', 'text'].forEach(function (k) { out.push({ field: at + '.items[' + j + '].' + k, text: it && it[k] }); }); });
      (Array.isArray(p.map) ? p.map : []).forEach(function (m, j) { out.push({ field: at + '.map[' + j + '].label', text: m && m.label }); });
    });
    return out.filter(function (x) { return typeof x.text === 'string' && x.text; });
  }
  /* Alle Treffer eines Buchs als [{field, kind, hard}]; hard = würde von validateBooks abgelehnt. */
  function privacyFindings(b) {
    var out = [];
    bookTexts(b).forEach(function (x) {
      paymentDetails(x.text).forEach(function (k) { out.push({ field: x.field, kind: k, hard: true }); });
      HINTS.forEach(function (h) { if (h.re.test(x.text)) out.push({ field: x.field, kind: h.kind, hard: false }); });
    });
    return out;
  }

  /* ---------- Fotos (SCHEMA_V4 §2) ---------- */
  function validateMediaEntry(m, what) {
    if (!plain(m)) fail(what + ': ungültiger Eintrag.');
    onlyKeys(m, MEDIA_KEYS, what);
    if (KINDS.indexOf(m.kind) < 0) fail(what + ': Art muss „photo“ sein.');
    if (m.takenAt !== null) { var t = typeof m.takenAt === 'string' && TAKEN.exec(m.takenAt); if (!t || !validDate(t[1])) fail(what + ': Aufnahmezeit ungültig (ISO 8601 oder null).'); }
    if (own(m, 'lat') !== own(m, 'lon')) fail(what + ': Breite und Länge nur gemeinsam.');
    if (own(m, 'lat') && (!num(m.lat, -90, 90) || !num(m.lon, -180, 180))) fail(what + ': Koordinaten ungültig.');
    if (!int(m.w, 1, LIMITS.side) || !int(m.h, 1, LIMITS.side)) fail(what + ': Bildgröße ungültig (1–' + LIMITS.side + ' px).');
    if (!int(m.bytes, 1, LIMITS.bytes)) fail(what + ': Dateigröße ungültig (höchstens 25 MB).');
    if (typeof m.sha256 !== 'string' || !SHA.test(m.sha256)) fail(what + ': Prüfsumme ungültig (64 Hexzeichen, klein).');
    if (typeof m.caption !== 'string') fail(what + ': Bildunterschrift fehlt (leerer Text erlaubt).');
    if (m.caption.length > LIMITS.caption) fail(what + ': Bildunterschrift höchstens ' + LIMITS.caption + ' Zeichen.');
    if (m.day !== null && !dayKey(m.day)) fail(what + ': Tag muss JJJJ-MM-TT, d<Index> oder null sein.');
    if (own(m, 'actId') && (typeof m.actId !== 'string' || !ACT.test(m.actId) || RESERVED.indexOf(m.actId) >= 0)) fail(what + ': ungültige Unternehmung.');
    if (own(m, 'spotId') && (typeof m.spotId !== 'string' || !SPOT.test(m.spotId))) fail(what + ': ungültige Katalog-Attraktion.');
    if (own(m, 'by') && (typeof m.by !== 'string' || !ID.test(m.by))) fail(what + ': ungültige Person.');
    if (typeof m.fav !== 'boolean' || typeof m.hidden !== 'boolean') fail(what + ': fav und hidden müssen true oder false sein.');
    var c = m.cloud;
    if (!plain(c)) fail(what + ': Cloud-Zustand fehlt.');
    onlyKeys(c, ['state', 'path'], what + ' Cloud');
    if (CLOUD.indexOf(c.state) < 0) fail(what + ': Cloud-Zustand unbekannt.');
    if (own(c, 'path')) {
      if (c.state !== 'done') fail(what + ': Cloud-Pfad nur im Zustand „done“.');
      if (typeof c.path !== 'string' || !/^[A-Za-z0-9_-]{1,64}\/[a-z][a-z0-9]{3,40}\.jpg$/.test(c.path) || c.path.split('/')[1] !== m.id + '.jpg') fail(what + ': Cloud-Pfad muss <Reise>/<Foto-ID>.jpg sein.');
    } else if (c.state === 'done') fail(what + ': Zustand „done“ braucht den Cloud-Pfad.');
    return true;
  }
  function validateMedia(list) {
    if (list == null) return true;
    if (!Array.isArray(list)) fail('Fotos: ungültige Liste.');
    if (list.length > LIMITS.media) fail('Fotos: höchstens ' + LIMITS.media + ' je Reise.');
    var ids = {}, sums = {};
    list.forEach(function (m, i) {
      var what = 'Foto ' + (i + 1);
      if (!plain(m)) fail(what + ': ungültiger Eintrag.');
      useId(ids, m.id, what);
      validateMediaEntry(m, what);
      /* Prüfsumme verhindert doppelte Importe derselben Arbeitskopie in eine Reise */
      if (own(sums, m.sha256)) fail(what + ': dasselbe Bild ist schon als „' + sums[m.sha256] + '“ in der Reise.');
      sums[m.sha256] = m.id;
    });
    return true;
  }
  /* Neue Einträge (Import aus Kamera/Datei): Standardwerte ergänzen, Text kürzen nur an den Rändern. Gespeicherte Daten
     laufen nie hierdurch, sondern nur durch validateMedia (nichts wird still umgeschrieben). */
  function normalizeMedia(input) {
    if (!plain(input)) fail('Foto: ungültige Eingabe.');
    var m = {
      id: input.id, kind: input.kind == null ? 'photo' : input.kind,
      takenAt: input.takenAt == null || input.takenAt === '' ? null : input.takenAt,
      w: input.w, h: input.h, bytes: input.bytes,
      sha256: typeof input.sha256 === 'string' ? input.sha256.toLowerCase() : input.sha256,
      caption: typeof input.caption === 'string' ? input.caption.trim() : (input.caption == null ? '' : input.caption),
      day: input.day == null || input.day === '' ? null : input.day,
      fav: input.fav == null ? false : input.fav, hidden: input.hidden == null ? false : input.hidden,
      cloud: input.cloud == null ? { state: 'none' } : copy(input.cloud)
    };
    ['lat', 'lon', 'actId', 'spotId', 'by'].forEach(function (k) { if (input[k] != null && input[k] !== '') m[k] = input[k]; });
    Object.keys(input).forEach(function (k) { if (MEDIA_KEYS.indexOf(k) < 0) fail('Foto: unbekanntes Feld „' + String(k).slice(0, 30) + '“.'); });
    if (typeof m.id !== 'string' || !ID.test(m.id)) fail('Foto: ungültige ID.');
    validateMediaEntry(m, 'Foto');
    return m;
  }
  /* Für geteilte oder exportierte Reisebücher: Standort entfernen (PLAN_IOS_APP §6.3). Gibt Kopien zurück. */
  function stripLocation(list) {
    return (list || []).map(function (m) { var c = copy(m); delete c.lat; delete c.lon; return c; });
  }

  /* ---------- Reisebücher (SCHEMA_V4 §3) ---------- */
  function validateCrop(c, what) {
    if (c === null) return;
    if (!plain(c)) fail(what + ': Ausschnitt ungültig.');
    onlyKeys(c, ['x', 'y', 'w', 'h'], what + ' Ausschnitt');
    if (!num(c.x, 0, 1) || !num(c.y, 0, 1) || !num(c.w, 0, 1) || !num(c.h, 0, 1) || c.w <= 0 || c.h <= 0) fail(what + ': Ausschnitt muss Anteile zwischen 0 und 1 haben.');
    if (c.x + c.w > 1 + 1e-9 || c.y + c.h > 1 + 1e-9) fail(what + ': Ausschnitt ragt über das Bild hinaus.');
  }
  function validateBook(b, what, mediaIds) {
    if (!plain(b)) fail(what + ': ungültiger Eintrag.');
    onlyKeys(b, BOOK_KEYS, what);
    str(b.title, LIMITS.title, what + ' Titel', true);
    if (!b.title.trim()) fail(what + ' Titel fehlt.');
    if (typeof b.subtitle !== 'string') fail(what + ': Untertitel fehlt (leerer Text erlaubt).');
    str(b.subtitle, LIMITS.subtitle, what + ' Untertitel');
    if (typeof b.theme !== 'string' || !NAME.test(b.theme)) fail(what + ': Gestaltung ungültig.');
    if (FORMATS.indexOf(b.format) < 0) fail(what + ': Format muss a5-quer, a4-hoch oder quadrat-21 sein.');
    if (!plain(b.cover)) fail(what + ': Titelbild fehlt (mediaId darf null sein).');
    onlyKeys(b.cover, ['mediaId'], what + ' Titelbild');
    var ref = function (id, w) {
      if (id === null) return;
      if (typeof id !== 'string' || !ID.test(id)) fail(w + ': ungültiger Fotoverweis.');
      if (mediaIds && !own(mediaIds, id)) fail(w + ': Foto „' + id + '“ gibt es in dieser Reise nicht.');
    };
    if (!own(b.cover, 'mediaId')) fail(what + ': Titelbild fehlt (mediaId darf null sein).');
    ref(b.cover.mediaId, what + ' Titelbild');
    if (!Array.isArray(b.pages)) fail(what + ': Seitenliste fehlt.');
    if (b.pages.length > LIMITS.pages) fail(what + ': höchstens ' + LIMITS.pages + ' Seiten.');
    var pageIds = {};
    b.pages.forEach(function (p, i) {
      var w = what + ' Seite ' + (i + 1);
      if (!plain(p)) fail(w + ': ungültig.');
      onlyKeys(p, PAGE_KEYS, w);
      useId(pageIds, p.id, w);
      if (own(p, 'kind') && PAGE_KINDS.indexOf(p.kind) < 0) fail(w + ': Seitenart unbekannt.');
      if (LAYOUTS.indexOf(p.layout) < 0) fail(w + ': Layout unbekannt.');
      if (own(p, 'heading')) str(p.heading, LIMITS.heading, w + ' Überschrift');
      if (own(p, 'sub')) str(p.sub, LIMITS.sub, w + ' Unterzeile');
      if (own(p, 'items')) {
        if (!Array.isArray(p.items) || p.items.length > LIMITS.items) fail(w + ': höchstens ' + LIMITS.items + ' Angaben.');
        p.items.forEach(function (it, j) {
          var wi = w + ' Angabe ' + (j + 1);
          if (!plain(it)) fail(wi + ': ungültig.');
          onlyKeys(it, ITEM_KEYS, wi);
          if (ITEM_KINDS.indexOf(it.kind) < 0) fail(wi + ': Art unbekannt.');
          if (own(it, 'label')) str(it.label, LIMITS.itemLabel, wi + ' Bezeichnung');
          if (own(it, 'value')) str(it.value, LIMITS.itemValue, wi + ' Wert');
          if (own(it, 'title')) str(it.title, LIMITS.itemTitle, wi + ' Titel');
          if (own(it, 'text')) str(it.text, LIMITS.text, wi + ' Text');
          if (own(it, 'glyphs')) str(it.glyphs, LIMITS.glyphs, wi + ' Sternzeichen');
          if (own(it, 'actId') && (typeof it.actId !== 'string' || !ACT.test(it.actId) || RESERVED.indexOf(it.actId) >= 0)) fail(wi + ': ungültige Unternehmung.');
          if (own(it, 'stars') && !int(it.stars, 1, 5)) fail(wi + ': Sterne müssen eine ganze Zahl von 1 bis 5 sein.');
        });
      }
      /* Karte: geplante Orte aus Plan/Katalog, keine Fotostandorte; stripLocation betrifft sie deshalb nicht (SCHEMA_V4 §3.1). */
      if (own(p, 'map')) {
        if (!Array.isArray(p.map) || p.map.length > LIMITS.map) fail(w + ': höchstens ' + LIMITS.map + ' Kartenorte.');
        p.map.forEach(function (m, j) {
          var wm = w + ' Kartenort ' + (j + 1);
          if (!plain(m)) fail(wm + ': ungültig.');
          onlyKeys(m, ['label', 'lat', 'lon'], wm);
          if (typeof m.label !== 'string') fail(wm + ': Bezeichnung fehlt (leerer Text erlaubt).');
          str(m.label, LIMITS.mapLabel, wm + ' Bezeichnung');
          if (!num(m.lat, -90, 90) || !num(m.lon, -180, 180)) fail(wm + ': Koordinaten ungültig.');
        });
      }
      if (!Array.isArray(p.slots) || p.slots.length > LIMITS.slots) fail(w + ': höchstens ' + LIMITS.slots + ' Bildplätze.');
      p.slots.forEach(function (s, j) {
        var ws = w + ' Platz ' + (j + 1);
        if (!plain(s)) fail(ws + ': ungültig.');
        onlyKeys(s, SLOT_KEYS, ws);
        if (!own(s, 'mediaId')) fail(ws + ': Fotoverweis fehlt (null erlaubt).');
        ref(s.mediaId, ws);
        if (!own(s, 'crop')) fail(ws + ': Ausschnitt fehlt (null = ganzes Bild).');
        validateCrop(s.crop, ws);
        if (FITS.indexOf(s.fit) < 0) fail(ws + ': Einpassung muss cover oder contain sein.');
        if (own(s, 'caption')) str(s.caption, LIMITS.caption, ws + ' Bildunterschrift');
      });
      if (typeof p.text !== 'string') fail(w + ': Text fehlt (leerer Text erlaubt).');
      if (p.text.length > LIMITS.text) fail(w + ': Text höchstens ' + LIMITS.text + ' Zeichen.');
      if (own(p, 'day') && p.day !== null && !dayKey(p.day)) fail(w + ': Tag muss JJJJ-MM-TT, d<Index> oder null sein.');
    });
    if (b.draft !== null) {
      if (!plain(b.draft)) fail(what + ': Entwurfsangabe ungültig.');
      onlyKeys(b.draft, ['rule', 'at'], what + ' Entwurf');
      if (typeof b.draft.rule !== 'string' || !NAME.test(b.draft.rule) || b.draft.rule.length > LIMITS.rule) fail(what + ': Entwurfsregel ungültig.');
      if (b.draft.at !== null && !stamp(b.draft.at)) fail(what + ': Entwurfszeit ungültig (UTC, ISO 8601 oder null).');
    }
    if (!stamp(b.updatedAt)) fail(what + ': Änderungszeit ungültig (UTC, ISO 8601).');
    var hard = privacyFindings(b).filter(function (f) { return f.hard; });
    if (hard.length) fail(what + ': enthält Zahlungsdaten (' + (hard[0].kind === 'iban' ? 'IBAN' : 'Kartennummer') + ' in ' + hard[0].field + '). Zahlungsdetails gehören nicht in ein Reisebuch.');
    return true;
  }
  /* media: optional die Fotoliste der Reise; dann müssen alle Verweise auflösbar sein. */
  function validateBooks(books, media) {
    if (books == null) return true;
    if (!Array.isArray(books)) fail('Reisebücher: ungültige Liste.');
    if (books.length > LIMITS.books) fail('Reisebücher: höchstens ' + LIMITS.books + ' je Reise.');
    var mediaIds = null;
    if (media != null) { mediaIds = Object.create(null); (media || []).forEach(function (m) { if (m && typeof m.id === 'string') mediaIds[m.id] = 1; }); }
    var ids = {};
    books.forEach(function (b, i) {
      var what = 'Reisebuch ' + (i + 1);
      if (!plain(b)) fail(what + ': ungültiger Eintrag.');
      useId(ids, b.id, what);
      validateBook(b, what, mediaIds);
    });
    return true;
  }
  /* Neues Buch aus einer Eingabe (bookgen.js oder Dialog): Standardwerte ergänzen, dann streng prüfen. */
  function normalizeBook(input, opt) {
    if (!plain(input)) fail('Reisebuch: ungültige Eingabe.');
    Object.keys(input).forEach(function (k) { if (BOOK_KEYS.indexOf(k) < 0) fail('Reisebuch: unbekanntes Feld „' + String(k).slice(0, 30) + '“.'); });
    var b = {
      id: input.id, title: typeof input.title === 'string' ? input.title.trim() : input.title,
      subtitle: input.subtitle == null ? '' : (typeof input.subtitle === 'string' ? input.subtitle.trim() : input.subtitle),
      theme: input.theme == null ? 'standard' : input.theme, format: input.format == null ? 'a5-quer' : input.format,
      cover: input.cover == null ? { mediaId: null } : copy(input.cover),
      pages: (Array.isArray(input.pages) ? input.pages : []).map(function (p) {
        if (!plain(p)) return p;
        var q = { id: p.id, layout: p.layout, slots: (Array.isArray(p.slots) ? p.slots : []).map(function (s) {
          if (!plain(s)) return s;
          var r = copy(s); if (!own(r, 'mediaId')) r.mediaId = null; if (!own(r, 'crop')) r.crop = null; if (!own(r, 'fit')) r.fit = 'cover'; return r;
        }), text: p.text == null ? '' : p.text };
        Object.keys(p).forEach(function (k) { if (!own(q, k)) q[k] = copy(p[k]); });
        return q;
      }),
      draft: input.draft == null ? null : copy(input.draft),
      updatedAt: input.updatedAt == null ? (opt && opt.now) : input.updatedAt
    };
    if (plain(b.cover) && !own(b.cover, 'mediaId')) b.cover.mediaId = null;
    validateBooks([b], opt && opt.media != null ? opt.media : null);
    return b;
  }
  /* Hinweise ohne Ablehnung: ausgeblendete Fotos im Buch, leere Bildplätze, weiche Datenschutztreffer. */
  function bookWarnings(b, media) {
    var byId = {}, out = [];
    (media || []).forEach(function (m) { byId[m.id] = m; });
    var look = function (id, where) { if (id !== null && byId[id] && byId[id].hidden) out.push({ kind: 'ausgeblendet', where: where, mediaId: id }); };
    if (b.cover) { if (b.cover.mediaId === null) out.push({ kind: 'ohne-titelbild', where: 'cover' }); else look(b.cover.mediaId, 'cover'); }
    (b.pages || []).forEach(function (p, i) { (p.slots || []).forEach(function (s, j) { if (s.mediaId === null) out.push({ kind: 'leerer-platz', where: 'pages[' + i + '].slots[' + j + ']' }); else look(s.mediaId, 'pages[' + i + '].slots[' + j + ']'); }); });
    privacyFindings(b).forEach(function (f) { if (!f.hard) out.push({ kind: f.kind, where: f.field }); });
    return out;
  }

  /* ---------- Verweise und Entfernen von Fotos ---------- */
  function validateReferences4(t) {
    var party = {};
    (t && Array.isArray(t.party) ? t.party : []).forEach(function (p) { if (p && typeof p.id === 'string') party[p.id] = 1; });
    (t && t.media || []).forEach(function (m, i) { if (own(m, 'by') && !own(party, m.by)) fail('Foto ' + (i + 1) + ': Person „' + m.by + '“ gibt es in dieser Reise nicht.'); });
    validateBooks(t && t.books, t && t.media || []);
    return true;
  }
  /* Wo wird ein Foto verwendet? [{bookId, where}] */
  function mediaUses(t, mediaId) {
    var out = [];
    (t && t.books || []).forEach(function (b) {
      if (b.cover && b.cover.mediaId === mediaId) out.push({ bookId: b.id, where: 'cover' });
      (b.pages || []).forEach(function (p) { (p.slots || []).forEach(function (s, j) { if (s.mediaId === mediaId) out.push({ bookId: b.id, where: p.id + ':' + j }); }); });
    });
    return out;
  }
  /* Foto entfernen: liefert eine neue Reise. Wird es in Büchern verwendet, nur mit confirm; die Plätze werden dann leer
     (mediaId null), Ausschnitt und Seite bleiben erhalten. Die Bilddatei löscht die App getrennt. */
  function removeMedia(t, mediaId, opt) {
    var uses = mediaUses(t, mediaId);
    if (!(t && t.media || []).some(function (m) { return m.id === mediaId; })) fail('Foto „' + String(mediaId).slice(0, 41) + '“ gibt es in dieser Reise nicht.');
    if (uses.length && !(opt && opt.confirm)) return { ok: false, uses: uses, trip: t };
    var d = copy(t);
    d.media = d.media.filter(function (m) { return m.id !== mediaId; });
    (d.books || []).forEach(function (b) {
      if (b.cover && b.cover.mediaId === mediaId) b.cover.mediaId = null;
      (b.pages || []).forEach(function (p) { (p.slots || []).forEach(function (s) { if (s.mediaId === mediaId) s.mediaId = null; }); });
    });
    return { ok: true, uses: uses, trip: d };
  }

  /* ---------- Version (SCHEMA_V4 §5) ---------- */
  var V4_FIELDS = ['media', 'books'];
  var SCHEMA_MAX = 4;
  var nonEmpty = function (v) { return v != null && !(Array.isArray(v) && !v.length); };
  /* Braucht die Reise Format 4? Leere Listen zählen nicht. */
  function needsV4(t) { return !!t && V4_FIELDS.some(function (k) { return nonEmpty(t[k]); }); }
  /* Zielversion beim Speichern: nie niedriger als die gespeicherte. opt.needsV3 = Prüffunktion aus v3logic.js. */
  function targetVersion(t, opt) {
    var cur = t && typeof t.schemaVersion === 'number' && isFinite(t.schemaVersion) ? t.schemaVersion : 2;
    var need = needsV4(t) ? 4 : (opt && typeof opt.needsV3 === 'function' && opt.needsV3(t) ? 3 : 2);
    return Math.max(cur, need);
  }
  /* Rückstufung abweisen (wie der Datenbank-Trigger, aber schon im Client). */
  function assertNoDowngrade(prevVersion, next) {
    var nv = next && next.schemaVersion;
    if (typeof prevVersion === 'number' && (typeof nv !== 'number' || nv < prevVersion)) fail('Diese Reise hat Format ' + prevVersion + ' und darf nicht auf Format ' + nv + ' zurückgestuft werden.');
    return true;
  }
  /* Format < 4 schreibt keine (auch keine leeren) v4-Felder; Format 4 läuft unverändert rund (Feldtreue). */
  function serializeTrip4(t) {
    var d = copy(t);
    if (d.schemaVersion === 4) return d;
    if (typeof d.schemaVersion === 'number' && d.schemaVersion > 4) fail('Format ' + d.schemaVersion + ' ist neuer als dieser Stand.');
    if (needsV4(d)) fail('Diese Reise enthält Fotos oder Reisebücher (Format 4) und kann nicht als Format ' + (d.schemaVersion || 2) + ' gespeichert werden.');
    V4_FIELDS.forEach(function (k) { delete d[k]; });
    return d;
  }
  /* v4-Felder prüfen. In Reisen unter Format 4 sind sie verboten (leere Listen ausgenommen, die serializeTrip4 entfernt). */
  function validateV4(t) {
    if (!plain(t)) fail('Reise: ungültig.');
    if (t.schemaVersion !== 4) { if (needsV4(t)) fail('Fotos und Reisebücher gibt es erst ab Format 4.'); return true; }
    validateMedia(t.media);
    validateReferences4(t);
    return true;
  }
  /* Kann ein Stand mit höchstem Format max diese Reise bearbeiten? Sonst „neueres Format, nur lesen“ (sync-unreadable). */
  function readable(t, max) {
    var sv = t && typeof t.schemaVersion === 'number' ? t.schemaVersion : 2, m = max == null ? SCHEMA_MAX : max;
    return { ok: sv <= m, newer: sv > m, schema: sv };
  }

  /* ---------- Export als .reiseplaner-ZIP (SCHEMA_V4 §6) ---------- */
  var ARCHIVE_FORMAT = 'reiseplaner-archiv', ARCHIVE_VERSION = 1;
  var PATH = /^(media|thumbs)\/([a-z][a-z0-9]{3,40})\.jpg$/;
  /* Plant den Inhalt der ZIP-Datei; das Packen und das Lesen der Bilddateien macht die App.
     trips: Reiseliste (wie der JSON-Export). opt.stripLocation entfernt Koordinaten aus den exportierten Kopien.
     opt.now: Zeitstempel. Gleiche Foto-ID in zwei Reisen (z. B. Konfliktkopie) ist erlaubt, wenn die Prüfsumme gleich ist;
     dann gibt es die Datei nur einmal. Gleiche ID mit anderer Prüfsumme wird abgelehnt. */
  function archivePlan(trips, opt) {
    if (!Array.isArray(trips)) fail('Export: Reiseliste fehlt.');
    var out = copy(trips), seen = Object.create(null), files = [], maxV = 2;
    out.forEach(function (t, i) {
      if (!plain(t)) fail('Export: Reise ' + (i + 1) + ' ungültig.');
      validateV4(t);
      if (typeof t.schemaVersion === 'number') maxV = Math.max(maxV, t.schemaVersion);
      if (opt && opt.stripLocation && Array.isArray(t.media)) t.media = stripLocation(t.media);
      (t.media || []).forEach(function (m) {
        if (own(seen, m.id)) { if (seen[m.id] !== m.sha256) fail('Export: Foto-ID „' + m.id + '“ steht für zwei verschiedene Bilder.'); return; }
        seen[m.id] = m.sha256;
        files.push({ path: 'media/' + m.id + '.jpg', kind: 'media', mediaId: m.id, bytes: m.bytes, sha256: m.sha256 });
        files.push({ path: 'thumbs/' + m.id + '.jpg', kind: 'thumb', mediaId: m.id, bytes: null, sha256: null });
      });
    });
    var manifest = { format: ARCHIVE_FORMAT, archiveVersion: ARCHIVE_VERSION, createdAt: opt && opt.now || null, trips: out.length, schemaMax: maxV,
      locationStripped: !!(opt && opt.stripLocation), files: files.map(function (f) { return { path: f.path, kind: f.kind, mediaId: f.mediaId, bytes: f.bytes, sha256: f.sha256 }; }) };
    return { manifest: manifest, trips: out, entries: [{ path: 'manifest.json', kind: 'manifest' }, { path: 'trips.json', kind: 'trips' }].concat(files) };
  }
  /* Import: Dateinamen der ZIP prüfen, bevor etwas entpackt wird. Unbekannte Pfade, Pfade mit Ordnerwechsel und zu viele
     Einträge werden abgelehnt. Fehlende Bilddateien sind kein Abbruch, sondern werden gemeldet (Foto „Datei fehlt“),
     Dateien ohne Eintrag werden nicht übernommen. */
  function checkArchive(names, manifest, trips) {
    if (!Array.isArray(names)) fail('Import: Dateiliste fehlt.');
    if (names.length > LIMITS.archiveEntries) fail('Import: zu viele Dateien im Archiv.');
    var have = Object.create(null);
    names.forEach(function (n) {
      if (typeof n !== 'string' || !n || n.length > 120) fail('Import: ungültiger Dateiname.');
      if (n === 'manifest.json' || n === 'trips.json' || PATH.test(n)) { if (have[n]) fail('Import: Datei „' + n + '“ doppelt.'); have[n] = 1; return; }
      if (/\/$/.test(n) && (n === 'media/' || n === 'thumbs/')) return; /* Ordnereinträge mancher Packprogramme */
      fail('Import: unerwartete Datei „' + n.slice(0, 60) + '“ im Archiv.');
    });
    if (!have['manifest.json'] || !have['trips.json']) fail('Import: manifest.json oder trips.json fehlt.');
    if (!plain(manifest) || manifest.format !== ARCHIVE_FORMAT) fail('Import: keine Reiseplaner-Archivdatei.');
    if (typeof manifest.archiveVersion !== 'number' || manifest.archiveVersion > ARCHIVE_VERSION) fail('Import: Archiv aus einem neueren Stand; bitte die App aktualisieren.');
    if (!Array.isArray(trips)) fail('Import: trips.json enthält keine Reiseliste.');
    var known = Object.create(null), missing = [], missingThumbs = [], orphans = [];
    trips.forEach(function (t) { (t && Array.isArray(t.media) ? t.media : []).forEach(function (m) {
      if (!m || known[m.id]) return; known[m.id] = 1;
      if (!have['media/' + m.id + '.jpg']) missing.push(m.id);
      if (!have['thumbs/' + m.id + '.jpg']) missingThumbs.push(m.id);
    }); });
    Object.keys(have).forEach(function (n) { var x = PATH.exec(n); if (x && !known[x[2]]) orphans.push(n); });
    return { ok: true, missing: missing, missingThumbs: missingThumbs, orphans: orphans };
  }

  return {
    LIMITS: LIMITS, FORMATS: FORMATS, LAYOUTS: LAYOUTS, PAGE_KINDS: PAGE_KINDS, ITEM_KINDS: ITEM_KINDS, CLOUD: CLOUD, V4_FIELDS: V4_FIELDS, SCHEMA_MAX: SCHEMA_MAX,
    ARCHIVE: { format: ARCHIVE_FORMAT, version: ARCHIVE_VERSION },
    validateMedia: validateMedia, normalizeMedia: normalizeMedia, stripLocation: stripLocation,
    validateBooks: validateBooks, normalizeBook: normalizeBook, bookWarnings: bookWarnings, privacyFindings: privacyFindings,
    validateReferences4: validateReferences4, mediaUses: mediaUses, removeMedia: removeMedia,
    needsV4: needsV4, targetVersion: targetVersion, assertNoDowngrade: assertNoDowngrade, serializeTrip4: serializeTrip4,
    validateV4: validateV4, readable: readable, archivePlan: archivePlan, checkArchive: checkArchive
  };
});
