/* Hauptnavigation, Heute und Erinnerungen (P0.5, PLAN_IOS_APP §4.2). Node-Test mit kleiner DOM-Attrappe,
   feste Uhrzeit über den Parameter now. Kein Browser-/iPhone-Test; Layout prüft tests/browser.cjs. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const J = require('../v3journal.js');
const C = x => JSON.parse(JSON.stringify(x));
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.includes('<script src="app/navigation.js"></script>'), 'navigation.js eingebunden');
assert(html.indexOf('app/navigation.js') > html.indexOf('app/tagebuch.js') && html.indexOf('app/navigation.js') < html.indexOf('app/start.js'), 'Ladereihenfolge');
assert(/<nav class="app-nav" id="app-nav" aria-label="Hauptnavigation">/.test(html), 'eine Hauptnavigation mit Namen');
assert.equal((html.match(/data-act="appearance-open"/g) || []).length, 1, 'Darstellung im Kopf (eine Stelle), zusätzlich in der Kontoansicht');
assert(fs.readFileSync(__dirname + '/../sw.js', 'utf8').includes("'navigation'"), 'Service Worker kennt navigation.js');

function load() {
  const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '')
    .replace('function closeSheet(){', 'function closeSheet(){return;');
  const memory = new Map();
  const node = () => ({ innerHTML: '', hidden: false, style: {}, className: '', textContent: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k]; },
    querySelector() { return { style: {} }; }, querySelectorAll() { return []; } });
  const dom = { '#view': node(), '#dock': node(), '#dock-nm': node(), '#dock-sum': node(), '#dock-bar': node(), '#app-nav': node() };
  const win = { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js'), RPV3J: J, RPV3S: require('../v3split.js') };
  const ctx = {
    window: win, history: { replaceState() {} },
    document: { addEventListener() {}, querySelector: s => dom[s] || null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, style: {} }), body: { appendChild() {}, style: {} } },
    localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, console, alert() {}
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { a: win.__app, dom, ctx };
}
const at = s => new Date(s + 'T12:00:00'); // lokale Mittagszeit
const keys = items => items.map(x => x.key).join(',');

/* ---------- 1. Einträge der Hauptnavigation ---------- */
{
  const { a } = load();
  const t = a.silvesterTemplate(); // 30.12.2026–03.01.2027
  const open = a.newTrip({ id: 'topen', title: 'Offen', dateMode: 'open' });
  assert.equal(keys(a.navItems(at('2026-12-01'), [t, open])), 'reisen,entdecken,erinnerungen,konto', 'vor der Reise kein Heute');
  assert.equal(keys(a.navItems(at('2026-12-30'), [t, open])), 'reisen,entdecken,heute,erinnerungen,konto', 'erster Reisetag: Heute an dritter Stelle');
  assert.equal(keys(a.navItems(at('2027-01-03'), [t])), 'reisen,entdecken,heute,erinnerungen,konto', 'Abreisetag zählt noch');
  assert.equal(keys(a.navItems(at('2027-01-04'), [t])), 'reisen,entdecken,erinnerungen,konto', 'nach der Reise kein Heute');
  assert.equal(keys(a.navItems(at('2026-12-31'), [])), 'reisen,entdecken,erinnerungen,konto', 'ohne Reisen');
  assert.equal(keys(a.navItems(at('2026-12-31'), [open])), 'reisen,entdecken,erinnerungen,konto', 'Reise ohne Datum läuft nie');
  assert.deepEqual(C(a.navItems(at('2026-12-31'), [t]).map(x => [x.label, x.route])), [['Reisen', '#reisen'], ['Entdecken', '#entdecken'], ['Heute', '#heute'], ['Erinnerungen', '#erinnerungen'], ['Konto', '#konto']]);
  /* Standard: gespeicherte Reisen */
  a.Store.put(t, true);
  assert(a.navItems(at('2027-01-01')).some(x => x.key === 'heute'), 'navItems liest gespeicherte Reisen');
  assert(!a.navItems(at('2027-02-01')).some(x => x.key === 'heute'));
  /* Aktiver Eintrag: Reise und neue Reise zählen als Reisen */
  for (const [view, key] of [['reisen', 'reisen'], ['reise', 'reisen'], ['neu', 'reisen'], ['entdecken', 'entdecken'], ['heute', 'heute'], ['erinnerungen', 'erinnerungen'], ['konto', 'konto'], ['xyz', 'reisen']])
    assert.equal(a.navActive(view), key, view);
  const h = a.navHtml(a.navItems(at('2027-01-01')), 'heute');
  assert.equal((h.match(/aria-current="page"/g) || []).length, 1, 'genau ein aktiver Eintrag');
  assert(/data-go="heute" aria-current="page"/.test(h));
  assert.equal((h.match(/<svg[^>]*aria-hidden="true"/g) || []).length, 5, 'Symbole verborgen');
  assert.equal((h.match(/<span class="nav-txt">/g) || []).length, 5, 'jede Schaltfläche mit sichtbarem Text');
}

