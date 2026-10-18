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
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json' };
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
// Die sichtbare Navigation verwenden: mobile Auswahl oder Desktop-Seitenleiste.
async function tripTab(p,tab){
 if(await p.isVisible('#trip-area'))await p.selectOption('#trip-area',tab);
 else await p.click('.tab[data-go$="-'+tab+'"]');
}
async function planClick(p,selector){
 const target=p.locator(selector).first();
 const day=await target.evaluate(el=>{const col=el.closest('.dcol[data-day]');return col?col.getAttribute('data-day'):null});
 if(day!==null&&await p.isVisible('#plan-day'))await p.selectOption('#plan-day',day);
 /* Werkzeuge im aufklappbaren Tageskopf: erst öffnen */
 if(await target.evaluate(el=>!!el.closest('details.dmore:not([open])')))await p.locator('.dcol[data-day="'+day+'"] .dmore summary').click();
 await p.click(selector);
}
async function shot(p, name) { if (OUT) await p.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); }
async function noOverflow(p, where) {
  const sw = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert(sw <= 0, where + ': horizontal ' + sw + ' px zu breit');
}
const viewText = p => p.textContent('#view');

/* Umkreis-Katalog (#7): Abfahrtsort suchen (Nominatim-Antwort im Test nachgebildet), Bereich, Thema, Ergebnis,
   Reise mit Tagesgerüst anlegen, offener Preis, geschätzte Fahrstrecke, weitere Ideen, Zwischenstopps. */
