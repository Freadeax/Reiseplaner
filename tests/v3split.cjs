/* P0.2a Mitreisende, Ausgaben unterwegs und Aufteilung (SCHEMA_V3 §3, §5, §7, §9). Node-Test: reine Regeln in v3split.js,
   Rechenfälle P1–P6, Grenzen und Validierung, Controller, App-Anbindung über window.__app, Feldtreue (Export/Import/toServer,
   v2-Bearbeitungen), Teilen-Text ohne Namen, gesperrter Rückfall und fehlendes Modul. Kein Browser-/iPhone-/DB-Test. */
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const S = require('../v3split.js'), V = require('../v3logic.js');
const J = x => JSON.parse(JSON.stringify(x));
const sum = a => a.reduce((s, x) => s + x, 0);
const C = v => Math.round(v * 100);
const bal = r => Object.fromEntries(r.persons.map(p => [p.id, p.balance]));
const AB = [{ id: 'panna', name: 'Anna' }, { id: 'pben', name: 'Ben' }], ABC = AB.concat([{ id: 'pcara', name: 'Cara' }]);
const ex = (id, amount, paidBy, split, extra) => Object.assign({ id, on: '2026-12-31', label: 'Test ' + id, amount, cat: 'essen', paidBy, split }, extra || {});

/* ---------- Verteilung nach größtem Rest ---------- */
assert.deepEqual(S.distribute(1000, [1, 1, 1]), [334, 333, 333], 'P2: Rest an die Erste');
assert.deepEqual(S.distribute(1000, [2, 1, 1]), [500, 250, 250], 'P6: 10 € mit 2/1/1');
assert.deepEqual(S.distribute(1001, [2, 1, 1]), [501, 250, 250], 'P6: 10,01 € größter Rest A');
assert.deepEqual(S.distribute(1, [1, 1, 1]), [1, 0, 0]);
assert.deepEqual(S.distribute(1, [1, 3]), [0, 1], 'größter Rest vor Reihenfolge'); assert.deepEqual(S.distribute(2, [1, 3]), [1, 1], 'gleiche Reste: Reihenfolge');
assert.deepEqual(S.distribute(0, [1, 1]), [0, 0]);
assert.deepEqual(S.distribute(1e11, [100, 1, 37]).reduce((s, x) => s + x, 0), 1e11, 'Höchstbetrag ohne Gleitkommaverlust');
for (const bad of [[-1, [1]], [1.5, [1]], [NaN, [1]], [10, []], [10, [0]], [10, [1.5]], [10, null]]) assert.throws(() => S.distribute(bad[0], bad[1]), /Verteilung/);
{ /* Eigenschaften mit festem Seed: Summe exakt, Anteile höchstens 1 Cent über dem Bruchteil */
  let seed = 42; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  for (let k = 0; k < 2000; k++) {
    const w = Array.from({ length: 1 + rnd(20) }, () => 1 + rnd(100)), total = rnd(10000000), W = sum(w), parts = S.distribute(total, w);
    assert.equal(sum(parts), total);
    parts.forEach((p, i) => { const exact = total * w[i] / W; assert(p >= Math.floor(exact) && p <= Math.floor(exact) + 1); });
  }
}

