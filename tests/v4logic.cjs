/* Datenvertrag v4: Fotos und Reisebücher (docs/SCHEMA_V4.md). Reine Node-Prüfung von v4logic.js,
   ohne App, ohne Datenbank, kein Browser- oder iPhone-Test. */
const assert = require('assert');
const V = require('../v4logic.js');
const C = x => JSON.parse(JSON.stringify(x));
let V3 = null; try { V3 = require('../v3logic.js'); } catch (e) { /* im Paketordner nicht vorhanden; dann Attrappe */ }
const needsV3 = V3 ? V3.needsV3 : t => !!(t && t.journal && Object.keys(t.journal).length);

const sha = c => c.repeat(64);
const photo = (id, s, extra) => Object.assign({ id, kind: 'photo', takenAt: '2026-12-31T23:41:05', w: 2048, h: 1536, bytes: 412345, sha256: sha(s),
  caption: '', day: '2026-12-31', fav: false, hidden: false, cloud: { state: 'none' } }, extra || {});
const book = extra => Object.assign({ id: 'buch1', title: 'Winter im Allgäu', subtitle: '30.12.2026 – 03.01.2027', theme: 'standard', format: 'a5-quer',
  cover: { mediaId: 'foto1' }, pages: [{ id: 'seite1', layout: '1-gross', slots: [{ mediaId: 'foto1', crop: { x: 0, y: 0.1, w: 1, h: 0.8 }, fit: 'cover' }],
  text: 'Silvester am Alpsee.', day: '2026-12-31' }], draft: { rule: 'bookgen-1', at: '2026-10-18T14:00:00Z' }, updatedAt: '2026-10-18T14:05:00.000Z' }, extra || {});
const trip = extra => Object.assign({ id: 't1', title: 'Allgäu', schemaVersion: 4, party: [{ id: 'pers1', name: 'A' }],
  media: [photo('foto1', 'a', { by: 'pers1', lat: 47.55, lon: 10.32, fav: true }), photo('foto2', 'b', { day: 'd2', takenAt: null })], books: [book()] }, extra || {});

/* ---------- 1. Fotos: gültige Einträge ---------- */
{
  assert(V.validateMedia(trip().media));
  assert(V.validateMedia(null) && V.validateMedia(undefined) && V.validateMedia([]));
  for (const t of ['2026-12-31T23:41', '2026-12-31T23:41:05.123Z', '2026-12-31T23:41:05+01:00', '2026-12-31T23:41:05-14:00', null])
    assert(V.validateMedia([photo('foto1', 'a', { takenAt: t })]), 'Aufnahmezeit ' + t);
  for (const d of [null, '2026-12-31', 'd0', 'd9999']) assert(V.validateMedia([photo('foto1', 'a', { day: d })]), 'Tag ' + d);
  assert(V.validateMedia([photo('foto1', 'a', { actId: 'act_12-x', spotId: 'innsbruck-nordkette', by: 'pers1' })]));
  assert(V.validateMedia([photo('foto1', 'a', { cloud: { state: 'done', path: 'a1b2-c3/foto1.jpg' } })]));
  for (const st of ['none', 'queued', 'error']) assert(V.validateMedia([photo('foto1', 'a', { cloud: { state: st } })]));
  assert(V.validateMedia([photo('foto1', 'a', { lat: -90, lon: 180 })]));
}

