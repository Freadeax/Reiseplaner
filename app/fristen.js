/* Reiseplaner · Fristen (M02.1, Claude 23.10.2026).
   Klassisches Skript ohne Bundler, teilt sich den globalen Gültigkeitsbereich mit den übrigen app/*.js-Teilen.
   deadlines(t,now) ist rein: liest die Reise, verändert sie nie, liefert für festes now immer dieselbe Liste.
   Eine Wahrheit für Fahrplan, Kalenderdatei, später Mitteilungen und „Diese Woche fällig“ (M02 §8).
   Nur Fristen aus erfassten Daten; was kein Datum hat, kommt als state 'unknown' ohne erfundenes Datum. */
"use strict";
const DEADLINE_KINDS={zahlung:'Zahlung',angebot:'Angebot',checkin:'Check-in',auto:'Auto',packen:'Packen',abfahrt:'Abfahrt',buchen:'Buchen',erstattung:'Erstattung',stornogebuehr:'Stornogebühr'};
/* Stabile IDs: dieselbe Frist behält ihre ID über Bearbeitungen hinweg (Kalender-UID, „erledigt“-Markierung) */
function deadlineId(kind,key){return kind+':'+String(key==null?'':key)}
/* Zeitpunkt einer Frist in ms, oder null wenn nur ein Datum bekannt ist */
function deadlineMs(at){
  if(!at||!pd(at.date)||!at.time||timeMin(at.time)==null)return null;
  if(at.tz&&validTz(at.tz))return zonedToUtc(at.date,timeMin(at.time),at.tz);
  const d=pd(at.date);return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()).getTime()+timeMin(at.time)*60000;
}
function deadlineState(at,now,ack){
  if(ack)return 'done';
  if(!at||!pd(at.date))return 'unknown';
  const ms=deadlineMs(at);if(ms!=null)return ms<now.getTime()?'overdue':'due';
  return at.date<iso(todayUTC(now))?'overdue':'due';
}
/* Text statt Farbe (F3): überfällig/heute/morgen/in N Tagen, Datum immer in der Zone der Frist */
function deadlineWhen(d){
  if(d.state==='unknown')return 'ohne Frist';
  const day=fmtLong(pd(d.at.date)),tm=d.at.time?' '+d.at.time+(d.at.tz?' ('+d.at.tz+')':''):'';
  if(d.state==='done')return 'erledigt · '+day;
  if(d.state==='overdue')return 'überfällig seit '+day+tm;
  return d.days===0?'heute'+tm:d.days===1?'morgen'+tm:'in '+d.days+' Tagen · '+day+tm;
}
function deadlines(t,now){
  now=now||new Date();
  const today=todayUTC(now),todayIso=iso(today),start=t.dateMode==='fix'?pd(t.start):null,out=[];
  const ack=t.deadlineAck&&typeof t.deadlineAck==='object'&&!Array.isArray(t.deadlineAck)?t.deadlineAck:{};
  const add=(id,kind,at,label,detail,go,amount)=>{
    const a=at&&pd(at.date)?{date:at.date,time:at.time||null,tz:at.tz||null}:null;
    const d={id,kind,at:a,label,detail:detail||'',go:go||'',amount:amount==null?null:Math.round(amount*100)/100,
      state:deadlineState(a,now,Object.prototype.hasOwnProperty.call(ack,id)),days:a?Math.round((pd(a.date)-today)/864e5):null};
    d.when=deadlineWhen(d);out.push(d);
  };
  /* Zahlungen: offener Restbetrag je Posten mit Fälligkeit; bezahlte Posten haben keine Frist mehr */
  const f=financeSummary(t);
  f.due.forEach(r=>add(deadlineId('pay',r.key),'zahlung',{date:r.due},'Zahlung fällig: '+r.label,eur(r.open)+' offen','kosten',r.open));
  /* Angebot: Gültigkeit nur, solange es gewählt und nicht gebucht ist */
  const o=activeOffer(t);
  if(o&&!o.booked&&o.validUntil&&pd(o.validUntil))add(deadlineId('offer',o.id),'angebot',{date:o.validUntil},'Angebot gilt bis: '+o.name,'Danach Preis und Verfügbarkeit neu prüfen','angebote');
  /* Online-Check-in aus Anreise-Abschnitten (Format 3); vergangene Öffnung ist keine Frist mehr */
  const tr=v3Transport(t);
  if(tr)[].concat(tr.out||[],tr.back||[]).forEach(sg=>{const ci=sg.checkin&&sg.checkin.opens;if(ci&&pd(ci.date)&&ci.date>=todayIso)
    add(deadlineId('checkin',sg.id),'checkin',ci,'Online-Check-in'+(sg.number?' '+sg.number:'')+(ci.time?' ab '+ci.time+(ci.tz?' ('+ci.tz+')':''):''),sg.checkin.note||'Frist laut Airline','unterkunft')});
  const g=checklist(t),chk=t.check||{};
  if(start){
    const startIso=iso(start);
    if(t.type==='winter'&&t.travel==='auto'){const w=iso(new Date(start.getTime()-7*864e5));if(w>=todayIso)add('winter','auto',{date:w},'Auto winterfest?','Winterreifen, Schneeketten, Frostschutz prüfen')}
    let packAll=0,packOpen=0;g.forEach(x=>{if(/^Packliste/.test(x[0]))x[1].forEach(i=>{packAll++;if(!chk[i[0]])packOpen++})});
    const pack=iso(new Date(start.getTime()-864e5));
    if(packAll&&pack>=todayIso)add('pack','packen',{date:pack},'Packen',packOpen?packOpen+' von '+packAll+' Punkten offen · Ausweise und Versicherungskarten bereitlegen':'Packliste vollständig abgehakt','check');
    add('depart','abfahrt',{date:startIso,time:t.departTime||null,tz:null},'Abfahrt'+(t.departTime?' um '+t.departTime:''),t.origin?'ab '+t.origin:'');
  }
  /* Ohne Datum: offene Buchungsaufgaben, offene Erstattungen, unbekannte Stornogebühren (nie als 0 € oder Frist geraten) */
  (g[0]?g[0][1]:[]).forEach(i=>{if(!chk[i[0]])add(deadlineId('book',i[0]),'buchen',null,i[1],i[2]||'','check')});
  f.rows.forEach(r=>{
    if(r.refundOpen>0.005)add(deadlineId('refund',r.key),'erstattung',null,'Erstattung erwartet: '+r.label,eur(r.refundOpen)+' noch nicht zurück','kosten',r.refundOpen);
    if(r.cancelled&&r.unknown)add(deadlineId('cancelfee',r.key),'stornogebuehr',null,'Stornogebühr klären: '+r.label,'Betrag laut Anbieter eintragen','kosten');
  });
  if(f.stay&&f.stay.refundOpen>0.005)add(deadlineId('refund','stay'),'erstattung',null,'Erstattung erwartet: '+f.stay.label,eur(f.stay.refundOpen)+' noch nicht zurück','kosten',f.stay.refundOpen);
  if(f.stay&&f.stay.unknownFee)add(deadlineId('cancelfee','stay'),'stornogebuehr',null,'Stornogebühr klären: '+f.stay.label,'Betrag laut Anbieter eintragen','kosten');
  /* Reihenfolge: datiert chronologisch (am selben Tag Abfahrt zuletzt), dann ohne Frist in Erfassungsreihenfolge */
  const rank=d=>d.at?0:1,ms=d=>{const m=deadlineMs(d.at);return m==null?Infinity:m};
  return out.map((d,i)=>[d,i]).sort(([x,i],[y,j])=>rank(x)-rank(y)||(x.at&&y.at?x.at.date.localeCompare(y.at.date)||(x.kind==='abfahrt')-(y.kind==='abfahrt')||ms(x)-ms(y):0)||i-j).map(p=>p[0]);
}
/* Fristen über alle Reisen, z. B. „Diese Woche fällig“ (F11): offen, datiert, bis einschließlich today+days; Überfälliges zuerst */
function upcomingDeadlines(trips,now,days){
  now=now||new Date();const lim=iso(new Date(todayUTC(now).getTime()+(days==null?7:days)*864e5)),out=[];
  (trips||[]).forEach(t=>deadlines(t,now).forEach(d=>{if(d.at&&(d.state==='overdue'||d.state==='due')&&d.kind!=='abfahrt'&&d.at.date<=lim)out.push(Object.assign({trip:t.id,tripTitle:t.title},d))}));
  return out.sort((x,y)=>(y.state==='overdue')-(x.state==='overdue')||x.at.date.localeCompare(y.at.date)||String(x.tripTitle).localeCompare(String(y.tripTitle),'de'));
}
