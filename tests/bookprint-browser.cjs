/* Reisebuch-Druck im echten Chromium (Paket 9): Druckfassung einer Testseite mit App-Kopf, Messung übervoller Seiten,
   Druckansicht (nur Buchseiten sichtbar, helles Papier auch im Dunkelmodus) und echtes PDF mit Seitenzahl und Seitengröße.
   Kein Safari-, iPhone- oder Druckertest. Aufruf: node tests/bookprint-browser.cjs (braucht Playwright wie tests/browser.cjs). */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const root = path.join(__dirname, '..');
const cssFile = fs.existsSync(path.join(root, 'reisebuch-druck.css')) ? 'reisebuch-druck.css' : null;
const page = `<!doctype html><html lang="de"><head><meta charset="utf-8"><link rel="stylesheet" href="app.css">${cssFile ? '<link rel="stylesheet" href="' + cssFile + '">' : ''}</head><body>
<header class="top" id="kopf"><button type="button">Bedienelement</button></header>
<main id="view"><section class="block"><p id="privat">Notiz: Buchungsnr GEHEIM-123</p><div class="book-page" id="vorschau"></div></section></main>
<nav class="app-nav" id="tabs">Tabs</nav>
<script src="v3journal.js"></script><script src="v4logic.js"></script><script src="bookgen.js"></script><script src="bookprint.js"></script>
</body></html>`;