async function entdecken(browser, base, name, ctxOpts) {
  const ctx = await browser.newContext(Object.assign({ serviceWorkers: 'block', acceptDownloads: true }, ctxOpts));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(name + ' Entdecken: ' + e.message));
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  let geoCalls = 0;
  await p.route(/nominatim\.openstreetmap\.org/, r => { geoCalls++; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ display_name: 'Göppingen, Landkreis Göppingen, Baden-Württemberg, Deutschland', lat: '48.7035', lon: '9.6522' }]) }); });
  await p.goto(base + '/index.html');
  /* P0.6: Das Stylesheet liegt in app.css und muss geladen und angewendet sein (falscher MIME-Typ ließe es still fallen). */
  assert(await p.evaluate(() => [...document.styleSheets].some(s => /\/app\.css(\?|$)/.test(s.href || '') && s.cssRules.length > 100) && getComputedStyle(document.querySelector('.skip-link')).position !== 'static'), name + ': app.css angewendet');
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
  assert.equal(await p.locator('[data-profile-kind]').count(),await p.evaluate(()=>window.__app.catMoodKeys().length),name+': alle verfügbaren Wunschkarten');
  await p.click('[data-act="cat-preset"][data-val="paar"]');
  assert.equal(await p.inputValue('[data-cf="nights"]'),'2',name+': Schnellprofil setzt Dauer');
  await p.selectOption('[data-profile-kind="natur"]','must');
  await p.selectOption('[data-profile-kind="stadt"]','avoid');
  await p.reload();
  assert.equal(await p.inputValue('[data-profile-kind="natur"]'),'must',name+': unbedingt bleibt nach Neuladen');
  assert.equal(await p.inputValue('[data-profile-kind="stadt"]'),'avoid',name+': lieber nicht bleibt nach Neuladen');
  await p.click('[data-act="cat-preset"][data-val="kultur"]');
  await p.click('[data-act="cat-profile-undo"]');
  assert.equal(await p.inputValue('[data-profile-kind="natur"]'),'must',name+': Profilrücknahme stellt eigene Wünsche wieder her');
  await p.click('[data-act="cat-wish-remove"][data-val="kind:stadt"]');
  assert.equal(await p.inputValue('[data-profile-kind="stadt"]'),'',name+': Einzelwunsch entfernt');
  assert.equal(await p.inputValue('[data-profile-kind="natur"]'),'must',name+': andere Wünsche erhalten');
  await p.click('[data-act="cat-mood-mode"][data-val="deck"]');
  await p.click('[data-act="cat-vote"][data-val="natur|avoid"]');
  assert((await p.textContent('.mood-deck')).includes('Karte 2 von '+await p.evaluate(()=>window.__app.catMoodKeys().length)),name+': Stapel geht weiter');
  await p.click('[data-act="cat-deck-back"]');
  await p.click('[data-act="cat-vote"][data-val="natur|like"]');
  await p.click('[data-act="cat-mood-mode"][data-val="cards"]');
  assert.equal(await p.inputValue('[data-profile-kind="natur"]'),'like',name+': Stapel und Karten teilen ein Profil');
  await noOverflow(p,name+' Wunschprofil');
  await p.click('[data-act="cat-profile-clear"]');
  await p.selectOption('[data-profile-kind="burg"]','like');
  await p.click('[data-act="cat-search"]');
  await p.waitForSelector('#cat-results');
  let txt = await viewText(p);
  assert(txt.includes('Bad Urach') && txt.includes('Offline-Kopie in der App'), name + ': Treffer und Quelle');
  assert(!txt.includes('Rügen'), name + ': nichts außerhalb des Bereichs');
  await p.selectOption('[data-profile-field="travel"]','flug');
  await p.fill('[data-profile-field="maxMin"]','90');await p.press('[data-profile-field="maxMin"]','Tab');
  await p.check('[data-cf="mustOnly"]');
  assert((await p.textContent('#cat-results')).includes('Kein Ziel erfüllt derzeit alle Muss-Wünsche'),name+': unbekannte Flugdauer erfüllt kein Muss');
  assert.equal(await p.locator('#cat-results [data-act="cat-open"]').count(),0,name+': Muss-Filter zeigt keine unbelegten Treffer');
  await p.click('[data-act="cat-must-all"]');
  assert(await p.isVisible('[data-act="cat-open"][data-val="bad-urach"]'),name+': Alternativen wieder sichtbar');
  await p.click('[data-act="cat-wish-remove"][data-val="field:maxMin"]');
  await p.click('[data-act="cat-wish-remove"][data-val="field:travel"]');
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
  /* Gesamtdatei oder geladene Kacheln (Katalog K1: Direktlinks laden nur eine Kachel) */
  const comboNames = await p.evaluate(ids => { const all = [].concat(window.RP_CATALOG ? window.RP_CATALOG.places : [], ...Object.values(window.RP_CATALOG_TILES || {}).map(t => t.places)); return ids.map(id => { for (const pl of all) for (const sp of pl.spots) if (sp.id === id) return sp.name; return null; }); }, combo.split('|'));
  const comboDays = await p.$$eval('.dcol', (cols, names) => names.map(nm => cols.findIndex(c => c.textContent.includes(nm))), comboNames);
  assert(comboDays[0] >= 0 && comboDays[0] === comboDays[1], name + ': Kombi am selben Tag ' + JSON.stringify(comboDays));

  assert(items >= 2, name + ': Tagesgerüst angelegt');
  await noOverflow(p, name + ' Katalogreise Tagesplan');
  /* Genaue Uhrzeit über das Punkt-Blatt: Zeitfenster folgt, Uhrzeit sichtbar */
  await planClick(p,'.item[data-act="item"] >> nth=0');
  await p.fill('#mv-time', '15:15');
  await p.click('[data-act="item-move"]');
  assert((await p.textContent('.board')).includes('15:15'), name + ': Uhrzeit im Plan');
  const slotOf = await p.$$eval('.dslot', sl => { const h = sl.find(x => x.textContent.includes('15:15')); return h ? h.querySelector('.lbl').textContent : ''; });
  assert.equal(slotOf, 'Nachmittag', name + ': Fenster folgt der Uhrzeit');
  await tripTab(p,'ueber');
  txt = await viewText(p);
  assert(txt.includes('Fahrstrecke geschätzt') && txt.includes('ohne Preis'), name + ': Plan-Check meldet Schätzung und offene Preise');
  await tripTab(p,'unternehmen');
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
  await tripTab(p,'plan');
  assert((await p.textContent('.board')).includes('Std.'), name + ': Auslastung je Tag');
  const day0 = await p.$$eval('.dcol', cols => cols[0].querySelectorAll('.item:not(.fixed)').length);
  await planClick(p,'[data-act="day-swap-open"][data-val="0"]');
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
    await planClick(p,'.item[data-act="item"] >> nth=' + wf);
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
  /* Merkliste sichern, leeren, wieder importieren */
  await p.click('summary:has-text("Merkliste")').catch(() => {});
  const [favDl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="cat-fav-export"]')]);
  const favFile = await favDl.path();
  assert(JSON.parse(fs.readFileSync(favFile, 'utf8')).items.some(f => f.id === 'bad-urach'), name + ': Merkliste gesichert');
  await p.evaluate(() => localStorage.removeItem('rp-merkliste')); await p.click('[data-act="cat-search"]'); await p.waitForSelector('#cat-results');
  await p.setInputFiles('#fav-file', favFile);
  await p.waitForSelector('text=Merkliste „Irgendwann mal“');
  assert(await p.evaluate(() => JSON.parse(localStorage.getItem('rp-merkliste')).some(f => f.id === 'bad-urach')), name + ': Merkliste importiert');
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
  await tripTab(p,'ueber');
  assert((await viewText(p)).includes('Etappen'), name + ': Etappen im Überblick');
  const legNames = async () => p.$$eval('h2:has-text("Etappen") + ol li b', l => l.map(b => b.textContent));
  const beforeLegs = await legNames();
  await p.click('[data-act="leg-move"][data-val="0|1"]');
  assert((await viewText(p)).includes('Neue Reihenfolge noch nicht übernommen'), name + ': Entwurf sichtbar');
  await p.click('[data-act="leg-apply"]');
  const afterLegs = await legNames();
  assert.deepEqual(afterLegs.slice(0, 2), [beforeLegs[1], beforeLegs[0]], name + ': Etappen getauscht');
  await tripTab(p,'plan');
  assert((await p.textContent('.board')).includes('Weiterfahrt nach ' + beforeLegs[0]), name + ': Weiterfahrt neu');
  await tripTab(p,'ueber');
  await tripTab(p,'check');
  // Die Zielreihenfolge darf sich ändern. Hinweise können bereits in der Grundpackliste
  // stehen; eine zusätzliche Gruppe wird dann bewusst nicht angelegt.
  const packHints=await p.evaluate(()=>{
    const a=window.__app,id=location.hash.slice(3,-6),t=a.Store.get(id);
    const spots=new Map([].concat(window.RP_CATALOG?window.RP_CATALOG.places:[],...Object.values(window.RP_CATALOG_TILES||{}).map(t=>t.places)).flatMap(p=>p.spots.map(sp=>[sp.id,sp])));
    return [...new Set(t.items.flatMap(it=>{const act=t.customActs.find(x=>x.id===it.act),sp=act&&spots.get(act.catalogSpot);return sp?window.RPCatalog.bringFor(sp.kind):[]}))];
  });
  assert(packHints.length>0,name+': Rundreise enthält Katalog-Packhinweise');
  const packText=await viewText(p);
  for(const hint of packHints)assert(packText.includes(hint),name+': Packhinweis fehlt: '+hint);
  await noOverflow(p, name + ' Rundreise');
  /* Zielvergleich: zwei Ziele markieren, nebeneinander ansehen */
  await p.click('header [data-go="entdecken"]');
  await p.click('[data-act="cat-search"]');
  await p.waitForSelector('#cat-results [data-act="cat-cmp"]');
  const cmpIds = await p.$$eval('#cat-results [data-act="cat-cmp"]', l => l.slice(0, 2).map(b => b.getAttribute('data-val')));
  for (const id of cmpIds) await p.click('[data-act="cat-cmp"][data-val="' + id + '"]');
  await p.click('[data-act="cat-cmp-open"]');
  await p.waitForSelector('.sheet table.cmp');
  assert.equal(await p.$$eval('.sheet table.cmp thead th', l => l.length), 3, name + ': zwei Spalten plus Beschriftung');
  assert((await p.textContent('.sheet table.cmp')).includes('Muss-Prüfung'),name+': Vergleich erklärt Muss-Lücken');
  assert((await p.textContent('.sheet .profile-summary')).includes('Burgen'),name+': Vergleich nennt aktuelle Wünsche');
  assert.equal(await p.locator('.sheet .profile-summary [data-act]').count(),0,name+': Vergleich verändert Wünsche nicht');
  await noOverflow(p, name + ' Vergleich');
  await p.click('[data-act="sheet-x"]');
  await p.click('[data-act="cat-cmp-clear"]');
  /* v3.3: Ziel direkt finden, ähnliche Ziele, Link #ziel-<id> */
  await p.click('header [data-go="entdecken"]');
  await p.fill('#cat-find', 'Wachau'); await p.press('#cat-find', 'Enter');
  await p.click('[data-act="cat-open-id"][data-val="wachau"]');
  await p.waitForSelector('.sheet h2:has-text("Wachau")');
  await p.waitForSelector('#cat-similar [data-act="cat-open-id"]');
  await p.click('[data-act="sheet-x"]');
  await p.goto(base + '/index.html#ziel-harz');
  await p.waitForSelector('.sheet h2:has-text("Harz")');
  assert(/#ziel-harz$/.test(p.url()), name + ': Ziel-Link bleibt in der Adresse');
  await p.click('[data-act="sheet-x"]');
  /* Weite Strecke mit Zwischenstopps; Filter bleiben nach Neuladen erhalten */
  await p.click('header [data-go="entdecken"]');
  await p.selectOption('[data-profile-kind="burg"]','like');
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
  await p.click('[data-act="route-endpoint-apply"]');
  await p.click('summary:has-text("Eigene Unterkunft")');
  await p.fill('#cs-name', 'Testpension');
  await p.fill('#cs-price', '100');
  await p.check('#cs-kitchen');
  await p.click('[data-act="stay-add"]');
  assert((await viewText(p)).includes('Testpension'), name + ': eigene Unterkunft fehlt');
  await p.click('[data-act="stay-del"]');
  assert((await p.textContent('.sheet')).includes('Unterkunft entfernen'), name + ': Unterkunfts-Löschvorschau fehlt');
  await p.click('[data-act="sheet-x"]');
  assert((await viewText(p)).includes('Testpension'), name + ': Unterkunft nach Abbrechen verloren');

  /* Eigene Unternehmung anlegen und einplanen */
  await tripTab(p,'unternehmen');
  await p.click('summary:has-text("Eigene Unternehmung")');
  await p.fill('#ca-t', 'Stephansdom');
  await p.fill('#ca-cost', '6');
  await p.fill('#ca-hours', '1.5');
  await p.check('#ca-indoor');
  await p.fill('#ca-bring', 'Wasserflasche\nJacke');
  await p.click('[data-act="act-add"]');
  assert((await viewText(p)).includes('ca. 1,5 Std.'), name + ': eigene Dauer fehlt');
  assert((await viewText(p)).includes('drinnen'), name + ': eigene Indoor-Eignung fehlt');
  await p.click('[data-act="act-view"]');
  await p.click('[data-act="act-edit"]');
  await p.fill('#ae-note', 'Treffpunkt am Eingang');
  await p.click('[data-act="act-edit-preview"]');
  assert((await p.textContent('.sheet')).includes('Änderung prüfen'), name + ': Bearbeitungsvorschau fehlt');
  await p.click('[data-act="sheet-x"]');
  await p.click('[data-act="act-view"]');
  assert(!(await p.textContent('.sheet')).includes('Treffpunkt am Eingang'), name + ': Abbrechen hat gespeichert');
  await p.click('[data-act="act-edit"]');
  await p.fill('#ae-note', 'Treffpunkt am Eingang');
  await p.click('[data-act="act-edit-preview"]');
  await p.click('[data-act="act-change-confirm"]');
  await p.click('[data-act="act-view"]');
  assert((await p.textContent('.sheet')).includes('Treffpunkt am Eingang'), name + ': Änderung nicht gespeichert');
  await p.click('[data-act="act-del"]');
  assert((await p.textContent('.sheet')).includes('Unternehmung löschen?'), name + ': Löschvorschau fehlt');
  await p.click('[data-act="sheet-x"]');
  await p.click('[data-act="plan-act"]');
  await p.selectOption('#pl-day', '1');
  await p.selectOption('#pl-slot', 'morgen');
  await p.click('[data-act="plan-do"]');
  await tripTab(p,'plan');
  assert((await viewText(p)).includes('Stephansdom'), name + ': Punkt nicht im Tagesplan');
  await noOverflow(p, name + ' Tagesplan');
  /* Verschieben über das Blatt, nicht per Drag-and-drop */
  await planClick(p,'.item[data-act="item"]');
  await p.selectOption('#mv-slot', 'abend');
  await p.click('[data-act="item-move"]');
  const slots = await p.$$eval('.dcol', cols => cols.map(c => c.textContent));
  assert(slots[1].includes('Stephansdom'), name + ': Verschieben fehlgeschlagen');

  /* Kosten: 3 Personen × 6 € = 18 € */
  await tripTab(p,'kosten');
  assert((await viewText(p)).includes('Drei Kostenszenarien'), name + ': Szenariovergleich fehlt');
  assert((await viewText(p)).includes('18 €'), name + ': Kosten der eigenen Unternehmung fehlen');
  assert((await viewText(p)).includes('300 €'), name + ': Unterkunft 3 Nächte × 100 € fehlt');
  await p.fill('#xc-t', 'Parken');
  await p.fill('#xc-c', '25');
  await p.click('[data-act="xc-add"]');
  assert((await viewText(p)).includes('Parken'), name + ': eigener Kostenposten fehlt');
  await p.click('[data-act="xc-edit"]');
  await p.fill('#ce-amount', '35');
  await p.click('[data-act="xc-preview"]');
  assert((await p.textContent('.sheet')).includes('Kostenänderung prüfen'), name + ': Kostenvorschau fehlt');
  await p.click('[data-act="sheet-x"]');
  await p.click('[data-act="xc-edit"]');
  assert.equal(await p.inputValue('#ce-amount'), '25', name + ': Kostenabbruch hat verändert');
  await p.fill('#ce-note', 'Parkplatz am Museum');
  await p.click('[data-act="xc-preview"]');
  await p.click('[data-act="xc-confirm"]');
  await p.click('[data-act="xc-del"]');
  assert((await p.textContent('.sheet')).includes('Kostenposten entfernen?'), name + ': Kostenlöschvorschau fehlt');
  await p.click('[data-act="sheet-x"]');
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

  /* Manuelle Planaktionen dürfen die bezahlte Buchung nicht verschieben/entfernen. */
  const bookedPlan = () => p.evaluate(() => JSON.parse(localStorage.getItem('rp-trips'))[location.hash.split('-')[1]].items);
  const protectedItems = JSON.stringify(await bookedPlan());
  await tripTab(p,'plan');
  await planClick(p,'.item[data-act="item"]');
  await p.selectOption('#mv-day', '2');
  await p.click('[data-act="item-move"]');
  assert.equal(JSON.stringify(await bookedPlan()), protectedItems, name + ': bezahlter Termin wurde verschoben');
  assert((await p.textContent('#msg')).includes('Nicht geändert'), name + ': Schutzmeldung fehlt');
  await p.click('[data-act="item-del"]');
  assert.equal(JSON.stringify(await bookedPlan()), protectedItems, name + ': bezahlter Termin wurde entfernt');
  await p.click('[data-act="sheet-x"]');
  await p.click('[data-act="clear"]');
  await p.click('[data-act="clear-yes"]');
  assert.equal(JSON.stringify(await bookedPlan()), protectedItems, name + ': bezahlter Plan wurde geleert');
  await p.click('[data-act="clear-no"]');

  /* Checkliste */
  await tripTab(p,'check');
  await p.fill('#cc-t', 'Reisepass prüfen');
  await p.click('[data-act="cc-add"]');
  const box = p.locator('label:has-text("Reisepass prüfen") input');
  await box.check();
  assert(await box.isChecked(), name + ': Checkliste nicht abgehakt');

  /* Notizen und Mappe */
  await tripTab(p,'notiz');
  await p.fill('[data-f="notes"]', 'Buchung ABC-123');
  await tripTab(p,'mappe');
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
  await tripTab(p,'ueber');
  const today = await viewText(p);
  assert(today.includes('Was jetzt sinnvoll ist'), name + ': nächste Planungsschritte fehlen');
  assert(await p.locator('[data-next-steps] button[data-go$="-kosten"]').count() > 0, name + ': Kostenaktion fehlt');
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
  await tripTab(p,'ueber');
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
  await tripTab(p,'check');
  assert((await viewText(p)).includes('für eure Unternehmungen'), name + ': Packliste aus dem Plan fehlt');
  for (const tab of ['ueber', 'angebote', 'unterkunft', 'unternehmen', 'plan', 'kosten', 'check', 'notiz', 'mappe']) {
    await tripTab(p,tab);
    await noOverflow(p, name + ' Reiter ' + tab);
  }

  /* Suchzentrale: Anbieterlinks, Muss/Wunsch, Profile, Angebot, Vergleich und Zahlungen. */
  await tripTab(p,'suche');
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
  await tripTab(p,'kosten');
  assert((await viewText(p)).includes('Unterkunft: Buchung & Zahlungen') && (await viewText(p)).includes('420 €'), name + ': Zahlungsansicht fehlt');
  await tripTab(p,'suche');
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
  await tripTab(p,'ueber');
  const dayView = await viewText(p);
  assert(dayView.includes('0 Nächte') && !dayView.includes('Unterkunft fehlt') && !dayView.includes('Noch keine Unterkunft'), name + ': Tagesausflug');

  /* Startvorlagen: neutrale Vorlage und Winter-Katalogvorlage, keine Silvester-Pflicht */
  await p.click('[data-go="reisen"] >> nth=0');
  await p.click('summary:has-text("Mit einer Vorlage starten")');
  assert.equal(await p.locator('[data-act="tpl"]').count() >= 5, true, name + ': zu wenige Vorlagen');
  const templateBefore=await p.evaluate(()=>JSON.stringify(window.__app.Store.trips));
  await p.selectOption('[data-template-filter]','flug');
  assert(await p.isVisible('[data-act="tpl"][data-val="fernreise"]'),name+': Gruppenwechsel lässt Vorlagenbereich offen');
  assert.equal(await p.locator('[data-act="tpl"]').count(),2,name+': Fluggruppe enthält zwei Vorlagen');
  await p.click('[data-act="tpl"][data-val="fernreise"]');
  assert((await p.textContent('.sheet')).includes('es wurde noch keine Reise angelegt'),name+': Vorschau statt sofortiger Speicherung');
  assert.equal(await p.evaluate(()=>JSON.stringify(window.__app.Store.trips)),templateBefore,name+': Vorschau schreibt keine Reise');
  await noOverflow(p,name+' Vorlagenvorschau');
  await p.click('.sheet .x');
  assert.equal(await p.evaluate(()=>window.__app.UI.templatePreview),null,name+': Abbruch verwirft Vorschautoken');
  await p.selectOption('[data-template-filter]','all');
  await p.click('[data-act="tpl"][data-val="stadt"]');
  await p.click('[data-act="tpl-apply"]');
  assert(/-unterkunft$/.test(p.url()), name + ': Städtereise-Vorlage nicht bei der Unterkunft');
  await tripTab(p,'ueber');
  const tplView = await viewText(p);
  assert(tplView.includes('Städtereise') && tplView.includes('3 Nächte'), name + ': Städtereise-Vorlage');
  await p.click('[data-go="reisen"] >> nth=0');
  await p.click('summary:has-text("Mit einer Vorlage starten")');
  await p.click('[data-act="tpl"][data-val="winter"]');
  await p.click('[data-act="tpl-apply"]');
  assert(/-angebote$/.test(p.url()), name + ': Winter-Vorlage nicht bei den Angeboten');
  await noOverflow(p, name + ' Vorlage Winter');
  await p.click('header [data-go="reisen"]');await p.click('[data-go="neu"]');
  await p.fill('#draft [data-f="title"]','Mein offener Entwurf');await p.press('#draft [data-f="title"]','Tab');
  await p.click('summary:has-text("Oder mit einer Vorlage starten")');
  await p.click('[data-act="tpl"][data-val="wellness"]');await p.click('.sheet .x');
  assert.equal(await p.inputValue('#draft [data-f="title"]'),'Mein offener Entwurf',name+': Abbruch erhält Formularentwurf');

  /* Beschädigter Speicher wird nicht überschrieben */
  await p.click('header [data-go="reisen"]');
  await p.evaluate(() => localStorage.setItem('rp-trips', '{kaputt'));
  await p.goto(base+'/index.html#neu');
  await p.reload();
  assert(await p.isVisible('[data-storage-recovery]'),name+': Rettungshinweis auch bei Neuer Reise');
  await p.goto(base+'/index.html#entdecken');
  assert(await p.isVisible('[data-storage-recovery]'),name+': Rettungshinweis auch bei Entdecken');
  await p.goto(base+'/index.html#reisen');
  await p.reload();
  assert((await viewText(p)).includes('Rohdaten sichern'), name + ': Rettungshinweis fehlt');
  await p.click('[data-go="neu"]').catch(() => {});
  assert.equal(await p.evaluate(() => localStorage.getItem('rp-trips')), '{kaputt', name + ': Rohdaten überschrieben');
  await ctx.close();
}

