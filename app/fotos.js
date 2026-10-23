/* Reiseplaner · Foto-Import und Fotoansicht (Paket 8, PLAN_IOS_APP §6.1–6.2).
   Eigener Teil der App, geladen nach app/reisebuch.js und vor app/start.js. Klassisches Skript ohne Bundler: Alle Teile
   teilen sich den globalen Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen.
   - Ablage und Import: photostore.js (window.RPPhotos), Prüfung der Einträge: v4logic.js (window.RPV4).
   - In die Reise schreibt nur Paket 7 (Format 4 im Speicher) über zwei globale Funktionen:
       mediaCommit(t, entries)        → {ok:true, trip} | {ok:false, error}   (neue Einträge an t.media anhängen)
       mediaRemove(t, mediaId, {confirm}) → {ok:true, trip} | {ok:false, uses?, error?}  (wie RPV4.removeMedia, aber gespeichert)
     Beide dürfen ein Promise liefern. Fehlt mediaCommit, ist der Import gesperrt und es wird nichts abgelegt;
     fehlt mediaRemove, gibt es keinen Löschen-Knopf.
   - Ablauf: Dateien nacheinander vorbereiten (prepare, keepLocation: true, keepOriginal: false, Entscheidung Philipp 19.10.)
     und sofort in rp-media ablegen; dann Prüfliste „passt / ändern“ mit Korb „ohne Tag“. Erst „Übernehmen und speichern“
     ruft applyChoice(…, {confirmed: true}) und mediaCommit auf. Abbrechen löscht die abgelegten Dateien wieder.
   - Anzeige: Vorschaubilder je Tag (Tagesplan, Erinnerungen), Fotoblatt mit Arbeitskopie, Aufnahmezeit, Ort als Text und
     Kartenlink (OpenStreetMap, keine Kartenbibliothek). Fehlt die Datei auf diesem Gerät, steht das dort; der Eintrag bleibt.
   - reisebuchPhotoUrl (app/reisebuch.js) liefert die Vorschaubilder für die Reisebuch-Vorschau.
   Einbindung (Vorschlag): pakete/fotos-ui/EINBINDUNG.md. Rein rechnerische Teile sind in tests/fotos.cjs geprüft. */
"use strict";
const FOTOS_NO_BACKUP='Lokale Fotos sind keine Sicherung. Sie liegen nur in diesem Browser auf diesem Gerät, bis ihr sie exportiert; beim Löschen der Website-Daten sind sie weg.';
const FOTOS_DAY_MAX=4;   /* Vorschaubilder je Tag in der Tagesspalte, Rest als „+n“ */
/* Abhängigkeiten; Tests setzen store/codec/url ein */
const FOTOS={store:null,codec:null,url:null,persistAsked:false};
const fotosUrls=new Map();  /* Foto-ID → {state:'ok'|'missing'|'damaged'|'error', url?} (Vorschaubild) */
const fotosWant=new Set();
let fotosPumping=false,fotosBookWaiting=false,fotosFull=null;

function FP(){const w=typeof window!=='undefined'?window:null;return w&&w.RPPhotos&&w.RPV4?w.RPPhotos:null}
function fotosV4(){return typeof window!=='undefined'&&window.RPV4||null}
function fotosStore(){if(!FOTOS.store)FOTOS.store=FP().create({});return FOTOS.store}
function fotosCodec(){return FOTOS.codec||FP().browserCodec(window)}
function fotosUrlApi(){return FOTOS.url||(typeof URL!=='undefined'?URL:null)}
function fotosBlobUrl(bytes,type){const U=fotosUrlApi();return U&&typeof Blob!=='undefined'?U.createObjectURL(new Blob([bytes],{type:type||'image/jpeg'})):null}
function fotosRevoke(url){const U=fotosUrlApi();if(url&&U&&U.revokeObjectURL)try{U.revokeObjectURL(url)}catch(e){}}
function fotosState(){if(!UI.fotos)UI.fotos={tid:null,busy:false,done:0,total:0,msg:'',errors:[],dups:0,review:null,del:null};return UI.fotos}

