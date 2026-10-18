/* Reisebuch-Erstentwurf (PLAN_IOS_APP §7.2, Paket 3). Reiner Node-Test von bookgen.js mit v3journal.js.
   Prüft Regeln und HTML-Vorschau als Zeichenkette. Kein Browser-, Druck- oder iPhone-Test. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const B = require('../bookgen.js');
/* Format-4-Vertrag (Paket 2), sobald v4logic.js neben bookgen.js liegt */
const V4 = fs.existsSync(path.join(__dirname, '..', 'v4logic.js')) ? require('../v4logic.js') : null;
const AT = '2026-10-18T12:00:00.000Z';
/* Jeder Entwurf dieses Tests wird am Ende gegen den Vertrag geprüft */
const made = [];
const draft = (t, c, o) => { const r = B.draft(t, c, Object.assign({ at: AT }, o)); made.push({ r, media: t && Array.isArray(t.media) ? t.media : [] }); return r; };
const C = x => JSON.parse(JSON.stringify(x));
const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
const kinds = r => r.book.pages.map(p => p.kind);
const page = (r, id) => r.book.pages.find(p => p.id === id);

/* Beispielreise (erfunden, keine echten Buchungsdaten), Format 4 mit allen privaten Feldern, die nie erscheinen dürfen */
const trip = {
  id: 'tbuch1', title: 'Winter im Allgäu', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', nights: 4, dest: 'Oberstaufen',
  schemaVersion: 4, persons: 2, budget: 1500,
  notes: 'Buchungsnr HOTEL-4711-GEHEIM, Zimmer 12',
  ledger: { 'act:therme': { status: 'gebucht', amount: 80, paid: 80, due: '2026-12-01', paidBy: 'pa1x' } },
  offers: [{ id: 'of1', name: 'Pension Beispiel', booked: true, paid: 300, bookingRef: 'BKG-998877', deposit: 100, refunds: [{ id: 'rf01', on: '2026-12-02', amount: 12.34 }] }],
  party: [{ id: 'pa1x', name: 'Anna Geheimname' }, { id: 'pb2y', name: 'Ben Privat' }],
  expenses: [{ id: 'ex01', on: '2026-12-31', label: 'Geheimausgabe Bargeld', amount: 66.66, cat: 'essen', paidBy: 'pb2y', split: { among: ['pa1x', 'pb2y'], mode: 'equal' } }],
  customActs: [{ id: 'therme', t: 'Therme Oberstaufen', custom: true }, { id: 'rodeln', t: 'Rodeln am Hündle', custom: true },
    { id: 'silvester', t: 'Silvester am See', custom: true }, { id: 'weiter', t: 'Weiterfahrt', transit: true, custom: true }],
  items: [{ uid: 'i1', act: 'therme', day: 0, slot: 'nachm' }, { uid: 'i2', act: 'rodeln', day: 1, slot: 'morgen' },
    { uid: 'i3', act: 'silvester', day: 1, slot: 'abend' }, { uid: 'i4', act: 'weiter', day: 4, slot: 'morgen' }],
  journal: { '2026-12-30': { text: 'Angekommen.\n\nAbends Sauna.', mood: 4 }, '2026-12-31': { text: 'Rodeln und Feuerwerk.' }, d2: { text: 'Notiz aus der Planungszeit' }, '2027-02-01': { text: 'Nachgetragen' } },
  ratings: { therme: 5, rodeln: 4, silvester: 3, unbekannt: 5 },
  media: [
    { id: 'mbild1', kind: 'photo', takenAt: '2026-12-30T15:00:00Z', lat: 47.123456, lon: 10.987654, w: 2048, h: 1536, bytes: 400000, sha256: 'deadbeefcafe0001'.padEnd(64, '0'), caption: 'Ankunft', day: '2026-12-30', actId: 'therme', by: 'pa1x', fav: false, hidden: false, cloud: { state: 'done', path: 'geheimer/pfad/m1.jpg' } },
    { id: 'mbild2', kind: 'photo', takenAt: '2026-12-31T10:00:00Z', lat: 47.2, lon: 10.1, w: 1536, h: 2048, bytes: 1, sha256: 'deadbeefcafe0002'.padEnd(64, '0'), caption: 'Schlitten', day: '2026-12-31', actId: 'rodeln', fav: true, hidden: false, cloud: { state: 'none' } },
    { id: 'mbild3', kind: 'photo', takenAt: '2026-12-31T11:00:00Z', w: 1536, h: 2048, caption: '', day: '2026-12-31', fav: false, hidden: false },
    { id: 'mbild4', kind: 'photo', takenAt: '2026-12-31T23:59:00Z', w: 2048, h: 1536, caption: 'Feuerwerk', day: '2026-12-31', actId: 'silvester', fav: false, hidden: false },
    { id: 'mbild5', kind: 'photo', takenAt: '2026-12-31T12:00:00Z', w: 2048, h: 1536, day: '2026-12-31', fav: false, hidden: true },
    { id: 'mbild6', kind: 'photo', takenAt: '2027-01-03T09:00:00Z', w: 2048, h: 1536, caption: 'Abschied', day: null, fav: false, hidden: false }
  ]
};
const ctx = { numbers: { total: 1234.5, unknown: 0, perPerson: 617.25, shares: [{ partyId: 'pa1x', amount: 600 }, { partyId: 'pb2y', amount: 634.5 }] } };

