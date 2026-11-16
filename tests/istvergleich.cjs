/* Plan-Ist-Vergleich je Bereich (Claude, 16.11.2026; istvergleich.js, docs/IST_AUSGABEN.md).
   Reine Regeln T1–T6 und die Anbindung an cost()/Buchungsbuch/Ausgaben unterwegs: keine Doppelzählung in Töpfen,
   Unbekanntes bleibt unbekannt, bezahlt über Plan bleibt Reisekosten, Cent-genau. Node-Test, kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const I = require('../istvergleich.js');
let n = 0;
const ok = (c, m) => { assert(c, m); n++; };
const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

/* ---------- Reine Regeln ---------- */
eq(I.remaining(null), 1, 'ohne Datum: alles liegt noch vor einem');
eq(I.remaining({ phase: 'vor', days: 3 }), 1);
eq(I.remaining({ phase: 'nach', days: 1 }), 0);
eq(I.remaining({ phase: 'unterwegs', day: 0, of: 5 }), 1, 'erster Tag: heute zählt noch als offen');
eq(I.remaining({ phase: 'unterwegs', day: 4, of: 5 }), 0.2);

const U = d => ({ phase: 'unterwegs', day: d, of: 5 });
/* T1 vor der Reise: Ausgaben füllen den Topf zuerst */
eq(I.potForecast(40000, 8000, { phase: 'vor' }).f, 40000, 'T1 Einkauf vorab verdoppelt die Verpflegung nicht');
eq(I.potForecast(40000, 45000, { phase: 'vor' }).f, 45000, 'T1 über dem Topf zählt das Ausgegebene');
/* T2 unterwegs */
eq(I.potForecast(50000, 0, U(2)).f, 50000, 'T2 nichts erfasst ≠ 0 €');
eq(I.potForecast(50000, 40000, U(2)).f, 70000, 'T2 schneller als geplant: 400 + 500 × 3/5');
eq(I.potForecast(50000, 5000, U(2)).f, 50000, 'T2 sinkt unterwegs nicht unter den Plan');
/* T3 nach der Reise */
eq(I.potForecast(50000, 35000, { phase: 'nach' }), { f: 35000, absorbed: 35000, untracked: false }, 'T3 Erfasstes gilt');
eq(I.potForecast(50000, 0, { phase: 'nach' }), { f: 50000, absorbed: 0, untracked: true }, 'T3 ohne Erfassung bleibt der Plan');