async function completion(browser, base, name, ctxOpts) {
  const ctx=await browser.newContext(ctxOpts),p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(name+' completion: '+e.message));
  await p.goto(base);
  await p.evaluate(()=>{
    const a=window.__app,t=a.newTrip({id:'tcomplete',title:'Angaben ergänzen',dateMode:'fix',start:'2027-06-01',end:'2027-06-01',nights:0,origin:'Göppingen',dest:'Ulm',km:60,budget:500});
    const idea=a.customActFromForm({title:'Eigenes Museum',cat:'eigen',cost:'',hours:'',per:'pp'},'ccomplete');
    t.customActs=[idea];t.items=[{uid:'icomplete',act:idea.id,day:0,slot:'morgen'}];a.Store.put(t,true);a.go('r-'+t.id+'-ueber');
  });
  await p.click('[data-next-step="activity-prices"] [data-act="act-view"]');
  await p.fill('#ap-cost','12');await p.click('[data-act="act-price"]');
  assert.equal(await p.locator('[data-next-step="activity-prices"]').count(),0,name+': offener Preis nach Eingabe noch als Aufgabe');
  await p.click('[data-next-step="duration"] [data-act="act-edit"]');
  await p.fill('#ae-hours','2');await p.click('[data-act="act-edit-preview"]');
  await p.click('[data-act="act-change-confirm"]');
  assert.equal(await p.locator('[data-next-step="duration"]').count(),0,name+': Dauer nach Eingabe noch als Aufgabe');
  await tripTab(p,'unternehmen');
  await p.click('[data-act="fmissing"][data-val="price"]');
  assert((await viewText(p)).includes('0 von 1 Ideen sichtbar'),name+': Preisfilter zählt falsch');
  await p.click('[data-act="activity-filters-reset"]');
  assert.equal(await p.locator('[data-act="plan-act"]').count(),1,name+': Filterreset zeigt Idee nicht');
  await p.click('[data-act="fmissing"][data-val="duration"]');
  assert((await viewText(p)).includes('0 von 1 Ideen sichtbar'),name+': Dauerfilter zählt falsch');
  await p.click('[data-act="activity-filters-reset"]');
  await noOverflow(p,name+' Angaben ergänzen');
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

async function appearances(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts));
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(name+' Darstellung: '+e.message));
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.goto(base+'/index.html');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.silvesterTemplate();a.Store.put(t,true);a.go('reisen');return t.id});
 const original=await p.evaluate(()=>JSON.stringify(window.__app.Store.list()));
 const colors=[];
 for(const mode of ['book','studio','compact']){
  await p.click('[data-act="appearance-open"]');
  await p.click('[data-act="appearance-set"][data-val="'+mode+'"]');
  assert.equal(await p.getAttribute('html','data-layout'),mode);
  assert.equal(await p.getAttribute('[data-val="'+mode+'"][data-act="appearance-set"]','aria-pressed'),'true');
  await noOverflow(p,name+' Darstellung '+mode);
  await p.click('.sheet .x');
  assert.equal(await p.evaluate(()=>localStorage.getItem('rp-appearance')),mode);
  colors.push(await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()));
  await p.click('.trip-card[data-go="r-'+id+'-ueber"]');
  await noOverflow(p,name+' Reise '+mode);
  if(mode==='studio'&&ctxOpts.viewport.width>=1000){
   assert.equal(await p.$eval('.trip-workspace>.tabs',el=>getComputedStyle(el).flexDirection),'column');
  }
  await tripTab(p,'plan');await noOverflow(p,name+' Plan '+mode);
  await tripTab(p,'kosten');await noOverflow(p,name+' Kosten '+mode);
  await tripTab(p,'mappe');
  await p.emulateMedia({media:'print'});
  assert.equal(await p.$eval('.tabs',el=>getComputedStyle(el).display),'none');
  await p.emulateMedia({media:'screen'});
  await p.reload();assert.equal(await p.getAttribute('html','data-layout'),mode);
  await p.click('.app-nav [data-go="reisen"]');
  await shot(p,name+'-'+mode);
 }
 assert.equal(new Set(colors).size,3,'Drei eigene Paletten');
 assert.equal(await p.evaluate(()=>JSON.stringify(window.__app.Store.list())),original,'Darstellung ändert keine Reisedaten');
 await ctx.close();console.log(name+': drei Darstellungen, Navigation, Druck und Erhalt der Reise geprüft.');
}

async function checklistModules(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts));const p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' Module: '+e.message));
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());await p.goto(base+'/index.html');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.newTrip({customChecks:[{id:'k1',t:'Handtuch Test'},{id:'k2',t:'Unterlagen Test'}],check:{'c-k1':true}});a.Store.put(t,true);a.go('r-'+t.id+'-check');return t.id});
 await p.click('[data-act="check-filter"][data-val="done"]');
 assert.equal(await p.locator('[data-act="check"]').count(),1);
 await p.fill('#check-q','Kein Treffer');await p.click('#check-search button');
 assert((await viewText(p)).includes('Keine passenden Punkte'));
 await p.click('[data-act="check-reset"]');
 await p.fill('#check-q','Unterlagen Test');await p.press('#check-q','Enter');
 assert.equal(await p.locator('[data-act="check"]').count(),1);
 await p.check('[data-act="check"][data-val="c-k2"]');
 assert(await p.evaluate(id=>window.__app.Store.get(id).check['c-k2'],id));
 await p.click('[data-act="cc-del"][data-val="k2"]');
 assert(await p.evaluate(id=>{const t=window.__app.Store.get(id);return !t.customChecks.some(x=>x.id==='k2')&&t.check['c-k1']===true},id));
 await p.click('[data-act="check-reset"]');
 await noOverflow(p,name+' Checkliste');
 if(ctxOpts.viewport.width<=600){
  for(const tab of ['kosten','plan','check','notiz','mappe']){await p.selectOption('#trip-area',tab);assert((await p.getAttribute('.tab[aria-current="page"]','data-go')).endsWith('-'+tab));await noOverflow(p,name+' '+tab)}
 }
 // Sprunglink muss in der Reise bleiben und darf keine Hash-Navigation auslösen.
 const before=await p.evaluate(()=>location.hash);await p.focus('.skip-link');await p.press('.skip-link','Enter');
 assert.equal(await p.evaluate(()=>location.hash),before);assert.equal(await p.evaluate(()=>document.activeElement.id),'view');
 await ctx.close();console.log(name+': Checklistenfilter, Suche, Abhaken, Entfernen und Bereichswechsel geprüft.');
}

