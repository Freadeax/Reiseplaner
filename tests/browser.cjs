/* Klicktest in echtem Chromium (Playwright). Kein iPhone-/Safari-Test.
   Start: npm run test:browser. Ohne installiertes Playwright wird der Test übersprungen.
   Optional: CHROMIUM_PATH=/pfad/zu/chromium */
const fs = require('fs');
const path = require('path');
const http = require('http');
const assert = require('assert');
const { execSync } = require('child_process');

function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return null;
}
const pw = loadPlaywright();
if (!pw) { console.log('Browser-Klicktest übersprungen: Playwright nicht installiert.'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json' };
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p === '/') p = '/index.html';
      const f = path.join(ROOT, path.normalize(p));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const OUT = process.env.SHOT_DIR || '';
const errors = [];
async function shot(p, name) { if (OUT) await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); }
async function noOverflow(p, where) {
  const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(sw <= 0, where + ': horizontal ' + sw + ' px zu breit');
}
const viewText = p => p.textContent('#view');

/* Umkreis-Katalog (#7): Abfahrtsort suchen (Nominatim-Antwort im Test nachgebildet), Bereich, Thema, Ergebnis,
   Reise mit Tagesgerüst anlegen, offener Preis, geschätzte Fahrstrecke, weitere Ideen, Zwischenstopps. */
