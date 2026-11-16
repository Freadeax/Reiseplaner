/* Reiseplaner · Offline-Zustand und „Auf diesem Gerät“ (docs/OFFLINE.md §4.3, Paket O3).
   Teil der App (klassisches Skript, gemeinsamer Gültigkeitsbereich, lädt vor start.js). Liest nur Browser-Zustände
   (Service-Worker-Speicher, dauerhafter Speicher, Belegung); Reisedaten werden hier weder gelesen noch verändert.
   Ehrlich getrennt: auf diesem Gerät gespeichert ≠ ohne Netz startbar ≠ dauerhaft gespeichert ≠ online gespeichert. */
"use strict";
const Device={info:null,at:0,loading:false};
const OFFLINE_MISSING=['Ortssuche und Routenberechnung (die geschätzte Strecke bleibt)','Anmelden, Abgleich mit dem Konto, Einladungen','Karten- und Anbieterlinks, Buchungsseiten'];
function deviceIsIOS(){try{return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)}catch(e){return false}}
function deviceStandalone(){try{return !!((window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||navigator.standalone)}catch(e){return false}}
/* Alle Angaben einzeln abgesichert: Was der Browser nicht verrät, bleibt null (= unbekannt), nie „ja“. */
async function deviceRead(){
  const r={online:!(typeof navigator!=='undefined'&&navigator.onLine===false),http:typeof location!=='undefined'&&/^https?:$/.test(location.protocol),
    swApi:typeof navigator!=='undefined'&&!!navigator.serviceWorker,controlled:false,stand:null,ready:false,since:null,persisted:null,canPersist:false,usage:null,quota:null,
    ios:deviceIsIOS(),standalone:deviceStandalone()};
  try{r.controlled=!!(navigator.serviceWorker&&navigator.serviceWorker.controller)}catch(e){}
  try{if(typeof caches!=='undefined'){const k=(await caches.keys()).filter(x=>/^reiseplaner-(?!laufzeit)/.test(x));
    if(k.length){r.stand=k[0].slice('reiseplaner-'.length);const hit=await (await caches.open(k[0])).match('index.html');r.ready=!!hit;const d=hit&&hit.headers.get('date');if(d&&!isNaN(Date.parse(d)))r.since=new Date(d)}}}catch(e){}
  try{if(navigator.storage&&navigator.storage.persisted){r.persisted=await navigator.storage.persisted();r.canPersist=!!navigator.storage.persist}}catch(e){}
  try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();r.usage=e.usage;r.quota=e.quota}}catch(e){}
  return r;
}
function deviceRefresh(force){
  if(Device.loading||(!force&&Device.info&&Date.now()-Device.at<5000))return;
  Device.loading=true;
  deviceRead().then(r=>{Device.info=r;Device.at=Date.now()},()=>{}).finally(()=>{Device.loading=false;if(typeof UI!=='undefined'&&UI.view==='konto'&&typeof remoteChanged==='function')remoteChanged()});
}
function deviceMB(b){return b==null?'':(b/1048576).toLocaleString('de-DE',{maximumFractionDigits:b<10485760?1:0})+' MB'}
/* Abschnitt auf der Konto-Seite */
function deviceSection(){
  deviceRefresh(false);
  const i=Device.info,head='<section class="block" data-device><h2>Auf diesem Gerät</h2>';
  if(!i)return head+'<p class="small muted">Wird geprüft …</p></section>';
  const n=Store.list().length,pend=Store.isAccount()?Store.pending():0;
  const start=!i.http?'Nein: Die Seite ist als Datei geöffnet. Ohne Netz startbar ist sie nur über die Website-Adresse.'
    :!i.swApi?'Nein: Dieser Browser unterstützt das nicht.'
    :i.ready?'Ja'+(i.since?', App-Stand vom '+esc(i.since.toLocaleDateString('de-DE')):'')+(i.controlled?'':' (wirksam ab dem nächsten Öffnen)')
    :'Noch nicht: Einmal mit Internet öffnen und kurz warten.';
  const keep=i.persisted===true?'Ja, der Browser löscht die Daten nicht von sich aus.'
    :i.persisted===false?'Nein: Bei Platzmangel'+(i.ios&&!i.standalone?' oder nach 7 Tagen ohne Besuch':'')+' darf der Browser die Daten löschen.'
    :'Unbekannt (vom Browser nicht verraten).';
  return head+'<dl class="facts">'+
    '<dt>Verbindung</dt><dd>'+(i.online?'Online':'Offline')+'</dd>'+
    updAppLine()+
    '<dt>Ohne Internet startbar</dt><dd>'+start+'</dd>'+
    '<dt>Dauerhaft gespeichert</dt><dd>'+keep+'</dd>'+
    '<dt>Reisen in diesem Browser</dt><dd>'+n+(pend?' · '+pend+' Änderung'+(pend===1?'':'en')+' noch nicht online gespeichert':'')+'</dd>'+
    (i.usage!=null?'<dt>Belegt</dt><dd>'+deviceMB(i.usage)+(i.quota?' von etwa '+deviceMB(i.quota):'')+'</dd>':'')+
    '</dl>'+
    (i.http&&i.swApi?'<div class="row"><button type="button" class="btn ghost sm" data-offline-act="update-check">Nach neuer Version suchen</button>'+(AppUpdate.state==='Neue Version geladen'?'<button type="button" class="btn sm" data-offline-act="update-now">Neue Version jetzt laden</button>':'')+'</div>':'')+
    (i.persisted===false&&i.canPersist?'<div class="row"><button type="button" class="btn ghost sm" data-offline-act="persist">Dauerhaft speichern anfragen</button></div>':'')+
    (i.ios&&!i.standalone?'<div class="note"><b>Am iPhone oder iPad:</b><p>Über Teilen → „Zum Home-Bildschirm“ öffnet sich der Planer wie eine App. Sonst darf Safari die Reisen löschen, wenn ihr die Seite 7 Tage nicht öffnet.</p></div>':'')+
    '<p class="small"><b>Ohne Internet nicht verfügbar:</b> '+OFFLINE_MISSING.map(esc).join(' · ')+'. Reisemappe und Reisebuch lassen sich auch offline über „Drucken / PDF“ als PDF sichern.</p>'+
    '<p class="small muted">Auf diesem Gerät gespeichert ist keine Sicherung: Geht das Gerät verloren, sind nur die Reisen sicher, die online gespeichert oder als Datei gesichert sind.</p>'+
    '</section>';
}
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('click',e=>{
    const b=e.target&&e.target.closest&&e.target.closest('[data-offline-act]');if(!b)return;
    if(b.getAttribute('data-offline-act')==='persist'){
      Promise.resolve(navigator.storage&&navigator.storage.persist?navigator.storage.persist():false).then(ok=>{
        alertMsg(ok?'Der Browser speichert die Reisen jetzt dauerhaft.':'Der Browser hat dauerhaften Speicher nicht zugesagt. Häufiges Öffnen'+(deviceIsIOS()?' oder „Zum Home-Bildschirm“':'')+' hilft; sichert wichtige Reisen zusätzlich als Datei.');deviceRefresh(true)},()=>deviceRefresh(true));
    }
  });
}
if(typeof window!=='undefined'&&window.addEventListener){
  const changed=()=>{if(typeof setSync==='function')setSync();if(typeof UI!=='undefined'&&UI.view==='konto')deviceRefresh(true)};
  window.addEventListener('online',changed);window.addEventListener('offline',changed);
  /* Ohne Konto ruft der Start setSync nicht auf; offline geöffnet soll die Kopfzeile es trotzdem sagen */
  window.addEventListener('load',()=>{if(typeof navigator!=='undefined'&&navigator.onLine===false&&typeof setSync==='function')setSync()});
}
/* ===== Neue Version prüfen und laden (Wunsch Philipp 16.11., docs/OFFLINE.md §4.7) =====
   Der Service Worker installiert neue Stände selbst und vollständig; die geöffnete Seite läuft aber mit dem Code weiter,
   mit dem sie geladen wurde. Daher: Liegt ein neuerer vollständiger Stand bereit als der laufende, zeigt die App unten
   „Neue Version verfügbar – jetzt laden“. Prüfen beim Öffnen, beim Zurückkehren in die App (iPad/Handy bleiben oft
   tagelang offen) und alle 30 Minuten, dazu der Knopf „Nach neuer Version suchen“ unter „Auf diesem Gerät“. */