/* ---------- Rechenfälle P1–P6 ---------- */
{ /* P1 A zahlt 100, Aufteilung A/B gleich → B schuldet A 50 */
  const r = S.settle({ party: AB, expenses: [ex('exone', 100, 'panna', { among: ['panna', 'pben'], mode: 'equal' })] });
  assert.deepEqual(bal(r), { panna: 50, pben: -50 });
  assert.deepEqual(r.transfers, [{ from: 'pben', to: 'panna', amount: 50 }]);
  assert.equal(r.extraSpent, 100);
}
{ /* P2 A zahlt 10, Aufteilung A/B/C → 3,34/3,33/3,33, Summe exakt */
  const r = S.settle({ party: ABC, expenses: [ex('extwo', 10, 'panna', { among: ['panna', 'pben', 'pcara'], mode: 'equal' })] });
  assert.deepEqual(r.flows[0].shares.map(s => s.amount), [3.34, 3.33, 3.33]);
  assert.deepEqual(bal(r), { panna: 6.66, pben: -3.33, pcara: -3.33 });
  assert.equal(sum(r.persons.map(p => C(p.balance))), 0);
}
{ /* P3 Unterkunft storniert, Gebühr 450; B zahlte 600, erhielt 150 zurück → A schuldet B 225 */
  const offer = { id: 'ostay', name: 'Hütte', paid: 600, refunds: [{ id: 'rfone', on: '2026-11-02', amount: 150 }], cancel: { on: '2026-11-01', fee: 450 }, paidBy: 'pben' };
  const r = S.settle({ party: AB, postings: [{ key: 'offer:ostay', label: 'Hütte', entry: offer, planCost: 900 }] });
  assert.equal(r.netPaidTotal, 450, 'netto 600 − 150');
  assert.deepEqual(r.flows[0].shares.map(s => s.amount), [225, 225]);
  assert.deepEqual(r.transfers, [{ from: 'panna', to: 'pben', amount: 225 }]);
  assert.deepEqual([r.open.provider, r.open.refunds], [0, 0], 'Gebühr = netto bezahlt: nichts offen');
}
{ /* P4 Ausgabe ohne paidBy: zählt in „zusätzlich ausgegeben“, nicht im Ausgleich, Hinweis */
  const r = S.settle({ party: AB, expenses: [ex('exfour', 42.5, null, null)] });
  assert.equal(r.extraSpent, 42.5); assert.deepEqual(r.transfers, []); assert.deepEqual(bal(r), { panna: 0, pben: 0 });
  assert.equal(r.unassigned.length, 1); assert.equal(r.unassigned[0].reason, 'payer'); assert.equal(r.unassignedAmount, 42.5);
}
{ /* P5 Plan 1000, A zahlt 200, A/B hälftig → B schuldet A 100; 800 noch an Anbieter offen; Summe 0 */
  const r = S.settle({ party: AB, postings: [{ key: 'ledger:xc:haus', label: 'Haus', entry: { status: 'gebucht', amount: 1000, paid: 200, due: '', paidBy: 'panna' }, planCost: 1000 }] });
  assert.deepEqual(r.transfers, [{ from: 'pben', to: 'panna', amount: 100 }]);
  assert.equal(r.open.provider, 800, 'offen getrennt, nicht im Ausgleich');
  assert.equal(sum(r.persons.map(p => C(p.balance))), 0);
}
{ /* P6 Gewichte A2/B1/C1 */
  const sh = { among: ['panna', 'pben', 'pcara'], mode: 'shares', shares: { panna: 2, pben: 1, pcara: 1 } };
  assert.deepEqual(S.settle({ party: ABC, expenses: [ex('exsix', 10, 'pcara', sh)] }).flows[0].shares.map(s => s.amount), [5, 2.5, 2.5]);
  assert.deepEqual(S.settle({ party: ABC, expenses: [ex('exsix', 10.01, 'pcara', sh)] }).flows[0].shares.map(s => s.amount), [5.01, 2.5, 2.5]);
}
{ /* Weitere Rechenregeln */
  /* ohne Regel: gleich über alle Mitreisenden; Erstattung ohne Storno mindert nur netPaid, nicht die Kosten */
  const r = S.settle({ party: ABC, expenses: [ex('eximpl', 9, 'pben', null)], postings: [
    { key: 'ledger:kurs', label: 'Kurs', entry: { status: 'gebucht', amount: 300, paid: 300, due: '', refunds: [{ id: 'rftwo', on: '2026-12-01', amount: 30 }], paidBy: 'pcara' }, planCost: 300 },
    { key: 'ledger:skipass', label: 'Skipass', entry: { status: 'offen', amount: null, paid: 50, due: '' }, planCost: 120 },
    { key: 'ledger:act:x', label: 'Offener Preis', entry: {}, planCost: null },
    { key: 'ledger:tr:alt', label: 'Entfernt', entry: { status: 'gebucht', amount: null, paid: 80, due: '', paidBy: 'panna' }, planCost: null, detached: true },
    { key: 'ledger:tr:storno', label: 'Entfernt storniert', entry: { status: 'gebucht', amount: null, paid: 100, due: '', cancel: { on: '2026-11-01', fee: 40 } }, planCost: null, detached: true }
  ] });
  assert.deepEqual(r.flows.map(f => [f.key || f.id, f.amount]), [['eximpl', 9], ['ledger:kurs', 270], ['ledger:tr:alt', 80]]);
  assert.equal(r.unassigned.length, 2, 'Skipass 50 und Storno-Restzahlung 100 ohne Zahler');
  assert.equal(r.unassignedAmount, 150);
  assert.equal(r.netPaidTotal, 270 + 50 + 80 + 100);
  /* je Posten über cancelMath, ohne Verrechnung: Kurs 300 − 270 netto = 30 (Erstattung ohne Storno senkt keine Kosten, R2-2),
     Skipass 120 − 50 = 70, entfernter stornierter Posten: Gebühr 40 bezahlt, 60 Erstattung offen. Entfernt ohne Storno: nur Hinweis. */
  assert.equal(r.open.provider, 100);
  assert.equal(r.open.refunds, 60);
  assert.deepEqual(r.open.unknown.map(u => u.key), ['ledger:act:x'], 'offener Preis bleibt unbekannt, nicht 0');
  assert.deepEqual(r.detached.map(d => [d.key, d.netPaid]), [['ledger:tr:alt', 80]]);
  const m = V.cancelMath({ paid: 300, refunds: [{ id: 'rftwo', on: '2026-12-01', amount: 30 }] }, 300);
  assert.deepEqual([m.netPaid, m.open, m.refundOpen], [270, 30, 0], 'gleiche Wahrheit wie cancelMath');
}
{ /* Ausgleichsvorschlag: höchstens n − 1 Überweisungen und danach alle Salden 0 */
  let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
  const party = Array.from({ length: 8 }, (_, i) => ({ id: 'pers' + i, name: 'P' + i }));
  for (let k = 0; k < 300; k++) {
    const expenses = Array.from({ length: 1 + rnd(15) }, (_, i) => {
      const among = party.filter(() => rnd(2)).map(p => p.id); if (!among.length) among.push(party[0].id);
      const shares = rnd(2) ? Object.fromEntries(among.map(id => [id, 1 + rnd(100)])) : null;
      return ex('exr' + i, (1 + rnd(99999)) / 100, rnd(5) ? party[rnd(8)].id : null, shares ? { among, mode: 'shares', shares } : { among, mode: 'equal' });
    });
    S.validate({ party, expenses });
    const r = S.settle({ party, expenses }), b = Object.fromEntries(r.persons.map(p => [p.id, C(p.balance)]));
    assert.equal(sum(Object.values(b)), 0, 'Summe der Salden exakt 0');
    assert(r.transfers.length <= Math.max(0, r.persons.filter(p => p.balance !== 0).length - 1));
    r.transfers.forEach(x => { assert(x.amount > 0); b[x.from] += C(x.amount); b[x.to] -= C(x.amount); });
    assert(Object.values(b).every(v => v === 0), 'Vorschlag gleicht vollständig aus');
    assert.equal(C(r.extraSpent), sum(expenses.map(x => C(x.amount))));
  }
  /* Gleichstand: größter Gläubiger und Schuldner, sonst Reihenfolge der Mitreisenden */
  assert.deepEqual(S.suggestTransfers([{ id: 'a', balance: 100 }, { id: 'b', balance: 100 }, { id: 'c', balance: -200 }]), [{ from: 'c', to: 'a', cents: 100 }, { from: 'c', to: 'b', cents: 100 }]);
  assert.deepEqual(S.settle({ party: AB, expenses: [] }).transfers, []);
  assert.deepEqual(S.settle({ party: [], expenses: [ex('exsolo', 5, null, null)] }).persons, [], 'ohne Mitreisende keine Aufteilung');
}