/* ---------- 2. Fotos: ungültige Einträge und Grenzen ---------- */
{
  const bad = (extra, re, msg) => assert.throws(() => V.validateMedia([photo('foto1', 'a', extra)]), re, msg);
  bad({ caption: 'x'.repeat(501) }, /500/, 'Bildunterschrift > 500');
  assert(V.validateMedia([photo('foto1', 'a', { caption: 'x'.repeat(500) })]), 'Bildunterschrift = 500');
  bad({ caption: null }, /Bildunterschrift/);
  bad({ kind: 'video' }, /photo/);
  for (const t of ['2026-02-30T10:00', '2026-12-31', '2026-12-31 23:41', '2026-12-31T24:00', '31.12.2026', 1735689600000, ''])
    bad({ takenAt: t }, /Aufnahmezeit/, 'Aufnahmezeit ' + t);
  bad({ lat: 47.5 }, /gemeinsam/); bad({ lat: 91, lon: 0 }, /Koordinaten/); bad({ lat: 0, lon: NaN }, /Koordinaten/); bad({ lat: '47', lon: 10 }, /Koordinaten/);
  for (const w of [0, -1, 20001, 2.5, '2048', NaN]) bad({ w }, /Bildgröße/, 'Breite ' + w);
  bad({ bytes: 0 }, /Dateigröße/); bad({ bytes: 25 * 1024 * 1024 + 1 }, /Dateigröße/);
  assert(V.validateMedia([photo('foto1', 'a', { bytes: 25 * 1024 * 1024 })]));
  bad({ sha256: 'A'.repeat(64) }, /Prüfsumme/); bad({ sha256: 'a'.repeat(63) }, /Prüfsumme/);
  for (const d of ['2026-13-01', 'd01', 'd10000', 'tag1', '']) bad({ day: d }, /Tag/, 'Tag ' + d);
  bad({ actId: '__proto__' }, /Unternehmung/); bad({ spotId: 'Innsbruck Nordkette' }, /Attraktion/); bad({ by: 'P1' }, /Person/);
  bad({ fav: 1 }, /fav/); bad({ hidden: 'false' }, /hidden/);
  bad({ cloud: { state: 'uploading' } }, /Cloud-Zustand/); bad({ cloud: null }, /Cloud/);
  bad({ cloud: { state: 'done' } }, /Pfad/, 'done ohne Pfad');
  bad({ cloud: { state: 'queued', path: 'x/foto1.jpg' } }, /nur im Zustand/);
  bad({ cloud: { state: 'done', path: 'x/foto2.jpg' } }, /Cloud-Pfad/, 'Pfad zu fremder ID');
  bad({ cloud: { state: 'done', path: '../foto1.jpg' } }, /Cloud-Pfad/);
  bad({ cloud: { state: 'none', token: 'abc' } }, /unbekanntes Feld/);
  bad({ data: 'data:image/jpeg;base64,/9j/' }, /unbekanntes Feld/, 'Bilddaten nie in der Reise-JSON');
  bad({ exif: { make: 'x' } }, /unbekanntes Feld/);
  assert.throws(() => V.validateMedia([photo('Foto1', 'a')]), /ungültige ID/);
  assert.throws(() => V.validateMedia([photo('foto1', 'a'), photo('foto1', 'b')]), /doppelte ID/);
  assert.throws(() => V.validateMedia([photo('foto1', 'a'), photo('foto2', 'a')]), /dasselbe Bild/, 'Prüfsumme verhindert Doppelimport');
  assert.throws(() => V.validateMedia({}), /Liste/);
  assert.throws(() => V.validateMedia([JSON.parse('{"__proto__":{"x":1},"id":"foto1"}')]), /unbekanntes Feld|ungültig/);
  const many = []; for (let i = 0; i < 2001; i++) many.push(photo('foto' + i, 'a', { sha256: i.toString(16).padStart(64, '0') }));
  assert.throws(() => V.validateMedia(many), /2000/); many.pop(); assert(V.validateMedia(many), '2000 Fotos erlaubt');
}

/* ---------- 3. Fotos: Normalisierung neuer Einträge ---------- */
{
  const n = V.normalizeMedia({ id: 'foto9', w: 400, h: 300, bytes: 30000, sha256: 'F'.repeat(64), caption: '  Gipfel  ', takenAt: '' });
  assert.deepStrictEqual(n, { id: 'foto9', kind: 'photo', takenAt: null, w: 400, h: 300, bytes: 30000, sha256: 'f'.repeat(64), caption: 'Gipfel', day: null, fav: false, hidden: false, cloud: { state: 'none' } });
  assert(!('lat' in n) && !('actId' in n), 'keine erfundenen Felder');
  assert.throws(() => V.normalizeMedia({ id: 'foto9', w: 400, h: 300, bytes: 1, sha256: sha('a'), caption: 'x'.repeat(501) }), /500/);
  assert.throws(() => V.normalizeMedia({ id: 'foto9', w: 400, h: 300, bytes: 1, sha256: sha('a'), gps: '47,10' }), /unbekanntes Feld/);
  assert.throws(() => V.normalizeMedia({ id: 'foto9', w: 400, h: 300, bytes: 1, sha256: sha('a'), lat: 47 }), /gemeinsam/);
  const s = V.stripLocation(trip().media);
  assert(!('lat' in s[0]) && !('lon' in s[0]) && trip().media[0].lat === 47.55, 'Standort nur in der Kopie entfernt');
}