/* ---------- 2. Routing ---------- */
{
  const { a, dom } = load();
  const t = a.silvesterTemplate(); a.Store.put(t, true);
  a.go('#heute'); assert.equal(a.UI.view, 'heute', '#heute direkt aufrufbar');
  assert(dom['#view'].innerHTML.includes('<h1>Heute</h1>'));
  a.go('erinnerungen'); assert.equal(a.UI.view, 'erinnerungen');
  assert(dom['#view'].innerHTML.includes('<h1>Erinnerungen</h1>'));
  assert.equal(dom['#dock'].hidden, true, 'keine Kostenleiste außerhalb einer Reise');
  a.go('r-' + t.id + '-plan'); assert.equal(a.UI.view, 'reise'); assert.equal(a.navActive(a.UI.view), 'reisen');
  assert.equal(dom['#dock'].hidden, false);
  a.go('konto'); assert.equal(a.UI.view, 'konto');
  assert(dom['#view'].innerHTML.includes('data-konto-darstellung') && dom['#view'].innerHTML.includes('data-act="appearance-open"'), 'Darstellung im Konto erreichbar');
  a.go('heutex'); assert.equal(a.UI.view, 'reisen', 'unbekannte Route führt zu Reisen');
  /* Sprungziel: Tagesplan am heutigen Tag */
  a.UI.navAfter = { focus: '', day: 3 }; a.go('r-' + t.id + '-plan'); assert.equal(a.UI.planDay, 3);
  assert.equal(a.UI.navAfter, null, 'Sprungziel gilt nur einmal');
  /* cur() in der Heute-Ansicht nur mit angeklickter Reise */
  a.go('heute'); assert.equal(a.UI.heuteTid, null);
  a.UI.heuteTid = t.id; assert.equal(a.Store.get(t.id).id, t.id);
  a.go('reisen'); assert.equal(a.UI.heuteTid, null, 'Wechsel vergisst die Heute-Reise');
}

