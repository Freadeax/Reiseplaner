/* Sichtprüfung der Oberfläche in echtem Chromium (Playwright). Kein iPhone-/Safari-Test.
   Start: npm run audit:ui   (optional SHOT_DIR=/pfad für Screenshots, AUDIT_STRICT=1 → Exit 1 bei Befunden)
   Prüft je Ansicht, Breite (1280/390/320), Farbschema (hell/dunkel) und angebotener Darstellung:
   - Textkontrast nach WCAG 2.x (4,5:1; große Schrift ab 24 px bzw. 18,66 px fett: 3:1)
   - Tippflächen kleiner als 44 × 44 px (Knöpfe, Links, Eingaben; Links im Fließtext ausgenommen)
   - Bedienelemente ohne zugänglichen Namen
   - seitliches Überlaufen der Seite
   - sichtbarer Fokus (Umriss oder Schatten) beim ersten Bedienelement nach Tab
   - überlappende Bedienelemente und halbtransparente feste/klebende Leisten (Durchscheinen)
   Darstellungen: alle Werte von [data-act="appearance-set"] (book/studio/compact), gesetzt über localStorage
   rp-appearance und html[data-layout]. Ohne Auswahl wird nur die Standard-Darstellung geprüft. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return null;
}
const pw = loadPlaywright();
if (!pw) { console.log('UI-Prüfung übersprungen: Playwright nicht installiert.'); process.exit(0); }
const ROOT = path.join(__dirname, '..');
const OUT = process.env.SHOT_DIR || '';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.json': 'application/json' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
      const f = path.join(ROOT, path.normalize(p));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

/* Läuft im Browser: sammelt Befunde der aktuell sichtbaren Ansicht */
function inspect() {
  const lum = c => { const v = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const parse = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const blend = (top, bottom) => top.rgb.map((v, i) => v * top.a + bottom[i] * (1 - top.a));
  const bgOf = el => { /* erste deckende Hintergrundfarbe nach oben, halbtransparente darüber gemischt */
    const layers = []; let e = el;
    while (e && e.nodeType === 1) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; } e = e.parentElement; }
    let base = [255, 255, 255]; for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base); return base;
  };
  const visible = el => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05; };
  const sel = el => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const cl = [...el.classList].slice(0, 2); if (cl.length) s += '.' + cl.join('.'); const a = el.getAttribute('data-act') || el.getAttribute('data-go'); if (a) s += '[' + (el.getAttribute('data-act') ? 'data-act' : 'data-go') + '=' + a + ']'; return s; };
  const out = { contrast: [], small: [], unnamed: [], overlap: [], seeThrough: [], overflow: document.documentElement.scrollWidth - window.innerWidth };
  const seen = new Set();
  const textEls = [...document.querySelectorAll('body *')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1));
  textEls.forEach(el => {
    const cs = getComputedStyle(el), fg = parse(cs.color); if (!fg) return;
    const bg = bgOf(el), col = blend(fg, bg);
    const L1 = lum(col), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700, large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    if (ratio + 0.01 < need) { const k = sel(el) + '|' + ratio.toFixed(2); if (!seen.has(k)) { seen.add(k); out.contrast.push({ sel: sel(el), ratio: +ratio.toFixed(2), need, text: el.textContent.trim().slice(0, 40), fg: cs.color, size: size + 'px' }); } }
  });
  const ctrls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button]')].filter(visible);
  ctrls.forEach(el => {
    const r = el.getBoundingClientRect();
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline' && el.closest('p,li');
    if (el.classList.contains('skip-link')) return; /* Sprunglink erscheint erst bei Tastaturfokus */
    const isCheck = el.tagName === 'INPUT' && /checkbox|radio/.test(el.type) && el.closest('label');
    if (!inline && !isCheck && (r.height < 44 - 0.5 || r.width < 44 - 0.5)) out.small.push({ sel: sel(el), w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || el.value || '').trim().slice(0, 30) });
    const name = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || el.value || (el.labels && el.labels[0] && el.labels[0].textContent) || el.getAttribute('placeholder') || '').trim();
    if (!name && !(el.closest('label') && el.closest('label').textContent.trim())) out.unnamed.push(sel(el));
  });
  /* Überlappung: sichtbare Bedienelemente, die sich überdecken (Inhalte zugeklappter <details> zählen nicht) */
  const shown = el => { const d = el.closest('details:not([open])'); return visible(el) && !(d && !el.closest('summary')); };
  /* Offener Dialog: nur dessen Inhalt zählt (die Seite dahinter ist verdeckt). Kartenpunkte in SVG dürfen sich bewusst überlagern. */
  const scope = document.querySelector('.sheet') || document;
  const cs2 = [...scope.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, summary')].filter(el => shown(el) && !el.closest('svg'));
  for (let i = 0; i < cs2.length && out.overlap.length < 10; i++) for (let j = i + 1; j < cs2.length; j++) {
    const A = cs2[i], B = cs2[j]; if (A.contains(B) || B.contains(A)) continue;
    const r = A.getBoundingClientRect(), q = B.getBoundingClientRect();
    if (Math.min(r.right, q.right) - Math.max(r.left, q.left) > 2 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 2) out.overlap.push(sel(A) + ' × ' + sel(B));
  }
  /* Durchscheinen: feste/klebende Leisten mit halbtransparentem Hintergrund ohne Unschärfe */
  document.querySelectorAll('body *').forEach(el => { const cs = getComputedStyle(el); if (!['fixed', 'sticky'].includes(cs.position) || !visible(el)) return;
    const c = parse(cs.backgroundColor), blur = (cs.backdropFilter || cs.webkitBackdropFilter || 'none') !== 'none';
    const rr = el.getBoundingClientRect(), backdrop = rr.width * rr.height >= 0.9 * innerWidth * innerHeight; /* Abdunkelung hinter Dialogen ist gewollt */
    if (c && c.a > 0 && c.a < 0.9 && !blur && !backdrop) out.seeThrough.push(sel(el) + ' (Deckkraft ' + c.a.toFixed(2) + ')'); });
  return out;
}

