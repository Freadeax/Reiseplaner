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
  deviceRead().then(r=>{Device.info=r;Device.at=Date.now()},()=>{}).finally(()=>{Device.loading=false;if(typeof remoteChanged==='function'&&((typeof UI!=='undefined'&&UI.view==='konto')||(typeof document!=='undefined'&&document.querySelector&&document.querySelector('[data-ready]'))))remoteChanged()});
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
/* ===== „Für unterwegs bereit“ je Reise (docs/OFFLINE.md §4.4, Paket O4) und PDF-Hinweis (§4.6, O5) =====
   Prüft nur, was die App wirklich prüfen kann, und nennt den Rest als Aufgabe. Liest Reisedaten nur, schreibt nichts
   außer einem Merker, wann der Druckdialog der Mappe zuletzt geöffnet wurde (rp-mappe-druck:<Bereich>:<Reise>). */
const Ready={cache:{},loading:{}};
function readyPrintKey(t){return 'rp-mappe-druck:'+(typeof Store!=='undefined'?Store.scope:'guest')+':'+t.id}
function readyPrintedAt(t){try{const v=localStorage.getItem(readyPrintKey(t));return v&&!isNaN(Date.parse(v))?new Date(v):null}catch(e){return null}}
async function readyRead(t){
  const r={photos:null,photosLocal:null,docs:null,docFiles:null};
  const media=Array.isArray(t.media)?t.media:[];r.photos=media.length;
  if(media.length&&typeof window!=='undefined'&&window.RPPhotos){try{const s=typeof f4PhotoStore==='function'?f4PhotoStore():window.RPPhotos.create();let n=0;for(const m of media){try{const h=await s.has(m.id);if(h&&(h.work||h.thumb))n++}catch(e){}}r.photosLocal=n}catch(e){}}
  try{if(typeof untStore==='function'&&typeof UF==='function'&&UF()){const u=await untStore().usage(typeof untScope==='function'?untScope():Store.scope,t.id);r.docs=u.count;r.docFiles=u.files}}catch(e){}
  return r;
}
function readyRefresh(t){
  const id=t.id,c=Ready.cache[id];if(Ready.loading[id]||(c&&Date.now()-c.at<5000))return;
  Ready.loading[id]=true;deviceRefresh(false);
  readyRead(t).then(r=>{Ready.cache[id]={at:Date.now(),r}},()=>{}).finally(()=>{Ready.loading[id]=false;if(typeof UI!=='undefined'&&UI.view==='reise'&&typeof remoteChanged==='function')remoteChanged()});
}
/* Eine Zeile: Zeichen + Text, Bedeutung nie nur über Farbe */
function readyRow(state,label,text,btn){const sign=state==='ok'?'✓':state==='todo'?'!':'○',word=state==='ok'?'Erledigt: ':state==='todo'?'Zu tun: ':'Hinweis: ';
  return '<li class="ready-'+state+'"><span aria-hidden="true">'+sign+'</span> <span class="vh">'+word+'</span><b>'+esc(label)+'</b> · '+text+(btn||'')+'</li>'}
