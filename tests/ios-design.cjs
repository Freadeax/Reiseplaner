/* P0.5 iOS-Gestaltungsregeln (PLAN_IOS_APP.md §4.3), Node-Teil: Zieh-Griff-Entscheidung, Tastatur-Sichtbarkeit,
   Blatt-Markup und Stylesheet-Regeln. Kein Browser-/iPhone-Test; Darstellung prüft tests/browser.cjs in Chromium. */
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8');
const code = require('./app-code.cjs')(html);

function boot(win) {
  const els = Object.fromEntries(['#view', '#sheet-root', '#dock', '#sync', '#dock-nm', '#dock-sum', '#dock-bar'].map(k => [k, { innerHTML: '', style: {}, querySelector() { return { textContent: '', style: {} }; } }]));
  const listeners = [];
  const ctx = { window: Object.assign({ addEventListener() {}, scrollTo() {} }, win || {}), location: { hash: '' }, history: { replaceState() {} },
    document: { addEventListener(type) { listeners.push(type); }, querySelector(k) { return els[k] || null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {}, style: {} } },
    localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, console };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { app: ctx.window.__app, els, ctx, listeners };
}

/* 1. Laden ohne visualViewport und ohne PointerEvent (wie Node, ältere Browser): keine Fehler, keine Wirkung. */
const { app, els, listeners } = boot();
for (const k of ['sheetDragDecision', 'sheetGripBind', 'fieldHidden', 'keepFieldVisible']) assert.equal(typeof app[k], 'function', k + ' in window.__app');
assert.equal(app.keepFieldVisible(), false, 'ohne visualViewport passiert nichts');
assert(!listeners.includes('focusin'), 'ohne visualViewport kein focusin-Lauscher');

/* 2. Blatt-Markup: Griff ist dekorativ, Schließen-Knopf bleibt mit Namen erhalten. */
app.openSheet('<h2>Probe</h2>');
const sheetHtml = els['#sheet-root'].innerHTML;
assert(/<div class="sheet-grip" data-sheet-grip aria-hidden="true">/.test(sheetHtml), 'Griff vorhanden und für Vorlesehilfen verborgen');
assert(/<button type="button" class="x" data-act="sheet-x" aria-label="Schließen">Schließen ✕<\/button>/.test(sheetHtml), 'sichtbarer Schließen-Knopf mit Namen');
assert(sheetHtml.indexOf('sheet-grip') < sheetHtml.indexOf('data-act="sheet-x"'), 'Griff oben vor dem Knopf');
assert(!/sheet-grip[^>]*(tabindex|role="button")/.test(sheetHtml), 'Griff ist kein Bedienelement (Knopf ist die Alternative)');

/* 3. Zieh-Entscheidung: nur nach unten, weit genug oder schnell genug. */
const d = app.sheetDragDecision;
assert.equal(d(0, 100, 600), 'stay');
assert.equal(d(-200, 100, 600), 'stay', 'nach oben ziehen schließt nie');
assert.equal(d(30, 500, 600), 'stay', 'kurzes langsames Ziehen bleibt offen');
assert.equal(d(139, 2000, 600), 'stay', '139 px langsam bei 600 px Höhe bleibt offen');
assert.equal(d(140, 2000, 600), 'close', 'ab 140 px schließt');
assert.equal(d(90, 2000, 300), 'close', 'bei kleinem Blatt reicht ein Drittel (30 %)');
assert.equal(d(60, 80, 600), 'close', 'schnelles Wischen nach unten schließt');
assert.equal(d(39, 10, 600), 'stay', 'unter 40 px schließt auch schnelles Wischen nicht (Tippen)');
assert.equal(d('x', null, 0), 'stay', 'ungültige Werte schließen nicht');

/* 4. Tastatur: Feld gilt als verdeckt, wenn es unter/über dem sichtbaren Bereich liegt. */
const vv = { height: 400, offsetTop: 0 };
assert.equal(app.fieldHidden({ top: 100, bottom: 140 }, vv), false);
assert.equal(app.fieldHidden({ top: 380, bottom: 420 }, vv), true, 'unter der Tastatur');
assert.equal(app.fieldHidden({ top: 395, bottom: 395 + 40 }, { height: 400, offsetTop: 300 }), false, 'sichtbarer Bereich nach unten verschoben');
assert.equal(app.fieldHidden({ top: 5, bottom: 45 }, vv), true, 'oben am Rand');
assert.equal(app.fieldHidden(null, vv), false);
assert.equal(app.fieldHidden({ top: 0, bottom: 10 }, null), false);

