/* M09.1 Gästekarten-Rechnung: reine Funktion cardPricing (app/gaestekarten.js) und Anbindung in cost().
   G-R1–G-R4 nach docs/planung M09 §6 (2 Personen), G-R12 als Regressionsvergleich: cost() muss für alle Vorlagen
   und für jede Kombination aus Ort, Unterkunft, Bestätigung und Unternehmungen centgenau wie vor M09.1 rechnen.
   Der Vergleichsstand liegt in tests/fixtures/kosten-vor-m09.js (cost() von origin/main, 23.10.2026). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const GC = require('../app/gaestekarten.js');

/* ---------- reine Funktion ---------- */
const hochgrat = { uid: 'a', day: 1, slot: 'morgen', label: 'Hochgrat-Panoramaweg', pp: 20, cardPp: 0, top: true };
const aquaria = { uid: 'b', day: 1, slot: 'nachm', label: 'Aquaria: Saunen & Solebad', pp: 33, cardPp: 0, top: true };
const base = { persons: 2, cardName: 'Oberstaufen PLUS' };

/* G-R1: unbestätigt → Normalpreis in der Hauptrechnung, Vorteil nur getrennt */
{
  const r = GC.cardPricing(Object.assign({}, base, { status: 'unbestaetigt', items: [hochgrat] }));
  assert.equal(r.items[0].normal, 40);
  assert.equal(r.items[0].applied, 40, 'G-R1 Hauptrechnung 40 €');
  assert.equal(r.items[0].possible, 40, 'G-R1 möglicher Vorteil 40 €');
  assert.equal(r.applied, 0, 'G-R1 keine eingerechnete Ersparnis');
  assert.equal(r.possible, 40);
  assert.equal(r.items[0].reason, 'unbestaetigt');
  assert(/unbestätigt/.test(r.items[0].text) && /−40 €/.test(r.items[0].text), 'G-R1 Text nennt Status und Vorteil');
}
/* G-R2: enthalten → 0 €, Zeile „mit Karte frei“ */
{
  const r = GC.cardPricing(Object.assign({}, base, { status: 'enthalten', items: [hochgrat] }));
  assert.equal(r.items[0].applied, 0, 'G-R2 0 €');
  assert.equal(r.items[0].possible, 0);
  assert.equal(r.applied, 40);
  assert.equal(r.items[0].reason, 'frei');
  assert.equal(r.items[0].text, 'Hochgrat-Panoramaweg: mit Oberstaufen PLUS frei (Top-Leistung des Tages)');
}
/* G-R3: zwei Top-Leistungen am selben Tag → erste chronologisch frei, zweite 66 €, Erklärung je Tag */
{
  /* Eingabe absichtlich in umgekehrter Reihenfolge: maßgeblich ist die Tageszeit, nicht die Reihenfolge im Array */
  const r = GC.cardPricing(Object.assign({}, base, { status: 'enthalten', items: [aquaria, hochgrat] }));
  assert.equal(r.items[1].applied, 0, 'G-R3 Hochgrat (morgens) frei');
  assert.equal(r.items[0].applied, 66, 'G-R3 Aquaria (nachmittags) 66 €');
  assert.equal(r.items[0].reason, 'limit');
  assert.equal(r.days[1].length, 2, 'G-R3 Erklärung für beide Termine des Tages');
  assert(r.days[1].some(x => /Aquaria.*ebenfalls als Top-Leistung.*Hochgrat-Panoramaweg.*Normalpreis 33 €/.test(x)), 'G-R3 Erklärung nennt Grund und Normalpreis');
  /* gleiche Tageszeit: Uhrzeit entscheidet, danach uid */
  const t1 = GC.cardPricing(Object.assign({}, base, { status: 'enthalten', items: [Object.assign({}, aquaria, { slot: 'morgen', time: '09:00' }), Object.assign({}, hochgrat, { time: '10:30' })] }));
  assert.deepEqual(t1.items.map(i => i.applied), [0, 40], 'frühere Uhrzeit zuerst');
  const t2 = GC.cardPricing(Object.assign({}, base, { status: 'enthalten', items: [Object.assign({}, aquaria, { slot: 'morgen', uid: 'z' }), Object.assign({}, hochgrat, { uid: 'y' })] }));
  assert.deepEqual(t2.items.map(i => i.applied), [66, 0], 'ohne Uhrzeit: kleinere uid zuerst');
  /* unbestätigt: Vorteil berücksichtigt dasselbe Limit (nur 40 € möglich, nicht 106 €) */
  const u = GC.cardPricing(Object.assign({}, base, { status: 'unbestaetigt', items: [aquaria, hochgrat] }));
  assert.equal(u.applied, 0);
  assert.equal(u.possible, 40, 'möglicher Vorteil beachtet das Tageslimit');
  assert.deepEqual(u.items.map(i => i.applied), [66, 40]);
}
/* G-R4: Top-Leistungen an zwei Tagen → beide frei */
{
  const r = GC.cardPricing(Object.assign({}, base, { status: 'enthalten', items: [hochgrat, Object.assign({}, aquaria, { day: 2 })] }));
  assert.deepEqual(r.items.map(i => i.applied), [0, 0], 'G-R4 beide frei');
  assert.equal(r.applied, 106);
}
/* weitere Regeln: nicht enthalten, Kartenpreis, Skipass belegt das Tageslimit, Kurspreis geht vor */
{
  const n = GC.cardPricing(Object.assign({}, base, { status: 'nicht', items: [hochgrat] }));
  assert.equal(n.items[0].applied, 40); assert.equal(n.possible, 0); assert.equal(n.items[0].reason, 'nicht');
  const eis = { uid: 'e', day: 1, slot: 'abend', label: 'Eislaufen', pp: 10, cardPp: 6 };
  const k = GC.cardPricing(Object.assign({}, base, { status: 'enthalten', items: [eis] }));
  assert.equal(k.items[0].applied, 12); assert.equal(k.items[0].reason, 'kartenpreis');
  assert(/6 € p\. P\. statt 10 €/.test(k.items[0].text));
  const p = GC.cardPricing(Object.assign({}, base, { status: 'enthalten', pass: { cardPass: true, passDay: 44, days: [1] }, items: [hochgrat] }));
  assert.equal(p.pass.applied, 0); assert.equal(p.pass.normal, 88);
  assert.equal(p.items[0].applied, 40, 'Skipass-Tag belegt die Top-Leistung');
  assert(p.days[1].some(x => /heute schon Skipass/.test(x)));
  const pu = GC.cardPricing(Object.assign({}, base, { status: 'unbestaetigt', pass: { cardPass: true, passDay: 44, days: [1, 2] }, items: [] }));
  assert.equal(pu.pass.applied, 176); assert.equal(pu.pass.possible, 176); assert.equal(pu.applied, 0);
  const schuh = { uid: 's', day: 1, slot: 'nachm', label: 'Schneeschuh', pp: 40, cardPp: 20, ppKurs: 35 };
  const ku = GC.cardPricing(Object.assign({}, base, { status: 'enthalten', kursActive: true, items: [schuh] }));
  assert.equal(ku.items[0].applied, 70); assert.equal(ku.items[0].reason, 'kurs');
  const unk = GC.cardPricing(Object.assign({}, base, { status: 'irgendwas', items: [hochgrat] }));
  assert.equal(unk.status, 'unbestaetigt', 'unbekannter Status gilt als unbestätigt');
  assert.equal(unk.items[0].applied, 40);
  const frozen = Object.freeze([Object.freeze(Object.assign({}, hochgrat))]);
  GC.cardPricing(Object.assign({}, base, { status: 'enthalten', items: frozen }));
  assert.equal(GC.cardStatusOf({ cardConfirmed: true }, { card: '?' }), 'enthalten');
  assert.equal(GC.cardStatusOf({ cardConfirmed: true }, null), 'nicht');
  assert.equal(GC.cardStatusOf({}, { card: '?' }), 'unbestaetigt');
  assert.equal(GC.cardStatusOf({}, { card: false }), 'nicht');
}