{ /* compare: Töpfe, zusätzliche Ausgaben, Puffer, Cent */
  const r = I.compare({
    lines: [{ cat: 'unterkunft', c: 680 }, { cat: 'essen', c: 400, pot: true }, { cat: 'ausflug', c: 100 }, { cat: 'puffer', c: 59 }],
    payments: [{ cat: 'unterkunft', netPaid: 204 }],
    expenses: [{ on: '2026-12-20', amount: 50, cat: 'essen' }, { on: '2026-12-20', amount: 30, cat: 'einkauf' }, { on: '2026-12-21', amount: 0.1, cat: 'ausflug' }, { on: '2026-12-21', amount: 0.2, cat: 'ausflug' }],
    phase: { phase: 'vor', days: 10 }, budget: 1500, labels: { essen: 'Essen' }, today: '2026-12-21'
  });
  const A = k => r.areas.find(x => x.key === k);
  eq(A('essen').forecast, 400, 'Essen + Einkauf füllen den Verpflegungstopf, keine Doppelzählung');
  eq(A('essen').ist, 80);
  eq(A('essen').label, 'Essen');
  eq(A('ausflug').forecast, 100.3, 'T4 ohne Topf: zusätzlich, Cent-genau (0,1 + 0,2)');
  eq(A('ausflug').extra, 0.3);
  eq(A('unterkunft').ist, 204, 'T5 bezahlt ist Ist, aber nicht zusätzlich');
  eq(A('unterkunft').forecast, 680);
  eq(r.reserve, 59, 'T6 Puffer getrennt');
  ok(!r.areas.some(x => x.key === 'puffer'), 'T6 Puffer ist kein Bereich');
  eq(r.plan, 1180); eq(r.forecast, 1180.3); eq(r.ist, 284.3); eq(r.todaySpent, 0.3);
  eq(r.verdict, 'im-budget'); eq(r.left, 319.7);
  eq(r.areas.map(x => x.key), ['unterkunft', 'ausflug', 'essen'], 'feste Reihenfolge wie die Aufstellung');
}
{ /* offene Preise verhindern „im Budget“; über Budget bleibt über Budget */
  const base = { lines: [{ cat: 'unterkunft', c: 500 }, { cat: 'wellness', c: 0, unknown: true }], budget: 1000 };
  eq(I.compare(base).verdict, 'unsicher', 'Preis offen → nicht sicher im Budget');
  eq(I.compare(Object.assign({}, base, { budget: 400 })).verdict, 'ueber');
  eq(I.compare(Object.assign({}, base, { budget: 0 })).verdict, 'kein-budget');
  eq(I.compare(base).areas.find(x => x.key === 'wellness').unknown, 1, 'Bereich mit offenem Preis bleibt sichtbar');
}
{ /* unterwegs: Tempo und Hochrechnung; nach der Reise: nicht erfasst */
  const lines = [{ cat: 'essen', c: 500, pot: true }, { cat: 'anreise', c: 90, pot: true }];
  const r = I.compare({ lines, expenses: [{ on: '2027-01-01', amount: 400, cat: 'essen' }], phase: U(2), today: '2027-01-01' });
  const e = r.areas.find(x => x.key === 'essen');
  eq(e.forecast, 700); eq(e.diff, 200); eq(e.pace, { soFar: 300, spent: 400 }, 'bis einschließlich heute 3/5 geplant');
  eq(r.areas.find(x => x.key === 'anreise').forecast, 90, 'Sprit ohne Erfassung bleibt Plan');
  const after = I.compare({ lines, expenses: [{ on: '2027-01-01', amount: 350, cat: 'essen' }], phase: { phase: 'nach', days: 2 } });
  eq(after.areas.find(x => x.key === 'essen').forecast, 350);
  eq(after.untracked, ['anreise'], 'nach der Reise: Sprit nicht erfasst, Planwert bleibt');
}
{ /* unbekannte Kategorie fällt auf Sonstiges, ungültige Beträge zählen nicht */
  const r = I.compare({ expenses: [{ on: '2026-01-01', amount: 12, cat: 'xyz' }, { on: '2026-01-01', amount: -5, cat: 'essen' }, { on: '2026-01-01', amount: NaN, cat: 'essen' }, null] });
  eq(r.areas.map(x => [x.key, x.spent]), [['eigen', 12]]);
}
/* Schnellerfassung */
eq(I.parseQuick('12,50'), 12.5); eq(I.parseQuick('12.5'), 12.5); eq(I.parseQuick('1.234,50 €'), 1234.5); eq(I.parseQuick(' 7 '), 7);
eq(I.parseQuick(''), null); eq(I.parseQuick('0'), null); eq(I.parseQuick('-3'), null); eq(I.parseQuick('1,234'), null); eq(I.parseQuick('abc'), null);
eq(I.lastPayer([{ on: '2027-01-01', paidBy: 'pa1' }, { on: '2027-01-02', paidBy: 'pa2' }, { on: '2027-01-02', paidBy: 'pa1' }], [{ id: 'pa1' }, { id: 'pa2' }]), 'pa1', 'neueste, bei gleichem Tag die zuletzt erfasste');
eq(I.lastPayer([{ on: '2027-01-02', paidBy: 'weg' }], [{ id: 'pa1' }]), null, 'entfernte Person wird nicht vorgeschlagen');

/* ---------- Anbindung an die App ---------- */
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
ok(html.indexOf('<script src="istvergleich.js"></script>') > html.indexOf('<script src="v3split.js"></script>'), 'index.html lädt istvergleich.js nach v3split.js');
ok(fs.readFileSync(__dirname + '/../index.html', 'utf8').includes('istvergleich.js'), 'index.html bindet istvergleich.js ein (Service Worker liest die Liste daraus)');
const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
function app(noIst) {
  const ctx = {
    window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: require('../v4logic.js'), RPV5: require('../v5logic.js'), RPCatalog: require('../catalog.js'), RPIST: noIst ? undefined : I },
    document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setTimeout: () => 0, clearTimeout() {}, console,
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { a: ctx.window.__app, g: k => vm.runInContext(k, ctx) };
}
const { a, g } = app();
const J = x => JSON.parse(JSON.stringify(x));
const VOR = new Date('2026-11-20T10:00:00Z'), UNTERWEGS = new Date('2027-01-01T10:00:00Z'), NACH = new Date('2027-01-10T10:00:00Z');

