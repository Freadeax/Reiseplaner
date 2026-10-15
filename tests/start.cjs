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