async function sheetKeyboard(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts));const p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' Dialog: '+e.message));await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.goto(base+'/index.html');await p.click('[data-act="appearance-open"]');
 assert.equal(await p.getAttribute('.sheet','aria-labelledby'),'rp-sheet-title');
 assert(await p.evaluate(()=>!!document.activeElement.closest('.sheet')));
 await p.focus('.sheet .x');await p.keyboard.press('Shift+Tab');
 assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('data-val')),'compact');
 await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('data-act')),'sheet-x');
 await p.click('[data-act="appearance-set"][data-val="studio"]');
 await p.keyboard.press('Escape');assert.equal(await p.locator('.sheet').count(),0);
 assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('data-act')),'appearance-open','Auslöser nach ersetzt/geschlossen');
 const sizes=await p.evaluate(()=>Array.from(document.querySelectorAll('.brand,#sync')).map(e=>e.getBoundingClientRect().height));
 assert(sizes.every(h=>h>=44),'Kopf-Touchziele mindestens44px');await noOverflow(p,name+' Touchkopf');await ctx.close();
 console.log(name+': Dialogfokus, Tab-Grenzen, Escape/Rückkehr und Kopf-Touchflächen geprüft.');
}

async function tripShelfFlow(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts));const p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' Reiseregal: '+e.message));await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.clock.setFixedTime(new Date('2027-05-02T12:00:00'));await p.goto(base+'/index.html');
 await p.evaluate(()=>{const a=window.__app;[
  a.newTrip({id:'tshelfnow',title:'Aktuelle Auszeit',dateMode:'fix',start:'2027-05-01',end:'2027-05-03'}),
  a.newTrip({id:'tshelfnext',title:'Kommende Auszeit',dateMode:'fix',start:'2027-05-10',end:'2027-05-12'}),
  a.newTrip({id:'tshelfopen',title:'München entdecken',dateMode:'open'}),
  a.newTrip({id:'tshelfpast',title:'Winterreise',dateMode:'fix',start:'2027-01-01',end:'2027-01-02'})
 ].forEach(t=>a.Store.put(t,true));a.go('reisen')});
 const original=await p.evaluate(()=>JSON.stringify(window.__app.Store.list()));
 assert.equal(await p.locator('.trip-card').count(),4);
 await p.click('.trip-spotlight [data-go]');assert((await p.getAttribute('.tab[aria-current="page"]','data-go')).endsWith('-plan'));
 await p.click('.app-nav [data-go="reisen"]');await p.click('[data-act="trip-filter"][data-val="open"]');
 assert.equal(await p.locator('.trip-card').count(),1);
 await p.fill('#trip-q','MUNCHEN');await p.press('#trip-q','Enter');assert.equal(await p.locator('.trip-card').count(),1);
 await p.click('[data-act="trip-filter"][data-val="past"]');assert((await viewText(p)).includes('Keine Reise passt'));
 await p.click('[data-act="trip-reset"]');assert.equal(await p.locator('.trip-card').count(),4);
 await p.selectOption('#trip-sort','name');assert((await p.locator('.trip-card').first().textContent()).includes('Aktuelle Auszeit'));
 await noOverflow(p,name+' Reiseregal');assert.equal(await p.evaluate(()=>JSON.stringify(window.__app.Store.list())),original);
 await ctx.close();console.log(name+': Reiseregal-Suche, Filter, Reset, Sortierung und Spotlight geprüft.');
}

/* Kosten-Budget und Notiz-Bausteine (Claude, #8) */
async function costNotes(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts));
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(name+' Kosten/Notizen: '+e.message));
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.goto(base+'/index.html');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.silvesterTemplate();a.Store.put(t,true);return t.id});
 await p.goto(base+'/index.html#r-'+id+'-kosten');
 await p.waitForSelector('[data-budget]');
 const bt=await p.textContent('[data-budget]');
 assert(/Spielraum|über dem Budget/.test(bt),name+': Budgetzeile fehlt');
 assert(await p.isVisible('[data-budget] .budget-bar'),name+': Budgetbalken fehlt');
 await noOverflow(p,name+' Kosten mit Budget');
 await p.goto(base+'/index.html#r-'+id+'-notiz');
 const before=await p.inputValue('textarea[data-f="notes"]');
 await p.click('[data-act="note-add"][data-val="notfall"]');
 const after=await p.inputValue('textarea[data-f="notes"]');
 assert(after.startsWith(before.trim())&&after.includes('112'),name+': Baustein nicht angehängt oder Bestand verändert');
 assert(!(await p.$('[data-act="note-add"][data-val="notfall"]')),name+': Baustein weiter angeboten');
 await p.fill('textarea[data-f="notes"]',after+'\nUnterkunft https://example.org/haus · Tel. +49 8321 12345');
 await p.click('h2');
 await p.waitForSelector('#notes-extra a[href="https://example.org/haus"]');
 assert(await p.$('#notes-extra a[href="tel:+49832112345"]'),name+': Telefonlink fehlt');
 await p.reload();
 assert((await p.inputValue('textarea[data-f="notes"]')).includes('example.org/haus'),name+': Notiz nach Neuladen weg');
 await noOverflow(p,name+' Notizen');
 /* Unternehmungen: Suche, eingeplant, Sortierung */
 await p.goto(base+'/index.html#r-'+id+'-unternehmen');await p.waitForSelector('#act-q');
 const count=async()=>+(await p.textContent('.block [role="status"]')).match(/^(\d+)/)[1];
 const total=await count();assert(total>3,name+': zu wenige Unternehmungen');
 await p.fill('#act-q','zzzz-nichts');await p.press('#act-q','Enter');
 assert.equal(await count(),0,name+': Suche filtert nicht');assert((await viewText(p)).includes('Nichts passt'));
 await p.click('[data-act="activity-filters-reset"]');assert.equal(await count(),total);
 await p.selectOption('#act-sort','name');assert.equal(await p.inputValue('#act-sort'),'name');
 const titles=await p.$$eval('.grid .card h3',els=>els.map(e=>e.textContent));
 assert.deepEqual(titles,titles.slice().sort((x,y)=>x.localeCompare(y,'de',{sensitivity:'base'})),name+': nicht nach Name sortiert');
 await p.click('[data-act="aplanned"][data-val="geplant"]');const planned=await count();
 await p.click('[data-act="aplanned"][data-val="offen"]');assert.equal(planned+await count(),total,name+': eingeplant + offen ≠ alle');
 await noOverflow(p,name+' Unternehmungen');
 await p.goto(base+'/index.html#r-'+id+'-ueber');
 if(await p.$('[data-departure]')){await p.click('[data-departure] summary');assert(await p.isVisible('[data-departure] .timeline li'),name+': Fahrplan leer');await noOverflow(p,name+' Fahrplan')}
 await tripTab(p,'plan');await p.waitForSelector('.dhead .dload');
 assert(/Std\.|≈|frei|geplant/.test(await p.textContent('.dcol.day-selected .dload, .dcol .dload')),name+': Tageszeile fehlt');
 await p.locator('.dcol:visible .dmore summary').first().click();
 assert(/Programm/.test(await p.locator('.dcol:visible .dcost').first().textContent()),name+': Tageskosten fehlen');await noOverflow(p,name+' Tagesplan mit Tageskosten');
 await ctx.close();console.log(name+': Budget im Kostenmodul, Notiz-Bausteine, Links und Telefon, Unternehmungs-Suche/Sortierung geprüft.');
}

async function routeProposalGuard(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts));const p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' Routenvorschlag: '+e.message));await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.route(/routing\.openstreetmap\.de/,r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:'Ok',routes:[{distance:300000,duration:10800,legs:[{distance:150000,duration:5400},{distance:150000,duration:5400}]}]})}));
 await p.goto(base+'/index.html');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.newTrip({origin:'Göppingen',originGeo:{lat:48.703,lon:9.652},dest:'Ulm',destGeo:{lat:48.398,lon:9.992},km:100});a.Store.put(t,true);a.go('r-'+t.id+'-unterkunft');return t.id});
 await p.click('[data-act="route-calc"]');await p.waitForSelector('[data-act="route-apply"]');
 await p.fill('[data-f="km"]','222');await p.press('[data-f="km"]','Tab');
 await p.waitForSelector('[data-act="route-apply"][disabled]');assert((await viewText(p)).includes('Vorschlag veraltet'));
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).km,id),222,'Keine Übernahme des alten Vorschlags');
 await p.click('[data-act="route-calc"]');await p.waitForSelector('[data-act="route-apply"]:not([disabled])');
 await p.click('[data-act="route-apply"]');
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).km,id),150);
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).kmSrc,id),'route');
 await noOverflow(p,name+' Routenvorschlag');await ctx.close();console.log(name+': veraltete Route gesperrt, neu berechnet und bewusst übernommen.');
}

async function routeEndpointFlow(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts));const p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' Ortswechsel: '+e.message));await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.goto(base+'/index.html');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.newTrip({origin:'Göppingen',originGeo:{lat:48.7,lon:9.65},dest:'Ulm',destGeo:{lat:48.4,lon:9.99},km:222,kmSrc:'route',routeMin:90,routeHomeMin:95,routeAt:'2026-10-15'});a.Store.put(t,true);a.go('r-'+t.id+'-unterkunft');return t.id});
 const original=await p.evaluate(id=>JSON.stringify(window.__app.Store.get(id)),id);
 await p.fill('[data-f="dest"]','München');await p.press('[data-f="dest"]','Tab');
 await p.waitForSelector('[data-act="route-endpoint-apply"]');
 assert.equal(await p.evaluate(id=>JSON.stringify(window.__app.Store.get(id)),id),original,'Tippen/Vorschau ändern nichts');
 await p.click('.sheet .x');assert.equal(await p.inputValue('[data-f="dest"]'),'Ulm');
 await p.fill('[data-f="dest"]','München');await p.press('[data-f="dest"]','Tab');await p.click('[data-act="route-endpoint-apply"]');
 const changed=await p.evaluate(id=>window.__app.Store.get(id),id);
 assert.equal(changed.dest,'München');assert.equal(changed.destGeo,undefined);assert.equal(changed.km,0);assert.equal(changed.routeKm,0);assert.equal(changed.routeMin,undefined);
 await p.click('[data-act="edit-trip"]');await p.fill('#editform [data-f="origin"]','Berlin');await p.click('[data-act="edit-save"]');
 await p.waitForSelector('[data-act="route-endpoint-apply"]');await p.click('[data-act="route-endpoint-apply"]');
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).originGeo,id),undefined);
 await p.reload();assert.equal(await p.inputValue('[data-f="dest"]'),'München');
 await noOverflow(p,name+' Ortswechsel');await ctx.close();console.log(name+': Ortswechsel mit Abbruch/Übernahme und offenen Routenwerten geprüft.');
}

