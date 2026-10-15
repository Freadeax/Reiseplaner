/* Module Kosten (Budget/Rückblick) und Notizen (Claude, #8). Node-Test, kein Browser-/iPhone-Test. */
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

/* Budget: Spielraum, fest vs. geschätzt, Abweichungen, keine Mutation */
{
  const t = a.newTrip({ budget: 1000, persons: 2, nights: 2, puffer: 0, dateMode: 'fix', start: '2026-11-06', end: '2026-11-08' });
  t.extraCosts = [a.costEntryFromForm({ title: 'Parken', amount: '40' }, 'kpark'), a.costEntryFromForm({ title: 'Museum', amount: '30' }, 'kmus')];
  const before = JSON.stringify(t);
  let x = a.budgetCheck(t, new Date('2026-10-15T12:00:00Z'));
  assert.equal(JSON.stringify(t), before, 'budgetCheck verändert die Reise nicht');
  assert.equal(x.total, a.cost(t).total, 'Gesamt = Kostenrechnung');
  assert.equal(x.fixed, 0, 'ohne Buchung nichts fest');
  assert(Math.abs(x.left - (1000 - x.total)) < 0.01);
  assert(Math.abs(x.leftPerPersonDay - x.left / 2 / 3) < 0.01, 'pro Person und Tag (3 Reisetage)');
  const key = a.ledgerRows(t).find(r => r.label === 'Parken').key;
  a.setLedger(t, key, 'amount', '55'); a.setLedger(t, key, 'paid', '20');
  x = a.budgetCheck(t, new Date('2026-10-15T12:00:00Z'));
  assert.equal(x.fixed, 55, 'erfasster Betrag zählt als fest');
  assert.equal(x.devs.length, 1); assert.equal(x.devs[0].diff, 15, 'Parken 15 € teurer');
  assert.equal(x.total - x.plan, 15, 'Plan ohne Buchungsbuch bleibt Ursprung');
  const eig = x.cats.find(c => c.key === 'eigen'); assert.equal(eig.paid, 20); assert.equal(eig.plan, 70); assert.equal(eig.now, 85);
  const k2 = a.ledgerRows(t).find(r => r.label === 'Museum').key;
  a.setLedger(t, k2, 'amount', '32'); /* unter 10 % und unter 5 €: keine Abweichung */
  assert.equal(a.budgetCheck(t).devs.length, 1);
  a.setLedger(t, k2, 'status', 'gebucht');
  assert.equal(a.budgetCheck(t).fixed, 87, 'gebuchter Status zählt mit Betrag');
  /* Über Budget */
  t.budget = 10; x = a.budgetCheck(t);
  assert(x.over && x.left < 0);
  assert(a.budgetSection(t).includes('über dem Budget'));
  /* Rückblick erst nach der Reise */
  t.budget = 1000;
  assert(!a.budgetSection(t, new Date('2026-10-15T12:00:00Z')).includes('Rückblick'));
  const r = a.budgetSection(t, new Date('2026-11-20T12:00:00Z'));
  assert(r.includes('Rückblick') && r.includes('ohne erfassten Betrag'), 'Rückblick nennt unerfasste Posten');
  /* Ohne Budget: Hinweis mit Knopf, keine Division */
  t.budget = 0; x = a.budgetCheck(t);
  assert.equal(x.left, null); assert(a.budgetSection(t).includes('data-act="edit-trip"'));
  /* Escape: Postenname mit HTML */
  t.extraCosts.push(a.costEntryFromForm({ title: '<img src=x>', amount: '10' }, 'kxss'));
  const kx = a.ledgerRows(t).find(r => r.label === '<img src=x>').key; a.setLedger(t, kx, 'amount', '50');
  assert(!a.budgetSection(t).includes('<img src=x>'), 'Bezeichnungen escaped');
}
console.log('Module: Budget (Spielraum, fest/geschätzt, Abweichungen, Rückblick nach Reiseende) geprüft.');

