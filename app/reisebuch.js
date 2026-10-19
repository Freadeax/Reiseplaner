/* Reiseplaner · Reisebuch-Vorschau in „Erinnerungen“ (PLAN_IOS_APP §7.3, Paket 6).
   Eigener Teil der App, geladen nach app/navigation.js und vor app/start.js. Klassisches Skript ohne Bundler: Alle Teile
   teilen sich den globalen Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen.
   - reisebuchSection(trips): Reise wählen, Entwurf erzeugen (bookgen.js), Seiten blättern und im Arbeitsspeicher bearbeiten
     (bookedit.js: verschieben, löschen, einfügen, Layout, Foto tauschen, Überschrift, Buchtitel, Rückgängig/Wiederholen).
   - NICHTS wird gespeichert: kein Store.put, kein neues Feld, rp-trips bleibt unverändert. Der Entwurf liegt nur in
     UI.book und ist nach Neuladen oder Reisewechsel weg. Das steht sichtbar über jeder Seite.
   - Braucht window.RPBook, window.RPBookEdit und window.RPV4; fehlt eines, erscheint ein Hinweis statt der Vorschau.
   - Fotos: Bilder nur über reisebuchPhotoUrl(id) (setzt die lokale Fotoablage, Paket 5), sonst Platzhalter.
   Einbindung (Vorschlag, pakete/reisebuch-editor/EINBINDUNG.md): vErinnerungen hängt reisebuchSection() an. */
"use strict";
/* Von der Fotoablage zu setzen: function(mediaId) → 'blob:…' | 'data:image/…' | 'https:…' | null */
let reisebuchPhotoUrl=null;
function RBK(){const w=typeof window!=='undefined'?window:null;return w&&w.RPBook&&w.RPBookEdit&&w.RPV4?{B:w.RPBook,E:w.RPBookEdit}:null}
/* Alle Reisen, neueste zuerst wie in Erinnerungen */
function reisebuchTrips(trips){
 return (trips||Store.list()).slice().sort((a,b)=>memoryOrder(b).localeCompare(memoryOrder(a))||String(a.title||'').localeCompare(String(b.title||''),'de'));
}
/* Was die App weiß und bookgen nicht: Tage wie im Tagebuch, Unternehmungen mit Tagesindizes. Keine Kosten, keine Kilometer. */
function reisebuchCtx(t){
 const days=journalDays(t).map(d=>({i:d.i,date:d.date})),acts=new Map();
 sortedItems(t).forEach(it=>{const a=actOf(t,it.act);if(!a||a.transit||!Number.isInteger(it.day))return;if(!acts.has(a.id))acts.set(a.id,{id:a.id,title:a.t||'',days:[]});const x=acts.get(a.id);if(!x.days.includes(it.day))x.days.push(it.day)});
 return {days,acts:[...acts.values()]};
}
/* Entwurf erzeugen und für die Bearbeitung öffnen. now: UTC-Zeitpunkt (Test), sonst die Uhr des Geräts. */
function reisebuchMake(t,now){
 const R=RBK();if(!R)return {ok:false,error:'Diese App-Version kann noch keine Reisebücher erzeugen.'};
 const at=now||new Date().toISOString();
 let d;try{d=R.B.draft(t,reisebuchCtx(t),{at})}catch(e){return {ok:false,error:e.message}}
 const s=R.E.start(d.book,{media:Array.isArray(t.media)?t.media:[],now:at});
 if(!s.ok)return {ok:false,error:s.error};
 return {ok:true,book:{tid:t.id,st:s.state,i:0,info:d.info,warnings:s.warnings,msg:'',confirm:null}};
}
function reisebuchInfo(info){
 const out=[];if(!info)return out;
 if(info.skippedDays&&info.skippedDays.length)out.push(info.skippedDays.length+(info.skippedDays.length===1?' Tag ohne Tagebuch, Bewertung und Foto ist':' Tage ohne Tagebuch, Bewertung und Foto sind')+' nicht im Entwurf.');
 if(info.omittedPages&&info.omittedPages.length)out.push(info.omittedPages.length+' Seiten passen nicht mehr ins Buch (höchstens 200 Seiten). Die Einträge selbst bleiben in der Reise.');
 if(info.blocked&&info.blocked.length)out.push(info.blocked.length+(info.blocked.length===1?' Text enthielt':' Texte enthielten')+' Zahlungsdaten (IBAN oder Kartennummer) und wurde'+(info.blocked.length===1?'':'n')+' nicht übernommen.');
 if(info.untitledRatings)out.push(info.untitledRatings+(info.untitledRatings===1?' Bewertung gehört':' Bewertungen gehören')+' zu keiner Unternehmung mehr im Plan und fehlt im Buch.');
 return out;
}
function reisebuchWarnText(w,pages){
 const m=/^pages\[(\d+)\]/.exec(w.where||''),where=m?'Seite '+(+m[1]+1):w.where==='title'||w.where==='subtitle'?'Buchtitel':'';
 if(w.kind==='buchungsnummer')return (where?where+': ':'')+'Text erwähnt eine Buchungs- oder Reservierungsnummer. Vor dem Teilen prüfen, dass keine Nummer drinsteht.';
 if(w.kind==='zahlung')return (where?where+': ':'')+'Text erwähnt Zahlungsangaben (z. B. IBAN, Karte). Vor dem Teilen prüfen.';
 if(w.kind==='doppelt')return 'Ein Foto steht '+w.times+'-mal im Buch.';
 if(w.kind==='leerer-platz')return (where?where+': ':'')+'Bildplatz ist noch leer.';
 if(w.kind==='ausgeblendet')return (where?where+': ':'')+'Foto ist in der Reise ausgeblendet.';
 return '';
}
function reisebuchPageLabel(p,i){return (i+1)+' · '+(p.heading||reisebuchKindName(p.kind))}
function reisebuchKindName(k){return {titel:'Titelseite',uebersicht:'Übersicht',tag:'Reisetag',weitere:'Weiterer Eintrag',highlights:'Highlights',zahlen:'Zahlen der Reise',schluss:'Schluss',frei:'Eigene Seite'}[k]||'Seite'}

