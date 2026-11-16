/* Rückblick, Nachbereitung, „Nochmal so eine Reise“ und Konto › Meine Daten (app/rueckblick.js, 16.11.2026).
   Node-Test mit kleiner DOM-Attrappe und fester Uhrzeit über now. Kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const J = require('../v3journal.js');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert(html.includes('<script src="app/rueckblick.js"></script>'), 'rueckblick.js eingebunden');
assert(html.indexOf('app/rueckblick.js') > html.indexOf('app/reisebuch.js') && html.indexOf('app/rueckblick.js') > html.indexOf('app/fotos.js') && html.indexOf('app/rueckblick.js') < html.indexOf('app/start.js'), 'Ladereihenfolge');
function load() {
  const code = require('./app-code.cjs')(html).replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '')
    .replace('function closeSheet(){', 'function closeSheet(){return;');
  const memory = new Map();
  const node = () => ({ innerHTML: '', hidden: false, style: {}, className: '', textContent: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, getAttribute(k) { return this.attrs[k]; },
    querySelector() { return { style: {} }; }, querySelectorAll() { return []; } });
  const dom = { '#view': node(), '#dock': node(), '#dock-nm': node(), '#dock-sum': node(), '#dock-bar': node(), '#app-nav': node() };
  const win = { addEventListener() {}, RPV3: require('../v3logic.js'), RPCatalog: require('../catalog.js'), RPV3J: J, RPV3S: require('../v3split.js'), RPIST: require('../istvergleich.js') };
  const ctx = {
    window: win, history: { replaceState() {} },
    document: { addEventListener() {}, querySelector: s => dom[s] || null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, style: {} }), body: { appendChild() {}, style: {} } },
    localStorage: { getItem: k => memory.has(k) ? memory.get(k) : null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) },
    setTimeout: () => 0, clearTimeout() {}, console, alert() {}
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  return { a: win.__app, dom, ctx };
}
const at = s => new Date(s + 'T12:00:00');

/* ---------- 1. Kennzahlen und Nachbereitung ---------- */
{
  const { a } = load();
  const t = a.silvesterTemplate(); t.id = 'tsil'; t.schemaVersion = Math.max(3, t.schemaVersion || 0);
  const actId = t.items.map(i => i.act).find(id => a.ACTS[id] && !a.ACTS[id].transit);
  t.journal = { '2026-12-31': { text: 'Feuerwerk', mood: 5 } }; t.ratings = { [actId]: 5 };
  J.validate(t); a.validateExtras(t); a.Store.put(t, true);
  const before = JSON.stringify(a.Store.get('tsil'));
  /* vor der Reise: keine Nachbereitung */
  let s = a.rbStats(a.Store.get('tsil'), at('2026-12-01'));
  assert.equal(s.phase, 'vor'); assert.equal(a.rbSteps(s).length, 0);
  /* unterwegs: im Rückblick, aber nicht „frisch zurück“ */
  assert.equal(a.rbFresh(null, at('2027-01-01')).length, 0);
  /* nach der Reise */
  s = a.rbStats(a.Store.get('tsil'), at('2027-01-10'));
  assert.equal(s.phase, 'nach'); assert.equal(s.since, 7);
  assert.equal(s.journal.days, 5); assert.equal(s.journal.written, 1);
  assert(s.ratings.planned >= 1 && s.ratings.rated === 1);
  const steps = a.rbSteps(s), by = k => steps.find(x => x.key === k);
  assert(!by('tagebuch').done && by('tagebuch').text === '1 von 5 Tagen beschrieben');
  assert(by('kosten') && !by('kosten').done && by('kosten').text.includes('Noch keine Zahlungen oder Ausgaben erfasst'), 'ohne Erfassung kein Ist und nicht 0 €');
  assert(!/0,00 €|0 €/.test(by('kosten').text), 'unbekannt ist nicht 0 €');
  assert(by('buch').optional && !a.rbOpen(steps).includes(by('buch')), 'Reisebuch ist freiwillig');
  /* Frisch zurück: innerhalb von RB_FRESH_DAYS, danach nicht mehr */
  assert.deepEqual(a.rbFresh(null, at('2027-01-10')).map(x => x.trip.id), ['tsil']);
  assert.equal(a.rbFresh(null, at('2027-06-01')).length, 0, 'nach ' + a.RB_FRESH_DAYS + ' Tagen kein Anstoß mehr');
  /* Ansicht Erinnerungen */
  let h = a.vRueckblick(null, at('2027-01-10'));
  assert(h.includes('data-rb-fresh="tsil"') && h.includes('Frisch zurück · seit 7 Tagen'));
  assert(h.includes('<h3 class="rb-year">2026</h3>') && h.includes('data-memory-trip="tsil"'));
  assert(h.includes('Highlights: <b>') && h.includes('data-rb-again="tsil"') && h.includes('data-rb-book="tsil"'));
  assert(h.includes('data-go="r-tsil-kosten"') && h.includes('data-go="r-tsil-plan"'));
  /* Reisen-Seite: Hinweis und Kartenzeile */
  h = a.rbReisenHint(a.Store.list(), at('2027-01-10'));
  assert(h.includes('data-rb-hint="tsil"') && h.includes('data-go="erinnerungen"'));
  assert.equal(a.rbReisenHint(a.Store.list(), at('2026-12-01')), '');
  assert(a.rbCardLine(a.Store.get('tsil'), at('2027-01-10')).includes('Rückblick: 1 von 5 Tagen im Tagebuch'));
  assert.equal(a.rbCardLine(a.Store.get('tsil'), at('2026-12-01')), '');
  /* nichts gespeichert */
  assert.equal(JSON.stringify(a.Store.get('tsil')), before, 'Rückblick ist nur lesend');
  /* Maskierung */
  const x = a.newTrip({ id: 'txss', title: '<img src=x onerror=alert(1)>', dateMode: 'fix', start: '2026-05-01', end: '2026-05-03' });
  h = a.vRueckblick([x], at('2026-05-10'));
  assert(!h.includes('<img') && h.includes('&lt;img'));
  /* kommende Reisen werden gezählt, nicht als Rückblick gezeigt */
  const future = a.newTrip({ id: 'tfut', title: 'Später', dateMode: 'fix', start: '2027-08-01', end: '2027-08-03' });
  h = a.vRueckblick([x, future], at('2026-05-10'));
  assert(!h.includes('data-memory-trip="tfut"') && h.includes('1 weitere Reise liegt noch vor euch'));
}

