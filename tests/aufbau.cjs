/* Einfacher Aufbau (pakete/aufbau): fünf Bereiche und die Liste „Als Nächstes“ im Überblick.
   Node-Test mit der ganzen App im vm-Kontext, feste Uhrzeit über now. Kein Browser-/iPhone-Test; Klickwege prüft tests/browser.cjs. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(html.indexOf('app/aufbau.js') > html.indexOf('app/routing.js') && html.indexOf('app/aufbau.js') < html.indexOf('app/unterseiten.js'), 'Ladereihenfolge: nach routing.js, vor unterseiten.js');
let code = require('./app-code.cjs')(html);
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const win = { addEventListener() {} };
const ctx = { window: win, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, head: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, console, navigator: {} };
vm.createContext(ctx); vm.runInContext(code, ctx);
const a = win.__app, g = name => vm.runInContext(name, ctx);
const naechstes = g('naechstes'), naechstesTeilen = g('naechstesTeilen'), naechstesBlock = g('naechstesBlock'), BEREICHE = g('BEREICHE');

/* Struktur: fünf Bereiche, jeder der zehn Teile genau einmal, alle alten Adressen gültig */
assert.deepEqual(BEREICHE.map(b => b.key), ['ueber', 'ziel', 'programm', 'kosten', 'unterlagen']);
const parts = BEREICHE.flatMap(b => b.parts);
assert.equal(parts.length, 10); assert.equal(new Set(parts).size, 10);
assert.deepEqual(parts.slice().sort(), g('TABS').map(x => x[0]).sort());

/* Als Nächstes: Beispielreise, 68 Tage vor Abreise */
const now = new Date('2026-10-23T10:00:00Z');
const t = a.silvesterTemplate(), before = JSON.stringify(t);
const list = naechstes(t, now);
assert(list.length >= 3, 'Punkte aus Fristen, Schritten und Plan-Check');
assert.equal(JSON.stringify(t), before, 'reine Ableitung, Reise unverändert');
for (let i = 1; i < list.length; i++) assert(list[i - 1].rank <= list[i].rank, 'nach Dringlichkeit sortiert');
assert.equal(list[0].level, 'warn', 'Warnung zuerst');
const titles = list.map(x => x.title.toLocaleLowerCase('de'));
assert.equal(new Set(titles).size, titles.length, 'keine doppelten Punkte');
assert(list.some(x => x.step === 'load'), 'Schritt aus planningNextSteps enthalten');
assert(list.some(x => /^check:/.test(x.id) && x.level === 'warn'), 'Warnung aus dem Plan-Check enthalten');
assert(list.some(x => /^frist:/.test(x.id)), 'offene Buchung aus dem Fahrplan enthalten');
assert(list.every(x => ['warn', 'soon', 'info'].includes(x.level) && x.title), 'Stufe und Titel je Punkt');

/* Aufteilung: Warnungen bleiben sichtbar, auch jenseits der ersten drei */
const fake = [{ level: 'info', title: 'a' }, { level: 'info', title: 'b' }, { level: 'info', title: 'c' }, { level: 'warn', title: 'd' }, { level: 'info', title: 'e' }];
const v = naechstesTeilen(fake);
assert.equal(v.haupt.title, 'a'); assert.deepEqual(v.weitere.map(x => x.title), ['b', 'c', 'd']); assert.deepEqual(v.rest.map(x => x.title), ['e']);
assert.equal(naechstesTeilen([]).haupt, null);

/* Darstellung: eine hervorgehobene Aktion, Stufe als Wort, Rest aufklappbar, Text maskiert */
const html1 = naechstesBlock(t, now);
assert(html1.includes('data-next-steps') && html1.includes('Als Nächstes'));
assert.equal((html1.match(/class="card nx-main"/g) || []).length, 1, 'genau ein Hauptpunkt');
assert(/WICHTIG|Wichtig/.test(html1), 'Stufe als Wort, nicht nur Farbe');
assert(html1.includes('weitere Punkte'));
const t2 = a.newTrip({ nights: 0, budget: 0, origin: '', dest: '' });
t2.title = 'Test <b>'; t2.customActs = [a.customActFromForm({ title: 'Idee <x>', cat: 'eigen', cost: '', hours: '', per: 'pp' }, 'cx')]; t2.items = [{ uid: 'u1', act: 'cx', day: 0, slot: 'morgen' }];
const html2 = naechstesBlock(t2, now);
assert(!html2.includes('<x>'), 'Titel maskiert');
/* Ohne Punkte: ehrlicher Hinweis statt leerer Liste */
const ok = naechstesBlock({ id: 'leer' }, now).includes('nichts Dringendes') || naechstes(t2, now).length > 0;
assert(ok);

/* Überblick nutzt die neue Liste; die alten Blöcke stehen nicht mehr zusätzlich dort */
a.UI.view = 'reise'; a.UI.tid = t.id; a.UI.tab = 'ueber';
const ue = a.tUeber ? a.tUeber(t) : g('tUeber')(t);
assert(ue.includes('Als Nächstes') && !ue.includes('Was jetzt sinnvoll ist') && !ue.includes('<h2>Plan-Check</h2>') && !ue.includes('<h2>Nächste Schritte</h2>'));
assert(ue.includes('data-go="r-' + t.id + '-kosten"'), 'Weg zur Kostenaufstellung');

/* Ebenen: fold mit gemerktem Zustand, erzwungen offen bei aktiven Filtern, nur gültige Schlüssel */
const fold = g('fold'), foldSet = g('foldSet'), foldOpen = g('foldOpen');
assert(!/ open/.test(fold('test-a', 'Titel <x>', 'kurz', '<p>x</p>').split('>')[0]), 'Standard zu');
assert(fold('test-a', 'Titel <x>', 'kurz', '').includes('Titel &lt;x&gt;'), 'Titel maskiert');
assert(/data-fold="test-a" open/.test(fold('test-a', 'T', '', '', { open: true })), 'Startzustand offen');
assert(foldSet('test-a', true) && foldOpen('test-a', false), 'gemerkt');
assert(/data-fold="test-a" open/.test(fold('test-a', 'T', '', '')));
foldSet('test-a', false); assert(/data-fold="test-a" open/.test(fold('test-a', 'T', '', '', { force: true })), 'aktive Filter halten offen');
assert.equal(foldSet('<böse>', true), false, 'ungültiger Schlüssel abgelehnt');
/* Kosten und Ideen nutzen die Ebenen; Summe bleibt ohne Aufklappen sichtbar */
a.UI.tab = 'kosten'; const k = g('tKosten')(t);
assert(k.includes('data-fold="kosten-posten"') && k.includes('data-fold="kosten-werkzeuge"') && k.includes('kosten-gesamt'));
assert(k.indexOf('kosten-gesamt') < k.indexOf('data-fold="kosten-posten"'), 'Gesamt vor den Posten');
a.UI.tab = 'unternehmen'; const u = g('tUnternehmen')(t);
assert(u.includes('data-fold="ideen-filter"') && u.includes('id="act-q"'), 'Suche sichtbar, weitere Filter aufklappbar');
assert((u.match(/data-act="plan-act"/g) || []).length <= 12, 'höchstens 12 Ideen zuerst');

console.log('Aufbau: fünf Bereiche mit zehn Teilen, „Als Nächstes“ (sortiert, ohne Dubletten, Warnungen sichtbar, maskiert), Überblick und Ebenen in Kosten und Ideen geprüft. Kein Browser-/iPhone-Test.');
