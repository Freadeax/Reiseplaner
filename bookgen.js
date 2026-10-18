/* Reiseplaner · Erstentwurf eines Reisebuchs (docs/PLAN_IOS_APP.md §7.2, Paket 3).
   Reine, deterministische Funktionen ohne Speicher-, DOM-, Uhr- oder Zufallszugriff: dieselbe Reise mit denselben
   Angaben ergibt denselben Entwurf (Zeitpunkt nur über opts.at). Tagebuch und Bewertungen werden ausschließlich über
   v3journal.js (RPV3J) gelesen, nie verändert.
   Aufbau: Titelseite · Übersicht · je Reisetag ein Kapitel · weitere Einträge ohne zugehörigen Tag · Highlights ·
   „Zahlen der Reise“ (nur mit opts.numbers) · Schlussseite. Ohne Fotos entsteht ein Textbuch.
   Datenschutz: Das Ergebnis wird nur aus einer festen Auswahl von Feldern gebaut. Nie enthalten sind Buchungsbuch,
   Angebote, Buchungsnummern, Notizen, Zahlungsdetails, Ausgaben, Zahler, Fotostandorte, Prüfsummen und Hochlader.
   Mitreisende (t.party) erscheinen nur mit opts.party === true.
   Was die App kennt und diese Datei nicht (Katalog, daysOf, Kostenrechnung), reicht sie über ctx herein:
     ctx.days    [{i, date:'YYYY-MM-DD'|null, place?}]   sonst aus dateMode/start/end/nights wie daysOf()
     ctx.acts    [{id, title, days:[i…]}]                sonst Titel aus t.customActs, Tage aus t.items
     ctx.km      Kilometer laut Plan (Zahl)               sonst keine Kilometerangabe (nichts geraten)
     ctx.numbers {total:Euro|null, unknown:Anzahl, perPerson?:Euro|null, shares?:[{partyId, amount}]}
                 aus derselben Kostenrechnung wie alle anderen Ansichten; bookgen rechnet keine Kosten
     ctx.map     [{label, lat, lon}] geplante Orte für die schematische Karte (keine Fotostandorte)
   Seiten tragen die Felder aus SCHEMA §5.2 (id, layout, slots, text, day) und zusätzlich kind, heading, sub, items.
   Die Abstimmung mit dem Format-4-Vertrag (Paket 2) erfolgt beim Zusammenführen.
   UMD wie v3journal.js: window.RPBook im Browser, module.exports in Node. */
