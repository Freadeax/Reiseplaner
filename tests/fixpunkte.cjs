/* Fixpunkte, Puffer und Realismus im Tagesplan (docs/FIXPUNKTE_PUFFER.md). Node-Test, kein Browser-/iPhone-Test. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const C = require('../catalog.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let code = require('./app-code.cjs')(html);
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const win = { addEventListener() {}, RPCatalog: C, RPV3: require('../v3logic.js') };
const ctx = { window: win, document: { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} }, head: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, console, navigator: {} };
vm.createContext(ctx); vm.runInContext(code, ctx);
const a = win.__app, F = win.RPFix;
assert(F && typeof F.fixTrip === 'function', 'window.RPFix vorhanden');
let n = 0;
const act = (id, title, hours) => ({ id, custom: true, t: title, cat: 'eigen', cost: 0, per: 'grp', hours, dur: hours != null ? 'ca. ' + hours + ' Std.' : '', note: '' });
const trip = o => a.newTrip(Object.assign({ dateMode: 'fix', start: '2026-12-30', end: '2027-01-03', dest: 'Oberstdorf', origin: 'Hattenhofen', km: 0, travel: 'auto' }, o));

/* 1 · Fixpunkte aus vorhandenen Angaben: Abfahrt, Check-in, gebuchter Termin, festes Datum, Abreise ohne Uhrzeit */
{
  const t = trip({ departTime: '08:00', checkinTime: '15:00' });
  t.customActs = [act('cmass', 'Massage', 1), act('crod', 'Rodeln', 2), act('cgala', 'Silvestergala', 4)];
  t.customActs[2].onlyDate = '12-31';
  t.items = [{ uid: 'i1', act: 'cmass', day: 1, slot: 'nachm', time: '15:00' }, { uid: 'i2', act: 'crod', day: 1, slot: 'morgen', time: '10:00' }, { uid: 'i3', act: 'cgala', day: 1, slot: 'abend', time: '19:00' }];
  t.ledger = { 'act:cmass': { status: 'gebucht', amount: 80, paid: 0 } };
  const before = JSON.stringify(t);
  const p = F.fixPoints(t);
  assert.deepEqual(p.map(f => f.kind), ['anreise', 'checkin', 'termin', 'datum', 'abreise']);
  assert.equal(p.find(f => f.kind === 'termin').why, 'gebucht');
  assert.equal(p.find(f => f.kind === 'abreise').time, null, 'Abreise ohne Uhrzeit bleibt offen');
  assert.equal(p.find(f => f.kind === 'abreise').day, 4);
  const r = F.fixTrip(t);
  assert.equal(r.days[1].state, 'ausgewogen', 'Rodeln 10–12, Massage 15–16, Gala 19–23: genug Puffer');
  assert.equal(r.days[1].issues.length, 0);
  assert.equal(r.days[4].state, 'frei', 'Abreise ohne Uhrzeit allein macht den Tag nicht unsicher');
  assert(r.notes.some(x => /Abfahrtszeit am Abreisetag offen/.test(x.text)));
  assert.equal(JSON.stringify(t), before, 'reine Ableitung, Reise unverändert');
  assert(F.fixItemMark(t, t.items[0]).includes('Fixpunkt: '), 'Kennzeichen mit Text für Vorlesehilfen');
  assert.equal(F.fixItemMark(t, t.items[1]), '', 'verschiebbarer Punkt ohne Kennzeichen');
  n++;
}

