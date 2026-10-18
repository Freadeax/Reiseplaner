/* Review-Runde 2 (18.10.): Regressionstests für bestätigte Fehler. Node-Test über window.__app, kein Browser-/iPhone-Test.
   Zahlungsbuch (Bezahlt unter Erstattungen, Storno-Posten bearbeitbar, Kandidatenprüfung), offener Preis nie „bezahlt“,
   Sicherungspunkt im Kontobereich, Code-Anmeldung nach Konto-/Bereichswechsel, Tagebuch bei sehr langen Reisen und
   Entwürfe ohne zugehörigen Tag, Importvorschau mit Zahlungsbuch und Format-3-Feldern. */
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const V = require('../v3logic.js'), S = require('../v3split.js'), JM = require('../v3journal.js');
const J = x => JSON.parse(JSON.stringify(x));
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function load(opt) {
  opt = opt || {};
  let code = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
  code = code.replace('function render(){', 'function render(){return;').replace('function openSheet(html){', 'function openSheet(html){window.__sheets.push(html);return;').replace('function closeSheet(){', 'function closeSheet(){return;');
  const memory = new Map(opt.memory || []), dom = {};
  const win = { addEventListener() {}, RPV3: V, RPV3S: S, RPV3J: JM, RPCatalog: require('../catalog.js'), RPV3Forms: require('../v3forms.js'), RPV3Editor: require('../v3editor.js'), __sheets: [] };
  const ctx = { window: win, document: { addEventListener() {}, querySelector: s => dom[s] || null, querySelectorAll() { return []; }, getElementById() { return null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {}, style: {} } },
    localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) }, setTimeout: () => 0, clearTimeout() {}, console, alert() {} };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { a: ctx.window.__app, memory, dom, win };
}

/* ---------- Zahlungsbuch: Bezahlt nie unter den Erstattungen, Storno-Posten bleiben bearbeitbar ---------- */
{
  const { a, memory } = load(); a.Store.setScope('guest');
  const t = a.silvesterTemplate(); t.schemaVersion = 3;
  const k = a.cost(t).lines.find(l => l.key && l.key.startsWith('act:')).key;
  t.ledger = { [k]: { status: 'gebucht', amount: null, paid: 100, due: '', refunds: [{ id: 'rfone', on: '2026-12-01', amount: 30 }] } };
  a.validateExtras(t); a.Store.put(t); a.Store.put(a.newTrip({ title: 'Andere Reise' }));
  const cur = a.Store.get(t.id);
  assert.throws(() => a.setLedger(cur, k, 'paid', '20'), /niedriger als die bereits erfassten Erstattungen/, 'Bezahlt unter Erstattungen abgelehnt');
  assert.equal(cur.ledger[k].paid, 100, 'Reise unverändert');
  a.setLedger(cur, k, 'paid', '30'); assert.equal(cur.ledger[k].paid, 30, 'gleich den Erstattungen erlaubt'); a.Store.put(cur);
  const re = load({ memory: [...memory] }); re.a.Store.setScope('guest');
  assert.equal(re.a.Store.corruptRaw, null, 'nach dem Neuladen lesbar'); assert.equal(re.a.Store.list().length, 2, 'alle Reisen sichtbar');

  /* Storno S2: bezahlt 200, Gebühr 50 → Status/Fälligkeit änderbar, Bezahlt bis zum Betrag vor dem Storno */
  const t2 = a.silvesterTemplate(); t2.schemaVersion = 3;
  t2.ledger = { [k]: { status: 'gebucht', amount: 200, paid: 200, due: '', cancel: { on: '2026-11-30', fee: 50 } } };
  a.validateExtras(t2);
  a.setLedger(t2, k, 'due', '2026-12-10'); assert.equal(t2.ledger[k].due, '2026-12-10', 'Fälligkeit trotz Storno änderbar');
  a.setLedger(t2, k, 'status', 'gebucht'); a.setLedger(t2, k, 'paid', '180'); assert.equal(t2.ledger[k].paid, 180, 'Bezahlt über der Gebühr erlaubt');
  assert.throws(() => a.setLedger(t2, k, 'paid', '250'), /Bezahlt/, 'nicht über dem gebuchten Betrag');
  assert.deepEqual(J(t2.ledger[k].cancel), { on: '2026-11-30', fee: 50 }, 'Storno bleibt erhalten');

  /* Kandidat wird vor dem Speichern vollständig geprüft: Format-2-Reise bekommt kein ungültiges Zahlungsbuch */
  const t3 = a.silvesterTemplate(); assert.throws(() => a.setLedger(t3, 'tr:sbahn', 'status', 'gebucht'), /erst ab Format 3/);
  assert.equal(t3.ledger && t3.ledger['tr:sbahn'], undefined);
}