/* ---------- 3. Heute ---------- */
{
  const { a } = load();
  /* ohne Reisen: Neue Reise */
  let h = a.vHeute(at('2026-12-01'));
  assert(h.includes('data-heute-empty') && h.includes('data-go="neu"') && h.includes('Gerade läuft keine Reise'));
  /* nur kommende Reise: wird mit Link genannt, Titel maskiert */
  const t = a.silvesterTemplate(); t.title = 'Silvester <b>&</b> Co'; a.Store.put(t, true);
  const later = a.newTrip({ id: 'tlater', title: 'Später', dateMode: 'fix', start: '2027-03-01', end: '2027-03-02' }); a.Store.put(later, true);
  h = a.vHeute(at('2026-12-20'));
  assert(h.includes('Silvester &lt;b&gt;&amp;&lt;/b&gt; Co') && !h.includes('<b>&</b>'), 'Titel maskiert');
  assert(h.includes('data-go="r-' + t.id + '-ueber"') && h.includes('noch 10 Tage') && !h.includes('Später'), 'nächste Reise genannt');
  assert(!h.includes('data-go="neu"'));
  /* laufende Reise */
  h = a.vHeute(at('2027-01-01'));
  assert(!h.includes('data-heute-empty'));
  assert(h.includes('data-heute-trip="' + t.id + '"') && h.includes('Tag 3 von 5'), 'Tag x von n');
  for (const tab of ['plan', 'kosten', 'notiz', 'check']) assert(h.includes('data-go="r-' + t.id + '-' + tab + '"'), 'Schnellzugriff ' + tab);
  assert(h.includes('>Ausgabe erfassen<') && h.includes('data-heute-focus="[data-split-action=&quot;expense-add&quot;]'), 'Ausgabe erfassen springt zur Aufteilung');
  assert(h.includes('>Tagebuch heute<') && h.includes('data-key=&quot;2027-01-01&quot;'), 'Tagebuch heute springt zum heutigen Eintrag');
  assert(h.includes('data-heute-day="2"'), 'Tagesplan öffnet heutigen Tag');
  assert(h.includes('Heute · ') && h.includes('data-journal="today"'), 'bestehender Heute-Block mit Tagebuch heute');
  assert(h.includes('Tagesplan') && h.includes('Checkliste') && h.includes('Notizen'));
  /* zwei laufende Reisen, nach Beginn sortiert */
  const two = a.newTrip({ id: 'ttwo', title: 'Zweite', dateMode: 'fix', start: '2026-12-31', end: '2027-01-02' }); a.Store.put(two, true);
  h = a.vHeute(at('2027-01-01'));
  assert(h.includes('2 Reisen laufen gerade'));
  assert(h.indexOf('data-heute-trip="' + t.id + '"') < h.indexOf('data-heute-trip="ttwo"'));
  assert(h.includes('Tag 2 von 3'));
}

/* ---------- 4. Erinnerungen ---------- */
{
  const { a } = load();
  /* leer */
  let h = a.vErinnerungen([]);
  assert(h.includes('data-memories-empty') && h.includes('Noch keine Erinnerungen'));
  const plain = a.newTrip({ id: 'tplain', title: 'Ohne Tagebuch', dateMode: 'fix', start: '2026-05-01', end: '2026-05-02' });
  h = a.vErinnerungen([plain]);
  assert(h.includes('data-memories-empty'), 'Format 2 ohne Angaben: leer');
  /* Daten */
  const old = a.silvesterTemplate(); old.id = 'told'; old.title = 'Alte <script>x</script> Reise'; old.schemaVersion = 3;
  const actId = old.items.map(i => i.act).find(id => /^[a-z0-9_-]+$/i.test(id) && a.ACTS[id] && !a.ACTS[id].transit);
  old.journal = { '2026-12-31': { text: '<img src=x onerror=alert(1)> Feuerwerk', mood: 4 }, d9: { text: 'ohne Tag' } };
  old.ratings = { [actId]: 4, weg: 2 };
  J.validate(old); a.validateExtras(old);
  const neu = a.newTrip({ id: 'tneu', title: 'Neuere Reise', dateMode: 'fix', start: '2027-06-01', end: '2027-06-03' });
  neu.schemaVersion = 3; neu.journal = { '2027-06-02': { text: 'Sonne' } };
  const m = a.memoriesData([old, plain, neu]);
  assert.equal(m.groups.length, 2); assert.equal(m.without, 1);
  assert.deepEqual(m.groups.map(g => g.trip.id), ['tneu', 'told'], 'neueste Reise zuerst');
  const g = m.groups[1];
  assert.equal(g.entries.length, 2, 'Eintrag mit und ohne Tag');
  assert.equal(g.entries[0].moodText, '4 von 5 · ' + J.MOODS[4]);
  assert(g.entries[1].label.includes('ohne zugehörigen Tag'));
  assert.deepEqual(C(g.ratings.map(r => [r.id, r.text])), [[actId, '4 von 5 Sternen'], ['weg', '2 von 5 Sternen']]);
  assert.equal(g.ratings[1].title, 'Entfernte Unternehmung');
  h = a.vErinnerungen([old, plain, neu]);
  assert(!h.includes('<img') && h.includes('&lt;img src=x onerror=alert(1)&gt;'), 'Tagebuchtext maskiert');
  assert(!h.includes('<script>x') && h.includes('Alte &lt;script&gt;x&lt;/script&gt; Reise'), 'Titel maskiert');
  assert(h.includes('4 von 5 Sternen') && h.includes('<span aria-hidden="true">★★★★☆</span>'), 'Sterne als Text, Symbole verborgen');
  assert(h.includes('Stimmung: <b>4 von 5'));
  assert(h.includes('data-go="r-told-plan"') && h.includes('data-go="r-tneu-plan"'), 'Link zum Tagebuch im Tagesplan');
  assert(h.indexOf('data-memory-trip="tneu"') < h.indexOf('data-memory-trip="told"'));
  assert(h.includes('1 weitere Reise hat noch kein Tagebuch'));
  assert(!/Foto|Reisebuch erstellen/.test(h.replace('Fotos und Reisebücher kommen später', '')), 'keine erfundenen Fotos oder Reisebücher');
  /* gespeicherte Daten unverändert */
  const before = JSON.stringify(old); a.vErinnerungen([old]); assert.equal(JSON.stringify(old), before, 'nur lesend');
  /* Standard: gespeicherte Reisen */
  a.Store.put(old, true); assert.equal(a.memoriesData().groups.length, 1);
}