/* ---------- Teil 1: reine Logik ---------- */
/* Warum kann diese Reise keine Fotos aufnehmen? '' = sie kann. */
function fotosBlocked(t){
 if(!FP())return 'Diese App-Version kann noch keine Fotos aufnehmen.';
 if(typeof mediaCommit!=='function')return 'Fotos lassen sich erst mit Format 4 in der Reise speichern. Diese App-Version kann das noch nicht.';
 if(typeof F4_WRITE!=='undefined'&&!F4_WRITE)return 'Fotos hinzufügen wird mit einem der nächsten Updates freigeschaltet. Diese Version bereitet das neue Speicherformat vor.';
 if(!FOTOS.store&&!(typeof window!=='undefined'&&window.indexedDB))return 'Dieser Browser erlaubt keinen Fotospeicher (zum Beispiel im privaten Fenster).';
 if(t&&typeof v3CanEdit==='function'&&!v3CanEdit(t))return 'Diese Reise könnt ihr hier gerade nur lesen.';
 return '';
}
function fotosDays(t){return daysOf(t).map(d=>({i:d.i,date:d.date?iso(d.date):null,label:d.label}))}
function fotosDayKey(d){return d.date!=null?d.date:'d'+d.i}
function fotosDate(s){const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));return m?m[3]+'.'+m[2]+'.'+m[1]:''}
/* Aufnahmezeit als Text. Ortszeit der Kamera, wie gespeichert; keine Umrechnung in die Gerätezeitzone. */
function fotosTime(takenAt){
 const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(takenAt||''));
 return m?m[3]+'.'+m[2]+'.'+m[1]+', '+m[4]+':'+m[5]+' Uhr':'';
}
function fotosDayLabel(t,key){
 if(key==null)return 'Ohne Tag';
 const d=fotosDays(t).find(x=>fotosDayKey(x)===key);if(d)return d.label;
 const m=/^d(\d+)$/.exec(key);if(m)return 'Tag '+(+m[1]+1)+' (gehört nicht mehr zur Reise)';
 return fotosDate(key)+' (außerhalb des Reisezeitraums)';
}
/* Sichtbare Fotos (ohne ausgeblendete) in Aufnahmereihenfolge, ohne Zeit zuletzt */
function fotosList(t){
 return (t&&Array.isArray(t.media)?t.media:[]).filter(m=>m&&m.kind==='photo'&&!m.hidden).slice()
  .sort((a,b)=>a.takenAt===b.takenAt?(a.id<b.id?-1:a.id>b.id?1:0):!a.takenAt?1:!b.takenAt?-1:a.takenAt<b.takenAt?-1:1);
}
/* Fotos nach Reisetagen. outside: Tage, die es in der Reise nicht (mehr) gibt; basket: ohne Tag */
function fotosByDay(t){
 const days=fotosDays(t).map(d=>({i:d.i,key:fotosDayKey(d),label:d.label,photos:[]})),idx=new Map(days.map(d=>[d.key,d])),outside=new Map(),basket=[];
 fotosList(t).forEach(m=>{
  if(m.day==null){basket.push(m);return}
  const d=idx.get(m.day);if(d){d.photos.push(m);return}
  if(!outside.has(m.day))outside.set(m.day,{key:m.day,label:fotosDayLabel(t,m.day),photos:[]});
  outside.get(m.day).photos.push(m);
 });
 return {days,outside:[...outside.values()].sort((a,b)=>a.key<b.key?-1:1),basket,count:days.reduce((n,d)=>n+d.photos.length,0)+basket.length+[...outside.values()].reduce((n,d)=>n+d.photos.length,0)};
}
/* Koordinate als Text mit Komma, z. B. „47,56120° N, 10,22010° O“ */
function fotosCoords(lat,lon){
 if(typeof lat!=='number'||typeof lon!=='number'||!isFinite(lat)||!isFinite(lon))return '';
 const f=v=>Math.abs(v).toFixed(5).replace('.',',');
 return f(lat)+'° '+(lat<0?'S':'N')+', '+f(lon)+'° '+(lon<0?'W':'O');
}
function fotosMapUrl(lat,lon){
 if(!fotosCoords(lat,lon))return '';
 const a=lat.toFixed(5),b=lon.toFixed(5);
 return 'https://www.openstreetmap.org/?mlat='+a+'&mlon='+b+'#map=16/'+a+'/'+b;
}
/* Katalog-Attraktionen rund ums Ziel (nur wenn der Katalog geladen ist) */
let fotosSpotMemo=null;
function fotosCatalogSpots(t){
 const cat=typeof window!=='undefined'&&window.RP_CATALOG,C=typeof window!=='undefined'&&window.RPCatalog;
 if(!cat||!Array.isArray(cat.places)||!t||!t.destGeo||!C||typeof C.airKm!=='function')return [];
 const key=t.destGeo.lat+','+t.destGeo.lon;
 if(fotosSpotMemo&&fotosSpotMemo.cat===cat&&fotosSpotMemo.key===key)return fotosSpotMemo.out;
 const out=[];fotosSpotMemo={cat,key,out};
 cat.places.forEach(p=>{if(!p||!Array.isArray(p.spots)||C.airKm(t.destGeo,p)>40)return;p.spots.forEach(s=>{if(s&&s.id&&isFinite(s.lat)&&isFinite(s.lon))out.push({id:String(s.id),name:String(s.name||''),lat:+s.lat,lon:+s.lon})})});
 return out;
}
function fotosSpotName(t,id){if(!id)return '';const s=fotosCatalogSpots(t).find(x=>x.id===id);return s?s.name:''}
/* Ortsangabe eines Fotos: Name (Unternehmung oder Attraktion), Koordinaten, Kartenlink */
function fotosPlace(t,m){
 const a=m.actId&&typeof actOf==='function'?actOf(t,m.actId):null;
 return {name:a&&a.t?a.t:fotosSpotName(t,m.spotId),coords:fotosCoords(m.lat,m.lon),mapUrl:fotosMapUrl(m.lat,m.lon)};
}
function fotosAlt(t,m){
 const p=fotosPlace(t,m),time=fotosTime(m.takenAt);
 return 'Foto'+(time?' vom '+time:' ohne Aufnahmezeit')+(p.name?' bei '+p.name:'')+(m.caption?': '+m.caption:'');
}
/* Zuordnungs-Kontext für RPPhotos.suggest: Tage, geplante Unternehmungen mit Ort, Katalog-Attraktionen */
function fotosCtx(t){
 const acts=new Map();
 sortedItems(t).forEach(it=>{const a=actOf(t,it.act);if(!a||a.transit||!Number.isInteger(it.day))return;
  if(!acts.has(a.id))acts.set(a.id,{id:a.id,title:a.t||'',days:[],catalogSpot:a.catalogSpot||null,geo:a.geo&&isFinite(a.geo.lat)&&isFinite(a.geo.lon)?{lat:+a.geo.lat,lon:+a.geo.lon}:null});
  const x=acts.get(a.id);if(!x.days.includes(it.day))x.days.push(it.day)});
 return {days:fotosDays(t).map(d=>({i:d.i,date:d.date})),acts:[...acts.values()].map(a=>a.geo?Object.assign({},a,{lat:a.geo.lat,lon:a.geo.lon}):a),spots:fotosCatalogSpots(t)};
}
/* Was gilt für eine Zeile der Prüfliste? mode 'passt': Vorschlag, 'aendern': eigene Wahl {day, actId}. */
function fotosChoice(t,row){
 const s=row.suggestion||{};
 if(row.mode==='passt'&&!s.basket)return {day:s.day,actId:s.actId||null,spotId:s.spotId||null};
 const c=row.choice||{},day=c.day?c.day:null,actId=c.actId?c.actId:null;
 let spotId=null;
 if(actId&&actId===s.actId)spotId=s.spotId||null;
 else if(actId){const a=actOf(t,actId);spotId=a&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(a.catalogSpot||'')?a.catalogSpot:null}
 else if(day&&day===s.day&&!s.actId)spotId=s.spotId||null;
 return {day,actId,spotId};
}
/* Vorschlag als lesbarer Satz */
function fotosSuggestText(t,s){
 if(!s)return 'Kein Vorschlag.';
 const why={'ohne-zeit':'Keine Aufnahmezeit im Foto.','ohne-daten':'Die Reise hat noch keine festen Daten.','ausserhalb':'Aufgenommen außerhalb des Reisezeitraums.'};
 if(s.basket)return why[s.dayWhy]||'Kein passender Reisetag.';
 let txt=fotosDayLabel(t,s.day);
 if(s.actId){const a=actOf(t,s.actId);txt+=' · '+(a?a.t:'Unternehmung')+(s.distanceM!=null?' ('+s.distanceM.toLocaleString('de-DE')+' m entfernt)':'')}
 else if(s.spotId){txt+=' · '+(fotosSpotName(t,s.spotId)||'Attraktion aus dem Katalog')+(s.distanceM!=null?' ('+s.distanceM.toLocaleString('de-DE')+' m entfernt)':'')}
 else if(s.placeWhy==='mehrdeutig')txt+=' · Ort nicht eindeutig, mehrere Unternehmungen liegen nah beieinander';
 return txt;
}

