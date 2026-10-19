/* Reisebuch-Editor (PLAN_IOS_APP §7.3, Paket 6). Node-Test von bookedit.js mit echten Entwürfen aus bookgen.js und
   des App-Teils app/reisebuch.js mit kleiner DOM-Attrappe. Jeder Zustand wird gegen den Format-4-Vertrag geprüft.
   Kein Browser-, Druck- oder iPhone-Test. */
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const V4 = require('../v4logic.js');
const B = require('../bookgen.js');
const E = require('../bookedit.js');
const AT = '2026-10-19T08:00:00.000Z', AT2 = '2026-10-19T09:15:00.000Z';
const C = x => JSON.parse(JSON.stringify(x));
const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
let checked = 0;
/* Jeder Zustand besteht den Vertrag und enthält keine privaten Angaben (Kartenorte sind geplante Orte, keine Fotostandorte) */
const PRIVATE = ['HOTEL-4711-GEHEIM', 'BKG-998877', 'Geheimausgabe', 'geheimer/pfad', '47.123456', '10.987654', 'deadbeefcafe', 'Anna Geheimname', '"sha256"', '"by"', '"cloud"', '"bytes"'];
function ok(r, what) {
  assert(r && r.ok, (what || 'Schritt') + ': ' + (r && r.error));
  V4.validateBooks([r.state.book], trip.media);
  const s = JSON.stringify(r.state);
  PRIVATE.forEach(p => assert(!s.includes(p), (what || 'Schritt') + ' privat: ' + p));
  assert(Object.isFrozen(r.state.book) && Object.isFrozen(r.state.book.pages[0]), 'Zustand eingefroren');
  checked++;
  return r.state;
}
function no(r, code, re, before) {
  assert(r && !r.ok, 'sollte scheitern: ' + code);
  assert.strictEqual(r.code, code, r.error);
  if (re) assert.match(r.error, re);
  if (before) assert.strictEqual(r.state, before, 'Zustand unverändert');
  return r;
}
const ids = st => st.book.pages.map(p => p.id);

/* Beispielreise (erfunden, keine echten Buchungsdaten), mit privaten Feldern, die nie ins Buch dürfen */
const trip = {
  id: 'tbuch1', title: 'Winter im Allgäu', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', nights: 4, dest: 'Oberstaufen',
  schemaVersion: 4, persons: 2, notes: 'Buchungsnr HOTEL-4711-GEHEIM',
  offers: [{ id: 'of1', name: 'Pension Beispiel', bookingRef: 'BKG-998877', paid: 300 }],
  party: [{ id: 'pa1x', name: 'Anna Geheimname' }],
  expenses: [{ id: 'ex01', on: '2026-12-31', label: 'Geheimausgabe', amount: 66.66, paidBy: 'pa1x' }],
  customActs: [{ id: 'therme', t: 'Therme Oberstaufen', custom: true }, { id: 'rodeln', t: 'Rodeln am Hündle', custom: true }],
  items: [{ uid: 'i1', act: 'therme', day: 0, slot: 'nachm' }, { uid: 'i2', act: 'rodeln', day: 1, slot: 'morgen' }],
  journal: { '2026-12-30': { text: 'Angekommen. Abends Sauna.', mood: 4 }, '2026-12-31': { text: 'Rodeln und Feuerwerk.' }, '2027-01-02': { text: 'Ruhetag.' } },
  ratings: { therme: 5, rodeln: 4 },
  media: [
    { id: 'mbild1', kind: 'photo', takenAt: '2026-12-30T15:00:00Z', lat: 47.123456, lon: 10.987654, w: 2048, h: 1536, sha256: 'deadbeefcafe0001'.padEnd(64, '0'), caption: 'Ankunft', day: '2026-12-30', actId: 'therme', by: 'pa1x', cloud: { state: 'done', path: 'geheimer/pfad/m1.jpg' } },
    { id: 'mbild2', kind: 'photo', takenAt: '2026-12-31T10:00:00Z', w: 1536, h: 2048, caption: 'Schlitten', day: '2026-12-31', actId: 'rodeln', fav: true },
    { id: 'mbild3', kind: 'photo', takenAt: '2026-12-31T11:00:00Z', w: 1536, h: 2048, caption: 'Hütte', day: '2026-12-31' },
    { id: 'mbild4', kind: 'photo', takenAt: '2026-12-31T23:59:00Z', w: 2048, h: 1536, caption: 'Feuerwerk', day: '2026-12-31' },
    { id: 'mbild5', kind: 'photo', takenAt: '2026-12-31T12:00:00Z', w: 2048, h: 1536, day: '2026-12-31', hidden: true },
    { id: 'mbild7', kind: 'photo', takenAt: '2026-12-31T14:00:00Z', w: 2048, h: 1536, caption: 'Loipe', day: '2026-12-31' },
    { id: 'mbild6', kind: 'photo', takenAt: '2027-01-02T09:00:00Z', w: 2048, h: 1536, caption: 'Spaziergang', day: '2027-01-02' }
  ]
};
const draft = () => B.draft(trip, {}, { at: AT });
const begin = () => ok(E.start(draft().book, { media: trip.media, now: AT }), 'Start');

