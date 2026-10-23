/* Reiseplaner · Aufbau einer Reise: fünf Bereiche statt zehn gleichrangiger Reiter (pakete/aufbau/KONZEPT.md §5).
   Eigener Teil der App, geladen nach app/routing.js und vor app/unterseiten.js. Klassisches Skript ohne Bundler: Alle Teile teilen sich den
   globalen Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen.
   Kein neues Speicherfeld; rp-trips bleibt unverändert. Alle Adressen #r-<id>-<teil> bleiben gültig, ein Teil ist weiterhin ein TABS-Schlüssel.
   - BEREICHE: einzige Quelle für Reihenfolge, Namen und Beschreibung. AREA_GROUPS (Auswahlfeld) wird daraus abgeleitet.
   - Ein Bereich mit mehreren Teilen zeigt oben eine Teilleiste (aufbauTeile). Der Wechsel zwischen Teilen ersetzt den Verlaufseintrag.
   - aufbauZiel(t,key): welcher Teil beim Öffnen eines Bereichs erscheint (zuletzt benutzter Teil dieser Sitzung, sonst sinnvoller Start).
     vReise (app/ansichten.js) merkt den angezeigten Teil über aufbauMerken. */
"use strict";
const BEREICHE=[
 {key:'ueber',label:'Überblick',hint:'Wo ihr steht und was als Nächstes dran ist.',parts:['ueber']},
 {key:'ziel',label:'Ziel & Unterkunft',hint:'Ort, Anreise und Unterkunft wählen, Angebote vergleichen.',parts:['unterkunft','suche','angebote']},
 {key:'programm',label:'Programm',hint:'Ideen sammeln und auf die Reisetage verteilen.',parts:['unternehmen','plan']},
 {key:'kosten',label:'Kosten',hint:'Gesamtkosten, Budget, offene Angaben und Zahlungen.',parts:['kosten']},
 {key:'unterlagen',label:'Unterlagen',hint:'Checkliste, Notizen und die Mappe zum Mitnehmen.',parts:['check','notiz','mappe']}
];
/* Namen der Teile. Bisher „Reisefinder“ (Angebotsvergleich) und „Angebote“ (Pakete) waren leicht zu verwechseln. */
const TEIL_NAMEN={ueber:'Überblick',unterkunft:'Ort & Unterkunft',suche:'Angebote vergleichen',angebote:'Pakete',unternehmen:'Ideen',plan:'Tagesplan',kosten:'Kosten',check:'Checkliste',notiz:'Notizen',mappe:'Mappe'};
TABS.forEach(x=>{if(TEIL_NAMEN[x[0]])x[1]=TEIL_NAMEN[x[0]]});
AREA_GROUPS.splice(0,AREA_GROUPS.length,...BEREICHE.map(b=>[b.label,b.parts.slice()]));
if(typeof MODULE_INFO!=='undefined'){
 MODULE_INFO.suche=['Ziel & Unterkunft','Konkrete Angebote sammeln und unter gleichen Bedingungen vergleichen.'];
 MODULE_INFO.angebote=['Ziel & Unterkunft','Fertige Pakete als Ausgangspunkt übernehmen. Preise sind Schätzwerte.'];
 MODULE_INFO.unternehmen=['Programm','Passende Ideen sammeln, prüfen und in euren Tagesplan übernehmen.'];
}

