/* Format 5 schreiben (Claude, 16.11.2026; SCHEMA_V5 §8 Schritt 4): f5Commit hebt nur nach Bestätigung, Feldtreue,
   Gästekarte bleibt beim Anheben gleich (G-R12), erledigt/wieder offen, Stornobedingungen mit Vorschau, Zahlungsplan,
   gebuchte Angaben bleiben geschützt, Eingabefehler mit deutschem Grund, Formulare lesen, Sperre ohne F5_WRITE.
   Node-Test mit index.html und den echten Logikdateien, Formularfelder nachgebildet. Kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.indexOf('<script src="app/format5.js"></script>') > 0, 'index.html lädt app/format5.js');
assert(/'format5'/.test(fs.readFileSync(__dirname + '/../sw.js', 'utf8')), 'Offline-Cache enthält app/format5.js');
const base = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
assert(/const F5_WRITE=true;/.test(base), 'Schreiben freigeschaltet');
const J = x => JSON.parse(JSON.stringify(x));

function makeApp(o) {
  o = o || {};
  const store = new Map(), alerts = [], form = {};
  const code = o.noWrite ? base.replace('const F5_WRITE=true;', 'const F5_WRITE=false;') : base;
  const el = id => ({ get value() { return form[id] == null ? '' : form[id]; }, textContent: '', hidden: true, focus() {} });
  const ctx = {
    window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: require('../v4logic.js'), RPV5: require('../v5logic.js'),
      RPBook: require('../bookgen.js'), RPCatalog: require('../catalog.js') },
    location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
    navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: k => k[0] === '#' && k.slice(1) in form ? el(k.slice(1)) : null, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL, Blob, TextEncoder, TextDecoder, crypto: globalThis.crypto, alert: m => alerts.push(m)
  };
  ctx.window.document = ctx.document; ctx.window.crypto = globalThis.crypto;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  ctx.alertMsg = m => alerts.push(m); ctx.render = () => {};
  const run = s => vm.runInContext(s, ctx);
  return { ctx, a: ctx.window.__app, run, form, alerts };
}
const fees = Object.fromEntries(['tax', 'cleaning', 'parking', 'wellness', 'mandatory'].map(k => [k, { state: 'included', amount: 0 }]));
const feats = Object.fromEntries(['sauna', 'kitchen', 'breakfast', 'cancel', 'quiet', 'accessible', 'parking'].map(k => [k, 'unknown']));
function bookedTrip(a, version) {
  const t = a.silvesterTemplate();
  const o = { id: 'ohaus', stayId: t.stayId, name: 'Haus am See', location: 'Füssen', provider: 'direkt', type: 'fewo', start: t.start, end: t.end, persons: t.persons,
    price: 680, basis: 'stay', url: 'https://example.org/haus', checkedAt: '2026-11-01', validUntil: '2026-12-01', availability: 'available', terms: '', paid: 204, deposit: 0, booked: true, features: feats, fees };
  t.offers = [o]; t.activeOfferId = 'ohaus'; t.check = Object.assign({}, t.check, { stay: true });
  if (version) t.schemaVersion = version;
  a.validateOffer(o); a.validateExtras(t);
  return t;
}
const TERMS = { freeUntil: { date: '2026-12-01', time: '23:59', tz: null }, steps: [{ from: { date: '2026-12-02', time: null, tz: null }, pct: 30 }], src: 'Mail', checkedAt: '2026-11-16' };
let n = 0;
(async () => {
  /* 1. Anheben nur nach Bestätigung; Feldtreue; dauerhaft Format 5 */
  for (const ver of [undefined, 3, 4]) {
    const { a, run } = makeApp(); a.Store.setScope('guest');
    const t = bookedTrip(a, ver); assert(a.Store.put(J(t)));
    const before = a.Store.get(t.id);
    const r = run('f5SetCancelTerms')(before, 'stay', J(TERMS));
    assert.equal(r.ok, false); assert.equal(r.needsConfirm, 'format5'); assert(/dauerhaft/.test(r.notice));
    assert.deepEqual(J(a.Store.get(t.id)), J(before), 'ohne Bestätigung nichts gespeichert (Format ' + (ver || 2) + ')');
    const ok = run('f5SetCancelTerms')(before, 'stay', J(TERMS), { confirmed: true });
    assert(ok.ok && ok.upgraded); const after = a.Store.get(t.id);
    assert.equal(after.schemaVersion, 5); assert.deepEqual(J(after.offers[0].cancelTerms), J(TERMS));
    const strip = x => { const y = J(x); delete y.schemaVersion; delete y.updated; delete y.offers[0].cancelTerms; return y; };
    { const x = strip(after), y = strip(before); const diff = Object.keys(Object.assign({}, x, y)).filter(k => JSON.stringify(x[k]) !== JSON.stringify(y[k])); assert.deepEqual(diff, [], "alle übrigen Angaben unverändert, Format " + (ver || 2) + ": " + diff.map(k => k + "=" + JSON.stringify(y[k]) + "→" + JSON.stringify(x[k])).join("; ")); }
    /* zweite Änderung: kein Hinweis mehr */
    const r2 = run('f5SetPayPlan')(after, [{ id: 'rate1', label: 'Anzahlung', due: '2026-11-10', pct: 30 }, { id: 'rate2', label: 'Rest', due: '2026-12-15', rest: true }]);
    assert(r2.ok && !r2.upgraded);
  }
  n++;
  /* 2. Gästekarte: bestätigte Karte wird beim Anheben übernommen, Status bleibt gleich */
  {
    const { a, run } = makeApp(); a.Store.setScope('guest');
    const t = bookedTrip(a, 4); t.cardConfirmed = true; assert(a.Store.put(J(t)));
    const st = run('stayOf')(t), costBefore = a.cost(a.Store.get(t.id)).total;
    const r = run('f5Ack')(a.Store.get(t.id), 'pack', true, { confirmed: true, now: new Date('2026-12-20T10:00:00Z') });
    assert(r.ok && r.upgraded);
    const after = a.Store.get(t.id);
    assert(st, 'Vorlage hat eine Unterkunft'); assert.equal(after.guestCards[0].status, 'enthalten', 'Karte als Eintrag übernommen');
    assert.equal(a.cost(after).total, costBefore, 'Kosten unverändert nach dem Anheben');
    assert.equal(after.deadlineAck.pack.at, '2026-12-20T10:00:00Z');
    n++;
  }
  /* 3. Erledigt / wieder offen über deadlineAck und Aufgaben; Fahrplan zeigt Knopf und Liste */
  {
    const { a, run } = makeApp(); a.Store.setScope('guest');
    const t = bookedTrip(a, 5); t.tasks = [{ id: 'reifen', title: 'Winterreifen', due: { date: '2026-12-20', time: null, tz: null }, done: false }];
    assert(a.Store.put(J(t)));
    const now = new Date('2026-11-20T10:00:00Z');
    assert(run('f5Ack')(a.Store.get(t.id), 'task:reifen', true).ok);
    assert.equal(a.Store.get(t.id).tasks[0].done, true); assert(a.Store.get(t.id).tasks[0].doneAt);
    assert.equal(a.deadlines(a.Store.get(t.id), now).find(d => d.id === 'task:reifen').state, 'done');
    assert(run('f5Ack')(a.Store.get(t.id), 'task:reifen', false).ok);
    assert.equal(a.Store.get(t.id).tasks[0].done, false); assert(!('doneAt' in a.Store.get(t.id).tasks[0]));
    assert(run('f5Ack')(a.Store.get(t.id), 'pack', true).ok);
    assert(/data-f5-act="unack" data-id="pack"/.test(run('f5DoneList')(a.Store.get(t.id), now)));
    assert(run('f5Ack')(a.Store.get(t.id), 'pack', false).ok); assert(!('deadlineAck' in a.Store.get(t.id)), 'leere Markierungen entfernt');
    assert(/data-f5-act="ack"/.test(run('f5AckButton')(a.Store.get(t.id), 'pack')));
    assert.throws(() => run('f5Ack')(a.Store.get(t.id), 'task:fehlt', true), /Aufgabe nicht gefunden/);
    n++;
  }
  /* 4. Formulare lesen: Storno und Zahlungsplan, Fehler mit Grund; Anzeige mit Vorschau */
  {
    const { a, run, form } = makeApp(); a.Store.setScope('guest');
    const t = bookedTrip(a, 5); assert(a.Store.put(J(t)));
    Object.assign(form, { 'f5-fu-date': '2026-12-01', 'f5-fu-time': '', 'f5-st-date-0': '2026-12-02', 'f5-st-kind-0': 'pct', 'f5-st-val-0': '30', 'f5-st-date-1': '2026-12-20', 'f5-st-kind-1': 'fee', 'f5-st-val-1': '500,50', 'f5-src': 'Mail Vermieter' });
    const terms = run('f5ReadCancel')();
    assert.deepEqual(J(terms.steps), [{ from: { date: '2026-12-02', time: null, tz: null }, pct: 30 }, { from: { date: '2026-12-20', time: null, tz: null }, fee: 500.5 }]);
    assert(run('f5SetCancelTerms')(a.Store.get(t.id), 'stay', terms).ok);
    const block = run('f5OfferBlock')(a.Store.get(t.id), a.Store.get(t.id).offers[0]);
    assert(/Ab .*30 % = 204,00 €/.test(block), 'Vorschau 30 % von 680 €'); assert(/Stornogebühr 500,50 €/.test(block));
    form['f5-st-val-0'] = ''; assert.throws(() => run('f5ReadCancel')(), /Stufe 1: Datum und Wert angeben/);
    form['f5-st-val-0'] = '30'; form['f5-st-date-0'] = '2026-11-30';
    assert.throws(() => run('f5SetCancelTerms')(a.Store.get(t.id), 'stay', run('f5ReadCancel')()), /muss vor der ersten Stufe liegen/, 'Prüfung aus v5logic');
    Object.assign(form, { 'f5-pp-label-0': 'Anzahlung', 'f5-pp-due-0': '2026-11-10', 'f5-pp-kind-0': 'pct', 'f5-pp-val-0': '30', 'f5-pp-label-1': 'Rest', 'f5-pp-due-1': '2026-12-15', 'f5-pp-kind-1': 'rest', 'f5-pp-val-1': '' });
    const plan = run('f5ReadPlan')(null);
    assert.deepEqual(plan.map(r => r.id), ['rate1', 'rate2']);
    assert(run('f5SetPayPlan')(a.Store.get(t.id), plan).ok);
    const b2 = run('f5OfferBlock')(a.Store.get(t.id), a.Store.get(t.id).offers[0]);
    assert(/Anzahlung.*204 €.*bezahlt/.test(b2) && /Rest.*476 €/.test(b2), 'Zahlungsplan mit exaktem Rest');
    form['f5-pp-kind-0'] = 'amount'; form['f5-pp-val-0'] = '900';
    assert.throws(() => run('f5SetPayPlan')(a.Store.get(t.id), run('f5ReadPlan')(a.Store.get(t.id).offers[0].payPlan)), /übersteigt den Preis/);
    form['f5-pp-due-1'] = ''; assert.throws(() => run('f5ReadPlan')(null), /Rate 2: Bezeichnung und Fälligkeit/);
    /* Gebuchte Angaben bleiben geschützt: Preisänderung über f5Commit abgelehnt */
    assert.throws(() => run('f5Commit')(a.Store.get(t.id), c => { c.offers[0].name = 'Anderes Haus' }), /gebucht oder bereits bezahlt/);
    /* Blätter rendern ohne Fehler */
    assert(/Stornobedingungen/.test(run('f5CancelSheet')(a.Store.get(t.id)))); assert(/Zahlungsplan/.test(run('f5PlanSheet')(a.Store.get(t.id))));
    n++;
  }
  /* 5. Ohne F5_WRITE: nichts schreibbar, keine Knöpfe; Anzeige bleibt */
  {
    const { a, run } = makeApp({ noWrite: true }); a.Store.setScope('guest');
    const t = bookedTrip(a, 5); t.offers[0].cancelTerms = J(TERMS); assert(a.Store.put(J(t)));
    assert.throws(() => run('f5Ack')(a.Store.get(t.id), 'pack', true), /noch nicht gespeichert/);
    const block = run('f5OfferBlock')(a.Store.get(t.id), a.Store.get(t.id).offers[0]);
    assert(/Kostenlos bis/.test(block) && !/data-f5-act/.test(block));
    assert.equal(run('f5AckButton')(a.Store.get(t.id), 'pack'), '');
    n++;
  }
  console.log('Format 5 schreiben: ' + n + ' Prüfungen bestanden (Anheben nur nach Bestätigung aus Format 2/3/4, Feldtreue, Gästekarte G-R12, erledigt/wieder offen, Storno- und Planformulare mit Vorschau, Prüfregeln, Buchungsschutz, Sperre ohne Schalter). Kein Browser-/iPhone-Test.');
})().catch(e => { console.error(e); process.exit(1); });