/* ---------- 1. Start: Entwurf aus bookgen, Eingabe bleibt unverändert, ohne Zeitpunkt kein erfundener ---------- */
{
  const d = draft(), frozen = deepFreeze(C(d.book)), before = C(d.book);
  const st = ok(E.start(frozen, { media: trip.media, now: AT }), 'Start eingefroren');
  assert.deepStrictEqual(C(frozen), before, 'Entwurf unverändert');
  assert.deepStrictEqual(C(st.book), before, 'Buch inhaltlich gleich');
  assert.deepStrictEqual([st.past.length, st.future.length, st.touched.length], [0, 0, 0]);
  assert(!E.canUndo(st) && !E.canRedo(st));
  assert(st.media.every(m => Object.keys(m).sort().join() === 'caption,day,fav,hidden,id,orient'), 'Fotos nur mit Editorfeldern');
  /* Entwurf ohne Zeit: start braucht now */
  const noAt = B.draft(trip, {});
  no(E.start(noAt.book, { media: trip.media }), 'vertrag', /Änderungszeit/);
  assert.strictEqual(ok(E.start(noAt.book, { media: trip.media, now: AT2 })).book.updatedAt, AT2);
  no(E.start(noAt.book, { media: trip.media, now: '2026-10-19' }), 'zeit');
  /* Verweis auf ein Foto, das es nicht gibt, oder Zahlungsdaten: abgelehnt */
  no(E.start(Object.assign(C(d.book), { cover: { mediaId: 'mfehlt1' } }), { media: trip.media }), 'vertrag', /gibt es in dieser Reise nicht/);
  no(E.start(Object.assign(C(d.book), { title: 'IBAN DE89 3704 0044 0532 0130 00' }), { media: trip.media }), 'vertrag', /Zahlungsdaten/);
  /* Textbuch ohne Fotos geht auch */
  const t0 = Object.assign(C(trip), { schemaVersion: 3, media: undefined });
  ok(E.start(B.draft(t0, {}, { at: AT }).book, { media: [], now: AT }), 'Textbuch');
}

