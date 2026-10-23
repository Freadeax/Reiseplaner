/* Reisebereiche am Handy als Unterseiten (Paket 4, PLAN_IOS_APP §4.2 Abs. 2). Node-Test mit kleiner DOM- und Verlaufsattrappe.
   Teil A prüft app/unterseiten.js allein (mit app/routing.js für Bereiche und Gruppen).
   Teil B prüft das Zusammenspiel mit go() und vReise(), sobald index.html die Datei lädt (Einbindung laut pakete/unterseiten/EINBINDUNG.md).
   Kein Browser-/iPhone-Test: Wischgeste, Safari-Zurück und Darstellung sind hier nicht geprüft. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const C = x => JSON.parse(JSON.stringify(x));

/* Verlauf wie im Browser: Einträge mit Zustand, push schneidet Vorwärts-Einträge ab. */
function fakeHistory(start) {
  const h = { entries: [{ url: start || '#reisen', state: null }], i: 0,
    get state() { return this.entries[this.i].state; },
    get hash() { return this.entries[this.i].url; },
    pushState(state, _t, url) { this.entries = this.entries.slice(0, this.i + 1); this.entries.push({ url, state: C(state) }); this.i++; },
    replaceState(state, _t, url) { this.entries[this.i] = { url: url == null ? this.entries[this.i].url : url, state: state == null ? null : C(state) }; },
    back() { if (this.i > 0) this.i--; },
    urls() { return this.entries.map(e => e.url); } };
  return h;
}
function media(env) { return q => ({ matches: q === 'print' ? !!env.print : /max-width:760px/.test(q) ? env.mobile : /standalone/.test(q) ? !!env.standalone : false, addEventListener() {}, addListener() {} }); }

