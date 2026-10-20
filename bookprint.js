/* Reiseplaner · Reisebuch als Druck und PDF (docs/PLAN_IOS_APP.md §7.4, Paket 9).
   Rechnet aus einem Reisebuch (Form aus bookgen.js/bookedit.js, SCHEMA_V4 §3) die Druckfassung:
     - feste Seitengrößen: A5 quer, A4 hoch, 21 × 21 cm (Format des Buchs, book.format)
     - Ränder je Format, gespiegelt für gebundene Bücher (innen breiter als außen)
     - Beschnittzugabe 0–5 mm (für Fotobuch-Dienste üblich 3 mm)
     - Seitenzahlen als Text (nicht auf Titel- und Leerseiten), linke und rechte Seiten
     - Auffüllen mit Leerseiten auf ein Vielfaches (gerade Seitenzahl, Heft: Vielfaches von 4) und Aufteilung in Druckbogen
     - Bildauflösung je Bildplatz in dpi gegen die Mindestgröße 200 dpi; unbekannte Bildgröße bleibt „unbekannt“
   plan, slotBoxes, resolution, css und html sind rein (kein DOM, keine Uhr, kein Speicher) und in Node testbar.
   printBook ist die einzige Funktion mit DOM: Sie hängt die Druckfassung kurz an die Seite, misst übervolle Seiten,
   öffnet den Druckdialog des Browsers (dort „Als PDF sichern“) und räumt danach wieder auf. Gespeichert wird nichts,
   keine Bibliothek, kein Netz. In der iOS-/Android-Hülle (WebView) öffnet window.print() keinen Dialog; dort braucht es
   später das native PDF-Plugin aus §7.4 (Hinweis code 'kein-druck', wenn print fehlt).
   Gedruckt werden nur Buchseiten aus RPBook.renderHtml: keine Bedienelemente, keine Hinweise, keine Buchungsnummern oder
   Notizen (die kommen durch bookgen nie ins Buch). Texte mit hartem Datenschutztreffer (IBAN, Kartennummer) verhindern
   den Druck; weiche Treffer (Wort „Buchungsnummer“ o. Ä.) kommen als Warnung zurück. Fehlende Fotos tragen den Text
   „Foto nicht verfügbar“, Bedeutung nie nur über Farbe.
   UMD wie bookgen.js: window.RPBookPrint im Browser, module.exports in Node. */
