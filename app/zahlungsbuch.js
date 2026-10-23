/* Reiseplaner · Zahlungsbuch.
   Teil 9 von 25 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Zahlungsbuch (#5) =================
   t.ledger[key] = {status:'offen'|'angefragt'|'gebucht', amount:Zahl|null, paid:Zahl, due:'JJJJ-MM-TT'|''}
   Schlüssel wie die Kostenzeilen: anreise, kurbeitrag, kurs, verleih, skipass, act:<id>, xc:<id>.
   Die Unterkunft läuft über das Angebotsmodell (activeOffer) und wird hier nur gelesen. */
const LEDGER_STATUS={offen:'offen',angefragt:'angefragt',gebucht:'gebucht'};
const LEDGER_KEY=/^(anreise|kurbeitrag|kurs|verleih|skipass|act:[A-Za-z0-9_-]{1,60}|xc:[A-Za-z0-9_-]{1,60}|tr:[a-z][a-z0-9]{3,40}(:[a-z][a-z0-9]{3,40})?)$/;
function validateLedger(l){
  if(l==null)return;
  if(typeof l!=='object'||Array.isArray(l))throw new Error('Zahlungsbuch ungültig.');
  const keys=Object.keys(l);if(keys.length>500)throw new Error('Zahlungsbuch zu groß.');
  keys.forEach(k=>{const e=l[k];
    if(!LEDGER_KEY.test(k)||!e||typeof e!=='object')throw new Error('Zahlungsbuch-Eintrag ungültig.');
    if(!LEDGER_STATUS[e.status])throw new Error('Buchungsstatus ungültig.');
    if(e.amount!=null&&(!Number.isFinite(+e.amount)||+e.amount<0||+e.amount>1e9))throw new Error('Buchungsbetrag ungültig.');
    if(!Number.isFinite(+e.paid)||+e.paid<0||+e.paid>1e9)throw new Error('Bezahlter Betrag ungültig.');
    if(e.amount!=null&&+e.paid>+e.amount)throw new Error('Bezahlt übersteigt den Buchungsbetrag.');
    if(e.due&&!pd(e.due))throw new Error('Fälligkeitsdatum ungültig.');
  });
}
/* Preis offen ist nie 0 €: offene Kostenzeile oder eigene Unternehmung mit offenem Preis (Review R2) */
function keyPriceOpen(t,key,lines){if(lines.some(l=>l.key===key&&l.open))return true;const ca=key.indexOf('act:')===0&&(t.customActs||[]).find(a=>'act:'+a.id===key);return !!(ca&&ca.costOpen&&!num(ca.cost,0))}
/* Zeilen des Zahlungsbuchs: Plan (ohne Buchungsbeträge), gültiger Betrag, bezahlt, offen. Einträge zu entfernten Posten bleiben sichtbar. */
function ledgerRows(t){
  const plan=cost(Object.assign({},t,{ledger:{}})).lines,lg=t.ledger||{},rows=[],seen=new Set();
  plan.forEach(l=>{if(!l.key||l.key==='stay'||seen.has(l.key))return;seen.add(l.key);
    const planned=plan.filter(x=>x.key===l.key).reduce((x,y)=>x+y.c,0),e=lg[l.key]||{},amount=e.amount!=null?+e.amount:null,paid=num(e.paid,0),openPrice=keyPriceOpen(t,l.key,plan);
    let c=amount!=null?amount:planned;const row={key:l.key,planOpen:openPrice,label:l.key.startsWith('act:')?((actOf(t,l.key.slice(4))||{}).t||l.t):l.t,cat:l.cat,plan:planned,amount,status:e.status||'offen',paid,due:e.due||'',orphan:false};
    /* Format 3: Storno/Erstattungen je Posten; ohne bekannten Preis keine Überzahlung ableiten */
    if(v3Money(t,e)){const m=V3.cancelMath(e,amount!=null?amount:openPrice?null:planned);Object.assign(row,{cancelled:m.cancelled,unknown:m.unknown,netPaid:m.netPaid,refundsReceived:m.refundsReceived,refundOpen:m.refundOpen||0,feeOpen:m.feeOpen||0});c=m.cost==null?0:m.cost;row.open=m.unknown?0:(m.open||0)}
    else if(openPrice&&amount==null){row.unknown=true;row.open=0} /* ohne Preis kein „Vollständig bezahlt“ */
    else row.open=Math.max(0,c-paid);
    row.cost=c;rows.push(row);
  });
  Object.keys(lg).forEach(k=>{if(seen.has(k))return;const e=lg[k];let c=e.amount!=null?+e.amount:0;
    const row={key:k,label:k.startsWith('act:')?((actOf(t,k.slice(4))||{}).t||'Entfernte Unternehmung'):k.startsWith('xc:')?'Entfernter Kostenposten':k.startsWith('tr:')?'Entfernter Anreise-Abschnitt':k,cat:'eigen',plan:0,amount:e.amount!=null?+e.amount:null,status:e.status,paid:num(e.paid,0),due:e.due||'',orphan:true};
    if(v3Money(t,e)){const m=V3.cancelMath(e,e.amount!=null?+e.amount:null);Object.assign(row,{cancelled:m.cancelled,unknown:m.unknown,netPaid:m.netPaid,refundsReceived:m.refundsReceived,refundOpen:m.refundOpen||0,feeOpen:m.feeOpen||0});c=m.cost==null?0:m.cost;row.open=m.unknown?0:(m.open||0)}
    else row.open=Math.max(0,c-num(e.paid,0));
    row.cost=c;rows.push(row)});
  return rows;
}
function financeSummary(t){
  const rows=ledgerRows(t),o=activeOffer(t),oa=o?offerAmounts(o):null,c=cost(t);
  const sm=o&&v3Money(t,o)?V3.cancelMath(o,oa.total):null;
  const stay=o?{label:o.name,cost:sm&&sm.cancelled?(sm.cost==null?0:sm.cost):oa.total,paid:num(o.paid,0),booked:!!o.booked,deposit:num(o.deposit,0),unknown:oa.unknown.length,netPaid:sm?sm.netPaid:num(o.paid,0),refundOpen:sm?sm.refundOpen||0:0,cancelled:!!(sm&&sm.cancelled),unknownFee:!!(sm&&sm.unknown)}:null;
  const live=rows.filter(r=>!r.orphan);
  const paid=rows.reduce((x,r)=>x+r.paid,0)+(stay?stay.paid:0);
  const activePaid=live.reduce((x,r)=>x+r.paid,0)+(stay?stay.paid:0);
  const detachedPaid=paid-activePaid;
  const booked=live.filter(r=>r.status==='gebucht').reduce((x,r)=>x+r.cost,0)+(stay&&stay.booked?stay.cost:0);
  const today=iso(todayUTC());
  const due=rows.filter(r=>r.due&&r.open>0.005).sort((a,b)=>a.due.localeCompare(b.due)).map(r=>Object.assign({overdue:r.due<today,days:Math.round((pd(r.due)-todayUTC())/864e5)},r));
  /* Format 3: offener Betrag mit Nettozahlungen; Erstattungen und Gebühren getrennt, ohne Verrechnung (SCHEMA_V3 §1) */
  const net=r=>r.netPaid!=null?r.netPaid:r.paid;
  const activeNet=live.reduce((x,r)=>x+net(r),0)+(stay?stay.netPaid:0);
  const otherOffers=isV3(t)?(t.offers||[]).filter(x=>x.cancel&&!(o&&o.id===x.id)).map(x=>V3.cancelMath(x,null)):[];
  const v3=isV3(t)?{refundOpen:rows.reduce((x,r)=>x+(r.refundOpen||0),0)+(stay?stay.refundOpen:0)+otherOffers.reduce((x,m)=>x+(m.refundOpen||0),0),
    feeOpen:rows.reduce((x,r)=>x+(r.feeOpen||0),0)+otherOffers.reduce((x,m)=>x+(m.feeOpen||0),0),
    refundsReceived:rows.reduce((x,r)=>x+(r.refundsReceived||0),0),unknownFee:rows.filter(r=>r.unknown&&r.cancelled).length+(stay&&stay.unknownFee?1:0)+otherOffers.filter(m=>m.unknown).length}:null;
  return {rows,stay,total:c.total,paid,activePaid,detachedPaid,booked,open:Math.max(0,c.total-activeNet),deposit:stay?stay.deposit:0,due,orphanPaid:rows.filter(r=>r.orphan&&r.paid>0),v3};
}
function setLedger(t,key,field,value){
  if(!LEDGER_KEY.test(key))throw new Error('Unbekannter Posten.');
  const l=Object.assign({},t.ledger||{}),e=Object.assign({status:'offen',amount:null,paid:0,due:''},l[key]||{});
  if(field==='status'){if(!LEDGER_STATUS[value])throw new Error('Buchungsstatus ungültig.');e.status=value}
  else if(field==='amount'){e.amount=value===''||value==null?null:Math.round(num(value,-1)*100)/100;if(e.amount!=null&&e.amount<0)throw new Error('Betrag darf nicht negativ sein.')}
  else if(field==='paid'){e.paid=value===''||value==null?0:Math.round(num(value,-1)*100)/100;if(e.paid<0)throw new Error('Betrag darf nicht negativ sein.')}
  else if(field==='due'){if(value&&!pd(value))throw new Error('Datum ungültig.');e.due=value||''}
  else throw new Error('Unbekanntes Feld.');
  const row=ledgerRows(Object.assign({},t,{ledger:Object.assign({},l,{[key]:e})})).find(r=>r.key===key);
  /* Erstattungen sind Teil des Bezahlten: Bezahlt darf nicht darunter sinken (sonst ungültige Reise, Review R2) */
  const refC=(e.refunds||[]).reduce((s,r)=>s+Math.round((+r.amount||0)*100),0);
  if(field==='paid'&&Math.round(e.paid*100)<refC)throw new Error('Bezahlt ('+eur(e.paid)+') ist niedriger als die bereits erfassten Erstattungen ('+eur(refC/100)+'). Bitte zuerst die Erstattungen anpassen.');
  /* Obergrenze nur beim Ändern von Bezahlt oder Betrag prüfen. Erstattetes zählt nicht gegen den Betrag (netto ≤ Betrag);
     storniert zählt der Betrag vor dem Storno (bzw. eine höhere Gebühr), nicht nur die Gebühr */
  if(row&&(field==='paid'||field==='amount')){
    const pre=row.amount!=null?row.amount:row.planOpen||row.orphan?null:row.plan,fee=e.cancel&&e.cancel.fee!=null?+e.cancel.fee:0;
    const lim=row.cancelled?(pre==null?null:Math.max(pre,fee)+refC/100):row.cost+refC/100;
    if(lim!=null&&e.paid>lim+0.005)throw new Error('Bezahlt ('+eur(e.paid)+') ist höher als der Betrag des Postens ('+eur(lim)+'). Bitte zuerst den gebuchten Betrag eintragen.');
  }
  /* Nur wirklich leere Einträge entfernen: weitere Felder (künftig z. B. Erstattungen/Storno, SCHEMA_V3 §5 Feldtreue) bleiben erhalten */
  const extra=Object.keys(e).some(k=>!['status','amount','paid','due'].includes(k));
  if(e.status==='offen'&&e.amount==null&&!e.paid&&!e.due&&!extra)delete l[key];else l[key]=e;
  validateLedger(l);
  /* Ganze Reise als Kandidat prüfen, bevor gespeichert wird: eine ungültige Reise würde nach dem Neuladen den Speicherbereich sperren */
  validateExtras(Object.assign({},t,{ledger:l,schemaVersion:t.schemaVersion==null?2:t.schemaVersion}));
  t.ledger=l;return t;
}
function ledgerBalanceText(r){
 if(r.unknown)return '<b>'+(r.cancelled?'Stornogebühr unbekannt':'Betrag unbekannt')+' · noch nicht abschließend prüfbar</b>';
 if(r.open>0.005)return 'Noch offen: <b>'+eur(r.open)+'</b>';
 if(r.refundOpen>0.005)return 'Erstattung noch offen: <b>'+eur(r.refundOpen)+'</b>';
 return '<b>'+(r.cancelled?'Stornoposten ausgeglichen':'Vollständig bezahlt')+'</b>';
}
function ledgerSection(t){
  const f=financeSummary(t);
  const row=r=>'<div class="panel ledger"><div class="between"><b>'+esc(r.label)+'</b><span class="small muted">Plan '+eur(r.plan)+(r.orphan?' · <b>nicht mehr im Plan</b>':'')+'</span></div>'+
   '<div class="form"><label class="fld"><span>Status</span><select data-ledger="'+esc(r.key)+'" data-ledger-f="status">'+Object.keys(LEDGER_STATUS).map(k=>'<option value="'+k+'"'+(r.status===k?' selected':'')+'>'+LEDGER_STATUS[k]+'</option>').join('')+'</select></label>'+
   '<label class="fld"><span>Gebuchter Betrag (€)</span><input type="number" min="0" step="0.01" inputmode="decimal" data-ledger="'+esc(r.key)+'" data-ledger-f="amount" value="'+(r.amount!=null?r.amount:'')+'" placeholder="Plan '+Math.round(r.plan)+'"></label>'+
   '<label class="fld"><span>Bezahlt (€)</span><input type="number" min="0" step="0.01" inputmode="decimal" data-ledger="'+esc(r.key)+'" data-ledger-f="paid" value="'+(r.paid||'')+'"></label>'+
   '<label class="fld"><span>Fällig am</span><input type="date" data-ledger="'+esc(r.key)+'" data-ledger-f="due" value="'+esc(r.due)+'"></label></div>'+
   '<p class="small">'+ledgerBalanceText(r)+(r.due&&r.open>0.005?' · fällig '+esc(fmtLong(pd(r.due))):'')+'</p>'+(r.refundsReceived?'<p class="small muted">Zurückerhalten: '+eur(r.refundsReceived)+' · netto bezahlt: '+eur(r.netPaid)+'</p>':'')+v3Actions(t,{kind:'ledger',key:r.key})+'</div>';
  const rows=f.rows;
  return '<section class="block"><h2>Buchungen & Zahlungen</h2><p class="small muted">Je Posten Status, tatsächlich gebuchten Betrag, Bezahltes und Fälligkeit festhalten. Ein gebuchter Betrag ersetzt den Planwert in der Kostenrechnung. Buchungsnummern gehören in die Notizen. Die Unterkunft verwaltet ihr über das ausgewählte Angebot.</p>'+
   '<div class="kpis"><div class="kpi"><small>Gebucht</small><b class="num">'+eur(f.booked)+'</b><small>Status „gebucht“'+(f.stay?' inkl. Unterkunft, falls extern gebucht':'')+'</small></div><div class="kpi"><small>Bezahlt</small><b class="num">'+eur(f.paid)+'</b><small>alle erfassten Zahlungen</small></div><div class="kpi"><small>Noch offen</small><b class="num">'+eur(f.open)+'</b><small>bis Reiseende, inkl. vor Ort</small></div>'+(f.deposit?'<div class="kpi"><small>Kaution separat</small><b class="num">'+eur(f.deposit)+'</b><small>kein Reiseaufwand</small></div>':'')+'</div>'+
   (f.detachedPaid?'<p class="small">'+eur(f.detachedPaid)+' für entfernte Posten bezahlt. Diese Zahlungen reduzieren den offenen Betrag des aktuellen Plans nicht; Erstattung oder verbliebene Kosten klären.</p>':'')+
   (f.due.length?'<div class="checks-list">'+f.due.slice(0,5).map(d=>'<div class="chk '+(d.overdue?'warn':'info')+'"><b>'+(d.overdue?'!':'i')+'</b><span>'+esc(d.label)+': '+eur(d.open)+(d.overdue?' überfällig seit ':' fällig am ')+esc(fmtLong(pd(d.due)))+'</span></div>').join('')+'</div>':'')+
   (rows.length?'<details class="panel"'+(Object.keys(t.ledger||{}).length?' open':'')+'><summary><b>Posten bearbeiten</b> <small class="muted">'+rows.length+' Posten</small></summary><div class="stack">'+rows.map(row).join('')+'</div></details>':'<p class="muted">Noch keine buchbaren Posten.</p>')+'</section>';
}
/* Budget-Übersicht und Rückblick (Claude, #8): rein abgeleitet aus cost(), Buchungsbuch und Angebot, keine Speicherfelder.
   „Fest“ = gebuchter Betrag eingetragen oder Status gebucht bzw. Unterkunft gebucht; alles andere bleibt Planwert. */