(async () => {
  const tmp = path.join(root, '.bookprint-browser-test.html');
  fs.writeFileSync(tmp, page);
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.goto('file://' + tmp);
    assert(cssFile || fs.readFileSync(path.join(root, 'app.css'), 'utf8').includes('#rp-print-root'), 'Druck-CSS fehlt (reisebuch-druck.css daneben oder in app.css)');

    /* Buch aus bookgen mit einem echten JPEG (Canvas); Tag 2 hat 2000 Zeichen Text und ein Foto und ist damit zu voll */
    const setup = await p.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 1600; c.height = 1200;
      const g = c.getContext('2d'); g.fillStyle = '#7aa0c4'; g.fillRect(0, 0, 1600, 1200); g.fillStyle = '#fff'; g.fillRect(200, 200, 400, 300);
      window.__img = c.toDataURL('image/jpeg', 0.8);
      const trip = { id: 'tbrowser', title: 'Testreise Druck', dateMode: 'fix', start: '2026-12-30', end: '2027-01-01', nights: 2, dest: 'Oberstaufen', schemaVersion: 4,
        notes: 'GEHEIM-123', journal: { '2026-12-30': { text: 'Angekommen.' }, '2026-12-31': { text: 'Lang. '.repeat(330) }, '2027-01-01': { text: 'Heim.' } },
        media: [{ id: 'mbrowser1', kind: 'photo', takenAt: '2026-12-30T10:00:00Z', w: 1600, h: 1200, caption: 'Ankunft', day: '2026-12-30', fav: true, hidden: false },
          { id: 'mbrowser2', kind: 'photo', takenAt: '2026-12-31T10:00:00Z', w: 1600, h: 1200, caption: 'Rodeln', day: '2026-12-31', fav: false, hidden: false }] };
      window.__trip = trip;
      window.__book = RPBook.draft(trip, {}, { at: '2026-10-20T08:00:00.000Z' }).book;
      return { kinds: window.__book.pages.map(x => x.kind), long: window.__book.pages.find(x => x.text && x.text.length > 1500).id };
    });
    assert.deepStrictEqual(setup.kinds, ['titel', 'uebersicht', 'tag', 'tag', 'tag', 'schluss']);

    /* 1. Übervolle Seite wird im echten Layout erkannt, ohne Bestätigung kein Druck, nichts bleibt hängen */
    const over = await p.evaluate(() => {
      let printed = 0; const w = Object.create(window); w.print = () => { printed++; };
      w.addEventListener = window.addEventListener.bind(window); w.removeEventListener = window.removeEventListener.bind(window);
      const r = RPBookPrint.printBook(window.__book, { mediaUrl: () => window.__img }, { window: w, document });
      return { ok: r.ok, code: r.code, pages: r.pages, printed, left: !!document.getElementById('rp-print-root'), cls: document.documentElement.classList.contains('rp-printing') };
    });
    assert.strictEqual(over.ok, false); assert.strictEqual(over.code, 'ueberlauf');
    assert.deepStrictEqual(over.pages.map(x => x.pageId), [setup.long], 'nur die lange Seite ist zu voll');
    assert.strictEqual(over.printed, 0); assert.strictEqual(over.left, false); assert.strictEqual(over.cls, false);

    /* 2. Mit Bestätigung: Druckfassung steht, print wird aufgerufen; afterprint simulieren wir erst nach dem PDF */
    const ok = await p.evaluate(() => {
      window.__printed = 0; const w = Object.create(window); w.print = () => { window.__printed++; };
      w.addEventListener = window.addEventListener.bind(window); w.removeEventListener = window.removeEventListener.bind(window);
      const r = RPBookPrint.printBook(window.__book, { mode: 'fotobuch', confirm: true, media: window.__trip.media, mediaUrl: () => window.__img }, { window: w, document });
      return { ok: r.ok, count: r.plan.count, printed: window.__printed, res: r.resolution };
    });
    assert.strictEqual(ok.ok, true); assert.strictEqual(ok.printed, 1); assert.strictEqual(ok.count, 6);
    assert.deepStrictEqual(ok.res, [], '1600 × 1200 px auf A5 quer reicht für 200 dpi');

    /* Bildschirm: Druckfassung unsichtbar und außerhalb, App unverändert sichtbar */
    const screen = await p.evaluate(() => ({ vis: getComputedStyle(document.getElementById('rp-print-root')).visibility, kopf: getComputedStyle(document.getElementById('kopf')).display,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
    assert.strictEqual(screen.vis, 'hidden'); assert.notStrictEqual(screen.kopf, 'none'); assert.strictEqual(screen.overflowX, false, 'kein seitliches Scrollen durch die Druckfassung');

    /* 3. Druckansicht: nur Buchseiten, helles Papier trotz Dunkelmodus, Seiten exakt im Format */
    await p.emulateMedia({ media: 'print', colorScheme: 'dark' });
    const pr = await p.evaluate(() => {
      const shown = id => document.getElementById(id).checkVisibility();
      const pages = [...document.querySelectorAll('#rp-print-root .rpp-page')];
      const r = pages[0].getBoundingClientRect();
      const imgs = [...document.querySelectorAll('#rp-print-root img')];
      return { kopf: shown('kopf'), view: shown('view'), tabs: shown('tabs'), root: getComputedStyle(document.getElementById('rp-print-root')).visibility,
        n: pages.length, wmm: r.width * 25.4 / 96, hmm: r.height * 25.4 / 96, bg: getComputedStyle(pages[0]).backgroundColor, ink: getComputedStyle(pages[1]).color,
        nums: pages.map(x => (x.querySelector('.rpp-num') || {}).textContent || ''), text: document.getElementById('rp-print-root').innerText,
        imgs: imgs.length, loaded: imgs.every(i => i.complete && i.naturalWidth > 0),
        controls: document.querySelectorAll('#rp-print-root button,#rp-print-root input,#rp-print-root select').length };
    });
    assert.deepStrictEqual([pr.kopf, pr.view, pr.tabs], [false, false, false], 'App-Kopf, Inhalt und Tabs nicht im Druck');
    assert.strictEqual(pr.root, 'visible'); assert.strictEqual(pr.n, 6); assert.strictEqual(pr.controls, 0);
    assert(Math.abs(pr.wmm - 216) < 0.3 && Math.abs(pr.hmm - 154) < 0.3, 'Seite 216 × 154 mm (A5 quer + 2 × 3 mm), gemessen ' + pr.wmm.toFixed(2) + ' × ' + pr.hmm.toFixed(2));
    assert.strictEqual(pr.bg, 'rgb(255, 255, 255)', 'helles Papier'); assert.strictEqual(pr.ink, 'rgb(31, 27, 22)', 'dunkle Schrift im Dunkelmodus');
    assert.deepStrictEqual(pr.nums, ['', '2', '3', '4', '5', '6']);
    assert(!/GEHEIM|Bedienelement|Buchungsnr/.test(pr.text), 'nichts aus der App oder Notizen im Druck');
    assert(pr.imgs >= 1 && pr.loaded, 'Fotos geladen');

    /* 4. Echtes PDF aus der Druckansicht: Seitenzahl und Seitengröße in Punkt (1 mm = 72/25,4 pt) */
    const pdf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
    const s = pdf.toString('latin1');
    const pagesInPdf = (s.match(/\/Type\s*\/Page(?!s)/g) || []).length;
    const boxes = [...s.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [+m[1], +m[2]]);
    assert.strictEqual(pagesInPdf, 6, 'PDF hat 6 Seiten, keine zusätzliche leere Seite');
    boxes.forEach(b => { assert(Math.abs(b[0] - 216 * 72 / 25.4) < 1.5 && Math.abs(b[1] - 154 * 72 / 25.4) < 1.5, 'PDF-Seitengröße ' + b.join(' × ')); });
    fs.writeFileSync(path.join(os.tmpdir(), 'reisebuch-druck-test.pdf'), pdf);

    /* 5. afterprint räumt auf */
    await p.emulateMedia({ media: 'screen' });
    const after = await p.evaluate(() => { window.dispatchEvent(new Event('afterprint')); return { root: !!document.getElementById('rp-print-root'), style: !!document.getElementById('rp-print-style'), cls: document.documentElement.classList.contains('rp-printing') }; });
    assert.deepStrictEqual(after, { root: false, style: false, cls: false });

    /* 6. Alle drei Formate: Seitengröße im PDF */
    for (const [f, w, h] of [['a4-hoch', 210, 297], ['quadrat-21', 210, 210], ['a5-quer', 210, 148]]) {
      await p.evaluate(f => {
        const b = Object.assign({}, window.__book, { format: f, pages: window.__book.pages.filter(x => !(x.text && x.text.length > 1500)) });
        const w = Object.create(window); w.print = () => {}; w.addEventListener = () => {}; w.removeEventListener = () => {};
        const r = RPBookPrint.printBook(b, { mediaUrl: () => window.__img }, { window: w, document }); if (!r.ok) throw new Error(f + ': ' + r.error);
      }, f);
      await p.emulateMedia({ media: 'print' });
      const out = (await p.pdf({ preferCSSPageSize: true, printBackground: true })).toString('latin1');
      const n = (out.match(/\/Type\s*\/Page(?!s)/g) || []).length;
      const bx = [...out.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map(m => [+m[1], +m[2]]);
      assert.strictEqual(n, 5, f + ': 5 Seiten');
      bx.forEach(b => assert(Math.abs(b[0] - w * 72 / 25.4) < 1.5 && Math.abs(b[1] - h * 72 / 25.4) < 1.5, f + ': ' + b.join(' × ')));
      await p.emulateMedia({ media: 'screen' });
    }
    assert.deepStrictEqual(errors, [], 'keine Konsolenfehler');
    console.log('bookprint-browser: alle Prüfungen bestanden (Chromium, PDF unter ' + path.join(os.tmpdir(), 'reisebuch-druck-test.pdf') + ')');
  } finally {
    await browser.close();
    fs.unlinkSync(tmp);
  }
})().catch(e => { console.error(e); process.exit(1); });