/* ---------- 1. Determinismus, Eingabe bleibt unverändert ---------- */
{
  const frozen = deepFreeze(C(trip)), before = C(trip);
  const a = draft(frozen, ctx), b = draft(C(trip), C(ctx));
  assert.deepStrictEqual(a, b, 'gleiche Reise ergibt gleichen Entwurf');
  assert.deepStrictEqual(C(frozen), before, 'Reise unverändert');
  assert.deepStrictEqual(a.book.draft, { rule: 'bookgen-1', at: AT }); assert.strictEqual(a.book.updatedAt, AT);
  const at = draft(trip, ctx, { at: '2026-10-19T08:30:00Z' });
  assert.strictEqual(at.book.draft.at, '2026-10-19T08:30:00Z', 'Zeit nur vom Aufrufer');
  assert.deepStrictEqual(Object.assign(C(at), { book: Object.assign(C(at.book), { draft: a.book.draft, updatedAt: AT }) }), C(a), 'sonst gleich');
  const noAt = B.draft(trip, ctx); made.push({ r: noAt, media: trip.media });
  assert.deepStrictEqual(noAt.book.draft, { rule: 'bookgen-1', at: null }, 'ohne opts.at keine Uhrzeit');
  assert.strictEqual(noAt.book.updatedAt, null);
  for (const bad of ['2026-10-18', '2026-10-18T12:00:00+02:00', '2026-02-30T12:00:00Z']) assert.throws(() => B.draft(trip, ctx, { at: bad }), /Zeitpunkt/, bad);
  /* Stabile IDs je Seite (für späteres nicht-destruktives Neu-Generieren) */
  assert.match(a.book.id, /^[a-z][a-z0-9]{3,40}$/);
  a.book.pages.forEach(p => assert.match(p.id, /^[a-z][a-z0-9]{3,40}$/, 'Seiten-ID ' + p.id));
  assert.strictEqual(new Set(a.book.pages.map(p => p.id)).size, a.book.pages.length, 'Seiten-IDs eindeutig');
  assert.notStrictEqual(draft(Object.assign(C(trip), { id: 'tanders' }), ctx).book.id, a.book.id, 'Buch-ID hängt an der Reise');
  /* Vertragsgrenzen §5.2 */
  assert(a.book.title.length <= 120 && a.book.subtitle.length <= 200);
  a.book.pages.forEach(p => { assert(p.text.length <= 2000); p.slots.forEach(s => assert(s.caption.length <= 500)); });
}