async function layoutStructure(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts));const p=await ctx.newPage();p.on('pageerror',e=>errors.push(name+' Struktur: '+e.message));
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());await p.goto(base+'/index.html');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.silvesterTemplate();a.Store.put(t,true);a.go('reisen');return t.id});
 const overlap=await p.evaluate(()=>{const a=document.querySelector('#trip-q').getBoundingClientRect(),b=document.querySelector('#trip-search button').getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top});
 assert(!overlap,name+': Suche überlappt Knopf');
 await p.click('.trip-card[data-go="r-'+id+'-ueber"]');
 assert.equal(await p.locator('#trip-area optgroup').count(),4);assert.equal(await p.locator('#trip-area option').count(),10);
 const mobile=ctxOpts.viewport.width<1000;
 assert.equal(await p.isVisible('#trip-area'),mobile);assert.equal(await p.isVisible('.tab-links'),!mobile);
 assert.equal(await p.$eval('#dock',e=>getComputedStyle(e).position),'static');
 await tripTab(p,'plan');
 if(ctxOpts.viewport.width<=600){
  assert.equal(await p.locator('.dcol:visible').count(),1);await p.selectOption('#plan-day','1');
  assert.equal(await p.locator('.dcol:visible').getAttribute('data-day'),'1');
  await p.emulateMedia({media:'print'});assert.equal(await p.locator('.dcol:visible').count(),5);await p.emulateMedia({media:'screen'});
 }
 await p.click('[data-act="appearance-open"]');assert.equal(await p.$eval('body',e=>e.style.overflow),'hidden');await p.keyboard.press('Escape');
 assert.equal(await p.$eval('body',e=>e.style.overflow),'');await noOverflow(p,name+' Struktur');await ctx.close();console.log(name+': Struktur, Suche, Tagesauswahl, Druck und Scrollsperre geprüft.');
}

/* Seit 16.10. ist V3_EDIT in der Produktionsdatei true (Freigabe Philipp). Der Editorweg läuft auf der echten Datei,
   der Abschluss prüft den gesperrten Rückfall über eine abgefangene Antwort mit V3_EDIT=false. */
async function v3EditorFlow(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts)),p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' v3Editor: '+e.message));
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 const v3src=fs.readFileSync(path.join(ROOT,'app','v3.js'),'utf8');assert(v3src.includes('const V3_EDIT=true;'));
 await p.goto(base+'/index.html');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.silvesterTemplate();t.extraCosts=[{id:'xceditor',t:'Editor-Testposten',c:200}];t.ledger={'xc:xceditor':{status:'gebucht',amount:200,paid:200,due:''}};a.Store.put(t);a.go('r-'+t.id+'-kosten');return t.id});
 const row=()=>p.locator('.ledger').filter({hasText:'Editor-Testposten'});
 await row().locator('[data-v3-open="cancel"]').click();
 await p.fill('[data-v3-sheet] [name="on"]','2026-10-15');await p.fill('[data-v3-sheet] [name="fee"]','abc');
 await p.click('[data-v3-editor-action="preview-cancel"]');assert(await p.isVisible('#v3-editor-error'));assert.equal(await p.evaluate(()=>document.activeElement.id),'v3-editor-error');
 await p.fill('[data-v3-sheet] [name="fee"]','50,00');await p.click('[data-v3-editor-action="preview-cancel"]');
 assert((await p.textContent('[data-v3-financial-preview]')).includes('150,00'));
 assert.equal(await p.evaluate(id=>!!window.__app.Store.get(id).ledger['xc:xceditor'].cancel,id),false,'Vorschau speichert nichts');
 await p.click('[data-v3-editor-action="back"]');assert.equal(await p.inputValue('[name="fee"]'),'50,00');
 await p.click('[data-v3-editor-action="preview-cancel"]');await noOverflow(p,name+' Stornovorschau');await p.click('[data-v3-editor-action="apply"]');
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).ledger['xc:xceditor'].cancel.fee,id),50);
 await row().locator('[data-v3-open="refund"]').click();await p.fill('[name="on"]','2026-10-15');await p.fill('[name="amount"]','150,00');
 await p.click('[data-v3-editor-action="preview-refund"]');await p.click('[data-v3-editor-action="apply"]');
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).ledger['xc:xceditor'].refunds.length,id),1);
 await row().locator('[data-v3-open="uncancel"]').click();await p.click('[data-v3-editor-action="preview-uncancel"]');
 assert((await p.textContent('[data-v3-financial-preview]')).includes('150,00'));await p.click('[data-v3-editor-action="apply"]');
 assert.equal(await p.evaluate(id=>window.__app.financeEntry(window.__app.Store.get(id),{kind:'ledger',key:'xc:xceditor'}).math.open,id),150);
 await p.click('[data-v3-open="transport"]');await p.click('[data-v3-editor-action="segment-add"][data-dir="out"]');
 await p.selectOption('[data-v3-sheet] [name$=".mode"]','flug');
 await p.fill('[data-v3-sheet] [name$=".fromCode"]','STR');await p.fill('[data-v3-sheet] [name$=".toCode"]','PMI');
 await p.fill('[data-v3-sheet] [name$=".cost"]','199,90');
 await p.click('[data-v3-editor-action="segment-add-addon"]');
 await p.fill('[name*=".addon."][name$=".label"]','Gepäck');await p.fill('[name*=".addon."][name$=".cost"]','25,00');
 await p.click('[data-v3-editor-action="segment-add-addon"]');await p.locator('[data-v3-editor-action="segment-remove-addon"]').nth(1).click();
 assert.equal(await p.inputValue('[name*=".addon."][name$=".label"]'),'Gepäck');
 await p.getByText('Online-Check-in · optional',{exact:true}).click();
 await p.fill('[name$=".checkin_date"]','2026-12-29');await p.fill('[name$=".checkin_time"]','08:30');await p.fill('[name$=".checkin_tz"]','Europe/Berlin');await p.fill('[name$=".checkin_note"]','Frist laut Anbieter');
 await p.click('[data-v3-editor-action="preview-transport"]');
 assert((await p.textContent('[data-v3-transport-preview]')).includes('199,90'));await noOverflow(p,name+' Transportvorschau');
 await p.click('[data-v3-editor-action="apply"]');await p.reload();
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).transport.out[0].cost,id),199.9);
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).transport.out[0].addons[0].cost,id),25);
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).transport.out[0].checkin.opens.time,id),'08:30');
 await row().locator('[data-v3-open="cancel"]').click();await p.fill('[name="on"]','2026-10-15');await p.fill('[name="fee"]','0');await p.click('[data-v3-editor-action="preview-cancel"]');
 await p.evaluate(id=>{const a=window.__app,t=a.Store.get(id);t.title+=' geändert';a.Store.put(t)},id);
 await p.click('[data-v3-editor-action="apply"]');assert((await p.textContent('#v3-editor-error')).includes('geändert'));
 await p.keyboard.press('Escape');assert.equal(await p.locator('[data-v3-sheet]').count(),0);
 /* Kontobereich wechselt, während die alte Gast-Vorschau noch offen ist. */
 await row().locator('[data-v3-open="cancel"]').click();await p.fill('[name="on"]','2026-10-15');await p.fill('[name="fee"]','0');await p.click('[data-v3-editor-action="preview-cancel"]');
 const rawBeforeScope=await p.evaluate(()=>localStorage.getItem('rp-trips'));
 await p.evaluate(()=>window.__app.Store.setScope('v3-test-other-scope'));await p.click('[data-v3-editor-action="apply"]');
 assert((await p.textContent('#v3-editor-error')).includes('geändert'));assert.equal(await p.evaluate(()=>localStorage.getItem('rp-trips')),rawBeforeScope);
 assert.equal(await p.evaluate(()=>localStorage.getItem('rp-u:v3-test-other-scope')),null,'Alte Gast-Vorschau schreibt keine Kontoreise');
 await p.keyboard.press('Escape');await p.evaluate(id=>{const a=window.__app;a.Store.setScope('guest');a.go('r-'+id+'-kosten')},id);
 /* Wirklicher Storage-Ausnahmepfad: keine Erfolgsansicht und kein geänderter Datenträger. */
 await row().locator('[data-v3-open="cancel"]').click();await p.fill('[name="on"]','2026-10-15');await p.fill('[name="fee"]','0');await p.click('[data-v3-editor-action="preview-cancel"]');
 const rawBeforeQuota=await p.evaluate(()=>localStorage.getItem('rp-trips'));
 await p.evaluate(()=>{const original=Storage.prototype.setItem;window.__v3RestoreStorage=()=>{Storage.prototype.setItem=original};Storage.prototype.setItem=function(k,v){if(k==='rp-trips')throw new DOMException('Editor-Testquota','QuotaExceededError');return original.call(this,k,v)}});
 await p.click('[data-v3-editor-action="apply"]');assert((await p.textContent('#v3-editor-error')).includes('nicht gespeichert'));
 assert(await p.isVisible('[data-v3-sheet]'));assert.equal(await p.evaluate(()=>localStorage.getItem('rp-trips')),rawBeforeQuota);
 await p.click('[data-v3-editor-action="apply"]');assert.equal(await p.evaluate(()=>localStorage.getItem('rp-trips')),rawBeforeQuota,'Erneuter Klick überschreibt trotz Speicherfehler nichts');
 await p.evaluate(()=>window.__v3RestoreStorage());await p.keyboard.press('Escape');await p.reload();
 assert.equal(await p.evaluate(id=>!!window.__app.Store.get(id).ledger['xc:xceditor'].cancel,id),false,'Fehlgeschlagene Änderung nach Neuladen nicht als gespeichert ausgegeben');
 /* Derselbe Ablauf für das aktive Unterkunftsangebot, getrennt vom Zahlungsbuch. */
 await p.evaluate(id=>{const a=window.__app,t=a.Store.get(id),o={id:'oeditor',stayId:t.stayId,name:'Editor-Testunterkunft',location:'Testort',provider:'direkt',type:'hotel',start:t.start,end:t.end,persons:t.persons,price:200,basis:'stay',url:'https://example.org/editor-fixture',checkedAt:'2026-10-15',validUntil:'2027-01-04',availability:'available',terms:'Nur Testdaten',paid:200,deposit:0,booked:true,features:Object.fromEntries(['sauna','kitchen','breakfast','cancel','quiet','accessible','parking'].map(k=>[k,'unknown'])),fees:Object.fromEntries(['tax','cleaning','parking','wellness','mandatory'].map(k=>[k,{state:'included',amount:0}]))};t.offers=[o];t.activeOfferId=o.id;a.validateOffer(o);a.validateExtras(t);a.Store.put(t);a.render()},id);
 const offerButton=action=>p.locator('[data-v3-open="'+action+'"][data-v3-target*="oeditor"]');
 await offerButton('cancel').click();await p.fill('[name="on"]','2026-10-15');await p.click('[data-v3-editor-action="preview-cancel"]');
 assert((await p.textContent('[data-v3-financial-preview]')).includes('unbekannt'));await p.click('[data-v3-editor-action="apply"]');
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).offers[0].cancel.fee,id),null);
 await offerButton('cancel').click();await p.fill('[name="fee"]','50');await p.click('[data-v3-editor-action="preview-cancel"]');await p.click('[data-v3-editor-action="apply"]');
 await offerButton('refund').click();await p.fill('[name="on"]','2026-10-15');await p.fill('[name="amount"]','150');await p.click('[data-v3-editor-action="preview-refund"]');await p.click('[data-v3-editor-action="apply"]');
 assert.equal(await p.evaluate(id=>window.__app.financeEntry(window.__app.Store.get(id),{kind:'offer',id:'oeditor'}).math.refundOpen,id),0);
 await offerButton('uncancel').click();await p.click('[data-v3-editor-action="preview-uncancel"]');await p.click('[data-v3-editor-action="apply"]');await p.reload();
 assert.equal(await p.evaluate(id=>window.__app.financeEntry(window.__app.Store.get(id),{kind:'offer',id:'oeditor'}).math.open,id),150);
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).offers[0].refunds.length,id),1);
 /* Rückfall mit gesperrtem Gate (V3_EDIT=false): gelesene v3-Reisen bleiben auch
    in den alten Such-/Angebotshandlern schreibgeschützt und behalten Version 3. */
 await p.route(/\/app\/v3\.js(\?|$)/,r=>r.fulfill({status:200,contentType:'text/javascript',body:v3src.replace('const V3_EDIT=true;','const V3_EDIT=false;')}));await p.reload();assert.equal(await p.evaluate(()=>window.__app.V3_EDIT),false);
 await tripTab(p,'suche');const lockedRaw=await p.evaluate(()=>localStorage.getItem('rp-trips'));
 await p.fill('[data-search="destination"]','Nicht speichern');await p.locator('[data-search="destination"]').press('Tab');
 assert.equal(await p.evaluate(()=>localStorage.getItem('rp-trips')),lockedRaw);
 /* Standard-Suchort kann die Testunterkunft ausfiltern; aktives Angebot über
    seinen filterunabhängigen Zahlungsbereich öffnen. Filter nicht lockern. */
 await tripTab(p,'kosten');
 await p.locator('[data-search-act="offer-edit"][data-value="oeditor"]').click();await p.fill('[data-offer="name"]','Nicht speichern');
 await p.click('[data-search-act="offer-save"]');assert((await p.textContent('#offer-error')).includes('Format 3'));
 assert.equal(await p.evaluate(()=>localStorage.getItem('rp-trips')),lockedRaw);
 assert.equal(await p.evaluate(id=>window.__app.Store.get(id).schemaVersion,id),3);
 await ctx.close();console.log(name+': v3-Editorweg auf der freigegebenen Produktionsdatei (Storno/Refund/Rücknahme/Transport/Quellstand) und gesperrter Rückfall geprüft.');
}

