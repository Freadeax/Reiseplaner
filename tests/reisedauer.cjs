/* Reisedauer (Paket 1, 18.10.): Eingabe höchstens 366 Tage, gespeicherte längere Reisen bleiben vollständig und
   die Ansichten bleiben schnell. Node-Test über window.__app mit nachgebildetem DOM, kein Browser-/iPhone-Test. */
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
function load(opt) {
  opt = opt || {};
  let code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
  code = code.replace('function openSheet(html){', 'function openSheet(html){window.__sheets.push(html);return;').replace('function closeSheet(){', 'function closeSheet(){return;');
  const memory = new Map(opt.memory || []), listeners = {}, alerts = [];
  const view = { innerHTML: '' }, msg = { hidden: true, textContent: '', style: {}, setAttribute() {} };
  const el = () => ({ hidden: false, textContent: '', className: '', innerHTML: '', style: {}, querySelector: () => ({ style: {} }), setAttribute() {}, removeAttribute() {} });
  const win = { addEventListener() {}, RPV3: require('../v3logic.js'), RPV3S: require('../v3split.js'), RPV3J: require('../v3journal.js'), RPCatalog: require('../catalog.js'), RPV3Forms: require('../v3forms.js'), RPV3Editor: require('../v3editor.js'), __sheets: [] };
  const ctx = { window: win, document: { addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }, querySelector: s => s === '#view' ? view : s === '#msg' ? msg : el(), querySelectorAll() { return []; }, getElementById() { return null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {}, style: {} } },
    localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, console, alert() {}, location: { hash: '', reload() {} }, history: { replaceState() {}, pushState() {} } };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const click = act => { const b = { getAttribute: k => k === 'data-act' ? act : null }; const target = { closest: s => s === '[data-act]' ? b : null }; return Promise.all((listeners.click || []).map(fn => fn({ target, preventDefault() {} }))).then(() => { alerts.push(msg.textContent); return msg.textContent; }); };
  /* Neue Helfer (tripLengthError, tripTooLong …) stehen nicht in window.__app; aus dem globalen Bereich der App lesen */
  const app = ctx.window.__app, a = new Proxy(app, { get: (o, k) => typeof k !== 'string' || k in o ? o[k] : vm.runInContext(k, ctx) });
  return { a, memory, view, click };
}
const ms = f => { const s = process.hrtime.bigint(); f(); return Number(process.hrtime.bigint() - s) / 1e6; };

