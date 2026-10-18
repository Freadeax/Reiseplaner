/* Reiseplaner · Entdecken: Umkreis-Katalog.
   Teil 14 von 17 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Entdecken: Umkreis-Katalog (Issue #7) =================
   Ziele und Attraktionen nach Abfahrtsort und Kilometerbereich. Quelle: Datenbank (public.catalog_search),
   ohne Verbindung die gleiche Rechnung auf der Offline-Kopie catalog-data.js. Keine Preise, keine Öffnungszeiten.
   Abfahrtsort und Filter bleiben nur in diesem Browser (rp-entdecken), nicht in den Reisedaten. */
const CATX=window.RPCatalog||null;
const CAT_PREF_KEY='rp-entdecken';
const CAT_PROFILE_KEY='rp-entdecken-profile';
const CAT_MOODS={
 natur:['♧','Draußen durchatmen','Waldwege, Wasserfälle und weite Landschaften'],wasser:['≈','Ans Wasser','Seen, Uferwege und Zeit am Wasser'],
 berge:['△','Hoch hinaus','Gipfel, Bergbahnen und große Aussichten'],stadt:['▦','Stadt entdecken','Altstadtgassen, Plätze und neue Viertel'],
 kultur:['◈','Kultur erleben','Museen, Geschichte und besondere Bauwerke'],burg:['♜','Burgen & Schlösser','Alte Mauern und Geschichten zum Staunen'],
 therme:['♨','Wärme & Ruhe','Thermen, Wellness und Zeit zum Abschalten'],familie:['☺','Spiel & Staunen','Erlebnisse, die auch Kindern Spaß machen'],
 genuss:['☕','Genussmomente','Regionale Spezialitäten und gemütliche Pausen'],technik:['⚙','Technik verstehen','Erfindungen, Fahrzeuge und Industriegeschichte'],
 winter:['❄','Winter erleben','Schnee, Winterwege und Berglandschaften'],unterwelt:['◇','Unter die Erde','Höhlen, Stollen und verborgene Welten'],
 baden:['≈','Eintauchen & abschalten','Badesee, Strand oder Freibad – zum Beispiel eine Pause am Wasser mit Badestelle'],
 tiere:['♧','Tieren begegnen','Zoo, Wildpark oder Aquarium – zum Beispiel Tiere beobachten und Neues über ihre Lebensräume lernen'],
 freizeit:['✧','Gemeinsam etwas erleben','Freizeitpark, Sommerrodelbahn oder Baumwipfelpfad – zum Beispiel ein Erlebnistag mit Abwechslung'],
 aktiv:['↗','Selbst in Bewegung kommen','Rad, Kanu oder Kletterwald – zum Beispiel eine Tour statt nur eines Aussichtspunkts']
};
/* Neue Karten erst anbieten, wenn der zugehörige Katalog die Art wirklich kennt. */
function catMoodKeys(){return Object.keys(CAT_MOODS).filter(k=>CATX&&Object.hasOwn(CATX.KINDS,k))}
const CAT_PRESETS={
 paar:{name:'Auszeit zu zweit',hint:'Ruhig · 2 Nächte',profile:{kinds:{therme:'like',natur:'like',genuss:'like'},pace:'ruhig',party:'paar',nights:2}},
 familie:{name:'Familientag',hint:'Spiel & Natur · ohne Übernachtung',profile:{kinds:{familie:'must',natur:'like'},party:'familie',nights:0}},
 aktiv:{name:'Aktivtag',hint:'Berge & draußen',profile:{kinds:{berge:'like',natur:'like'},pace:'aktiv',nights:0}},
 regen:{name:'Auch bei Regen',hint:'Drinnen etwas erleben',profile:{kinds:{kultur:'like',therme:'like',unterwelt:'like'},weatherSafe:true}},
 kultur:{name:'Kultur-Kurztrip',hint:'Stadt & Geschichte · 2 Nächte',profile:{kinds:{kultur:'must',stadt:'like',burg:'like'},nights:2}}
};
/* Eigenes, versioniertes Browserprofil. Alte Themen werden einmalig als „gern“ übernommen;
   Reisedaten, Sicherungsformat und Konto bleiben unverändert. Neuere Profile nie überschreiben. */
function catReadProfile(legacy){
 let raw=null;try{raw=JSON.parse(localStorage.getItem(CAT_PROFILE_KEY)||'null')}catch(e){}
 if(raw&&Number.isInteger(raw.version)&&raw.version>1)return {profile:CATX.checkProfile({}),locked:true};
 if(raw&&raw.version===1&&raw.profile&&typeof raw.profile==='object')return {profile:CATX.checkProfile(raw.profile),locked:false};
 const kinds={};(legacy.kinds||[]).forEach(k=>{if(Object.hasOwn(CATX.KINDS,k))kinds[k]='like'});
 return {profile:CATX.checkProfile({kinds,month:legacy.month,nights:legacy.nights,party:legacy.family?'familie':null,weatherSafe:legacy.rainy}),locked:false};
}
function catSyncProfile(s){s.kinds=Object.keys(s.profile.kinds).filter(k=>s.profile.kinds[k]!=='avoid');s.month=s.profile.month==null?'':String(s.profile.month);s.nights=s.profile.nights==null?'':String(s.profile.nights);s.family=s.profile.party==='familie';s.rainy=s.profile.weatherSafe}
function catProfile(){const s=catState();return CATX.checkProfile(s.profile)}
function catRank(r){return CATX.rankProfile(r,catProfile()).map(x=>Object.assign(x,{version:r.version,source:r.source}))}
function catProfileChange(patch){const s=catState();s.profileUndo=null;s.profile=CATX.checkProfile(Object.assign({},s.profile,patch));catSyncProfile(s);if(s.res)s.res.ranked=catRank(s.res);Object.keys(s.extra).forEach(id=>{const x=s.extra[id];s.extra[id]=catRank({places:[x.place],version:x.version,source:x.source})[0]});catSavePrefs()}
function catSetMood(kind,level){if(!catMoodKeys().includes(kind))return;const kinds=Object.assign({},catProfile().kinds);if(['must','like','avoid'].includes(level))kinds[kind]=level;else delete kinds[kind];catProfileChange({kinds})}
function catReplaceProfile(profile,label){const s=catState(),before=catProfile(),after=CATX.checkProfile(profile);if(JSON.stringify(before)===JSON.stringify(after))return;const deckIndex=s.deckIndex||0;catProfileChange(after);s.deckIndex=0;s.profileUndo={before,after:JSON.stringify(catProfile()),label,deckIndex}}
function catPreset(id){const p=Object.hasOwn(CAT_PRESETS,id)?CAT_PRESETS[id]:null;if(p)catReplaceProfile(p.profile,'Schnellprofil „'+p.name+'“ übernommen')}
function catClearProfile(){catReplaceProfile({},'Wünsche zurückgesetzt')}
function catUndoProfile(){const s=catState(),u=s.profileUndo;if(!u||u.after!==JSON.stringify(catProfile())){s.profileUndo=null;return false}catProfileChange(u.before);s.deckIndex=u.deckIndex;return true}
function catWishItems(profile){const p=CATX.checkProfile(profile),out=[];
 Object.entries(p.kinds).forEach(([k,v])=>out.push({key:'kind:'+k,label:CATX.KINDS[k]+' · '+({must:'unbedingt',like:'gern',avoid:'lieber nicht'}[v])}));
 const add=(key,label)=>out.push({key:'field:'+key,label});
 if(p.month!=null)add('month',MONTHS[p.month-1]||'Monat '+p.month);if(p.nights!=null)add('nights',p.nights===0?'Tagesausflug':p.nights+' '+(p.nights===1?'Nacht':'Nächte'));
 if(p.pace)add('pace','Tempo: '+({ruhig:'ruhig',gemischt:'gemischt',aktiv:'aktiv'}[p.pace]));
 if(p.party)add('party',({paar:'Zu zweit',familie:'Mit Kindern',freunde:'Mit Freunden',allein:'Allein'}[p.party]));
 if(p.travel)add('travel','Anreise: '+({auto:'Auto',bahn:'Bahn · Verbindung ungeprüft',flug:'Flug · Verbindung ungeprüft'}[p.travel]));
 if(p.maxMin!=null)add('maxMin','Max. '+p.maxMin+' Min. · '+(!p.travel||p.travel==='auto'?'Auto-Schätzung':'ungeprüft'));
 if(p.budgetPp!=null)add('budgetPp','Budget '+p.budgetPp.toLocaleString('de-DE')+' € pro Person · ungeprüft');if(p.weatherSafe)add('weatherSafe','Regenalternativen gewünscht');return out;
}
function catDropWish(key){const [type,field]=String(key||'').split(':');if(type==='kind'){catSetMood(field,'');return}const p=catProfile();if(type==='field'&&field!=='kinds'&&Object.hasOwn(p,field))catProfileChange({[field]:field==='weatherSafe'?false:null})}
function catProfileSummary(editable=true){const s=catState(),items=catWishItems(s.profile);
 return '<section class="profile-summary" aria-label="Eure Wünsche im Überblick"><h3'+(editable?' tabindex="-1"':'')+'>Eure Wünsche im Überblick</h3>'+(items.length?'<div class="profile-tags">'+items.map(x=>editable?'<button type="button" class="profile-tag" data-act="cat-wish-remove" data-val="'+esc(x.key)+'" aria-label="'+esc(x.label)+' entfernen">'+esc(x.label)+' <span aria-hidden="true">×</span></button>':'<span class="profile-tag">'+esc(x.label)+'</span>').join('')+'</div>':'<p class="small muted">Noch alles offen. Wählt ein Profil oder stellt eure Wünsche selbst zusammen.</p>')+
 (editable&&items.length?'<p class="small muted">Einen Wunsch antippen, um nur diesen zu entfernen.</p>':'')+(editable&&s.profileUndo?'<div class="profile-undo" role="status"><span>'+esc(s.profileUndo.label)+'.</span><button type="button" class="lnk" data-act="cat-profile-undo">Rückgängig</button></div>':'')+'</section>';
}
function catRenderProfile(){render();const target=$('.mood-panel .profile-summary h3');if(target&&target.focus)target.focus()}
function catResultView(s=catState()){const all=s.res?s.res.ranked:[],matching=all.filter(x=>CATX.textMatch(x.place,s.q)),hidden=s.mustOnly?matching.filter(x=>!x.mustOk).length:0;return {all,matching,hidden,shown:CATX.sortRanked(matching.filter(x=>!s.mustOnly||x.mustOk),s.sort)}}
/* Vergleich und Rundreise bleiben beim Bereichswechsel erhalten. Nur Koordinaten-basierte
   Auto-Schätzungen werden für den neuen Abfahrtsort neu berechnet. */