/* ---------- 2. Verschieben, Löschen, Einfügen ---------- */
{
  const st = begin(), first = ids(st);
  const a = E.apply(st, { type: 'move', pageId: first[2], by: -1, at: AT2 });
  const s1 = ok(a, 'nach vorn');
  assert.deepStrictEqual(ids(s1), [first[0], first[2], first[1]].concat(first.slice(3)));
  assert.strictEqual(s1.book.updatedAt, AT2, 'Zeit vom Aufrufer');
  assert.strictEqual(a.page, first[2]);
  assert.deepStrictEqual(ids(st), first, 'alter Zustand unverändert');
  assert.deepStrictEqual(ids(ok(E.apply(st, { type: 'move', pageId: first[0], to: first.length - 1 }))), first.slice(1).concat([first[0]]), 'auf Position');
  assert.deepStrictEqual(ids(ok(E.apply(st, { type: 'move', pageId: first[1], to: 99 }))).slice(-1), [first[1]], 'Ziel wird begrenzt');
  no(E.apply(st, { type: 'move', pageId: first[0], by: -1 }), 'rand', /am Anfang/, st);
  no(E.apply(st, { type: 'move', pageId: first[first.length - 1], by: 1 }), 'rand', /am Ende/, st);
  no(E.apply(st, { type: 'move', pageId: 'pgnichtda', by: 1 }), 'seite', null, st);
  no(E.apply(st, { type: 'move', pageId: first[1] }), 'schritt', null, st);
  assert.strictEqual(E.apply(st, { type: 'move', pageId: first[1], by: 1 }).state.book.updatedAt, AT, 'ohne at bleibt updatedAt');

  const s2 = ok(E.apply(st, { type: 'delete', pageId: first[1] }), 'löschen');
  assert.deepStrictEqual(ids(s2), first.filter((x, i) => i !== 1));
  /* Bis auf eine Seite löschen, die letzte bleibt */
  let s = st; for (const id of first.slice(1)) s = ok(E.apply(s, { type: 'delete', pageId: id }));
  no(E.apply(s, { type: 'delete', pageId: first[0] }), 'letzte', /mindestens eine Seite/, s);

  const i1 = E.apply(st, { type: 'insert', after: first[0], heading: '  Unsere Hütte  ', text: 'Kamin\r\nund Tee' });
  const s3 = ok(i1, 'einfügen');
  const np = s3.book.pages[1];
  assert.deepStrictEqual(C(np), { id: 'pgfrei1', kind: 'frei', layout: 'nur-text', slots: [], heading: 'Unsere Hütte', sub: '', text: 'Kamin\nund Tee', items: [] });
  assert.strictEqual(i1.page, 'pgfrei1');
  const s4 = ok(E.apply(s3, { type: 'insert', index: 0, layout: '2-nebeneinander' }), 'einfügen mit Layout');
  assert.deepStrictEqual([s4.book.pages[0].id, s4.book.pages[0].slots.length], ['pgfrei2', 2], 'freie ID und leere Plätze');
  assert(s4.book.pages[0].slots.every(x => x.mediaId === null && x.crop === null && x.fit === 'cover'));
  assert(E.apply(s4, {}).ok === false);
  assert.strictEqual(ids(ok(E.apply(st, { type: 'insert' }))).slice(-1)[0], 'pgfrei1', 'ohne Ort ans Ende');
  no(E.apply(st, { type: 'insert', layout: 'karte' }), 'layout', /geplante Orte/, st);
  no(E.apply(st, { type: 'insert', layout: 'doppelseite' }), 'layout', /Unbekanntes Layout/, st);
  no(E.apply(st, { type: 'insert', after: 'pgweg1' }), 'seite', null, st);
  /* Grenze 200 Seiten */
  let big = st; while (big.book.pages.length < V4.LIMITS.pages) big = E.apply(big, { type: 'insert' }).state;
  V4.validateBooks([big.book], trip.media);
  no(E.apply(big, { type: 'insert' }), 'grenze', /200/, big);
  assert(E.HISTORY === 50 && big.past.length === 50, 'Verlauf auf 50 Schritte begrenzt');
}

/* ---------- 3. Layout wechseln: nichts verschwindet still ---------- */
{
  const st = begin();
  const day = st.book.pages.find(p => p.kind === 'tag' && p.slots.length >= 3);
  assert(day, 'Tag mit mehreren Fotos im Entwurf');
  const photos = day.slots.map(s => s.mediaId);
  const lc = E.layoutChoices(st, day.id);
  assert.deepStrictEqual(lc.map(c => c.layout), V4.LAYOUTS, 'alle Vertragslayouts');
  assert.strictEqual(lc.find(c => c.layout === 'karte').allowed, false, 'Karte nur mit Orten');
  assert.strictEqual(lc.find(c => c.layout === '1-gross').dropsPhotos, photos.length - 1);
  assert.strictEqual(lc.find(c => c.current).layout, day.layout);
  /* Mehr Plätze: leere Plätze kommen dazu */
  const s1 = ok(E.apply(st, { type: 'layout', pageId: day.id, layout: '4-raster' }), '4-raster');
  const p1 = s1.book.pages.find(p => p.id === day.id);
  assert.deepStrictEqual(p1.slots.map(s => s.mediaId), photos.concat(Array(4 - photos.length).fill(null)));
  /* Weniger Plätze: nur mit Bestätigung */
  const r = no(E.apply(s1, { type: 'layout', pageId: day.id, layout: '1-gross' }), 'bestaetigen', /fallen 2 Fotos/, s1);
  assert.deepStrictEqual(r.photos, photos.slice(1));
  const s2 = ok(E.apply(s1, { type: 'layout', pageId: day.id, layout: '1-gross', confirm: true }), 'bestätigt');
  assert.deepStrictEqual(s2.book.pages.find(p => p.id === day.id).slots.map(s => s.mediaId), [photos[0]], 'erstes Foto bleibt');
  /* Leere Plätze fallen zuerst weg, ohne Rückfrage */
  const holes = ok(E.apply(s1, { type: 'photo', pageId: day.id, slot: 0, mediaId: null }));
  const s3 = ok(E.apply(holes, { type: 'layout', pageId: day.id, layout: '2-gestapelt' }), 'leere zuerst');
  assert.deepStrictEqual(s3.book.pages.find(p => p.id === day.id).slots.map(s => s.mediaId), photos.slice(1, 3));
  /* Rückgängig holt die Fotos zurück, Wiederholen geht wieder vor */
  const u = ok(E.undo(s2), 'rückgängig');
  assert.deepStrictEqual(C(u.book), C(s1.book));
  assert(E.canRedo(u));
  assert.deepStrictEqual(C(ok(E.redo(u), 'wiederholen').book), C(s2.book));
  const u2 = ok(E.undo(u)); assert.deepStrictEqual(C(u2.book), C(st.book), 'zurück zum Start');
  no(E.undo(u2), 'nichts', /nichts rückgängig/, u2);
  assert.strictEqual(ok(E.apply(u, { type: 'title', text: 'Neu' })).future.length, 0, 'neuer Schritt verwirft Wiederholen');
  no(E.apply(st, { type: 'layout', pageId: day.id, layout: day.layout }), 'gleich', null, st);
  no(E.apply(st, { type: 'layout', pageId: day.id, layout: 'karte' }), 'layout', null, st);
  /* Karte bleibt auf der Übersicht mit Orten erlaubt */
  const withMap = ok(E.start(B.draft(trip, { map: [{ label: 'Oberstaufen', lat: 47.55, lon: 10.02 }] }, { at: AT }).book, { media: trip.media }));
  const ov = withMap.book.pages.find(p => p.kind === 'uebersicht');
  assert.strictEqual(ov.layout, 'karte');
  const s5 = ok(E.apply(withMap, { type: 'layout', pageId: ov.id, layout: 'nur-text' }));
  assert.strictEqual(s5.book.pages.find(p => p.id === ov.id).map.length, 1, 'Kartenorte bleiben erhalten');
  ok(E.apply(s5, { type: 'layout', pageId: ov.id, layout: 'karte' }), 'zurück zur Karte');
}