/* ---------- Prüfung: Grenzen, IDs, Cent, Referenzen, __proto__ ---------- */
{
  const ok = { party: AB, expenses: [ex('exok', 12.5, 'panna', { among: ['panna', 'pben'], mode: 'shares', shares: { panna: 1, pben: 3 } })], ledger: { kurs: { status: 'offen', amount: null, paid: 10, due: '', paidBy: 'pben' } }, offers: [{ id: 'oone', name: 'X', paidBy: 'panna' }] };
  assert(S.validate(J(ok)));
  const bad = (mut, re, why) => { const t = J(ok); mut(t); assert.throws(() => S.validate(t), re, why); };
  bad(t => { t.party = Array.from({ length: 21 }, (_, i) => ({ id: 'pers' + i, name: 'P' + i })); t.expenses = []; t.ledger = {}; t.offers = []; }, /höchstens 20/);
  assert(S.validate({ party: Array.from({ length: 20 }, (_, i) => ({ id: 'pers' + i, name: 'P' + i })) }), '20 Personen erlaubt');
  bad(t => { t.party = { a: 1 }; }, /ungültige Liste/);
  bad(t => { t.party[0].name = ''; }, /Name fehlt/);
  bad(t => { t.party[0].name = '   '; }, /Name fehlt/);
  bad(t => { t.party[0].name = 'x'.repeat(41); }, /höchstens 40/);
  assert(S.validate(Object.assign(J(ok), { party: [{ id: 'panna', name: 'x'.repeat(40) }, AB[1]] })));
  bad(t => { t.party[0].id = 'pa1'; }, /ungültige ID/);
  bad(t => { t.party[0].id = 'Panna'; }, /ungültige ID/);
  bad(t => { t.party[1].id = 'panna'; }, /doppelte ID/);
  bad(t => { t.party[0].email = 'a@b.c'; }, /unbekanntes Feld/, 'keine E-Mail/Konto-IDs');
  bad(t => { t.expenses[0].id = 'panna'; }, /doppelte ID/, 'IDs eindeutig je Reise');
  bad(t => { t.expenses.push(J(t.expenses[0])); }, /doppelte ID/);
  bad(t => { t.expenses[0].on = '2026-02-30'; }, /Datum/);
  bad(t => { t.expenses[0].on = null; }, /Datum/);
  bad(t => { t.expenses[0].label = ''; }, /Bezeichnung/);
  bad(t => { t.expenses[0].label = 'x'.repeat(81); }, /Bezeichnung/);
  for (const v of [0, -1, 1.005, NaN, Infinity, null, '12', 1e9 + 1]) bad(t => { t.expenses[0].amount = v; }, /Betrag|Nachkommastellen/, 'Betrag ' + v);
  assert(S.validate(Object.assign(J(ok), { expenses: [Object.assign(J(ok.expenses[0]), { amount: 1e9 })] })), 'Höchstbetrag');
  assert(S.validate(Object.assign(J(ok), { expenses: [Object.assign(J(ok.expenses[0]), { amount: 0.01 })] })), 'kleinster Betrag');
  bad(t => { t.expenses[0].cat = 'unterkunft'; }, /Kategorie/, 'keine Unterkunft als Ausgabe');
  bad(t => { t.expenses[0].paidBy = 'pgone'; }, /Zahler/);
  bad(t => { t.expenses[0].split.among = []; }, /mindestens eine/);
  bad(t => { t.expenses[0].split.among = ['panna', 'panna']; }, /doppelt/);
  bad(t => { t.expenses[0].split.among = ['panna', 'pgone']; }, /unbekannte Person/);
  bad(t => { t.expenses[0].split.mode = 'percent'; }, /Aufteilungsart/);
  bad(t => { t.expenses[0].split = { among: ['panna'], mode: 'equal', shares: { panna: 1 } }; }, /Gewichte nur/);
  bad(t => { delete t.expenses[0].split.shares.pben; }, /passen nicht/);
  bad(t => { t.expenses[0].split.shares.pcara = 1; }, /passen nicht/);
  for (const w of [0, 101, 1.5, '2', null]) bad(t => { t.expenses[0].split.shares.pben = w; }, /Gewichte/, 'Gewicht ' + w);
  bad(t => { t.expenses[0].note = 'x'; }, /unbekanntes Feld/);
  bad(t => { t.ledger.kurs.paidBy = 'pgone'; }, /Buchungsbuch kurs: Zahler/);
  bad(t => { t.ledger.kurs.paidBy = 5; }, /Zahler/);
  bad(t => { t.offers[0].paidBy = 'pgone'; }, /Angebot X: Zahler/);
  bad(t => { t.party = []; }, /Zahler|unbekannte Person/, 'Person mit Zahlungen/Anteilen kann nicht verschwinden');
  /* __proto__ als eigener Schlüssel aus JSON */
  assert.throws(() => S.validate(JSON.parse('{"party":[{"id":"panna","name":"A","__proto__":{"x":1}}]}')), /unbekanntes Feld/);
  assert.throws(() => S.validate(JSON.parse('{"party":[{"id":"panna","name":"A"}],"expenses":[{"id":"exproto","on":"2026-12-31","label":"x","amount":1,"cat":"essen","paidBy":"panna","split":{"among":["panna"],"mode":"shares","shares":{"__proto__":1,"panna":1}}}]}')), /passen nicht/);
  assert.throws(() => S.validate(JSON.parse('{"party":[{"id":"panna","name":"A"}],"expenses":[{"id":"exproto","on":"2026-12-31","label":"x","amount":1,"cat":"essen","paidBy":"__proto__"}]}')), /Zahler/);
  assert.equal({}.x, undefined, 'kein Prototyp verändert');
  /* 2000 Ausgaben erlaubt, 2001 abgelehnt */
  const many = Array.from({ length: 2000 }, (_, i) => ex('exm' + i, 1, 'panna', null));
  assert(S.validate({ party: AB, expenses: many }));
  assert.throws(() => S.validate({ party: AB, expenses: many.concat([ex('exmore', 1, 'panna', null)]) }), /höchstens 2000/);
  /* needsV3 erkennt §3, leere Felder zählen nicht */
  assert.equal(V.needsV3({ party: [] }), false); assert.equal(V.needsV3({ party: AB }), true); assert.equal(V.needsV3({ expenses: [ex('exa1', 1, null, null)] }), true);
  assert.equal(V.needsV3({ ledger: { kurs: { paidBy: 'panna' } } }), true); assert.equal(V.needsV3({ offers: [{ paidBy: null }] }), false);
  assert.equal(S.hasData({ party: [] }), false); assert.equal(S.hasData({ offers: [{ paidBy: 'panna' }] }), true);
}

