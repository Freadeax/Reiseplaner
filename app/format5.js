/* Reiseplaner · Format 5 schreiben (Claude, 16.11.2026; SCHEMA_V5 §8 Schritt 4, Freigabe Philipp 16.11.).
   Klassisches Skript ohne Bundler, teilt sich den globalen Gültigkeitsbereich mit den übrigen app/*.js-Teilen.
   Ein Schreibweg: f5Commit(t, fn) baut über RPV5.candidate5 eine geprüfte Kopie, hebt die Reise nur nach Bestätigung auf
   Format 5 (dauerhaft) und speichert über Store.put. Erste Funktionen: Fristen als erledigt markieren (M02),
   Stornobedingungen mit Gebührenvorschau (M02.2), Zahlungsplan (M08.2). Unbekanntes bleibt unbekannt, nie 0 €. */
"use strict";
function f5CanEdit(t){return !!(F5_WRITE&&V5&&t&&v3CanEdit(t))}
/* Kontext für den Gästekartenstatus beim Anheben (G-R12): bestätigte Karte wird als Eintrag übernommen, Status bleibt */
function f5Ctx(t){const st=stayOf(t),pl=placeOf(t);return st?{stayId:t.stayId,stayCard:st.card,cardName:pl&&pl.card||null}:{}}
const F5_UPGRADE_TXT='Die Reise wird dabei auf Format 5 umgestellt. Das bleibt dauerhaft so. Ältere Stände der Website zeigen die Reise danach nur noch an; auf anderen Geräten die Seite zuerst neu laden.';
const f5Stamp=d=>(d||new Date()).toISOString().slice(0,19)+'Z';
/* Speichern. Ohne opt.confirmed wird ein Anheben nicht gespeichert, sondern zur Bestätigung zurückgegeben. */
function f5Commit(t,fn,opt){
  const cur=t&&Store.get(t.id);if(!cur)throw new Error('Reise nicht mehr vorhanden.');
  if(!f5CanEdit(cur))throw new Error(!F5_WRITE?'Diese Angaben können in dieser Version noch nicht gespeichert werden.':'Diese Reise kann gerade nicht geändert werden.');
  const cand=V5.candidate5(cur,fn,Object.assign(f5Ctx(cur),opt&&opt.card?{allowCardChange:true}:{}));
  if(cand.upgrade&&!(opt&&opt.confirmed))return {ok:false,needsConfirm:'format5',notice:F5_UPGRADE_TXT,from:cand.from};
  const next=clone(cand.trip);validateExtras(next);
  /* Schutz gebuchter Angaben wie bisher; Storno-, Plan- und Zahlungsangaben ergänzen eine Buchung und ändern sie nicht */
  const plainOffers=x=>{const y=clone(x);(y.offers||[]).forEach(o=>{V5.FIELDS.offer.forEach(k=>delete o[k]);if(opt&&opt.payments)delete o.paid});Object.keys(y.ledger||{}).forEach(k=>{const e=y.ledger[k];if(e&&typeof e==='object')V5.FIELDS.ledger.forEach(f=>delete e[f])});delete y.schemaVersion;delete y.guestCards;if(opt&&opt.card)delete y.cardConfirmed;return y};
  const issues=commitmentIssues(plainOffers(cur),plainOffers(next));if(issues.length)throw new Error('Nicht möglich: '+issues.join(' · ')+'.');
  if(!Store.put(next))return {ok:false,error:'Nicht gespeichert.'};
  return {ok:true,trip:Store.get(next.id),upgraded:!!cand.upgrade,migrated:cand.migrated};
}