const AppUpdate={state:'',checkedAt:0,shown:false};
/* Versionen der laufenden Seite: ?v= aller eingebundenen Skripte und Stylesheets */
function updRunning(){const v={};try{document.querySelectorAll('script[src],link[rel="stylesheet"][href]').forEach(el=>{const u=new URL(el.src||el.href,location.href);if(u.origin===location.origin&&u.searchParams.has('v'))v[u.pathname]=u.searchParams.get('v')})}catch(e){}return v}
/* Bereitliegender Stand: index.html aus dem Speicher des aktiven Service Workers */
async function updReadyDiffers(){
  if(typeof caches==='undefined')return false;
  const k=(await caches.keys()).filter(x=>/^reiseplaner-(?!laufzeit)/.test(x));if(k.length!==1)return false;
  const hit=await (await caches.open(k[0])).match('index.html');if(!hit)return false;
  const run=updRunning(),html=await hit.text();if(!Object.keys(run).length)return false;
  for(const m of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="([^"#:]+?\.(?:js|css))\?v=([^"&#]+)"/g)){const p=new URL(m[1],location.href).pathname;if(run[p]!==m[2])return true}
  return false;
}
function updBanner(){
  if(AppUpdate.shown||typeof document==='undefined'||!document.body)return;AppUpdate.shown=true;
  const d=document.createElement('div');d.id='rp-update';d.className='note';d.setAttribute('role','status');
  d.style.cssText='position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));z-index:60;max-width:560px;margin:0 auto;box-shadow:0 6px 24px rgba(0,0,0,.18)';
  d.innerHTML='<b>Neue Version verfügbar</b><p class="small">Sie ist schon geladen und funktioniert auch ohne Internet. Eure Reisen bleiben erhalten.</p><div class="row"><button type="button" class="btn sm" data-offline-act="update-now">Jetzt laden</button><button type="button" class="btn ghost sm" data-offline-act="update-later">Später</button></div>';
  document.body.appendChild(d);
}
async function updCheck(manual){
  const sw=typeof navigator!=='undefined'&&navigator.serviceWorker;
  if(!sw||!/^https?:$/.test(location.protocol)){if(manual){AppUpdate.state='nicht möglich: Seite nicht über die Website-Adresse geöffnet';deviceRefresh(true)}return}
  if(manual&&navigator.onLine===false){AppUpdate.state='Ohne Internet nicht möglich';deviceRefresh(true);return}
  if(manual){AppUpdate.state='Suche …';deviceRefresh(true)}
  try{
    const reg=await sw.getRegistration();
    if(reg){await reg.update();
      const w=reg.installing||reg.waiting;
      /* Neuer Stand wird gerade vollständig geladen: abwarten (höchstens 60 s) */
      if(w)await new Promise(res=>{const t=setTimeout(res,60000);const f=()=>{if(w.state==='activated'||w.state==='redundant'){clearTimeout(t);res()}};w.addEventListener('statechange',f);f()});}
    const newer=await updReadyDiffers();
    AppUpdate.checkedAt=Date.now();AppUpdate.state=newer?'Neue Version geladen':'Ihr habt die neueste Version';
    if(newer)updBanner();
  }catch(e){AppUpdate.state='Prüfung fehlgeschlagen'+(navigator.onLine===false?' (offline)':'')}
  if(manual||AppUpdate.state==='Neue Version geladen')deviceRefresh(true);
}
function updAppLine(){return '<dt>App-Version</dt><dd>'+(AppUpdate.state?esc(AppUpdate.state)+(AppUpdate.checkedAt&&/neueste|geladen/.test(AppUpdate.state)?' (geprüft '+esc(new Date(AppUpdate.checkedAt).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'}))+')':''):'nicht geprüft')+'</dd>'}
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('click',e=>{
    const b=e.target&&e.target.closest&&e.target.closest('[data-offline-act]');if(!b)return;const a=b.getAttribute('data-offline-act');
    if(a==='update-check')updCheck(true);
    else if(a==='update-now'){const active=document.activeElement;if(active&&active.blur)active.blur();setTimeout(()=>location.reload(),50)}
    else if(a==='update-later'){const d=document.getElementById('rp-update');if(d)d.remove()}
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-AppUpdate.checkedAt>60000)updCheck(false)});
}
if(typeof window!=='undefined'&&window.addEventListener&&typeof navigator!=='undefined'&&navigator.serviceWorker){
  window.addEventListener('load',()=>{setTimeout(()=>updCheck(false),3000);setInterval(()=>{if(document.visibilityState!=='hidden')updCheck(false)},30*60000)});
  /* Neuer Stand übernimmt die Steuerung: prüfen, ob die laufende Seite älter ist */
  try{navigator.serviceWorker.addEventListener('controllerchange',()=>{updReadyDiffers().then(n=>{if(n){AppUpdate.state='Neue Version geladen';updBanner()}},()=>{})})}catch(e){}
}
