/* Format 5 im Browser (Chromium, Desktop und 390 px): Stornobedingungen und Zahlungsplan über die echten Blätter eintragen,
   Bestätigung beim Umstellen auf Format 5, Vorschau unter „Kosten“, Frist im Fahrplan als erledigt markieren und wieder
   öffnen, Neuladen behält alles. Kein iPhone-/Safari-Test. */
const fs = require('fs'), path = require('path'), http = require('http'), { execSync } = require('child_process');
function loadPlaywright() { try { return require('playwright'); } catch (e) {} try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {} return null; }
const pw = loadPlaywright();
if (!pw) { console.log('Format-5-Browsertest übersprungen: Playwright nicht installiert.'); process.exit(0); }
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const serve = () => new Promise(resolve => {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
    const f = path.join(ROOT, path.normalize(p));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); fs.createReadStream(f).pipe(res);
  });
  srv.listen(0, '127.0.0.1', () => resolve(srv));
});
const assert = require('assert');
(async () => {
  const srv = await serve(), url = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await pw.chromium.launch();
  const runs = [['Desktop', { viewport: { width: 1280, height: 900 } }], ['390 px', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]];
  for (const [name, opt] of runs) {
    const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block', timezoneId: 'Europe/Berlin' }, opt)), p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.clock.setFixedTime(new Date('2026-11-20T10:00:00+01:00'));
    await p.goto(url); await p.waitForFunction(() => window.__app && window.__app.Store);
    const id = await p.evaluate(() => {
      const a = window.__app, t = a.silvesterTemplate();
      const fees = Object.fromEntries(['tax', 'cleaning', 'parking', 'wellness', 'mandatory'].map(k => [k, { state: 'included', amount: 0 }]));
      const o = { id: 'ohaus', stayId: t.stayId, name: 'Haus am See', location: 'Füssen', provider: 'direkt', type: 'fewo', start: t.start, end: t.end, persons: t.persons, price: 680, basis: 'stay', url: 'https://example.org/haus', checkedAt: '2026-11-01', validUntil: '2026-12-01', availability: 'available', terms: '', paid: 204, deposit: 0, booked: true,
        features: Object.fromEntries(['sauna', 'kitchen', 'breakfast', 'cancel', 'quiet', 'accessible', 'parking'].map(k => [k, 'unknown'])), fees };
      t.offers = [o]; t.activeOfferId = 'ohaus'; t.schemaVersion = 4; a.validateOffer(o); a.validateExtras(t); a.Store.put(t); return t.id;
    });
    const open = async tab => { await p.evaluate(h => { location.hash = h; }, 'r-' + id + '-' + tab); await p.waitForTimeout(150); };
    await open('kosten');
    await p.waitForSelector('[data-f5-act="cancel-open"]', { state: 'attached' });
    const where = await p.evaluate(() => { const b = document.querySelector('[data-f5-act="cancel-open"]'), out = []; for (let e = b; e; e = e.parentElement) if (e.tagName === 'DETAILS' && !e.open) { out.push((e.querySelector('summary') || {}).textContent); e.open = true; } return out; });
    if (where.length) console.log(name + ': Block liegt in zugeklappter Fläche: ' + where.join(' / '));
    await p.click('[data-f5-act="cancel-open"]');
    await p.fill('#f5-fu-date', '2026-12-01');
    await p.fill('#f5-st-date-0', '2026-12-02'); await p.fill('#f5-st-val-0', '30');
    await p.fill('#f5-src', 'Mail Vermieter');
    assert(await p.isVisible('.sheet >> text=dauerhaft'), name + ': Hinweis zur Umstellung im Formular');
    await p.click('[data-f5-act="cancel-save"]');
    await p.waitForSelector('[data-f5-act="confirm"]'); await p.click('[data-f5-act="confirm"]');
    await p.waitForSelector('[data-f5-offer]');
    const txt = await p.textContent('[data-f5-offer]');
    assert(/noch 11 Tage kostenlos/.test(txt) && /30 % = 204,00 €/.test(txt), name + ': Vorschau ' + txt);
    assert.equal(await p.evaluate(i => window.__app.Store.get(i).schemaVersion, id), 5);
    await p.click('[data-f5-act="plan-open"]');
    await p.fill('#f5-pp-label-0', 'Anzahlung'); await p.fill('#f5-pp-due-0', '2026-11-10'); await p.selectOption('#f5-pp-kind-0', 'pct'); await p.fill('#f5-pp-val-0', '30');
    await p.fill('#f5-pp-label-1', 'Restzahlung'); await p.fill('#f5-pp-due-1', '2026-12-15'); await p.selectOption('#f5-pp-kind-1', 'rest');
    await p.click('[data-f5-act="plan-save"]');
    await p.waitForFunction(() => /Restzahlung/.test((document.querySelector('[data-f5-offer]') || {}).textContent || ''));
    const t2 = await p.textContent('[data-f5-offer]');
    assert(/Anzahlung.*204 €.*bezahlt/.test(t2) && /Restzahlung.*476 €.*offen/.test(t2), name + ': Zahlungsplan ' + t2);
    /* Fehler bleibt im Blatt sichtbar */
    await p.click('[data-f5-act="plan-open"]'); await p.fill('#f5-pp-due-1', ''); await p.click('[data-f5-act="plan-save"]');
    assert(/Rate 2: Bezeichnung und Fälligkeit/.test(await p.textContent('#f5-error')), name + ': Fehlermeldung im Blatt');
    await p.click('[data-act="sheet-x"]');
    /* Fahrplan: Storno-Frist als erledigt markieren und wieder öffnen */
    await open('ueber');
    const ack = '[data-f5-act="ack"][data-id="cancel:stay:0"]';
    await p.waitForSelector(ack, { state: 'attached' });
    if (!(await p.isVisible(ack))) await p.click('[data-next-steps] .nx-more summary');
    await p.click(ack);
    await p.waitForSelector('[data-f5-act="unack"][data-id="cancel:stay:0"]', { state: 'attached' });
    assert.equal(await p.evaluate(i => !!window.__app.Store.get(i).deadlineAck['cancel:stay:0'], id), true);
    /* Aufgabe in der Checkliste anlegen und abhaken */
    await open('check');
    await p.waitForSelector('[data-task-act="new"]', { state: 'attached' });
    await p.click('[data-task-act="new"]');
    await p.fill('#task-title', 'Winterreifen prüfen'); await p.fill('#task-date', '2026-12-20');
    await p.click('[data-task-act="save"]');
    await p.waitForSelector('[data-tasks] [data-task-act="toggle"]');
    await p.check('[data-tasks] [data-task-act="toggle"]');
    await p.waitForFunction(i => { const t = window.__app.Store.get(i); return t.tasks && t.tasks[0].done; }, id);
    /* Teilzahlung: bisherige 204 € werden erste Zahlung */
    await open('kosten');
    await p.evaluate(() => { const b = document.querySelector('[data-f5-act="pay-open"]'); for (let e = b; e; e = e.parentElement) if (e.tagName === 'DETAILS') e.open = true; });
    await p.click('[data-f5-act="pay-open"]');
    await p.fill('#f5-pay-first', '2026-10-20'); await p.fill('#f5-pay-on', '2026-11-18'); await p.fill('#f5-pay-amount', '100');
    await p.click('[data-f5-act="pay-add"]');
    await p.waitForFunction(i => window.__app.Store.get(i).offers[0].paid === 304, id);
    /* Gästekarte als enthalten bestätigen */
    await open('unterkunft');
    const gc = await p.$('[data-f5-gc] summary');
    if (gc) {
      await p.evaluate(() => { const b = document.querySelector('[data-f5-gc]'); for (let e = b; e; e = e.parentElement) if (e.tagName === 'DETAILS') e.open = true; });
      await p.click('[data-f5-gc] summary'); await p.selectOption('#f5-gc-status', 'enthalten'); await p.fill('#f5-gc-note', 'Mail Gastgeber');
      await p.click('[data-f5-act="gc-save"]');
      await p.waitForFunction(i => window.__app.Store.get(i).cardConfirmed === true, id);
    } else console.log(name + ': Unterkunft ohne Gästekarten-Angabe, Schritt übersprungen');
    /* Neuladen behält alles */
    await p.reload(); await p.waitForFunction(() => window.__app && window.__app.Store);
    const kept = await p.evaluate(i => { const t = window.__app.Store.get(i); return [t.schemaVersion, t.offers[0].cancelTerms.steps.length, t.offers[0].payPlan.length, Object.keys(t.deadlineAck), t.tasks.length, t.offers[0].payments.length]; }, id);
    assert.deepEqual(kept, [5, 1, 2, ['cancel:stay:0'], 1, 2]);
    assert.deepEqual(errors, [], name + ': keine Fehler in der Konsole');
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log('Format 5 im Browser (Chromium Desktop und 390 px): Stornobedingungen und Zahlungsplan eintragen, Bestätigung der Umstellung, Vorschau, Fehler im Blatt, Frist erledigt, Aufgabe anlegen und abhaken, Teilzahlung, Gästekarte, Neuladen geprüft. Kein iPhone-/Safari-Test.');
})().catch(e => { console.error(e); process.exit(1); });
