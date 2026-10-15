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
