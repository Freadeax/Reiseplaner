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
const at = s => new Date(s + 'T12:00:00'); // lokale Mittagszeit, unabhängig von der Zeitzone

/* Datenqualität der Portalabfragen */
for (const [id, x] of Object.entries(a.PRICE_SAMPLES)) {
  assert(a.STAYS.some(s => s.id === id), id + ': unbekannte Unterkunft');
  assert(/^https:\/\//.test(x.src) && x.incl, id + ': Quelle/Leistungen fehlen');
  for (const [from, to, total] of x.s) {
    assert(a.pd(from) && a.pd(to) && a.pd(to) > a.pd(from), id + ': ungültiger Zeitraum ' + from);
    assert(total > 0, id + ': Betrag fehlt');
  }
}

/* Saison der Reise */
const fix = (start, end, o) => a.newTrip(Object.assign({ catalog: 'allgaeu', dateMode: 'fix', start, end, persons: 2 }, o));
assert.equal(a.tripSeason(fix('2027-02-10', '2027-02-14')), 'winter');
assert.equal(a.tripSeason(fix('2026-12-30', '2027-01-03')), 'jahreswechsel');
assert.equal(a.tripSeason(fix('2026-12-22', '2026-12-27')), 'jahreswechsel', 'Mehrheit der Nächte zählt');
assert.equal(a.tripSeason(fix('2027-11-02', '2027-11-06')), 'herbst');
assert.equal(a.tripSeason(a.newTrip({ dateMode: 'flex', month: '2027-08' })), 'sommer');
assert.equal(a.tripSeason(a.newTrip({ dateMode: 'open' })), null);

// Feste Prüfuhr: spätere Testläufe dürfen Preise nicht als frisch behandeln.
vm.runInContext("const RealDate=Date; Date=class extends RealDate { constructor(...args){super(...(args.length?args:['2026-10-14T12:00:00']))} };", context);
const line = tr => a.cost(tr).lines.find(l => l.cat === 'unterkunft');
/* Beispielreise: exakt abgefragter Zeitraum → Portalpreis statt zu niedrigem Planwert (früher 4 × 110 €) */
const ex = a.silvesterTemplate();
assert.equal(ex.stayId, 'oj-fuegen');
assert.equal(line(ex).c, 680);
assert.equal(line(ex).src, 'ok');
assert(line(ex).s.includes('Portalpreis') && line(ex).s.includes('14.10.2026'));
/* Anderer Zeitraum derselben Saison → Vergleichswert, klar gekennzeichnet */
const feb = fix('2027-02-10', '2027-02-14', { place: 'oberjoch', stayId: 'oj-fuegen' });
assert.equal(line(feb).c, 680);
assert.equal(line(feb).src, 'est');
assert(line(feb).s.includes('Vergleichswert Winter') && line(feb).s.includes('für eure Daten nicht abgefragt'));
/* Höchster Nachtwert der Saison (nicht unterschätzen): Schön Hier Winter 500/500/460 → 125 €/Nacht */
const sh = fix('2027-01-18', '2027-01-21', { place: 'oberstaufen', stayId: 'os-schoen' });
assert.equal(line(sh).c, 375);
/* Ohne Abfrage in der Saison → gekennzeichneter Schätzwert wie bisher */
const shSilv = fix('2026-12-30', '2027-01-03', { place: 'oberstaufen', stayId: 'os-schoen' });
assert(line(shSilv).s.includes('Planwert') && line(shSilv).s.includes('Jahreswechsel'));
assert.equal(a.stayNight(fix('2027-02-01', '2027-02-05', { place: 'tannheim', stayId: 'tt-rosemarie' }), a.STAYS.find(s => s.id === 'tt-rosemarie')).sample, null);
assert(Math.abs(line(fix('2027-11-08', '2027-11-12', { place: 'tannheim', stayId: 'tt-rosemarie' })).c - 467.23) < 0.01);
/* Offenes Datum → keine Saison, Schätzwert */
assert.equal(a.stayNight(a.newTrip({ catalog: 'allgaeu', place: 'oberjoch', stayId: 'oj-fuegen' }), a.STAYS.find(s => s.id === 'oj-fuegen')).sample, null);
/* Eigenes Angebot hat Vorrang */
const q = fix('2027-02-10', '2027-02-14', { place: 'oberjoch', stayId: 'oj-fuegen', stayQuote: 600 });
assert.equal(line(q).c, 600);
/* Andere Personenzahl als abgefragt → offener Punkt */
const four = fix('2027-02-10', '2027-02-14', { place: 'oberjoch', stayId: 'oj-fuegen', persons: 4 });
assert(a.openCosts(four).some(x => x.includes('für 4 Personen')));
assert(!a.openCosts(feb).some(x => x.includes('Personen beim Anbieter')));

/* Nicht mehr auffindbares Inserat: Warnung, kein Spartipp dorthin */
const gone = fix('2027-02-10', '2027-02-14', { place: 'oberjoch', stayId: 'oj-haug' });
assert(a.checks(gone).some(x => x[0] === 'warn' && x[1].includes('nicht mehr auffindbar')));
assert(a.openCosts(gone).some(x => x.includes('Inserat nicht mehr auffindbar')));
for (const st of a.STAYS.filter(s => s.place === 'oberjoch' && !s.gone)) {
  const tr = fix('2027-02-10', '2027-02-14', { place: 'oberjoch', stayId: st.id });
  assert(!a.savingTips(tr).some(x => x.t.includes('Haus Haug')), 'Spartipp empfiehlt verschwundenes Inserat');
}
console.log('Saisonpreise: Quellen, Saisonzuordnung, Portalpreis vs. Vergleichswert, kein Unterschätzen, Personenhinweis, verschwundenes Inserat geprüft.');

/* Exakt passende günstigere Abfrage hat Vorrang vor teurerem Saisonwert. */
const march=fix('2027-03-08','2027-03-12',{place:'oberstaufen',stayId:'os-schoen'});
assert.equal(line(march).c,460);
assert.equal(line(march).src,'ok');
assert(line(march).s.includes('Portalpreis'));
const stay=a.STAYS.find(s=>s.id==='os-schoen');
const old=a.stayNight(march,stay,at('2026-11-14'));
assert.equal(old.pn,115);
assert.equal(old.src,'est');
assert(old.stale && old.exact && old.txt.includes('älter als 30 Tage'));
assert(!a.stayNight(march,stay,at('2026-11-13')).stale);
assert(a.stayNight(march,stay,at('2026-10-13')).stale,'zukünftiges Prüfdatum nicht frisch');
assert(a.stayNight(sh,stay).scaled);
assert(a.openCosts(sh).some(x=>x.includes('andere Dauer')));
assert(line(sh).s.includes('feste Gebühren'));
assert(line(feb).s.includes('keine Preisobergrenze'));
vm.runInContext("Date=class extends RealDate { constructor(...args){super(...(args.length?args:['2026-11-14T12:00:00']))} };",context);
assert(a.openCosts(march).some(x=>x.includes('ältere oder unklare')));
const malformed=Object.assign({},stay,{samples:[{from:'bad',to:'bad',total:500}]});
assert.equal(a.stayNight(march,malformed).sample,null);
console.log('Exakter Preisvorrang, Frischegrenzen, Hochrechnung und ungültige Stichproben geprüft.');

const undated=Object.assign({},stay,{samples:[Object.assign({},stay.samples[0],{checked:null})]});
assert(a.stayNight(march,undated).stale);
assert(a.stayNight(march,undated).txt.includes('unbekannten Datum'));