async function entdecken(browser, base, name, ctxOpts) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block' }, ctxOpts));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(name + ' Entdecken: ' + e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  let geoCalls = 0;
  await p.route(/nominatim\.openstreetmap\.org/, r => { geoCalls++; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ display_name: 'Göppingen, Landkreis Göppingen, Baden-Württemberg, Deutschland', lat: '48.7035', lon: '9.6522' }]) }); });
  await p.goto(base + '/index.html');
  await p.click('header [data-go="entdecken"]');
  await p.waitForSelector('text=Wohin von hier aus?');
  assert.equal(await p.isDisabled('[data-act="cat-search"]'), true, name + ': Suche ohne Abfahrtsort gesperrt');
  await noOverflow(p, name + ' Entdecken leer');
  await p.fill('#cat-q', 'Göppingen');
  await p.click('[data-act="cat-geo-search"]');
  await p.waitForSelector('[data-act="cat-pick"]');
  assert.equal(geoCalls, 1, name + ': Ortssuche nur auf Knopfdruck');
  await p.click('[data-act="cat-pick"][data-val="1"]');
  assert((await viewText(p)).includes('Start: Göppingen, Landkreis Göppingen'), name + ': Abfahrtsort übernommen');
  await p.click('[data-act="cat-kind"][data-val="burg"]');
  await p.click('[data-act="cat-search"]');
  await p.waitForSelector('#cat-results');
  let txt = await viewText(p);
  assert(txt.includes('Bad Urach') && txt.includes('Offline-Kopie in der App'), name + ': Treffer und Quelle');
  assert(!txt.includes('Rügen'), name + ': nichts außerhalb des Bereichs');
  await noOverflow(p, name + ' Entdecken Ergebnisse');
  await p.click('[data-act="cat-open"][data-val="bad-urach"]');
  await p.waitForSelector('#cat-stops >> text=kurze Strecken');
  await p.waitForSelector('#cat-near input[data-cs]');
  const pre = await p.$$eval('.sheet input[data-cs]:checked', l => l.length);
  assert(pre >= 2, name + ': Ideen vorausgewählt');
  /* Kombi-Tagesidee: setzt beide Häkchen; danach am selben Tag geplant */
  const combo = await p.getAttribute('[data-act="cat-combo"] >> nth=0', 'data-val');
  await p.click('[data-act="cat-combo"] >> nth=0');
  for (const id of combo.split('|')) assert(await p.isChecked('[data-cs="' + id + '"]'), name + ': Kombi-Häkchen');
  await p.check('#cat-near input[data-cs] >> nth=0');
  await p.fill('#cat-n', '1');
  await p.click('[data-act="cat-create"]');
  await p.waitForSelector('.tabs');
  assert(/#r-[a-z0-9]+-plan$/.test(p.url()), name + ': nach Anlegen im Tagesplan');
  const items = await p.$$eval('.item[data-act="item"]', l => l.length);
  const comboNames = await p.evaluate(ids => ids.map(id => { for (const pl of window.RP_CATALOG.places) for (const sp of pl.spots) if (sp.id === id) return sp.name; return null; }), combo.split('|'));
  const comboDays = await p.$$eval('.dcol', (cols, names) => names.map(nm => cols.findIndex(c => c.textContent.includes(nm))), comboNames);
  assert(comboDays[0] >= 0 && comboDays[0] === comboDays[1], name + ': Kombi am selben Tag ' + JSON.stringify(comboDays));

  assert(items >= 2, name + ': Tagesgerüst angelegt');
  await noOverflow(p, name + ' Katalogreise Tagesplan');
  await p.click('.tab[data-go$="-ueber"]');
  txt = await viewText(p);
  assert(txt.includes('Fahrstrecke geschätzt') && txt.includes('ohne Preis'), name + ': Plan-Check meldet Schätzung und offene Preise');
  await p.click('.tab[data-go$="-unternehmen"]');
  assert((await viewText(p)).includes('Preis offen, vor Ort prüfen'), name + ': offener Preis statt kostenlos');
  await p.click('[data-act="act-view"] >> nth=0');
  await p.fill('#ap-cost', '7');
  await p.click('[data-act="act-price"]');
  assert((await viewText(p)).includes('7 € p. P.'), name + ': eingetragener Preis');
  await p.click('[data-act="cat-trip-ideas"]');
  await p.waitForSelector('#cat-trip-ideas input[data-cs]');
  await p.check('#cat-trip-ideas input[data-cs] >> nth=0');
  const before = await p.$$eval('[data-act="act-view"]', l => l.length);
  await p.click('[data-act="cat-trip-add"]');
  assert.equal(await p.$$eval('[data-act="act-view"]', l => l.length), before + 1, name + ': weitere Idee hinzugefügt');
  /* v3.2 Tagesplan: Auslastung sichtbar, Tag tauschen über ein Blatt, Lücken füllen mit Katalog-Ideen */
  await p.click('.tab[data-go$="-plan"]');
  assert((await p.textContent('.board')).includes('Std.'), name + ': Auslastung je Tag');
  const day0 = await p.$$eval('.dcol', cols => cols[0].querySelectorAll('.item:not(.fixed)').length);
  await p.click('[data-act="day-swap-open"][data-val="0"]');
  await p.click('[data-act="day-swap"][data-val="0|1"]');
  const day1after = await p.$$eval('.dcol', cols => cols[1].querySelectorAll('.item:not(.fixed)').length);
  assert.equal(day1after, day0, name + ': Tag getauscht');
  const before2 = await p.$$eval('.item[data-act="item"]', l => l.length);
  await p.click('[data-act="plan-fill"]');
  await p.waitForSelector('#fill-box input[data-fill], #fill-box p:not([role])');
  assert(await p.$('#fill-box input[data-fill]'), name + ': Lücken-Vorschläge'); {
    await p.click('[data-act="plan-fill-do"]');
    assert((await p.$$eval('.item[data-act="item"]', l => l.length)) > before2, name + ': Lücken gefüllt');
  }
  await noOverflow(p, name + ' Tagesplan v3.2');
  /* Regenzwilling: Draußen-Punkt antippen, Alternative zeigen und tauschen */
  const outdoor = await p.$$eval('.item[data-act="item"]', l => l.map(b => b.textContent));
  const wf = outdoor.findIndex(x => /Wasserfall|Hohenurach|Lichtenstein/.test(x));
  assert(wf >= 0, name + ': Draußen-Punkt im Plan'); {
    await p.click('.item[data-act="item"] >> nth=' + wf);
    await p.click('[data-act="rain-twin"]');
    await p.waitForSelector('[data-act="rain-swap"]');
    await p.click('[data-act="rain-swap"] >> nth=0');
    assert((await p.textContent('.board')).match(/AlbThermen|Bärenhöhle|Thermen/), name + ': Regenzwilling eingeplant');
  }
  /* v3.2 Entdecken: Merkliste, Textfilter, Karte, Rundreise */
  await p.click('header [data-go="entdecken"]');
  await p.click('[data-act="cat-search"]');
  await p.waitForSelector('#cat-results .catmap svg');
  await p.click('[data-act="cat-fav"][data-val="bad-urach"]');
  await p.click('summary:has-text("Wann wohin?")');
  await p.click('[data-act="cat-month"][data-val="1"]');
  assert.equal(await p.getAttribute('[data-act="cat-month"][data-val="1"]', 'aria-pressed'), 'true', name + ': Monat übernommen');
  assert.equal(await p.inputValue('[data-cf="month"]'), '1', name + ': Monatsfilter gesetzt');
  await p.click('summary:has-text("Wann wohin?")');
  await p.click('[data-act="cat-month"][data-val="1"]');
  assert((await viewText(p)).includes('Merkliste „Irgendwann mal“'), name + ': Merkliste');
  await p.fill('[data-cf="q"]', 'Wasserfall'); await p.press('[data-cf="q"]', 'Enter');
  await p.waitForSelector('text=/passen zu „Wasserfall“/');
  await p.click('[data-act="cat-q-clear"] >> nth=0').catch(() => {});
  await p.fill('[data-cf="q"]', ''); await p.press('[data-cf="q"]', 'Enter');
  await p.click('[data-act="cat-range"][data-val="lang"]');
  await p.click('[data-act="cat-search"]');
  await p.waitForSelector('#cat-results [data-act="cat-tour"]');
  const tourIds = await p.$$eval('#cat-results [data-act="cat-tour"]', l => l.slice(0, 3).map(b => b.getAttribute('data-val')));
  for (const id of tourIds) await p.click('[data-act="cat-tour"][data-val="' + id + '"]');
  await p.click('[data-act="cat-tour-open"]');
  await p.waitForSelector('.sheet input[data-tn]');
  assert((await p.textContent('.sheet')).includes('Heimfahrt'), name + ': Rundreise mit Heimfahrt');
  await p.click('[data-act="cat-tour-create"]');
  await p.waitForSelector('.tabs');
  assert(/#r-[a-z0-9]+-plan$/.test(p.url()), name + ': Rundreise im Tagesplan');
  assert((await p.textContent('.board')).includes('Weiterfahrt nach'), name + ': Weiterfahrt eingeplant');
  await p.click('.tab[data-go$="-ueber"]');
  assert((await viewText(p)).includes('Etappen'), name + ': Etappen im Überblick');
  await p.click('.tab[data-go$="-check"]');
  assert((await viewText(p)).includes('für eure Unternehmungen'), name + ': Packhinweise aus dem Katalog');
  await noOverflow(p, name + ' Rundreise');
  /* Weite Strecke mit Zwischenstopps; Filter bleiben nach Neuladen erhalten */
  await p.click('header [data-go="entdecken"]');
  await p.click('[data-act="cat-kind"][data-val="burg"]');
  await p.click('[data-act="cat-range"][data-val="weit"]');
  await p.click('[data-act="cat-search"]');
  await p.waitForSelector('[data-act="cat-open"][data-val="berlin"]');
  await p.click('[data-act="cat-open"][data-val="berlin"]');
  await p.waitForSelector('#cat-stops input[data-cs]');
  await p.click('[data-act="sheet-x"]');
  await p.reload();
  await p.click('header [data-go="entdecken"]');
  txt = await viewText(p);
  assert(txt.includes('Start: Göppingen') && await p.getAttribute('[data-act="cat-range"][data-val="weit"]', 'aria-pressed') !== 'false', name + ': Abfahrtsort und Bereich gemerkt');
  await ctx.close();
}

async function run(browser, base, name, ctxOpts, now) {
  const ctx = await browser.newContext(Object.assign({ acceptDownloads: true, serviceWorkers: 'block' }, ctxOpts));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(name + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(name + ' Konsole: ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.clock.setFixedTime(now);
  await p.goto(base + '/index.html');
  assert((await viewText(p)).includes('Meine Reisen'), name + ': Startansicht');
  await noOverflow(p, name + ' Start');

  /* Neue Reise mit festem Datum, ohne Katalog */
  await p.click('[data-go="neu"]');
  await p.fill('#draft [data-f="title"]', 'Wien Test');
  await p.click('[data-act="d-dm"][data-val="fix"]');
  await p.fill('#draft [data-f="start"]', '2027-05-01');
  await p.fill('#draft [data-f="end"]', '2027-05-04');
  await p.fill('#draft [data-f="persons"]', '3');
  await p.click('[data-act="create"]');
  await p.waitForSelector('text=Wien Test');
  assert(/\/?#r-[a-z0-9]+-unterkunft$/.test(p.url()), name + ': nach Anlegen nicht im Bereich Unterkunft');
  await p.fill('[data-f="dest"]', 'Wien');
  await p.press('[data-f="dest"]', 'Tab');
  await p.click('summary:has-text("Eigene Unterkunft")');
  await p.fill('#cs-name', 'Testpension');
  await p.fill('#cs-price', '100');
  await p.check('#cs-kitchen');
  await p.click('[data-act="stay-add"]');
  assert((await viewText(p)).includes('Testpension'), name + ': eigene Unterkunft fehlt');

  /* Eigene Unternehmung anlegen und einplanen */
  await p.click('.tab[data-go$="-unternehmen"]');
  await p.click('summary:has-text("Eigene Unternehmung")');
  await p.fill('#ca-t', 'Stephansdom');
  await p.fill('#ca-cost', '6');
  await p.fill('#ca-hours', '1.5');
  await p.check('#ca-indoor');
  await p.fill('#ca-bring', 'Wasserflasche\nJacke');
  await p.click('[data-act="act-add"]');
  assert((await viewText(p)).includes('ca. 1,5 Std.'), name + ': eigene Dauer fehlt');
  assert((await viewText(p)).includes('drinnen'), name + ': eigene Indoor-Eignung fehlt');
  await p.click('[data-act="plan-act"]');
  await p.selectOption('#pl-day', '1');
  await p.selectOption('#pl-slot', 'morgen');
  await p.click('[data-act="plan-do"]');
  await p.click('.tab[data-go$="-plan"]');
  assert((await viewText(p)).includes('Stephansdom'), name + ': Punkt nicht im Tagesplan');
  await noOverflow(p, name + ' Tagesplan');
  /* Verschieben über das Blatt, nicht per Drag-and-drop */
  await p.click('.item[data-act="item"]');
  await p.selectOption('#mv-slot', 'abend');
  await p.click('[data-act="item-move"]');
  const slots = await p.$$eval('.dcol', cols => cols.map(c => c.textContent));
  assert(slots[1].includes('Stephansdom'), name + ': Verschieben fehlgeschlagen');

  /* Kosten: 3 Personen × 6 € = 18 € */
  await p.click('.tab[data-go$="-kosten"]');
  assert((await viewText(p)).includes('Drei Kostenszenarien'), name + ': Szenariovergleich fehlt');
  assert((await viewText(p)).includes('18 €'), name + ': Kosten der eigenen Unternehmung fehlen');
  assert((await viewText(p)).includes('300 €'), name + ': Unterkunft 3 Nächte × 100 € fehlt');
  await p.fill('#xc-t', 'Parken');
  await p.fill('#xc-c', '25');
  await p.click('[data-act="xc-add"]');
  assert((await viewText(p)).includes('Parken'), name + ': eigener Kostenposten fehlt');
  await p.click('[data-act="puffer"][data-val="10"]');
  assert((await viewText(p)).includes('Puffer 10 %'), name + ': Puffer fehlt');
  await noOverflow(p, name + ' Kosten');
  /* Spartipp: Vorschau statt sofortigem Ändern, Abbrechen bleibt verlustfrei. */
  await p.click('[data-act="food"][data-val="auswaerts"]');
  const foodState = () => p.evaluate(() => JSON.parse(localStorage.getItem('rp-trips'))[location.hash.split('-')[1]].food);
  await p.click('[data-act="tip"] >> nth=0');
  assert((await p.textContent('.sheet')).includes('Plan vorher') && (await p.textContent('.sheet')).includes('Plan danach'), name + ': Änderungsvorschau fehlt');
  assert.equal(await foodState(), 'auswaerts', name + ': Vorschau hat schon geändert');
  await p.click('[data-act="sheet-x"]');
  assert.equal(await foodState(), 'auswaerts', name + ': Abbrechen hat geändert');
  await p.click('[data-act="tip"] >> nth=0');
  await p.click('[data-act="tip-confirm"]');
  assert.equal(await foodState(), 'selbst', name + ': Spartipp nicht übernommen');

  /* Zahlungsbuch: Stephansdom (3 × 6 € = 18 €) gebucht für 20 €, 20 € bezahlt; Überzahlung wird abgewiesen */
  await p.click('summary:has-text("Posten bearbeiten")');
  const sk = await p.getAttribute('[data-ledger^="act:"][data-ledger-f="status"] >> nth=0', 'data-ledger');
  await p.selectOption('[data-ledger="' + sk + '"][data-ledger-f="status"]', 'gebucht');
  await p.fill('[data-ledger="' + sk + '"][data-ledger-f="amount"]', '20');
  await p.press('[data-ledger="' + sk + '"][data-ledger-f="amount"]', 'Tab');
  const tripId = () => p.evaluate(() => location.hash.split('-')[1]);
  const ledger = async () => { const id = await tripId(); return p.evaluate(id => JSON.parse(localStorage.getItem('rp-trips'))[id].ledger || {}, id); };
  assert.equal((await ledger())[sk].amount, 20, name + ': Buchungsbetrag nicht gespeichert');
  assert((await viewText(p)).includes('laut eurer Buchung'), name + ': Kostenzeile nicht ersetzt');
  if (!(await p.isVisible('[data-ledger="' + sk + '"][data-ledger-f="paid"]'))) await p.click('summary:has-text("Posten bearbeiten")');
  await p.fill('[data-ledger="' + sk + '"][data-ledger-f="paid"]', '25');
  await p.press('[data-ledger="' + sk + '"][data-ledger-f="paid"]', 'Tab');
  assert.equal((await ledger())[sk].paid, 0, name + ': Überzahlung wurde gespeichert');
  if (!(await p.isVisible('[data-ledger="' + sk + '"][data-ledger-f="paid"]'))) await p.click('summary:has-text("Posten bearbeiten")');
  await p.fill('[data-ledger="' + sk + '"][data-ledger-f="paid"]', '20');
  await p.press('[data-ledger="' + sk + '"][data-ledger-f="paid"]', 'Tab');
  assert.equal((await ledger())[sk].paid, 20, name + ': Zahlung nicht gespeichert');
  assert(/Bezahlt\s*20 €/.test(await p.textContent('.kpis >> nth=-1')) || (await viewText(p)).includes('Vollständig bezahlt'), name + ': Zahlungsstand fehlt');
  await noOverflow(p, name + ' Zahlungsbuch');

  /* Checkliste */
  await p.click('.tab[data-go$="-check"]');
  await p.fill('#cc-t', 'Reisepass prüfen');
  await p.click('[data-act="cc-add"]');
  const box = p.locator('label:has-text("Reisepass prüfen") input');
  await box.check();
  assert(await box.isChecked(), name + ': Checkliste nicht abgehakt');

  /* Notizen und Mappe */
  await p.click('.tab[data-go$="-notiz"]');
  await p.fill('[data-f="notes"]', 'Buchung ABC-123');
  await p.click('.tab[data-go$="-mappe"]');
  assert(!(await viewText(p)).includes('ABC-123'), name + ': Notizen ohne Häkchen in der Mappe');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="mappe-ics"]')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  assert(ics.includes('DTSTART;VALUE=DATE:20270501') && ics.includes('DTEND;VALUE=DATE:20270505'), name + ': ICS-Zeitraum');
  assert(ics.includes('SUMMARY:Stephansdom') && ics.includes('DTSTART:20270502T180000'), name + ': ICS-Termin');
  await noOverflow(p, name + ' Mappe');

  /* Eckdaten ändern: neue Daten setzen das Unterkunftsangebot zurück */
  await p.click('[data-act="edit-trip"]');
  await p.fill('#editform [data-f="end"]', '2027-05-06');
  await p.click('[data-act="edit-save"]');
  assert((await viewText(p)).includes('5 Nächte'), name + ': Eckdaten nicht übernommen');

  /* Unterwegs-Ansicht: simuliertes Datum 02.05.2027 liegt in der Reise */
  await p.click('.tab[data-go$="-ueber"]');
  const today = await viewText(p);
  assert(today.includes('unterwegs · Tag 2 von 6') && today.includes('Heute ·'), name + ': Phase/Heute fehlt');
  assert(/Heute ·[\s\S]*Stephansdom[\s\S]*Morgen ·/.test(today), name + ': heutiger Punkt fehlt im Heute-Block');

  /* Reise mit Ideen-Katalog: Angebot übernehmen, Plan B, Packliste aus dem Plan */
  await p.click('[data-go="reisen"] >> nth=0');
  await p.click('[data-go="neu"]');
  await p.fill('#draft [data-f="title"]', 'Katalogreise');
  await p.click('[data-act="d-type"][data-val="winter"]');
  await p.click('[data-act="d-catalog"][data-val="allgaeu"]');
  await p.click('[data-act="d-dm"][data-val="fix"]');
  await p.fill('#draft [data-f="start"]', '2027-05-01');
  await p.fill('#draft [data-f="end"]', '2027-05-05');
  await p.click('[data-act="create"]');
  assert(/-angebote$/.test(p.url()), name + ': Katalogreise nicht bei den Angeboten');
  await p.click('[data-act="pkg-ask"] >> nth=0');
  await p.click('[data-act="pkg-apply"]');
  assert(/-plan$/.test(p.url()), name + ': Angebot nicht übernommen');
  await p.click('.tab[data-go$="-ueber"]');
  assert((await viewText(p)).includes('unterwegs · Tag 2 von 5'), name + ': Phase der Katalogreise');
  await shot(p, name + '-heute');
  await p.click('summary:has-text("Plan B")');
  const idea = await p.getAttribute('[data-act="rain-plan"] >> nth=0', 'data-val');
  assert(idea && idea.endsWith('|1'), name + ': Plan B fehlt für heute');
  const count = () => p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('rp-trips'))).find(x => x.title === 'Katalogreise').items.length);
  const before = await count();
  await p.click('[data-act="rain-plan"] >> nth=0');
  assert.equal(await p.inputValue('#pl-day'), '1', name + ': Plan B nicht auf heute vorbelegt');
  await p.click('[data-act="plan-do"]');
  assert.equal(await count(), before + 1, name + ': Plan B nicht eingeplant');
  await p.click('.tab[data-go$="-check"]');
  assert((await viewText(p)).includes('für eure Unternehmungen'), name + ': Packliste aus dem Plan fehlt');
  for (const tab of ['ueber', 'angebote', 'unterkunft', 'unternehmen', 'plan', 'kosten', 'check', 'notiz', 'mappe']) {
    await p.click('.tab[data-go$="-' + tab + '"]');
    await noOverflow(p, name + ' Reiter ' + tab);
  }

  /* Suchzentrale: Anbieterlinks, Muss/Wunsch, Profile, Angebot, Vergleich und Zahlungen. */
  await p.click('.tab[data-go$="-suche"]');
  assert((await viewText(p)).includes('Airbnb') && (await viewText(p)).includes('CHECK24'), name + ': Anbieter fehlen');
  await p.fill('[data-search="destination"]', 'Oberjoch');
  await p.press('[data-search="destination"]', 'Tab');
  const booking = await p.getAttribute('a[href*="booking.com/searchresults"]', 'href');
  assert(booking.includes('checkin=2027-05-01') && booking.includes('group_adults=2'), name + ': Anbieterparameter');
  await p.fill('#profile-name', 'Unser Profil');
  await p.click('[data-search-act="profile-save"]');
  assert((await viewText(p)).includes('Unser Profil'), name + ': Profil nicht gespeichert');
  await p.click('[data-search-act="offer-new"]');
  for (const [field, value] of [['name','Finder Testhotel'], ['location','Oberjoch'], ['price','480'], ['url','https://www.booking.com/test'], ['paid','100'], ['deposit','150']]) {
    await p.fill('[data-offer="' + field + '"]', value);
  }
  await p.selectOption('[data-offer="availability"]', 'available');
  await p.selectOption('[data-offer-feature="sauna"]', 'yes');
  for (const fee of ['tax','cleaning','parking','wellness','mandatory']) await p.selectOption('[data-offer-fee="' + fee + '"]', fee === 'cleaning' ? 'extra' : 'included');
  await p.fill('[data-offer-amount="cleaning"]', '40');
  await p.click('[data-search-act="offer-save"]');
  assert((await viewText(p)).includes('Finder Testhotel') && (await viewText(p)).includes('520 €'), name + ': Angebotsbetrag');
  await p.click('[data-search-act="favorite"]');
  await p.click('[data-search-act="compare"]');
  assert((await viewText(p)).includes('420 €'), name + ': Restzahlung im Vergleich');
  await noOverflow(p, name + ' Suchzentrale und Vergleich');
  await p.selectOption('[data-criterion="kitchen"]', 'must');
  assert((await viewText(p)).includes('Kein Angebot erfüllt alle Filter'), name + ': unbekannte Küche erfüllt Muss');
  await p.selectOption('[data-criterion="kitchen"]', 'any');
  await p.click('[data-search-act="offer-use"]');
  await p.click('[data-search-act="offer-use-yes"]');
  await p.click('.tab[data-go$="-kosten"]');
  assert((await viewText(p)).includes('Unterkunft: Buchung & Zahlungen') && (await viewText(p)).includes('420 €'), name + ': Zahlungsansicht fehlt');
  await p.click('.tab[data-go$="-suche"]');
  await p.click('[data-search-act="history"]');
  assert((await p.textContent('.sheet')).includes('Als Datei herunterladen'), name + ': Sicherungspunkte fehlen');
  await p.click('[data-act="sheet-x"]');
  await p.reload();
  assert((await viewText(p)).includes('Finder Testhotel') && (await viewText(p)).includes('Unser Profil'), name + ': Finder nach Neuladen verloren');

  /* Übersicht: laufende Reise nicht als vorbei */
  await p.click('[data-go="reisen"] >> nth=0');
  const list = await viewText(p);
  assert(list.includes('unterwegs · Tag 2 von 6') && list.includes('unterwegs · Tag 2 von 5') && !list.includes('vorbei'), name + ': Status in der Übersicht');
  assert.equal(await p.locator('.card.click').count(), 2);

  /* Sicherung und Import ohne Überschreiben */
  const [bk] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="backup-all"]')]);
  const backupFile = await bk.path();
  assert.equal(JSON.parse(fs.readFileSync(backupFile, 'utf8')).trips.length, 2);
  /* Altdateien bleiben importierbar; neue Sicherungen brauchen kein Passwort. */
  assert.equal(await p.locator('[data-secure-act="all"]').count(), 0, name + ': Passwortexport weiterhin im Hauptablauf');
  const encrypted = await p.evaluate(async () => {
    const a=window.__app;
    return a.encryptBackup(a.backupData(a.Store.list()), 'Testpassphrase 123!');
  });
  const encryptedBytes = Buffer.from(JSON.stringify(encrypted));
  assert.equal(encrypted.format, 'reiseplaner-encrypted-backup');
  const beforeEncryptedImport = await p.evaluate(() => localStorage.getItem('rp-trips'));
  await p.setInputFiles('#import-file', { name: 'geschuetzt.json', mimeType: 'application/json', buffer: encryptedBytes });
  await p.fill('#secure-import-password', 'Falsches Passwort');
  await p.click('[data-secure-act="decrypt"]');
  await p.waitForSelector('#secure-error:has-text("Passwort falsch")');
  assert.equal(await p.evaluate(() => localStorage.getItem('rp-trips')), beforeEncryptedImport, name + ': Falsches Passwort hat Daten geändert');
  await p.fill('#secure-import-password', 'Testpassphrase 123!');
  await p.click('[data-secure-act="decrypt"]');
  await p.waitForSelector('text=Passwortschutz geöffnet');
  assert((await p.textContent('.sheet')).includes('identischer Inhalt'), name + ': Importvorschau fehlt');
  await noOverflow(p, name + ' Passwort-Importvorschau');
  await p.click('[data-act="import-skip"]');
  assert.equal(await p.locator('.card.click').count(), 2, name + ': Verschlüsselter Import dupliziert');
  await p.setInputFiles('#import-file', { name: 'b.json', mimeType: 'application/json', buffer: fs.readFileSync(backupFile) });
  await p.click('[data-act="import-skip"]');
  assert.equal(await p.locator('.card.click').count(), 2, name + ': Import hat dupliziert');
  await p.setInputFiles('#import-file', { name: 'b.json', mimeType: 'application/json', buffer: fs.readFileSync(backupFile) });
  await p.click('[data-act="import-copy"]');
  assert.equal(await p.locator('.card.click').count(), 4, name + ': Import als Kopie');

  /* Duplizieren und Löschen mit Rückfrage */
  await p.click('.card.click >> nth=0');
  await p.click('[data-act="del"]');
  await p.click('[data-act="del-yes"]');
  assert.equal(await p.locator('.card.click').count(), 3, name + ': Löschen');

  /* Speicher bleibt nach Neuladen erhalten */
  await p.reload();
  assert.equal(await p.locator('.card.click').count(), 3, name + ': Daten nach Neuladen');

  /* Tagesausflug: Anreise = Abreise, keine Unterkunftspflicht */
  await p.click('[data-go="neu"]');
  await p.fill('#draft [data-f="title"]', 'Bodensee');
  await p.click('[data-act="d-type"][data-val="tag"]');
  await p.click('[data-act="d-dm"][data-val="fix"]');
  await p.fill('#draft [data-f="start"]', '2027-06-05');
  await p.fill('#draft [data-f="end"]', '2027-06-05');
  await p.click('[data-act="create"]');
  await p.click('.tab[data-go$="-ueber"]');
  const dayView = await viewText(p);
  assert(dayView.includes('0 Nächte') && !dayView.includes('Unterkunft fehlt') && !dayView.includes('Noch keine Unterkunft'), name + ': Tagesausflug');

  /* Startvorlagen: neutrale Vorlage und Winter-Katalogvorlage, keine Silvester-Pflicht */
  await p.click('[data-go="reisen"] >> nth=0');
  await p.click('summary:has-text("Mit einer Vorlage starten")');
  assert.equal(await p.locator('[data-act="tpl"]').count() >= 5, true, name + ': zu wenige Vorlagen');
  await p.click('[data-act="tpl"][data-val="stadt"]');
  assert(/-unterkunft$/.test(p.url()), name + ': Städtereise-Vorlage nicht bei der Unterkunft');
  await p.click('.tab[data-go$="-ueber"]');
  const tplView = await viewText(p);
  assert(tplView.includes('Städtereise') && tplView.includes('3 Nächte'), name + ': Städtereise-Vorlage');
  await p.click('[data-go="reisen"] >> nth=0');
  await p.click('summary:has-text("Mit einer Vorlage starten")');
  await p.click('[data-act="tpl"][data-val="winter"]');
  assert(/-angebote$/.test(p.url()), name + ': Winter-Vorlage nicht bei den Angeboten');
  await noOverflow(p, name + ' Vorlage Winter');

  /* Beschädigter Speicher wird nicht überschrieben */
  await p.evaluate(() => localStorage.setItem('rp-trips', '{kaputt'));
  await p.reload();
  assert((await viewText(p)).includes('Rohdaten sichern'), name + ': Rettungshinweis fehlt');
  await p.click('[data-go="neu"]').catch(() => {});
  assert.equal(await p.evaluate(() => localStorage.getItem('rp-trips')), '{kaputt', name + ': Rohdaten überschrieben');
  await ctx.close();
}

