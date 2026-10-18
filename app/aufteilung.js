/* Reiseplaner · P0.2a Mitreisende, Ausgaben unterwegs, Aufteilung.
   Teil 4 von 18 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= P0.2a Mitreisende, Ausgaben unterwegs und Aufteilung (Claude, #8; SCHEMA_V3 §3) =================
   Regeln, Rechnung und Bestätigungs-Controller stehen in v3split.js (window.RPV3S). Hier nur die Anbindung:
   Prüfung einhängen, Buchungsposten mit derselben Plangrundlage wie financeEntry/v3Ref bereitstellen, Kandidaten über
   v3Candidate bilden (Format 3, nie still; Feldtreue; Verpflichtungsschutz) und anzeigen. Einhängepunkte außerhalb dieses
   Blocks: validateV3 (splitValidate), tKosten (splitSection), budgetSection-Rückblick (splitRetro), closeSheet, window.__app.
   Mitreisenden-Namen erscheinen weder im Teilen-Text noch in der Mappe. */
const V3S=typeof window!=='undefined'&&window.RPV3S?window.RPV3S:null;
let splitEditor=null;
function splitValidate(t){
  if(V3S){V3S.validate(t);return}
  /* Ohne Aufteilungsmodul geschützt statt falsch angezeigt (wie bisher „nicht lesbar“) */
  ['party','expenses'].forEach(k=>{const v=t[k];if(v!=null&&!(Array.isArray(v)&&!v.length)&&!(typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).length))throw new Error('Angaben „'+k+'“ kennt diese App-Version noch nicht.')});
  if(Object.keys(t.ledger||{}).some(k=>t.ledger[k]&&t.ledger[k].paidBy!=null)||(t.offers||[]).some(o=>o&&o.paidBy!=null))throw new Error('Zahler-Angaben kennt diese App-Version noch nicht.');
}
/* Buchungsposten für die Aufteilung: Buchungsbuch (auch entfernte Posten mit Geld/Storno/Zahler) und Angebote.
   planCost wie v3Ref: gebuchter Betrag, sonst Planwert, bei offenem Preis unbekannt (null). Ohne Angebot zählt der
   Unterkunfts-Planwert nur für „noch an Anbieter offen“ (Zahlung dafür lässt sich nicht erfassen). */
