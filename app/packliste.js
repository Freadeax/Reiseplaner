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

/* ================= Liste anpassen (Format 5, M03.4 / M04.3, Claude 16.11. abends) =================
   t.packing.hidden: abgeleitete Pack- und Dokumentpunkte ausblenden statt löschen (W6: Schlüssel stabil, bleibt nach neuem
   Wetterabruf ausgeblendet). t.packing.custom: eigene Packpunkte mit Gruppe, Person und Menge. t.idDocs: Ausweise mit
   Ablaufdatum, ohne Nummer. t.countries: bestätigte Reiseländer. Geschrieben wird nur über f5Commit (app/format5.js). */
const PK_HIDEABLE=k=>typeof k==='string'&&/^(p-|d-)/.test(k)&&k.length<=120;
const PK_LAST_HIDDEN={};
function pkCanEdit(t){return typeof f5CanEdit==='function'&&f5CanEdit(t)}
function pkPartyName(t,id){const p=(t.party||[]).find(x=>x&&x.id===id);return p&&p.name?p.name:''}
/* Für checklist(t): eigene Packpunkte vor „Eigene Punkte“ einfügen, ausgeblendete Punkte herausnehmen (Liste merken) */
function packFilter(t,groups){
  const pk=t.packing||{},hidden=new Set(Array.isArray(pk.hidden)?pk.hidden:[]),gone=[];
  const own={};
  (Array.isArray(pk.custom)?pk.custom:[]).forEach(x=>{if(!x||!x.id||!x.label)return;const g='Packliste: '+(x.group||'eigene Punkte');
    const note=[x.qty?'Menge: '+x.qty:'',x.who?'packt: '+(pkPartyName(t,x.who)||'?'):''].filter(Boolean).join(' · ');
    (own[g]=own[g]||[]).push(['pk-'+x.id,x.label,note,undefined,null,{own:x.id}])});
  let out=groups.map(([name,items])=>[name,items.filter(i=>{if(hidden.has(i[0])&&PK_HIDEABLE(i[0])){gone.push({key:i[0],label:i[1],group:name});return false}return true})]);
  const ownGroups=Object.keys(own).map(g=>[g,own[g]]);
  if(ownGroups.length){const at=out.findIndex(g=>g[0]==='Eigene Punkte');out.splice(at<0?out.length:at,0,...ownGroups)}
  out=out.filter(g=>g[1].length||g[0]==='Eigene Punkte'||g[0]==='Buchen & Anfragen');
  PK_LAST_HIDDEN[t.id]=gone;
  return out;
}
/* Werkzeuge je Zeile der Checkliste */
function checkRowTools(t,i){
  if(!pkCanEdit(t))return '';
  if(i[5]&&i[5].own)return '<button type="button" class="lnk" data-pk-act="del" data-id="'+esc(i[5].own)+'" aria-label="Packpunkt '+esc(i[1])+' entfernen">Entfernen</button>';
  if(/^iddoc:/.test(i[0]))return '<button type="button" class="lnk" data-pk-act="doc-del" data-id="'+esc(i[0].slice(6))+'" aria-label="Ausweis '+esc(i[1])+' entfernen">Entfernen</button>';
  if(PK_HIDEABLE(i[0]))return '<button type="button" class="lnk" data-pk-act="hide" data-id="'+esc(i[0])+'" aria-label="'+esc(i[1])+' ausblenden">Ausblenden</button>';
  return '';
}
/* Schreibwege (über f5Commit) */
function pkPacking(c,fn){const p={custom:Array.isArray(c.packing&&c.packing.custom)?c.packing.custom.slice():[],hidden:Array.isArray(c.packing&&c.packing.hidden)?c.packing.hidden.slice():[]};fn(p);
  const o={};if(p.custom.length)o.custom=p.custom;if(p.hidden.length)o.hidden=p.hidden;if(Object.keys(o).length)c.packing=o;else delete c.packing}