/* Notizen: Links, Telefonnummern, Bausteine */
{
  const L = a.notesLinks('Haus: https://www.example.org/haus/12?x=1. Und http://test.de, doppelt https://www.example.org/haus/12?x=1 javascript:alert(1) ftp://x.de');
  assert.equal(L.length, 2, 'nur http(s), dedupliziert');
  assert.equal(L[0].url, 'https://www.example.org/haus/12?x=1', 'Satzzeichen am Ende entfernt');
  assert(L[0].label.startsWith('example.org/haus'));
  const P = a.notesPhones('Gastgeber +49 8321 12345, Rezeption 08321/98765-0. Anreise 2026-12-30, PLZ 87561, Preis 1.500 € https://x.de/0123456789');
  assert.deepEqual(P.map(p => p.tel), ['+49832112345', '08321987650'], 'Datum, PLZ, Preis und URL-Ziffern sind keine Nummern');
  const t = a.newTrip({ checkinTime: '15:00' });
  t.notes = 'Eigene Idee';
  a.addNoteBlock(t, 'anreise');
  assert(t.notes.startsWith('Eigene Idee\n\nAnreise & Ankunft'), 'an das Ende angehängt, Bestand erhalten');
  assert(t.notes.includes('ab 15:00'), 'Check-in-Zeit übernommen');
  assert(a.notesHas(t, 'anreise'));
  assert.throws(() => a.addNoteBlock(t, 'anreise'), /schon/);
  assert.throws(() => a.addNoteBlock(t, 'xyz'), /Unbekannt/);
  a.addNoteBlock(t, 'notfall'); assert(t.notes.includes('112'));
  const html = a.tNotiz(t);
  assert(html.includes('data-val="kontakte"') && !html.includes('data-val="anreise"'), 'vorhandene Bausteine nicht erneut anbieten');
  assert(a.notesExtras({ notes: '<script>x</script> https://a.de/"><b>' }).indexOf('<script>') < 0, 'escaped');
  const big = a.newTrip({}); big.notes = 'x'.repeat(19990);
  assert.throws(() => a.addNoteBlock(big, 'kontakte'), /zu lang/);
  assert.equal(big.notes.length, 19990, 'bei Fehler unverändert');
}
console.log('Module: Notizen (Links, Telefonnummern, Bausteine ohne Datenverlust) geprüft.');

/* Unternehmungen: Suche, eingeplant/offen, Sortierung */
{
  const t = a.newTrip({ persons: 2 });
  const mk = (id, f) => Object.assign(a.customActFromForm(Object.assign({ cat: 'eigen', per: 'pp' }, f), id));
  t.customActs = [
    Object.assign(mk('cz', { title: 'Zoo Wilhelma', cost: '25', hours: '3' }), { ort: 'Stuttgart' }),
    mk('cm', { title: 'Münster Ulm', cost: '', free: true, hours: '1' }),
    mk('cb', { title: 'Brauereiführung', cost: '12', hours: '2' }),
    mk('co', { title: 'Offener Preis', cost: '', hours: '' })
  ];
  t.items = [{ uid: 'i1', act: 'cb', day: 0, slot: 'abend' }];
  const before = JSON.stringify(t);
  const ids = f => a.activityList(t, f).filter(x => x.custom).map(x => x.id);
  assert.deepEqual(ids({ q: 'munster' }), ['cm'], 'akzenttolerante Suche');
  assert.deepEqual(ids({ q: 'stuttgart zoo' }), ['cz'], 'alle Wörter, auch Ort');
  assert.deepEqual(ids({ planned: 'geplant' }), ['cb']);
  assert(!ids({ planned: 'offen' }).includes('cb'));
  assert.deepEqual(ids({ sort: 'preis' }), ['cm', 'cb', 'cz', 'co'], 'Preis: kostenlos zuerst, offener Preis zuletzt');
  assert.equal(a.actCost(t, t.customActs[0]).n, 50, 'pro Person × 2');
  assert.deepEqual(ids({ sort: 'dauer' }), ['cm', 'cb', 'cz', 'co'], 'Dauer kurz zuerst, ohne Dauer zuletzt');
  assert.deepEqual(ids({ sort: 'name' }), ['cb', 'cm', 'co', 'cz']);
  assert.deepEqual(ids({}), ['cz', 'cm', 'cb', 'co'], 'ohne Sortierung Reihenfolge erhalten');
  assert.equal(JSON.stringify(t), before, 'Filtern/Sortieren ändert die Reise nicht');
}
console.log('Module: Unternehmungen (Suche, eingeplant/offen, Sortierung nach Preis/Dauer/Name) geprüft.');

