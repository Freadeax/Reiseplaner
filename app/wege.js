/* Reiseplaner · Wege und Tageskarte im Tagesplan (docs/WEGE.md).
   Zusatzteil direkt nach app/tagesplan.js (Teilnummern der übrigen Dateien unverändert). Klassisches Skript ohne Bundler, gemeinsamer globaler Gültigkeitsbereich; zur Ladezeit nur
   frühere Teile verwenden. Netzanfragen nur auf Knopfdruck: Ortssuche über nominatimFetch (app/reise.js, Abstand ≥ 1,1 s),
   Route über routing.openstreetmap.de (FOSSGIS-OSRM). Ergebnisse nur im Gerätespeicher, nie in der Reise. */
"use strict";
const WEGE_MODES={auto:{label:'mit dem Auto',short:'Auto',osrm:'car',osm:'fossgis_osrm_car'},fuss:{label:'zu Fuß',short:'zu Fuß',osrm:'foot',osm:'fossgis_osrm_foot'},rad:{label:'mit dem Fahrrad',short:'Fahrrad',osrm:'bike',osm:'fossgis_osrm_bike'}};
const WEGE_KEY='rp-wege-cache-v1',WEGE_MAX_GEO=300,WEGE_MAX_ROUTES=60,WEGE_MAX_LOOKUPS=8,WEGE_SAME_KM=0.3;
let wegeVersion=0,wegeMem=null;
/* Gerätespeicher: {geo:{<suchtext>:{lat,lon,label,at}|{none:true,at}}, routes:{<signatur>:{legs,geom,at}}, mode:{<reise>:modus}} */
function wegeStore(){
  if(wegeMem)return wegeMem;
  let o=null;try{o=JSON.parse(localStorage.getItem(WEGE_KEY)||'null')}catch(e){o=null}
  const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  o=obj(o);wegeMem={geo:obj(o.geo),routes:obj(o.routes),mode:obj(o.mode)};return wegeMem;
}
function wegeTrim(m,max){const k=Object.keys(m);if(k.length<=max)return;k.sort((a,b)=>String(m[a].at||'').localeCompare(String(m[b].at||''))).slice(0,k.length-max).forEach(x=>delete m[x])}
function wegeSave(){const s=wegeStore();wegeTrim(s.geo,WEGE_MAX_GEO);wegeTrim(s.routes,WEGE_MAX_ROUTES);wegeVersion++;try{localStorage.setItem(WEGE_KEY,JSON.stringify(s))}catch(e){}}
function wegeQuery(q){return String(q||'').trim().replace(/\s+/g,' ').toLowerCase().slice(0,120)}
function wegeGeoOf(q){const k=wegeQuery(q);if(!k)return null;const g=wegeStore().geo[k];return g&&!g.none&&CATX&&CATX.validPoint(g)?{lat:+g.lat,lon:+g.lon}:null}
function wegeGeoMissing(q){const g=wegeStore().geo[wegeQuery(q)];return !!(g&&g.none)}
function wegeMode(t){const m=wegeStore().mode[t&&t.id];return WEGE_MODES[m]?m:(t&&t.travel&&t.travel!=='auto'?'fuss':'auto')}
function wegeSetMode(t,m){if(!WEGE_MODES[m])throw new Error('Unbekanntes Verkehrsmittel.');wegeStore().mode[t.id]=m;wegeSave()}

