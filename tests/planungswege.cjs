/* Planungswege (app/planungswege.js, docs/PLANUNGSWEGE.md): alle Einstiege bauen dieselbe Reise, Wünsche & Grenzen als Format 5,
   unbekannte Preise bleiben offen, Abgleich zählt Unbekanntes nie als Treffer.
   Node-Test mit der ganzen App im vm-Kontext. Kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert(html.indexOf('app/planungswege.js') > html.indexOf('app/offline.js') && html.indexOf('app/planungswege.js') < html.indexOf('app/start.js'), 'Ladereihenfolge: nach offline.js, vor start.js');
let code = require('./app-code.cjs')(html);
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const stored = new Map();
const win = { addEventListener() {}, RPV3: require('../v3logic.js'), RPV5: require('../v5logic.js') };
const ctx = { window: win, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, getElementById() { return null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, head: { appendChild() {} } },
  localStorage: { getItem(k) { return stored.has(k) ? stored.get(k) : null; }, setItem(k, v) { stored.set(k, String(v)); } },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, setTimeout, clearTimeout, console, navigator: {} };
vm.createContext(ctx); vm.runInContext(code, ctx);
const g = name => vm.runInContext(name, ctx);
const a = win.__app;
const newTrip = a.newTrip, cost = g('cost'), openCosts = g('openCosts');
const pwBuildTrip = g('pwBuildTrip'), pwCriteria = g('pwCriteria'), pwSetGrad = g('pwSetGrad'), pwGradOf = g('pwGradOf'), pwLeer = g('pwLeer');
const pwStayTrip = g('pwStayTrip'), pwErlebnisTrip = g('pwErlebnisTrip'), pwPruefung = g('pwPruefung'), pwFehlt = g('pwFehlt'), pwKurz = g('pwKurz');
const V5 = g('V5'), PW_WEGE = g('PW_WEGE'), PW_KRIT = g('PW_KRIT'), PW_ROUTES = g('PW_ROUTES'), SUB_LEVEL0 = g('SUB_LEVEL0');
const plain = x => JSON.parse(JSON.stringify(x));
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

/* 1 · Sechs Einstiege, alle erreichbar */
ok(PW_WEGE.length === 6, 'sechs Wege');
ok(PW_WEGE.map(w => w.key).join() === 'schritte,frei,ziel,unterkunft,erlebnis,vorlage', 'Reihenfolge der Wege');
PW_ROUTES.forEach(r => ok(SUB_LEVEL0.includes(r), 'Route ' + r + ' ist eine Unterseite'));
ok(PW_KRIT.every(k => /^[a-z][a-z0-9_-]{0,39}$/.test(k.key)), 'Wunsch-Schlüssel passen zu RPV5');

/* 2 · Wünsche: ein Schlüssel nur in einer Gruppe, erneut tippen hebt auf */
let c = pwLeer();
c = pwSetGrad(c, 'wellness', 'must'); ok(pwGradOf(c, 'wellness') === 'must', 'Muss gesetzt');
c = pwSetGrad(c, 'wellness', 'like'); ok(pwGradOf(c, 'wellness') === 'like' && !c.must.includes('wellness'), 'Wechsel in andere Gruppe entfernt aus alter');
c = pwSetGrad(c, 'wellness', ''); ok(pwGradOf(c, 'wellness') === '', 'Aufheben');
assert.throws(() => pwSetGrad(c, 'quatsch', 'must'), /Unbekannter Wunsch/);