function aufbauEsc(s){return typeof esc==='function'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function aufbauTeilName(tab){return TEIL_NAMEN[tab]||((TABS.find(x=>x[0]===tab)||[])[1])||''}
/* Bereich zu einem Teil; unbekannte Teile gehören zum Überblick. */
function aufbauBereich(tab){return BEREICHE.find(b=>b.parts.includes(tab))||BEREICHE[0]}
/* Gleicher Bereich derselben Reise: Wechsel über die Teilleiste. */
function aufbauNachbarn(tabA,tabB){return !!tabA&&!!tabB&&tabA!==tabB&&aufbauBereich(tabA)===aufbauBereich(tabB)}

/* Zuletzt benutzter Teil je Reise und Bereich, nur für diese Sitzung (kein Speicher). */
const aufbauZuletzt={};
function aufbauMerken(tid,tab){if(tid&&tab)aufbauZuletzt[tid+':'+aufbauBereich(tab).key]=tab}
function aufbauZiel(t,key){
 const b=BEREICHE.find(x=>x.key===key)||BEREICHE[0],last=t&&aufbauZuletzt[t.id+':'+b.key];
 if(last&&b.parts.includes(last))return last;
 /* Programm: ohne eingeplante Termine erst Ideen sammeln, sonst direkt in den Tagesplan */
 if(b.key==='programm')return t&&(t.items||[]).length?'plan':'unternehmen';
 return b.parts[0];
}

/* Kurzer Stand je Bereich, in Worten (nicht nur Zahl oder Farbe). */
function aufbauStand(t,key){
 if(!t)return '';
 if(key==='programm'){const n=(t.items||[]).length;return n===1?'1 Termin':n+' Termine'}
 if(key==='unterlagen'&&typeof checklist==='function'){let all=0,done=0;checklist(t).forEach(g=>g[1].forEach(i=>{all++;if(t.check&&t.check[i[0]])done++}));return done+' von '+all+' erledigt'}
 if(key==='kosten'&&typeof openCosts==='function'){const n=openCosts(t).length;return n?(n===1?'1 Angabe offen':n+' Angaben offen'):''}
 if(key==='ziel'){const st=typeof stayOf==='function'?stayOf(t):null,pl=typeof placeOf==='function'?placeOf(t):null;return st?st.name:pl?pl.name:String(t.dest||'').trim()?'':'Ziel offen'}
 return '';
}

/* Teilleiste oben im Bereich. Nur bei mehreren Teilen; jeder Teil bleibt ein normaler Link (#r-<id>-<teil>). */
function aufbauTeile(t,tab){
 const b=aufbauBereich(tab);if(!t||b.parts.length<2)return '';
 return '<nav class="seg-bar noprint" aria-label="Teile von '+aufbauEsc(b.label)+'">'+b.parts.map(p=>'<button type="button" class="seg" data-go="r-'+aufbauEsc(t.id)+'-'+p+'" data-seg="'+p+'"'+(p===tab?' aria-current="page"':'')+'>'+aufbauEsc(aufbauTeilName(p))+'</button>').join('')+'</nav>';
}
/* Bereichsleiste am Desktop: fünf Einträge, der aktive Bereich ist markiert. */
function aufbauLeiste(t,tab){
 return '<div class="tab-links">'+BEREICHE.map(b=>{const n=aufbauStand(t,b.key),on=b.parts.includes(tab);
  return '<button type="button" class="tab" data-go="r-'+aufbauEsc(t.id)+'-'+(on?tab:aufbauZiel(t,b.key))+'" data-bereich="'+b.key+'" data-sub-parts="'+b.parts.join(' ')+'"'+(on?' aria-current="page"':'')+'>'+aufbauEsc(b.label)+(n&&b.key!=='ziel'?'<span class="n">'+aufbauEsc(n)+'</span>':'')+'</button>'}).join('')+'</div>';
}

/* ---------- Überblick: eine Liste „Als Nächstes“ (KONZEPT §6, Paket A2) ----------
   Führt vier bisher getrennte Blöcke zusammen: Fristen bis zur Abreise (deadlines aus app/fristen.js, sonst departurePlan),
   „Was jetzt sinnvoll ist“ (planningNextSteps), Plan-Check (checks) und offene Buchungsaufgaben der Checkliste.
   Reine Ableitung, ändert nichts an der Reise. Rang: kleiner ist dringender. Warnungen werden nie in den aufgeklappten Rest verschoben. */
function aufbauNorm(s){return String(s||'').toLocaleLowerCase('de').replace(/\s+/g,' ').trim()}
function aufbauFristen(t,now){
 const ph=typeof tripPhase==='function'?tripPhase(t,now):null;if(!ph||ph.phase!=='vor')return [];
 if(typeof deadlines==='function'){
  return (deadlines(t,now)||[]).filter(d=>d.state!=='done'&&d.kind!=='abfahrt').map(d=>({id:'frist:'+d.id,kind:d.kind,state:d.state,days:d.days,title:d.label,reason:[d.when,d.detail].filter(Boolean).join(' · '),tab:d.go||'',check:d.state==='unknown'&&/^book:/.test(d.id)?d.id.slice(5):''}));
 }
 if(typeof departurePlan!=='function')return [];
 const p=departurePlan(t,now);if(!p)return [];
 const when=x=>x.overdue?'überfällig seit '+fmtLong(pd(x.date)):x.days===0?'heute':x.days===1?'morgen':'in '+x.days+' Tagen · '+fmtLong(pd(x.date));
 return p.items.filter(x=>x.kind!=='abfahrt').map((x,i)=>({id:'frist:'+x.kind+':'+x.date+':'+i,kind:x.kind,state:x.overdue?'overdue':'due',days:x.days,title:x.label,reason:[when(x),x.detail].filter(Boolean).join(' · '),tab:x.go||'',check:''}))
  .concat(p.undated.map(x=>({id:'frist:book:'+aufbauNorm(x.label),kind:'buchen',state:'unknown',days:null,title:x.label,reason:x.detail||'Noch zu buchen, ohne Frist',tab:'check',check:''})));
}
function naechstes(t,now){
 const out=[],seen=new Set();
 const add=x=>{const k=aufbauNorm(x.title);if(seen.has(k))return;seen.add(k);out.push(x)};
 aufbauFristen(t,now).forEach(f=>add({id:f.id,level:f.state==='overdue'?'warn':f.state==='due'&&f.days!=null&&f.days<=7?'soon':'info',rank:f.state==='overdue'?0:f.state==='due'?(f.days<=14?25:70):60,title:f.title,reason:f.reason,tab:f.tab,action:'',value:'',label:'Ansehen',check:f.check,kind:f.kind}));
 const steps=typeof planningNextSteps==='function'?planningNextSteps(t):[];
 steps.forEach(s=>add({id:'schritt:'+s.id,step:s.id,level:s.priority<20?'warn':'info',rank:s.priority<20?10:30+s.priority/10,title:s.title,reason:s.reason,tab:s.tab,action:s.action,value:s.value,label:s.label||'Ansehen'}));
 const hasStay=steps.some(s=>s.id==='stay');
 (typeof checks==='function'?checks(t):[]).forEach((c,i)=>{
  if(c[0]==='ok')return;if(hasStay&&/^Noch keine Unterkunft/.test(c[1]))return;
  add({id:'check:'+i,level:c[0]==='warn'?'warn':'info',rank:c[0]==='warn'?20:90,title:c[1],reason:'',tab:c[2]||'',action:'',value:'',label:'Ansehen'});
 });
 return out.sort((a,b)=>a.rank-b.rank);
}
/* Aufteilung für die Anzeige: Hauptpunkt, zwei weitere, Rest aufklappbar; Warnungen bleiben immer sichtbar. */
function naechstesTeilen(list,sichtbar){
 const n=sichtbar==null?3:sichtbar,top=list.slice(0,n),rest=list.slice(n);
 return {haupt:top[0]||null,weitere:top.slice(1).concat(rest.filter(x=>x.level==='warn')),rest:rest.filter(x=>x.level!=='warn')};
}
function naechstesKnopf(t,x,cls){
 const lbl=aufbauEsc(x.label||'Ansehen');
 if(x.action)return '<button type="button" class="'+cls+'" data-act="'+aufbauEsc(x.action)+'" data-val="'+aufbauEsc(x.value)+'">'+lbl+'</button>';
 if(x.tab)return '<button type="button" class="'+cls+'" data-go="r-'+aufbauEsc(t.id)+'-'+aufbauEsc(x.tab)+'">'+lbl+'</button>';
 return '';
}
const NAECHSTES_STUFE={warn:'Wichtig',soon:'Bald fällig',info:'Hinweis'};
function naechstesZeile(t,x){
 const stufe='<span class="nx-level nx-'+x.level+'">'+(x.level==='warn'?'! ':'')+NAECHSTES_STUFE[x.level]+'</span>';
 const step=x.step?' data-next-step="'+aufbauEsc(x.step)+'"':'';
 if(x.check)return '<li class="nx-row"'+step+'><label class="nx-check"><input type="checkbox" data-act="check" data-val="'+aufbauEsc(x.check)+'"> <span>'+stufe+'<b>'+aufbauEsc(x.title)+'</b>'+(x.reason?'<small class="muted">'+aufbauEsc(x.reason)+'</small>':'')+'</span></label></li>';
 return '<li class="nx-row"'+step+'><span class="nx-txt">'+stufe+'<b>'+aufbauEsc(x.title)+'</b>'+(x.reason?'<small class="muted">'+aufbauEsc(x.reason)+'</small>':'')+'</span>'+naechstesKnopf(t,x,'btn ghost sm')+'</li>';
}
function naechstesBlock(t,now){
 const list=naechstes(t,now),v=naechstesTeilen(list);
 const head='<div class="between"><h2>Als Nächstes</h2>'+(list.length?'<span class="badge">'+list.length+(list.length===1?' Punkt':' Punkte')+'</span>':'')+'</div>';
 if(!v.haupt)return '<section class="block nx" data-next-steps>'+head+'<p>Aus eurem Plan ergibt sich gerade nichts Dringendes. Öffnungszeiten, Tarife und Buchungsbedingungen trotzdem beim Anbieter prüfen.</p></section>';
 const h=v.haupt,hstep=h.step?' data-next-step="'+aufbauEsc(h.step)+'"':'';
 const main='<article class="card nx-main"'+hstep+'><span class="nx-level nx-'+h.level+'">'+(h.level==='warn'?'! ':'')+NAECHSTES_STUFE[h.level]+'</span><h3>'+aufbauEsc(h.title)+'</h3>'+(h.reason?'<p class="small">'+aufbauEsc(h.reason)+'</p>':'')+
  (h.check?'<label class="nx-check"><input type="checkbox" data-act="check" data-val="'+aufbauEsc(h.check)+'"> <span>Erledigt</span></label>':'<div class="foot">'+naechstesKnopf(t,h,'btn sm')+'</div>')+'</article>';
 return '<section class="block nx" data-next-steps>'+head+'<p class="small muted">Aus eurem Plan abgeleitet, Dringendes zuerst. Hinweise sind keine Buchungsfreigabe und ändern nichts.</p>'+main+
  (v.weitere.length?'<ul class="plain nx-list">'+v.weitere.map(x=>naechstesZeile(t,x)).join('')+'</ul>':'')+
  (v.rest.length?'<details class="panel nx-more"><summary><b>'+v.rest.length+(v.rest.length===1?' weiterer Punkt':' weitere Punkte')+'</b></summary><ul class="plain nx-list">'+v.rest.map(x=>naechstesZeile(t,x)).join('')+'</ul></details>':'')+'</section>';
}

/* ---------- Ebenen: aufklappbare Abschnitte mit gemerktem Zustand (KONZEPT §2, Paket A4) ----------
   fold(id,titel,zusammenfassung,html,opts): <details data-fold> mit Zusammenfassung in der Kopfzeile. Der Zustand gilt je Browser
   (localStorage rp-fold, reine Darstellung, kein Reisedatum) und übersteht das Neuzeichnen nach jeder Eingabe.
   opts.open: Startzustand ohne gemerkten Wert; opts.force: immer offen (z. B. aktive Filter, damit sie sichtbar und zurücksetzbar bleiben). */
let aufbauFolds={};
try{const raw=typeof localStorage!=='undefined'&&localStorage.getItem('rp-fold');const v=raw?JSON.parse(raw):null;if(v&&typeof v==='object'&&!Array.isArray(v))aufbauFolds=v}catch(e){}
function foldOpen(id,def){return Object.prototype.hasOwnProperty.call(aufbauFolds,id)?!!aufbauFolds[id]:!!def}
function foldSet(id,open){
 if(!/^[a-z0-9-]{1,40}$/.test(String(id||'')))return false;
 aufbauFolds[id]=!!open;
 try{localStorage.setItem('rp-fold',JSON.stringify(aufbauFolds))}catch(e){}
 return true;
}
function fold(id,titel,zusammenfassung,html,opts){
 const o=opts||{},open=o.force||foldOpen(id,o.open);
 return '<details class="panel fold" data-fold="'+aufbauEsc(id)+'"'+(open?' open':'')+'><summary><b>'+aufbauEsc(titel)+'</b>'+(zusammenfassung?' <small class="muted">'+aufbauEsc(zusammenfassung)+'</small>':'')+'</summary><div class="fold-body">'+html+'</div></details>';
}
if(typeof document!=='undefined'&&document.addEventListener){
 /* toggle steigt nicht auf, daher in der Einfangphase */
 document.addEventListener('toggle',e=>{const d=e.target;if(d&&d.matches&&d.matches('details[data-fold]'))foldSet(d.getAttribute('data-fold'),d.open)},true);
}

/* Ideen schrittweise zeigen (Paket A4): erst 12, dann je 12 mehr. Gilt je Reise für diese Sitzung; Filter und Suche wirken auf alle Ideen. */
const IDEEN_SCHRITT=12;
const aufbauIdeen={};
function ideenSichtbar(t){return t&&aufbauIdeen[t.id]||IDEEN_SCHRITT}
if(typeof document!=='undefined'&&document.addEventListener){
 document.addEventListener('click',e=>{
  const b=e.target&&e.target.closest?e.target.closest('[data-aufbau="ideen-mehr"]'):null;if(!b||typeof UI==='undefined'||!UI.tid)return;
  aufbauIdeen[UI.tid]=ideenSichtbar({id:UI.tid})+IDEEN_SCHRITT;
  const y=typeof window!=='undefined'&&typeof window.scrollY==='number'?window.scrollY:0;render();try{window.scrollTo(0,y)}catch(err){}
 });
}