/* Reisetagebuch und Bewertungen (P0.2b): Entwurf übersteht Schließen und Bereichswechsel, erste Angabe
   erst nach Bestätigung in Format 3, Sterne per Antippen mit Textalternative, Mappe, Löschen. */
async function journalFlow(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts)),p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' Tagebuch: '+e.message));
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.goto(base+'/index.html');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.silvesterTemplate();t.title='Tagebuch-Test';a.Store.put(t);a.go('r-'+t.id+'-plan');return t.id});
 const trip=()=>p.evaluate(id=>window.__app.Store.get(id),id),raw=()=>p.evaluate(()=>localStorage.getItem('rp-trips'));
 const before=await trip();assert.notEqual(before.schemaVersion,3);
 const sec='[data-journal="plan"]',openPlan=async()=>{if(!await p.locator(sec+' details[data-journal-details="plan"]').evaluate(d=>d.open))await p.click(sec+' details[data-journal-details="plan"] > summary')};
 await openPlan();
 const day='2026-12-30',write=sec+' [data-journal-act="open"][data-key="'+day+'"]';
 await p.click(write);assert(await p.isVisible('#journal-text'));
 assert((await p.textContent('[data-journal-sheet]')).includes('Format 3'));
 await p.fill('#journal-text','Endlich angekommen.\nSchnee bis zum Knie.');
 await p.locator('[data-journal-sheet] label.opt').filter({hasText:'4 · gut'}).click();
 assert.equal(await p.textContent('#journal-count'),'40 von 2000 Zeichen');
 await noOverflow(p,name+' Tagebuchblatt');
 /* Schließen und Bereich wechseln: Entwurf bleibt, gespeichert ist nichts */
 await p.keyboard.press('Escape');assert.equal(await p.locator('[data-journal-sheet]').count(),0);
 await tripTab(p,'ueber');await tripTab(p,'plan');await openPlan();
 assert((await p.textContent(sec)).includes('Entwurf, noch nicht gespeichert'));
 assert.deepEqual(await trip(),before,'Entwurf speichert nichts');
 await p.click(write);
 assert((await p.textContent('[data-journal-sheet]')).includes('Ungespeicherter Entwurf wiederhergestellt'));
 assert.equal(await p.inputValue('#journal-text'),'Endlich angekommen.\nSchnee bis zum Knie.');
 assert.equal(await p.locator('input[name="journal-mood"][value="4"]').isChecked(),true);
 /* Erste Angabe: Rückfrage, dann Format 3; alle anderen Felder unverändert */
 const rawBefore=await raw();
 await p.click('[data-journal-act="save"]');
 assert(await p.isVisible('[data-journal-confirm]'));const ask=await p.textContent('[data-journal-confirm]');
 assert(ask.includes('Reise auf Format 3 umstellen?')&&ask.includes('Ältere App-Versionen'));
 assert.equal(await raw(),rawBefore,'Rückfrage speichert nichts');await noOverflow(p,name+' Rückfrage Format 3');
 await p.click('[data-journal-act="back"]');assert.equal(await p.inputValue('#journal-text'),'Endlich angekommen.\nSchnee bis zum Knie.','Zurück behält den Text');
 await p.click('[data-journal-act="save"]');await p.click('[data-journal-act="confirm"]');
 assert.equal(await p.locator('[data-journal-confirm]').count(),0);
 const v3=await trip();assert.equal(v3.schemaVersion,3);
 assert.deepEqual(v3.journal,{[day]:{text:'Endlich angekommen.\nSchnee bis zum Knie.',mood:4}});
 const rest=x=>{const c=JSON.parse(JSON.stringify(x));['journal','ratings','schemaVersion','updated'].forEach(k=>delete c[k]);return c};
 assert.deepEqual(rest(v3),rest(before),'Feldtreue im Browser');
 assert.equal(await p.evaluate(()=>document.activeElement&&document.activeElement.getAttribute('data-key')),day,'Fokus zurück auf den Tag');
 const shown=await p.textContent(sec);assert(shown.includes('Schnee bis zum Knie.')&&shown.includes('4 von 5 · gut'));
 /* Bewertung: Antippen speichert direkt, Bereich bleibt offen, Zustand auch als Text */
 await p.click(sec+' details[data-journal-details="rates"] > summary');
 const firstRate=p.locator(sec+' [data-journal-rate]').first(),actId=await firstRate.getAttribute('data-journal-rate');
 const star=firstRate.locator('[data-stars="3"]');const box=await star.boundingBox();assert(box.width>=44&&box.height>=44,'Sterne mindestens 44 px');
 await star.click();
 assert.equal((await trip()).ratings[actId],3);
 assert(await p.locator(sec+' details[data-journal-details="rates"]').evaluate(d=>d.open),'Bewertungen bleiben aufgeklappt');
 const rated=p.locator(sec+' [data-journal-rate="'+actId+'"]');
 assert.equal(await rated.locator('[data-stars="3"]').getAttribute('aria-pressed'),'true');
 assert((await rated.textContent()).includes('3 von 5 Sternen'));
 assert.equal(await p.evaluate(()=>document.activeElement&&document.activeElement.getAttribute('data-stars')),'3','Fokus bleibt auf dem Stern');
 await noOverflow(p,name+' Bewertungen');
 /* Neuladen und Mappe (nur auf Wunsch) */
 await p.reload();assert.equal((await trip()).journal[day].mood,4);
 await tripTab(p,'mappe');assert.equal(await p.locator('[data-journal-mappe]').count(),0,'Mappe ohne Tagebuch, solange nicht gewählt');
 await p.check('#mappe-journal');assert((await p.textContent('[data-journal-mappe]')).includes('Schnee bis zum Knie.'));
 assert((await p.textContent('[data-journal-mappe-ratings]')).includes('3 von 5 Sternen'));await noOverflow(p,name+' Mappe');
 /* Löschen mit Rückfrage; leeres Tagebuch fällt weg, Format 3 bleibt */
 await tripTab(p,'plan');await openPlan();await p.click(write);await p.click('[data-journal-act="delete-ask"]');
 assert(await p.isVisible('#journal-delete'));await p.click('[data-journal-act="delete"]');
 const after=await trip();assert.equal(after.journal,undefined);assert.equal(after.schemaVersion,3);assert.equal(after.ratings[actId],3);
 await ctx.close();console.log(name+': Reisetagebuch (Entwurf, Bestätigung Format 3, Bewertung per Antippen, Mappe, Löschen) geprüft.');
}
/* Speicheradapter (P0.4): Bestand einer App-Version ohne rpstore.js wird beim ersten Start nach IndexedDB kopiert,
   Neuladen nach Migration zeigt dieselben Reisen und rp-trips bleibt; Zurückrollen auf die alte Version und zurück ohne
   Verlust; nur localStorage geräumt → Wiederherstellung; ohne IndexedDB sichtbarer Hinweis. Kein Safari-/iPhone-Test. */