/* ---------- 4. Fotos tauschen, Ausschnitt, Titelbild ---------- */
{
  const st = begin();
  const day = st.book.pages.find(p => p.day === '2027-01-02');
  assert(day && day.slots.length === 1, 'Tag mit einem Foto');
  const ch = E.photoChoices(st, day.id);
  assert.strictEqual(ch[0].id, 'mbild6', 'Tagesauswahl zuerst'); assert(ch[0].sameDay);
  assert(!ch.some(c => c.id === 'mbild5'), 'ausgeblendet fehlt');
  assert(ch.every(c => !('lat' in c) && !('day' in c)), 'keine Standorte in der Auswahl');
  assert.strictEqual(ch[1].id, 'mbild2', 'dann Lieblingsfotos');
  assert(ch.find(c => c.id === 'mbild2').used, 'Titelbild zählt als verwendet');
  const s1 = ok(E.apply(st, { type: 'zoom', pageId: day.id, slot: 0, zoom: 2, x: 0.9, y: 0.1 }), 'Zoom');
  assert.deepStrictEqual(C(s1.book.pages.find(p => p.id === day.id).slots[0].crop), { x: 0.5, y: 0, w: 0.5, h: 0.5 }, 'Ausschnitt bleibt im Bild');
  assert.strictEqual(E.zoomOf(s1.book.pages.find(p => p.id === day.id).slots[0].crop), 2);
  for (const z of [1.3, 3, 4]) for (const x of [0, 0.37, 1]) ok(E.apply(st, { type: 'zoom', pageId: day.id, slot: 0, zoom: z, x, y: 1 - x }), 'Zoom ' + z);
  assert.strictEqual(ok(E.apply(s1, { type: 'zoom', pageId: day.id, slot: 0, zoom: 1 })).book.pages.find(p => p.id === day.id).slots[0].crop, null, 'Zoom 1 = ganzes Bild');
  no(E.apply(st, { type: 'zoom', pageId: day.id, slot: 0, zoom: 5 }), 'zoom', null, st);
  no(E.apply(st, { type: 'zoom', pageId: day.id, slot: 0, zoom: 2, x: 1.5 }), 'zoom', null, st);
  no(E.apply(st, { type: 'zoom', pageId: day.id, slot: 1, zoom: 2 }), 'seite', /Bildplatz/, st);
  /* Tauschen: Unterschrift kommt vom neuen Foto, Ausschnitt wieder ganz */
  const s2 = ok(E.apply(s1, { type: 'photo', pageId: day.id, slot: 0, mediaId: 'mbild3' }), 'tauschen');
  assert.deepStrictEqual(C(s2.book.pages.find(p => p.id === day.id).slots[0]), { mediaId: 'mbild3', crop: null, fit: 'cover', caption: 'Hütte' });
  no(E.apply(st, { type: 'photo', pageId: day.id, slot: 0, mediaId: 'mbild5' }), 'ausgeblendet', /ausgeblendet/, st);
  no(E.apply(st, { type: 'photo', pageId: day.id, slot: 0, mediaId: 'mfremd1' }), 'foto', null, st);
  no(E.apply(st, { type: 'photo', pageId: day.id, slot: 0, mediaId: 'mbild6' }), 'gleich', null, st);
  /* Doppelt verwendet: erlaubt, aber Hinweis */
  const dup = E.apply(st, { type: 'photo', pageId: day.id, slot: 0, mediaId: 'mbild2' });
  ok(dup); assert(dup.warnings.some(w => w.kind === 'doppelt' && w.mediaId === 'mbild2'));
  const empty = E.apply(st, { type: 'photo', pageId: day.id, slot: 0, mediaId: null });
  ok(empty); assert(empty.warnings.some(w => w.kind === 'leerer-platz'));
  no(E.apply(empty.state, { type: 'caption', pageId: day.id, slot: 0, text: 'x' }), 'leer');
  no(E.apply(empty.state, { type: 'zoom', pageId: day.id, slot: 0, zoom: 2 }), 'leer');
  /* Titelbild */
  assert.strictEqual(ok(E.apply(st, { type: 'cover', mediaId: 'mbild4' })).book.cover.mediaId, 'mbild4');
  assert.strictEqual(ok(E.apply(st, { type: 'cover', mediaId: null })).book.cover.mediaId, null);
  no(E.apply(st, { type: 'cover', mediaId: 'mbild5' }), 'ausgeblendet', null, st);
  no(E.apply(st, { type: 'cover', mediaId: 'mfremd1' }), 'foto', null, st);
  no(E.apply(st, { type: 'cover' }), 'foto', null, st);
}