{ /* Kostenrechnung: Verpflegung und Sprit sind Töpfe; Bezahltes über Plan ohne Betrag bleibt Reisekosten (§11) */
  const t = a.silvesterTemplate(), c = a.cost(t);
  ok(c.lines.find(l => l.cat === 'essen').pot, 'Verpflegung ist Topf');
  ok(c.lines.find(l => l.key === 'anreise').pot, 'Sprit ist Topf');
  ok(!c.lines.find(l => l.key === 'stay').pot, 'Unterkunft ist kein Topf');
  const planKurs = c.lines.filter(l => l.key === 'kurs').reduce((s, l) => s + l.c, 0), total = c.total;
  /* Altdaten/Import: Bezahlt höher als Plan ohne erfassten Betrag (die Eingabe selbst verhindert das weiterhin) */
  t.ledger = { kurs: { status: 'offen', amount: null, paid: Math.round(planKurs + 50), due: '' } };
  a.validateLedger(t.ledger);
  const c2 = a.cost(t), kl = c2.lines.find(l => l.key === 'kurs');
  eq(kl.c, Math.round(planKurs + 50), 'Kostenzeile zeigt das Bezahlte');
  ok(/mehr als geplant/.test(kl.s), 'Hinweis „mehr als geplant“');
  ok(Math.abs(c2.total - (total - planKurs + Math.round(planKurs + 50))) < 0.01, 'Gesamtsumme enthält das Bezahlte');
  const row = a.ledgerRows(t).find(r => r.key === 'kurs');
  eq(row.cost, Math.round(planKurs + 50), 'Buchungsbuch rechnet gleich'); eq(row.open, 0);
  t.ledger = {};
  assert.throws(() => a.setLedger(t, 'kurs', 'paid', String(Math.round(planKurs + 50))), /höher als/); n++;
}
{ /* Topf endet mit Buchung/Anzahlung; offener Preis kommt an */
  const t = a.silvesterTemplate();
  let inp = g('istInput')(t, VOR);
  ok(inp.lines.find(l => l.cat === 'anreise').pot, 'Sprit ohne Eintrag ist Topf');
  a.setLedger(t, 'anreise', 'paid', '20');
  inp = g('istInput')(t, VOR);
  ok(!inp.lines.find(l => l.cat === 'anreise').pot, 'angezahlter Sprit ist kein Topf mehr (Buchungsbuch zählt)');
  eq(inp.payments.filter(p => p.cat === 'anreise').reduce((s, p) => s + p.netPaid, 0), 20);
  eq(inp.today, '2026-11-20'); eq(inp.phase.phase, 'vor');
}
function v3trip() {
  const t = a.silvesterTemplate();
  t.schemaVersion = 3; t.party = [{ id: 'pphil', name: 'Philipp' }, { id: 'ppart', name: 'Partnerin' }];
  t.expenses = [
    { id: 'exaa1', on: '2026-12-30', label: 'Tanken Hinweg', amount: 60, cat: 'anreise', paidBy: 'pphil' },
    { id: 'exaa2', on: '2026-12-31', label: 'Einkauf', amount: 45.5, cat: 'einkauf', paidBy: 'ppart' },
    { id: 'exaa3', on: '2027-01-01', label: 'Abendessen', amount: 120, cat: 'essen', paidBy: 'pphil' },
    { id: 'exaa4', on: '2027-01-01', label: 'Minigolf', amount: 14, cat: 'ausflug', paidBy: 'ppart' }];
  a.validateExtras(J(t));
  return t;
}
{ /* Format-3-Reise unterwegs: eine Rechnung, keine Doppelzählung in Töpfen, zusätzliche Ausgaben getrennt */
  const t = v3trip(), c = a.cost(t), r = g('istResult')(t, UNTERWEGS);
  const A = k => r.areas.find(x => x.key === k);
  const essenPlan = Math.round(c.byCat.essen * 100) / 100, spritPlan = Math.round(c.byCat.anreise * 100) / 100;
  eq(A('essen').plan, essenPlan, 'Plan je Bereich = cost(t).byCat');
  eq(A('essen').spent, 165.5, 'Essen + Einkauf');
  eq(A('anreise').spent, 60);
  ok(A('anreise').forecast >= spritPlan - 0.005 && A('anreise').forecast <= spritPlan + 60, 'Tanken füllt den Sprit-Topf statt ihn zu verdoppeln');
  eq(A('ausflug').extra, 14, 'Minigolf ist zusätzlich');
  eq(A('ausflug').forecast, Math.round((c.byCat.ausflug + 14) * 100) / 100);
  eq(r.todaySpent, 134, 'heute (01.01.) 120 + 14');
  eq(r.plan, Math.round((c.total - (c.byCat.puffer || 0)) * 100) / 100, 'Plan ohne Puffer, aus derselben Rechnung');
  const before = J(t); g('istResult')(t, UNTERWEGS); eq(J(t), before, 'Vergleich schreibt nichts in die Reise');

  const sec = g('istSection')(t, UNTERWEGS);
  ok(/Plan und Ist/.test(sec) && /data-ist-area="essen"/.test(sec), 'Budget-Ansicht zeigt Plan und Ist je Bereich');
  ok(/Heute ausgegeben/.test(sec), 'unterwegs: heute ausgegeben');
  ok(/data-fold="ist-bereiche"[^>]*>.*data-ist-area="essen"/.test(sec), 'Bereiche als zugeklappte Ebene, keine dritte offene Liste');
  ok(/über dem Budget|unter dem Budget|Noch nicht sicher/.test(sec), 'Aussage zum Budget in Worten, nicht nur Farbe');
  ok(a.budgetSection(t, UNTERWEGS).includes('data-ist'), 'in budgetSection eingebunden');
  const today = g('istToday')(t, UNTERWEGS);
  ok(/Heute ausgegeben: <b class="num">134,00\s€/.test(today), 'Heute-Zeile mit Betrag');
  ok(a.todayBlock(t, UNTERWEGS).includes('data-ist-today'), 'im Heute-Block eingebunden');
  ok(!a.todayBlock(t, VOR).includes('data-ist-today'), 'vor der Reise kein Heute-Block');
}
{ /* Vor der Reise ohne Geldfluss keine Ist-Ansicht; nach der Reise immer */
  const t = a.silvesterTemplate();
  eq(g('istSection')(t, VOR), '', 'nichts bezahlt, nichts ausgegeben → kein Plan-Ist');
  ok(/nichts erfasst, Planwert bleibt/.test(g('istSection')(t, NACH)), 'nach der Reise: Töpfe ohne Erfassung benannt');
}
{ /* offener Preis (eigene Unternehmung ohne Preis): nie „unter dem Budget“, Bereich bleibt sichtbar */
  const t = v3trip();
  const ca = a.customActFromForm({ title: 'Schneeschuhtour', cat: 'ausflug', per: 'grp', cost: '', hours: '3' }, 'cxtour');
  t.customActs = [ca]; t.items = (t.items || []).concat([{ uid: 'iopen1', day: 1, slot: 'vm', act: 'cxtour' }]);
  t.budget = 5000;
  const r = g('istResult')(t, UNTERWEGS);
  ok(r.unknown > 0, 'offener Preis kommt im Vergleich an');
  eq(r.verdict, 'unsicher', 'trotz Spielraum nicht „im Budget“');
  ok(/Noch nicht sicher im Budget/.test(g('istSection')(t, UNTERWEGS)), 'in Worten benannt');
  ok(/Preis offen/.test(g('istSection')(t, UNTERWEGS)), 'Bereich zeigt „Preis offen“');
}
{ /* Schnellerfassung: Bezeichnung leer → Name der Kategorie; Zahler-Vorschlag */
  const t = v3trip();
  const next = a.splitCandidate(t, 'expense-add', null, { on: '2027-01-01', label: '', amount: '8,40', cat: 'genuss', paidBy: 'pphil', 'in.pphil': true, 'in.ppart': true, mode: 'equal' }, 'exneu1');
  const x = next.expenses.find(e => e.id === 'exneu1');
  eq([x.label, x.amount, x.cat], ['Genuss & Feiern', 8.4, 'genuss']);
  ok(!t.expenses.some(e => e.id === 'exneu1'), 'Kandidat ändert die Quelle nicht');
  const form = a.splitForm(t, { action: 'expense-add', target: null, fields: {} });
  ok(form.indexOf('name="amount"') < form.indexOf('name="label"'), 'Betrag zuerst');
  ok(/<option value="ppart" selected>/.test(form), "zuletzt erfasste Zahlerin vorgewählt (Minigolf, 01.01.)");
}
{ /* ohne istvergleich.js: kein Fehler, keine Ansicht */
  const old = app(true), t = old.a.silvesterTemplate();
  eq(old.g('istSection')(t, NACH), ''); eq(old.g('istToday')(t, UNTERWEGS), '');
  ok(old.a.budgetSection(t, NACH).includes('data-budget'), 'Budget-Ansicht bleibt');
}
console.log('Plan-Ist-Vergleich (istvergleich): ' + n + ' Prüfungen bestanden (T1–T6, Cent, offene Preise, Töpfe, bezahlt über Plan, Anbindung). Node-Test, kein Browser-/iPhone-Test.');

