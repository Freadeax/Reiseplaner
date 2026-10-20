/* Reiseplaner · Tagesplan und Rundreise.
   Teil 15 von 22 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Tagesplan: realistische Tage, Tausch, Lücken, Tagesroute (Issue #8) ================= */
const DRIVE_KMH=80, DAY_HOURS=10;
function actHours(a){if(!a)return null;const h=num(a.hours,0);if(h>0)return h;if(CATX)return CATX.parseHours(a.dur);const m=String(a.dur||'').replace(',','.').match(/(\d+(?:\.\d+)?)\s*std/i);return m?+m[1]:null}
/* Fahrminuten je Tag: Anreise, Etappen (Rundreise), Heimfahrt. Straßen-km aus der Reise, Ø 80 km/h, Schätzung. */
function driveByDay(t){
  const n=daysOf(t).length,out=new Array(n).fill(0);if(t.travel!=='auto')return out;
  const km=routeKm(t),min=k=>Math.round(k/DRIVE_KMH*60),routed=t.kmSrc==='route';
  if(Array.isArray(t.legs)&&t.legs.length){let d=0;const inc=t.legs.reduce((x,l)=>x+num(l.roadKm,0),0);
    t.legs.forEach((l,i)=>{if(d<n)out[d]+=num(l.routeMin,0)>0?num(l.routeMin,0):min(num(l.roadKm,0));d+=Math.max(1,Math.round(num(l.nights,1)))});
    out[n-1]+=routed&&num(t.routeHomeMin,0)>0?num(t.routeHomeMin,0):min(Math.max(0,km*2-inc));return out}
  const one=routed&&num(t.routeMin,0)>0?num(t.routeMin,0):min(km),back=routed&&num(t.routeHomeMin,0)>0?num(t.routeHomeMin,0):one;
  if(n===1){out[0]=one+back;return out}
  out[0]=one;out[n-1]+=back;return out;
}
/* Tageslast: Punkte einmal je Tag gruppiert (linear statt Tage × Punkte). Ergebnis je Reiseobjekt gemerkt, solange sich
   die Reise nicht ändert (Schlüssel = gespeicherte Form); Ansichten rufen dayLoad(t)[i] oft je Tag auf. */