async function storageAdapter(browser,base,name,ctxOpts){
 const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),tag='<script src="rpstore.js"></script>\n';
 assert(html.includes(tag),'index.html lädt rpstore.js');const oldHtml=html.replace(tag,'');
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts)),p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' Speicheradapter: '+e.message));
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 const oldApp=()=>p.route(base+'/index.html',r=>r.fulfill({status:200,contentType:'text/html',body:oldHtml})),newApp=()=>p.unroute(base+'/index.html');
 const ready=()=>p.waitForFunction(()=>window.__app&&window.__app.Store.backend==='idb');
 const ls=()=>p.evaluate(()=>localStorage.getItem('rp-trips'));
 const copy=()=>p.evaluate(()=>new Promise((res,rej)=>{const r=indexedDB.open('reiseplaner');r.onerror=()=>rej(r.error);r.onsuccess=()=>{const db=r.result,out={},tx=db.transaction(['kv','meta'],'readonly');
  tx.objectStore('kv').get('rp-trips').onsuccess=e=>{out.raw=e.target.result?e.target.result.raw:null};tx.objectStore('meta').get('marker').onsuccess=e=>{out.marker=e.target.result||null};tx.oncomplete=()=>{db.close();res(out)}}}));
 const until=async(fn,what)=>{for(let i=0;i<100;i++){if(await fn())return;await p.waitForTimeout(50)}assert.fail(name+': '+what)};
 /* 1. Bisherige Version: Reisen nur in localStorage */
 await oldApp();await p.goto(base+'/index.html');
 assert.equal(await p.evaluate(()=>typeof window.RPStore),'undefined',name+': alte Version ohne Adapter');
 await p.evaluate(()=>{const a=window.__app;['Migration Wien','Migration Prag'].forEach((title,i)=>a.Store.put(Object.assign(a.newTrip({title,dateMode:'fix',start:'2027-0'+(i+6)+'-01',end:'2027-0'+(i+6)+'-03'}),{id:'tmig'+i}),true));a.go('reisen')});
 const before=await ls();assert(before.includes('Migration Prag'));
 assert(!(await p.evaluate(async()=>(await indexedDB.databases()).map(d=>d.name))).includes('reiseplaner'),name+': noch keine IndexedDB-Kopie');
 /* 2. Neue Version: erster Start kopiert, liest zurück und setzt den Marker */
 await newApp();await p.reload();await ready();
 let c=await copy();assert.equal(c.raw,before,name+': Kopie gleich rp-trips');assert.equal(c.marker.version,1,name+': Migrationsmarker');
 assert.equal(await ls(),before,name+': rp-trips bleibt unverändert');
 /* 3. Neuladen nach Migration zeigt dieselben Reisen, rp-trips noch vorhanden */
 await p.reload();await ready();
 let txt=await viewText(p);assert(txt.includes('Migration Wien')&&txt.includes('Migration Prag'),name+': dieselben Reisen nach Neuladen');
 assert.equal(await ls(),before,name+': rp-trips nach Neuladen vorhanden');
 /* 4. Änderung wird nach localStorage und IndexedDB geschrieben */
 await p.evaluate(()=>{const a=window.__app,t=a.Store.get('tmig0');t.title='Migration Wien geändert';a.Store.put(t,true)});
 assert((await ls()).includes('Migration Wien geändert'),name+': localStorage sofort');
 await until(async()=>(await copy()).raw===await ls(),'Änderung in IndexedDB');
 /* 5. Zurückrollen auf die alte Version und zurück: nichts geht verloren */
 await oldApp();await p.reload();
 assert((await viewText(p)).includes('Migration Wien geändert'),name+': alte Version sieht den aktuellen Stand');
 await p.evaluate(()=>{const a=window.__app,t=a.Store.get('tmig1');t.title='Prag von alter Version';a.Store.put(t,true)});
 const fromOld=await ls();assert.notEqual((await copy()).raw,fromOld);
 await newApp();await p.reload();await ready();
 assert.equal((await copy()).raw,fromOld,name+': Änderung der alten Version übernommen');assert((await viewText(p)).includes('Prag von alter Version'));
 /* 6. Nur localStorage geräumt: Wiederherstellung aus der Kopie */
 await p.evaluate(()=>localStorage.removeItem('rp-trips'));await p.reload();await ready();
 await until(async()=>(await viewText(p)).includes('Prag von alter Version'),'Wiederherstellung sichtbar');
 assert.equal(await ls(),fromOld,name+': rp-trips zurückgeschrieben');await noOverflow(p,name+' Speicheradapter');
 await ctx.close();
 /* 7. Ohne IndexedDB: sichtbarer Hinweis, Speichern wie bisher */
 const ctx2=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts)),q=await ctx2.newPage();
 q.on('pageerror',e=>errors.push(name+' ohne IndexedDB: '+e.message));
 await q.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await q.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{configurable:true,get(){return undefined}})});
 await q.goto(base+'/index.html');await q.waitForSelector('[data-storage-backend]');
 assert((await q.textContent('[data-storage-backend]')).includes('localStorage'),name+': Rückfall benannt');await noOverflow(q,name+' Speicherhinweis');
 await q.evaluate(()=>{const a=window.__app;a.Store.put(a.newTrip({title:'Ohne IndexedDB',dateMode:'fix',start:'2027-08-01',end:'2027-08-02'}),true)});
 await q.reload();await q.waitForSelector('[data-storage-backend]');assert((await viewText(q)).includes('Ohne IndexedDB'),name+': Speichern ohne IndexedDB');
 await ctx2.close();console.log(name+': Speicheradapter Migration, Neuladen (rp-trips bleibt), Durchschreiben, Zurückrollen, Wiederherstellung und Rückfall ohne IndexedDB geprüft.');
}
/* P0.2a Mitreisende und Ausgaben auf der Produktionsdatei: v2-Reise wird erst nach Vorschau Format 3, Fehler im Dialog,
   Dezimalkomma, Gewichte, Zurück erhält Eingaben, Saldo mit Vorzeichen und Wort, Zahler einer bezahlten Buchung,
   Neuladen und gesperrtes Entfernen einer beteiligten Person. Nur Testdaten. */
async function splitFlow(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts)),p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' Aufteilung: '+e.message));
 await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.goto(base+'/index.html');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.silvesterTemplate();t.extraCosts=[{id:'xcsplit',t:'Split-Testposten',c:200}];t.ledger={'xc:xcsplit':{status:'gebucht',amount:200,paid:200,due:''}};a.Store.put(t);a.go('r-'+t.id+'-kosten');return t.id});
 const sec=()=>p.locator('[data-split]'),version=()=>p.evaluate(id=>window.__app.Store.get(id).schemaVersion,id);
 assert((await sec().textContent()).includes('auf Format 3 umgestellt'),name+': Hinweis vor der ersten Person');
 await sec().locator('[data-split-action="person-add"]').click();
 await p.fill('[data-split-sheet] [name="name"]','Anna');await p.click('[data-split-act="preview"]');
 assert((await p.textContent('[data-split-preview]')).includes('Format 3 umgestellt'),name+': nie still Format 3');
 assert.notEqual(await version(),3,name+': Vorschau speichert nichts');
 await noOverflow(p,name+' Personenvorschau');await p.click('[data-split-act="apply"]');
 assert.equal(await version(),3);
 await sec().locator('[data-split-action="person-add"]').click();await p.fill('[data-split-sheet] [name="name"]','Ben');await p.click('[data-split-act="preview"]');await p.click('[data-split-act="apply"]');
 await sec().locator('[data-split-action="person-add"]').click();await p.fill('[data-split-sheet] [name="name"]',' anna ');await p.click('[data-split-act="preview"]');
 assert((await p.textContent('#split-error')).includes('gibt es schon'));assert.equal(await p.evaluate(()=>document.activeElement.id),'split-error');
 await p.keyboard.press('Escape');assert.equal(await p.locator('[data-split-sheet]').count(),0);
 await sec().locator('[data-split-action="expense-add"]').click();
 await p.fill('[data-split-sheet] [name="label"]','Pizza');await p.fill('[data-split-sheet] [name="amount"]','1.234,00');
 await p.selectOption('[data-split-sheet] [name="paidBy"]',{label:'Anna'});await p.click('[data-split-act="preview"]');
 assert((await p.textContent('#split-error')).includes('Tausendertrennzeichen'));
 await p.fill('[data-split-sheet] [name="amount"]','30,00');
 assert.equal(await p.locator('[data-split-sheet] [data-split-weight]:visible').count(),0,name+': Gewichte erst bei Aufteilung nach Gewichten');
 await p.selectOption('[data-split-sheet] [name="mode"]','shares');
 assert.equal(await p.locator('[data-split-sheet] [data-split-weight]:visible').count(),2);
 await p.locator('[data-split-sheet] [name^="w."]').first().fill('2');
 await p.click('[data-split-act="preview"]');
 const pv=await p.textContent('[data-split-preview]');assert(/Anna 20,00\s€/.test(pv)&&/Ben 10,00\s€/.test(pv),name+': Anteile 2 : 1 in der Vorschau');
 await noOverflow(p,name+' Ausgabenvorschau');
 await p.click('[data-split-act="back"]');
 assert.equal(await p.inputValue('[data-split-sheet] [name="amount"]'),'30,00');assert.equal(await p.inputValue('[data-split-sheet] [name="mode"]'),'shares');
 assert.equal(await p.locator('[data-split-sheet] [data-split-weight]:visible').count(),2,name+': Gewichte nach Zurück sichtbar');
 await p.click('[data-split-act="preview"]');await p.click('[data-split-act="apply"]');
 let txt=await sec().textContent();
 assert(/Ben zahlt an Anna: 10,00\s€/.test(txt),name+': Ausgleichsvorschlag');
 assert(/\+10,00\s€ \(bekommt\)/.test(txt)&&/−10,00\s€ \(zahlt\)/.test(txt),name+': Saldo mit Vorzeichen und Wort');
 await sec().locator('[data-split-action="payer"]').first().click();
 await p.selectOption('[data-split-sheet] [name="paidBy"]',{label:'Ben'});await p.click('[data-split-act="preview"]');
 assert((await p.textContent('[data-split-preview]')).includes('200,00'));await p.click('[data-split-act="apply"]');
 const ledger=await p.evaluate(id=>window.__app.Store.get(id).ledger['xc:xcsplit'],id);
 assert.deepEqual([ledger.status,ledger.amount,ledger.paid],['gebucht',200,200],name+': Buchung unverändert');
 await p.reload();
 txt=await sec().textContent();assert(/Anna zahlt an Ben: 90,00\s€/.test(txt),name+': nach Neuladen erhalten');
 await sec().locator('[data-split-action="person-remove"]').first().click();
 assert((await p.textContent('[data-split-sheet]')).includes('Entfernen nicht möglich'));
 assert.equal(await p.locator('[data-split-sheet] [data-split-act="preview"]').count(),0);
 await p.keyboard.press('Escape');await noOverflow(p,name+' Aufteilung');
 await ctx.close();console.log(name+': Mitreisende, Ausgaben, Aufteilung nach Gewichten, Zahler, Ausgleich, Neuladen und Löschschutz geprüft.');
}

/* P0.5 iOS-Gestaltungsregeln (PLAN_IOS_APP.md §4.3) in Chromium: Schrift 200 % ohne seitliches Scrollen und ohne
   abgeschnittene Knöpfe/Überschriften, Blatt mit Zieh-Griff und Schließen-Knopf ≥ 44 px, Ziehen schließt nur weit genug,
   reduzierte Bewegung ohne Übergang, Feld bleibt bei kleinerem sichtbaren Bereich sichtbar. Kein iPhone-/WebKit-Test:
   env(safe-area-inset-*) und die echte Bildschirmtastatur lassen sich in Chromium nicht nachstellen.
   Die Kopfleiste (.top/.app-nav) baut Modul A (Navigation) parallel um; sie wird hier ausgeblendet und separat geprüft. */