/* ---------- Eingaben und Änderungen ---------- */
{
  assert.equal(S.parseAmount('12,50'), 12.5); assert.equal(S.parseAmount(' 7 '), 7); assert.equal(S.parseAmount('0,01'), 0.01);
  for (const v of ['', '0', '0,00', '1.234,56', '1,234', '-3', '1e3', 'abc', '12,5,0', {}]) assert.throws(() => S.parseAmount(v), undefined, 'Betrag ' + v);
  const f = { on: '2026-12-31', label: '  Pizza  am  See ', amount: '30,00', cat: 'essen', paidBy: 'panna', mode: 'shares', 'in.panna': true, 'in.pben': 'on', 'in.pcara': false, 'w.panna': '2', 'w.pben': '1', 'w.pcara': 'x' };
  assert.deepEqual(J(S.readExpense(f, ABC, { id: 'expizza' })), { id: 'expizza', on: '2026-12-31', label: 'Pizza am See', amount: 30, cat: 'essen', paidBy: 'panna', split: { among: ['panna', 'pben'], mode: 'shares', shares: { panna: 2, pben: 1 } } });
  assert.deepEqual(S.readExpense(Object.assign({}, f, { mode: 'equal' }), ABC, { id: 'expizza' }).split, { among: ['panna', 'pben'], mode: 'equal' });
  assert.equal(S.readExpense(Object.assign({}, f, { paidBy: '' }), ABC, { id: 'expizza' }).paidBy, null);
  assert.equal(S.readExpense(Object.assign({}, f, { paidBy: '' }), [], { id: 'expizza' }).split, null, 'ohne Mitreisende keine Aufteilung');
  assert.throws(() => S.readExpense(Object.assign({}, f, { 'in.panna': false, 'in.pben': false }), ABC, { id: 'e' }), /Mindestens eine Person/);
  assert.throws(() => S.readExpense(Object.assign({}, f, { 'w.pben': '0' }), ABC, { id: 'e' }), /Gewicht für Ben/);
  assert.throws(() => S.readExpense(Object.assign({}, f, { paidBy: 'pgone' }), ABC, { id: 'e' }), /Zahler/);
  assert.throws(() => S.readExpense(Object.assign({}, f, { on: '31.12.2026' }), ABC, { id: 'e' }), /Datum/);
  assert.throws(() => S.readExpense(Object.assign({}, f, { cat: 'x' }), ABC, { id: 'e' }), /Kategorie/);
  assert.throws(() => S.readExpense(Object.assign({}, f, { amount: '' }), ABC, { id: 'e' }), /unbekannter Betrag ist keine Ausgabe/);
  /* Personen: Duplikate, Umbenennen, Entfernen nur ohne Zahlungen/Anteile */
  const t = { party: J(AB), expenses: [ex('exp1', 20, 'panna', { among: ['panna', 'pben'], mode: 'equal' })] };
  assert.throws(() => S.mutate(J(t), 'person-add', { id: 'pneu', name: ' anna ' }), /gibt es schon/);
  assert.throws(() => S.mutate(J(t), 'person-add', { id: 'p1', name: 'Cara' }), /ID/);
  const added = S.mutate(J(t), 'person-add', { id: 'pcara', name: '  Cara   Lu ' });
  assert.deepEqual(added.party[2], { id: 'pcara', name: 'Cara Lu' });
  assert.deepEqual(S.mutate(J(added), 'person-rename', { id: 'pben', name: 'Benedikt' }).party.map(p => p.name), ['Anna', 'Benedikt', 'Cara Lu']);
  assert.throws(() => S.mutate(J(added), 'person-rename', { id: 'pben', name: 'anna' }), /gibt es schon/);
  assert.throws(() => S.mutate(J(added), 'person-remove', { id: 'panna' }), /Anna kann nicht entfernt werden: hat 1 Ausgabe\(n\) bezahlt/);
  assert.throws(() => S.mutate(J(added), 'person-remove', { id: 'pben' }), /ist an 1 Ausgabe\(n\) beteiligt/);
  assert.equal(S.mutate(J(added), 'person-remove', { id: 'pcara' }).party.length, 2, 'unbeteiligte Person entfernbar');
  const implicit = { party: J(ABC), expenses: [ex('eximp', 9, 'panna', null)] };
  assert.throws(() => S.mutate(J(implicit), 'person-remove', { id: 'pcara' }), /beteiligt/, 'implizit beteiligt (ohne Regel)');
  const booked = { party: J(ABC), ledger: { kurs: { status: 'gebucht', amount: 90, paid: 90, due: '', paidBy: 'panna' } } };
  assert.throws(() => S.mutate(J(booked), 'person-remove', { id: 'pcara' }), /trägt Anteile an 1 bezahlten Buchung/);
  assert.throws(() => S.mutate(J(booked), 'person-remove', { id: 'panna' }), /Zahler bei 1 Buchung/);
  booked.ledger.kurs.refunds = [{ id: 'rfall', on: '2026-12-01', amount: 90 }];
  assert.equal(S.mutate(J(booked), 'person-remove', { id: 'pcara' }).party.length, 2, 'vollständig erstattet: kein Anteil mehr');
  let full = { party: [] }; for (let i = 0; i < 20; i++) full = S.mutate(full, 'person-add', { id: 'pers' + i, name: 'P' + i });
  assert.throws(() => S.mutate(full, 'person-add', { id: 'pextra', name: 'X' }), /Höchstens 20/);
  /* Ausgaben */
  const e2 = S.mutate(J(t), 'expense-put', { add: true, expense: ex('exp2', 5, null, null) });
  assert.equal(e2.expenses.length, 2);
  assert.throws(() => S.mutate(J(e2), 'expense-put', { add: true, expense: ex('exp2', 5, null, null) }), /Doppelte ID/);
  assert.equal(S.mutate(J(e2), 'expense-put', { add: false, expense: ex('exp2', 6, 'pben', null) }).expenses[1].amount, 6);
  assert.throws(() => S.mutate(J(e2), 'expense-put', { add: false, expense: ex('exgone', 6, null, null) }), /nicht mehr/);
  assert.deepEqual(S.mutate(J(e2), 'expense-remove', { id: 'exp1' }).expenses.map(x => x.id), ['exp2']);
  assert.throws(() => S.mutate(J(e2), 'expense-remove', { id: 'exgone' }), /nicht mehr/);
  assert.throws(() => S.mutate(J(e2), 'gibts-nicht', {}), /Unbekannte/);
  /* Zahler setzen und entfernen, sonst nichts */
  const entry = { status: 'gebucht', amount: 50, paid: 50, due: '2026-12-01', refunds: [] };
  assert.deepEqual(S.setPayer(J(entry), 'pben', AB), Object.assign(J(entry), { paidBy: 'pben' }));
  assert.deepEqual(S.setPayer(Object.assign(J(entry), { paidBy: 'pben' }), null, AB), entry);
  assert.throws(() => S.setPayer(J(entry), 'pgone', AB), /Zahler/);
  assert.equal(S.fmt(null), 'unbekannt', 'unbekannt ist nicht 0 €'); assert.equal(S.fmt(3.5).replace(/\s/g, ' '), '3,50 €');
}

/* ---------- Controller (Muster v3editor.js) ---------- */
{
  let trip = { id: 'tsplit', party: J(AB), expenses: [] }, scope = 'guest', enabled = true, editable = true, writes = 0, failPut = false;
  const api = {
    candidate: (t, action, target, f, newId) => { const c = J(t); if (action === 'person-add') S.mutate(c, action, { id: newId, name: f.name }); else if (action === 'expense-add') S.mutate(c, 'expense-put', { add: true, expense: S.readExpense(f, c.party, { id: newId }) }); else throw Error('nicht im Test'); S.validate(c); return c; },
    preview: (t, n) => '<p>' + (n.party.length + n.expenses.length) + '</p>', check: (t, action) => { if (action === 'person-remove') throw Error('Diese Person gibt es nicht'); }
  };
  const ed = S.createEditor(api, { getTrip: id => trip && trip.id === id ? trip : null, scope: () => scope, enabled: () => enabled, canEdit: () => editable, newId: a => a === 'person-add' ? 'pcara' : 'exneu', put: n => { writes++; if (failPut) { n.title = 'mutiert'; return false; } trip = J(n); return true; } });
  assert.throws(() => ed.begin('tsplit', 'drop-db'), /Unbekannte Aktion/);
  assert.throws(() => ed.begin('tsplit', 'person-remove', { id: 'x' }), /gibt es nicht/);
  let s = ed.begin('tsplit', 'person-add'); assert.equal(s.newId, 'pcara'); assert.equal(s.phase, 'edit');
  assert.throws(() => ed.apply(s.token), /zuerst prüfen/);
  s = ed.preview({ name: 'Cara' }); assert.equal(s.phase, 'preview'); assert.equal(writes, 0, 'Vorschau speichert nichts');
  assert.throws(() => ed.preview({ name: 'anna' }), /gibt es schon/); assert.throws(() => ed.apply(s.token), /zuerst prüfen/, 'fehlgeschlagene Vorschau entwertet alten Kandidaten');
  s = ed.preview({ name: 'Cara' });
  scope = 'other'; assert.throws(() => ed.apply(s.token), /Speicherbereich/); scope = 'guest';
  editable = false; assert.throws(() => ed.apply(s.token), /freigegeben/); editable = true;
  enabled = false; assert.throws(() => ed.apply(s.token), /noch nicht freigegeben/); enabled = true;
  const keep = trip; trip = Object.assign(J(trip), { title: 'parallel' }); assert.throws(() => ed.apply(s.token), /geändert/); trip = keep;
  const old = s.token; ed.back(); assert.throws(() => ed.apply(old), /zuerst prüfen/);
  s = ed.preview({ name: 'Cara' }); failPut = true; assert.throws(() => ed.apply(s.token), /nicht gespeichert/); assert.equal(trip.party.length, 2);
  failPut = false; assert(ed.apply(s.token)); assert.deepEqual(trip.party.map(p => p.name), ['Anna', 'Ben', 'Cara']); assert.equal(trip.title, undefined, 'Speicherfehler beschädigt Kandidaten nicht');
  assert.throws(() => ed.apply(s.token), /nicht mehr geöffnet/); assert.equal(writes, 2);
  s = ed.begin('tsplit', 'expense-add'); ed.close(); assert.throws(() => ed.preview({}), /nicht mehr geöffnet/);
}