function catInvalidateSearch(){const s=catState(),extra={};[...new Set(s.cmp.concat(s.tour.map(p=>p.id)))].forEach(id=>{const x=catFind(id);if(!x)return;const p=Object.assign({},x.place,{airKm:s.origin?Math.round(CATX.airKm(s.origin,x.place)*10)/10:null});extra[id]=catRank({places:[p],version:x.version,source:x.source})[0]});const pending=s.busy;s.searchJob=(s.searchJob||0)+1;s.busy=false;s.res=null;s.err='';s.extra=extra;s.searchNote=pending?'Suchbereich geändert. Startet die Suche erneut; die vorherige Antwort wird verworfen.':''}
function catSearchScope(s){return JSON.stringify([s.origin&&s.origin.label,s.origin&&s.origin.lat,s.origin&&s.origin.lon,s.minKm,s.maxKm])}
function catDefaults(){return {origin:null,range:'tag',minKm:0,maxKm:150,kinds:[],month:'',nights:'',family:false,rainy:false}}
function catState(){
  if(!UI.cat){let p={};try{p=JSON.parse(localStorage.getItem(CAT_PREF_KEY)||'{}')||{}}catch(e){p={}}
    const d=catDefaults(),o=p.origin;
    UI.cat=Object.assign(d,{origin:o&&CATX&&CATX.validPoint(o)&&typeof o.label==='string'?{label:o.label.slice(0,80),lat:+o.lat,lon:+o.lon}:null,
      range:typeof p.range==='string'?p.range:d.range,minKm:Number.isFinite(+p.minKm)?+p.minKm:d.minKm,maxKm:Number.isFinite(+p.maxKm)&&+p.maxKm>0?+p.maxKm:d.maxKm,
      kinds:Array.isArray(p.kinds)?p.kinds.filter(k=>CATX&&CATX.KINDS[k]):[],month:/^([1-9]|1[0-2])?$/.test(String(p.month||''))?String(p.month||''):'',
      nights:/^\d{0,2}$/.test(String(p.nights??''))?String(p.nights??''):'',family:!!p.family,rainy:!!p.rainy},
      {res:null,busy:false,err:'',geoHits:null,geoBusy:false,index:{},q:'',sort:'passend',extra:{},tour:[],cmp:[]});}
  if(CATX&&!UI.cat.profile){const p=catReadProfile(UI.cat);UI.cat.profile=p.profile;UI.cat.profileLocked=p.locked;catSyncProfile(UI.cat)}
  return UI.cat;
}
function catSavePrefs(){const s=catState();try{localStorage.setItem(CAT_PREF_KEY,JSON.stringify({origin:s.origin,range:s.range,minKm:s.minKm,maxKm:s.maxKm,kinds:s.kinds,month:s.month,nights:s.nights,family:s.family,rainy:s.rainy}));if(!s.profileLocked)localStorage.setItem(CAT_PROFILE_KEY,JSON.stringify({version:1,profile:catProfile()}))}catch(e){}}
let catLocalData=null;
function catLoadLocal(){
  if(window.RP_CATALOG)return Promise.resolve(window.RP_CATALOG);
  if(catLocalData)return catLocalData;
  catLocalData=new Promise((res,rej)=>{const s=document.createElement('script');s.src='catalog-data.js';s.async=true;s.onload=()=>window.RP_CATALOG?res(window.RP_CATALOG):rej(new Error('Katalog leer'));s.onerror=()=>{catLocalData=null;rej(new Error('Offline-Katalog nicht geladen'))};document.head.appendChild(s)});
  return catLocalData;
}
/* Kachel-Katalog (Claude, #8): offline nur Index + die Kacheln, die der Suchkreis berührt. Fallback: Gesamtdatei. */
const catScriptCache={};
function catScript(src,ok){if(ok())return Promise.resolve();if(catScriptCache[src])return catScriptCache[src];
  return catScriptCache[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=()=>ok()?res():rej(new Error('Katalogteil leer: '+src));s.onerror=()=>{delete catScriptCache[src];rej(new Error('Katalogteil nicht geladen: '+src))};document.head.appendChild(s)})}
function catLoadIndex(){return catScript('catalog/index.js',()=>!!window.RP_CATALOG_INDEX).then(()=>window.RP_CATALOG_INDEX)}
async function catTile(k){await catScript('catalog/t-'+k+'.js',()=>!!(window.RP_CATALOG_TILES&&window.RP_CATALOG_TILES[k]));return window.RP_CATALOG_TILES[k]}
/* Ein Ziel bzw. das Ziel einer Attraktion über Index + eine Kachel (statt Gesamtdatei); Fallback Gesamtdatei */
async function catPlaceRaw(id){
  try{const idx=await catLoadIndex(),e=idx.places.find(p=>p.id===id);if(!e)return {version:idx.version,raw:null};const tl=await catTile(e.tile);return {version:idx.version,raw:tl.places.find(p=>p.id===id)||null}}
  catch(e){const d=await catLoadLocal();return {version:d.version,raw:d.places.find(p=>p.id===id)||null}}
}
async function catSpotPlace(spotId){
  const idx=await catLoadIndex(),e=idx.places.filter(p=>String(spotId).startsWith(p.id+'-')).sort((a,b)=>b.id.length-a.id.length)[0];
  return e?(await catPlaceRaw(e.id)).raw:null;
}
async function catLoadForQuery(q){
  const idx=await catLoadIndex(),keys=CATX.tilesFor(idx,q);
  await Promise.all(keys.map(k=>catScript('catalog/t-'+k+'.js',()=>!!(window.RP_CATALOG_TILES&&window.RP_CATALOG_TILES[k]))));
  const places=[];keys.forEach(k=>{const tl=window.RP_CATALOG_TILES[k];if(tl.version!==idx.version)throw new Error('Katalogkachel veraltet');places.push(...tl.places)});
  return {version:idx.version,checked:idx.checked,places,tiles:keys};
}
function catTimeout(p,ms){return Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error('Zeitüberschreitung')),ms))])}
/* Datenbank zuerst; bei Fehler, fehlender Tabelle oder leerem Katalog die Offline-Kopie mit derselben Regel. */
async function catalogQuery(q){
  q={lat:+q.lat,lon:+q.lon,maxKm:Math.round(+q.maxKm),minKm:Math.round(+q.minKm||0),kinds:q.kinds||[]};
  CATX.checkQuery(q);
  const c=window.RPCloud;let dbErr='';
  if(c&&c.enabled()&&c.catalogSearch&&!(typeof navigator!=='undefined'&&navigator.onLine===false)){
    try{const r=await catTimeout(catDbAll(c,q),8000);if(r&&r.version>0)return {source:'db',version:r.version,total:r.total,places:(r.places||[]).map(CATX.normPlace)};dbErr='Datenbank-Katalog noch leer'}
    catch(e){dbErr=e.message||'Datenbank nicht erreichbar'}
  }
  let data;try{data=await catLoadForQuery(q)}catch(e){data=await catLoadLocal()}
  const r=CATX.searchLocal(data,q,{limit:CAT_RANK_MAX});
  return {source:'lokal',version:r.version,total:r.total,places:r.places,dbErr};
}
/* Die Wunsch-Bewertung braucht alle Treffer, nicht nur die 80 nächsten (sonst fehlen bei „Richtig weg“
   ferne Ziele). Datenbank in 200er-Seiten bis zur Gesamtzahl, höchstens CAT_RANK_MAX; alte catalog_search
   ohne Gesamtzahl liefert nur eine Seite. */