const LOAD_CACHE=new WeakMap();
function dayLoad(t){
  const key=JSON.stringify(t),hit=LOAD_CACHE.get(t);if(hit&&hit.key===key)return hit.load;
  const days=daysOf(t),drive=driveByDay(t),byDay=new Map();
  (t.items||[]).forEach(it=>{if(!byDay.has(it.day))byDay.set(it.day,[]);byDay.get(it.day).push(it)});
  const load=days.map(d=>{let planned=0,unknown=0;
    (byDay.get(d.i)||[]).forEach(it=>{const a=actOf(t,it.act);if(!a||a.transit)return;const h=actHours(a);if(h==null)unknown++;else planned+=h});
    const cap=Math.max(0,DAY_HOURS-drive[d.i]/60);
    return {day:d.i,planned:Math.round(planned*10)/10,unknown,drive:drive[d.i],cap:Math.round(cap*10)/10,over:planned>cap+0.25};
  });
  LOAD_CACHE.set(t,{key,load});
  return load;
}
/* Kartenlink mit allen Stationen eines Tages (Reihenfolge wie im Plan), Start und Ziel = Unterkunft bzw. Reiseziel */
function dayRouteUrl(t,day){
  const st=stayOf(t),base=(st&&(st.ort||st.name))||t.dest||'';
  const stops=sortedItems(t).filter(it=>it.day===day).map(it=>actOf(t,it.act)).filter(a=>a&&!a.transit&&(a.map||a.ort)).map(a=>a.map||a.ort);
  const uniq=[...new Set(stops)].slice(0,9);
  if(!uniq.length||!base)return '';
  return 'https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(base)+'&destination='+encodeURIComponent(base)+'&waypoints='+encodeURIComponent(uniq.join('|'))+'&travelmode=driving';
}
function swapDays(t,a,b){const c=clone(t);(c.items||[]).forEach(it=>{if(it.day===a)it.day=b;else if(it.day===b)it.day=a});c.packageId='';return c}
function sheetSwap(t,day){
  const days=daysOf(t),pick=viewDays(t);
  openSheet('<h2>'+esc(days[day].label)+' tauschen</h2><p class="small muted">Alle Punkte dieses Tages wechseln mit einem anderen Tag, z. B. wenn das Wetter umschlägt. Gebuchte oder bezahlte Termine werden nicht verschoben. Anreise- und Abreisetag behalten ihre Fahrten.</p>'+
   longTripNote(t,'Die Auswahl')+'<div class="checks-list">'+pick.filter(d=>d.i!==day).map(d=>{const n=(t.items||[]).filter(it=>it.day===d.i).length;return '<button type="button" class="chk info" style="cursor:pointer;text-align:left" data-act="day-swap" data-val="'+day+'|'+d.i+'"><span><strong>mit '+esc(d.label)+'</strong> <span class="small muted">'+n+' Punkt(e)</span></span></button>'}).join('')+'</div>');
}
async function planFillSheet(t){
  const g=t.destGeo;if(!g||!CATX)return;
  openSheet('<span class="eyebrow">Lücken füllen</span><h2>Freie Zeitfenster mit Ideen aus der Umgebung</h2><div id="fill-box"><p role="status">Suche …</p></div>');
  try{
    const pts=Array.isArray(t.legs)&&t.legs.length?t.legs:[g];
    const have=new Set((t.customActs||[]).map(a=>a.catalogSpot).filter(Boolean));
    const month=t.dateMode==='fix'&&pd(t.start)?pd(t.start).getUTCMonth()+1:t.dateMode==='flex'&&t.month?+t.month.slice(5,7):null;
    const found=new Map();let src=null;
    for(const q of pts){const r=await catalogQuery({lat:+q.lat,lon:+q.lon,maxKm:60,minKm:0});src=src||r;
      r.places.forEach(pl=>pl.spots.forEach(sp=>{if(have.has(sp.id)||found.has(sp.id)||CATX.spotSeason(sp,month)===false)return;const d=CATX.airKm(q,sp);if(d<=35)found.set(sp.id,{spot:sp,place:pl,d})}))}
    const list=[...found.values()].sort((a,b)=>a.d-b.d).slice(0,24);
    const occ=(t.items||[]).map(it=>it.day+'|'+it.slot);
    const prop=CATX.dayPlan(list.map(e=>e.spot),nightsOf(t),occ);
    const days=daysOf(t);
    UI.fillDraft={tripId:t.id,source:JSON.stringify(t.items||[]),items:prop.map(pr=>({pr,e:found.get(pr.spotId)}))};
    const box=$('#fill-box');if(!box)return;
    box.innerHTML=prop.length?catSourceLine(src)+'<div class="checks-list">'+UI.fillDraft.items.map((x,i)=>'<label class="chk info"><input type="checkbox" data-fill="'+i+'" checked> <span><strong>'+esc((days[x.pr.day]||{}).label||'')+' · '+esc(SLOTNAME[x.pr.slot])+':</strong> '+esc(x.e.spot.name)+' <span class="small muted">'+esc(x.e.place.name)+(x.e.d>2?' · ≈ '+CATX.roadKm(x.e.d)+' km':'')+'</span><br><small>'+esc(x.e.spot.summary)+'</small></span></label>').join('')+'</div><div class="row"><button type="button" class="btn" data-act="plan-fill-do">Ausgewählte einplanen</button></div>':'<p>Keine freien Zeitfenster oder keine passenden Ideen in der Nähe.</p>';
  }catch(e){const box=$('#fill-box');if(box)box.innerHTML='<p>'+esc(e.message)+'</p>'}
}
function planFillApply(t){
  const d=UI.fillDraft;if(!d||d.tripId!==t.id)return 0;
  if(d.source!==JSON.stringify(t.items||[]))throw new Error('Der Tagesplan hat sich inzwischen geändert. Bitte „Lücken füllen“ neu öffnen.');
  const pick=[...document.querySelectorAll('[data-fill]')].filter(c=>c.checked).map(c=>d.items[+c.getAttribute('data-fill')]).filter(Boolean);
  pick.forEach(x=>{const a=CATX.toAct(x.e.spot,x.e.place,uid);if(x.e.d>2){a.km=CATX.roadKm(x.e.d)*2;a.note+=' Ausflug, hin und zurück ca. '+a.km+' km (geschätzt).'}t.customActs=(t.customActs||[]).concat([a]);t.items=(t.items||[]).concat([{uid:uid('i'),act:a.id,day:x.pr.day,slot:x.pr.slot}])});
  return pick.length;
}

