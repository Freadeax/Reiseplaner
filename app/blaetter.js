/* Reiseplaner · Blätter (Sheets).
   Teil 11 von 22 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Blätter ================= */
let sheetOpener=null,sheetScroll=null;
/* Nur an den Dialoggrenzen umschalten; die normale Tab-Reihenfolge bleibt erhalten. */
function sheetTabTarget(nodes,current,backwards){
 if(!nodes.length)return null;
 const first=nodes[0],last=nodes[nodes.length-1];
 if(!nodes.includes(current))return backwards?last:first;
 if(backwards&&current===first)return last;
 if(!backwards&&current===last)return first;
 return null;
}
function openSheet(html){
 UI.templatePreview=null;
 if(!$('.sheet'))sheetOpener=document.activeElement||null;
 if(document.body&&document.body.style&&sheetScroll===null){sheetScroll=document.body.style.overflow||'';document.body.style.overflow='hidden'}
 UI.secureJob=(UI.secureJob||0)+1;
 $('#sheet-root').innerHTML='<div class="sheet-bg" data-act="sheet-bg"><div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="sheet-grip" data-sheet-grip aria-hidden="true"><span></span></div><button type="button" class="x" data-act="sheet-x" aria-label="Schließen">Schließen ✕</button>'+html+'</div></div>';
 const s=$('.sheet');if(!s)return;
 sheetGripBind(s);
 const title=s.querySelector('h1,h2');
 if(title){title.id='rp-sheet-title';s.setAttribute('aria-labelledby',title.id)}else s.setAttribute('aria-label','Details');
 if(s.focus)s.focus();
}
/* P0.5 Zieh-Griff: Herunterziehen schließt das Blatt, nur als Ergänzung zum Schließen-Knopf.
   Entscheidung rein rechnerisch (Node-prüfbar): weit genug gezogen oder schnell genug nach unten gewischt. */