async function designsOf(p) {
  return p.evaluate(() => {
    const vals = new Set();
    if (!document.querySelector('[data-act="appearance-set"]')) { const o = document.querySelector('[data-act="appearance-open"]'); if (o) o.click(); }
    document.querySelectorAll('[data-act="appearance-set"]').forEach(e => vals.add(e.getAttribute('data-val')));
    const x = document.querySelector('.sheet .x'); if (x) x.click();
    return [...vals].filter(Boolean);
  });
}
async function chooseDesign(p, d) {
  await p.evaluate(v => localStorage.setItem('rp-appearance', v), d); await p.reload();
  if (await p.getAttribute('html', 'data-layout') !== d) throw new Error('Darstellung ' + d + ' nicht aktiv');
}
async function focusCheck(p) {
  await p.keyboard.press('Tab');
  return p.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return 'kein Fokus'; const cs = getComputedStyle(a);
    return (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none') ? 'ok' : 'kein sichtbarer Fokus auf ' + a.tagName.toLowerCase(); });
}

(async () => {
  const srv = await serve(); const base = 'http://127.0.0.1:' + srv.address().port;
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const views = [
    ['start', async p => { await p.goto(base + '/index.html#reisen'); }],
    ['entdecken', async p => { await p.goto(base + '/index.html#entdecken'); await p.waitForSelector('[data-act="cat-search"]'); if (await p.$('#cat-city')) await p.selectOption('#cat-city', { label: 'Stuttgart' }, { timeout: 5000 }).catch(() => {}); await p.click('[data-act="cat-search"]'); await p.waitForSelector('#cat-results'); }],
    ['ziel-blatt', async p => { await p.goto(base + '/index.html#ziel-harz'); await p.waitForSelector('.sheet h2'); }],
    ['vorlagen-vorschau', async p => { await p.goto(base + '/index.html#reisen'); if(!await p.isVisible('[data-template-filter]'))await p.click('summary:has-text("Mit einer Vorlage starten")'); await p.click('[data-act="tpl"][data-val="fernreise"]'); await p.waitForSelector('[data-act="tpl-apply"]'); }],
    ['reise-ueberblick', async p => { await p.goto(base + '/index.html#reisen'); if(!await p.isVisible('[data-template-filter]'))await p.click('summary:has-text("Mit einer Vorlage starten")'); await p.click('[data-act="tpl"][data-val="silvester"]'); await p.click('[data-act="tpl-apply"]'); await p.waitForSelector('.tabs'); }],
    ['tagesplan', async p => { await p.goto(base + '/index.html' + (await p.evaluate(() => location.hash)).replace(/-[a-z]+$/, '-plan')); await p.waitForSelector('.trip-workspace'); }],
    ['kosten', async p => { await p.goto(base + '/index.html' + (await p.evaluate(() => location.hash)).replace(/-[a-z]+$/, '-kosten')); await p.waitForSelector('.trip-workspace'); }],
    ['mappe', async p => { await p.goto(base + '/index.html' + (await p.evaluate(() => location.hash)).replace(/-[a-z]+$/, '-mappe')); await p.waitForSelector('.trip-workspace'); }],
    ['konto', async p => { await p.goto(base + '/index.html#konto'); }]
  ];
  const variants = [['1280-hell', { width: 1280, height: 900 }, 'light'], ['390-hell', { width: 390, height: 844 }, 'light'], ['320-dunkel', { width: 320, height: 640 }, 'dark'], ['1280-dunkel', { width: 1280, height: 900 }, 'dark']];
  let total = 0; const summary = []; const smallBy = new Map();
  for (const [vname, viewport, scheme] of variants) {
    const ctx = await browser.newContext({ viewport, colorScheme: scheme, serviceWorkers: 'block' });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await p.goto(base + '/index.html');
    const designs = await designsOf(p); const list = designs.length ? designs : ['standard'];
    for (const d of list) {
      if (d !== 'standard') { await p.goto(base + '/index.html'); await chooseDesign(p, d); }
      for (const [name, open] of views) {
        try { await open(p); } catch (e) { summary.push(vname + ' · ' + d + ' · ' + name + ': Ansicht nicht erreichbar (' + e.message.split('\n')[0] + ')'); continue; }
        await p.waitForTimeout(150);
        const r = await p.evaluate(inspect);
        const foc = name === 'start' ? await focusCheck(p) : 'ok';
        const n = r.contrast.length + r.small.length + r.unnamed.length + r.overlap.length + r.seeThrough.length + (r.overflow > 0 ? 1 : 0) + (foc !== 'ok' ? 1 : 0);
        total += n; r.small.forEach(c => { const k = c.sel + ' (' + c.h + ' px hoch)'; smallBy.set(k, (smallBy.get(k) || 0) + 1); });
        if (OUT) await p.screenshot({ path: path.join(OUT, [vname, d, name].join('_') + '.png'), fullPage: true });
        if (n) summary.push(vname + ' · ' + d + ' · ' + name + ': ' + [
          r.overflow > 0 ? 'Seite ' + r.overflow + ' px zu breit' : '',
          r.overlap.length ? r.overlap.length + '× Überlappung (' + r.overlap.slice(0, 3).join('; ') + ')' : '',
          r.seeThrough.length ? 'durchscheinend: ' + r.seeThrough.slice(0, 3).join('; ') : '',
          r.contrast.length ? r.contrast.length + '× Kontrast (z. B. ' + r.contrast.slice(0, 3).map(c => c.sel + ' ' + c.ratio + ':1 statt ' + c.need + ' „' + c.text + '“').join('; ') + ')' : '',
          r.small.length ? r.small.length + '× Tippfläche < 44 px (z. B. ' + r.small.slice(0, 3).map(c => c.sel + ' ' + c.w + '×' + c.h).join('; ') + ')' : '',
          r.unnamed.length ? r.unnamed.length + '× ohne Namen (' + r.unnamed.slice(0, 3).join(', ') + ')' : '',
          foc !== 'ok' ? foc : ''].filter(Boolean).join(' | '));
      }
    }
    if (errs.length) summary.push(vname + ': JavaScript-Fehler: ' + errs.join(' / '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(summary.length ? 'UI-Prüfung, Befunde:\n- ' + summary.join('\n- ') : 'UI-Prüfung: keine Befunde.');
  if (smallBy.size) console.log('Kleine Tippflächen nach Element (Anzahl Fundstellen):\n- ' + [...smallBy].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => v + '× ' + k).join('\n- '));
  console.log('Befunde gesamt: ' + total);
  if (process.env.AUDIT_STRICT && total) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
