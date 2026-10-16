/* Isolierter Controller gegen echte App-Kandidaten, keine produktive Freigabe. */
const assert=require('assert'),fs=require('fs'),vm=require('vm'),E=require('../v3editor.js');
let code=fs.readFileSync(__dirname+'/../index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
code=code.replace("go(location.hash||'reisen',true);",'').replace('if(Store.corruptRaw===null)Store.connect();','');
const ctx={window:{addEventListener(){},RPV3:require('../v3logic.js'),RPCatalog:require('../catalog.js')},document:{addEventListener(){},querySelector(){return null},querySelectorAll(){return []}},localStorage:{getItem(){return null}},setTimeout:()=>0,clearTimeout(){},console,alert(){}};
vm.createContext(ctx);vm.runInContext(code,ctx);const api=ctx.window.__app,J=x=>JSON.parse(JSON.stringify(x));
let trip=api.silvesterTemplate(),scope='guest',enabled=true,editable=true,writes=0,fail=false,reenter=null;
trip.transport={out:[{id:'seg1',mode:'bahn',cost:200,per:'grp'}],back:[]};trip.schemaVersion=3;
trip.ledger={'tr:seg1':{status:'gebucht',amount:200,paid:200,due:''}};
const initial=J(trip),target={kind:'ledger',key:'tr:seg1'};
const editor=E.create(api,{getTrip:id=>trip&&trip.id===id?trip:null,scope:()=>scope,enabled:()=>enabled,canEdit:()=>editable,newId:()=> 'refeditor',put:next=>{writes++;if(reenter)reenter();if(fail){next.title='Store mutiert Kandidaten';return false}trip=J(next);return true}});
editor.begin(trip.id,'cancel',target);let p=editor.preview({on:'2026-10-15',fee:'50'});
assert.equal(writes,0);assert.deepEqual(J(trip),initial);assert(p.preview.includes('150,00'));
scope='account:other';assert.throws(()=>editor.apply(p.token),/Speicherbereich/);scope='guest';
editable=false;assert.throws(()=>editor.apply(p.token),/freigegeben/);editable=true;
enabled=false;assert.throws(()=>editor.apply(p.token),/noch nicht freigegeben/);enabled=true;
trip.title='Zwischenzeitlich geändert';assert.throws(()=>editor.apply(p.token),/geändert/);trip=J(initial);
const token=p.token;editor.back();assert.throws(()=>editor.apply(token),/zuerst prüfen/);
p=editor.preview({on:'2026-10-15',fee:'50'});
assert.throws(()=>editor.preview({on:'2026-10-15',fee:'abc'}));assert.throws(()=>editor.apply(p.token),/zuerst prüfen/,'Ungültige neue Eingabe verwirft alte Freigabe');
p=editor.preview({on:'2026-10-15',fee:'50'});fail=true;
assert.throws(()=>editor.apply(p.token),/nicht gespeichert/);assert.equal(editor.state().phase,'preview');assert.deepEqual(J(trip),initial);
fail=false;reenter=()=>assert.throws(()=>editor.apply(p.token),/bereits/);editor.apply(p.token);reenter=null;
assert.equal(trip.title,initial.title,'Store-Mutation des Fehlversuchs beschädigt privaten Kandidaten nicht');
assert.equal(trip.ledger['tr:seg1'].cancel.fee,50);assert.equal(editor.state(),null);
assert.throws(()=>editor.apply(p.token),/nicht mehr geöffnet/);assert.equal(writes,2,'Ein Fehlversuch, eine erfolgreiche Übernahme, keine doppelte Buchung');
editor.begin(trip.id,'refund',target);p=editor.preview({on:'2026-10-15',amount:'150'});editor.apply(p.token);
assert.equal(trip.ledger['tr:seg1'].refunds.length,1);assert.equal(api.financeEntry(trip,target).math.refundOpen,0);
editor.begin(trip.id,'uncancel',target);p=editor.preview({});editor.apply(p.token);
assert.equal(api.financeEntry(trip,target).math.open,150);assert.equal(trip.ledger['tr:seg1'].refunds.length,1);
editor.begin(trip.id,'cancel',target);editor.close();assert.throws(()=>editor.preview({}),/nicht mehr geöffnet/);
editor.begin(trip.id,'transport');
assert.throws(()=>editor.segment({action:'remove',dir:'out',id:'seg1'},{}),/Anreise-Abschnitte/);
assert.equal(editor.state().transport.out.length,1,'Abgelehnte Entfernung verändert auch den Entwurf nicht');
/* Der gebuchte Hinweg darf auch nicht nebenbei verändert werden. */
assert.throws(()=>editor.segment({action:'add',dir:'back'},{'out.seg1.to':'Zusatzentwurf'}),/Anreise-Abschnitt/);
const withExtra=editor.segment({action:'add',dir:'back'},{});
assert.equal(withExtra.transport.back.length,1);assert.equal(trip.transport.back.length,0);
withExtra.transport.back[0].cost=999;assert.equal(editor.state().transport.back[0].cost,null,'Öffentlicher Zustand kann privaten Entwurf nicht mutieren');
const tp=editor.preview({'back.refeditor.cost':'99,90'});editor.apply(tp.token);
assert.equal(trip.transport.back[0].cost,99.9);assert.equal(trip.transport.out[0].id,'seg1');
editor.begin(trip.id,'cancel',target);trip=null;assert.throws(()=>editor.preview({on:'2026-10-15',fee:'0'}),/geändert/);
assert.equal(api.V3_EDIT,false);
/* Aktivierung nur im separaten Node-Kontext, analog zur Browser-Testantwort.
   Echte Store-Kandidatenübernahme ohne Änderung der Produktionskonstante. */
const local=new Map(),active={...ctx,window:{addEventListener(){},RPV3:require('../v3logic.js'),RPV3Forms:require('../v3forms.js'),RPV3Editor:E,RPCatalog:require('../catalog.js')},localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,String(v)),removeItem:k=>local.delete(k)}};
vm.createContext(active);vm.runInContext(code.replace('const V3_EDIT=false;','const V3_EDIT=true;'),active);
const b=active.window.__app,t2=J(initial);assert(b.Store.put(t2));
assert(b.v3Actions(t2,target).includes('data-v3-open="cancel"'));assert.equal(api.v3Actions(initial,target),'','Produktionskontext zeigt keine experimentellen Knöpfe');
const real=b.v3Controller();real.begin(t2.id,'cancel',target);const cand=real.preview({on:'2026-10-15',fee:'50,00'});assert(real.apply(cand.token));
assert.equal(b.Store.get(t2.id).ledger['tr:seg1'].cancel.fee,50);assert.equal(JSON.parse(local.get('rp-trips'))[t2.id].ledger['tr:seg1'].cancel.fee,50);
real.begin(t2.id,'transport');const addedAddon=real.segment({action:'add-addon',dir:'out',id:'seg1'},{}).transport.out[0].addons[0];
assert(addedAddon.id,'Neuer, noch ungebundener Zusatzposten darf getrennt geplant werden');
/* Regel 16.10. (Claude, #8): Online-Check-in ist Anbieterinformation und darf beim gebuchten Abschnitt nachgetragen werden; Zeiten bleiben geschützt. */
assert.throws(()=>real.revise({'out.seg1.dep_time':'23:59'}),/Anreise-Abschnitt/,'Abfahrtszeit des gebuchten Abschnitts bleibt geschützt');
assert.equal(real.revise({'out.seg1.checkin_date':'2026-12-29','out.seg1.checkin_note':'Online ab 30 h'}).transport.out[0].checkin.note,'Online ab 30 h','Check-in beim gebuchten Abschnitt nachtragbar');
const bound=b.setTransport(b.Store.get(t2.id),real.state().transport);bound.ledger['tr:seg1:'+addedAddon.id]={status:'gebucht',amount:25,paid:25,due:''};b.Store.put(bound);
real.begin(t2.id,'transport');assert.throws(()=>real.segment({action:'remove-addon',dir:'out',id:'seg1',addonId:addedAddon.id},{}),/Anreise-Abschnitt/,'Gebuchter Zusatzposten bleibt geschützt');
console.log('v3-Editor: Vorschau, explizite Übernahme, Rechte/Bereich/Quellstand/Freigabe, Fehlerwiederholung, alte Kandidaten und Doppelklick gegen echte Mutatoren geprüft. Kein DOM-/Browsertest.');