(function (root, factory) {
  var node = typeof module === 'object' && module.exports, B = null, V4 = null;
  if (node) { try { B = require('./bookgen.js'); } catch (e) { B = null; } try { V4 = require('./v4logic.js'); } catch (e) { V4 = null; } }
  else { B = root.RPBook || null; V4 = root.RPV4 || null; }
  var api = factory(B, V4);
  if (node) module.exports = api;
  else root.RPBookPrint = api;
})(typeof self !== 'undefined' ? self : this, function (B, V4) {
  'use strict';

  /* Endformat (beschnitten) in mm */
  var SIZES = {
    'a5-quer': { w: 210, h: 148, name: 'A5 quer (21 × 14,8 cm)' },
    'a4-hoch': { w: 210, h: 297, name: 'A4 hoch (21 × 29,7 cm)' },
    'quadrat-21': { w: 210, h: 210, name: 'Quadrat (21 × 21 cm)' }
  };
  /* Satzspiegel: unten mit Platz für die Seitenzahl, innen breiter für die Bindung */
  var MARGINS = {
    'a5-quer': { top: 12, bottom: 16, inner: 16, outer: 12 },
    'a4-hoch': { top: 18, bottom: 22, inner: 20, outer: 15 },
    'quadrat-21': { top: 15, bottom: 19, inner: 18, outer: 14 }
  };
  /* heim: Drucker zu Hause oder PDF zum Ansehen. fotobuch: PDF für einen Fotobuch-Dienst. heft: Rückstichheftung (gefaltete Bogen). */
  var MODES = {
    heim: { bleed: 0, mirror: false, multiple: 1, binding: 'einzelblatt', name: 'Zu Hause drucken oder als PDF ansehen' },
    fotobuch: { bleed: 3, mirror: true, multiple: 2, binding: 'einzelblatt', name: 'PDF für einen Fotobuch-Dienst (3 mm Beschnitt)' },
    heft: { bleed: 0, mirror: true, multiple: 4, binding: 'rueckstich', name: 'Gefaltetes Heft (Seitenzahl durch 4 teilbar)' }
  };
  var MULTIPLES = [1, 2, 4, 8, 16];
  var LIMITS = { bleedMax: 5, minDpi: 200, pages: 200, gap: 4 };
  /* Bildplätze je Layout als Anteil des Satzspiegels: [Breite (1 = volle, 0.5 = halbe Spalte), Höhe] */
  var SLOTS = {
    'nur-text': [], 'karte': [],
    '1-gross': [[1, 0.72]],
    'text-foto': [[1, 0.5]],
    '2-nebeneinander': [[0.5, 0.6], [0.5, 0.6]],
    '2-gestapelt': [[1, 0.34], [1, 0.34]],
    '3-mosaik': [[1, 0.4], [0.5, 0.3], [0.5, 0.3]],
    '4-raster': [[0.5, 0.32], [0.5, 0.32], [0.5, 0.32], [0.5, 0.32]]
  };

  var own = function (o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); };
  function fail(msg) { throw new Error(msg); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function mm(v) { return String(r1(v)) + 'mm'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------- Seitenplan ---------- */
  function plan(book, opts) {
    opts = opts || {};
    if (!book || typeof book !== 'object' || !Array.isArray(book.pages)) fail('Reisebuch fehlt.');
    if (!book.pages.length) fail('Das Reisebuch hat keine Seiten.');
    if (book.pages.length > LIMITS.pages) fail('Höchstens ' + LIMITS.pages + ' Seiten.');
    var format = book.format == null ? 'a5-quer' : book.format;
    if (!own(SIZES, format)) fail('Unbekanntes Buchformat.');
    var modeKey = opts.mode == null ? 'heim' : opts.mode;
    if (!own(MODES, modeKey)) fail('Unbekannte Druckart.');
    var mode = MODES[modeKey];
    var bleed = opts.bleed == null ? mode.bleed : opts.bleed;
    if (typeof bleed !== 'number' || !isFinite(bleed) || bleed < 0 || bleed > LIMITS.bleedMax) fail('Beschnittzugabe muss zwischen 0 und ' + LIMITS.bleedMax + ' mm liegen.');
    var multiple = opts.multiple == null ? mode.multiple : opts.multiple;
    if (MULTIPLES.indexOf(multiple) < 0) fail('Seitenzahl kann nur auf 1, 2, 4, 8 oder 16 aufgefüllt werden.');
    if (mode.binding === 'rueckstich' && multiple % 4) fail('Ein gefaltetes Heft braucht eine durch 4 teilbare Seitenzahl.');
    var mirror = typeof opts.mirror === 'boolean' ? opts.mirror : mode.mirror;
    var numbers = opts.numbers !== false;
    var size = SIZES[format], M = MARGINS[format];

    var list = book.pages.map(function (p) {
      if (!p || typeof p !== 'object') fail('Ungültige Seite im Reisebuch.');
      return { id: typeof p.id === 'string' ? p.id : null, kind: String(p.kind || 'frei'), layout: String(p.layout || 'nur-text'), blank: false };
    });
    var added = (multiple - list.length % multiple) % multiple;
    /* Leerseiten vor die Schlussseite, damit sie hinten bleibt; sonst ans Ende */
    var at = list.length > 1 && list[list.length - 1].kind === 'schluss' ? list.length - 1 : list.length;
    for (var k = 0; k < added; k++) list.splice(at, 0, { id: null, kind: 'leer', layout: 'nur-text', blank: true });

    var side = (M.inner + M.outer) / 2;
    var pages = list.map(function (p, i) {
      var n = i + 1, right = n % 2 === 1;
      var left = mirror ? (right ? M.inner : M.outer) : side, rgt = mirror ? (right ? M.outer : M.inner) : side;
      return { n: n, id: p.id, kind: p.kind, layout: p.layout, blank: p.blank, side: right ? 'rechts' : 'links',
        label: numbers && !p.blank && p.kind !== 'titel' ? String(n) : '', margin: { left: left, right: rgt } };
    });
    return {
      format: format, name: size.name, mode: modeKey, binding: mode.binding, mirror: mirror, numbers: numbers, multiple: multiple,
      trim: { w: size.w, h: size.h }, bleed: bleed, media: { w: size.w + 2 * bleed, h: size.h + 2 * bleed },
      margins: { top: M.top, bottom: M.bottom, inner: mirror ? M.inner : side, outer: mirror ? M.outer : side },
      content: { w: size.w - M.inner - M.outer, h: size.h - M.top - M.bottom },
      pages: pages, count: pages.length, added: added, sheets: imposition(pages.length, mode.binding)
    };
  }

  /* ---------- Druckbogen ----------
     einzelblatt: Blatt k trägt vorn Seite 2k-1, hinten Seite 2k (beidseitig, lose oder gebunden).
     rueckstich: ineinandergelegte, in der Mitte gefaltete Bogen mit je 4 Seiten; Bogen 1 ist der äußerste.
     Seiten als Nummern ab 1; null = Rückseite bleibt frei. */
  function imposition(count, binding) {
    if (!Number.isInteger(count) || count < 1) fail('Seitenzahl ungültig.');
    var out = [], s;
    if (binding === 'rueckstich') {
      if (count % 4) fail('Ein gefaltetes Heft braucht eine durch 4 teilbare Seitenzahl.');
      for (s = 0; s < count / 4; s++) out.push({ sheet: s + 1, front: [count - 2 * s, 2 * s + 1], back: [2 * s + 2, count - 2 * s - 1] });
      return out;
    }
    if (binding !== 'einzelblatt') fail('Unbekannte Bindung.');
    for (s = 0; 2 * s < count; s++) out.push({ sheet: s + 1, front: 2 * s + 1, back: 2 * s + 2 <= count ? 2 * s + 2 : null });
    return out;
  }

  /* ---------- Bildplätze und Auflösung ---------- */
  function slotBoxes(P, layout) {
    var c = P.content, half = (c.w - LIMITS.gap) / 2;
    return (SLOTS[layout] || []).map(function (f) { return { w: r1(f[0] === 1 ? c.w : half), h: r1(c.h * f[1]) }; });
  }
  /* dpi beim Füllen des Platzes (object-fit: cover): die knappere Richtung zählt. Zoom-Ausschnitt (crop) verkleinert die nutzbaren Pixel. */
  function resolution(book, media, P) {
    if (!P) P = plan(book);
    var byId = {};
    (Array.isArray(media) ? media : []).forEach(function (m) { if (m && typeof m.id === 'string' && !own(byId, m.id)) byId[m.id] = m; });
    var nOf = {};
    P.pages.forEach(function (p) { if (p.id) nOf[p.id] = p.n; });
    var out = [];
    book.pages.forEach(function (p) {
      var boxes = slotBoxes(P, p.layout);
      (Array.isArray(p.slots) ? p.slots : []).forEach(function (s, j) {
        if (!s || typeof s.mediaId !== 'string' || !s.mediaId || !boxes[j]) return;
        var m = own(byId, s.mediaId) ? byId[s.mediaId] : null, box = boxes[j];
        var c = s.crop && typeof s.crop === 'object' ? s.crop : { w: 1, h: 1 };
        var cw = typeof c.w === 'number' && c.w > 0 && c.w <= 1 ? c.w : 1, ch = typeof c.h === 'number' && c.h > 0 && c.h <= 1 ? c.h : 1;
        var row = { pageId: p.id, n: own(nOf, p.id) ? nOf[p.id] : null, slot: j, mediaId: s.mediaId, box: box, dpi: null, status: 'unbekannt' };
        if (m && Number.isInteger(m.w) && m.w > 0 && Number.isInteger(m.h) && m.h > 0) {
          row.dpi = Math.floor(Math.min(m.w * cw * 25.4 / box.w, m.h * ch * 25.4 / box.h));
          row.status = row.dpi >= LIMITS.minDpi ? 'ok' : 'niedrig';
        }
        out.push(row);
      });
    });
    return out;
  }
  function resolutionText(row) {
    var where = (row.n ? 'Seite ' + row.n : 'Seite') + ', Foto ' + (row.slot + 1) + ': ';
    if (row.status === 'unbekannt') return where + 'Bildgröße unbekannt, Druckqualität nicht prüfbar.';
    if (row.status === 'niedrig') return where + 'nur etwa ' + row.dpi + ' dpi bei ' + r1(row.box.w / 10).toString().replace('.', ',') + ' × ' + r1(row.box.h / 10).toString().replace('.', ',') + ' cm. Für den Druck sind mindestens ' + LIMITS.minDpi + ' dpi gut; das Foto kann unscharf wirken.';
    return '';
  }

  /* ---------- Datenschutz vor dem Druck ---------- */
  function privacy(book) {
    var f = V4 && typeof V4.privacyFindings === 'function' ? V4.privacyFindings(book) : [];
    return { hard: f.filter(function (x) { return x.hard; }), soft: f.filter(function (x) { return !x.hard; }), checked: !!V4 };
  }

  /* ---------- Druck-CSS (abhängig vom Seitenplan) ---------- */
  function css(P) {
    var b = P.bleed, out = [];
    out.push('@page{size:' + mm(P.media.w) + ' ' + mm(P.media.h) + ';margin:0}');
    out.push('#rp-print-root .rpp-page{width:' + mm(P.media.w) + ';height:' + mm(P.media.h) + ';padding-top:' + mm(b + P.margins.top) + ';padding-bottom:' + mm(b + P.margins.bottom) + '}');
    var sides = { rechts: P.pages.filter(function (p) { return p.side === 'rechts'; })[0], links: P.pages.filter(function (p) { return p.side === 'links'; })[0] };
    Object.keys(sides).forEach(function (s) {
      var p = sides[s]; if (!p) return;
      out.push('#rp-print-root .rpp-page[data-side="' + s + '"]{padding-left:' + mm(b + p.margin.left) + ';padding-right:' + mm(b + p.margin.right) + '}');
      /* Seitenzahl unten außen; ohne Spiegelung in der Mitte */
      var pos = !P.mirror ? 'left:0;right:0;text-align:center' : s === 'rechts' ? 'right:' + mm(b + p.margin.right) + ';text-align:right' : 'left:' + mm(b + p.margin.left) + ';text-align:left';
      out.push('#rp-print-root .rpp-page[data-side="' + s + '"] .rpp-num{bottom:' + mm(b + Math.max(4, P.margins.bottom / 2 - 2)) + ';' + pos + '}');
    });
    Object.keys(SLOTS).forEach(function (layout) {
      slotBoxes(P, layout).forEach(function (box, j) {
        out.push('#rp-print-root .rp-book-page[data-layout="' + layout + '"]>figure:nth-of-type(' + (j + 1) + ')>:is(img,.rp-book-ph){height:' + mm(box.h) + '}');
      });
    });
    return out.join('\n');
  }

  /* ---------- Druckfassung als HTML (nur Buchseiten) ---------- */
  function html(book, P, opts) {
    opts = opts || {};
    if (!B || typeof B.renderHtml !== 'function') fail('Druck braucht bookgen.js (RPBook).');
    if (!P) P = plan(book, opts);
    var byId = {};
    book.pages.forEach(function (p) { if (p && typeof p.id === 'string') byId[p.id] = p; });
    var mediaUrl = typeof opts.mediaUrl === 'function' ? opts.mediaUrl : function () { return null; };
    return P.pages.map(function (pp) {
      var attrs = ' data-side="' + pp.side + '" data-n="' + pp.n + '"';
      if (pp.blank) return '<div class="rpp-page rpp-blank"' + attrs + '></div>';
      var p = byId[pp.id];
      /* Die ID der Seite steht schon in der Vorschau; in der Druckfassung als data-Attribut, damit keine ID doppelt vorkommt */
      var page = B.renderHtml({ theme: book.theme, format: P.format, pages: [p] }, { mediaUrl: mediaUrl })
        .replace(' id="' + esc(p.id) + '"', ' data-page-id="' + esc(p.id) + '"');
      return '<div class="rpp-page"' + attrs + ' data-page-id="' + esc(p.id) + '">' + page +
        (pp.label ? '<p class="rpp-num">' + esc(pp.label) + '</p>' : '') + '</div>';
    }).join('');
  }

  /* ---------- Druckdialog (Browser) ---------- */
  function cleanup(d) {
    if (!d) return;
    ['rp-print-root', 'rp-print-style'].forEach(function (id) { var el = d.getElementById(id); if (el && el.parentNode) el.parentNode.removeChild(el); });
    if (d.documentElement && d.documentElement.classList) d.documentElement.classList.remove('rp-printing');
  }
  /* opts: mode, bleed, multiple, numbers, mediaUrl, media (für die Auflösung), confirm (trotz übervoller Seiten drucken).
     Ergebnis {ok:true, plan, overflow, warnings, resolution} oder {ok:false, code, error, pages?}. */
  function printBook(book, opts, env) {
    opts = opts || {}; env = env || {};
    var w = env.window || (typeof window !== 'undefined' ? window : null), d = env.document || (w && w.document) || null;
    if (!w || !d || typeof w.print !== 'function') return { ok: false, code: 'kein-druck', error: 'Drucken ist hier nicht möglich. Öffne den Planer im Browser; in der App folgt ein eigener Weg zum PDF.' };
    var P;
    try { P = plan(book, opts); } catch (e) { return { ok: false, code: 'ungueltig', error: e.message }; }
    var priv = privacy(book);
    if (priv.hard.length) return { ok: false, code: 'zahlungsdaten', error: 'Das Buch enthält Zahlungsdaten (IBAN oder Kartennummer). Bitte zuerst den Text ändern.' };
    var markup;
    try { markup = html(book, P, opts); } catch (e) { return { ok: false, code: 'ungueltig', error: e.message }; }
    cleanup(d);
    var style = d.createElement('style'); style.id = 'rp-print-style'; style.textContent = css(P);
    (d.head || d.body).appendChild(style);
    var el = d.createElement('div'); el.id = 'rp-print-root'; el.className = 'rp-print'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = markup; d.body.appendChild(el);
    /* Übervolle Seiten messen (Text oder Bildunterschriften zu lang): Abschneiden wäre stiller Verlust */
    var over = [];
    Array.prototype.forEach.call(el.querySelectorAll('.rpp-page[data-page-id]'), function (pg) {
      var inner = pg.querySelector('.rp-book-page');
      if (inner && inner.scrollHeight > inner.clientHeight + 1) over.push({ n: +pg.getAttribute('data-n'), pageId: pg.getAttribute('data-page-id') });
    });
    if (over.length && opts.confirm !== true) {
      cleanup(d);
      return { ok: false, code: 'ueberlauf', pages: over, error: (over.length === 1 ? 'Seite ' + over[0].n + ' ist' : 'Die Seiten ' + over.map(function (o) { return o.n; }).join(', ') + ' sind') + ' zu voll; im Druck würde Text abgeschnitten. Text kürzen, eine Seite einfügen oder trotzdem drucken.' };
    }
    d.documentElement.classList.add('rp-printing');
    var done = false, fin = function () { if (done) return; done = true; cleanup(d); if (w.removeEventListener) w.removeEventListener('afterprint', fin); };
    if (w.addEventListener) w.addEventListener('afterprint', fin);
    try { w.print(); } catch (e) { fin(); return { ok: false, code: 'fehler', error: 'Der Druckdialog ließ sich nicht öffnen.' }; }
    return { ok: true, plan: P, overflow: over, warnings: priv.soft, resolution: resolution(book, opts.media, P).filter(function (r) { return r.status !== 'ok'; }) };
  }

  return { SIZES: SIZES, MARGINS: MARGINS, MODES: MODES, LIMITS: LIMITS, SLOTS: SLOTS,
    plan: plan, imposition: imposition, slotBoxes: slotBoxes, resolution: resolution, resolutionText: resolutionText,
    privacy: privacy, css: css, html: html, printBook: printBook, cleanup: cleanup };
});