/* ---------- Schreibwege (rein bis auf f5Commit) ---------- */
/* Frist erledigt / wieder offen. Aufgaben (task:<id>) über tasks[].done, alle anderen über deadlineAck. */
function f5Ack(t,id,done,opt){
  if(typeof id!=='string'||!id)throw new Error('Frist fehlt.');
  const now=opt&&opt.now||new Date();
  return f5Commit(t,c=>{
    if(/^task:/.test(id)){const x=(c.tasks||[]).find(k=>'task:'+k.id===id);if(!x)throw new Error('Aufgabe nicht gefunden.');x.done=!!done;if(done)x.doneAt=f5Stamp(now);else delete x.doneAt;return}
    const a=Object.assign({},c.deadlineAck||{});
    if(done)a[id]={at:f5Stamp(now),note:''};else delete a[id];
    if(Object.keys(a).length)c.deadlineAck=a;else delete c.deadlineAck;
  },opt);
}
/* Stornobedingungen der gewählten Unterkunft (key 'stay') oder eines Buchungsbuch-Postens. terms null = entfernen. */
function f5SetCancelTerms(t,key,terms,opt){
  return f5Commit(t,c=>{
    const e=key==='stay'?activeOffer(c):c.ledger&&c.ledger[key];
    if(!e)throw new Error(key==='stay'?'Keine Unterkunft gewählt.':'Posten nicht gefunden.');
    if(terms)e.cancelTerms=terms;else delete e.cancelTerms;
  },opt);
}
function f5SetPayPlan(t,plan,opt){
  return f5Commit(t,c=>{const o=activeOffer(c);if(!o)throw new Error('Keine Unterkunft gewählt.');if(plan&&plan.length)o.payPlan=plan;else delete o.payPlan},opt);
}

/* ---------- Formulare lesen ---------- */
const f5Val=id=>{const el=$('#'+id);return el?String(el.value||'').trim():''};
function f5At(date,time,what){
  if(!date){if(time)throw new Error(what+': Datum fehlt.');return null}
  if(!pd(date))throw new Error(what+': Datum ungültig.');
  return {date,time:time||null,tz:null};
}
function f5Money(v,what){const x=num(v,NaN);if(!isFinite(x)||x<0)throw new Error(what+': Betrag prüfen.');return Math.round(x*100)/100}
function f5ReadCancel(){
  const fu=f5At(f5Val('f5-fu-date'),f5Val('f5-fu-time'),'Kostenlos bis'),steps=[];
  for(let i=0;i<F5_STEPS;i++){
    const d=f5Val('f5-st-date-'+i),v=f5Val('f5-st-val-'+i),k=f5Val('f5-st-kind-'+i)||'pct',w='Stufe '+(i+1);
    if(!d&&!v)continue;
    if(!d||!v)throw new Error(w+': Datum und Wert angeben.');
    const s={from:f5At(d,null,w)};
    if(k==='fee')s.fee=f5Money(v,w);else{const p=num(v,NaN);if(!isFinite(p)||p<0||p>100)throw new Error(w+': Prozent 0–100.');s.pct=Math.round(p*100)/100}
    steps.push(s);
  }
  if(!fu&&!steps.length)return null;
  return {freeUntil:fu,steps,src:f5Val('f5-src').slice(0,200),checkedAt:iso(todayUTC())};
}
function f5ReadPlan(old){
  const plan=[],ids=new Set();
  const oldIds=new Set((old||[]).map(x=>x.id));
  const freeId=i=>{const want=old&&old[i]&&old[i].id;if(want&&!ids.has(want))return want;let n=i+1;while(ids.has('rate'+n)||oldIds.has('rate'+n))n++;return 'rate'+n};
  for(let i=0;i<F5_RATES;i++){
    const label=f5Val('f5-pp-label-'+i),due=f5Val('f5-pp-due-'+i),k=f5Val('f5-pp-kind-'+i)||'amount',v=f5Val('f5-pp-val-'+i),w='Rate '+(i+1);
    if(!label&&!due&&!v)continue;
    if(!label||!due)throw new Error(w+': Bezeichnung und Fälligkeit angeben.');
    if(!pd(due))throw new Error(w+': Fälligkeit ungültig.');
    const r={id:freeId(i),label:label.slice(0,60),due};ids.add(r.id);
    if(k==='rest')r.rest=true;
    else if(k==='pct'){const p=num(v,NaN);if(!isFinite(p)||p<=0||p>100)throw new Error(w+': Prozent 1–100.');r.pct=Math.round(p*100)/100}
    else{const a=f5Money(v,w);if(!a)throw new Error(w+': Betrag größer als 0 angeben.');r.amount=a}
    plan.push(r);
  }
  return plan;
}