/* ---------- 2. Aufbau und Inhalt ---------- */
{
  const r = draft(trip, ctx);
  assert.deepStrictEqual(kinds(r), ['titel', 'uebersicht', 'tag', 'tag', 'tag', 'weitere', 'highlights', 'schluss'], 'Zahlen standardmäßig aus, leere Tage übersprungen');
  assert.strictEqual(r.book.title, 'Winter im Allgäu');
  assert.strictEqual(r.book.subtitle, '30.12.2026 – 03.01.2027 · 5 Tage · 4 Nächte · Oberstaufen');
  /* Titelfoto: Lieblingsfoto */
  assert.strictEqual(r.info.coverRule, 'fav'); assert.strictEqual(r.book.cover.mediaId, 'mbild2');
  assert.deepStrictEqual(page(r, 'pgtitel').slots.map(s => s.mediaId), ['mbild2']);
  assert.strictEqual(page(r, 'pgtitel').text, '', 'Mitreisende nur auf Wunsch');
  /* Übersicht: Eckdaten ohne geratene Kilometer */
  const ov = page(r, 'pgueberblick');
  assert.deepStrictEqual(ov.items.map(i => i.label + '=' + i.value), ['Reisetage=5', 'Nächte=4', 'Unternehmungen laut Plan=3', 'Tagebucheinträge=4', 'Fotos=5']);
  assert(!ov.map && ov.layout === 'nur-text');
  const ovk = page(draft(trip, { km: 2345.6, map: [{ label: 'Hattenhofen', lat: 48.66, lon: 9.57 }, { label: 'kaputt', lat: 'x', lon: 1 }] }), 'pgueberblick');
  assert(ovk.items.some(i => i.label === 'Kilometer laut Plan' && i.value === '2.346 km'));
  assert.deepStrictEqual(ovk.map, [{ label: 'Hattenhofen', lat: 48.66, lon: 9.57 }]); assert.strictEqual(ovk.layout, 'karte');
  /* Tag 1: Datum mit Wochentag, Tagebuchtext, Stimmung, Sterne mit Text, ein Foto neben Text */
  const d1 = page(r, 'pgtag20261230');
  assert.strictEqual(d1.day, '2026-12-30'); assert.strictEqual(d1.heading, 'Tag 1 · Mi., 30.12.2026');
  assert.strictEqual(d1.text, 'Angekommen.\n\nAbends Sauna.');
  assert.deepStrictEqual(d1.items[0], { kind: 'stimmung', text: 'Stimmung: 4 von 5 · gut' });
  assert.deepStrictEqual(d1.items[1], { kind: 'bewertung', actId: 'therme', title: 'Therme Oberstaufen', stars: 5, glyphs: '★★★★★', text: '5 von 5 Sternen' });
  assert.strictEqual(d1.layout, 'text-foto'); assert.deepStrictEqual(d1.slots.map(s => s.mediaId), ['mbild1']);
  assert.deepStrictEqual(d1.slots[0], { mediaId: 'mbild1', crop: { x: 0, y: 0, w: 1, h: 1 }, fit: 'cover', caption: 'Ankunft' });
  /* Tag 2: Titelfoto nicht doppelt, ausgeblendetes Foto fehlt, Bewertungen absteigend, Layout nach Anzahl/Format */
  const d2 = page(r, 'pgtag20261231');
  assert.deepStrictEqual(d2.slots.map(s => s.mediaId), ['mbild3', 'mbild4']);
  assert.strictEqual(d2.layout, '2-gestapelt', 'hoch + quer');
  assert.deepStrictEqual(d2.items.filter(i => i.kind === 'bewertung').map(i => i.actId + ':' + i.stars), ['rodeln:4', 'silvester:3']);
  assert(d2.items.some(i => i.text === '3 von 5 Sternen' && i.glyphs === '★★★☆☆'), 'Sterne mit Text, nicht nur Symbole');
  /* Eintrag ohne zugehörigen Tag bleibt sichtbar */
  const w = page(r, 'pgweitere20270201');
  assert.strictEqual(w.text, 'Nachgetragen'); assert.strictEqual(w.heading, '01.02.2027');
  /* Highlights: ab 4 Sternen, nur mit bekanntem Titel, absteigend */
  const hl = page(r, 'pghighlights');
  assert.deepStrictEqual(hl.items.map(i => i.title + ' · ' + i.text), ['Therme Oberstaufen · 5 von 5 Sternen', 'Rodeln am Hündle · 4 von 5 Sternen']);
  assert.strictEqual(r.info.untitledRatings, 1, 'Bewertung ohne bekannten Titel gezählt, nicht erfunden');
  /* Schlussseite: noch ungenutztes Foto, Notiz nur vom Nutzer */
  const end = page(r, 'pgschluss');
  assert.strictEqual(end.text, ''); assert.deepStrictEqual(end.slots.map(s => s.mediaId), ['mbild6']); assert.strictEqual(end.layout, '1-gross');
  assert.strictEqual(page(draft(trip, ctx, { closingNote: '  Bis bald!  ' }), 'pgschluss').text, 'Bis bald!');
  assert.strictEqual(r.info.unusedMedia, 0);
}
{
  /* Früherer Index-Eintrag d2 → Tag 3 (01.01.2027) */
  const r = draft(trip, ctx), d3 = page(r, 'pgtag20270101');
  assert(d3, 'Tag 3 erscheint wegen des früheren Eintrags');
  assert.deepStrictEqual(d3.items, [{ kind: 'eintrag', label: 'Früherer Eintrag für Tag 3 (vor dem Festlegen der Daten)', text: 'Notiz aus der Planungszeit' }]);
  assert.deepStrictEqual(kinds(r).filter(k => k === 'tag').length, 3);
  assert.deepStrictEqual(r.info.skippedDays, ['2027-01-02', '2027-01-03']);
  /* opts.emptyDays = 'keep' zeigt alle Tage */
  assert.strictEqual(draft(trip, ctx, { emptyDays: 'keep' }).book.pages.filter(p => p.kind === 'tag').length, 5);
}
{
  /* Titelfoto ohne Lieblingsfoto: meiste Sterne; ohne Bewertungen: frühestes Foto; ohne Fotos: keins */
  const t = C(trip); t.media.forEach(m => { m.fav = false; });
  assert.strictEqual(draft(t, ctx).book.cover.mediaId, 'mbild1'); assert.strictEqual(draft(t, ctx).info.coverRule, 'sterne');
  const t2 = C(t); t2.ratings = {};
  const r2 = draft(t2, ctx); assert.strictEqual(r2.book.cover.mediaId, 'mbild1'); assert.strictEqual(r2.info.coverRule, 'erstes');
  /* Höchstens 4 Fotos je Tag, Rest bleibt für den Editor */
  const t3 = C(trip); t3.media = Array.from({ length: 7 }, (_, i) => ({ id: 'xbild' + i, kind: 'photo', takenAt: '2026-12-31T1' + i + ':00:00Z', w: 3, h: 4, day: '2026-12-31', fav: false, hidden: false }));
  const r3 = draft(t3, ctx), p3 = page(r3, 'pgtag20261231');
  assert.strictEqual(p3.slots.length, 4); assert.strictEqual(p3.layout, '4-raster');
  assert.deepStrictEqual(p3.slots.map(s => s.mediaId), ['xbild1', 'xbild2', 'xbild3', 'xbild4'], 'xbild0 ist Titelfoto, danach in Zeitfolge');
  assert.strictEqual(r3.info.unusedMedia, 1, 'xbild6 Schlussfoto, xbild5 übrig');
  /* Ungültige oder doppelte Medien werden ignoriert, nicht übernommen */
  const t4 = C(trip); t4.media = [{ id: 'okbild1', kind: 'photo', day: '2026-12-30' }, { id: 'okbild1', kind: 'photo' }, { id: 'm7', kind: 'photo' }, { id: '<b>', kind: 'photo' }, { id: 'v1', kind: 'video' }, null, 'x'];
  const r4 = draft(t4, ctx); assert.strictEqual(r4.book.cover.mediaId, 'okbild1'); assert(!JSON.stringify(r4).includes('"m7"'), 'Foto-ID nach Vertrag'); assert(!JSON.stringify(r4).includes('<b>'));
  /* Fotos zählen erst ab Format 4 */
  const t5 = C(trip); t5.schemaVersion = 3;
  assert.strictEqual(draft(t5, ctx).book.pages.every(p => !p.slots.length), true);
}

