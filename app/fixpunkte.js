/* Reiseplaner · Fixpunkte, Puffer und Realismus im Tagesplan (docs/FIXPUNKTE_PUFFER.md).
   Teil der App (klassisches Skript ohne Bundler, gemeinsamer globaler Gültigkeitsbereich, Reihenfolge aus index.html).
   Lädt nach app/tagesplan.js und nutzt zur Laufzeit dayLoad, transferGaps, arrivalMin, activityCommitted, v3Transport.
   Optional, wenn vorhanden: styleOf(t).pace (app/reisestil.js) und dayWays(t,day) (app/wege.js).
   Reine Ableitung: liest die Reise, schreibt nichts. Kein neues Speicherfeld; die Format-5-Felder items[i].fix,
   t.keepFree und t.pace werden gelesen, sobald es sie gibt. */
"use strict";
/* Tempo: wie viel ein Tag verträgt. share = Anteil der Tageskapazität, der frei bleiben soll. */
const FIX_PACE={
  ruhig:{label:'ruhig',maxPoints:2,share:0.4,freeSlot:true},
  normal:{label:'normal',maxPoints:3,share:0.25,freeSlot:true},
  aktiv:{label:'aktiv',maxPoints:5,share:0.1,freeSlot:false}
};
/* Richtwerte für Puffer vor einem Fixpunkt in Minuten (unverbindlich). Flug wie V3.RULES.airportBuffer. */
const FIX_BUFFER={flug:120,bahn:15,bus:15,faehre:15,transfer:15,mietwagen:15,termin:15,datum:15};
const FIX_STATES={konflikt:{rank:6,label:'Konflikt'},ueberladen:{rank:5,label:'überladen'},knapp:{rank:4,label:'Puffer knapp'},voll:{rank:3,label:'voll'},unsicher:{rank:2,label:'nicht sicher'},ausgewogen:{rank:1,label:'mit Luft'},frei:{rank:0,label:'frei'}};
const FIX_MODES={auto:'Auto',bahn:'Bahn',flug:'Flug',bus:'Fernbus',faehre:'Fähre',mietwagen:'Mietwagen',transfer:'Transfer',taxi:'Taxi',rad:'Fahrrad'};
const FIX_WHY={erholung:'Erholung',wetter:'Wetter-Reserve',spontan:'Spontanes'};

function fixPace(t){
  try{if(typeof styleOf==='function'){const s=styleOf(t);if(s&&FIX_PACE[s.pace])return s.pace}}catch(e){}
  return t&&FIX_PACE[t.pace]?t.pace:'normal';
}
const fixHrs=v=>String(Math.round(v*10)/10).replace('.',',');
const fixSlotOf=m=>m==null?null:m<720?'morgen':m<840?'mittag':m<1080?'nachm':'abend';
function fixDayIndex(t,date,fallback){
  const days=daysOf(t);
  if(t.dateMode==='fix'&&date){const k=days.findIndex(d=>d.date&&iso(d.date)===date);return k}
  return fallback;
}
function fixActWhy(t,it,a){
  if(it.fix===true)return 'von Hand festgelegt';
  const e=(t.ledger||{})['act:'+it.act];
  if(e&&num(e.paid,0)>0)return 'bezahlt';
  if(e&&e.status==='gebucht'||t.check&&t.check['b-'+it.act])return 'gebucht';
  if(e&&e.status==='angefragt')return 'angefragt';
  if(e&&e.due)return 'Zahlung fällig';
  if(a&&a.onlyDate)return 'nur an diesem Tag';
  return '';
}
/* Alle Fixpunkte der Reise, nach Tag. Felder: id, day, kind, label, why, time (HH:MM|null), start/end (Minuten|null),
   buffer (Minuten davor), uid (bei Programmpunkten), point (nur Zeitpunkt „ab“, keine Überschneidungsprüfung),
   soft (Zeit offen, aber kein Prüfmangel). */
