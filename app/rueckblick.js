/* Reiseplaner · Rückblick, Nachbereitung und „Meine Daten“ (Hauptbereiche Erinnerungen, Reisen, Konto; 16.11.2026).
   Eigener Teil der App, geladen nach app/reisebuch.js und vor app/start.js. Klassisches Skript ohne Bundler.
   Reine Ableitungen aus den gespeicherten Reisen, kein neues Speicherfeld; rp-trips bleibt unverändert.
   - rbStats(t,now): Phase, Tagebuch (x von n Tagen), Bewertungen (x von y Unternehmungen), Fotos, Plan und Ist.
   - rbSteps(s): Nachbereitung nach der Heimkehr (Tagebuch, Bewertungen, Ausgaben, Fotos, Reisebuch). Nur Hinweise,
     nichts wird automatisch abgehakt oder gespeichert. Unbekannt bleibt unbekannt: ohne erfasste Zahlungen kein „Ist“.
   - vRueckblick(trips,now): neue Ansicht „Erinnerungen“ (Frisch zurück, Rückblick nach Jahren, Fotos, Reisebuch).
   - rbReisenHint(list,now): Hinweis „Frisch zurück“ auf der Reisen-Seite; rbCardLine(t,now): Zeile auf vergangenen Reisekarten.
   - rbAgain(t): „Nochmal so eine Reise“ füllt nur den Entwurf für „Neue Reise“ (Art, Ziel, Startort, Personen, Budget,
     Nächte, Anreise). Keine Termine, Angebote, Buchungen, Zahlungen, Notizen oder Unterlagen werden übernommen.
   - kontoDaten(): Konto › Meine Daten (Sicherung, Import) und allgemeine Vorlieben aus Entdecken (Philipp 16.11.: Sicherung ins Konto). */