/* ---------- 5. Ohne v3journal.js ---------- */
{
  const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
  const win = { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js') };
  const ctx = { window: win, document: { addEventListener() {}, querySelector: () => null, createElement: () => ({ setAttribute() {}, style: {} }), body: { appendChild() {} } }, localStorage: { getItem: () => null, setItem() {} }, setTimeout: () => 0, clearTimeout() {}, console };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const h = win.__app.vErinnerungen([]);
  assert(h.includes('kann Tagebücher nicht anzeigen'));
}
/* ---------- Sprungziel: geschlossener Aufklapper wird geöffnet, gesperrter Knopf übersprungen, sonst Inhalt fokussiert (Prüfung 18.10.) ---------- */
{
  const { a, dom, ctx } = load();
  const doc = ctx.document;
  const el = (name, extra) => Object.assign({ name, scrollIntoView() {}, focus() { if (!this.disabled) doc.activeElement = this; }, closest() { return null; } }, extra || {});
  const details = { open: false, parentElement: null };
  const hidden = el('schreiben', { closest: s => s === 'details:not([open])' && !details.open ? details : null });
  const off = el('ausgabe', { disabled: true }), head = el('kopf'), view = el('view');
  dom['#view'] = Object.assign(dom['#view'], { focus() { doc.activeElement = view; } });
  const map = { '[data-x="tb"]': hidden, '[data-x="off"]': off, '[data-x="head"]': head };
  const orig = doc.querySelector; doc.querySelector = s => map[s] || orig(s);
  assert.equal(a.navFocus('[data-x="tb"]|[data-x="head"]'), hidden); assert.equal(details.open, true, 'Aufklapper geöffnet');
  assert.equal(a.navFocus('[data-x="off"]|[data-x="head"]'), head, 'gesperrter Knopf übersprungen');
  doc.activeElement = null; assert.equal(a.navFocus('[data-x="off"]|[data-x="fehlt"]'), null); assert.equal(doc.activeElement, view, 'Fokus nie auf body');
}
console.log('Navigation (P0.5): Einträge mit/ohne laufende Reise (feste Uhrzeit), aktiver Eintrag, Routing #heute/#erinnerungen/#konto, Sprungziele, Heute (leer, nächste Reise, laufend, zwei Reisen), Erinnerungen (Gruppierung, Reihenfolge, Sterne als Text, Maskierung, nur lesend, ohne Modul) geprüft. Kein Browser-/iPhone-Test.');