function fixPoints(t){
  const days=daysOf(t),last=days.length-1,out=[];
  const add=f=>{if(f.day>=0&&f.day<=last)out.push(f)};
  const tr=typeof v3Transport==='function'?v3Transport(t):null;
  if(tr){
    ['out','back'].forEach(dir=>(tr[dir]||[]).forEach((s,i)=>{
      if(!s||!s.dep)return;const dm=timeMin(s.dep.time),am=s.arr&&s.arr.date===s.dep.date?timeMin(s.arr.time):null;
      const day=fixDayIndex(t,s.dep.date,dir==='out'?0:last);
      add({id:'tr:'+(s.id||dir+i),day,kind:'transport',mode:s.mode,dir,label:(FIX_MODES[s.mode]||'Abschnitt')+(s.number?' '+s.number:'')+(s.from||s.to?' '+[s.from,s.to].filter(Boolean).join(' → '):''),
        why:dir==='out'?'Hinweg':'Rückweg',time:dm==null?null:s.dep.time,start:dm,end:dm==null?null:am!=null&&am>=dm?am:s.arr&&s.arr.date&&s.arr.date>s.dep.date?1440:null,
        buffer:FIX_BUFFER[s.mode]||0,arrTime:s.arr&&s.arr.time||null});
    }));
  }else if(timeMin(t.departTime)!=null){
    const m=timeMin(t.departTime),arr=typeof arrivalMin==='function'?arrivalMin(t):null;
    add({id:'anreise',day:0,kind:'anreise',label:'Abfahrt'+(t.origin?' ab '+t.origin:''),why:'Anreise',time:t.departTime,start:m,end:arr!=null&&arr>m?Math.min(arr,1440):null,estimate:true,buffer:0});
  }
  if(timeMin(t.checkinTime)!=null)add({id:'checkin',day:0,kind:'checkin',label:'Check-in ab '+t.checkinTime,why:'Unterkunft',time:t.checkinTime,start:timeMin(t.checkinTime),end:null,point:true,buffer:0});
  if(last>0&&!(tr&&(tr.back||[]).length))add({id:'abreise',day:last,kind:'abreise',label:'Abreise',why:'Heimfahrt',time:null,start:null,end:null,soft:true,buffer:0});
  sortedItems(t).forEach(it=>{
    const a=actOf(t,it.act);if(!a||a.transit)return;
    const committed=typeof activityCommitted==='function'&&activityCommitted(t,it.act);
    if(!(committed||a.onlyDate||(it.fix===true&&timeMin(it.time)!=null)))return;
    const m=timeMin(it.time),h=actHours(a);
    add({id:'it:'+it.uid,day:it.day,kind:committed||it.fix===true?'termin':'datum',label:a.t,why:fixActWhy(t,it,a),time:m==null?null:it.time,start:m,end:m!=null&&h!=null?Math.min(1440,m+Math.round(h*60)):null,uid:it.uid,buffer:FIX_BUFFER[committed||it.fix===true?'termin':'datum']});
  });
  return out.sort((x,y)=>x.day-y.day||(x.start??9999)-(y.start??9999));
}
/* Wegminuten von Punkt a nach Punkt b (uids), wenn bekannt: zuerst dayWays (Routen-Thread), sonst transferGaps. */
function fixWayMin(t,day,fromUid,toUid,gaps){
  try{if(typeof dayWays==='function'){const w=dayWays(t,day),legs=w&&Array.isArray(w.legs)?w.legs:[];
    /* app/wege.js: Abschnitte in Planreihenfolge, Ziel über toUid; der Abschnitt zum Fixpunkt beginnt am Punkt davor */
    const l=legs.find(l=>l&&l.toUid===toUid&&(l.fromUid==null||l.fromUid===fromUid));if(l&&Number.isFinite(+l.min))return +l.min}}catch(e){}
  const g=(gaps||[]).find(g=>g.from&&g.to&&g.from.it.uid===fromUid&&g.to.it.uid===toUid);
  return g&&Number.isFinite(g.need)?g.need:null;
}
function fixKeepFree(t){return Array.isArray(t.keepFree)?t.keepFree.filter(k=>k&&Number.isInteger(k.day)&&SLOTNAME[k.slot]):[]}
/* Bewertung eines Tages. Gibt {day, fixed, issues, buffers, points, planned, cap, free, freeSlots, kept, state, label,
   reasons} zurück. issues[i] = {level:'konflikt'|'knapp'|'unsicher', text, uid?, fix?}. */