"use strict";
const RB_FRESH_DAYS=60;
function rbJournal(t){try{if(!VJ()||!isV3(t))return null;const L=journalLayout(t);return {days:L.days.length,written:L.days.filter(d=>d.entry).length}}catch(e){return null}}
function rbRatings(t){try{const J=VJ();if(!J||!isV3(t))return null;const R=J.ratingLayout(t.ratings,journalActs(t));return {planned:R.planned.length,rated:R.planned.filter(a=>a.stars).length}}catch(e){return null}}
function rbPhotos(t){try{return typeof fotosByDay==='function'?(fotosByDay(t).count||0):0}catch(e){return 0}}
function rbMoney(t,now){try{return typeof istResult==='function'?istResult(t,now):null}catch(e){return null}}
function rbStats(t,now){
 const ph=tripPhase(t,now),p=ph?ph.phase:null;
 return {trip:t,phase:p,since:p==='nach'?ph.days:null,journal:rbJournal(t),ratings:rbRatings(t),photos:rbPhotos(t),
  money:p==='nach'||p==='unterwegs'?rbMoney(t,now):null,expenses:(t.expenses||[]).length,canEdit:typeof journalCanEdit==='function'&&journalCanEdit(t)};
}
/* Nachbereitung: je Schritt erledigt ja/nein, Text und Sprungziel. Ohne Schreibrecht nur lesen. */
function rbSteps(s){
 const t=s.trip,id=esc(t.id),out=[],jFocus=' data-heute-focus="[data-journal=&quot;plan&quot;] summary"';
 if(s.phase!=='nach')return out;
 if(s.journal&&s.journal.days)out.push({key:'tagebuch',done:s.journal.written>=s.journal.days,label:'Tagebuch',text:s.journal.written+' von '+s.journal.days+' Tagen beschrieben',
  btn:s.canEdit?'<button type="button" class="btn ghost sm" data-go="r-'+id+'-plan"'+jFocus+'>Tage nachtragen</button>':''});
 if(s.ratings&&s.ratings.planned)out.push({key:'bewertung',done:s.ratings.rated>=s.ratings.planned,label:'Bewertungen',text:s.ratings.rated+' von '+s.ratings.planned+' Unternehmungen mit Sternen',
  btn:s.canEdit?'<button type="button" class="btn ghost sm" data-go="r-'+id+'-plan"'+jFocus+'>Bewerten</button>':''});
 if(s.money){const r=s.money,any=r.ist>0.004;
  out.push({key:'kosten',done:any,label:'Kosten',text:any?'Plan '+eur(r.plan)+' · erfasst '+istCt(r.ist)+(r.unknown?' · '+r.unknown+' Preis(e) offen':''):'Noch keine Zahlungen oder Ausgaben erfasst. Ohne Angaben gibt es keinen Vergleich mit dem Plan.',
   btn:'<button type="button" class="btn ghost sm" data-go="r-'+id+'-kosten">'+(any?'Plan und Ist ansehen':'Ausgaben nachtragen')+'</button>'});}
 if(typeof fotosByDay==='function')out.push({key:'fotos',done:s.photos>0,label:'Fotos',text:s.photos?s.photos+(s.photos===1?' Foto':' Fotos')+' in dieser Reise':'Noch keine Fotos. Sie bleiben nur auf diesem Gerät, außer ihr ladet sie hoch.',
  btn:s.canEdit?'<button type="button" class="btn ghost sm" data-go="r-'+id+'-plan">'+(s.photos?'Fotos ansehen':'Fotos hinzufügen')+'</button>':''});
 if(typeof reisebuchSection==='function')out.push({key:'buch',done:false,optional:true,label:'Reisebuch',text:'Entwurf aus Tagebuch, Bewertungen, Plan und Fotos',
  btn:'<button type="button" class="btn ghost sm" data-rb-book="'+id+'">Entwurf ansehen</button>'});
 return out;
}
function rbOpen(steps){return steps.filter(x=>!x.done&&!x.optional)}
function rbStepsHtml(steps){
 return '<ul class="plain rb-steps" style="list-style:none;padding-left:0">'+steps.map(x=>'<li class="rb-step" data-rb-step="'+x.key+'"'+(x.done?' data-done':'')+'><div class="between"><span><b><span aria-hidden="true">'+(x.done?'✓':x.optional?'◇':'○')+'</span> '+esc(x.label)+'</b> <span class="small muted">'+(x.done?'erledigt':x.optional?'freiwillig':'offen')+'</span></span>'+x.btn+'</div><p class="small">'+x.text+'</p></li>').join('')+'</ul>';
}
function rbSinceText(d){return d===0?'seit heute':d===1?'seit gestern':'seit '+d+' Tagen'}
/* „Frisch zurück“: Reisen der letzten RB_FRESH_DAYS Tage, bei denen noch etwas offen ist, neueste zuerst */
function rbFresh(trips,now){
 return (trips||Store.list()).map(t=>rbStats(t,now)).filter(s=>s.phase==='nach'&&s.since<=RB_FRESH_DAYS&&s.canEdit&&rbOpen(rbSteps(s)).length)
  .sort((a,b)=>a.since-b.since||String(a.trip.title||'').localeCompare(String(b.trip.title||''),'de'));
}
function rbFreshCard(s){
 const steps=rbSteps(s),open=rbOpen(steps).length,all=steps.filter(x=>!x.optional).length,t=s.trip;
 return '<section class="block rb-fresh" data-rb-fresh="'+esc(t.id)+'"><span class="eyebrow">Frisch zurück · '+esc(rbSinceText(s.since))+'</span><h2>'+esc(t.title)+'</h2><p class="small muted">'+esc(rangeText(t))+'</p>'+
  '<p><b>'+(all-open)+' von '+all+' Schritten der Nachbereitung erledigt.</b> Solange die Erinnerung frisch ist, geht es am leichtesten.</p>'+rbStepsHtml(steps)+'</section>';
}
/* Kompakte Kennzahlen für die Rückblick-Karte; Text statt nur Symbol */
function rbFacts(s){
 const f=[];
 if(s.journal&&s.journal.days)f.push(s.journal.written+' von '+s.journal.days+' Tagen im Tagebuch');
 if(s.ratings&&s.ratings.rated)f.push(s.ratings.rated+(s.ratings.rated===1?' Bewertung':' Bewertungen'));
 if(s.photos)f.push(s.photos+(s.photos===1?' Foto':' Fotos'));
 if(s.money&&s.money.ist>0.004)f.push('erfasst '+istCt(s.money.ist)+' (Plan '+eur(s.money.plan)+')');
 return f;
}
function rbYear(t){const k=memoryOrder(t);return /^\d{4}/.test(k)?k.slice(0,4):'Ohne Datum'}
function rbTripCard(s,g,fresh){
 const t=s.trip,id=esc(t.id),J=VJ(),facts=rbFacts(s),steps=rbSteps(s),open=rbOpen(steps).length;
 const entries=g&&g.entries.length?'<details class="rb-read"><summary>Tagebuch lesen · '+g.entries.length+(g.entries.length===1?' Eintrag':' Einträge')+'</summary><ul class="plain rp-jdays">'+g.entries.map(e=>'<li data-memory-entry="'+esc(e.key)+'"><b>'+esc(e.label)+'</b>'+(e.mood?'<p class="small">Stimmung: <b>'+esc(e.moodText)+'</b></p>':'')+(e.excerpt?'<p class="small rp-jtext">'+esc(e.excerpt)+'</p>':'')+'</li>').join('')+'</ul></details>':'';
 const ratings=g&&g.ratings.length&&J?'<details class="rb-read"><summary>Bewertungen · '+g.ratings.length+'</summary><ul class="plain rp-rates">'+g.ratings.slice().sort((a,b)=>b.stars-a.stars).map(r=>'<li data-memory-rating="'+esc(r.id)+'"><b>'+esc(r.title)+'</b><p class="small"><span aria-hidden="true">'+J.starsGlyphs(r.stars)+'</span> '+esc(r.text)+'</p></li>').join('')+'</ul></details>':'';
 const best=g&&g.ratings.filter(r=>r.stars===5).map(r=>r.title).slice(0,3);
 return '<article class="card rb-trip memory-trip" data-memory-trip="'+id+'"><div class="between"><span class="eyebrow">'+esc(rangeText(t))+'</span>'+(s.phase==='unterwegs'?'<span class="badge">Gerade unterwegs</span>':open&&s.canEdit?'<span class="badge">'+open+' offen</span>':'')+'</div><h3>'+esc(t.title)+'</h3>'+
  (facts.length?'<p class="small">'+facts.map(esc).join(' · ')+'</p>':'<p class="small muted">Noch nichts festgehalten.</p>')+
  (best&&best.length?'<p class="small">Highlights: <b>'+best.map(esc).join(', ')+'</b></p>':'')+entries+ratings+
  (open&&s.canEdit&&!(fresh&&fresh.has(t.id))?'<details class="rb-read"><summary>Nachbereitung · '+open+' offen</summary>'+rbStepsHtml(steps)+'</details>':'')+
  '<div class="row">'+(g&&g.entries.length||s.canEdit&&s.phase?'<button type="button" class="btn ghost sm" data-go="r-'+id+'-plan" data-heute-focus="[data-journal=&quot;plan&quot;] summary" aria-label="Tagebuch von '+esc(t.title)+' im Tagesplan öffnen">Tagebuch im Tagesplan</button>':'')+'<button type="button" class="btn ghost sm" data-go="r-'+id+'-ueber" aria-label="'+esc(t.title)+' öffnen">Reise öffnen</button>'+
  (typeof reisebuchSection==='function'?'<button type="button" class="btn ghost sm" data-rb-book="'+id+'" aria-label="Reisebuch-Entwurf für '+esc(t.title)+'">Reisebuch</button>':'')+
  '<button type="button" class="btn ghost sm" data-rb-again="'+id+'" aria-label="Nochmal so eine Reise wie '+esc(t.title)+' planen">Nochmal so eine Reise</button></div></article>';
}
function vRueckblick(trips,now){
 const list=trips||Store.list(),m=memoriesData(list);
 const head='<section class="block"><span class="eyebrow">Alle Reisen</span><h1>Erinnerungen</h1><p class="small muted">Rückblick auf eure Reisen: Tagebuch, Bewertungen, Fotos und was es gekostet hat. Geschrieben wird im Tagesplan der jeweiligen Reise.</p></section>';
 if(m.unsupported)return head+'<section class="block"><div class="note" role="status">Diese App-Version kann Tagebücher nicht anzeigen. Eure Einträge bleiben in den Reisen gespeichert.</div></section>';
 if(!list.length)return head+'<section class="block"><div class="empty" data-memories-empty><b>Noch keine Reise</b><span>Erinnerungen entstehen unterwegs: Je Tag ein Tagebucheintrag, Sterne für Unternehmungen und Fotos. Zuerst braucht es eine Reise.</span><div class="row"><button type="button" class="btn" data-go="reisen">Zu den Reisen</button><button type="button" class="btn ghost" data-go="entdecken">Ziele entdecken</button></div></div></section>';
 const groups=new Map(m.groups.map(g=>[g.trip.id,g])),fresh=rbFresh(list,now),freshIds=new Set(fresh.map(s=>s.trip.id));
 const stats=list.map(t=>rbStats(t,now)).filter(s=>s.phase==='nach'||s.phase==='unterwegs'||groups.has(s.trip.id));
 stats.sort((a,b)=>memoryOrder(b.trip).localeCompare(memoryOrder(a.trip))||String(a.trip.title||'').localeCompare(String(b.trip.title||''),'de'));
 const coming=list.length-stats.length;
 let h=head+fresh.map(rbFreshCard).join('');
 if(stats.length){
  const years=[];stats.forEach(s=>{const y=rbYear(s.trip),last=years[years.length-1];if(last&&last.y===y)last.items.push(s);else years.push({y,items:[s]})});
  h+='<section class="block rb-years" data-rb-years><span class="eyebrow">Rückblick</span><h2>Eure Reisen</h2>'+years.map(y=>'<h3 class="rb-year">'+esc(y.y)+'</h3><div class="grid wide">'+y.items.map(s=>rbTripCard(s,groups.get(s.trip.id),freshIds)).join('')+'</div>').join('')+
   (coming?'<p class="small muted">'+coming+(coming===1?' weitere Reise liegt':' weitere Reisen liegen')+' noch vor euch. Ihre Erinnerungen erscheinen hier, sobald sie beginnen.</p>':'')+'</section>';
 }else h+='<section class="block"><div class="empty" data-memories-empty><b>Noch keine Erinnerungen</b><span>Sobald eine Reise beginnt, könnt ihr im Tagesplan je Tag einen Tagebucheintrag schreiben, Unternehmungen mit Sternen bewerten und Fotos hinzufügen. Danach steht hier der Rückblick.</span><button type="button" class="btn ghost" data-go="reisen">Zu den Reisen</button></div></section>';
 return h+(typeof fotosMemories==='function'?fotosMemories(list):'')+(typeof reisebuchSection==='function'?reisebuchSection(list):'');
}