async function offline(browser, base) {
  if (!fs.existsSync(path.join(ROOT, 'sw.js'))) return;
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push('offline: ' + e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await p.goto(base + '/index.html');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload();
  await p.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await ctx.setOffline(true);
  await p.reload();
  assert((await viewText(p)).includes('Meine Reisen'), 'offline: App startet ohne Netz nicht');
  /* Reisedaten bleiben ohne Netz bearbeitbar und gehen nicht verloren */
  await p.click('[data-go="neu"]');
  await p.fill('#draft [data-f="title"]', 'Offline angelegt');
  await p.click('[data-act="create"]');
  await p.reload();
  assert((await viewText(p)).includes('Offline angelegt'), 'offline: Reise nach Neuladen weg');
  await ctx.close();
  console.log('Offline-Start über Service Worker geprüft.');
}

(async () => {
  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await pw.chromium.launch(exe ? { executablePath: exe } : {});
  const now = new Date('2027-05-02T10:00:00');
  try {
    await run(browser, base, 'desktop', { viewport: { width: 1280, height: 900 } }, now);
    await run(browser, base, 'mobil', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, now);
    await run(browser, base, 'dunkel-schmal', { viewport: { width: 320, height: 640 }, colorScheme: 'dark' }, now);
    await entdecken(browser, base, 'desktop', { viewport: { width: 1280, height: 900 } });
    await entdecken(browser, base, 'dunkel-schmal', { viewport: { width: 320, height: 640 }, colorScheme: 'dark' });
    await offline(browser, base);
  } finally {
    await browser.close();
    srv.close();
  }
  if (errors.length) { console.error('JavaScript-Fehler:\n' + errors.join('\n')); process.exit(1); }
  console.log('Browser-Klicktest (Chromium: Desktop, Mobilbreite, 320 px dunkel; Umkreis-Katalog Desktop und 320 px) bestanden.');
})().catch(e => { console.error(e); process.exit(1); });


