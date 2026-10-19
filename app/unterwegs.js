/* Reiseplaner · Unterwegs, Kalender und Reisemappe.
   Teil 6 von 20 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Unterwegs, Kalender & Reisemappe =================
   Reine Ableitungen aus einer Reise. Kein neues Speicherfeld, rp-trips bleibt unverändert. */
const SLOTTIME={morgen:['0900','1200'],mittag:['1200','1400'],nachm:['1400','1800'],abend:['1800','2200']};
function todayUTC(now){now=now||new Date();return new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()))}
/* Phase einer Reise mit festem Datum: vor | unterwegs | nach. Ohne gültige Daten null. */
function tripPhase(t,now){
  if(t.dateMode!=='fix')return null;
  const a=pd(t.start),b=pd(t.end);if(!a||!b||b<a)return null;
  const d=todayUTC(now);
  if(d<a)return {phase:'vor',days:Math.round((a-d)/864e5)};
  if(d>b)return {phase:'nach',days:Math.round((d-b)/864e5)};
  return {phase:'unterwegs',day:Math.round((d-a)/864e5),of:daysOf(t).length};
}
function phaseText(ph){
  if(!ph)return '';
  if(ph.phase==='vor')return 'noch '+ph.days+(ph.days===1?' Tag':' Tage');
  if(ph.phase==='nach')return 'vorbei';
  if(ph.of===1)return 'heute ist es so weit';
  if(ph.day===0)return 'heute geht’s los · Tag 1 von '+ph.of;
  if(ph.day===ph.of-1)return 'Abreisetag · Tag '+ph.of+' von '+ph.of;
  return 'unterwegs · Tag '+(ph.day+1)+' von '+ph.of;
}
function dayItems(t,i){return sortedItems(t).filter(it=>it.day===i&&actOf(t,it.act))}
function actUrl(a){const u=a.link||(a.links&&a.links[0]&&a.links[0][1])||'';return /^https?:\/\//.test(u)?u:''}

/* iCalendar (RFC 5545): Zeilenende CRLF, Sonderzeichen maskiert, Zeilen nach 75 Byte gefaltet. */
function icsEsc(s){return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\r\n|\r|\n/g,'\\n')}
function icsFold(line){
  const out=[];let cur='',len=0;
  for(const ch of line){const cp=ch.codePointAt(0),n=cp<0x80?1:cp<0x800?2:cp<0x10000?3:4;
    if(len+n>(out.length?74:75)){out.push(cur);cur='';len=0}cur+=ch;len+=n}
  out.push(cur);return out.join('\r\n ');
}
/* Feld hours: bei Ideen des Winterkatalogs Text mit Öffnungszeiten, bei Umkreis-Katalog und eigenen Ideen Dauer in Stunden (Zahl).
   Nur der Text ist eine Zeitangabe zum Anzeigen; die Zahl liest actHours() als Dauer. */