/* ---------- Teil 2: Vorschaubilder laden ---------- */
function fotosThumbInner(id){
 const u=fotosUrls.get(id);
 if(u&&u.state==='ok')return '<img src="'+esc(u.url)+'" alt="" loading="lazy" decoding="async">';
 const txt=!u?'Foto lädt …':u.state==='missing'?'Nicht auf diesem Gerät':u.state==='damaged'?'Datei beschädigt':'Nicht lesbar';
 if(!u)fotosRequest(id);
 return '<span class="foto-ph">'+txt+'</span>';
}
function fotosThumb(t,m){
 return '<button type="button" class="foto-thumb" data-foto-act="open" data-tid="'+esc(t.id)+'" data-id="'+esc(m.id)+'" data-foto-thumb="'+esc(m.id)+'" aria-label="'+esc(fotosAlt(t,m))+' – ansehen">'+fotosThumbInner(m.id)+(m.fav?'<span class="foto-fav">Lieblingsfoto</span>':'')+'</button>';
}
function fotosRequest(id,book){
 if(book)fotosBookWaiting=true;
 if(fotosUrls.has(id)||!FP())return;
 fotosWant.add(id);
 if(!fotosPumping){fotosPumping=true;Promise.resolve().then(fotosPump)}
}
/* Nacheinander laden (wenig Arbeitsspeicher); danach nur die betroffenen Knöpfe neu füllen, kein Neuaufbau der Ansicht */
async function fotosPump(){
 try{
  while(fotosWant.size){
   const id=fotosWant.values().next().value;fotosWant.delete(id);
   let r;
   try{const rec=await fotosStore().get(id,'thumb');r=!rec?{state:'missing'}:rec.damaged?{state:'damaged'}:{state:'ok',url:fotosBlobUrl(rec.bytes,rec.type)};if(r.state==='ok'&&!r.url)r={state:'error'}}
   catch(e){r={state:'error'}}
   fotosUrls.set(id,r);fotosPaint(id);
  }
 }finally{fotosPumping=false}
 if(fotosBookWaiting){fotosBookWaiting=false;if(UI.view==='erinnerungen'&&UI.book&&typeof document!=='undefined'&&!document.querySelector('.sheet')&&typeof render==='function')render()}
}
function fotosPaint(id){
 if(typeof document==='undefined'||!document.querySelectorAll)return;
 document.querySelectorAll('[data-foto-thumb="'+id+'"]').forEach(el=>{const fav=el.querySelector&&el.querySelector('.foto-fav');el.innerHTML=fotosThumbInner(id)+(fav?fav.outerHTML:'')});
}
function fotosForget(id){const u=fotosUrls.get(id);if(u)fotosRevoke(u.url);fotosUrls.delete(id)}
/* Reisebuch-Vorschau (app/reisebuch.js): synchron, null = Platzhalter, lädt im Hintergrund nach */
reisebuchPhotoUrl=function(id){const u=fotosUrls.get(id);if(u&&u.state==='ok')return u.url;fotosRequest(id,true);return null};