/* ---------- App-Anbindung (index.html) ---------- */
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.includes('<script src="v3split.js"></script>'), 'Skript eingebunden');
function load(opts) {
  opts = opts || {};
  let code = require("./app-code.cjs")(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
  if (opts.locked) code = code.replace('const V3_EDIT=true;', 'const V3_EDIT=false;');
  const memory = new Map(), win = { addEventListener() {}, RPV3: V, RPCatalog: require('../catalog.js') };
  if (!opts.noModule) win.RPV3S = S;
  const ctx = { window: win, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
    localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) }, setTimeout: () => 0, clearTimeout() {}, console, alert() {} };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { a: ctx.window.__app, memory };
}
const { a, memory } = load();
assert.equal(a.V3_EDIT, true, 'Produktionsdatei: Format 3 freigegeben');
a.Store.setScope('guest');
const L = key => ({ kind: 'ledger', key });

/* v2-Reise: erste Person nur über Vorschau, wird Format 3, Quelle unverändert */
const base = a.silvesterTemplate(); a.Store.put(base);
const tid = base.id, src = J(a.Store.get(tid));
assert(a.splitSection(a.Store.get(tid)).includes('Mit der ersten Person oder Ausgabe wird die Reise auf Format 3 umgestellt'));
const ed = a.splitController();
let s = ed.begin(tid, 'person-add');
s = ed.preview({ name: 'Anna <b>' });
assert(s.preview.includes('Format 3 umgestellt'), 'nie still Format 3'); assert(s.preview.includes('Anna &lt;b&gt;') && !s.preview.includes('Anna <b>'), 'Name maskiert');
assert.deepEqual(J(a.Store.get(tid)), src, 'Vorschau speichert nichts');
assert(ed.apply(s.token));
let t = a.Store.get(tid);
assert.equal(t.schemaVersion, 3); assert.equal(t.party.length, 1); assert.equal(JSON.parse(memory.get('rp-trips'))[tid].party[0].name, 'Anna <b>');
const pA = t.party[0].id; assert(/^pa[a-z0-9]+$/.test(pA));
s = ed.begin(tid, 'person-rename', { id: pA }); ed.apply(ed.preview({ name: 'Anna' }).token);
s = ed.begin(tid, 'person-add'); ed.apply(ed.preview({ name: 'Ben' }).token);
t = a.Store.get(tid); const pB = t.party[1].id;
assert.deepEqual(t.party.map(p => p.name), ['Anna', 'Ben']);

/* Ausgabe erfassen mit Dezimalkomma, Gewichten; Vorschau zeigt Saldo; Bearbeiten und Entfernen */
s = ed.begin(tid, 'expense-add');
assert.throws(() => ed.preview({ on: '2026-12-31', label: 'Raclette', amount: '1.234,50', cat: 'essen', paidBy: pA, mode: 'equal', ['in.' + pA]: true, ['in.' + pB]: true }), /Tausendertrennzeichen/);
s = ed.preview({ on: '2026-12-31', label: 'Raclette', amount: '30,00', cat: 'essen', paidBy: pA, mode: 'equal', ['in.' + pA]: true, ['in.' + pB]: true });
assert(/Ben<\/th><td><b>[^<]*0,00/.test(s.preview) && /\(zahlt\)/.test(s.preview), 'Saldo vorher/nachher mit Wort, nicht nur Farbe');
ed.apply(s.token); t = a.Store.get(tid);
const exId = t.expenses[0].id;
assert.deepEqual(J(t.expenses[0]), { id: exId, on: '2026-12-31', label: 'Raclette', amount: 30, cat: 'essen', paidBy: pA, split: { among: [pA, pB], mode: 'equal' } });
let r = a.splitResult(t);
assert.deepEqual(r.transfers.map(x => [x.from, x.to, x.amount]), [[pB, pA, 15]]);
let sec = a.splitSection(t);
assert(sec.includes('Ben zahlt an Anna: <b>15,00') && sec.includes('data-split-act="open"'), 'Ausgleich sichtbar, bearbeitbar');
s = ed.begin(tid, 'expense-edit', { id: exId });
s = ed.preview({ on: '2026-12-31', label: 'Raclette', amount: '10,01', cat: 'essen', paidBy: pB, mode: 'shares', ['in.' + pA]: true, ['in.' + pB]: true, ['w.' + pA]: '2', ['w.' + pB]: '1' });
assert(s.preview.includes('Bisher') && s.preview.includes('Danach'));
ed.apply(s.token); t = a.Store.get(tid);
assert.deepEqual(a.splitResult(t).flows[0].shares.map(x => x.amount), [6.67, 3.34], '10,01 € im Verhältnis 2:1, Summe exakt');

