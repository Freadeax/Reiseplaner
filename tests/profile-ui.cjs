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
 vm.createContext(ctx);vm.runInContext(code,ctx);return {a:ctx.window.__app,ctx,stored,writes};
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
 console.log('Wunschprofil-UI: Legacy-Migration, v1-Rundlauf, Zukunftsschutz, Reise-Isolation, Profile, Karten/Stapel und vollständige erklärte Suche geprüft.');
})().catch(e=>{console.error(e);process.exitCode=1});
