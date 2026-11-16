/* Format 5, zweite Runde (Claude, 16.11.2026 abends): eigene Aufgaben (M02.4), Teilzahlungen einzeln (M08.2),
   Stornobedingungen für Buchungsbuch-Posten, Gästekarten-Status je Unterkunft (M09.3). Node-Test mit index.html und
   den echten Logikdateien, Formularfelder nachgebildet. Kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.indexOf('<script src="app/aufgaben.js"></script>') > 0, 'index.html lädt app/aufgaben.js');
assert(fs.readFileSync(__dirname + '/../index.html', 'utf8').includes('app/format5.js'), 'index.html bindet app/format5.js ein (Service Worker liest die Liste daraus)');
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
const party = [{ id: 'pphil', name: 'Philipp' }, { id: 'ppart', name: 'Partnerin' }];
(async () => {
  /* 1. Aufgaben: anlegen (mit Anheben), ändern, abhaken, entfernen, Fristen, Anzeige */
  {
    const { a, run } = makeApp(); a.Store.setScope('guest');
    const t = bookedTrip(a, 4); t.party = J(party); a.validateExtras(t); assert(a.Store.put(J(t)));
    const add = run('taskAdd');
    const r0 = add(a.Store.get(t.id), { title: 'Winterreifen prüfen', date: '2026-12-20', by: 'pphil' });
    assert.equal(r0.needsConfirm, 'format5', 'erste Aufgabe fragt nach der Umstellung');
    assert(add(a.Store.get(t.id), { title: 'Winterreifen prüfen', date: '2026-12-20', by: 'pphil' }, { confirmed: true }).ok);
    assert(add(a.Store.get(t.id), { title: 'Schneeketten leihen' }).ok, 'zweite ohne Nachfrage');
    let s = a.Store.get(t.id); assert.equal(s.schemaVersion, 5); assert.equal(s.tasks.length, 2);
    const [t1, t2] = s.tasks; assert(/^[a-z][a-z0-9]{3,40}$/.test(t1.id) && t1.id !== t2.id); assert.equal(t1.src, 'user');
    assert.deepEqual(J(t1.due), { date: '2026-12-20', time: null, tz: null }); assert.equal(t2.due, null);
    const now = new Date('2026-11-20T10:00:00Z');
    assert.equal(a.deadlines(s, now).find(d => d.id === 'task:' + t1.id).detail, 'zuständig: Philipp');
    assert(run('taskUpdate')(s, t1.id, { title: 'Reifen wechseln', date: '2026-12-18', time: '09:00', by: '' }).ok);
    s = a.Store.get(t.id); assert.equal(s.tasks[0].title, 'Reifen wechseln'); assert(!('by' in s.tasks[0])); assert.equal(s.tasks[0].due.time, '09:00');
    assert(run('taskToggle')(s, t2.id, true).ok); s = a.Store.get(t.id); assert(s.tasks[1].done && s.tasks[1].doneAt);
    assert.deepEqual(run('taskList')(s).map(x => x.id), [t1.id, t2.id], 'offen vor erledigt');
    assert(run('taskToggle')(s, t2.id, false).ok); s = a.Store.get(t.id); assert(!s.tasks[1].done && !('doneAt' in s.tasks[1]));
    assert.deepEqual(run('taskList')(s).map(x => x.id), [t1.id, t2.id], 'datiert vor undatiert ' + JSON.stringify(s.tasks));
    const html = run('aufgabenPanel')(s); assert(/Reifen wechseln/.test(html) && /2 offen/.test(html) && /data-task-act="new"/.test(html));
    assert(/Zuständig/.test(run('aufgabeSheet')(s, null)));
    assert.throws(() => add(s, { title: '' }), /Titel fehlt/);
    assert.throws(() => add(s, { title: 'x', time: '10:00' }), /Uhrzeit nur mit Datum/);
    assert.throws(() => add(s, { title: 'x', by: 'pxxx' }), /Person gibt es/);
    assert(run('taskRemove')(s, t1.id).ok); assert(run('taskRemove')(a.Store.get(t.id), t2.id).ok);
    assert(!('tasks' in a.Store.get(t.id)), 'leere Liste entfernt'); assert.equal(a.Store.get(t.id).schemaVersion, 5, 'bleibt Format 5');
    n++;
  }
  /* 2. Teilzahlungen: bisherige Summe wird erste Zahlung, paid = Summe, Entfernen, Raten folgen */
  {
    const { a, run } = makeApp(); a.Store.setScope('guest');
    const t = bookedTrip(a, 5); t.party = J(party); assert(a.Store.put(J(t)));
    const addP = run('f5AddPayment');
    assert.throws(() => addP(a.Store.get(t.id), { on: '2026-11-15', amount: '100' }), /Datum der bisherigen Zahlung \(204/);
    assert(addP(a.Store.get(t.id), { on: '2026-11-15', amount: '100,50', by: 'ppart', firstOn: '2026-10-20' }).ok);
    let o = a.Store.get(t.id).offers[0];
    assert.deepEqual(o.payments.map(p => [p.on, p.amount, p.by || null]), [['2026-10-20', 204, null], ['2026-11-15', 100.5, 'ppart']]);
    assert.equal(o.paid, 304.5, 'bezahlt = Summe');
    assert(addP(a.Store.get(t.id), { on: '2026-11-16', amount: '0,10' }).ok); assert.equal(a.Store.get(t.id).offers[0].paid, 304.6, 'Cent-genau');
    assert.throws(() => addP(a.Store.get(t.id), { on: '2026-11-16', amount: '0' }), /größer als 0/);
    assert.throws(() => addP(a.Store.get(t.id), { on: '', amount: '5' }), /Datum fehlt/);
    const id = a.Store.get(t.id).offers[0].payments[1].id;
    assert(run('f5RemovePayment')(a.Store.get(t.id), id).ok); o = a.Store.get(t.id).offers[0];
    assert.equal(o.paid, 204.1); assert.equal(o.payments.length, 2);
    const block = run('f5OfferBlock')(a.Store.get(t.id), o); assert(/Zahlungen/.test(block) && /data-f5-act="pay-remove"/.test(block));
    assert(/Datum dieser bisherigen Zahlung/.test(run('f5PaySheet')(Object.assign(J(t), { offers: [Object.assign(J(t.offers[0]), { payments: undefined })] }))));
    /* Gebuchte Angaben bleiben geschützt: Preis ändern weiter abgelehnt */
    assert.throws(() => run('f5Commit')(a.Store.get(t.id), c => { c.offers[0].name = 'Anders' }), /gebucht oder bereits bezahlt/);
    n++;
  }
  /* 3. Stornobedingungen für einen gebuchten Buchungsbuch-Posten */
  {
    const { a, run, form } = makeApp(); a.Store.setScope('guest');
    const t = bookedTrip(a, 5);
    t.extraCosts = [a.costEntryFromForm({ title: 'Skikurs', amount: '200' }, 'kurs')];
    a.setLedger(t, 'xc:kurs', 'status', 'gebucht'); a.setLedger(t, 'xc:kurs', 'amount', '240');
    assert(a.Store.put(J(t)));
    const s = a.Store.get(t.id);
    assert(/data-f5-act="cancel-open" data-key="xc:kurs"/.test(run('f5LedgerCancel')(s, 'xc:kurs')));
    const sheet = run('f5CancelSheet')(s, 'xc:kurs'); assert(/Skikurs/.test(sheet) && /240/.test(sheet) && /data-key="xc:kurs"/.test(sheet));
    Object.assign(form, { 'f5-fu-date': '2026-12-10', 'f5-st-date-0': '2026-12-11', 'f5-st-kind-0': 'pct', 'f5-st-val-0': '50' });
    assert(run('f5SetCancelTerms')(s, 'xc:kurs', run('f5ReadCancel')()).ok);
    const after = a.Store.get(t.id); assert.equal(after.ledger['xc:kurs'].cancelTerms.steps[0].pct, 50);
    assert.equal(after.ledger['xc:kurs'].amount, 240, 'Posten sonst unverändert');
    const now = new Date('2026-11-20T10:00:00Z');
    assert.equal(a.deadlines(after, now).find(d => d.id === 'cancel:xc:kurs:1').amount, 120, '50 % von 240 €');
    assert(/Storno heute: noch \d+ Tage kostenlos/.test(run('f5LedgerCancel')(after, 'xc:kurs')));
    /* Status ändern behält die Bedingungen */
    a.setLedger(after, 'xc:kurs', 'paid', '100'); a.Store.put(after);
    assert(a.Store.get(t.id).ledger['xc:kurs'].cancelTerms, 'setLedger behält cancelTerms');
    n++;
  }
  /* 4. Gästekarte je Unterkunft: Status mit Beleg, cardConfirmed folgt, Kosten wie bisher */
  {
    const { a, run } = makeApp(); a.Store.setScope('guest');
    const t = bookedTrip(a, 4); assert(a.Store.put(J(t)));
    const costNo = a.cost(a.Store.get(t.id)).total;
    assert(/Gästekarte: /.test(run('f5GuestCardPanel')(a.Store.get(t.id))));
    const set = run('f5SetGuestCard');
    assert.throws(() => set(a.Store.get(t.id), { status: 'enthalten' }), /Datum oder Notiz/);
    assert.equal(set(a.Store.get(t.id), { status: 'enthalten', on: '2026-11-16', note: 'Mail Gastgeber' }).needsConfirm, 'format5');
    assert(set(a.Store.get(t.id), { status: 'enthalten', on: '2026-11-16', note: 'Mail Gastgeber' }, { confirmed: true }).ok);
    let s = a.Store.get(t.id);
    assert.equal(s.cardConfirmed, true); assert.equal(s.guestCards.length, 1); assert.equal(s.guestCards[0].status, 'enthalten');
    assert.deepEqual(J(s.guestCards[0].evidence), { on: '2026-11-16', note: 'Mail Gastgeber' });
    assert.equal(run('f5GuestCard')(s).status, 'enthalten');
    const t2 = J(t); t2.cardConfirmed = true; assert.equal(a.cost(s).total, a.cost(t2).total, 'Kosten wie mit bisheriger Bestätigung');
    assert(/bestätigt am 16\.11\.2026/.test(run('f5GuestCardPanel')(s)));
    assert(set(s, { status: 'nicht', note: 'Gastgeber: keine Karte' }).ok); s = a.Store.get(t.id);
    assert.equal(s.cardConfirmed, false); assert.equal(s.guestCards.length, 1, 'ein Eintrag je Unterkunft'); assert.equal(s.guestCards[0].status, 'nicht');
    assert.equal(a.cost(s).total, costNo, 'nicht enthalten: keine Rabatte');
    assert(!a.checks(s).some(c => /Gästekarte/.test(c[1])), 'kein Hinweis „bestätigen lassen“ bei „nicht enthalten“');
    n++;
  }
  console.log('Format 5, zweite Runde: ' + n + ' Prüfungen bestanden (Aufgaben anlegen/ändern/abhaken/entfernen mit Fristen, Teilzahlungen einzeln mit Übernahme der bisherigen Summe, Storno für Buchungsbuch-Posten, Gästekarten-Status mit Beleg). Kein Browser-/iPhone-Test.');
})().catch(e => { console.error(e); process.exit(1); });
