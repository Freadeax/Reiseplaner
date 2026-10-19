/* Reiseplaner · Reisebereiche am Handy als Unterseiten mit Zurück (Paket 4, PLAN_IOS_APP §4.2 Abs. 2).
   Eigener Teil der App, geladen nach app/routing.js und vor app/ansichten.js. Klassisches Skript ohne Bundler: Alle Teile teilen sich den
   globalen Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen.
   Kein neues Speicherfeld; rp-trips bleibt unverändert. Nur Adresse (#…), Verlauf (history.state) und Darstellung.
   Bis 760 px Breite (wie die Tab-Leiste in app.css):
   - #r-<id>        Übersichtsseite der Reise: Kopf und die zehn Bereiche in vier Gruppen als Liste.
   - #r-<id>-<tab>  Unterseite eines Bereichs mit Zurück-Knopf. Bestehende Links behalten ihre Form.
   - Tiefer gehen legt einen Verlaufseintrag an (pushState). Browser-Zurück, Android-Zurück und die iOS-Wischgeste in Safari
     führen dadurch eine Ebene zurück. Für die Startbildschirm-App und die iOS-App ohne Safari-Geste gibt es eine Randwisch-Erkennung.
   Ab 761 px bleibt alles wie bisher: #r-<id> wird zu #r-<id>-ueber, jeder Wechsel ersetzt den Verlaufseintrag (replaceState).
   Teil 1 (rein, ohne DOM) ist in tests/unterseiten.cjs geprüft; Teil 2 bindet ihn an Verlauf, Fokus und Gesten. */
"use strict";
const SUB_MEDIA='screen and (max-width:760px)';
const SUB_LEVEL0=['reisen','neu','entdecken','heute','erinnerungen','konto'];
const SUB_BACK_LABEL={reisen:'Reisen',neu:'Neue Reise',entdecken:'Entdecken',heute:'Heute',erinnerungen:'Erinnerungen',konto:'Konto'};