/* ---------- 3. Keine privaten Felder ---------- */
{
  const secrets = ['HOTEL-4711-GEHEIM', 'Zimmer 12', 'BKG-998877', 'Pension Beispiel', 'Anna Geheimname', 'Ben Privat', 'Geheimausgabe', '66.66', '12.34',
    '47.123456', '10.987654', 'deadbeefcafe', 'geheimer/pfad', 'pa1x', 'pb2y', '400000', 'paidBy', 'bookingRef', '"lat"', '"lon"', 'sha256', 'ledger', 'notes', '2026-12-01'];
  const out = JSON.stringify(draft(trip, ctx)) + B.renderHtml(draft(trip, ctx).book);
  secrets.forEach(s => assert(!out.includes(s), 'privat: ' + s));
  /* Zahlen standardmäßig aus, auch wenn die App sie mitliefert */
  assert(!out.includes('1.234,50') && !out.includes('617'), 'Zahlen der Reise standardmäßig aus');
  /* Mitreisende nur mit ausdrücklicher Wahl; auch dann keine Buchungs- oder Zahlungsdetails */
  const withParty = draft(trip, ctx, { party: true, numbers: true }), s2 = JSON.stringify(withParty);
  assert.strictEqual(page(withParty, 'pgtitel').text, 'Mit Anna Geheimname, Ben Privat');
  ['HOTEL-4711', 'BKG-998877', 'Geheimausgabe', '47.123456', 'deadbeef', 'geheimer/pfad', '12.34'].forEach(s => assert(!s2.includes(s), 'auch mit Wahl privat: ' + s));
  /* Zahlen der Reise, wenn gewählt: aus der App-Rechnung, Anteile nur mit gewählten Namen */
  const z = page(withParty, 'pgzahlen');
  assert.deepStrictEqual(z.items.map(i => i.label + '=' + i.value), ['Gesamtkosten=1.234,50 €', 'pro Person=617,25 €', 'Anteil Anna Geheimname=600,00 €', 'Anteil Ben Privat=634,50 €']);
  const zNoParty = page(draft(trip, ctx, { numbers: true }), 'pgzahlen');
  assert.deepStrictEqual(zNoParty.items.map(i => i.label), ['Gesamtkosten', 'pro Person'], 'ohne Wahl keine Namen und keine Anteile');
  /* Unbekannt ist nicht 0 */
  const zu = page(draft(trip, { numbers: { total: 900, unknown: 2 } }, { numbers: true }), 'pgzahlen');
  assert.deepStrictEqual(zu.items.map(i => i.label + '=' + i.value), ['Gesamtkosten (mindestens)=900,00 €', 'Posten ohne bekannten Preis=2']);
  assert.deepStrictEqual(page(draft(trip, { numbers: { total: null } }, { numbers: true }), 'pgzahlen').items, [{ kind: 'fakt', label: 'Gesamtkosten', value: 'unbekannt' }]);
  const nz = draft(trip, {}, { numbers: true }); assert(!page(nz, 'pgzahlen')); assert.strictEqual(nz.info.numbers, 'fehlt');
  assert.strictEqual(B.euro(1234567.891), '1.234.567,89 €'); assert.strictEqual(B.euro(0), '0,00 €');
}