/* ---------- 4. Reisebücher: gültig, ungültig, Grenzen ---------- */
{
  const t = trip();
  assert(V.validateBooks(t.books, t.media));
  assert(V.validateBooks(null) && V.validateBooks([]));
  assert(V.validateBooks([book({ cover: { mediaId: null }, draft: null, pages: [] })], t.media), 'leeres Buch ohne Titelbild');
  assert(V.validateBooks([book({ pages: [{ id: 'seite1', layout: 'nur-text', slots: [], text: '' }] })], t.media), 'Seite ohne Tag und Bild');
  assert(V.validateBooks([book({ pages: [{ id: 'seite1', layout: '2-nebeneinander', slots: [{ mediaId: null, crop: null, fit: 'contain' }], text: 'x', day: 'd3' }] })], t.media));
  const badB = (extra, re, msg) => assert.throws(() => V.validateBooks([book(extra)], t.media), re, msg);
  const page = (p, s) => ({ pages: [Object.assign({ id: 'seite1', layout: '1-gross', slots: [Object.assign({ mediaId: 'foto1', crop: null, fit: 'cover' }, s || {})], text: '' }, p || {})] });
  badB({ title: 'x'.repeat(121) }, /120/); assert(V.validateBooks([book({ title: 'x'.repeat(120) })], t.media));
  badB({ title: '   ' }, /Titel fehlt/); badB({ subtitle: 'x'.repeat(201) }, /200/);
  badB(page({ text: 'x'.repeat(2001) }), /2000/, 'Seitentext > 2000');
  assert(V.validateBooks([book(page({ text: 'x'.repeat(2000) }))], t.media), 'Seitentext = 2000');
  badB({ format: 'a4-quer' }, /Format/); badB({ theme: 'Winter Blau' }, /Gestaltung/);
  badB({ cover: {} }, /Titelbild/); badB({ cover: { mediaId: 'foto7' } }, /gibt es in dieser Reise nicht/);
  badB(page(null, { mediaId: 'foto7' }), /gibt es in dieser Reise nicht/);
  badB(page(null, { crop: { x: 0.5, y: 0, w: 0.6, h: 1 } }), /über das Bild/);
  badB(page(null, { crop: { x: 0, y: 0, w: 0, h: 1 } }), /Anteile/);
  badB(page(null, { crop: { x: 0, y: 0, w: 1 } }), /Anteile/);
  badB(page(null, { fit: 'stretch' }), /Einpassung/);
  const noCrop = page(); delete noCrop.pages[0].slots[0].crop; badB(noCrop, /Ausschnitt fehlt/);
  badB(page({ day: '2026-02-30' }), /Tag/); badB(page({ layout: '' }), /Layout/);
  badB({ draft: { rule: 'bookgen-1', at: '2026-10-18T14:00:00+02:00' } }, /Entwurfszeit/);
  badB({ updatedAt: '2026-10-18' }, /Änderungszeit/);
  badB({ pages: [{ id: 'seite1', layout: 'nur-text', slots: [], text: '' }, { id: 'seite1', layout: 'nur-text', slots: [], text: '' }] }, /doppelte ID/);
  const slots = []; for (let i = 0; i < 13; i++) slots.push({ mediaId: null, crop: null, fit: 'cover' });
  badB({ pages: [{ id: 'seite1', layout: '4-raster', slots, text: '' }] }, /12/);
  const pages = []; for (let i = 0; i < 201; i++) pages.push({ id: 'seite' + i, layout: 'nur-text', slots: [], text: '' });
  badB({ pages }, /200 Seiten/); pages.pop(); assert(V.validateBooks([book({ pages })], t.media), '200 Seiten erlaubt');
  const books = []; for (let i = 0; i < 21; i++) books.push(book({ id: 'buch' + i }));
  assert.throws(() => V.validateBooks(books, t.media), /20/); books.pop(); assert(V.validateBooks(books, t.media));
  assert.throws(() => V.validateBooks([book(), book()], t.media), /doppelte ID/);
}