function reisebuchSection(trips){
 const R=RBK(),head='<section class="block" data-book-preview><span class="eyebrow">Reisebuch</span><h2>Reisebuch als Entwurf ansehen</h2>';
 if(!R)return head+'<div class="note" role="status">Diese App-Version kann noch keine Reisebücher zeigen.</div></section>';
 const list=reisebuchTrips(trips);
 if(!list.length)return head+'<p class="small muted">Noch keine Reise angelegt.</p></section>';
 const B=UI.book&&list.some(t=>t.id===UI.book.tid)?UI.book:null,sel=B?B.tid:list[0].id;
 let h=head+'<p class="small muted">Aus Tagebuch, Bewertungen, Plan und Fotos entsteht ein Vorschlag zum Durchblättern und Ausprobieren. Er wird nicht gespeichert. Buchungsnummern, Zahlungen und Notizen kommen nie ins Buch.</p>'+
  '<div class="row"><label class="field"><span>Reise</span><select id="book-trip" data-book-trip>'+list.map(t=>'<option value="'+esc(t.id)+'"'+(t.id===sel?' selected':'')+'>'+esc(t.title||'Ohne Titel')+' · '+esc(rangeText(t))+'</option>').join('')+'</select></label>'+
  '<button type="button" class="btn" data-book-act="make">'+(B?'Neuen Entwurf erzeugen':'Entwurf erzeugen')+'</button></div>';
 if(UI.bookError)h+='<div class="note" role="alert">'+esc(UI.bookError)+'</div>';
 if(!B)return h+'</section>';
 const st=B.st,b=st.book,n=b.pages.length,i=Math.max(0,Math.min(n-1,B.i)),p=b.pages[i],E=R.E;
 const btn=(act,label,extra,dis)=>'<button type="button" class="btn ghost sm" data-book-act="'+act+'"'+(extra||'')+(dis?' disabled':'')+'>'+label+'</button>';
 h+='<div class="book-draft" data-book-draft="'+esc(b.id)+'">'+
  '<p class="note" role="note"><b>Entwurf, nicht gespeichert.</b> Änderungen gelten nur bis zum Neuladen der Seite oder bis ihr eine andere Reise wählt.</p>'+
  reisebuchInfo(B.info).map(x=>'<p class="small muted" data-book-info>'+esc(x)+'</p>').join('')+
  '<h3>'+esc(b.title)+'</h3>'+(b.subtitle?'<p class="small">'+esc(b.subtitle)+'</p>':'')+
  '<div class="row" role="group" aria-label="Seiten blättern">'+btn('prev','← Vorherige Seite','',i===0)+'<span class="small" tabindex="-1" aria-live="polite" data-book-pos>Seite '+(i+1)+' von '+n+'</span>'+btn('next','Nächste Seite →','',i===n-1)+'</div>'+
  '<div class="book-page" data-book-page="'+esc(p.id)+'">'+R.B.renderHtml({theme:b.theme,format:b.format,pages:[p]},{mediaUrl:id=>typeof reisebuchPhotoUrl==='function'?reisebuchPhotoUrl(id):null})+'</div>'+
  (B.msg?'<p class="small" role="status" data-book-msg>'+esc(B.msg)+'</p>':'<p class="small" role="status" data-book-msg></p>')+
  (B.confirm?'<div class="row">'+btn('layout-confirm','Trotzdem wechseln')+btn('layout-cancel','Abbrechen')+'</div>':'')+
  '<details class="book-tools"><summary>Seite bearbeiten</summary>'+
   '<div class="row" role="group" aria-label="Seite verschieben und löschen">'+btn('up','Nach vorn','',i===0)+btn('down','Nach hinten','',i===n-1)+btn('insert','Neue Textseite danach')+btn('del','Seite löschen','',n<=1)+'</div>'+
   '<div class="row"><label class="field"><span>Layout</span><select id="book-layout">'+E.layoutChoices(st,p.id).filter(c=>c.allowed).map(c=>'<option value="'+c.layout+'"'+(c.current?' selected':'')+'>'+esc(c.name)+(c.dropsPhotos?' (nimmt '+c.dropsPhotos+' Foto'+(c.dropsPhotos===1?'':'s')+' von der Seite)':'')+'</option>').join('')+'</select></label>'+btn('layout','Layout übernehmen')+'</div>'+
   '<div class="row"><label class="field"><span>Überschrift der Seite</span><input id="book-heading" maxlength="120" value="'+esc(p.heading||'')+'"></label>'+btn('heading','Überschrift übernehmen')+'</div>'+
   reisebuchSlots(st,p,E)+
   '<div class="row"><label class="field"><span>Buchtitel</span><input id="book-title" maxlength="120" value="'+esc(b.title)+'"></label>'+btn('title','Titel übernehmen')+'</div>'+
  '</details>'+
  '<div class="row" role="group" aria-label="Rückgängig">'+btn('undo','Rückgängig','',!E.canUndo(st))+btn('redo','Wiederholen','',!E.canRedo(st))+btn('discard','Entwurf schließen')+'</div>'+
  (B.warnings&&B.warnings.length?'<ul class="small plain" data-book-warn>'+B.warnings.map(w=>reisebuchWarnText(w,b.pages)).filter(Boolean).map(x=>'<li>Hinweis: '+esc(x)+'</li>').join('')+'</ul>':'')+
  '<details><summary>Alle Seiten ('+n+')</summary><ol class="plain book-pages">'+b.pages.map((q,k)=>'<li><button type="button" class="lnk" data-book-act="goto" data-i="'+k+'"'+(k===i?' aria-current="page"':'')+'>'+esc(reisebuchPageLabel(q,k))+'</button></li>').join('')+'</ol></details>'+
  '</div>';
 return h+'</section>';
}
/* Foto tauschen und Bildunterschrift je Platz; nur wenn die Reise Fotos hat */
function reisebuchSlots(st,p,E){
 if(!p.slots.length||!st.media.length)return '';
 const choices=E.photoChoices(st,p.id);
 return p.slots.map((s,j)=>'<div class="row" role="group" aria-label="Bildplatz '+(j+1)+'"><label class="field"><span>Foto '+(j+1)+'</span><select id="book-photo-'+j+'"><option value="">(leer)</option>'+
  choices.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===s.mediaId?' selected':'')+'>'+esc((c.caption||'Foto '+c.id)+(c.sameDay?' · dieser Tag':'')+(c.fav?' · Lieblingsfoto':'')+(c.used&&c.id!==s.mediaId?' · schon im Buch':''))+'</option>').join('')+
  '</select></label><button type="button" class="btn ghost sm" data-book-act="photo" data-slot="'+j+'">Foto übernehmen</button>'+
  (s.mediaId?'<label class="field"><span>Bildunterschrift '+(j+1)+'</span><input id="book-caption-'+j+'" maxlength="500" value="'+esc(s.caption||'')+'"></label><button type="button" class="btn ghost sm" data-book-act="caption" data-slot="'+j+'">Unterschrift übernehmen</button>':'')+
  '</div>').join('');
}

