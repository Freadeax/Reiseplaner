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

/* Phase: 30.12.2026–03.01.2027 hat 5 Kalendertage */
const t = a.silvesterTemplate();
assert.equal(a.tripPhase(t, at('2026-12-01')).phase, 'vor');
assert.equal(a.tripPhase(t, at('2026-12-29')).days, 1);
assert.equal(a.phaseText(a.tripPhase(t, at('2026-12-29'))), 'noch 1 Tag');
const p0 = a.tripPhase(t, at('2026-12-30'));
assert.equal(p0.phase, 'unterwegs'); assert.equal(p0.day, 0); assert.equal(p0.of, 5);
assert(a.phaseText(p0).startsWith('heute geht'));
assert.equal(a.phaseText(a.tripPhase(t, at('2027-01-01'))), 'unterwegs · Tag 3 von 5');
assert(a.phaseText(a.tripPhase(t, at('2027-01-03'))).startsWith('Abreisetag'));
assert.equal(a.tripPhase(t, at('2027-01-04')).phase, 'nach');
assert.equal(a.tripPhase(a.newTrip({ dateMode: 'open' }), at('2026-12-30')), null);
assert.equal(a.tripPhase(a.newTrip({ dateMode: 'fix', start: '2026-12-30', end: '2026-12-30' }), at('2026-12-30')), null);

/* Kalender: ganztägige Reise mit exklusivem Ende, Programmpunkte vorläufig, CRLF, gefaltete Zeilen */
const ics = a.icsData(t, new Date('2026-10-13T08:00:00Z'));
assert(ics && ics.text.startsWith('BEGIN:VCALENDAR\r\n') && ics.text.endsWith('END:VCALENDAR\r\n'));
assert(ics.text.includes('DTSTART;VALUE=DATE:20261230\r\n'));
assert(ics.text.includes('DTEND;VALUE=DATE:20270104\r\n'));
assert.equal(ics.events, 1 + t.items.length);
assert.equal((ics.text.match(/BEGIN:VEVENT/g) || []).length, ics.events);
assert.equal((ics.text.match(/STATUS:TENTATIVE/g) || []).length, t.items.length);
assert(ics.text.includes('DTSTAMP:20261013T080000Z'));
assert(!/[^\r]\n/.test(ics.text), 'nur CRLF als Zeilenende');
ics.text.split('\r\n').forEach(line => assert(Buffer.byteLength(line, 'utf8') <= 75, 'Zeile zu lang: ' + line));
const unfolded = ics.text.replace(/\r\n /g, '');
assert(unfolded.includes('Genaue Uhrzeit und Öffnungszeiten beim Anbieter prüfen'));
/* Silvester-Punkte liegen am 31.12. */
const silv = t.items.find(i => i.act.startsWith('silv-'));
if (silv) assert(unfolded.includes('UID:' + t.id + '-' + silv.uid + '@reiseplaner\r\nDTSTAMP:20261013T080000Z\r\nDTSTART:20261231T'));
/* Maskierung und Faltung mit Mehrbytezeichen */
assert.equal(a.icsFold('X'.repeat(75)), 'X'.repeat(75));
const folded = a.icsFold('DESCRIPTION:' + 'ä'.repeat(80));
folded.split('\r\n').forEach(line => assert(Buffer.byteLength(line, 'utf8') <= 75));
assert.equal(folded.replace(/\r\n /g, ''), 'DESCRIPTION:' + 'ä'.repeat(80));
const odd = a.newTrip({ title: 'A;B,C\\D\nE', dateMode: 'fix', start: '2026-05-01', end: '2026-05-03' });
assert(a.icsData(odd).text.includes('SUMMARY:A\;B\\,C\\\\D\\nE\r\n'));
/* Punkte nach dem letzten Tag werden gezählt, nicht exportiert; ohne feste Daten kein Kalender */
odd.customActs = [{ id: 'c1', custom: true, t: 'Spät', cat: 'eigen', cost: 0, per: 'grp' }];
odd.items = [{ uid: 'i1', act: 'c1', day: 9, slot: 'abend' }];
assert.equal(a.icsData(odd).skipped, 1);
assert.equal(a.icsData(odd).events, 1);
assert.equal(a.icsData(a.newTrip({ dateMode: 'flex' })), null);

/* Text zum Teilen: Planwert-Hinweis, Notizen nur auf Wunsch */
t.notes = 'Buchungsnummer 12345';
const txt = a.tripText(t);
assert(txt.includes('Planwert, kein bestätigter Preis'));
assert(!txt.includes('12345'));
assert(a.tripText(t, { notes: true }).includes('12345'));
assert(a.tripText(odd).includes('nach dem letzten Reisetag'));

/* Ansichten bauen sich auf und verändern die Reise nicht */
const before = JSON.stringify(t);
const mappe = a.tMappe(t);
assert(mappe.includes('Reisemappe') && mappe.includes('Kalender (.ics)'));
assert(!mappe.includes('12345'), 'Notizen standardmäßig nicht in der Mappe');
a.UI.mappeNotes = true;
assert(a.tMappe(t).includes('12345'));
a.UI.mappeNotes = false;
assert(a.tMappe(a.newTrip()).includes('disabled'));
assert.equal(JSON.stringify(t), before);
assert.equal(a.todayBlock(a.newTrip()), '');
console.log('Unterwegs-Phase, Kalenderexport, Reisemappe und Teilen-Text geprüft.');