(async () => {
/* ---------- Eingabeprüfung: 366 Tage erlaubt, 367 abgelehnt ---------- */
{
  const { a } = load();
  const fix = (start, end) => a.newTrip({ title: 'X', dateMode: 'fix', start, end });
  assert.equal(a.tripLengthError(fix('2027-01-01', '2028-01-01')), '', '366 Tage (365 Nächte) erlaubt');
  const err = a.tripLengthError(fix('2027-01-01', '2028-01-02'));
  assert(/höchstens 366 Tage/.test(err) && /367 Tage/.test(err) && /Jahr/.test(err), '367 Tage abgelehnt: ' + err);
  assert.equal(a.tripLengthError(a.newTrip({ title: 'F', dateMode: 'flex', nights: 365 })), '');
  assert(/Nächte/.test(a.tripLengthError(a.newTrip({ title: 'F', dateMode: 'flex', nights: 366 }))), 'flexible Reise mit 366 Nächten abgelehnt');
  assert.equal(a.tripLengthError(fix('2026-12-30', '2027-01-03')), '', 'normale Reise ohne Meldung');
  assert(!a.rangeText(fix('2026-12-30', '2027-01-03')).includes('Zeitraum prüfen'));
}
/* Neue Reise anlegen: abgelehnt, nichts gespeichert */
{
  const env = load(), { a } = env; a.Store.setScope('guest');
  a.UI.draft = a.newTrip({ title: 'Tippfehler', dateMode: 'fix', start: '2026-12-30', end: '2027-12-31' });
  const m = await env.click('create');
  assert(/höchstens 366 Tage/.test(m) && /367 Tage/.test(m), 'Meldung beim Anlegen: ' + m);
  assert.equal(a.Store.list().length, 0, 'keine Reise angelegt');
  assert(a.UI.draft && a.UI.draft.title === 'Tippfehler', 'Entwurf bleibt zum Korrigieren erhalten');
  a.UI.draft.end = '2027-01-03'; await env.click('create');
  assert.equal(a.Store.list().length, 1, 'nach Korrektur angelegt');
}
/* Eckdaten bearbeiten: abgelehnt, gespeicherte Reise unverändert */
{
  const env = load(), { a } = env; a.Store.setScope('guest');
  const t = a.silvesterTemplate(); a.Store.put(t);
  a.UI.view = 'reise'; a.UI.tid = t.id; a.UI.tab = 'ueber';
  const before = JSON.stringify(a.Store.get(t.id));
  a.UI.editSource = before; a.UI.edit = Object.assign(JSON.parse(before), { end: '2071-01-03' });
  const m = await env.click('edit-save');
  assert(/höchstens 366 Tage/.test(m), 'Meldung beim Bearbeiten: ' + m);
  assert.equal(JSON.stringify(a.Store.get(t.id)), before, 'gespeicherte Reise unverändert');
}

/* ---------- Gespeicherte Reise über 45 Jahre: laden, anzeigen, exportieren, nie kürzen ---------- */
{
  const first = load(); first.a.Store.setScope('guest');
  const t = first.a.silvesterTemplate(); t.title = '45 Jahre'; t.end = '2071-12-30';
  t.items = (t.items || []).concat([{ uid: 'ispaet', act: t.items[0].act, day: 12000, slot: 'nachm' }]);
  assert(first.a.Store.put(t), 'Store.put lehnt lange Reise nicht ab');
  const raw = first.memory.get('rp-trips');
  const { a, view, memory } = load({ memory: [...first.memory] }); a.Store.setScope('guest');
  assert.equal(a.Store.corruptRaw, null, 'Speicher lesbar');
  const st = a.Store.get(t.id);
  assert(st && st.start === '2026-12-30' && st.end === '2071-12-30', 'Zeitraum unverändert geladen');
  assert(st.items.some(i => i.uid === 'ispaet' && i.day === 12000), 'Punkt nach Tag 366 bleibt erhalten');
  assert.equal(a.daysOf(st).length, 16437, 'daysOf liefert weiter alle Tage');
  assert(a.tripTooLong(st) && a.rangeText(st).includes('Zeitraum prüfen'), 'Hinweis im Zeitraumtext');
  const exp = a.backupData(a.Store.list());
  const et = exp.trips.find(x => x.id === t.id) || exp.trips.find(x => JSON.stringify(x).includes('2071-12-30'));
  assert(et && JSON.stringify(et).includes('2071-12-30') && JSON.stringify(et).includes('ispaet'), 'Export vollständig');
  assert.doesNotThrow(() => a.validateBackup(JSON.parse(JSON.stringify(exp))), 'Export wieder einlesbar');
  const tabs = ['ueber', 'suche', 'angebote', 'unterkunft', 'unternehmen', 'plan', 'kosten', 'check', 'notiz', 'mappe'], took = {};
  a.UI.view = 'reise'; a.UI.tid = t.id;
  const total = ms(() => tabs.forEach(tab => { a.UI.tab = tab; took[tab] = ms(() => a.render()); assert(!view.innerHTML.includes('Die Ansicht konnte nicht geladen werden'), tab + ' ohne Fehler'); if (tab === 'plan') a.UI.planHtml = view.innerHTML; if (tab === 'mappe') a.UI.mappeHtml = view.innerHTML; }));
  assert(total < 2000, 'alle Ansichten in unter 2 s: ' + Math.round(total) + ' ms ' + JSON.stringify(Object.fromEntries(Object.entries(took).map(([k, v]) => [k, Math.round(v)]))));
  assert(a.UI.planHtml.includes('Der Tagesplan zeigt nur die ersten 366 Tage'), 'Tagesplan mit sichtbarem Hinweis');
  assert(a.UI.mappeHtml.includes('Die Reisemappe zeigt nur die ersten 366 Tage'), 'Reisemappe mit sichtbarem Hinweis');
  assert(a.UI.planHtml.length < 2e6, 'Tagesplan baut nicht alle 16.437 Tage auf');
  const txt = a.tripText(st);
  assert(txt.includes('Zeitraum prüfen') && txt.includes('2071'), 'Teilen-Text mit Hinweis');
  const ics = a.icsData(st); assert(ics && ics.events >= 2, 'Kalenderexport weiter möglich');
  assert.equal(memory.get('rp-trips'), raw, 'Anzeigen und Exportieren verändert rp-trips nicht');
}
/* Tagebuch: lange Reise zeigt Hinweis und Einträge auch nach Tag 366 */
{
  const { a } = load(); a.Store.setScope('guest');
  const t = a.silvesterTemplate(); t.schemaVersion = 3; t.end = '2071-12-30';
  const late = a.journalDays(t)[10000].date; t.journal = { [late]: { text: 'Später Eintrag' } };
  a.validateExtras(t); a.Store.put(t);
  let sec; const d = ms(() => { sec = a.journalSection(a.Store.get(t.id), 'plan'); });
  assert(d < 1000, 'Tagebuch schnell: ' + Math.round(d) + ' ms');
  assert(sec.includes('data-trip-long') && sec.includes('Später Eintrag') && /weitere Tage ohne Eintrag ausgeblendet/.test(sec), 'Hinweis und später Eintrag sichtbar');
}
/* daysOf-Zwischenspeicher folgt Datumsänderungen */
{
  const { a } = load();
  const t = a.newTrip({ title: 'C', dateMode: 'fix', start: '2027-03-01', end: '2027-03-04' });
  assert.equal(a.daysOf(t).length, 4); t.end = '2027-03-10'; assert.equal(a.daysOf(t).length, 10);
  t.dateMode = 'flex'; t.nights = 2; assert.equal(a.daysOf(t).length, 3); assert.equal(a.daysOf(t)[0].date, null);
}
console.log('Reisedauer: Eingabe bis 366 Tage, 367 abgelehnt (Anlegen und Eckdaten), Reise über 45 Jahre lädt, exportiert vollständig, rendert alle Ansichten unter 2 s mit Hinweis „Zeitraum prüfen“, Tagebuch mit späten Einträgen. Kein Browser-/iPhone-Test.');
})().catch(e => { console.error(e); process.exit(1); });