/* Zahler bei gebuchtem, bezahltem Posten wählen: nur paidBy ändert sich, Verpflichtungsschutz bleibt */
const actKey = a.ledgerRows(t).find(x => x.key.startsWith('act:')).key;
t.ledger = { [actKey]: { status: 'gebucht', amount: 40, paid: 40, due: '2026-12-01' } }; assert(a.Store.put(t));
const beforePayer = J(a.Store.get(tid));
s = ed.begin(tid, 'payer', L(actKey)); s = ed.preview({ paidBy: pA }); ed.apply(s.token); t = a.Store.get(tid);
assert.deepEqual(J(t.ledger[actKey]), Object.assign(J(beforePayer.ledger[actKey]), { paidBy: pA }), 'nur paidBy geändert');
const restT = J(t); delete restT.ledger[actKey].paidBy; delete restT.updated; const restB = J(beforePayer); delete restB.updated; assert.deepEqual(restT, restB, 'alle anderen Felder unverändert');
assert.throws(() => a.splitCandidate(t, 'payer', L(actKey), { paidBy: 'pgone' }), /Zahler/);
assert.throws(() => a.splitCandidate(t, 'payer', { kind: 'stay' }, { paidBy: pA }), /Unbekannter Posten/);
/* Zahler wieder entfernen; ein nur dafür angelegter leerer Eintrag verschwindet */
const kurs = a.ledgerRows(t).find(x => x.key === 'kurbeitrag').key;
const withPayer = a.splitCandidate(t, 'payer', L(kurs), { paidBy: pB }); assert.deepEqual(J(withPayer.ledger[kurs]), { status: 'offen', amount: null, paid: 0, due: '', paidBy: pB });
assert.equal(a.splitCandidate(withPayer, 'payer', L(kurs), { paidBy: '' }).ledger[kurs], undefined);
assert.deepEqual(J(a.splitCandidate(t, 'payer', L(actKey), { paidBy: '' }).ledger[actKey]), J(beforePayer.ledger[actKey]), 'Zahler entfernen erhält die Buchung');
/* planCost der Aufteilung entspricht der App-Rechnung (financeEntry/v3Ref) für jeden Posten */
a.splitPostings(t).filter(p => p.target && p.target.kind === 'ledger').forEach(p => assert.strictEqual(p.planCost, a.financeEntry(t, p.target).planCost, p.key));
r = a.splitResult(t);
assert.deepEqual(r.persons.map(x => [x.name, x.paid, x.share, x.balance]), [['Anna', 40, 26.67, 13.33], ['Ben', 10.01, 23.34, -13.33]], 'Ausgabe 2:1 plus Buchung 40 gleich');
assert(r.open.provider > 0, 'restliche Planposten noch an Anbieter offen'); assert.equal(r.open.unknown.length, 0);

/* P3 in der App: storniertes aktives Angebot, B zahlte 600, 150 zurück, Gebühr 450 → A schuldet B 225 */
{
  const x = J(a.Store.get(tid)); x.expenses = []; x.ledger = {};
  const o = { id: 'osplit', stayId: x.stayId, name: 'Split-Hütte', location: 'Testort', provider: 'direkt', type: 'hotel', start: x.start, end: x.end, persons: x.persons, price: 900, basis: 'stay', url: 'https://example.org/split', checkedAt: '2026-10-15', availability: 'available', terms: 'Testdaten', paid: 600, deposit: 0, booked: true,
    features: Object.fromEntries(['sauna', 'kitchen', 'breakfast', 'cancel', 'quiet', 'accessible', 'parking'].map(k => [k, 'unknown'])), fees: Object.fromEntries(['tax', 'cleaning', 'parking', 'wellness', 'mandatory'].map(k => [k, { state: 'included', amount: 0 }])),
    refunds: [{ id: 'rfsplit', on: '2026-11-02', amount: 150 }], cancel: { on: '2026-11-01', fee: 450 } };
  x.offers = [o]; x.activeOfferId = o.id; a.validateExtras(x); assert(a.Store.put(x));
  s = ed.begin(tid, 'payer', { kind: 'offer', id: 'osplit' }); s = ed.preview({ paidBy: pB });
  assert(s.preview.includes('450,00'), 'Vorschau zeigt Nettozahlung');
  ed.apply(s.token);
  const y = a.Store.get(tid), ry = a.splitResult(y);
  assert.equal(y.offers[0].paidBy, pB); assert.deepEqual(J(y.offers[0].refunds), J(o.refunds)); assert.deepEqual(J(y.offers[0].cancel), J(o.cancel));
  assert.deepEqual(ry.transfers.map(z => [z.from, z.to, z.amount]), [[pA, pB, 225]], 'P3');
  assert.equal(ry.open.refunds, 0);
  /* Person mit Zahlungen oder Anteilen nicht löschbar, nur umbenennen */
  assert.throws(() => a.splitCandidate(y, 'person-remove', { id: pA }), /kann nicht entfernt werden: trägt Anteile/);
  assert.throws(() => a.splitCandidate(y, 'person-remove', { id: pB }), /Zahler bei 1 Buchung/);
  s = ed.begin(tid, 'person-remove', { id: pA }); assert.throws(() => ed.preview({}), /Umbenennen ist möglich/);
  ed.close();
  assert(a.splitForm(y, { action: 'person-remove', target: { id: pA } }).includes('Entfernen nicht möglich'));
  /* Unbeteiligte Person lässt sich entfernen */
  s = ed.begin(tid, 'person-add'); ed.apply(ed.preview({ name: 'Cara' }).token);
  const pC = a.Store.get(tid).party[2].id;
  assert.throws(() => a.splitCandidate(a.Store.get(tid), 'person-remove', { id: pC }), /trägt Anteile/, 'bezahlte Buchung ohne Regel: alle beteiligt');
}
/* P5 in der App: Plan 1000, A zahlt 200 → B schuldet A 100; 800 an Anbieter offen */
{
  const x = J(a.Store.get(tid)); x.offers = []; x.activeOfferId = null; x.party = x.party.slice(0, 2); x.extraCosts = [{ id: 'kp5', t: 'Ferienhaus extern', c: 1000 }];
  x.items = []; x.stayId = null; x.customStays = []; x.travel = 'bahn'; x.ticket = 0; x.food = 'self'; x.puffer = 0;
  x.ledger = { 'xc:kp5': { status: 'gebucht', amount: 1000, paid: 200, due: '', paidBy: pA } };
  a.validateExtras(x);
  const rx = a.splitResult(x);
  assert.deepEqual(rx.transfers.map(z => [z.from, z.to, z.amount]), [[pB, pA, 100]], 'P5');
  assert.equal(rx.open.provider, a.splitPostings(x).reduce((s2, p) => s2 + V.cancelMath(p.entry, p.planCost).open, 0));
  assert(rx.open.provider >= 800, '800 offen (plus übrige Planposten)');
  const xp = a.splitPostings(x).find(p => p.key === 'ledger:xc:kp5'); assert.equal(V.cancelMath(xp.entry, xp.planCost).open, 800);
  assert(a.splitSection(x).includes('Noch an Anbieter offen'));
}
/* P4 in der App: Ausgabe ohne Zahler zählt, Hinweis im Bereich */
{
  s = ed.begin(tid, 'expense-add'); s = ed.preview({ on: '2027-01-01', label: 'Parken', amount: '8', cat: 'anreise', paidBy: '', mode: 'equal', ['in.' + pA]: true, ['in.' + pB]: true });
  assert(s.preview.includes('zählt nicht im Ausgleich')); ed.apply(s.token);
  const y = a.Store.get(tid), ry = a.splitResult(y);
  assert.equal(ry.extraSpent, 8); assert.equal(ry.unassigned.filter(u => u.source === 'expense').length, 1);
  assert(a.splitSection(y).includes('ohne Zahler'));
  /* Rückblick trennt Plan / gebucht-bezahlt / zusätzlich ausgegeben */
  assert(/Zusätzlich ausgegeben/.test(a.splitSection(y)) && /Plan, gebucht und zusätzlich ausgegeben/.test(a.splitSection(y)));
  const retro = a.budgetSection(y, new Date('2027-02-01T10:00:00Z'));
  assert(/Rückblick/.test(retro) && /data-split-retro/.test(retro) && /zusätzlich unterwegs ausgegeben 8,00/.test(retro), 'Rückblick nach Reiseende getrennt');
  assert(!/data-split-retro/.test(a.budgetSection(y, new Date('2026-10-01T10:00:00Z'))), 'vor der Reise kein Rückblick');
  /* Ausgabe entfernen über Vorschau */
  const pid = y.expenses.find(e => e.label === 'Parken').id;
  s = ed.begin(tid, 'expense-remove', { id: pid }); s = ed.preview({}); assert(s.preview.includes('Entfernt wird')); ed.apply(s.token);
  assert(!a.Store.get(tid).expenses.some(e => e.id === pid));
}
/* Teilen-Text und Mappe ohne Mitreisenden-Namen (ohne ausdrückliche Wahl) */
{
  const y = J(a.Store.get(tid)); y.party[0].name = 'Geheimname Anna';
  assert(!a.tripText(y, {}).includes('Geheimname') && !a.tripText(y, { notes: true }).includes('Geheimname'));
  assert(!a.tMappe(y).includes('Geheimname'), 'Mappe ohne Namen');
}

