const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
code = code.replace("go(location.hash||'reisen',true);", '').replace('if(Store.corruptRaw===null)Store.connect();', '');
const context = {
  window: { addEventListener() {} },
  document: { addEventListener() {}, querySelector() { return null; }, createElement() { return { setAttribute() {}, style: {} }; }, body: { appendChild() {} } },
  localStorage: { getItem() { return null; }, setItem() {} },
  setTimeout, clearTimeout, console,
};
vm.createContext(context);
vm.runInContext(code, context);
const a = context.window.__app;
const at = s => new Date(s + 'T12:00:00'); // lokale Mittagszeit, unabhängig von der Zeitzone

/* Katalog-Planwerte: Kennzeichnung passt zum Reisezeitraum */
const winter = (start, end) => a.newTrip({ catalog: 'allgaeu', place: 'oberjoch', stayId: 'oj-holidu', dateMode: 'fix', start, end });
assert.equal(a.holidayStay(winter('2026-12-30', '2027-01-03')), true);
assert.equal(a.holidayStay(winter('2027-01-05', '2027-01-09')), true);   // berührt 06.01.
assert.equal(a.holidayStay(winter('2027-02-10', '2027-02-14')), false);
assert.equal(a.holidayStay(winter('2026-12-20', '2026-12-23')), false);
assert.equal(a.holidayStay(a.newTrip({ dateMode: 'flex', month: '2027-02' })), false);
assert.equal(a.holidayStay(a.newTrip({ dateMode: 'flex', month: '2026-12' })), null);
assert.equal(a.holidayStay(a.newTrip({ dateMode: 'open' })), null);
const stayLine = tr => a.cost(tr).lines.find(l => l.cat === 'unterkunft');
assert(stayLine(winter('2026-12-30', '2027-01-03')).s.includes('Jahreswechsel: Inserat +15 %'));
const feb = stayLine(winter('2027-02-10', '2027-02-14'));
assert(feb.s.includes('für eure Daten nicht geprüft') && !feb.s.includes('Silvester'), 'Februar-Reise darf nicht als Silvesterpreis erscheinen');
assert.equal(feb.src, 'est');
assert.equal(feb.c, stayLine(winter('2026-12-30', '2027-01-03')).c, 'Betrag bleibt derselbe Schätzwert, nur ehrlich gekennzeichnet');

/* Startvorlagen: nur Struktur, keine erfundenen Preise, Angebote oder Buchungen */
assert(a.TEMPLATES.length >= 5);
assert.equal(a.TEMPLATES.filter(x => /silvester/i.test(x.name)).length, 1, 'Silvester ist genau ein Beispiel unter mehreren');
for (const x of a.TEMPLATES.filter(y => y.id !== 'silvester')) {
  const tr = x.make();
  assert.equal(tr.stayId, '', x.id + ': keine Unterkunft vorgegeben');
  assert.equal((tr.items || []).length, 0, x.id + ': kein Programm vorgegeben');
  assert.equal(tr.stayQuote, null);
  assert.equal(+tr.budget, 0, x.id + ': kein ausgedachtes Budget');
  assert.equal(tr.status, 'idee');
  assert.equal(a.validateBackup(a.backupData([tr])).length, 1, x.id + ': Vorlage ist gültig exportierbar');
}
assert.equal(a.nightsOf(a.TEMPLATES.find(x => x.id === 'tag').make()), 0);
assert.equal(a.TEMPLATES.find(x => x.id === 'winter').make().catalog, 'allgaeu');

/* Datumsgebundene Punkte: allgemeine Meldung statt „für Silvester gedacht“ */
const moved = a.silvesterTemplate();
const silv = moved.items.find(i => a.ACTS[i.act] && a.ACTS[i.act].onlyDate);
silv.day = 0;
const msg = a.checks(moved).find(x => x[1].includes('gilt nur am'));
assert(msg && msg[1].includes('31.12.'), 'Meldung nennt das Datum');
console.log('Startvorlagen, zeitraumgerechte Planwert-Kennzeichnung und datumsgebundene Meldungen geprüft.');

// Öffentliche Defaults dürfen keine fremde Startstrecke berechnen.
const neutral=a.newTrip({catalog:'allgaeu',place:'oberjoch'});
assert.equal(neutral.origin,'');
assert.equal(a.routeKm(neutral),0);
assert(a.openCosts(neutral).includes('Fahrstrecke fehlt'));
for(const tpl of a.TEMPLATES.filter(x=>x.id!=='silvester'))assert.equal(tpl.make().origin,'');
const sample=a.silvesterTemplate();
assert.equal(sample.origin,'73110 Hattenhofen');
assert(a.routeKm(sample)>0);
const existing=a.newTrip({origin:'Berlin',routeKm:400});
assert.equal(a.validateBackup(a.backupData([existing]))[0].origin,'Berlin');
assert.equal(a.routeKm(existing),400);
console.log('Öffentliche Defaults, fehlende Strecke, Beispielbasis und bestehender Startort geprüft.');

