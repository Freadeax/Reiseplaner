/* Echte registrierte UI-Handler, DOM-Ausgabe isoliert; kein Browser-/DB-Test. */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
function load(enabled){
 let code=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace("go(location.hash||'reisen',true);",'').replace('if(Store.corruptRaw===null)Store.connect();','');
 code=code.replace('function render(){','function render(){return;').replace('function closeSheet(){','function closeSheet(){return;');
 if(enabled)code=code.replace('const V3_EDIT=false;','const V3_EDIT=true;');
 const memory=new Map(),callbacks={},msg={style:{},setAttribute(){}};
 const ctx={window:{addEventListener(){},RPV3:require('../v3logic.js'),RPCatalog:require('../catalog.js')},document:{addEventListener:(k,fn)=>(callbacks[k]||=[]).push(fn),querySelector:k=>k==='#msg'?msg:null,querySelectorAll:()=>[]},localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k)},console,setTimeout:()=>0,clearTimeout(){}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {a:ctx.window.__app,memory,callbacks};
}
function fixture(a){
 const t=a.silvesterTemplate();t.schemaVersion=3;t.transport={out:[{id:'seglegacy',mode:'bahn',cost:100,per:'grp'}],back:[]};
 t.offers=[{id:'olegacy',name:'Testtarif',location:'Testort',provider:'direkt',type:'hotel',start:t.start,end:t.end,persons:t.persons,price:200,basis:'stay',url:'https://example.org/legacy-fixture',checkedAt:'2026-10-15',availability:'available',terms:'Testdaten',paid:0,deposit:0,features:Object.fromEntries(['sauna','kitchen','breakfast','cancel','quiet','accessible','parking'].map(k=>[k,'unknown'])),fees:Object.fromEntries(['tax','cleaning','parking','wellness','mandatory'].map(k=>[k,{state:'included',amount:0}]))}];
 a.validateExtras(t);return t;
}
const failures=[];
for(const enabled of [false,true])for(const action of ['search','offer-save']){
 const {a,memory,callbacks}=load(enabled),t=fixture(a),raw=JSON.stringify({[t.id]:t});memory.set('rp-trips',raw);a.Store.setScope('guest');a.UI.view='reise';a.UI.tid=t.id;
 if(action==='search'){
  const fn=callbacks.change.find(fn=>String(fn).includes("el.hasAttribute('data-search')"));assert(fn);
  fn({target:{hasAttribute:k=>k==='data-search',getAttribute:k=>k==='data-search'?'destination':null,value:'Neue Suchregion',type:'text'}});
 }else{
  a.UI.offerDraft=JSON.parse(JSON.stringify(t.offers[0]));a.UI.offerDraft.name='Geänderter Tarif';a.UI.offerSource=JSON.stringify(a.Store.get(t.id));a.UI.offerScope=a.Store.scope;
  const fn=callbacks.click.find(fn=>String(fn).includes("closest('[data-search-act]')"));assert(fn);
  fn({target:{closest:()=>({getAttribute:k=>k==='data-search-act'?'offer-save':null})},preventDefault(){}});
 }
 if(a.Store.get(t.id).schemaVersion!==3)failures.push(action+' gate='+enabled+': auf Format '+a.Store.get(t.id).schemaVersion+' zurückgestuft');
 if(!enabled&&memory.get('rp-trips')!==raw)failures.push(action+': gesperrte v3-Reise verändert');
 if(!enabled)assert.equal(JSON.stringify(a.Store.get(t.id)),JSON.stringify(t),'Nur-Lesen schützt auch den Arbeitsspeicher');
 if(enabled){
  assert.equal(a.Store.get(t.id).transport.out[0].id,'seglegacy');a.validateExtras(a.Store.get(t.id));
  if(action==='search')assert.equal(a.Store.get(t.id).search.destination,'Neue Suchregion','Isoliert freigegebene Suche funktioniert weiterhin');
  else assert.equal(a.Store.get(t.id).offers[0].name,'Geänderter Tarif','Isoliert freigegebener Angebotseditor funktioniert weiterhin');
 }
}
assert.deepEqual(failures,[]);
/* Alter Angebotsentwurf darf eine inzwischen erhaltene Erstattung nicht verlieren. */
{
 const {a,memory,callbacks}=load(true),t=fixture(a);memory.set('rp-trips',JSON.stringify({[t.id]:t}));a.Store.setScope('guest');a.UI.view='reise';a.UI.tid=t.id;
 a.UI.offerDraft=JSON.parse(JSON.stringify(t.offers[0]));a.UI.offerSource=JSON.stringify(a.Store.get(t.id));a.UI.offerScope=a.Store.scope;
 const latest=a.Store.get(t.id);latest.offers[0].paid=200;latest.offers[0].refunds=[{id:'reflegacy',on:'2026-10-15',amount:100}];a.Store.put(latest);const before=memory.get('rp-trips');
 callbacks.click.find(fn=>String(fn).includes("closest('[data-search-act]')"))({target:{closest:()=>({getAttribute:k=>k==='data-search-act'?'offer-save':null})},preventDefault(){}});
 assert.equal(memory.get('rp-trips'),before);assert.equal(a.Store.get(t.id).offers[0].refunds[0].amount,100);
}
console.log('Legacy-Such-/Angebotshandler: kein v3-Downgrade, gesperrt ohne Speicher-/Objektänderung, isoliert freigegeben mit Feldtreue geprüft.');