/* ---------- 5. Texte: Titel, Überschrift, Bildunterschrift, Datenschutz ---------- */
{
  const st = begin(), day = st.book.pages.find(p => p.day === '2027-01-02');
  const s1 = ok(E.apply(st, { type: 'title', text: '  Silvester im Schnee ' }), 'Titel');
  assert.strictEqual(s1.book.title, 'Silvester im Schnee');
  no(E.apply(st, { type: 'title', text: '   ' }), 'text', /nicht leer/, st);
  no(E.apply(st, { type: 'title', text: 'x'.repeat(121) }), 'text', /höchstens 120/, st);
  no(E.apply(st, { type: 'title' }), 'text', null, st);
  assert.strictEqual(ok(E.apply(st, { type: 'subtitle', text: '' })).book.subtitle, '');
  assert.strictEqual(ok(E.apply(st, { type: 'heading', pageId: day.id, text: 'Ruhetag' })).book.pages.find(p => p.id === day.id).heading, 'Ruhetag');
  assert.strictEqual(ok(E.apply(st, { type: 'text', pageId: day.id, text: 'Lange geschlafen.' })).book.pages.find(p => p.id === day.id).text, 'Lange geschlafen.');
  no(E.apply(st, { type: 'text', pageId: day.id, text: 'y'.repeat(2001) }), 'text', /2000/, st);
  const c1 = ok(E.apply(st, { type: 'caption', pageId: day.id, slot: 0, text: 'Am See' }));
  assert.strictEqual(c1.book.pages.find(p => p.id === day.id).slots[0].caption, 'Am See');
  /* Harte Treffer (IBAN, Kartennummer) werden abgelehnt, Zustand bleibt */
  no(E.apply(st, { type: 'caption', pageId: day.id, slot: 0, text: 'Bezahlt mit 4111 1111 1111 1111' }), 'vertrag', /Zahlungsdaten/, st);
  no(E.apply(st, { type: 'heading', pageId: day.id, text: 'DE89370400440532013000' }), 'vertrag', /Zahlungsdaten/, st);
  no(E.apply(st, { type: 'insert', text: 'IBAN DE89-3704-0044-0532-0130-00' }), 'vertrag', /Zahlungsdaten/, st);
  /* Weiche Treffer: erlaubt, mit Hinweis */
  const soft = E.apply(st, { type: 'text', pageId: day.id, text: 'Buchungsnummer steht im Mailpostfach.' });
  ok(soft); assert(soft.warnings.some(w => w.kind === 'buchungsnummer' && /^pages\[\d+\]\.text$/.test(w.where)));
  /* Telefonnummern und Preise sind keine Zahlungsdaten */
  ok(E.apply(st, { type: 'text', pageId: day.id, text: 'Hütte: 08386 123456, Eintritt 24,50 €' }), 'Telefon');
  /* Gestaltung und Format */
  assert.strictEqual(ok(E.apply(st, { type: 'theme', theme: 'polaroid' })).book.theme, 'polaroid');
  no(E.apply(st, { type: 'theme', theme: 'Polaroid!' }), 'vertrag', null, st);
  assert.strictEqual(ok(E.apply(st, { type: 'format', format: 'a4-hoch' })).book.format, 'a4-hoch');
  no(E.apply(st, { type: 'format', format: 'a3' }), 'vertrag', null, st);
  no(E.apply(st, { type: 'title', text: 'x', at: '2026-10-19 08:00' }), 'zeit', null, st);
  no(E.apply(st, { type: 'unbekannt' }), 'schritt', null, st);
  no(E.apply(null, { type: 'title', text: 'x' }), 'zustand');
}