/* ---------- Feldtreue: alle v3-Felder überstehen v2-Bearbeitungen, Export/Import, Kopie, Neuladen, toServer ---------- */
{
  const x = J(a.Store.get(tid));
  x.transport = { out: [{ id: 'sflug', mode: 'flug', fromCode: 'STR', toCode: 'MUC', cost: 89, per: 'pp' }], back: [] };
  x.ledger['tr:sflug'] = { status: 'gebucht', amount: null, paid: 178, due: '', paidBy: pB, refunds: [{ id: 'rftr', on: '2026-12-02', amount: 20 }] };
  x.ledger['kurs'] = { status: 'offen', amount: null, paid: 0, due: '', paidBy: pA };
  a.validateExtras(x); assert(a.Store.put(x));
  const v3 = y => J({ party: y.party, expenses: y.expenses, transport: y.transport, offers: (y.offers || []).map(o => [o.paidBy, o.refunds, o.cancel]), payers: Object.fromEntries(Object.entries(y.ledger || {}).map(([k, e]) => [k, [e.paidBy, e.refunds, e.cancel]])), v: y.schemaVersion });
  const ref = v3(a.Store.get(tid));
  const y = a.Store.get(tid);
  a.setField(y, 'title', 'Neu'); a.setField(y, 'notes', 'Notiz'); a.setField(y, 'budget', '2000'); a.setField(y, 'persons', '3');
  assert.deepEqual(v3(y), ref, 'setField');
  a.setLedger(y, 'kurs', 'paid', '5'); a.setLedger(y, 'kurs', 'paid', ''); a.setLedger(y, 'kurs', 'status', 'offen'); a.setLedger(y, 'kurs', 'amount', '');
  assert(y.ledger.kurs && y.ledger.kurs.paidBy === pA, 'Eintrag mit nur paidBy gilt nie als leer');
  a.setLedger(y, 'tr:sflug', 'due', '2026-12-20'); a.setLedger(y, 'tr:sflug', 'due', '');
  assert.deepEqual(v3(y), ref, 'setLedger je Feld');
  const it = (y.items || []).find(i => !y.ledger['act:' + i.act]);
  assert(it, 'ungebundener Termin für den Feldtreue-Test vorhanden');
  { const moved = a.protectedPlanChange(y, 'move', { uid: it.uid, day: it.day, slot: it.slot === 'abend' ? 'morgen' : 'abend' }); assert.deepEqual(v3(moved), ref, 'Termin verschieben'); const rem = a.protectedPlanChange(y, 'remove', { uid: it.uid }); assert.deepEqual(v3(rem), ref, 'Termin entfernen'); }
  assert(a.Store.put(y));
  assert.deepEqual(v3(a.toServer(y)), ref, 'toServer behält Format 3 und alle Felder'); assert.equal(a.toServer(y).schemaVersion, 3);
  const raw = J(a.backupData([y])); assert.deepEqual(v3(a.validateBackup(raw)[0]), ref, 'Sicherung');
  assert.equal(a.serverRowProblem({ id: y.id, version: 1, data: J(y) }), null, 'Serverzeile mit §3 lesbar');
  const ids = a.importTrips(raw, 'copy'); assert.notEqual(ids[0], y.id); assert.deepEqual(v3(a.Store.get(ids[0])), ref, 'Importkopie');
  a.Store.setScope('guest'); assert.deepEqual(v3(a.Store.get(tid)), ref, 'Neuladen aus dem Browser-Speicher');
  /* §3-Änderung lässt Anreise, Storno und Erstattungen unberührt */
  const z = a.splitCandidate(a.Store.get(tid), 'person-rename', { id: pA }, { name: 'Anni' });
  assert.deepEqual(J(z.transport), ref.transport); assert.deepEqual(J(z.ledger['tr:sflug']), J(a.Store.get(tid).ledger['tr:sflug']));
  /* Verpflichtungsschutz bleibt: gebuchter Flug wird durch Zahlerwechsel nicht freigegeben */
  const w = a.splitCandidate(a.Store.get(tid), 'payer', L('tr:sflug'), { paidBy: pA });
  assert.equal(w.ledger['tr:sflug'].paidBy, pA); assert.deepEqual(J(w.ledger['tr:sflug'].refunds), ref.payers['tr:sflug'][1]);
  const noFlight = J(w.transport); noFlight.out = [];
  assert.throws(() => a.setTransport(w, noFlight), /Gebuchte Anreise-Abschnitte/);
}