/* ---------- Offener Preis (eigene Unternehmung ohne Preis) ist nie 0 € und nie „Vollständig bezahlt“ ---------- */
{
  const { a } = load(); a.Store.setScope('guest');
  const t = a.silvesterTemplate(); t.schemaVersion = 3; t.party = [{ id: 'panna', name: 'Anna' }];
  t.customActs = (t.customActs || []).concat([{ id: 'cboot', custom: true, t: 'Bootstour', cat: 'ausflug', cost: 0, costOpen: true, per: 'grp', slot: 'nachm' }]);
  t.items = (t.items || []).concat([{ uid: 'iboot', act: 'cboot', day: 1, slot: 'nachm' }]);
  a.validateExtras(t);
  assert.equal(a.keyPriceOpen(t, 'act:cboot', a.cost(t).lines), true);
  const row = a.ledgerRows(t).find(r => r.key === 'act:cboot');
  assert(row.unknown && row.planOpen, 'Zeile als unbekannt markiert');
  assert(!/Vollständig bezahlt/.test(a.ledgerBalanceText(row)) && /Betrag unbekannt/.test(a.ledgerBalanceText(row)));
  assert.equal(a.v3Ref(t, { kind: 'ledger', key: 'act:cboot' }).planCost, null, 'v3Ref: Planwert unbekannt');
  assert.equal(a.splitPostings(t).find(p => p.key === 'ledger:act:cboot').planCost, null, 'Aufteilung: Planwert unbekannt');
  /* mit eingetragenem Betrag gilt der Betrag */
  a.setLedger(t, 'act:cboot', 'amount', '80');
  const r2 = a.ledgerRows(t).find(r => r.key === 'act:cboot'); assert(!r2.unknown && r2.cost === 80 && r2.open === 80);
  /* entfernter Posten: kein erfundener Planwert 0 € */
  t.ledger['act:weg'] = { status: 'gebucht', amount: null, paid: 50, due: '', cancel: { on: '2026-12-01', fee: 20 } }; a.validateExtras(t);
  assert.equal(a.v3Ref(t, { kind: 'ledger', key: 'act:weg' }).planCost, null);
  a.setLedger(t, 'act:weg', 'due', '2026-12-05'); /* bleibt bearbeitbar */
}

/* ---------- Sicherungspunkt im Kontobereich herunterladen ---------- */
{
  const { a, memory } = load();
  a.Store.setScope('u1234');
  const t = a.silvesterTemplate(); a.Store.put(t); const x = a.Store.get(t.id); x.title = 'Neuer Titel'; a.Store.put(x);
  const h = JSON.parse(memory.get(a.Store.historyKey()));
  const trips = a.historyTrips(h[0].raw, false);
  assert.equal(trips.length, 1); assert.equal(trips[0].id, t.id); assert.notEqual(trips[0].title, 'Neuer Titel', 'vorheriger Stand');
  assert.equal(a.backupData(trips).trips.length, 1);
  a.Store.setScope('guest'); const g = a.silvesterTemplate(); a.Store.put(g); const y = a.Store.get(g.id); y.title = 'G2'; a.Store.put(y);
  assert.equal(a.historyTrips(JSON.parse(memory.get(a.Store.historyKey()))[0].raw, true).length, 1, 'Gastbereich wie bisher');
  assert.throws(() => a.historyTrips('{"v":2}', false), /Sicherungspunkt ungültig/);
  assert(/historyTrips\(h\.raw,Store\.scope==='guest'\)/.test(html), 'Download nutzt die Bereichsform');
}

/* ---------- Code-Anmeldung: Schritt gehört zur vorherigen Anmeldung ---------- */
{
  const { a } = load(); a.Store.setScope('guest');
  a.UI.authMode = 'code'; a.UI.otp = { email: 'x@example.org', sentAt: 1, wait: 60 };
  a.Auth.switchTo({ id: 'uOtp', email: 'x@example.org' });
  assert.equal(a.UI.otp, null); assert.equal(a.UI.authMode, 'signin');
  a.UI.authMode = 'code'; a.UI.otp = { email: 'y@example.org' };
  a.Auth.switchTo(null); assert.equal(a.UI.otp, null, 'auch beim Abmelden zurückgesetzt'); assert.equal(a.UI.authMode, 'signin');
}

