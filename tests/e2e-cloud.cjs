/* Ende-zu-Ende in Chromium gegen einen LOKALEN Supabase-Stack (Auth, REST, Mailpit) mit der gebauten
   Website unter /Reiseplaner/ wie auf GitHub Pages. Kein iPhone-/Safari-Test, kein Produktionsprojekt.
   Start: supabase start && npm run test:e2e  (ohne Stack oder Playwright: übersprungen) */
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const assert = require('assert');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
function loadPlaywright() {
  try { return require('playwright'); } catch (e) {}
  try { return require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); } catch (e) {}
  return null;
}
let env = null;
try { env = JSON.parse(execSync('supabase status -o json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch (e) {}
const pw = loadPlaywright();
if (!env || !env.API_URL || !pw) {
  if (process.env.REQUIRE_DB) { console.error('Supabase-Stack oder Playwright fehlt.'); process.exit(1); }
  console.log('E2E-Test übersprungen: ' + (!pw ? 'Playwright fehlt' : 'lokaler Supabase-Stack läuft nicht') + '.');
  process.exit(0);
}
const KEY = env.PUBLISHABLE_KEY || env.ANON_KEY, MAIL = env.MAILPIT_URL || env.INBUCKET_URL;
const PORT = 8080, BASE = 'http://127.0.0.1:' + PORT + '/Reiseplaner/';

/* Build wie für GitHub Pages, aber mit lokaler Supabase-Konfiguration */
execSync('node scripts/build.mjs', { cwd: ROOT, env: Object.assign({}, process.env, { RP_SUPABASE_URL: env.API_URL, RP_SUPABASE_PUBLISHABLE_KEY: KEY, RP_BASE_PATH: '/Reiseplaner/' }), stdio: 'ignore' });
const PUB = path.join(ROOT, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.txt': 'text/plain' };
/* Verhält sich wie GitHub Pages: nur unter /Reiseplaner/, sonst 404.html mit Status 404 */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = decodeURIComponent(u.pathname);
  if (p.startsWith('/Reiseplaner/')) { p = p.slice('/Reiseplaner'.length); if (p.endsWith('/')) p += 'index.html'; const f = path.join(PUB, path.normalize(p)); if (f.startsWith(PUB) && fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); return; } }
  res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); fs.createReadStream(path.join(PUB, '404.html')).pipe(res);
});