/* Tagesplan: Programmkosten je Tag und freie Zeitfenster */
{
  const t = a.newTrip({ persons: 2, nights: 2, dateMode: 'fix', start: '2026-11-06', end: '2026-11-08' });
  const mk = (id, f) => a.customActFromForm(Object.assign({ cat: 'eigen', per: 'pp' }, f), id);
  t.customActs = [mk('da', { title: 'Therme', cost: '20', hours: '3' }), mk('db', { title: 'Museum', cost: '', hours: '2' }), mk('dc', { title: 'Führung', cost: '30', per: 'grp', hours: '1' })];
  t.items = [{ uid: 'x1', act: 'da', day: 0, slot: 'nachm' }, { uid: 'x2', act: 'da', day: 1, slot: 'morgen' }, { uid: 'x3', act: 'db', day: 1, slot: 'abend' }, { uid: 'x4', act: 'dc', day: 2, slot: 'mittag' }];
  const before = JSON.stringify(t);
  let d = a.dayCosts(t);
  assert.deepEqual(d.map(x => x.total), [40, 40, 30]);
  assert.equal(d[1].open, 1, 'offener Preis gezählt, nicht als 0 € verschwiegen');
  assert.equal(JSON.stringify(t), before);
  /* Gebuchter Betrag für eine zweimal eingeplante Idee: im Verhältnis der Planwerte verteilt */
  a.setLedger(t, 'act:da', 'amount', '100');
  d = a.dayCosts(t);
  assert.deepEqual(d.map(x => x.total), [50, 50, 30], 'Buchung 100 € auf zwei Termine verteilt');
  assert.equal(d[0].shared, 50, 'verteilte Buchung als anteilig markiert');
  const sum = d.reduce((x, y) => x + y.total, 0), lines = a.cost(t).lines.filter(l => l.key && l.key.startsWith('act:')).reduce((x, l) => x + l.c, 0);
  assert.equal(sum, lines, 'Summe der Tage = Unternehmungskosten');
  assert.deepEqual(a.freeSlots(t, 0), ['Vormittag', 'Mittag', 'Abend']);
  assert.equal(a.freeSlots(t, 5).length, 4);
  /* Katalogreise: Kurs, Skipass, Verleih anteilig, Gesamtkosten unverändert */
  const s = a.silvesterTemplate(), c0 = a.cost(s).total, ds = a.dayCosts(s);
  assert.equal(a.cost(s).total, c0);
  const multi = a.cost(s).lines.filter(l => l.days && l.days.length).reduce((x, l) => x + l.c, 0);
  const shared = ds.reduce((x, y) => x + y.shared, 0);
  assert(Math.abs(multi - shared) < 0.05, 'Mehrtagesposten vollständig auf Tage verteilt (' + multi + ' / ' + shared + ')');
}
console.log('Module: Tagesplan (Programmkosten je Tag, Buchungen verteilt, offene Preise, freie Zeitfenster) geprüft.');

/* Fahrplan bis zur Abreise und Kalender-Erinnerungen */
{
  const now = new Date('2026-11-20T10:00:00Z');
  const t = a.newTrip({ type: 'winter', travel: 'auto', origin: 'Göppingen', departTime: '08:30', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', nights: 4 });
  t.extraCosts = [a.costEntryFromForm({ title: 'Skikurs', amount: '200' }, 'kurs'), a.costEntryFromForm({ title: 'Alt', amount: '50' }, 'alt')];
  a.setLedger(t, 'xc:kurs', 'due', '2026-12-01'); a.setLedger(t, 'xc:kurs', 'paid', '50');
  a.setLedger(t, 'xc:alt', 'due', '2026-11-10');
  const before = JSON.stringify(t);
  const p = a.departurePlan(t, now);
  assert.equal(JSON.stringify(t), before, 'keine Mutation');
  const kinds = p.items.map(x => x.kind + ':' + x.date);
  assert.deepEqual(kinds, ['zahlung:2026-11-10', 'zahlung:2026-12-01', 'auto:2026-12-23', 'packen:2026-12-29', 'abfahrt:2026-12-30'], 'chronologisch, nur echte Fristen');
  assert(p.items[0].overdue && !p.items[1].overdue, 'überfällig erkannt');
  assert(p.items[1].detail.includes('150'), 'offener Restbetrag, nicht Gesamtbetrag');
  assert(p.items[4].label.includes('08:30'));
  assert.equal(p.daysLeft, 40);
  assert(p.undated.length >= 1 && p.undated.every(x => x.go === 'check'), 'offene Buchungen ohne erfundene Frist');
  /* bezahlt → keine Zahlungsfrist mehr */
  a.setLedger(t, 'xc:kurs', 'paid', '200');
  assert(!a.departurePlan(t, now).items.some(x => x.label.includes('Skikurs')));
  /* Kalender: Erinnerungen nur auf Wunsch, nur zukünftige, mit Alarm */
  const plain = a.icsData(t, now), rem = a.icsData(t, now, { reminders: true });
  assert.equal(plain.reminders, 0); assert(!/VALARM/.test(plain.text), 'ohne Option unverändert');
  assert.equal(rem.reminders, 2, 'Winter-Check und Packtag, überfällige Zahlung nicht');
  assert.equal((rem.text.match(/BEGIN:VALARM/g) || []).length, 2);
  assert(/TRIGGER;RELATED=START:PT9H/.test(rem.text) && /DTSTART;VALUE=DATE:20261229/.test(rem.text));
  assert.equal(rem.events, plain.events + 2);
  /* Ohne feste Daten kein Fahrplan; Block nur vor der Reise */
  assert.equal(a.departurePlan(a.newTrip({ dateMode: 'open' }), now), null);
  assert(a.departureBlock(t, now).includes('Fahrplan bis zur Abreise'));
  assert.equal(a.departureBlock(t, new Date('2027-01-01T10:00:00Z')), '');
}
console.log('Module: Fahrplan bis zur Abreise (Fristen, Packtag, Abfahrt, ohne erfundene Fristen) und Kalender-Erinnerungen geprüft.');