/* ---------- Teil 1: reine Logik ---------- */
function subTabs(){return typeof TABS!=='undefined'?TABS:[]}
function subGroups(){return typeof AREA_GROUPS!=='undefined'?AREA_GROUPS:[]}
function subEsc(s){return typeof esc==='function'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function subTabLabel(key){const x=subTabs().find(tab=>tab[0]===key);return x?x[1]:''}
/* Adresse zerlegen. depth: 0 Hauptansicht, 1 Übersicht einer Reise, 2 Bereich einer Reise. Unbekannte Bereiche sind nicht gültig (valid:false). */
function subParse(route){
 const h=String(route||'').replace(/^#/,'');let m;
 if((m=/^r-([a-z0-9]+)$/.exec(h)))return {route:h,view:'reise',tid:m[1],tab:null,depth:1,valid:true};
 if((m=/^r-([a-z0-9]+)-([a-z]+)$/.exec(h)))return {route:h,view:'reise',tid:m[1],tab:m[2],depth:2,valid:subTabs().some(x=>x[0]===m[2])};
 if(/^ziel-[a-z0-9-]{2,40}$/.test(h))return {route:h,view:'entdecken',tid:null,tab:null,depth:0,valid:true};
 return {route:h,view:SUB_LEVEL0.includes(h)?h:'reisen',tid:null,tab:null,depth:0,valid:SUB_LEVEL0.includes(h)};
}
function subRoute(tid,tab){return 'r-'+tid+(tab?'-'+tab:'')}
function subDepth(route){return subParse(route).depth}
/* Am Desktop gibt es keine eigene Übersichtsseite: #r-<id> öffnet wie bisher den Überblick. */
function subResolve(route,mobile){const p=subParse(route);return !mobile&&p.depth===1?subRoute(p.tid,'ueber'):p.route}
/* Eine Ebene höher, unabhängig vom Verlauf. */
function subParent(route){const p=subParse(route);return p.depth===2?subRoute(p.tid):p.depth===1?'reisen':null}
/* Verlaufsart beim Wechsel von from nach to:
   'keep'    Zurück/Vor im Browser oder Adresse geändert: nur Adresse bestätigen, Zustand des Eintrags behalten.
   'push'    Handy, tiefer oder seitlich zwischen zwei Bereichen: neuer Verlaufseintrag, Zurück führt nach from.
   'replace' sonst, also immer am Desktop (wie bisher), beim ersten Aufruf, nach oben und zwischen Hauptansichten. */
function subNavMode(from,to,opts){
 const o=opts||{};if(o.pop)return 'keep';
 if(!o.mobile||!from||from===to)return 'replace';
 const a=subParse(from),b=subParse(to);
 if(b.depth>a.depth)return 'push';
 if(a.depth===2&&b.depth===2)return 'push';
 return 'replace';
}
function subPushState(from,to){return {rp:'sub',back:from,depth:subDepth(to)}}
/* Einträge für 'push'. Springt man von außerhalb der Reise direkt in einen Bereich (Heute, Erinnerungen, Vorlage, Kopie),
   liegt die Übersichtsseite dazwischen: Zurück führt wie überall zu „Bereiche“, ein zweites Zurück dorthin, woher man kam. */
function subPushChain(from,to){
 const a=subParse(from),b=subParse(to);
 const chain=b.depth===2&&!(a.depth>=1&&a.tid===b.tid)?[subRoute(b.tid),b.route]:[b.route];
 return chain.map((r,i)=>({route:r,state:subPushState(i?chain[i-1]:from,r)}));
}
/* Zurück: Hat die App den Eintrag selbst angelegt, geht es per history.back() dorthin, woher man kam (wie die Wischgeste).
   Sonst (direkter Link, neu geladen am Desktop, Breite gewechselt) eine Ebene höher, ohne die App zu verlassen. */
function subBack(route,state){
 const s=state&&typeof state==='object'&&state.rp==='sub'&&typeof state.back==='string'&&state.back?state:null;
 if(s)return {kind:'history',target:s.back,label:subBackLabel(s.back)};
 const up=subParent(route);
 return up?{kind:'go',target:up,label:subBackLabel(up)}:{kind:'none',target:null,label:''};
}
/* Beschriftung wie bei iOS: das Ziel des Zurück-Knopfs. */
function subBackLabel(route){
 const p=subParse(route);
 if(p.depth===1)return 'Bereiche';
 if(p.depth===2)return subTabLabel(p.tab)||'Zurück';
 if(p.view==='entdecken')return 'Entdecken';
 return p.valid&&SUB_BACK_LABEL[p.route]||'Zurück';
}
/* Startet die App direkt auf einer Unterseite (Link, Lesezeichen), legt seed die Ebenen darüber in den Verlauf,
   damit Zurück und Wischgeste in der App bleiben. Ein bereits markierter Eintrag (neu geladen) bleibt unverändert. */
function subSeed(route,state,mobile){
 const p=subParse(route);
 if(!mobile||p.depth===0||(state&&state.rp==='sub'))return [];
 const chain=['reisen'];if(p.depth===2)chain.push(subRoute(p.tid));chain.push(p.route);
 return chain.map((r,i)=>i===0?{op:'replace',route:r,state:null}:{op:'push',route:r,state:subPushState(chain[i-1],r)});
}
/* Fokus nach dem Wechsel: Überschrift der neuen Unterseite, nach dem Zurück die Zeile des verlassenen Bereichs. */
function subFocus(from,to,mobile){
 if(!mobile||from===to)return null;
 const a=subParse(from),b=subParse(to);
 if(b.depth===2)return '#sub-title';
 if(b.depth===1&&a.depth===2&&a.tid===b.tid)return '[data-sub-area="'+a.tab+'"]|#sub-title';
 if(b.depth===1)return '#sub-title';
 return null;
}
/* Kennzahl je Bereich, wie bisher in der Tab-Reihe: Termine im Tagesplan, erledigte Punkte der Checkliste. */
function subCount(t,key){
 if(key==='plan'){const n=(t&&t.items||[]).length;return n===1?'1 Termin':n+' Termine'}
 if(key==='check'&&typeof checklist==='function'){let all=0,done=0;checklist(t).forEach(g=>g[1].forEach(i=>{all++;if(t.check&&t.check[i[0]])done++}));return done+' von '+all+' erledigt'}
 return '';
}
function subAreas(t){
 const info=typeof MODULE_INFO!=='undefined'?MODULE_INFO:{};
 return subGroups().map(([group,keys])=>({group,items:keys.filter(k=>subTabLabel(k)).map(key=>({key,label:subTabLabel(key),hint:info[key]?info[key][1]:'',count:subCount(t,key),route:subRoute(t.id,key)}))}));
}
function subListHtml(t){
 return '<nav class="sub-areas noprint" aria-label="Bereiche dieser Reise">'+subAreas(t).map((g,i)=>'<section class="block sub-group"><h2 class="sub-group-title" id="sub-g'+i+'">'+subEsc(g.group)+'</h2><ul class="sub-list" aria-labelledby="sub-g'+i+'">'+
  g.items.map(x=>'<li><button type="button" class="sub-row" data-go="'+subEsc(x.route)+'" data-sub-area="'+subEsc(x.key)+'"><span class="sub-row-txt"><b>'+subEsc(x.label)+'</b>'+(x.hint?'<small>'+subEsc(x.hint)+'</small>':'')+'</span>'+(x.count?'<span class="badge sub-count">'+subEsc(x.count)+'</span>':'')+'<span class="sub-chev" aria-hidden="true">›</span></button></li>').join('')+
  '</ul></section>').join('')+'</nav>';
}
/* Kopf einer Unterseite: Zurück (Ziel als Text, nicht nur Pfeil), Reisename, Bereich als Hauptüberschrift. */
function subHeadHtml(t,tab,back){
 const b=back||{kind:'none',label:''};
 return '<section class="block sub-head'+(tab==='mappe'?' noprint':'')+'">'+
  (b.kind!=='none'?'<div class="sub-bar noprint"><button type="button" class="lnk sub-back" data-sub-back aria-label="Zurück zu '+subEsc(b.label)+'"><span aria-hidden="true">‹</span> '+subEsc(b.label)+'</button></div>':'')+
  '<span class="eyebrow">'+subEsc(t.title)+'</span><h1 id="sub-title" tabindex="-1">'+subEsc(subTabLabel(tab))+'</h1></section>';
}
/* Randwischen nach rechts als Zurück, nur wo Safari es nicht selbst kann (Startbildschirm-App, iOS-App).
   Beginn höchstens 24 px vom linken Rand, überwiegend waagrecht, weit genug oder schnell genug. */
function subSwipeDecision(g){
 const dx=g.x1-g.x0,dy=Math.abs(g.y1-g.y0),dt=g.dt;
 if(!(g.x0<=24)||!(dx>0)||dy>dx*0.5||!(dt>=0)||dt>800)return 'none';
 const far=Math.max(80,(g.width||0)*0.25);
 return dx>=far||(dx>=40&&dt<=250)?'back':'none';
}
function subSwipeHost(env){
 const e=env||{};
 if(e.capacitorPlatform==='ios')return true; /* WKWebView der App: Vor/Zurück-Geste ist dort standardmäßig aus */
 if(e.capacitorPlatform)return false;          /* Android: Zurück-Taste nutzt den Verlauf */
 return !!e.standalone;                        /* Safari hat die eigene Geste; nur die Startbildschirm-App nicht */
}

/* ---------- Teil 2: Anbindung an Verlauf, Fokus und Gesten ---------- */
/* Beim Drucken gilt die Bildschirmregel nicht; dann bleibt die zuletzt gezeichnete Form, damit Drucken nichts umschaltet. */
let subLastMobile=false;
function subPrinting(){try{return typeof matchMedia==='function'&&matchMedia('print').matches}catch(e){return false}}
function subMobile(){
 if(subPrinting())return subLastMobile;
 try{subLastMobile=typeof matchMedia==='function'&&matchMedia(SUB_MEDIA).matches}catch(e){subLastMobile=false}
 return subLastMobile;
}
function subEnv(){
 const env={standalone:false,capacitorPlatform:''};
 try{if(typeof navigator!=='undefined'&&navigator.standalone===true)env.standalone=true}catch(e){}
 try{if(typeof matchMedia==='function'&&matchMedia('(display-mode: standalone)').matches)env.standalone=true}catch(e){}
 try{const C=typeof window!=='undefined'&&window.Capacitor;if(C&&typeof C.getPlatform==='function'&&C.getPlatform()!=='web')env.capacitorPlatform=C.getPlatform()}catch(e){}
 return env;
}
function subHistoryState(){try{return typeof history!=='undefined'?history.state:null}catch(e){return null}}
/* Schreibt den Wechsel in den Verlauf. Vor dem Hineingehen merkt sich der alte Eintrag die Scrollposition. */
function subHistoryApply(from,to,opts){
 const o=opts||{};if(typeof UI!=='undefined')UI.subWide=false;if(typeof history==='undefined')return 'none';
 const mode=subNavMode(from,to,o);
 try{
  /* Erster Aufruf oder gerade angelegt (aus „Neue Reise“): Ebenen darüber vorbefüllen, das Formular fällt aus dem Verlauf */
  if((!from||from==='neu')&&!o.pop){const seed=subSeed(to,from?null:history.state,o.mobile);if(seed.length){seed.forEach(s=>history[s.op==='push'?'pushState':'replaceState'](s.state,'','#'+s.route));return 'seed'}}
  if(mode==='push'){
   const y=typeof window!=='undefined'&&typeof window.scrollY==='number'?window.scrollY:0;
   history.replaceState(Object.assign({},history.state||{},{rpScroll:y}),'');
   subPushChain(from,to).forEach(x=>history.pushState(x.state,'','#'+x.route));
  }else history.replaceState(mode==='keep'||from===to?history.state:null,'','#'+to); /* neu zeichnen behält die Herkunft */
 }catch(e){}
 return mode;
}
/* Nach Zurück die gemerkte Scrollposition wiederherstellen. Liefert true, wenn gescrollt wurde. */
function subScrollRestore(){
 const s=subHistoryState();
 if(s&&typeof s.rpScroll==='number'){try{window.scrollTo(0,s.rpScroll);return true}catch(e){}}
 return false;
}
function subFocusApply(selectors,keepScroll){
 for(const s of String(selectors||'').split('|')){
  const el=s&&typeof document!=='undefined'&&document.querySelector(s);if(!el)continue;
  try{el.focus({preventScroll:!!keepScroll})}catch(e){}
  if(!keepScroll)try{el.scrollIntoView({block:'nearest'})}catch(e){}
  if(document.activeElement===el)return el;
 }
 return null;
}
function subBackRun(){
 const b=subBack(UI.route||'',subHistoryState());
 if(b.kind==='history'){try{history.back();return b}catch(e){}}
 if(b.target)go(b.target);
 return b;
}
let subTouch=null;
function subSwipeActive(){
 if(typeof UI==='undefined'||UI.view!=='reise'||!subMobile()||!subSwipeHost(subEnv()))return false;
 return !(typeof document!=='undefined'&&document.querySelector&&document.querySelector('.sheet-bg'));
}
if(typeof document!=='undefined'&&document.addEventListener){
 document.addEventListener('click',e=>{
  const b=e.target&&e.target.closest&&e.target.closest('[data-sub-back]');if(!b)return;
  e.preventDefault();e.stopPropagation();subBackRun();
 },true);
 document.addEventListener('touchstart',e=>{
  subTouch=null;if(!e.touches||e.touches.length!==1||!subSwipeActive())return;
  const p=e.touches[0];subTouch={x0:p.clientX,y0:p.clientY,t0:Date.now()};
 },{passive:true});
 document.addEventListener('touchend',e=>{
  const s=subTouch;subTouch=null;if(!s||!e.changedTouches||!e.changedTouches[0])return;
  const p=e.changedTouches[0],w=typeof window!=='undefined'?window.innerWidth:0;
  if(subSwipeDecision({x0:s.x0,y0:s.y0,x1:p.clientX,y1:p.clientY,dt:Date.now()-s.t0,width:w})==='back')subBackRun();
 },{passive:true});
 document.addEventListener('touchcancel',()=>{subTouch=null},{passive:true});
}
/* Breite über 760 px hinaus geändert (Handy quer, Fenster): Die Übersichtsseite gibt es breit nicht, dort steht der Überblick.
   Adresse und Verlauf bleiben dabei unverändert (UI.subWide), damit Zurückdrehen wieder die Übersichtsseite zeigt. */
function subWidthChange(mobile){
 if(typeof UI==='undefined'||UI.view!=='reise'||subPrinting())return 'none';
 if(!mobile&&UI.tab==null){UI.tab='ueber';UI.subWide=true}
 else if(mobile&&UI.subWide){UI.tab=null;UI.subWide=false}
 render();return UI.subWide?'wide':'render';
}
try{
 if(typeof matchMedia==='function'){
  const mq=matchMedia(SUB_MEDIA),onChange=()=>subWidthChange(mq.matches);
  if(mq.addEventListener)mq.addEventListener('change',onChange);else if(mq.addListener)mq.addListener(onChange);
 }
}catch(e){}