/* 3 · Ohne Wünsche: Reise wie bisher (kein Formatwechsel), gleiche Kosten wie das Formular */
const draft = Object.assign(newTrip(), { title: 'Silvester', type: 'winter', dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', persons: 2, budget: 1500, origin: 'Hattenhofen', travel: 'auto', km: 180 });
const t0 = pwBuildTrip(draft, pwLeer(), { id: 'tpw1', today: '2026-11-16' });
ok(t0.schemaVersion === undefined && !t0.criteria, 'ohne Wünsche kein Format 5');
const viaForm = Object.assign(plain(draft), { id: 'tpw1', created: '2026-11-16' });
ok(JSON.stringify(plain(t0)) === JSON.stringify(viaForm), 'geführter Weg und Formular ergeben dieselbe Reise');
ok(cost(t0).total === cost(viaForm).total, 'gleiche Kostenrechnung');

/* 4 · Mit Wünschen: Format 5, gültig, budgetMax = Obergrenze, Heimkehr mit Datum bei festen Daten */
let crit = pwLeer(); crit = pwSetGrad(crit, 'wellness', 'must'); crit = pwSetGrad(crit, 'schnee', 'like'); crit = pwSetGrad(crit, 'kinder', 'avoid');
Object.assign(crit, { budgetWish: 1200, maxDriveMin: 180, returnTime: '16:00', cancel: 'frei', notes: 'Abends nicht mehr fahren' });
const t1 = pwBuildTrip(draft, crit, { id: 'tpw2' });
ok(t1.schemaVersion === 5, 'Format 5');
ok(JSON.stringify(plain(t1.criteria)) === JSON.stringify({ must: ['wellness'], like: ['schnee'], avoid: ['kinder'], budgetWish: 1200, maxDriveMin: 180, returnBy: { date: '2027-01-03', time: '16:00' }, cancel: 'frei', notes: 'Abends nicht mehr fahren' }), 'criteria-Form');
V5.validateV5(t1); ok(true, 'validateV5');
ok(V5.budgetMax(t1) === 1500, 'Obergrenze aus t.budget');
ok(pwKurz(t1.criteria).includes('Muss: Wellness & Sauna') && pwKurz(t1.criteria).includes('zuhause bis 16:00'), 'Kurztext');

/* 5 · Fehler: Wunsch über Obergrenze, ungültige Daten, Fahrzeit, Uhrzeit */
assert.throws(() => pwCriteria({ budgetWish: 2000 }, draft), /über der Obergrenze/); n++;
assert.throws(() => pwBuildTrip(Object.assign({}, draft, { end: '2026-12-29' }), pwLeer()), /Abreise nicht vor Anreise/); n++;
assert.throws(() => pwCriteria({ returnTime: '25:00' }, draft), /HH:MM/); n++;
assert.throws(() => pwCriteria({ budgetWish: -5 }, draft), /ab 0/); n++;
ok(pwFehlt('zeit', Object.assign({}, draft, { start: '' }), pwLeer()) !== '', 'Schritt Zeit meldet fehlendes Datum');
ok(pwFehlt('geld', draft, { budgetWish: 1600 }) !== '', 'Schritt Budget meldet Wunsch über Obergrenze');
ok(pwFehlt('art', draft, pwLeer()) === '', 'Art ist nie blockiert');
ok(pwCriteria(pwLeer(), draft) === null, 'leere Wünsche = null');

/* 6 · Unterkunft zuerst: Preis gesamt → je Nacht; unbekannter Preis bleibt offen, nie 0 € als sichere Aussage */
const t2 = pwStayTrip(draft, { name: 'Landhaus Test', ort: 'Oberstdorf', price: '800', per: 'gesamt', sauna: true }, null, { id: 'tpw3' });
ok(t2.stayId && t2.customStays.length === 1 && t2.customStays[0].priceNight === 200, '800 € für 4 Nächte = 200 € je Nacht');
ok(t2.dest === 'Oberstdorf', 'Ziel aus Ort, wenn leer');
const stayLine = cost(t2).lines.find(l => l.key === 'stay');
ok(stayLine.c === 800, 'Unterkunft 800 € in der Kostenrechnung');
const t3 = pwStayTrip(Object.assign({}, draft, { title: '' }), { name: 'Pension Unbekannt', ort: 'Pfronten', price: '' }, null, { id: 'tpw4' });
ok(t3.title === 'Pension Unbekannt', 'Titel aus Unterkunft');
ok(t3.customStays[0].priceOpen === true, 'Preis offen markiert');
const open = cost(t3).lines.find(l => l.key === 'stay');
ok(open.open === true && /Preis noch offen/.test(open.s), 'Kostenzeile „Preis noch offen“');
ok(openCosts(t3).includes('Unterkunftspreis unbekannt'), 'offene Angabe verhindert „im Budget“');
assert.throws(() => pwStayTrip(draft, { name: '' }), /Namen der Unterkunft/); n++;
assert.throws(() => pwStayTrip(draft, { name: 'X', price: '-3' }), /ab 0/); n++;
assert.throws(() => pwStayTrip(draft, { name: 'X', url: 'javascript:alert(1)' }), /https/); n++;

/* 7 · Erlebnis zuerst: Datum → Reisetag, außerhalb abgelehnt, Preis offen bleibt offen */
const t4 = pwErlebnisTrip(draft, [{ t: 'Silvesterkonzert', cat: 'genuss', date: '2026-12-31', cost: '45', per: 'pp', slot: 'abend' }, { t: 'Therme', cat: 'wellness', cost: '' }], null, { id: 'tpw5' });
ok(t4.items.length === 2 && t4.items[0].day === 1 && t4.items[0].slot === 'abend', 'Silvester am 31.12. = Tag 2 (Index 1), abends');
ok(t4.customActs[1].costOpen === true && t4.customActs[1].cost === 0, 'Therme ohne Preis: offen');
ok(t4.customActs[0].cost === 45 && t4.customActs[0].costOpen === false, 'Konzert 45 € p. P.');
assert.throws(() => pwErlebnisTrip(draft, [{ t: 'Zu spät', date: '2027-01-05' }]), /außerhalb/); n++;
assert.throws(() => pwErlebnisTrip(draft, []), /mindestens ein/); n++;

/* 8 · Abgleich: Unbekanntes ist nie „passt“ */
const t5 = pwStayTrip(draft, { name: 'Ohne Sauna-Angabe', ort: 'Oy', price: '' }, crit, { id: 'tpw6' });
const rows = pwPruefung(t5);
const r = l => rows.find(x => x.label.startsWith(l));
ok(r('Obergrenze').state === 'open', 'offene Kosten: Obergrenze offen, nicht ok');
ok(!r('Wunschbudget'), 'kein Wunschbudget-Urteil bei offenen Kosten');
ok(r('Fahrzeit').state === 'open' || r('Fahrzeit').state === 'warn', 'Fahrzeit nur geschätzt');
ok(r('Wellness & Sauna').state === 'open', 'eigene Unterkunft ohne Haken: unbestätigt');
const t6 = Object.assign(plain(t5), { kmSrc: 'route', routeMin: 240 });
ok(pwPruefung(t6).find(x => x.label === 'Fahrzeit').state === 'bad', 'berechnete Fahrzeit über Grenze');
const t7 = Object.assign(plain(t5), { budget: 50, criteria: Object.assign({}, t5.criteria, { budgetWish: 40 }) });
t7.customStays[0] = Object.assign({}, t7.customStays[0], { priceOpen: undefined, priceNight: 100 }); delete t7.customStays[0].priceOpen;
ok(pwPruefung(t7).find(x => x.label === 'Obergrenze').state === 'bad', 'über Obergrenze ist „passt nicht“, auch wenn noch Angaben offen sind');
ok(pwPruefung(newTrip()).length === 0, 'ohne Wünsche kein Abgleich');

console.log('Planungswege: ' + n + ' Prüfungen bestanden (6 Wege, Wünsche, Format 5, Unterkunft/Erlebnis zuerst, offene Preise, Abgleich). Node-Test, kein Browser-/iPhone-Test.');
