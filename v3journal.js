/* Reiseplaner · Reisetagebuch und Bewertungen (Datenvertrag v3 §4/§5/§9, docs/SCHEMA_V3.md).
   Reine Funktionen ohne Speicher-, DOM- oder App-Zugriff. Die App reicht ihre Reisetage als [{i, date:'YYYY-MM-DD'|null}]
   herein; diese Datei kennt weder daysOf() noch den Store.
   Vertrag:
   - t.journal = { 'YYYY-MM-DD' | 'd<index>': { text: Text ≤ 2000, mood?: 1–5 } }. Bei festen Daten ist der Schlüssel das
     Datum des Reisetags, sonst der Tagesindex ab 0. Es gibt keine automatische Umschlüsselung: Einträge, die zu keinem
     aktuellen Reisetag passen (Datum verschoben, Dauer verkürzt, Daten festgelegt oder wieder geöffnet), bleiben unverändert
     gespeichert und werden als „ohne zugehörigen Tag“ geliefert.
   - t.ratings = { actId: 1–5 }. Bewertungen zu Unternehmungen, die nicht mehr im Plan stehen, bleiben erhalten.
   - Ein leerer Eintrag (kein Text, keine Stimmung) wird nicht gespeichert, sondern entfernt.
   UMD wie v3logic.js: window.RPV3J im Browser, module.exports in Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RPV3J = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Grenzen: 366 Einträge reichen für ein volles Jahr plus einen Tag; mehr würde den Browser-Speicher (rund 5 MB) einer
     einzelnen Reise sprengen. Tagesindex bis 9999 deckt jede gültige Reisedauer ab. */
  var LIMITS = { text: 2000, entries: 366, ratings: 500, maxIndex: 9999, minScore: 1, maxScore: 5 };
  var MOODS = { 1: 'mies', 2: 'durchwachsen', 3: 'okay', 4: 'gut', 5: 'großartig' };
  var DATE = /^\d{4}-\d{2}-\d{2}$/, INDEX = /^d(0|[1-9]\d{0,3})$/, ACT = /^[A-Za-z0-9_-]{1,60}$/;
  /* Gleiche Sperrliste wie die Sicherungsprüfung der App (validateBackup) */
  var RESERVED = ['__proto__', 'constructor', 'prototype'];

  var own = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  var plain = function (o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; var p = Object.getPrototypeOf(o); return p === null || Object.getPrototypeOf(p) === null; };
  function fail(msg) { throw new Error(msg); }
  function validDate(s) { if (typeof s !== 'string' || !DATE.test(s)) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
  function isDateKey(k) { return typeof k === 'string' && validDate(k); }
  function isIndexKey(k) { return typeof k === 'string' && INDEX.test(k); }
  function isActId(k) { return typeof k === 'string' && ACT.test(k) && RESERVED.indexOf(k) < 0; }
  function score(v) { return typeof v === 'number' && Number.isInteger(v) && v >= LIMITS.minScore && v <= LIMITS.maxScore; }
  function keyLabel(k) {
    if (isDateKey(k)) return k.slice(8, 10) + '.' + k.slice(5, 7) + '.' + k.slice(0, 4);
    if (isIndexKey(k)) return 'Tag ' + (+k.slice(1) + 1);
    return String(k);
  }

  /* ---------- Prüfung gespeicherter Daten ---------- */
  function validateEntry(e, what) {
    if (!plain(e)) fail(what + ': ungültiger Eintrag.');
    Object.keys(e).forEach(function (k) { if (k !== 'text' && k !== 'mood') fail(what + ': unbekanntes Feld „' + k + '“.'); });
    if (typeof e.text !== 'string') fail(what + ': Text fehlt.');
    if (e.text.length > LIMITS.text) fail(what + ': höchstens ' + LIMITS.text + ' Zeichen.');
    if (own(e, 'mood') && !score(e.mood)) fail(what + ': Stimmung muss eine ganze Zahl von 1 bis 5 sein.');
    if (!e.text.trim() && !own(e, 'mood')) fail(what + ': leerer Eintrag.');
    return true;
  }
  function validateJournal(j) {
    if (j == null) return true;
    if (!plain(j)) fail('Tagebuch: ungültige Struktur.');
    var keys = Object.keys(j);
    if (keys.length > LIMITS.entries) fail('Tagebuch: höchstens ' + LIMITS.entries + ' Einträge.');
    keys.forEach(function (k) {
      if (RESERVED.indexOf(k) >= 0) fail('Tagebuch: unzulässiger Schlüssel.');
      if (!isDateKey(k) && !isIndexKey(k)) fail('Tagebuch: Schlüssel „' + String(k).slice(0, 20) + '“ ist weder ein gültiges Datum (JJJJ-MM-TT) noch ein Reisetag (d0, d1 …).');
      validateEntry(j[k], 'Tagebuch ' + keyLabel(k));
    });
    return true;
  }
  function validateRatings(r) {
    if (r == null) return true;
    if (!plain(r)) fail('Bewertungen: ungültige Struktur.');
    var keys = Object.keys(r);
    if (keys.length > LIMITS.ratings) fail('Bewertungen: höchstens ' + LIMITS.ratings + ' Einträge.');
    keys.forEach(function (k) {
      if (!isActId(k)) fail('Bewertungen: ungültige Unternehmungs-ID.');
      if (!score(r[k])) fail('Bewertungen: nur ganze Sterne von 1 bis 5.');
    });
    return true;
  }
  function validate(t) { if (!t || typeof t !== 'object') fail('Reise fehlt.'); validateJournal(t.journal); validateRatings(t.ratings); return true; }
  function isEmpty(v) { return v == null || (plain(v) && !Object.keys(v).length); }

  /* ---------- Eingaben aus Formularen ---------- */
  /* Stimmung/Sterne: '' | null | undefined | 0 = keine Angabe; '1'…'5' oder 1…5 = Wert; alles andere ist ein Fehler. */
  function readScore(v, what) {
    if (v == null || v === '' || v === 0 || v === '0') return null;
    var n = typeof v === 'number' ? v : (typeof v === 'string' && /^[1-5]$/.test(v.trim()) ? +v.trim() : NaN);
    if (!score(n)) fail(what + ' muss zwischen 1 und 5 liegen.');
    return n;
  }
  /* Zeilenenden vereinheitlichen, Rand-Leerraum entfernen. null = leerer Eintrag (wird entfernt). */
  function normalizeEntry(input) {
    input = input || {};
    if (input.text != null && typeof input.text !== 'string') fail('Tagebuch: ungültiger Text.');
    var text = String(input.text == null ? '' : input.text).replace(/\r\n?/g, '\n').trim();
    if (text.length > LIMITS.text) fail('Tagebuch: höchstens ' + LIMITS.text + ' Zeichen (aktuell ' + text.length + ').');
    var mood = readScore(input.mood, 'Die Stimmung');
    if (!text && mood == null) return null;
    var e = { text: text };
    if (mood != null) e.mood = mood;
    return e;
  }
  function copyMap(m) { var out = {}; Object.keys(m || {}).forEach(function (k) { out[k] = JSON.parse(JSON.stringify(m[k])); }); return out; }
  /* Neues Tagebuchobjekt mit genau einem geänderten Schlüssel; alle anderen Einträge bleiben tief gleich. */
  function setEntry(journal, key, input) {
    validateJournal(journal);
    if (!isDateKey(key) && !isIndexKey(key)) fail('Tagebuch: unbekannter Reisetag.');
    var next = copyMap(journal), entry = normalizeEntry(input);
    if (entry == null) { delete next[key]; return next; }
    if (!own(next, key) && Object.keys(next).length >= LIMITS.entries) fail('Tagebuch: höchstens ' + LIMITS.entries + ' Einträge je Reise.');
    next[key] = entry;
    validateJournal(next);
    return next;
  }
  function setRating(ratings, actId, stars) {
    validateRatings(ratings);
    if (!isActId(actId)) fail('Bewertung: unbekannte Unternehmung.');
    var next = copyMap(ratings), n = readScore(stars, 'Die Bewertung');
    if (n == null) { delete next[actId]; return next; }
    if (!own(next, actId) && Object.keys(next).length >= LIMITS.ratings) fail('Bewertungen: höchstens ' + LIMITS.ratings + ' je Reise.');
    next[actId] = n;
    validateRatings(next);
    return next;
  }

  /* ---------- Zuordnung zu Reisetagen ---------- */
  /* Schlüssel für einen Tag: Datum bei festen Daten, sonst Tagesindex. */
  function dayKey(day) {
    if (!day || typeof day.i !== 'number' || !Number.isInteger(day.i) || day.i < 0 || day.i > LIMITS.maxIndex) fail('Reisetag ungültig.');
    if (day.date != null) { if (!isDateKey(day.date)) fail('Datum des Reisetags ungültig.'); return day.date; }
    return 'd' + day.i;
  }
  /* Vorhandene Einträge den aktuellen Tagen zuordnen, ohne Schlüssel zu ändern.
     - entry: Eintrag unter dem Schlüssel des Tages (dort wird neu geschrieben)
     - extra: bei festen Daten zusätzlich ein früherer Eintrag „Tag N“ aus der Zeit ohne feste Daten
     - orphans: alles Übrige, sortiert (Daten aufsteigend, dann Tage aufsteigend) */
  function layout(journal, days) {
    var j = journal && plain(journal) ? journal : {}, claimed = {}, count = 0;
    var out = (days || []).map(function (d) {
      var key = dayKey(d), row = { i: d.i, date: d.date == null ? null : d.date, key: key, entry: own(j, key) ? j[key] : null, extra: [] };
      Object.keys(d).forEach(function (k) { if (!own(row, k)) row[k] = d[k]; });
      claimed[key] = 1; if (row.entry) count++;
      var legacy = 'd' + d.i;
      if (d.date != null && own(j, legacy)) { row.extra.push({ key: legacy, kind: 'index', entry: j[legacy] }); claimed[legacy] = 1; count++; }
      return row;
    });
    var orphans = Object.keys(j).filter(function (k) { return !own(claimed, k); }).map(function (k) {
      return { key: k, kind: isDateKey(k) ? 'date' : 'index', label: keyLabel(k), entry: j[k] };
    }).sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === 'date' ? -1 : 1;
      return a.kind === 'date' ? a.key.localeCompare(b.key) : (+a.key.slice(1)) - (+b.key.slice(1));
    });
    return { days: out, orphans: orphans, count: count + orphans.length };
  }
  /* Bewertungen gegen die geplanten Unternehmungen: acts = [{id, …}] in Planreihenfolge. other = Bewertungen ohne
     geplante Unternehmung (entfernt oder nicht mehr im Plan), bleiben erhalten. */
  function ratingLayout(ratings, acts) {
    var r = ratings && plain(ratings) ? ratings : {}, seen = {};
    var planned = (acts || []).filter(function (a) { if (!a || !isActId(a.id) || own(seen, a.id)) return false; seen[a.id] = 1; return true; })
      .map(function (a) { var row = {}; Object.keys(a).forEach(function (k) { row[k] = a[k]; }); row.stars = own(r, a.id) ? r[a.id] : null; return row; });
    var other = Object.keys(r).filter(function (id) { return !own(seen, id); }).map(function (id) { return { id: id, stars: r[id] }; });
    return { planned: planned, other: other, count: Object.keys(r).length };
  }

  /* ---------- Texte (Information nie nur über Farbe oder Symbol) ---------- */
  function moodText(n) { return score(n) ? n + ' von 5 · ' + MOODS[n] : 'keine Angabe'; }
  function starsText(n) { return score(n) ? n + ' von 5 Sternen' : 'noch nicht bewertet'; }
  function starsGlyphs(n) { var s = ''; for (var i = 1; i <= 5; i++) s += score(n) && i <= n ? '★' : '☆'; return s; }
  function excerpt(text, max) {
    max = max || 140;
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    var cut = s.slice(0, max), sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut) + ' …';
  }

  return { LIMITS: LIMITS, MOODS: MOODS, RESERVED: RESERVED, isDateKey: isDateKey, isIndexKey: isIndexKey, isActId: isActId, keyLabel: keyLabel,
    validateEntry: validateEntry, validateJournal: validateJournal, validateRatings: validateRatings, validate: validate, isEmpty: isEmpty,
    normalizeEntry: normalizeEntry, setEntry: setEntry, setRating: setRating, dayKey: dayKey, layout: layout, ratingLayout: ratingLayout,
    moodText: moodText, starsText: starsText, starsGlyphs: starsGlyphs, excerpt: excerpt };
});