/* Ausgangspunkt des Tages: Etappe der Rundreise, sonst Unterkunft, sonst Ortsmitte des Ziels (sichtbar markiert). */
function dayBase(t,day){
  const pt=g=>g&&CATX&&CATX.validPoint({lat:+g.lat,lon:+g.lon})?{lat:+g.lat,lon:+g.lon}:null;
  if(Array.isArray(t.legs)&&t.legs.length){const l=t.legs[legOfDay(legStarts(t.legs),day)]||t.legs[0];const g=pt(l)||wegeGeoOf(l.name);return {label:String(l.name||'Etappe'),query:String(l.name||''),geo:g,kind:'etappe',approx:false}}
  const st=stayOf(t);
  if(st){const q=st.map||[st.name,st.ort].filter(Boolean).join(', '),g=pt(st.geo)||wegeGeoOf(q);
    if(g)return {label:String(st.name||st.ort||'Unterkunft'),query:q,geo:g,kind:'unterkunft',approx:false};
    const d=pt(t.destGeo);return {label:String(st.name||st.ort||'Unterkunft'),query:q,geo:d,kind:'unterkunft',approx:!!d}}
  const d=pt(t.destGeo)||wegeGeoOf(t.dest);
  return {label:t.dest?String(t.dest).split(/[,→]/)[0].trim()+' (Ortsmitte)':'Unterkunft',query:String(t.dest||''),geo:d,kind:'ort',approx:!!d};
}
/* Punkte eines Tages in Planreihenfolge; Weiterfahrten (transit) zählen schon in der Anreise. */
function dayStops(t,day){
  return sortedItems(t).filter(it=>it.day===day).map(it=>{const a=actOf(t,it.act);if(!a||a.transit)return null;
    const q=a.map||a.ort||'',g=actGeo(a)||wegeGeoOf(q);
    const start=timeMin(it.time),h=actHours(a);
    return {uid:it.uid,label:String(a.t||'Punkt'),time:it.time||'',start,end:start!=null&&h!=null?start+Math.round(h*60):null,query:String(q),geo:g,missing:!g&&!!q&&wegeGeoMissing(q)}}).filter(Boolean);
}
/* Schätzung je Verkehrsmittel aus Luftlinie (Straßenfaktor 1,3); auf 5 Min. gerundet. */
function wegeEstimate(air,mode){
  const road=air*(CATX?CATX.ROAD_FACTOR:1.3),r5=m=>Math.max(5,Math.round(m/5)*5);
  if(mode==='fuss')return {km:Math.round(road*10)/10,min:r5(road/4.5*60)};
  if(mode==='rad')return {km:Math.round(road*10)/10,min:r5(road/15*60+5)};
  return {km:Math.round(road),min:r5(road/(air>=30?70:50)*60+10)};
}
function wegeSig(mode,pts){return mode+'|'+pts.map(p=>(+p.lat).toFixed(5)+','+(+p.lon).toFixed(5)).join(';')}
function wegeKnownRun(base,stops){
  const all=[base].concat(stops,[base]),known=[];all.forEach((p,i)=>{if(p.geo)known.push(i)});
  return {all,known,pts:known.map(i=>all[i].geo)};
}
/* Wege des Tages: Abschnitte Unterkunft → Punkt 1 → … → Unterkunft. src: 'gleich' | 'schaetzung' | 'osrm' | 'unbekannt'. */
const WAYS_CACHE=new WeakMap();
function dayWays(t,day){
  const mode=wegeMode(t),key=JSON.stringify(t)+'|'+day+'|'+mode+'|'+wegeVersion,memo=WAYS_CACHE.get(t);
  if(memo&&memo[day]&&memo[day].key===key)return memo[day].val;
  const base=dayBase(t,day),stops=dayStops(t,day),out={day,mode,base,stops,legs:[],km:0,min:0,unknown:0,known:0,osrm:false,at:null,geom:null};
  if(stops.length&&CATX){
    const run=wegeKnownRun(base,stops),hit=run.pts.length>=2?wegeStore().routes[wegeSig(mode,run.pts)]:null;
    for(let i=0;i<run.all.length-1;i++){
      const a=run.all[i],b=run.all[i+1],leg={from:a.label,to:b.label,toUid:b.uid||null,fromGeo:a.geo,toGeo:b.geo,km:null,min:null,src:'unbekannt',drive:null,gap:null};
      /* Zeit zwischen zwei Terminen mit Uhrzeit (Ende = Beginn + Dauer); null, wenn eine Angabe fehlt */
      if(a.end!=null&&b.start!=null)leg.gap=b.start-a.end;
      if(a.geo&&b.geo){
        const air=CATX.airKm(a.geo,b.geo);
        if(air<WEGE_SAME_KM){leg.km=0;leg.min=0;leg.src='gleich'}
        else{const k=run.known.indexOf(i),r=hit&&k>=0&&run.known[k+1]===i+1?hit.legs[k]:null;
          if(r&&r.km>=0&&r.minutes>=0){leg.km=r.km;leg.drive=r.minutes;leg.min=mode==='auto'?r.minutes+10:mode==='rad'?r.minutes+5:r.minutes;leg.src='osrm'}
          else{const e=wegeEstimate(air,mode);leg.km=e.km;leg.min=e.min;leg.src='schaetzung'}}
      }
      if(leg.min==null)out.unknown++;else{out.known++;out.km+=leg.km;out.min+=leg.min}
      out.legs.push(leg);
    }
    out.km=Math.round(out.km*10)/10;
    if(hit&&out.legs.some(l=>l.src==='osrm')){out.osrm=true;out.at=hit.at||null;out.geom=Array.isArray(hit.geom)?hit.geom:null}
  }
  /* In der Reise gespeicherte Tagesroute (Format 5 dayRoutes): gilt nur, solange die Reihenfolge gleich ist.
     Ohne eigene Berechnung auf diesem Gerät liefert sie die Summe, damit alle Mitreisenden dieselbe Tageslast sehen. */
  const sv=wegeSaved(t,day);
  if(sv){out.saved=sv;if(sv.match&&!out.osrm&&sv.src==='osrm'&&sv.min!=null){out.km=sv.km!=null?sv.km:out.km;out.min=sv.min;out.unknown=0;out.fromSaved=true}}
  const m=memo||{};m[day]={key,val:out};if(!memo)WAYS_CACHE.set(t,m);
  return out;
}
function wegeSaved(t,day){
  const r=t&&t.dayRoutes&&typeof t.dayRoutes==='object'?t.dayRoutes[String(day)]:null;if(!r||!Array.isArray(r.order))return null;
  const now=sortedItems(t).filter(it=>it.day===day&&(()=>{const a=actOf(t,it.act);return a&&!a.transit})()).map(it=>it.uid);
  return {km:r.km!=null?+r.km:null,min:r.min!=null?+r.min:null,src:r.src,at:r.at||null,match:now.length===r.order.length&&now.every((u,i)=>u===r.order[i])};
}
/* Gültiger dayRoutes-Eintrag für Format 5 (SCHEMA_V5 M12). Erst mit F5_WRITE speichern; null ohne bekannten Weg. */
function dayRouteRecord(t,day){
  const w=dayWays(t,day);if(!w.stops.length||!w.known)return null;
  const r={order:w.stops.map(s=>s.uid).slice(0,30),km:Math.min(5000,Math.round(w.km*10)/10),min:Math.min(3000,Math.round(w.min)),src:w.osrm?'osrm':'schaetzung'};
  if(w.osrm)r.at=w.at&&/^\d{4}-\d{2}-\d{2}T/.test(w.at)?w.at:new Date().toISOString();
  return r;
}