/* ---------- Reisen-Seite ---------- */
function rbReisenHint(list,now){
 const f=rbFresh(list,now)[0];if(!f)return '';
 const steps=rbSteps(f),open=rbOpen(steps).length;
 return '<aside class="trip-spotlight rb-hint" data-rb-hint="'+esc(f.trip.id)+'"><div><span class="eyebrow">Frisch zurück</span><h2>'+esc(f.trip.title)+'</h2><p class="small muted">zurück '+esc(rbSinceText(f.since))+' · '+open+(open===1?' Schritt':' Schritte')+' der Nachbereitung offen</p></div><button type="button" class="btn" data-go="erinnerungen">Zum Rückblick <span aria-hidden="true">↗</span></button></aside>';
}
function rbCardLine(t,now){
 const s=rbStats(t,now);if(s.phase!=='nach')return '';
 const f=rbFacts(s);return '<p class="small rb-card-line">Rückblick: '+(f.length?esc(f[0]):'noch nichts festgehalten')+'</p>';
}
function rbBackupHint(){return '<section class="block" data-rb-backup-link><p class="small muted">Reisen sichern, auf ein anderes Gerät übertragen oder eine Sicherung importieren: <button type="button" class="lnk" data-go="konto">Konto › Meine Daten</button></p></section>'}