const src = fs.readFileSync(path.join(ROOT, 'vendor', 'supabase-js-2.117.2.js'), 'utf8');
vm.runInThisContext(src + '\n;globalThis.__sbLib = supabase;');
const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };
const api = () => globalThis.__sbLib.createClient(env.API_URL, KEY, { auth: { flowType: 'pkce', storage: mem(), autoRefreshToken: false, detectSessionInUrl: false } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function mailLink(to, re, after) {
  for (let i = 0; i < 60; i++) {
    const r = await (await fetch(MAIL + '/api/v1/search?query=' + encodeURIComponent('to:' + to))).json();
    const m = (r.messages || []).filter(x => re.test(x.Subject) && (!after || new Date(x.Created) > after))[0];
    if (m) { const full = await (await fetch(MAIL + '/api/v1/message/' + m.ID)).json(); const l = ((full.Text || '') + (full.HTML || '')).match(/https?:\/\/[^\s"'<>)]+\/auth\/v1\/verify[^\s"'<>)]*/); if (l) return l[0].replace(/&amp;/g, '&'); }
    await sleep(250);
  }
  throw new Error('Keine E-Mail an ' + to);
}
/* Anmeldecode (P0.7) aus der lokalen Vorlage supabase/templates/magic_link.html */
async function mailCode(to, after) {
  for (let i = 0; i < 60; i++) {
    const r = await (await fetch(MAIL + '/api/v1/search?query=' + encodeURIComponent('to:' + to))).json();
    const m = (r.messages || []).filter(x => /Anmeldecode/.test(x.Subject) && (!after || new Date(x.Created) > after))[0];
    if (m) { const full = await (await fetch(MAIL + '/api/v1/message/' + m.ID)).json(); const c = (full.Text || '').match(/^\s*(\d{6,10})\s*$/m); if (c) return c[1]; }
    await sleep(250);
  }
  throw new Error('Kein Anmeldecode an ' + to);
}
const run = Date.now().toString(36);
const errors = [];
async function page(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(name + ': ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|fonts/.test(m.text())) errors.push(name + ' Konsole: ' + m.text()); });
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  p.on('response', r => { if (r.status() === 404 && r.url().startsWith(BASE) && !/favicon|\/irgendwas/.test(r.url())) errors.push(name + ': 404 für ' + r.url()); });
  return { ctx, p };
}
const syncText = p => p.textContent('#sync');
const waitSync = (p, re, ms) => p.waitForFunction(r => new RegExp(r).test(document.querySelector('#sync').textContent), re.source, { timeout: ms || 15000 });

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await pw.chromium.launch(fs.existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {});
  try {
    /* GitHub-Pages-Pfad: Start, direkter Link, Neuladen, unbekannter Pfad, keine fehlenden Assets */
    const { ctx: c0, p: p0 } = await page(browser, 'pfad');
    await p0.goto(BASE); assert((await p0.textContent('#view')).includes('Meine Reisen'));
    await p0.goto(BASE + '#konto'); assert((await p0.textContent('#view')).includes('Anmelden'), 'direkter Link #konto');
    await p0.reload(); assert((await p0.textContent('#view')).includes('Anmelden'), 'Neuladen behält Ansicht');
    /* Umkreis-Katalog ohne Anmeldung aus der Datenbank (#7) */
    await p0.goto(BASE + '#entdecken'); await p0.selectOption('#cat-city', { label: 'Stuttgart' });
    await p0.click('[data-act="cat-search"]'); await p0.waitForSelector('#cat-results');
    assert((await p0.textContent('#cat-results')).includes('Online-Katalog (Datenbank), Version '+JSON.parse(fs.readFileSync(path.join(ROOT,'catalog/src/_meta.json'),'utf8')).version), 'Katalog kommt aus der Datenbank');
    await p0.goto('http://127.0.0.1:' + PORT + '/Reiseplaner/irgendwas#konto'); await p0.waitForURL(BASE + '#konto'); assert((await p0.textContent('#view')).includes('Anmelden'), '404 leitet zur App');
    await c0.close();

    /* Anna: Gast-Reise, dann Registrierung mit Bestätigungs-E-Mail */
    const A = await page(browser, 'anna'), aMail = 'anna.' + run + '@example.test', aPw = 'Anna-Passwort-' + run;
    await A.p.goto(BASE);
    assert(/Gast/.test(await syncText(A.p)));
    await A.p.click('[data-go="neu"]'); await A.p.fill('#draft [data-f="title"]', 'Gast-Reise ' + run); await A.p.click('[data-act="create"]');
    await A.p.goto(BASE + '#konto'); await A.p.click('[data-acc="mode"][data-val="signup"]');
    await A.p.fill('#acc-email', aMail); await A.p.fill('#acc-pw', aPw); await A.p.fill('#acc-pw2', aPw); await A.p.click('button:has-text("Konto anlegen")');
    await A.p.waitForSelector('text=Bitte den Link in der E-Mail');
    await A.p.goto(await mailLink(aMail, /confirm/i));
    await A.p.waitForFunction(() => /Online|Lokal gespeichert|Synchron/.test(document.querySelector('#sync').textContent), null, { timeout: 15000 });
    assert(A.p.url().startsWith(BASE) && !A.p.url().includes('code='), 'Bestätigung zurück auf die Website, Code entfernt');
    await A.p.goto(BASE + '#reisen');
    let view = await A.p.textContent('#view');
    assert(!view.includes('Gast-Reise ' + run), 'Gastdaten nicht automatisch im Konto');
    assert(view.includes('ohne Konto in diesem Browser'), 'Übernahme wird angeboten');

    /* Bewusste Übernahme mit Vorschau → erst nach DB-Bestätigung "Online gespeichert" */
    await A.p.click('[data-acc="adopt-open"] >> nth=0');
    await A.p.check('[data-adopt]'); await A.p.click('[data-acc="adopt-do"]');
    await waitSync(A.p, /Online gespeichert/);
    const aApi = api(); await aApi.auth.signInWithPassword({ email: aMail, password: aPw });
    let rows = (await aApi.from('trips').select('id,title,version')).data;
    assert.equal(rows.length, 1); assert.equal(rows[0].title, 'Gast-Reise ' + run);
    const tid = rows[0].id;
    await A.p.reload(); await waitSync(A.p, /Online gespeichert/); assert((await A.p.textContent('#view')).includes('Gast-Reise ' + run), 'nach Neuladen angemeldet und geladen');

    /* Teilen: Einladung als Bearbeiter */
    await A.p.goto(BASE + '#r-' + tid + '-ueber'); await A.p.click('[data-acc="share"]');
    await A.p.waitForSelector('[data-acc="invite-create"]'); await A.p.selectOption('#inv-role', 'editor'); await A.p.click('[data-acc="invite-create"]');
    const invite = (await A.p.waitForSelector('#inv-link')).textContent ? await A.p.textContent('#inv-link') : '';
    assert(invite.startsWith(BASE + '?einladung='), 'Einladungslink auf die Website: ' + invite);
    await A.p.click('[data-act="sheet-x"]');

    /* Ben (eigenes Konto) nimmt den Link an */
    const bMail = 'ben.' + run + '@example.test', bPw = 'Ben-Passwort-' + run, bApi = api();
    await bApi.auth.signUp({ email: bMail, password: bPw, options: { emailRedirectTo: BASE } });
    await fetch(await mailLink(bMail, /confirm/i), { redirect: 'manual' });
    const B = await page(browser, 'ben');
    await B.p.goto(invite); await B.p.waitForSelector('text=Einladung erkannt');
    await B.p.fill('#acc-email', bMail); await B.p.fill('#acc-pw', bPw); await B.p.click('form[data-acc-form="signin"] button[type="submit"]');
    await B.p.waitForFunction(id => location.hash === '#r-' + id + '-ueber', tid, { timeout: 15000 });
    assert((await B.p.textContent('#view')).includes('Bearbeiten'), 'Rolle sichtbar');

    /* Konflikt: Anna offline ändert, Ben speichert vorher online */
    await A.ctx.setOffline(true);
    await A.p.goto(BASE + '#r-' + tid + '-notiz'); await A.p.fill('[data-f="notes"]', 'Anna offline'); await A.p.press('[data-f="notes"]', 'Tab');
    await waitSync(A.p, /Offline/);
    await B.p.goto(BASE + '#r-' + tid + '-notiz'); await B.p.fill('[data-f="notes"]', 'Ben online'); await B.p.press('[data-f="notes"]', 'Tab');
    await waitSync(B.p, /Online gespeichert/);
    await A.ctx.setOffline(false); await A.p.goto(BASE + '#konto'); await A.p.click('[data-acc="sync"]');
    await waitSync(A.p, /Konflikt/);
    rows = (await aApi.from('trips').select('data').eq('id', tid)).data; assert.equal(rows[0].data.notes, 'Ben online', 'Server nicht still überschrieben');
    await A.p.goto(BASE + '#r-' + tid + '-notiz'); await A.p.waitForSelector('text=Gleichzeitige Bearbeitung');
    await A.p.click('[data-acc="conf"][data-how="server"]'); await waitSync(A.p, /Online gespeichert/);
    assert.equal(await A.p.inputValue('[data-f="notes"]'), 'Ben online');

    /* Entzug: Anna entfernt Ben → Ben verliert die Reise beim nächsten Abgleich */
    await A.p.goto(BASE + '#r-' + tid + '-ueber'); await A.p.click('[data-acc="share"]');
    await A.p.click('[data-acc="member-remove"]'); await A.p.waitForSelector('[data-acc="invite-create"]');
    await A.p.click('[data-act="sheet-x"]');
    await B.p.goto(BASE + '#konto'); await B.p.click('[data-acc="sync"]');
    await B.p.goto(BASE + '#reisen');
    /* Nicht auf die Statusanzeige warten (stand schon vorher auf "Online gespeichert"), sondern auf das Ergebnis */
    await B.p.waitForFunction(t => !document.querySelector('#view').textContent.includes(t), 'Gast-Reise ' + run, { timeout: 20000 });
    const bRows = (await bApi.from('trips').select('id')).data; assert.equal((bRows || []).length, 0, 'API bestätigt: kein Zugriff');

    /* Abmelden: keine Kontodaten mehr sichtbar, Gastdaten wieder da */
    await A.p.goto(BASE + '#konto'); await A.p.click('[data-acc="signout"]');
    await waitSync(A.p, /Gast/);
    await A.p.goto(BASE + '#reisen'); view = await A.p.textContent('#view');
    assert(view.includes('Gast-Reise ' + run), 'Gast-Reise lokal erhalten');
    assert(!(await A.p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('rp-u:')))), 'Kontocache nach Abmelden entfernt');

    /* Anmeldung per E-Mail-Code (P0.7): unbekannte Adresse gleich angezeigt, kein Konto angelegt; falscher Code,
       erneut senden (alter Code ungültig), richtiger Code → Konto geladen wie nach Passwort-Anmeldung */
    const nobody = 'niemand.' + run + '@example.test';
    await A.p.goto(BASE + '#konto'); await A.p.click('[data-acc="mode"][data-val="code"]');
    await A.p.fill('#acc-email', nobody); await A.p.click('form[data-acc-form="code-send"] button[type="submit"]');
    await A.p.waitForSelector('#acc-code');
    const sentUnknown = (await A.p.textContent('form[data-acc-form="code-verify"]')).replace(nobody, '<ADRESSE>');
    assert.equal(await A.p.evaluate(() => document.activeElement && document.activeElement.id), 'acc-code', 'Fokus im Codefeld');
    assert.equal(await A.p.getAttribute('#acc-code', 'autocomplete'), 'one-time-code'); assert.equal(await A.p.getAttribute('#acc-code', 'inputmode'), 'numeric');
    await A.p.click('[data-acc="code-back"]');
    const codeFrom = new Date(Date.now() - 1000);
    await A.p.fill('#acc-email', aMail); await A.p.click('form[data-acc-form="code-send"] button[type="submit"]');
    await A.p.waitForSelector('#acc-code');
    assert.equal((await A.p.textContent('form[data-acc-form="code-verify"]')).replace(aMail, '<ADRESSE>'), sentUnknown, 'Anzeige verrät nicht, ob ein Konto existiert');
    const code1 = await mailCode(aMail, codeFrom);
    assert.equal(((await (await fetch(MAIL + '/api/v1/search?query=' + encodeURIComponent('to:' + nobody))).json()).messages || []).length, 0, 'keine E-Mail an unbekannte Adresse');
    const sAdmin = globalThis.__sbLib.createClient(env.API_URL, env.SERVICE_ROLE_KEY || env.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const allUsers = (await sAdmin.auth.admin.listUsers({ perPage: 1000 })).data.users || [];
    assert(!allUsers.some(u => u.email === nobody), 'kein Konto per Code angelegt');
    await A.p.fill('#acc-code', code1 === '000000' ? '111111' : '000000'); await A.p.click('form[data-acc-form="code-verify"] button[type="submit"]');
    await A.p.waitForSelector('#acc-code-err'); assert(/stimmt nicht oder ist abgelaufen/.test(await A.p.textContent('#acc-code-err')), 'falscher Code abgelehnt');
    assert(/Gast/.test(await syncText(A.p)), 'nach falschem Code nicht angemeldet');
    assert(await A.p.isDisabled('[data-acc="code-resend"]'), 'erneut senden erst nach Wartezeit');
    await sleep(1500); /* lokale Mindestpause zwischen E-Mails (max_frequency 1 s) */
    await A.p.evaluate(() => { window.__app.UI.otp.sentAt -= 61000; });
    await A.p.waitForFunction(() => !document.querySelector('[data-acc="code-resend"]').disabled, null, { timeout: 5000 });
    const resendFrom = new Date(Date.now() - 500);
    await A.p.click('[data-acc="code-resend"]'); await A.p.waitForSelector('text=ist ein neuer Code unterwegs');
    const code2 = await mailCode(aMail, resendFrom);
    if (code2 !== code1) {
      await A.p.fill('#acc-code', code1); await A.p.click('form[data-acc-form="code-verify"] button[type="submit"]');
      await A.p.waitForSelector('text=stimmt nicht oder ist abgelaufen'); assert(/Gast/.test(await syncText(A.p)), 'alter Code nach erneutem Senden ungültig');
    }
    await A.p.fill('#acc-code', code2); await A.p.click('form[data-acc-form="code-verify"] button[type="submit"]');
    await waitSync(A.p, /Online gespeichert/, 20000);
    const aUser = (await aApi.auth.getUser()).data.user;
    assert.equal(await A.p.evaluate(() => window.__app.Store.key()), 'rp-u:' + aUser.id, 'Kontobereich nach Code-Anmeldung');
    assert(await A.p.evaluate(id => !!(window.__app.Store.meta[id] && window.__app.Store.meta[id].version), tid), 'Kontoreise online geladen');
    assert((await A.p.textContent('#view')).includes(aMail), 'Kontoansicht zeigt die Adresse');
    assert(!(await A.p.url()).includes('code='), 'keine Codes in der Adresse');
    await A.p.goto(BASE + '#konto'); await A.p.click('[data-acc="signout"]'); await waitSync(A.p, /Gast/);
    assert.equal(await A.p.evaluate(() => window.__app.UI.authMode), 'signin', 'nach Abmelden wieder Passwort-Anmeldung');
    await A.p.goto(BASE + '#reisen'); assert((await A.p.textContent('#view')).includes('Gast-Reise ' + run), 'Gast-Reise nach Code-Anmeldung und Abmelden erhalten');
    await sleep(1500); /* Code und Reset-Link teilen sich die Mindestpause je Adresse (lokal 1 s) */

    /* Passwort vergessen über die Oberfläche */
    const before = new Date(Date.now() - 1000);
    await A.p.goto(BASE + '#konto'); await A.p.click('[data-acc="mode"][data-val="reset"]');
    await A.p.fill('#acc-email', aMail); await A.p.click('button:has-text("Link senden")'); await A.p.waitForSelector('text=ist ein Link unterwegs');
    await A.p.goto(await mailLink(aMail, /reset/i, before));
    await A.p.waitForSelector('text=Neues Passwort festlegen', { timeout: 15000 });
    await A.p.fill('#acc-pw', 'Anna-NEU-' + run); await A.p.fill('#acc-pw2', 'Anna-NEU-' + run); await A.p.click('button:has-text("Passwort speichern")');
    await A.p.waitForSelector('text=Passwort geändert', { timeout: 15000 });
    assert((await api().auth.signInWithPassword({ email: aMail, password: aPw })).error, 'altes Passwort ungültig');
    assert(!(await api().auth.signInWithPassword({ email: aMail, password: 'Anna-NEU-' + run })).error, 'neues Passwort gültig');

    /* Konto löschen (Migration 20261016120000): Übersicht, bewusste Wahl je geteilter Reise, Übergabe an Ben, Bestätigung */
    const a2 = api(); await a2.auth.signInWithPassword({ email: aMail, password: 'Anna-NEU-' + run });
    assert.ifError((await bApi.auth.signInWithPassword({ email: bMail, password: bPw })).error);
    const inv2 = await a2.rpc('create_trip_invite', { p_trip: tid, p_role: 'viewer', p_hours: 24 }); assert.ifError(inv2.error);
    assert.ifError((await bApi.rpc('accept_trip_invite', { p_token: inv2.data })).error);
    await A.p.goto(BASE + '#konto'); await A.p.click('[data-acc="delete-open"]');
    await A.p.waitForSelector('[data-del-trip="' + tid + '"]');
    assert((await A.p.textContent('.sheet')).includes('Gast-Reise ' + run), 'geteilte eigene Reise in der Übersicht');
    await A.p.fill('#acc-del-email', aMail); await A.p.click('form[data-acc-form="delete-account"] button[type="submit"]');
    await A.p.waitForSelector('#acc-del-err:not([hidden])'); assert(/bitte.*wählen/i.test(await A.p.textContent('#acc-del-err')), 'ohne Wahl keine Löschung');
    assert(!(await api().auth.signInWithPassword({ email: aMail, password: 'Anna-NEU-' + run })).error, 'Konto besteht noch');
    await A.p.selectOption('[data-del-trip="' + tid + '"]', { label: 'Übergeben an ' + bMail });
    await A.p.click('form[data-acc-form="delete-account"] button[type="submit"]');
    await waitSync(A.p, /Gast/, 20000);
    assert(!(await A.p.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('rp-u:')))), 'Kontocache nach Löschung entfernt');
    assert((await A.p.textContent('#view')).includes('Gast-Reise ' + run), 'Gastdaten im Browser unberührt');
    assert((await api().auth.signInWithPassword({ email: aMail, password: 'Anna-NEU-' + run })).error, 'gelöschtes Konto kann sich nicht anmelden');
    const kept = (await bApi.from('trips').select('id,owner_id').eq('id', tid)).data;
    assert.equal(kept.length, 1, 'übergebene Reise bleibt erhalten'); assert.equal(kept[0].owner_id, (await bApi.auth.getUser()).data.user.id, 'Ben ist Eigentümer');
    await A.ctx.close(); await B.ctx.close();
  } finally { await browser.close(); server.close(); execSync('node scripts/build.mjs', { cwd: ROOT, stdio: 'ignore' }); }
  if (errors.length) { console.error('Fehler im Browser:\n' + errors.join('\n')); process.exit(1); }
  console.log('E2E (Chromium, lokaler Supabase, /Reiseplaner/): Pfade/Direktlinks/404, Umkreis-Katalog aus der Datenbank, Registrierung+Bestätigung, Gast-Übernahme mit Vorschau, Online-Bestätigung, Neuladen, Einladung, zweites Konto, Offline-Konflikt ohne Überschreiben, Entzug, Abmelden, Anmeldung per E-Mail-Code (unbekannte Adresse gleich, kein Konto angelegt, falscher/alter Code, erneut senden), Passwort-Reset, Kontolöschung mit Übergabe geprüft.');
})().catch(async e => { console.error(e); try { server.close(); execSync('node scripts/build.mjs', { cwd: ROOT, stdio: 'ignore' }); } catch (x) {} process.exit(1); });
