/* Reiseplaner · Check- und Packlisten nach Ziel, Reiseart und Wetter (Claude 16.11.2026, docs/CHECK_PACKLISTE.md).
   Klassisches Skript ohne Bundler, teilt sich den globalen Gültigkeitsbereich mit den übrigen app/*.js-Teilen.
   Regeln stehen in packlogic.js (window.RPPack). Dieser Teil liefert:
   - packExtraGroups(t): Zusatzgruppen für checklist(t) (Dokumente, Packliste passend zur Reise, wegen Wetter)
   - wxPanel(t): Wetterkarte oben in der Checkliste; Abruf nur auf Knopfdruck
   Wetter und Ortssuche werden nur auf dem Gerät gespeichert (localStorage), nie in der Reise, nie synchronisiert. */
"use strict";
const WX_KEY='rp-wetter', WX_GEO_KEY='rp-wetter-orte', WX_MAX=20;
const WX_STATE={busy:null,err:{}};
function wxRead(key){try{const v=JSON.parse(localStorage.getItem(key)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{}}catch(e){return {}}}
function wxWrite(key,obj){try{const ks=Object.keys(obj);if(ks.length>WX_MAX){ks.sort((a,b)=>String(obj[a].fetchedAt||'').localeCompare(String(obj[b].fetchedAt||'')));ks.slice(0,ks.length-WX_MAX).forEach(k=>delete obj[k])}localStorage.setItem(key,JSON.stringify(obj));return true}catch(e){return false}}
const wxDestKey=t=>String(t.dest||'').trim().toLocaleLowerCase('de');
function wxGeo(t){const k=wxDestKey(t);if(!k)return null;const g=wxRead(WX_GEO_KEY)[k];return g&&isFinite(+g.lat)&&isFinite(+g.lon)?g:null}
function wxCatPlace(id){const c=typeof window!=='undefined'&&window.RP_CATALOG;if(!c||!id||!Array.isArray(c.places))return null;return c.places.find(p=>p.id===id)||null}
function packCtx(t){return {place:wxCatPlace,geo:wxGeo(t)}}
function wxToday(){return iso(todayUTC())}
function wxPoint(t){return window.RPPack?window.RPPack.destPoint(t,packCtx(t)):null}
/* Gespeichertes Wetter zur Reise, falls vorhanden: {entry, plan, point} */
function wxCurrent(t){
  if(!window.RPPack)return null;
  const plan=window.RPPack.weatherPlan(t,wxToday()),p=wxPoint(t);
  if(!p||(plan.mode!=='forecast'&&plan.mode!=='climate'))return {plan,point:p,entry:null};
  const entry=wxRead(WX_KEY)[window.RPPack.cacheKey(p,plan,plan.mode)]||null;
  return {plan,point:p,entry:entry&&Array.isArray(entry.days)?entry:null};
}
function packExtraGroups(t){
  const out={docs:null,fit:null,wx:null};
  if(!window.RPPack)return out;
  try{
    const ctx=packCtx(t),cs=window.RPPack.tripCountries(t,ctx);
    out.docs=window.RPPack.docGroup(t,cs,{idDocCheck:window.RPV5&&window.RPV5.idDocCheck,party:t.party});
    const base=[].concat(...Object.values(PACK[t.type]||PACK.standard));
    const place=t.destGeo&&t.destGeo.place?wxCatPlace(t.destGeo.place):null;
    const kinds=place&&Array.isArray(place.kinds)?place.kinds:(t.type==='winter'?['winter']:[]);
    out.fit=window.RPPack.fitGroup(t,base,kinds,nightsOf(t));
    const w=wxCurrent(t);
    if(w&&w.entry)out.wx=window.RPPack.weatherGroup(t,w.entry);
  }catch(e){/* Zusatzpunkte dürfen die Checkliste nie verhindern */}
  return out;
}
/* Abruf: Ort (ggf. Ortssuche), dann Vorhersage oder Archiv. Alles auf Knopfdruck. */
async function wxGeoLookup(t){
  const q=String(t.dest||'').trim();if(!q)throw new Error('Bitte zuerst ein Ziel eintragen.');
  const r=await nominatimFetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&accept-language=de&q='+encodeURIComponent(q),10000);
  if(!r.ok)throw new Error('Ortssuche: Fehler '+r.status);
  const j=await r.json();if(!Array.isArray(j)||!j.length)throw new Error('Ort „'+q+'“ nicht gefunden.');
  const g={lat:Math.round(+j[0].lat*100)/100,lon:Math.round(+j[0].lon*100)/100,label:String(j[0].display_name||q).split(',').slice(0,2).join(',').slice(0,80),country:String(j[0].address&&j[0].address.country_code||'').toUpperCase().slice(0,2),fetchedAt:new Date().toISOString()};
  const all=wxRead(WX_GEO_KEY);all[wxDestKey(t)]=g;wxWrite(WX_GEO_KEY,all);
  return g;
}
async function wxLoad(t){
  const today=wxToday(),plan=window.RPPack.weatherPlan(t,today);
  if(plan.mode!=='forecast'&&plan.mode!=='climate')throw new Error('Wetter gibt es nur für Reisen mit festem Datum, die noch nicht vorbei sind.');
  let p=wxPoint(t);
  if(!p){await wxGeoLookup(t);p=wxPoint(t)}
  if(!p)throw new Error('Ziel nicht gefunden.');
  const get=async u=>{const r=await catTimeout(fetch(u),15000);if(!r.ok)throw new Error('Wetterdienst: Fehler '+r.status);return r.json()};
  let data;
  if(plan.mode==='forecast')data=window.RPPack.normForecast(await get(window.RPPack.forecastUrl(p,plan)));
  else{
    const list=[];let last=null;
    for(const u of window.RPPack.climateUrls(p,plan,today)){try{list.push({year:u.year,data:await get(u.url)})}catch(e){last=e}}
    if(!list.length)throw last||new Error('Wetter: keine Archivwerte erhalten.');
    data=window.RPPack.normClimate(list,plan);
  }
  const entry=Object.assign(data,{fetchedAt:new Date().toISOString(),source:'Open-Meteo',plan});
  const all=wxRead(WX_KEY);all[window.RPPack.cacheKey(p,plan,plan.mode)]=entry;
  if(!wxWrite(WX_KEY,all))throw new Error('Wetter geladen, aber dieser Browser speichert nichts. Bitte Speicher erlauben.');
  return entry;
}
function wxPanel(t){
  if(!window.RPPack)return '';
  if(!window.RP_CATALOG&&typeof catLoadLocal==='function'&&((t.destGeo&&t.destGeo.place)||(t.legs||[]).some(l=>l.place)))catLoadLocal().then(()=>{if(cur()&&cur().id===t.id&&UI.tab==='check')render()}).catch(()=>{});
  const w=wxCurrent(t),plan=w.plan,busy=WX_STATE.busy===t.id,err=WX_STATE.err[t.id];
  /* Zugeklappte Ebene mit Einzeiler (Bedienbarkeit, UI-Thread 16.11.); offen beim Laden oder nach Fehler */
  const box=(sum,body)=>typeof fold==='function'?fold('check-wetter','Wetter am Ziel',sum,'<div class="wx-panel">'+body+'</div>',{force:busy||!!err}):'<div class="panel wx-panel"><h3>Wetter am Ziel</h3>'+body+'</div>';
  if(plan.mode==='none')return box('braucht feste Reisedaten','<p class="small muted">Für Wetter und passende Packpunkte braucht die Reise feste An- und Abreisedaten (Eckdaten).</p>');
  if(plan.mode==='past')return '';
  if(!w.point&&!String(t.dest||'').trim())return box('erst Ziel festlegen','<p class="small muted">Erst ein Ziel festlegen (Ort &amp; Unterkunft oder Eckdaten), dann lässt sich das Wetter laden.</p>');
  const pl=typeof placeOf==='function'?placeOf(t):null,where=(w.point&&w.point.label)||(pl&&pl.name)||t.dest||'das Ziel';
  const btn=label=>'<button type="button" class="btn ghost sm" data-act="wx-load"'+(busy?' disabled aria-busy="true"':'')+'>'+(busy?'Lädt …':label)+'</button>';
  const privacy='<p class="small muted">Sendet nur die gerundete Lage des Ziels und die Reisedaten an Open-Meteo'+(w.point?'':' (vorher eine Ortssuche bei OpenStreetMap)')+'. Keine Personen, kein Startort. Gespeichert wird nur auf diesem Gerät.</p>';
  const e=w.entry,errHtml=err?'<p class="small" role="alert">⚠ '+esc(err)+(e?' Die zuletzt geladenen Werte bleiben sichtbar.':'')+'</p>':'';
  if(!e)return box(busy?'lädt …':err?'Fehler beim Laden':plan.mode==='forecast'?'Vorhersage laden':'typische Werte laden','<p class="small">'+(plan.mode==='forecast'?'Vorhersage für '+esc(where)+' laden?':'Bis zur Reise ist es noch weit. Typische Werte der letzten Jahre für '+esc(where)+' laden? Eine Vorhersage gibt es ab '+window.RPPack.fmtDate(plan.forecastFrom)+'.')+'</p>'+errHtml+'<div class="row">'+btn(plan.mode==='forecast'?'Vorhersage laden':'Typische Werte laden')+'</div>'+privacy);
  const stale=window.RPPack.isStale(e,Date.now()),at=new Date(e.fetchedAt);
  const atText=String(at.getDate()).padStart(2,'0')+'.'+String(at.getMonth()+1).padStart(2,'0')+'. '+String(at.getHours()).padStart(2,'0')+':'+String(at.getMinutes()).padStart(2,'0');
  const fc=e.kind==='forecast';
  const rows=e.days.map(d=>'<li><b>'+window.RPPack.fmtDay(d.date)+'</b> '+esc(window.RPPack.dayText(d,e.kind))+'</li>').join('');
  const missing=fc&&plan.cut?'<li class="muted">Ab '+window.RPPack.fmtDay(window.RPPack.addDays(plan.to,1))+' noch keine Vorhersage</li>':'';
  const lows=e.days.map(d=>d.tmin).filter(v=>v!=null),highs=e.days.map(d=>d.tmax).filter(v=>v!=null);
  const sum=(fc?'Vorhersage':'Durchschnitt')+(lows.length&&highs.length?' · '+dec(Math.min(...lows),0)+' bis '+dec(Math.max(...highs),0)+' °C':'')+(stale?' · veraltet':'');
  return box(sum,
   '<p class="small"><b>'+(fc?'Vorhersage':'Durchschnitt '+e.years[0]+(e.years.length>1?'–'+e.years[e.years.length-1]:'')+', keine Vorhersage')+'</b> für '+esc(where)+'</p>'+
   '<ul class="wx-days small">'+rows+missing+'</ul>'+
   '<p class="small muted">Quelle: <a href="'+window.RPPack.LINKS.openMeteo.url+'" target="_blank" rel="noopener">Open-Meteo ↗</a> (CC BY 4.0), abgerufen '+atText+(stale?' · <b>veraltet, bitte neu laden</b>':'')+(fc?'':' · Vorhersage ab '+window.RPPack.fmtDate(plan.forecastFrom))+'. Wetter ist keine Zusage, Schnee nicht garantiert. Passende Punkte stehen unten unter „Packliste: wegen Wetter“.</p>'+
   errHtml+'<div class="row">'+btn('Neu laden')+'</div>');
}
document.addEventListener('click',async e=>{
  const b=e.target&&e.target.closest&&e.target.closest('[data-act="wx-load"]');if(!b)return;
  const t=cur();if(!t||WX_STATE.busy)return;
  WX_STATE.busy=t.id;delete WX_STATE.err[t.id];render();
  try{await wxLoad(t)}catch(err){WX_STATE.err[t.id]=err&&err.message?err.message:'Wetter konnte nicht geladen werden.'}
  finally{WX_STATE.busy=null;if(cur()&&cur().id===t.id)render()}
});