(function (root, factory) {
  var J = typeof module === 'object' && module.exports ? require('./v3journal.js') : root.RPV3J;
  var api = factory(J);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RPBook = api;
})(typeof self !== 'undefined' ? self : this, function (J) {
  'use strict';
  if (!J) throw new Error('bookgen.js braucht v3journal.js (RPV3J).');

  var RULE = 'bookgen-1';
  var THEMES = ['klassisch', 'polaroid', 'magazin', 'minimal', 'kinder'];
  var FORMATS = ['a5-quer', 'a4-hoch', 'quadrat-21'];
  var LIMITS = { title: 120, subtitle: 200, text: 2000, caption: 500, photosPerDay: 4, highlights: 5, highlightMin: 4, mapStops: 50, label: 80 };
  var ID = /^[a-z][a-z0-9]{3,40}$/, MEDIA_ID = /^[A-Za-z0-9_-]{1,60}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
  var WEEKDAYS = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];

  var own = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  var plain = function (o) { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; var p = Object.getPrototypeOf(o); return p === null || Object.getPrototypeOf(p) === null; };
  function fail(msg) { throw new Error(msg); }
  function str(v, max) { if (typeof v !== 'string') return ''; var s = v.replace(/\r\n?/g, '\n').trim(); return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s; }
  function validDate(s) { if (typeof s !== 'string' || !DATE.test(s)) return false; var d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
  function addDays(s, n) { return new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
  function dateLong(s) { return WEEKDAYS[new Date(s + 'T00:00:00Z').getUTCDay()] + ', ' + J.keyLabel(s); }
  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function fnv(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
  /* Euro deutsch, unabhängig von Intl/ICU (Determinismus) */
  function euro(v) {
    var c = Math.round(v * 100), neg = c < 0; c = Math.abs(c);
    var e = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '−' : '') + e + ',' + String(c % 100).padStart(2, '0') + ' €';
  }

  /* ---------- Reisetage (wie daysOf/nightsOf der App) ---------- */
  function tripDays(t) {
    var fix = t.dateMode === 'fix' && validDate(t.start) && validDate(t.end) && t.end >= t.start;
    var n = t.nights == null || t.nights === '' ? NaN : +t.nights;
    var nights = fix ? Math.round((Date.parse(t.end) - Date.parse(t.start)) / 864e5) : Math.max(0, Math.round(isFinite(n) ? n : 3));
    var out = [];
    for (var i = 0; i <= nights && i <= J.LIMITS.maxIndex; i++) out.push({ i: i, date: fix ? addDays(t.start, i) : null });
    return out;
  }
  function readDays(t, ctx) {
    var src = Array.isArray(ctx.days) ? ctx.days : tripDays(t), seen = {};
    return src.filter(function (d) {
      if (!d || typeof d.i !== 'number' || !Number.isInteger(d.i) || d.i < 0 || own(seen, d.i)) return false;
      if (d.date != null && !validDate(d.date)) return false;
      if (d.date == null && d.i > J.LIMITS.maxIndex) return false;
      seen[d.i] = 1; return true;
    }).map(function (d) { return { i: d.i, date: d.date == null ? null : d.date, place: str(d.place, LIMITS.label) }; })
      .sort(function (a, b) { return a.i - b.i; });
  }
  function rangeText(days, t) {
    var n = days.length, nights = Math.max(0, n - 1), dur = n + (n === 1 ? ' Tag' : ' Tage') + ' · ' + nights + (nights === 1 ? ' Nacht' : ' Nächte');
    if (n && days[0].date && days[n - 1].date) return J.keyLabel(days[0].date) + ' – ' + J.keyLabel(days[n - 1].date) + ' · ' + dur;
    return dur;
  }

  /* ---------- Unternehmungen ---------- */
  function readActs(t, ctx) {
    var list = [], byId = {};
    var add = function (id, title, days) {
      if (!J.isActId(id)) return;
      if (!own(byId, id)) { byId[id] = { id: id, title: '', days: [], order: list.length }; list.push(byId[id]); }
      var a = byId[id];
      if (!a.title) a.title = str(title, LIMITS.label);
      (days || []).forEach(function (i) { if (Number.isInteger(i) && i >= 0 && a.days.indexOf(i) < 0) a.days.push(i); });
    };
    if (Array.isArray(ctx.acts)) ctx.acts.forEach(function (a) { if (a) add(a.id, a.title, Array.isArray(a.days) ? a.days : (Number.isInteger(a.day) ? [a.day] : [])); });
    else {
      var custom = {};
      (Array.isArray(t.customActs) ? t.customActs : []).forEach(function (a) { if (a && J.isActId(a.id) && !a.transit) custom[a.id] = a; });
      var so = { morgen: 0, mittag: 1, nachm: 2, abend: 3 };
      (Array.isArray(t.items) ? t.items.slice() : []).filter(function (it) { return it && Number.isInteger(it.day); })
        .sort(function (a, b) { return a.day - b.day || (so[a.slot] || 0) - (so[b.slot] || 0) || String(a.time || '99').localeCompare(String(b.time || '99')); })
        .forEach(function (it) { if (own(custom, it.act)) add(it.act, custom[it.act].t, [it.day]); });
    }
    list.forEach(function (a) { a.days.sort(function (x, y) { return x - y; }); });
    return list;
  }

  /* ---------- Fotos (Form aus §5.2; nur Verweise, nie Standort, Prüfsumme oder Hochlader) ---------- */
  function readMedia(t, days) {
    if (!(t.schemaVersion >= 4) || !Array.isArray(t.media)) return [];
    var keyOf = {}, seen = {};
    days.forEach(function (d) { keyOf[J.dayKey(d)] = d.i; if (d.date) keyOf['d' + d.i] = d.i; });
    return t.media.filter(function (m) {
      if (!plain(m) || m.kind !== 'photo' || m.hidden === true || typeof m.id !== 'string' || !MEDIA_ID.test(m.id) || own(seen, m.id)) return false;
      seen[m.id] = 1; return true;
    }).map(function (m, n) {
      var w = finite(m.w) && m.w > 0 ? m.w : null, h = finite(m.h) && m.h > 0 ? m.h : null;
      return { id: m.id, n: n, day: typeof m.day === 'string' && own(keyOf, m.day) ? keyOf[m.day] : null,
        actId: J.isActId(m.actId) ? m.actId : null, fav: m.fav === true, caption: str(m.caption, LIMITS.caption),
        takenAt: typeof m.takenAt === 'string' && !isNaN(Date.parse(m.takenAt)) ? new Date(Date.parse(m.takenAt)).toISOString() : null,
        orient: w && h ? (h > w ? 'hoch' : 'quer') : 'unbekannt' };
    });
  }
  /* Feste Reihenfolge: Aufnahmezeit (bekannte zuerst), dann Position in t.media */
  function byTime(a, b) {
    if (a.takenAt !== b.takenAt) { if (!a.takenAt) return 1; if (!b.takenAt) return -1; return a.takenAt < b.takenAt ? -1 : 1; }
    return a.n - b.n;
  }
  function stars(ratings, m) { return m.actId && own(ratings, m.actId) ? ratings[m.actId] : 0; }
  function rank(ratings) { return function (a, b) { return (b.fav - a.fav) || (stars(ratings, b) - stars(ratings, a)) || byTime(a, b); }; }
  function slot(m) { return { mediaId: m.id, crop: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', caption: m.caption }; }
  /* Layout nach Anzahl und Hoch-/Querformat (Namen aus §7.3) */
  function photoLayout(ph, hasText) {
    if (!ph.length) return 'nur-text';
    if (ph.length === 1) return hasText ? 'text-foto' : '1-gross';
    if (ph.length === 2) return ph.every(function (m) { return m.orient === 'hoch'; }) ? '2-nebeneinander' : '2-gestapelt';
    if (ph.length === 3) return '3-mosaik';
    return '4-raster';
  }

  /* ---------- Entwurf ---------- */
  function draft(t, ctx, opts) {
    if (!t || typeof t !== 'object' || Array.isArray(t)) fail('Reise fehlt.');
    ctx = ctx || {}; opts = opts || {};
    var theme = opts.theme == null ? 'klassisch' : opts.theme, format = opts.format == null ? 'a5-quer' : opts.format;
    if (THEMES.indexOf(theme) < 0) fail('Reisebuch: unbekanntes Thema.');
    if (FORMATS.indexOf(format) < 0) fail('Reisebuch: unbekanntes Format.');
    if (opts.id != null && (typeof opts.id !== 'string' || !ID.test(opts.id))) fail('Reisebuch: ungültige ID.');
    if (opts.at != null && (typeof opts.at !== 'string' || isNaN(Date.parse(opts.at)))) fail('Reisebuch: ungültiger Zeitpunkt.');

    var v3 = t.schemaVersion >= 3;
    var days = readDays(t, ctx), acts = readActs(t, ctx), actById = {};
    acts.forEach(function (a) { actById[a.id] = a; });
    var L = J.layout(v3 ? t.journal : null, days);
    var ratings = v3 && plain(t.ratings) ? t.ratings : {};
    var R = J.ratingLayout(ratings, acts);
    var media = readMedia(t, days), used = {}, info = { coverRule: 'keins', skippedDays: [], unusedMedia: 0, untitledRatings: 0, numbers: 'aus' };
    var pages = [];
    var rated = function (id) { return own(ratings, id) && actById[id] && actById[id].title ? ratings[id] : null; };
    var starItem = function (a, n) { return { kind: 'bewertung', actId: a.id, title: a.title, stars: n, glyphs: J.starsGlyphs(n), text: J.starsText(n) }; };

    /* Titelseite: Lieblingsfoto, sonst meiste Sterne, sonst frühestes Foto */
    var cover = null;
    var favs = media.filter(function (m) { return m.fav; }).sort(byTime);
    if (favs.length) { cover = favs[0]; info.coverRule = 'fav'; }
    else {
      var best = media.filter(function (m) { return stars(ratings, m) > 0; }).sort(rank(ratings));
      if (best.length) { cover = best[0]; info.coverRule = 'sterne'; }
      else if (media.length) { cover = media.slice().sort(byTime)[0]; info.coverRule = 'erstes'; }
    }
    if (cover) used[cover.id] = 1;
    var title = str(t.title, LIMITS.title) || 'Unsere Reise';
    var subtitle = str(rangeText(days, t) + (str(t.dest, LIMITS.label) ? ' · ' + str(t.dest, LIMITS.label) : ''), LIMITS.subtitle);
    var party = opts.party === true && v3 && Array.isArray(t.party) ? t.party.filter(function (p) { return p && typeof p.name === 'string' && p.name.trim(); }) : [];
    var partyName = {}; party.forEach(function (p) { if (typeof p.id === 'string') partyName[p.id] = str(p.name, 40); });
    pages.push({ id: 'pgtitel', kind: 'titel', layout: cover ? '1-gross' : 'nur-text', slots: cover ? [slot(cover)] : [], heading: title, sub: subtitle,
      text: party.length ? 'Mit ' + party.map(function (p) { return str(p.name, 40); }).join(', ') : '', items: [] });

    /* Übersicht */
    var facts = [{ kind: 'fakt', label: 'Reisetage', value: String(days.length) }, { kind: 'fakt', label: 'Nächte', value: String(Math.max(0, days.length - 1)) },
      { kind: 'fakt', label: 'Unternehmungen laut Plan', value: String(acts.filter(function (a) { return a.days.length; }).length) }];
    if (finite(ctx.km) && ctx.km >= 0) facts.push({ kind: 'fakt', label: 'Kilometer laut Plan', value: String(Math.round(ctx.km)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' km' });
    if (L.count) facts.push({ kind: 'fakt', label: 'Tagebucheinträge', value: String(L.count) });
    if (media.length) facts.push({ kind: 'fakt', label: 'Fotos', value: String(media.length) });
    var map = (Array.isArray(ctx.map) ? ctx.map : []).filter(function (s) { return s && finite(s.lat) && finite(s.lon) && Math.abs(s.lat) <= 90 && Math.abs(s.lon) <= 180; })
      .slice(0, LIMITS.mapStops).map(function (s) { return { label: str(s.label, LIMITS.label), lat: s.lat, lon: s.lon }; });
    var ov = { id: 'pgueberblick', kind: 'uebersicht', layout: map.length ? 'karte' : 'nur-text', slots: [], heading: 'Die Reise im Überblick', sub: str(t.dest, LIMITS.label), text: '', items: facts };
    if (map.length) ov.map = map;
    pages.push(ov);

    /* Je Tag ein Kapitel */
    var shownRating = {};
    var dayByI = {}; days.forEach(function (d) { dayByI[d.i] = d; });
    L.days.forEach(function (row) {
      var d = dayByI[row.i], items = [];
      if (row.entry && row.entry.mood) items.push({ kind: 'stimmung', text: 'Stimmung: ' + J.moodText(row.entry.mood) });
      row.extra.forEach(function (x) {
        if (x.entry.mood) items.push({ kind: 'stimmung', text: 'Stimmung (früherer Eintrag): ' + J.moodText(x.entry.mood) });
        if (x.entry.text) items.push({ kind: 'eintrag', label: 'Früherer Eintrag für ' + J.keyLabel(x.key) + ' (vor dem Festlegen der Daten)', text: x.entry.text });
      });
      var dayActs = acts.filter(function (a) { return a.days.indexOf(d.i) >= 0; });
      dayActs.filter(function (a) { return rated(a.id) && !own(shownRating, a.id); }).sort(function (a, b) { return ratings[b.id] - ratings[a.id] || a.order - b.order; })
        .forEach(function (a) { shownRating[a.id] = 1; items.push(starItem(a, ratings[a.id])); });
      dayActs.filter(function (a) { return a.title && !rated(a.id); }).forEach(function (a) { items.push({ kind: 'plan', title: a.title, text: 'Auf dem Plan: ' + a.title }); });
      var ph = media.filter(function (m) { return m.day === d.i && !own(used, m.id); }).sort(rank(ratings)).slice(0, LIMITS.photosPerDay).sort(byTime);
      var text = row.entry ? row.entry.text : '';
      if (!text && !items.length && !ph.length && opts.emptyDays !== 'keep') { info.skippedDays.push(row.key); return; }
      ph.forEach(function (m) { used[m.id] = 1; });
      pages.push({ id: 'pgtag' + row.key.replace(/-/g, ''), kind: 'tag', day: row.key, layout: photoLayout(ph, !!text), slots: ph.map(slot),
        heading: 'Tag ' + (d.i + 1) + (d.date ? ' · ' + dateLong(d.date) : ''), sub: d.place, text: text, items: items });
    });
    /* Einträge ohne zugehörigen Tag bleiben sichtbar (keine Umschlüsselung, nichts verschwindet still) */
    L.orphans.forEach(function (o) {
      var items = o.entry.mood ? [{ kind: 'stimmung', text: 'Stimmung: ' + J.moodText(o.entry.mood) }] : [];
      pages.push({ id: 'pgweitere' + o.key.replace(/-/g, ''), kind: 'weitere', day: o.key, layout: 'nur-text', slots: [],
        heading: o.label, sub: 'ohne zugehörigen Reisetag', text: o.entry.text, items: items });
    });

    /* Highlights: bestbewertete Unternehmungen (ab 4 Sternen) mit bekanntem Titel; Bewertungen ohne Titel zählt info.untitledRatings */
    var hl = R.planned.filter(function (a) { return rated(a.id) && a.stars >= LIMITS.highlightMin; })
      .sort(function (a, b) { return b.stars - a.stars || actById[a.id].order - actById[b.id].order; }).slice(0, LIMITS.highlights);
    info.untitledRatings = Object.keys(ratings).filter(function (id) { return !rated(id); }).length;
    if (hl.length) {
      var hph = media.filter(function (m) { return !own(used, m.id) && m.actId && hl.some(function (a) { return a.id === m.actId; }); }).sort(rank(ratings)).slice(0, 1);
      hph.forEach(function (m) { used[m.id] = 1; });
      pages.push({ id: 'pghighlights', kind: 'highlights', layout: hph.length ? 'text-foto' : 'nur-text', slots: hph.map(slot), heading: 'Highlights', sub: '', text: '',
        items: hl.map(function (a) { return starItem(actById[a.id], a.stars); }) });
    }

    /* Zahlen der Reise: nur auf ausdrücklichen Wunsch, Werte aus der Kostenrechnung der App; unbekannt ist nicht 0 */
    if (opts.numbers === true) {
      var N = plain(ctx.numbers) ? ctx.numbers : null;
      if (!N) info.numbers = 'fehlt';
      else {
        var unknown = Number.isInteger(N.unknown) && N.unknown > 0 ? N.unknown : 0, nitems = [];
        if (finite(N.total) && N.total >= 0) nitems.push({ kind: 'fakt', label: unknown ? 'Gesamtkosten (mindestens)' : 'Gesamtkosten', value: euro(N.total) });
        else nitems.push({ kind: 'fakt', label: 'Gesamtkosten', value: 'unbekannt' });
        if (unknown) nitems.push({ kind: 'fakt', label: 'Posten ohne bekannten Preis', value: String(unknown) });
        if (finite(N.perPerson) && N.perPerson >= 0) nitems.push({ kind: 'fakt', label: unknown ? 'pro Person (mindestens)' : 'pro Person', value: euro(N.perPerson) });
        if (party.length && Array.isArray(N.shares)) N.shares.forEach(function (s) {
          if (s && own(partyName, s.partyId) && finite(s.amount)) nitems.push({ kind: 'fakt', label: 'Anteil ' + partyName[s.partyId], value: euro(s.amount) });
        });
        pages.push({ id: 'pgzahlen', kind: 'zahlen', layout: 'nur-text', slots: [], heading: 'Zahlen der Reise', sub: '', text: '', items: nitems });
        info.numbers = 'an';
      }
    }

    /* Schlussseite: freie Notiz (nur vom Nutzer, nichts erfunden) und ein noch nicht verwendetes Foto */
    var rest = media.filter(function (m) { return !own(used, m.id); });
    var last = rest.filter(function (m) { return m.fav; }).sort(byTime)[0] || rest.slice().sort(byTime)[rest.length - 1] || null;
    if (last) used[last.id] = 1;
    var note = str(opts.closingNote, LIMITS.text);
    pages.push({ id: 'pgschluss', kind: 'schluss', layout: last ? (note ? 'text-foto' : '1-gross') : 'nur-text', slots: last ? [slot(last)] : [], heading: 'Zum Schluss', sub: '', text: note, items: [] });

    info.unusedMedia = media.filter(function (m) { return !own(used, m.id); }).length;
    var tid = typeof t.id === 'string' ? t.id : '';
    var book = { id: opts.id || ('bk' + fnv(tid + '|' + RULE)), title: title, subtitle: subtitle, theme: theme, format: format,
      cover: { mediaId: cover ? cover.id : null }, pages: pages, draft: { rule: RULE, at: opts.at == null ? null : opts.at }, updatedAt: opts.at == null ? null : opts.at };
    return { book: book, info: info };
  }

  /* ---------- Vorschau als HTML (alles escaped; Bilder nur über eine vom Aufrufer gelieferte, geprüfte Adresse) ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function safeUrl(u) { return typeof u === 'string' && /^(https:|blob:|data:image\/(jpeg|png|webp);)/i.test(u) && !/[\s"'<>]/.test(u) ? u : null; }
  function para(text) { return String(text).split(/\n{2,}/).map(function (p) { return '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>'; }).join(''); }
  function renderHtml(book, opts) {
    opts = opts || {};
    if (!book || !Array.isArray(book.pages)) fail('Reisebuch fehlt.');
    var url = typeof opts.mediaUrl === 'function' ? opts.mediaUrl : function () { return null; };
    return '<article class="rp-book" data-theme="' + esc(book.theme) + '" data-format="' + esc(book.format) + '">' + book.pages.map(function (p) {
      var figs = (p.slots || []).map(function (s) {
        var u = safeUrl(url(s.mediaId)), cap = s.caption ? '<figcaption>' + esc(s.caption) + '</figcaption>' : '';
        return '<figure data-media-id="' + esc(s.mediaId) + '">' + (u ? '<img src="' + esc(u) + '" alt="' + esc(s.caption || 'Foto') + '">' : '<div class="rp-book-ph" role="img" aria-label="Foto (Vorschau nicht verfügbar)"></div>') + cap + '</figure>';
      }).join('');
      var items = (p.items || []).map(function (it) {
        if (it.kind === 'bewertung') return '<li><span aria-hidden="true">' + esc(it.glyphs) + '</span> <b>' + esc(it.title) + '</b> · ' + esc(it.text) + '</li>';
        if (it.kind === 'fakt') return '<li>' + esc(it.label) + ': <b>' + esc(it.value) + '</b></li>';
        if (it.kind === 'eintrag') return '<li><i>' + esc(it.label) + '</i>' + para(it.text) + '</li>';
        return '<li>' + esc(it.text) + '</li>';
      }).join('');
      return '<section class="rp-book-page" data-kind="' + esc(p.kind) + '" data-layout="' + esc(p.layout) + '" id="' + esc(p.id) + '">' +
        '<h2>' + esc(p.heading) + '</h2>' + (p.sub ? '<p class="rp-book-sub">' + esc(p.sub) + '</p>' : '') + figs +
        (p.text ? para(p.text) : '') + (items ? '<ul>' + items + '</ul>' : '') + '</section>';
    }).join('') + '</article>';
  }

  return { RULE: RULE, THEMES: THEMES, FORMATS: FORMATS, LIMITS: LIMITS, draft: draft, renderHtml: renderHtml, esc: esc, tripDays: tripDays, euro: euro };
});