const CAT_RANK_MAX=1000;
async function catDbAll(c,q){
  let places=[],version=0,total=null;
  for(let off=0;off<CAT_RANK_MAX;off+=200){
    const r=await c.catalogSearch(q,{limit:200,offset:off});if(!r||!(r.version>0))return r;
    version=r.version;const ps=Array.isArray(r.places)?r.places:[];places=places.concat(ps);
    total=r.total==null||!Number.isFinite(+r.total)?null:+r.total;
    if(total==null||places.length>=total||ps.length<200)break;
  }
  return {version,total:total==null?places.length:total,places};
}
function catNextMonth(m){const now=new Date(),y=now.getFullYear()+(+m<now.getMonth()+1?1:0);return y+'-'+String(m).padStart(2,'0')}
function catMoodCard(k,deck){const m=CAT_MOODS[k],v=catProfile().kinds[k]||'';
 return '<div class="mood-card" data-level="'+v+'"><span class="mood-symbol" aria-hidden="true">'+m[0]+'</span><h3>'+m[1]+'</h3><p class="small muted">'+m[2]+'</p>'+
 (deck?'':'<label class="fld"><span>'+esc(CATX.KINDS[k])+' – euer Wunsch</span><select data-profile-kind="'+k+'">'+[['','Offen / egal'],['must','Unbedingt'],['like','Gern'],['avoid','Lieber nicht']].map(o=>'<option value="'+o[0]+'"'+(v===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label>')+'</div>'}
function catMoodPanel(){const s=catState(),keys=catMoodKeys(),i=Math.min(keys.length,Math.max(0,s.deckIndex||0));
 const deck=i===keys.length?'<div class="empty"><b>Eure Auswahl ist bereit.</b><span>Alle Wünsche lassen sich in der Kartenübersicht ändern – auch zu „unbedingt“.</span><button type="button" class="btn ghost sm" data-act="cat-deck-back">Letzte Karte bearbeiten</button></div>':
 '<div class="mood-deck"><p class="small muted" role="status">Karte '+(i+1)+' von '+keys.length+' · '+esc(CATX.KINDS[keys[i]])+'</p>'+catMoodCard(keys[i],true)+'<div class="mood-votes">'+[['avoid','Nein'],['','Vielleicht'],['like','Ja']].map(o=>'<button type="button" class="btn ghost" data-act="cat-vote" data-val="'+keys[i]+'|'+o[0]+'" aria-pressed="'+((s.profile.kinds[keys[i]]||'')===o[0])+'">'+o[1]+'</button>').join('')+'</div><p class="small muted">Ja = gern · Nein = lieber nicht (Abwertung) · Vielleicht = offen</p>'+(i?'<button type="button" class="lnk" data-act="cat-deck-back">← Vorherige Karte</button>':'')+'</div>';
 return '<div class="panel mood-panel"><span class="eyebrow">Euer Reisegefühl</span><h2>3 · Worauf habt ihr Lust?</h2><p>Wählt frei oder startet mit einem Profil. „Unbedingt“ muss belegt sein. „Lieber nicht“ wertet passende Ziele ab, blendet sie aber nicht aus.</p>'+
 '<div class="mood-presets">'+Object.entries(CAT_PRESETS).map(([id,p])=>'<button type="button" class="mood-preset" data-act="cat-preset" data-val="'+id+'"><b>'+p.name+'</b><small>'+p.hint+'</small></button>').join('')+'</div><p class="small muted">Ein Schnellprofil ersetzt die bisherigen Wünsche und Rahmenangaben. Abfahrtsort und Entfernung bleiben erhalten.</p>'+
 catProfileSummary()+'<div class="between"><div class="row" role="group" aria-label="Wünsche auswählen">'+chipb('cat-mood-mode','cards','Alle Karten',!s.deckMode)+chipb('cat-mood-mode','deck','Ja / Nein / Vielleicht',!!s.deckMode)+'</div><button type="button" class="lnk" data-act="cat-profile-clear">Wünsche zurücksetzen</button></div>'+
 (s.deckMode?deck:'<div class="mood-grid">'+keys.map(k=>catMoodCard(k,false)).join('')+'</div>')+
 '<details class="mood-frame" open><summary><b>Rahmen für eure Reise</b></summary><div class="form">'+
 catProfileSelect('month','Reisemonat',[['','Offen'],...MONTHS.map((m,i)=>[String(i+1),m])])+
 catProfileSelect('nights','Dauer',[['','Offen'],['0','Tagesausflug'],['1','1 Nacht'],['2','2 Nächte'],['3','3 Nächte'],['5','5 Nächte'],['7','1 Woche'],['14','2 Wochen']])+
 catProfileSelect('pace','Tempo',[['','Offen'],['ruhig','Ruhig'],['gemischt','Gemischt'],['aktiv','Aktiv']])+
 catProfileSelect('party','Wer reist?',[['','Offen'],['paar','Zu zweit'],['familie','Mit Kindern'],['freunde','Mit Freunden'],['allein','Allein']])+
 catProfileSelect('travel','Anreise',[['','Offen'],['auto','Auto'],['bahn','Bahn'],['flug','Flug']])+
 '<label class="fld"><span>Maximale Anreise · Minuten</span><input type="number" min="5" max="2000" step="5" data-profile-field="maxMin" value="'+esc(s.profile.maxMin??'')+'" placeholder="Offen"></label><label class="fld"><span>Budget pro Person · €</span><input type="number" min="0" max="1000000" data-profile-field="budgetPp" value="'+esc(s.profile.budgetPp??'')+'" placeholder="Offen"></label></div>'+
 '<label class="mood-weather"><input type="checkbox" data-profile-field="weatherSafe"'+(s.profile.weatherSafe?' checked':'')+'> Auch bei Regen etwas erleben</label><p class="small muted">Fahrzeit: nur Auto-Schätzung. Bahn- und Flugverbindungen sowie Preise sind unbekannt; ein Budget wird gemerkt, aber nicht geprüft. Die Auswahl der Anreise verändert noch keine Reise.</p></details>'+
 (s.profileLocked?'<p class="note" role="status">Ein neueres Wunschprofil liegt vor. Eure Auswahl gilt für diese Sitzung; das gespeicherte Profil wird nicht überschrieben.</p>':'<p class="small muted">Eure Wünsche bleiben nur in diesem Browser.</p>')+'</div>';
}
function catProfileSelect(field,label,options){const v=String(catProfile()[field]??'');if(v&&!options.some(o=>o[0]===v))options=options.concat([[v,v+(field==='nights'?' Nächte':'')]]);return '<label class="fld"><span>'+label+'</span><select '+(['month','nights'].includes(field)?'data-cf':'data-profile-field')+'="'+field+'">'+options.map(o=>'<option value="'+o[0]+'"'+(v===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label>'}
function catReasons(x){if(!x.must)return '<div class="badges">'+x.why.map(w=>'<span class="badge">'+esc(w)+'</span>').join('')+'</div>';
 const missing=x.must.missing.map(k=>CATX.KINDS[k]||(k==='fahrzeit'?'maximale Anreise':k)).join(', '),unknown=x.must.unknown.map(k=>k==='budget'?'Budget':k==='fahrzeit'?'Anreisedauer':k).join(', ');
 return '<p class="small"><b>'+esc(x.summary)+'</b> · '+x.indoor+' Ideen drinnen</p>'+(missing?'<p class="small"><b>Unbedingt fehlt:</b> '+esc(missing)+'</p>':'')+(unknown?'<p class="small"><b>Nicht geprüft:</b> '+esc(unknown)+'</p>':'')+
 '<details class="cat-reasons"><summary>Warum dieses Ziel?</summary><ul>'+x.why.map(w=>'<li>'+({plus:'✓ ',minus:'− ',unknown:'? ',info:'• '}[w.type]||'')+esc(w.text)+'</li>').join('')+(x.why.length?'':'<li>Noch keine Wünsche gewählt.</li>')+'</ul></details>';
}
function catSourceLine(r){
  return '<p class="small muted">Quelle: '+(r.source==='db'?'Online-Katalog (Datenbank), Version '+r.version:'Offline-Kopie in der App, Version '+r.version+(r.dbErr?' · Datenbank: '+esc(r.dbErr):''))+
   '. Autofahrstrecke und Autofahrzeit sind Schätzungen (Luftlinie × '+String(CATX.ROAD_FACTOR).replace('.',',')+', Ø '+CATX.AVG_KMH+' km/h), keine Routenberechnung. Ideen ohne Preise und Öffnungszeiten: vor der Fahrt beim Anbieter prüfen.</p>';
}
function catCard(x,i){
  const p=x.place,fav=catFavs().some(f=>f.id===p.id),inTour=catState().tour.some(q=>q.id===p.id);
  return '<div class="card" id="cat-card-'+esc(p.id)+'"><div class="between"><span class="eyebrow">'+(i!=null?'<b class="num">'+(i+1)+'</b> · ':'')+esc(p.region)+(p.country&&p.country!=='DE'?' · '+esc(p.country):'')+'</span><button type="button" class="chipbtn" data-act="cat-fav" data-val="'+esc(p.id)+'" aria-pressed="'+fav+'" aria-label="'+(fav?'Von der Merkliste nehmen':'Auf die Merkliste')+'">'+(fav?'♥ gemerkt':'♡ merken')+'</button></div><h3>'+esc(p.name)+'</h3>'+
   '<p class="small"><b>Auto: ≈ '+x.roadKm+' km · ca. '+esc(CATX.durText(x.minutes))+'</b> <span class="muted">(geschätzt, Luftlinie '+String(p.airKm).replace('.',',')+' km)</span></p>'+
   catReasons(x)+'<div class="badges">'+(x.mustOk===false?'<span class="badge est">Nicht alle Muss-Wünsche belegt</span>':'')+'<span class="badge">'+x.spots.length+' Ideen</span></div>'+
   '<p class="small">'+esc(p.summary)+'</p>'+(p.angle?'<p class="small"><b>Ums Eck gedacht:</b> '+esc(p.angle)+'</p>':'')+
   '<div class="foot"><button type="button" class="btn sm" data-act="cat-open" data-val="'+esc(p.id)+'">Ansehen & planen</button>'+chipb('cat-tour',p.id,inTour?'✓ in Rundreise':'+ Rundreise',inTour)+chipb('cat-cmp',p.id,catState().cmp.includes(p.id)?'✓ im Vergleich':'Vergleichen',catState().cmp.includes(p.id))+lk(mp(p.name),'Karte')+'</div></div>';
}
/* Merkliste „Irgendwann mal“: nur in diesem Browser, keine Reisedaten */
const CAT_FAV_KEY='rp-merkliste';
function catFavs(){try{const l=JSON.parse(localStorage.getItem(CAT_FAV_KEY)||'[]');return Array.isArray(l)?l.filter(f=>f&&typeof f.id==='string'&&CATX&&CATX.validPoint(f)).slice(0,100):[]}catch(e){return []}}
function catFavToggle(p){let l=catFavs();if(l.some(f=>f.id===p.id))l=l.filter(f=>f.id!==p.id);else l.unshift({id:p.id,name:String(p.name).slice(0,120),region:String(p.region||'').slice(0,80),lat:+p.lat,lon:+p.lon,months:(p.months||[]).slice(0,12),added:iso(todayUTC())});try{localStorage.setItem(CAT_FAV_KEY,JSON.stringify(l.slice(0,100)))}catch(e){alertMsg('Merkliste konnte in diesem Browser nicht gespeichert werden.')}}
/* Merkliste sichern/importieren/teilen: eigene kleine Datei, getrennt von der Reise-Sicherung */
const FAV_FORMAT='reiseplaner-merkliste';
function favClean(f){if(!f||typeof f!=='object'||typeof f.id!=='string'||!/^[a-z0-9-]{2,40}$/.test(f.id)||!CATX||!CATX.validPoint(f))return null;
  return {id:f.id,name:String(f.name||f.id).slice(0,120),region:String(f.region||'').slice(0,80),lat:+f.lat,lon:+f.lon,months:Array.isArray(f.months)?f.months.filter(m=>Number.isInteger(m)&&m>=1&&m<=12).slice(0,12):[],added:/^\d{4}-\d{2}-\d{2}$/.test(f.added||'')?f.added:iso(todayUTC())}}
function favExportData(list){return {format:FAV_FORMAT,version:1,exportedAt:new Date().toISOString(),items:list.map(favClean).filter(Boolean)}}
/* Zusammenführen: vorhandene Einträge behalten, neue anhängen, keine Dubletten, höchstens 100. Gibt {list, added, skipped} zurück. */
function favMerge(current,raw){
  if(!raw||raw.format!==FAV_FORMAT||raw.version!==1||!Array.isArray(raw.items))throw new Error('Keine Reiseplaner-Merkliste.');
  if(raw.items.length>500)throw new Error('Die Datei enthält zu viele Einträge.');
  const list=current.slice(),ids=new Set(list.map(f=>f.id));let added=0,skipped=0;
  raw.items.forEach(x=>{const f=favClean(x);if(!f||ids.has(f.id)||list.length>=100){skipped++;return}list.push(f);ids.add(f.id);added++});
  return {list,added,skipped};
}
function favText(list){return 'Merkliste „Irgendwann mal“ (Reiseplaner)\n'+list.map(f=>'• '+f.name+(f.region?' ('+f.region+')':'')+' – '+catShareUrl(f.id)).join('\n')}
function catFind(id){const s=catState();return (s.res&&s.res.ranked.find(r=>r.place.id===id))||s.extra[id]||null}
/* Ein einzelnes Ziel (Merkliste, Rundreise) nachladen und wie ein Suchtreffer bewerten */
async function catLoadPlace(id,lat,lon){
  const s=catState();if(catFind(id))return catFind(id);
  const r=await catalogQuery({lat,lon,maxKm:10,minKm:0});const p=r.places.find(q=>q.id===id);
  if(!p)throw new Error('Ziel ist nicht mehr im Katalog.');
  p.airKm=Math.round(CATX.airKm(s.origin,p)*10)/10;
  const x=catRank({version:r.version,source:r.source,places:[p]})[0];s.extra[id]=x;return x;
}
function catPrefs(){const s=catState();return {kinds:s.kinds,month:s.month,nights:s.nights===''?null:+s.nights,family:s.family,rainy:s.rainy}}
/* Mini-Karte der Treffer: Start in der Mitte, Kreise im Kilometerabstand (Luftlinie). Kein Kartendienst, funktioniert offline. */
function catMap(list,origin){
  if(!list.length)return '';
  const more=list.length>20;list=list.slice(0,20);
  const W=340,H=230,L=CATX.mapLayout(origin,list.map(x=>x.place),W,H);
  return '<figure class="catmap"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Lage der Ziele rund um den Abfahrtsort; Nummern wie in der Liste">'+
   L.rings.map(r=>'<circle cx="'+L.origin.x+'" cy="'+L.origin.y+'" r="'+r.r.toFixed(1)+'" class="ring"/><text x="'+(L.origin.x+3)+'" y="'+(L.origin.y-r.r+11).toFixed(1)+'" class="rl">'+r.km+' km</text>').join('')+
   '<circle cx="'+L.origin.x+'" cy="'+L.origin.y+'" r="5" class="home"/>'+
   L.points.map((q,i)=>'<a href="#cat-card-'+esc(q.id)+'" data-act="cat-open" data-val="'+esc(q.id)+'"><circle cx="'+q.x+'" cy="'+q.y+'" r="9" class="pt"/><text x="'+q.x+'" y="'+(q.y+3.5)+'" class="pn">'+(i+1)+'</text></a>').join('')+
   '</svg><figcaption class="small muted">Luftlinien-Kreise um euren Start (●). Nummer antippen öffnet das Ziel.'+(more?' Die Karte zeigt die ersten 20 Ziele der Liste.':'')+'</figcaption></figure>';
}
/* Zwölf Monate mit Text, nicht nur Farbe */
function catSeasonStrip(months,label){
  if(!months||!months.length)return '';
  const good=new Set(months.map(Number));
  return '<div class="season" aria-label="'+esc(label||'Gute Reisemonate')+': '+esc([...good].sort((a,b)=>a-b).map(m=>MONTHS[m-1]).join(', '))+'">'+MONTHS.map((m,i)=>'<span class="'+(good.has(i+1)?'on':'')+'" title="'+m+(good.has(i+1)?': gute Reisezeit':'')+'">'+m.slice(0,1)+(good.has(i+1)?'<i>✓</i>':'')+'</span>').join('')+'</div>';
}
function vEntdecken(){
  const s=catState();
  if(!CATX)return '<section class="block"><h1>Entdecken</h1><p>Der Katalog konnte nicht geladen werden. Bitte Seite neu laden.</p></section>';
  const o=s.origin;
  const originBox=o?'<p><b>Start: '+esc(o.label)+'</b> <span class="small muted num">('+o.lat.toFixed(2)+', '+o.lon.toFixed(2)+')</span></p><div class="row"><button type="button" class="btn ghost sm" data-act="cat-origin-clear">Anderen Abfahrtsort wählen</button></div>':
   '<div class="row"><button type="button" class="btn ghost" data-act="cat-geo"'+(s.geoBusy?' disabled':'')+'>Meinen Standort verwenden</button></div>'+
   '<div class="form"><label class="fld"><span>Ort oder Postleitzahl</span><input type="text" id="cat-q" maxlength="80" placeholder="z. B. 73110 oder Kassel" autocomplete="off"></label>'+
   '<div class="fld"><span>&nbsp;</span><button type="button" class="btn ghost" data-act="cat-geo-search"'+(s.geoBusy?' disabled':'')+'>Ort suchen</button></div>'+
   '<label class="fld"><span>Oder Stadt aus der Liste</span><select id="cat-city"><option value="">– Stadt wählen –</option>'+CATX.ORIGINS.map((c,i)=>'<option value="'+i+'">'+esc(c.label)+'</option>').join('')+'</select></label></div>'+
   (s.geoBusy?'<p class="small" role="status">Suche läuft …</p>':'')+
   (s.geoHits?(s.geoHits.length?'<div class="checks-list">'+s.geoHits.map((h,i)=>'<button type="button" class="chk info" style="cursor:pointer;text-align:left" data-act="cat-pick" data-val="'+i+'"><span>'+esc(h.label)+'</span></button>').join('')+'</div>':'<p class="small">Kein Ort gefunden. Anders schreiben oder Stadt aus der Liste wählen.</p>'):'')+
   '<p class="small muted">Die Ortssuche fragt OpenStreetMap (Nominatim); übertragen wird nur der eingegebene Ort. Der Standort wird auf etwa 1 km gerundet und nur in diesem Browser gemerkt.</p>';
  const res=s.res;
  let out='<section class="block"><span class="eyebrow">Entdecken</span><h1>Wohin von hier aus?</h1><p class="lead muted">Abfahrtsort und Kilometer angeben, Themen wählen: Der Katalog schlägt passende Ziele mit Attraktionen, Zwischenstopps auf dem Weg und Ausflügen vor Ort vor. Daraus wird auf Knopfdruck eine Reise mit Tagesgerüst.</p></section>'+
   '<section class="block"><div class="panel"><h2>Ziel direkt finden</h2><div class="form"><label class="fld"><span>Name, Region oder Idee</span><input type="search" id="cat-find" maxlength="60" value="'+esc(s.findQ||'')+'" placeholder="z. B. Wachau, Höhle, Bodensee" autocomplete="off"></label><div class="fld"><span>&nbsp;</span><button type="button" class="btn ghost" data-act="cat-find">Finden</button></div></div>'+
    (s.findHits?(s.findHits.length?'<div class="checks-list">'+s.findHits.map(p=>'<button type="button" class="chk info" style="cursor:pointer;text-align:left" data-act="cat-open-id" data-val="'+esc(p.id)+'"><span><strong>'+esc(p.name)+'</strong> <span class="small muted">'+esc(p.region)+(o?' · ≈ '+CATX.roadKm(CATX.airKm(o,p))+' km':'')+'</span></span></button>').join('')+'</div>':'<p class="small">Nichts gefunden für „'+esc(s.findQ)+'“.</p>'):'')+'</div></section>'+
   '<section class="block"><div class="panel"><h2>1 · Abfahrtsort</h2>'+originBox+'</div>'+
   '<div class="panel"><h2>2 · Wie weit?</h2><div class="opts">'+CATX.RANGES.map(r=>opt('cat-range',r.id,r.name,r.sub,s.range===r.id)).join('')+'</div>'+
   '<details'+(s.range?'':' open')+'><summary>Eigenen Kilometerbereich einstellen · '+s.minKm+'–'+s.maxKm+' km</summary><div class="form"><label class="fld"><span>ab km</span><input type="number" min="0" max="1990" step="10" data-cf="minKm" value="'+esc(s.minKm)+'"></label><label class="fld"><span>bis km</span><input type="number" min="10" max="2000" step="10" data-cf="maxKm" value="'+esc(s.maxKm)+'"></label></div></details>'+
   '<p class="small muted">Ungefähre Autofahrstrecke in eine Richtung, auch bei anderer Anreise nur zur räumlichen Eingrenzung.</p></div>'+catMoodPanel()+
   '<div class="row"><button type="button" class="btn" data-act="cat-search"'+(o&&!s.busy?'':' disabled')+'>Ziele finden</button><button type="button" class="btn ghost" data-act="cat-surprise"'+(o&&!s.busy?'':' disabled')+'>Überrasch mich</button>'+(o?'':'<span class="small muted">Erst einen Abfahrtsort wählen.</span>')+'</div></section>';
  const favs=catFavs();
  if(s.cmp.length)out+='<section class="block"><div class="note" role="status"><b>Vergleich: '+s.cmp.length+' von 3 Zielen</b><p>'+s.cmp.map(id=>{const x=catFind(id);return esc(x?x.place.name:id)}).join(' · ')+'</p><div class="row"><button type="button" class="btn sm" data-act="cat-cmp-open"'+(s.cmp.length>=2?'':' disabled')+'>Nebeneinander ansehen</button><button type="button" class="btn ghost sm" data-act="cat-cmp-clear">Auswahl leeren</button>'+(s.cmp.length<2?'<span class="small">Mindestens zwei Ziele wählen.</span>':'')+'</div></div></section>';
  if(s.tour.length)out+='<section class="block"><div class="note" role="status"><b>Rundreise: '+s.tour.length+' von 6 Zielen</b><p>'+s.tour.map(q=>esc(q.name)).join(' · ')+'</p><div class="row"><button type="button" class="btn sm" data-act="cat-tour-open"'+(s.tour.length>=2&&o?'':' disabled')+'>Rundreise planen</button><button type="button" class="btn ghost sm" data-act="cat-tour-clear">Auswahl leeren</button>'+(s.tour.length<2?'<span class="small">Mindestens zwei Ziele wählen.</span>':'')+'</div></div></section>';
  if(favs.length)out+='<section class="block"><details class="panel"'+(s.res?'':' open')+'><summary><b>Merkliste „Irgendwann mal“</b> <small class="muted">'+favs.length+' Ziel(e), nur in diesem Browser</small></summary><div class="checks-list">'+
    favs.map(f=>{const d=o?CATX.roadKm(CATX.airKm(o,f)):null,sf=s.month&&f.months&&f.months.length?f.months.includes(+s.month):null;return '<div class="chk info"><span><strong>'+esc(f.name)+'</strong> <span class="small muted">'+esc(f.region)+(d!=null?' · ≈ '+d+' km':'')+'</span>'+(sf===true?' <span class="badge ok">passt in den '+esc(MONTHS[+s.month-1])+'</span>':sf===false?' <span class="badge est">eher nicht im '+esc(MONTHS[+s.month-1])+'</span>':'')+'</span><span class="row" style="margin-left:auto"><button type="button" class="btn ghost sm" data-act="cat-fav-open" data-val="'+esc(f.id)+'"'+(o?'':' disabled')+'>Ansehen</button><button type="button" class="lnk" data-act="cat-fav" data-val="'+esc(f.id)+'">Entfernen</button></span></div>'}).join('')+
    '</div>'+(o?'':'<p class="small muted">Für Entfernungen und Planung erst einen Abfahrtsort wählen.</p>')+
    '<div class="row"><button type="button" class="btn ghost sm" data-act="cat-fav-export">Merkliste sichern</button><button type="button" class="btn ghost sm" data-act="cat-fav-import">Merkliste importieren</button><button type="button" class="btn ghost sm" data-act="cat-fav-share">Als Text teilen</button><input id="fav-file" type="file" accept=".json,application/json" hidden></div><p class="small muted">Die Merkliste liegt nur in diesem Browser. Mit „sichern“ entsteht eine kleine Datei (nur Ziele, keine Reisedaten) für ein anderes Gerät.</p></details></section>';
  else out+='<section class="block"><p class="small muted">Merkliste leer. <button type="button" class="lnk" data-act="cat-fav-import">Gesicherte Merkliste importieren</button><input id="fav-file" type="file" accept=".json,application/json" hidden></p></section>';
  if(s.searchNote)out+='<section class="block"><p class="note" role="status">'+esc(s.searchNote)+'</p></section>';
  if(s.busy)out+='<section class="block"><p role="status">Suche läuft …</p></section>';
  else if(s.err)out+='<section class="block"><div class="note" role="alert"><b>Suche nicht möglich</b><p>'+esc(s.err)+'</p></div></section>';
  else if(res){
    const {shown,matching,hidden}=catResultView(s),missing=res.ranked.filter(x=>!x.mustOk).length;
    out+='<section class="block" id="cat-results"><h2>'+(res.ranked.length?res.ranked.length+' Ziele zwischen '+s.minKm+' und '+s.maxKm+' km':'Keine Ziele in diesem Bereich')+'</h2>'+catSourceLine(res)+
     (res.ranked.length?'<div class="cat-result-tools">'+(missing||s.mustOnly?'<label><input type="checkbox" data-cf="mustOnly"'+(s.mustOnly?' checked':'')+'> Nur Ziele mit belegten Muss-Wünschen</label>':'')+
      '<p class="small" role="status">'+shown.length+' von '+res.ranked.length+' Zielen sichtbar.'+(s.mustOnly?' '+hidden+' Alternativen wegen fehlender Muss-Merkmale oder ungeprüfter Anreisedauer ausgeblendet.':missing?' '+missing+' Alternativen mit Muss-Lücken oder ungeprüfter Anreisedauer bleiben sichtbar.':'')+'</p>'+
      '<div class="form"><label class="fld"><span>In den Treffern suchen</span><input type="search" data-cf="q" maxlength="60" value="'+esc(s.q)+'" placeholder="z. B. Höhle, Wasserfall, Schloss"></label><label class="fld"><span>Sortieren</span><select data-cf="sort">'+[['passend','Am besten passend'],['nah','Am nächsten'],['weit','Am weitesten'],['ideen','Meiste Ideen']].map(x=>'<option value="'+x[0]+'"'+(s.sort===x[0]?' selected':'')+'>'+x[1]+'</option>').join('')+'</select></label></div><p class="small muted">Budget und Verbindungen bleiben ungeprüft. Ein sichtbarer Treffer ist keine Preis- oder Buchungszusage.</p></div>'+
      catYear(res)+(s.q&&matching.length!==res.ranked.length?'<p class="small">'+matching.length+' von '+res.ranked.length+' Zielen passen zu „'+esc(s.q)+'“.</p>':'')+catMap(shown,s.origin):'')+
     (res.ranked.length?(shown.length?'<div class="grid">'+shown.map(catCard).join('')+'</div>':matching.length?'<div class="empty"><b>Kein Ziel erfüllt derzeit alle Muss-Wünsche.</b><span>Wünsche oben einzeln lockern oder die Alternativen wieder einblenden.</span><button type="button" class="btn ghost" data-act="cat-must-all">Alternativen anzeigen</button></div>':'<div class="empty"><b>Kein Treffer für „'+esc(s.q)+'“</b><button type="button" class="btn ghost" data-act="cat-q-clear">Suchwort entfernen</button></div>'):'<div class="empty"><b>Nichts gefunden</b><span>Kilometerbereich vergrößern. Der Katalog wächst; eigene Ziele lassen sich jederzeit als Reise anlegen.</span><button type="button" class="btn ghost" data-go="neu">Eigene Reise anlegen</button></div>')+'</section>';
  }
  return out;
}
/* Tagesideen: ein Highlight plus eine ruhige Ergänzung am selben Ziel (DESIGN_CATALOG.md, Vorschlag 3) */
/* Wann wohin? Jahresüberblick über die aktuellen Treffer: je Monat Anzahl guter Ziele und Beispiele (typische Reisezeiten, nicht geprüft) */
function catYear(res){
  const s=catState(),pl=res.places||[];if(!pl.length)return '';
  const rows=MONTHS.map((m,i)=>{const good=pl.filter(p=>p.months.includes(i+1));
    const top=good.slice().sort((a,b)=>(b.kinds.filter(k=>s.kinds.includes(k)).length-a.kinds.filter(k=>s.kinds.includes(k)).length)||a.airKm-b.airKm).slice(0,3);
    return {m:i+1,name:m,n:good.length,top}});
  const max=Math.max(1,...rows.map(r=>r.n));
  return '<details class="panel"><summary><b>Wann wohin? Jahresüberblick</b> <small class="muted">gute Reisemonate der '+pl.length+' Ziele im Bereich</small></summary><p class="small muted">Typische Reisezeiten aus dem Katalog, für eure Daten nicht geprüft. Monat antippen übernimmt ihn als Reisemonat.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Monat</th><th class="r">passend</th><th>zum Beispiel</th></tr></thead><tbody>'+
   rows.map(r=>'<tr'+(String(r.m)===s.month?' class="total"':'')+'><td><button type="button" class="lnk" data-act="cat-month" data-val="'+r.m+'" aria-pressed="'+(String(r.m)===s.month)+'">'+r.name+'</button></td><td class="r num"><span class="yearbar" style="width:'+Math.round(r.n/max*48)+'px"></span> '+r.n+'</td><td class="small">'+r.top.map(p=>esc(p.name)).join(' · ')+'</td></tr>').join('')+'</tbody></table></div></details>';
}
function catComboBlock(p){
  const s=catState(),list=CATX.combos(p,{month:s.month,family:s.family});s.combo=null;
  if(!list.length)return '';
  return '<h3>Tagesideen: ein Highlight, eine ruhige Ergänzung</h3><p class="small muted">Kurzer Weg, zusammen höchstens 7 Std., damit Zeit zum Durchatmen bleibt. Auswählen setzt beide Häkchen und plant sie am selben Tag.</p><div class="checks-list">'+
   list.map(x=>'<div class="chk info"><span><strong>'+esc(x.label)+'</strong><br><small>'+esc(x.highlight.name)+' + '+esc(x.calm.name)+' · ≈ '+String(x.airKm).replace('.',',')+' km Luftlinie · zusammen ca. '+String(x.hours).replace('.',',')+' Std.</small></span><button type="button" class="btn ghost sm" style="margin-left:auto" data-act="cat-combo" data-val="'+esc(x.highlight.id+'|'+x.calm.id)+'">Diese Kombi</button></div>').join('')+'</div>';
}
function catSpotRow(e,checked){
  const sp=e.spot,s=catState(),season=CATX.spotSeason(sp,s.month);
  const extra=e.kind==='stop'?'Umweg ca. '+e.detourKm+' km · '+esc(e.place.name):e.kind==='near'?'≈ '+e.roadKm+' km vom Ziel · '+esc(e.place.name):'';
  return '<label class="chk info"><input type="checkbox" data-cs="'+esc(sp.id)+'"'+(checked?' checked':'')+'> <span><strong>'+esc(sp.name)+'</strong> <span class="small muted">'+esc(CATX.KINDS[sp.kind]||'')+' · ca. '+String(sp.hours).replace('.',',')+' Std.'+(extra?' · '+extra:'')+'</span><br><small>'+esc(sp.summary)+(sp.tip?' Tipp: '+esc(sp.tip):'')+'</small>'+
   '<span class="badges">'+(sp.indoor?'<span class="badge">drinnen</span>':'')+(sp.family?'<span class="badge">mit Kindern</span>':'')+(season===false?'<span class="badge est">übliche Saison: '+sp.months.map(m=>MONTHS[m-1].slice(0,3)).join(', ')+'</span>':'')+(sp.months.length&&season!==false?'<span class="badge est">Saisonbetrieb, prüfen</span>':'')+'</span> '+lk(mp(sp.name+', '+e.place.name),'Karte')+'</span></label>';
}
function catOpen(id){
  const s=catState(),x=catFind(id);if(!x)return;
  const p=x.place;s.index={};s.openId=id;
  const pre=CATX.dayPlan(x.spots.filter(sp=>!s.family||sp.family),Math.max(0,num(s.nights===''?p.nights[0]:s.nights,0)));
  const want=new Set(pre.map(i=>i.spotId).slice(0,Math.max(3,pre.length)));
  x.spots.forEach(sp=>{s.index[sp.id]={spot:sp,place:p,kind:'dest'}});
  const nights=s.nights===''?Math.max(p.nights[0],Math.min(2,p.nights[1])):+s.nights;
  const editable=Store.list().filter(t=>!Store.isAccount()||Store.canEdit(t.id));
  openSheet('<span class="eyebrow">'+esc(p.region)+'</span><h2>'+esc(p.name)+'</h2><p>'+esc(p.summary)+'</p>'+catSeasonStrip(p.months,'Gute Reisemonate (typisch, nicht für eure Daten geprüft)')+'<p class="small muted">Typische Reisezeit: '+p.nights[0]+'–'+p.nights[1]+' Nächte.</p>'+(p.angle?'<div class="note"><b>Ums Eck gedacht</b><p>'+esc(p.angle)+'</p></div>':'')+
   (s.origin&&x.roadKm!=null?'<p class="small"><b>≈ '+x.roadKm+' km Fahrstrecke, ca. '+esc(CATX.durText(x.minutes))+'</b> ab '+esc(s.origin.label)+' <span class="muted">(Schätzung)</span> '+lk(route(s.origin.label,p.name),'Route prüfen')+'</p>':'<p class="small muted">Für Entfernung, Zwischenstopps und Planung oben in „Entdecken“ einen Abfahrtsort wählen.</p>')+
   '<div class="row"><button type="button" class="btn ghost sm" data-act="cat-share" data-val="'+esc(p.id)+'">Link zu diesem Ziel teilen</button>'+lk(mp(p.name),'Karte')+'</div>'+
   catReasons(x)+catComboBlock(p)+
   '<h3>Vor Ort</h3><p class="small muted">Vorausgewählt ist, was in eure Reisezeit und Dauer passt. Häkchen setzen oder entfernen.</p><div class="checks-list">'+x.spots.map(sp=>catSpotRow({spot:sp,place:p,kind:'dest'},want.has(sp.id))).join('')+
   (x.closed?'<p class="small muted">'+x.closed+' weitere Idee(n) sind im gewählten Monat üblicherweise geschlossen und ausgeblendet.</p>':'')+'</div>'+
   (s.origin?'<h3>Unterwegs-Stopps</h3><div id="cat-stops"><p class="small" role="status">Suche Stopps auf dem Weg …</p></div>':'')+
   '<h3>Ausflüge vom Ziel aus</h3><div id="cat-near"><p class="small" role="status">Suche in der Umgebung …</p></div>'+
   '<h3>Ähnliche Ziele</h3><div id="cat-similar"><p class="small" role="status">Suche …</p></div>'+
   '<div class="panel"><h3>Daraus eine Reise machen</h3><div class="form"><label class="fld"><span>Nächte</span><input type="number" min="0" max="30" id="cat-n" value="'+nights+'"></label><label class="fld"><span>Personen</span><input type="number" min="1" max="20" id="cat-p" value="2"></label></div>'+
   '<p class="small muted">Die Auswahl wird automatisch auf die Tage verteilt (Anreisetag nachmittags, Abreisetag vormittags, lange Touren ganztags, Drinnen-Ideen nachmittags). Preise bleiben offen, bis ihr sie eintragt. Fahrstrecke wird als Schätzung übernommen.</p>'+
   '<div class="row"><button type="button" class="btn" data-act="cat-create"'+(s.origin?'':' disabled')+'>Als neue Reise anlegen</button>'+(s.origin?'':'<span class="small muted">Erst einen Abfahrtsort wählen.</span>')+'</div>'+
   (editable.length?'<div class="form"><label class="fld"><span>Oder zu bestehender Reise</span><select id="cat-trip">'+editable.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.title)+'</option>').join('')+'</select></label><div class="fld"><span>&nbsp;</span><button type="button" class="btn ghost" data-act="cat-add">Hinzufügen</button></div></div>':'')+'</div>');
  catExtras(x).catch(e=>{const a=$('#cat-stops'),b=$('#cat-near');if(a)a.innerHTML='<p class="small">'+esc(e.message)+'</p>';if(b)b.innerHTML=''});
}
/* Stopps und Ausflüge nachladen: zwei weitere Abfragen mit derselben Quelle */
async function catExtras(x){
  const s=catState(),p=x.place,id=p.id;
  catSimilar(p).catch(()=>{const el=$('#cat-similar');if(el)el.innerHTML=''});
  const [way,around]=await Promise.all([
    s.origin&&x.roadKm!=null?catalogQuery({lat:s.origin.lat,lon:s.origin.lon,maxKm:Math.min(CATX.MAX_KM,x.roadKm+40),minKm:0}).catch(()=>({places:[]})):Promise.resolve({places:[]}),
    catalogQuery({lat:p.lat,lon:p.lon,maxKm:80,minKm:0}).catch(()=>({places:[]}))]);
  if(s.openId!==id)return;
  const stops=s.origin?CATX.stopsAlong(way.places,s.origin,p):[],near=CATX.nearbyFrom(around.places,p,50).filter(n=>!stops.some(st=>st.spot.id===n.spot.id));
  stops.forEach(e=>{s.index[e.spot.id]={spot:e.spot,place:e.place,kind:'stop',detourKm:e.detourKm}});
  near.forEach(e=>{s.index[e.spot.id]={spot:e.spot,place:e.place,kind:'near',roadKm:e.roadKm}});
  const a=$('#cat-stops'),b=$('#cat-near');
  if(a)a.innerHTML=stops.length?'<p class="small muted">Liegen auf dem Weg, Umweg geschätzt. Werden am Anreisetag eingeplant.</p><div class="checks-list">'+stops.map(e=>catSpotRow(Object.assign({kind:'stop'},e),false)).join('')+'</div>':'<p class="small muted">'+(x.roadKm<80?'Für kurze Strecken keine Stopps.':'Keine Katalog-Idee nah genug an der Strecke.')+'</p>';
  if(b)b.innerHTML=near.length?'<div class="checks-list">'+near.map(e=>catSpotRow(Object.assign({kind:'near'},e),false)).join('')+'</div>':'<p class="small muted">Keine weiteren Katalog-Ideen im Umkreis von 50 km.</p>';
}
/* Ziel per ID öffnen (Direktsuche, Ähnliche, Link #ziel-<id>); mit Start wie ein Suchtreffer bewertet, sonst ohne Entfernung */
async function catOpenById(id){
  const s=catState();let x=catFind(id);
  if(!x){const data=await catPlaceRaw(id),raw=data.raw;if(!raw){alertMsg('Dieses Ziel gibt es im Katalog nicht (mehr).');return}
    if(s.origin){try{x=await catLoadPlace(id,raw.lat,raw.lon)}catch(e){x=null}}
    if(!x){const p=CATX.normPlace(raw);x={place:p,spots:p.spots.filter(sp=>CATX.spotSeason(sp,s.month)!==false),why:[],score:0,season:CATX.seasonFit(p,s.month),nightsFit:null,roadKm:null,minutes:null,closed:0,indoor:0,version:data.version,source:'lokal'};x.closed=p.spots.length-x.spots.length;s.extra[id]=x}}
  catOpen(id);
}
async function catSimilar(p){
  const s=catState();let pool;try{pool=(await catLoadIndex()).places}catch(e){pool=(await catLoadLocal()).places}
  const list=CATX.similar(p,pool,{origin:s.origin,max:4});
  const el=$('#cat-similar');if(!el||s.openId!==p.id)return;
  el.innerHTML=list.length?'<div class="checks-list">'+list.map(x=>'<div class="chk info"><span><strong>'+esc(x.place.name)+'</strong> <span class="small muted">'+esc(x.place.region)+(x.airKm!=null?' · ≈ '+CATX.roadKm(x.airKm)+' km von euch':'')+'</span><br><small>gemeinsam: '+x.shared.map(k=>esc(CATX.KINDS[k])).join(', ')+'</small></span><button type="button" class="btn ghost sm" style="margin-left:auto" data-act="cat-open-id" data-val="'+esc(x.place.id)+'">Ansehen</button></div>').join('')+'</div>':'<p class="small muted">Keine ähnlichen Ziele im Katalog.</p>';
}
async function catFindRun(q){
  const s=catState();s.findQ=String(q||'').trim().slice(0,60);
  if(s.findQ.length<2){s.findHits=null;render();return}
  /* online: Namenssuche in der Datenbank (catalog_find); sonst über den Index (Namen auch der Attraktionen) */
  const c=window.RPCloud,query=s.findQ;let hits=null;
  if(c&&c.enabled()&&c.catalogFind&&!(typeof navigator!=='undefined'&&navigator.onLine===false)){try{const r=await catTimeout(c.catalogFind(query,12),6000);if(r&&r.version>0)hits=(r.places||[]).map(CATX.normPlace)}catch(e){hits=null}}
  if(!hits){let pool;try{pool=(await catLoadIndex()).places}catch(e){pool=(await catLoadLocal()).places}hits=CATX.findPlaces(pool,query,12)}
  if(s.findQ!==query)return;s.findHits=hits;render();
  const el=document.getElementById('cat-find');if(el){el.focus();try{el.setSelectionRange(el.value.length,el.value.length)}catch(e){}}
}
function catShareUrl(id){return (typeof location!=='undefined'&&location.origin?location.origin+location.pathname:'')+'#ziel-'+id}
/* Zielvergleich: Unterschiede nebeneinander, keine Wertung */
function catCompareSheet(){
  const s=catState(),xs=s.cmp.map(catFind).filter(Boolean);if(xs.length<2)return;
  const rows=catProfileRows(xs).concat(CATX.compareRows(xs,{month:s.month?+s.month:null}));
  openSheet('<span class="eyebrow">Vergleich</span><h2>'+xs.length+' Ziele nebeneinander</h2><p class="small muted">Bewertung anhand eurer aktuellen Wünsche, typische Angaben aus dem Katalog. Keine Preise oder geprüften Verbindungen. Entfernungen sind Auto-Schätzungen. Auf schmalen Bildschirmen die Tabelle seitlich wischen.</p>'+catProfileSummary(false)+
   '<div class="tbl-wrap"><table class="tbl cmp"><thead><tr><th></th>'+xs.map(x=>'<th scope="col">'+esc(x.place.name)+'</th>').join('')+'</tr></thead><tbody>'+
   rows.map(r=>'<tr><th scope="row">'+esc(r.label)+'</th>'+r.values.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+
   '<tr><th scope="row"></th>'+xs.map(x=>'<td><button type="button" class="btn ghost sm" data-act="cat-open" data-val="'+esc(x.place.id)+'">Ansehen & planen</button></td>').join('')+'</tr></tbody></table></div>');
}
function catProfileRows(xs){return [
 {label:'Eure Wünsche',values:xs.map(x=>x.summary||'nicht bewertet')},
 {label:'Muss-Prüfung',values:xs.map(x=>{if(!x.must)return 'nicht bewertet';const missing=x.must.missing.map(k=>CATX.KINDS[k]||'Anreisedauer'),unknown=x.must.unknown.filter(k=>k!=='budget');return [missing.length?'Fehlt: '+missing.join(', '):'',unknown.length?'Anreisedauer ungeprüft':'',!missing.length&&!unknown.length?'Keine erkannte Muss-Lücke':''].filter(Boolean).join(' · ')})},
 {label:'Passt weniger gut',values:xs.map(x=>(x.why||[]).filter(w=>w.type==='minus').map(w=>w.text).join(' · ')||'keine Abwertung')},
 {label:'Ungeprüft',values:xs.map(x=>(x.why||[]).filter(w=>w.type==='unknown').map(w=>w.text).join(' · ')||'Preise, Öffnungszeiten und Verfügbarkeit')}
]}
function catPicked(){const s=catState();return [...document.querySelectorAll('[data-cs]')].filter(c=>c.checked).map(c=>s.index[c.getAttribute('data-cs')]).filter(Boolean)}
/* Auswahl als eigene Unternehmungen mit Tagesgerüst in eine Reise übernehmen (nur additive Felder). */
function catApply(t,picked,nights){
  const acts={},main=[],stops=[];
  picked.forEach(e=>{const a=CATX.toAct(e.spot,e.place,uid);if(e.kind==='stop'){a.km=e.detourKm;a.note+=' Zwischenstopp, Umweg ca. '+e.detourKm+' km (geschätzt).';stops.push(a)}else{if(e.kind==='near'){a.km=e.roadKm*2;a.note+=' Ausflug vom Ziel, hin und zurück ca. '+e.roadKm*2+' km (geschätzt).'}main.push(Object.assign({},e.spot,{id:a.id,slot:e.spot.slot}))}acts[a.id]=a});
  t.customActs=(t.customActs||[]).concat(Object.values(acts));
  const plan=CATX.dayPlan(main,nights).map(i=>({uid:uid('i'),act:i.spotId,day:i.day,slot:i.slot}));
  /* gewählte Kombi am selben Tag: Ergänzung in das andere Tagesfenster des Highlights legen, wenn dort frei */
  const cb=(catState().combo||[]).map(id=>Object.values(acts).find(a=>a.catalogSpot===id)).filter(Boolean);
  if(cb.length===2){const hi=plan.find(i=>i.act===cb[0].id),ca=plan.find(i=>i.act===cb[1].id);
    if(hi&&ca&&hi.day!==ca.day){const other=hi.slot==='morgen'?'nachm':'morgen';if(!plan.some(i=>i.day===hi.day&&i.slot===other)){ca.day=hi.day;ca.slot=other}}}
  const st=stops.map(a=>({uid:uid('i'),act:a.id,day:0,slot:'mittag'}));
  t.items=(t.items||[]).concat(st,plan);
  return {acts:Object.keys(acts).length,planned:plan.length+st.length};
}
function catTripType(p,nights,month){
  const m=+month||0;
  if(nights===0)return 'tag';
  if(p.kinds.includes('winter')&&[12,1,2,3].includes(m))return 'winter';
  if(p.kinds[0]==='stadt')return 'stadt';
  if(p.kinds.includes('wasser')&&[6,7,8].includes(m)&&nights>=4)return 'strand';
  return nights<=2?'wochenende':'rund';
}
function catCreate(){
  const s=catState(),x=catFind(s.openId);if(!x)return;
  if(!s.origin||x.roadKm==null){alertMsg('Bitte zuerst einen Abfahrtsort wählen.');return}
  const p=x.place,nights=Math.max(0,Math.min(30,Math.round(num($('#cat-n').value,0)))),persons=Math.max(1,Math.min(20,Math.round(num($('#cat-p').value,2))));
  const picked=catPicked();
  const t=newTrip({title:p.name,type:catTripType(p,nights,s.month),nights,persons,budget:0,origin:s.origin.label,originGeo:{lat:s.origin.lat,lon:s.origin.lon},dest:p.name+(p.region?', '+p.region:''),travel:'auto',km:x.roadKm,kmSrc:'schaetzung',
    destGeo:{lat:p.lat,lon:p.lon,place:p.id,v:x.version},
    notes:'Aus dem Umkreis-Katalog (Version '+x.version+', '+(x.source==='db'?'Datenbank':'Offline-Kopie')+'). '+p.summary+(p.angle?'\nIdee: '+p.angle:'')+'\nFahrstrecke '+x.roadKm+' km ist eine Schätzung; Preise und Öffnungszeiten vor Ort prüfen.'});
  if(s.month){t.dateMode='flex';t.month=catNextMonth(s.month)}
  const r=catApply(t,picked,nights);
  t.id=uid('t');save(t,true);closeSheet();go('r-'+t.id+'-plan');
  alertMsg('Reise angelegt: '+r.acts+' Ideen übernommen, '+r.planned+' davon eingeplant. Preise sind noch offen.');
}
function catAdd(){
  const s=catState(),t=Store.get($('#cat-trip').value);if(!t)return;
  if(Store.isAccount()&&!Store.canEdit(t.id)){alertMsg('Nur Leserecht für diese Reise.');return}
  const picked=catPicked();if(!picked.length){alertMsg('Keine Idee ausgewählt.');return}
  const r=catApply(t,picked,nightsOf(t));save(t);closeSheet();go('r-'+t.id+'-plan');
  alertMsg(r.acts+' Ideen zur Reise „'+t.title+'“ hinzugefügt.');
}
/* Rundreise: Reihenfolge nach kürzestem Weg (Schätzung), Nächte je Etappe, eine Reise mit Etappen und Tagesgerüst */
function catTourPlan(){
  const s=catState(),r=CATX.roundTrip(s.origin,s.tour);
  const nights=s.tourNights&&s.tourNights.length===r.order.length&&s.tourOrder===r.order.map(p=>p.id).join(',')?s.tourNights:CATX.splitNights(r.order,r.order.reduce((n,p)=>n+Math.max(1,p.nights[0]),0));
  s.tourOrder=r.order.map(p=>p.id).join(',');s.tourNights=nights;return Object.assign(r,{nights});
}
function catTourSheet(){
  const s=catState();if(s.tour.length<2||!s.origin)return;
  const r=catTourPlan(),total=r.nights.reduce((a,b)=>a+b,0);
  openSheet('<span class="eyebrow">Rundreise</span><h2>'+r.order.length+' Ziele ab '+esc(s.origin.label)+'</h2><p class="small muted">Reihenfolge nach kürzester Gesamtstrecke (Luftlinie), Kilometer und Fahrzeiten geschätzt (× '+String(CATX.ROAD_FACTOR).replace('.',',')+', Ø '+CATX.AVG_KMH+' km/h).</p>'+
   '<ol class="steps">'+r.legs.map((l,i)=>'<li><b>'+esc(i===0?s.origin.label:l.from.name)+' → '+esc(i===r.legs.length-1?s.origin.label+' (Heimfahrt)':l.to.name)+'</b><br><span class="small">≈ '+l.roadKm+' km · ca. '+esc(CATX.durText(l.minutes))+'</span>'+
     (i<r.order.length?'<label class="fld" style="margin-top:6px"><span>Nächte in '+esc(l.to.name)+'</span><input type="number" min="1" max="21" data-tn="'+i+'" value="'+r.nights[i]+'"></label>':'')+'</li>').join('')+'</ol>'+
   '<div class="kpis"><div class="kpi"><small>Gesamtstrecke</small><b class="num">≈ '+r.roadKm+' km</b><small>Schätzung</small></div><div class="kpi"><small>Reine Fahrzeit</small><b class="num">ca. '+esc(CATX.durText(r.minutes))+'</b><small>ohne Pausen</small></div><div class="kpi"><small>Dauer</small><b class="num">'+total+' Nächte</b><small>'+(total+1)+' Tage</small></div></div>'+
   (r.legs.some(l=>l.minutes>300)?'<div class="note"><b>Lange Etappe</b><p>Mindestens eine Etappe dauert über 5 Stunden. Einen Zwischenstopp oder eine zusätzliche Nacht einplanen.</p></div>':'')+
   '<div class="form"><label class="fld"><span>Personen</span><input type="number" min="1" max="20" id="cat-tp" value="2"></label></div>'+
   '<div class="row"><button type="button" class="btn" data-act="cat-tour-create">Als Rundreise anlegen</button></div><p class="small muted">Je Etappe werden passende Ideen automatisch auf die Tage verteilt. Weiterfahrten stehen als eigener Punkt im Tagesplan. Preise bleiben offen.</p>');
}
function catTourCreate(){
  const s=catState(),r=catTourPlan(),P=Math.max(1,Math.min(20,Math.round(num(($('#cat-tp')||{}).value,2))));
  const nights=r.nights.reduce((a,b)=>a+b,0);
  const t=newTrip({title:'Rundreise: '+r.order.map(p=>p.name.split(/[ (&]/)[0]).join(' – ').slice(0,70),type:'rund',nights,persons:P,budget:0,origin:s.origin.label,dest:r.order.map(p=>p.name).join(' → ').slice(0,200),travel:'auto',
    km:Math.round(r.roadKm/2),kmSrc:'schaetzung',destGeo:{lat:r.order[0].lat,lon:r.order[0].lon,place:r.order[0].id,v:(catFind(r.order[0].id)||{}).version||0},
    originGeo:{lat:s.origin.lat,lon:s.origin.lon},
    legs:r.order.map((p,i)=>({place:p.id,name:p.name.slice(0,120),lat:p.lat,lon:p.lon,nights:r.nights[i],roadKm:r.legs[i].roadKm})),
    notes:'Rundreise aus dem Umkreis-Katalog. Gesamtstrecke ≈ '+r.roadKm+' km einschließlich Heimfahrt (Schätzung, Luftlinie × 1,3); im Feld „Entfernung“ steht die Hälfte, weil die App Hin- und Rückweg rechnet.\n'+r.legs.map((l,i)=>(i===0?s.origin.label:l.from.name)+' → '+(i===r.legs.length-1?s.origin.label:l.to.name)+': ≈ '+l.roadKm+' km').join('\n')});
  if(s.month){t.dateMode='flex';t.month=catNextMonth(s.month)}
  let start=0;const prefs=catPrefs();
  r.order.forEach((p,i)=>{
    const x=catFind(p.id)||catRank({version:0,places:[p]})[0];
    const to=i===r.order.length-1?nights:start+r.nights[i]-1;
    const occ=(t.items||[]).map(it=>it.day+'|'+it.slot);
    if(i>0){const mv={id:uid('c'),custom:true,t:'Weiterfahrt nach '+p.name,cat:'eigen',cost:0,per:'grp',dur:'ca. '+CATX.durText(r.legs[i].minutes),link:'',note:'Etappe ≈ '+r.legs[i].roadKm+' km (geschätzt). Die Kilometer sind schon in der Anreise der Reise enthalten.',slot:'morgen',map:p.name,ort:p.name,transit:true,hours:Math.round(r.legs[i].minutes/6)/10};
      t.customActs.push(mv);t.items.push({uid:uid('i'),act:mv.id,day:start,slot:'morgen'});occ.push(start+'|morgen')}
    const spots=x.spots.filter(sp=>!s.family||sp.family);
    const acts={};spots.forEach(sp=>{acts[sp.id]=CATX.toAct(sp,p,uid)});
    const plan=CATX.dayPlan(spots,nights,occ,{from:start,to});
    plan.forEach(it=>{const a=acts[it.spotId];t.customActs.push(a);t.items.push({uid:uid('i'),act:a.id,day:it.day,slot:it.slot})});
    start+=r.nights[i];
  });
  t.id=uid('t');save(t,true);closeSheet();s.tour=[];go('r-'+t.id+'-plan');
  alertMsg('Rundreise angelegt: '+r.order.length+' Etappen, '+t.items.length+' Punkte im Tagesplan. Preise und genaue Fahrzeiten sind noch offen.');
}
async function catSearch(surprise){
  const s=catState();if(!s.origin)return;
  const job=s.searchJob=(s.searchJob||0)+1,scope=catSearchScope(s),active=()=>UI.cat===s&&s.searchJob===job&&catSearchScope(s)===scope;
  const query={lat:s.origin.lat,lon:s.origin.lon,maxKm:s.maxKm,minKm:s.minKm,kinds:[]};
  s.busy=true;s.err='';s.searchNote='';if(UI.view==='entdecken')render();
  try{
    const r=await catalogQuery(query);if(!active())return;
    r.ranked=catRank(r);
    s.res=r;
  }catch(e){if(!active())return;s.err=e.message;s.res=null}
  if(!active())return;s.busy=false;catSavePrefs();if(UI.view!=='entdecken')return;render();
  if(s.res&&surprise){const pick=CATX.surprise(catResultView(s).shown.filter(x=>x.mustOk));if(pick)catOpen(pick.place.id);else alertMsg('Kein sichtbares Ziel erfüllt derzeit alle Muss-Wünsche. Wünsche prüfen oder Alternativen in der Ergebnisliste ansehen. Ungeprüfte Verbindungen erfüllen keine Anreisedauer.')}
  else if(s.res){const el=document.getElementById('cat-results');if(el&&el.scrollIntoView)try{el.scrollIntoView({block:'start'})}catch(e){}}
}
async function catGeoSearch(text){
  text=String(text||'').trim();const s=catState();if(text.length<2){alertMsg('Bitte einen Ort oder eine Postleitzahl eingeben.');return}
  const low=text.toLowerCase(),local=CATX.ORIGINS.filter(o=>o.label.toLowerCase().startsWith(low));
  s.geoBusy=true;render();
  try{
    const r=await catTimeout(fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=de&countrycodes=de,at,ch,fr,it,nl,be,lu,cz,pl,dk&q='+encodeURIComponent(text),{headers:{Accept:'application/json'}}),8000);
    if(!r.ok)throw new Error('Ortssuche: Fehler '+r.status);
    const j=await r.json();
    s.geoHits=local.concat((Array.isArray(j)?j:[]).map(h=>({label:String(h.display_name||'').split(',').slice(0,3).join(',').trim().slice(0,80),lat:Math.round(+h.lat*1000)/1000,lon:Math.round(+h.lon*1000)/1000})).filter(h=>h.label&&CATX.validPoint(h))).slice(0,6);
  }catch(e){s.geoHits=local;if(!local.length)alertMsg('Ortssuche nicht erreichbar ('+e.message+'). Bitte eine Stadt aus der Liste wählen.')}
  s.geoBusy=false;render();
}
function catSetOrigin(o){const s=catState();s.origin={label:String(o.label).slice(0,80),lat:+o.lat,lon:+o.lon};s.geoHits=null;catInvalidateSearch();catSavePrefs();render()}
/* In einer Reise: weitere Katalog-Ideen rund um das Ziel */
async function catTripIdeas(t){
  const g=t.destGeo;if(!g||!CATX||!CATX.validPoint(g))return;
  openSheet('<span class="eyebrow">Umkreis-Katalog</span><h2>Mehr Ideen rund um '+esc(t.dest||t.title)+'</h2><div id="cat-trip-ideas"><p role="status">Suche …</p></div>');
  try{
    const r=await catalogQuery({lat:g.lat,lon:g.lon,maxKm:80,minKm:0});
    const have=new Set((t.customActs||[]).map(a=>a.catalogSpot).filter(Boolean)),s=catState();s.index={};
    const list=[];r.places.forEach(p=>p.spots.forEach(sp=>{if(have.has(sp.id))return;const d=CATX.airKm(g,sp);if(d<=50)list.push({spot:sp,place:p,kind:p.id===g.place?'dest':'near',roadKm:CATX.roadKm(d),d})}));
    list.sort((a,b)=>a.d-b.d);list.forEach(e=>{s.index[e.spot.id]=e});
    const el=$('#cat-trip-ideas');if(!el)return;
    el.innerHTML=list.length?catSourceLine(r)+'<div class="checks-list">'+list.slice(0,15).map(e=>catSpotRow(e,false)).join('')+'</div><div class="row"><button type="button" class="btn" data-act="cat-trip-add">Ausgewählte hinzufügen</button></div>':'<p>Alle Katalog-Ideen in der Nähe sind schon in dieser Reise.</p>';
  }catch(e){const el=$('#cat-trip-ideas');if(el)el.innerHTML='<p>'+esc(e.message)+'</p>'}
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-act^="cat-"]');if(!b||!CATX)return;
  const act=b.getAttribute('data-act'),val=b.getAttribute('data-val'),s=catState();
  switch(act){
    case 'cat-geo':
      if(!navigator.geolocation){alertMsg('Standort wird von diesem Browser nicht unterstützt. Bitte Ort eingeben.');return}
      s.geoBusy=true;render();
      navigator.geolocation.getCurrentPosition(pos=>{s.geoBusy=false;catSetOrigin({label:'Mein Standort (gerundet)',lat:Math.round(pos.coords.latitude*100)/100,lon:Math.round(pos.coords.longitude*100)/100})},
        err=>{s.geoBusy=false;render();alertMsg('Standort nicht verfügbar'+(err&&err.code===1?' (keine Freigabe)':'')+'. Bitte Ort eingeben oder aus der Liste wählen.')},{timeout:10000,maximumAge:600000});return;
    case 'cat-geo-search':catGeoSearch(($('#cat-q')||{}).value);return;
    case 'cat-pick':{const h=s.geoHits&&s.geoHits[+val];if(h)catSetOrigin(h);return}
    case 'cat-origin-clear':s.origin=null;catInvalidateSearch();catSavePrefs();render();return;
    case 'cat-range':{const r=CATX.RANGES.find(x=>x.id===val);if(r){s.range=r.id;s.minKm=r.min;s.maxKm=r.max;catInvalidateSearch();catSavePrefs();render()}return}
    case 'cat-preset':catPreset(val);catRenderProfile();return;
    case 'cat-profile-clear':catClearProfile();catRenderProfile();return;
    case 'cat-profile-undo':catUndoProfile();catRenderProfile();return;
    case 'cat-wish-remove':catDropWish(val);catRenderProfile();return;
    case 'cat-must-all':s.mustOnly=false;render();return;
    case 'cat-mood-mode':s.deckMode=val==='deck';render();return;
    case 'cat-deck-back':s.deckIndex=Math.max(0,(s.deckIndex||0)-1);render();return;
    case 'cat-vote':{const [kind,level]=String(val||'').split('|');if(catMoodKeys()[s.deckIndex||0]!==kind)return;catSetMood(kind,level);s.deckIndex=Math.min(catMoodKeys().length,(s.deckIndex||0)+1);render();const next=$('[data-act="cat-vote"]')||$('[data-act="cat-deck-back"]');if(next&&next.focus)next.focus();return}
    case 'cat-search':catSearch(false);return;
    case 'cat-surprise':catSearch(true);return;
    case 'cat-open':e.preventDefault();catOpen(val);return;
    case 'cat-fav':{const x=catFind(val),f=catFavs().find(q=>q.id===val);const p=x?x.place:f;if(p){catFavToggle(p);render()}return}
    case 'cat-fav-open':{const f=catFavs().find(q=>q.id===val);if(!f||!s.origin)return;catLoadPlace(f.id,f.lat,f.lon).then(()=>catOpen(f.id)).catch(err=>alertMsg(err.message));return}
    case 'cat-tour':{const x=catFind(val);if(!x)return;if(s.tour.some(q=>q.id===val))s.tour=s.tour.filter(q=>q.id!==val);else if(s.tour.length>=6){alertMsg('Höchstens 6 Ziele pro Rundreise.');return}else s.tour=s.tour.concat([x.place]);render();return}
    case 'cat-tour-clear':s.tour=[];render();return;
    case 'cat-cmp':{if(s.cmp.includes(val))s.cmp=s.cmp.filter(id=>id!==val);else if(s.cmp.length>=3){alertMsg('Höchstens 3 Ziele im Vergleich.');return}else if(catFind(val))s.cmp=s.cmp.concat([val]);render();return}
    case 'cat-cmp-clear':s.cmp=[];render();return;
    case 'cat-cmp-open':catCompareSheet();return;
    case 'cat-tour-open':catTourSheet();return;
    case 'cat-tour-create':catTourCreate();return;
    case 'cat-q-clear':s.q='';render();return;
    case 'cat-fav-export':{const l=catFavs();if(!l.length)return;downloadText(JSON.stringify(favExportData(l),null,2),'Reiseplaner-Merkliste-'+iso(todayUTC())+'.json','application/json');return}
    case 'cat-fav-import':{const f=$('#fav-file');if(f)f.click();return}
    case 'cat-fav-share':{const txt=favText(catFavs());(async()=>{try{if(navigator.share){await navigator.share({title:'Merkliste',text:txt});return}}catch(err){if(err&&err.name==='AbortError')return}try{await navigator.clipboard.writeText(txt);alertMsg('Merkliste als Text kopiert.')}catch(err){openSheet('<h2>Merkliste als Text</h2><div class="copybox">'+esc(txt)+'</div>')}})();return}
    case 'cat-find':catFindRun(($('#cat-find')||{}).value);return;
    case 'cat-open-id':catOpenById(val).catch(err=>alertMsg(err.message));return;
    case 'cat-share':{const u=catShareUrl(val);(async()=>{try{if(navigator.share){await navigator.share({title:'Reiseziel',url:u});return}}catch(err){if(err&&err.name==='AbortError')return}try{await navigator.clipboard.writeText(u);alertMsg('Link kopiert: '+u)}catch(err){alertMsg('Link: '+u)}})();return}
    case 'cat-month':{if(!s.res)return;catProfileChange({month:s.month===val?'':val});render();return}
    case 'cat-combo':{const ids=val.split('|');ids.forEach(id=>{const c=document.querySelector('[data-cs="'+id.replace(/"/g,'')+'"]');if(c)c.checked=true});s.combo=ids;document.querySelectorAll('[data-act="cat-combo"]').forEach(x=>{x.textContent=x===b?'✓ gewählt':'Diese Kombi';x.setAttribute('aria-pressed',x===b?'true':'false')});return}
    case 'cat-create':catCreate();return;
    case 'cat-add':catAdd();return;
    case 'cat-trip-ideas':{const t=cur();if(t)catTripIdeas(t);return}
    case 'cat-trip-add':{const t=cur();if(!t)return;const picked=catPicked();if(!picked.length){alertMsg('Keine Idee ausgewählt.');return}const r=catApply(t,picked.map(e=>Object.assign({},e,{kind:e.kind==='dest'?'dest':'near'})),nightsOf(t));save(t);closeSheet();render();alertMsg(r.acts+' Ideen hinzugefügt.');return}
  }
});
document.addEventListener('change',async e=>{
  const el=e.target;if(!CATX)return;
  if(el.id==='fav-file'&&el.files&&el.files[0]){const file=el.files[0];el.value='';
    try{if(file.size>200000)throw new Error('Die Datei ist zu groß für eine Merkliste.');const r=favMerge(catFavs(),JSON.parse(await file.text()));localStorage.setItem(CAT_FAV_KEY,JSON.stringify(r.list));render();alertMsg(r.added+' Ziel(e) übernommen'+(r.skipped?', '+r.skipped+' übersprungen (schon vorhanden, ungültig oder Liste voll)':'')+'.')}
    catch(err){alertMsg(err instanceof SyntaxError?'Die Datei ist keine gültige Merkliste.':err.message)}return}
  if(el.id==='cat-city'&&el.value!==''){const o=CATX.ORIGINS[+el.value];if(o)catSetOrigin(o);return}
  const kind=el.getAttribute&&el.getAttribute('data-profile-kind'),pf=el.getAttribute&&el.getAttribute('data-profile-field');
  if(kind){catSetMood(kind,el.value);render();const target=$('[data-profile-kind="'+kind+'"]');if(target&&target.focus)target.focus();return}
  if(pf){catProfileChange({[pf]:pf==='weatherSafe'?el.checked:el.value});render();const target=$('[data-profile-field="'+pf+'"]');if(target&&target.focus)target.focus();return}
  const f=el.getAttribute&&el.getAttribute('data-cf');if(!f)return;
  const s=catState();
  if(f==='mustOnly'){s.mustOnly=el.checked;render();const target=$('[data-cf="mustOnly"]');if(target&&target.focus)target.focus();return}
  if(f==='q'||f==='sort'){s[f]=f==='q'?String(el.value||'').slice(0,60):el.value;render();return}
  if(f==='minKm'||f==='maxKm'){const v=Math.max(0,Math.min(CATX.MAX_KM,Math.round(num(el.value,0))));s[f]=f==='maxKm'?Math.max(10,v):v;if(s.minKm>=s.maxKm){if(f==='minKm')s.maxKm=Math.min(CATX.MAX_KM,s.minKm+50);else s.minKm=Math.max(0,s.maxKm-50)}s.range=''}
  else if(f==='month'||f==='nights'){catProfileChange({[f]:el.value});render();const target=$('[data-cf="'+f+'"]');if(target&&target.focus)target.focus();return}
  catInvalidateSearch();catSavePrefs();render();
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&e.target.id==='cat-q'){e.preventDefault();catGeoSearch(e.target.value)}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target&&e.target.id==='cat-find'){e.preventDefault();catFindRun(e.target.value)}});
document.addEventListener('change',e=>{const el=e.target;if(!el.getAttribute||el.getAttribute('data-leg-n')==null)return;const t=cur();if(!t||!t.legs)return;
  const d=UI.legDraft&&UI.legDraft.trip===t.id?UI.legDraft:{trip:t.id,order:t.legs.map((_,i)=>i),nights:t.legs.map(l=>Math.max(1,Math.round(num(l.nights,1))))};
  d.nights[+el.getAttribute('data-leg-n')]=Math.max(1,Math.min(21,Math.round(num(el.value,1))));UI.legDraft=d;render()});
document.addEventListener('change',e=>{const el=e.target;if(!el.getAttribute||el.getAttribute('data-tn')==null)return;const s=catState(),i=+el.getAttribute('data-tn');if(s.tourNights&&s.tourNights[i]!=null){s.tourNights[i]=Math.max(1,Math.min(21,Math.round(num(el.value,1))));catTourSheet()}});

