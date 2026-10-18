/* Reiseplaner · Hauptnavigation, Heute und Erinnerungen (P0.5, PLAN_IOS_APP §4.2).
   Eigener Teil der App, geladen nach dem Tagebuch und vor dem Start. Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen.
   Reine Ableitungen aus den gespeicherten Reisen, kein neues Speicherfeld; rp-trips bleibt unverändert.
   - navItems(now,trips): Reisen, Entdecken, Heute (nur während einer laufenden Reise), Erinnerungen, Konto.
     Am Handy als Tab-Leiste unten (app.css, max-width 760px), am Desktop oben im Kopf.
   - vHeute(now): je laufender Reise Tag x von n, der bestehende Heute-Block (todayBlock) und Schnellzugriffe.
     Aktionen im Heute-Block (Tagebuch, Regen-Alternative) brauchen die Reise: Ein Klick in [data-heute-trip]
     merkt sie in UI.heuteTid, cur() liefert sie dann auch in dieser Ansicht.
   - vErinnerungen(trips): Tagebuch und Bewertungen aller Reisen, nur lesend. Fotos und Reisebücher gibt es noch nicht. */
"use strict";
const NAV_ICON={
 reisen:'<path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7"/><rect x="3.5" y="7" width="17" height="12.5" rx="2.5"/><path d="M3.5 12.5h17"/>',
 entdecken:'<circle cx="12" cy="12" r="8.5"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
 heute:'<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4m8-4v4"/><circle cx="12" cy="15" r="1.6"/>',
 erinnerungen:'<path d="M5 4.5h10.5A3.5 3.5 0 0 1 19 8v11.5H8.5A3.5 3.5 0 0 1 5 16Z"/><path d="M5 16a3.5 3.5 0 0 1 3.5-3.5H19"/>',
 konto:'<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>'
};
const NAV_DEF=[['reisen','Reisen'],['entdecken','Entdecken'],['heute','Heute'],['erinnerungen','Erinnerungen'],['konto','Konto']];
function runningTrips(now,trips){
 return (trips||Store.list()).map(t=>({t,ph:tripPhase(t,now)})).filter(x=>x.ph&&x.ph.phase==='unterwegs')
  .sort((a,b)=>String(a.t.start).localeCompare(String(b.t.start))||String(a.t.title||'').localeCompare(String(b.t.title||''),'de'));
}
function navItems(now,trips){
 const run=runningTrips(now,trips).length>0;
 return NAV_DEF.filter(([key])=>key!=='heute'||run).map(([key,label])=>({key,label,route:'#'+key}));
}
/* Eine Reise und „Neue Reise“ zählen als Reisen */
function navActive(view){return ['entdecken','heute','erinnerungen','konto'].includes(view)?view:'reisen'}
function navHtml(items,active){
 return items.map(x=>'<button type="button" class="lnk nav-item" data-go="'+x.key+'"'+(x.key===active?' aria-current="page"':'')+'><svg class="nav-ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+NAV_ICON[x.key]+'</svg><span class="nav-txt">'+esc(x.label)+'</span></button>').join('');
}
/* Knöpfe nur neu aufbauen, wenn sich die Einträge ändern (Fokus bleibt sonst erhalten); aria-current immer setzen. */
let navKeys='';
function renderNav(now){
 const nav=typeof document!=='undefined'&&document.querySelector?document.querySelector('#app-nav'):null;if(!nav)return;
 const items=navItems(now),keys=items.map(x=>x.key).join(','),active=navActive(UI.view);
 if(keys!==navKeys||!nav.querySelector('[data-go]')){nav.innerHTML=navHtml(items,active);navKeys=keys}
 nav.querySelectorAll('[data-go]').forEach(b=>{if(b.getAttribute('data-go')===active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
}

/* ---------- Sprungziel nach dem Wechsel in einen Reisebereich ---------- */
function navFocus(selectors){
 for(const s of String(selectors||'').split('|')){const el=s&&document.querySelector(s);if(el){try{el.scrollIntoView({block:'center'})}catch(e){}try{el.focus({preventScroll:true})}catch(e){}return el}}
 return null;
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
 const el=e.target&&e.target.closest?e.target:null;if(!el)return;
 const box=el.closest('[data-heute-trip]');if(box&&UI.view==='heute')UI.heuteTid=box.getAttribute('data-heute-trip');
 const link=el.closest('[data-heute-focus],[data-heute-day]');
 if(link){const d=link.getAttribute('data-heute-day');UI.navAfter={focus:link.getAttribute('data-heute-focus')||'',day:d!=null&&/^\d+$/.test(d)?Number(d):null}}
},true);

/* ---------- Heute ---------- */
function heuteLinks(t,ph){
 const id=esc(t.id),btn=(tab,label,extra)=>'<button type="button" class="btn ghost sm" data-go="r-'+id+'-'+tab+'"'+(extra||'')+'>'+label+'</button>';
 const day=' data-heute-day="'+ph.day+'"',expense=typeof V3S!=='undefined'&&V3S&&v3CanEdit(t);
 let journal='';
 if(V3_JOURNAL&&VJ()&&V3&&(journalCanEdit(t)||journalHas(t))){
  const d=journalLayout(t).days[ph.day];
  journal=btn('plan','Tagebuch heute',day+' data-heute-focus="'+esc((d?'[data-journal-act="open"][data-key="'+d.key+'"]|':'')+'[data-journal="plan"] summary')+'"');
 }
 return '<div class="row heute-links" role="group" aria-label="Schnellzugriffe für '+esc(t.title)+'">'+btn('plan','Tagesplan',day)+
  (expense?btn('kosten','Ausgabe erfassen',' data-heute-focus="[data-split-action=&quot;expense-add&quot;]|[data-split] h2"'):btn('kosten','Kosten'))+
  btn('notiz','Notizen')+journal+btn('check','Checkliste')+'</div>';
}
function vHeute(now){
 const run=runningTrips(now);
 const head='<section class="block"><span class="eyebrow">Unterwegs</span><h1>Heute</h1>';
 if(!run.length){
  const next=Store.list().map(t=>({t,ph:tripPhase(t,now)})).filter(x=>x.ph&&x.ph.phase==='vor').sort((a,b)=>a.ph.days-b.ph.days||String(a.t.title||'').localeCompare(String(b.t.title||''),'de'))[0];
  return head+'<div class="empty" data-heute-empty><b>Gerade läuft keine Reise.</b>'+(next?'<span>Eure nächste Reise: <b>'+esc(next.t.title)+'</b>, '+esc(rangeText(next.t))+' · '+esc(phaseText(next.ph))+'. Sobald sie beginnt, steht hier, was heute ansteht.</span><button type="button" class="btn" data-go="r-'+esc(next.t.id)+'-ueber">Zur nächsten Reise</button>':'<span>Hier steht während einer Reise mit festem Datum, was heute ansteht. Noch ist keine Reise geplant.</span><button type="button" class="btn" data-go="neu">+ Neue Reise</button>')+'<button type="button" class="btn ghost" data-go="reisen">Alle Reisen</button></div></section>';
 }
 return head+'<p class="small muted">'+(run.length===1?'Eine Reise läuft gerade.':run.length+' Reisen laufen gerade.')+' Angaben aus eurem Plan, keine Live-Daten zu Wetter, Öffnung oder Verkehr.</p></section>'+
  run.map(({t,ph})=>'<div class="heute-trip" data-heute-trip="'+esc(t.id)+'"><section class="block"><span class="eyebrow">'+esc(rangeText(t))+'</span><h2>'+esc(t.title)+'</h2><p><b>Tag '+(ph.day+1)+' von '+ph.of+'</b></p>'+heuteLinks(t,ph)+'</section>'+todayBlock(t,now)+'</div>').join('');
}

/* ---------- Erinnerungen ---------- */
function memoryOrder(t){return String(t.dateMode==='fix'&&t.start||t.month||t.start||t.created||'')}
/* Tagebuch und Bewertungen je Reise, neueste Reisen zuerst. Ohne Format-3-Angaben zählt die Reise nur in `without`. */
function memoriesData(trips){
 const J=VJ(),list=trips||Store.list();
 if(!J)return {groups:[],without:list.length,unsupported:true};
 const groups=[];let without=0;
 list.forEach(t=>{
  if(!journalHas(t)){without++;return}
  let L,R;try{L=journalLayout(t);R=J.ratingLayout(t.ratings,journalActs(t))}catch(e){without++;return}
  const entries=[],add=(label,key,e)=>entries.push({key,label,mood:e.mood||null,moodText:e.mood?J.moodText(e.mood):'',excerpt:J.excerpt(e.text||'')});
  L.days.forEach(d=>{if(d.entry)add(d.label,d.key,d.entry);d.extra.forEach(x=>add(d.label+' · früherer Eintrag für '+J.keyLabel(x.key),x.key,x.entry))});
  L.orphans.forEach(o=>add(o.label+' · ohne zugehörigen Tag',o.key,o.entry));
  const ratings=R.planned.filter(a=>a.stars).map(a=>({id:a.id,title:a.title,stars:a.stars,text:J.starsText(a.stars)}))
   .concat(R.other.map(o=>{const a=actOf(t,o.id);return {id:o.id,title:a?a.t:'Entfernte Unternehmung',stars:o.stars,text:J.starsText(o.stars)}}));
  if(entries.length||ratings.length)groups.push({trip:t,entries,ratings});else without++;
 });
 groups.sort((a,b)=>memoryOrder(b.trip).localeCompare(memoryOrder(a.trip))||String(a.trip.title||'').localeCompare(String(b.trip.title||''),'de'));
 return {groups,without,unsupported:false};
}
function vErinnerungen(trips){
 const m=memoriesData(trips),J=VJ();
 const head='<section class="block"><span class="eyebrow">Alle Reisen</span><h1>Erinnerungen</h1><p class="small muted">Tagebuch und Bewertungen aus euren Reisen, nur zum Lesen. Schreiben und ändern im Tagesplan der jeweiligen Reise. Fotos und Reisebücher kommen später.</p></section>';
 if(m.unsupported)return head+'<section class="block"><div class="note" role="status">Diese App-Version kann Tagebücher nicht anzeigen. Eure Einträge bleiben in den Reisen gespeichert.</div></section>';
 if(!m.groups.length)return head+'<section class="block"><div class="empty" data-memories-empty><b>Noch keine Erinnerungen</b><span>Während und nach einer Reise könnt ihr im Tagesplan je Tag einen Tagebucheintrag schreiben und Unternehmungen mit Sternen bewerten. Sie erscheinen dann hier.</span><button type="button" class="btn ghost" data-go="reisen">Zu den Reisen</button></div></section>';
 return head+m.groups.map(g=>{const t=g.trip,id=esc(t.id);
  return '<section class="block memory-trip" data-memory-trip="'+id+'"><span class="eyebrow">'+esc(rangeText(t))+'</span><h2>'+esc(t.title)+'</h2>'+
   (g.entries.length?'<h3>Tagebuch · '+g.entries.length+(g.entries.length===1?' Eintrag':' Einträge')+'</h3><ul class="plain rp-jdays">'+g.entries.map(e=>'<li data-memory-entry="'+esc(e.key)+'"><b>'+esc(e.label)+'</b>'+(e.mood?'<p class="small">Stimmung: <b>'+esc(e.moodText)+'</b></p>':'')+(e.excerpt?'<p class="small rp-jtext">'+esc(e.excerpt)+'</p>':'')+'</li>').join('')+'</ul>':'')+
   (g.ratings.length?'<h3>Bewertungen · '+g.ratings.length+'</h3><ul class="plain rp-rates">'+g.ratings.map(r=>'<li data-memory-rating="'+esc(r.id)+'"><b>'+esc(r.title)+'</b><p class="small"><span aria-hidden="true">'+J.starsGlyphs(r.stars)+'</span> '+esc(r.text)+'</p></li>').join('')+'</ul>':'')+
   '<div class="row"><button type="button" class="btn ghost sm" data-go="r-'+id+'-plan" data-heute-focus="[data-journal=&quot;plan&quot;] summary" aria-label="Tagebuch von '+esc(t.title)+' im Tagesplan öffnen">Tagebuch im Tagesplan</button><button type="button" class="btn ghost sm" data-go="r-'+id+'-ueber" aria-label="'+esc(t.title)+' öffnen">Reise öffnen</button></div></section>'}).join('')+
  (m.without?'<p class="small muted">'+m.without+(m.without===1?' weitere Reise hat':' weitere Reisen haben')+' noch kein Tagebuch und keine Bewertung.</p>':'');
}

/* ---------- Konto: Darstellung auch hier erreichbar ---------- */
function kontoDarstellung(){
 return '<section class="block" data-konto-darstellung><h2>Darstellung</h2><p class="small muted">Reisebuch, Planungsstudio oder Kompakt. Gilt nur in diesem Browser, Reisedaten bleiben unverändert.</p><div class="row"><button type="button" class="btn ghost" data-act="appearance-open">Darstellung wählen</button></div></section>';
}