/* ---------- Teil A: reine Logik ---------- */
function loadPart() {
  const env = { mobile: true };
  const ctx = { console, env, window: {}, history: fakeHistory(), matchMedia: media(env),
    document: { addEventListener() {}, querySelector: () => null, documentElement: { setAttribute() {} } },
    localStorage: { getItem: () => null, setItem() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext('const esc=s=>String(s==null?"":s).replace(/[&<>"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;"}[c]));function alertMsg(){}function closeSheet(){}function render(){}function newTrip(){return {}}' +
    'function checklist(t){return [["Buchen",[["a","A"],["b","B"],["c","C"]]],["Packen",[["d","D"]]]]}', ctx);
  vm.runInContext(read('app/routing.js') + '\n' + read('app/aufbau.js') + '\n' + read('app/unterseiten.js') + '\n;this.__t={UI,TABS,AREA_GROUPS,MODULE_INFO,BEREICHE,aufbauZiel,aufbauMerken,aufbauTeile,aufbauLeiste,aufbauBereich,subParse,subRoute,subDepth,subResolve,subParent,subNavMode,subPushState,subPushChain,subBack,subBackLabel,subSeed,subFocus,subCount,subAreas,subListHtml,subHeadHtml,subSwipeDecision,subSwipeHost,subMobile,subEnv,subHistoryApply};', ctx);
  return ctx;
}
{
  const ctx = loadPart(), a = ctx.__t;
  /* Adressen: bestehende Form #r-<id>-<tab> bleibt, #r-<id> ist neu */
  assert.deepEqual(C(a.subParse('#r-t1abc-kosten')), { route: 'r-t1abc-kosten', view: 'reise', tid: 't1abc', tab: 'kosten', depth: 2, valid: true });
  assert.deepEqual(C(a.subParse('r-t1abc')), { route: 'r-t1abc', view: 'reise', tid: 't1abc', tab: null, depth: 1, valid: true });
  assert.equal(a.subParse('r-t1abc-xyz').valid, false, 'unbekannter Bereich ist nicht gültig');
  assert.equal(a.subParse('r-T1').depth, 0, 'nur Kleinbuchstaben und Ziffern wie uid()');
  assert.equal(a.subParse('r-').depth, 0);
  for (const v of ['reisen', 'neu', 'entdecken', 'heute', 'erinnerungen', 'konto']) assert.deepEqual([a.subParse(v).depth, a.subParse(v).view, a.subParse(v).valid], [0, v, true], v);
  assert.deepEqual([a.subParse('ziel-oberstdorf').view, a.subParse('ziel-oberstdorf').depth], ['entdecken', 0]);
  assert.deepEqual([a.subParse('').view, a.subParse('').valid, a.subParse('quatsch').view], ['reisen', false, 'reisen']);
  assert.equal(a.subRoute('t1', 'plan'), 'r-t1-plan'); assert.equal(a.subRoute('t1'), 'r-t1'); assert.equal(a.subRoute('t1', null), 'r-t1');
  /* Desktop: keine Übersichtsseite, alles andere unverändert */
  assert.equal(a.subResolve('r-t1', false), 'r-t1-ueber');
  assert.equal(a.subResolve('r-t1', true), 'r-t1');
  assert.equal(a.subResolve('#r-t1-plan', false), 'r-t1-plan');
  assert.equal(a.subResolve('konto', false), 'konto');
  assert.equal(a.subParent('r-t1-plan'), 'r-t1'); assert.equal(a.subParent('r-t1'), 'reisen'); assert.equal(a.subParent('heute'), null);

  /* Verlaufsart */
  const M = { mobile: true }, D = { mobile: false };
  assert.equal(a.subNavMode('reisen', 'r-t1', M), 'push', 'Regal → Reise');
  assert.equal(a.subNavMode('r-t1', 'r-t1-kosten', M), 'push', 'Übersicht → Bereich');
  assert.equal(a.subNavMode('heute', 'r-t1-plan', M), 'push', 'Heute → Tagesplan');
  assert.equal(a.subNavMode('r-t1-ueber', 'r-t1-kosten', M), 'push', 'Verweis im Überblick zu Kosten');
  assert.equal(a.subNavMode('r-t1-plan', 'r-t2-ueber', M), 'push', 'Kopie einer Reise');
  assert.equal(a.subNavMode('r-t1-plan', 'r-t1-plan', M), 'replace', 'neu zeichnen');
  assert.equal(a.subNavMode('r-t1-plan', 'r-t1', M), 'replace', 'nach oben ohne Verlauf');
  assert.equal(a.subNavMode('r-t1-plan', 'entdecken', M), 'replace', 'Tab-Leiste');
  assert.equal(a.subNavMode('reisen', 'konto', M), 'replace');
  assert.equal(a.subNavMode('', 'r-t1-plan', M), 'replace', 'erster Aufruf');
  for (const [f, t] of [['reisen', 'r-t1-ueber'], ['r-t1-ueber', 'r-t1-kosten'], ['heute', 'r-t1-plan'], ['r-t1-plan', 'reisen']]) assert.equal(a.subNavMode(f, t, D), 'replace', 'Desktop wie bisher ' + f + ' → ' + t);
  assert.equal(a.subNavMode('r-t1-plan', 'r-t1', { mobile: true, pop: true }), 'keep');
  assert.equal(a.subNavMode('r-t1-plan', 'r-t1', { mobile: false, pop: true }), 'keep');

  /* Einträge beim Hineingehen */
  assert.deepEqual(C(a.subPushChain('r-t1', 'r-t1-kosten')), [{ route: 'r-t1-kosten', state: { rp: 'sub', back: 'r-t1', depth: 2 } }]);
  assert.deepEqual(C(a.subPushChain('reisen', 'r-t1')), [{ route: 'r-t1', state: { rp: 'sub', back: 'reisen', depth: 1 } }]);
  assert.deepEqual(C(a.subPushChain('r-t1-ueber', 'r-t1-kosten')), [{ route: 'r-t1-kosten', state: { rp: 'sub', back: 'r-t1-ueber', depth: 2 } }], 'Verweis: zurück zum Überblick');
  assert.deepEqual(C(a.subPushChain('heute', 'r-t1-plan')), [{ route: 'r-t1', state: { rp: 'sub', back: 'heute', depth: 1 } }, { route: 'r-t1-plan', state: { rp: 'sub', back: 'r-t1', depth: 2 } }], 'von außen: Übersicht dazwischen');
  assert.deepEqual(C(a.subPushChain('r-t1-plan', 'r-t2-ueber')).map(x => x.route), ['r-t2', 'r-t2-ueber'], 'andere Reise');
  assert.deepEqual(C(a.subPushChain('r-t1', 'r-t2-ueber')).map(x => x.route), ['r-t2', 'r-t2-ueber']);

  /* Zurück und Beschriftung */
  assert.deepEqual(C(a.subBack('r-t1-kosten', a.subPushState('r-t1', 'r-t1-kosten'))), { kind: 'history', target: 'r-t1', label: 'Bereiche' });
  assert.deepEqual(C(a.subBack('r-t1-plan', a.subPushState('heute', 'r-t1-plan'))), { kind: 'history', target: 'heute', label: 'Heute' });
  assert.deepEqual(C(a.subBack('r-t1-kosten', a.subPushState('r-t1-ueber', 'r-t1-kosten'))), { kind: 'history', target: 'r-t1-ueber', label: 'Überblick' });
  assert.deepEqual(C(a.subBack('r-t1-kosten', null)), { kind: 'go', target: 'r-t1', label: 'Bereiche' }, 'direkter Link: eine Ebene höher');
  assert.deepEqual(C(a.subBack('r-t1-kosten', { rpScroll: 120 })), { kind: 'go', target: 'r-t1', label: 'Bereiche' }, 'fremder Zustand zählt nicht');
  assert.deepEqual(C(a.subBack('r-t1-kosten', { rp: 'sub', back: '' })), { kind: 'go', target: 'r-t1', label: 'Bereiche' });
  assert.deepEqual(C(a.subBack('r-t1', null)), { kind: 'go', target: 'reisen', label: 'Reisen' });
  assert.deepEqual(C(a.subBack('konto', null)), { kind: 'none', target: null, label: '' });
  assert.equal(a.subBackLabel('ziel-oberstdorf'), 'Entdecken');
  assert.equal(a.subBackLabel('erinnerungen'), 'Erinnerungen');
  assert.equal(a.subBackLabel('r-t1-xyz'), 'Zurück');
  assert.equal(a.subBackLabel('quatsch'), 'Zurück');

  /* Direkter Einstieg auf einer Unterseite */
  assert.deepEqual(C(a.subSeed('r-t1-kosten', null, true)), [
    { op: 'replace', route: 'reisen', state: null },
    { op: 'push', route: 'r-t1', state: { rp: 'sub', back: 'reisen', depth: 1 } },
    { op: 'push', route: 'r-t1-kosten', state: { rp: 'sub', back: 'r-t1', depth: 2 } }]);
  assert.deepEqual(C(a.subSeed('r-t1', null, true)).map(x => x.route), ['reisen', 'r-t1']);
  assert.deepEqual(C(a.subSeed('r-t1-kosten', null, false)), [], 'Desktop ohne Vorbefüllung');
  assert.deepEqual(C(a.subSeed('r-t1-kosten', { rp: 'sub', back: 'r-t1' }, true)), [], 'neu geladen: Verlauf ist schon da');
  assert.deepEqual(C(a.subSeed('heute', null, true)), []);

  /* Fokus */
  assert.equal(a.subFocus('r-t1', 'r-t1-plan', true), '#sub-title');
  assert.equal(a.subFocus('r-t1-plan', 'r-t1', true), '[data-sub-area="programm"]|#sub-title', 'nach Zurück die Zeile des verlassenen Bereichs');
  assert.equal(a.subFocus('r-t1-unternehmen', 'r-t1-plan', true), '[data-seg="plan"]|#sub-title', 'Teilleiste: Fokus bleibt auf dem gewählten Teil');
  assert.equal(a.subFocus('reisen', 'r-t1', true), '#sub-title');
  assert.equal(a.subFocus('r-t2-plan', 'r-t1', true), '#sub-title');
  assert.equal(a.subFocus('r-t1-plan', 'reisen', true), null);
  assert.equal(a.subFocus('r-t1', 'r-t1-plan', false), null, 'Desktop: Fokus wie bisher');
  assert.equal(a.subFocus('r-t1-plan', 'r-t1-plan', true), null);

  /* Bereiche: fünf aus BEREICHE (pakete/aufbau), jeder der zehn Teile genau einmal */
  const t = { id: 't1', title: 'Allgäu <Winter>', items: [{}, {}], check: { a: true, d: true } };
  const g = a.subAreas(t), rows = g.flatMap(x => x.items);
  assert.deepEqual(rows.map(i => i.key), ['ueber', 'ziel', 'programm', 'kosten', 'unterlagen']);
  assert.deepEqual(rows.flatMap(i => i.parts).sort(), a.TABS.map(x => x[0]).sort(), 'alle zehn Teile erreichbar');
  assert.deepEqual(a.AREA_GROUPS.map(x => x[0]), rows.map(i => i.label), 'Auswahlfeld folgt BEREICHE');
  assert(rows.every(i => i.label && i.hint && /^r-t1-[a-z]+$/.test(i.route)), 'Name, Kurzbeschreibung und Adresse je Bereich');
  assert.equal(rows[2].route, 'r-t1-plan', 'Programm mit Terminen öffnet den Tagesplan');
  assert.equal(a.aufbauZiel({ id: 't9', items: [] }, 'programm'), 'unternehmen', 'Programm ohne Termine öffnet die Ideen');
  a.aufbauMerken('t1', 'suche'); assert.equal(a.aufbauZiel(t, 'ziel'), 'suche', 'zuletzt benutzter Teil');
  a.aufbauMerken('t1', 'unterkunft');
  assert.equal(a.subCount(t, 'programm'), '2 Termine'); assert.equal(a.subCount({ items: [{}] }, 'programm'), '1 Termin'); assert.equal(a.subCount({}, 'programm'), '0 Termine');
  assert.equal(a.subCount(t, 'unterlagen'), '2 von 4 erledigt', 'Zähler mit Wörtern, nicht nur Zahl');
  assert.equal(a.subCount(t, 'ueber'), '');
  /* Neue Namen: Angebotsvergleich und Pakete nicht mehr verwechselbar */
  assert.deepEqual(['suche', 'angebote', 'unternehmen'].map(k => a.TABS.find(x => x[0] === k)[1]), ['Angebote vergleichen', 'Pakete', 'Ideen']);
  /* Teilleiste nur bei mehreren Teilen, aktiver Teil mit aria-current */
  assert.equal(a.aufbauTeile(t, 'kosten'), '');
  const seg = a.aufbauTeile(t, 'suche');
  assert.equal((seg.match(/class="seg"/g) || []).length, 3);
  assert(/data-go="r-t1-suche" data-seg="suche" aria-current="page"/.test(seg) && /aria-label="Teile von Ziel &amp; Unterkunft"/.test(seg));
  /* Desktop-Leiste: fünf Einträge, aktiver Bereich bleibt auf dem aktuellen Teil */
  const bar = a.aufbauLeiste(t, 'mappe');
  assert.equal((bar.match(/class="tab"/g) || []).length, 5);
  assert(/data-go="r-t1-mappe" data-bereich="unterlagen" data-sub-parts="check notiz mappe" aria-current="page"/.test(bar));
  /* Teilleiste ersetzt den Verlaufseintrag und behält das Zurück-Ziel */
  assert.equal(a.subNavMode('r-t1-unternehmen', 'r-t1-plan', M), 'swap');
  assert.equal(a.subNavMode('r-t1-plan', 'r-t1-kosten', M), 'push', 'anderer Bereich wie bisher');
  assert.equal(a.subNavMode('r-t1-unternehmen', 'r-t1-plan', D), 'replace', 'Desktop wie bisher');
  const list = a.subListHtml(t);
  assert.equal((list.match(/class="sub-row"/g) || []).length, 5);
  assert.equal((list.match(/<h2 /g) || []).length, 0, 'eine Liste ohne Gruppenüberschriften');
  assert.equal((list.match(/<button type="button"/g) || []).length, 5, 'echte Knöpfe, kein Ziehen oder Hover');
  assert(/data-go="r-t1-kosten" data-sub-area="kosten" data-sub-parts="kosten"/.test(list));
  assert(/data-sub-area="unterlagen" data-sub-parts="check notiz mappe"/.test(list));
  assert(/<span class="sub-chev" aria-hidden="true">›<\/span>/.test(list), 'Pfeil nur Schmuck');
  assert(/aria-label="Bereiche dieser Reise"/.test(list));
  const head = a.subHeadHtml(t, 'kosten', a.subBack('r-t1-kosten', a.subPushState('r-t1', 'r-t1-kosten')));
  assert(/data-sub-back aria-label="Zurück zu Bereiche"><span aria-hidden="true">‹<\/span> Bereiche<\/button>/.test(head), 'Zurück mit sichtbarem Ziel');
  assert(/<h1 id="sub-title" tabindex="-1">Kosten<\/h1>/.test(head));
  assert(head.includes('Allgäu &lt;Winter&gt;') && !head.includes('<Winter>'), 'Reisename maskiert');
  assert(!/data-sub-back/.test(a.subHeadHtml(t, 'kosten', { kind: 'none', label: '' })), 'ohne Ziel kein Zurück');
  assert(/sub-head noprint/.test(a.subHeadHtml(t, 'mappe', null)), 'Mappe druckt ohne Unterseitenkopf');

  /* Wischgeste am linken Rand */
  const sw = (x0, x1, dy, dt, width) => a.subSwipeDecision({ x0, y0: 300, x1, y1: 300 + dy, dt, width: width || 390 });
  assert.equal(sw(8, 120, 10, 300), 'back', 'weit genug');
  assert.equal(sw(8, 60, 5, 180), 'back', 'kurz, aber schnell');
  assert.equal(sw(8, 60, 5, 400), 'none', 'kurz und langsam');
  assert.equal(sw(40, 200, 0, 200), 'none', 'nicht am Rand begonnen');
  assert.equal(sw(8, 120, 80, 300), 'none', 'eher senkrecht (Scrollen)');
  assert.equal(sw(100, 10, 0, 200), 'none', 'nach links');
  assert.equal(sw(8, 200, 0, 900), 'none', 'zu lange gehalten');
  assert.equal(sw(8, 200, 0, 300, 1000), 'none', 'breites Fenster braucht 25 %');
  assert.equal(a.subSwipeDecision({ x0: NaN, y0: 0, x1: 100, y1: 0, dt: 100 }), 'none');
  assert.equal(a.subSwipeHost({ standalone: true }), true, 'Startbildschirm-App');
  assert.equal(a.subSwipeHost({ standalone: false }), false, 'Safari hat eigene Geste');
  assert.equal(a.subSwipeHost({ capacitorPlatform: 'ios' }), true);
  assert.equal(a.subSwipeHost({ capacitorPlatform: 'android' }), false);
  assert.equal(a.subSwipeHost(), false);
  ctx.env.standalone = true; assert.equal(a.subEnv().standalone, true);
  ctx.window.Capacitor = { getPlatform: () => 'ios' }; assert.equal(a.subEnv().capacitorPlatform, 'ios');
  ctx.window.Capacitor = { getPlatform: () => 'web' }; assert.equal(a.subEnv().capacitorPlatform, '');

  /* Verlauf schreiben, ohne go() */
  ctx.env.mobile = true; assert.equal(a.subMobile(), true); ctx.env.mobile = false; assert.equal(a.subMobile(), false);
  ctx.env.mobile = true; a.subMobile(); ctx.env.print = true; ctx.env.mobile = false; assert.equal(a.subMobile(), true, 'Drucken schaltet nicht um'); ctx.env.print = false; assert.equal(a.subMobile(), false);
  const H = ctx.history = fakeHistory('#r-t1-kosten');
  assert.equal(a.subHistoryApply('', 'r-t1-kosten', { mobile: true }), 'seed');
  assert.deepEqual(H.urls(), ['#reisen', '#r-t1', '#r-t1-kosten']); assert.equal(H.i, 2);
  assert.equal(a.subHistoryApply('r-t1-kosten', 'r-t1-kosten', { mobile: true }), 'replace');
  assert.deepEqual(C(H.state), { rp: 'sub', back: 'r-t1', depth: 2 }, 'neu zeichnen behält die Herkunft');
  const D2 = ctx.history = fakeHistory('#reisen');
  assert.equal(a.subHistoryApply('', 'r-t1-kosten', { mobile: false }), 'replace');
  assert.equal(a.subHistoryApply('r-t1-kosten', 'r-t1-plan', { mobile: false }), 'replace');
  assert.deepEqual(D2.urls(), ['#r-t1-plan'], 'Desktop: ein Eintrag, wie bisher');
  assert.equal(D2.state, null);
}

/* ---------- Teil B: Zusammenspiel mit go() und vReise() ---------- */
const html = read('index.html');
if (!html.includes('<script src="app/unterseiten.js"></script>')) {
  console.log('Unterseiten: Logik geprüft (Adressen, Verlauf, Zurück, Fokus, Bereichsliste, Wischgeste). Zusammenspiel übersprungen: index.html lädt app/unterseiten.js noch nicht.');
  process.exit(0);
}
assert(html.indexOf('app/unterseiten.js') > html.indexOf('app/routing.js') && html.indexOf('app/unterseiten.js') < html.indexOf('app/ansichten.js'), 'Ladereihenfolge: nach routing.js, vor ansichten.js');
assert(read('sw.js').includes("'unterseiten'"), 'Service Worker kennt unterseiten.js');

function loadApp(mobile) {
  const J = require('../v3journal.js');
  const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '')
    .replace('function closeSheet(){', 'function closeSheet(){return;');
  const memory = new Map(), env = { mobile };
  const node = () => ({ innerHTML: '', hidden: false, style: {}, className: '', textContent: '', attrs: {}, focus() {}, scrollIntoView() {},
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k]; },
    querySelector() { return { style: {} }; }, querySelectorAll() { return []; } });
  const dom = { '#view': node(), '#dock': node(), '#dock-nm': node(), '#dock-sum': node(), '#dock-bar': node(), '#app-nav': node() };
  const focused = [];
  const win = { addEventListener() {}, scrollTo() {}, scrollY: 0, innerWidth: mobile ? 390 : 1280, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js'), RPV3J: J, RPV3S: require('../v3split.js') };
  const H = fakeHistory('#reisen');
  const ctx = {
    window: win, history: H, matchMedia: media(env), env,
    document: { addEventListener() {}, activeElement: null, querySelector: s => dom[s] || (/sub-title|data-sub-area/.test(s) ? { focus() { focused.push(s); ctx.document.activeElement = this; }, scrollIntoView() {} } : null), querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, style: {} }), body: { appendChild() {}, style: {} }, documentElement: { setAttribute() {}, style: { setProperty() {}, removeProperty() {} } } },
    localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, console, alert() {}
  };
  Object.assign(win, { history: H, matchMedia: ctx.matchMedia });
  vm.createContext(ctx); vm.runInContext(code, ctx); ctx.UI = vm.runInContext('UI', ctx);
  return { a: win.__app, ctx, H, dom, focused, env };
}
/* Handy: Regal → Übersicht → Kosten → Zurück → Zurück */
{
  const { a, ctx, H, dom, focused } = loadApp(true);
  const t = a.silvesterTemplate(); a.Store.put(t, true);
  const pop = () => a.go(H.hash, true, { pop: true });
  a.go('reisen', true);
  assert.deepEqual(H.urls(), ['#reisen']);
  assert(dom['#view'].innerHTML.includes('data-go="r-' + t.id + '"'), 'Reisekarte öffnet die Übersichtsseite');
  a.go('r-' + t.id);
  assert.deepEqual(H.urls(), ['#reisen', '#r-' + t.id]); assert.equal(ctx.UI.tab, null);
  let v = dom['#view'].innerHTML;
  assert(v.includes('trip-sub-list') && !v.includes('class="tabs"') && !v.includes('id="trip-area"'), 'Übersicht ohne gequetschte Tab-Reihe und ohne Auswahlfeld');
  assert.equal((v.match(/class="sub-row"/g) || []).length, 5);
  assert(v.includes('data-act="edit-trip"') && v.includes('data-f="status"'), 'Eckdaten und Status bleiben erreichbar');
  assert(!dom['#dock'].hidden, 'Gesamtpreis im Dock auch auf der Übersicht');
  a.go('r-' + t.id + '-kosten');
  assert.deepEqual(H.urls(), ['#reisen', '#r-' + t.id, '#r-' + t.id + '-kosten']);
  v = dom['#view'].innerHTML;
  assert(v.includes('data-sub-page="kosten"') && /<h1 id="sub-title" tabindex="-1">Kosten<\/h1>/.test(v), 'Unterseite mit Überschrift');
  assert(v.includes('aria-label="Zurück zu Bereiche"'));
  assert(v.includes('Planwerte'), 'Inhalt des Bereichs (Kostenhinweis) wie bisher');
  assert.equal(focused[focused.length - 1], '#sub-title', 'Fokus auf die neue Überschrift');
  /* Zurück-Knopf: Verlauf zurück, dann meldet der Browser den Schritt */
  const b = a.subBackRun(); assert.equal(b.kind, 'history'); assert.equal(H.hash, '#r-' + t.id);
  pop(); assert.equal(ctx.UI.tab, null); assert.equal(focused[focused.length - 1], '[data-sub-area="kosten"]', 'Fokus auf die verlassene Zeile');
  const len = H.entries.length; pop(); assert.equal(H.entries.length, len, 'doppelte Meldung (hashchange und popstate) ändert nichts');
  a.subBackRun(); pop(); assert.equal(ctx.UI.view, 'reisen'); assert.equal(H.i, 0, 'zurück im Regal, App nicht verlassen');
  /* Vor (Wischgeste nach links in Safari) */
  H.i = 1; pop(); assert.equal(ctx.UI.tid, t.id); assert.equal(ctx.UI.tab, null);
  /* Verweis im Überblick zu einem anderen Bereich: Zurück führt in den Überblick */
  a.go('r-' + t.id + '-ueber'); a.go('r-' + t.id + '-plan');
  assert(dom['#view'].innerHTML.includes('aria-label="Zurück zu Überblick"'));
  a.subBackRun(); pop(); assert.equal(ctx.UI.tab, 'ueber');
  /* Teilleiste im Bereich Programm: ersetzt den Eintrag, Zurück führt weiter zu Bereiche */
  a.go('r-' + t.id); a.go('r-' + t.id + '-unternehmen'); const n0 = H.entries.length;
  assert(dom['#view'].innerHTML.includes('data-seg="plan"') && /<h1 id="sub-title" tabindex="-1">Programm<\/h1>/.test(dom['#view'].innerHTML), 'Bereich als Überschrift, Teile als Leiste');
  a.go('r-' + t.id + '-plan'); assert.equal(H.entries.length, n0, 'kein neuer Verlaufseintrag');
  assert(dom['#view'].innerHTML.includes('aria-label="Zurück zu Bereiche"'));
  a.subBackRun(); pop(); assert.equal(ctx.UI.tab, null, 'Zurück aus dem zweiten Teil zur Übersichtsseite');
  /* Tab-Leiste ersetzt nur den Eintrag */
  const before = H.entries.length; a.go('entdecken'); assert.equal(H.entries.length, before);
  /* Heute → Tagesplan: Zurück zu Bereiche, dann zu Heute */
  a.go('heute'); a.go('r-' + t.id + '-plan');
  assert(dom['#view'].innerHTML.includes('aria-label="Zurück zu Bereiche"'));
  a.subBackRun(); pop(); assert.equal(ctx.UI.tab, null);
  a.subBackRun(); pop(); assert.equal(ctx.UI.view, 'heute');
  /* Aus „Neue Reise“ angelegt: das Formular fällt aus dem Verlauf */
  H.entries = [{ url: '#reisen', state: null }]; H.i = 0; a.go('reisen', true, { pop: true }); a.go('neu');
  const n = a.newTrip({ id: 'tneu', title: 'Neu' }); a.Store.put(n, true); a.go('r-tneu-unterkunft');
  assert.deepEqual(H.urls(), ['#reisen', '#r-tneu', '#r-tneu-unterkunft']);
  /* Speicherformat unverändert */
  assert(!/"route"|"rp"|sub-/.test(ctx.localStorage.getItem(a.Store.key()) || ''), 'nichts davon in rp-trips');
}
/* Handy: direkter Link auf eine Unterseite, Zurück bleibt in der App; unbekannter Bereich wie bisher */
{
  const { a, ctx, H, dom } = loadApp(true);
  const t = a.silvesterTemplate(); a.Store.put(t, true);
  H.entries = [{ url: '#r-' + t.id + '-mappe', state: null }];
  a.go('#r-' + t.id + '-mappe', true);
  assert.deepEqual(H.urls(), ['#reisen', '#r-' + t.id, '#r-' + t.id + '-mappe'], 'Ebenen darüber vorbefüllt');
  assert(dom['#view'].innerHTML.includes('aria-label="Zurück zu Bereiche"'));
  a.subBackRun(); a.go(H.hash, true, { pop: true }); assert.equal(ctx.UI.tab, null);
  a.go('r-' + t.id + '-quatsch'); assert.equal(ctx.UI.view, 'reisen', 'unbekannter Bereich wie bisher');
  /* Reise noch nicht geladen (Konto): Übersicht wird gemerkt */
  a.go('r-tunbekannt'); assert.equal(ctx.UI.view, 'reisen'); assert.equal(ctx.UI.pending, 'r-tunbekannt');
  /* Handy quer (breiter als 760 px): Überblick ohne Adresswechsel, zurückgedreht wieder die Übersichtsseite */
  a.go('r-' + t.id); const urls = H.urls().join();
  ctx.env.mobile = false; assert.equal(a.subWidthChange(false), 'wide'); assert.equal(ctx.UI.tab, 'ueber');
  assert(dom['#view'].innerHTML.includes('class="trip-workspace"')); assert.equal(H.urls().join(), urls, 'Verlauf unverändert');
  ctx.env.mobile = true; assert.equal(a.subWidthChange(true), 'render'); assert.equal(ctx.UI.tab, null); assert(dom['#view'].innerHTML.includes('trip-sub-list'));
  ctx.env.mobile = false; a.subWidthChange(false); a.go('r-' + t.id + '-kosten'); ctx.env.mobile = true; a.subWidthChange(true);
  assert.equal(ctx.UI.tab, 'kosten', 'nach einem Wechsel breit bleibt der Bereich');
  /* Ohne eigenen Eintrag (z. B. Breite gewechselt): Zurück eine Ebene höher */
  H.entries = [{ url: '#r-' + t.id + '-notiz', state: null }]; H.i = 0; a.go('#r-' + t.id + '-notiz', true, { pop: true });
  assert.equal(a.subBackRun().kind, 'go'); assert.equal(ctx.UI.tab, null); assert.equal(H.hash, '#r-' + t.id);
}
/* Desktop: unverändert */
{
  const { a, ctx, H, dom } = loadApp(false);
  const t = a.silvesterTemplate(); a.Store.put(t, true);
  a.go('reisen', true); a.go('r-' + t.id);
  assert.equal(ctx.UI.tab, 'ueber'); assert.deepEqual(H.urls(), ['#r-' + t.id + '-ueber'], '#r-<id> öffnet den Überblick, kein neuer Eintrag');
  let v = dom['#view'].innerHTML;
  assert(v.includes('class="trip-workspace"') && v.includes('<nav class="tabs" aria-label="Bereiche">') && v.includes('id="trip-area"'), 'Seitenleiste und Bereichsauswahl wie bisher');
  assert(!v.includes('sub-row') && !v.includes('data-sub-back'));
  a.go('r-' + t.id + '-kosten'); a.go('r-' + t.id + '-plan');
  assert.deepEqual(H.urls(), ['#r-' + t.id + '-plan']); assert.equal(H.state, null);
  /* alte Links */
  a.go('#r-' + t.id + '-check'); assert.equal(ctx.UI.tab, 'check');
}
console.log('Unterseiten: Logik und Zusammenspiel geprüft (Handy: Übersicht, 5 Bereiche mit Teilleiste, Zurück, Vor, direkter Link, Fokus; Desktop unverändert). Kein Browser-/iPhone-Test.');