/* ================= Rundreise: Etappen umsortieren und Nächte ändern (Issue #8) ================= */
/* Tag, an dem Etappe i beginnt; die letzte Etappe reicht bis zum Abreisetag. */
function legStarts(legs){let d=0;return legs.map(l=>{const s=d;d+=Math.max(1,Math.round(num(l.nights,1)));return s})}
function legOfDay(starts,day){let k=0;starts.forEach((s,i)=>{if(day>=s)k=i});return k}
/* order: neue Reihenfolge als Indizes der alten Etappen; nights: Nächte in neuer Reihenfolge. Gibt eine geänderte Kopie zurück. */
function reorderLegs(t,order,nights){
  const legs=t.legs||[];
  if(!Array.isArray(order)||order.length!==legs.length||[...order].sort((a,b)=>a-b).some((v,i)=>v!==i))throw new Error('Ungültige Reihenfolge.');
  const nn=(nights||order.map(i=>legs[i].nights)).map(n=>Math.max(1,Math.min(21,Math.round(num(n,1)))));
  const oldTotal=legs.reduce((x,l)=>x+Math.max(1,Math.round(num(l.nights,1))),0),newTotal=nn.reduce((a,b)=>a+b,0);
  if(t.dateMode==='fix'&&newTotal!==oldTotal)throw new Error('Feste Reisedaten: Die Summe der Nächte muss gleich bleiben ('+oldTotal+'). Daten zuerst unter „Eckdaten“ ändern.');
  const c=clone(t),oldStarts=legStarts(legs);
  const newLegs=order.map((i,k)=>Object.assign({},legs[i],{nights:nn[k]})),newStarts=legStarts(newLegs),lastDay=newTotal;
  const transitIds=new Set((c.customActs||[]).filter(a=>a.transit).map(a=>a.id));
  c.items=(c.items||[]).filter(it=>!transitIds.has(it.act)).map(it=>{
    const k=legOfDay(oldStarts,it.day),pos=order.indexOf(k),off=it.day-oldStarts[k];
    const span=pos===newLegs.length-1?lastDay-newStarts[pos]:newLegs[pos].nights-1;
    return Object.assign({},it,{day:newStarts[pos]+Math.max(0,Math.min(off,span))});
  });
  c.customActs=(c.customActs||[]).filter(a=>!a.transit);
  /* Etappen-km neu schätzen; ohne Koordinaten des Starts bleiben Anfahrt und Heimfahrt unbekannt */
  const est=(a,b)=>CATX?CATX.roadKm(CATX.airKm(a,b)):null,og=t.originGeo&&CATX&&CATX.validPoint(t.originGeo)?t.originGeo:null;
  newLegs.forEach((l,k)=>{const from=k===0?og:newLegs[k-1];l.roadKm=from&&est(from,l)!=null?est(from,l):(k===0?num(l.roadKm,0):l.roadKm)});
  newLegs.forEach((l,k)=>{if(k===0)return;const min=Math.round(num(l.roadKm,0)/DRIVE_KMH*60);
    const mv={id:uid('c'),custom:true,t:'Weiterfahrt nach '+l.name,cat:'eigen',cost:0,per:'grp',dur:'ca. '+(CATX?CATX.durText(min):min+' Min.'),link:'',note:'Etappe ≈ '+num(l.roadKm,0)+' km (geschätzt). Die Kilometer sind schon in der Anreise der Reise enthalten.',slot:'morgen',map:l.name,ort:l.name,transit:true,hours:Math.round(min/6)/10};
    c.customActs.push(mv);c.items.push({uid:uid('i'),act:mv.id,day:newStarts[k],slot:'morgen'})});
  c.legs=newLegs;c.dest=newLegs.map(l=>l.name).join(' → ').slice(0,200);
  if(c.dateMode!=='fix')c.nights=newTotal;
  if(og&&c.kmSrc==='schaetzung'){const home=est(newLegs[newLegs.length-1],og);c.km=Math.round((newLegs.reduce((x,l)=>x+num(l.roadKm,0),0)+home)/2)}
  c.packageId='';
  return {trip:c,recalculated:!!og};
}
function legsBlock(t){
  if(!Array.isArray(t.legs)||!t.legs.length)return '';
  const L=t.legs,edit=!(Store.isAccount()&&!Store.canEdit(t.id)),d=UI.legDraft&&UI.legDraft.trip===t.id?UI.legDraft:null;
  const order=d?d.order:L.map((_,i)=>i),nights=d?d.nights:L.map(l=>Math.max(1,Math.round(num(l.nights,1))));
  return '<section class="block"><h2>Etappen</h2><ol class="steps">'+order.map((i,k)=>{const l=L[i];return '<li><b>'+esc(l.name)+'</b> · '+(edit?'<label class="small">Nächte <input type="number" min="1" max="21" data-leg-n="'+k+'" value="'+nights[k]+'" style="width:5em;display:inline-block;min-height:36px"></label>':nights[k]+' Nacht/Nächte')+
    (d?'':' <span class="small muted">(Anfahrt ≈ '+num(l.roadKm,0)+' km, geschätzt)</span>')+' '+lk(mp(l.name),'Karte')+
    (edit?' <span class="row" style="display:inline-flex"><button type="button" class="lnk" data-act="leg-move" data-val="'+k+'|-1"'+(k===0?' disabled':'')+' aria-label="'+esc(l.name)+' früher">↑ früher</button><button type="button" class="lnk" data-act="leg-move" data-val="'+k+'|1"'+(k===order.length-1?' disabled':'')+' aria-label="'+esc(l.name)+' später">↓ später</button></span>':'')+'</li>'}).join('')+'</ol>'+
   (d?'<div class="note"><b>Neue Reihenfolge noch nicht übernommen</b><p>Die Programmpunkte wandern mit ihrer Etappe, Weiterfahrten und Kilometer werden neu geschätzt'+(t.originGeo?'':' (ohne Koordinaten des Abfahrtsorts bleiben Anfahrt und Heimfahrt unverändert)')+'. Gebuchte oder bezahlte Termine werden nicht verschoben.</p><div class="row"><button type="button" class="btn sm" data-act="leg-apply">Übernehmen</button><button type="button" class="btn ghost sm" data-act="leg-cancel">Verwerfen</button></div></div>':'')+'</section>';
}