function sheetDragDecision(dy,ms,height){
 dy=Number(dy)||0;ms=Math.max(1,Number(ms)||1);height=Math.max(1,Number(height)||1);
 if(dy<=0)return 'stay';
 if(dy>=Math.min(140,height*0.3))return 'close';
 if(dy>=40&&dy/ms>=0.6)return 'close';
 return 'stay';
}
function sheetGripBind(s){
 const grip=s.querySelector&&s.querySelector('[data-sheet-grip]');
 if(!grip||!grip.addEventListener||typeof window==='undefined'||!('PointerEvent' in window))return;
 let start=null;
 const reset=()=>{s.style.transform='';s.classList.remove('dragging');start=null};
 grip.addEventListener('pointerdown',e=>{
  if(e.button!=null&&e.button!==0)return;
  start={y:e.clientY,t:Date.now(),id:e.pointerId};s.classList.add('dragging');
  try{grip.setPointerCapture(e.pointerId)}catch(err){}
 });
 grip.addEventListener('pointermove',e=>{if(!start||e.pointerId!==start.id)return;const dy=Math.max(0,e.clientY-start.y);s.style.transform=dy?'translateY('+dy+'px)':''});
 const end=e=>{
  if(!start||e.pointerId!==start.id)return;
  const decision=e.type==='pointerup'?sheetDragDecision(e.clientY-start.y,Date.now()-start.t,s.getBoundingClientRect().height):'stay';
  reset();if(decision==='close')closeSheet();
 };
 grip.addEventListener('pointerup',end);grip.addEventListener('pointercancel',end);
}
/* P0.5 Bildschirmtastatur: Das aktive Feld bleibt sichtbar. Ohne visualViewport (ältere Browser, Node) passiert nichts. */
function fieldHidden(rect,vv,margin){
 if(!rect||!vv)return false;margin=margin==null?12:margin;
 const top=Number(vv.offsetTop)||0,bottom=top+(Number(vv.height)||0);
 return rect.bottom>bottom-margin||rect.top<top+margin;
}
function keepFieldVisible(onlyVars){
 if(typeof window==='undefined'||!window.visualViewport||typeof document==='undefined')return false;
 const vv=window.visualViewport,root=document.documentElement;
 if(root&&root.style&&root.style.setProperty){root.style.setProperty('--rp-vvh',Math.round(vv.height)+'px');root.style.setProperty('--rp-vvtop',Math.round(vv.offsetTop)+'px')}
 /* Wer hineinzoomt und verschiebt, will woanders hinsehen: dann nie zurückholen. */
 if(onlyVars===true||(vv.scale!=null&&Math.abs(Number(vv.scale)-1)>0.01))return false;
 const el=document.activeElement;
 if(!el||!el.matches||!el.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),textarea,select,[contenteditable="true"]'))return false;
 if(!fieldHidden(el.getBoundingClientRect(),vv))return false;
 try{el.scrollIntoView({block:'center',inline:'nearest'})}catch(e){try{el.scrollIntoView(false)}catch(err){}}
 return true;
}
try{if(typeof window!=='undefined'&&window.visualViewport&&window.visualViewport.addEventListener){
 /* Nur wenn der sichtbare Bereich schrumpft (Tastatur kommt) oder nach dem Fokus bei wahrscheinlicher Bildschirmtastatur
    wird gerollt; Verschieben (scroll) aktualisiert nur die Maße. */
 const vv=window.visualViewport;let vvTimer=0,lastH=Number(vv.height)||0;
 const vvRun=only=>{clearTimeout(vvTimer);vvTimer=setTimeout(()=>keepFieldVisible(only),60)};
 vv.addEventListener('resize',()=>{const h=Number(vv.height)||0,shrank=h<lastH-40;lastH=h;vvRun(!shrank)});
 vv.addEventListener('scroll',()=>vvRun(true));
 const keyboardLikely=()=>{try{if(window.matchMedia&&window.matchMedia('(pointer: coarse)').matches)return true}catch(e){}return !!(window.innerHeight&&vv.height<window.innerHeight*0.85)};
 document.addEventListener('focusin',()=>setTimeout(()=>keepFieldVisible(!keyboardLikely()),300));
}}catch(e){}
function closeSheet(){
 if(v3Editor)v3Editor.close();
 if(splitEditor)try{splitEditor.close()}catch(e){}
 UI.offerSource=null;UI.offerScope=null;UI.offerDraft=null;
 UI.templatePreview=null;
 UI.routeEndpointDraft=null;UI.savingDraft=null;UI.secureJob=(UI.secureJob||0)+1;UI.importRead=(UI.importRead||0)+1;UI.securePayload=null;UI.encryptedImport=null;UI.importDraft=null;UI.archive=null;
 $('#sheet-root').innerHTML='';const opener=sheetOpener;sheetOpener=null;
 if(sheetScroll!==null&&document.body&&document.body.style){document.body.style.overflow=sheetScroll;sheetScroll=null}
 if(opener&&opener.isConnected!==false&&opener.focus)opener.focus();
 else if(opener){const view=$('#view');if(view&&view.focus)view.focus()}
}
function sheetKeydown(e){
 const sheet=$('.sheet');if(!sheet)return;
 if(e.key==='Escape'){e.preventDefault();closeSheet();return}
 if(e.key!=='Tab')return;
 const nodes=Array.from(sheet.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')).filter(el=>el.tabIndex>=0&&!el.closest('[hidden],[inert]')&&el.getClientRects().length);
 const target=sheetTabTarget(nodes,document.activeElement,e.shiftKey);
 if(target){e.preventDefault();target.focus()}else if(!nodes.length){e.preventDefault();sheet.focus()}
}
/* Tagesauswahl in Blättern: höchstens VIEW_DAYS Tage (Paket 1); ein schon gewählter späterer Tag bleibt wählbar, damit nichts still verschoben wird */
function dayOptions(t,sel){
  const all=daysOf(t),list=viewDays(t).slice();
  if(Number.isInteger(sel)&&sel>=list.length&&all[sel])list.push(all[sel]);
  return list.map(d=>'<option value="'+d.i+'"'+(d.i===sel?' selected':'')+'>'+esc(d.label)+'</option>').join('');
}
function sheetAct(t,id,preDay,preSlot){
  const a=actOf(t,id); if(!a) return;
  const days=daysOf(t), c=actCost(t,a), planned=sortedItems(t).filter(i=>i.act===id);
  const firstFree=()=>{for(const d of viewDays(t)){if(d.i===0&&a.slot==='morgen')continue;if(!(t.items||[]).some(i=>i.day===d.i&&i.slot===a.slot))return d.i}return 0};
  const dDay=preDay!=null?preDay:(a.onlyDate?(days.find(d=>d.md===a.onlyDate)||{i:firstFree()}).i:firstFree());
  const dSlot=preSlot||a.slot||'nachm';
  openSheet('<span class="eyebrow">'+esc(CAT[a.cat||'eigen'])+(a.ort?' · '+esc(a.ort):'')+'</span><h2>'+esc(a.t)+'</h2><p>'+esc(a.s||a.note||'')+'</p>'+
   '<div class="badges">'+(a.dur?'<span class="badge">'+esc(a.dur)+'</span>':'')+(a.indoor?'<span class="badge">drinnen</span>':'')+(a.book?'<span class="badge">vorher buchen</span>':'')+(a.custom?'':srcBadge(a.src))+'</div>'+
   '<div class="kpis"><div class="kpi"><small>Kosten für euch</small><b class="num" style="font-size:1.2rem">'+esc(c.txt)+'</b></div>'+(openHoursText(a)?'<div class="kpi"><small>Zeiten</small><b style="font-size:1.05rem">'+esc(openHoursText(a))+'</b></div>':'')+'</div>'+
   (a.warn?'<div class="note" style="background:var(--surface-2)"><b style="color:var(--bad)">Hinweis</b><p>'+esc(a.warn)+'</p></div>':'')+
   (a.steps&&a.steps.length?'<h4>Ablauf</h4><ol class="steps">'+a.steps.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ol>':'')+
   (a.tips&&a.tips.length?'<h4>Tipps</h4><ul class="plain">'+a.tips.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':'')+
   (a.bring&&a.bring.length?'<h4>Mitnehmen</h4><ul class="plain">'+a.bring.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':'')+
   '<div class="row">'+(a.links||[]).map(l=>lk(l[1],l[0])).join('')+(a.link?lk(a.link,'Link'):'')+(a.map?lk(mp(a.map),'Karte'):'')+'</div>'+
   (planned.length?'<h4>Eingeplant</h4><div class="checks-list">'+planned.map(i=>'<div class="chk info"><span>'+esc((days[i.day]||{label:'außerhalb'}).label+' · '+SLOTNAME[i.slot])+'</span><button type="button" class="lnk" style="margin-left:auto" data-act="item-del" data-val="'+i.uid+'">Entfernen</button></div>').join('')+'</div>':'')+
   '<div class="panel"><h4>Einplanen</h4>'+longTripNote(t,'Die Tagesauswahl')+'<div class="form"><label class="fld"><span>Tag</span><select id="pl-day">'+dayOptions(t,dDay)+'</select></label><label class="fld"><span>Tageszeit</span><select id="pl-slot">'+SLOTS.map(s=>'<option value="'+s[0]+'"'+(s[0]===dSlot?' selected':'')+'>'+s[1]+'</option>').join('')+'</select></label></div><button type="button" class="btn" data-act="plan-do" data-val="'+esc(a.id)+'">In den Tagesplan</button></div>'+
   (a.custom&&a.costOpen&&!num(a.cost,0)?'<div class="panel"><h4>Preis eintragen</h4><p class="small muted">Aus dem Katalog übernommen, Preis noch offen. Tragt ein, was ihr beim Anbieter gefunden habt.</p><div class="form"><label class="fld"><span>Kosten (€)</span><input type="number" min="0" step="0.5" id="ap-cost"></label><label class="fld"><span>gilt</span><select id="ap-per"><option value="pp">pro Person</option><option value="grp">gesamt</option></select></label></div><div class="row"><button type="button" class="btn sm" data-act="act-price" data-val="'+esc(a.id)+'">Preis speichern</button><button type="button" class="btn ghost sm" data-act="act-free" data-val="'+esc(a.id)+'">Ist kostenlos</button></div></div>':'')+
   (a.custom&&!a.transit?'<div class="row"><button type="button" class="btn ghost sm" data-act="act-edit" data-val="'+esc(a.id)+'">Bearbeiten</button><button type="button" class="btn ghost sm" data-act="act-del" data-val="'+esc(a.id)+'">Eigene Unternehmung löschen</button></div>':''));
}
function sheetSlot(t,day,slot){
  const d=daysOf(t)[day]; let list=actsFor(t);
  list.sort((a,b)=>(a.slot===slot?0:1)-(b.slot===slot?0:1));
  openSheet('<span class="eyebrow">'+esc(d?d.label:'')+' · '+SLOTNAME[slot]+'</span><h2>Was wollt ihr machen?</h2>'+
   (list.length?'<div class="checks-list">'+list.map(a=>'<button type="button" class="chk info" style="cursor:pointer;text-align:left" data-act="slot-pick" data-val="'+esc(a.id)+'|'+day+'|'+slot+'"><span style="border-left:4px solid '+CATCOL[a.cat||'eigen']+';padding-left:8px"><b>'+esc(a.t)+'</b><br><small class="muted">'+esc(CAT[a.cat||'eigen'])+(a.dur?' · '+esc(a.dur):'')+' · '+esc(actCost(t,a).txt)+'</small></span></button>').join('')+'</div>':'<div class="empty">Noch keine Unternehmungen. Legt im Bereich Unternehmungen eigene an.</div>'));
}
function sheetItem(t,u){
  const it=(t.items||[]).find(i=>i.uid===u); if(!it) return; const a=actOf(t,it.act), days=daysOf(t);
  openSheet('<span class="eyebrow">Im Tagesplan</span><h2>'+esc(a?a.t:'')+'</h2>'+longTripNote(t,'Die Tagesauswahl')+'<div class="form"><label class="fld"><span>Tag</span><select id="mv-day">'+dayOptions(t,it.day)+'</select></label><label class="fld"><span>Tageszeit</span><select id="mv-slot">'+SLOTS.map(s=>'<option value="'+s[0]+'"'+(s[0]===it.slot?' selected':'')+'>'+s[1]+'</option>').join('')+'</select></label><label class="fld"><span>Uhrzeit (optional)</span><input type="time" id="mv-time" value="'+esc(it.time||'')+'"></label></div><p class="small muted">Mit Uhrzeit wird die Tageszeit automatisch passend gesetzt. Leeres Feld entfernt die Uhrzeit.</p>'+
   '<div class="row"><button type="button" class="btn" data-act="item-move" data-val="'+u+'">Verschieben</button><button type="button" class="btn ghost" data-act="act-view" data-val="'+esc(it.act)+'">Details</button><button type="button" class="btn warn" data-act="item-del" data-val="'+u+'">Entfernen</button></div>'+
   (a&&a.catalogSpot&&!a.indoor&&CATX?'<div class="panel" id="rain-twin"><h4>☂ Regenzwilling</h4><p class="small muted">Drinnen-Alternativen in der Nähe. Sie werden nur eingeplant, wenn ihr tauscht; die Draußen-Idee bleibt in der Ideenliste.</p><div class="row"><button type="button" class="btn ghost sm" data-act="rain-twin" data-val="'+u+'">Alternativen zeigen</button></div></div>':''));
}
/* Regenzwilling (Vorschlag aus DESIGN_CATALOG.md): Alternativen aus dem Katalog, Tausch nur bewusst und ohne gebuchte Termine */
async function rainTwinShow(t,u){
  const it=(t.items||[]).find(i=>i.uid===u),a=it&&actOf(t,it.act),box=$('#rain-twin');if(!a||!box)return;
  try{
    const own=await catSpotPlace(a.catalogSpot).catch(()=>null);
    const near=own?await catLoadForQuery({lat:own.lat,lon:own.lon,maxKm:150}).catch(()=>catLoadLocal()):await catLoadLocal();
    const places=near.places.map(CATX.normPlace),hit=CATX.findSpot(places,a.catalogSpot);
    if(!hit)throw new Error('Idee nicht mehr im Katalog.');
    const month=t.dateMode==='fix'&&pd(t.start)?pd(t.start).getUTCMonth()+1:t.dateMode==='flex'&&t.month?+t.month.slice(5,7):null;
    const ex={};(t.customActs||[]).forEach(c=>{if(c.catalogSpot&&(t.items||[]).some(i=>i.act===c.id))ex[c.catalogSpot]=true});
    const list=CATX.rainTwins(hit.spot,places,{month,exclude:ex});
    UI.rainDraft={u,trip:t.id,source:JSON.stringify(t.items||[]),list};
    box.innerHTML='<h4>☂ Regenzwilling für „'+esc(a.t)+'“</h4>'+(list.length?'<div class="checks-list">'+list.map((x,i)=>'<div class="chk info"><span><strong>'+esc(x.spot.name)+'</strong> <span class="small muted">'+esc(x.place.name)+' · ≈ '+x.roadKm+' km von der Draußen-Idee · ca. '+String(x.spot.hours).replace('.',',')+' Std.</span><br><small>'+esc(x.spot.summary)+'</small></span><button type="button" class="btn sm" style="margin-left:auto" data-act="rain-swap" data-val="'+i+'">Bei Regen stattdessen</button></div>').join('')+'</div>':'<p class="small">Keine Drinnen-Idee aus dem Katalog im Umkreis von 30 km. Plan B im Überblick zeigt eigene Drinnen-Ideen.</p>');
  }catch(e){box.innerHTML='<p class="small">'+esc(e.message)+'</p>'}
}
function rainSwap(t,draft,index){
  if(!draft||draft.trip!==t.id||draft.source!==JSON.stringify(t.items||[]))throw new Error('Der Tagesplan hat sich geändert. Bitte neu öffnen.');
  const x=draft.list[index],it=(t.items||[]).find(i=>i.uid===draft.u);if(!x||!it)throw new Error('Alternative nicht mehr verfügbar.');
  const old=actOf(t,it.act),c=clone(t),na=CATX.toAct(x.spot,x.place,uid);
  na.km=num(old&&old.km,0)+(x.airKm>2?x.roadKm*2:0);na.note+=' Regen-Alternative zu „'+(old?old.t:'')+'“.';
  c.customActs=(c.customActs||[]).concat([na]);c.items.find(i=>i.uid===it.uid).act=na.id;
  const iss=typeof commitmentIssues==='function'?commitmentIssues(t,c):[];
  if(iss.length)throw new Error('Nicht getauscht: '+iss.join(' · '));
  t.customActs=c.customActs;t.items=c.items;t.packageId='';return na;
}
function sheetPkg(t,id){
  const p=PKGS.find(x=>x.id===id), tmp=applyPkg(clone(t),p), days=daysOf(tmp), st=STAYS.find(s=>s.id===p.stay), c=cost(tmp);
  openSheet('<span class="eyebrow">'+esc(PLACES[p.place].name)+' · '+(p.kurs?'mit Kurs':'ohne Kurs')+'</span><h2>'+esc(p.name)+'</h2><p>'+esc(p.pitch)+'</p><p class="small"><b>Unterkunft:</b> '+esc(st.name)+' ('+esc(st.ab)+')</p>'+
   days.map(d=>{const its=sortedItems(tmp).filter(i=>i.day===d.i);return '<div class="card"><h4>'+esc(d.label)+'</h4>'+(its.length?'<ul class="plain small">'+its.map(i=>'<li><b>'+SLOTNAME[i.slot]+':</b> '+esc(ACTS[i.act].t)+'</li>').join('')+'</ul>':'<p class="small muted">'+(d.i===days.length-1?'Abreise':'frei')+'</p>')+'</div>'}).join('')+
   '<div class="between"><span class="price num">'+eur(c.total)+'</span><span class="small muted">'+eur(c.total/c.P)+' p. P.</span></div>'+(t.packageId===p.id?'<span class="badge ok">übernommen</span>':'<button type="button" class="btn" data-act="pkg-apply" data-val="'+p.id+'">Übernehmen (ersetzt den aktuellen Plan)</button>'));
}
function sheetEdit(t){
  UI.edit=clone(t);UI.editSource=JSON.stringify(t);
  openSheet('<h2>Eckdaten</h2><div id="editform">'+tripForm(UI.edit,'e-')+'</div><button type="button" class="btn" data-act="edit-save">Speichern</button>');
}
function sheetImport(){
  const trips=UI.importDraft;if(!trips)return;
  const conflicts=trips.filter(t=>Store.get(t.id)).length;
  const rows=importPreview(trips);
  openSheet('<span class="eyebrow">Sicherung prüfen · '+(UI.importProtected?'Passwortschutz geöffnet':'Unverschlüsselte Datei')+'</span><h2>'+trips.length+' Reisen gefunden</h2><p class="small muted">'+esc(UI.importInfo||'')+'</p><p>'+conflicts+' davon haben bereits dieselbe Reise-ID auf diesem Gerät. Bestehende Reisen werden nicht überschrieben.</p>'+rows.map(r=>'<article class="panel"><h3>'+esc(r.title)+'</h3><p>'+esc(r.state)+(r.changed.length?' · Abweichungen: '+esc(r.changed.join(', ')):'')+'</p><p class="small">'+esc(r.range)+' · '+r.persons+' Personen · '+r.items+' Programmpunkte · '+r.offers+' Angebote · '+r.profiles+' Suchprofile</p></article>').join('')+'<p class="small muted">„Als Kopie“ erhält auch identische Reisen zusätzlich. Die ursprüngliche Reise bleibt unverändert. Kein automatisches Zusammenführen von Buchungen oder Angeboten.</p><div class="row"><button type="button" class="btn" data-act="import-skip">Nur neue Reisen importieren</button>'+(conflicts?'<button type="button" class="btn ghost" data-act="import-copy">Vorhandene zusätzlich als Kopie importieren</button>':'')+'<button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div><p id="import-error" role="alert"></p>');
}