/* ---------- „Nochmal so eine Reise“ ---------- */
function rbAgainDraft(t){
 const keep={type:t.type,dest:t.dest,origin:t.origin,persons:t.persons,budget:t.budget,travel:t.travel,km:t.km,verb:t.verb,preis:t.preis};
 const o={title:String('Nochmal: '+(t.title||'Reise')).slice(0,80),nights:nightsOf(t)};
 Object.keys(keep).forEach(k=>{if(keep[k]!=null&&keep[k]!=='')o[k]=keep[k]});
 return newTrip(o);
}
function rbAgain(id){const t=Store.get(id);if(!t)return false;UI.draft=rbAgainDraft(t);UI.draftFrom={id:UI.draft.id,title:t.title||'Reise'};go('neu');return true}
function rbDraftNote(){const f=UI.draftFrom;return f&&UI.draft&&f.id===UI.draft.id?'<div class="note" role="status" data-rb-draft-from>Vorbereitet nach „'+esc(f.title)+'“: Art, Ziel, Startort, Personen, Budget, Nächte und Anreise. Termine, Angebote, Buchungen und Notizen sind nicht übernommen. Alles lässt sich vor dem Anlegen ändern.</div>':''}

/* ---------- Reisebuch für eine bestimmte Reise ---------- */
function rbBook(id){
 if(typeof reisebuchAct!=='function')return;
 const sel=reisebuchAct('make',{},()=>id);
 if(UI.view!=='erinnerungen')go('erinnerungen');else render();
 try{const el=document.querySelector('[data-book-preview]');if(el)el.scrollIntoView({block:'start'});const f=sel&&document.querySelector(sel.split('|')[0]);if(f&&f.focus)f.focus({preventScroll:true})}catch(e){}
}