function splitPostings(t){
  const out=[],lg=t.ledger||{},act=activeOffer(t);
  ledgerRows(t).forEach(r=>{const e=lg[r.key]||{};
    if(r.orphan&&!(num(e.paid,0)>0||e.paidBy!=null||e.cancel||(e.refunds&&e.refunds.length)))return;
    /* Preis offen (r.planOpen) ist nie 0 €; entfernte Posten haben keinen Planwert */
    out.push({key:'ledger:'+r.key,target:{kind:'ledger',key:r.key},label:r.label,entry:e,planCost:r.amount!=null?r.amount:r.planOpen||r.orphan?null:r.plan,detached:!!r.orphan})});
  (t.offers||[]).forEach(o=>{const active=!!act&&act.id===o.id;if(!active&&!o.cancel&&!(num(o.paid,0)>0)&&o.paidBy==null)return;const oa=offerAmounts(o);
    out.push({key:'offer:'+o.id,target:{kind:'offer',id:o.id},label:'Unterkunft: '+o.name+(active?'':o.cancel?' (storniert)':' (nicht ausgewählt)'),entry:o,planCost:active&&!oa.unknown.length?oa.total:null,detached:!active&&!o.cancel})});
  if(!act){const st=cost(t).lines.filter(l=>l.key==='stay');if(st.length)out.push({key:'stay',target:null,label:'Unterkunft (Planwert)',entry:{},planCost:st.reduce((s,l)=>s+l.c,0),detached:false})}
  return out;
}
function splitResult(t,posts){return V3S.settle({party:t.party||[],expenses:t.expenses||[],postings:posts||splitPostings(t)})}
function splitName(t,id){const p=(t.party||[]).find(x=>x.id===id);return p?p.name:'unbekannte Person'}
/* Saldo nie nur über Farbe: Vorzeichen und Wort */
function splitBalText(v){return v>0.004?'<b>+'+V3S.fmt(v)+'</b> (bekommt)':v<-0.004?'<b>−'+V3S.fmt(-v)+'</b> (zahlt)':'<b>'+V3S.fmt(0)+'</b> (kein Ausgleich nötig)'}
function splitSplitText(t,x){
  const party=t.party||[];if(!party.length)return 'Keine Aufteilung (keine Mitreisenden)';
  const s=V3S.splitOf(x,party),names=s.among.map(id=>splitName(t,id));
  if(s.implicit)return 'Gleich auf alle Mitreisenden';
  return s.mode==='shares'?'Nach Gewichten: '+names.map((n,i)=>n+' '+s.weights[i]).join(', '):'Gleich auf '+names.join(', ');
}
function splitExpenseFacts(t,x,r){
  const fl=r.flows.find(f=>f.source==='expense'&&f.id===x.id),sp=V3S.splitOf(x,t.party||[]);
  const shares=fl?fl.shares:sp.among.length?V3S.distribute(Math.round(x.amount*100),sp.weights).map((c,i)=>({id:sp.among[i],amount:c/100})):[];
  return '<dl class="facts"><dt>Datum</dt><dd>'+esc(fmtLong(pd(x.on)))+'</dd><dt>Wofür</dt><dd>'+esc(x.label)+'</dd><dt>Betrag</dt><dd>'+esc(V3S.fmt(x.amount))+'</dd><dt>Kategorie</dt><dd>'+esc(V3S.CATS[x.cat])+'</dd><dt>Bezahlt von</dt><dd>'+(x.paidBy?esc(splitName(t,x.paidBy)):'unbekannt · zählt nicht im Ausgleich')+'</dd><dt>Aufteilung</dt><dd>'+esc(splitSplitText(t,x))+(shares.length?'<br>'+shares.map(s=>esc(splitName(t,s.id)+' '+V3S.fmt(s.amount))).join(' · ')+(fl?'':' (gilt erst mit Zahler)'):'')+'</dd></dl>';
}
function splitSection(t){
  if(!V3S||!t)return '';
  const edit=v3CanEdit(t),has=isV3(t)&&V3S.hasData(t);
  if(!edit&&!has)return '';
  let posts,r;try{posts=splitPostings(t);r=splitResult(t,posts)}catch(e){return '<section class="block" data-split><h2>Mitreisende & Ausgaben</h2><div class="note" role="alert">'+esc(e.message)+'</div></section>'}
  const party=t.party||[],ex=t.expenses||[],nm=id=>esc(splitName(t,id));
  const open=(action,label,target,extra)=>edit?'<button type="button" class="btn ghost sm" data-split-act="open" data-split-action="'+action+'"'+(target?' data-split-target="'+esc(JSON.stringify(target))+'"':'')+(extra||'')+'>'+label+'</button>':'';
  const people='<h3>Mitreisende · '+party.length+' von '+V3S.LIMITS.party+'</h3>'+(party.length?'<ul class="plain">'+party.map(p=>'<li><b>'+esc(p.name)+'</b>'+(edit?' <span class="row">'+open('person-rename','Umbenennen',{id:p.id},' aria-label="'+esc(p.name)+' umbenennen"')+open('person-remove','Entfernen',{id:p.id},' aria-label="'+esc(p.name)+' entfernen"')+'</span>':'')+'</li>').join('')+'</ul>':'<p class="small muted">Noch niemand eingetragen. Ohne Mitreisende werden Ausgaben nur gezählt, nicht aufgeteilt.</p>')+
    open('person-add','+ Person hinzufügen',null,party.length>=V3S.LIMITS.party?' disabled':'');
  const sorted=ex.map((x,i)=>[x,i]).sort((a,b)=>b[0].on.localeCompare(a[0].on)||b[1]-a[1]).map(a=>a[0]);
  const spent='<h3>Ausgaben unterwegs · '+ex.length+'</h3><p class="small muted">Nur zusätzliche Ausgaben, die nicht im Plan stehen (z. B. Essen, Einkauf, Parken). Für die Unterkunft und Posten aus „Buchungen & Zahlungen“ die Zahlung dort eintragen und hier unten den Zahler wählen, sonst zählt sie doppelt.</p>'+
    (sorted.length?'<div class="stack">'+sorted.slice(0,100).map(x=>'<div class="panel" data-split-expense="'+esc(x.id)+'"><div class="between"><b>'+esc(x.label)+'</b><b class="num">'+esc(V3S.fmt(x.amount))+'</b></div><p class="small">'+esc(fmtLong(pd(x.on)))+' · '+esc(V3S.CATS[x.cat])+' · '+(x.paidBy?'bezahlt von '+nm(x.paidBy):'<b>Zahler fehlt</b>')+'<br>'+esc(splitSplitText(t,x))+'</p>'+(edit?'<div class="row">'+open('expense-edit','Bearbeiten',{id:x.id},' aria-label="'+esc(x.label)+' bearbeiten"')+open('expense-remove','Entfernen',{id:x.id},' aria-label="'+esc(x.label)+' entfernen"')+'</div>':'')+'</div>').join('')+'</div>'+
      (sorted.length>100?'<p class="small muted">'+(sorted.length-100)+' ältere Ausgaben werden hier nicht einzeln gezeigt. Sie zählen in Summen und Ausgleich.</p>':''):'<p class="small muted">Noch keine Ausgaben erfasst.</p>')+
    open('expense-add','+ Ausgabe erfassen',null,ex.length>=V3S.LIMITS.expenses?' disabled':'');
  const pay=posts.filter(p=>p.target&&(num(p.entry.paid,0)>0||p.entry.paidBy!=null));
  const payers='<h3>Wer hat die Buchungen bezahlt?</h3>'+(pay.length?'<ul class="plain">'+pay.map(p=>'<li><b>'+esc(p.label)+'</b> · netto bezahlt '+esc(V3S.fmt(V3.cancelMath(p.entry,p.planCost).netPaid))+' · '+(p.entry.paidBy?'bezahlt von '+nm(p.entry.paidBy):'<b>Zahler fehlt</b>')+(edit&&party.length?' '+open('payer','Zahler wählen',p.target,' aria-label="Zahler für '+esc(p.label)+' wählen"'):'')+'</li>').join('')+'</ul>':'<p class="small muted">Noch keine Zahlungen im Buchungsbuch oder beim Unterkunftsangebot erfasst.</p>')+
    '<p class="small muted">Je Posten ein Zahler. Haben mehrere Personen Teile davon bezahlt, kann diese Version das noch nicht abbilden.</p>';
  const balance=party.length?'<h3>Ausgleich</h3><ul class="plain" data-split-balance>'+r.persons.map(x=>'<li><b>'+esc(x.name)+'</b>: bezahlt '+esc(V3S.fmt(x.paid))+' · Anteil '+esc(V3S.fmt(x.share))+' · Saldo '+splitBalText(x.balance)+'</li>').join('')+'</ul>'+
    (r.transfers.length?'<p><b>Vorschlag zum Ausgleich</b></p><ul class="plain" data-split-transfers>'+r.transfers.map(x=>'<li>'+nm(x.from)+' zahlt an '+nm(x.to)+': <b>'+esc(V3S.fmt(x.amount))+'</b></li>').join('')+'</ul>':'<p class="small">Nach den erfassten Zahlungen ist keine Ausgleichszahlung nötig.</p>')+
    '<p class="small muted">Vorschlag mit möglichst wenig Überweisungen, er wird nicht gespeichert. Überweisungen, die ihr untereinander schon gemacht habt, kennt die App nicht. Aufgeteilt wird nur tatsächlich bezahltes Geld, nach erhaltenen Erstattungen.</p>':'';
  const notes=[];
  if(r.unassigned.length)notes.push(r.unassigned.length+' Zahlung(en) ohne Zahler, zusammen '+V3S.fmt(r.unassignedAmount)+': zählen in den Summen, aber nicht im Ausgleich'+(party.length?'':' (noch keine Mitreisenden)')+'.');
  if(r.open.provider>0.004||r.open.unknown.length)notes.push('Noch an Anbieter offen, Aufteilung erst bei Zahlung: '+V3S.fmt(r.open.provider)+(r.open.unknown.length?' und '+r.open.unknown.length+' Posten mit unbekanntem Betrag':'')+' (Planwerte und gebuchte Beträge).');
  if(r.open.refunds>0.004)notes.push('Erwartete Erstattungen, noch nicht erhalten: '+V3S.fmt(r.open.refunds)+'. Aufgeteilt wird erst, wenn das Geld da ist.');
  if(r.detached.length)notes.push(r.detached.length+' Zahlung(en) für nicht mehr geplante Posten: zählen mit Zahler im Ausgleich, offene Beträge bitte separat klären.');
  const f=financeSummary(t);
  const retro=ex.length||r.netPaidTotal>0.004?'<h3>Plan, gebucht und zusätzlich ausgegeben</h3><div class="kpis" data-split-retro><div class="kpi"><small>Plan</small><b class="num">'+eur(cost(t).total)+'</b><small>Planwerte und erfasste Buchungsbeträge</small></div><div class="kpi"><small>Bezahlt</small><b class="num">'+esc(V3S.fmt(r.netPaidTotal))+'</b><small>netto nach Erstattungen · gebucht '+eur(f.booked)+'</small></div><div class="kpi"><small>Zusätzlich ausgegeben</small><b class="num">'+esc(V3S.fmt(r.extraSpent))+'</b><small>Ausgaben unterwegs, nicht im Plan</small></div></div><p class="small muted">Getrennt gezeigt und nicht verrechnet: Zusätzliche Ausgaben ersetzen keine Planwerte, etwa für geschätzte Verpflegung.</p>':'';
  return '<section class="block" data-split><h2>Mitreisende & Ausgaben</h2><p class="small muted">Wer reist mit, wer hat was bezahlt und wer bekommt am Ende wie viel. Die Namen stehen nur in der Reise'+(Store.isAccount()?' und sind für alle Mitglieder sichtbar':'')+', im Teilen-Text erscheinen sie nicht.</p>'+
    (!edit?'<p class="note small">Nur ansehen: Änderungen sind hier gerade nicht möglich.</p>':!isV3(t)?'<p class="small">Mit der ersten Person oder Ausgabe wird die Reise auf Format 3 umgestellt. Die Vorschau zeigt das vorher an.</p>':'')+
    people+spent+payers+balance+(notes.length?'<ul class="plain small" data-split-notes>'+notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>':'')+retro+'</section>';
}
/* Rückblick nach Reiseende (budgetSection): Plan, gebucht/bezahlt und zusätzlich ausgegeben getrennt */
function splitRetro(t){
  if(!V3S||!isV3(t)||!((t.expenses||[]).length||(t.party||[]).length))return '';
  let r;try{r=splitResult(t)}catch(e){return ''}
  return '<p class="small" data-split-retro>Getrennt betrachtet: Plan '+eur(cost(t).total)+' · gebucht '+eur(financeSummary(t).booked)+', bezahlt netto '+esc(V3S.fmt(r.netPaidTotal))+' · zusätzlich unterwegs ausgegeben '+esc(V3S.fmt(r.extraSpent))+' (nicht im Plan enthalten, nicht mit Planwerten verrechnet).</p>';
}
function splitCheck(t,action,target){
  if(!V3S)throw new Error('Die Aufteilung konnte nicht geladen werden. Bitte neu laden.');
  const id=target&&target.id;
  if((action==='person-rename'||action==='person-remove')&&!(t.party||[]).some(p=>p.id===id))throw new Error('Diese Person gibt es in der Reise nicht mehr.');
  if((action==='expense-edit'||action==='expense-remove')&&!(t.expenses||[]).some(x=>x.id===id))throw new Error('Diese Ausgabe gibt es nicht mehr.');
  if(action==='payer')v3Ref(t,target);
}
/* Kandidat: Quelle bleibt unverändert; v3Candidate setzt Format 3, prüft alles (validateExtras) und den Verpflichtungsschutz.
   Beim Zahler ist nur paidBy des Zielpostens gewollt geändert (ref.restore), alle anderen Angaben bleiben geschützt. */
function splitCandidate(t,action,target,f,newId){
  if(!V3S)throw new Error('Die Aufteilung konnte nicht geladen werden. Bitte neu laden.');
  f=f||{};const a=target||{};
  if(action==='payer'){
    const r=v3Ref(t,target),pid=String(f.paidBy==null?'':f.paidBy).trim()||null;
    return v3Candidate(t,c=>{const e=r.get(c);V3S.setPayer(e,pid,c.party||[]);
      if(a.kind==='ledger'&&!pid&&e.status==='offen'&&e.amount==null&&!num(e.paid,0)&&!e.due&&Object.keys(e).every(k=>['status','amount','paid','due'].includes(k)))delete c.ledger[a.key]},r);
  }
  return v3Candidate(t,c=>{
    if(action==='person-add')V3S.mutate(c,'person-add',{id:newId,name:f.name});
    else if(action==='person-rename'||action==='person-remove')V3S.mutate(c,action,{id:a.id,name:f.name});
    else if(action==='expense-add'||action==='expense-edit')V3S.mutate(c,'expense-put',{add:action==='expense-add',expense:V3S.readExpense(f,c.party||[],{id:action==='expense-add'?newId:a.id})});
    else if(action==='expense-remove')V3S.mutate(c,'expense-remove',{id:a.id});
    else throw new Error('Unbekannte Aktion.');
  });
}
function splitPreview(t,next,s){
  const before=splitResult(t),after=splitResult(next),a=s.target||{},nm=(x,id)=>esc(splitName(x,id));let what='';
  if(s.action==='person-add')what='<p>Neue Person: <b>'+nm(next,s.newId)+'</b></p>';
  else if(s.action==='person-rename')what='<p><b>'+nm(t,a.id)+'</b> heißt danach <b>'+nm(next,a.id)+'</b>. Zahlungen und Anteile bleiben bei der Person.</p>';
  else if(s.action==='person-remove')what='<p><b>'+nm(t,a.id)+'</b> wird aus den Mitreisenden entfernt.</p>';
  else if(s.action==='payer'){const key=JSON.stringify(a),p=splitPostings(t).find(x=>JSON.stringify(x.target)===key),q=splitPostings(next).find(x=>JSON.stringify(x.target)===key)||{entry:(()=>{try{return v3Ref(next,a).entry}catch(e){return null}})()||{}}; /* Zahler danach immer aus dem Kandidaten */
    what='<p><b>'+esc(p.label)+'</b></p><dl class="facts"><dt>Netto bezahlt</dt><dd>'+esc(V3S.fmt(V3.cancelMath(p.entry,p.planCost).netPaid))+'</dd><dt>Zahler bisher</dt><dd>'+(p.entry.paidBy?nm(t,p.entry.paidBy):'keine Angabe')+'</dd><dt>Zahler danach</dt><dd>'+(q.entry.paidBy?nm(next,q.entry.paidBy):'keine Angabe · zählt nicht im Ausgleich')+'</dd></dl>'}
  else{const id=s.action==='expense-add'?s.newId:a.id,old=(t.expenses||[]).find(x=>x.id===id),neu=(next.expenses||[]).find(x=>x.id===id);
    what=old&&neu?'<h3>Bisher</h3>'+splitExpenseFacts(t,old,before)+'<h3>Danach</h3>'+splitExpenseFacts(next,neu,after):neu?splitExpenseFacts(next,neu,after):'<p>Entfernt wird:</p>'+splitExpenseFacts(t,old,before)}
  const ids=[...new Set([].concat(t.party||[],next.party||[]).map(p=>p.id))],bal=(r,id)=>{const x=r.persons.find(p=>p.id===id);return x?splitBalText(x.balance):'–'};
  const table=ids.length?'<div class="tbl-wrap"><table><caption class="small muted">Saldo je Person: bezahlt minus Anteil</caption><thead><tr><th scope="col">Person</th><th scope="col">Bisher</th><th scope="col">Danach</th></tr></thead><tbody>'+ids.map(id=>'<tr><th scope="row">'+nm((next.party||[]).some(p=>p.id===id)?next:t,id)+'</th><td>'+bal(before,id)+'</td><td>'+bal(after,id)+'</td></tr>').join('')+'</tbody></table></div>':'';
  const transfers=after.transfers.length?'<p class="small"><b>Ausgleich danach:</b> '+after.transfers.map(x=>nm(next,x.from)+' zahlt an '+nm(next,x.to)+' '+esc(V3S.fmt(x.amount))).join(' · ')+'</p>':'';
  const notice=(t.schemaVersion!==3&&next.schemaVersion===3?'<div class="note" role="status"><b>Die Reise wird dabei auf Format 3 umgestellt.</b><p>Das bleibt dauerhaft so.</p></div>':'')+
    (!V3S.hasData(t)&&V3S.hasData(next)?'<p class="small">Mitreisende und Ausgaben kennt erst diese App-Version. Ältere Versionen auf anderen Geräten zeigen die Reise als nicht lesbar an und ändern sie nicht, bis die App dort neu geladen ist.</p>':'');
  return '<section data-split-preview><h2>Änderung prüfen</h2>'+what+table+transfers+notice+'<p class="small muted">Nur euer Reiseplan ändert sich. Es wird keine Überweisung, Buchung oder Zahlung ausgelöst.</p></section>';
}
function splitNewId(action,t){const used=new Set([].concat(t.party||[],t.expenses||[]).map(x=>x.id));let id;do{id=uid(action.startsWith('person')?'pa':'ex')}while(used.has(id));return id}
function splitController(){
  if(!V3S)throw new Error('Die Aufteilung konnte nicht geladen werden. Bitte neu laden.');
  if(!splitEditor)splitEditor=V3S.createEditor({candidate:splitCandidate,preview:splitPreview,check:splitCheck},{getTrip:id=>Store.get(id),scope:()=>Store.scope,enabled:()=>V3_EDIT,canEdit:v3CanEdit,newId:splitNewId,put:t=>Store.put(t)});
  return splitEditor;
}
function splitDefaultDate(t){const ph=tripPhase(t);if(ph&&ph.phase==='unterwegs')return iso(todayUTC());return t.dateMode==='fix'&&pd(t.start)?t.start:iso(todayUTC())}
function splitForm(t,s){
  const party=t.party||[],a=s.target||{},inp=(n,l,v,x)=>'<label class="fld"><span>'+esc(l)+'</span><input name="'+esc(n)+'" value="'+esc(v==null?'':v)+'" '+(x||'')+'></label>';
  const check='<button type="button" class="btn" data-split-act="preview">Änderung prüfen</button>',person=()=>{const p=party.find(x=>x.id===a.id);if(!p)throw new Error('Diese Person gibt es in der Reise nicht mehr.');return p};
  if(s.action==='person-add')return '<h2>Person hinzufügen</h2><div class="form">'+inp('name','Name oder Spitzname','','type="text" maxlength="40" autocomplete="off" required')+'</div><p class="small muted">Nur ein Name für die Aufteilung, kein Konto und keine E-Mail.'+(Store.isAccount()?' Bei geteilten Reisen sehen alle Mitglieder den Namen.':'')+'</p>'+check;
  if(s.action==='person-rename'){const p=person();return '<h2>Person umbenennen</h2><div class="form">'+inp('name','Neuer Name',p.name,'type="text" maxlength="40" autocomplete="off" required')+'</div><p class="small muted">Zahlungen und Anteile bleiben bei der Person.</p>'+check}
  if(s.action==='person-remove'){const p=person(),u=V3S.usesText(V3S.personUses(t,p.id));
    return '<h2>'+esc(p.name)+' entfernen?</h2>'+(u.length?'<div class="note" role="status"><b>Entfernen nicht möglich</b><p>'+esc(p.name+' '+u.join(', '))+'. Sonst würden sich Anteile der anderen verschieben. Umbenennen ist möglich.</p></div>':'<p>'+esc(p.name)+' hat nichts bezahlt und ist an keiner Ausgabe beteiligt.</p>'+check)}
  if(s.action==='expense-remove'){const x=(t.expenses||[]).find(e=>e.id===a.id);if(!x)throw new Error('Diese Ausgabe gibt es nicht mehr.');return '<h2>Ausgabe entfernen?</h2>'+splitExpenseFacts(t,x,splitResult(t))+check}
  if(s.action==='payer'){const key=JSON.stringify(a),p=splitPostings(t).find(x=>JSON.stringify(x.target)===key);if(!p)throw new Error('Posten nicht gefunden.');const m=V3.cancelMath(p.entry,p.planCost);
    return '<h2>Zahler wählen</h2><p><b>'+esc(p.label)+'</b></p><p class="small">Brutto bezahlt '+esc(V3S.fmt(num(p.entry.paid,0)))+' · zurückerhalten '+esc(V3S.fmt(m.refundsReceived))+' · <b>netto '+esc(V3S.fmt(m.netPaid))+'</b>. Der Nettobetrag wird gleich auf alle Mitreisenden verteilt.</p><div class="form"><label class="fld"><span>Bezahlt von</span><select name="paidBy"><option value="">Keine Angabe</option>'+party.map(x=>'<option value="'+esc(x.id)+'"'+(p.entry.paidBy===x.id?' selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label></div><p class="small muted">Je Posten ein Zahler. Betrag, Status und Zahlungen bleiben unverändert.</p>'+check}
  const x=s.action==='expense-edit'?(t.expenses||[]).find(e=>e.id===a.id):null;if(s.action==='expense-edit'&&!x)throw new Error('Diese Ausgabe gibt es nicht mehr.');
  const sp=x?V3S.splitOf(x,party):{among:party.map(p=>p.id),weights:party.map(()=>1)},mode=x&&x.split&&x.split.mode==='shares'?'shares':'equal';
  return '<h2>'+(x?'Ausgabe bearbeiten':'Ausgabe erfassen')+'</h2><div class="form">'+inp('on','Datum',x?x.on:splitDefaultDate(t),'type="date" required')+inp('label','Wofür',x?x.label:'','type="text" maxlength="80" autocomplete="off" required placeholder="z. B. Abendessen"')+
    inp('amount','Betrag · €',x?String(x.amount).replace('.',','):'','type="text" inputmode="decimal" maxlength="14" autocomplete="off" required placeholder="z. B. 12,50"')+
    '<label class="fld"><span>Kategorie</span><select name="cat">'+Object.entries(V3S.CATS).map(([k,l])=>'<option value="'+k+'"'+((x?x.cat:'essen')===k?' selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>'+
    '<label class="fld"><span>Bezahlt von</span><select name="paidBy"><option value="">Noch offen / unbekannt</option>'+party.map(p=>'<option value="'+esc(p.id)+'"'+(x&&x.paidBy===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label></div>'+
    (party.length?'<fieldset class="panel" style="margin:0 0 12px"><legend><b>Aufteilung</b></legend><label class="fld"><span>Art</span><select name="mode"><option value="equal"'+(mode==='equal'?' selected':'')+'>Gleich auf die Ausgewählten</option><option value="shares"'+(mode==='shares'?' selected':'')+'>Nach Gewichten (z. B. 2 : 1)</option></select></label>'+
      party.map(p=>{const i=sp.among.indexOf(p.id);return '<div class="row"><label class="small"><input type="checkbox" name="in.'+esc(p.id)+'"'+(i>=0?' checked':'')+'> '+esc(p.name)+' ist beteiligt</label><label class="fld" data-split-weight'+(mode==='shares'?'':' hidden')+'><span>Gewicht '+esc(p.name)+'</span><input name="w.'+esc(p.id)+'" type="text" inputmode="numeric" maxlength="3" autocomplete="off" value="'+(i>=0?sp.weights[i]:1)+'"></label></div>'}).join('')+
      '<p class="small muted">Gewichte sind ganze Zahlen von 1 bis 100. Restcents gehen an die größten Reste, bei Gleichstand an die zuerst Genannten.</p></fieldset>':'<p class="small muted">Ohne Mitreisende wird die Ausgabe nur gezählt, nicht aufgeteilt.</p>')+
    '<p class="small muted">Nur zusätzliche Ausgaben mit bekanntem Betrag, nicht die Unterkunft oder Posten aus „Buchungen & Zahlungen“ (sonst doppelt).</p>'+check;
}
function splitSheet(){
  const s=splitController().state();if(!s)return;const t=Store.get(s.tripId);if(!t)return;
  const rm=/-remove$/.test(s.action),body=s.phase==='preview'?s.preview+'<div class="row"><button type="button" class="btn'+(rm?' warn':'')+'" data-split-act="apply" data-token="'+s.token+'">'+(rm?'Ja, entfernen':'Im Reiseplan speichern')+'</button><button type="button" class="btn ghost" data-split-act="back">Weiter bearbeiten</button></div>':splitForm(t,s);
  openSheet('<div data-split-sheet><p class="eyebrow">'+(s.phase==='preview'?'2 · Prüfen & bestätigen':'1 · Angaben eintragen')+'</p><div id="split-error" class="note" role="alert" tabindex="-1" hidden></div>'+body+'</div>');
  if(s.phase!=='preview'){document.querySelectorAll('[data-split-sheet] [name]').forEach(el=>{if(!Object.hasOwn(s.fields,el.name))return;if(el.type==='checkbox')el.checked=!!s.fields[el.name];else el.value=s.fields[el.name]});splitModeToggle()}
}
function splitFields(){const f={};document.querySelectorAll('[data-split-sheet] [name]').forEach(el=>{f[el.name]=el.type==='checkbox'?el.checked:el.value});return f}
function splitModeToggle(){const m=document.querySelector('[data-split-sheet] [name="mode"]');if(m)document.querySelectorAll('[data-split-sheet] [data-split-weight]').forEach(n=>{n.hidden=m.value!=='shares'})}
document.addEventListener('change',e=>{const el=e.target;if(el&&el.closest&&el.name==='mode'&&el.closest('[data-split-sheet]'))splitModeToggle()});
document.addEventListener('click',e=>{
  const b=e.target&&e.target.closest?e.target.closest('[data-split-act]'):null;if(!b)return;
  const act=b.getAttribute('data-split-act');
  try{
    if(act==='open'){const t=cur();if(!t)throw new Error('Reise nicht mehr geöffnet.');splitController().begin(t.id,b.getAttribute('data-split-action'),JSON.parse(b.getAttribute('data-split-target')||'null'));splitSheet();return}
    if(!b.closest('[data-split-sheet]'))return;
    const ed=splitController();
    if(act==='apply'){ed.apply(Number(b.getAttribute('data-token')));closeSheet();render();alertMsg('Im Reiseplan gespeichert.');return}
    if(act==='back')ed.back();else if(act==='preview')ed.preview(splitFields());else return;
    splitSheet();
  }catch(err){const box=$('#split-error');if(box){box.textContent=err.message;box.hidden=false;box.focus()}else alertMsg(err.message)}
});
/* ================= Ende P0.2a ================= */
