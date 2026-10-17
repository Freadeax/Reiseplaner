/* Reiseplaner · Mitreisende, Ausgaben unterwegs und Aufteilung (Datenvertrag v3 §3/§5/§7/§9, docs/SCHEMA_V3.md; Paket P0.2a).
   Reine Regeln ohne DOM und Speicher:
   - Prüfung von t.party, t.expenses, ledger[key].paidBy und offers[i].paidBy (Grenzen, IDs, Cent, Referenzen, __proto__).
   - Cent-Verteilung nach dem Verfahren des größten Rests, Salden je Person (Summe exakt 0), Ausgleichsvorschlag mit
     möglichst wenig Überweisungen (größter Gläubiger gegen größten Schuldner).
   - Verteilt wird nur tatsächlich geflossenes Geld: je Buchungsposten netPaid aus RPV3.cancelMath (Zahlungen minus
     erhaltene Erstattungen), je Ausgabe ihr Betrag. Noch an Anbieter offene Beträge und erwartete Erstattungen stehen
     getrennt und gehen nicht in den Personenausgleich ein. Keine zweite Kosten- oder Stornorechnung.
   - Ein DOM-freier Bestätigungs-Controller im Muster von v3editor.js (Entwurf → Vorschau → ausdrückliche Übernahme).
   Geld intern in Cent, nach außen Euro. UMD: window.RPV3S im Browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./v3logic.js'));
  else root.RPV3S = factory(root.RPV3);
})(typeof self !== 'undefined' ? self : this, function (V) {
  'use strict';
  const ID = /^[a-z][a-z0-9]{3,40}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
  const LIMITS = Object.freeze({ party: 20, expenses: 2000, name: 40, label: 80, weightMin: 1, weightMax: 100 });
  /* Schlüssel wie COSTCAT der App, soweit die Bedeutung passt (später Vergleich Plan ↔ tatsächlich je Bereich).
     Unterkunft und Buchungsposten gibt es hier bewusst nicht: deren Zahlung läuft über das Buchungsbuch (paidBy). */
  const CATS = Object.freeze({ essen: 'Essen & Trinken', einkauf: 'Einkauf & Vorräte', anreise: 'Fahrt, Tanken & Parken', ausflug: 'Eintritt & Ausflüge', wellness: 'Wellness', genuss: 'Genuss & Feiern', eigen: 'Sonstiges' });
  const EXPENSE_KEYS = ['id', 'on', 'label', 'amount', 'cat', 'paidBy', 'split'];

  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = o => JSON.parse(JSON.stringify(o));
  const plain = o => { if (!o || typeof o !== 'object' || Array.isArray(o)) return false; const p = Object.getPrototypeOf(o); return p === null || Object.getPrototypeOf(p) === null; };
  function fail(msg) { throw new Error(msg); }
  function onlyKeys(o, keys, what) { Object.keys(o).forEach(k => { if (keys.indexOf(k) < 0) fail(what + ': unbekanntes Feld „' + k + '“.'); }); }
  function validDate(s) { if (typeof s !== 'string' || !DATE.test(s)) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; }
  const cents = v => Math.round(v * 100);
  const euro = c => Math.round(c) / 100;
  function logic() { if (!V || typeof V.cancelMath !== 'function') fail('Die Storno- und Erstattungsregeln (v3logic.js) konnten nicht geladen werden.'); return V; }
  const nonEmpty = v => v != null && !(Array.isArray(v) && !v.length) && !(plain(v) && !Object.keys(v).length);
  const EUR = typeof Intl !== 'undefined' ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }) : null;
  /* Anzeige mit Cent; null/undefiniert bleibt „unbekannt“, nie 0 € */
  function fmt(v) { if (typeof v !== 'number' || !isFinite(v)) return 'unbekannt'; return EUR ? EUR.format(v) : v.toFixed(2).replace('.', ',') + ' €'; }

  /* Geld: endlich, 0 < x ≤ 1e9, höchstens 2 Nachkommastellen (SCHEMA_V3 §0.3). Eine Ausgabe ohne Betrag gibt es nicht. */
  function positiveMoney(v, what) {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0 || v > 1e9) fail(what + ': Betrag muss größer als 0 und höchstens 1 Milliarde Euro sein.');
    if (Math.abs(Math.round(v * 100) - v * 100) > 1e-6) fail(what + ': höchstens zwei Nachkommastellen.');
    return v;
  }
  function personName(v, what) {
    if (typeof v !== 'string') fail(what + ': Name fehlt.');
    const s = v.trim();
    if (!s) fail(what + ': Name fehlt.');
    if (v.length > LIMITS.name) fail(what + ': Name höchstens ' + LIMITS.name + ' Zeichen.');
    return s;
  }

  /* ---------- Prüfung (SCHEMA_V3 §3, §5) ---------- */
  function validateParty(party) {
    if (party == null) return [];
    if (!Array.isArray(party)) fail('Mitreisende: ungültige Liste.');
    if (party.length > LIMITS.party) fail('Mitreisende: höchstens ' + LIMITS.party + ' Personen.');
    const ids = new Set();
    party.forEach((p, i) => {
      const w = 'Mitreisende Person ' + (i + 1);
      if (!plain(p)) fail(w + ': ungültig.');
      onlyKeys(p, ['id', 'name'], w);
      if (typeof p.id !== 'string' || !ID.test(p.id)) fail(w + ': ungültige ID.');
      if (ids.has(p.id)) fail(w + ': doppelte ID.');
      ids.add(p.id);
      personName(p.name, w);
    });
    return party;
  }
  function validateSplit(s, ids, what) {
    if (s == null) return null;
    if (!plain(s)) fail(what + ': Aufteilung ungültig.');
    onlyKeys(s, ['among', 'mode', 'shares'], what + ' Aufteilung');
    if (!Array.isArray(s.among) || !s.among.length || s.among.length > LIMITS.party) fail(what + ': mindestens eine beteiligte Person nötig.');
    const seen = new Set();
    s.among.forEach(id => {
      if (typeof id !== 'string' || !ids.has(id)) fail(what + ': Aufteilung verweist auf eine unbekannte Person.');
      if (seen.has(id)) fail(what + ': Person doppelt in der Aufteilung.');
      seen.add(id);
    });
    if (s.mode !== 'equal' && s.mode !== 'shares') fail(what + ': Aufteilungsart unbekannt.');
    if (s.mode === 'equal') { if (s.shares != null) fail(what + ': Gewichte nur bei Aufteilung nach Gewichten.'); return s; }
    if (!plain(s.shares)) fail(what + ': Gewichte fehlen.');
    const keys = Object.keys(s.shares);
    if (keys.length !== s.among.length || keys.some(k => !seen.has(k))) fail(what + ': Gewichte passen nicht zu den beteiligten Personen.');
    s.among.forEach(id => {
      const n = s.shares[id];
      if (!own(s.shares, id) || !Number.isInteger(n) || n < LIMITS.weightMin || n > LIMITS.weightMax) fail(what + ': Gewichte sind ganze Zahlen von ' + LIMITS.weightMin + ' bis ' + LIMITS.weightMax + '.');
    });
    return s;
  }
  function validateExpenses(list, ids) {
    if (list == null) return [];
    if (!Array.isArray(list)) fail('Ausgaben: ungültige Liste.');
    if (list.length > LIMITS.expenses) fail('Ausgaben: höchstens ' + LIMITS.expenses + ' Einträge.');
    const seen = new Set();
    list.forEach((x, i) => {
      const w = 'Ausgabe ' + (i + 1);
      if (!plain(x)) fail(w + ': ungültig.');
      onlyKeys(x, EXPENSE_KEYS, w);
      if (typeof x.id !== 'string' || !ID.test(x.id)) fail(w + ': ungültige ID.');
      if (seen.has(x.id) || ids.has(x.id)) fail(w + ': doppelte ID.');
      seen.add(x.id);
      if (!validDate(x.on)) fail(w + ': Datum ungültig.');
      if (typeof x.label !== 'string' || !x.label.trim() || x.label.length > LIMITS.label) fail(w + ': Bezeichnung fehlt oder ist länger als ' + LIMITS.label + ' Zeichen.');
      positiveMoney(x.amount, w);
      if (typeof x.cat !== 'string' || !own(CATS, x.cat)) fail(w + ': Kategorie unbekannt.');
      if (x.paidBy != null && (typeof x.paidBy !== 'string' || !ids.has(x.paidBy))) fail(w + ': Zahler ist keine der Mitreisenden.');
      validateSplit(x.split, ids, w);
    });
    return list;
  }
  function payerRef(e, ids, what) {
    if (!e || typeof e !== 'object' || e.paidBy == null) return;
    if (typeof e.paidBy !== 'string' || !ids.has(e.paidBy)) fail(what + ': Zahler ist keine der Mitreisenden.');
  }
  /* Ganze Prüfung der §3-Felder einer Reise. Personen, auf die noch etwas verweist, können dadurch nicht verschwinden. */
  function validate(t) {
    if (!t || typeof t !== 'object') fail('Reise fehlt.');
    const party = validateParty(t.party), ids = new Set(party.map(p => p.id));
    validateExpenses(t.expenses, ids);
    if (plain(t.ledger)) Object.keys(t.ledger).forEach(k => payerRef(t.ledger[k], ids, 'Buchungsbuch ' + k));
    if (Array.isArray(t.offers)) t.offers.forEach((o, i) => payerRef(o, ids, 'Angebot ' + (o && o.name ? o.name : i + 1)));
    return true;
  }
  /* Nutzt die Reise §3 überhaupt? (für Anzeige; Formatentscheidung bleibt RPV3.needsV3) */
  function hasData(t) {
    if (!t) return false;
    if (nonEmpty(t.party) || nonEmpty(t.expenses)) return true;
    const entries = (plain(t.ledger) ? Object.keys(t.ledger).map(k => t.ledger[k]) : []).concat(Array.isArray(t.offers) ? t.offers : []);
    return entries.some(e => e && e.paidBy != null);
  }

  /* ---------- Rechnen (SCHEMA_V3 §3) ---------- */
  /* Größter Rest: zuerst floor(betrag × w / W), dann je 1 Cent an die größten Reste, bei Gleichstand in der Reihenfolge der Liste.
     Ganzzahlig gerechnet, damit kein Cent durch Gleitkomma verloren geht. */
  function distribute(total, weights) {
    if (!Number.isSafeInteger(total) || total < 0) fail('Verteilung: Betrag ungültig.');
    if (!Array.isArray(weights) || !weights.length || weights.some(w => !Number.isInteger(w) || w < 1)) fail('Verteilung: Gewichte ungültig.');
    const W = weights.reduce((s, w) => s + w, 0);
    const parts = weights.map(w => (total * w - (total * w) % W) / W);
    const rest = weights.map((w, i) => ({ i, r: (total * w) % W })).sort((a, b) => b.r - a.r || a.i - b.i);
    const left = total - parts.reduce((s, x) => s + x, 0);
    for (let k = 0; k < left; k++) parts[rest[k].i] += 1;
    return parts;
  }
  /* Ohne Regel gilt equal über alle Mitreisenden (in Listenreihenfolge). */
  function splitOf(x, party) {
    const s = x && x.split;
    if (s == null) return { among: party.map(p => p.id), weights: party.map(() => 1), mode: 'equal', implicit: true };
    return { among: s.among.slice(), weights: s.mode === 'shares' ? s.among.map(id => s.shares[id]) : s.among.map(() => 1), mode: s.mode, implicit: false };
  }
  /* Ausgleichsvorschlag: größter Gläubiger gegen größten Schuldner, Gleichstand nach Reihenfolge der Mitreisenden.
     Jeder Schritt bringt mindestens eine Person auf 0, daher höchstens n − 1 Überweisungen. Wird nie gespeichert. */
  function suggestTransfers(list) {
    const cred = list.filter(x => x.balance > 0).map(x => ({ id: x.id, v: x.balance }));
    const debt = list.filter(x => x.balance < 0).map(x => ({ id: x.id, v: -x.balance }));
    const out = [];
    for (;;) {
      let c = null, d = null;
      cred.forEach(x => { if (x.v > 0 && (!c || x.v > c.v)) c = x; });
      debt.forEach(x => { if (x.v > 0 && (!d || x.v > d.v)) d = x; });
      if (!c || !d) break;
      const a = Math.min(c.v, d.v);
      out.push({ from: d.id, to: c.id, cents: a });
      c.v -= a; d.v -= a;
      if (out.length > list.length) fail('Interner Rechenfehler im Ausgleich.');
    }
    return out;
  }
  /* input: {party, expenses, postings}. postings kommen von der App (Buchungsbuch und Angebote):
     {key, label, entry, planCost, detached}. entry ist der gespeicherte Eintrag (paid, refunds, cancel, paidBy),
     planCost der Betrag ohne Storno wie in der App (financeEntry), null = unbekannt. detached = nicht mehr im Plan. */
  function settle(input) {
    const party = (input && input.party) || [], expenses = (input && input.expenses) || [], postings = (input && input.postings) || [];
    const people = new Map();
    party.forEach(p => people.set(p.id, { id: p.id, name: p.name, paid: 0, share: 0 }));
    const order = party.map(p => p.id), flows = [], unassigned = [], unknownOpen = [], detached = [];
    let extra = 0, net = 0, providerOpen = 0, refundOpen = 0;
    function book(flow, payer, amount, among, weights) {
      const parts = distribute(amount, weights);
      people.get(payer).paid += amount;
      among.forEach((id, i) => { people.get(id).share += parts[i]; });
      flow.payer = payer;
      flow.shares = among.map((id, i) => ({ id, amount: euro(parts[i]) }));
      flows.push(flow);
    }
    expenses.forEach(x => {
      const c = cents(x.amount), s = splitOf(x, party);
      extra += c;
      const flow = { source: 'expense', id: x.id, label: x.label, amount: euro(c) };
      if (x.paidBy == null || !people.has(x.paidBy) || !s.among.length || s.among.some(id => !people.has(id))) { unassigned.push(Object.assign(flow, { reason: x.paidBy == null ? 'payer' : 'party' })); return; }
      book(flow, x.paidBy, c, s.among, s.weights);
    });
    postings.forEach(p => {
      const e = p.entry || {}, m = logic().cancelMath(e, p.planCost), n = cents(m.netPaid);
      net += n;
      /* Offene Beträge je Posten, ohne Verrechnung. Entfernte Posten ohne Storno werden nur als Hinweis geführt. */
      if (p.detached && !e.cancel) { if (n > 0) detached.push({ key: p.key, label: p.label, netPaid: euro(n) }); }
      else if (m.unknown) unknownOpen.push({ key: p.key, label: p.label });
      else { providerOpen += cents(m.open || 0); refundOpen += cents(m.refundOpen || 0); }
      if (n <= 0) return;
      const flow = { source: 'posting', key: p.key, label: p.label, amount: euro(n) };
      if (e.paidBy == null || !people.has(e.paidBy)) { unassigned.push(Object.assign(flow, { reason: e.paidBy == null ? 'payer' : 'party' })); return; }
      book(flow, e.paidBy, n, order, order.map(() => 1));
    });
    const persons = order.map(id => { const x = people.get(id); return { id, name: x.name, paidC: x.paid, shareC: x.share, balanceC: x.paid - x.share }; });
    if (persons.reduce((s, x) => s + x.balanceC, 0) !== 0) fail('Interner Rechenfehler: Salden ergeben nicht 0.');
    const transfers = suggestTransfers(persons.map(x => ({ id: x.id, balance: x.balanceC }))).map(x => ({ from: x.from, to: x.to, amount: euro(x.cents) }));
    return {
      persons: persons.map(x => ({ id: x.id, name: x.name, paid: euro(x.paidC), share: euro(x.shareC), balance: euro(x.balanceC) })),
      transfers, flows, unassigned,
      unassignedAmount: euro(unassigned.reduce((s, x) => s + cents(x.amount), 0)),
      extraSpent: euro(extra), netPaidTotal: euro(net),
      open: { provider: euro(providerOpen), refunds: euro(refundOpen), unknown: unknownOpen },
      detached
    };
  }

  /* ---------- Personen entfernen (SCHEMA_V3 §3: mit Zahlungen oder Anteilen nicht löschbar) ---------- */
  /* Liefert jede Stelle, an der die Person zahlt oder beteiligt ist. Beteiligt ist sie auch implizit: bei Ausgaben ohne
     eigene Regel und bei bezahlten Buchungen mit Zahler (Aufteilung gleich über alle). Entfernen würde dort Anteile verschieben. */
  function personUses(t, id) {
    const uses = [];
    (Array.isArray(t.expenses) ? t.expenses : []).forEach(x => {
      if (x.paidBy === id) uses.push({ kind: 'expense-payer', id: x.id, label: x.label });
      else if (x.split && Array.isArray(x.split.among) && x.split.among.indexOf(id) >= 0) uses.push({ kind: 'expense-share', id: x.id, label: x.label });
      else if (!x.split && x.paidBy != null) uses.push({ kind: 'expense-share', id: x.id, label: x.label });
    });
    const entries = (plain(t.ledger) ? Object.keys(t.ledger).map(k => ({ key: 'ledger:' + k, e: t.ledger[k] })) : [])
      .concat((Array.isArray(t.offers) ? t.offers : []).map(o => ({ key: 'offer:' + o.id, e: o, label: o.name })));
    entries.forEach(x => {
      if (!x.e || typeof x.e !== 'object' || x.e.paidBy == null) return;
      if (x.e.paidBy === id) uses.push({ kind: 'posting-payer', key: x.key, label: x.label || x.key });
      else if (logic().cancelMath(x.e, null).netPaid > 0) uses.push({ kind: 'posting-share', key: x.key, label: x.label || x.key });
    });
    return uses;
  }
  function usesText(uses) {
    const n = k => uses.filter(u => u.kind === k).length, out = [];
    if (n('expense-payer')) out.push('hat ' + n('expense-payer') + ' Ausgabe(n) bezahlt');
    if (n('expense-share')) out.push('ist an ' + n('expense-share') + ' Ausgabe(n) beteiligt');
    if (n('posting-payer')) out.push('ist Zahler bei ' + n('posting-payer') + ' Buchung(en)');
    if (n('posting-share')) out.push('trägt Anteile an ' + n('posting-share') + ' bezahlten Buchung(en)');
    return out;
  }

  /* ---------- Eingaben (Dezimalkomma) ---------- */
  const str = v => v == null ? '' : typeof v === 'string' || typeof v === 'number' ? String(v).trim() : fail('Ungültige Eingabe.');
  const checked = v => v === true || v === 'true' || v === 'on' || v === '1';
  function parseAmount(v) {
    const s = str(v);
    if (!s) fail('Bitte einen Betrag eintragen. Ein unbekannter Betrag ist keine Ausgabe.');
    if (!/^\d{1,10}(?:[.,]\d{1,2})?$/.test(s)) fail('Betrag ohne Tausendertrennzeichen mit höchstens zwei Nachkommastellen eingeben, z. B. 12,50.');
    const n = Math.round(Number(s.replace(',', '.')) * 100) / 100;
    if (!(n > 0) || n > 1e9) fail('Der Betrag muss größer als 0 und höchstens 1 Milliarde Euro sein.');
    return n;
  }
  function parseWeight(v, name) {
    const s = str(v);
    if (!/^\d{1,3}$/.test(s) || +s < LIMITS.weightMin || +s > LIMITS.weightMax) fail('Gewicht für ' + name + ': ganze Zahl von ' + LIMITS.weightMin + ' bis ' + LIMITS.weightMax + '.');
    return +s;
  }
  function cleanName(v, party, exceptId) {
    const s = str(v).replace(/\s+/g, ' ');
    if (!s) fail('Bitte einen Namen eintragen.');
    if (s.length > LIMITS.name) fail('Name höchstens ' + LIMITS.name + ' Zeichen.');
    const low = s.toLocaleLowerCase('de');
    if ((party || []).some(p => p.id !== exceptId && String(p.name).trim().toLocaleLowerCase('de') === low)) fail('„' + s + '“ gibt es schon. Bitte unterscheidbar benennen, z. B. mit Initiale.');
    return s;
  }
  /* Formularwerte → Ausgabe. Felder: on, label, amount, cat, paidBy ('' = unbekannt), mode, in.<id> (bool), w.<id>.
     Mit Mitreisenden wird die Aufteilung ausdrücklich gespeichert, damit später hinzukommende Personen alte Ausgaben nicht mittragen. */
  function readExpense(f, party, base) {
    f = f || {}; party = party || [];
    const on = str(f.on);
    if (!validDate(on)) fail('Bitte ein gültiges Datum wählen.');
    const label = str(f.label).replace(/\s+/g, ' ');
    if (!label) fail('Bitte eintragen, wofür das Geld ausgegeben wurde.');
    if (label.length > LIMITS.label) fail('Bezeichnung höchstens ' + LIMITS.label + ' Zeichen.');
    const amount = parseAmount(f.amount);
    const cat = str(f.cat) || 'eigen';
    if (!own(CATS, cat)) fail('Kategorie unbekannt.');
    const payer = str(f.paidBy) || null;
    if (payer && !party.some(p => p.id === payer)) fail('Der Zahler gehört nicht zu den Mitreisenden.');
    let split = null;
    if (party.length) {
      const among = party.filter(p => checked(f['in.' + p.id])).map(p => p.id);
      if (!among.length) fail('Mindestens eine Person für die Aufteilung auswählen.');
      const mode = str(f.mode) || 'equal';
      if (mode !== 'equal' && mode !== 'shares') fail('Aufteilungsart unbekannt.');
      split = { among, mode };
      if (mode === 'shares') { split.shares = {}; party.filter(p => among.indexOf(p.id) >= 0).forEach(p => { split.shares[p.id] = parseWeight(f['w.' + p.id], p.name); }); }
    }
    return { id: base && base.id, on, label, amount, cat, paidBy: payer, split };
  }

  /* ---------- Änderungen an einer (bereits kopierten) Kandidatenreise ---------- */
  function mutate(c, action, a) {
    a = a || {};
    const party = Array.isArray(c.party) ? c.party.slice() : [];
    const list = Array.isArray(c.expenses) ? c.expenses.slice() : [];
    const person = id => { const p = party.find(x => x.id === id); if (!p) fail('Diese Person gibt es in der Reise nicht mehr.'); return p; };
    if (action === 'person-add') {
      if (party.length >= LIMITS.party) fail('Höchstens ' + LIMITS.party + ' Mitreisende.');
      if (typeof a.id !== 'string' || !ID.test(a.id)) fail('Ungültige ID.');
      party.push({ id: a.id, name: cleanName(a.name, party, null) });
      c.party = party;
    } else if (action === 'person-rename') {
      const p = person(a.id);
      p.name = cleanName(a.name, party, a.id);
      c.party = party.map(x => x.id === a.id ? { id: x.id, name: p.name } : x);
    } else if (action === 'person-remove') {
      const p = person(a.id), u = usesText(personUses(c, a.id));
      if (u.length) fail(p.name + ' kann nicht entfernt werden: ' + u.join(', ') + '. Umbenennen ist möglich.');
      c.party = party.filter(x => x.id !== a.id);
    } else if (action === 'expense-put') {
      const x = a.expense, i = list.findIndex(e => e.id === x.id);
      if (a.add) { if (i >= 0) fail('Doppelte ID.'); if (list.length >= LIMITS.expenses) fail('Höchstens ' + LIMITS.expenses + ' Ausgaben je Reise.'); list.push(x); }
      else { if (i < 0) fail('Diese Ausgabe gibt es nicht mehr.'); list[i] = x; }
      c.expenses = list;
    } else if (action === 'expense-remove') {
      const i = list.findIndex(e => e.id === a.id);
      if (i < 0) fail('Diese Ausgabe gibt es nicht mehr.');
      list.splice(i, 1);
      c.expenses = list;
    } else fail('Unbekannte Änderung.');
    return c;
  }
  /* Zahler eines Buchungsbuch-Eintrags oder Angebots setzen bzw. entfernen; alle anderen Felder bleiben unberührt. */
  function setPayer(entry, id, party) {
    if (!entry || typeof entry !== 'object') fail('Posten nicht gefunden.');
    if (id == null || id === '') { delete entry.paidBy; return entry; }
    if (typeof id !== 'string' || !(party || []).some(p => p.id === id)) fail('Der Zahler gehört nicht zu den Mitreisenden.');
    entry.paidBy = id;
    return entry;
  }

  /* ---------- Bestätigungs-Controller (Muster v3editor.js) ----------
     api: {candidate(t, action, target, fields, newId) → geprüfte Kandidatenreise, preview(t, next, state) → HTML, check?(t, action, target)}
     hooks: {getTrip, scope, enabled, canEdit, newId(action, t), put(t) → true}. Speichern nur mit aktuellem Vorschautoken,
     frischem Quellstand, gleichem Speicherbereich, Schreibrecht und Freischaltung. */
  const ACTIONS = ['person-add', 'person-rename', 'person-remove', 'expense-add', 'expense-edit', 'expense-remove', 'payer'];
  function createEditor(api, hooks) {
    let draft = null, serial = 0, busy = false;
    function current() {
      if (!draft) fail('Dieser Entwurf ist nicht mehr geöffnet.');
      if (!hooks.enabled()) fail('Die Bearbeitung von Format 3 ist noch nicht freigegeben.');
      const t = hooks.getTrip(draft.tripId);
      if (!t || draft.scope !== hooks.scope() || draft.source !== JSON.stringify(t)) fail('Die Reise oder der Speicherbereich hat sich geändert. Bitte den Entwurf erneut öffnen.');
      if (!hooks.canEdit(t)) fail('Die Reise ist nicht mehr zum Bearbeiten freigegeben.');
      return t;
    }
    function state() {
      return draft ? { token: draft.token, tripId: draft.tripId, action: draft.action, target: draft.target == null ? null : clone(draft.target), newId: draft.newId,
        phase: draft.candidate ? 'preview' : 'edit', fields: clone(draft.fields), preview: draft.preview } : null;
    }
    function guard() { if (busy) fail('Speichern läuft bereits.'); }
    function begin(tripId, action, target) {
      guard();
      if (ACTIONS.indexOf(action) < 0) fail('Unbekannte Aktion.');
      if (!hooks.enabled()) fail('Die Bearbeitung von Format 3 ist noch nicht freigegeben.');
      const t = hooks.getTrip(tripId);
      if (!t || !hooks.canEdit(t)) fail('Die Reise ist nicht zum Bearbeiten freigegeben.');
      if (api.check) api.check(t, action, target);
      draft = { tripId, scope: hooks.scope(), source: JSON.stringify(t), action, target: target == null ? null : clone(target),
        newId: /-add$/.test(action) ? hooks.newId(action, t) : null, fields: {}, candidate: null, preview: '', token: ++serial };
      return state();
    }
    function preview(fields) {
      guard();
      const t = current();
      /* Eine fehlgeschlagene neue Vorschau darf keinen alten Kandidaten freigeben. */
      draft.candidate = null; draft.preview = ''; draft.fields = clone(fields || {}); draft.token = ++serial;
      const next = api.candidate(t, draft.action, draft.target == null ? null : clone(draft.target), clone(draft.fields), draft.newId);
      if (!next || next.id !== t.id) fail('Die geprüfte Änderung gehört zu einer anderen Reise.');
      const html = String(api.preview(t, next, state()));
      draft.candidate = clone(next); draft.preview = html;
      return state();
    }
    function apply(token) {
      guard();
      current();
      if (!draft.candidate || draft.token !== token) fail('Bitte die aktuelle Änderung zuerst prüfen.');
      busy = true;
      try {
        /* Nie den privaten Vorschaukandidaten selbst an den Speicher geben. */
        if (hooks.put(clone(draft.candidate)) !== true) fail('Die Änderung wurde nicht gespeichert. Bitte Speicherstatus prüfen.');
        draft = null;
        return true;
      } finally { busy = false; }
    }
    function back() { guard(); current(); draft.candidate = null; draft.preview = ''; draft.token = ++serial; return state(); }
    function close() { guard(); draft = null; serial++; }
    return { begin, preview, apply, back, close, state };
  }

  return { LIMITS, CATS, ACTIONS, validate, validateParty, validateExpenses, hasData, distribute, splitOf, suggestTransfers, settle,
    personUses, usesText, parseAmount, parseWeight, cleanName, readExpense, mutate, setPayer, createEditor, fmt };
});