/* ---------- Konto › Meine Daten und Vorlieben ---------- */
function kontoVorlieben(){
 if(typeof catState!=='function'||typeof CATX==='undefined'||!CATX)return '';
 let s,items=[];try{s=catState();items=catWishItems(s.profile)}catch(e){return ''}
 const favs=typeof catFavs==='function'?catFavs().length:0;
 return '<h3>Allgemeine Vorlieben</h3><p class="small muted">Gelten für die Zielsuche in Entdecken, nicht automatisch für eine einzelne Reise. Nur in diesem Browser gespeichert.</p>'+
  '<dl class="facts"><dt>Startort</dt><dd>'+(s.origin?esc(s.origin.label):'noch nicht gewählt')+'</dd><dt>Reisegefühl</dt><dd>'+(items.length?items.map(x=>esc(x.label)).join(' · '):'noch alles offen')+'</dd><dt>Merkliste</dt><dd>'+(favs?favs+(favs===1?' Ziel':' Ziele'):'leer')+'</dd></dl>'+
  '<div class="row"><button type="button" class="btn ghost sm" data-go="entdecken">In Entdecken ändern</button></div>';
}
function kontoDaten(){
 const list=Store.list(),photos=typeof f4HasPhotos==='function'&&f4HasPhotos(list);
 return '<section class="block" data-konto-daten><span class="eyebrow">Sicherung & Übertragung</span><h2 tabindex="-1">Meine Daten</h2>'+
  '<p class="small muted">Eine Sicherungsdatei enthält eure Reisepläne einschließlich Notizen. Bewahrt sie privat auf. Auf einem anderen Gerät importiert, entsteht eine Kopie; das ist eine manuelle Übertragung, keine automatische Synchronisation. Ein Import überschreibt nie bestehende Reisen.</p>'+
  '<div class="row"><button type="button" class="btn ghost sm" data-act="backup-all"'+(list.length?'':' disabled')+'>Alle Reisen sichern</button>'+(photos?'<button type="button" class="btn ghost sm" data-f4="export-open" data-scope="all">Mit Fotos sichern (.reiseplaner)</button>':'')+'<button type="button" class="btn ghost sm" data-act="import-open">Sicherung importieren</button><input id="import-file" type="file" accept=".json,application/json,.reiseplaner,application/zip" hidden aria-label="Reiseplaner-Sicherung wählen"></div>'+
  (typeof f4JsonNote==='function'?f4JsonNote(list):'')+(list.length?'':'<p class="small muted">Noch keine Reise zum Sichern.</p>')+kontoVorlieben()+'</section>';
}

if(typeof document!=='undefined'&&document.addEventListener)document.addEventListener('click',e=>{
 const el=e.target&&e.target.closest?e.target.closest('[data-rb-again],[data-rb-book]'):null;if(!el)return;
 e.preventDefault();
 if(el.hasAttribute('data-rb-again'))rbAgain(el.getAttribute('data-rb-again'));
 else rbBook(el.getAttribute('data-rb-book'));
});
