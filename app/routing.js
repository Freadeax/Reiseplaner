/* Reiseplaner · Zustand, Routing, Darstellung.
   Teil 9 von 17 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Zustand & Routing ================= */
const UI={view:'reisen',tid:null,tab:'ueber',fcat:'alle',ffree:false,findoor:false,fcard:false,fmissing:'',aq:'',aplanned:'',asort:'',checkFilter:'all',checkQuery:'',tripQuery:'',tripFilter:'all',tripSort:'next',pkgf:'alle',pkgfocus:'',sflt:{sauna:false,card:false,kitchen:false},confirm:null,draft:null};
const TABS=[['ueber','Überblick'],['suche','Reisefinder'],['angebote','Angebote'],['unterkunft','Ort & Unterkunft'],['unternehmen','Unternehmungen'],['plan','Tagesplan'],['kosten','Kosten'],['check','Checkliste'],['notiz','Notizen'],['mappe','Mappe']];
const AREA_GROUPS=[['Planen',['ueber','unternehmen']],['Buchen & Kosten',['suche','angebote','unterkunft','kosten']],['Unterwegs',['plan','check']],['Unterlagen',['notiz','mappe']]];
const MODULE_INFO={
 ueber:['Orientieren','Das Wichtigste und eure nächsten Schritte.'],
 suche:['Planen','Konkrete Angebote sammeln und unter gleichen Bedingungen vergleichen.'],
 angebote:['Planen','Reisevorlagen als Ausgangspunkt wählen. Preise sind Schätzwerte.'],
 unterkunft:['Planen','Ziel, Anreise und Unterkunft aufeinander abstimmen.'],
 unternehmen:['Planen','Passende Ideen sammeln, prüfen und in euren Tagesplan übernehmen.'],
 plan:['Planen','Termine, Wege und freie Zeit im Zusammenhang betrachten.'],
 kosten:['Organisieren','Planwerte, offene Kosten und erfasste Zahlungen nachvollziehen.'],
 check:['Organisieren','Buchungsaufgaben und Packpunkte im Blick behalten. Abhaken ist keine Buchung.'],
 notiz:['Organisieren','Gedanken und wichtige Angaben zu dieser Reise festhalten.'],
 mappe:['Unterwegs','Euren Plan kompakt mitnehmen, drucken oder als Kalender exportieren.']
};
function moduleGuide(t){
 const info=MODULE_INFO[UI.tab]||MODULE_INFO.ueber;
 if(UI.tab==='ueber'||UI.tab==='mappe')return '';
 return '<aside class="module-guide noprint" aria-label="Bereichsorientierung"><span class="eyebrow">'+info[0]+'</span><p>'+info[1]+'</p></aside>';
}
function areaPicker(t){return '<label class="area-picker noprint"><span>Bereich</span><select id="trip-area" aria-label="Reisebereich wählen">'+AREA_GROUPS.map(([group,keys])=>'<optgroup label="'+group+'">'+keys.map(key=>'<option value="'+key+'"'+(UI.tab===key?' selected':'')+'>'+TABS.find(x=>x[0]===key)[1]+'</option>').join('')+'</optgroup>').join('')+'</select></label>'}
function go(h,keepScroll){
  const previousTrip=UI.tid,after=UI.navAfter;UI.navAfter=null;UI.heuteTid=null;
  h=(h||'').replace(/^#/,'');
  if(h==='neu'){UI.view='neu';UI.draft=UI.draft||newTrip()}
  else if(h==='konto'){UI.view='konto'}
  else if(h==='entdecken'){UI.view='entdecken'}
  else if(h==='heute'||h==='erinnerungen'){UI.view=h}
  else if(/^ziel-[a-z0-9-]{2,40}$/.test(h)){UI.view='entdecken';UI.openZiel=h.slice(5)}
  else if(/^r-[a-z0-9]+-[a-z]+$/.test(h)){const [,id,tab]=h.split('-');if(Store.get(id)&&TABS.some(x=>x[0]===tab)){if(UI.tid!==id){UI.checkFilter='all';UI.checkQuery='';UI.aq='';UI.aplanned=''}UI.view='reise';UI.tid=id;UI.tab=tab;UI.pending=null}else{UI.view='reisen';UI.pending=h}}
  else {UI.view='reisen';if(/^r-/.test(h))UI.pending=h}
  if(previousTrip!==UI.tid)UI.planDay=0;
  if(after&&UI.view==='reise'&&Number.isInteger(after.day))UI.planDay=after.day;
  const target=UI.view==='reise'?'r-'+UI.tid+'-'+UI.tab:UI.openZiel?'ziel-'+UI.openZiel:UI.view;
  try{history.replaceState(null,'','#'+target)}catch(e){}
  closeSheet();render();if(!keepScroll)try{window.scrollTo(0,0)}catch(e){}
  if(after&&after.focus&&UI.view==='reise')navFocus(after.focus);
  if(UI.openZiel&&CATX){const z=UI.openZiel;UI.openZiel=null;catOpenById(z).catch(err=>alertMsg(err.message))}
}
/* In der Heute-Ansicht die Reise des angeklickten Heute-Blocks (UI.heuteTid, app/navigation.js) */
const cur=()=>UI.view==='reise'?Store.get(UI.tid):UI.view==='heute'&&UI.heuteTid?Store.get(UI.heuteTid):null;
function save(t,now){Store.put(t,now)}

const APPEARANCES={book:{name:'Reisebuch',description:'Warm und großzügig. Große Reisekarten und ruhige Bereiche.'},studio:{name:'Planungsstudio',description:'Klar und sachlich. Seitennavigation auf großen Bildschirmen.'},compact:{name:'Kompakt',description:'Weniger Abstand, schneller Überblick. Alle Funktionen bleiben da.'}};
function appearanceValue(value){return Object.prototype.hasOwnProperty.call(APPEARANCES,value)?value:'book'}
let appearance='book';
try{appearance=appearanceValue(localStorage.getItem('rp-appearance'))}catch(e){}
function applyAppearance(value,persist){
  appearance=appearanceValue(value);
  if(document.documentElement)document.documentElement.setAttribute('data-layout',appearance);
  const label=document.querySelector('[data-act="appearance-open"]');if(label)label.setAttribute('aria-label','Darstellung ändern, aktuell '+APPEARANCES[appearance].name);
  if(persist)try{localStorage.setItem('rp-appearance',appearance)}catch(e){alertMsg('Darstellung für jetzt geändert. Dieser Browser konnte die Auswahl nicht speichern.')}
  return appearance;
}
function appearanceSheet(){
 openSheet('<span class="eyebrow">So plant es sich für euch am besten</span><h2>Dein Planer. Dein Stil.</h2><p>Wähle eine Darstellung. Inhalte und Funktionen bleiben gleich. Hell und dunkel richten sich weiterhin nach deinem Gerät.</p><div class="design-choices">'+Object.entries(APPEARANCES).map(([key,x])=>'<button type="button" class="design-choice" data-act="appearance-set" data-val="'+key+'" aria-pressed="'+(appearance===key)+'"><span class="design-preview '+key+'" aria-hidden="true"><i></i><i></i><i></i></span><strong>'+x.name+'</strong><small>'+x.description+'</small><span class="choice-state">'+(appearance===key?'✓ Aktiv':'Auswählen')+'</span></button>').join('')+'</div><p class="small muted">Die Auswahl gilt nur in diesem Browser.</p>');
 const selected=document.querySelector('.design-choice[aria-pressed="true"]');if(selected)selected.focus();
}
applyAppearance(appearance,false);
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-act="appearance-open"],[data-act="appearance-set"]');if(!b)return;
 if(b.getAttribute('data-act')==='appearance-open'){appearanceSheet();return}
 applyAppearance(b.getAttribute('data-val'),true);appearanceSheet();
 const choice=document.querySelector('.design-choice[aria-pressed="true"]');if(choice)choice.focus();
});