function fixDayEval(t,day,ctx){
  ctx=ctx||{};const pace=FIX_PACE[ctx.pace||fixPace(t)],L=(ctx.load||dayLoad(t))[day]||{planned:0,unknown:0,drive:0,cap:10,over:false};
  const fixed=(ctx.points||fixPoints(t)).filter(f=>f.day===day),fixUids=new Set(fixed.map(f=>f.uid).filter(Boolean));
  const gaps=ctx.gaps||(typeof transferGaps==='function'?transferGaps(t):[]);
  const items=sortedItems(t).filter(it=>it.day===day).map(it=>({it,a:actOf(t,it.act)})).filter(x=>x.a&&!x.a.transit);
  const timed=items.map(x=>{const s=timeMin(x.it.time),h=actHours(x.a);return {uid:x.it.uid,title:x.a.t,start:s,end:s!=null&&h!=null?Math.min(1440,s+Math.round(h*60)):null,fix:fixUids.has(x.it.uid),slot:x.it.slot}});
  const issues=[],seen=new Set(),buffers=[];
  const push=(level,text,key,uid,fix)=>{if(seen.has(key))return;seen.add(key);issues.push({level,text,uid,fix})};
  const span=x=>minTime(x.start)+(x.end!=null?'–'+minTime(x.end):'');
  fixed.forEach(f=>{
    if(f.start==null){if(!f.soft)push('unsicher',f.label+': Uhrzeit fehlt. Ohne Uhrzeit ist keine Konfliktprüfung möglich.','nt:'+f.id,f.uid,f.id);return}
    if(f.point)return;
    const others=timed.filter(x=>x.uid!==f.uid);
    /* Überschneidungen */
    others.forEach(x=>{
      if(x.start==null)return;
      const fe=f.end!=null?f.end:f.start+1;
      if(f.kind==='transport'&&f.dir==='back'&&x.start>=f.start){push('konflikt',x.title+' ('+minTime(x.start)+') liegt nach der Abfahrt des Rückwegs ('+f.time+').','bk:'+f.id+x.uid,x.uid,f.id);return}
      if(f.kind==='anreise'){if(f.end!=null&&x.start<f.end&&x.start>=f.start)push('knapp',x.title+' ('+minTime(x.start)+') beginnt vor der geschätzten Ankunft (ca. '+minTime(f.end)+', Schätzung).','an:'+x.uid,x.uid,f.id);return}
      const xe=x.end!=null?x.end:null;
      if(x.start>=f.start&&x.start<fe){const k=[f.id,'it:'+x.uid].sort().join('|');push('konflikt',x.title+' ('+span(x)+') überschneidet sich mit '+f.label+' ('+span(f)+').','ov:'+k,x.uid,f.id);return}
      if(x.start<f.start&&xe!=null&&xe>f.start){const k=[f.id,'it:'+x.uid].sort().join('|');push('konflikt',x.title+' ('+span(x)+') überschneidet sich mit '+f.label+' ('+span(f)+').','ov:'+k,x.uid,f.id)}
    });
    if(f.kind==='anreise')return;
    /* Puffer: der letzte Punkt mit Uhrzeit vor dem Fixpunkt */
    const before=others.filter(x=>x.start!=null&&x.start<f.start).sort((p,q)=>p.start-q.start).pop();
    if(!before){buffers.push({fix:f.id,need:f.buffer,have:null,ok:true});return}
    if(before.end==null){push('unsicher',before.title+' hat keine Dauer: ob es vor '+f.label+' ('+f.time+') endet, lässt sich nicht prüfen.','nd:'+before.uid+f.id,before.uid,f.id);buffers.push({fix:f.id,need:f.buffer,have:null,ok:null});return}
    if(before.end>f.start)return; /* schon als Überschneidung gemeldet */
    const way=f.uid?fixWayMin(t,day,before.uid,f.uid,gaps):null,need=f.buffer+(way||0),have=f.start-before.end;
    const ok=have>=need;buffers.push({fix:f.id,need,have,way,ok});
    if(!ok)push('knapp','Vor '+f.label+' ('+f.time+') nur '+have+' Min. frei nach '+before.title+', empfohlen '+need+' Min.'+(way?' (davon ≈ '+way+' Min. Weg)':'')+'.','bf:'+f.id,before.uid,f.id);
    /* Punkte ohne Uhrzeit in derselben Tageszeit */
  });
  fixed.forEach(f=>{if(f.start==null||f.point)return;const sl=fixSlotOf(f.start);
    timed.filter(x=>x.start==null&&x.slot===sl&&x.uid!==f.uid).forEach(x=>push('unsicher',x.title+' hat keine Uhrzeit: ob es mit '+f.label+' ('+f.time+') zusammenpasst, lässt sich nicht prüfen.','nt2:'+x.uid+f.id,x.uid,f.id))});
  /* Bewusst freigehaltene Tageszeiten (Format 5, t.keepFree) */
  const kept=fixKeepFree(t).filter(k=>k.day===day);
  kept.forEach(k=>{if(items.some(x=>x.it.slot===k.slot))push('knapp',SLOTNAME[k.slot]+' war als freie Zeit ('+(FIX_WHY[k.why]||'frei')+') vorgesehen und ist jetzt verplant.','kf:'+k.slot)});
  const used=new Set((t.items||[]).filter(i=>i.day===day).map(i=>i.slot));
  const freeSlots=SLOTS.map(s=>s[0]).filter(k=>!used.has(k));
  const points=items.length,cap=L.cap,free=Math.max(0,Math.round((cap-L.planned)*10)/10);
  const reasons=[];let state=points||fixed.some(f=>!f.soft)?'ausgewogen':'frei';
  const worse=s=>{if(FIX_STATES[s].rank>FIX_STATES[state].rank)state=s};
  if(issues.some(i=>i.level==='konflikt'))worse('konflikt');
  if(L.over){worse('ueberladen');reasons.push('Programm ≈ '+fixHrs(L.planned)+' Std., Platz für ≈ '+fixHrs(cap)+' Std.'+(L.drive?' (nach '+fixHrs(L.drive/60)+' Std. Fahrt)':''))}
  if(issues.some(i=>i.level==='knapp'))worse('knapp');
  if(points>pace.maxPoints){worse('voll');reasons.push(points+' Programmpunkte, bei Tempo „'+pace.label+'“ sind bis '+pace.maxPoints+' entspannt.')}
  if(points&&!L.over&&free<pace.share*cap-0.05){worse('voll');reasons.push('Nur ≈ '+fixHrs(free)+' Std. frei, Richtwert ≥ '+fixHrs(pace.share*cap)+' Std. zum Atemholen.')}
  if(points&&pace.freeSlot&&!freeSlots.length){worse('voll');reasons.push('Keine Tageszeit bleibt frei.')}
  if(L.unknown){worse('unsicher');reasons.push(L.unknown+'× Dauer offen: die freie Zeit ist nur eine Untergrenze der Planung.')}
  if(issues.some(i=>i.level==='unsicher'))worse('unsicher');
  return {day,fixed,issues,buffers,points,planned:L.planned,cap,free,drive:L.drive,freeSlots,kept,state,label:FIX_STATES[state].label,reasons,pace:pace.label};
}
/* Ganze Reise: Tage, Hinweise über mehrere Tage und Vorschläge. Gemerkt je Reiseobjekt, solange es sich nicht ändert. */
const FIX_CACHE=new WeakMap();
function fixTrip(t){
  const key=JSON.stringify(t)+'|'+fixPace(t)+'|'+(typeof wegeVersion!=='undefined'?wegeVersion:''),hit=FIX_CACHE.get(t);if(hit&&hit.key===key)return hit.res;
  const pace=fixPace(t),load=dayLoad(t),points=fixPoints(t),gaps=typeof transferGaps==='function'?transferGaps(t):[];
  const days=daysOf(t).map(d=>Object.assign(fixDayEval(t,d.i,{pace,load,points,gaps}),{dayLabel:d.label}));
  const notes=[],tight=s=>['konflikt','ueberladen','knapp','voll'].includes(s);
  let run=0,start=0;days.forEach((d,i)=>{if(tight(d.state)){if(!run)start=i;run++}else run=0;
    if(run===3)notes.push({level:'hinweis',text:'Drei volle Tage hintereinander ab '+days[start].dayLabel+': einen ruhigen Tag oder freien Nachmittag dazwischen einplanen.'})});
  const halfFree=days.reduce((n,d)=>n+d.freeSlots.length,0);
  if(days.length>=3&&!halfFree)notes.push({level:'hinweis',text:'Keine einzige Tageszeit ist frei. Für Wetterumschwünge und spontane Entdeckungen mindestens einen Halbtag freihalten.'});
  const last=days[days.length-1];
  if(days.length>1){
    const tr=typeof v3Transport==='function'?v3Transport(t):null,back=tr&&(tr.back||[]),home=back&&back.length?back[back.length-1]:null;
    if(home&&home.arr&&timeMin(home.arr.time)!=null)notes.push({level:'info',text:'Ankunft zuhause laut Rückweg: '+home.arr.time+(home.arr.date?' am '+fmtLong(pd(home.arr.date)):'')+'.'});
    else notes.push({level:'info',text:'Abfahrtszeit am Abreisetag offen: Heimkehr und Erholungszeit danach lassen sich noch nicht planen.'});
    if(last.planned>3)notes.push({level:'hinweis',text:'Am Abreisetag ≈ '+fixHrs(last.planned)+' Std. Programm. Nach der Rückkehr bleibt wenig Zeit zum Ankommen.'});
  }
  /* Vorschläge: je vollem Tag ein verschiebbarer Punkt auf den Tag mit der meisten freien Zeit */
  const suggestions=[];
  days.forEach(d=>{
    if(!tight(d.state)||d.state==='konflikt'&&!d.reasons.length)return;
    const fixU=new Set(d.fixed.map(f=>f.uid).filter(Boolean));
    const cand=sortedItems(t).filter(it=>it.day===d.day&&!fixU.has(it.uid)).map(it=>({it,a:actOf(t,it.act)})).filter(x=>x.a&&!x.a.transit)
      .sort((x,y)=>(x.it.time?1:0)-(y.it.time?1:0)||(actHours(y.a)??0)-(actHours(x.a)??0))[0];
    if(!cand)return;const h=actHours(cand.a)||0;
    const target=days.filter(o=>o.day!==d.day&&o.day<VIEW_DAYS&&!tight(o.state)&&o.free>=h+(FIX_PACE[pace].share*o.cap)).sort((x,y)=>y.free-x.free)[0];
    suggestions.push({day:d.day,uid:cand.it.uid,title:cand.a.t,toDay:target?target.day:null,toLabel:target?target.dayLabel:''});
  });
  const res={pace,paceLabel:FIX_PACE[pace].label,days,notes,suggestions,points};
  FIX_CACHE.set(t,{key,res});
  return res;
}