/* ---------- 6. Von Hand geändert (für späteres Neu-Generieren), Determinismus ---------- */
{
  const run = () => {
    let st = begin(); const p = ids(st);
    for (const op of [{ type: 'title', text: 'A' }, { type: 'move', pageId: p[3], by: -1 }, { type: 'heading', pageId: p[2], text: 'B' }, { type: 'title', text: 'C' }])
      st = ok(E.apply(st, op));
    return st;
  };
  const a = run(), b = run(), p = ids(begin());
  assert.deepStrictEqual(C(a), C(b), 'gleiche Schritte, gleicher Zustand');
  assert.deepStrictEqual(C(a.touched), ['buch', p[3], p[2]]);
  assert.deepStrictEqual(C(ok(E.undo(a)).touched), ['buch', p[3], p[2]], 'touched folgt dem Verlauf');
  assert.deepStrictEqual(C(ok(E.undo(ok(E.undo(a)))).touched), ['buch', p[3]]);
}

/* ---------- 7. App-Teil app/reisebuch.js (DOM-Attrappe, nichts wird gespeichert) ---------- */
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const integrated = html.includes('app/reisebuch.js');
  let code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '')
    .replace('function closeSheet(){', 'function closeSheet(){return;');
  if (!integrated) code += '\n' + fs.readFileSync(path.join(__dirname, '..', 'app', 'reisebuch.js'), 'utf8');
  const memory = new Map();
  const node = () => ({ innerHTML: '', hidden: false, style: {}, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k]; }, querySelector() { return { style: {} }; }, querySelectorAll() { return []; } });
  const dom = { '#view': node(), '#dock': node(), '#dock-nm': node(), '#dock-sum': node(), '#dock-bar': node(), '#app-nav': node() };
  const mk = mods => {
    const win = Object.assign({ addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js'), RPV3J: require('../v3journal.js'), RPV3S: require('../v3split.js') }, mods);
    const ctx = { window: win, history: { replaceState() {} },
      document: { addEventListener() {}, querySelector: s => dom[s] || null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, style: {} }), body: { appendChild() {}, style: {} } },
      localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) },
      setTimeout: () => 0, clearTimeout() {}, console, alert() {} };
    vm.createContext(ctx); vm.runInContext(code, ctx);
    return { a: win.__app, ctx };
  };
  /* Ohne Module: Hinweis statt Vorschau */
  {
    const { ctx } = mk({});
    const h = ctx.reisebuchSection([]);
    assert(/kann noch keine Reisebücher zeigen/.test(h) && /role="status"/.test(h));
  }
  const { a, ctx } = mk({ RPV4: V4, RPBook: B, RPBookEdit: E });
  assert(/Noch keine Reise angelegt/.test(ctx.reisebuchSection([])));
  const t = a.silvesterTemplate();
  t.id = 'tsilv1'; t.title = 'Silvester <b>im</b> Schnee'; t.schemaVersion = 3;
  const acts = [...new Set(t.items.filter(it => Number.isInteger(it.day)).map(it => it.act))].filter(id => { const x = a.ACTS[id] || (t.customActs || []).find(c => c.id === id); return x && !x.transit; });
  t.journal = { '2026-12-30': { text: 'Angekommen <img src=x onerror=alert(1)>', mood: 4 }, '2026-12-31': { text: 'Silvester!' } };
  t.ratings = { [acts[0]]: 5 };
  t.notes = 'Buchungsnr GEHEIM-123';
  a.Store.put(t, true);
  const stored = JSON.stringify(a.Store.get('tsilv1'));
  const t2 = a.newTrip({ id: 'tleer1', title: 'Leer', dateMode: 'open' }); a.Store.put(t2, true);
  const stored2 = JSON.stringify([...memory]);
  /* Kontext: Tage wie im Tagebuch, Unternehmungen mit Tagesindex, keine Kosten */
  const cx = ctx.reisebuchCtx(t);
  assert.deepStrictEqual(Object.keys(cx).sort(), ['acts', 'days']);
  assert.strictEqual(cx.days[0].date, '2026-12-30'); assert.strictEqual(cx.days.length, 5);
  assert(cx.acts.length && cx.acts.every(x => x.days.every(Number.isInteger)), 'Tagesindizes');
  /* Vor dem Entwurf: Auswahl, Knopf, ohne Entwurf */
  ctx.UI = a.UI; a.UI.view = 'erinnerungen';
  let h = ctx.reisebuchSection();
  assert(/data-book-act="make"/.test(h) && /<select id="book-trip"/.test(h) && !/data-book-draft/.test(h));
  assert(h.includes('Silvester &lt;b&gt;im&lt;/b&gt; Schnee') && !h.includes('<b>im</b>'), 'Titel escaped');
  const vals = { 'book-trip': 'tsilv1' }, val = id => vals[id] || '';
  assert.strictEqual(ctx.reisebuchAct('make', { now: AT }, val), '[data-book-pos]');
  h = ctx.reisebuchSection();
  assert(/data-book-draft=/.test(h) && /Entwurf, nicht gespeichert\./.test(h), 'deutlich als Entwurf markiert');
  assert(/Seite 1 von \d+/.test(h) && /data-book-act="prev"[^>]*disabled/.test(h));
  assert(!h.includes('<img src=x') && !h.includes('GEHEIM-123'), 'escaped, keine Notizen');
  const n = a.UI.book.st.book.pages.length;
  /* Blättern */
  ctx.reisebuchAct('next', {}, val); assert.strictEqual(a.UI.book.i, 1);
  assert(/Seite 2 von/.test(ctx.reisebuchSection()));
  ctx.reisebuchAct('goto', { i: String(n - 1) }, val); assert.strictEqual(a.UI.book.i, n - 1);
  ctx.reisebuchAct('next', {}, val); assert.strictEqual(a.UI.book.i, n - 1, 'nicht über das Ende');
  ctx.reisebuchAct('goto', { i: '999' }, val); assert.strictEqual(a.UI.book.i, n - 1);
  ctx.reisebuchAct('goto', { i: '1' }, val);
  /* Bearbeiten im Arbeitsspeicher */
  const p1 = a.UI.book.st.book.pages[1].id;
  ctx.reisebuchAct('up', { now: AT2 }, val);
  assert.strictEqual(a.UI.book.st.book.pages[0].id, p1); assert.strictEqual(a.UI.book.i, 0, 'Seite bleibt im Blick');
  assert(/nach vorn verschoben/.test(ctx.reisebuchSection()));
  ctx.reisebuchAct('undo', {}, val); assert.strictEqual(a.UI.book.st.book.pages[1].id, p1);
  ctx.reisebuchAct('redo', {}, val); assert.strictEqual(a.UI.book.st.book.pages[0].id, p1);
  ctx.reisebuchAct('insert', { now: AT2 }, val);
  assert.strictEqual(a.UI.book.st.book.pages[a.UI.book.i].id, 'pgfrei1', 'neue Seite geöffnet');
  vals['book-heading'] = 'Mein <i>Tag</i>'; ctx.reisebuchAct('heading', { now: AT2 }, val);
  h = ctx.reisebuchSection(); assert(h.includes('Mein &lt;i&gt;Tag&lt;/i&gt;') && !h.includes('<i>Tag</i>'));
  vals['book-title'] = ' '; ctx.reisebuchAct('title', {}, val);
  assert(/darf nicht leer sein/.test(a.UI.book.msg) && /role="status" data-book-msg>Der Buchtitel/.test(ctx.reisebuchSection()), 'Fehler sichtbar');
  vals['book-heading'] = 'Karte 4111 1111 1111 1111'; ctx.reisebuchAct('heading', {}, val);
  assert(/Zahlungsdaten/.test(a.UI.book.msg)); assert.strictEqual(a.UI.book.st.book.pages[a.UI.book.i].heading, 'Mein <i>Tag</i>');
  vals['book-layout'] = '2-nebeneinander'; ctx.reisebuchAct('layout', {}, val);
  assert.strictEqual(a.UI.book.st.book.pages[a.UI.book.i].layout, '2-nebeneinander');
  const before = a.UI.book.st.book.pages.length;
  ctx.reisebuchAct('del', {}, val);
  assert.strictEqual(a.UI.book.st.book.pages.length, before - 1); assert(/gelöscht\. Rückgängig ist möglich/.test(a.UI.book.msg));
  a.UI.book.st.book.pages.forEach((p, i) => { a.UI.book.i = i; const s = ctx.reisebuchSection(); assert(/data-book-page=/.test(s), 'Seite ' + i); });
  V4.validateBooks([a.UI.book.st.book], []);
  /* Andere Reise: Entwurf gehört nicht dazu, Textbuch ohne Tagebuch geht trotzdem */
  vals['book-trip'] = 'tleer1'; ctx.reisebuchAct('make', { now: AT }, val);
  assert.strictEqual(a.UI.book.tid, 'tleer1');
  assert(/4 Tage ohne Tagebuch, Bewertung und Foto sind nicht im Entwurf/.test(ctx.reisebuchSection()), 'leere Tage werden genannt');
  vals['book-trip'] = 'tgibtsnicht'; ctx.reisebuchAct('make', {}, val);
  assert(/nicht gefunden/.test(a.UI.bookError));
  ctx.reisebuchAct('discard', {}, val); assert.strictEqual(a.UI.book, null);
  /* Gespeicherte Daten unverändert: weder die Reise noch localStorage */
  assert.strictEqual(JSON.stringify(a.Store.get('tsilv1')), stored, 'Reise unverändert');
  assert.strictEqual(JSON.stringify([...memory]), stored2, 'nichts gespeichert');
  /* Fotos nur über reisebuchPhotoUrl mit sicherer Adresse */
  const tp = Object.assign(C(t), { id: 'tfoto1', schemaVersion: 4, media: [{ id: 'mfoto1', kind: 'photo', w: 100, h: 50, caption: 'See', day: '2026-12-30', fav: true }] });
  delete tp.notes;
  const r = ctx.reisebuchMake(tp, AT);
  assert(r.ok, r.error);
  /* Format-4-Reisen speichert die App noch nicht: Liste direkt übergeben */
  const sec = () => ctx.reisebuchSection(a.Store.list().concat([tp]));
  a.UI.book = r.book; a.UI.book.i = 0;
  assert(/rp-book-ph/.test(sec()), 'ohne Fotoablage Platzhalter');
  vm.runInContext("reisebuchPhotoUrl=id=>id==='mfoto1'?'blob:https://app/abc':null", ctx);
  assert(/<img src="blob:https:\/\/app\/abc"/.test(sec()));
  vm.runInContext("reisebuchPhotoUrl=()=>'javascript:alert(1)'", ctx);
  assert(!/javascript:/.test(sec()), 'unsichere Adresse verworfen');
  const tday = r.book.st.book.pages.find(p => p.day === '2026-12-30');
  a.UI.book.i = r.book.st.book.pages.indexOf(tday);
  assert(!/id="book-photo-0"/.test(sec()), 'Seite ohne Bildplatz: keine Fotoauswahl');
  vals['book-layout'] = 'text-foto'; ctx.reisebuchAct('layout', {}, val);
  h = sec();
  assert(/id="book-photo-0"/.test(h) && /See · dieser Tag/.test(h), 'Foto tauschen aus der Tagesauswahl');
  vals['book-photo-0'] = ''; ctx.reisebuchAct('photo', { slot: '0' }, val);
  assert.strictEqual(a.UI.book.st.book.pages[a.UI.book.i].slots[0].mediaId, null);
  vals['book-photo-0'] = 'mfoto1'; ctx.reisebuchAct('photo', { slot: '0' }, val);
  vals['book-caption-0'] = 'Am Alpsee'; ctx.reisebuchAct('caption', { slot: '0' }, val);
  assert.strictEqual(a.UI.book.st.book.pages[a.UI.book.i].slots[0].caption, 'Am Alpsee');
  /* Layout mit weniger Plätzen: Rückfrage, Abbrechen, Bestätigen */
  vals['book-layout'] = 'nur-text'; ctx.reisebuchAct('layout', {}, val);
  assert(a.UI.book.confirm && /fällt ein Foto/.test(a.UI.book.msg) && /data-book-act="layout-confirm"/.test(sec()));
  ctx.reisebuchAct('layout-cancel', {}, val); assert(!a.UI.book.confirm && a.UI.book.st.book.pages[a.UI.book.i].slots.length === 1);
  ctx.reisebuchAct('layout', {}, val); ctx.reisebuchAct('layout-confirm', {}, val);
  assert.strictEqual(a.UI.book.st.book.pages[a.UI.book.i].layout, 'nur-text');
  ctx.reisebuchAct('undo', {}, val); assert.strictEqual(a.UI.book.st.book.pages[a.UI.book.i].slots[0].mediaId, 'mfoto1', 'Rückgängig holt das Foto zurück');
  checked++;
}

console.log('Reisebuch-Editor: alle Prüfungen bestanden (' + checked + ' Zustände gegen Format 4 geprüft, App-Teil mit DOM-Attrappe).');