function pkHide(t,key,hide,opt){
  if(key!=='*'&&!PK_HIDEABLE(key))throw new Error('Dieser Punkt lässt sich nicht ausblenden.');
  return f5Commit(t,c=>pkPacking(c,p=>{if(key==='*'){p.hidden=[];return}p.hidden=p.hidden.filter(k=>k!==key);if(hide)p.hidden.push(key)}),opt);
}
function pkAdd(t,x,opt){
  const label=String(x.label||'').trim();if(!label)throw new Error('Packpunkt: Bezeichnung fehlt.');
  return f5Commit(t,c=>pkPacking(c,p=>{const id=uid('pk');const it={id,label:label.slice(0,80)};
    if(x.group)it.group=String(x.group).trim().slice(0,40);if(x.who)it.who=x.who;if(x.qty)it.qty=String(x.qty).trim().slice(0,20);p.custom.push(it)}),opt);
}
function pkDel(t,id,opt){return f5Commit(t,c=>pkPacking(c,p=>{p.custom=p.custom.filter(x=>x.id!==id)}),opt)}
function pkDocAdd(t,x,opt){
  if(!x.who)throw new Error('Ausweis: Person wählen.');
  if(x.validUntil&&!pd(x.validUntil))throw new Error('Ausweis: Ablaufdatum prüfen.');
  return f5Commit(t,c=>{const d={id:uid('doc'),who:x.who,kind:x.kind||'perso',validUntil:x.validUntil||null};if(x.label)d.label=String(x.label).trim().slice(0,60);c.idDocs=(c.idDocs||[]).concat([d])},opt);
}
function pkDocDel(t,id,opt){return f5Commit(t,c=>{c.idDocs=(c.idDocs||[]).filter(d=>d.id!==id);if(!c.idDocs.length)delete c.idDocs},opt)}
function pkSetCountries(t,list,opt){
  const l=[...new Set((list||[]).map(x=>String(x||'').toUpperCase()).filter(x=>/^[A-Z]{2}$/.test(x)))];
  return f5Commit(t,c=>{if(l.length)c.countries=l.slice(0,30);else delete c.countries},opt);
}
/* Ebene „Liste anpassen“ am Ende der Checkliste */
function packEditPanel(t){
  if(!window.RPPack||!pkCanEdit(t))return '';
  const P=window.RPPack,party=t.party||[],cs=P.tripCountries(t,packCtx(t)),gone=PK_LAST_HIDDEN[t.id]||[];
  const opt=(v,l,sel)=>'<option value="'+esc(v)+'"'+(sel?' selected':'')+'>'+esc(l)+'</option>';
  const who=id=>'<label class="fld"><span>Wer?</span><select id="'+id+'">'+(id==='pk-who'?opt('','alle / egal'):'')+party.map(p=>opt(p.id,p.name)).join('')+'</select></label>';
  /* Reiseland */
  const names=cs.list.map(P.countryName).join(', ');
  const land='<h4>Reiseland</h4>'+(cs.list.length?'<p class="small">'+esc(names)+' · '+(cs.confirmed?'bestätigt':'aus dem Ziel abgeleitet')+'</p>':'<p class="small muted">Noch nicht bekannt.</p>')+
    (cs.confirmed?'<ul class="plain small">'+cs.list.map(c=>'<li>'+esc(P.countryName(c))+' <button type="button" class="lnk" data-pk-act="land-del" data-id="'+esc(c)+'" aria-label="'+esc(P.countryName(c))+' entfernen">Entfernen</button></li>').join('')+'</ul>':'')+
    '<div class="row">'+(!cs.confirmed&&cs.list.length?'<button type="button" class="btn ghost sm" data-pk-act="land-confirm">Stimmt so</button>':'')+
    '<label class="fld"><span>Land hinzufügen</span><select id="pk-land">'+Object.keys(P.COUNTRIES).sort((a,b)=>P.countryName(a).localeCompare(P.countryName(b),'de')).map(c=>opt(c,P.countryName(c))).join('')+'</select></label><button type="button" class="btn ghost sm" data-pk-act="land-add">Hinzufügen</button></div>';
  /* Ausweise */
  const KIND=[['perso','Personalausweis'],['pass','Reisepass'],['kinderpass','Kinderreisepass'],['fuehrerschein','Führerschein'],['gesundheitskarte','Krankenversichertenkarte'],['sonst','Anderes Dokument']];
  const docs='<h4>Ausweise und Ablaufdaten</h4><p class="small muted">Nur Art und Ablaufdatum, keine Nummer. Die Prüfung steht dann in „Dokumente &amp; Einreise“.</p>'+
    (party.length?'<div class="form">'+who('pk-dwho')+'<label class="fld"><span>Dokument</span><select id="pk-dkind">'+KIND.map(([k,l])=>opt(k,l)).join('')+'</select></label><label class="fld"><span>Gültig bis</span><input type="date" id="pk-duntil"></label></div><div class="row"><button type="button" class="btn ghost sm" data-pk-act="doc-add">Ausweis eintragen</button></div>':
     '<p class="small">Dafür zuerst Mitreisende anlegen (Kosten → Aufteilung).</p>');
  /* Eigene Packpunkte */
  const pack='<h4>Eigener Packpunkt</h4><div class="form"><label class="fld"><span>Was?</span><input type="text" id="pk-label" maxlength="80" placeholder="z. B. Spielkarten"></label>'+
    '<label class="fld"><span>Gruppe (optional)</span><input type="text" id="pk-group" maxlength="40" placeholder="z. B. Kinder"></label>'+
    '<label class="fld"><span>Menge (optional)</span><input type="text" id="pk-qty" maxlength="20" placeholder="z. B. 2 Paar"></label>'+(party.length?who('pk-who'):'')+'</div><div class="row"><button type="button" class="btn ghost sm" data-pk-act="add">Packpunkt hinzufügen</button></div>';
  /* Ausgeblendet */
  const hid=gone.length?'<h4>Ausgeblendet · '+gone.length+'</h4><ul class="plain small">'+gone.map(g=>'<li>'+esc(g.label)+' <button type="button" class="lnk" data-pk-act="show" data-id="'+esc(g.key)+'" aria-label="'+esc(g.label)+' wieder zeigen">Zeigen</button></li>').join('')+'</ul>'+(gone.length>1?'<button type="button" class="lnk" data-pk-act="show-all">Alle wieder zeigen</button>':''):'';
  const sum=[cs.list.length?names:'',(t.idDocs||[]).length?(t.idDocs.length+(t.idDocs.length===1?' Ausweis':' Ausweise')):'',gone.length?gone.length+' ausgeblendet':''].filter(Boolean).join(' · ')||'Land, Ausweise, eigene Packpunkte';
  const body='<div id="f5-error" class="note" role="alert" tabindex="-1" hidden></div>'+land+docs+pack+hid;
  return typeof fold==='function'?fold('check-anpassen','Liste anpassen',sum,body,{}):'<div class="panel"><h3>Liste anpassen</h3>'+body+'</div>';
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
  const el=e.target&&e.target.closest&&e.target.closest('[data-pk-act]');if(!el)return;
  const t=cur();if(!t)return;
  const act=el.getAttribute('data-pk-act'),id=el.getAttribute('data-id'),val=x=>{const n=$('#'+x);return n?String(n.value||'').trim():''};
  try{
    let run=null,msg='';
    if(act==='hide'){run=o=>pkHide(t,id,true,o);msg='Ausgeblendet. Unter „Liste anpassen“ wieder zeigen.'}
    else if(act==='show'){run=o=>pkHide(t,id,false,o);msg='Wieder sichtbar.'}
    else if(act==='show-all'){run=o=>pkHide(t,'*',false,o);msg='Alle Punkte wieder sichtbar.'}
    else if(act==='add'){const x={label:val('pk-label'),group:val('pk-group'),qty:val('pk-qty'),who:val('pk-who')};if(!x.label)throw new Error('Packpunkt: Bezeichnung fehlt.');run=o=>pkAdd(t,x,o);msg='Packpunkt hinzugefügt.'}
    else if(act==='del'){run=o=>pkDel(t,id,o);msg='Packpunkt entfernt.'}
    else if(act==='doc-add'){const x={who:val('pk-dwho'),kind:val('pk-dkind'),validUntil:val('pk-duntil')||null};run=o=>pkDocAdd(t,x,o);msg='Ausweis eingetragen.'}
    else if(act==='doc-del'){run=o=>pkDocDel(t,id,o);msg='Ausweis entfernt.'}
    else if(act==='land-confirm'){const l=window.RPPack.tripCountries(t,packCtx(t)).list;run=o=>pkSetCountries(t,l,o);msg='Reiseland bestätigt.'}
    else if(act==='land-add'){const cs=window.RPPack.tripCountries(t,packCtx(t)),l=(cs.confirmed?cs.list:[]).concat([val('pk-land')]);run=o=>pkSetCountries(t,l,o);msg='Reiseland gespeichert.'}
    else if(act==='land-del'){const l=(t.countries||[]).filter(c=>c!==id);run=o=>pkSetCountries(t,l,o);msg='Reiseland entfernt.'}
    if(!run)return;
    const r=run();
    if(f5Result(r,{run,msg})){render();alertMsg(msg)}
  }catch(err){f5Error(err)}
});
