/* Reiseplaner · Bewegung: Seitenwechsel, Blätter, Aufklappen.
   Teil 26 von 27 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen.

   Grundsätze:
   - Bewegung zeigt nur, woher etwas kommt und wohin es geht. Sie trägt nie allein eine Bedeutung.
   - Mit „Bewegung reduzieren“ (prefers-reduced-motion) passiert hier nichts; app.css schaltet zusätzlich alles ab.
   - Die Ansicht wird bei jeder Eingabe neu gezeichnet. Einblenden läuft deshalb nur bei einem echten Seitenwechsel
     (Klasse rp-enter an #view, gesetzt in go()), nie bei einem bloßen Neuzeichnen.
   - Daten, Speicherung und Berechnung werden hier weder gelesen noch geändert. */
"use strict";
const MOTION_ENTER_MS=620,MOTION_SHEET_MS=260;
function motionOk(){
 try{return typeof window!=='undefined'&&typeof window.matchMedia==='function'&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}
}
/* Richtung eines Seitenwechsels, rein rechnerisch (Node-prüfbar):
   fwd = tiefer hinein, back = zurück, fade = Nachbarteil derselben Reise, up = andere Hauptseite, none = gleiche Seite. */
function viewDirection(prev,next){
 prev=String(prev||'');next=String(next||'');
 if(prev===next)return 'none';
 if(!prev)return 'up';
 const trip=r=>{const m=/^r-([a-z0-9]+)(?:-([a-z]+))?$/.exec(r);return m?{id:m[1],tab:m[2]||''}:null};
 const a=trip(prev),b=trip(next);
 if(a&&b&&a.id===b.id){if(!a.tab&&b.tab)return 'fwd';if(a.tab&&!b.tab)return 'back';return 'fade'}
 if(b&&!a)return 'fwd';
 if(a&&!b)return next==='reisen'||next==='heute'||next==='erinnerungen'?'back':'up';
 if(next==='neu'||/^ziel-/.test(next))return 'fwd';
 if(prev==='neu'||/^ziel-/.test(prev))return 'back';
 return 'up';
}
let motionEnterTimer=0;
function viewEnter(prev,next){
 if(!motionOk()||typeof document==='undefined')return false;
 const v=document.querySelector('#view');
 if(!v||!v.classList||!v.setAttribute)return false;
 const dir=viewDirection(prev,next);
 clearTimeout(motionEnterTimer);
 v.classList.remove('rp-enter');
 if(dir==='none')return false;
 void v.offsetWidth; /* Neustart der Animation, wenn schnell hintereinander gewechselt wird */
 v.setAttribute('data-rp-dir',dir);v.classList.add('rp-enter');
 motionEnterTimer=setTimeout(()=>{v.classList.remove('rp-enter')},MOTION_ENTER_MS);
 return true;
}
/* Blatt: Einblenden nur beim ersten Öffnen, nicht wenn ein offenes Blatt seinen Inhalt wechselt. */
function sheetEnter(sheet,fresh){
 if(!fresh||!motionOk()||!sheet||!sheet.parentNode||!sheet.parentNode.classList)return false;
 sheet.parentNode.classList.add('sheet-in');return true;
}
/* Blatt schließen: Das echte Blatt wird wie bisher sofort entfernt (Fokus, Zustand und Prüfungen bleiben gleich).
   Für das Auge gleitet eine nicht bedienbare Kopie ohne Kennungen hinaus. */
function sheetLeave(){
 if(!motionOk()||typeof document==='undefined'||!document.body||!document.createElement)return false;
 const s=document.querySelector('#sheet-root .sheet');
 if(!s||!s.cloneNode||!s.getBoundingClientRect||typeof getComputedStyle!=='function')return false;
 try{
  const r=s.getBoundingClientRect(),cs=getComputedStyle(s),top=s.scrollTop;
  if(!r.width||!r.height)return false;
  const panel=s.cloneNode(true),strip=el=>{for(const a of Array.from(el.attributes||[])){const n=a.name;if(n==='id'||n==='name'||n==='for'||n==='role'||n==='tabindex'||n==='href'||n==='autofocus'||n.startsWith('data-')||n.startsWith('aria-'))el.removeAttribute(n)}};
  strip(panel);panel.querySelectorAll('*').forEach(strip);
  panel.className='sheet-out-panel';
  panel.style.cssText='left:'+r.left+'px;top:'+r.top+'px;width:'+r.width+'px;height:'+r.height+'px;padding:'+cs.padding+';gap:'+cs.gap+';background:'+cs.backgroundColor+';border-radius:'+cs.borderRadius;
  const ghost=document.createElement('div');
  ghost.className='sheet-out';ghost.setAttribute('aria-hidden','true');ghost.inert=true;
  ghost.appendChild(panel);document.body.appendChild(ghost);
  panel.scrollTop=top;
  const done=()=>{if(ghost.parentNode)ghost.parentNode.removeChild(ghost)};
  panel.addEventListener('animationend',e=>{if(e.target===panel)done()});
  setTimeout(done,MOTION_SHEET_MS+120);
  return true;
 }catch(e){return false}
}
/* Aufklappen von <details>: Der Inhalt blendet nur ein, wenn jemand selbst aufklappt (nicht beim Neuzeichnen offener Ebenen). */
function detailsOpened(summary){
 const d=summary&&summary.parentNode;
 if(!d||d.open||!d.classList||!motionOk())return false;
 const run=()=>{if(!d.open)return;d.classList.add('rp-opened');setTimeout(()=>d.classList.remove('rp-opened'),420)};
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);
 return true;
}
try{if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('click',e=>{
 const s=e.target&&e.target.closest&&e.target.closest('summary');if(s)detailsOpened(s);
})}catch(e){}