/* ---------- Teil 3: Anzeige ---------- */
/* Je Tagesspalte aufgerufen: ohne Fotos sofort leer, sonst eine Gruppierung je Reise und Medienliste (lange Reisen, Paket 1) */
const fotosDayMemo=new WeakMap();
function fotosDayStrip(t,i){
 if(!t||!Array.isArray(t.media)||!t.media.length)return '';
 let G=fotosDayMemo.get(t);if(!G||G.media!==t.media){G={media:t.media,by:fotosByDay(t)};fotosDayMemo.set(t,G)}
 const d=G.by.days[i];if(!d||d.i!==i||!d.photos.length)return '';
 const more=d.photos.length-FOTOS_DAY_MAX;
 return '<div class="foto-strip" data-foto-day="'+esc(d.key)+'" aria-label="Fotos '+esc(d.label)+'">'+d.photos.slice(0,FOTOS_DAY_MAX).map(m=>fotosThumb(t,m)).join('')+
  (more>0?'<button type="button" class="foto-more" data-foto-act="show-all" data-tid="'+esc(t.id)+'">+'+more+' weitere</button>':'')+'</div>';
}
function fotosGroups(t,G){
 const grid=(label,list,key)=>'<li data-foto-group="'+esc(key)+'"><b>'+esc(label)+'</b> <small class="muted">'+list.length+(list.length===1?' Foto':' Fotos')+'</small><div class="foto-grid">'+list.map(m=>fotosThumb(t,m)).join('')+'</div></li>';
 return '<ul class="plain foto-days">'+G.days.filter(d=>d.photos.length).map(d=>grid(d.label,d.photos,d.key)).join('')+
  G.outside.map(d=>grid(d.label,d.photos,d.key)).join('')+(G.basket.length?grid('Ohne Tag',G.basket,'ohne-tag'):'')+'</ul>';
}
/* Abschnitt im Tagesplan: Import, Prüfliste, Fotos je Tag */
function fotosSection(t){
 const F=fotosState(),mine=F.tid===t.id,blocked=fotosBlocked(t),G=fotosByDay(t);
 let h='<section class="block" data-fotos="'+esc(t.id)+'"><div class="between"><h2 id="fotos-h">Fotos</h2>'+(G.count?'<small class="muted">'+G.count+(G.count===1?' Foto':' Fotos')+'</small>':'')+'</div>'+
  '<p class="note" role="note" data-foto-nobackup><b>Hinweis:</b> '+esc(FOTOS_NO_BACKUP)+'</p>';
 if(blocked)h+='<p class="small muted" data-foto-blocked>'+esc(blocked)+'</p>';
 else if(!(mine&&F.review)){
  const busy=mine&&F.busy||F.busy;
  h+='<div class="row"><label class="btn foto-pick'+(busy?' disabled':'')+'"><input type="file" id="foto-input" accept="image/*" multiple'+(busy?' disabled':'')+' data-tid="'+esc(t.id)+'"> Fotos hinzufügen</label></div>'+
   '<p class="small muted">Ihr wählt einzelne Bilder aus; die App liest nur diese. Aus Aufnahmezeit und Aufnahmeort entsteht ein Vorschlag für Tag und Unternehmung, den ihr vor dem Speichern prüft. Der Aufnahmeort bleibt in dieser Reise gespeichert; Export und geteilte Reisebücher entfernen ihn.</p>';
 }
 if(mine&&F.busy)h+='<p class="small" role="status" data-foto-progress>Foto '+Math.min(F.done+1,F.total)+' von '+F.total+' wird vorbereitet …</p>';
 if(mine&&!F.busy&&F.msg)h+='<p class="small" role="status" data-foto-msg>'+esc(F.msg)+'</p>';
 if(mine&&F.errors&&F.errors.length)h+='<ul class="small plain" data-foto-errors>'+F.errors.map(e=>'<li>Nicht übernommen: '+esc(e.name)+' – '+esc(e.error)+'</li>').join('')+'</ul>';
 if(mine&&F.review)h+=fotosReview(t,F.review);
 if(G.count)h+=fotosGroups(t,G);
 else if(!(mine&&F.review))h+='<p class="small muted" data-foto-empty>Noch keine Fotos in dieser Reise.</p>';
 return h+'</section>';
}
/* Prüfliste „passt / ändern“; Korb „ohne Tag“ getrennt */
function fotosReview(t,R){
 const days=fotosDays(t),acts=fotosCtx(t).acts,dayName=i=>{const d=days[i];return d?d.label:''};
 const row=(r,n)=>{
  const s=r.suggestion||{},c=r.choice||{},chg=r.mode==='aendern'||s.basket,id='foto-r'+n;
  const thumb='<span class="foto-thumb" data-foto-thumb="'+esc(r.entry.id)+'" aria-hidden="true">'+fotosThumbInner(r.entry.id)+'</span>';
  const time=fotosTime(r.entry.takenAt),coords=fotosCoords(r.entry.lat,r.entry.lon);
  return '<li data-foto-row="'+n+'">'+thumb+'<div><b>'+esc(r.name||'Foto '+(n+1))+'</b><p class="small">'+(time?'Aufgenommen '+esc(time):'Keine Aufnahmezeit')+(coords?' · Ort '+esc(coords):' · kein Aufnahmeort')+'</p>'+
   '<p class="small">Vorschlag: <b>'+esc(fotosSuggestText(t,s))+'</b></p>'+
   (s.basket?'':'<div class="row" role="group" aria-label="Zuordnung für '+esc(r.name||'Foto '+(n+1))+'"><button type="button" class="btn ghost sm" data-foto-act="passt" data-i="'+n+'" aria-pressed="'+(!chg)+'">Passt</button><button type="button" class="btn ghost sm" data-foto-act="aendern" data-i="'+n+'" aria-pressed="'+chg+'">Ändern</button></div>')+
   (chg?'<div class="row"><label class="field"><span>Reisetag</span><select id="'+id+'-day" data-foto-sel="day" data-i="'+n+'"><option value="">Ohne Tag</option>'+days.map(d=>{const k=fotosDayKey(d),sel=(c.day!==undefined?c.day:s.day)===k;return '<option value="'+esc(k)+'"'+(sel?' selected':'')+'>'+esc(d.label)+'</option>'}).join('')+'</select></label>'+
    '<label class="field"><span>Unternehmung</span><select id="'+id+'-act" data-foto-sel="act" data-i="'+n+'"><option value="">Keine</option>'+acts.map(a=>{const sel=(c.actId!==undefined?c.actId:s.actId)===a.id;return '<option value="'+esc(a.id)+'"'+(sel?' selected':'')+'>'+esc(a.title)+(a.days.length?' · '+esc(a.days.map(dayName).filter(Boolean).join(', ')):'')+'</option>'}).join('')+'</select></label></div>':'')+
   (r.notes&&r.notes.length?'<p class="small muted">'+r.notes.map(esc).join(' ')+'</p>':'')+'</div></li>';
 };
 const rows=R.rows.map((r,n)=>({r,n})),main=rows.filter(x=>!(x.r.suggestion||{}).basket),basket=rows.filter(x=>(x.r.suggestion||{}).basket);
 return '<div class="panel foto-review" data-foto-review><h3 id="foto-review-h" tabindex="-1">Zuordnung prüfen · '+R.rows.length+(R.rows.length===1?' Foto':' Fotos')+'</h3>'+
  '<p class="small muted">Noch nichts ist in der Reise gespeichert. Prüft die Vorschläge; „Ändern“ öffnet die Auswahl. Erst „Übernehmen und speichern“ legt die Fotos in der Reise ab.</p>'+
  (main.length?'<ul class="plain foto-rows">'+main.map(x=>row(x.r,x.n)).join('')+'</ul>':'')+
  (basket.length?'<h4>Ohne Tag · '+basket.length+'</h4><p class="small muted">Für diese Fotos gibt es keinen passenden Reisetag. Ihr könnt einen wählen oder sie ohne Tag speichern.</p><ul class="plain foto-rows" data-foto-basket>'+basket.map(x=>row(x.r,x.n)).join('')+'</ul>':'')+
  (R.error?'<p class="note" role="alert" data-foto-commit-error>'+esc(R.error)+'</p>':'')+
  (R.confirm?'<div role="alert" data-foto-confirm>'+R.confirm+'</div><div class="row"><button type="button" class="btn" data-foto-act="commit-confirm"'+(R.saving?' disabled':'')+'>Umstellen und speichern</button><button type="button" class="btn ghost" data-foto-act="cancel"'+(R.saving?' disabled':'')+'>Abbrechen</button></div></div>':
  '<div class="row"><button type="button" class="btn" data-foto-act="commit"'+(R.saving?' disabled':'')+'>Übernehmen und speichern</button><button type="button" class="btn ghost" data-foto-act="cancel"'+(R.saving?' disabled':'')+'>Abbrechen</button></div></div>');
}
/* Erinnerungen: Fotos aller Reisen, je Tag, nur lesend */
function fotosMemories(trips){
 const list=(trips||Store.list()).map(t=>({t,G:fotosByDay(t)})).filter(x=>x.G.count);
 if(!list.length)return '';
 return '<section class="block" data-foto-memories><span class="eyebrow">Fotos</span><h2>Fotos eurer Reisen</h2><p class="note" role="note"><b>Hinweis:</b> '+esc(FOTOS_NO_BACKUP)+'</p>'+
  list.sort((a,b)=>(typeof memoryOrder==='function'?memoryOrder(b.t).localeCompare(memoryOrder(a.t)):0)).map(x=>'<div data-foto-trip="'+esc(x.t.id)+'"><h3>'+esc(x.t.title||'Ohne Titel')+' <small class="muted">'+esc(rangeText(x.t))+'</small></h3>'+fotosGroups(x.t,x.G)+'</div>').join('')+'</section>';
}
/* Fotoblatt: Arbeitskopie, Zeit, Tag, Ort mit Kartenlink, Löschen mit Bestätigung */
function fotosSheetHtml(t,m){
 const p=fotosPlace(t,m),time=fotosTime(m.takenAt),F=fotosState(),del=F.del&&F.del.id===m.id?F.del:null,canDel=typeof mediaRemove==='function'&&!fotosBlocked(t);
 const uses=fotosV4()&&typeof fotosV4().mediaUses==='function'?fotosV4().mediaUses(t,m.id):[];
 return '<div data-foto-sheet="'+esc(m.id)+'"><span class="eyebrow">Foto · '+esc(fotosDayLabel(t,m.day))+'</span><h2>'+esc(time||'Ohne Aufnahmezeit')+'</h2>'+
  '<figure class="foto-full"><span data-foto-full>'+'<span class="foto-ph">Foto lädt …</span>'+'</span>'+(m.caption?'<figcaption>'+esc(m.caption)+'</figcaption>':'')+'</figure>'+
  '<p class="small"><b>Ort:</b> '+(p.name?esc(p.name)+(p.coords?' · ':''):'')+(p.coords?esc(p.coords)+' '+lk(p.mapUrl,'Auf der Karte zeigen (OpenStreetMap)'):p.name?'':'Kein Aufnahmeort gespeichert.')+'</p>'+
  (p.coords?'<p class="small muted">Der Aufnahmeort bleibt nur in dieser Reise. Export und geteilte Reisebücher entfernen ihn.</p>':'')+
  '<p class="small muted">'+esc(FOTOS_NO_BACKUP)+'</p>'+
  (canDel?(del?'<div class="panel" role="group" aria-label="Löschen bestätigen"><p class="small"><b>Foto löschen?</b> Es verschwindet aus der Reise und aus dem Fotospeicher dieses Geräts. Das Original in eurer Foto-Mediathek bleibt.'+(uses.length?' Es steht in '+uses.length+(uses.length===1?' Bildplatz':' Bildplätzen')+' eines Reisebuchs; diese Plätze werden leer.':'')+'</p>'+
   (del.error?'<p class="note" role="alert">'+esc(del.error)+'</p>':'')+
   '<div class="row"><button type="button" class="btn warn" data-foto-act="del-yes" data-tid="'+esc(t.id)+'" data-id="'+esc(m.id)+'">Endgültig löschen</button><button type="button" class="btn ghost" data-foto-act="del-no" data-tid="'+esc(t.id)+'" data-id="'+esc(m.id)+'">Behalten</button></div></div>'
   :'<div class="row"><button type="button" class="btn ghost" data-foto-act="del" data-tid="'+esc(t.id)+'" data-id="'+esc(m.id)+'">Foto löschen …</button></div>'):'')+'</div>';
}