function readySection(t){
  if(!t)return '';readyRefresh(t);
  const i=Device.info,c=Ready.cache[t.id],r=c&&c.r,rows=[];
  if(!i||!r)return '<section class="block noprint" data-ready><h2>Für unterwegs bereit?</h2><p class="small muted">Wird geprüft …</p></section>';
  /* 1. App ohne Internet */
  rows.push(!i.http?readyRow('todo','App ohne Internet','als Datei geöffnet, startet ohne Netz nicht. Über die Website-Adresse öffnen.')
    :i.ready?readyRow('ok','App ohne Internet','startet auch ohne Netz'+(i.since?' (Stand vom '+esc(i.since.toLocaleDateString('de-DE'))+')':'')+'.')
    :readyRow('todo','App ohne Internet','noch nicht bereit. Einmal mit Internet öffnen und kurz warten.'));
  /* 2. Daten bleiben erhalten */
  rows.push(i.persisted===true?readyRow('ok','Speicher','der Browser löscht die Reisen nicht von sich aus.')
    :readyRow('todo','Speicher',(i.ios&&!i.standalone?'am iPhone/iPad über Teilen → „Zum Home-Bildschirm“ öffnen, sonst darf Safari nach 7 Tagen ohne Besuch löschen.':'nicht dauerhaft zugesagt.'),i.persisted===false&&i.canPersist?' <button type="button" class="btn ghost sm" data-offline-act="persist">Dauerhaft speichern anfragen</button>':''));
  /* 3. Stand dieser Reise */
  if(Store.isAccount()){const q=Store.queue&&Store.queue[t.id],m=Store.meta&&Store.meta[t.id]||{};
    rows.push(m.conflict||m.lost||m.unreadable?readyRow('todo','Abgleich','Konflikt bei dieser Reise, bitte vor der Abfahrt klären.')
      :q?readyRow('todo','Abgleich','Änderungen nur auf diesem Gerät. Vor der Abfahrt mit Internet synchronisieren, damit Mitreisende sie haben.',' <button type="button" class="btn ghost sm" data-acc="sync">Jetzt synchronisieren</button>')
      :readyRow('ok','Abgleich','online gespeichert, auf diesem Gerät aktuell'+(Sync.last?' (Stand '+esc(new Date(Sync.last).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))+')':'')+'. Änderungen anderer nach diesem Zeitpunkt seht ihr erst mit Netz.'))}
  else rows.push(readyRow('info','Sicherung','die Reise liegt nur in diesem Browser. Eine Sicherungsdatei hilft, falls das Gerät verloren geht.',' <button type="button" class="btn ghost sm" data-act="backup-trip">Reise als Datei sichern</button>'));
  /* 4. Fotos und Tickets dieser Reise */
  if(r.photos)rows.push(r.photosLocal==null?readyRow('info','Fotos',r.photos+' in der Reise; ob alle Bilddateien hier liegen, ließ sich nicht prüfen.')
    :r.photosLocal>=r.photos?readyRow('ok','Fotos','alle '+r.photos+' auf diesem Gerät.')
    :readyRow('todo','Fotos',r.photosLocal+' von '+r.photos+' auf diesem Gerät. Die übrigen liegen auf einem anderen Gerät.'));
  if(r.docs!=null)rows.push(r.docs?readyRow('ok','Tickets und Unterlagen',r.docs+' auf diesem Gerät'+(r.docFiles<r.docs?' ('+(r.docs-r.docFiles)+' ohne Datei, nur als Eintrag)':'')+'. Sie liegen nur hier, nicht im Konto.')
    :readyRow('info','Tickets und Unterlagen','noch keine auf diesem Gerät. Tickets und Bestätigungen unter „Tickets“ ablegen, dann sind sie offline da.',' <button type="button" class="btn ghost sm" data-go="r-'+esc(t.id)+'-buchungen">Zu den Tickets</button>'));
  /* 5. PDF (nicht prüfbar, nur Erinnerung) */
  const pr=readyPrintedAt(t);
  rows.push(readyRow(pr?'info':'todo','Reisemappe als PDF',(pr?'Druckdialog zuletzt am '+esc(pr.toLocaleDateString('de-DE'))+' geöffnet. Ob das PDF gespeichert wurde, kann die App nicht sehen.':'als Rückfall ohne App: einmal als PDF sichern.'),' <button type="button" class="btn ghost sm" data-act="mappe-print">Drucken / PDF</button>'));
  const todo=rows.filter(x=>x.startsWith('<li class="ready-todo"')).length;
  return '<section class="block noprint" data-ready><h2>Für unterwegs bereit?</h2>'+
    '<p class="small">'+(todo?todo+' Punkt'+(todo===1?'':'e')+' noch offen.':'Alles, was die App prüfen kann, ist bereit.')+' Ohne Internet gehen Ortssuche, Routen, Abgleich und Anbieterlinks nicht.</p>'+
    '<ul class="plain ready-list" style="list-style:none;padding-left:0;display:grid;gap:10px">'+rows.join('')+'</ul>'+
    '<p class="small muted">PDF am iPhone oder iPad: „Drucken / PDF“ tippen, im Druckmenü oben auf Teilen tippen und „In Dateien sichern“ wählen. Am Computer im Druckdialog „Als PDF speichern“ als Drucker wählen.</p>'+
    '</section>';
}
if(typeof document!=='undefined'&&document.addEventListener){
  /* Merker beim Öffnen des Druckdialogs der Mappe (läuft vor dem Klick-Verteiler der App nicht nötig: eigener Zuhörer) */
  document.addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('[data-act="mappe-print"]');if(!b)return;const t=typeof cur==='function'?cur():null;if(!t)return;try{localStorage.setItem(readyPrintKey(t),new Date().toISOString())}catch(err){}if(Ready.cache[t.id])Ready.cache[t.id].at=0;setTimeout(()=>readyRefresh(t),300)},true);
}