/* 5. Mit visualViewport: Variablen gesetzt, verdecktes Feld wird in die Mitte gerollt, Checkbox nicht. */
{
  const vvListeners = {}, props = {};
  const field = { matches: s => /textarea/.test(s), getBoundingClientRect: () => ({ top: 500, bottom: 540 }), scrolled: null, scrollIntoView(o) { this.scrolled = o; } };
  const env = boot({ visualViewport: { height: 360, offsetTop: 0, addEventListener(t, f) { vvListeners[t] = f; } } });
  assert(vvListeners.resize && vvListeners.scroll, 'Lauscher auf resize und scroll');
  assert(env.listeners.includes('focusin'), 'focusin-Lauscher mit visualViewport');
  env.ctx.document.documentElement = { style: { setProperty(k, v) { props[k] = v; } } };
  env.ctx.document.activeElement = field;
  assert.equal(env.app.keepFieldVisible(), true);
  assert.deepEqual(JSON.parse(JSON.stringify(field.scrolled)), { block: 'center', inline: 'nearest' }, 'ohne smooth: auch bei reduzierter Bewegung sofort');
  assert.equal(props['--rp-vvh'], '360px'); assert.equal(props['--rp-vvtop'], '0px');
  const box = { matches: () => false, getBoundingClientRect: () => ({ top: 500, bottom: 540 }), scrollIntoView() { throw new Error('nicht rollen'); } };
  env.ctx.document.activeElement = box;
  assert.equal(env.app.keepFieldVisible(), false, 'nur Eingabefelder');
  field.scrolled = null; field.getBoundingClientRect = () => ({ top: 100, bottom: 140 });
  env.ctx.document.activeElement = field;
  assert.equal(env.app.keepFieldVisible(), false); assert.equal(field.scrolled, null, 'sichtbares Feld bleibt stehen');
}

/* 6. Stylesheet: Schrift skaliert mit der Grundschrift, sichere Bereiche, reduzierte Bewegung. */
const pxFonts = [...css.matchAll(/font(?:-size)?:\s*(?:[0-9]{3}\s+|bold\s+)?([0-9.]+)px/g)].map(m => m[0]);
/* Erlaubt: SVG-Kartenbeschriftung (skaliert mit dem SVG) und das Logo-Zeichen der Kopfleiste (Modul Navigation). */
const allowed = pxFonts.filter(f => !/^font:(bold )?(9|10)px$|^font:700 25px$/.test(f.trim()));
assert.deepEqual(allowed, [], 'keine festen px-Schriftgrößen für Text: ' + allowed.join(', '));
assert(/body\{[^}]*font-size:1rem/.test(css), 'Grundschrift in rem');
for (const side of ['left', 'right']) assert(new RegExp(':root\\{[^}]*padding-' + side + ':env\\(safe-area-inset-' + side).test(css), 'Seite ' + side + ' im sicheren Bereich');
assert(/\.sheet\{[^}]*padding-bottom:calc\(24px \+ env\(safe-area-inset-bottom/.test(css), 'Blatt unten über dem Home-Indikator');
assert(/\.sheet\{[^}]*padding-left:max\(16px,env\(safe-area-inset-left/.test(css), 'Blatt im Querformat links');
assert(/@media \(prefers-reduced-motion:no-preference\)\{\.sheet\{transition:transform/.test(css), 'Blatt-Bewegung nur ohne reduzierte Bewegung');
assert(/@media \(prefers-reduced-motion:reduce\)\{\*\{transition:none!important;animation:none!important\}\}/.test(css), 'globale Regel für reduzierte Bewegung');
assert(!/scroll-behavior:\s*smooth/.test(css), 'kein weiches Scrollen ohne Bewegungsprüfung');
assert(/viewport-fit=cover/.test(html), 'viewport-fit=cover');
console.log('iOS-Gestaltungsregeln (Node): Griff, Zieh-Entscheidung, Tastatur-Sichtbarkeit, rem-Schrift, sichere Bereiche, reduzierte Bewegung geprüft.');