/* ================= Darstellung ================= */
function fixIsBad(s){return FIX_STATES[s]&&FIX_STATES[s].rank>=2}
/* Kennzeichen vor dem Titel eines Programmpunkts, der ein Fixpunkt ist */
function fixItemMark(t,it){
  try{const f=fixTrip(t).points.find(p=>p.uid===it.uid);if(!f)return '';
    return '<span class="badge fixmark" title="Fixpunkt: '+esc(f.why||'fester Termin')+'"><span class="vh">Fixpunkt: </span>Fix</span> '}catch(e){return ''}
}
/* Eine Zeile im Tageskopf: Fixpunkte, freie Zeit, Zustand in Worten */
function fixDayBadge(t,day){
  try{const d=fixTrip(t).days[day];if(!d)return '';
    const n=d.fixed.filter(f=>!f.soft).length,bad=fixIsBad(d.state);
    if(d.state==='frei'&&!n)return ''; /* „frei“ zeigt der Tageskopf schon */
    const parts=[n?n+' Fixpunkt'+(n===1?'':'e'):'',d.points?'frei ≈ '+fixHrs(d.free)+' Std.':'',d.label];
    return '<span class="dload fixday'+(['konflikt','ueberladen','knapp'].includes(d.state)?' over':'')+'" data-fix-state="'+d.state+'">'+(bad?'! ':'')+esc(parts.filter(Boolean).join(' · '))+'</span>'}catch(e){return ''}
}
const FIX_LEVEL={konflikt:'Konflikt',knapp:'Knapp',unsicher:'Nicht prüfbar'};
function fixSection(t){
  let r;try{r=fixTrip(t)}catch(e){return ''}
  const view=viewDays(t).map(d=>r.days[d.i]).filter(Boolean),canEdit=!(Store.isAccount()&&!Store.canEdit(t.id));
  const noteHtml=r.notes.length?'<ul class="plain small">'+r.notes.map(n=>'<li>'+(n.level==='hinweis'?'<b>Hinweis:</b> ':'')+esc(n.text)+'</li>').join('')+'</ul>':'';
  const fixLine=f=>'<li><b class="num">'+esc(f.time||(f.soft?'Uhrzeit offen':'– : –'))+'</b> '+esc(f.label)+(f.why?' <span class="small muted">· '+esc(f.why)+'</span>':'')+
    (f.end!=null&&!f.point?' <span class="small muted">· bis '+(f.estimate?'ca. ':'')+minTime(f.end)+(f.estimate?' (Schätzung)':'')+'</span>':'')+
    (f.buffer?' <span class="small muted">· Puffer davor '+f.buffer+' Min. (Richtwert)</span>':'')+'</li>';
  const dayHtml=d=>{
    const sug=r.suggestions.find(s=>s.day===d.day),bad=fixIsBad(d.state);
    return '<details class="panel fixday-panel"'+(bad?' open':'')+' data-fix-day="'+d.day+'"><summary><b>'+esc(d.dayLabel)+'</b> · '+(bad?'! ':'')+esc(d.label)+
      ' <span class="small muted">· '+(d.points?d.points+' Punkt'+(d.points===1?'':'e')+', ≈ '+fixHrs(d.free)+' von '+fixHrs(d.cap)+' Std. frei':'kein Programm geplant')+'</span></summary>'+
      (d.fixed.length?'<ul class="plain small">'+d.fixed.map(fixLine).join('')+'</ul>':'<p class="small muted">Keine Fixpunkte. Alles an diesem Tag ist verschiebbar.</p>')+
      (d.issues.length?'<ul class="plain small" role="list">'+d.issues.map(i=>'<li><b>'+FIX_LEVEL[i.level]+':</b> '+esc(i.text)+(i.uid&&canEdit?' <button type="button" class="lnk" data-act="item" data-val="'+esc(i.uid)+'">Zeit ändern</button>':'')+'</li>').join('')+'</ul>':'')+
      (d.reasons.length?'<ul class="plain small">'+d.reasons.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+
      (d.freeSlots.length&&d.points?'<p class="small">Frei: '+esc(d.freeSlots.map(k=>SLOTNAME[k]).join(', '))+(d.kept.length?' · bewusst freigehalten: '+esc(d.kept.map(k=>SLOTNAME[k.slot]+' ('+(FIX_WHY[k.why]||'frei')+')').join(', ')):'')+'</p>':'')+
      (sug&&canEdit?'<p class="small"><b>Vorschlag:</b> '+esc(sug.title)+(sug.toDay!=null?' auf '+esc(sug.toLabel)+' verschieben, dort ist am meisten Luft.':' verschieben oder weglassen.')+' <button type="button" class="lnk" data-act="item" data-val="'+esc(sug.uid)+'">Verschieben …</button></p>':'')+
      fixDayTools(t,d)+'</details>'};
  return '<section class="block" id="fixpunkte" aria-labelledby="fix-h"><h2 id="fix-h">Fixpunkte & Puffer</h2>'+
    '<p class="small muted">Fixpunkte sind Termine, die nicht wandern: Abfahrt, Check-in, gebuchte oder bezahlte Programmpunkte, Termine mit festem Datum. Davor plant die App einen Puffer ein (Richtwerte, unverbindlich). Ohne Uhrzeit gilt ein Tag nie als sicher konfliktfrei. Tempo dieser Reise: <b>'+esc(r.paceLabel)+'</b>.</p>'+
    noteHtml+view.map(dayHtml).join('')+longTripNote(t,'Die Übersicht')+'</section>';
}
/* ================= Schreiben (Format 5, über den gemeinsamen Weg f5Commit aus app/format5.js) ================= */
function fixCanWrite(t){return typeof f5CanEdit==='function'&&f5CanEdit(t)}
/* Programmpunkt von Hand als Fixpunkt markieren oder lösen. Nur mit Uhrzeit; gebuchte Punkte sind ohnehin fix. */
function fixSetFix(t,uid,on,opt){
  return f5Commit(t,c=>{const it=(c.items||[]).find(i=>i.uid===uid);if(!it)throw new Error('Programmpunkt nicht mehr vorhanden.');
    if(on){if(timeMin(it.time)==null)throw new Error('Zuerst eine Uhrzeit eintragen: ein Fixpunkt ohne Uhrzeit lässt sich nicht prüfen.');it.fix=true}else delete it.fix},opt);
}
/* Tageszeit bewusst freihalten (why) oder wieder freigeben (why null) */
function fixSetKeepFree(t,day,slot,why,opt){
  if(!Number.isInteger(day)||day<0||day>=daysOf(t).length||!SLOTNAME[slot])throw new Error('Tag oder Tageszeit ungültig.');
  if(why!=null&&!FIX_WHY[why])throw new Error('Grund ungültig.');
  return f5Commit(t,c=>{const k=(Array.isArray(c.keepFree)?c.keepFree:[]).filter(x=>!(x.day===day&&x.slot===slot));
    if(why)k.push({day,slot,why});k.sort((a,b)=>a.day-b.day||SLOTS.findIndex(s=>s[0]===a.slot)-SLOTS.findIndex(s=>s[0]===b.slot));
    if(k.length>100)throw new Error('Höchstens 100 freigehaltene Tageszeiten.');
    if(k.length)c.keepFree=k;else delete c.keepFree},opt);
}
/* Bedienelemente je Tag im Abschnitt „Fixpunkte & Puffer“ */
function fixDayTools(t,d){
  if(!fixCanWrite(t))return '';
  const fixU=new Set(d.fixed.filter(f=>f.uid&&f.why!=='von Hand festgelegt').map(f=>f.uid));
  const its=sortedItems(t).filter(it=>it.day===d.day).map(it=>({it,a:actOf(t,it.act)})).filter(x=>x.a&&!x.a.transit&&!fixU.has(x.it.uid));
  const fixBtns=its.filter(x=>x.it.fix===true||timeMin(x.it.time)!=null).map(x=>x.it.fix===true
    ?'<button type="button" class="lnk" data-fix-act="unfix" data-uid="'+esc(x.it.uid)+'">'+esc(x.a.t)+': nicht mehr fix</button>'
    :'<button type="button" class="lnk" data-fix-act="fix" data-uid="'+esc(x.it.uid)+'">'+esc(x.a.t)+' ('+esc(x.it.time)+') als Fixpunkt</button>');
  const keptK=new Set(d.kept.map(k=>k.slot));
  const keepBtns=d.freeSlots.filter(k=>!keptK.has(k)).map(k=>'<button type="button" class="lnk" data-fix-act="keep" data-day="'+d.day+'" data-slot="'+k+'">'+esc(SLOTNAME[k])+' freihalten</button>');
  const unkeep=d.kept.map(k=>'<button type="button" class="lnk" data-fix-act="unkeep" data-day="'+d.day+'" data-slot="'+k.slot+'">'+esc(SLOTNAME[k.slot])+' ('+esc(FIX_WHY[k.why]||'frei')+') wieder verplanbar</button>');
  if(!fixBtns.length&&!keepBtns.length&&!unkeep.length)return '';
  return '<div class="fix-tools small">'+(fixBtns.length?'<p><b>Fest machen:</b> '+fixBtns.join(' · ')+'</p>':'')+
    (keepBtns.length||unkeep.length?'<p><b>Bewusst frei:</b> '+(keepBtns.length?'<label class="small">Grund <select data-fix-why="'+d.day+'" style="width:auto;display:inline-block;min-height:36px" aria-label="Grund fürs Freihalten am '+esc(d.dayLabel)+'">'+Object.keys(FIX_WHY).map(k=>'<option value="'+k+'">'+FIX_WHY[k]+'</option>').join('')+'</select></label> ':'')+keepBtns.concat(unkeep).join(' · ')+'</p>':'')+'</div>';
}
if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('click',e=>{
  const el=e.target&&e.target.closest&&e.target.closest('[data-fix-act]');if(!el)return;
  const t=typeof cur==='function'&&cur();if(!t)return;
  const act=el.getAttribute('data-fix-act'),uid=el.getAttribute('data-uid'),day=Number(el.getAttribute('data-day')),slot=el.getAttribute('data-slot');
  try{
    let run,msg;
    if(act==='fix'||act==='unfix'){const on=act==='fix';run=o=>fixSetFix(t,uid,on,o);msg=on?'Als Fixpunkt markiert.':'Nicht mehr fix.'}
    else if(act==='keep'){const sel=document.querySelector('[data-fix-why="'+day+'"]'),why=sel&&FIX_WHY[sel.value]?sel.value:'erholung';run=o=>fixSetKeepFree(t,day,slot,why,o);msg=SLOTNAME[slot]+' bleibt frei ('+FIX_WHY[why]+').'}
    else if(act==='unkeep'){run=o=>fixSetKeepFree(t,day,slot,null,o);msg=SLOTNAME[slot]+' ist wieder verplanbar.'}
    else return;
    const r=run();
    if(f5Result(r,{run,msg})){render();alertMsg(msg)}
  }catch(err){alertMsg(err.message)}
});
try{if(typeof window!=='undefined')window.RPFix={fixSetFix,fixSetKeepFree,fixDayTools,fixPoints,fixDayEval,fixTrip,fixPace,fixSection,fixDayBadge,fixItemMark,PACE:FIX_PACE,BUFFER:FIX_BUFFER,STATES:FIX_STATES}}catch(e){}