/* ---------- Kürzere Reihenfolge (nur Vorschlag) ----------
   Getauscht werden nur Punkte ohne Uhrzeit, ohne Buchung/Zahlung, ohne Fixpunkt und ohne festes Datum, und nur innerhalb
   ihrer Tageszeit: Vormittag bleibt Vormittag. Alle Punkte brauchen eine bekannte Lage, sonst kein Vorschlag. */
function wegeMovable(t,it){const a=actOf(t,it.act);return !!(a&&!a.transit&&timeMin(it.time)==null&&it.fix!==true&&!a.onlyDate&&!(typeof activityCommitted==='function'&&activityCommitted(t,it.act)))}
function wegePerms(n){const out=[],a=[...Array(n).keys()],go=k=>{if(k===n){out.push(a.slice());return}for(let i=k;i<n;i++){[a[k],a[i]]=[a[i],a[k]];go(k+1);[a[k],a[i]]=[a[i],a[k]]}};go(0);return out}
function wegeOrderProposal(t,day){
  if(!CATX)return null;
  const w0=dayWays(t,day);if(w0.stops.length<3||w0.unknown||w0.legs.some(l=>l.src==='unbekannt'))return null;
  const items=sortedItems(t).filter(it=>it.day===day&&(()=>{const a=actOf(t,it.act);return a&&!a.transit})());
  const geo=uid=>w0.stops.find(s=>s.uid===uid).geo,mode=w0.mode,base=w0.base.geo;
  const cost=seq=>{let m=0,prev=base;seq.forEach(it=>{const g=geo(it.uid),air=CATX.airKm(prev,g);m+=air<WEGE_SAME_KM?0:wegeEstimate(air,mode).min;prev=g});const air=CATX.airKm(prev,base);return m+(air<WEGE_SAME_KM?0:wegeEstimate(air,mode).min)};
  const before=cost(items);let best=items.slice();
  SLOTS.forEach(([slot])=>{
    const idx=best.map((it,i)=>i).filter(i=>best[i].slot===slot&&wegeMovable(t,best[i]));
    if(idx.length<2||idx.length>7)return;
    let top=null,topCost=Infinity;
    wegePerms(idx.length).forEach(p=>{const cand=best.slice();idx.forEach((pos,k)=>{cand[pos]=best[idx[p[k]]]});const c=cost(cand);if(c<topCost-0.01){topCost=c;top=cand}});
    if(top)best=top;
  });
  const after=cost(best),save=before-after;
  if(save<10||best.every((it,i)=>it.uid===items[i].uid))return null;
  return {day,before,after,save,order:best.map(it=>it.uid),labels:best.map(it=>(actOf(t,it.act)||{}).t||'Punkt'),source:JSON.stringify(t.items||[])};
}
/* Neue Reihenfolge übernehmen: nur die Lage der Punkte im items-Array ändert sich (Tag, Tageszeit, Uhrzeit bleiben). */
function wegeOrderApply(t,prop){
  if(!prop||prop.source!==JSON.stringify(t.items||[]))throw new Error('Der Tagesplan hat sich geändert. Bitte den Vorschlag neu öffnen.');
  const items=(t.items||[]).slice(),pos=[];items.forEach((it,i)=>{if(prop.order.includes(it.uid))pos.push(i)});
  const byUid=Object.fromEntries(items.map(it=>[it.uid,it]));
  const so={morgen:0,mittag:1,nachm:2,abend:3},inPlan=pos.map(i=>items[i]).sort((a,b)=>so[a.slot]-so[b.slot]);
  /* Punkte der neuen Reihenfolge in die bisherigen Plätze dieses Tages schreiben; je Tageszeit bleibt die Menge gleich */
  const want=prop.order.map(u=>byUid[u]);
  if(want.length!==inPlan.length||want.some((it,i)=>!it||it.slot!==inPlan[i].slot))throw new Error('Vorschlag passt nicht mehr zum Plan.');
  pos.sort((a,b)=>a-b).forEach((p,k)=>{items[p]=want[k]});
  const c=clone(t);c.items=items;
  const iss=typeof commitmentIssues==='function'?commitmentIssues(t,c):[];if(iss.length)throw new Error('Nicht geändert: '+iss.join(' · '));
  return c;
}
/* Berechnete Tagesroute in der Reise speichern (Format 5 dayRoutes) oder entfernen; Schreibweg über f5Commit. */
function wegeStoreRoute(t,day,on,opt){
  const rec=on?dayRouteRecord(t,day):null;if(on&&(!rec||rec.src!=='osrm'))throw new Error('Zuerst die Wege berechnen.');
  return f5Commit(t,c=>{const m=c.dayRoutes&&typeof c.dayRoutes==='object'?Object.assign({},c.dayRoutes):{};if(on)m[String(day)]=rec;else delete m[String(day)];if(Object.keys(m).length)c.dayRoutes=m;else delete c.dayRoutes},opt);
}

