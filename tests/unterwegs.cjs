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
assert.equal(a.tripPhase(a.newTrip({ dateMode: 'fix', start: '2026-12-30', end: '2026-12-29' }), at('2026-12-30')), null);

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

/* Plan B bei schlechtem Wetter: nur drinnen, nicht doppelt, Katalogregeln zum Datum beachtet */
const r = a.silvesterTemplate(); // Oberjoch, 30.12.2026–03.01.2027
const ideas = [0, 1, 2, 3, 4].map(i => a.rainIdeas(r, i, 10));
ideas.forEach((list, i) => list.forEach(x => {
  assert(x.indoor, x.t + ' ist nicht drinnen');
  assert(!r.items.some(it => it.day === i && it.act === x.id), x.t + ' ist an Tag ' + i + ' schon geplant');
}));
/* Wonnemar ist Silvester abends zu, Standard-Zeitfenster Nachmittag bleibt erlaubt; Schneeschuh nur donnerstags */
assert(a.fitsDay(a.ACTS['oj-wbad'], a.daysOf(r)[1], 'abend') === false);
assert(a.fitsDay(a.ACTS['oj-wbad'], a.daysOf(r)[1], 'nachm') === true);
assert(a.fitsDay(a.ACTS['oj-schneeschuh'], a.daysOf(r)[1]) === true);  // 31.12.2026 ist ein Donnerstag
assert(a.fitsDay(a.ACTS['oj-schneeschuh'], a.daysOf(r)[2]) === false);
/* Hinweise wie „vorübergehend geschlossen“ stehen hinten */
const all = a.rainIdeas(r, 2, 10);
const firstWarn = all.findIndex(x => x.warn);
if (firstWarn >= 0) assert(all.slice(firstWarn).every(x => x.warn));
assert.deepEqual(a.rainIdeas(r, 99), []);
assert.deepEqual(a.rainIdeas(a.newTrip(), 0), []);
console.log('Plan B bei schlechtem Wetter geprüft.');

/* Packliste aus dem Plan: Mitbringsel der geplanten Unternehmungen, ohne Dubletten zur Grundliste */
const pk = a.silvesterTemplate();
pk.items = [{ uid: 'a', act: 'oj-wsauna', day: 1, slot: 'nachm' }, { uid: 'b', act: 'oj-klamm', day: 2, slot: 'morgen' }, { uid: 'c', act: 'oj-klamm', day: 3, slot: 'morgen' }, { uid: 'd', act: 'oj-rodeln', day: 40, slot: 'nachm' }];
const grp = a.checklist(pk).find(g => g[0] === 'Packliste: für eure Unternehmungen');
assert(grp, 'Gruppe fehlt');
const texts = grp[1].map(i => i[1]);
assert(texts.includes('Bademantel, 2 Handtücher') && texts.includes('Grödel oder Spikes'));
assert(!texts.includes('Schlappen'), 'Schlappen stehen schon in der Winter-Grundliste');
assert(!texts.includes('Wasserdichte Handschuhe'), 'Punkt nach dem letzten Reisetag zählt nicht');
assert.equal(texts.filter(x => x === 'Grödel oder Spikes').length, 1);
assert(grp[1].find(i => i[1] === 'Grödel oder Spikes')[2].includes('Breitachklamm'));
pk.items = [];
assert(!a.checklist(pk).some(g => g[0] === 'Packliste: für eure Unternehmungen'));
console.log('Packliste aus dem Plan geprüft.');

/* Spartipps empfehlen keine Unterkunft, die dem Plan widerspricht (Sauna/Küche) */
for (const pl of Object.keys(a.PLACES)) {
  const needSauna = Object.values(a.ACTS).filter(x => x.needSauna && (x.place === '*' || x.place.split('|').includes(pl)));
  const kitchen = Object.values(a.ACTS).filter(x => x.kitchen && (x.place === '*' || x.place.split('|').includes(pl)));
  for (const st of a.STAYS.filter(s => s.place === pl)) {
    for (const act of needSauna.concat(kitchen)) {
      const tt = a.newTrip({ catalog: 'allgaeu', place: pl, stayId: st.id, dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', items: [{ uid: '1', act: act.id, day: 1, slot: 'abend' }] });
      const conflictsBefore = a.checks(tt).filter(x => /Sauna|Küche/.test(x[1])).length;
      a.savingTips(tt).forEach(tip => {
        const c = JSON.parse(JSON.stringify(tt)); tip.fn(c);
        assert(a.checks(c).filter(x => /Sauna|Küche/.test(x[1])).length <= conflictsBefore, pl + '/' + st.id + ': Tipp „' + tip.t + '“ erzeugt Konflikt');
      });
    }
  }
}
const wb = a.newTrip({ catalog: 'allgaeu', place: 'oberjoch', stayId: 'oj-haug', items: [{ uid: '1', act: 'oj-wsauna', day: 1, slot: 'nachm' }] });
assert(!a.savingTips(wb).some(x => x.t.includes('frei')), 'Gratis-Versprechen ohne bestätigte Gästekarte');
console.log('Spartipps ohne Sauna-/Küchenkonflikt und ohne unbestätigte Gratis-Versprechen geprüft.');

/* Tagesausflug: Phase und Kalender */
const tag = a.newTrip({ type: 'tag', title: 'Bodensee', dateMode: 'fix', start: '2027-06-05', end: '2027-06-05', nights: 0 });
assert.equal(a.phaseText(a.tripPhase(tag, at('2027-06-05'))), 'heute ist es so weit');
assert.equal(a.tripPhase(tag, at('2027-06-06')).phase, 'nach');
const ti = a.icsData(tag);
assert(ti.text.includes('DTSTART;VALUE=DATE:20270605\r\n') && ti.text.includes('DTEND;VALUE=DATE:20270606\r\n'));
console.log('Tagesausflug in Unterwegs-Ansicht und Kalender geprüft.');