/* ---------- Anzeige ---------- */
const F5_STEPS=4,F5_RATES=4;
const f5Date=a=>a?fmtLong(pd(a.date))+(a.time?' '+a.time:''):'';
function f5Price(o){const a=offerAmounts(o);return a.unknown.length?null:a.total}
/* Block unter „Unterkunft: Buchung & Zahlungen“: Storno heute, Stufen, Zahlungsplan mit Status */
function f5OfferBlock(t,o){
  if(!V5||!o)return '';
  const edit=f5CanEdit(t),price=f5Price(o),parts=[];
  if(o.cancel)parts.push('<p class="small muted">Storno ist erfasst; Stornobedingungen gelten nicht mehr.</p>');
  else{
    const c=o.cancelTerms,now=V5.cancelFee(c||null,price,Date.now());
    parts.push('<h3>Stornobedingungen</h3>'+(c?'<p><b>Heute: '+esc(now.text)+'</b></p><ul class="plain small">'+
      (c.freeUntil?'<li>Kostenlos bis '+esc(f5Date(c.freeUntil))+'</li>':'')+
      c.steps.map(s=>{const f=V5.cancelFee(c,price,f5StepMs(s));return '<li>Ab '+esc(f5Date(s.from))+': '+esc(f.text)+'</li>'}).join('')+'</ul>'+
      (c.src?'<p class="small muted">Quelle: '+esc(c.src)+(c.checkedAt?' · geprüft '+esc(fmtLong(pd(c.checkedAt))):'')+'</p>':'')
      :'<p class="small muted">Nicht erfasst. Ohne Bedingungen ist die Stornogebühr unbekannt, nicht 0 €.</p>')+
      (edit?'<button type="button" class="btn ghost sm" data-f5-act="cancel-open">'+(c?'Stornobedingungen ändern':'Stornobedingungen eintragen')+'</button>':''));
  }
  const plan=o.payPlan||[];
  if(plan.length||edit){
    let body='<p class="small muted">Kein Zahlungsplan erfasst.</p>';
    if(plan.length){const st=V5.payPlanStatus(plan,price,num(o.paid,0),iso(todayUTC()));
      const lab={bezahlt:'bezahlt',teilweise:'teilweise bezahlt',offen:'offen',ueberfaellig:'überfällig',unbekannt:'Betrag unbekannt'};
      body='<ul class="plain small">'+st.rows.map(r=>'<li><b>'+esc(r.label)+'</b> · fällig '+esc(fmtLong(pd(r.due)))+' · '+(r.amount==null?'Betrag unbekannt (Preis fehlt)':eur(r.amount))+' · '+(r.state==='ueberfaellig'?'<b>! '+lab[r.state]+'</b>':lab[r.state])+(r.open&&r.open!==r.amount?' ('+eur(r.open)+' offen)':'')+'</li>').join('')+'</ul>'+
        (st.extra?'<p class="small muted">'+eur(st.extra)+' mehr bezahlt als geplant.</p>':'')+'<p class="small muted">Zahlungen werden den Raten nach Fälligkeit zugeordnet (älteste zuerst).</p>'}
    parts.push('<h3>Zahlungsplan</h3>'+body+(edit?'<button type="button" class="btn ghost sm" data-f5-act="plan-open">'+(plan.length?'Zahlungsplan ändern':'Zahlungsplan eintragen')+'</button>':''));
  }
  parts.push(f5PayList(t,o,edit));
  return '<div class="f5-offer" data-f5-offer>'+parts.join('')+'</div>';
}
function f5StepMs(s){const d=pd(s.from.date);return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()).getTime()+(s.from.time?timeMin(s.from.time)*60000:0)}
const f5Fld=(id,label,type,value,extra)=>'<label class="fld"><span>'+label+'</span><input id="'+id+'" type="'+type+'" value="'+esc(value==null?'':String(value))+'"'+(extra||'')+'></label>';
const f5Sel=(id,label,opts,value)=>'<label class="fld"><span>'+label+'</span><select id="'+id+'">'+opts.map(([k,l])=>'<option value="'+k+'"'+(k===value?' selected':'')+'>'+l+'</option>').join('')+'</select></label>';
const f5Upgrade=t=>t.schemaVersion===5?'':'<div class="note" role="status"><p>'+esc(F5_UPGRADE_TXT)+'</p></div>';
/* Ziel der Stornobedingungen: 'stay' = gewählte Unterkunft, sonst Buchungsbuch-Schlüssel (Kurs, Skipass, Anreise …) */
function f5CancelTarget(t,key){
  if(key==='stay'){const o=activeOffer(t);return o?{name:o.name,terms:o.cancelTerms,price:f5Price(o)}:null}
  const e=t.ledger&&t.ledger[key],r=e&&ledgerRows(t).find(x=>x.key===key);
  return e&&r?{name:r.label,terms:e.cancelTerms,price:e.amount==null?null:+e.amount}:null;
}
function f5CancelSheet(t,key){
  key=key||'stay';const tg=f5CancelTarget(t,key);if(!tg)throw new Error('Posten nicht gefunden.');
  const o={name:tg.name,cancelTerms:tg.terms},c=tg.terms||{freeUntil:null,steps:[],src:''},price=tg.price;
  let rows='';for(let i=0;i<F5_STEPS;i++){const s=c.steps[i]||{};
    rows+='<div class="row">'+f5Fld('f5-st-date-'+i,'Ab (Datum)','date',s.from&&s.from.date)+f5Sel('f5-st-kind-'+i,'Art',[['pct','Prozent'],['fee','fester Betrag (€)']],s.fee!=null?'fee':'pct')+f5Fld('f5-st-val-'+i,'Wert','text',s.fee!=null?s.fee:s.pct,' inputmode="decimal"')+'</div>'}
  return '<h2>Stornobedingungen</h2><p class="small muted">'+esc(o.name)+'. Aus der Buchungsbestätigung übernehmen. Prozent beziehen sich auf den gebuchten Preis'+(price==null?' (noch unbekannt, daher bleibt die Gebühr offen)':' ('+eur(price)+')')+'.</p>'+
    '<div class="row">'+f5Fld('f5-fu-date','Kostenlos stornierbar bis','date',c.freeUntil&&c.freeUntil.date)+f5Fld('f5-fu-time','Uhrzeit (optional)','time',c.freeUntil&&c.freeUntil.time)+'</div>'+
    '<h3>Stufen danach</h3>'+rows+f5Fld('f5-src','Quelle (z. B. „Mail Vermieter 03.11.“)','text',c.src,' maxlength="200"')+
    f5Upgrade(t)+'<p id="f5-error" class="small" role="alert" hidden></p>'+
    '<div class="row"><button type="button" class="btn" data-f5-act="cancel-save" data-key="'+esc(key)+'">Speichern</button>'+(o.cancelTerms?'<button type="button" class="btn ghost" data-f5-act="cancel-clear" data-key="'+esc(key)+'">Bedingungen entfernen</button>':'')+'</div>';
}
function f5PlanSheet(t){
  const o=activeOffer(t),plan=o&&o.payPlan||[];
  let rows='';for(let i=0;i<F5_RATES;i++){const r=plan[i]||{};
    rows+='<div class="row">'+f5Fld('f5-pp-label-'+i,'Bezeichnung','text',r.label,' maxlength="60" placeholder="'+(i===0?'Anzahlung':i===1?'Restzahlung':'Rate')+'"')+f5Fld('f5-pp-due-'+i,'Fällig am','date',r.due)+
      f5Sel('f5-pp-kind-'+i,'Art',[['amount','Betrag (€)'],['pct','Prozent'],['rest','Restbetrag']],r.rest?'rest':r.pct!=null?'pct':'amount')+f5Fld('f5-pp-val-'+i,'Wert','text',r.amount!=null?r.amount:r.pct,' inputmode="decimal"')+'</div>'}
  return '<h2>Zahlungsplan</h2><p class="small muted">'+esc(o.name)+(f5Price(o)==null?' · Preis noch unbekannt: Prozent- und Restraten bleiben ohne Betrag.':' · Preis '+eur(f5Price(o))+'. Der Restbetrag ergibt sich auf den Cent genau.')+' Bereits bezahlt: '+eur(num(o.paid,0))+' (unter „Zahlungen / Tarif bearbeiten“).</p>'+
    rows+'<p class="small muted">Leere Zeilen werden ignoriert. Höchstens ein Restbetrag.</p>'+f5Upgrade(t)+'<p id="f5-error" class="small" role="alert" hidden></p>'+
    '<div class="row"><button type="button" class="btn" data-f5-act="plan-save">Speichern</button>'+(plan.length?'<button type="button" class="btn ghost" data-f5-act="plan-clear">Zahlungsplan entfernen</button>':'')+'</div>';
}
/* Erledigt-Knopf und Rücknahme im Fahrplan (app/ansichten.js departureBlock) */
function f5AckButton(t,id){return f5CanEdit(t)?' <button type="button" class="lnk" data-f5-act="ack" data-id="'+esc(id)+'">Erledigt</button>':''}
function f5DoneList(t,now){
  if(!f5CanEdit(t)||typeof deadlines!=='function')return '';
  const done=deadlines(t,now).filter(d=>d.state==='done');if(!done.length)return '';
  return '<details class="panel"><summary class="small">'+done.length+' erledigt</summary><ul class="plain small">'+done.map(d=>'<li>'+esc(d.label)+' <button type="button" class="lnk" data-f5-act="unack" data-id="'+esc(d.id)+'">wieder offen</button></li>').join('')+'</ul></details>';
}