/* ---------- G-R12: cost() wie vor M09.1 ---------- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
assert(html.indexOf('app/gaestekarten.js') > 0 && html.indexOf('app/gaestekarten.js') < html.indexOf('app/kosten.js'), 'gaestekarten.js lädt vor kosten.js');
let code = require('./app-code.cjs')(html);
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const context = {
  window: { addEventListener() {} },
  document: { addEventListener() {}, querySelector() { return null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { data: new Map(), getItem(k) { return this.data.get(k) ?? null; }, setItem(k, v) { this.data.set(k, v); } },
  setTimeout, clearTimeout, console,
};
vm.createContext(context);
vm.runInContext(code, context);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'fixtures', 'kosten-vor-m09.js'), 'utf8'), context);
const run = src => vm.runInContext(src, context);
const a = context.window.__app;
const ACTS = run('ACTS'), STAYS = run('STAYS'), PLACES = run('PLACES'), TEMPLATES = run('TEMPLATES');
const cost = t => run('cost')(t), old = t => run('costVorM09')(t);
const cents = v => Math.round(v * 100);
let compared = 0;
function same(t, what) {
  const n = cost(t), o = old(t);
  assert.equal(cents(n.total), cents(o.total), what + ': Summe');
  assert.equal(cents(n.saved), cents(o.saved), what + ': Skipass-Ersparnis');
  assert.equal(n.lines.length, o.lines.length, what + ': Zeilenzahl');
  n.lines.forEach((l, i) => { assert.equal(cents(l.c), cents(o.lines[i].c), what + ': ' + l.t); assert.equal(l.t, o.lines[i].t); assert.equal(l.s, o.lines[i].s); });
  assert(n.card && ['enthalten', 'nicht', 'unbestaetigt'].includes(n.card.status), what + ': Kartenstatus');
  compared++;
  return n;
}
TEMPLATES.forEach(tp => same(tp.make(), 'Vorlage ' + tp.id));
a.PKGS.forEach(pk => { const t = a.silvesterTemplate(); a.applyPkg(t, pk); same(t, 'Paket ' + pk.id); t.cardConfirmed = true; same(t, 'Paket ' + pk.id + ' bestätigt'); });
/* Jede Unterkunft mit und ohne Bestätigung, je Ort alle Unternehmungen in festen Pseudo-Zufallsplänen */
let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const SLOTS = ['morgen', 'mittag', 'nachm', 'abend'];
Object.keys(PLACES).forEach(place => {
  const acts = Object.keys(ACTS).filter(id => ACTS[id].place === place);
  STAYS.filter(s => s.place === place).forEach(st => {
    for (let round = 0; round < 12; round++) {
      const t = a.silvesterTemplate();
      t.place = place; t.stayId = st.id; t.cardConfirmed = round % 2 === 0;
      const count = 1 + rnd(9);
      t.items = Array.from({ length: count }, (_, i) => ({ uid: 'u' + String(i).padStart(2, '0'), act: acts[rnd(acts.length)], day: rnd(5), slot: SLOTS[rnd(4)] }));
      same(t, place + '/' + st.id + ' Runde ' + round);
    }
  });
});
/* Fall aus der Projektanweisung: Oberstaufen, Hochgrat + Aquaria am selben Tag, bestätigt vs. unbestätigt */
{
  const t = a.silvesterTemplate();
  t.place = 'oberstaufen'; t.stayId = 'os-holidu';
  t.items = [{ uid: '1', act: 'os-hochgrat', day: 1, slot: 'morgen' }, { uid: '2', act: 'os-aquaria', day: 1, slot: 'nachm' }];
  t.cardConfirmed = false;
  const u = same(t, 'Oberstaufen unbestätigt');
  assert.equal(u.card.status, 'unbestaetigt');
  assert.equal(u.card.applied, 0);
  assert.equal(u.card.possible, 40, 'möglicher Vorteil getrennt, nicht in der Summe');
  t.cardConfirmed = true;
  const e = same(t, 'Oberstaufen bestätigt');
  assert.equal(e.card.status, 'enthalten');
  assert.equal(e.card.applied, 40);
  assert.equal(cents(u.total - e.total), cents(40 * (1 + (t.puffer || 0) / 100)), 'Unterschied genau die Ersparnis (plus Puffer)');
  assert(e.lines.some(l => l.t === 'Aquaria: Saunen & Solebad' && l.c === 66));
  assert(e.card.days[1].some(x => /Hochgrat-Panoramaweg: mit Oberstaufen PLUS frei/.test(x)));
}
console.log('Gästekarten M09.1: G-R1–G-R4 und Zusatzregeln geprüft; G-R12 cost() in ' + compared + ' Reisen centgenau wie vor M09.1.');
