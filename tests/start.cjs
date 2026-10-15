const fs=require('fs'),vm=require('vm');
const s=fs.readFileSync(__dirname+'/../index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const els=Object.fromEntries(['#view','#sheet-root','#dock','#sync','#dock-nm','#dock-sum','#dock-bar'].map(k=>[k,{innerHTML:'',style:{},querySelector(){return {textContent:'',style:{}}}}]));
const ctx={window:{addEventListener(){},scrollTo(){}},location:{hash:''},history:{replaceState(){}},document:{addEventListener(){},querySelector(k){return els[k]||null},createElement(){return {setAttribute(){},style:{}}},body:{appendChild(){}}},localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(s,ctx);
if(!els['#view'].innerHTML.includes('Meine Reisen'))throw new Error('Startansicht leer');
console.log('Startansicht mit',els['#view'].innerHTML.length,'Zeichen aufgebaut');
ctx.localStorage.getItem=()=>'{kaputt';
ctx.window.__app.Store.loadLocal();
ctx.window.__app.render();
if(!els['#view'].innerHTML.includes('Rohdaten sichern')||!els['#view'].innerHTML.includes('nicht überschrieben'))throw new Error('Hinweis zur Datenrettung fehlt');

// Darstellung darf keine Reise schreiben oder deren Daten verändern.
const assert=require('assert');
const app=ctx.window.__app;
app.Store.corruptRaw=null;
const before=JSON.stringify(app.Store.trips), writes=[];
ctx.localStorage.setItem=(key,value)=>writes.push([key,value]);
ctx.document.documentElement={setAttribute(key,value){this[key]=value}};
for(const mode of ['book','studio','compact']){
 assert.equal(app.applyAppearance(mode,true),mode);
 assert.equal(ctx.document.documentElement['data-layout'],mode);
}
assert(writes.every(([key])=>key==='rp-appearance'));
assert.equal(JSON.stringify(app.Store.trips),before);
assert.equal(app.appearanceValue('__proto__'),'book');
assert.equal(app.appearanceValue('<script>'),'book');
assert.equal(app.appearanceValue(null),'book');
// Reload reads the saved preference before the first route render.
ctx.localStorage.getItem=key=>key==='rp-appearance'?'studio':null;
vm.runInContext(s,ctx);
assert.equal(ctx.document.documentElement['data-layout'],'studio');
const fresh=ctx.window.__app;
fresh.appearanceSheet();
assert(els['#sheet-root'].innerHTML.includes('aria-pressed="true"'));
assert.equal((els['#sheet-root'].innerHTML.match(/class="design-choice"/g)||[]).length,3);
console.log('Darstellung: drei Modi, lokale Präferenz, Wiederherstellung und keine Reiseänderung geprüft.');

// Checklistenfilter: alle Gruppen aus demselben Stand, keine Mutation.
const ct=fresh.newTrip({customChecks:[{id:'k1',t:'Handtuch einpacken'},{id:'k2',t:'Buchung prüfen'}],check:{'c-k1':true}});
const cb=JSON.stringify(ct), cv=fresh.checklistView(ct,'all','');
const co=fresh.checklistView(ct,'open',''), cd=fresh.checklistView(ct,'done','');
assert.equal(co.visible+cd.visible,cv.total);
assert.equal(cd.visible,1);
assert.equal(fresh.checklistView(ct,'done','HANDTUCH').visible,1);
assert.equal(fresh.checklistView(ct,'open','Handtuch').visible,0);
assert.equal(fresh.checklistView(ct,'all','Eigene Punkte').visible,2);
assert.equal(fresh.checklistView(ct,'all','kein-treffer').visible,0);
assert.equal(fresh.checklistView(ct,'invalid','').visible,cv.total);
assert.equal(JSON.stringify(ct),cb);
fresh.UI.checkFilter='open';fresh.UI.checkQuery='kein-treffer';
assert(fresh.tCheck(ct).includes('Keine passenden Punkte'));
assert(fresh.tCheck(ct).includes('cc-add'));
assert(!/<label[^>]*class="chk[^>]*>[\s\S]*?<button/.test(fresh.tCheck(ct).split('class="check-row"')[1]?.split('</label>')[0]||''));
fresh.UI.checkFilter='all';fresh.UI.checkQuery='';
assert(fresh.tCheck(ct).includes('aria-label="Eigenen Punkt Handtuch einpacken entfernen"'));
assert.equal((fresh.areaPicker(ct).match(/<option /g)||[]).length,10);
console.log('Module: zehn Bereiche, Checklisten-Suche/Status/Gruppen/Leerzustand und Erhalt der Daten geprüft.');

const x={},y={},z={};
assert.equal(fresh.sheetTabTarget([x,y,z],x,true),z);
assert.equal(fresh.sheetTabTarget([x,y,z],z,false),x);
assert.equal(fresh.sheetTabTarget([x,y,z],y,false),null);
assert.equal(fresh.sheetTabTarget([x,y,z],y,true),null);
assert.equal(fresh.sheetTabTarget([x],x,false),x);
assert.equal(fresh.sheetTabTarget([x],x,true),x);
assert.equal(fresh.sheetTabTarget([x,y],{},false),x);
assert.equal(fresh.sheetTabTarget([x,y],{},true),y);
assert.equal(fresh.sheetTabTarget([],x,false),null);
console.log('Detailfenster: Tab-Grenzen, Einzelelement und Fokus von außerhalb geprüft.');

// Öffnen/Schließen mit DOM-Doubles: Fokus und Dialogname, keine Browserabnahme.
const oldQuery=ctx.document.querySelector;
let dialogOpen=false;const title={};
const opener={isConnected:true,focus(){ctx.document.activeElement=this}};
const closeButton={tabIndex:0,closest(){return null},getClientRects(){return [1]},focus(){ctx.document.activeElement=this}};
const sheet={querySelector(){return title},setAttribute(k,v){this[k]=v},querySelectorAll(){return [closeButton]},focus(){ctx.document.activeElement=this}};
const root={set innerHTML(value){dialogOpen=!!value}};
ctx.document.querySelector=selector=>selector==='#sheet-root'?root:selector==='.sheet'&&dialogOpen?sheet:null;
ctx.document.activeElement=opener;
fresh.openSheet('<h2>Test</h2>');
assert.equal(ctx.document.activeElement,sheet);
assert.equal(sheet['aria-labelledby'],'rp-sheet-title');
let prevented=false;
fresh.sheetKeydown({key:'Tab',shiftKey:false,preventDefault(){prevented=true}});
assert(prevented);assert.equal(ctx.document.activeElement,closeButton);
fresh.sheetKeydown({key:'Escape',preventDefault(){}});
assert.equal(dialogOpen,false);assert.equal(ctx.document.activeElement,opener);
const fallbackView={focus(){ctx.document.activeElement=this}};
ctx.document.querySelector=selector=>selector==='#view'?fallbackView:selector==='#sheet-root'?root:selector==='.sheet'&&dialogOpen?sheet:null;
fresh.openSheet('<h2>Test</h2>');opener.isConnected=false;fresh.closeSheet();
assert.equal(ctx.document.activeElement,fallbackView,'Entfernter Auslöser führt zurück in den Inhalt');
ctx.document.querySelector=oldQuery;
console.log('Detailfenster: Dialogname, initialer Fokus, Tab und Rückkehr zum Auslöser mit DOM-Doubles geprüft.');

// Reiseregal: abgeleitete Zeitgruppen, stabiles Sortieren, kombinierte Suche ohne Mutation.
const noon=new Date('2027-05-02T12:00:00');
const shelfTrips=[
 fresh.newTrip({id:'tpast',title:'Winter',dateMode:'fix',start:'2027-01-01',end:'2027-01-02'}),
 fresh.newTrip({id:'topen',title:'München',dest:'München',dateMode:'open',created:'2027-05-01',stayId:'sfind',customStays:[{id:'sfind',custom:true,name:'Hotel Seeblick'}]}),
 fresh.newTrip({id:'tnext',title:'Sommer',status:'vorbei',dateMode:'fix',start:'2027-05-10',end:'2027-05-12'}),
 fresh.newTrip({id:'tnow',title:'Auszeit',dateMode:'fix',start:'2027-05-01',end:'2027-05-03'}),
 fresh.newTrip({id:'tbad',title:'Noch prüfen',dateMode:'fix',start:'2027-05-30',end:'2027-05-01'})
];
const shelfBefore=JSON.stringify(shelfTrips),shelf=fresh.tripShelf(shelfTrips,{},noon);
assert.deepEqual(JSON.parse(JSON.stringify(shelf.counts)),{all:5,current:1,next:1,open:2,past:1});
assert.equal(shelf.spotlight.trip.id,'tnow');
assert.equal(shelf.rows[0].trip.id,'tnow');assert.equal(shelf.rows[1].trip.id,'tnext');
assert.equal(shelf.rows[4].trip.id,'tpast');
assert.equal(fresh.tripShelf(shelfTrips,{filter:'next'},noon).rows[0].trip.status,'vorbei','Manueller Status bleibt unangetastet');
assert.equal(fresh.tripShelf(shelfTrips,{filter:'open',query:'MUNCHEN'},noon).rows[0].trip.id,'topen');
assert.equal(fresh.tripShelf(shelfTrips,{query:'seeblick'},noon).rows[0].trip.id,'topen');
assert.equal(fresh.tripShelf(shelfTrips,{sort:'recent'},noon).rows[0].trip.id,'topen');
assert.equal(fresh.tripShelf(shelfTrips,{filter:'past',query:'München'},noon).rows.length,0);
assert.equal(fresh.tripShelf(shelfTrips,{filter:'constructor',sort:'bad'},noon).rows.length,5);
assert.equal(fresh.tripShelf([shelfTrips[0],shelfTrips[1]],{},noon).spotlight,null);
assert.equal(fresh.tripShelf(shelfTrips,{sort:'name'},noon).rows[0].trip.id,'tnow');
assert.equal(JSON.stringify(shelfTrips),shelfBefore);
fresh.Store.put(shelfTrips[1],true);fresh.UI.tripFilter='all';fresh.UI.tripQuery='MUNCHEN';
assert(fresh.vReisen().includes('Hotel Seeblick'));
fresh.UI.tripQuery='kein-treffer';
assert(fresh.vReisen().includes('Keine Reise passt zu dieser Ansicht'));
fresh.UI.tripQuery='';
console.log('Reiseregal: Zeitgruppen, laufende Reise, offene/ungültige Daten, Suche, Sortierung und Datenerhalt geprüft.');