/* ---------- Teil 4: Abläufe ---------- */
async function fotosPersist(){
 if(FOTOS.persistAsked)return;FOTOS.persistAsked=true;
 const nav=typeof navigator!=='undefined'?navigator:null;
 try{if(nav&&nav.storage&&typeof nav.storage.persist==='function')await nav.storage.persist()}catch(e){}
}
/* Dateien nacheinander vorbereiten und ablegen; danach Prüfliste. Schreibt nichts in die Reise. */
async function fotosImport(t,files,onStep){
 const P=FP(),F=fotosState(),blocked=fotosBlocked(t);
 if(blocked){Object.assign(F,{tid:t.id,msg:blocked,errors:[],review:null});return F}
 if(F.busy)return F;
 const list=Array.from(files||[]);
 Object.assign(F,{tid:t.id,busy:true,done:0,total:list.length,msg:'',errors:[],dups:0,review:null,del:null});
 await fotosPersist();
 const ctx=fotosCtx(t),known=(Array.isArray(t.media)?t.media:[]).slice(),rows=[];
 let store=null;
 try{store=fotosStore()}catch(e){Object.assign(F,{busy:false,msg:'Fotospeicher nicht verfügbar: '+e.message});return F}
 for(let n=0;n<list.length;n++){
  F.done=n;if(onStep)try{onStep(F)}catch(e){}
  const f=list[n],name=f&&f.name?String(f.name):'Foto '+(n+1);
  try{
   const r=await P.prepare(f,{existing:known.concat(rows.map(x=>x.entry)),ctx,keepLocation:true,keepOriginal:false},fotosCodec());
   if(r.duplicate){F.dups++;continue}
   await store.put(r.entry.id,r.files);
   const u=fotosBlobUrl(r.files.thumb.bytes,r.files.thumb.type);if(u)fotosUrls.set(r.entry.id,{state:'ok',url:u});
   rows.push({entry:r.entry,suggestion:r.suggestion,notes:r.notes||[],name,mode:r.suggestion&&!r.suggestion.basket?'passt':'aendern',choice:{}});
  }catch(e){F.errors.push({name,error:e&&e.message?e.message:'unbekannter Fehler'})}
 }
 F.busy=false;F.done=list.length;
 F.review=rows.length?{rows,error:'',saving:false}:null;
 F.msg=(rows.length?'':'Keine neuen Fotos.')+(F.dups?' '+F.dups+(F.dups===1?' Foto war':' Fotos waren')+' schon in der Reise und wurde'+(F.dups===1?'':'n')+' übersprungen.':'');
 F.msg=F.msg.trim();
 return F;
}
/* Bestätigte Prüfliste speichern. Scheitert das, bleibt die Liste offen (nochmal oder Abbrechen). */
async function fotosCommit(t,opt){
 const P=FP(),F=fotosState(),R=F.review;
 if(!R||F.tid!==t.id)return {ok:false,error:'Keine Fotos zum Speichern.'};
 if(typeof mediaCommit!=='function'){R.error='Speichern ist in dieser App-Version nicht möglich.';return {ok:false,error:R.error}}
 let entries;
 try{entries=R.rows.map(r=>P.applyChoice(r.entry,fotosChoice(t,r),{confirmed:true}))}
 catch(e){R.error='Zuordnung ungültig: '+e.message;return {ok:false,error:R.error}}
 R.saving=true;R.error='';
 let res;
 try{res=await mediaCommit(Store.get(t.id)||t,entries,{confirmed:!!(opt&&opt.confirmed)})}catch(e){res={ok:false,error:e&&e.message?e.message:String(e)}}
 R.saving=false;
 /* Erstes Foto hebt die Reise auf Format 4 (Paket 7): Hinweis zeigen, erst nach ausdrücklicher Bestätigung speichern */
 if(res&&res.needsConfirm==='format4'){R.confirm=res.notice||'Die Reise wird auf Format 4 umgestellt.';return {ok:false,needsConfirm:'format4'}}
 R.confirm=null;
 if(!res||!res.ok){R.error='Nicht gespeichert: '+(res&&res.error||'unbekannter Fehler')+' Die Fotos bleiben in dieser Liste; ihr könnt es nochmal versuchen oder abbrechen.';return {ok:false,error:R.error}}
 F.review=null;F.msg=entries.length+(entries.length===1?' Foto gespeichert.':' Fotos gespeichert.')+(F.dups?' '+F.dups+' doppelte übersprungen.':'');
 return {ok:true,trip:res.trip,count:entries.length};
}
/* Abbrechen: abgelegte Dateien wieder entfernen, nichts in der Reise */
async function fotosCancel(t){
 const F=fotosState(),R=F.review;if(!R||F.tid!==t.id)return {ok:true,removed:0};
 const fails=[];
 for(const r of R.rows){try{await fotosStore().remove(r.entry.id)}catch(e){fails.push(r.entry.id)}fotosForget(r.entry.id)}
 F.review=null;F.errors=[];
 F.msg='Import abgebrochen, nichts gespeichert.'+(fails.length?' '+fails.length+' Datei'+(fails.length===1?'':'en')+' ließen sich nicht entfernen; sie stören nicht und werden nicht angezeigt.':'');
 return {ok:true,removed:R.rows.length-fails.length};
}
/* Löschen nach Bestätigung: erst der Eintrag (mediaRemove), dann die Datei */
async function fotosDelete(t,id){
 const F=fotosState();
 if(typeof mediaRemove!=='function')return {ok:false,error:'Löschen ist in dieser App-Version nicht möglich.'};
 let res;
 try{res=await mediaRemove(t,id,{confirm:true})}catch(e){res={ok:false,error:e&&e.message?e.message:String(e)}}
 if(!res||!res.ok){const error='Nicht gelöscht: '+(res&&res.error||'unbekannter Fehler');F.del={id,error};return {ok:false,error}}
 let fileOk=true;try{await fotosStore().remove(id)}catch(e){fileOk=false}
 fotosForget(id);F.del=null;F.tid=t.id;
 F.msg='Foto gelöscht.'+(fileOk?'':' Die Datei auf diesem Gerät ließ sich nicht entfernen; sie wird nicht mehr angezeigt.');
 return {ok:true,fileOk,trip:res.trip};
}
async function fotosOpen(t,id){
 const m=(t.media||[]).find(x=>x&&x.id===id);if(!m)return false;
 openSheet(fotosSheetHtml(t,m));
 if(fotosFull){fotosRevoke(fotosFull);fotosFull=null}
 let html;
 try{const rec=await fotosStore().get(id,'work');
  if(!rec)html='<span class="foto-ph">Foto auf diesem Gerät nicht vorhanden. Der Eintrag bleibt in der Reise.</span>';
  else if(rec.damaged)html='<span class="foto-ph">Die Datei auf diesem Gerät ist beschädigt.</span>';
  else{fotosFull=fotosBlobUrl(rec.bytes,rec.type);html='<img src="'+esc(fotosFull)+'" alt="'+esc(fotosAlt(t,m))+'" width="'+m.w+'" height="'+m.h+'">'}
 }catch(e){html='<span class="foto-ph">Foto nicht lesbar: '+esc(e.message)+'</span>'}
 const box=typeof document!=='undefined'&&document.querySelector('[data-foto-sheet="'+id+'"] [data-foto-full]');if(box)box.innerHTML=html;
 return true;
}

