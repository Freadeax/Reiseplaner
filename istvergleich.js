/* Reiseplaner · Plan-Ist-Vergleich je Bereich (docs/IST_AUSGABEN.md).
   Reine Regeln ohne DOM und Speicher. Die App liefert die Zeilen aus cost(t) (eine Berechnung für alle Ansichten), die
   Nettozahlungen je Buchungsposten und die Ausgaben unterwegs (t.expenses). Hier entsteht daraus je Bereich:
   - plan:     aktueller Plan (cost(t).byCat, gebuchte Beträge statt Planwerte), ohne Puffer
   - paid:     tatsächlich an Anbieter bezahlt (netto nach Erstattungen)
   - spent:    Ausgaben unterwegs in diesem Bereich
   - ist:      paid + spent (Geld, das wirklich geflossen ist)
   - forecast: Hochrechnung bis Reiseende nach den Topf-Regeln T1–T6 (unten), nie still kleiner als Bekanntes
   Unbekannt bleibt unbekannt: Bereiche mit offenem Preis tragen unknown > 0, und die Gesamtaussage wird nie „im Budget“.
   Geld intern in Cent. UMD: window.RPIST im Browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RPIST = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /* Ausgaben-Kategorien (v3split CATS) → Kostenbereiche (COSTCAT der App). Einkauf & Vorräte zählt zur Verpflegung. */
  const AREA = Object.freeze({ essen: 'essen', einkauf: 'essen', anreise: 'anreise', ausflug: 'ausflug', wellness: 'wellness', genuss: 'genuss', eigen: 'eigen' });
  const ORDER = ['unterkunft', 'anreise', 'gebuehren', 'schnee', 'wellness', 'ausflug', 'genuss', 'essen', 'eigen'];
  const c = v => (typeof v === 'number' && isFinite(v) ? Math.round(v * 100) : 0);
  const e = v => Math.round(v) / 100;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;

  /* Anteil der Reise, der noch vor einem liegt. Heute zählt noch als offen (konservativ: heutige Ausgaben sind
     vielleicht noch nicht alle erfasst). vor → 1, nach → 0. */
  function remaining(phase) {
    if (!phase || phase.phase === 'vor') return 1;
    if (phase.phase === 'nach') return 0;
    const of = Math.max(1, phase.of | 0), day = Math.min(Math.max(0, phase.day | 0), of - 1);
    return (of - day) / of;
  }

  /* Topf = Planwert ohne Einzelbuchung, der laufend ausgegeben wird (Verpflegung, Sprit vor Ort).
     T1 Vor der Reise:   Ausgaben füllen den Topf zuerst: max(Topf, Ausgaben).
     T2 Unterwegs:       ohne Ausgaben bleibt der Topf (nicht erfasst ≠ 0 €). Mit Ausgaben: Ausgaben + Topf × Rest,
                         aber nie unter dem Topf (Hochrechnung sinkt unterwegs nicht unter den Plan).
     T3 Nach der Reise:  mit Ausgaben gilt das Erfasste; ohne Ausgaben bleibt der Topf und der Bereich heißt „nicht erfasst“.
     T4 Bereich ohne Topf: Ausgaben kommen zum Plan dazu (zusätzlich ausgegeben).
     T5 Bezahlte Buchungen sind schon im Plan (gebuchter Betrag, Bezahltes über Plan zählt laut cost()) und werden nie
        zusätzlich addiert.
     T6 Puffer ist Reserve, keine Ausgabe: nicht im Vergleich, getrennt ausgewiesen. */
  function potForecast(pot, spent, phase) {
    if (pot <= 0) return { f: 0, absorbed: 0, untracked: false };
    const p = phase ? phase.phase : 'vor';
    if (p === 'nach') return spent > 0 ? { f: spent, absorbed: spent, untracked: false } : { f: pot, absorbed: 0, untracked: true };
    if (p === 'unterwegs') {
      if (spent <= 0) return { f: pot, absorbed: 0, untracked: false };
      return { f: Math.max(pot, spent + Math.round(pot * remaining(phase))), absorbed: spent, untracked: false };
    }
    return { f: Math.max(pot, spent), absorbed: spent, untracked: false };
  }

  /* input: {lines:[{cat,c,pot?,unknown?}], payments:[{cat,netPaid}], expenses:[{on,amount,cat}],
             phase:{phase,day,of}|null, budget:Zahl|0, labels:{bereich:Text}, today:'JJJJ-MM-TT'} */
  function compare(input) {
    input = input || {};
    const phase = input.phase || null, areas = {};
    const area = k => areas[k] || (areas[k] = { key: k, plan: 0, pot: 0, paid: 0, spent: 0, unknown: 0, todaySpent: 0, count: 0 });
    let reserve = 0;
    (input.lines || []).forEach(l => {
      if (!l) return;
      if (l.cat === 'puffer') { reserve += c(l.c); return; }
      const a = area(l.cat || 'eigen');
      a.plan += c(l.c);
      if (l.pot) a.pot += c(l.c);
      if (l.unknown) a.unknown++;
    });
    (input.payments || []).forEach(p => { if (p && p.netPaid > 0) area(p.cat || 'eigen').paid += c(p.netPaid); });
    (input.expenses || []).forEach(x => {
      if (!x || !(x.amount > 0)) return;
      const a = area(AREA[x.cat] || 'eigen');
      a.spent += c(x.amount); a.count++;
      if (input.today && x.on === input.today) a.todaySpent += c(x.amount);
    });
    const rem = remaining(phase);
    const list = Object.keys(areas).map(k => {
      const a = areas[k], pf = potForecast(a.pot, a.spent, phase);
      const forecast = (a.plan - a.pot) + (a.pot > 0 ? pf.f : a.spent);
      /* Tempo nur für Töpfe unterwegs mit Erfassung: geplant bis einschließlich heute vs. ausgegeben */
      const pace = phase && phase.phase === 'unterwegs' && a.pot > 0 && a.spent > 0
        ? { soFar: e(Math.round(a.pot * (1 - rem + 1 / Math.max(1, phase.of | 0)))), spent: e(a.spent) } : null;
      return {
        key: k, label: (input.labels && input.labels[k]) || k, plan: e(a.plan), pot: e(a.pot), paid: e(a.paid), spent: e(a.spent),
        ist: e(a.paid + a.spent), forecast: e(forecast), diff: e(forecast - a.plan), extra: e(a.pot > 0 ? 0 : a.spent),
        unknown: a.unknown, untracked: pf.untracked, todaySpent: e(a.todaySpent), count: a.count, pace
      };
    }).filter(x => x.plan || x.paid || x.spent || x.unknown)
      .sort((x, y) => (ORDER.indexOf(x.key) + 1 || 99) - (ORDER.indexOf(y.key) + 1 || 99));
    const sum = f => e(list.reduce((s, x) => s + c(x[f]), 0));
    const plan = sum('plan'), forecast = sum('forecast'), unknown = list.reduce((s, x) => s + x.unknown, 0);
    const budget = typeof input.budget === 'number' && input.budget > 0 ? input.budget : 0;
    /* Gesamtaussage: offene Preise verhindern „im Budget“ (Projektregel §11); über Budget bleibt über Budget. */
    let verdict = 'kein-budget';
    if (budget) verdict = c(forecast) > c(budget) ? 'ueber' : unknown ? 'unsicher' : 'im-budget';
    return {
      areas: list, plan, paid: sum('paid'), spent: sum('spent'), ist: sum('ist'), forecast, diff: e(c(forecast) - c(plan)),
      extra: sum('extra'), todaySpent: sum('todaySpent'), reserve: e(reserve), unknown, budget,
      left: budget ? e(c(budget) - c(forecast)) : null, verdict, remaining: rem,
      untracked: list.filter(x => x.untracked).map(x => x.key)
    };
  }

  /* Schnellerfassung: Betrag aus Texteingabe („12,50“, „12.5“, „1.234,50“). Ungültig → null, nie 0. */
  function parseQuick(s) {
    s = String(s == null ? '' : s).trim().replace(/\s|€/g, '');
    if (!s) return null;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d+(,\d{1,2})?$/.test(s)) s = s.replace(',', '.');
    else if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    const v = Number(s);
    return isFinite(v) && v > 0 && v <= 1e9 ? v : null;
  }
  /* Vorschlag für den Zahler: wer zuletzt bezahlt hat (neueste Ausgabe zuerst), sonst niemand. */
  function lastPayer(expenses, party) {
    const ids = new Set((party || []).map(p => p.id));
    const list = (expenses || []).filter(x => x && x.paidBy && ids.has(x.paidBy) && DATE.test(x.on));
    if (!list.length) return null;
    return list.reduce((best, x, i) => (!best || x.on > best.x.on || (x.on === best.x.on && i > best.i)) ? { x, i } : best, null).x.paidBy;
  }

  return { AREA, ORDER, remaining, potForecast, compare, parseQuick, lastPayer };
});
