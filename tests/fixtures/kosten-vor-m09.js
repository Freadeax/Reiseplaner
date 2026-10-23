/* Stand origin/main c11fcc2 (23.10.2026): cost() vor M09.1, nur als Vergleich für tests/gaestekarten.cjs (G-R12). Nicht in der App geladen. */
function costVorM09(t){
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
  const card=!!(st&&t.cardConfirmed===true);
  const topUsed=new Set(passDays);
  if(pl&&kursDays.length){const k=kursDays.length, price=k<=3?pl.kurs[k]:pl.kurs[3]+35*(k-3);add('schnee','Gruppenkurs · '+k+(k>1?' Tage':' Tag'),pl.school+' · '+price+' € p. P.'+(k>3?' · ab Tag 4 mit 35 € / Tag geschätzt':''),price*P,k>3?'est':pl.kursSrc,'kurs');lines[lines.length-1].days=kursDays.slice()}
  const gearSet=[...new Set(items.filter(it=>actOf(t,it.act).gear).map(i=>i.day))],gearDays=gearSet.length;
  /* Tariftabelle reicht bis 5 Tage; darüber mit dem Zuwachs von Tag 4 auf 5 hochgerechnet und als Schätzung markiert. */
  if(gearDays){const g=Math.min(5,gearDays),more=gearDays-g,pp=RENT_SET[g]+RENT_HELM[g]+more*((RENT_SET[5]-RENT_SET[4])+(RENT_HELM[5]-RENT_HELM[4]));let r=pp*P;const on=pl&&pl.onlineRent&&t.online!==false;if(on)r*=0.9;add('schnee','Verleih Set + Helm · '+gearDays+(gearDays>1?' Tage':' Tag'),pp+' € p. P.'+(more?' · ab Tag 6 hochgerechnet':'')+(on?' · −10 % online':'')+(pl&&pl.onlineRent?'':' · Preise wie Iseler angenommen'),r,pl&&pl.onlineRent&&!more?'ok':'est','verleih')}
  if(gearDays){const gl=lines.find(l=>l.cat==='schnee'&&/^Verleih/.test(l.t));if(gl)gl.days=gearSet.slice()}
  let saved=0;
  if(pl&&passDays.size){const n=passDays.size;
    if(pl.cardPass&&card){saved=pl.passDay*P*n;add('schnee','Skipass · '+n+(n>1?' Tage':' Tag'),'in '+pl.card+' enthalten'+(st.card==='?'?' (beim Gastgeber bestätigen!)':''),0,'plus','skipass')}
    else if(pl.cardPass){add('schnee','Skipass · '+n+(n>1?' Tage':' Tag'),'Unterkunft ohne Gästekarte: '+dec(pl.passDay,2)+' € p. P. / Tag',pl.passDay*P*n,'est','skipass')}
    else{const tb=pl.passTable,pp=n<=3?tb[n]:tb[3]/3*n;add('schnee','Skipass · '+n+(n>1?' Tage':' Tag'),dec(pp,2)+' € p. P. ('+pl.passSrc+(n>3?', ab Tag 4 hochgerechnet':'')+')',pp*P,n>3?'est':'ok','skipass')}
  }
  {const sp=lines.find(l=>l.key==='skipass');if(sp)sp.days=[...passDays]}
  /* Unternehmungen */
  items.forEach(it=>{const a=actOf(t,it.act);if(a.kurs)return;
    let c;
    if(a.custom){c=a.per==='pp'?num(a.cost,0)*P:num(a.cost,0)}
    else{let pp=a.pp||0;if(a.cardPp!=null&&card){pp=a.cardPp;if(a.top){if(topUsed.has(it.day))pp=a.pp;else topUsed.add(it.day)}}if(a.ppKurs!=null&&kursDays.length)pp=a.ppKurs;c=pp*P+(a.grp||0)}
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
  return {lines,total,byCat,saved,P,N,kursDays,passDays,gearDays};
}
