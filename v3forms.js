/* Formularbausteine für Format 3. App-Einstiege bleiben hinter V3_EDIT=false.
   Keine DOM-Ereignisse, kein Speicher, keine eigene Kostenrechnung. Der App-Controller
   bindet diese Darstellungen später an Kandidaten-Mutatoren und prüft assertFresh vor Übernahme. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./v3logic.js'));
 else root.RPV3Forms=factory(root.RPV3);
})(typeof self!=='undefined'?self:this,function(V){
 'use strict';
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const copy=o=>JSON.parse(JSON.stringify(o));
 const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function api(){if(!V)throw Error('Die Anreise- und Stornoprüfung konnte nicht geladen werden.');return V}
 function scalar(value){if(value==null)return '';if(!['string','number'].includes(typeof value))throw Error('Ungültige Eingabe.');return String(value).trim()}
 function amount(value,{unknown=true,positive=false}={}){
  const s=scalar(value);if(!s){if(unknown)return null;throw Error('Bitte einen Betrag eintragen.');}
  if(!/^\d+(?:[.,]\d{1,2})?$/.test(s))throw Error('Betrag ohne Tausendertrennzeichen mit höchstens zwei Nachkommastellen eingeben.');
  const n=Number(s.replace(',','.'));if(!Number.isFinite(n)||n>1e9||positive&&n<=0)throw Error(positive?'Der Betrag muss größer als 0 und höchstens 1 Milliarde Euro sein.':'Ungültiger Betrag.');return n;
 }
 function distance(value){const s=scalar(value);if(!s)return null;if(!/^\d+(?:[.,]\d{1,3})?$/.test(s))throw Error('Kilometer mit höchstens drei Nachkommastellen eingeben.');const n=Number(s.replace(',','.'));if(n>20000)throw Error('Höchstens 20.000 Kilometer je Abschnitt.');return n}
 function money(v){return typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(v):'unbekannt'}
 function session(trip,scope){if(!trip||typeof trip.id!=='string'||typeof scope!=='string'||!scope)throw Error('Reise oder Speicherbereich fehlt.');return {tripId:trip.id,scope,source:JSON.stringify(trip),transport:api().validateTransport(copy(trip.transport||{out:[],back:[]}))}}
 function assertFresh(draft,trip,scope){if(!draft||!trip||draft.tripId!==trip.id||draft.scope!==scope||draft.source!==JSON.stringify(trip))throw Error('Die Reise oder der Speicherbereich hat sich geändert. Bitte den Entwurf erneut öffnen.');return true}
 function input(name,label,value,attrs=''){return '<label class="fld"><span>'+esc(label)+'</span><input name="'+esc(name)+'" value="'+esc(value)+'" '+attrs+'></label>'}
 function select(name,label,value,options){return '<label class="fld"><span>'+esc(label)+'</span><select name="'+esc(name)+'">'+options.map(([v,t])=>'<option value="'+esc(v)+'"'+(v===value?' selected':'')+'>'+esc(t)+'</option>').join('')+'</select></label>'}
 const priceAttrs='type="text" inputmode="decimal" maxlength="20" placeholder="leer = unbekannt"';
 function pointFields(prefix,kind,p,label){p=p||{};const name=label||(kind==='dep'?'Abfahrt':'Ankunft');return input(prefix+kind+'_date',name+' · Datum',p.date,'type="date"')+input(prefix+kind+'_time',name+' · Ortszeit',p.time,'type="time"')+input(prefix+kind+'_tz',name+' · Zeitzone',p.tz,'type="text" maxlength="64" placeholder="z. B. Europe/Berlin – nicht automatisch gesetzt"')}
 function transportForm(model){
  const tr=api().validateTransport(model)||{out:[],back:[]};
  return '<section data-v3-transport-editor><h2>Anreise in Abschnitten vorbereiten</h2><p class="note">Nur ein Entwurf. Erst die spätere Änderungsprüfung kann eine Übernahme anbieten.</p><p class="small muted">Leere Preise und Zeiten bleiben unbekannt. Alle Uhrzeiten beziehen sich auf die jeweils eingetragene Ortszeit und Zeitzone.</p>'+
   ['out','back'].map(dir=>'<section class="block"><h3>'+(dir==='out'?'Hinreise':'Rückreise')+' · '+tr[dir].length+' von 12 Abschnitten</h3>'+tr[dir].map((s,i)=>{
    const p=dir+'.'+s.id+'.';
    return '<details class="panel" data-v3-segment="'+s.id+'" open><summary><b>'+(i+1)+' · '+esc(V.MODES[s.mode])+(s.from||s.to?' · '+esc([s.from,s.to].filter(Boolean).join(' → ')):'')+'</b></summary><div class="form">'+
     select(p+'mode','Verkehrsmittel',s.mode,Object.entries(V.MODES))+input(p+'from','Von',s.from,'type="text" maxlength="80"')+input(p+'to','Nach',s.to,'type="text" maxlength="80"')+
     (s.mode==='flug'?input(p+'fromCode','Abflughafen · IATA-Code',s.fromCode,'type="text" maxlength="3" placeholder="z. B. STR"')+input(p+'toCode','Zielflughafen · IATA-Code',s.toCode,'type="text" maxlength="3" placeholder="z. B. PMI"'):'')+
     pointFields(p,'dep',s.dep)+pointFields(p,'arr',s.arr)+input(p+'carrier','Anbieter / Airline',s.carrier,'type="text" maxlength="40"')+input(p+'number','Flug- / Zugnummer',s.number,'type="text" maxlength="40"')+
     input(p+'cost','Preis · €',s.cost,priceAttrs)+select(p+'per','Preis gilt',s.per,[['grp','Für alle zusammen'],['pp','Pro Person']])+
     (['auto','mietwagen'].includes(s.mode)?input(p+'km','Eigene Kilometer dieses Abschnitts',s.km,'type="text" inputmode="decimal" placeholder="leer = unbekannt"'):'')+'</div>'+
     '<h4>Zusatzposten</h4>'+s.addons.map(a=>'<div class="form">'+input(p+'addon.'+a.id+'.label','Bezeichnung',a.label,'type="text" maxlength="60"')+input(p+'addon.'+a.id+'.cost','Zusatzpreis · €',a.cost,priceAttrs)+select(p+'addon.'+a.id+'.per','Zusatzpreis gilt',a.per,[['grp','Für alle zusammen'],['pp','Pro Person']])+'<button type="button" class="btn ghost sm" data-v3-editor-action="segment-remove-addon" data-dir="'+dir+'" data-id="'+s.id+'" data-addon="'+a.id+'">Zusatzposten entfernen</button></div>').join('')+
     '<button type="button" class="btn ghost sm" data-v3-editor-action="segment-add-addon" data-dir="'+dir+'" data-id="'+s.id+'"'+(s.addons.length>=20?' disabled':'')+'>+ Zusatzposten ergänzen</button>'+
     '<details><summary>Online-Check-in · optional</summary><p class="small muted">Nur vom Anbieter bekannte Angaben eintragen, keine automatisch berechnete Frist.</p><div class="form">'+pointFields(p,'checkin',s.checkin&&s.checkin.opens,'Online-Check-in ab')+input(p+'checkin_note','Hinweis zum Check-in',s.checkin&&s.checkin.note,'type="text" maxlength="200"')+'</div></details>'+
     '<div class="row">'+[['up','Nach oben',i===0],['down','Nach unten',i===tr[dir].length-1],['remove','Abschnitt entfernen',false]].map(([op,label,disabled])=>'<button type="button" class="btn ghost sm" data-v3-editor-action="segment-'+op+'" data-dir="'+dir+'" data-id="'+s.id+'"'+(disabled?' disabled':'')+'>'+label+'</button>').join('')+'</div>'+
     '<p class="small muted">Buchungen, Zahlungen und Fristen werden nicht durch das Ändern dieser Eingaben aufgehoben. Die anschließende Vorschau prüft vorhandene Verpflichtungen.</p></details>';
   }).join('')+'<button type="button" class="btn ghost" data-v3-editor-action="segment-add" data-dir="'+dir+'"'+(tr[dir].length>=12?' disabled':'')+'>+ Abschnitt ergänzen</button></section>').join('')+'<button type="button" class="btn" data-v3-editor-action="preview-transport">Änderungen prüfen</button></section>';
 }
 /* Fields: Werte aus name-Attributen, z. B. out.seg1.dep_date. Nicht gelieferte
    Angaben bleiben erhalten. IDs, bestehende Zusatzposten und Check-in werden nie neu aufgebaut. */
 function readTransport(fields,model){
  const tr=api().validateTransport(model)||{out:[],back:[]};
  ['out','back'].forEach(dir=>tr[dir].forEach(s=>{
   const p=dir+'.'+s.id+'.',read=(key,old)=>own(fields,p+key)?fields[p+key]:old;
   s.mode=scalar(read('mode',s.mode));['from','to','carrier','number'].forEach(k=>{s[k]=scalar(read(k,s[k]))});
   s.cost=amount(read('cost',s.cost));s.per=scalar(read('per',s.per));
   ['dep','arr'].forEach(k=>{const old=s[k]||{},q={};['date','time','tz'].forEach(f=>{q[f]=scalar(read(k+'_'+f,old[f]))||null});s[k]=!s[k]&&!Object.values(q).some(Boolean)?null:q});
   const oldCheck=s.checkin||{},opens={};['date','time','tz'].forEach(f=>{opens[f]=scalar(read('checkin_'+f,oldCheck.opens&&oldCheck.opens[f]))||null});
   const note=scalar(read('checkin_note',oldCheck.note)),hasOpens=Object.values(opens).some(Boolean);
   if(s.checkin||hasOpens||note)s.checkin={opens:hasOpens||oldCheck.opens?opens:null,note};
   if(s.mode==='flug'){['fromCode','toCode'].forEach(k=>{const v=scalar(read(k,s[k])).toUpperCase();if(v)s[k]=v;else delete s[k]})}else{delete s.fromCode;delete s.toCode}
   s.km=['auto','mietwagen'].includes(s.mode)?distance(read('km',s.km)):null;
   s.addons.forEach(a=>{const ap='addon.'+a.id+'.';a.label=scalar(read(ap+'label',a.label));a.cost=amount(read(ap+'cost',a.cost));a.per=scalar(read(ap+'per',a.per))});
  }));return api().validateTransport(tr);
 }
 function cancelPayload(raw,entry){const payload={on:scalar(raw.on),fee:amount(raw.fee)};api().validateMoneyMoves(Object.assign({},entry,{cancel:payload}),'Storno');return payload}
 /* Nur Entwurf: Der Controller muss das Resultat zusätzlich durch setTransport
    gegen Verpflichtungen prüfen, bevor er die Änderung im Editor übernimmt. */
 function changeTransport(model,{action,dir,id,newId,addonId}){
  const tr=api().validateTransport(model)||{out:[],back:[]};
  if(!['out','back'].includes(dir))throw Error('Ungültige Reiserichtung.');
  const list=tr[dir],index=list.findIndex(s=>s.id===id);
  if(action==='add')list.push({id:newId,mode:'bahn',cost:null,per:'grp'});
  else{
   if(index<0)throw Error('Abschnitt nicht mehr vorhanden.');
   if(action==='add-addon')list[index].addons.push({id:newId,label:'Zusatzposten',cost:null,per:'grp'});
   else if(action==='remove-addon'){
    const ai=list[index].addons.findIndex(a=>a.id===addonId);if(ai<0)throw Error('Zusatzposten nicht mehr vorhanden.');list[index].addons.splice(ai,1);
   }
   else if(action==='remove')list.splice(index,1);
   else if(action==='up'||action==='down'){
    const to=index+(action==='up'?-1:1);if(to<0||to>=list.length)throw Error('Abschnitt kann nicht weiter verschoben werden.');
    [list[index],list[to]]=[list[to],list[index]];
   }else throw Error('Unbekannte Abschnittsaktion.');
  }
  return api().validateTransport(tr);
 }
 function refundPayload(raw,id,entry){const payload={id,on:scalar(raw.on),amount:amount(raw.amount,{unknown:false,positive:true})};api().validateMoneyMoves(Object.assign({},entry,{refunds:(entry.refunds||[]).concat([payload])}),'Erstattung');return payload}
 function financialForm(action,view){
  if(!['cancel','refund','uncancel'].includes(action))throw Error('Unbekannte Finanzaktion.');
  const e=view.entry||{},title={cancel:'Storno vorbereiten',refund:'Erhaltene Erstattung erfassen',uncancel:'Storno zurücknehmen'}[action];
  const rows=(e.refunds||[]).map(r=>'<li>'+esc(r.on)+' · '+esc(money(r.amount))+'</li>').join('');
  return '<section data-v3-financial-editor="'+action+'"><h2>'+title+'</h2><p>'+esc(view.label)+'</p><p class="note">Entwurf – noch keine Änderung an eurer Reise.</p>'+
   '<p class="small">Bisher brutto bezahlt: <b>'+esc(money(e.paid))+'</b>. Erstattungen und Storno sind getrennt.</p>'+
   (rows?'<details><summary>Bereits erhaltene Erstattungen</summary><ul>'+rows+'</ul></details>':'')+
   (action==='cancel'?'<div class="form">'+input('on','Storno am',e.cancel&&e.cancel.on,'type="date" required')+input('fee','Stornogebühr · €',e.cancel&&e.cancel.fee,priceAttrs)+'</div><p class="small muted">Leer = Gebühr unbekannt, 0 = ausdrücklich kostenfrei. Bisherige Zahlungen werden nicht verändert.</p>':
    action==='refund'?'<div class="form">'+input('on','Tatsächlich erhalten am','','type="date" required')+input('amount','Erhaltener Betrag · €','',priceAttrs+' required')+'</div><p class="small muted">Nur bereits erhaltenes Geld eintragen, keine erwartete Erstattung.</p>':'<p>Erhaltene Erstattungen bleiben bestehen. Die Vorschau zeigt, ob dadurch erneut Zahlungen offen sind.</p>')+
   '<button type="button" class="btn" data-v3-editor-action="preview-'+action+'">Änderung prüfen</button></section>';
 }
 function financialPreview(before,after){
  const rows=[['Kosten','cost'],['Netto bezahlt','netPaid'],['Noch zu zahlen','open'],['Erstattung offen','refundOpen'],['Bereits zurückerhalten','refundsReceived']];
  const warnings=[...(before.warnings||[]),...(after.warnings||[])];
  return '<section data-v3-financial-preview><h2>Änderung prüfen</h2><p>'+esc(after.label)+'</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th scope="col">Posten</th><th scope="col">Bisher</th><th scope="col">Danach</th></tr></thead><tbody>'+rows.map(([label,key])=>'<tr><th scope="row">'+label+'</th><td>'+esc(money(before.math&&before.math[key]))+'</td><td>'+esc(money(after.math&&after.math[key]))+'</td></tr>').join('')+'</tbody></table></div>'+
   (warnings.length?'<ul>'+[...new Set(warnings)].map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':'')+'<p class="small muted">Dies löst keine Buchung, Stornierung oder Banküberweisung aus. Die Änderung betrifft nur den Reiseplan.</p></section>';
 }
 function transportPreview(before,after,totals){
  function describe(model){const tr=api().validateTransport(model)||{out:[],back:[]};
   const point=p=>!p?'unbekannt':[p.date||'Datum offen',p.time||'Uhrzeit offen',p.tz||'Zeitzone offen'].join(' · ');
   return ['out','back'].map(dir=>'<h3>'+(dir==='out'?'Hinreise':'Rückreise')+'</h3>'+(!tr[dir].length?'<p>Keine Abschnitte</p>':'<ol>'+tr[dir].map(s=>'<li><b>'+esc(V.MODES[s.mode])+' · '+esc(['from','to'].map((k,i)=>[s[k],s[k+'Code']].filter(Boolean).join(' · ')||(i?'Ziel offen':'Start offen')).join(' → '))+'</b><p class="small">Abfahrt: '+esc(point(s.dep))+'<br>Ankunft: '+esc(point(s.arr))+'<br>Anbieter / Nummer: '+esc([s.carrier,s.number].filter(Boolean).join(' · ')||'unbekannt')+'<br>Preis: '+esc(money(s.cost))+' · '+(s.per==='pp'?'pro Person':'für alle')+(s.km!=null?' · '+esc(s.km)+' eigene km':'')+'</p>'+(s.addons.length?'<ul>'+s.addons.map(a=>'<li>'+esc(a.label)+' · '+esc(money(a.cost))+' · '+(a.per==='pp'?'pro Person':'für alle')+'</li>').join('')+'</ul>':'')+(s.checkin?'<p class="small">Online-Check-in ab: '+esc(point(s.checkin.opens))+'<br>'+esc(s.checkin.note)+'</p>':'')+'</li>').join('')+'</ol>')).join('');
  }
  return '<section data-v3-transport-preview><h2>Anreiseänderung prüfen</h2><p class="note">Abschnittskosten ersetzen die bisherige Anreiseberechnung. Unbekannte Preise bleiben offen; dies ist kein geprüftes Ticketangebot.</p>'+(totals?'<p>Reise-Planwert bisher: <b>'+esc(money(totals.before))+'</b> · danach: <b>'+esc(money(totals.after))+'</b></p>'+(totals.open.length?'<p class="small">Weiterhin offen: '+totals.open.map(esc).join(' · ')+'</p>':''):'')+'<details><summary>Bisherige Abschnitte</summary>'+describe(before)+'</details><h3>Danach</h3>'+describe(after)+'<p class="small muted">Die bisher erfassten Zahlungen und Buchungen bleiben ihren ursprünglichen Posten zugeordnet. Keine Buchung oder Stornierung beim Anbieter.</p></section>';
 }
 return {amount,distance,session,assertFresh,transportForm,readTransport,changeTransport,transportPreview,cancelPayload,refundPayload,financialForm,financialPreview};
});