/* ---------- Gesperrter Rückfall (V3_EDIT=false) und fehlendes Modul ---------- */
{
  const stored = memory.get('rp-trips');
  const locked = load({ locked: true }); locked.memory.set('rp-trips', stored); locked.a.Store.setScope('guest');
  const lt = locked.a.Store.get(tid);
  assert(lt && lt.party.length === 3, 'mit Modul lesbar');
  const view = locked.a.splitSection(lt);
  assert(view.includes('Nur ansehen') && !view.includes('data-split-act="open"'), 'nur ansehen, keine Bearbeitungsknöpfe');
  assert.throws(() => locked.a.splitController().begin(tid, 'person-add'), /noch nicht freigegeben/);
  lt.party = []; assert.equal(locked.a.Store.put(lt), false); assert.equal(locked.memory.get('rp-trips'), stored, 'gesperrt: nichts geschrieben');
  assert.equal(locked.a.splitSection(locked.a.silvesterTemplate()), '', 'v2-Reise ohne Freigabe: kein Bereich');

  const old = load({ noModule: true });
  assert.throws(() => old.a.validateExtras(J(a.Store.get(tid))), /kennt diese App-Version noch nicht/, 'ohne v3split.js geschützt statt falsch angezeigt');
  /* nur Zahler-Angaben (ohne Personen/Ausgaben) ebenfalls geschützt */
  assert.throws(() => old.a.validateExtras(Object.assign(J(a.Store.get(tid)), { party: [], expenses: [] })), /Zahler-Angaben kennt diese App-Version noch nicht/);
  assert.notEqual(old.a.serverRowProblem({ id: tid, version: 1, data: J(a.Store.get(tid)) }), null, 'Serverzeile ohne Modul: nicht lesbar, wird nicht überschrieben');
  assert.equal(old.a.splitSection(a.Store.get(tid)), '');
  /* v2-Reise mit §3-Feldern abgelehnt */
  const v2 = a.silvesterTemplate(); v2.schemaVersion = 2;
  assert.throws(() => a.validateExtras(Object.assign(J(v2), { party: J(AB) })), /Formats 3/);
  assert.doesNotThrow(() => a.validateExtras(Object.assign(J(v2), { party: [], expenses: [] })), 'leere Felder bleiben Format 2');
  assert.equal(a.toServer(Object.assign(J(v2), { party: [], expenses: [] })).party, undefined, 'Format 2 schreibt keine leeren v3-Felder');
}
/* Review 17.10.: offener Preis nie 0 €, gesunkener Planwert ist keine erwartete Erstattung, Vorschau zeigt den echten Zahler */
{
  const { a } = load(); a.Store.setScope('guest');
  let t = a.silvesterTemplate(); t.schemaVersion = 3; t.party = [{ id: 'panna', name: 'Anna' }, { id: 'pben', name: 'Ben' }];
  t.customActs = (t.customActs || []).concat([{ id: 'cboot', custom: true, t: 'Bootstour', cat: 'ausflug', cost: 0, costOpen: true, per: 'grp', slot: 'nachm' }]);
  t.items = (t.items || []).concat([{ uid: 'iboot', act: 'cboot', day: 1, slot: 'nachm' }]);
  a.validateExtras(t);
  const post = a.splitPostings(t).find(p => p.key === 'ledger:act:cboot');
  assert(post && post.planCost === null, 'eingeplante Unternehmung ohne Preis: Betrag unbekannt');
  assert(a.splitResult(t).open.unknown.some(u => u.key === 'ledger:act:cboot'), 'erscheint unter unbekannten Beträgen');

  t = a.silvesterTemplate(); t.schemaVersion = 3; t.party = [{ id: 'panna', name: 'Anna' }, { id: 'pben', name: 'Ben' }];
  a.validateExtras(t); a.setLedger(t, 'kurs', 'paid', '120'); a.setLedger(t, 'kurs', 'status', 'gebucht'); t.ledger.kurs.paidBy = 'panna';
  a.setField(t, 'persons', '1');
  assert.equal(a.splitResult(t).open.refunds, 0, 'ohne Storno keine erwartete Erstattung');
  assert(!a.splitSection(t).includes('Erwartete Erstattungen'), 'kein erfundener Erstattungshinweis');

  t = a.silvesterTemplate(); t.schemaVersion = 3; t.party = [{ id: 'panna', name: 'Anna' }, { id: 'pben', name: 'Ben' }];
  const o = { id:'osplit', stayId:t.stayId, name:'Alt-Hütte', location:'Testort', provider:'direkt', type:'hotel', start:t.start, end:t.end, persons:t.persons, price:900, basis:'stay', url:'https://example.org/split', checkedAt:'2026-10-15', availability:'available', terms:'', paid:0, deposit:0, booked:false,
 features:Object.fromEntries(['sauna','kitchen','breakfast','cancel','quiet','accessible','parking'].map(k=>[k,'unknown'])), fees:Object.fromEntries(['tax','cleaning','parking','wellness','mandatory'].map(k=>[k,{state:'included',amount:0}])), paidBy:'panna'};
  t.offers = [o]; t.activeOfferId = null;
  a.validateExtras(t); a.Store.put(t); const ed = a.splitController();
  assert(a.splitSection(a.Store.get(t.id)).includes('Alt-Hütte'));
  let st = ed.begin(t.id, 'payer', { kind: 'offer', id: 'osplit' }); st = ed.preview({ paidBy: '' });
  assert(/Zahler danach<\/dt><dd>keine Angabe/.test(st.preview), 'Vorschau zeigt den Zahler nach der Änderung');
  ed.apply(st.token); assert.equal(a.Store.get(t.id).offers[0].paidBy, undefined);
}
/* Review 17.10.: Abschnitt entfernen behält einen Buchungsbuch-Eintrag, der nur den Zahler trägt (Feldtreue §5) */
{
  const { a } = load(); a.Store.setScope('guest');
  const t = a.silvesterTemplate(); t.schemaVersion = 3; t.party = [{ id: 'panna', name: 'Anna' }];
  a.setTransport(t, { out: [{ id: 'sbahn', mode: 'bahn', cost: 40, per: 'pp' }], back: [] });
  t.ledger = Object.assign({}, t.ledger, { 'tr:sbahn': { status: 'offen', paid: 0, paidBy: 'panna' } }); a.validateExtras(t);
  a.setTransport(t, { out: [], back: [] });
  assert.deepEqual(J(t.ledger['tr:sbahn']), { status: 'offen', paid: 0, paidBy: 'panna' }, 'Zahler-Angabe bleibt am ursprünglichen Posten');
  assert.doesNotThrow(() => a.validateExtras(t), 'als Historie gültig');
}
console.log('Aufteilung (P0.2a): Verteilung nach größtem Rest (Eigenschaften), P1–P6, Ausgleich mit höchstens n−1 Überweisungen, getrennte offene Beträge und Erstattungen, Grenzen/IDs/Cent/__proto__/Referenzen, Personen nur ohne Zahlungen/Anteile entfernbar, Eingaben mit Dezimalkomma, Controller (Vorschau, Token, Bereich, Rechte, Quellstand, Speicherfehler), App-Weg v2→Format 3 mit Vorschau, Zahler bei Buchung und Angebot ohne Verpflichtungsänderung, Rückblick, Teilen-Text/Mappe ohne Namen, Feldtreue (setField, setLedger, Termine, toServer, Sicherung, Importkopie, Neuladen), gesperrter Rückfall und fehlendes Modul geprüft.');
