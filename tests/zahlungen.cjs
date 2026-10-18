const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let code = require("./app-code.cjs")(html);
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

/* Eigene Kosten: keine stille Änderung/Entfernung bestehender finanzieller Verpflichtungen. */
{
  const tr=a.newTrip({puffer:10});tr.extraCosts=[a.costEntryFromForm({title:'Parken',amount:'25'},'kpark')];
  assert.throws(()=>a.costEntryFromForm({title:'X',amount:''},'kbad'));
  assert.throws(()=>a.costEntryFromForm({title:'X',amount:'-1'},'kbad'));
  assert.throws(()=>a.costEntryFromForm({title:'X',amount:'NaN'},'kbad'));
  assert.equal(a.costEntryFromForm({title:'X',amount:'0'},'kzero').c,0);
  const before=JSON.stringify(tr),draft=a.costEntryPreview(tr,'kpark',{title:'Parken',amount:'35',note:'Zwei Tage'});
  assert.equal(JSON.stringify(tr),before);
  assert(draft.after>draft.before);
  a.applyCostEntry(tr,draft);assert.equal(tr.extraCosts[0].c,35);assert.equal(tr.extraCosts[0].id,'kpark');
  assert.throws(()=>a.applyCostEntry(tr,draft),/geändert/);
  for(const e of [{status:'gebucht',paid:0},{status:'angefragt',paid:0},{status:'offen',paid:1},{status:'offen',paid:0,due:'2026-12-01'}]){
    tr.ledger={'xc:kpark':e};
    assert.throws(()=>a.costEntryPreview(tr,'kpark',null,true),/Nicht entfernt/);
    assert.throws(()=>a.costEntryPreview(tr,'kpark',{title:'Parken',amount:'40'}),/geschützt/);
    const note=a.costEntryPreview(tr,'kpark',{title:'Parken',amount:'35',note:'Beleg im Auto'});assert.equal(note.candidate.extraCosts[0].note,'Beleg im Auto');
  }
  delete tr.ledger;const remove=a.costEntryPreview(tr,'kpark',null,true);
  tr.ledger={'xc:kpark':{status:'gebucht',paid:0}};assert.throws(()=>a.applyCostEntry(tr,remove),/geändert/);
  delete tr.ledger;a.applyCostEntry(tr,a.costEntryPreview(tr,'kpark',null,true));assert.equal(tr.extraCosts.length,0);
}
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
const detached = a.financeSummary(t);
assert.equal(detached.detachedPaid, 50);
assert.equal(detached.paid, detached.activePaid + 50);
assert(Math.abs(detached.open - Math.max(0, a.cost(t).total - detached.activePaid)) < 0.01, 'Entfernte Zahlung darf neuen Plan nicht bezahlen');
assert(a.ledgerSection(t).includes('reduzieren den offenen Betrag'));
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

/* Szenarien bleiben nachvollziehbar und verändern weder Reise noch Buchungen. */
const scenarioTrip = a.silvesterTemplate();
scenarioTrip.food = 'gemischt'; scenarioTrip.puffer = 10;
const unchanged = JSON.stringify(scenarioTrip);
const scenarios = a.costScenarios(scenarioTrip);
assert.equal(scenarios.length, 3);
assert.equal(scenarios[1].total, a.cost(scenarioTrip).total);
assert(scenarios[0].total <= scenarios[1].total && scenarios[1].total <= scenarios[2].total);
scenarios.forEach(r => {
 assert(Math.abs(r.total-r.lines.reduce((sum,l)=>sum+l.c,0))<0.001);
 assert.equal(r.expenses+r.reserve, r.total);
 assert.deepEqual(r.open, a.openCosts(scenarioTrip));
});
assert.equal(JSON.stringify(scenarioTrip), unchanged);
const noKitchen = a.newTrip({food:'gemischt',nights:0});
assert.equal(a.costScenarios(noKitchen)[0].total, a.cost(noKitchen).total);
assert(a.scenarioSection(scenarioTrip).includes('keine Preisobergrenze'));
assert(a.tKosten(scenarioTrip).includes('data-cost-scenarios'));

assert.equal(a.costScenarios(t)[1].remaining, detached.open, 'Szenario und Zahlungsbuch rechnen gleich');
assert(a.tMappe(t).includes('für entfernte Posten bezahlt; separat klären'));

/* Spartipps respektieren konkrete Verpflichtungen und brauchen eine aktuelle Vorschau. */
const advice = a.silvesterTemplate();
advice.food = 'auswaerts';
const candidates = a.savingTips(advice);
assert(candidates.length > 0);
const foodIndex = candidates.findIndex(tip => tip.t.includes('selbst kochen'));
assert(foodIndex >= 0, 'bestätigte Küche erlaubt Kochvorschlag');
const source = JSON.stringify(advice), preview = a.savingPreview(advice, foodIndex);
assert(preview && preview.saved > 0);
assert.equal(JSON.stringify(advice), source, 'Vorschau verändert den Originalplan nicht');
assert.equal(preview.after, a.cost(preview.candidate).total);
const copied = JSON.parse(JSON.stringify(advice));
a.applySavingPreview(copied, preview);
assert.equal(a.cost(copied).total, preview.after);
advice.notes = 'zwischenzeitlich geändert';
assert.throws(() => a.applySavingPreview(advice, preview), /geändert/);
const noCook = a.newTrip({food:'auswaerts'});
assert(!a.savingTips(noCook).some(tip=>tip.t.includes('selbst kochen')), 'unbekannte Küche ist kein Treffer');
const courseBooked = a.silvesterTemplate();
a.setLedger(courseBooked,'kurs','status','gebucht');
assert(!a.savingTips(courseBooked).some(tip=>tip.t.includes('Kurstag weniger')));
const courseDue = a.silvesterTemplate();
a.setLedger(courseDue,'kurs','due','2026-12-01');
assert(!a.savingTips(courseDue).some(tip=>tip.t.includes('Kurstag weniger')));
const checkBooked = a.silvesterTemplate();
checkBooked.check['b-oj-kurs'] = true;
assert(!a.savingTips(checkBooked).some(tip=>tip.t.includes('Kurstag weniger')));
checkBooked.check.stay = true;
assert(!a.savingTips(checkBooked).some(tip=>tip.t.includes('Katalog-Unterkunft')));
/* Jeder erlaubte Tipp lässt die geschützten Verpflichtungen gleich. */
[courseBooked, courseDue, checkBooked].forEach(tr => a.savingTips(tr).forEach(tip=>{
 const next = JSON.parse(JSON.stringify(tr));tip.fn(next);
 assert.equal(a.commitmentIssues(tr,next).length,0);
}));
console.log('Spartipps: Buchung/Zahlung/Fälligkeit geschützt, bestätigte Küche, unverändernde Vorschau und Sperre bei zwischenzeitlicher Änderung geprüft.');
