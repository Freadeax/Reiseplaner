/* Reisebuch als Druck und PDF (PLAN_IOS_APP §7.4, Paket 9). Reiner Node-Test von bookprint.js mit echten
   bookgen-Entwürfen und einer DOM-Attrappe für den Druckdialog. Kein Browser-, Drucker-, Safari- oder iPhone-Test;
   echte PDF-Erzeugung in Chromium prüft tests/bookprint-browser.cjs. */
const assert = require('assert');
const P = require('../bookprint.js');
const B = require('../bookgen.js');
const V4 = require('../v4logic.js');
const C = x => JSON.parse(JSON.stringify(x));
const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
const AT = '2026-10-20T08:00:00.000Z';

/* Beispielreise (erfunden), mit privaten Feldern, die nie in der Druckfassung erscheinen dürfen */
const trip = {
  id: 'tdruck1', title: 'Winter im Allgäu', dateMode: 'fix', start: '2026-12-30', end: '2027-01-01', nights: 2, dest: 'Oberstaufen', schemaVersion: 4,
  notes: 'Buchungsnr HOTEL-4711-GEHEIM', offers: [{ id: 'of1', bookingRef: 'BKG-998877' }],
  party: [{ id: 'pa1x', name: 'Anna Geheimname' }],
  customActs: [{ id: 'therme', t: 'Therme', custom: true }],
  items: [{ uid: 'i1', act: 'therme', day: 0, slot: 'nachm' }],
  journal: { '2026-12-30': { text: 'Angekommen.' }, '2026-12-31': { text: 'Rodeln.' }, '2027-01-01': { text: 'Neujahr.' } },
  ratings: { therme: 5 },
  media: [
    { id: 'mfoto1', kind: 'photo', takenAt: '2026-12-30T15:00:00Z', lat: 47.123456, lon: 10.987654, w: 2048, h: 1536, caption: 'Ankunft', day: '2026-12-30', actId: 'therme', fav: true, hidden: false },
    { id: 'mfoto2', kind: 'photo', takenAt: '2026-12-31T10:00:00Z', w: 800, h: 600, caption: 'Klein', day: '2026-12-31', fav: false, hidden: false },
    { id: 'mfoto3', kind: 'photo', takenAt: '2027-01-01T10:00:00Z', caption: 'Ohne Größe', day: '2027-01-01', fav: false, hidden: false }
  ]
};
const book = deepFreeze(B.draft(trip, {}, { at: AT }).book);
const kinds = book.pages.map(p => p.kind);
assert.deepStrictEqual(kinds, ['titel', 'uebersicht', 'tag', 'tag', 'tag', 'highlights', 'schluss'], 'Ausgangsbuch mit 7 Seiten');
const withFormat = f => Object.assign(C(book), { format: f });

