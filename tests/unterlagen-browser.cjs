/* Buchungen & Tickets (M11.3) im echten Chromium (Playwright) mit der ganzen App und dem echten Service Worker:
   Bereich öffnen → Unterlage mit synthetischem PDF und Code hinzufügen (echte IndexedDB rp-files) → Ansicht mit verdecktem Code,
   Aufdecken → Neuladen ohne Netz (Service-Worker-Cache) → Unterlage weiter da und lesbar → Löschen in zwei Schritten.
   Bei 390 px, 320 px dunkel und Desktop. rp-trips bleibt unverändert. Kein Safari/WebKit- und kein iPhone-Test.
   Aufruf: node tests/unterlagen-browser.cjs (nicht in npm test, braucht Playwright und Chromium wie tests/browser.cjs). */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(require('child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, path.normalize(p));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n'), Buffer.alloc(2000, 32), Buffer.from('\n%%EOF\n')]);

async function run(browser, base, name, opts, offline) {
  const ctx = await browser.newContext(opts), p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|Failed to load resource|fetching the script|ERR_INTERNET_DISCONNECTED/.test(m.text())) errors.push(m.text()); });
  await p.goto(base + '/#reisen'); await p.waitForFunction(() => window.__app && window.__app.Store && window.RPFiles);
  const tid = await p.evaluate(() => { const t = window.__app.silvesterTemplate(); window.__app.Store.put(t, true); return t.id; });
  const raw0 = await p.evaluate(() => localStorage.getItem('rp-trips'));
  await p.evaluate(id => { location.hash = '#r-' + id + '-buchungen'; }, tid);
  await p.waitForSelector('[data-unt-privacy]');
  assert.match(await p.textContent('[data-unt-privacy]'), /nur auf diesem Gerät/i);
  /* Hinzufügen */
  await p.click('[data-unt-act="add"] >> nth=0');
  await p.waitForSelector('[data-unt-form]');
  await p.selectOption('[data-unt-form] [name="kind"]', 'ticket');
  await p.fill('[data-unt-form] [name="title"]', 'Bahnticket Hinfahrt');
  await p.fill('[data-unt-form] [name="svalue"]', 'AB-123456');
  await p.setInputFiles('[data-unt-form] [name="file"]', { name: 'ticket.pdf', mimeType: 'application/pdf', buffer: PDF });
  await p.click('[data-unt-save]');
  await p.waitForSelector('.unt-doc');
  assert.match(await p.textContent('#view'), /Bahnticket Hinfahrt/);
  assert(!(await p.textContent('#view')).includes('AB-123456'), 'Code nicht im Überblick');
  assert.equal(await p.evaluate(() => localStorage.getItem('rp-trips')), raw0, 'Reise unverändert');
  /* Ansicht: verdeckt, aufdecken */
  await p.click('.unt-doc');
  await p.waitForSelector('[data-unt-secret-value]');
  assert.equal((await p.textContent('[data-unt-secret-value]')).trim(), '•••• 56');
  await p.click('[data-unt-act="reveal"]');
  await p.waitForFunction(() => document.querySelector('[data-unt-secret-value]').textContent.includes('AB-123456'));
  assert.equal(await p.locator('.sheet a[download="ticket.pdf"]').count(), 1, 'Datei speichern');
  const shot = path.join(require('os').tmpdir(), 'unterlagen-' + name + '.png');
  fs.mkdirSync(path.dirname(shot), { recursive: true }); await p.screenshot({ path: shot });
  /* keine waagrechte Scrollleiste */
  assert(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'keine waagrechte Scrollleiste');
  await p.click('.sheet [data-act="sheet-x"]');
  if (offline) {
    await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => null);
    const ctl = await p.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    if (!ctl) { await p.reload(); await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 }); }
    await p.waitForTimeout(500);
    await ctx.setOffline(true);
    await p.reload();
    await p.waitForSelector('.unt-doc', { timeout: 15000 });
    await p.click('.unt-doc');
    await p.waitForSelector('.sheet a[download="ticket.pdf"]');
    await p.click('.sheet [data-act="sheet-x"]');
    await ctx.setOffline(false);
  }
  /* Löschen in zwei Schritten */
  await p.click('.unt-doc');
  await p.click('[data-unt-act="delete"]');
  await p.click('[data-unt-act="delete-confirm"]');
  await p.waitForFunction(() => !document.querySelector('.unt-doc'));
  assert.deepEqual(errors, [], name + ': keine Fehler in der Konsole');
  await ctx.close();
  return offline ? 'offline neu geladen' : '';
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch();
  try {
    const out = [];
    out.push(await run(browser, base, 'handy', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, true));
    out.push(await run(browser, base, 'klein-dunkel', { viewport: { width: 320, height: 640 }, colorScheme: 'dark', hasTouch: true, isMobile: true }));
    out.push(await run(browser, base, 'desktop', { viewport: { width: 1280, height: 900 } }));
    console.log('Unterlagen im Browser: 390 px (' + out[0] + '), 320 px dunkel, Desktop geprüft.');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exit(1); });