/* ---------- Bedienung ---------- */
/* Führt eine Aktion aus; liefert den Selektor, auf den danach der Fokus soll. Ohne DOM testbar über val(id). */
function reisebuchAct(act,data,val){
 const R=RBK();if(!R)return null;
 UI.bookError='';
 if(act==='make'){
  const t=Store.get(val('book-trip'));if(!t){UI.bookError='Reise nicht gefunden.';return '[data-book-act="make"]'}
  const r=reisebuchMake(t,data.now);
  if(!r.ok){UI.book=null;UI.bookError='Entwurf ging nicht: '+r.error;return '[data-book-act="make"]'}
  UI.book=r.book;return '[data-book-pos]';
 }
 const B=UI.book;if(!B)return null;
 const E=R.E,st=B.st,p=st.book.pages[B.i],n=st.book.pages.length;
 const run=(op,msg,move)=>{
  if(data.now)op.at=data.now;else op.at=new Date().toISOString();
  const r=E.apply(st,op);
  if(r.code==='bestaetigen'){B.confirm=op;B.msg=r.error;return}
  B.confirm=null;
  if(!r.ok){B.msg=r.error;return}
  B.st=r.state;B.warnings=r.warnings;B.msg=msg;
  const k=r.page?E.pageIndex(r.state,r.page):-1;B.i=move!=null?move:k>=0?k:Math.min(B.i,r.state.book.pages.length-1);
 };
 switch(act){
  case 'prev':B.i=Math.max(0,B.i-1);B.msg='';return '[data-book-act="prev"]:not([disabled])|[data-book-pos]';
  case 'next':B.i=Math.min(n-1,B.i+1);B.msg='';return '[data-book-act="next"]:not([disabled])|[data-book-pos]';
  case 'goto':{const k=Number(data.i);if(Number.isInteger(k)&&k>=0&&k<n){B.i=k;B.msg=''}return '[data-book-pos]'}
  case 'up':run({type:'move',pageId:p.id,by:-1},'Seite nach vorn verschoben.');return '[data-book-act="up"]:not([disabled])|[data-book-pos]';
  case 'down':run({type:'move',pageId:p.id,by:1},'Seite nach hinten verschoben.');return '[data-book-act="down"]:not([disabled])|[data-book-pos]';
  case 'del':run({type:'delete',pageId:p.id},'Seite „'+(p.heading||reisebuchKindName(p.kind))+'“ gelöscht. Rückgängig ist möglich.',Math.min(B.i,n-2));return '[data-book-pos]';
  case 'insert':run({type:'insert',after:p.id,layout:'nur-text',heading:'Eigene Seite'},'Neue Textseite eingefügt.');return '#book-heading';
  case 'layout':run({type:'layout',pageId:p.id,layout:val('book-layout')},'Layout geändert.');return B.confirm?'[data-book-act="layout-confirm"]':'#book-layout';
  case 'layout-confirm':{const op=B.confirm;if(!op)return null;delete op.at;op.confirm=true;run(op,'Layout geändert. Rückgängig holt die Fotos zurück.');return '#book-layout'}
  case 'layout-cancel':B.confirm=null;B.msg='Layout nicht geändert.';return '#book-layout';
  case 'heading':run({type:'heading',pageId:p.id,text:val('book-heading')},'Überschrift geändert.');return '#book-heading';
  case 'title':run({type:'title',text:val('book-title')},'Buchtitel geändert.');return '#book-title';
  case 'photo':{const j=Number(data.slot),v=val('book-photo-'+j);run({type:'photo',pageId:p.id,slot:j,mediaId:v?v:null},v?'Foto getauscht.':'Foto von der Seite genommen.');return '#book-photo-'+j}
  case 'caption':{const j=Number(data.slot);run({type:'caption',pageId:p.id,slot:j,text:val('book-caption-'+j)},'Bildunterschrift geändert.');return '#book-caption-'+j}
  case 'undo':{const r=E.undo(st);if(r.ok){B.st=r.state;B.warnings=r.warnings;B.i=Math.min(B.i,r.state.book.pages.length-1);B.msg='Rückgängig gemacht.'}else B.msg=r.error;B.confirm=null;return '[data-book-act="undo"]:not([disabled])|[data-book-act="redo"]'}
  case 'redo':{const r=E.redo(st);if(r.ok){B.st=r.state;B.warnings=r.warnings;B.i=Math.min(B.i,r.state.book.pages.length-1);B.msg='Wiederholt.'}else B.msg=r.error;B.confirm=null;return '[data-book-act="redo"]:not([disabled])|[data-book-act="undo"]'}
  case 'discard':UI.book=null;return '[data-book-act="make"]';
 }
 return null;
}
if(typeof document!=='undefined')document.addEventListener('click',e=>{
 const el=e.target&&e.target.closest?e.target.closest('[data-book-act]'):null;if(!el||UI.view!=='erinnerungen')return;
 const val=id=>{const x=document.querySelector('#'+id);return x?x.value:''};
 const focus=reisebuchAct(el.getAttribute('data-book-act'),{i:el.getAttribute('data-i'),slot:el.getAttribute('data-slot')},val);
 render();if(focus)navFocus(focus);
});
if(typeof document!=='undefined')document.addEventListener('change',e=>{
 /* Andere Reise gewählt: alter Entwurf wird verworfen (er gehört zur vorigen Reise) */
 if(e.target&&e.target.id==='book-trip'&&UI.book&&UI.book.tid!==e.target.value){UI.book=null;UI.bookError='';render();navFocus('#book-trip')}
});
