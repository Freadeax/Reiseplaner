/* Reiseplaner · Reise-Logik (Tage, Orte, Unterkunft, Plan).
   Teil 2 von 26 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Reise-Logik ================= */
function nightsOf(t){if(t.dateMode==='fix'){const a=pd(t.start),b=pd(t.end);if(a&&b&&b>=a)return Math.round((b-a)/864e5)}return Math.max(0,Math.round(num(t.nights,3)))}
/* Reisedauer (Paket 1, 18.10.): Eingabe und Bearbeitung höchstens MAX_TRIP_DAYS Reisetage (365 Nächte).
   Gespeicherte längere Reisen (z. B. Tippfehler im Jahr) werden weiter geladen, angezeigt und exportiert, nie gekürzt;
   sie tragen den Hinweis „Zeitraum prüfen“. Rechenintensive Ansichten bauen höchstens VIEW_DAYS Tage auf (viewDays).
   daysOf() liefert weiterhin alle Tage (Kosten, Zuordnung der Punkte) und merkt sich die letzten Ergebnisse je Zeitraum
   (auch für Kopien einer Reise), damit wiederholte Aufrufe nicht jedes Mal tausende Tage neu erzeugen.
   Das gelieferte Feld und seine Tage nicht verändern. */
const MAX_TRIP_DAYS=366, VIEW_DAYS=366, DAYS_CACHE=new Map();
function daysOf(t){
  const key=[t.dateMode,t.start,t.end,t.nights].join('|');
  if(DAYS_CACHE.has(key))return DAYS_CACHE.get(key);
  const n=nightsOf(t)+1, out=[], a=pd(t.start);
  for(let i=0;i<n;i++){
    if(t.dateMode==='fix'&&a){const d=new Date(a.getTime()+i*864e5);out.push({i,date:d,label:fmtD(d),md:iso(d).slice(5)})}
    else out.push({i,date:null,label:'Tag '+(i+1),md:''});
  }
  if(DAYS_CACHE.size>=16)DAYS_CACHE.delete(DAYS_CACHE.keys().next().value);
  DAYS_CACHE.set(key,out);
  return out;
}
function tripDayCount(t){return nightsOf(t)+1}
function tripTooLong(t){return tripDayCount(t)>MAX_TRIP_DAYS}
/* Eingabeprüfung für neue Reisen und Eckdaten: Fehlermeldung oder '' */
function tripLengthError(t){
  if(!tripTooLong(t))return '';
  return 'Eine Reise kann höchstens '+MAX_TRIP_DAYS+' Tage dauern ('+(MAX_TRIP_DAYS-1)+' Nächte). Eingegeben sind '+tripDayCount(t).toLocaleString('de-DE')+' Tage. Bitte '+(t.dateMode==='fix'?'An- und Abreisedatum, besonders das Jahr,':'die Zahl der Nächte')+' prüfen.';
}
/* Für Ansichten: höchstens VIEW_DAYS Tage, dazu ein sichtbarer Hinweis, wenn Tage fehlen */
function viewDays(t){const all=daysOf(t);return all.length>VIEW_DAYS?all.slice(0,VIEW_DAYS):all}
function longTripNote(t,what){
  if(!tripTooLong(t))return '';
  const n=tripDayCount(t);
  return '<div class="note" role="note" data-trip-long><b>Zeitraum prüfen:</b> Diese Reise dauert '+n.toLocaleString('de-DE')+' Tage, vermutlich ein Tippfehler im Datum. '+
   (what?esc(what)+' zeigt nur die ersten '+VIEW_DAYS+' Tage. ':'')+'Gespeicherte Angaben bleiben vollständig erhalten. Unter „Eckdaten“ den Zeitraum korrigieren.</div>';
}
function rangeText(t){
  const chk=tripTooLong(t)?' · Zeitraum prüfen':'';
  if(t.dateMode==='fix'){const a=pd(t.start),b=pd(t.end);if(a&&b)return fmtLong(a)+' – '+fmtLong(b)+' · '+nightsOf(t)+' Nächte'+chk}
  if(t.dateMode==='flex'){const m=t.month?MONTHS[+t.month.slice(5,7)-1]+' '+t.month.slice(0,4):'Zeitraum offen';return m+' · '+nightsOf(t)+' Nächte (flexibel)'+chk}
  return 'Datum noch offen · '+nightsOf(t)+' Nächte geplant'+chk;
}
const placeOf=t=>t.catalog==='allgaeu'?PLACES[t.place]||null:null;
function stayOf(t){if(!t.stayId)return null;const st=STAYS.find(s=>s.id===t.stayId)||(t.customStays||[]).find(s=>s.id===t.stayId)||null;const o=activeOffer(t);return o&&st?Object.assign({},st,{name:o.name,ort:o.location,breakfast:o.features.breakfast==='yes',sauna:o.features.sauna==='yes',kitchen:o.features.kitchen==='yes',url:o.url}):st}
function actOf(t,id){return ACTS[id]||(t.customActs||[]).find(a=>a.id===id)||null}
function actsFor(t){
  const out=[];
  if(t.catalog==='allgaeu'&&t.place) Object.values(ACTS).forEach(a=>{const ps=a.place.split('|');if(a.place==='*'||ps.includes(t.place))out.push(a)});
  (t.customActs||[]).forEach(a=>out.push(a));
  return out;
}
/* Genaue Uhrzeiten (optional, „HH:MM“, Issue #8). Das Zeitfenster folgt der Uhrzeit. */
const TIME_RE=/^([01]\d|2[0-3]):[0-5]\d$/;
const timeMin=h=>TIME_RE.test(h||'')?(+h.slice(0,2))*60+(+h.slice(3)):null;
const minTime=m=>String(Math.floor(((m%1440)+1440)%1440/60)).padStart(2,'0')+':'+String(((m%60)+60)%60).padStart(2,'0');
const slotForTime=h=>{const m=timeMin(h);return m==null?null:m<720?'morgen':m<840?'mittag':m<1080?'nachm':'abend'};
function sortedItems(t){const so={morgen:0,mittag:1,nachm:2,abend:3};return (t.items||[]).slice().sort((a,b)=>a.day-b.day||so[a.slot]-so[b.slot]||(timeMin(a.time)??9999)-(timeMin(b.time)??9999))}
/* Geschätzte Ankunft am Anreisetag: Abfahrt + einfache Fahrzeit (Auto: Straßen-km, Ø 80 km/h). null ohne Abfahrtszeit oder Strecke. */
/* Lage einer Unternehmung: gespeichertes geo oder über catalogSpot aus der geladenen Katalog-Kopie. Sonst unbekannt. */
let spotGeoIndex=null;
function actGeo(a){
  if(!a)return null;if(a.geo&&CATX&&CATX.validPoint(a.geo))return a.geo;
  if(!a.catalogSpot||!window.RP_CATALOG)return null;
  if(!spotGeoIndex){spotGeoIndex={};window.RP_CATALOG.places.forEach(p=>p.spots.forEach(sp=>{spotGeoIndex[sp.id]={lat:sp.lat,lon:sp.lon}}))}
  return spotGeoIndex[a.catalogSpot]||null;
}
/* Wege zwischen aufeinanderfolgenden Terminen mit Uhrzeit am selben Tag. Nur mit bekannter Lage und Dauer. */
function transferGaps(t){
  const out=[];if(!CATX)return out;const byDay={};
  sortedItems(t).forEach(it=>{const m=timeMin(it.time),a=actOf(t,it.act);if(m==null||!a||a.transit)return;(byDay[it.day]=byDay[it.day]||[]).push({it,a,m,h:actHours(a),g:actGeo(a)})});
  Object.keys(byDay).forEach(k=>{const l=byDay[k].sort((x,y)=>x.m-y.m);
    for(let i=1;i<l.length;i++){const p=l[i-1],n=l[i];if(p.h==null||!p.g||!n.g)continue;
      const need=CATX.localTransferMin(p.g,n.g),gap=n.m-(p.m+Math.round(p.h*60));
      out.push({day:+k,from:p,to:n,need,gap,short:gap<need&&gap>=0})}});
  return out;
}
/* Zeitzonen (optional t.tz, IANA). Uhrzeiten im Plan gelten als Ortszeit am Ziel. Ohne t.tz: Ortszeit wie dieses Gerät. */
const TZ_LIST=[['','Wie dieses Gerät'],['Europe/Berlin','Mitteleuropa (Berlin, Wien, Zürich, Paris, Rom)'],['Europe/London','London, Dublin'],['Europe/Lisbon','Lissabon, Madeira'],['Atlantic/Canary','Kanaren'],['Europe/Helsinki','Helsinki, Baltikum'],['Europe/Athens','Athen, Bukarest'],['Europe/Istanbul','Istanbul'],['Asia/Dubai','Dubai'],['Asia/Bangkok','Bangkok'],['Asia/Tokyo','Tokio'],['Australia/Sydney','Sydney'],['America/New_York','New York'],['America/Los_Angeles','Los Angeles']];
function validTz(z){if(!z)return false;try{new Intl.DateTimeFormat('de-DE',{timeZone:z});return true}catch(e){return false}}
function deviceTz(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone||''}catch(e){return ''}}
/* Versatz einer Zeitzone zu UTC in Minuten zum Zeitpunkt ms (über Intl, ohne Bibliothek) */
function tzOffsetMin(z,ms){
  const f=new Intl.DateTimeFormat('en-US',{timeZone:z,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const p={};f.formatToParts(new Date(ms)).forEach(x=>{p[x.type]=x.value});
  return Math.round((Date.UTC(+p.year,+p.month-1,+p.day,+p.hour%24,+p.minute,+p.second)-ms)/60000);
}
/* Ortszeit (Datum JJJJ-MM-TT + Minuten) in Zone z → UTC-Millisekunden; zweimal korrigiert für Umstellungstage */
function zonedToUtc(date,min,z){const base=Date.UTC(+date.slice(0,4),+date.slice(5,7)-1,+date.slice(8,10))+min*60000;let ms=base-tzOffsetMin(z,base)*60000;ms=base-tzOffsetMin(z,ms)*60000;return ms}
/* Unterschied Ziel minus Gerät in Minuten (positiv: am Ziel später) zum Reisebeginn; 0 ohne Zone */
function tzDiffMin(t){if(!validTz(t.tz))return 0;const dev=deviceTz();const ms=pd(t.start)?pd(t.start).getTime()+12*3600000:Date.now();return tzOffsetMin(t.tz,ms)-(validTz(dev)?tzOffsetMin(dev,ms):-new Date(ms).getTimezoneOffset())}
/* Einfache Fahrzeit der Anreise in Minuten: berechnete Route, sonst Schätzung Ø 80 km/h */
function outboundMin(t){if(Array.isArray(t.legs)&&t.legs.length){const l=t.legs[0];return num(l.routeMin,0)>0?num(l.routeMin,0):Math.round(num(l.roadKm,0)/80*60)}
  if(t.kmSrc==='route'&&num(t.routeMin,0)>0)return num(t.routeMin,0);return Math.round(routeKm(t)/80*60)}
/* Ankunft am Ziel in Ortszeit am Ziel: Abfahrt (Ortszeit Start) + Fahrzeit + Zeitunterschied */
/* Strecke berechnen: Vorschlag aus OpenStreetMap-Routing, Übernahme erst auf Knopfdruck */
function routeBlock(t){
  if(!CATX)return '';
  if(t.travel==='bahn'||t.travel==='flug')return t.origin&&t.dest?'<div class="row">'+lk('https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(t.origin)+'&destination='+encodeURIComponent(t.dest)+'&travelmode=transit','Verbindung suchen (Bahn/ÖPNV)')+'</div><p class="small muted">Öffnet die Kartensuche mit öffentlichen Verkehrsmitteln. Fahrplan und Preise dort bzw. beim Verkehrsunternehmen prüfen.</p>':'';
  const d=UI.routeDraft&&UI.routeDraft.trip===t.id?UI.routeDraft:null,stale=!!(d&&d.source!==JSON.stringify(t));
  return '<div class="panel"><div class="row"><button type="button" class="btn ghost sm" data-act="route-calc"'+(UI.routeBusy?' disabled':'')+'>'+(UI.routeBusy?'Berechne …':'Strecke berechnen (OpenStreetMap)')+'</button>'+
   (t.kmSrc==='route'?'<span class="small">Berechnet'+(t.routeAt?' am '+esc(fmtLong(pd(t.routeAt))):'')+': ≈ '+num(t.km,0)+' km, ca. '+esc(CATX.durText(num(t.routeMin,0)))+' einfach</span>':'')+'</div>'+
   (d?'<div class="note">'+(stale?'<b role="status">Vorschlag veraltet – Reise wurde geändert. Bitte neu berechnen.</b>':'')+'<b>Vorschlag: ≈ '+d.oneKm+' km, ca. '+esc(CATX.durText(d.oneMin))+' einfache Strecke</b>'+(d.legs?'<p class="small">'+d.legs.map((l,i)=>esc(l.label)+': ≈ '+l.km+' km, ca. '+esc(CATX.durText(l.minutes))).join('<br>')+'</p>':'')+
     '<p class="small muted">Berechnet mit routing.openstreetmap.de (OpenStreetMap-Mitwirkende), ohne Verkehr und Pausen. Start: '+esc(d.fromLabel)+'.</p><div class="row"><button type="button" class="btn sm" data-act="route-apply"'+(stale?' disabled':'')+'>Übernehmen</button><button type="button" class="btn ghost sm" data-act="route-drop">Verwerfen</button></div></div>':'')+
   '<p class="small muted">Übertragen werden nur Koordinaten; fehlen sie, wird der Ortsname bei OpenStreetMap (Nominatim) gesucht.</p></div>';
}
async function geoLookup(text){
  const r=await catTimeout(fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=de&q='+encodeURIComponent(text),{headers:{Accept:'application/json'}}),10000);
  if(!r.ok)throw new Error('Ortssuche: Fehler '+r.status);const j=await r.json();
  if(!Array.isArray(j)||!j.length)throw new Error('Ort „'+text+'“ nicht gefunden.');
  return {lat:+j[0].lat,lon:+j[0].lon,label:String(j[0].display_name||text).split(',').slice(0,2).join(',')};
}
/* Punkte der Reise: Start, Ziel bzw. Etappen, zurück zum Start */
async function routePoints(t){
  const from=t.originGeo&&CATX.validPoint(t.originGeo)?Object.assign({label:t.origin||'Start'},t.originGeo):t.origin?await geoLookup(t.origin):null;
  if(!from)throw new Error('Bitte zuerst einen Start-Ort eintragen.');
  let stops;
  if(Array.isArray(t.legs)&&t.legs.length)stops=t.legs.map(l=>({lat:+l.lat,lon:+l.lon,label:l.name}));
  else if(t.destGeo&&CATX.validPoint(t.destGeo))stops=[Object.assign({label:t.dest||'Ziel'},t.destGeo)];
  else if(t.dest)stops=[await geoLookup(t.dest)];
  else throw new Error('Bitte zuerst ein Ziel eintragen.');
  return {from,stops};
}
async function routeCalc(t){
  const source=JSON.stringify(t),snapshot=JSON.parse(source);
  const {from,stops}=await routePoints(snapshot);
  const pts=[from].concat(stops,[from]);
  const r=await catTimeout(fetch(CATX.routeUrl(pts)),15000);if(!r.ok)throw new Error('Routing: Fehler '+r.status);
  const res=CATX.parseRoute(await r.json());
  const legs=res.legs.map((l,i)=>Object.assign({label:(i===0?from.label:stops[i-1].label)+' → '+(i<stops.length?stops[i].label:from.label+' (Heimfahrt)')},l));
  return {trip:snapshot.id,source,fromLabel:from.label,originGeo:{lat:from.lat,lon:from.lon},oneKm:legs[0].km,oneMin:legs[0].minutes,totalKm:res.km,legs:legs.length>2?legs:null,raw:legs,at:iso(todayUTC())};
}
function routeApply(t,d){
  if(!d||d.trip!==t.id)throw new Error('Kein Vorschlag vorhanden.');
  if(!d.source||d.source!==JSON.stringify(t))throw new Error('Die Reise hat sich seit der Routenberechnung geändert. Bitte die Strecke neu berechnen.');
  const L=d.raw;
  if(Array.isArray(t.legs)&&t.legs.length&&L.length===t.legs.length+1){t.legs=t.legs.map((l,i)=>Object.assign({},l,{roadKm:L[i].km,routeMin:L[i].minutes}));t.km=Math.round(d.totalKm/2);t.routeMin=L[0].minutes;t.routeHomeMin=L[L.length-1].minutes}
  else{t.km=L[0].km;t.routeMin=L[0].minutes;t.routeHomeMin=L[L.length-1].minutes}
  t.kmSrc='route';t.routeAt=d.at;t.routeKm=null;if(!t.originGeo&&d.originGeo)t.originGeo=d.originGeo;
  return t;
}
/* Ortswechsel erst bewusst übernehmen: alte Routenwerte sind keine neue Strecke. */
function invalidateEndpointRoute(before,candidate){
 const origin=before.origin!==candidate.origin,dest=before.dest!==candidate.dest;
 if(origin)delete candidate.originGeo;
 if(dest)delete candidate.destGeo;
 const legs=Array.isArray(candidate.legs)&&candidate.legs.length,routeChanged=origin||dest&&!legs;
 if(routeChanged){
  candidate.km=0;candidate.routeKm=0;
  for(const key of ['kmSrc','routeMin','routeHomeMin','routeAt'])delete candidate[key];
  if(origin&&legs){candidate.legs[0].roadKm=0;delete candidate.legs[0].routeMin}
 }
 return {origin,dest,routeChanged};
}
function routeEndpointPreview(t,candidate){
 if(!candidate||candidate.id!==t.id)throw new Error('Reiseentwurf nicht mehr vorhanden.');
 if(candidate.origin===t.origin&&candidate.dest===t.dest)return null;
 const c=clone(candidate),changes=invalidateEndpointRoute(t,c),issues=commitmentIssues(t,c);
 if(issues.length)throw new Error('Nicht geändert: '+issues.join(' · '));
 return {trip:t.id,source:JSON.stringify(t),candidate:c,changes,beforeKm:routeKm(t),beforeTime:outboundMin(t)};
}
function applyRouteEndpointChange(t,d){
 if(!d||d.trip!==t.id||d.source!==JSON.stringify(t))throw new Error('Die Reise hat sich geändert. Ortswechsel bitte neu prüfen.');
 const issues=commitmentIssues(t,d.candidate);if(issues.length)throw new Error('Nicht geändert: '+issues.join(' · '));
 adoptPlanChange(t,clone(d.candidate));return t;
}
function sheetRouteEndpoint(t,d){
 const c=d.candidate;
 openSheet('<h2>Start oder Ziel ändern?</h2><dl class="facts"><dt>Start vorher</dt><dd>'+esc(t.origin||'Offen')+'</dd><dt>Start danach</dt><dd>'+esc(c.origin||'Offen')+'</dd><dt>Ziel vorher</dt><dd>'+esc(t.dest||(placeOf(t)||{}).name||'Offen')+'</dd><dt>Ziel danach</dt><dd>'+esc(c.dest||(placeOf(c)||{}).name||'Offen')+'</dd><dt>Bisherige Strecke</dt><dd>'+d.beforeKm+' km einfach'+(d.beforeTime?' · ca. '+d.beforeTime+' Min.':'')+'</dd><dt>Strecke danach</dt><dd>'+(d.changes.routeChanged?'Offen – bitte neu berechnen oder eintragen':'Etappen bestimmen weiterhin die Strecke')+'</dd></dl><p>Nur nach Übernahme werden die betroffenen Koordinaten und alten Routenwerte zurückgesetzt. Das ist keine Ersparnis: Fahrtkosten und Fahrzeit müssen neu geprüft werden.</p><p class="small muted">Unterkunft, Buchungen, Zahlungen und Termine werden nicht automatisch angepasst. Bei Rundreisen bleiben die Etappen erhalten; ein neuer Start setzt nur deren erste Anfahrt zurück.</p><div class="row"><button type="button" class="btn" data-act="route-endpoint-apply">Änderung übernehmen</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div>');UI.routeEndpointDraft=d;
}
function arrivalMin(t){const trv=v3Transport(t);if(trv){const a=V3.transportTimeline(trv,{}).arrival;return a&&a.time&&a.date&&a.date===t.start?timeMin(a.time):null}const dep=timeMin(t.departTime);if(dep==null||t.travel!=='auto')return null;const m=outboundMin(t);return m>0?dep+m+tzDiffMin(t):null}

function routeKm(t){const pl=placeOf(t);return t.routeKm!=null?Math.max(0,num(t.routeKm,0)):(pl&&t.origin==='73110 Hattenhofen'?pl.km:Math.max(0,num(t.km,0)))}
function resetStay(t){t.stayQuote=null;t.activeOfferId=null;t.cardConfirmed=false;if(t.check)delete t.check.stay;}
function openCosts(t){const out=[];const o=activeOffer(t);if(o){out.push(...offerAmounts(o).unknown.map(k=>k+' offen'));if(!offerCurrent(o,t))out.push('Ausgewähltes Angebot passt nicht mehr zu Daten/Personen oder ist abgelaufen');if(o.availability!=='available')out.push('Verfügbarkeit des Angebots unbestätigt');if(isV3(t)&&o.cancel&&nightsOf(t)>0)out.push('Unterkunft storniert: neue Unterkunft fehlt, Kosten offen');}
 if(!stayOf(t)){if(nightsOf(t)>0)out.push('Unterkunft fehlt');}
 else if(!o){const st=stayOf(t);if(st.gone)out.push(st.name+': Inserat nicht mehr auffindbar, andere Unterkunft wählen');if(!(num(t.stayQuote,0)>0)){out.push('Konkretes Unterkunftsangebot fehlt');const sn=stayNight(t,st);if(sn.stale)out.push('Unterkunftspreis: ältere oder unklare Abfrage, aktuellen Preis erneut prüfen');if(sn.scaled)out.push('Unterkunftskosten auf andere Dauer hochgerechnet: feste Gebühren und Mindestnächte prüfen');if(sn.sample&&Math.round(num(t.persons,2))!==sn.sample.adults)out.push('Unterkunftspreis gilt laut Abfrage für '+sn.sample.adults+' Erwachsene, für '+Math.round(num(t.persons,2))+' Personen beim Anbieter prüfen');}out.push('Endreinigung, Pflichtzuschläge und enthaltene Gebühren prüfen');}
 if(v3Transport(t)){const tc=V3.transportCost(v3Transport(t),{persons:t.persons,verb:num(t.verb,7.5),preis:num(t.preis,2.15)});tc.open.forEach(x=>out.push('Anreise: '+x+' – Preis offen'));V3.transportTimeline(v3Transport(t),{start:t.start,end:t.end}).checks.filter(c=>c.level==='warn').forEach(c=>out.push('Anreise: '+c.text))}
 if(isV3(t)){Object.keys(t.ledger||{}).forEach(k=>{const e=t.ledger[k];if(e&&e.cancel&&e.cancel.fee==null)out.push('Stornogebühr unbekannt ('+k+')')});(t.offers||[]).forEach(x=>{if(x.cancel&&x.cancel.fee==null)out.push('Stornogebühr unbekannt: '+x.name)})}
 if(!v3Transport(t)&&t.travel==='auto'&&!routeKm(t))out.push('Fahrstrecke fehlt');
 if(t.travel==='auto'&&t.kmSrc==='schaetzung'&&t.routeKm==null&&routeKm(t))out.push('Fahrstrecke geschätzt (Luftlinie × 1,3), mit dem Routenplaner prüfen');
 {const ids=new Set((t.items||[]).map(i=>i.act)),open=(t.customActs||[]).filter(a=>a.costOpen&&!num(a.cost,0)&&ids.has(a.id));if(open.length)out.push(open.length+' eingeplante Unternehmung(en) ohne Preis: '+open.slice(0,3).map(a=>a.t).join(', ')+(open.length>3?' …':''));}
 if(!v3Transport(t)&&t.travel!=='auto'&&!num(t.ticket,0))out.push('Ticketpreis fehlt');
 if(t.travel==='auto'||v3Transport(t)&&[].concat(v3Transport(t).out||[],v3Transport(t).back||[]).some(x=>x.mode==='auto'||x.mode==='mietwagen'))out.push('Parken und gegebenenfalls Maut prüfen');
 const pl=placeOf(t);
 if(pl){const c=cost(t);
  if(c.gearDays>5)out.push('Verleih über 5 Tage: Tarif beim Verleih erfragen');
  if(c.kursDays.length>3)out.push('Kurs über 3 Tage: Preis bei der Skischule erfragen');
  if(c.passDays.size>3&&!(pl.cardPass&&t.cardConfirmed===true))out.push('Skipass über 3 Tage: Mehrtagestarif prüfen');}
 return out;
}
function costNotice(t){const open=openCosts(t);return '<details class="note plan-notice"'+(UI.tab==='kosten'?' open':'')+'><summary><b>Planwerte · '+(open.length?open.length+' offene Angaben':'Angaben prüfen')+'</b></summary><p class="small">Vorläufige Planung · kein bestätigter Gesamtpreis. '+(open.length?esc(open.join(' · '))+'. ':'')+'Katalogpreise und Öffnungszeiten wurden für eure Reisedaten nicht neu geprüft. Ein Restbudget ist noch keine Zusage, dass die Reise im Budget liegt.</p></details>';}
/* Kosten */