/* ---------- Netz (nur auf Knopfdruck) ---------- */
function wegeRouteUrl(mode,pts){
  if(!Array.isArray(pts)||pts.length<2||pts.length>25||!pts.every(p=>CATX.validPoint(p)))throw new Error('Route braucht 2 bis 25 bekannte Orte.');
  return 'https://routing.openstreetmap.de/routed-'+WEGE_MODES[mode].osrm+'/route/v1/driving/'+pts.map(p=>(+p.lon).toFixed(5)+','+(+p.lat).toFixed(5)).join(';')+'?overview=simplified&geometries=geojson';
}
/* Linienzug aus der Antwort: [[lat,lon]], auf höchstens 200 Punkte ausgedünnt, 5 Nachkommastellen. */
function wegeGeom(j){
  const c=j&&j.routes&&j.routes[0]&&j.routes[0].geometry&&j.routes[0].geometry.coordinates;
  if(!Array.isArray(c)||c.length<2)return null;
  const step=Math.max(1,Math.ceil(c.length/200)),out=[];
  for(let i=0;i<c.length;i+=step){const p=c[i];if(Array.isArray(p)&&isFinite(p[0])&&isFinite(p[1]))out.push([Math.round(p[1]*1e5)/1e5,Math.round(p[0]*1e5)/1e5])}
  const l=c[c.length-1];if(Array.isArray(l))out.push([Math.round(l[1]*1e5)/1e5,Math.round(l[0]*1e5)/1e5]);
  return out;
}
/* Fehlende Orte suchen (höchstens 8 je Klick), dann eine Routenanfrage für den ganzen Tag. Rückgabe: Kurzmeldung. */
async function wegeCalc(t,day,deps){
  const net=deps||{geo:q=>geoLookup(q),fetch:(u,ms)=>catTimeout(fetch(u),ms)};
  const s=wegeStore(),mode=wegeMode(t),now=new Date().toISOString();
  const base=dayBase(t,day),stops=dayStops(t,day);if(!stops.length)throw new Error('An diesem Tag ist noch nichts geplant.');
  const ask=[];[base].concat(stops).forEach(p=>{if(!p.geo&&p.query&&!wegeGeoMissing(p.query)&&!ask.includes(wegeQuery(p.query)))ask.push(wegeQuery(p.query))});
  if(base.approx&&base.query&&!wegeGeoMissing(base.query)&&!ask.includes(wegeQuery(base.query)))ask.unshift(wegeQuery(base.query));
  let found=0,miss=0;
  for(const q of ask.slice(0,WEGE_MAX_LOOKUPS)){
    try{const g=await net.geo(q);s.geo[q]={lat:+g.lat,lon:+g.lon,label:String(g.label||q).slice(0,120),at:now};found++}
    catch(e){if(/nicht gefunden/.test(e.message)){s.geo[q]={none:true,at:now};miss++}else{wegeSave();throw e}}
  }
  wegeSave();
  const run=wegeKnownRun(dayBase(t,day),dayStops(t,day));
  if(run.pts.length<2)return 'Zu wenige Orte mit bekannter Lage'+(miss?' ('+miss+' nicht gefunden)':'')+'. Die Wege bleiben offen.';
  const r=await net.fetch(wegeRouteUrl(mode,run.pts),15000);if(!r.ok)throw new Error('Routing: Fehler '+r.status);
  const j=await r.json(),res=CATX.parseRoute(j);
  s.routes[wegeSig(mode,run.pts)]={legs:res.legs.map(l=>({km:l.km,minutes:l.minutes})),geom:wegeGeom(j),at:now};
  wegeSave();
  return 'Wege berechnet'+(found?', '+found+' Ort(e) gefunden':'')+(miss?', '+miss+' nicht gefunden':'')+(ask.length>WEGE_MAX_LOOKUPS?'. Weitere Orte beim nächsten Klick':'')+'.';
}