/* ---------- 1. Seitengrößen, Ränder, Seiten, Seitenzahlen ---------- */
{
  const p = P.plan(book);
  assert.strictEqual(p.format, 'a5-quer'); assert.strictEqual(p.mode, 'heim');
  assert.deepStrictEqual(p.trim, { w: 210, h: 148 }); assert.strictEqual(p.bleed, 0); assert.deepStrictEqual(p.media, { w: 210, h: 148 });
  assert.deepStrictEqual(p.content, { w: 182, h: 120 }, 'Satzspiegel A5 quer');
  assert.strictEqual(p.count, 7); assert.strictEqual(p.added, 0);
  assert.deepStrictEqual(p.pages.map(x => x.side), ['rechts', 'links', 'rechts', 'links', 'rechts', 'links', 'rechts'], 'Seite 1 ist rechts');
  p.pages.forEach(x => assert.deepStrictEqual(x.margin, { left: 14, right: 14 }, 'zu Hause: gleiche Ränder links und rechts'));
  assert.deepStrictEqual(p.pages.map(x => x.label), ['', '2', '3', '4', '5', '6', '7'], 'keine Seitenzahl auf der Titelseite');
  assert.deepStrictEqual(P.plan(book, { numbers: false }).pages.map(x => x.label), ['', '', '', '', '', '', ''], 'Seitenzahlen abschaltbar');
  assert.deepStrictEqual(P.plan(book), p, 'deterministisch');

  const a4 = P.plan(withFormat('a4-hoch'), { mode: 'fotobuch' });
  assert.deepStrictEqual(a4.trim, { w: 210, h: 297 }); assert.deepStrictEqual(a4.media, { w: 216, h: 303 }, 'A4 mit 3 mm Beschnitt je Seite');
  assert.deepStrictEqual(a4.content, { w: 175, h: 257 });
  assert.deepStrictEqual(a4.pages[0].margin, { left: 20, right: 15 }, 'rechte Seite: innen links breiter');
  assert.deepStrictEqual(a4.pages[1].margin, { left: 15, right: 20 }, 'linke Seite: innen rechts breiter');
  const q = P.plan(withFormat('quadrat-21'), { mode: 'fotobuch', bleed: 0 });
  assert.deepStrictEqual(q.trim, { w: 210, h: 210 }); assert.deepStrictEqual(q.media, { w: 210, h: 210 }); assert.deepStrictEqual(q.content, { w: 178, h: 176 });
  assert.strictEqual(P.plan(withFormat('a5-quer'), { bleed: 2.5 }).media.w, 215);
  assert.strictEqual(P.plan(Object.assign(C(book), { format: undefined })).format, 'a5-quer', 'ohne Format: A5 quer wie bookgen');

  for (const [o, re] of [[{ mode: 'poster' }, /Druckart/], [{ bleed: -1 }, /Beschnitt/], [{ bleed: 6 }, /Beschnitt/], [{ bleed: '3' }, /Beschnitt/],
    [{ multiple: 3 }, /aufgefüllt/], [{ mode: 'heft', multiple: 2 }, /durch 4/]]) assert.throws(() => P.plan(book, o), re, JSON.stringify(o));
  assert.throws(() => P.plan(withFormat('a3')), /Buchformat/);
  assert.throws(() => P.plan(null), /fehlt/);
  assert.throws(() => P.plan({ pages: [] }), /keine Seiten/);
  assert.throws(() => P.plan({ format: 'a5-quer', pages: Array.from({ length: 201 }, (_, i) => ({ id: 'pg' + i, kind: 'frei', layout: 'nur-text' })) }), /200/);
}

/* ---------- 2. Auffüllen mit Leerseiten, Schlussseite bleibt hinten ---------- */
{
  const f = P.plan(book, { mode: 'fotobuch' });
  assert.strictEqual(f.count, 8); assert.strictEqual(f.added, 1);
  assert.deepStrictEqual(f.pages.map(x => x.kind), ['titel', 'uebersicht', 'tag', 'tag', 'tag', 'highlights', 'leer', 'schluss'], 'Leerseite vor dem Schluss');
  assert.strictEqual(f.pages[6].label, '', 'keine Seitenzahl auf Leerseiten'); assert.strictEqual(f.pages[7].label, '8');
  const h = P.plan(book, { mode: 'heft' });
  assert.strictEqual(h.count, 8); assert.strictEqual(h.binding, 'rueckstich');
  const h16 = P.plan(book, { mode: 'heft', multiple: 16 });
  assert.strictEqual(h16.count, 16); assert.strictEqual(h16.pages.filter(x => x.blank).length, 9); assert.strictEqual(h16.pages[15].kind, 'schluss');
  const even = P.plan({ format: 'a5-quer', pages: book.pages.slice(0, 6) }, { mode: 'fotobuch' });
  assert.strictEqual(even.added, 0, 'gerade Seitenzahl bleibt');
  const noEnd = P.plan({ format: 'a5-quer', pages: book.pages.slice(0, 5) }, { mode: 'fotobuch' });
  assert.strictEqual(noEnd.pages[5].kind, 'leer', 'ohne Schlussseite: Leerseite am Ende');
}

/* ---------- 3. Druckbogen ---------- */
{
  assert.deepStrictEqual(P.imposition(8, 'rueckstich'), [{ sheet: 1, front: [8, 1], back: [2, 7] }, { sheet: 2, front: [6, 3], back: [4, 5] }]);
  for (const n of [4, 8, 12, 40]) {
    const seen = P.imposition(n, 'rueckstich').flatMap(s => s.front.concat(s.back)).sort((a, b) => a - b);
    assert.deepStrictEqual(seen, Array.from({ length: n }, (_, i) => i + 1), 'jede Seite genau einmal bei ' + n);
    P.imposition(n, 'rueckstich').forEach(s => { assert.strictEqual(s.front[0] + s.front[1], n + 1); assert.strictEqual(s.back[0] + s.back[1], n + 1); });
  }
  assert.deepStrictEqual(P.imposition(5, 'einzelblatt'), [{ sheet: 1, front: 1, back: 2 }, { sheet: 2, front: 3, back: 4 }, { sheet: 3, front: 5, back: null }]);
  assert.throws(() => P.imposition(6, 'rueckstich'), /durch 4/);
  assert.throws(() => P.imposition(0, 'einzelblatt'), /ungültig/);
  assert.throws(() => P.imposition(4, 'spirale'), /Bindung/);
  assert.strictEqual(P.plan(book, { mode: 'heft' }).sheets.length, 2);
  assert.strictEqual(P.plan(book).sheets.length, 4);
}

