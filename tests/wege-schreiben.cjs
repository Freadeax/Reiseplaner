/* Wege, zweiter Schritt (docs/WEGE.md): kürzere Reihenfolge als Vorschlag (nur Punkte ohne Uhrzeit, Buchung, Fixpunkt,
   innerhalb der Tageszeit), Tagesroute in der Reise speichern (Format 5 dayRoutes, nach Bestätigung), gespeicherte Route
   für andere Geräte, Reisemappe. Node-Test mit index.html, Netz nachgebildet. Kein Browser-/iPhone-Test. */
process.env.TZ = 'Europe/Berlin';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const base = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
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

const ULM = { lat: 48.3984, lon: 9.9916 };
/* Unterkunft Ulm; A weit im Westen (Blaubeuren), B nah (Wiblingen), C wieder Westen (Herrlingen): A, B, C ist ein Zickzack */
const P = { A: { lat: 48.4167, lon: 9.7850 }, B: { lat: 48.3617, lon: 9.9862 }, C: { lat: 48.4000, lon: 9.8800 }, D: { lat: 48.3990, lon: 10.0100 } };
function trip(a) {
  const t = a.newTrip({ nights: 2, dest: 'Ulm', origin: 'Göppingen', budget: 500, km: 60, travel: 'auto', title: 'Wege 2' });
  t.destGeo = Object.assign({}, ULM);
  t.customActs = Object.keys(P).map(k => ({ id: 'c' + k.toLowerCase() + 'x', custom: true, t: 'Ort ' + k, cat: 'eigen', cost: 0, per: 'pp', hours: 1, dur: 'ca. 1 Std.', geo: P[k] }));
  t.items = [['A', 'nachm'], ['B', 'nachm'], ['C', 'nachm'], ['D', 'abend']].map(([k, slot], i) => ({ uid: 'i' + i, act: 'c' + k.toLowerCase() + 'x', day: 1, slot }));
  return t;
}
let n = 0;
(async () => {
  /* 1 · Vorschlag: A, B, C → A, C, B (oder gleichwertig) spart Zeit; Abend bleibt Abend */
  {
    const { a } = makeApp();
    const t = trip(a); a.Store.put(t); const s = a.Store.get(t.id);
    const before = JSON.stringify(s), p = a.wegeOrderProposal(s, 1);
    assert(p, 'Vorschlag vorhanden'); assert(p.save >= 10, 'spart mindestens 10 Min.: ' + p.save);
    assert.equal(p.order[p.order.length - 1], 'i3', 'Abend-Punkt bleibt am Ende');
    assert.notDeepEqual(p.order, ['i0', 'i1', 'i2', 'i3']);
    assert.equal(JSON.stringify(s), before, 'Vorschlag ändert nichts');
    const c = a.wegeOrderApply(s, p);
    const after = a.sortedItems(c).filter(i => i.day === 1).map(i => i.uid);
    assert.deepEqual(after, p.order, 'Plan zeigt die neue Reihenfolge');
    assert(c.items.every(it => { const o = s.items.find(x => x.uid === it.uid); return o.slot === it.slot && o.day === it.day && o.time === it.time; }), 'Tag, Tageszeit, Uhrzeit unverändert');
    assert(a.dayWays(c, 1).min < a.dayWays(s, 1).min, 'kürzer');
    assert.equal(a.wegeOrderProposal(c, 1), null, 'danach kein weiterer Vorschlag');
    /* veralteter Vorschlag */
    const s2 = J(s); s2.items.pop();
    assert.throws(() => a.wegeOrderApply(s2, p), /geändert/);
    n++;
  }
  /* 2 · Geschützt: Uhrzeit, Fixpunkt, Buchung bleiben an ihrem Platz; unbekannte Lage = kein Vorschlag */
  {
    const { a } = makeApp();
    const t = trip(a); t.items[1].time = '15:00'; a.Store.put(t);
    let p = a.wegeOrderProposal(a.Store.get(t.id), 1);
    assert(!p || p.order.indexOf('i1') === a.sortedItems(t).filter(i => i.day === 1).map(i => i.uid).indexOf('i1'), 'Punkt mit Uhrzeit bewegt sich nicht');
    const t2 = trip(a); t2.ledger = { 'act:cbx': { status: 'gebucht', amount: 10, paid: 0 } };
    p = a.wegeOrderProposal(t2, 1);
    assert(!p || p.order.indexOf('i1') === 1, 'gebuchter Punkt bleibt');
    const t3 = trip(a); t3.items[0].fix = true;
    p = a.wegeOrderProposal(t3, 1);
    assert(!p || p.order[0] === 'i0', 'Fixpunkt bleibt');
    const t4 = trip(a); delete t4.customActs[2].geo;
    assert.equal(a.wegeOrderProposal(t4, 1), null, 'ohne bekannte Lage kein Vorschlag');
    n++;
  }
  /* 3 · Tagesroute speichern: nur nach Berechnung, Format-5-Bestätigung, gültig, für andere Geräte sichtbar */
  {
    const { a, run } = makeApp();
    const t = trip(a); a.Store.put(t);
    assert.throws(() => a.wegeStoreRoute(a.Store.get(t.id), 1, true, {}), /Zuerst die Wege berechnen/);
    const osrm = { code: 'Ok', routes: [{ distance: 60000, duration: 4200, legs: [1, 2, 3, 4, 5].map(() => ({ distance: 12000, duration: 840 })), geometry: { coordinates: [[9.99, 48.39], [9.8, 48.41]] } }] };
    await a.wegeCalc(a.Store.get(t.id), 1, { geo: async () => { throw new Error('nicht gefunden'); }, fetch: async () => ({ ok: true, json: async () => osrm }) });
    const s = a.Store.get(t.id);
    assert(a.dayWays(s, 1).osrm, 'berechnet');
    let r = a.wegeStoreRoute(s, 1, true, {});
    if (r.needsConfirm) { assert.equal(r.needsConfirm, 'format5'); r = a.wegeStoreRoute(s, 1, true, { confirmed: true }); }
    assert(r.ok, JSON.stringify(r));
    const saved = a.Store.get(t.id);
    assert.equal(saved.schemaVersion, 5);
    assert.deepEqual(saved.dayRoutes['1'].order, ['i0', 'i1', 'i2', 'i3']);
    assert.equal(saved.dayRoutes['1'].src, 'osrm'); assert(saved.dayRoutes['1'].at);
    const window5 = require('../v5logic.js'); window5.validateV5(J(saved));
    /* anderes Gerät: kein Gerätespeicher, aber gespeicherte Route liefert die Summe */
    const other = makeApp().a; const w = other.dayWays(J(saved), 1);
    assert(w.fromSaved && w.min === saved.dayRoutes['1'].min, 'anderes Gerät nutzt die gespeicherte Route');
    assert(other.wegeSection(J(saved), 1).includes('in der Reise gespeichert'));
    assert.equal(other.dayLoad(J(saved))[1].ways, saved.dayRoutes['1'].min, 'Tageslast gleich für alle');
    /* Reihenfolge geändert: Route passt nicht mehr, Schätzung gilt */
    const moved = J(saved); moved.items.reverse(); moved.items.forEach(i => { i.slot = 'nachm'; });
    const wm = other.dayWays(moved, 1);
    assert(!wm.fromSaved && wm.saved && !wm.saved.match);
    assert(other.wegeSection(moved, 1).includes('passt nicht mehr zur Reihenfolge'));
    /* entfernen */
    const r2 = a.wegeStoreRoute(a.Store.get(t.id), 1, false, {});
    assert(r2.ok); assert(!('dayRoutes' in a.Store.get(t.id)), 'leeres dayRoutes entfernt');
    n++;
  }
  /* 4 · Ohne Schreibfreigabe kein Speichern; Reisemappe zeigt Wege und Skizze */
  {
    const { a } = makeApp({ noWrite: true });
    const t = trip(a); a.Store.put(t);
    assert(!a.wegeSection(a.Store.get(t.id), 1).includes('Route in der Reise speichern'));
    const m = a.wegeMappe(a.Store.get(t.id), 1);
    assert(m.includes('Wege:') && m.includes('<svg') && m.includes('geschätzt'));
    assert.equal(a.wegeMappe(a.Store.get(t.id), 0), '', 'leerer Tag ohne Eintrag');
    n++;
  }
  console.log('Wege 2: ' + n + ' Prüfungen bestanden (kürzere Reihenfolge mit Schutz, Tagesroute speichern/entfernen mit Format-5-Bestätigung, anderes Gerät, Reisemappe). Kein Browser-/iPhone-Test, Netz nachgebildet.');
})().catch(e => { console.error(e); process.exit(1); });