/* ---------- „Das war ein geplanter Posten“ (Schnellerfassung, 16.11. abends) ---------- */
{
  const run = app(), A = run.a, G = run.g;
  const t = A.silvesterTemplate();
  t.start = '2027-01-01'; t.end = '2027-01-05'; /* läuft am Testtag UNTERWEGS (01.01.) */
  t.schemaVersion = 3; t.party = [{ id: 'pphil', name: 'Philipp' }, { id: 'ppart', name: 'Partnerin' }]; t.expenses = [];
  const opts = G('istPlanOptions')(t, UNTERWEGS);
  ok(opts.length > 0, 'offene geplante Posten werden angeboten');
  ok(!opts.some(o => o.key === 'anreise'), 'Sprit-Topf wird nicht angeboten');
  ok(!opts.some(o => o.key === 'stay'), 'Unterkunft läuft über das Angebot');
  const wb = opts.find(o => o.key === 'act:oj-wbad'); ok(wb, 'Therme wird angeboten');
  const before = A.cost(t).total, row0 = A.ledgerRows(t).find(r => r.key === 'act:oj-wbad');
  /* Teilzahlung unter Plan */
  let next = A.splitCandidate(t, 'expense-add', null, { on: '2027-01-01', amount: '20', cat: 'wellness', paidBy: 'ppart', planKey: 'act:oj-wbad' }, 'exnn1');
  eq(next.expenses.length, 0, 'keine zusätzliche Ausgabe');
  eq(next.ledger['act:oj-wbad'].paid, 20); eq(next.ledger['act:oj-wbad'].amount, null, 'unter Plan: Betrag bleibt offen');
  eq(next.ledger['act:oj-wbad'].paidBy, 'ppart', 'Zahler übernommen');
  ok(Math.abs(A.cost(next).total - before) < 0.01, 'Gesamtkosten unverändert: nicht doppelt gezählt');
  eq(t.ledger && t.ledger['act:oj-wbad'], undefined, 'Quelle unverändert');
  const r1 = G('istResult')(next, UNTERWEGS);
  eq(r1.areas.find(x => x.key === 'wellness').paid, 20); eq(r1.areas.find(x => x.key === 'wellness').extra, 0);
  /* über Plan: Betrag wird der tatsächliche Preis */
  next = A.splitCandidate(t, 'expense-add', null, { on: '2027-01-01', amount: String(Math.round(row0.plan) + 10), cat: 'wellness', paidBy: '', planKey: 'act:oj-wbad' }, 'exnn2');
  eq(next.ledger['act:oj-wbad'].amount, Math.round(row0.plan) + 10, 'über Plan: Betrag = Bezahltes');
  ok(Math.abs(A.cost(next).total - (before - row0.plan + Math.round(row0.plan) + 10)) < 0.01, 'Gesamtkosten steigen nur um den Mehrpreis');
  const pv = A.splitPreview(t, next, { action: 'expense-add', newId: 'exnn2', target: null, fields: { planKey: 'act:oj-wbad' } });
  ok(/geplanten Posten/.test(pv) && /wird auf/.test(pv), 'Vorschau nennt Posten und neuen Betrag');
  /* anderer Zahler schon eingetragen → klare Meldung */
  const t2 = JSON.parse(JSON.stringify(t)); t2.ledger = { 'act:oj-wbad': { status: 'offen', amount: null, paid: 10, due: '', paidBy: 'pphil' } };
  assert.throws(() => A.splitCandidate(t2, 'expense-add', null, { on: '2027-01-01', amount: '5', cat: 'wellness', paidBy: 'ppart', planKey: 'act:oj-wbad' }, 'exnn3'), /nur einen Zahler/); n++;
  assert.throws(() => A.splitCandidate(t, 'expense-add', null, { on: '2027-01-01', amount: '5', cat: 'wellness', planKey: 'act:gibtsnicht' }, 'exnn4'), /gibt es nicht mehr/); n++;
  ok(/name="planKey"/.test(A.splitForm(t, { action: 'expense-add', target: null, fields: {} })), 'Auswahl im Erfassen-Formular');
  ok(!/name="planKey"/.test(A.splitForm(Object.assign(J(t), { expenses: [{ id: 'exaa9', on: '2027-01-01', label: 'X', amount: 3, cat: 'eigen' }] }), { action: 'expense-edit', target: { id: 'exaa9' }, fields: {} })), 'nicht beim Bearbeiten');
  console.log('Geplanter Posten vor Ort bezahlt: geprüft (' + n + ' Prüfungen gesamt).');
}