/* ---------- Tagebuch: sehr lange Reisen und Entwürfe ohne zugehörigen Tag ---------- */
{
  assert.equal(JM.dayKey({ i: 10500, date: '2056-01-01' }), '2056-01-01', 'mit Datum zählt der Index nicht');
  assert.throws(() => JM.dayKey({ i: 10000, date: null }), /Reisetag/);
  assert.equal(JM.layout({}, [{ i: 9999, date: null }, { i: 10000, date: null }]).days.length, 1, 'Tage ohne möglichen Schlüssel ohne Zeile');
  const { a, dom } = load(); a.Store.setScope('guest');
  const long = a.newTrip({ title: 'Lang', dateMode: 'fix', start: '2027-01-01', end: '2056-06-01' }); a.Store.put(long);
  assert(a.daysOf(long).length > 10000);
  assert.doesNotThrow(() => a.journalSection(a.Store.get(long.id), 'plan'), 'Tagesplan bricht bei langen Reisen nicht');
  assert.doesNotThrow(() => a.journalToday(a.Store.get(long.id), 10500));

  const t = a.silvesterTemplate(); t.schemaVersion = 3; a.Store.put(t);
  const days = a.journalDays(a.Store.get(t.id)).map(d => d.date), key = days[days.length - 1];
  a.journalSheet(a.Store.get(t.id), key);
  dom['#journal-text'] = { value: 'Entwurf zum letzten Tag' }; dom['[data-journal-sheet]'] = { querySelector: () => null };
  a.journalKeep();
  const x = a.Store.get(t.id); x.end = days[days.length - 2]; assert.equal(a.Store.put(x), true);
  const cut = a.Store.get(t.id);
  assert.deepEqual(a.journalLostDrafts(cut, a.journalLayout(cut)), [key], 'Entwurf erkannt');
  const sec = a.journalSection(cut, 'plan');
  assert(sec.includes('data-journal-lost') && sec.includes('Entwurf fortsetzen'), 'Entwurf bleibt erreichbar');
  assert.equal(a.journalSlot(cut, key).kind, 'draft');
  assert.doesNotThrow(() => a.journalSheet(cut, key));
  assert.equal(a.journalSave(), 'saved', 'Speichern legt ihn unter seinem bisherigen Tag ab');
  const saved = a.Store.get(t.id); assert.equal(saved.journal[key].text, 'Entwurf zum letzten Tag');
  assert(a.journalLayout(saved).orphans.some(o => o.key === key), 'danach als Eintrag ohne zugehörigen Tag sichtbar');
  assert.throws(() => a.journalSheet(saved, '2030-01-01'), /gibt es nicht mehr/, 'ohne Entwurf weiter nur aktuelle Tage');
}

/* ---------- Importvorschau nennt Zahlungsbuch und Format-3-Angaben ---------- */
{
  const { a } = load(); a.Store.setScope('guest');
  const t = a.silvesterTemplate(); t.schemaVersion = 3; a.Store.put(t);
  const inc = J(a.Store.get(t.id)); inc.journal = { [a.journalDays(inc)[0].date]: { text: 'Hallo' } };
  const k = a.cost(inc).lines.find(l => l.key && l.key.startsWith('act:')).key; inc.ledger = { [k]: { status: 'gebucht', amount: null, paid: 10, due: '' } };
  a.validateExtras(inc);
  const ch = a.importPreview([inc])[0].changed;
  assert(ch.includes('Reisetagebuch') && ch.includes('Zahlungsbuch'), 'Änderungen benannt: ' + ch.join(', '));
}
console.log('Korrekturen Runde 2: Zahlungsbuch (Bezahlt nie unter Erstattungen, Storno bearbeitbar, Kandidatenprüfung, Neuladen ohne gesperrten Speicher), offener Preis nie „bezahlt“ (Zahlungsbuch, v3Ref, Aufteilung, entfernte Posten), Sicherungspunkt im Kontobereich, Code-Anmeldung nach Wechsel zurückgesetzt, Tagebuch bei sehr langen Reisen und Entwürfe ohne zugehörigen Tag, Importvorschau mit Format-3-Feldern geprüft. Kein Browser-/iPhone-Test.');