function budgetCheck(t,now){
  const c=cost(t),base=cost(Object.assign({},t,{ledger:{}})),f=financeSummary(t),b=num(t.budget,0),P=c.P,days=Math.max(1,daysOf(t).length);
  const cats={};const cat=k=>cats[k]=cats[k]||{key:k,label:(COSTCAT[k]||[k])[0],plan:0,now:0,fixed:0,paid:0};
  Object.keys(base.byCat).forEach(k=>{cat(k).plan=base.byCat[k]});
  Object.keys(c.byCat).forEach(k=>{cat(k).now=c.byCat[k]});
  f.rows.filter(r=>!r.orphan).forEach(r=>{const x=cat(r.cat||'eigen');if(r.amount!=null||r.status==='gebucht')x.fixed+=r.cost;x.paid+=r.paid});
  if(f.stay){const x=cat('unterkunft');if(f.stay.booked)x.fixed+=f.stay.cost;x.paid+=f.stay.paid}
  const list=Object.values(cats).filter(x=>x.plan>0.005||x.now>0.005||x.paid>0.005).sort((a,b2)=>b2.now-a.now);
  const fixed=list.reduce((s,x)=>s+Math.min(x.fixed,x.now||x.fixed),0),reserve=c.byCat.puffer||0;
  const devs=f.rows.filter(r=>!r.orphan&&r.amount!=null&&Math.abs(r.amount-r.plan)>=Math.max(5,r.plan*0.1)).map(r=>({label:r.label,plan:r.plan,actual:r.amount,diff:r.amount-r.plan})).sort((x,y)=>Math.abs(y.diff)-Math.abs(x.diff));
  const ph=tripPhase(t,now);
  return {budget:b,total:c.total,plan:base.total,fixed,estimated:Math.max(0,c.total-fixed-reserve),reserve,paid:f.paid,open:f.open,
    left:b?b-c.total:null,leftPerPersonDay:b?(b-c.total)/P/days:null,over:b>0&&c.total>b+0.005,share:b?c.total/b:null,
    cats:list,devs,unrecorded:f.rows.filter(r=>!r.orphan&&r.amount==null&&r.status!=='gebucht').length,
    phase:ph?ph.phase:null,P,days};
}
function budgetSection(t,now){
  const x=budgetCheck(t,now);
  const pct=v=>Math.round(v*100)+' %';
  const head=x.budget?(x.over?'<b>'+eur(-x.left)+' über dem Budget</b> von '+eur(x.budget):'Noch <b>'+eur(x.left)+'</b> Spielraum im Budget von '+eur(x.budget)+' · etwa '+eur(x.leftPerPersonDay)+' pro Person und Tag'):'Kein Budget angegeben. <button type="button" class="lnk" data-act="edit-trip">Budget in den Eckdaten eintragen</button>';
  const bar=x.budget?'<div class="budget-bar" role="img" aria-label="Plan '+pct(x.share)+' des Budgets"><span style="width:'+Math.min(100,x.share*100).toFixed(1)+'%"></span></div><p class="small muted">Plan '+eur(x.total)+' = '+pct(x.share)+' des Budgets'+(x.over?' (über 100 %)':'')+'.</p>':'';
  const rows=x.cats.map(k=>'<tr><td>'+esc(k.label)+'</td><td class="r">'+eur(k.plan)+'</td><td class="r">'+eur(k.now)+'</td><td class="r">'+(k.fixed?eur(k.fixed):'–')+'</td><td class="r">'+(k.paid?eur(k.paid):'–')+'</td></tr>').join('');
  const retro=x.phase==='nach'?'<h3>Rückblick</h3><p class="small">Ursprünglicher Plan '+eur(x.plan)+' · mit erfassten Beträgen '+eur(x.total)+' · bezahlt '+eur(x.paid)+(x.total-x.plan?' · Abweichung <b>'+(x.total>x.plan?'+':'−')+eur(Math.abs(x.total-x.plan))+'</b>':'')+'.</p>'+
   (x.unrecorded?'<p class="small muted">'+x.unrecorded+' Posten ohne erfassten Betrag zählen weiter mit ihrem Planwert. Tatsächliche Beträge unter „Buchungen & Zahlungen“ nachtragen, damit der Rückblick stimmt.</p>':'<p class="small muted">Alle Posten haben einen erfassten Betrag.</p>')+splitRetro(t):'';
  const devs=x.devs.length?'<h3>Abweichungen vom Plan</h3><ul class="plain">'+x.devs.slice(0,6).map(d=>'<li>'+esc(d.label)+': geplant '+eur(d.plan)+', erfasst '+eur(d.actual)+' <b>('+(d.diff>0?'+':'−')+eur(Math.abs(d.diff))+(d.diff>0?' teurer':' günstiger')+')</b></li>').join('')+'</ul>':'';
  return '<section class="block" data-budget><h2>Budget</h2><p>'+head+'</p>'+bar+
   '<div class="kpis"><div class="kpi"><small>Fest</small><b class="num">'+eur(x.fixed)+'</b><small>gebucht oder Betrag erfasst</small></div><div class="kpi"><small>Noch geschätzt</small><b class="num">'+eur(x.estimated)+'</b><small>Planwerte, können sich ändern</small></div>'+(x.reserve?'<div class="kpi"><small>Puffer</small><b class="num">'+eur(x.reserve)+'</b><small>Reserve, kein fester Posten</small></div>':'')+'</div>'+
   (rows?'<div class="tbl-wrap"><table><caption class="small muted">Je Bereich: ursprünglicher Plan, aktueller Stand, davon fest und bezahlt</caption><thead><tr><th>Bereich</th><th class="r">Plan</th><th class="r">Aktuell</th><th class="r">Fest</th><th class="r">Bezahlt</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'')+
   devs+retro+'</section>';
}
function fileSafe(s){return String(s||'Reise').replace(/[^\wäöüÄÖÜß\- ]+/g,'').trim().replace(/\s+/g,'-').slice(0,60)||'Reise'}

