/* Reisetagebuch und Bewertungen (SCHEMA_V3 §4/§5/§9, P0.2b). Node-Test mit v3journal.js und index.html,
   DOM nur als kleine Attrappe (Blätter und Darstellung abgefangen). Kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const J = require('../v3journal.js');
const C = x => JSON.parse(JSON.stringify(x));

/* ---------- 1. Reine Regeln ---------- */
{
  /* Schlüssel: echtes Datum oder Tagesindex ohne führende Null */
  assert(J.validateJournal({ '2026-12-30': { text: 'Anreise' }, d0: { text: '', mood: 3 }, d12: { text: 'x' } }));
  assert(J.validateJournal(null) && J.validateJournal(undefined) && J.validateJournal({}));
  for (const k of ['2026-02-30', '2026-13-01', '26-12-30', 'd01', 'd-1', 'd10000', 'D1', 'tag1', ''])
    assert.throws(() => J.validateJournal({ [k]: { text: 'x' } }), /weder ein gültiges Datum|Schlüssel/, 'Schlüssel ' + k + ' abgelehnt');
  assert(J.validateJournal({ d9999: { text: 'x' } }), 'höchster Tagesindex');
  for (const k of ['__proto__', 'constructor', 'prototype'])
    assert.throws(() => J.validateJournal(JSON.parse('{"' + k + '":{"text":"x"}}')), /unzulässig/, k + ' abgelehnt');
  assert.throws(() => J.validateJournal([]), /Struktur/); assert.throws(() => J.validateJournal('x'), /Struktur/);
  /* Eintrag: Text ≤ 2000, Stimmung 1–5 optional, keine fremden Felder, nicht leer */
  assert(J.validateJournal({ d0: { text: 'a'.repeat(2000) } }));
  assert.throws(() => J.validateJournal({ d0: { text: 'a'.repeat(2001) } }), /2000/);
  for (const m of [0, 6, 2.5, '3', null, NaN, true]) assert.throws(() => J.validateJournal({ d0: { text: 'x', mood: m } }), /Stimmung/, 'Stimmung ' + m);
  assert.throws(() => J.validateJournal({ d0: { text: 'x', foto: 'a.jpg' } }), /unbekanntes Feld/);
  assert.throws(() => J.validateJournal({ d0: { mood: 3 } }), /Text fehlt/);
  assert.throws(() => J.validateJournal({ d0: { text: '   ' } }), /leerer Eintrag/);
  assert.throws(() => J.validateJournal({ d0: 'Text' }), /ungültiger Eintrag/);
  const many = {}; for (let i = 0; i < 367; i++) many['d' + i] = { text: 'x' };
  assert.throws(() => J.validateJournal(many), /366/); delete many.d366; assert(J.validateJournal(many));
  /* Bewertungen */
  assert(J.validateRatings({ 'oj-kurs': 5, c1abc: 1, essen_gehen: 3 }));
  for (const v of [0, 6, 3.5, '4', null]) assert.throws(() => J.validateRatings({ a1: v }), /1 bis 5/, 'Sterne ' + v);
  for (const k of ['a b', 'x'.repeat(61), 'ä', '__proto__', 'constructor']) assert.throws(() => J.validateRatings(JSON.parse(JSON.stringify({ [k]: 3 }))), /Unternehmungs-ID/, 'ID ' + k);
  assert.throws(() => J.validateRatings(JSON.parse('{"__proto__":3}')), /Unternehmungs-ID/);
  const manyR = {}; for (let i = 0; i < 501; i++) manyR['a' + i] = 3; assert.throws(() => J.validateRatings(manyR), /500/);
  assert.throws(() => J.validate({ journal: { d0: { text: 'x' } }, ratings: { a1: 9 } }), /Sterne/);

  /* Eingaben normalisieren; leer = entfernen */
  assert.deepEqual(J.normalizeEntry({ text: '  Tag 1\r\nGut\r ', mood: '4' }), { text: 'Tag 1\nGut', mood: 4 });
  assert.deepEqual(J.normalizeEntry({ text: 'ohne', mood: '' }), { text: 'ohne' });
  assert.deepEqual(J.normalizeEntry({ text: '', mood: 2 }), { text: '', mood: 2 });
  assert.equal(J.normalizeEntry({ text: '  \n ', mood: '' }), null);
  assert.throws(() => J.normalizeEntry({ text: 'x', mood: '7' }), /zwischen 1 und 5/);
  assert.throws(() => J.normalizeEntry({ text: 'x'.repeat(2001) }), /2000 Zeichen \(aktuell 2001\)/);
  assert.throws(() => J.normalizeEntry({ text: { a: 1 } }), /ungültiger Text/);

  /* setEntry: genau ein Schlüssel ändert sich, Quelle bleibt unverändert */
  const src = { '2026-12-30': { text: 'A', mood: 5 }, d1: { text: 'B' } }, before = C(src);
  const n1 = J.setEntry(src, '2026-12-31', { text: 'C', mood: '3' });
  assert.deepEqual(src, before, 'Quelle unverändert');
  assert.deepEqual(n1, Object.assign(C(before), { '2026-12-31': { text: 'C', mood: 3 } }));
  const n2 = J.setEntry(n1, '2026-12-30', { text: '', mood: '' });
  assert(!('2026-12-30' in n2) && n2.d1.text === 'B', 'leerer Eintrag entfernt, andere bleiben');
  assert.throws(() => J.setEntry(src, '2026-02-30', { text: 'x' }), /unbekannter Reisetag/);
  assert.throws(() => J.setEntry(src, '__proto__', { text: 'x' }), /unbekannter Reisetag/);
  assert.throws(() => J.setEntry({ d0: { text: 'x', bad: 1 } }, 'd1', { text: 'y' }), /unbekanntes Feld/, 'ungültige Quelle wird nicht still repariert');
  assert.throws(() => J.setEntry(many, 'd400', { text: 'neu' }), /366/);
  assert.equal(J.setEntry(many, 'd5', { text: 'geändert' }).d5.text, 'geändert', 'Ändern am Limit möglich');
  assert.equal(Object.keys(J.setEntry(many, 'd5', { text: '' })).length, 365, 'Löschen am Limit möglich');

  /* setRating */
  const r0 = { a1: 4 }, r1 = J.setRating(r0, 'b2', 3);
  assert.deepEqual(r0, { a1: 4 }); assert.deepEqual(r1, { a1: 4, b2: 3 });
  assert.deepEqual(J.setRating(r1, 'a1', null), { b2: 3 }); assert.deepEqual(J.setRating(r1, 'a1', ''), { b2: 3 });
  assert.throws(() => J.setRating(r1, 'a1', 6), /1 und 5/); assert.throws(() => J.setRating(r1, '__proto__', 3), /unbekannte/);

  /* Schlüsselwahl je Tag */
  assert.equal(J.dayKey({ i: 2, date: '2026-12-31' }), '2026-12-31');
  assert.equal(J.dayKey({ i: 2, date: null }), 'd2');
  assert.throws(() => J.dayKey({ i: 1, date: '2026-02-30' }), /Datum/); assert.throws(() => J.dayKey({ i: -1, date: null }), /Reisetag/);

  /* Zuordnung ohne Umschlüsselung */
  const open = [0, 1, 2].map(i => ({ i, date: null, label: 'Tag ' + (i + 1) }));
  const fix = ['2026-12-30', '2026-12-31', '2027-01-01'].map((date, i) => ({ i, date, label: date }));
  const jr = { d0: { text: 'offen 1' }, d2: { text: 'offen 3' }, d7: { text: 'zu weit' }, '2026-12-31': { text: 'Silvester', mood: 5 }, '2026-12-28': { text: 'vorher' } };
  const Lo = J.layout(jr, open);
  assert.deepEqual(Lo.days.map(d => d.key), ['d0', 'd1', 'd2']);
  assert.deepEqual(Lo.days.map(d => d.entry && d.entry.text), ['offen 1', null, 'offen 3']);
  assert.deepEqual(Lo.orphans.map(o => o.key), ['2026-12-28', '2026-12-31', 'd7'], 'offene Daten: Datumseinträge ohne Tag, sortiert');
  assert.equal(Lo.count, 5, 'nichts verloren');
  const Lf = J.layout(jr, fix);
  assert.deepEqual(Lf.days.map(d => d.key), fix.map(d => d.date), 'feste Daten: Datum als Schlüssel');
  assert.equal(Lf.days[1].entry.text, 'Silvester');
  assert.deepEqual(Lf.days[0].extra.map(x => x.key), ['d0'], 'früherer Tagesindex bleibt am Tag sichtbar');
  assert.deepEqual(Lf.days[2].extra.map(x => x.key), ['d2']);
  assert.deepEqual(Lf.orphans.map(o => o.key), ['2026-12-28', 'd7']);
  assert.equal(Lf.count, 5);
  assert.equal(Lf.days[0].label, '2026-12-30', 'Zusatzangaben des Tages bleiben');
  /* Datumswechsel: Reise um einen Tag verschoben – überlappende Daten passen weiter, der Rest ohne Tag, nichts verloren */
  const shifted = ['2026-12-31', '2027-01-01', '2027-01-02'].map((date, i) => ({ i, date }));
  const Ls = J.layout(jr, shifted);
  assert.equal(Ls.days[0].entry.text, 'Silvester'); assert.deepEqual(Ls.orphans.map(o => o.key), ['2026-12-28', 'd7']);
  assert.deepEqual(Ls.days[0].extra.map(x => x.key), ['d0'], 'Tagesindex folgt dem Tag, nicht dem Datum');
  assert.equal(Ls.count, 5);
  assert.deepEqual(J.layout(null, open).orphans, []); assert.equal(J.layout({}, fix).count, 0);
  assert.equal(J.keyLabel('2026-12-31'), '31.12.2026'); assert.equal(J.keyLabel('d0'), 'Tag 1');

  /* Bewertungen gegen den Plan */
  const RL = J.ratingLayout({ a1: 4, weg: 2 }, [{ id: 'a1', title: 'A' }, { id: 'b2', title: 'B' }, { id: 'a1', title: 'doppelt' }]);
  assert.deepEqual(RL.planned.map(a => [a.id, a.stars, a.title]), [['a1', 4, 'A'], ['b2', null, 'B']]);
  assert.deepEqual(RL.other, [{ id: 'weg', stars: 2 }], 'Bewertung entfernter Unternehmung bleibt'); assert.equal(RL.count, 2);

  /* Texte: nie nur Symbol oder Farbe */
  assert.equal(J.moodText(4), '4 von 5 · gut'); assert.equal(J.moodText(null), 'keine Angabe');
  assert.equal(J.starsText(3), '3 von 5 Sternen'); assert.equal(J.starsText(null), 'noch nicht bewertet');
  assert.equal(J.starsGlyphs(3), '★★★☆☆'); assert.equal(J.starsGlyphs(0), '☆☆☆☆☆');
  assert.equal(J.excerpt('kurz'), 'kurz'); assert(J.excerpt('wort '.repeat(60)).endsWith(' …') && J.excerpt('wort '.repeat(60)).length <= 142);
}