/* 2 · Konflikt, knapper Puffer, fehlende Uhrzeit/Dauer */
{
  const t = trip({});
  t.customActs = [act('cmass', 'Massage', 1), act('crod', 'Rodeln', 2), act('cmus', 'Museum', null), act('ckaf', 'Kaffee', 0.5)];
  t.ledger = { 'act:cmass': { status: 'gebucht', amount: 80, paid: 80 } };
  /* Rodeln 14:00–16:00 überschneidet Massage 15:00 */
  t.items = [{ uid: 'm', act: 'cmass', day: 2, slot: 'nachm', time: '15:00' }, { uid: 'r', act: 'crod', day: 2, slot: 'nachm', time: '14:00' }];
  let d = F.fixTrip(t).days[2];
  assert.equal(d.state, 'konflikt');
  assert.equal(d.issues.filter(i => i.level === 'konflikt').length, 1, 'eine Überschneidung, einmal gemeldet');
  assert(/Rodeln \(14:00–16:00\) überschneidet sich mit Massage \(15:00–16:00\)/.test(d.issues[0].text), d.issues[0].text);
  assert.equal(F.fixPoints(t).find(f => f.uid === 'm').why, 'bezahlt');
  /* Rodeln 12:45–14:45, Massage 15:00: 15 Min. = Richtwert → ok; 12:50 → knapp */
  t.items[1].time = '12:45'; t.items[1].slot = 'mittag';
  d = F.fixTrip(t).days[2];
  assert.equal(d.issues.length, 0, 'genau Richtwert reicht');
  assert.equal(d.buffers[0].have, 15);
  t.items[1].time = '12:55';
  d = F.fixTrip(t).days[2];
  assert.equal(d.state, 'knapp');
  assert(/nur 5 Min\. frei nach Rodeln, empfohlen 15 Min\./.test(d.issues[0].text), d.issues[0].text);
  /* Museum mit Uhrzeit, aber ohne Dauer vor dem Fixpunkt: nicht prüfbar, nie „passt“ */
  t.items[1] = { uid: 'x', act: 'cmus', day: 2, slot: 'mittag', time: '13:00' };
  d = F.fixTrip(t).days[2];
  assert.equal(d.state, 'unsicher');
  assert(d.issues.some(i => i.level === 'unsicher' && /Museum hat keine Dauer/.test(i.text)));
  /* Kaffee ohne Uhrzeit in derselben Tageszeit wie die Massage */
  t.items[1] = { uid: 'k', act: 'ckaf', day: 2, slot: 'nachm' };
  d = F.fixTrip(t).days[2];
  assert.equal(d.state, 'unsicher');
  assert(d.issues.some(i => /Kaffee hat keine Uhrzeit/.test(i.text)));
  /* Gebuchter Termin ohne Uhrzeit */
  delete t.items[0].time;
  d = F.fixTrip(t).days[2];
  assert(d.issues.some(i => /Massage: Uhrzeit fehlt/.test(i.text)));
  assert.notEqual(d.state, 'ausgewogen', 'fehlende Uhrzeit erlaubt keine sichere Freigabe');
  n++;
}

/* 3 · Überladung nach Tempo; Vorschlag zum Verschieben; Hinweise über mehrere Tage */
{
  const t = trip({});
  t.customActs = [act('c1', 'Ski', 3), act('c2', 'Therme', 3), act('c3', 'Wandern', 2), act('c4', 'Essen', 1.5)];
  t.items = [];
  [1, 2, 3].forEach(day => ['morgen', 'mittag', 'nachm', 'abend'].forEach((slot, k) => t.items.push({ uid: 'd' + day + k, act: 'c' + (k + 1), day, slot })));
  const r = F.fixTrip(t);
  assert.equal(r.pace, 'normal');
  [1, 2, 3].forEach(i => assert(['voll', 'ueberladen'].includes(r.days[i].state), 'Tag ' + i + ': ' + r.days[i].state));
  assert(r.days[1].reasons.some(x => /4 Programmpunkte/.test(x)));
  assert(r.days[1].reasons.some(x => /Keine Tageszeit bleibt frei/.test(x)));
  assert(r.notes.some(x => /Drei volle Tage hintereinander/.test(x.text)));
  const s = r.suggestions.find(x => x.day === 1);
  assert(s && s.uid === 'd10', 'größter verschiebbarer Punkt ohne Uhrzeit (Ski)');
  /* Tag 0 und Tag 4 haben Platz; Vorschlag nennt einen Tag mit Luft */
  assert(s.toDay === 0 || s.toDay === 4, 'Ziel ist ein freier Tag: ' + s.toDay);
  /* Tempo: vier kurze Punkte (je 1 Std.) sind bei „normal“ zu viel, bei „aktiv“ (über styleOf, Reisestil-Thread) in Ordnung */
  const t2 = JSON.parse(JSON.stringify(t));
  t2.customActs.forEach(x => { x.hours = 1; });
  const rn = F.fixTrip(t2);
  assert.equal(rn.pace, 'normal');
  assert.equal(rn.days[1].state, 'voll');
  ctx.styleOf = () => ({ pace: 'aktiv' });
  const ra = F.fixTrip(JSON.parse(JSON.stringify(t2)));
  delete ctx.styleOf;
  assert.equal(ra.pace, 'aktiv');
  assert.equal(ra.days[1].state, 'ausgewogen', 'aktiv: 4 Punkte, 6 Std. frei, kein freier Halbtag nötig');
  ctx.styleOf = () => ({ pace: 'ruhig' });
  const t4 = JSON.parse(JSON.stringify(t2)); t4.items = t4.items.filter(i => i.slot === 'morgen' || i.slot === 'nachm');
  t4.customActs.forEach(x => { x.hours = 3.5; });
  const rr = F.fixTrip(t4);
  delete ctx.styleOf;
  assert.equal(rr.days[1].state, 'voll', 'ruhig: 7 Std. Programm lassen weniger als 40 % frei');
  assert.equal(F.fixTrip(JSON.parse(JSON.stringify(t4))).days[1].state, 'ausgewogen', 'normal: dieselben 7 Std. mit 3 Std. frei passen');
  /* t.pace (Format 5) wird gelesen, wenn styleOf fehlt */
  const t3 = JSON.parse(JSON.stringify(t2)); t3.pace = 'ruhig';
  assert.equal(F.fixPace(t3), 'ruhig');
  n++;
}