/* Vorlagengalerie und Vorschau: vier Gruppen, jede Vorlage genau einmal, kein Schreiben vor Bestätigung. */
const templateIds=a.templateGroups().flatMap(g=>g.templates.map(t=>t.id));
assert.equal(a.templateGroups().length,4);assert.equal(new Set(templateIds).size,a.TEMPLATES.length);
assert.deepEqual(templateIds.slice().sort(),a.TEMPLATES.map(t=>t.id).sort());
assert.equal((a.tplButtons().match(/data-act="tpl"/g)||[]).length,a.TEMPLATES.length);
a.UI.templateGroup='flug';assert.equal((a.tplButtons().match(/data-act="tpl"/g)||[]).length,2);assert(a.tplButtons().includes('2 von '+a.TEMPLATES.length));
a.UI.templateGroup='unbekannt';assert.equal((a.tplButtons().match(/data-act="tpl"/g)||[]).length,a.TEMPLATES.length);a.UI.templateGroup='all';
const draft=a.newTrip({title:'Nicht gespeicherter eigener Entwurf'}),stored=new Map();let writes=0,fail=false;
context.localStorage.getItem=k=>stored.get(k)||null;
context.localStorage.setItem=(k,v)=>{if(fail&&k==='rp-trips')throw Error('Quota');writes++;stored.set(k,v)};
a.Store.loadLocal();a.UI.draft=draft;const oldDraft=JSON.stringify(draft),before=JSON.stringify(a.Store.trips);
for(const id of templateIds){const p=a.templatePreview(id);assert.equal(p.id,id);assert(a.templatePreviewHtml(p).includes('es wurde noch keine Reise angelegt'));assert.equal(JSON.stringify(a.Store.trips),before)}
assert.equal(writes,0);assert.equal(JSON.stringify(a.UI.draft),oldDraft);assert.throws(()=>a.templatePreview('nicht-vorhanden'),/nicht verfügbar/);
const flight=a.templatePreview('fernreise');assert(a.templatePreviewHtml(flight).includes('noch keine Flugverbindung'));assert(a.templatePreviewHtml(flight).includes('12 Punkte'));
assert(!a.templatePreviewHtml(flight).includes('Planwert ≈'));
const p=a.templatePreview('stadt');a.UI.templatePreview=p;
assert.throws(()=>a.commitTemplatePreview('alter-token'),/nicht mehr aktuell/);assert.equal(writes,0);
const result=a.commitTemplatePreview(p.token);assert.equal(Object.keys(a.Store.trips).length,1);assert(result.route.endsWith('-unterkunft'));assert(stored.get('rp-trips').includes('Städtereise'));assert.equal(a.UI.templatePreview,null);
assert.equal(JSON.stringify(a.UI.draft),oldDraft,'Commit-Helfer löscht keinen offenen Entwurf');assert.throws(()=>a.commitTemplatePreview(p.token),/nicht mehr aktuell/);
const collision=a.templatePreview('stadt');collision.trip.id=result.trip.id;a.UI.templatePreview=collision;const saved=JSON.stringify(a.Store.get(result.trip.id));assert.throws(()=>a.commitTemplatePreview(collision.token),/bereits vorhanden/);assert.equal(JSON.stringify(a.Store.get(result.trip.id)),saved);
const retry=a.templatePreview('camping');a.UI.templatePreview=retry;fail=true;assert.throws(()=>a.commitTemplatePreview(retry.token),/nicht gespeichert/);assert.strictEqual(a.UI.templatePreview,retry);fail=false;a.commitTemplatePreview(retry.token);assert.equal(Object.keys(a.Store.trips).length,2,'Fehlgeschlagener Versuch wird mit derselben ID wiederholt');
const changedScope=a.templatePreview('wellness');a.UI.templatePreview=changedScope;a.Store.scope='other';assert.throws(()=>a.commitTemplatePreview(changedScope.token),/Speicherbereich/);a.Store.scope='guest';a.UI.templatePreview=null;
console.log('Vorlagengalerie: vier Gruppen, Vorschau unverändernd, bewusstes Speichern, doppelte/veraltete Bestätigung, Quota-Wiederholung und Speicherbereich geprüft.');
