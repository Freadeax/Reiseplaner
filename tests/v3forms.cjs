/* Reine Formular-/Entwurfsschicht. Keine App-Freischaltung, kein Browser-/Speichertest. */
const assert=require('assert'),F=require('../v3forms.js');
assert.equal(F.amount(''),null);assert.equal(F.amount('0'),0);assert.equal(F.amount(' 12,30 '),12.3);
for(const v of ['1.234','-1','1e2','1,234','Infinity',true,{},'1000000001'])assert.throws(()=>F.amount(v));
assert.throws(()=>F.amount('',{unknown:false}));assert.throws(()=>F.amount('0',{positive:true}));
assert.equal(F.distance('12,345'),12.345);assert.equal(F.distance(''),null);assert.throws(()=>F.distance('20001'));
const transport={out:[{id:'seg1',mode:'flug',from:'<img src=x>',to:'Ziel',fromCode:'STR',dep:{date:null,time:null,tz:null},arr:null,cost:null,per:'pp',addons:[{id:'add1',label:'Gepäck',cost:25,per:'pp'}],checkin:{opens:null,note:'Unverändert'}}],back:[]};
const trip={id:'tformtest',title:'Test',transport},snapshot=JSON.stringify(trip),draft=F.session(trip,'guest');
assert(F.assertFresh(draft,trip,'guest'));assert.throws(()=>F.assertFresh(draft,{...trip,title:'Geändert'},'guest'));assert.throws(()=>F.assertFresh(draft,trip,'other'));
const html=F.transportForm(transport);assert(html.includes('&lt;img'));assert(!html.includes('<img'));assert(html.includes('out.seg1.dep_tz'));assert(html.includes('out.seg1.addon.add1.cost'));assert(!html.includes('<form'),'Kein unbeabsichtigtes natives Absenden');
const next=F.readTransport({'out.seg1.cost':'199,90','out.seg1.toCode':'pmi','out.seg1.addon.add1.cost':'0'},transport);
assert.equal(next.out[0].cost,199.9);assert.equal(next.out[0].toCode,'PMI');assert.equal(next.out[0].addons[0].cost,0);assert.equal(next.out[0].id,'seg1');assert.deepEqual(next.out[0].checkin,transport.out[0].checkin);assert.equal(JSON.stringify(trip),snapshot,'Quelldaten unverändert');
assert.equal(F.readTransport({'out.seg1.cost':''},next).out[0].cost,null);
assert.throws(()=>F.readTransport({'out.seg1.dep_date':'2026-03-29','out.seg1.dep_time':'02:30','out.seg1.dep_tz':'Europe/Berlin'},transport),/Zeitumstellung/);
const entry={paid:200,refunds:[{id:'ref1',on:'2026-10-14',amount:50}]},before=JSON.stringify(entry);
assert.deepEqual(F.cancelPayload({on:'2026-10-15',fee:''},entry),{on:'2026-10-15',fee:null});
assert.equal(F.cancelPayload({on:'2026-10-15',fee:'0'},entry).fee,0);
assert.equal(F.refundPayload({on:'2026-10-15',amount:'150'},'ref2',entry).amount,150);
assert.throws(()=>F.refundPayload({on:'2026-10-15',amount:'151'},'ref2',entry),/übersteigen/);
assert.throws(()=>F.refundPayload({on:'2026-02-30',amount:'1'},'ref2',entry),/Datum/);
assert.equal(JSON.stringify(entry),before);
assert(F.financialForm('refund',{label:'<script>',entry}).includes('&lt;script&gt;'));
assert(F.financialForm('uncancel',{label:'Test',entry}).includes('Erhaltene Erstattungen bleiben bestehen'));
const view={label:'Test',math:{cost:null,netPaid:0,open:null,refundOpen:null,refundsReceived:0},warnings:['<script>']};
const preview=F.financialPreview(view,view);assert(preview.includes('unbekannt'));assert(preview.includes('0,00'));assert(!preview.includes('<script>'));
/* Eingaben durch die echten App-Kandidaten führen, ohne Speichern oder Freischaltung. */
const fs=require('fs'),vm=require('vm');
let code=fs.readFileSync(__dirname+'/../index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
code=code.replace("go(location.hash||'reisen',true);",'').replace('if(Store.corruptRaw===null)Store.connect();','');
const cache=new Map(),ctx={
 window:{addEventListener(){},RPV3:require('../v3logic.js'),RPCatalog:require('../catalog.js')},
 document:{addEventListener(){},querySelector(){return null},querySelectorAll(){return []},createElement(){return {setAttribute(){},style:{}}},body:{appendChild(){}}},
 localStorage:{getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,String(v)),removeItem:k=>cache.delete(k)},
 setTimeout:()=>0,clearTimeout(){},console,alert(){}
};
vm.createContext(ctx);vm.runInContext(code,ctx);const app=ctx.window.__app,J=x=>JSON.parse(JSON.stringify(x));
const source=app.silvesterTemplate();source.schemaVersion=3;
source.transport=J(transport);source.transport.out[0].cost=100;source.transport.out[0].per='grp';
source.ledger={'tr:seg1':{status:'gebucht',amount:200,paid:200,due:''}};
app.validateExtras(source);const original=JSON.stringify(source),target={kind:'ledger',key:'tr:seg1'},start=app.financeEntry(source,target);
const cancelled=app.cancelEntry(source,target,F.cancelPayload({on:'2026-10-15',fee:'50,00'},start.entry));
assert.deepEqual(J(app.financeEntry(cancelled,target).math).netPaid,200);
assert.equal(app.financeEntry(cancelled,target).math.refundOpen,150);
const received=app.addRefund(cancelled,target,F.refundPayload({on:'2026-10-15',amount:'150,00'},'refactual',app.financeEntry(cancelled,target).entry));
assert.equal(app.financeEntry(received,target).math.refundOpen,0);
assert.equal(app.financeEntry(received,target).math.netPaid,50);
assert(F.financialPreview(start,app.financeEntry(received,target)).includes('50,00'));
const restored=app.uncancel(received,target);
assert.equal(restored.ledger['tr:seg1'].refunds[0].amount,150);
assert.equal(app.financeEntry(restored,target).math.open,150,'Erhaltenes Geld bleibt auch nach Rücknahme sichtbar');
const unknown=app.cancelEntry(source,target,F.cancelPayload({on:'2026-10-15',fee:''},start.entry));
assert.equal(app.financeEntry(unknown,target).math.cost,null);
assert.equal(app.financeEntry(unknown,target).math.refundOpen,null);
const free=app.cancelEntry(source,target,F.cancelPayload({on:'2026-10-15',fee:'0'},start.entry));
assert.equal(app.financeEntry(free,target).math.cost,0);
const changed=F.readTransport({'out.seg1.cost':'80'},source.transport);
assert.throws(()=>app.setTransport(source,changed),/Anreise-Abschnitt/,'Formular umgeht keine gebuchte Verpflichtung');
const unbound=J(source);delete unbound.ledger['tr:seg1'];
const edited=app.setTransport(unbound,F.readTransport({'out.seg1.cost':'80,10'},unbound.transport));
assert.equal(edited.transport.out[0].cost,80.1);assert.equal(edited.schemaVersion,3);
assert.equal(JSON.stringify(source),original,'Alle Vorschauen lassen die Quelle unverändert');
assert.throws(()=>F.assertFresh(F.session(source,'guest'),received,'guest'));
assert.equal(cache.size,0,'Kandidaten/Formulare schreiben keine lokalen Daten');
assert.equal(app.V3_EDIT,false,'Keine produktive Freischaltung durch den Formbaustein');
console.log('v3-Formbausteine: strikte Eingaben, Escaping, Snapshot-/Bereichsschutz und echte App-Kandidaten für Storno, Erstattung, Rücknahme und Transport geprüft. Noch nicht eingebunden.');
