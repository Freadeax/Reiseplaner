/* Reiseplaner · Kosten, Checkliste, neue Reise, Sicherung und Import, Saison, Vorlagen.
   Teil 7 von 25 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
function cost(t){
  const P=Math.max(1,Math.round(num(t.persons,2))), N=nightsOf(t), pl=placeOf(t), st=stayOf(t), lines=[];
  const add=(cat,label,sub,c,src,key)=>lines.push({cat,t:label,s:sub,c:+c||0,src:src||'est',key:key||''});
  const days=daysOf(t), maxDay=days.length-1;
  const items=sortedItems(t).filter(it=>it.day<=maxDay&&actOf(t,it.act));
  /* Unterkunft */
  if(st){
    const offer=activeOffer(t);
    if(offer&&v3Money(t,offer)&&offer.cancel){const m=V3.cancelMath(offer,offerAmounts(offer).total);add('unterkunft',offer.name+' (storniert)',m.unknown?'Stornogebühr noch unbekannt':'Stornogebühr laut eurer Eingabe',m.unknown?0:m.cost,m.unknown?'est':'ok','stay');if(m.unknown)lines[lines.length-1].unknownFee=true;}
    else if(offer){const a=offerAmounts(offer);add('unterkunft',offer.name,'Erfasst für '+offer.persons+' Personen · '+offer.start+' bis '+offer.end+(offerCurrent(offer,t)?'':' · Achtung: passt nicht mehr / abgelaufen'),a.total,'est','stay');}
    else if(num(t.stayQuote,0)>0) add('unterkunft',st.name,'Euer Angebotspreis gesamt',num(t.stayQuote,0),'ok','stay');
    else{const sn=stayNight(t,st);add('unterkunft',st.name,(st.custom?'Planwert '+eur(sn.pn)+' / Nacht':sn.txt)+' · × '+N+' Nächte',sn.pn*N,sn.src,'stay')}
  }
  /* Stornogebühren früherer, nicht aktiver Angebote (SCHEMA_V3 §1, U1/U2) */
  if(isV3(t))(t.offers||[]).forEach(o=>{if(!o.cancel||(activeOffer(t)&&activeOffer(t).id===o.id))return;const m=V3.cancelMath(o,0);add('unterkunft','Stornogebühr: '+o.name,m.unknown?'noch unbekannt':'laut eurer Eingabe',m.unknown?0:m.cost,m.unknown?'est':'ok','');if(m.unknown)lines[lines.length-1].unknownFee=true});
  /* Anreise */
  const trv=v3Transport(t);
  if(trv){
    const tc=V3.transportCost(trv,{persons:P,verb:num(t.verb,7.5),preis:num(t.preis,2.15)});
    tc.lines.forEach(l=>{add('anreise',l.label,l.open?'Preis offen':'eure Eingabe',l.open?0:l.c,l.open?'est':'ok',l.key);if(l.open)lines[lines.length-1].open=true});
    if(t.travel==='auto'||[].concat(trv.out||[],trv.back||[]).some(x=>x.mode==='auto'||x.mode==='mietwagen')){let km=pl?pl.local:0;items.forEach(it=>{const a=actOf(t,it.act);km+=(a.kmBy&&pl&&a.kmBy[t.place]!=null)?a.kmBy[t.place]:(a.km||0)});
      if(km>0){const l=km*num(t.verb,7.5)/100;add('anreise','Sprit vor Ort · ≈ '+Math.round(km)+' km',dec(l,1)+' l × '+dec(num(t.preis,2.15),2)+' €',l*num(t.preis,2.15),'est','anreise')}}
  } else if(t.travel==='auto'){
    let km=routeKm(t)*2+(pl?pl.local:0);
    items.forEach(it=>{const a=actOf(t,it.act);km+=(a.kmBy&&pl&&a.kmBy[t.place]!=null)?a.kmBy[t.place]:(a.km||0)});
    const l=km*num(t.verb,7.5)/100;
    add('anreise','Sprit · ≈ '+Math.round(km)+' km',dec(l,1)+' l × '+dec(num(t.preis,2.15),2)+' € · inkl. Fahrten vor Ort',l*num(t.preis,2.15),'est','anreise');
  } else if(num(t.ticket,0)>0) add('anreise',t.travel==='bahn'?'Bahn-Tickets':'Flug / Ticket','eure Eingabe',num(t.ticket,0),'ok','anreise');
  if(pl&&!(activeOffer(t)&&activeOffer(t).fees.tax.state!=='unknown')) add('gebuehren','Kurbeitrag','≈ '+dec(pl.taxe,2)+' € p. P. / Nacht',pl.taxe*P*N,'est','kurbeitrag');
  /* Schneesport */
  const kursIt=items.filter(it=>actOf(t,it.act).kurs), kursDays=[...new Set(kursIt.map(i=>i.day))];
  const passDays=new Set(); kursDays.slice(1).forEach(d=>passDays.add(d));
  items.forEach(it=>{if(actOf(t,it.act).pass)passDays.add(it.day)});
  /* Gästekarte: Status, Top-Limit je Tag und Skipass rechnet cardPricing (app/gaestekarten.js, M09.1). */
  const gc=cardPricingFor(t,{persons:P,place:pl,stay:st,items,passDays,kursActive:kursDays.length>0});
  if(pl&&kursDays.length){const k=kursDays.length, price=k<=3?pl.kurs[k]:pl.kurs[3]+35*(k-3);add('schnee','Gruppenkurs · '+k+(k>1?' Tage':' Tag'),pl.school+' · '+price+' € p. P.'+(k>3?' · ab Tag 4 mit 35 € / Tag geschätzt':''),price*P,k>3?'est':pl.kursSrc,'kurs');lines[lines.length-1].days=kursDays.slice()}
  const gearSet=[...new Set(items.filter(it=>actOf(t,it.act).gear).map(i=>i.day))],gearDays=gearSet.length;
  /* Tariftabelle reicht bis 5 Tage; darüber mit dem Zuwachs von Tag 4 auf 5 hochgerechnet und als Schätzung markiert. */
  if(gearDays){const g=Math.min(5,gearDays),more=gearDays-g,pp=RENT_SET[g]+RENT_HELM[g]+more*((RENT_SET[5]-RENT_SET[4])+(RENT_HELM[5]-RENT_HELM[4]));let r=pp*P;const on=pl&&pl.onlineRent&&t.online!==false;if(on)r*=0.9;add('schnee','Verleih Set + Helm · '+gearDays+(gearDays>1?' Tage':' Tag'),pp+' € p. P.'+(more?' · ab Tag 6 hochgerechnet':'')+(on?' · −10 % online':'')+(pl&&pl.onlineRent?'':' · Preise wie Iseler angenommen'),r,pl&&pl.onlineRent&&!more?'ok':'est','verleih')}
  if(gearDays){const gl=lines.find(l=>l.cat==='schnee'&&/^Verleih/.test(l.t));if(gl)gl.days=gearSet.slice()}
  let saved=0;
  if(pl&&passDays.size){const n=passDays.size;
    if(pl.cardPass&&gc.status==='enthalten'){saved=gc.pass.normal;add('schnee','Skipass · '+n+(n>1?' Tage':' Tag'),'in '+pl.card+' enthalten'+(st.card==='?'?' (beim Gastgeber bestätigen!)':''),0,'plus','skipass')}
    else if(pl.cardPass){add('schnee','Skipass · '+n+(n>1?' Tage':' Tag'),'Unterkunft ohne Gästekarte: '+dec(pl.passDay,2)+' € p. P. / Tag',pl.passDay*P*n,'est','skipass')}
    else{const tb=pl.passTable,pp=n<=3?tb[n]:tb[3]/3*n;add('schnee','Skipass · '+n+(n>1?' Tage':' Tag'),dec(pp,2)+' € p. P. ('+pl.passSrc+(n>3?', ab Tag 4 hochgerechnet':'')+')',pp*P,n>3?'est':'ok','skipass')}
  }
  {const sp=lines.find(l=>l.key==='skipass');if(sp)sp.days=[...passDays]}
  /* Unternehmungen */
  items.forEach(it=>{const a=actOf(t,it.act);if(a.kurs)return;
    let c;
    if(a.custom){c=a.per==='pp'?num(a.cost,0)*P:num(a.cost,0)}
    else c=gc.forItem(it).applied;
    const d=days[it.day];
    if(c>0||a.custom){add(a.custom?(a.cat||'eigen'):a.cat,a.t,(d?d.label+' · '+SLOTNAME[it.slot]:''),c,a.custom?'ok':a.src,'act:'+a.id);lines[lines.length-1].day=it.day}
  });
  /* Essen */
  const f=FOOD[t.food]||FOOD.selbst;let fpp=f[1]*(N+1);if(st&&st.breakfast)fpp-=7*N;
  add('essen','Essen & Trinken · '+f[0],f[2]+' · ≈ '+f[1]+' € p. P. / Tag'+(st&&st.breakfast?' · Frühstück inklusive':''),Math.max(0,fpp)*P);
  (t.extraCosts||[]).forEach(e=>add('eigen',e.t||'Eigener Posten',e.note||'',num(e.c,0),'ok','xc:'+e.id));
  /* Zahlungsbuch: ein erfasster Buchungsbetrag ersetzt den Planwert dieses Postens (auch für den Puffer). */
  const lg=t.ledger&&typeof t.ledger==='object'?t.ledger:{};
  Object.keys(lg).forEach(k=>{const le=lg[k];if(!le||k==='stay')return;
    if(v3Money(t,le)&&le.cancel){const hit=lines.filter(l=>l.key===k);if(!hit.length)return;const m=V3.cancelMath(le,0),planned=hit.reduce((x,l)=>x+l.c,0);
      for(let i=lines.length-1;i>=0;i--)if(lines[i].key===k)lines.splice(i,1);
      lines.push({cat:hit[0].cat,t:(k.startsWith('act:')?(actOf(t,k.slice(4))||{t:hit[0].t}).t:hit[0].t)+' (storniert)',s:(m.unknown?'Stornogebühr noch unbekannt':'Stornogebühr laut eurer Eingabe')+' · Plan war '+eur(planned),c:m.unknown?0:m.cost,src:m.unknown?'est':'ok',key:k,booked:true,cancelled:true,unknownFee:m.unknown});return}
    if(le.amount==null||!Number.isFinite(+le.amount))return;const hit=lines.filter(l=>l.key===k);if(!hit.length)return;
    const planned=hit.reduce((x,l)=>x+l.c,0),label=k.startsWith('act:')?(actOf(t,k.slice(4))||{t:hit[0].t}).t:hit[0].t;
    for(let i=lines.length-1;i>=0;i--)if(lines[i].key===k)lines.splice(i,1);
    const split=[];hit.forEach(l=>{const ds=l.day!=null?[l.day]:(l.days||[]);ds.forEach(dd=>split.push({day:dd,share:(planned>0?l.c/planned:1/hit.length)/ds.length}))});
    lines.push({cat:hit[0].cat,t:label,s:'laut eurer Buchung · Plan war '+eur(planned)+(hit.length>1?' ('+hit.length+' Termine)':''),c:+le.amount,src:'ok',key:k,booked:true,split})});

  const sub=lines.reduce((s,l)=>s+l.c,0);
  if(num(t.puffer,0)>0) add('puffer','Puffer '+num(t.puffer,0)+' %','für Unvorhergesehenes',sub*num(t.puffer,0)/100,'ok');
  const total=lines.reduce((s,l)=>s+l.c,0), byCat={};
  lines.forEach(l=>byCat[l.cat]=(byCat[l.cat]||0)+l.c);
  /* card: eingerechnete Ersparnis (applied) und getrennter möglicher Vorteil (possible, nie in total). */
  return {lines,total,byCat,saved,P,N,kursDays,passDays,gearDays,card:{status:gc.status,applied:gc.applied,possible:gc.possible,items:gc.items,pass:gc.pass,days:gc.days}};
}
/* Szenarien verändern nur die ausdrücklich genannten Verpflegungsannahmen. */
function costScenarios(t){
 const st=stayOf(t), current=FOOD[t.food]?t.food:'selbst';
 const low=st&&st.kitchen?'selbst':current;
 const high=FOOD[current][1]>FOOD.auswaerts[1]?current:'auswaerts';
 const paid=financeSummary(t), open=openCosts(t);
 return [{id:'low',name:'Günstig',food:low},{id:'base',name:'Aktueller Plan',food:current},{id:'high',name:'Konservativ',food:high}].map(v=>{
  const x=clone(t);x.food=v.food;const c=cost(x),reserve=c.byCat.puffer||0;
  return Object.assign(v,{lines:c.lines,total:c.total,reserve,expenses:c.total-reserve,remaining:Math.max(0,c.total-paid.activePaid),deposit:paid.deposit,open:open.slice(),budget:num(t.budget,0),kitchenLimited:v.id==='low'&&!(st&&st.kitchen)});
 });
}
function scenarioSection(t){
 const rows=costScenarios(t);
 return '<section class="block" data-cost-scenarios><h2>Drei Kostenszenarien</h2><p class="small muted">Vergleich der Verpflegung: Unterkunft, Termine, Buchungsbeträge und der gewählte Puffer bleiben gleich. Die Tagesbeträge sind Planannahmen, keine recherchierten Preise. „Konservativ“ ist keine Preisobergrenze.</p><div class="grid">'+rows.map(r=>'<article class="card"><h3>'+esc(r.name)+'</h3><p class="small">'+esc(FOOD[r.food][0])+' · ≈ '+FOOD[r.food][1]+' € pro Person / Tag'+(r.kitchenLimited?' · keine bestätigte Küche: keine zusätzliche Koch-Ersparnis angenommen':'')+'</p><dl class="facts"><dt>Ausgaben ohne Reserve</dt><dd>'+eur(r.expenses)+'</dd><dt>Reserve</dt><dd>'+eur(r.reserve)+'</dd><dt>Plan gesamt</dt><dd><b>'+eur(r.total)+'</b></dd><dt>Noch zu finanzieren</dt><dd>'+eur(r.remaining)+'</dd><dt>Kaution separat</dt><dd>'+eur(r.deposit)+'</dd></dl><p class="small">'+(r.budget?(r.total>r.budget?eur(r.total-r.budget)+' über Budget':'Rechnerischer Spielraum '+eur(r.budget-r.total)):'Kein Budget festgelegt')+' · offene Kosten prüfen</p></article>').join('')+'</div><p class="small">'+(rows[0].open.length?'Nicht eingerechnet / noch zu prüfen: '+esc(rows[0].open.join(' · ')):'Auch ohne offene Pflichtposten bleiben Schätzwerte und Anbieterpreise zu prüfen.')+'</p></section>';
}
/* Plan-Check */
function checks(t){
  const out=[], st=stayOf(t), days=daysOf(t), c=cost(t);
  if(!st){if(nightsOf(t)>0)out.push(['warn','Noch keine Unterkunft gewählt','unterkunft'])}
  if(v3Transport(t))V3.transportTimeline(v3Transport(t),{start:t.start,end:t.end}).checks.forEach(x=>{if(x.level==='warn'||/Folgetag/.test(x.text))out.push([x.level==='warn'?'warn':'info','Anreise: '+x.text,'unterkunft'])});
  if(isV3(t)){const f=financeSummary(t).v3||{};if(f.unknownFee)out.push(['warn',f.unknownFee+'× Stornogebühr noch unbekannt','kosten']);if(f.refundOpen)out.push(['info','Erstattungen offen: '+eur(f.refundOpen),'kosten']);if(f.feeOpen)out.push(['warn','Stornogebühren offen: '+eur(f.feeOpen),'kosten'])}
  if(st&&st.gone) out.push(['warn',st.name+': Inserat war am '+fmtLong(pd(st.gone))+' auf den hinterlegten Portalen nicht mehr auffindbar','unterkunft']);
  if(st&&st.card==='?'&&!t.cardConfirmed) out.push(['warn',st.name+': Gästekarte beim Gastgeber bestätigen lassen, sonst kostet der Skipass extra','unterkunft']);
  if(st&&st.card&&!t.cardConfirmed)out.push(['warn','Gästekarte für diesen Aufenthalt unbestätigt: keine Rabatte eingerechnet','unterkunft']);
  out.push(['info','Zeitfenster sind grob: Fahrtzeiten, Check-in und genaue Termine noch prüfen','plan']);
  const items=sortedItems(t);
  items.forEach(it=>{const a=actOf(t,it.act), d=days[it.day];if(!a)return;
    if(!d){out.push(['warn',a.t+' liegt nach dem letzten Reisetag','plan']);return}
    if(a.onlyDate&&d.md&&d.md!==a.onlyDate) out.push(['warn',a.t+' gilt nur am '+mdText(a.onlyDate)+', steht aber am '+d.label,'plan']);
    if(a.dow&&d.date&&!a.dow.includes(d.date.getUTCDay())) out.push(['warn',a.t+' gibt es nur '+a.dow.map(x=>({0:'sonntags',1:'montags',2:'dienstags',3:'mittwochs',4:'donnerstags',5:'freitags',6:'samstags'})[x]).join('/')+', nicht am '+d.label,'plan']);
    (a.rules||[]).forEach(r=>{if(d.md===r.date&&r.bad.includes(it.slot))out.push(['warn',a.t+' am '+d.label+': '+r.msg,'plan'])});
    if(a.kitchen&&st&&!st.kitchen) out.push(['warn',a.t+' braucht eine Küche, '+st.name+' hat keine','plan']);
    if(a.needSauna&&st&&!st.sauna) out.push(['warn','Sauna in der Unterkunft eingeplant, '+st.name+' hat laut Inserat keine','plan']);
    if(a.warn) out.push(['warn',a.t+': '+a.warn,'plan']);
  });
  const kd=c.kursDays; for(let i=1;i<kd.length;i++) if(kd[i]-kd[i-1]>1){out.push(['info','Kurstage nicht am Stück: bei der Skischule nachfragen, ob das geht','plan']);break}
  const ue=items.filter(it=>actOf(t,it.act)&&actOf(t,it.act).pass);
  if(ue.length&&kd.length&&ue[0].day<kd[0]) out.push(['info','Übungstag liegt vor dem ersten Kurstag','plan']);
  const occ={};items.forEach(it=>{const k=it.day+it.slot;occ[k]=(occ[k]||0)+1});
  Object.keys(occ).forEach(k=>{if(occ[k]>1){const d=days[+k.match(/^\d+/)[0]];out.push(['info',(d?d.label:'')+' '+SLOTNAME[k.replace(/^\d+/,'')]+': '+occ[k]+' Dinge gleichzeitig geplant','plan'])}});
  {const arr=arrivalMin(t),byDay={};items.forEach(it=>{const m=timeMin(it.time),a=actOf(t,it.act);if(m==null||!a)return;(byDay[it.day]=byDay[it.day]||[]).push({it,a,m,h:actHours(a)})});
   Object.keys(byDay).forEach(k=>{const l=byDay[k].sort((x,y)=>x.m-y.m),d=days[+k];
    for(let i=1;i<l.length;i++){const p=l[i-1];if(p.h!=null&&p.m+Math.round(p.h*60)>l[i].m)out.push(['warn',(d?d.label:'')+': '+p.a.t+' ('+p.it.time+', ca. '+String(p.h).replace('.',',')+' Std.) überschneidet sich mit '+l[i].a.t+' ('+l[i].it.time+')','plan'])}
    if(+k===0&&arr!=null)l.filter(x=>x.m<arr).forEach(x=>out.push(['warn',x.a.t+' um '+x.it.time+' liegt vor der geschätzten Ankunft (ca. '+minTime(arr)+')','plan']))});
   transferGaps(t).filter(g=>g.short).forEach(g=>{const d=days[g.day];out.push(['warn',(d?d.label:'')+': Zwischen '+g.from.a.t+' (Ende ca. '+minTime(g.from.m+Math.round(g.from.h*60))+') und '+g.to.a.t+' ('+g.to.it.time+') bleiben '+g.gap+' Min., der Weg dauert ca. '+g.need+' Min. (geschätzt)','plan'])});
   if(arr!=null&&timeMin(t.checkinTime)!=null&&arr<timeMin(t.checkinTime))out.push(['info','Ankunft ca. '+minTime(arr)+', Check-in erst ab '+t.checkinTime+': Gepäck oder Zwischenprogramm einplanen','plan']);}
  {const dz=tzDiffMin(t);if(validTz(t.tz)&&dz)out.push(['info','Am Ziel gilt '+t.tz+': '+(Math.abs(dz)%60?(Math.abs(dz)/60).toFixed(1).replace('.',','):Math.abs(dz)/60)+' Std. '+(dz>0?'später':'früher')+' als auf diesem Gerät. Uhrzeiten im Plan sind Ortszeit am Ziel.','plan'])}
  dayLoad(t).forEach(L=>{if(L.over){const d=days[L.day];out.push(['warn',(d?d.label:'Tag')+': ca. '+String(L.planned).replace('.',',')+' Std. Programm, verfügbar ca. '+String(L.cap).replace('.',',')+' Std.'+(L.drive?' (nach ca. '+String(Math.round(L.drive/6)/10).replace('.',',')+' Std. Fahrt, geschätzt)':'')+'. Einen Punkt verschieben oder tauschen.','plan'])}});
  if(num(t.budget,0)>0&&c.total>num(t.budget,0)) out.push(['warn',eur(c.total-num(t.budget,0))+' über eurem Budget, siehe Spartipps','kosten']);
  if(t.ledger&&Object.keys(t.ledger).length){const fs=financeSummary(t);
    fs.due.forEach(d=>{if(d.overdue)out.push(['warn','Zahlung überfällig: '+d.label+' · '+eur(d.open)+' seit '+fmtLong(pd(d.due)),'kosten']);else if(d.days<=14)out.push(['info','Zahlung fällig am '+fmtLong(pd(d.due))+': '+d.label+' · '+eur(d.open),'kosten'])});
    fs.orphanPaid.forEach(r=>out.push(['warn','Zahlung von '+eur(r.paid)+' erfasst für „'+r.label+'“, der nicht mehr im Plan ist: Erstattung klären oder Eintrag entfernen','kosten']));}
  if(!out.length) out.push(['info','Keine erkennbaren Konflikte in den groben Zeitfenstern','plan']);
  return out;
}
/* Checkliste */
function checklist(t){
  const st=stayOf(t), groups=[], book=[];
  if(st) book.push(['stay','Unterkunft anfragen & buchen: '+st.name,'Datum, Gästekarte, Sauna, Endreinigung klären']);
  else if(nightsOf(t)>0) book.push(['stay','Unterkunft auswählen und anfragen','']);
  const seen=new Set();
  sortedItems(t).forEach(it=>{const a=actOf(t,it.act);if(!a||!a.book||seen.has(a.id))return;seen.add(a.id);book.push(['b-'+a.id,(a.kurs?'Kurs buchen: ':'Reservieren: ')+a.t,a.ort||''])});
  if(sortedItems(t).some(it=>actOf(t,it.act)&&actOf(t,it.act).gear)) book.push(['rent','Verleih reservieren','Schuhgröße, Körpergröße und Gewicht bereithalten']);
  if(t.travel==='bahn') book.push(['ticket','Zugtickets buchen (Sparpreise früh)','']);
  groups.push(['Buchen & Anfragen',book]);
  const pack=PACK[t.type]||PACK.standard;
  Object.keys(pack).forEach(g=>groups.push(['Packliste: '+g,pack[g].map(x=>['p-'+x,x,''])]));
  const have=new Set([].concat(...Object.values(pack))),need={},maxDay=daysOf(t).length-1;
  sortedItems(t).forEach(it=>{const a=actOf(t,it.act);if(!a||it.day>maxDay)return;(a.bring||[]).forEach(x=>{if(have.has(x))return;(need[x]=need[x]||new Set()).add(a.t)})});
  const extra=Object.keys(need);
  if(extra.length) groups.push(['Packliste: für eure Unternehmungen',extra.map(x=>['p-'+x,x,'für: '+[...need[x]].join(', ')])]);
  if(t.type==='winter') groups.push(['Kurz vorher',[['snow','Schneebericht und Straßenlage checken','ab 3 Tage vorher'],['open','Öffnungszeiten über die Feiertage prüfen','']]]);
  groups.push(['Eigene Punkte',(t.customChecks||[]).map(c=>['c-'+c.id,c.t,'',c.id])]);
  return groups;
}