/* ---------- 5. Keine Buchungsnummern oder Zahlungsdetails in Reisebüchern ---------- */
{
  const t = trip();
  /* keine Felder dafür, weder am Buch noch an Seite oder Platz */
  for (const f of ['bookingRef', 'bookingNo', 'paid', 'amount', 'iban', 'ledger', 'offers', 'notes'])
    assert.throws(() => V.validateBooks([book({ [f]: 'x' })], t.media), /unbekanntes Feld/, 'Buchfeld ' + f);
  assert.throws(() => V.validateBooks([book({ pages: [{ id: 'seite1', layout: 'nur-text', slots: [], text: '', paid: 120 }] })], t.media), /unbekanntes Feld/);
  assert.throws(() => V.validateBooks([book({ pages: [{ id: 'seite1', layout: 'nur-text', slots: [{ mediaId: null, crop: null, fit: 'cover', price: 3 }], text: '' }] })], t.media), /unbekanntes Feld/);
  /* harte Treffer im Text: gültige IBAN, Kartennummer */
  const withText = s => book({ pages: [{ id: 'seite1', layout: 'nur-text', slots: [], text: s }] });
  assert.throws(() => V.validateBooks([withText('Anzahlung an DE89 3704 0044 0532 0130 00 und fertig')], t.media), /Zahlungsdaten \(IBAN/);
  assert.throws(() => V.validateBooks([withText('DE89370400440532013000')], t.media), /IBAN/);
  assert.throws(() => V.validateBooks([book({ subtitle: 'Karte 4111 1111 1111 1111' })], t.media), /Kartennummer in subtitle/);
  assert.throws(() => V.validateBooks([withText('4111111111111111')], t.media), /Kartennummer/);
  /* weitere verbreitete Formate (Prüfbefund 18.10.) */
  for (const [txt, re] of [['Amex 3782 822463 10005', /Kartennummer/], ['Amex 378282246310005', /Kartennummer/], ['Diners 3056 930902 5904', /Kartennummer/],
    ['MC 2221000000000009', /Kartennummer/], ['MC 2221 0000 0000 0009', /Kartennummer/], ['DE89-3704-0044-0532-0130-00', /IBAN/], ['Konto de89 3704 0044 0532 0130 00.', /IBAN/]])
    assert.throws(() => V.validateBooks([withText(txt)], t.media), re, 'abgelehnt: ' + txt);
  /* Gegentests Telefonnummern in verschiedenen Schreibweisen (auch Luhn-gültige Ziffernfolgen außerhalb der Kartenformen) */
  const luhnPhone = '07161 123456 7'; /* Ziffern 071611234567 sind kein Kartenformat */
  for (const s of ['Tel. +49 7161 1234567', '+49-7161-1234567', '0049 7161 12345678', '07161/123456', luhnPhone, '+43 512 123456789', '(0711) 2222 1000 0000'])
    assert(V.validateBooks([withText(s)], t.media), 'Telefonnummer nicht gesperrt: ' + s);
  /* keine Fehlalarme: falsche Prüfziffer, Telefonnummer, Datum, Preise */
  for (const s of ['DE89 3704 0044 0532 0130 01', 'Tel. +49 7161 1234567890', '30.12.2026 bis 03.01.2027', 'Eintritt 24,50 €, 2 Personen', '4111 1111 1111 1112'])
    assert(V.validateBooks([withText(s)], t.media), 'kein Fehlalarm: ' + s);
  /* weiche Treffer: nur Hinweis vor Teilen/Export */
  const soft = V.privacyFindings(withText('Buchungsnummer 8XK2P, Bestätigungs-Nr. folgt, PNR ABC123'));
  assert(soft.length >= 1 && soft.every(f => !f.hard) && soft.some(f => f.kind === 'buchungsnummer'));
  assert(V.validateBooks([withText('Buchungsnummer 8XK2P')], t.media), 'Hinweiswort allein wird nicht abgelehnt');
  assert(V.bookWarnings(withText('IBAN folgt'), t.media).some(w => w.kind === 'zahlung'));
  assert.deepStrictEqual(V.privacyFindings(book()), [], 'Standardbuch ohne Treffer');
}

/* ---------- 6. Normalisierung neuer Bücher, Hinweise, Verweise ---------- */
{
  const t = trip();
  const b = V.normalizeBook({ id: 'buch2', title: ' Jahresbuch ', pages: [{ id: 'seite1', layout: '1-gross', slots: [{ mediaId: 'foto2' }] }] }, { now: '2026-10-18T15:00:00Z', media: t.media });
  assert.deepStrictEqual(b, { id: 'buch2', title: 'Jahresbuch', subtitle: '', theme: 'standard', format: 'a5-quer', cover: { mediaId: null },
    pages: [{ id: 'seite1', layout: '1-gross', slots: [{ mediaId: 'foto2', crop: null, fit: 'cover' }], text: '' }], draft: null, updatedAt: '2026-10-18T15:00:00Z' });
  assert.throws(() => V.normalizeBook({ id: 'buch2', title: 'x' }), /Änderungszeit/, 'ohne now und updatedAt keine erfundene Zeit');
  assert.throws(() => V.normalizeBook({ id: 'buch2', title: 'x', pages: [{ id: 'seite1', layout: 'nur-text', booking: 'x' }] }, { now: '2026-10-18T15:00:00Z' }), /unbekanntes Feld/);
  const hidden = C(t); hidden.media[0].hidden = true;
  const w = V.bookWarnings(hidden.books[0], hidden.media);
  assert(w.some(x => x.kind === 'ausgeblendet' && x.where === 'cover') && w.some(x => x.kind === 'ausgeblendet' && x.where === 'pages[0].slots[0]'));
  assert(V.validateReferences4(t));
  const strange = C(t); strange.media[0].by = 'pers9';
  assert.throws(() => V.validateReferences4(strange), /Person „pers9“/);
  const noParty = C(t); delete noParty.party;
  assert.throws(() => V.validateReferences4(noParty), /Person/);
}

/* ---------- 7. Foto entfernen ---------- */
{
  const t = trip();
  assert.deepStrictEqual(V.mediaUses(t, 'foto1'), [{ bookId: 'buch1', where: 'cover' }, { bookId: 'buch1', where: 'seite1:0' }]);
  const r1 = V.removeMedia(t, 'foto1');
  assert(!r1.ok && r1.uses.length === 2 && r1.trip === t, 'ohne Bestätigung keine Änderung');
  const r2 = V.removeMedia(t, 'foto1', { confirm: true });
  assert(r2.ok && r2.trip.media.length === 1 && r2.trip.books[0].cover.mediaId === null && r2.trip.books[0].pages[0].slots[0].mediaId === null);
  assert.deepStrictEqual(r2.trip.books[0].pages[0].slots[0].crop, { x: 0, y: 0.1, w: 1, h: 0.8 }, 'Ausschnitt bleibt');
  assert(V.validateV4(r2.trip) && t.media.length === 2, 'Original unverändert, Ergebnis gültig');
  const r3 = V.removeMedia(t, 'foto2');
  assert(r3.ok && r3.uses.length === 0);
  assert.throws(() => V.removeMedia(t, 'foto7'), /gibt es in dieser Reise nicht/);
}

/* ---------- 8. needsV4, Version, keine Rückstufung ---------- */
{
  assert(!V.needsV4(null) && !V.needsV4({}) && !V.needsV4({ media: [], books: [] }), 'leere Listen zählen nicht');
  assert(V.needsV4({ media: [photo('foto1', 'a')] }) && V.needsV4({ books: [book()] }));
  assert.strictEqual(V.targetVersion({ schemaVersion: 2 }, { needsV3 }), 2);
  assert.strictEqual(V.targetVersion({ schemaVersion: 2, journal: { d0: { text: 'x' } } }, { needsV3 }), 3);
  assert.strictEqual(V.targetVersion({ schemaVersion: 2, media: [photo('foto1', 'a')] }, { needsV3 }), 4);
  assert.strictEqual(V.targetVersion({ schemaVersion: 3, media: [photo('foto1', 'a')] }, { needsV3 }), 4);
  assert.strictEqual(V.targetVersion({ schemaVersion: 4, media: [], books: [] }, { needsV3 }), 4, 'einmal 4, immer 4');
  assert.strictEqual(V.targetVersion({ schemaVersion: 3 }), 3, 'v3 bleibt v3');
  assert.strictEqual(V.targetVersion({}), 2);
  assert(V.assertNoDowngrade(4, { schemaVersion: 4 }) && V.assertNoDowngrade(3, { schemaVersion: 4 }));
  assert.throws(() => V.assertNoDowngrade(4, { schemaVersion: 3 }), /zurückgestuft/);
  assert.throws(() => V.assertNoDowngrade(4, {}), /zurückgestuft/);
  /* serializeTrip4: unter Format 4 keine (auch leeren) Felder, Format 4 unverändert */
  const v3 = V.serializeTrip4({ schemaVersion: 3, media: [], books: [], journal: { d0: { text: 'x' } } });
  assert(!('media' in v3) && !('books' in v3) && v3.journal.d0.text === 'x');
  assert.throws(() => V.serializeTrip4({ schemaVersion: 3, media: [photo('foto1', 'a')] }), /Format 4/);
  const t = trip(), out = V.serializeTrip4(t);
  assert.deepStrictEqual(out, t); assert(out !== t && out.media !== t.media, 'Feldtreue als tiefe Kopie');
  const v4empty = V.serializeTrip4({ schemaVersion: 4, media: [], books: [] });
  assert.deepStrictEqual(v4empty, { schemaVersion: 4, media: [], books: [] }, 'Format 4 behält auch leere Listen');
  assert.throws(() => V.serializeTrip4({ schemaVersion: 5 }), /neuer/);
  /* validateV4 */
  assert(V.validateV4(trip()) && V.validateV4({ schemaVersion: 3 }) && V.validateV4({ schemaVersion: 2, media: [] }));
  assert.throws(() => V.validateV4({ schemaVersion: 3, media: [photo('foto1', 'a')] }), /erst ab Format 4/);
  assert.throws(() => V.validateV4(trip({ books: [book({ cover: { mediaId: 'foto7' } })] })), /nicht/);
  /* älterer Stand: nur lesen */
  assert.deepStrictEqual(V.readable(trip(), 3), { ok: false, newer: true, schema: 4 });
  assert.deepStrictEqual(V.readable(trip()), { ok: true, newer: false, schema: 4 });
  assert.deepStrictEqual(V.readable({}, 3), { ok: true, newer: false, schema: 2 });
}

/* ---------- 9. Export .reiseplaner (ZIP-Inhalt) und Import-Prüfung ---------- */
{
  const t = trip(), copyTrip = Object.assign(C(t), { id: 't2', title: 'Allgäu (Kopie)' });
  const p = V.archivePlan([t, copyTrip, { id: 't3', schemaVersion: 2 }], { now: '2026-10-18T15:00:00Z' });
  assert.deepStrictEqual(p.entries.map(e => e.path), ['manifest.json', 'trips.json', 'media/foto1.jpg', 'thumbs/foto1.jpg', 'media/foto2.jpg', 'thumbs/foto2.jpg'], 'Konfliktkopie teilt die Datei');
  assert.strictEqual(p.manifest.format, 'reiseplaner-archiv'); assert.strictEqual(p.manifest.schemaMax, 4); assert.strictEqual(p.manifest.trips, 3);
  assert.strictEqual(p.trips[0].media[0].lat, 47.55, 'Sicherung behält Standort ohne ausdrückliche Wahl');
  assert(p.trips[0] !== t);
  const s = V.archivePlan([t], { stripLocation: true });
  assert(!('lat' in s.trips[0].media[0]) && s.manifest.locationStripped && t.media[0].lat === 47.55);
  const clash = C(copyTrip); clash.media[0].sha256 = sha('c');
  assert.throws(() => V.archivePlan([t, clash]), /zwei verschiedene Bilder/);
  assert.throws(() => V.archivePlan([{ schemaVersion: 3, media: [photo('foto1', 'a')] }]), /Format 4/);
  /* Import */
  const names = p.entries.map(e => e.path);
  assert.deepStrictEqual(V.checkArchive(names, p.manifest, p.trips), { ok: true, missing: [], missingThumbs: [], orphans: [] });
  const r = V.checkArchive(['manifest.json', 'trips.json', 'media/', 'media/foto1.jpg', 'thumbs/foto1.jpg', 'media/fremd1.jpg'], p.manifest, p.trips);
  assert.deepStrictEqual(r, { ok: true, missing: ['foto2'], missingThumbs: ['foto2'], orphans: ['media/fremd1.jpg'] }, 'fehlende Datei wird gemeldet, nicht verschwiegen');
  for (const bad of ['../trips.json', 'media/../../x.jpg', '/etc/passwd', 'media\\foto1.jpg', 'media/foto1.png', 'media/sub/foto1.jpg', 'script.js', 'Media/foto1.jpg'])
    assert.throws(() => V.checkArchive(['manifest.json', 'trips.json', bad], p.manifest, p.trips), /unerwartete Datei|ungültiger Dateiname/, 'Pfad ' + bad);
  assert.throws(() => V.checkArchive(['trips.json'], p.manifest, p.trips), /manifest/);
  assert.throws(() => V.checkArchive(['manifest.json', 'trips.json', 'trips.json'], p.manifest, p.trips), /doppelt/);
  assert.throws(() => V.checkArchive(names, Object.assign({}, p.manifest, { archiveVersion: 2 }), p.trips), /neueren Stand/);
  assert.throws(() => V.checkArchive(names, { format: 'zip' }, p.trips), /keine Reiseplaner/);
  assert.throws(() => V.checkArchive(new Array(V.LIMITS.archiveEntries + 1).fill('x'), p.manifest, p.trips), /zu viele/);
}

/* ---------- 10. Seitenfelder des Erstentwurfs (bookgen.js): kind, heading, sub, items, map, slots[].caption ---------- */
{
  const t = trip();
  const pg = p => book({ pages: [Object.assign({ id: 'seite1', kind: 'tag', layout: 'text-foto', slots: [{ mediaId: 'foto1', crop: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', caption: 'Alpsee' }],
    heading: 'Tag 2 · Do., 31.12.2026', sub: 'Immenstadt', text: 'x', items: [], day: '2026-12-31' }, p || {})] });
  assert(V.validateBooks([pg()], t.media));
  for (const k of V.PAGE_KINDS) assert(V.validateBooks([pg({ kind: k })], t.media), 'Seitenart ' + k);
  for (const l of ['nur-text', 'text-foto', '1-gross', '2-nebeneinander', '2-gestapelt', '3-mosaik', '4-raster', 'karte']) assert(V.validateBooks([pg({ layout: l })], t.media), 'Layout ' + l);
  const badP = (p, re, msg) => assert.throws(() => V.validateBooks([pg(p)], t.media), re, msg);
  badP({ kind: 'kosten' }, /Seitenart/); badP({ layout: 'eins-gross' }, /Layout/); badP({ layout: '5-raster' }, /Layout/);
  badP({ heading: 'x'.repeat(121) }, /120/); assert(V.validateBooks([pg({ heading: 'x'.repeat(120) })], t.media));
  badP({ sub: 'x'.repeat(201) }, /200/); badP({ heading: 5 }, /Text/);
  badP({ slots: [{ mediaId: 'foto1', crop: null, fit: 'cover', caption: 'x'.repeat(501) }] }, /500/, 'Platz-Bildunterschrift > 500');
  assert(V.validateBooks([pg({ slots: [{ mediaId: 'foto1', crop: null, fit: 'cover', caption: 'x'.repeat(500) }] })], t.media));
  /* items */
  const items = [{ kind: 'fakt', label: 'Reisetage', value: '5' }, { kind: 'stimmung', text: 'Stimmung: großartig' },
    { kind: 'eintrag', label: 'Früherer Eintrag für Tag 3 (vor dem Festlegen der Daten)', text: 'Schneeschuhwandern' },
    { kind: 'bewertung', actId: 'act_alpsee', title: 'Alpsee-Rundweg', stars: 5, glyphs: '★★★★★', text: '5 von 5 Sternen' },
    { kind: 'plan', title: 'Therme', text: 'Auf dem Plan: Therme' }];
  assert(V.validateBooks([pg({ items })], t.media));
  badP({ items: [{ kind: 'zahlung', label: 'x' }] }, /Art unbekannt/);
  badP({ items: [{ label: 'x' }] }, /Art unbekannt/);
  badP({ items: [{ kind: 'fakt', label: 'Buchung', bookingRef: 'X1' }] }, /unbekanntes Feld/, 'kein Feld für Buchungsnummern in items');
  badP({ items: [{ kind: 'fakt', amount: 12 }] }, /unbekanntes Feld/);
  for (const n of [0, 6, 2.5, '5']) badP({ items: [{ kind: 'bewertung', stars: n }] }, /Sterne/, 'Sterne ' + n);
  badP({ items: [{ kind: 'bewertung', actId: '__proto__' }] }, /Unternehmung/);
  badP({ items: [{ kind: 'fakt', label: 'x'.repeat(201) }] }, /200/); badP({ items: [{ kind: 'fakt', value: 'x'.repeat(81) }] }, /80/);
  badP({ items: [{ kind: 'plan', title: 'x'.repeat(121) }] }, /120/); badP({ items: [{ kind: 'eintrag', text: 'x'.repeat(2001) }] }, /2000/);
  badP({ items: [{ kind: 'bewertung', glyphs: '★'.repeat(11) }] }, /10/);
  badP({ items: Array.from({ length: 101 }, () => ({ kind: 'fakt', label: 'a', value: '1' })) }, /100 Angaben/);
  assert(V.validateBooks([pg({ items: Array.from({ length: 100 }, () => ({ kind: 'fakt', label: 'a', value: '1' })) })], t.media), '100 Angaben erlaubt');
  badP({ items: {} }, /Angaben/);
  /* map: geplante Orte, ≤ 50 */
  const map = [{ label: 'Immenstadt', lat: 47.56, lon: 10.22 }, { label: '', lat: -90, lon: 180 }];
  assert(V.validateBooks([pg({ layout: 'karte', map })], t.media));
  badP({ map: Array.from({ length: 51 }, () => ({ label: 'a', lat: 1, lon: 1 })) }, /50 Kartenorte/);
  assert(V.validateBooks([pg({ map: Array.from({ length: 50 }, () => ({ label: 'a', lat: 1, lon: 1 })) })], t.media));
  badP({ map: [{ label: 'x'.repeat(81), lat: 1, lon: 1 }] }, /80/); badP({ map: [{ label: 'a', lat: 91, lon: 1 }] }, /Koordinaten/);
  badP({ map: [{ lat: 1, lon: 1 }] }, /Bezeichnung/); badP({ map: [{ label: 'a', lat: 1, lon: 1, mediaId: 'foto1' }] }, /unbekanntes Feld/);
  /* stripLocation betrifft nur Fotos, nicht die Kartenorte */
  const tt = trip({ books: [pg({ layout: 'karte', map })] });
  const a = V.archivePlan([tt], { stripLocation: true });
  assert(!('lat' in a.trips[0].media[0]) && a.trips[0].books[0].pages[0].map[0].lat === 47.56, 'Kartenorte bleiben');
  /* Datenschutzprüfung greift auf alle Texte: items, heading, sub, Platz-Bildunterschrift, Kartenort */
  const iban = 'DE89 3704 0044 0532 0130 00';
  badP({ items: [{ kind: 'fakt', label: 'Konto', value: 'DE89370400440532013000' }] }, /IBAN in pages\[0\]\.items\[0\]\.value/);
  badP({ items: [{ kind: 'eintrag', text: 'Bezahlt mit 4111 1111 1111 1111' }] }, /Kartennummer in pages\[0\]\.items\[0\]\.text/);
  badP({ heading: iban }, /IBAN in pages\[0\]\.heading/); badP({ sub: iban }, /IBAN in pages\[0\]\.sub/);
  badP({ slots: [{ mediaId: 'foto1', crop: null, fit: 'cover', caption: iban }] }, /IBAN in pages\[0\]\.slots\[0\]\.caption/);
  badP({ map: [{ label: '4111111111111111', lat: 1, lon: 1 }] }, /Kartennummer/);
  const f = V.privacyFindings(pg({ items: [{ kind: 'eintrag', label: 'Reservierungsnummer', text: 'kommt per Mail' }] }));
  assert(f.some(x => x.field === 'pages[0].items[0].label' && x.kind === 'buchungsnummer' && !x.hard));
  /* Zahlenseite aus bookgen: Beträge sind keine Zahlungsdetails */
  assert(V.validateBooks([pg({ kind: 'zahlen', layout: 'nur-text', slots: [], items: [{ kind: 'fakt', label: 'Gesamtkosten (mindestens)', value: '1.234,56 €' }, { kind: 'fakt', label: 'Anteil A', value: '617,28 €' }] })], t.media));
  /* Entwurf ohne Zeitpunkt: draft.at null erlaubt, updatedAt nur aus now */
  assert(V.validateBooks([book({ draft: { rule: 'bookgen-1', at: null } })], t.media));
  /* normalizeBook übernimmt die neuen Felder als Kopie */
  const nb = V.normalizeBook({ id: 'buch3', title: 'x', pages: [{ id: 'seite1', kind: 'uebersicht', layout: 'karte', heading: 'Überblick', items: [items[0]], map }] }, { now: '2026-10-18T15:00:00Z', media: t.media });
  assert.deepStrictEqual(nb.pages[0], { id: 'seite1', layout: 'karte', slots: [], text: '', kind: 'uebersicht', heading: 'Überblick', items: [items[0]], map });
  assert(nb.pages[0].map !== map, 'Kopie, keine geteilte Referenz');
}

/* ---------- 11. Abgleich mit bookgen.js (nur wenn bookgen.js und v3journal.js neben v4logic.js liegen) ---------- */
let BG = null; try { BG = require('../bookgen.js'); } catch (e) { /* im Paketordner nicht vorhanden */ }
if (BG) {
  const media = [];
  for (let i = 0; i < 9; i++) media.push(photo('foto' + i, 'a', { sha256: (i + 1).toString(16).padStart(64, '0'), day: '2026-12-' + String(30 + (i % 2)).padStart(2, '0'), takenAt: '2026-12-3' + (i % 2) + 'T1' + i + ':00:00', actId: i < 3 ? 'actalpsee' : undefined, fav: i === 4, h: i % 2 ? 3000 : 1000, caption: 'Bild ' + i }));
  media.forEach(m => { if (m.actId === undefined) delete m.actId; });
  const t = { id: 'tripbg', title: 'Winter im Allgäu', dest: 'Immenstadt', schemaVersion: 4, dateMode: 'fix', start: '2026-12-30', end: '2027-01-03',
    party: [{ id: 'pers1', name: 'A' }, { id: 'pers2', name: 'B' }],
    journal: { '2026-12-30': { text: 'Anreise im Schnee.', mood: 4 }, '2026-12-31': { text: 'Silvester am Alpsee.' }, d7: { text: 'alter Eintrag', mood: 2 } },
    ratings: { actalpsee: 5, acttherme: 4 }, media };
  const ctx = { acts: [{ id: 'actalpsee', title: 'Alpsee-Rundweg', days: [1] }, { id: 'acttherme', title: 'Therme', days: [2] }, { id: 'actrodeln', title: 'Rodeln', days: [3] }],
    km: 412, numbers: { total: 1234.56, unknown: 1, perPerson: 617.28, shares: [{ partyId: 'pers1', amount: 617.28 }] },
    map: [{ label: 'Hattenhofen', lat: 48.66, lon: 9.57 }, { label: 'Immenstadt', lat: 47.56, lon: 10.22 }] };
  for (const opts of [{ at: '2026-10-18T15:00:00Z', numbers: true, party: true }, { at: '2026-10-18T15:00:00Z', theme: 'polaroid', format: 'a4-hoch' }, {}]) {
    const r = BG.draft(t, ctx, opts);
    const b = V.normalizeBook(r.book, { now: '2026-10-18T15:30:00Z', media: t.media });
    assert(V.validateV4(Object.assign({}, t, { books: [b] })), 'bookgen-Entwurf ist gültiges Format 4');
    assert.deepStrictEqual(V.privacyFindings(b).filter(x => x.hard), []);
    const kinds = b.pages.map(p => p.kind);
    assert(kinds[0] === 'titel' && kinds.includes('uebersicht') && kinds.includes('tag') && kinds[kinds.length - 1] === 'schluss');
    if (opts.numbers) assert(kinds.includes('zahlen'));
  }
  /* auch ohne Fotos und ohne Version 3/4: reines Textbuch */
  const plainBook = BG.draft({ id: 'tripbg2', title: 'Kurztrip', schemaVersion: 2, nights: 1 }, {}, { at: '2026-10-18T15:00:00Z' }).book;
  assert(V.validateBooks([V.normalizeBook(plainBook, { media: [] })], []));
}

console.log('v4logic: alle Prüfungen bestanden' + (V3 ? ' (mit v3logic.needsV3)' : ' (needsV3 als Attrappe, v3logic.js nicht neben dem Modul)') + (BG ? ', Abgleich mit bookgen.js ' + BG.RULE : ', ohne bookgen.js-Abgleich'));