/* ---------- Ereignisse ---------- */
let f5Pending=null;
function f5Result(r,again){
  if(r.needsConfirm){f5Pending=again;openSheet('<h2>Auf Format 5 umstellen?</h2><div class="note" role="status"><p>'+esc(r.notice)+'</p></div><div class="row"><button type="button" class="btn" data-f5-act="confirm">Umstellen und speichern</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div>');return false}
  if(!r.ok){alertMsg(r.error||'Nicht gespeichert.');return false}
  f5Pending=null;return true;
}
function f5Error(err){const box=$('#f5-error');if(box){box.textContent=err.message;box.hidden=false;if(box.focus)box.focus()}else alertMsg(err.message)}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
  const el=e.target&&e.target.closest&&e.target.closest('[data-f5-act]');if(!el)return;
  const t=cur();if(!t)return;
  const act=el.getAttribute('data-f5-act'),id=el.getAttribute('data-id');
  try{
    const key=el.getAttribute('data-key')||'stay';
    if(act==='cancel-open'){openSheet(f5CancelSheet(t,key));return}
    if(act==='pay-open'){openSheet(f5PaySheet(t));return}
    if(act==='plan-open'){openSheet(f5PlanSheet(t));return}
    let run=null,msg='';
    if(act==='ack'||act==='unack'){const done=act==='ack';run=o=>f5Ack(t,id,done,o);msg=done?'Als erledigt markiert.':'Wieder offen.'}
    else if(act==='cancel-save'){const terms=f5ReadCancel();run=o=>f5SetCancelTerms(t,key,terms,o);msg='Stornobedingungen gespeichert.'}
    else if(act==='cancel-clear'){run=o=>f5SetCancelTerms(t,key,null,o);msg='Stornobedingungen entfernt.'}
    else if(act==='plan-save'){const o0=activeOffer(t),plan=f5ReadPlan(o0&&o0.payPlan);run=o=>f5SetPayPlan(t,plan,o);msg='Zahlungsplan gespeichert.'}
    else if(act==='plan-clear'){run=o=>f5SetPayPlan(t,null,o);msg='Zahlungsplan entfernt.'}
    else if(act==='pay-add'){const inp={on:f5Val('f5-pay-on'),amount:f5Val('f5-pay-amount'),by:f5Val('f5-pay-by'),firstOn:f5Val('f5-pay-first')};run=o=>f5AddPayment(t,inp,o);msg='Zahlung erfasst.'}
    else if(act==='pay-remove'){run=o=>f5RemovePayment(t,id,o);msg='Zahlung entfernt.'}
    else if(act==='gc-save'){const inp={status:f5Val('f5-gc-status'),on:f5Val('f5-gc-on'),note:f5Val('f5-gc-note')};run=o=>f5SetGuestCard(t,inp,o);msg='Gästekarte gespeichert.'}
    else if(act==='confirm'){if(!f5Pending)return;run=f5Pending.run;msg=f5Pending.msg;const r=run({confirmed:true});if(f5Result(r)){closeSheet();render();alertMsg(msg+' Die Reise nutzt jetzt Format 5.')}return}
    if(!run)return;
    const r=run();
    if(f5Result(r,{run,msg})){if($('.sheet'))closeSheet();render();alertMsg(msg)}
  }catch(err){f5Error(err)}
});