async function iosDesign(browser,base,name,ctxOpts){
 const ctx=await browser.newContext(Object.assign({serviceWorkers:'block'},ctxOpts)),p=await ctx.newPage();
 p.on('pageerror',e=>errors.push(name+' iOS-Regeln: '+e.message));await p.route(/fonts\.(googleapis|gstatic)\.com/,r=>r.abort());
 await p.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.id='t200';s.textContent='html{font-size:200%!important}';document.head.appendChild(s)}));
 await p.goto(base+'/index.html#reisen');
 assert.equal(await p.evaluate(()=>getComputedStyle(document.body).fontSize),'32px',name+': Grundschrift folgt 200 %');
 const id=await p.evaluate(()=>{const a=window.__app,t=a.silvesterTemplate();a.Store.put(t,true);return t.id});
 const check=async where=>{
  const r=await p.evaluate(()=>{
   const top=document.querySelector('header.top');if(top)top.style.display='none';
   const overflow=document.documentElement.scrollWidth-document.documentElement.clientWidth,clipped=[];
   const scope=document.querySelector('.sheet')||document.querySelector('#view');
   for(const el of scope.querySelectorAll('button,a.btn,a.lnk,label,h1,h2,h3,h4,summary,.kpi,.badge')){
    const r=el.getBoundingClientRect();if(!r.width||el.closest('[hidden],details:not([open])>:not(summary)'))continue;
    let sc=el.parentElement,scroller=false;while(sc&&sc!==document.body){const o=getComputedStyle(sc).overflowX;if(o==='auto'||o==='scroll'){scroller=true;break}sc=sc.parentElement}
    if(!scroller&&el.scrollWidth>el.clientWidth+2)clipped.push(el.tagName+'.'+el.className+' „'+el.textContent.trim().slice(0,30)+'“ '+el.scrollWidth+'/'+el.clientWidth);
   }
   if(top)top.style.display='';
   return {overflow,clipped:clipped.slice(0,5)};
  });
  assert(r.overflow<=0,name+' '+where+': Seite bei 200 % Schrift '+r.overflow+' px zu breit');
  assert.deepEqual(r.clipped,[],name+' '+where+': abgeschnittener Text bei 200 %');
 };
 for(const [where,hash] of [['Reisen','#reisen'],['Neue Reise','#neu'],['Überblick','#r-'+id+'-ueber'],['Kosten','#r-'+id+'-kosten'],['Tagesplan','#r-'+id+'-plan'],['Entdecken','#entdecken'],['Konto','#konto']]){
  await p.goto(base+'/index.html'+hash);await p.waitForSelector('#view h1, #view h2');await check(where);
 }
 /* Offenes Blatt (Eckdaten, langes Formular) */
 await p.goto(base+'/index.html#r-'+id+'-ueber');await p.click('.trip-actions [data-act="edit-trip"]');await p.waitForSelector('.sheet #editform');
 await check('Blatt Eckdaten');
 const grip=await p.evaluate(()=>{const g=document.querySelector('.sheet .sheet-grip'),x=document.querySelector('.sheet .x'),gr=g.getBoundingClientRect(),xr=x.getBoundingClientRect();
  return {hidden:g.getAttribute('aria-hidden'),gh:gr.height,gw:gr.width,shown:getComputedStyle(g).display!=='none',xw:xr.width,xh:xr.height,xname:x.getAttribute('aria-label'),xtext:x.textContent,order:g.compareDocumentPosition(x)&Node.DOCUMENT_POSITION_FOLLOWING,trans:getComputedStyle(document.querySelector('.sheet')).transitionDuration}});
 assert(grip.shown&&grip.gh>=20&&grip.gw>=44,name+': Zieh-Griff sichtbar');assert.equal(grip.hidden,'true',name+': Griff dekorativ');
 assert(grip.xw>=44&&grip.xh>=44,name+': Schließen-Knopf mindestens 44 × 44 px ('+grip.xw+' × '+grip.xh+')');
 assert.equal(grip.xname,'Schließen');assert(grip.xtext.includes('Schließen'));assert(grip.order,name+': Griff über dem Knopf');
 if(ctxOpts.reducedMotion==='reduce')assert.equal(grip.trans,'0s',name+': reduzierte Bewegung ohne Übergang am Blatt');
 else assert.notEqual(grip.trans,'0s',name+': Übergang nur ohne reduzierte Bewegung');
 /* Tastatur: sichtbarer Bereich schrumpft, das fokussierte Feld bleibt sichtbar */
 const field=p.locator('.sheet #editform input, .sheet #editform select').last();await field.focus();
 const vp=ctxOpts.viewport;await p.setViewportSize({width:vp.width,height:Math.round(vp.height*0.45)});await p.waitForTimeout(500);
 const vis=await field.evaluate(el=>{const r=el.getBoundingClientRect(),vv=window.visualViewport;return {top:r.top,bottom:r.bottom,h:vv.height,root:getComputedStyle(document.documentElement).getPropertyValue('--rp-vvh')}});
 assert(vis.top>=0&&vis.bottom<=vis.h,name+': Feld nach Verkleinern sichtbar ('+JSON.stringify(vis)+')');
 assert.equal(vis.root.trim(),Math.round(vis.h)+'px',name+': Blatt kennt die sichtbare Höhe');
 await p.setViewportSize(vp);await p.waitForTimeout(200);await p.$eval('.sheet',e=>{e.scrollTop=0});await p.locator('.sheet .x').focus();
 /* Ziehen: kurz bleibt offen, weit schließt; Schließen-Knopf bleibt die gleichwertige Alternative */
 const g=await p.locator('.sheet .sheet-grip').boundingBox(),gx=g.x+g.width/2,gy=g.y+g.height/2;
 await p.mouse.move(gx,gy);await p.mouse.down();await p.mouse.move(gx,gy+15,{steps:3});await p.mouse.up();
 assert.equal(await p.locator('.sheet').count(),1,name+': kurzes Ziehen schließt nicht');
 assert.equal(await p.$eval('.sheet',e=>e.style.transform),'',name+': Blatt springt zurück');
 await p.mouse.move(gx,gy);await p.mouse.down();await p.mouse.move(gx,gy+220,{steps:6});await p.mouse.up();
 assert.equal(await p.locator('.sheet').count(),0,name+': weites Ziehen schließt');
 await p.evaluate(()=>window.__app.appearanceSheet());await check('Blatt Darstellung');
 await p.click('.sheet .x');assert.equal(await p.locator('.sheet').count(),0,name+': Knopf schließt');
 await ctx.close();console.log(name+': 200 % Schrift ohne Überlauf (7 Ansichten, 2 Blätter), Zieh-Griff, Schließen ≥ 44 px, Ziehen, Tastatur-Sichtbarkeit, Bewegung geprüft.');
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
    await completion(browser, base, 'desktop', { viewport: {width:1280,height:900} });
    await completion(browser, base, 'dunkel-schmal', { viewport: {width:320,height:640},colorScheme:'dark' });
    await appearances(browser,base,'design-desktop',{viewport:{width:1280,height:900}});
    await appearances(browser,base,'design-mobil',{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await appearances(browser,base,'design-dunkel',{viewport:{width:320,height:640},colorScheme:'dark'});
    await checklistModules(browser,base,'module-desktop',{viewport:{width:1280,height:900}});
    await costNotes(browser,base,'kosten-notizen-desktop',{viewport:{width:1280,height:900}});
    await costNotes(browser,base,'kosten-notizen-320',{viewport:{width:320,height:640},colorScheme:'dark',isMobile:true,hasTouch:true});
    await checklistModules(browser,base,'module-mobil',{viewport:{width:320,height:640},colorScheme:'dark'});
    await sheetKeyboard(browser,base,'dialog-desktop',{viewport:{width:1280,height:900}});
    await sheetKeyboard(browser,base,'dialog-mobil',{viewport:{width:320,height:640},colorScheme:'dark'});
    await tripShelfFlow(browser,base,'regal-desktop',{viewport:{width:1280,height:900}});
    await tripShelfFlow(browser,base,'regal-mobil',{viewport:{width:320,height:640},colorScheme:'dark'});
    await routeProposalGuard(browser,base,'route-desktop',{viewport:{width:1280,height:900}});
    await routeProposalGuard(browser,base,'route-mobil',{viewport:{width:320,height:640},colorScheme:'dark'});
    await routeEndpointFlow(browser,base,'ortswechsel-desktop',{viewport:{width:1280,height:900}});
    await routeEndpointFlow(browser,base,'ortswechsel-mobil',{viewport:{width:320,height:640},colorScheme:'dark'});
    await layoutStructure(browser,base,'struktur-desktop',{viewport:{width:1280,height:900}});
    await layoutStructure(browser,base,'struktur-mobil',{viewport:{width:320,height:640},colorScheme:'dark'});
    await v3EditorFlow(browser,base,'v3-desktop',{viewport:{width:1280,height:900}});
    await v3EditorFlow(browser,base,'v3-320',{viewport:{width:320,height:640},colorScheme:'dark'});
    await journalFlow(browser,base,'tagebuch-desktop',{viewport:{width:1280,height:900}});
    await journalFlow(browser,base,'tagebuch-320',{viewport:{width:320,height:640},colorScheme:'dark',isMobile:true,hasTouch:true});
    await storageAdapter(browser,base,'speicher-desktop',{viewport:{width:1280,height:900}});
    await storageAdapter(browser,base,'speicher-320',{viewport:{width:320,height:640},colorScheme:'dark'});
    await splitFlow(browser,base,'aufteilung-desktop',{viewport:{width:1280,height:900}});
    await splitFlow(browser,base,'aufteilung-320',{viewport:{width:320,height:640},colorScheme:'dark',isMobile:true,hasTouch:true});
    await iosDesign(browser,base,'ios-320',{viewport:{width:320,height:640},colorScheme:'dark',isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await iosDesign(browser,base,'ios-390',{viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    await iosDesign(browser,base,'ios-390-ruhig',{viewport:{width:390,height:844},reducedMotion:'reduce'});
    await offline(browser, base);
  } finally {
    await browser.close();
    srv.close();
  }
  if (errors.length) { console.error('JavaScript-Fehler:\n' + errors.join('\n')); process.exit(1); }
  console.log('Browser-Klicktest (Chromium: Desktop, Mobilbreite, 320 px dunkel; Umkreis-Katalog Desktop und 320 px) bestanden.');
})().catch(e => { console.error(e); process.exit(1); });