/* 4 · Transportabschnitte (Format 3): Flug mit 120 Min. Puffer, Programm nach Abfahrt des Rückwegs */
{
  const t = trip({ travel: 'flug' });
  t.schemaVersion = 3;
  t.transport = {
    out: [{ id: 'sout', mode: 'flug', from: 'Stuttgart', to: 'Wien', number: 'OS 128', dep: { date: '2026-12-30', time: '12:00', tz: 'Europe/Berlin' }, arr: { date: '2026-12-30', time: '13:10', tz: 'Europe/Vienna' } }],
    back: [{ id: 'sback', mode: 'bahn', from: 'Wien', to: 'Stuttgart', dep: { date: '2027-01-03', time: '11:00', tz: 'Europe/Vienna' }, arr: { date: '2027-01-03', time: '18:30', tz: 'Europe/Berlin' } }]
  };
  t.customActs = [act('cfr', 'Frühstück in der Stadt', 1.5), act('cbum', 'Bummel', 2)];
  t.items = [{ uid: 'f', act: 'cfr', day: 0, slot: 'morgen', time: '09:00' }, { uid: 'b', act: 'cbum', day: 4, slot: 'mittag', time: '12:00' }];
  const r = F.fixTrip(t);
  const fl = r.days[0].fixed.find(f => f.kind === 'transport');
  assert.equal(fl.buffer, 120);
  assert(/Flug OS 128 Stuttgart → Wien/.test(fl.label));
  assert.equal(r.days[0].state, 'knapp', 'Frühstück bis 10:30, Flug 12:00: nur 90 Min.');
  assert(r.days[0].issues[0].text.includes('empfohlen 120 Min.'));
  assert.equal(r.days[4].state, 'konflikt');
  assert(/nach der Abfahrt des Rückwegs/.test(r.days[4].issues[0].text));
  assert(r.notes.some(x => /Ankunft zuhause laut Rückweg: 18:30/.test(x.text)));
  assert(!r.points.some(f => f.kind === 'abreise' || f.kind === 'anreise'), 'mit Abschnitten keine geschätzte Abfahrt/Abreise');
  n++;
}

/* 5 · Format-5-Felder werden gelesen: items[i].fix, t.keepFree */
{
  const t = trip({});
  t.customActs = [act('ctour', 'Geführte Tour', 2), act('cski', 'Ski', 3)];
  t.items = [{ uid: 'tour', act: 'ctour', day: 2, slot: 'morgen', time: '10:00', fix: true }, { uid: 'ski', act: 'cski', day: 2, slot: 'nachm' }];
  t.keepFree = [{ day: 2, slot: 'nachm', why: 'erholung' }];
  const r = F.fixTrip(t);
  const f = r.days[2].fixed.find(x => x.uid === 'tour');
  assert(f && f.why === 'von Hand festgelegt');
  assert(r.days[2].issues.some(i => /Nachmittag war als freie Zeit \(Erholung\) vorgesehen/.test(i.text)));
  /* fix ohne Uhrzeit wird nicht als Fixpunkt gewertet */
  delete t.items[0].time;
  assert(!F.fixPoints(t).some(x => x.uid === 'tour'));
  n++;
}

/* 6 · Darstellung: Zustand als Wort, maskierte Titel, Abschnitt im Tagesplan, eingebunden */
{
  const t = trip({ departTime: '08:00' });
  t.customActs = [act('cx', 'Tour <b>', 2)];
  t.items = [{ uid: 'x1', act: 'cx', day: 1, slot: 'morgen', time: '10:00' }];
  t.ledger = { 'act:cx': { status: 'gebucht', amount: 10, paid: 0 } };
  const sec = F.fixSection(t);
  assert(sec.includes('Fixpunkte &amp; Puffer') || sec.includes('Fixpunkte & Puffer'));
  assert(sec.includes('Tour &lt;b&gt;') && !sec.includes('Tour <b>'), 'Titel maskiert');
  assert(sec.includes('Tempo dieser Reise'));
  const badge = F.fixDayBadge(t, 1);
  assert(/1 Fixpunkt · frei ≈ 8 Std\. · mit Luft/.test(badge), badge);
  const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'ansichten.js'), 'utf8');
  assert(html.includes("typeof fixSection==='function'") && html.includes("typeof fixDayBadge==='function'") && html.includes("typeof fixItemMark==='function'"), 'abgesichert in tPlan eingehängt');
  const tp = ctx.tPlan(t);
  assert(tp.includes('id="fixpunkte"') && tp.includes('data-fix-state='), 'Tagesplan zeigt Abschnitt und Tageszeile');
  n++;
}

console.log('Fixpunkte & Puffer: ' + n + ' Prüfungen bestanden (abgeleitete Fixpunkte, Überschneidung, Puffer-Richtwerte, fehlende Uhrzeit/Dauer = nicht sicher, Tempo, Vorschläge, Abschnitte, Format-5-Felder, Darstellung). Kein Browser-/iPhone-Test.');