/* ---------- Teilzahlungen (M08.2): payments [{id,on,amount,by?}], paid bleibt deren Summe ---------- */
const PAY_ID_RE=/^[a-z][a-z0-9]{3,40}$/;
function f5PayId(list){const have=new Set(list.map(x=>x.id));let n=list.length+1;while(have.has('zahl'+n))n++;return 'zahl'+n}
const f5Cents=x=>Math.round(+x*100);
function f5AddPayment(t,inp,opt){
  const on=String(inp&&inp.on||'').trim(),amount=num(inp&&inp.amount,NaN),by=String(inp&&inp.by||'').trim()||null;
  if(!pd(on))throw new Error('Zahlung: Datum fehlt oder ist ungültig.');
  if(!isFinite(amount)||amount<=0)throw new Error('Zahlung: Betrag größer als 0 angeben.');
  if(by&&!(t.party||[]).some(p=>p.id===by))throw new Error('Zahlung: Person gibt es in dieser Reise nicht.');
  return f5Commit(t,c=>{
    const o=activeOffer(c);if(!o)throw new Error('Keine Unterkunft gewählt.');
    const list=Array.isArray(o.payments)?o.payments.slice():[],before=f5Cents(num(o.paid,0));
    if(!list.length&&before>0){ /* bisher nur als Summe erfasst: als erste Zahlung übernehmen, damit nichts verloren geht */
      const f=String(inp.firstOn||'').trim();if(!pd(f))throw new Error('Datum der bisherigen Zahlung ('+eur(before/100)+') angeben.');
      list.push({id:f5PayId(list),on:f,amount:before/100});
    }
    const e={id:f5PayId(list),on,amount:f5Cents(amount)/100};if(by)e.by=by;list.push(e);
    list.sort((a,b)=>a.on.localeCompare(b.on));
    o.payments=list;o.paid=list.reduce((s,x)=>s+f5Cents(x.amount),0)/100;
  },Object.assign({},opt,{payments:true}));
}
function f5RemovePayment(t,id,opt){
  return f5Commit(t,c=>{
    const o=activeOffer(c);if(!o)throw new Error('Keine Unterkunft gewählt.');
    const list=(o.payments||[]).filter(x=>x.id!==id);if(list.length===(o.payments||[]).length)throw new Error('Zahlung nicht gefunden.');
    o.paid=list.reduce((s,x)=>s+f5Cents(x.amount),0)/100;if(list.length)o.payments=list;else delete o.payments;
  },Object.assign({},opt,{payments:true}));
}
function f5PayList(t,o,edit){
  const list=Array.isArray(o.payments)?o.payments:[],party=t.party||[],who=id=>{const p=party.find(x=>x.id===id);return p?p.name:''};
  return '<h3>Zahlungen</h3>'+(list.length?'<ul class="plain small">'+list.map(p=>'<li>'+esc(fmtLong(pd(p.on)))+' · <b>'+eur(p.amount)+'</b>'+(p.by?' · '+esc(who(p.by)):'')+(edit?' <button type="button" class="lnk" data-f5-act="pay-remove" data-id="'+esc(p.id)+'">Entfernen</button>':'')+'</li>').join('')+'</ul>':'<p class="small muted">'+(num(o.paid,0)>0?'Bisher nur als Summe erfasst: '+eur(num(o.paid,0))+'.':'Noch keine Zahlung erfasst.')+'</p>')+
    (edit?'<button type="button" class="btn ghost sm" data-f5-act="pay-open">Zahlung erfassen</button>':'');
}
function f5PaySheet(t){
  const o=activeOffer(t);if(!o)throw new Error('Keine Unterkunft gewählt.');
  const first=!(o.payments&&o.payments.length)&&num(o.paid,0)>0,party=t.party||[];
  return '<h2>Zahlung erfassen</h2><p class="small muted">'+esc(o.name)+'. Die App bezahlt nichts, sie dokumentiert nur. „Bereits bezahlt“ ist danach immer die Summe dieser Zahlungen.</p>'+
    (first?'<div class="note"><p>Bisher sind '+eur(num(o.paid,0))+' als Summe erfasst. Sie werden als erste Zahlung übernommen.</p><label class="fld"><span>Datum dieser bisherigen Zahlung</span><input id="f5-pay-first" type="date"></label></div>':'')+
    '<div class="row"><label class="fld"><span>Bezahlt am</span><input id="f5-pay-on" type="date" value="'+esc(iso(todayUTC()))+'"></label><label class="fld"><span>Betrag (€)</span><input id="f5-pay-amount" type="text" inputmode="decimal"></label></div>'+
    (party.length?'<label class="fld"><span>Bezahlt von</span><select id="f5-pay-by"><option value="">keine Angabe</option>'+party.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label>':'')+
    f5Upgrade(t)+'<p id="f5-error" class="small" role="alert" hidden></p><div class="row"><button type="button" class="btn" data-f5-act="pay-add">Speichern</button></div>';
}
/* Stornobedingungen-Knopf je gebuchtem Buchungsbuch-Posten (app/zahlungsbuch.js ledgerSection) */
function f5LedgerCancel(t,key){
  if(!V5||!t.ledger||!t.ledger[key])return '';
  const e=t.ledger[key];if(e.status!=='gebucht'||e.cancel)return '';
  const c=e.cancelTerms,price=e.amount==null?null:+e.amount,txt=c?V5.cancelFee(c,price,Date.now()).text:'';
  return (txt?' <small class="muted">Storno heute: '+esc(txt)+'</small>':'')+(f5CanEdit(t)?' <button type="button" class="lnk" data-f5-act="cancel-open" data-key="'+esc(key)+'">'+(c?'Storno ändern':'Stornobedingungen')+'</button>':'');
}

/* ---------- Gästekarte je Unterkunft (M09.3): guestCards-Eintrag, cardConfirmed spiegelt „enthalten“ für die Kostenrechnung ---------- */
const GC_LABEL={enthalten:'enthalten (vom Gastgeber bestätigt)',unbestaetigt:'noch nicht bestätigt',nicht:'nicht enthalten'};
function f5GuestCard(t){const st=stayOf(t);if(!st||!V5)return null;return V5.guestCardStatus(t,Object.assign({offerId:null},f5Ctx(t)))}
function f5SetGuestCard(t,inp,opt){
  const status=String(inp&&inp.status||'');if(!GC_LABEL[status])throw new Error('Gästekarte: Status wählen.');
  const on=String(inp.on||'').trim(),note=String(inp.note||'').trim().slice(0,300);
  if(on&&!pd(on))throw new Error('Gästekarte: Datum ungültig.');
  if(status==='enthalten'&&!on&&!note)throw new Error('Gästekarte: Wann oder wie bestätigt? Datum oder Notiz angeben.');
  return f5Commit(t,c=>{
    const st=stayOf(c);if(!st)throw new Error('Keine Unterkunft gewählt.');const pl=placeOf(c);
    const list=Array.isArray(c.guestCards)?c.guestCards.slice():[];let e=list.find(g=>g.scope&&g.scope.stayId===c.stayId);
    if(!e){const have=new Set(list.map(g=>g.id));let n=1,id='gcard';while(have.has(id))id='gcard'+(++n);e={id,cardId:null,name:String(pl&&pl.card||'Gästekarte').slice(0,80),scope:{stayId:c.stayId},status,evidence:null,persons:null};list.push(e)}
    e.status=status;e.evidence=on||note?{on:on||null,note}:null;
    c.guestCards=list;c.cardConfirmed=status==='enthalten';
  },Object.assign({},opt,{card:true}));
}
function f5GuestCardPanel(t){
  const g=f5GuestCard(t);if(!g)return '';
  const edit=f5CanEdit(t),e=g.entry?(t.guestCards||[]).find(x=>x.id===g.entry):null,ev=e&&e.evidence;
  const head='<p><b>Gästekarte: '+esc(GC_LABEL[g.status]||g.status)+'</b>'+(ev?' <small class="muted">· '+[ev.on?'bestätigt am '+fmtLong(pd(ev.on)):'',ev.note||''].filter(Boolean).map(esc).join(' · ')+'</small>':'')+(g.stale?' <small class="muted">· '+esc(g.stale)+'</small>':'')+'</p>'+
    '<p class="small muted">Nur „enthalten“ senkt die Kosten. Unbestätigte Vorteile stehen getrennt.</p>';
  if(!edit)return '<div data-f5-gc>'+head+'</div>';
  return '<div data-f5-gc>'+head+'<details class="panel"><summary class="small">Status ändern</summary><div class="row">'+
    f5Sel('f5-gc-status','Status',Object.entries(GC_LABEL).map(([k,l])=>[k,l]),g.status)+f5Fld('f5-gc-on','Bestätigt am','date',ev&&ev.on)+'</div>'+
    f5Fld('f5-gc-note','Wie bestätigt (z. B. „Mail Gastgeber“)','text',ev&&ev.note,' maxlength="300"')+f5Upgrade(t)+'<p id="f5-error" class="small" role="alert" hidden></p>'+
    '<button type="button" class="btn sm" data-f5-act="gc-save">Speichern</button></details></div>';
}