/* ---------- 2. App: index.html in Node ---------- */
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.includes('<script src="v3journal.js"></script>'), 'Skript eingebunden');
const main = require("./app-code.cjs")(html);
function load(opt = {}) {
  let code = main.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '')
    .replace('function render(){', 'function render(){window.__renders=(window.__renders||0)+1;return;')
    .replace('function openSheet(html){', 'function openSheet(html){window.__sheets.push(html);return;')
    .replace('function closeSheet(){', 'function closeSheet(){window.__closed=(window.__closed||0)+1;return;');
  if (opt.gate === false) code = code.replace('const V3_EDIT=true;', 'const V3_EDIT=false;');
  assert(opt.gate === false ? code.includes('const V3_EDIT=false;') : code.includes('const V3_EDIT=true;'));
  const memory = opt.memory || new Map(), dom = {}, callbacks = {}, el = () => ({ setAttribute() {}, style: {} });
  const win = { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js'), __sheets: [] };
  if (opt.journal !== false) win.RPV3J = J;
  const ctx = {
    window: win,
    document: { addEventListener: (k, fn) => (callbacks[k] ||= []).push(fn), querySelector: s => dom[s] || null, querySelectorAll: () => [], createElement: el, body: { appendChild() {} } },
    localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => { if (opt.failWrite && opt.failWrite(k)) throw new Error('QuotaExceededError'); memory.set(k, String(v)); }, removeItem: k => memory.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, console, alert() {}
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { a: win.__app, win, dom, memory, callbacks, opt };
}
const iso = d => d.toISOString().slice(0, 10), DAY = 864e5;
const today = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
/* Formular-Attrappe für das geöffnete Tagebuchblatt */
function form(env, text, mood) {
  env.dom['#journal-text'] = { value: text };
  env.dom['[data-journal-sheet]'] = { querySelector: s => s === 'input[name="journal-mood"]:checked' && mood !== '' && mood != null ? { value: String(mood) } : null };
}
function closeForm(env) { delete env.dom['#journal-text']; delete env.dom['[data-journal-sheet]']; }
const other = t => { const x = C(t); ['journal', 'ratings', 'schemaVersion', 'updated'].forEach(k => delete x[k]); return x; };

{
  const env = load(), { a } = env;
  assert.equal(a.V3_JOURNAL, true); assert.equal(a.V3_EDIT, true);
  /* Lesen und Prüfen statt Ablehnen */
  const base = a.silvesterTemplate(); base.schemaVersion = 3;
  base.journal = { '2026-12-30': { text: 'Anreise', mood: 4 } }; base.ratings = { 'oj-kurs': 5 };
  a.validateExtras(base);
  assert.throws(() => a.validateExtras(Object.assign(C(base), { journal: { '2026-02-30': { text: 'x' } } })), /Tagebuch/);
  assert.throws(() => a.validateExtras(Object.assign(C(base), { ratings: { 'oj-kurs': 7 } })), /Bewertungen/);
  assert.throws(() => a.validateExtras(Object.assign(C(base), { party: [{ id: 'pa01', name: 'A' }] })), /kennt diese App-Version noch nicht/, '§3 bleibt Sache des anderen Pakets');
  const v2 = a.silvesterTemplate(); v2.schemaVersion = 2;
  assert.throws(() => a.validateExtras(Object.assign(C(v2), { journal: { d0: { text: 'x' } } })), /Formats 3/, 'Tagebuch nie in Format 2');
  a.validateExtras(Object.assign(C(v2), { journal: {} }));
  assert.equal(a.serverRowProblem({ id: base.id, version: 1, data: C(base) }), null, 'Serverzeile mit Tagebuch lesbar');
  /* Ohne v3journal.js bleibt eine Reise mit Tagebuch geschützt statt falsch angezeigt */
  const old = load({ journal: false });
  assert.throws(() => old.a.validateExtras(C(base)), /„journal“ kennt diese App-Version noch nicht/);
  old.a.validateExtras(Object.assign(C(base), { journal: {}, ratings: {} }));
  assert.equal(old.a.journalSection(C(base), 'plan'), '');

  /* Feldtreue: Format-3-Reise mit allen Feldern, Zusatzschlüsseln und Tagebuch */
  const full = a.silvesterTemplate(); full.schemaVersion = 3; full.zukunft = { a: [1, 2] };
  full.transport = { out: [{ id: 'sflug', mode: 'flug', fromCode: 'STR', toCode: 'MUC', cost: 89, per: 'pp', addons: [{ id: 'abag', label: 'Gepäck', cost: 30, per: 'pp' }] }], back: [] };
  const actKey = Object.keys(a.cost(full).lines.reduce((m, l) => (l.key && l.key.startsWith('act:') ? (m[l.key] = 1) : 0, m), {}))[0];
  full.ledger = { 'tr:sflug': { status: 'gebucht', amount: null, paid: 178, due: '' }, [actKey]: { status: 'gebucht', amount: null, paid: 60, due: '', refunds: [{ id: 'rfone', on: '2026-12-01', amount: 40 }], cancel: { on: '2026-11-30', fee: 20 } } };
  full.journal = { '2026-12-31': { text: 'Silvester <b>draußen</b>\nZweite Zeile', mood: 5 }, d0: { text: 'aus der Planung' }, '2026-12-20': { text: 'vor der Reise' } };
  full.ratings = { [actKey.slice(4)]: 4, weggefallen: 2 };
  a.validateExtras(full);
  const keepV3 = x => C({ journal: x.journal, ratings: x.ratings, transport: x.transport, ledger: x.ledger, zukunft: x.zukunft, items: x.items, schemaVersion: x.schemaVersion });
  const ref = keepV3(full);
  assert.deepEqual(keepV3(a.toServer(full)), ref, 'toServer erhält Tagebuch und alle v3-Felder');
  assert.deepEqual(a.toServer(full), C(full), 'toServer insgesamt unverändert');
  const raw = C(a.backupData([full]));
  assert.deepEqual(a.validateBackup(raw)[0], C(full), 'Sicherung unverändert');
  for (const [f, v] of [['title', 'Neu'], ['notes', 'Notiz'], ['persons', '3'], ['budget', '1700'], ['start', '2026-12-29']]) { const x = C(full); a.setField(x, f, v); assert.deepEqual(C(x.journal), ref.journal, 'setField ' + f); assert.deepEqual(C(x.ratings), ref.ratings); }
  a.Store.setScope('guest'); assert(a.Store.put(C(full)));
  const ids = a.importTrips(raw, 'copy'), copy = a.Store.get(ids[0]);
  assert.notEqual(copy.id, full.id); assert.deepEqual(keepV3(copy), ref, 'Importkopie erhält Tagebuch');
  a.Store.setScope('guest');
  assert.deepEqual(keepV3(a.Store.get(full.id)), ref, 'Neuladen erhält Tagebuch');
  /* Datumsänderung über die Eckdaten: keine Umschlüsselung, nichts verloren, nicht passende Einträge ohne Tag */
  const stored = a.Store.get(full.id), draft = C(stored); draft.start = '2027-01-01'; draft.end = '2027-01-04';
  const changed = a.protectedPlanChange(stored, 'edit', { draft });
  assert.deepEqual(C(changed.journal), ref.journal, 'Eckdatenänderung lässt Tagebuch unverändert');
  const L = a.journalLayout(changed);
  assert.equal(L.count, 3); assert.deepEqual(L.orphans.map(o => o.key), ['2026-12-20', '2026-12-31']); assert.deepEqual(L.days[0].extra.map(x => x.key), ['d0']);
  const flex = C(stored); flex.dateMode = 'flex'; a.validateExtras(flex);
  assert.deepEqual(a.journalLayout(flex).orphans.map(o => o.key), ['2026-12-20', '2026-12-31'], 'offene Daten: Datumseinträge bleiben ohne Tag');
  assert.equal(a.journalLayout(flex).days[0].entry.text, 'aus der Planung');

  /* Darstellung: Text und Stimmung, Escaping, Sterne mit Textalternative, ohne Tag */
  const sec = a.journalSection(stored, 'plan');
  assert(sec.includes('5 von 5 · großartig'), 'Stimmung als Text');
  assert(sec.includes('Silvester &lt;b&gt;draußen&lt;/b&gt;') && !sec.includes('<b>draußen'), 'Text maskiert');
  assert(/1 Eintrag ohne zugehörigen Tag/.test(sec) && sec.includes('20.12.2026'));
  assert(sec.includes('Früherer Eintrag für Tag 1'), 'Index-Eintrag am festen Tag');
  assert(sec.includes('aria-label="4 von 5 Sternen"') && sec.includes('aria-pressed="true"') && sec.includes('4 von 5 Sternen</span>'));
  assert(sec.includes('Entfernte Unternehmung') && sec.includes('nicht mehr in dieser Reise'), 'Bewertung entfernter Unternehmung sichtbar');
  assert(!/hover/i.test(sec));
  assert.equal(a.journalRetro(stored), '', 'kein Rückblick vor der Reise');
  const done = C(stored); done.status = 'vorbei'; assert(a.journalRetro(done).includes('Rückblick: Tagebuch & Bewertungen'));
  a.UI.mappeJournal = false; assert(!a.tMappe(stored).includes('data-journal-mappe'), 'Mappe ohne Tagebuch, solange nicht gewählt');
  assert(a.tMappe(stored).includes('id="mappe-journal"'));
  a.UI.mappeJournal = true; const mp = a.tMappe(stored);
  assert(mp.includes('data-journal-mappe') && mp.includes('Stimmung: 5 von 5 · großartig') && mp.includes('20.12.2026 · ohne zugehörigen Tag') && mp.includes('4 von 5 Sternen'));
  a.UI.mappeJournal = false;
  assert(!a.tripText(stored, { notes: true }).includes('Silvester <b>'), 'Teilen-Text enthält kein Tagebuch');
}

/* ---------- 3. Erfassen: erste Angabe mit Bestätigung, danach direkt, Entwürfe, Konflikt ---------- */
{
  const env = load(), { a } = env;
  const t = a.silvesterTemplate(); t.zukunft = { bleibt: true }; a.Store.setScope('guest'); assert(a.Store.put(t));
  a.UI.view = 'reise'; a.UI.tid = t.id; a.UI.tab = 'plan';
  const before = C(a.Store.get(t.id)), day0 = '2026-12-30', day1 = '2026-12-31';
  assert.notEqual(before.schemaVersion, 3, "Ausgangsreise nicht Format 3");
  assert(a.journalCanEdit(before));
  const plan = a.journalSection(before, 'plan');
  assert(plan.includes('data-journal-act="open" data-key="' + day0 + '"') && plan.includes('noch leer'));
  /* Blatt öffnen, schreiben, speichern → Rückfrage, noch nichts gespeichert */
  a.journalSheet(a.Store.get(t.id), day0);
  let sheet = env.win.__sheets.pop();
  assert(sheet.includes('Erster Eintrag dieser Reise') && sheet.includes('maxlength="2000"') && sheet.includes('Keine Angabe') && sheet.includes('4 · gut'));
  form(env, '  Endlich angekommen.\r\nSchnee!  ', 4);
  assert.equal(a.journalSave(), 'ask');
  const ask = env.win.__sheets.pop();
  assert(ask.includes('Reise auf Format 3 umstellen?') && ask.includes('Ältere App-Versionen') && ask.includes('höchstens ansehen'));
  assert.deepEqual(C(a.Store.get(t.id)), before, 'Rückfrage speichert nichts');
  assert.deepEqual(JSON.parse(env.memory.get('rp-trips'))[t.id], before, 'Datenträger unverändert');
  /* Zwischenzeitliche Änderung entwertet die Rückfrage */
  const token = a.UI.journalPending.token, changedTrip = a.Store.get(t.id); changedTrip.title += ' geändert'; assert(a.Store.put(changedTrip));
  assert.throws(() => a.journalConfirm(token), /inzwischen geändert/);
  assert.notEqual(a.Store.get(t.id).schemaVersion, 3);
  /* Entwurf blieb erhalten: erneut öffnen zeigt ihn */
  closeForm(env); a.journalSheet(a.Store.get(t.id), day0); sheet = env.win.__sheets.pop();
  assert(sheet.includes('Ungespeicherter Entwurf wiederhergestellt') && sheet.includes('Endlich angekommen.'));
  form(env, '  Endlich angekommen.\r\nSchnee!  ', 4); assert.equal(a.journalSave(), 'ask');
  const v2state = C(a.Store.get(t.id));
  a.journalConfirm(a.UI.journalPending.token);
  const v3 = C(a.Store.get(t.id));
  assert.equal(v3.schemaVersion, 3, 'nach Bestätigung Format 3');
  assert.deepEqual(v3.journal, { [day0]: { text: 'Endlich angekommen.\nSchnee!', mood: 4 } });
  assert.deepEqual(other(v3), other(v2state), 'alle anderen Felder unverändert (Feldtreue)');
  assert.deepEqual(JSON.parse(env.memory.get('rp-trips'))[t.id].journal, v3.journal, 'auf dem Datenträger');
  assert.equal(a.journalSlot(v3, day0).kind, 'day');
  /* Danach direkt ohne Rückfrage; zweiter Tag; Entwurf beim Wechsel */
  a.journalSheet(a.Store.get(t.id), day1); env.win.__sheets.pop(); form(env, 'Silvester', '');
  a.journalKeep(); closeForm(env); /* Blatt geschlossen, Bereich gewechselt */
  a.go('r-' + t.id + '-ueber'); a.go('r-' + t.id + '-plan');
  assert(a.journalSection(a.Store.get(t.id), 'plan').includes('Entwurf, noch nicht gespeichert'));
  a.journalSheet(a.Store.get(t.id), day1); sheet = env.win.__sheets.pop(); assert(sheet.includes('>Silvester</textarea>'));
  form(env, 'Silvester mit Feuerwerk', 5);
  assert.equal(a.journalSave(), 'saved'); assert(!a.UI.journalPending, 'keine Rückfrage mehr');
  assert.deepEqual(a.Store.get(t.id).journal[day1], { text: 'Silvester mit Feuerwerk', mood: 5 });
  assert(!a.journalSection(a.Store.get(t.id), 'plan').includes('Entwurf, noch nicht gespeichert'), 'Entwurf nach Speichern entfernt');
  /* Konflikt: Eintrag inzwischen anders gespeichert → Entwurf bleibt, bewusst überschreiben möglich */
  a.journalSheet(a.Store.get(t.id), day1); env.win.__sheets.pop(); form(env, 'Mein Entwurf', 3); a.journalKeep();
  { const x = a.Store.get(t.id), c = a.journalCommit(x, { kind: 'journal', key: day1, journal: J.setEntry(x.journal, day1, { text: 'Von anderem Gerät', mood: 2 }) }); assert(c); }
  let conflict; try { a.journalSave(); } catch (e) { conflict = e; }
  assert(conflict && /inzwischen an anderer Stelle geändert/.test(conflict.message) && conflict.journalSaved.text === 'Von anderem Gerät');
  assert.equal(a.Store.get(t.id).journal[day1].text, 'Von anderem Gerät');
  assert.equal(a.journalSave(true), 'saved'); assert.deepEqual(a.Store.get(t.id).journal[day1], { text: 'Mein Entwurf', mood: 3 });
  /* Grenzen in der App */
  a.journalSheet(a.Store.get(t.id), day1); env.win.__sheets.pop(); form(env, 'x'.repeat(2001), '');
  assert.throws(() => a.journalSave(), /2000 Zeichen/); assert.equal(a.Store.get(t.id).journal[day1].text, 'Mein Entwurf');
  assert.throws(() => a.journalSheet(a.Store.get(t.id), '2027-02-01'), /gibt es nicht mehr/, 'neue Einträge nur für aktuelle Tage');
  assert.throws(() => a.journalSheet(a.Store.get(t.id), '__proto__'), /gibt es nicht mehr/);
  /* Leeren = entfernen; leeres Tagebuch fällt weg, Format 3 bleibt */
  a.journalSheet(a.Store.get(t.id), day1); env.win.__sheets.pop(); form(env, '   ', '');
  assert.equal(a.journalSave(), 'saved'); assert(!(day1 in a.Store.get(t.id).journal));
  a.journalSheet(a.Store.get(t.id), day0); env.win.__sheets.pop(); assert.equal(a.journalSave(false, true), 'saved');
  assert.equal(a.Store.get(t.id).journal, undefined, 'leeres Tagebuch entfernt'); assert.equal(a.Store.get(t.id).schemaVersion, 3, 'keine Rückstufung');
  a.journalSheet(a.Store.get(t.id), day0); env.win.__sheets.pop(); form(env, '', '');
  assert.equal(a.journalSave(), 'empty', 'leerer neuer Eintrag speichert nichts');

  /* Bewertungen: Planunternehmung, direkt in Format 3, bleiben nach Entfernen aus dem Plan */
  const acts = a.journalActs(a.Store.get(t.id)); assert(acts.length > 1 && acts.every(x => x.id && x.title));
  assert.equal(a.journalRate(a.Store.get(t.id), acts[0].id, 3), 'saved');
  assert.equal(a.Store.get(t.id).ratings[acts[0].id], 3);
  assert.throws(() => a.journalRate(a.Store.get(t.id), 'gibtsnicht', 3), /nicht mehr im Plan/);
  assert.throws(() => a.journalRate(a.Store.get(t.id), acts[0].id, 9), /1 und 5/);
  const noAct = a.Store.get(t.id); noAct.items = noAct.items.filter(i => i.act !== acts[0].id); assert(a.Store.put(noAct));
  assert.equal(a.Store.get(t.id).ratings[acts[0].id], 3, 'Bewertung bleibt nach Entfernen aus dem Plan');
  assert(a.journalSection(a.Store.get(t.id), 'plan').includes('nicht mehr im Tagesplan'));
  assert.equal(a.journalRate(a.Store.get(t.id), acts[0].id, 5), 'saved', 'bekannte, nicht mehr geplante Unternehmung bleibt änderbar');
  assert.equal(a.journalRate(a.Store.get(t.id), acts[0].id, null), 'saved'); assert.equal(a.Store.get(t.id).ratings, undefined);

  /* Erste Bewertung einer Format-2-Reise braucht ebenfalls die Bestätigung */
  const t2 = a.silvesterTemplate(); assert(a.Store.put(t2)); const before2 = C(a.Store.get(t2.id)), act2 = a.journalActs(t2)[0].id;
  assert.equal(a.journalRate(a.Store.get(t2.id), act2, 4), 'ask'); assert(env.win.__sheets.pop().includes('Bewertung'));
  assert.deepEqual(C(a.Store.get(t2.id)), before2);
  a.journalConfirm(a.UI.journalPending.token);
  assert.equal(a.Store.get(t2.id).schemaVersion, 3); assert.deepEqual(a.Store.get(t2.id).ratings, { [act2]: 4 });
  assert.deepEqual(other(a.Store.get(t2.id)), other(before2));
  assert.throws(() => a.journalConfirm(a.UI.journalPending ? a.UI.journalPending.token : 1), /nicht mehr aktuell/, 'Bestätigung nur einmal');

  /* Echte registrierte Ereignisse: Tippen auf Stern, Eingabe merkt Entwurf, Speichern im Blatt */
  const click = env.callbacks.click.find(fn => String(fn).includes('data-journal-act')), input = env.callbacks.input.find(fn => String(fn).includes('journal-text'));
  assert(click && input);
  a.UI.view = 'reise'; a.UI.tid = t2.id;
  const btn = attrs => { const b = { getAttribute: k => attrs[k] == null ? null : String(attrs[k]), closest: s => s === '[data-journal-act]' ? b : s === '[data-journal-sheet]' && attrs.inSheet ? {} : null }; return b; };
  click({ target: btn({ 'data-journal-act': 'rate', 'data-act-id': act2, 'data-stars': 2 }) });
  assert.equal(a.Store.get(t2.id).ratings[act2], 2, 'Klick auf Stern speichert');
  click({ target: btn({ 'data-journal-act': 'open', 'data-key': day0 }) }); assert(env.win.__sheets.pop().includes('data-journal-sheet'));
  form(env, 'Per Klick', 1); input({ target: { id: 'journal-text', closest: () => ({}) } });
  click({ target: btn({ 'data-journal-act': 'save', inSheet: true }) });
  assert.deepEqual(a.Store.get(t2.id).journal[day0], { text: 'Per Klick', mood: 1 });

  /* Speicherfehler: kein Erfolg, Entwurf bleibt */
  const env2 = load({ failWrite: k => k === 'rp-trips' && env2.fail }), b = env2.a; b.Store.setScope('guest');
  const t3 = b.silvesterTemplate(); t3.schemaVersion = 3; assert(b.Store.put(t3));
  b.journalSheet(b.Store.get(t3.id), day0); env2.win.__sheets.pop(); form(env2, 'Geht verloren?', 2); b.journalKeep();
  const rawBefore = env2.memory.get('rp-trips'); env2.fail = true;
  assert.throws(() => b.journalSave(), /Nicht gespeichert/); assert.equal(env2.memory.get('rp-trips'), rawBefore, 'Datenträger unverändert');
  assert.equal(b.UI.journalDrafts['guest|' + t3.id + '|' + day0].text, 'Geht verloren?', 'Entwurf bleibt nach Speicherfehler');
  env2.fail = false; closeForm(env2);
  assert.throws(() => b.journalSheet(b.Store.get(t3.id), day0) || b.journalSave(), /kann gerade nicht gespeichert werden/, 'nach Speicherfehler gesperrt');
}

/* ---------- 4. Gesperrtes Gate: nur Anzeige ---------- */
{
  const env = load({ gate: false }), { a } = env;
  const t = a.silvesterTemplate(); assert.equal(a.journalCanEdit(t), false);
  assert.equal(a.journalSection(t, 'plan'), '', 'ohne Freigabe und ohne Einträge keine Anzeige');
  assert.throws(() => a.journalRate(t, a.journalActs(t)[0].id, 3), /gerade nicht gespeichert/);
  const v3 = C(t); v3.schemaVersion = 3; v3.journal = { '2026-12-30': { text: 'Nur lesen', mood: 2 } };
  const sec = a.journalSection(v3, 'plan');
  assert(sec.includes('Nur lesen') && sec.includes('2 von 5 · durchwachsen') && !sec.includes('data-journal-act'), 'nur Anzeige, keine Bedienelemente');
}

/* ---------- 5. Unterwegs: Tagebuch für heute ---------- */
{
  const env = load(), { a } = env;
  const t = a.newTrip({ title: 'Unterwegs', type: 'wochenende', status: 'gebucht', dateMode: 'fix', start: iso(new Date(today - DAY)), end: iso(new Date(+today + DAY)) });
  a.Store.setScope('guest'); assert(a.Store.put(t));
  const block = a.todayBlock(a.Store.get(t.id));
  assert(block.includes('Tagebuch heute') && block.includes('data-key="' + iso(today) + '"'), 'heutiger Tag mit Datumsschlüssel');
}
console.log('Reisetagebuch und Bewertungen: Prüfung (Schlüssel, echte Daten, Tagesindex, Text ≤ 2000, Stimmung/Sterne 1–5, Grenzen, __proto__), Schlüsselwahl, Zuordnung ohne Umschlüsselung, Datumswechsel ohne Verlust, Feldtreue (toServer, Sicherung, Import, Neuladen, setField, Eckdaten), Bestätigung vor Format 3, direkte Folgeänderungen, Entwürfe, Konflikt, Leeren = Entfernen, Bewertungen entfernter Unternehmungen, Ereignisse, Speicherfehler, gesperrtes Gate, Mappe und Unterwegs geprüft. Kein Browser-/iPhone-Test.');
