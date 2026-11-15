/* Bewegung (app/bewegung.js), Node-Teil: Richtung eines Seitenwechsels, kein Effekt ohne Browser oder bei
   „Bewegung reduzieren“, Aufrufstellen und Stylesheet-Regeln. Kein Browser-/iPhone-Test. */
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const ROOT = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8');
const src = fs.readFileSync(path.join(ROOT, 'app/bewegung.js'), 'utf8');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

function load(win, doc) {
  const ctx = { window: win, document: doc, setTimeout, clearTimeout, console };
  if (win === undefined) delete ctx.window; if (doc === undefined) delete ctx.document;
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.api={motionOk,viewDirection,viewEnter,sheetEnter,sheetLeave,detailsOpened};', ctx);
  return ctx.api;
}

/* 1. Richtung */
const d = load().viewDirection;
ok(d('', 'reisen') === 'up', 'erster Aufruf');
ok(d('reisen', 'reisen') === 'none', 'gleiche Seite');
ok(d('reisen', 'r-abc') === 'fwd' && d('reisen', 'r-abc-plan') === 'fwd', 'in eine Reise hinein');
ok(d('r-abc', 'r-abc-plan') === 'fwd', 'Übersicht → Unterseite');
ok(d('r-abc-plan', 'r-abc') === 'back', 'Unterseite → Übersicht');
ok(d('r-abc-plan', 'r-abc-kosten') === 'fade', 'Nachbarteil derselben Reise');
ok(d('r-abc-plan', 'r-xyz-plan') === 'up', 'andere Reise');
ok(d('r-abc-plan', 'reisen') === 'back' && d('r-abc', 'heute') === 'back', 'aus der Reise zurück');
ok(d('r-abc', 'konto') === 'up' && d('reisen', 'entdecken') === 'up', 'Hauptseiten');
ok(d('reisen', 'neu') === 'fwd' && d('neu', 'reisen') === 'back', 'Neue Reise');
ok(d('entdecken', 'ziel-oberjoch') === 'fwd' && d('ziel-oberjoch', 'entdecken') === 'back', 'Ziel');
ok(d(null, undefined) === 'none', 'ungültige Werte');

/* 2. Ohne Browser (Node) und ohne matchMedia passiert nichts, nichts wirft. */
const bare = load();
ok(bare.motionOk() === false && bare.viewEnter('a', 'b') === false && bare.sheetLeave() === false && bare.sheetEnter({}, true) === false && bare.detailsOpened(null) === false, 'ohne Browser wirkungslos');

/* 3. „Bewegung reduzieren“: keine Klasse, keine Kopie des Blatts. */
function fakeDoc() {
  const cls = new Set(), view = { classList: { add: c => cls.add(c), remove: c => cls.delete(c) }, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, offsetWidth: 1 };
  const appended = [];
  return { cls, view, appended, doc: { querySelector: s => s === '#view' ? view : null, addEventListener() {}, createElement: () => ({ setAttribute() {}, appendChild() {}, style: {} }), body: { appendChild: e => appended.push(e) } } };
}
{
  const f = fakeDoc(), api = load({ matchMedia: () => ({ matches: true }) }, f.doc);
  ok(api.motionOk() === false && api.viewEnter('reisen', 'konto') === false && f.cls.size === 0, 'reduziert: kein Einblenden');
  ok(api.sheetLeave() === false && f.appended.length === 0, 'reduziert: keine Kopie');
}
/* 4. Mit Bewegung: Klasse und Richtung gesetzt; gleiche Seite setzt nichts. */
{
  const f = fakeDoc(), api = load({ matchMedia: () => ({ matches: false }) }, f.doc);
  ok(api.viewEnter('reisen', 'r-abc') === true && f.cls.has('rp-enter') && f.view.attrs['data-rp-dir'] === 'fwd', 'Einblenden vorwärts');
  ok(api.viewEnter('r-abc', 'r-abc') === false && !f.cls.has('rp-enter'), 'gleiche Seite: Klasse entfernt');
  const bg = { classList: { list: [], add(c) { this.list.push(c); } } };
  ok(api.sheetEnter({ parentNode: bg }, false) === false && bg.classList.list.length === 0, 'offenes Blatt wechselt Inhalt: kein erneutes Einblenden');
  ok(api.sheetEnter({ parentNode: bg }, true) === true && bg.classList.list[0] === 'sheet-in', 'neues Blatt blendet ein');
  ok(api.sheetLeave() === false, 'kein Blatt offen: keine Kopie');
}

/* 5. Aufrufstellen sind abgesichert (Teile laden in Reihenfolge, Tests laden einzelne Teile). */
const routing = fs.readFileSync(path.join(ROOT, 'app/routing.js'), 'utf8'), sheets = fs.readFileSync(path.join(ROOT, 'app/blaetter.js'), 'utf8');
ok(/typeof viewEnter==='function'\)viewEnter\(previousRoute,target\)/.test(routing), 'go() ruft viewEnter abgesichert');
ok(/typeof sheetLeave==='function'\)sheetLeave\(\);\n \$\('#sheet-root'\)\.innerHTML=''/.test(sheets), 'Kopie vor dem Entfernen, Blatt wird weiter sofort entfernt');
ok(/typeof sheetEnter==='function'\)sheetEnter\(s,fresh\)/.test(sheets), 'openSheet ruft sheetEnter abgesichert');

/* 6. Stylesheet: jede Animation und jeder Übergang des Abschnitts steht hinter no-preference; Kopie nicht bedienbar. */
const part = css.slice(css.indexOf('Feinschliff und Bewegung'));
ok(part.length > 2000, 'Abschnitt vorhanden');
let depth = 0, stack = [], bad = [];
for (const m of part.matchAll(/@media([^{]+)\{|@supports[^{]+\{|@keyframes[^{]+\{|[^{}@]+\{|\}/g)) {
  const t = m[0];
  if (t === '}') { stack.pop(); continue; }
  stack.push(t);
  if (!/^@/.test(t)) {
    const end = part.indexOf('}', m.index + t.length), body = part.slice(m.index + t.length, end);
    const inKey = stack.some(s => /^@keyframes/.test(s)), gated = stack.some(s => /no-preference/.test(s)), off = stack.some(s => /prefers-reduced-motion:reduce/.test(s));
    if (!inKey && !gated && !off && /(^|;|\s)(animation|transition)(-[a-z-]+)?:/.test(body)) bad.push(t.trim().slice(0, 60));
  }
}
assert.deepEqual(bad, [], 'Bewegung ohne Prüfung auf reduzierte Bewegung: ' + bad.join(' | ')); n++;
ok(/\.sheet-out\{[^}]*pointer-events:none/.test(part), 'Kopie des Blatts nimmt keine Eingaben an');
ok(/#view\.rp-enter/.test(part) && !/#view>\*\{[^}]*animation/.test(part), 'Einblenden nur über rp-enter');
ok(/ghost\.inert=true/.test(src) && /aria-hidden/.test(src) && /n==='id'/.test(src) && /startsWith\('data-'\)/.test(src), 'Kopie ohne Kennungen, verborgen für Vorlesehilfen');
console.log('bewegung: ' + n + ' Prüfungen bestanden');
