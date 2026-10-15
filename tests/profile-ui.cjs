/* Wunschprofil: Migration, getrennte Speicherung, neuere Versionen und App-Anbindung.
   Node-Prüfung; sichtbare Bedienung wird in tests/browser.cjs geprüft. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const C=require('../catalog.js');
const code=fs.readFileSync(__dirname+'/../index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1].replace("go(location.hash||'reisen',true);",'');
const dataCtx={window:{}};vm.createContext(dataCtx);vm.runInContext(fs.readFileSync(__dirname+'/../catalog-data.js','utf8'),dataCtx);
const DATA=dataCtx.window.RP_CATALOG;
function load(values={}){
 const stored=new Map(Object.entries(values)),writes=[];
 const els=Object.fromEntries(['#view','#sheet-root','#dock','#sync','#dock-nm','#dock-sum','#dock-bar'].map(k=>[k,{innerHTML:'',style:{},querySelector(){return {textContent:'',style:{}}}}]));
 const ctx={window:{addEventListener(){},scrollTo(){},RPCatalog:C,RP_CATALOG:DATA},location:{hash:''},history:{replaceState(){}},navigator:{onLine:true},
 document:{addEventListener(){},getElementById(){return null},querySelector(k){return els[k]||null},createElement(){return {setAttribute(){},style:{}}},body:{appendChild(){}},head:{appendChild(){}}},
 localStorage:{getItem:k=>stored.get(k)||null,setItem(k,v){writes.push(k);stored.set(k,v)}},setTimeout,clearTimeout,console};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {a:ctx.window.__app,ctx,stored,writes,els};
}
const legacy={origin:{label:'Göppingen',lat:48.703,lon:9.652},range:'tag',minKm:0,maxKm:150,kinds:['burg','natur'],month:'7',nights:'0',family:true,rainy:true};
const m=load({'rp-entdecken':JSON.stringify(legacy)}),s=m.a.catState();
assert.equal(s.profile.kinds.burg,'like');assert.equal(s.profile.party,'familie');assert.equal(s.profile.weatherSafe,true);assert.equal(s.profile.nights,0);
assert.equal(s.origin.label,legacy.origin.label);assert.equal(m.writes.length,0,'Lesen schreibt keine Präferenzen');
const trips=JSON.stringify(m.a.Store.trips);
m.a.catSetMood('natur','must');m.a.catSetMood('burg','avoid');
let saved=JSON.parse(m.stored.get('rp-entdecken-profile'));
assert.equal(saved.version,1);assert.equal(saved.profile.kinds.natur,'must');assert.equal(saved.profile.kinds.burg,'avoid');
assert(!s.kinds.includes('burg'),'Abwertung wird nicht zu positivem Legacy-Wunsch');
assert(m.writes.every(k=>['rp-entdecken','rp-entdecken-profile'].includes(k)),'Kein Schreiben in Reisen oder Konto');assert.equal(JSON.stringify(m.a.Store.trips),trips);
const reload=load(Object.fromEntries(m.stored));assert.equal(reload.a.catProfile().kinds.burg,'avoid');assert.equal(reload.a.catProfile().month,7);
m.a.catSetMood('natur','');assert(!('natur' in m.a.catProfile().kinds));
m.a.catSetMood('__proto__','must');assert(!Object.hasOwn(m.a.catProfile().kinds,'__proto__'));
m.a.catPreset('kultur');assert.equal(s.profile.kinds.kultur,'must');assert.equal(s.profile.nights,2);assert.equal(s.profile.party,null,'Profil ersetzt bisherige Rahmenangaben');assert.equal(s.origin.label,legacy.origin.label);assert.equal(s.maxKm,150);
m.a.catPreset('familie');assert.equal(s.profile.nights,0);assert.equal(s.family,true);assert.equal(s.rainy,false);
const p=m.a.catMoodPanel();assert.equal((p.match(/data-profile-kind=/g)||[]).length,12);assert.equal((p.match(/data-act="cat-preset"/g)||[]).length,5);assert(!p.includes('data-act="cat-family"'));
s.deckMode=true;s.deckIndex=0;assert.equal((m.a.catMoodPanel().match(/data-act="cat-vote"/g)||[]).length,3);s.deckIndex=12;assert(m.a.catMoodPanel().includes('Eure Auswahl ist bereit'));
const future=JSON.stringify({version:9,profile:{kinds:{natur:'must'}}}),f=load({'rp-entdecken-profile':future});
assert(f.a.catState().profileLocked);f.a.catSetMood('stadt','like');assert.equal(f.stored.get('rp-entdecken-profile'),future,'Zukünftiges Profil nie überschreiben');assert(f.a.catMoodPanel().includes('nicht überschrieben'));
const broken=load({'rp-entdecken-profile':'{kaputt','rp-entdecken':JSON.stringify(legacy)});assert.equal(broken.a.catProfile().kinds.burg,'like');
// Rücknahme umfasst nur die bewusste Profilersetzung, keine spätere manuelle Auswahl.
const u=load({'rp-entdecken':JSON.stringify(legacy)}),us=u.a.catState(),originalProfile=JSON.stringify(u.a.catProfile());us.deckIndex=5;
u.a.catPreset('kultur');assert(us.profileUndo);assert(u.a.catUndoProfile());assert.equal(JSON.stringify(u.a.catProfile()),originalProfile);assert.equal(us.deckIndex,5);assert(!u.a.catUndoProfile());
u.a.catClearProfile();assert.equal(u.a.catWishItems(u.a.catProfile()).length,0);assert(u.a.catUndoProfile());assert.equal(JSON.stringify(u.a.catProfile()),originalProfile);
u.a.catPreset('paar');u.a.catSetMood('winter','avoid');assert(!u.a.catUndoProfile());assert.equal(u.a.catProfile().kinds.winter,'avoid');
u.a.catDropWish('kind:winter');assert(!u.a.catProfile().kinds.winter);assert.equal(u.a.catProfile().party,'paar');
u.a.catProfileChange({budgetPp:0,maxMin:90,travel:'flug',weatherSafe:true});
const wishText=u.a.catWishItems(u.a.catProfile()).map(x=>x.label).join(' | ');assert(wishText.includes('Budget 0 €'));assert(wishText.includes('90 Min. · ungeprüft'));assert(wishText.includes('Flug · Verbindung ungeprüft'));
u.a.catDropWish('field:weatherSafe');assert.equal(u.a.catProfile().weatherSafe,false);u.a.catDropWish('field:budgetPp');assert.equal(u.a.catProfile().budgetPp,null);assert.equal(u.a.catProfile().maxMin,90);
assert(!u.a.catProfileSummary(false).includes('data-act='),'Vergleich enthält statische Zusammenfassung');
assert(u.writes.every(k=>['rp-entdecken','rp-entdecken-profile'].includes(k)));
(async()=>{
 let query;
 m.ctx.window.RPCloud={enabled:()=>true,catalogSearch:async q=>{query=q;return {version:1,places:C.searchLocal(DATA,q).places}}};
 s.deckMode=false;m.a.catProfileChange({kinds:{winter:'must',natur:'avoid'},travel:'flug',maxMin:90,budgetPp:100});
 await m.a.catSearch(false);
 assert.equal(query.kinds.length,0,'Alle Themen laden, damit Nicht-Muss-Treffer erklärbar bleiben');
 assert(s.res.ranked.length>0);assert(s.res.ranked.some(x=>!x.mustOk),'Nicht erfüllte Muss-Wünsche bleiben als Alternative');
 assert(s.res.ranked.every(x=>x.must.unknown.includes('fahrzeit')&&x.must.unknown.includes('budget')));
 const before=s.res.places.length;m.a.catProfileChange({kinds:{natur:'like'},travel:'auto',maxMin:null,budgetPp:null});
 assert.equal(s.res.places.length,before);assert.equal(s.res.ranked.length,before,'Profilwechsel bewertet denselben vollständigen Ergebnissatz neu');
 assert(s.res.ranked.some(x=>x.why.some(w=>w.type==='plus')));
 const view=m.a.vEntdecken();assert(!view.includes('[object Object]'));assert(view.includes('Warum dieses Ziel?'));
 // Muss-Filter und Textsuche verbergen nur benannte Alternativen, kein Budgetversprechen.
 m.a.catProfileChange({kinds:{winter:'must'},budgetPp:100});s.mustOnly=true;
 const rv=m.a.catResultView();assert.equal(rv.shown.length+rv.hidden,rv.matching.length);assert(rv.shown.every(x=>x.mustOk));
 assert(m.a.vEntdecken().includes(rv.hidden+' Alternativen'));
 m.a.catProfileChange({kinds:{},travel:'flug',maxMin:90});assert.equal(m.a.catResultView().shown.length,0);assert(m.a.vEntdecken().includes('Alternativen anzeigen'));
 m.a.catProfileChange({travel:'auto',maxMin:null});assert.equal(m.a.catResultView().shown.length,before,'Unbekanntes Budget ist kein stiller Ausschluss');
 const rows=m.a.catProfileRows(s.res.ranked.slice(0,2));assert(rows.find(r=>r.label==='Ungeprüft').values.every(v=>v.includes('Budget nicht bewertet')));
 s.q='gar-kein-treffer';assert.equal(m.a.catResultView().matching.length,0);s.q='';s.mustOnly=false;
 // Auswahl bleibt nach Bereichswechsel vergleichbar und wird für neuen Start neu geschätzt.
 s.cmp=s.res.ranked.slice(0,2).map(x=>x.place.id);const selected=s.cmp.slice(),oldPlace=JSON.stringify(s.res.ranked[0].place);
 const preserved=s.res.ranked[0].place;m.a.catSetOrigin({label:'Berlin',lat:52.52,lon:13.405});
 assert.equal(s.res,null);assert.equal(JSON.stringify(preserved),oldPlace,'Keine Mutation der bisherigen Quelldaten');
 assert(selected.every(id=>m.a.catFind(id)));assert.equal(s.extra[selected[0]].roadKm,C.roadKm(s.extra[selected[0]].place.airKm));
 m.a.catProfileChange({budgetPp:200});assert(m.a.catFind(selected[0]).must.unknown.includes('budget'));
 // Verzögerte Antworten dürfen nach Ortswechsel weder Ergebnisse noch neue Ladezustände ersetzen.
 const race=load({'rp-entdecken':JSON.stringify(legacy)}),rs=race.a.catState(),pending=[];
 race.ctx.window.RPCloud={enabled:()=>true,catalogSearch:q=>new Promise(resolve=>pending.push({q,resolve}))};
 const response=(i,v)=>pending[i].resolve({version:v,places:C.searchLocal(DATA,pending[i].q).places});
 const first=race.a.catSearch(false);assert(rs.busy);
 race.a.catSetOrigin({label:'München',lat:48.137,lon:11.575});assert(!rs.busy);assert(rs.searchNote.includes('verworfen'));
 const second=race.a.catSearch(false);response(0,1);await first;assert(rs.busy,'Alte Antwort beendet neue Suche nicht');assert.equal(rs.res,null);
 response(1,2);await second;assert.equal(rs.res.version,2);assert(!rs.busy);
 const third=race.a.catSearch(false);rs.maxKm=350;race.a.catInvalidateSearch();const fourth=race.a.catSearch(false);
 response(3,4);await fourth;const latest=rs.res;response(2,3);await third;assert.strictEqual(rs.res,latest,'Ältere Antwort überschreibt neuere Treffer nicht');
 const fifth=race.a.catSearch(false);race.a.catProfileChange({kinds:{natur:'must'}});race.a.UI.view='neu';race.els['#view'].innerHTML='Offene Eingaben';
 response(4,5);await fifth;assert.equal(race.els['#view'].innerHTML,'Offene Eingaben','Navigation weg: keine Formulare neu rendern');assert(rs.res.ranked.some(x=>x.must.met.includes('natur')),'Aktuelle Wünsche nach asynchroner Antwort verwenden');
 console.log('Wunschprofil-UI: Legacy-Migration, v1-Rundlauf, Zukunftsschutz, Reise-Isolation, Profile, Karten/Stapel und vollständige erklärte Suche geprüft.');
 console.log('Vertiefung: sichere Rücknahme, einzelne Wünsche, Muss-Filter/Leerzustände, profilbezogener Vergleich, Startwechsel und verspätete Suchantworten geprüft.');
})().catch(e=>{console.error(e);process.exitCode=1});