/* ---------- 4. Reise ohne Format-3-Angaben (Textbuch) ---------- */
{
  const v2 = { id: 'tv2', title: 'Wochenende', dateMode: 'open', nights: 1, schemaVersion: 2, dest: '', items: [{ uid: 'i1', act: 'eig1', day: 0, slot: 'morgen' }],
    customActs: [{ id: 'eig1', t: 'Stadtführung', custom: true }], notes: 'Buchung 123',
    journal: { d0: { text: 'darf nicht erscheinen' } }, ratings: { eig1: 5 }, party: [{ id: 'pq1z', name: 'Clara' }], media: [{ id: 'mm', kind: 'photo' }] };
  const r = draft(v2, {}, { party: true });
  assert.deepStrictEqual(kinds(r), ['titel', 'uebersicht', 'tag', 'schluss']);
  assert(r.book.pages.every(p => p.slots.length === 0), 'Textbuch ohne Fotos');
  assert.strictEqual(r.book.cover.mediaId, null); assert.strictEqual(r.info.coverRule, 'keins');
  assert.strictEqual(r.book.subtitle, '2 Tage · 1 Nacht');
  const d = page(r, 'pgtagd0');
  assert.strictEqual(d.heading, 'Tag 1'); assert.strictEqual(d.day, 'd0');
  assert.deepStrictEqual(d.items, [{ kind: 'plan', title: 'Stadtführung', text: 'Auf dem Plan: Stadtführung' }]);
  const s = JSON.stringify(r); ['darf nicht erscheinen', 'Clara', 'Buchung 123', '★'].forEach(x => assert(!s.includes(x), 'Format 2 ignoriert ' + x));
  /* Fast leere Reise */
  const e = draft({});
  assert.deepStrictEqual(kinds(e), ['titel', 'uebersicht', 'schluss']);
  assert.strictEqual(e.book.title, 'Unsere Reise'); assert.strictEqual(e.info.skippedDays.length, 4, 'Standard 3 Nächte wie daysOf');
  /* Tage aus der App haben Vorrang, inklusive Ort */
  const c = draft(v2, { days: [{ i: 0, date: null, place: 'Ulm' }], acts: [{ id: 'eig1', title: 'Münster', days: [0] }] });
  assert.strictEqual(page(c, 'pgtagd0').sub, 'Ulm'); assert.strictEqual(page(c, 'pgtagd0').items[0].title, 'Münster');
  /* Weiterfahrten zählen nicht als Unternehmung */
  assert.strictEqual(page(draft(trip), 'pgueberblick').items[2].value, '3');
  /* Ungültige Optionen */
  assert.throws(() => B.draft(null), /Reise fehlt/);
  assert.throws(() => B.draft(trip, {}, { theme: 'neon' }), /Thema/);
  assert.throws(() => B.draft(trip, {}, { format: 'a3' }), /Format/);
  assert.throws(() => B.draft(trip, {}, { id: 'X!' }), /ID/);
  assert.throws(() => B.draft(trip, {}, { at: 'gestern' }), /Zeitpunkt/);
  /* Layoutnamen und IDs als Kennungen nach SCHEMA_V4 */
  if (V4) made.forEach(({ r }) => r.book.pages.forEach(p => { assert(V4.LAYOUTS.includes(p.layout), 'Layout ' + p.layout); assert(V4.PAGE_KINDS.includes(p.kind), 'Art ' + p.kind); }));
}

