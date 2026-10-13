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

/* Katalog-Planwerte: Kennzeichnung passt zum Reisezeitraum */
const winter = (start, end) => a.newTrip({ catalog: 'allgaeu', place: 'oberjoch', stayId: 'oj-holidu', dateMode: 'fix', start, end });
assert.equal(a.holidayStay(winter('2026-12-30', '2027-01-03')), true);
assert.equal(a.holidayStay(winter('2027-01-05', '2027-01-09')), true);   // berührt 06.01.
assert.equal(a.holidayStay(winter('2027-02-10', '2027-02-14')), false);
assert.equal(a.holidayStay(winter('2026-12-20', '2026-12-23')), false);
assert.equal(a.holidayStay(a.newTrip({ dateMode: 'flex', month: '2027-02' })), false);
assert.equal(a.holidayStay(a.newTrip({ dateMode: 'flex', month: '2026-12' })), null);
assert.equal(a.holidayStay(a.newTrip({ dateMode: 'open' })), null);
const stayLine = tr => a.cost(tr).lines.find(l => l.cat === 'unterkunft');
assert(stayLine(winter('2026-12-30', '2027-01-03')).s.includes('Jahreswechsel: Inserat +15 %'));
const feb = stayLine(winter('2027-02-10', '2027-02-14'));
assert(feb.s.includes('für eure Daten nicht geprüft') && !feb.s.includes('Silvester'), 'Februar-Reise darf nicht als Silvesterpreis erscheinen');
assert.equal(feb.src, 'est');
assert.equal(feb.c, stayLine(winter('2026-12-30', '2027-01-03')).c, 'Betrag bleibt derselbe Schätzwert, nur ehrlich gekennzeichnet');

/* Startvorlagen: nur Struktur, keine erfundenen Preise, Angebote oder Buchungen */
assert(a.TEMPLATES.length >= 5);
assert.equal(a.TEMPLATES.filter(x => /silvester/i.test(x.name)).length, 1, 'Silvester ist genau ein Beispiel unter mehreren');
for (const x of a.TEMPLATES.filter(y => y.id !== 'silvester')) {
  const tr = x.make();
  assert.equal(tr.stayId, '', x.id + ': keine Unterkunft vorgegeben');
  assert.equal((tr.items || []).length, 0, x.id + ': kein Programm vorgegeben');
  assert.equal(tr.stayQuote, null);
  assert.equal(+tr.budget, 0, x.id + ': kein ausgedachtes Budget');
  assert.equal(tr.status, 'idee');
  assert.equal(a.validateBackup(a.backupData([tr])).length, 1, x.id + ': Vorlage ist gültig exportierbar');
}
assert.equal(a.nightsOf(a.TEMPLATES.find(x => x.id === 'tag').make()), 0);
assert.equal(a.TEMPLATES.find(x => x.id === 'winter').make().catalog, 'allgaeu');

/* Datumsgebundene Punkte: allgemeine Meldung statt „für Silvester gedacht“ */
const moved = a.silvesterTemplate();
const silv = moved.items.find(i => a.ACTS[i.act] && a.ACTS[i.act].onlyDate);
silv.day = 0;
const msg = a.checks(moved).find(x => x[1].includes('gilt nur am'));
assert(msg && msg[1].includes('31.12.'), 'Meldung nennt das Datum');
console.log('Startvorlagen, zeitraumgerechte Planwert-Kennzeichnung und datumsgebundene Meldungen geprüft.');