/* Angebot anwenden */
function applyPkg(t,p){
  resetStay(t);t.routeKm=null;
  t.catalog='allgaeu';t.place=p.place;t.stayId=p.stay;t.stayQuote=null;t.food=p.food;t.packageId=p.id;
  const n=daysOf(t).length;
  t.items=p.items.map(x=>{const a=ACTS[x[0]];const day=a&&a.onlyDate?daysOf(t).findIndex(d=>d.md===a.onlyDate):x[1];return {uid:uid('i'),act:x[0],day,slot:x[2]}}).filter(x=>x.day>=0&&x.day<n);
  return t;
}
function pkgTotal(t,p){return cost(applyPkg(clone(t),p)).total}

/* Reiseart wählen: Tagesausflug ohne Übernachtung; beim Wechsel weg vom Tagesausflug wieder eine sinnvolle Dauer. */
function applyType(o,type){
  const was=o.type;o.type=type;
  if(type==='tag'){o.nights=0;if(o.dateMode==='fix'&&pd(o.start))o.end=o.start}
  else if(was==='tag'&&!(num(o.nights,0)>0)){o.nights=type==='wochenende'?2:3;if(o.dateMode==='fix'&&pd(o.start))o.end=iso(new Date(pd(o.start).getTime()+864e5*o.nights))}
  return o;
}
/* Neue Reise */
function newTrip(o){
  return Object.assign({id:uid('t'),title:'Neue Reise',type:'stadt',status:'idee',dateMode:'open',start:'',end:'',month:'',nights:3,persons:2,budget:800,origin:'',dest:'',travel:'auto',km:0,verb:7.5,preis:2.15,ticket:0,catalog:'none',place:'',stayId:'',stayQuote:null,customStays:[],items:[],customActs:[],food:'selbst',puffer:0,online:true,check:{},customChecks:[],extraCosts:[],notes:'',packageId:'',created:new Date().toISOString().slice(0,10)},o||{});
}
/* Dateisicherung: nur Daten, kein ausführbarer Code. Importe überschreiben nie bestehende Reisen. */
const BACKUP_FORMAT='reiseplaner-backup', BACKUP_VERSION=2;
/* Datei sichern über die Plattformschicht (platform.js, P00 A1); ohne sie der bisherige Download-Weg */
function downloadText(content,name,type){
  const P=typeof window!=='undefined'&&window.RPPlatform;
  if(P&&P.files){P.files.save({name,type,data:content}).then(r=>{if(!r.ok&&r.state!=='cancelled')alertMsg(r.text)});return}
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
/* Teilen über die Plattformschicht: Teilen-Menü, sonst Zwischenablage, sonst Text zum Kopieren im Blatt.
   Abbrechen im Teilen-Menü ist kein Fehler und zeigt nichts an. */
function shareSheet(o,body){openSheet('<h2>'+esc(o.sheetTitle||o.title||'Text')+'</h2><p class="small muted">Text markieren und kopieren.</p><div class="copybox">'+esc(body)+'</div>')}
async function shareText(o){
  const P=typeof window!=='undefined'&&window.RPPlatform;
  if(P&&P.share){const r=await P.share(o);if(r.state==='cancelled')return r;if(r.where==='clipboard')alertMsg(o.copied||'Text kopiert.');else if(!r.ok)shareSheet(o,r.body||'');return r}
  const body=[o.text,o.url].filter(Boolean).join('\n');
  try{if(navigator.share){await navigator.share({title:o.title,text:o.text,url:o.url});return {ok:true,where:'share'}}}catch(err){if(err&&err.name==='AbortError')return {ok:false,state:'cancelled'}}
  try{await navigator.clipboard.writeText(body);alertMsg(o.copied||'Text kopiert.');return {ok:true,where:'clipboard'}}catch(err){shareSheet(o,body);return {ok:false,where:'manual'}}
}
function backupData(trips){return {format:BACKUP_FORMAT,version:BACKUP_VERSION,exportedAt:new Date().toISOString(),trips:trips.map(t=>toServer(t))}}
function validateBackup(raw){
  if(!raw||raw.format!==BACKUP_FORMAT||![1,BACKUP_VERSION].includes(raw.version)||!Array.isArray(raw.trips))throw new Error('Keine unterstützte Reiseplaner-Sicherung.');
  const inspect=(x)=>{if(x&&typeof x==='object'){for(const k of Object.keys(x)){if(['__proto__','prototype','constructor'].includes(k))throw new Error('Unzulässiges Datenfeld in der Sicherung.');inspect(x[k]);}}};inspect(raw);
  if(raw.trips.length>500)throw new Error('Die Sicherung enthält zu viele Reisen.');
  const seen=new Set();
  for(const t of raw.trips){
    if(!t||typeof t!=='object'||Array.isArray(t)||typeof t.id!=='string'||!/^t[a-z0-9]+$/i.test(t.id)||seen.has(t.id)||typeof t.title!=='string'||t.title.length>80||!Array.isArray(t.items)||t.items.length>5000||!Array.isArray(t.customStays)||!Array.isArray(t.customActs)||!Array.isArray(t.extraCosts)||!Array.isArray(t.customChecks))throw new Error('Ungültige oder doppelte Reisedaten in der Sicherung.');
    if(t.start&&pd(t.start)===null||t.end&&pd(t.end)===null||t.dateMode==='fix'&&(!pd(t.start)||!pd(t.end)||pd(t.end)<pd(t.start)))throw new Error('Ungültiges Reisedatum in der Sicherung.');
    if(!Number.isFinite(+t.persons)||+t.persons<1||+t.persons>20||!Number.isFinite(+t.budget)||+t.budget<0||+t.budget>1e9)throw new Error('Ungültige Personen- oder Budgetangabe in der Sicherung.');
    for(const key of ['km','routeKm','verb','preis','ticket','stayQuote'])if(t[key]!=null&&(!Number.isFinite(+t[key])||+t[key]<0||+t[key]>1e9))throw new Error('Ungültige Kostenangabe in der Sicherung.');
    validateExtras(t);seen.add(t.id);
  }
  return raw.trips.map(migrateTrip);
}
function importTrips(raw,conflictMode){
  if(Store.corruptRaw!==null)throw new Error('Import gesperrt: zuerst beschädigte Rohdaten sichern.');
  if(!['skip','copy'].includes(conflictMode))throw new Error('Unbekannte Importentscheidung.');
  const trips=validateBackup(raw), added=[], previous=Store.trips, next=clone(previous);
  for(const original of trips){
    if(next[original.id]&&conflictMode==='skip')continue;
    const t=clone(original);
    if(next[t.id]){do{t.id=uid('t')}while(next[t.id]);t.title=(t.title.slice(0,72)+' (Import)').slice(0,80);t.status='idee'}
    t.updated=Date.now();next[t.id]=t;added.push(t.id);
  }
  if(!added.length)return added;
  const prevQueue=Store.queue;
  Store.trips=next;if(Store.isAccount()){Store.queue=clone(prevQueue);added.forEach(id=>{Store.queue[id]={op:'upsert',at:Date.now()}})}
  if(!Store.saveLocal()){Store.trips=previous;Store.queue=prevQueue;throw new Error('Import nicht gespeichert. Bestehende Reisen blieben erhalten. Speicherproblem lösen und erneut versuchen.');}
  if(Store.isAccount())Sync.schedule(0);
  return added;
}
function downloadBackup(trips){
  downloadText(JSON.stringify(backupData(trips),null,2),'Reiseplaner-Sicherung-'+new Date().toISOString().slice(0,10)+'.json','application/json');
}
/* Katalog-Planwerte der Unterkünfte sind Schätzungen für den Jahreswechsel (Inserat +15 %).
   true: Reise berührt 24.12.–06.01., false: sicher außerhalb, null: Zeitraum noch unbekannt. */
function holidayStay(t){
  const inWin=md=>md>='12-24'||md<='01-06';
  if(t.dateMode==='fix'){const days=daysOf(t);if(days.length&&days[0].date)return days.some(d=>inWin(d.md))}
  if(t.dateMode==='flex'&&/^\d{4}-\d{2}$/.test(t.month||'')){const m=t.month.slice(5,7);return m==='12'||m==='01'?null:false}
  return null;
}
const SEASONS={jahreswechsel:'Jahreswechsel',winter:'Winter',fruehling:'Frühling',sommer:'Sommer',herbst:'Herbst'};
function seasonOfMd(md){if(md>='12-24'||md<='01-06')return 'jahreswechsel';if(md<='03-31'||md>='12-01')return 'winter';if(md<='06-30')return 'fruehling';if(md<='09-15')return 'sommer';return 'herbst'}
/* Saison der Reise: Mehrheit der Übernachtungen; Zeitraum nur Monat → Monatsmitte; offen → unbekannt (null). */
function tripSeason(t){
  if(t.dateMode==='fix'){const days=daysOf(t);if(days.length&&days[0].date){const n=Math.max(1,days.length-1),cnt={};days.slice(0,n).forEach(d=>{const k=seasonOfMd(d.md);cnt[k]=(cnt[k]||0)+1});return Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0]}}
  if(t.dateMode==='flex'&&/^\d{4}-\d{2}$/.test(t.month||''))return seasonOfMd(t.month.slice(5,7)+'-15');
  return null;
}
const nightsBetween=(a,b)=>Math.round((pd(b)-pd(a))/864e5);
const shortRange=(a,b)=>{const x=pd(a),y=pd(b);return String(x.getUTCDate()).padStart(2,'0')+'.'+String(x.getUTCMonth()+1).padStart(2,'0')+'.–'+fmtLong(y)};
/* Exakte Abfrage zuerst, sonst höchster Saisonvergleich. Keine Preisobergrenze:
   Gesamtpreise können feste Gebühren enthalten und sind nicht proportional zur Dauer. */
