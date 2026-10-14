const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const context = {
  window: { addEventListener() {} },
  document: { addEventListener() {}, querySelector() { return null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {} },
  setTimeout, clearTimeout, console,
};
vm.createContext(context);
vm.runInContext(code, context);
const a = context.window.__app;
const at = s => new Date(s + 'T12:00:00'); // lokale Mittagszeit, unabhängig von der Zeitzone
const dayIso = off => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate() + off)).toISOString().slice(0, 10); };
const kursLine = tr => a.cost(tr).lines.filter(l => l.key === 'kurs');

/* Kostenzeilen tragen stabile Schlüssel */
const t = a.silvesterTemplate();
const keys = new Set(a.cost(t).lines.map(l => l.key));
['stay', 'anreise', 'kurbeitrag', 'kurs', 'verleih', 'skipass'].forEach(k => assert(keys.has(k), 'Schlüssel fehlt: ' + k));
assert(a.cost(t).lines.filter(l => l.cat !== 'essen' && l.cat !== 'puffer').every(l => l.key), 'jede buchbare Zeile hat einen Schlüssel');

/* Gebuchter Betrag ersetzt den Planwert, auch im Puffer */
const planKurs = kursLine(t).reduce((s, l) => s + l.c, 0);
const before = a.cost(t).total;
a.setLedger(t, 'kurs', 'amount', '300');
assert.equal(kursLine(t).length, 1);
assert.equal(kursLine(t)[0].c, 300);
assert.equal(kursLine(t)[0].src, 'ok');
assert(kursLine(t)[0].s.includes('laut eurer Buchung'));
assert(Math.abs(a.cost(t).total - (before - planKurs + 300)) < 0.01);
t.puffer = 10;
const sub = a.cost(t).lines.filter(l => l.cat !== 'puffer').reduce((s, l) => s + l.c, 0);
assert(Math.abs(a.cost(t).lines.find(l => l.cat === 'puffer').c - sub * 0.1) < 0.01, 'Puffer auf Buchungsbetrag');
t.puffer = 0;

/* Bezahlt darf Betrag nicht übersteigen; ungültige Werte werden abgewiesen */
assert.throws(() => a.setLedger(t, 'kurs', 'paid', '301'));
a.setLedger(t, 'kurs', 'paid', '100');
assert.throws(() => a.setLedger(t, 'kurs', 'amount', '50'), /Bezahlt übersteigt|höher als/);
const verleihPlan = a.ledgerRows(t).find(r => r.key === 'verleih').plan;
assert.throws(() => a.setLedger(t, 'verleih', 'paid', String(verleihPlan + 1)), /höher als/);
assert.throws(() => a.setLedger(t, 'kurs', 'status', 'bezahlt'));
assert.throws(() => a.setLedger(t, 'kurs', 'due', '2027-02-30'));
assert.throws(() => a.setLedger(t, 'stay', 'paid', '1'), 'Unterkunft läuft über das Angebotsmodell');
assert.throws(() => a.validateLedger([]));
assert.throws(() => a.validateLedger({ 'foo': { status: 'offen', paid: 0 } }));
assert.throws(() => a.validateLedger({ kurs: { status: 'gebucht', amount: -1, paid: 0 } }));
assert.throws(() => a.validateLedger({ kurs: { status: 'gebucht', amount: 10, paid: 20 } }));
a.validateLedger(undefined);

/* Zusammenfassung: gebucht und bezahlt */
a.setLedger(t, 'kurs', 'status', 'gebucht');
let f = a.financeSummary(t);
assert.equal(f.booked, 300);
assert.equal(f.paid, 100);
assert(Math.abs(f.open - (a.cost(t).total - 100)) < 0.01);
assert.equal(a.ledgerRows(t).find(r => r.key === 'kurs').open, 200);

/* Fälligkeiten: überfällig → Warnung, bald → Hinweis, bezahlt → nichts; Kalender */
a.setLedger(t, 'kurs', 'due', dayIso(-1));
assert(a.checks(t).some(x => x[0] === 'warn' && x[1].includes('überfällig') && x[1].includes('200')));
a.setLedger(t, 'kurs', 'due', dayIso(5));
assert(a.checks(t).some(x => x[0] === 'info' && x[1].startsWith('Zahlung fällig')));
assert(a.icsData(t).text.replace(/\r\n /g, '').includes('SUMMARY:Zahlung fällig: Gruppenkurs'));
a.setLedger(t, 'kurs', 'paid', '300');
assert(!a.checks(t).some(x => x[1].includes('Zahlung')));
assert(!a.icsData(t).text.includes('Zahlung fällig'));

/* Eintrag zu entferntem Posten bleibt sichtbar, zählt nicht in die Kosten, Warnung bei Zahlung */
const actItem = t.items.find(i => a.ACTS[i.act] && !a.ACTS[i.act].kurs && a.cost(t).lines.some(l => l.key === 'act:' + i.act && l.c > 0));
const k = 'act:' + actItem.act;
a.setLedger(t, k, 'amount', '50');
a.setLedger(t, k, 'paid', '50');
t.items = t.items.filter(i => i.act !== actItem.act);
assert(!a.cost(t).lines.some(l => l.key === k));
const orphan = a.ledgerRows(t).find(r => r.key === k);
assert(orphan && orphan.orphan && orphan.paid === 50);
assert(a.checks(t).some(x => x[1].includes('nicht mehr im Plan')));

/* Zurücksetzen auf leer entfernt den Eintrag */
const u = a.silvesterTemplate();
a.setLedger(u, 'verleih', 'status', 'angefragt');
assert(u.ledger.verleih);
a.setLedger(u, 'verleih', 'status', 'offen');
assert(!u.ledger.verleih);

/* Sicherung: gültiges Zahlungsbuch geht durch, ungültiges wird abgelehnt */
assert.equal(a.validateBackup(a.backupData([t])).length, 1);
const bad = JSON.parse(JSON.stringify(t)); bad.ledger.kurs.paid = 9999;
assert.throws(() => a.validateBackup(a.backupData([bad])));

/* Mappe zeigt Zahlungen nur, wenn etwas erfasst ist; Ansicht baut sich auf */
assert(a.tMappe(t).includes('<h3>Zahlungen</h3>'));
assert(!a.tMappe(a.silvesterTemplate()).includes('<h3>Zahlungen</h3>'));
assert(a.ledgerSection(t).includes('Buchungen & Zahlungen') && a.ledgerSection(t).includes('data-ledger="kurs"'));
console.log('Zahlungsbuch: Schlüssel, Buchungsbetrag statt Plan (inkl. Puffer), Grenzen, Status, Fälligkeit/Plan-Check/Kalender, entfernte Posten, Sicherung und Mappe geprüft.');