/* ---------- Darstellung ---------- */
const wegeH=m=>m>=60?Math.floor(m/60)+' Std.'+(m%60?' '+(m%60)+' Min.':''):m+' Min.';
const wegeKm=k=>k<10&&k%1?String(k).replace('.',','):String(Math.round(k));
function wegeLegText(l,mode){
  if(l.src==='gleich')return 'am selben Ort';
  if(l.src==='unbekannt')return 'Lage unbekannt';
  return '≈ '+wegeKm(l.km)+' km · ca. '+wegeH(l.min)+' '+WEGE_MODES[mode].label+(l.src==='osrm'?'':' (geschätzt)')+wegeHint(l,mode);
}
/* Hinweise als Text: zu knapp zwischen zwei Uhrzeiten, sehr weit zu Fuß oder mit dem Rad */
function wegeTight(l){return l.min!=null&&l.gap!=null&&l.gap>=0&&l.gap<l.min}
function wegeHint(l,mode){
  if(l.min==null)return '';
  return (wegeTight(l)?' · ! knapp: nur '+l.gap+' Min. zwischen den Terminen':'')+(mode==='fuss'&&l.km>5||mode==='rad'&&l.km>30?' · ! weit '+WEGE_MODES[mode].label+', anderes Verkehrsmittel prüfen':'');
}
/* Zeile im Zeitstrahl vor einem Punkt: der Weg dorthin. Leer bei unbekannter Lage oder gleichem Ort. */
function wegZeile(t,day,uid){
  if(!CATX)return '';const w=dayWays(t,day),l=w.legs.find(x=>x.toUid===uid);
  if(!l||l.src==='unbekannt'||l.src==='gleich')return '';
  const tight=wegeTight(l);
  return '<div class="weg-zeile'+(tight?' knapp':'')+'"><span aria-hidden="true">↓</span> <span class="vh">Weg hierher: </span>'+esc('≈ '+wegeKm(l.km)+' km · ca. '+wegeH(l.min))+' <span class="muted">'+esc(WEGE_MODES[w.mode].short+(l.src==='osrm'?'':', geschätzt'))+'</span>'+(tight?' <b>! knapp: nur '+l.gap+' Min. Zeit</b>':'')+'</div>';
}
/* Skizze: Unterkunft ⌂, Punkte nummeriert wie in der Liste, berechnete Linie oder gestrichelte Luftlinien. Keine Kacheln. */
function wegeSkizze(w){
  const W=340,H=220,P=22,pts=[],add=g=>{if(g)pts.push(g)};
  add(w.base.geo);w.stops.forEach(s=>add(s.geo));(w.geom||[]).forEach(p=>pts.push({lat:p[0],lon:p[1]}));
  if(pts.length<2)return '';
  const lat0=pts.reduce((a,p)=>a+p.lat,0)/pts.length,k=Math.cos(lat0*Math.PI/180);
  const X=p=>p.lon*k*111.32,Y=p=>-p.lat*110.57,xs=pts.map(X),ys=pts.map(Y);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const span=Math.max(maxX-minX,maxY-minY,0.5),sc=Math.min((W-2*P)/Math.max(maxX-minX,span*0.3),(H-2*P)/Math.max(maxY-minY,span*0.3));
  const ox=(W-(maxX-minX)*sc)/2,oy=(H-(maxY-minY)*sc)/2,px=p=>[Math.round((ox+(X(p)-minX)*sc)*10)/10,Math.round((oy+(Y(p)-minY)*sc)*10)/10];
  let lines='';
  if(w.geom&&w.geom.length>1)lines='<polyline class="wege-linie" points="'+w.geom.map(p=>px({lat:p[0],lon:p[1]}).join(',')).join(' ')+'"/>';
  else lines=w.legs.filter(l=>l.fromGeo&&l.toGeo&&l.src!=='gleich').map(l=>{const a=px(l.fromGeo),b=px(l.toGeo);return '<line class="wege-luft" x1="'+a[0]+'" y1="'+a[1]+'" x2="'+b[0]+'" y2="'+b[1]+'"/>'}).join('');
  const bar=[0.5,1,2,5,10,20,50,100].find(v=>v*sc>=50)||100,bx=W-P-bar*sc;
  /* Nahe beieinander liegende Zeichen (unter 14 px) seitlich versetzen, damit jede Nummer lesbar bleibt */
  const placed=w.base.geo?[px(w.base.geo)]:[];let marks='';
  w.stops.forEach((s,i)=>{if(!s.geo)return;const p=px(s.geo),dir=p[0]>W/2?-1:1;let dx=0;while(placed.some(q=>Math.hypot(q[0]-(p[0]+dx),q[1]-p[1])<14)&&Math.abs(dx)<140)dx+=14*dir;placed.push([p[0]+dx,p[1]]);
    marks+='<g class="wege-pt"><circle cx="'+(p[0]+dx)+'" cy="'+p[1]+'" r="9"/><text x="'+(p[0]+dx)+'" y="'+(p[1]+3.5)+'">'+(i+1)+'</text></g>'});
  const hb=w.base.geo?px(w.base.geo):null;
  return '<figure class="wege-karte"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Skizze der Wege: Unterkunft und '+w.stops.filter(s=>s.geo).length+' Punkte mit bekannter Lage, Nummern wie in der Liste">'+lines+
   (hb?'<g class="wege-home"><rect x="'+(hb[0]-9)+'" y="'+(hb[1]-9)+'" width="18" height="18" rx="4"/><text x="'+hb[0]+'" y="'+(hb[1]+4)+'">⌂</text></g>':'')+marks+
   '<line class="wege-mass" x1="'+bx.toFixed(1)+'" y1="'+(H-8)+'" x2="'+(W-P)+'" y2="'+(H-8)+'"/><text class="wege-mass-t" x="'+(W-P)+'" y="'+(H-12)+'">'+String(bar).replace('.',',')+' km</text></svg>'+
   '<figcaption class="small muted">Skizze ohne Straßenkarte'+(w.geom?'; Linie berechnet, © OpenStreetMap-Mitwirkende, Routing FOSSGIS':'; gestrichelt = Luftlinie')+'.</figcaption></figure>';
}
function wegeAppUrl(w){
  const pt=g=>g?(+g.lat).toFixed(5)+','+(+g.lon).toFixed(5):'',name=x=>x.geo?pt(x.geo):x.query;
  const stops=w.stops.map(name).filter(Boolean),o=name(w.base);if(!stops.length||!o)return '';
  const tm={auto:'driving',fuss:'walking',rad:'bicycling'}[w.mode];
  return 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(o)+'&destination='+encodeURIComponent(o)+'&waypoints='+encodeURIComponent([...new Set(stops)].slice(0,9).join('|'))+'&travelmode='+tm;
}
function wegeOsmUrl(l,mode){return l.fromGeo&&l.toGeo?'https://www.openstreetmap.org/directions?engine='+WEGE_MODES[mode].osm+'&route='+encodeURIComponent((+l.fromGeo.lat).toFixed(5)+','+(+l.fromGeo.lon).toFixed(5)+';'+(+l.toGeo.lat).toFixed(5)+','+(+l.toGeo.lon).toFixed(5)):''}
/* Kurzzeile für die zugeklappte Ebene „Wege“ (app/ansichten.js planExtras): z. B. „3 Wege · ca. 1 Std. 10 Min., geschätzt“. */
function wegeKurz(t,day){
  if(!CATX)return '';const w=dayWays(t,day);if(!w.stops.length)return 'Noch keine Punkte an diesem Tag';
  const n=w.legs.filter(l=>l.src!=='gleich').length;
  if(!w.known)return n+(n===1?' Weg':' Wege')+' · Lage noch unbekannt';
  return n+(n===1?' Weg':' Wege')+' · '+(w.unknown?'mindestens ':'')+'ca. '+wegeH(w.min)+(w.osrm?', berechnet':', geschätzt');
}
/* Vorschlag „kürzere Reihenfolge“ mit Vorher/Nachher; Übernehmen ändert nur die Reihenfolge innerhalb einer Tageszeit. */
function wegeOrderBlock(t,day){
  let p=null;try{p=wegeOrderProposal(t,day)}catch(e){p=null}if(!p)return '';
  return '<div class="note wege-vorschlag"><b>Kürzere Reihenfolge möglich: spart ca. '+esc(wegeH(Math.round(p.save/5)*5))+'</b><p class="small">Neu: '+esc(p.labels.join(' → '))+'</p><p class="small muted">Nur Punkte ohne Uhrzeit, Buchung oder Fixpunkt wechseln die Reihenfolge, und nur innerhalb ihrer Tageszeit. Schätzung aus Luftlinie.</p><div class="row"><button type="button" class="btn sm" data-wege="order|'+day+'">Reihenfolge übernehmen</button></div></div>';
}
/* Gespeicherte Tagesroute: für alle Mitreisenden sichtbar; Speichern nur mit eigener Berechnung. */
function wegeSavedBlock(t,day,w,edit){
  const sv=w.saved,canF5=typeof f5CanEdit==='function'&&f5CanEdit(t);
  let h='';
  if(sv)h+='<p class="small wege-gespeichert">In der Reise gespeichert: '+(sv.km!=null?'≈ '+esc(wegeKm(sv.km))+' km · ':'')+(sv.min!=null?'ca. '+esc(wegeH(sv.min)):'')+(sv.at?' (berechnet am '+esc(fmtLong(pd(sv.at.slice(0,10))))+')':'')+(sv.match?'':' · <b>passt nicht mehr zur Reihenfolge</b>')+(edit&&canF5?' <button type="button" class="lnk" data-wege="unstore|'+day+'">Entfernen</button>':'')+'</p>';
  if(edit&&canF5&&w.osrm&&!(sv&&sv.match&&sv.min===dayRouteRecord(t,day).min))h+='<div class="row"><button type="button" class="btn ghost sm" data-wege="store|'+day+'">Route in der Reise speichern</button></div><p class="small muted">Gespeichert werden Reihenfolge, km und Minuten, damit Mitreisende dieselben Wege sehen. Keine Orte oder Linien.</p>';
  return h;
}
/* Kurzfassung für die Reisemappe (Druck/PDF): Summe und Skizze, nur wenn etwas bekannt ist. */
function wegeMappe(t,day){
  if(!CATX)return '';const w=dayWays(t,day);if(!w.stops.length||!w.known)return '';
  return '<div class="wege-mappe"><p class="small"><b>Wege:</b> '+esc((w.unknown?'mindestens ':'')+'≈ '+wegeKm(w.km)+' km · ca. '+wegeH(w.min)+' '+WEGE_MODES[w.mode].label+(w.osrm||w.fromSaved?', berechnet':', geschätzt'))+'</p>'+wegeSkizze(w)+'</div>';
}
/* Abschnitt unter dem Zeitstrahl für den gewählten Tag. */
function wegeSection(t,day){
  if(!CATX)return '';const days=daysOf(t);if(!days[day])return '';
  const w=dayWays(t,day),busy=UI.wegeBusy===t.id+'|'+day,msg=UI.wegeMsg&&UI.wegeMsg.key===t.id+'|'+day?UI.wegeMsg.text:'';
  const edit=!(Store.isAccount&&Store.isAccount()&&Store.canEdit&&!Store.canEdit(t.id));
  const modes='<div class="wege-modus" role="group" aria-label="Unterwegs vor Ort">'+Object.keys(WEGE_MODES).map(m=>'<button type="button" class="btn ghost sm" data-wege="mode|'+m+'" aria-pressed="'+(w.mode===m)+'">'+esc(WEGE_MODES[m].short)+'</button>').join('')+'</div>';
  let body;
  if(!w.stops.length)body='<p class="small muted">Noch keine Punkte an diesem Tag. Sobald etwas eingeplant ist, stehen hier Wege und Fahrzeiten.</p>';
  else{
    const sum=w.known?(w.unknown?'mindestens ':'')+'≈ '+wegeKm(w.km)+' km · ca. '+wegeH(w.min)+' unterwegs':'Wege noch unbekannt';
    const unk=w.stops.filter(s=>!s.geo);
    body='<p class="wege-summe"><b>'+esc(sum)+'</b> <span class="small muted">'+esc(WEGE_MODES[w.mode].label)+(w.osrm?' · berechnet'+(w.at?' am '+fmtLong(pd(w.at.slice(0,10))):''):w.fromSaved?' · berechnet, in der Reise gespeichert'+(w.saved.at?' am '+fmtLong(pd(w.saved.at.slice(0,10))):''):w.known?' · geschätzt':'')+'</span></p>'+
     (w.base.approx?'<p class="small muted">Lage der Unterkunft unbekannt: Ausgangspunkt ist die Ortsmitte.</p>':'')+
     wegeSkizze(w)+(edit?wegeOrderBlock(t,day):'')+
     '<ol class="wege-liste">'+w.legs.map((l,i)=>{const u=wegeOsmUrl(l,w.mode);return '<li'+(l.src==='unbekannt'?' class="offen"':'')+'><span class="wege-von">'+(i===0?'⌂ ':'')+esc(l.from)+' → '+(i===w.legs.length-1?'⌂ ':'')+esc(l.to)+'</span><span class="small">'+esc(wegeLegText(l,w.mode))+'</span>'+(u&&l.src!=='gleich'?lk(u,'OSM'):'')+'</li>'}).join('')+'</ol>'+
     (unk.length?'<p class="small muted">Ohne Lage: '+esc(unk.map(s=>s.label+(s.missing?' (nicht gefunden)':s.query?'':' (kein Ort eingetragen)')).join(', '))+'.</p>':'')+
     wegeSavedBlock(t,day,w,edit);
  }
  const app=wegeAppUrl(w);
  /* Breite Ansicht zeigt alle Tage nebeneinander, die Tagesauswahl des Handys ist dort ausgeblendet: eigene Auswahl. */
  const pick=viewDays(t),daySel=pick.length>1?'<label class="wege-tag"><span>Tag</span><select id="wege-day" aria-label="Tag für die Wege wählen">'+pick.map(d=>'<option value="'+d.i+'"'+(d.i===day?' selected':'')+'>'+esc(d.label)+'</option>').join('')+'</select></label>':'';
  return '<section class="block wege" aria-labelledby="wege-h"><div class="between"><h3 id="wege-h">Wege am '+esc(days[day].label)+'</h3>'+daySel+modes+'</div>'+body+
   (w.stops.length?'<div class="row">'+(edit?'<button type="button" class="btn ghost sm" data-wege="calc|'+day+'"'+(busy?' disabled':'')+'>'+(busy?'Berechne …':'Wege berechnen')+'</button>':'')+(app?lk(app,'In Karten-App öffnen'):'')+'</div>'+
    (msg?'<p class="small" role="status">'+esc(msg)+'</p>':'')+
    '<p class="small muted">Schätzung aus Luftlinie, ohne Verkehr und Wartezeit. „Wege berechnen“ sucht fehlende Orte bei OpenStreetMap (Nominatim) und fragt die Route bei routing.openstreetmap.de ab; übertragen werden nur Ortsnamen und Koordinaten. Ergebnisse merkt sich nur dieses Gerät.</p>':'')+
   '</section>';
}
async function wegeAction(v){
  const t=typeof cur==='function'?cur():null;if(!t)return;
  const [kind,val]=String(v||'').split('|');
  if(kind==='mode'){wegeSetMode(t,val);render();return}
  if(kind==='order'){const day=Number(val);try{const c=wegeOrderApply(t,wegeOrderProposal(t,day));t.items=c.items;t.packageId='';save(t);render();alertMsg('Reihenfolge übernommen.')}catch(e){alertMsg(e.message)}return}
  if(kind==='store'||kind==='unstore'){const day=Number(val),on=kind==='store',msg=on?'Route in der Reise gespeichert.':'Gespeicherte Route entfernt.';
    try{const run=o=>wegeStoreRoute(t,day,on,o),r=run({});if(f5Result(r,{run,msg})){render();alertMsg(msg)}}catch(e){alertMsg(e.message)}return}
  if(kind==='calc'){const day=Number(val),key=t.id+'|'+day;if(UI.wegeBusy)return;UI.wegeBusy=key;UI.wegeMsg=null;render();
    try{UI.wegeMsg={key,text:await wegeCalc(t,day)}}catch(e){const m=e&&e.name==='TypeError'?'Keine Verbindung zum Kartendienst.':String(e&&e.message||'Fehler').replace(/\.?$/,'.');UI.wegeMsg={key,text:'Nicht berechnet: '+m+' Die Schätzung bleibt.'}}
    UI.wegeBusy=null;render()}
}
try{if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('change',e=>{
  const el=e.target;if(!el||el.id!=='wege-day')return;UI.planDay=Number(el.value);render();const s=document.querySelector('#wege-day');if(s&&s.focus)s.focus();
})}catch(e){}
try{if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('click',e=>{
  const b=e.target&&e.target.closest&&e.target.closest('[data-wege]');if(b&&!b.disabled){e.preventDefault();wegeAction(b.getAttribute('data-wege'))}
})}catch(e){}