/* ---------- 4. Bildplätze und Auflösung (≥ 200 dpi) ---------- */
{
  const a4 = P.plan(withFormat('a4-hoch'));
  assert.deepStrictEqual(P.slotBoxes(a4, '1-gross'), [{ w: 175, h: 185 }]);
  assert.deepStrictEqual(P.slotBoxes(a4, '2-nebeneinander'), [{ w: 85.5, h: 154.2 }, { w: 85.5, h: 154.2 }]);
  assert.deepStrictEqual(P.slotBoxes(a4, 'nur-text'), []); assert.deepStrictEqual(P.slotBoxes(a4, 'unbekannt'), []);
  Object.keys(P.SLOTS).forEach(l => P.slotBoxes(a4, l).forEach(b => assert(b.w <= a4.content.w && b.h <= a4.content.h, l)));
  /* Je Layout passt die Summe der Bildhöhen in den Satzspiegel (Spalten nebeneinander zählen einmal) */
  for (const f of Object.keys(P.SIZES)) {
    const pl = P.plan(withFormat(f));
    const col = { '1-gross': [0], 'text-foto': [0], '2-nebeneinander': [0], '2-gestapelt': [0, 1], '3-mosaik': [0, 1], '4-raster': [0, 2] };
    Object.entries(col).forEach(([l, idx]) => { const bx = P.slotBoxes(pl, l); assert(idx.reduce((s, i) => s + bx[i].h, 0) < pl.content.h, f + ' ' + l); });
  }

  const res = P.resolution(book, trip.media, P.plan(book));
  const by = Object.fromEntries(res.map(r => [r.mediaId, r]));
  /* Titel A5 quer, 1-gross: 182 × 86,4 mm; 2048 × 1536 px → min(2048·25,4/182, 1536·25,4/86,4) = min(285, 451) */
  assert.strictEqual(by.mfoto1.pageId, 'pgtitel'); assert.strictEqual(by.mfoto1.n, 1);
  assert.strictEqual(by.mfoto1.dpi, 285); assert.strictEqual(by.mfoto1.status, 'ok');
  assert.strictEqual(by.mfoto2.status, 'niedrig'); assert(by.mfoto2.dpi < 200);
  assert.strictEqual(by.mfoto3.status, 'unbekannt', 'unbekannte Größe ist nicht „ok“'); assert.strictEqual(by.mfoto3.dpi, null);
  assert.match(P.resolutionText(by.mfoto2), /^Seite \d+, Foto 1: nur etwa \d+ dpi bei [\d,]+ × [\d,]+ cm\. Für den Druck sind mindestens 200 dpi gut/);
  assert.match(P.resolutionText(by.mfoto3), /Bildgröße unbekannt/);
  assert.strictEqual(P.resolutionText(by.mfoto1), '');
  /* Zoom halbiert die nutzbaren Pixel */
  const zoomed = C(book); zoomed.pages[0].slots[0].crop = { x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
  assert.strictEqual(P.resolution(zoomed, trip.media)[0].dpi, 142);
  assert.strictEqual(P.resolution(zoomed, trip.media)[0].status, 'niedrig');
  /* Foto nicht in der Mediathek: unbekannt */
  assert.strictEqual(P.resolution(book, [])[0].status, 'unbekannt');
}

/* ---------- 5. Druck-CSS ---------- */
{
  const c = P.css(P.plan(book, { mode: 'fotobuch' }));
  assert.match(c, /@page\{size:216mm 154mm;margin:0\}/, 'Seitengröße mit Beschnitt');
  assert.match(c, /\.rpp-page\{width:216mm;height:154mm;padding-top:15mm;padding-bottom:19mm\}/);
  assert.match(c, /\[data-side="rechts"\]\{padding-left:19mm;padding-right:15mm\}/);
  assert.match(c, /\[data-side="links"\]\{padding-left:15mm;padding-right:19mm\}/);
  assert.match(c, /\[data-layout="1-gross"\]>figure:nth-of-type\(1\)>:is\(img,\.rp-book-ph\)\{height:86\.4mm\}/);
  assert.match(P.css(P.plan(book)), /text-align:center/, 'ohne Spiegelung Seitenzahl mittig');
  assert(!/[<>]/.test(c.replace(/>figure|>:is|>:not/g, '')), 'keine Tags im CSS');
}

/* ---------- 6. Druckfassung: nur Buchseiten, nichts Privates ---------- */
{
  const pl = P.plan(book, { mode: 'fotobuch' });
  const h = P.html(book, pl, { mediaUrl: id => id === 'mfoto1' ? 'blob:https://example.invalid/1' : id === 'mfoto2' ? 'javascript:alert(1)' : null });
  assert.strictEqual((h.match(/class="rpp-page/g) || []).length, 8);
  assert.strictEqual((h.match(/rpp-blank/g) || []).length, 1);
  assert.strictEqual((h.match(/class="rpp-num"/g) || []).length, 6, 'Seitenzahlen außer Titel und Leerseite');
  assert(!/ id="/.test(h), 'keine doppelten IDs neben der Vorschau');
  book.pages.forEach(p => assert(h.includes('data-page-id="' + p.id + '"'), p.id));
  assert(!/<(button|input|select|textarea|details|form|script)\b/i.test(h), 'keine Bedienelemente');
  for (const s of ['GEHEIM', 'BKG-998877', 'Anna', '47.12', '10.98', 'Buchungsnr', 'javascript:']) assert(!h.includes(s), 'nicht enthalten: ' + s);
  assert(h.includes('src="blob:https://example.invalid/1"'));
  assert((h.match(/class="rp-book-ph"/g) || []).length >= 2, 'fehlende/abgelehnte Bilder als Platzhalter');
  assert(h.includes('5 von 5') || h.includes('Sterne'), 'Bewertung als Text, nicht nur Symbole');
  /* Bösartige Überschrift bleibt Text */
  const evil = C(book); evil.pages[1].heading = '<img src=x onerror=alert(1)>';
  assert(P.html(evil, P.plan(evil)).includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.throws(() => require('../bookprint.js').html({ pages: [] }), /keine Seiten/);
}

/* ---------- 7. Datenschutz ---------- */
{
  assert.deepStrictEqual(P.privacy(book), { hard: [], soft: [], checked: true });
  const soft = C(book); soft.pages[2].text = 'Die Buchungsnummer stand auf dem Zettel.';
  assert.strictEqual(P.privacy(soft).soft.length > 0, true);
  const hard = C(book); hard.pages[2].text = 'Zahlung an DE89 3704 0044 0532 0130 00';
  assert.strictEqual(P.privacy(hard).hard.length > 0, true);
  assert(V4.privacyFindings(hard).some(f => f.hard), 'gleiche Prüfung wie Format 4');
}

/* ---------- 8. Druckdialog mit DOM-Attrappe ---------- */
function fakeEnv(overfull) {
  const nodes = {}, listeners = {}, log = [];
  const cls = new Set();
  const mk = tag => {
    const el = { tag, id: '', className: '', attrs: {}, children: [], parentNode: null, textContent: '', _html: '',
      setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
      appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id) nodes[c.id] = c; return c; },
      removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; if (nodes[c.id] === c) delete nodes[c.id]; },
      set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
      querySelectorAll(sel) {
        assert.strictEqual(sel, '.rpp-page[data-page-id]');
        return [...this._html.matchAll(/<div class="rpp-page" data-side="\w+" data-n="(\d+)" data-page-id="([^"]+)"/g)].map(m => ({
          getAttribute: k => k === 'data-n' ? m[1] : m[2],
          querySelector: () => overfull.has(m[2]) ? { scrollHeight: 500, clientHeight: 400 } : { scrollHeight: 400, clientHeight: 400 }
        }));
      } };
    return el;
  };
  const document = { head: mk('head'), body: mk('body'), documentElement: { classList: { add: c => cls.add(c), remove: c => cls.delete(c), contains: c => cls.has(c) } },
    createElement: mk, getElementById: id => nodes[id] || null };
  const window = { document, print() { log.push({ root: !!nodes['rp-print-root'], style: nodes['rp-print-style'] ? nodes['rp-print-style'].textContent : null, cls: cls.has('rp-printing') }); },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); }, removeEventListener(t, f) { listeners[t] = (listeners[t] || []).filter(x => x !== f); },
    fire(t) { (listeners[t] || []).slice().forEach(f => f()); } };
  return { window, document, log, nodes, cls, listeners };
}
{
  assert.strictEqual(P.printBook(book, {}, { window: { document: {} } }).code, 'kein-druck', 'ohne window.print (App-Hülle) kein stiller Erfolg');

  const E = fakeEnv(new Set());
  const r = P.printBook(book, { mode: 'fotobuch', media: trip.media }, E);
  assert.strictEqual(r.ok, true); assert.strictEqual(E.log.length, 1, 'Druckdialog genau einmal');
  assert.deepStrictEqual({ root: E.log[0].root, cls: E.log[0].cls }, { root: true, cls: true }, 'beim Drucken: Druckfassung da, Klasse gesetzt');
  assert.match(E.log[0].style, /@page\{size:216mm 154mm/);
  assert.strictEqual(r.plan.count, 8);
  assert.deepStrictEqual(r.resolution.map(x => x.mediaId + ':' + x.status), ['mfoto2:niedrig', 'mfoto3:unbekannt'], 'Auflösung nur mit Hinweisbedarf');
  assert.strictEqual(E.nodes['rp-print-root'].getAttribute('aria-hidden'), 'true');
  E.window.fire('afterprint');
  assert(!E.nodes['rp-print-root'] && !E.nodes['rp-print-style'] && !E.cls.has('rp-printing'), 'nach dem Drucken aufgeräumt');
  assert.strictEqual((E.listeners.afterprint || []).length, 0, 'Listener entfernt');

  /* Ohne afterprint (manche Browser): nächster Druck räumt vorher auf, nie zwei Druckfassungen */
  const E2 = fakeEnv(new Set());
  P.printBook(book, {}, E2); P.printBook(book, {}, E2);
  assert.strictEqual(E2.document.body.children.filter(c => c.id === 'rp-print-root').length, 1);
  assert.strictEqual(E2.document.head.children.filter(c => c.id === 'rp-print-style').length, 1);

  /* Übervolle Seite: kein Druck ohne Bestätigung, nichts bleibt hängen */
  const E3 = fakeEnv(new Set(['pgueberblick']));
  const o = P.printBook(book, {}, E3);
  assert.strictEqual(o.ok, false); assert.strictEqual(o.code, 'ueberlauf'); assert.deepStrictEqual(o.pages, [{ n: 2, pageId: 'pgueberblick' }]);
  assert.match(o.error, /^Seite 2 ist zu voll/);
  assert.strictEqual(E3.log.length, 0); assert(!E3.nodes['rp-print-root'] && !E3.cls.has('rp-printing'));
  const o2 = P.printBook(book, { confirm: true }, E3);
  assert.strictEqual(o2.ok, true); assert.strictEqual(E3.log.length, 1); assert.deepStrictEqual(o2.overflow, [{ n: 2, pageId: 'pgueberblick' }]);

  /* Zahlungsdaten: kein Druck */
  const hard = C(book); hard.pages[2].text = 'Karte 4111 1111 1111 1111';
  const E4 = fakeEnv(new Set());
  assert.strictEqual(P.printBook(hard, {}, E4).code, 'zahlungsdaten'); assert.strictEqual(E4.log.length, 0); assert(!E4.nodes['rp-print-root']);
  /* Weiche Treffer: Druck geht, Warnung kommt zurück */
  const soft = C(book); soft.pages[2].text = 'Buchungsnummer liegt im Ordner.';
  const E5 = fakeEnv(new Set());
  const s = P.printBook(soft, {}, E5); assert.strictEqual(s.ok, true); assert(s.warnings.length > 0);
  /* Ungültige Einstellung: Meldung statt Ausnahme */
  assert.strictEqual(P.printBook(book, { bleed: 9 }, fakeEnv(new Set())).code, 'ungueltig');
  /* print wirft: aufgeräumt, Fehler gemeldet */
  const E6 = fakeEnv(new Set()); E6.window.print = () => { throw new Error('x'); };
  const f = P.printBook(book, {}, E6); assert.strictEqual(f.code, 'fehler'); assert(!E6.nodes['rp-print-root'] && !E6.cls.has('rp-printing'));
}

/* ---------- 9. Buch bleibt unverändert (eingefroren seit Beginn) ---------- */
assert.strictEqual(Object.isFrozen(book.pages[0]), true);

console.log('bookprint: alle Prüfungen bestanden');