/* ---------- Teil 5: Bedienung ---------- */
function fotosTrip(el){const id=el&&el.getAttribute('data-tid');return id?Store.get(id):(typeof cur==='function'?cur():null)}
function fotosRerender(focus){if(typeof render==='function')render();if(focus&&typeof navFocus==='function')navFocus(focus)}
if(typeof document!=='undefined')document.addEventListener('change',e=>{
 const el=e.target;if(!el||!el.getAttribute)return;
 if(el.id==='foto-input'){
  const t=fotosTrip(el),files=el.files?Array.from(el.files):[];el.value='';if(!t||!files.length)return;
  const step=F=>{const p=document.querySelector('[data-foto-progress]');if(p)p.textContent='Foto '+(F.done+1)+' von '+F.total+' wird vorbereitet …'};
  const go=fotosImport(t,files,step);fotosRerender('[data-foto-progress]');
  go.then(F=>fotosRerender(F.review?'#foto-review-h':'[data-foto-msg]|#foto-input'));
  return;
 }
 const sel=el.getAttribute('data-foto-sel');
 if(sel){const R=UI.fotos&&UI.fotos.review,r=R&&R.rows[Number(el.getAttribute('data-i'))];if(r){r.choice=r.choice||{};r.choice[sel==='day'?'day':'actId']=el.value;r.mode='aendern'}}
});
if(typeof document!=='undefined')document.addEventListener('click',e=>{
 const el=e.target&&e.target.closest?e.target.closest('[data-foto-act]'):null;if(!el)return;
 const act=el.getAttribute('data-foto-act'),t=fotosTrip(el),F=fotosState(),n=Number(el.getAttribute('data-i')),id=el.getAttribute('data-id');
 if(!t)return;
 if(act==='open'){F.del=null;fotosOpen(t,id);return}
 if(act==='show-all'){UI.tab='plan';fotosRerender('#fotos-h');return}
 if(act==='passt'||act==='aendern'){const r=F.review&&F.review.rows[n];if(r){r.mode=act;if(act==='aendern'){const s=r.suggestion||{};r.choice={day:s.day||'',actId:s.actId||''}}}fotosRerender('[data-foto-act="'+act+'"][data-i="'+n+'"]');return}
 if(act==='commit'||act==='commit-confirm'){const p=fotosCommit(t,{confirmed:act==='commit-confirm'});fotosRerender();p.then(r=>fotosRerender(r.ok?'[data-foto-msg]':r.needsConfirm?'[data-foto-act="commit-confirm"]':'[data-foto-commit-error]'));return}
 if(act==='cancel'){fotosCancel(t).then(()=>fotosRerender('[data-foto-msg]|#foto-input'));return}
 const m=(t.media||[]).find(x=>x&&x.id===id);
 if(act==='del'&&m){F.del={id,error:''};openSheet(fotosSheetHtml(t,m));fotosOpen(t,id).then(()=>navFocus('[data-foto-act="del-no"]'));return}
 if(act==='del-no'&&m){F.del=null;fotosOpen(t,id).then(()=>navFocus('[data-foto-act="del"]'));return}
 if(act==='del-yes'&&m){fotosDelete(t,id).then(r=>{if(r.ok){if(typeof closeSheet==='function')closeSheet();fotosRerender('#fotos-h')}else{openSheet(fotosSheetHtml(t,m));fotosOpen(t,id)}});return}
});
