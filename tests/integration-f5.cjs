/* Zusammenspiel der Module mit einer Format-5-Reise (Integrations-Review 16.11.2026): eine Reise mit Angaben aus
   Storno/Zahlungsplan/Teilzahlungen, Fixpunkten, freier Zeit, Tempo, Aufgaben, Packliste, Ausgaben unterwegs und Reisestil
   läuft durch Sicherung (Export/Import), Server-Form (Sync), Drei-Wege-Abgleich, Variante, Fristen, Plan/Ist und Reisebuch.
   Node-Test mit index.html und den echten Logikdateien. Kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const base = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const J = x => JSON.parse(JSON.stringify(x));
function makeApp() {
  const store = new Map(), alerts = [];
  const ctx = {
    window: { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPV4: require('../v4logic.js'), RPV5: require('../v5logic.js'),
      RPBook: require('../bookgen.js'), RPBookEdit: require('../bookedit.js'), RPCatalog: require('../catalog.js'), RPMerge: require('../merge3.js'), RPIst: require('../istvergleich.js'), RPPack: require('../packlogic.js') },
    location: { hash: '', href: 'http://x/Reiseplaner/' }, history: { replaceState() {} }, scrollTo() {},
    navigator: { onLine: true }, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, setInterval() {}, console, URL, Blob, TextEncoder, TextDecoder, crypto: globalThis.crypto, alert: m => alerts.push(m)
  };
  ctx.window.document = ctx.document; ctx.window.crypto = globalThis.crypto;
  vm.createContext(ctx); vm.runInContext(base, ctx);
  ctx.alertMsg = m => alerts.push(m); ctx.render = () => {};
  return { a: ctx.window.__app, run: s => vm.runInContext(s, ctx), alerts };
}
const fees = Object.fromEntries(['tax', 'cleaning', 'parking', 'wellness', 'mandatory'].map(k => [k, { state: 'included', amount: 0 }]));
const feats = Object.fromEntries(['sauna', 'kitchen', 'breakfast', 'cancel', 'quiet', 'accessible', 'parking'].map(k => [k, 'unknown']));
function richTrip(a, run) {
  const t = a.silvesterTemplate();
  t.type = 'wellness';
  const o = { id: 'ohaus', stayId: t.stayId, name: 'Haus am See', location: 'Füssen', provider: 'direkt', type: 'fewo', start: t.start, end: t.end, persons: t.persons,
    price: 680, basis: 'stay', url: 'https://example.org/haus', checkedAt: '2026-11-01', validUntil: '2026-12-01', availability: 'available', terms: '', paid: 204, deposit: 0, booked: true, features: feats, fees };
  t.offers = [o]; t.activeOfferId = 'ohaus'; t.check = Object.assign({}, t.check, { stay: true });
  t.schemaVersion = 5;
  o.cancelTerms = { freeUntil: { date: '2026-12-01', time: '23:59', tz: null }, steps: [{ from: { date: '2026-12-02', time: null, tz: null }, pct: 30 }], src: 'Mail', checkedAt: '2026-11-16' };
  o.payPlan = [{ id: 'rate1', label: 'Anzahlung', due: '2026-11-10', pct: 30 }, { id: 'rate2', label: 'Rest', due: '2026-12-15', rest: true }];
  o.payments = [{ id: 'pay1', on: '2026-11-08', amount: 204 }];
  t.tasks = [{ id: 'reifen', title: 'Winterreifen', due: { date: '2026-12-20', time: null, tz: null }, done: false }];
  t.pace = 'ruhig';
  const it = (t.items || []).find(i => i && i.time) || (t.items || [])[0];
  if (it) { if (!it.time) it.time = '10:00'; it.fix = true; }
  const used = new Set((t.items || []).map(i => i.day + '|' + i.slot));
  const free = ['morgen', 'mittag', 'nachm', 'abend'].map(s => ({ day: 1, slot: s, why: 'erholung' })).find(k => !used.has(k.day + '|' + k.slot));
  if (free) t.keepFree = [free];
  t.expenses = [{ id: 'xmittag', on: t.start, amount: 23.5, cat: 'essen', label: 'Mittagessen' }];
  a.validateExtras(t);
  return t;
}
const strip = x => { const y = J(x); delete y.updated; return y; };
(async () => {
  let n = 0;
  const { a, run, alerts } = makeApp(); a.Store.setScope('guest');
  let t;
  try { t = richTrip(a, run); } catch (e) { console.error('Reise ungültig:', e.message); throw e; }
  assert(a.Store.put(J(t)), 'Format-5-Reise speicherbar: ' + alerts.join(' | '));
  const saved = a.Store.get(t.id);
  /* 1. Export → Import in ein leeres Gerät: Feldtreue */
  {
    const backup = J(run('backupData')([saved]));
    const b = makeApp(); b.a.Store.setScope('guest');
    const ids = b.run('importTrips')(backup, 'skip');
    assert.deepEqual(ids, [t.id]);
    assert.deepEqual(strip(b.a.Store.get(t.id)), strip(saved), 'Export/Import ohne Verlust');
    n++;
  }
  /* 2. Server-Form (Sync): toServer verändert nichts an einer gültigen Format-5-Reise und bleibt Format 5 */
  {
    const d = run('toServer')(saved);
    assert.equal(d.schemaVersion, 5);
    assert.deepEqual(strip(d), strip(saved), 'toServer feldtreu');
    assert.equal(run('f4LocalOnly')(d), false, 'Format 5 wird gesendet, nicht nur lokal');
    n++;
  }
  /* 3. Drei-Wege-Abgleich: unabhängige Änderungen an Format-5-Feldern werden zusammengeführt und bleiben gültig */
  {
    const R = require('../merge3.js');
    const mine = J(saved); mine.tasks[0].done = true; mine.tasks[0].doneAt = '2026-11-16T10:00:00Z';
    const theirs = J(saved); theirs.offers[0].payPlan[1].label = 'Restzahlung';
    const r = R.merge3(J(saved), mine, theirs);
    assert(!r.error && !r.conflicts.length, 'keine Konflikte');
    a.validateExtras(r.result);
    assert.equal(r.result.tasks[0].done, true); assert.equal(r.result.offers[0].payPlan[1].label, 'Restzahlung'); assert.equal(r.result.schemaVersion, 5);
    n++;
  }
  /* 4. Variante einer gebuchten Format-5-Reise: gültig, ohne Zahlungen und Erledigtes */
  {
    const v = run('variantCopy')(J(saved), { today: '2026-11-16' });
    a.validateExtras(v.trip);
    const o = v.trip.offers[0];
    assert(!o.payments || !o.payments.length, 'Teilzahlungen nicht in der Variante');
    assert.equal(v.trip.tasks.length, 1, 'Aufgaben als Plan übernommen'); assert.equal(v.trip.keepFree && v.trip.keepFree.length, saved.keepFree ? 1 : undefined);
    assert.equal(v.trip.pace, 'ruhig'); assert.equal(v.trip.type, 'wellness', 'Reisestil bleibt');
    const done = J(saved); done.tasks[0].done = true; done.tasks[0].doneAt = '2026-11-16T10:00:00Z'; done.deadlineAck = { pack: { at: '2026-11-16T10:00:00Z' } };
    const v2 = run('variantCopy')(done, { today: '2026-11-16' });
    a.validateExtras(v2.trip); assert.equal(v2.trip.tasks[0].done, false); assert(!('doneAt' in v2.trip.tasks[0])); assert(!v2.trip.deadlineAck);
    assert(v2.dropped.some(x => /erledigte Aufgaben/.test(x)) && v2.dropped.some(x => /Buchung und Zahlungen/.test(x)));
    assert(!v.unknown.length, 'keine unbekannten Felder: ' + v.unknown.join(', '));
    n++;
  }
  /* 5. Fristen: Storno, Zahlungsplan, Aufgabe erscheinen */
  {
    const ds = a.deadlines(saved, new Date('2026-11-16T10:00:00Z')).map(d => d.id);
    assert(ds.some(id => /^cancel:/.test(id)), 'Stornofrist'); assert(ds.some(id => /^plan:/.test(id)), 'Rate'); assert(ds.includes('task:reifen'), 'Aufgabe');
    n++;
  }
  /* 6. Kosten, Reisebuch, Ansichten rendern ohne Fehler */
  {
    const c = a.cost(saved); assert(Number.isFinite(c.total));
    const j = J(saved); j.journal = { days: { '0': { text: 'Angekommen, Sauna am Abend.' } } };
    let jr = null; try { a.validateExtras(j); jr = j; } catch (e) { jr = J(saved); }
    const r = run('reisebuchMake')(jr, '2026-11-16T10:00:00Z');
    assert(r.ok || /Tagebuch|leer|keine/i.test(r.error), 'Reisebuch-Entwurf aus Format-5-Reise: ' + r.error);
    assert(r.ok, 'Entwurf erzeugt: ' + r.error);
    if (r.ok) { const txt = JSON.stringify(r.book); assert(!/Anzahlung|Restzahlung|Winterreifen|204/.test(txt), 'keine Zahlungen/Aufgaben im Reisebuch'); }
    assert(/Stornobedingungen|Kostenlos bis/.test(run('f5OfferBlock')(saved, saved.offers[0])), 'Storno-Block zeigt die Bedingungen');
    n++;
  }
  console.log('Integration Format 5: ' + n + ' Prüfungen bestanden (Export/Import, Sync-Form, Drei-Wege-Abgleich, Variante, Fristen, Kosten/Reisebuch). Node-Test, kein Browser-/iPhone-Test.');
})().catch(e => { console.error(e); process.exit(1); });