/* ---------- 2. Nochmal so eine Reise ---------- */
{
  const { a } = load();
  const t = a.silvesterTemplate(); t.id = 'tsrc'; t.notes = 'Buchungsnummer 123'; a.Store.put(t, true);
  const d = a.rbAgainDraft(a.Store.get('tsrc'));
  assert.notEqual(d.id, 'tsrc');
  assert.equal(d.type, t.type); assert.equal(d.persons, t.persons); assert.equal(d.budget, t.budget); assert.equal(d.nights, a.nightsOf(t));
  assert.equal(d.dateMode, 'open'); assert.equal(d.start, ''); assert.equal(d.status, 'idee');
  assert.deepEqual(d.items, []); assert.equal(d.notes, ''); assert.equal(d.stayId, ''); assert.equal(d.stayQuote, null);
  assert(!('offers' in d) && !('ledger' in d) && !('journal' in d) && !('docs' in d), 'keine Angebote, Zahlungen, Tagebücher, Unterlagen');
  assert(d.title.startsWith('Nochmal: '));
  assert.equal(a.Store.list().length, 1, 'Entwurf wird nicht gespeichert');
  assert(a.rbAgain('tsrc')); assert.equal(a.UI.view, 'neu');
  assert(a.rbDraftNote().includes('Vorbereitet nach') && a.rbDraftNote().includes('nicht übernommen'));
  a.UI.draft = a.newTrip(); assert.equal(a.rbDraftNote(), '', 'Hinweis nur zum passenden Entwurf');
  assert.equal(a.rbAgain('gibtsnicht'), false);
}

/* ---------- 3. Konto › Meine Daten ---------- */
{
  const { a } = load();
  let h = a.kontoDaten();
  assert(h.includes('data-konto-daten') && h.includes('data-act="backup-all" disabled') && h.includes('data-act="import-open"') && h.includes('id="import-file"'));
  assert(h.includes('Allgemeine Vorlieben') && h.includes('noch nicht gewählt') && h.includes('data-go="entdecken"'));
  a.Store.put(a.silvesterTemplate(), true);
  h = a.kontoDaten(); assert(!h.includes('data-act="backup-all" disabled'));
  assert(a.rbBackupHint().includes('data-go="konto"'));
  const list = a.vReisen();
  assert(!list.includes('Reisen sichern & übertragen') && list.includes('data-rb-backup-link'), 'Sicherung zieht ins Konto, Kurzlink bleibt');
  a.Store.list().forEach(t => a.Store.remove ? a.Store.remove(t.id) : null);
}
console.log('Rückblick: Kennzahlen, Nachbereitung (unbekannt ≠ 0 €), Frisch zurück (Zeitfenster), Erinnerungen nach Jahren, Reisen-Hinweis, Nochmal so eine Reise (nur Entwurf, keine Buchungen), Konto › Meine Daten geprüft. Kein Browser-/iPhone-Test.');