/* ---------- 5. HTML-Vorschau escaped ---------- */
{
  const t = C(trip);
  t.title = '<script>alert(1)</script>';
  t.journal['2026-12-30'].text = 'A <img src=x onerror=alert(2)> & "B"';
  t.media[0].caption = '"><svg onload=alert(3)>';
  t.customActs[0].t = '<b>Therme</b>';
  const r = draft(t, ctx);
  assert.strictEqual(r.book.title, '<script>alert(1)</script>', 'Daten bleiben roh, escaped wird beim Rendern');
  const urls = { mbild1: 'javascript:alert(4)', mbild3: 'https://example.invalid/m3.jpg?a=1&b=2', mbild4: 'https://x" onerror="alert(5)' };
  const html = B.renderHtml(r.book, { mediaUrl: id => urls[id] || null });
  ['<script', '<img src=x', '<svg', '<b>Therme', 'javascript:', 'onerror="alert'].forEach(x => assert(!html.includes(x), 'nicht roh: ' + x));
  assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert(html.includes('A &lt;img src=x onerror=alert(2)&gt; &amp; &quot;B&quot;'));
  assert(html.includes('&quot;&gt;&lt;svg onload=alert(3)&gt;'));
  assert(html.includes('<img src="https://example.invalid/m3.jpg?a=1&amp;b=2" alt="Foto">'), 'sichere Adresse escaped übernommen');
  assert(html.includes('aria-label="Foto (Vorschau nicht verfügbar)"'), 'ohne Adresse Platzhalter');
  assert(B.renderHtml(draft(trip, ctx).book).includes('<p>Angekommen.</p><p>Abends Sauna.</p>'), 'Absätze');
  assert(html.includes('5 von 5 Sternen'), 'Sterne als Text');
  assert.strictEqual(B.esc(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  assert.throws(() => B.renderHtml(null), /fehlt/);
}

/* ---------- 6. Lange Reise: höchstens 200 Seiten ---------- */
{
  const long = { id: 'tlang', title: 'Weltreise', dateMode: 'open', nights: 399, schemaVersion: 3,
    customActs: [{ id: 'spaz', t: 'Spaziergang', custom: true }], items: Array.from({ length: 400 }, (_, i) => ({ uid: 'i' + i, act: 'spaz', day: i, slot: 'morgen' })),
    journal: { d5: { text: 'Text an Tag 6' }, d399: { text: 'Letzter Tag' } } };
  const r = draft(long, {});
  assert.strictEqual(r.book.pages.length, 200);
  assert(page(r, 'pgtagd5') && page(r, 'pgtagd399'), 'Tage mit Text bleiben');
  assert.strictEqual(r.info.omittedPages.length, 403 - 200, 'Titel, Übersicht, 400 Tage, Schluss');
  assert.deepStrictEqual(kinds(r).slice(-1), ['schluss']);
  /* Auch lauter Tage mit Text: die letzten Tage fallen weg, gemeldet in info.omittedPages */
  const full = Object.assign(C(long), { journal: {} }); for (let i = 0; i < 366; i++) full.journal['d' + i] = { text: 'Tag ' + (i + 1) };
  const rf = draft(full, {});
  assert.strictEqual(rf.book.pages.length, 200); assert(page(rf, 'pgtagd196') && !page(rf, 'pgtagd197'));
  assert.strictEqual(rf.info.omittedPages[0], 'pgtagd197'); assert(rf.info.omittedPages.includes('pgtagd399'));
}

/* ---------- 7. Format-4-Vertrag (RPV4.normalizeBook/validateBooks) ---------- */
if (V4) {
  /* Zahlungsdaten in eigenem Text: Text wird nicht übernommen, Buch bleibt gültig */
  const t = C(trip); t.journal['2026-12-30'].text = 'Überweisung an DE89 3704 0044 0532 0130 00 erledigt';
  const r = draft(t, ctx), d1 = page(r, 'pgtag20261230');
  assert.strictEqual(d1.text, ''); assert.deepStrictEqual(r.info.blocked, [{ where: 'pgtag20261230', field: 'text' }]);
  assert(!JSON.stringify(r).includes('3704'));
  assert.deepStrictEqual(draft(trip, ctx).info.blocked, [], 'normale Texte bleiben');
  made.forEach(({ r, media }, n) => {
    const b = V4.normalizeBook(C(r.book), { now: AT, media });
    assert(V4.validateBooks([b], media), 'Entwurf ' + n + ' besteht den Vertrag');
  });
  console.log('bookgen: Vertragsprüfung Format 4 für ' + made.length + ' Entwürfe');
} else console.log('bookgen: v4logic.js fehlt, Vertragsprüfung übersprungen');

console.log('bookgen: alle Prüfungen bestanden');