function openHoursText(a){return a&&typeof a.hours==='string'?a.hours:''}
function icsData(t,now,opts){
  const a=pd(t.start),b=pd(t.end);
  if(t.dateMode!=='fix'||!a||!b||b<a)return null;
  const days=daysOf(t),pl=placeOf(t),st=stayOf(t),where=pl?pl.name:(t.dest||'');
  const stamp=(now||new Date()).toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
  const dt=d=>iso(d).replace(/-/g,'');
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Reiseplaner//DE','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+icsEsc(t.title)];
  let events=0,skipped=0;
  const ev=(id,props)=>{events++;L.push('BEGIN:VEVENT','UID:'+id+'@reiseplaner','DTSTAMP:'+stamp);props.filter(Boolean).forEach(p=>L.push(p));L.push('END:VEVENT')};
  ev(t.id+'-reise',['DTSTART;VALUE=DATE:'+dt(a),'DTEND;VALUE=DATE:'+dt(new Date(b.getTime()+864e5)),'SUMMARY:'+icsEsc(t.title),
    where?'LOCATION:'+icsEsc(where):'','DESCRIPTION:'+icsEsc('Unterkunft: '+(st?st.name:'noch offen')+'\nAus dem Reiseplaner exportiert. Planstand, keine Buchungsbestätigung.'),'TRANSP:TRANSPARENT']);
  sortedItems(t).forEach(it=>{const x=actOf(t,it.act),d=days[it.day];if(!x)return;if(!d||!d.date){skipped++;return}
    const w=SLOTTIME[it.slot]||SLOTTIME.nachm,tm=timeMin(it.time),u=actUrl(x),h=typeof x.hours==='number'&&x.hours>0?x.hours:(tm!=null?actHours(x):null);
    const startM=tm!=null?tm:(+w[0].slice(0,2))*60+(+w[0].slice(2));
    /* Kalenderdatum statt fester Millisekunden: auch Monats-/Jahres- und Sommerzeitwechsel.
       Ohne bekannte Dauer bleibt eine genaue Uhrzeit ein Start ohne erfundenes Ende. */
    const dateAt=m=>{const date=new Date(d.date);date.setUTCDate(date.getUTCDate()+Math.floor(m/1440));const v=m%1440;
      /* Zeitzone am Ziel gesetzt: Ortszeit dort als UTC ausgeben, damit jeder Kalender richtig umrechnet */
      if(validTz(t.tz))return new Date(zonedToUtc(iso(date),v,t.tz)).toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
      return dt(date)+'T'+String(Math.floor(v/60)).padStart(2,'0')+String(v%60).padStart(2,'0')+'00'};
    const endM=h?startM+Math.max(1,Math.round(h*60)):(tm==null?(+w[1].slice(0,2))*60+(+w[1].slice(2)):null);
    ev(t.id+'-'+it.uid,['DTSTART:'+dateAt(startM),endM!=null?'DTEND:'+dateAt(endM):'','SUMMARY:'+icsEsc(x.t),
      (x.map||x.ort||where)?'LOCATION:'+icsEsc(x.map||x.ort||where):'',
      'DESCRIPTION:'+icsEsc((tm!=null?'Geplante Uhrzeit: '+it.time+'. Öffnungszeiten beim Anbieter prüfen.':'Grobes Zeitfenster: '+(SLOTNAME[it.slot]||'')+'. Genaue Uhrzeit und Öffnungszeiten beim Anbieter prüfen.')+(h?'\nDauer ca. '+String(h).replace('.',',')+' Std. (Schätzung)':'')+(x.dur&&!h?'\nDauer: '+x.dur:'')+(openHoursText(x)?'\nLaut Katalog (unbestätigt): '+openHoursText(x):'')),
      u?'URL:'+u:'','STATUS:TENTATIVE','TRANSP:TRANSPARENT'])});
  Object.keys(t.ledger||{}).length&&financeSummary(t).due.forEach(d=>{const x=pd(d.due);ev(t.id+'-due-'+d.key.replace(/[^A-Za-z0-9-]/g,'-'),['DTSTART;VALUE=DATE:'+dt(x),'DTEND;VALUE=DATE:'+dt(new Date(x.getTime()+864e5)),'SUMMARY:'+icsEsc('Zahlung fällig: '+d.label+' ('+eur(d.open)+')'),'DESCRIPTION:'+icsEsc('Aus dem Zahlungsbuch der Reise „'+t.title+'“. Betrag laut eurer Erfassung.'),'TRANSP:TRANSPARENT'])});
  /* Erinnerungen (Plan D2): offene Zahlungen, Angebotsgültigkeit, Packtag, Winter-Check als ganztägige Termine mit Alarm um 9 Uhr */
  let reminders=0;
  if(opts&&opts.reminders){const dp=departurePlan(t,now);if(dp)dp.items.filter(x=>x.kind!=='abfahrt'&&!x.overdue).forEach((x,i)=>{reminders++;
    ev(t.id+'-erinnerung-'+x.kind+'-'+i+'-'+x.date,['DTSTART;VALUE=DATE:'+x.date.replace(/-/g,''),'DTEND;VALUE=DATE:'+dt(new Date(pd(x.date).getTime()+864e5)),'SUMMARY:'+icsEsc(x.label+' · '+t.title),
      'DESCRIPTION:'+icsEsc((x.detail?x.detail+'\n':'')+'Erinnerung aus dem Reiseplaner. Stand des Exports, Änderungen danach sind hier nicht enthalten.'),'TRANSP:TRANSPARENT',
      'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+icsEsc(x.label),'TRIGGER;RELATED=START:PT9H','END:VALARM'])})}
  /* Anreise-Abschnitte (Format 3): UTC nur bei eindeutigem Zeitpunkt, sonst ganztägig, ohne Datum kein Termin */
  if(v3Transport(t))V3.transportIcs(v3Transport(t),{tripId:t.id,now}).forEach(e=>{events++;L.push(...e)});
  L.push('END:VCALENDAR');
  return {text:L.map(icsFold).join('\r\n')+'\r\n',events,skipped,reminders};
}
/* Kurzfassung als Text, z. B. für Messenger. Notizen nur auf ausdrücklichen Wunsch (Buchungsnummern). */
function tripText(t,opts){
  const o=opts||{},days=daysOf(t),pl=placeOf(t),st=stayOf(t),c=cost(t),L=[];
  L.push(t.title,rangeText(t)+' · '+c.P+(c.P===1?' Person':' Personen'));
  if(tripTooLong(t))L.push('Hinweis: Zeitraum prüfen, '+tripDayCount(t).toLocaleString('de-DE')+' Tage sind vermutlich ein Tippfehler im Datum.');
  L.push('Ziel: '+(pl?pl.name:(t.dest||'noch offen')));
  L.push('Unterkunft: '+(st?st.name+(st.ort?' ('+st.ort+')':''):'noch offen'));
  if(Array.isArray(t.legs)&&t.legs.length)L.push('Etappen: '+t.legs.map(l=>l.name+' ('+num(l.nights,1)+' N.)').join(' → '));
  L.push('','Tagesplan:');
  let any=false;
  /* Nur Tage mit Punkten (einmal gruppiert): auch sehr lange Reisen bleiben schnell und vollständig */
  const byDay=new Map();sortedItems(t).forEach(it=>{if(it.day>=0&&it.day<days.length&&actOf(t,it.act)){if(!byDay.has(it.day))byDay.set(it.day,[]);byDay.get(it.day).push(it)}});
  [...byDay.keys()].sort((x,y)=>x-y).map(i=>days[i]).forEach(d=>{const its=byDay.get(d.i);any=true;
    L.push('• '+d.label+': '+its.map(it=>(it.time||SLOTNAME[it.slot])+' '+actOf(t,it.act).t).join(' · '));const ru=dayRouteUrl(t,d.i);if(ru)L.push('  Route: '+ru)});
  if(!any)L.push('• noch nichts eingeplant');
  const late=sortedItems(t).filter(it=>it.day>=days.length&&actOf(t,it.act)).length;
  if(late)L.push('• '+late+' Punkt(e) liegen nach dem letzten Reisetag');
  L.push('','Kosten (Planwert, kein bestätigter Preis): ≈ '+eur(c.total)+' gesamt · ≈ '+eur(c.total/c.P)+' pro Person');
  const oc=openCosts(t);if(oc.length)L.push('Noch offen: '+oc.join(' · '));
  if(o.notes&&String(t.notes||'').trim())L.push('','Notizen:',String(t.notes).trim());
  return L.join('\n');
}
/* Schlechtwetter: Indoor-Ideen aus dem Katalog, die an diesem Tag nicht schon geplant sind
   und laut Katalogregeln (Wochentag, Sonderöffnungszeiten, Silvester-Termine) zum Datum passen. */
function fitsDay(a,d,slot){
  if(!d)return false;
  if(a.onlyDate&&d.md!==a.onlyDate)return false;
  if(a.dow&&d.date&&!a.dow.includes(d.date.getUTCDay()))return false;
  if((a.rules||[]).some(r=>d.md===r.date&&r.bad.includes(slot||a.slot)))return false;
  return true;
}
function rainIdeas(t,i,max){
  const d=daysOf(t)[i];if(!d)return [];
  const st=stayOf(t),planned=new Set(dayItems(t,i).map(it=>it.act));
  return actsFor(t).filter(a=>a.indoor&&!planned.has(a.id)&&fitsDay(a,d)&&!(a.needSauna&&st&&!st.sauna)&&!(a.kitchen&&st&&!st.kitchen))
    .sort((a,b)=>(a.warn?1:0)-(b.warn?1:0)||(num(a.km,0)-num(b.km,0)))
    .slice(0,max||3);
}