function sampleAge(x,now=new Date()){
  const checked=pd(x.checked),today=pd(now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0'));
  return checked?Math.round((today-checked)/864e5):null;
}
function stayNight(t,st,now=new Date()){
  const plan=num(st.plan!=null?st.plan:st.priceNight,0);
  if(st.custom)return {pn:plan,src:'ok',txt:'eure Angabe',sample:null};
  const season=tripSeason(t),valid=(st.samples||[]).filter(x=>pd(x.from)&&pd(x.to)&&nightsBetween(x.from,x.to)>0&&Number.isFinite(x.total)&&x.total>0);
  const matching=valid.find(x=>t.dateMode==='fix'&&t.start===x.from&&t.end===x.to&&Math.round(num(t.persons,2))===x.adults);
  const hits=valid.filter(x=>season&&seasonOfMd(x.from.slice(5))===season);
  const best=matching?{x:matching,pn:matching.total/nightsBetween(matching.from,matching.to)}:hits.map(x=>({x,pn:x.total/nightsBetween(x.from,x.to)})).sort((a,b)=>b.pn-a.pn)[0];
  if(best){
    const x=best.x,exact=!!matching,age=sampleAge(x,now),stale=age===null||age<0||age>30;
    const scaled=!exact&&nightsOf(t)!==nightsBetween(x.from,x.to);
    return {pn:best.pn,src:exact&&!stale?'ok':'est',sample:x,exact,stale,scaled,
      txt:(exact?'Portalpreis':'Vergleichswert '+SEASONS[season])+': Abfrage vom '+(pd(x.checked)?fmtLong(pd(x.checked)):'unbekannten Datum')+' für '+shortRange(x.from,x.to)+', '+x.adults+' Erw., '+eur(x.total)+' für '+nightsBetween(x.from,x.to)+' Nächte · '+x.incl+(exact?' · Momentaufnahme, erneut prüfen':' · für eure Daten nicht abgefragt · keine Preisobergrenze')+(scaled?' · auf eure Dauer hochgerechnet; feste Gebühren und Mindestnächte können abweichen':'')+(stale?' · Prüfdatum älter als 30 Tage oder unklar; neu abfragen':'')};
  }
  return {pn:plan,src:'est',sample:null,txt:(st.ab?st.ab+' · ':'')+'Planwert '+eur(plan)+' / Nacht ('+planBasis(t)+')'};
}
function planBasis(t){const h=holidayStay(t);return h===true?'Jahreswechsel: Inserat +15 %, geschätzt':h===false?'Schätzwert für den Jahreswechsel, für eure Daten nicht geprüft':'Schätzwert für den Jahreswechsel, Reisedaten noch offen'}
const mdText=md=>md?md.slice(3,5)+'.'+md.slice(0,2)+'.':'';
/* Startvorlagen: nur Struktur, keine erfundenen Preise oder Angebote. */
const TEMPLATES=[
  {id:'wochenende',name:'Wochenende',sub:'2 Nächte, Ziel offen',make:()=>newTrip({title:'Wochenende',type:'wochenende',nights:2,budget:0})},
  {id:'stadt',name:'Städtereise',sub:'3 Nächte, mit der Bahn',make:()=>newTrip({title:'Städtereise',type:'stadt',nights:3,travel:'bahn',budget:0})},
  {id:'tag',name:'Tagesausflug',sub:'ohne Übernachtung',make:()=>newTrip({title:'Tagesausflug',type:'tag',nights:0,budget:0})},
  {id:'strand',name:'Sommerurlaub',sub:'7 Nächte, Ziel offen',make:()=>newTrip({title:'Sommerurlaub',type:'strand',nights:7,budget:0})},
  {id:'winter',name:'Winterurlaub',sub:'Ideen-Katalog Allgäu & Tirol',make:()=>newTrip({title:'Winterurlaub',type:'winter',nights:4,catalog:'allgaeu',budget:0})},
  /* Reisetyp-Vorlagen (Claude, #8, Plan A4): nur vorhandene Typen/Anreisearten, Aufgaben als eigene Checklistenpunkte, keine Preise */
  {id:'fernreise',name:'Fernreise mit Flug',sub:'14 Nächte, Dokumente & Gesundheit',make:()=>tplTrip({title:'Fernreise',type:'rund',nights:14,travel:'flug'},'fernreise')},
  {id:'badeflug',name:'Badeurlaub mit Flug',sub:'7 Nächte, Strand',make:()=>tplTrip({title:'Badeurlaub',type:'strand',nights:7,travel:'flug'},'badeflug')},
  {id:'rundreise',name:'Rundreise mit dem Auto',sub:'6 Nächte, mehrere Etappen',make:()=>tplTrip({title:'Rundreise',type:'rund',nights:6,travel:'auto'},'rundreise')},
  {id:'camping',name:'Camping',sub:'4 Nächte, Zelt oder Wohnmobil',make:()=>tplTrip({title:'Camping',type:'wochenende',nights:4,travel:'auto'},'camping')},
  {id:'aktiv',name:'Aktivurlaub Wandern/Rad',sub:'3 Nächte, Touren',make:()=>tplTrip({title:'Aktivurlaub',type:'wochenende',nights:3,travel:'auto'},'aktiv')},
  {id:'wellness',name:'Wellness-Auszeit',sub:'2 Nächte, Spa & Ruhe',make:()=>tplTrip({title:'Wellness-Auszeit',type:'wochenende',nights:2,travel:'auto'},'wellness')},
  {id:'silvester',name:'Beispiel: Silvester im Schnee',sub:'komplett ausgefülltes Beispiel',make:()=>silvesterTemplate()}
];
const TPL_CHECKS={
  fernreise:['Reisepass: Gültigkeit für das Zielland prüfen','Einreise, Visum und Sicherheitshinweise beim Auswärtigen Amt prüfen','Impfungen mit Hausarzt oder Reisemedizin klären','Auslandskrankenversicherung mit Rücktransport','Kreditkarte und etwas Bargeld in Landeswährung','Steckdosenadapter je nach Zielland','Online-Check-in (Frist der Airline)','Gepäckregeln: Freigepäck, Handgepäck, Flüssigkeiten','Transfer Flughafen ↔ Unterkunft klären','Anfahrt bzw. Parken am Abflughafen','Zeitzone am Ziel eintragen (Eckdaten)','Kopien der Dokumente getrennt aufbewahren'],
  badeflug:['Online-Check-in (Frist der Airline)','Gepäckregeln: Freigepäck, Handgepäck, Flüssigkeiten','Transfer Flughafen ↔ Unterkunft klären','Anfahrt bzw. Parken am Abflughafen','Auslandskrankenversicherung','Reiseapotheke und Sonnenschutz','Ausweis bzw. Reisepass prüfen'],
  rundreise:['Etappen und Nächte je Ort festlegen (Ort & Unterkunft → Etappen)','Unterkunft je Etappe buchen','Maut und Vignetten je Land prüfen','Fahrzeiten je Etappe mit Routenplaner prüfen','Gepäck so packen, dass ein Koffer pro Nacht reicht'],
  camping:['Stellplatz bzw. Campingplatz reservieren','Zelt oder Wohnmobil prüfen (Vollständigkeit, Dichtigkeit)','Schlafsack, Isomatte, Kissen','Kocher, Gas, Geschirr, Kühlbox','Stromadapter (CEE) und Kabeltrommel','Stirnlampe und Ersatzbatterien','Mückenschutz'],
  aktiv:['Touren planen (Länge, Höhenmeter, Einkehr)','Wetter am Vortag prüfen','Wander- bzw. Radschuhe eingelaufen','Rucksack, Trinkflasche, Proviant','Erste-Hilfe-Set','Fahrrad prüfen bzw. Transport klären','Regenkleidung'],
  wellness:['Spa- und Massagetermine reservieren','Bademantel und Saunatücher: vor Ort vorhanden?','Badesachen und Schlappen','Ruhezeiten im Tagesplan freihalten']
};
function tplTrip(base,kind){const t=newTrip(Object.assign({budget:0},base));t.customChecks=(TPL_CHECKS[kind]||[]).map(x=>({id:uid('k'),t:x}));return t}
const TEMPLATE_GROUPS=[
 {id:'kurz',name:'Kurzreisen',sub:'Ein freier Tag oder ein kleines Wochenende.',icon:'↗',ids:['tag','wochenende','stadt']},
 {id:'urlaub',name:'Urlaub & Auszeit',sub:'Erholen, aktiv sein oder mehrere Orte verbinden.',icon:'☼',ids:['strand','winter','rundreise','camping','aktiv','wellness']},
 {id:'flug',name:'Flugvorbereitung',sub:'Mit Aufgaben für Dokumente, Gepäck und Transfer.',icon:'✈',ids:['fernreise','badeflug']},
 {id:'beispiel',name:'Ausgefülltes Beispiel',sub:'Den Planer mit einer fertigen Beispielreise kennenlernen.',icon:'◇',ids:['silvester']}
];
function templateGroups(){const known=new Set(TEMPLATE_GROUPS.flatMap(g=>g.ids));return TEMPLATE_GROUPS.map(g=>Object.assign({},g,{templates:TEMPLATES.filter(t=>g.ids.includes(t.id)||g.id==='urlaub'&&!known.has(t.id))}))}
function tplButtons(){const groups=templateGroups(),selected=groups.some(g=>g.id===UI.templateGroup)?UI.templateGroup:'all',shown=groups.filter(g=>selected==='all'||selected===g.id);
 return '<div class="template-gallery"><label class="fld template-filter"><span>Welche Art von Start passt zu euch?</span><select data-template-filter><option value="all"'+(selected==='all'?' selected':'')+'>Alle Vorlagen ('+TEMPLATES.length+')</option>'+groups.map(g=>'<option value="'+g.id+'"'+(selected===g.id?' selected':'')+'>'+g.name+' ('+g.templates.length+')</option>').join('')+'</select></label><p class="small muted" role="status">'+shown.reduce((n,g)=>n+g.templates.length,0)+' von '+TEMPLATES.length+' Vorlagen. Erst ansehen, dann bewusst als neue Reise anlegen.</p>'+
 shown.map(g=>'<section class="template-group" data-template-group="'+g.id+'"><div class="template-heading"><span aria-hidden="true">'+g.icon+'</span><div><h3>'+g.name+' <small>('+g.templates.length+')</small></h3><p class="small muted">'+g.sub+'</p></div></div><div class="template-grid">'+g.templates.map(t=>'<button type="button" class="template-card" data-act="tpl" data-val="'+t.id+'" aria-label="Vorlage '+esc(t.name)+' ansehen"><b>'+esc(t.name)+'</b><span class="small muted">'+esc(t.sub)+'</span><span class="template-more">Vorschau ansehen <span aria-hidden="true">↗</span></span></button>').join('')+'</div></section>').join('')+'</div>';
}
function templatePreview(id){const tpl=TEMPLATES.find(t=>t.id===id);if(!tpl)throw new Error('Diese Vorlage ist nicht verfügbar.');const trip=tpl.make();validateBackup(backupData([trip]));return {token:uid('p'),id,trip,scope:Store.scope,group:templateGroups().find(g=>g.templates.some(t=>t.id===id)).name,name:tpl.name,sub:tpl.sub}}
function templatePreviewHtml(p){const t=p.trip,checks=t.customChecks||[],example=p.id==='silvester';
 return '<span class="eyebrow">Vorlage · '+esc(p.group)+'</span><h2>'+esc(p.name)+'</h2><p class="lead muted">'+esc(p.sub)+'</p><p class="note" role="status">Nur eine Vorschau – es wurde noch keine Reise angelegt.</p>'+
 '<div class="badges"><span class="badge">'+esc(TYPES[t.type]||'Reise')+'</span><span class="badge">'+(nightsOf(t)?nightsOf(t)+' Nächte':'Ohne Übernachtung')+'</span><span class="badge">'+esc({auto:'Auto',bahn:'Bahn',flug:'Flug / Bus'}[t.travel]||'Anreise offen')+'</span></div>'+
 '<dl class="template-facts"><div><dt>Zeitraum</dt><dd>'+esc(rangeText(t))+'</dd></div><div><dt>Ziel</dt><dd>'+esc((placeOf(t)||{}).name||t.dest||'Noch offen')+'</dd></div><div><dt>Reisende</dt><dd>'+t.persons+' Personen · später änderbar</dd></div><div><dt>Programm</dt><dd>'+(t.items.length?t.items.length+' Punkte als Beispiel vorbereitet':'Noch frei planbar')+'</dd></div></dl>'+
 (example?'<div class="note"><b>Ausgefüllte Beispielreise, kein geprüftes Angebot</b><p>Planwert ≈ '+eur(cost(t).total)+'. Zeiten, Verfügbarkeit und Preise selbst prüfen. Ihr legt eine eigene Kopie an.</p></div>':'<p class="small muted">Ziel, genaue Reisedaten, Unterkunft und Kosten bleiben offen. Eine Vorlage ist weder eine Buchung noch eine Budgetzusage.</p>')+
 (checks.length?'<details class="template-preparation"><summary>Vorbereitung ansehen · '+checks.length+' Punkte</summary><ul>'+checks.map(c=>'<li>'+esc(c.t)+'</li>').join('')+'</ul></details>':'<p class="small muted">Die Standard-Packliste richtet sich nach der Reiseart und ergänzt sich später aus euren Unternehmungen.</p>')+
 (t.travel==='flug'?'<p class="small muted">Enthält Vorbereitungspunkte, noch keine Flugverbindung, Flughäfen oder gebuchten Tickets. Die Anreiseplanung wird getrennt erweitert.</p>':'')+
 (UI.view==='neu'&&UI.draft?'<p class="small muted">Beim Schließen bleibt euer bisheriger, ungespeicherter Entwurf erhalten. Beim Anlegen startet ihr stattdessen mit dieser Vorlage.</p>':'')+
 '<p id="template-error" role="alert"></p><div class="row"><button type="button" class="btn" data-act="tpl-apply" data-val="'+esc(p.token)+'">Als neue Reise anlegen</button><button type="button" class="btn ghost" data-act="sheet-x">Zurück zur Auswahl</button></div>';
}
function sheetTemplate(id){const p=templatePreview(id);openSheet(templatePreviewHtml(p));UI.templatePreview=p}
function commitTemplatePreview(token){
 const p=UI.templatePreview;if(!p||p.token!==token)throw new Error('Die Vorschau ist nicht mehr aktuell. Bitte die Vorlage erneut öffnen.');
 if(p.scope!==Store.scope)throw new Error('Der Speicherbereich hat sich geändert. Bitte die Vorlage erneut öffnen.');
 const t=clone(p.trip),existing=Store.get(t.id);
 if(existing&&(existing!==p.attemptedTrip||JSON.stringify(existing)!==p.attemptedSnapshot))throw new Error('Diese Reise-ID ist bereits vorhanden oder wurde geändert. Bitte eine neue Vorschau öffnen.');
 validateBackup(backupData([t]));
 if(!Store.put(t,true)){p.attemptedTrip=t;p.attemptedSnapshot=JSON.stringify(t);throw new Error('Die neue Reise konnte nicht gespeichert werden. Die Vorschau bleibt zum erneuten Versuch erhalten.');}
 UI.templatePreview=null;return {trip:t,route:'r-'+t.id+'-'+(p.id==='silvester'?'ueber':t.catalog==='allgaeu'?'angebote':'unterkunft')};
}
function silvesterTemplate(){
  const t=newTrip({title:'Silvester im Schnee',type:'winter',status:'planung',dateMode:'fix',start:'2026-12-30',end:'2027-01-03',budget:1500,catalog:'allgaeu',origin:'73110 Hattenhofen',
    notes:'Ziel: Wellness + Schnee, Anfängerkurs optional. Budget maximal 1.500 € zu zweit, Wunsch eher darunter.\nHeimkehr am 3.1. mit Erholungszeit; genaue Uhrzeit noch offen.'});
  return applyPkg(t,PKGS.find(p=>p.id==='oj-spar'));
}
document.addEventListener('change',e=>{const el=e.target;if(!el.hasAttribute||!el.hasAttribute('data-template-filter'))return;UI.templateGroup=TEMPLATE_GROUPS.some(g=>g.id===el.value)?el.value:'all';const gallery=el.closest('.template-gallery');if(gallery)gallery.outerHTML=tplButtons();const select=$('[data-template-filter]');if(select&&select.focus)select.focus()});

