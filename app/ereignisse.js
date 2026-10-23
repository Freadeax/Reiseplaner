/* Reiseplaner · Ereignisse.
   Teil 17 von 25 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Ereignisse ================= */
function setField(obj,f,v){
  if(['persons','nights','budget','km','routeKm','ticket','verb','preis','stayQuote'].includes(f)&&num(v,0)<0){alertMsg('Negative Werte sind nicht erlaubt.');return;}
  if(['persons','nights'].includes(f)){obj[f]=Math.max(f==='persons'?1:0,Math.round(num(v,0)));return;}
  if(['persons','nights','budget','km','routeKm','ticket'].includes(f)){obj[f]=Math.max(0,num(v,0));if(f==='km'){delete obj.kmSrc;delete obj.routeMin;delete obj.routeHomeMin;delete obj.routeAt}}
  else if(['verb','preis'].includes(f)) obj[f]=num(v,f==='verb'?7.5:2.15);
  else if(f==='stayQuote') obj[f]=num(v,0)>0?num(v,0):null;
  else if(f==='tz'){if(v===''||!validTz(v))delete obj.tz;else obj.tz=v;}
  else if(f==='departTime'||f==='checkinTime'){if(v==='')delete obj[f];else if(TIME_RE.test(v))obj[f]=v;else alertMsg('Bitte eine gültige Uhrzeit (HH:MM) eingeben.');}
  else{if(obj[f]!==v){if(f==='origin')delete obj.originGeo;if(f==='dest')delete obj.destGeo}obj[f]=v;}
}
document.addEventListener('click',async e=>{
  if(e.target.closest('.skip-link')){e.preventDefault();const view=$('#view');if(view)view.focus();return}
  const g=e.target.closest('[data-go]'); if(g){e.preventDefault();UI.confirm=null;go(g.getAttribute('data-go'));return}
  const b=e.target.closest('[data-act]'); if(!b) return;
  const act=b.getAttribute('data-act'), val=b.getAttribute('data-val'), t=cur();
  if(act==='reload-app'){try{if(navigator.serviceWorker&&navigator.serviceWorker.getRegistration)navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).catch(()=>{}).finally(()=>location.reload());else location.reload()}catch(e){location.reload()}return}
  if(act==='appearance-open'||act==='appearance-set')return;
  if(act==='trip-filter'){UI.tripFilter=Object.prototype.hasOwnProperty.call(SHELF_FILTERS,val)?val:'all';render();return}
  if(act==='trip-reset'){UI.tripFilter='all';UI.tripQuery='';UI.tripSort='next';render();return}
  if(act==='corrupt-download'&&Store.corruptRaw!==null){downloadText(Store.corruptRaw,'Reiseplaner-Rohdaten-'+new Date().toISOString().slice(0,10)+'.txt','text/plain;charset=utf-8');return}
  if(act==='corrupt-confirm'&&Store.corruptRaw!==null){UI.confirm='corrupt-reset';render();return}
  if(act==='corrupt-cancel'){UI.confirm=null;render();return}
  if(act==='corrupt-reset'&&UI.confirm==='corrupt-reset'){
    if(Store.resetCorrupt()){UI.confirm=null;render();alertMsg('Lokaler Speicher zurückgesetzt.')}else alertMsg('Zurücksetzen fehlgeschlagen. Die Rohdaten bleiben erhalten.');return;
  }
  if(Store.corruptRaw!==null){alertMsg('Änderungen gesperrt: Bitte zuerst die Rohdaten sichern.');return}
  if(act==='backup-all'){downloadBackup(Store.list());return}
  if(act==='import-open'){$('#import-file').click();return}
  if(act==='import-skip'||act==='import-copy'){
    if(b.disabled)return;b.disabled=true;
    f4ImportTrips(act==='import-skip'?'skip':'copy').then(added=>{UI.importDraft=null;closeSheet();render();alertMsg(added.length+' Reisen importiert. Bestehende Reisen blieben unverändert.');},err=>{b.disabled=false;const box=$('#import-error');if(box)box.textContent=err.message;else alertMsg(err.message);});return;
  }
  const invalid=[...document.querySelectorAll('input[type=number]')].find(x=>x.value!==''&&!x.checkValidity());if(invalid){invalid.reportValidity();return;}
  if(act==='check'||act==='online'||act==='card-confirm'||act==='mappe-notes') return; /* über change */
  if(act==='sheet-bg'&&e.target!==b) return;
  if(act==='sheet-bg'||act==='sheet-x'){closeSheet();return}
  /* Entwurf / Eckdaten-Formular */
  const pm=act.match(/^(d|e)-(type|dm|travel|catalog)$/);
  if(pm){const o=pm[1]==='d'?UI.draft:UI.edit;const k={type:'type',dm:'dateMode',travel:'travel',catalog:'catalog'}[pm[2]];if(k==='type')applyType(o,val);else o[k]=val;
    if(k==='dateMode'&&val==='fix'&&!o.start){const n=new Date();o.start=iso(new Date(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate()+30)));o.end=iso(new Date(pd(o.start).getTime()+864e5*Math.max(o.type==='tag'?0:1,num(o.nights,3))))}
    const host=pm[1]==='d'?$('#draft'):$('#editform');if(pm[1]==='d'){render()}else host.innerHTML=tripForm(o,'e-');return}
  if(act==='create'){const d=UI.draft;if(d.dateMode==='fix'&&!(pd(d.start)&&pd(d.end)&&pd(d.end)>=pd(d.start))){alertMsg('Bitte gültige Daten wählen: Abreise nicht vor Anreise.');return}if(tripLengthError(d)){alertMsg(tripLengthError(d));return}d.id=uid('t');save(d,true);UI.draft=null;go('r-'+d.id+'-'+(d.catalog==='allgaeu'?'angebote':'unterkunft'));return}
  if(act==='tpl-silvester'||act==='tpl'){try{sheetTemplate(act==='tpl'?val:'silvester')}catch(err){alertMsg(err.message)}return}
  if(act==='tpl-apply'){try{const r=commitTemplatePreview(val);UI.draft=null;closeSheet();go(r.route)}catch(err){const el=$('#template-error');if(el)el.textContent=err.message;else alertMsg(err.message)}return}
  if(!t) return;
  switch(act){
   case 'backup-trip': downloadBackup([t]);return;
   case 'rain-plan':{const [id,d]=val.split('|');sheetAct(t,id,+d);return}
   case 'mappe-print': try{window.print()}catch(err){alertMsg('Drucken wird hier nicht unterstützt. Bitte im Browser öffnen.')}return;
   case 'mappe-ics':{const d=icsData(t,undefined,{reminders:true});if(!d){alertMsg('Kalenderexport braucht feste Reisedaten.');return}downloadText(d.text,fileSafe(t.title)+'.ics','text/calendar;charset=utf-8');return}
   case 'mappe-share':{const txt=tripText(t,{notes:!!UI.mappeNotes});
     try{if(navigator.share){await navigator.share({title:t.title,text:txt});return}}catch(err){if(err&&err.name==='AbortError')return}
     try{await navigator.clipboard.writeText(txt);alertMsg('Text kopiert.')}catch(err){openSheet('<h2>Reise als Text</h2><p class="small muted">Text markieren und kopieren.</p><div class="copybox">'+esc(txt)+'</div>')}return}
   case 'edit-trip': sheetEdit(t);return;
   case 'edit-save':{try{if(UI.editSource!==JSON.stringify(t))throw new Error('Die Reise hat sich geändert. Eckdaten bitte erneut öffnen.');if(tripLengthError(UI.edit))throw new Error(tripLengthError(UI.edit));const c=protectedPlanChange(t,'edit',{draft:UI.edit}),d=routeEndpointPreview(t,c);if(d){render();sheetRouteEndpoint(t,d);return}adoptPlanChange(t,c);save(t);closeSheet();render();}catch(err){alertMsg(err.message)}return;}
   case 'route-endpoint-apply':{try{applyRouteEndpointChange(t,UI.routeEndpointDraft);UI.routeEndpointDraft=null;UI.routeDraft=null;save(t);closeSheet();render();}catch(err){alertMsg(err.message)}return;}
   case 'dup':{const c=clone(t);c.id=uid('t');c.title=t.title+' (Kopie)';c.status='idee';save(c,true);go('r-'+c.id+'-ueber');return}
   case 'del': UI.confirm='del';render();return;
   case 'del-no': UI.confirm=null;render();return;
   case 'del-yes': UI.confirm=null;try{await Store.remove(t.id)}catch(err){alertMsg(err.message);render();return}go('reisen');return;
   case 'pkgf': UI.pkgf=val;break;
   case 'pkgfocus': UI.pkgfocus=val;break;
   case 'pkg-ask': UI.confirm='pkg-'+val;break;
   case 'pkg-cancel': UI.confirm=null;break;
   case 'pkg-apply':{try{adoptPlanChange(t,protectedPlanChange(t,'package',{id:val}));UI.confirm=null;save(t);closeSheet();go('r-'+t.id+'-plan');}catch(err){alertMsg(err.message)}return;}
   case 'pkg-view': sheetPkg(t,val);return;
   case 'place':case 'place-yes':{try{const d=stayChangePreview(t,'place',act==='place'?val:UI.pendingPlace);if(t.place||t.stayId||(t.items||[]).length){sheetStayChange(t,d);return}applyStayChange(t,d);UI.confirm=null;save(t);}catch(err){alertMsg(err.message);return}break;}
   case 'place-no': UI.confirm=null;break;
   case 'sflt': UI.sflt[val]=!UI.sflt[val];break;
   case 'stay':{try{const d=stayChangePreview(t,'select',val);if(t.stayId&&t.stayId!==val){sheetStayChange(t,d);return}applyStayChange(t,d);save(t);}catch(err){alertMsg(err.message);return}break;}
   case 'stay-add':{const n=$('#cs-name').value.trim();if(!n){alertMsg('Bitte einen Namen eintragen.');return}const s={id:uid('s'),custom:true,name:n,ort:$('#cs-ort').value.trim(),priceNight:num($('#cs-price').value,0),url:/^https?:\/\//.test($('#cs-url').value.trim())?$('#cs-url').value.trim():'',sauna:$('#cs-sauna').checked,kitchen:$('#cs-kitchen').checked,breakfast:$('#cs-bf').checked,card:$('#cs-card').checked,info:'Eigener Eintrag',map:$('#cs-ort').value.trim()?n+' '+$('#cs-ort').value.trim():''};
     try{const d=stayChangePreview(t,'add',s);if(t.stayId){sheetStayChange(t,d);return}applyStayChange(t,d);save(t);}catch(err){alertMsg(err.message);return}break;}
   case 'stay-del':{try{sheetStayChange(t,stayChangePreview(t,'remove',val));}catch(err){alertMsg(err.message)}return;}
   case 'stay-change-confirm':{try{applyStayChange(t,UI.stayDraft);save(t);UI.stayDraft=null;UI.confirm=null;closeSheet();render();}catch(err){alertMsg(err.message)}return;}
   case 'copy':{const txt=inquiry(t);try{await navigator.clipboard.writeText(txt);b.textContent='Kopiert ✓'}catch(err){const el=$('#inq');const r=document.createRange();r.selectNodeContents(el);const s=window.getSelection();s.removeAllRanges();s.addRange(r);b.textContent='Markiert, jetzt kopieren'}return}
   case 'fcat': UI.fcat=val;break;
   case 'ffree': UI.ffree=!UI.ffree;break;
   case 'findoor': UI.findoor=!UI.findoor;break;
   case 'fcard': UI.fcard=!UI.fcard;break;
   case 'fmissing': UI.fmissing=UI.fmissing===val?'':val;break;
   case 'activity-filters-reset':UI.fcat='alle';UI.ffree=false;UI.findoor=false;UI.fcard=false;UI.fmissing='';UI.aq='';UI.aplanned='';UI.asort='';break;
   case 'aplanned': UI.aplanned=UI.aplanned===val?'':val;break;
   case 'act-view': sheetAct(t,val);return;
   case 'plan-act': sheetAct(t,val);return;
   case 'plan-do':{const day=+$('#pl-day').value,slot=$('#pl-slot').value;t.items=(t.items||[]).concat([{uid:uid('i'),act:val,day,slot}]);t.packageId='';save(t);closeSheet();render();toast(b,'Eingeplant');return}
   case 'act-add':{try{const a=customActFromForm({title:$('#ca-t').value,cat:$('#ca-cat').value,cost:$('#ca-cost').value,per:$('#ca-per').value,hours:$('#ca-hours').value,free:$('#ca-free').checked,indoor:$('#ca-indoor').checked,bring:$('#ca-bring').value,link:$('#ca-link').value,note:$('#ca-note').value},uid('c'));
     t.customActs=(t.customActs||[]).concat([a]);save(t)}catch(err){alertMsg(err.message);return}break}
   case 'act-price':case 'act-free':{const a=(t.customActs||[]).find(x=>x.id===val);if(!a)return;if(activityCommitted(t,val)){alertMsg('Preis ist wegen Buchung, Anfrage, Zahlung oder Fälligkeit geschützt. Zahlungsbuch zuerst klären.');return}const c=act==='act-free'?0:num($('#ap-cost').value,-1);if(act==='act-price'&&!(c>0)){alertMsg('Bitte einen Betrag über 0 eintragen oder „Ist kostenlos“ wählen.');return}a.cost=c;if(act==='act-price')a.per=$('#ap-per').value==='grp'?'grp':'pp';a.costOpen=false;save(t);closeSheet();break}
   case 'act-edit':sheetActivityEdit(t,val);return;
   case 'act-edit-preview':{try{if(UI.activityEditSource!==JSON.stringify(t))throw new Error('Die Reise hat sich geändert. Bitte Bearbeiten erneut öffnen.');const f={title:$('#ae-title').value,cat:$('#ae-cat').value,cost:$('#ae-cost').value,per:$('#ae-per').value,hours:$('#ae-hours').value,free:$('#ae-free').checked,indoor:$('#ae-indoor').checked,bring:$('#ae-bring').value,link:$('#ae-link').value,note:$('#ae-note').value};sheetActivityPreview(t,activityChangePreview(t,val,f));}catch(err){alertMsg(err.message)}return;}
   case 'act-del':{try{sheetActivityPreview(t,activityChangePreview(t,val,null,true));}catch(err){alertMsg(err.message)}return;}
   case 'act-change-confirm':{try{applyActivityChange(t,UI.activityDraft);save(t);UI.activityDraft=null;closeSheet();render();}catch(err){alertMsg(err.message)}return;}
   case 'slot-add':{const [d,s]=val.split('|');sheetSlot(t,+d,s);return}
   case 'slot-pick':{const [id,d,s]=val.split('|');t.items=(t.items||[]).concat([{uid:uid('i'),act:id,day:+d,slot:s}]);t.packageId='';save(t);closeSheet();break}
   case 'item': sheetItem(t,val);return;
   case 'item-move':case 'item-del':{try{adoptPlanChange(t,protectedPlanChange(t,act==='item-move'?'move':'remove',{uid:val,day:act==='item-move'?+$('#mv-day').value:undefined,slot:act==='item-move'?$('#mv-slot').value:undefined,time:act==='item-move'&&$('#mv-time')?$('#mv-time').value:undefined}));save(t);closeSheet();render();}catch(err){alertMsg(err.message)}return;}
   case 'rain-twin': rainTwinShow(t,val);return;
   case 'rain-swap':{try{const na=rainSwap(t,UI.rainDraft,+val);save(t);closeSheet();UI.rainDraft=null;render();alertMsg('Getauscht: '+na.t+'. Die Draußen-Idee bleibt in der Ideenliste; Preis noch offen.')}catch(err){alertMsg(err.message)}return}
   case 'leg-move':{const [k,dir]=val.split('|').map(Number);const d=UI.legDraft&&UI.legDraft.trip===t.id?UI.legDraft:{trip:t.id,order:t.legs.map((_,i)=>i),nights:t.legs.map(l=>Math.max(1,Math.round(num(l.nights,1))))};
     const j=k+dir;if(j<0||j>=d.order.length)return;[d.order[k],d.order[j]]=[d.order[j],d.order[k]];[d.nights[k],d.nights[j]]=[d.nights[j],d.nights[k]];UI.legDraft=d;break}
   case 'leg-cancel': UI.legDraft=null;break;
   case 'leg-apply':{const d=UI.legDraft;if(!d||d.trip!==t.id)return;try{const r=reorderLegs(t,d.order,d.nights);const iss=typeof commitmentIssues==='function'?commitmentIssues(t,r.trip):[];if(iss.length)throw new Error('Nicht geändert: '+iss.join(' · '));Object.assign(t,r.trip);save(t);UI.legDraft=null;render();alertMsg('Etappen übernommen.'+(r.recalculated?' Kilometer neu geschätzt.':' Anfahrt/Heimfahrt nicht neu berechnet (Abfahrtsort ohne Koordinaten).'))}catch(err){alertMsg(err.message)}return}
   case 'route-calc':{UI.routeBusy=true;render();try{UI.routeDraft=await routeCalc(t)}catch(err){alertMsg(err.message)}UI.routeBusy=false;render();return}
   case 'route-apply':{try{routeApply(t,UI.routeDraft);save(t);UI.routeDraft=null;render();alertMsg('Strecke übernommen.')}catch(err){alertMsg(err.message)}return}
   case 'route-drop': UI.routeDraft=null;break;
   case 'day-swap-open': sheetSwap(t,+val);return;
   case 'day-swap':{const [a,b2]=val.split('|').map(Number);const cand=swapDays(t,a,b2);const iss=typeof commitmentIssues==='function'?commitmentIssues(t,cand):[];if(iss.length){alertMsg('Nicht getauscht: '+iss.join(' · '));return}t.items=cand.items;t.packageId='';save(t);closeSheet();break}
   case 'plan-fill': planFillSheet(t);return;
   case 'plan-fill-do':{try{const n=planFillApply(t);if(!n){alertMsg('Nichts ausgewählt.');return}t.packageId='';save(t);closeSheet();UI.fillDraft=null;render();alertMsg(n+' Ideen eingeplant. Preise sind noch offen.')}catch(err){alertMsg(err.message)}return}
   case 'clear': UI.confirm='clear';break;
   case 'clear-yes':{try{adoptPlanChange(t,protectedPlanChange(t,'clear'));UI.confirm=null;save(t);render();}catch(err){alertMsg(err.message)}return;}
   case 'clear-no': UI.confirm=null;break;
   case 'food': t.food=val;save(t);break;
   case 'puffer': t.puffer=num(val,0);save(t);break;
   case 'tip': sheetSaving(t,+val);return;
   case 'tip-confirm':{try{applySavingPreview(t,UI.savingDraft);save(t);closeSheet();render()}catch(err){alertMsg(err.message)}return}
   case 'xc-add':{try{const e=costEntryFromForm({title:$('#xc-t').value,amount:$('#xc-c').value},uid('k'));t.extraCosts=(t.extraCosts||[]).concat([e]);save(t);}catch(err){alertMsg(err.message);return}break;}
   case 'xc-edit':sheetCostEntry(t,val);return;
   case 'xc-preview':{try{if(UI.costEntrySource!==JSON.stringify(t))throw new Error('Die Reise hat sich geändert. Posten erneut öffnen.');sheetCostEntryPreview(t,costEntryPreview(t,val,{title:$('#ce-title').value,amount:$('#ce-amount').value,note:$('#ce-note').value}));}catch(err){alertMsg(err.message)}return;}
   case 'note-add':{try{addNoteBlock(t,val);save(t);render()}catch(err){alertMsg(err.message)}return;}
   case 'xc-del':{try{sheetCostEntryPreview(t,costEntryPreview(t,val,null,true));}catch(err){alertMsg(err.message)}return;
   }
   case 'xc-confirm':{try{applyCostEntry(t,UI.costEntryDraft);save(t);UI.costEntryDraft=null;closeSheet();render();}catch(err){alertMsg(err.message)}return;}
   case 'check-filter': UI.checkFilter=['all','open','done'].includes(val)?val:'all';break;
   case 'check-reset': UI.checkFilter='all';UI.checkQuery='';break;
   case 'cc-add':{const ti=$('#cc-t').value.trim();if(!ti)return;UI.checkFilter='all';UI.checkQuery='';t.customChecks=(t.customChecks||[]).concat([{id:uid('k'),t:ti}]);save(t);break}
   case 'cc-del': t.customChecks=(t.customChecks||[]).filter(x=>x.id!==val);if(t.check)delete t.check['c-'+val];save(t);break;
   default: return;
  }
  render();
});
document.addEventListener('change',e=>{
  const el=e.target, t=cur();
  if(Store.corruptRaw!==null)return;
  if(el.id==='import-file'){
    const file=el.files&&el.files[0];el.value='';if(!file)return;
    readBackupFile(file);return;
  }
  if(el.matches('[data-act="check"]')&&t){t.check=t.check||{};if(el.checked)t.check[el.getAttribute('data-val')]=true;else delete t.check[el.getAttribute('data-val')];save(t);render();return}
  if(el.matches('[data-act="card-confirm"]')&&t){t.cardConfirmed=el.checked;save(t);render();return}
  if(el.id==='act-sort'){UI.asort=['preis','dauer','name'].includes(el.value)?el.value:'';render();return}
  if(el.matches('[data-act="mappe-notes"]')){UI.mappeNotes=el.checked;render();return}
  if(el.matches('[data-act="online"]')&&t){t.online=el.checked;save(t);render();return}
  const f=el.getAttribute('data-f'); if(!f) return;
  if(el.closest('#draft')){setField(UI.draft,f,el.value);if(['start','end','nights'].includes(f))render();return}
  if(el.closest('#editform')){setField(UI.edit,f,el.value);return}
  if(t&&(f==='origin'||f==='dest')&&t[f]!==el.value){try{const c=clone(t);setField(c,f,el.value);const d=routeEndpointPreview(t,c);render();if(d)sheetRouteEndpoint(t,d)}catch(err){alertMsg(err.message);render()}return}
  if(t){setField(t,f,el.value);save(t);if(f!=='notes')render();else{const box=document.getElementById('notes-extra');if(box)box.innerHTML=notesExtras(t)}}
});
document.addEventListener('input',e=>{
  if(Store.corruptRaw!==null)return;
  const el=e.target, f=el.getAttribute('data-f'), t=cur(); if(!f) return;
  if(el.closest('#draft')){setField(UI.draft,f,el.value);return}
  if(el.closest('#editform')){setField(UI.edit,f,el.value);return}
  if(!t) return;
  if(f==='origin'||f==='dest')return; /* Ortswechsel erst nach change mit Vorschau. */
  setField(t,f,el.value);save(t);
  if(['verb','preis','ticket','stayQuote','budget'].includes(f)){renderDock();const box=document.querySelector('.tbl-wrap');if(box&&UI.tab==='kosten'){clearTimeout(window.__rt);window.__rt=setTimeout(()=>{const a=document.activeElement,id=a&&a.getAttribute('data-f'),pos=a&&a.selectionStart;render();if(id){const n=document.querySelector('[data-f="'+id+'"]');if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(err){}}}},500)}}
});
document.addEventListener('submit',e=>{
 if(e.target.id==='act-search'){e.preventDefault();UI.aq=String(($('#act-q')||{}).value||'').slice(0,80);render();const field=$('#act-q');if(field)field.focus();return}
 if(e.target.id==='trip-search'){e.preventDefault();UI.tripQuery=String($('#trip-q').value||'').slice(0,120);render();const field=$('#trip-q');if(field)field.focus();return}
 if(e.target.id!=='check-search')return;e.preventDefault();
 UI.checkQuery=String($('#check-q').value||'').slice(0,120);render();const field=$('#check-q');if(field)field.focus();
});
document.addEventListener('change',e=>{
 if(e.target.id==='plan-day'){UI.planDay=Number(e.target.value);render();const picker=$('#plan-day');if(picker)picker.focus();return}
 if(e.target.id==='trip-sort'){UI.tripSort=['next','name','recent'].includes(e.target.value)?e.target.value:'next';render();return}
 if(e.target.id!=='trip-area')return;const t=cur(),tab=e.target.value;
 if(t&&TABS.some(x=>x[0]===tab)){go('r-'+t.id+'-'+tab);const content=$('#view');if(content)content.focus();}
});
document.addEventListener('keydown',sheetKeydown);
window.addEventListener('storage',e=>{if(e.key===Store.key()){Store.conflict=true;alertMsg('Reisedaten wurden in einer anderen Ansicht geändert. Sichert offene Änderungen und ladet neu.');}});
window.addEventListener('hashchange',()=>go(location.hash,true,{pop:true}));
window.addEventListener('popstate',()=>go(location.hash,true,{pop:true})); /* Paket 4: Zurück/Vor zwischen Unterseiten */
document.addEventListener('change',e=>{
  const el=e.target;if(!el.hasAttribute||!el.hasAttribute('data-ledger'))return;
  const t=cur();if(!t||Store.corruptRaw!==null)return;
  try{setLedger(t,el.getAttribute('data-ledger'),el.getAttribute('data-ledger-f'),el.value);if(t.schemaVersion==null)t.schemaVersion=2;save(t);render()}
  catch(err){alertMsg(err.message);render()}
});
function alertMsg(m){let n=$('#msg');if(!n){n=document.createElement('div');n.id='msg';n.setAttribute('role','alert');n.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:30;background:var(--ink);color:var(--bg);padding:10px 16px;border-radius:8px;font-weight:600;max-width:90vw';document.body.appendChild(n)}n.textContent=m;n.hidden=false;clearTimeout(n._t);n._t=setTimeout(()=>{n.hidden=true},2600)}
function toast(b,m){alertMsg(m)}

/* Suchzentrale v2: reine Anbieteradapter, nachvollziehbare Angebote, Profile. */
const PROVIDERS=[
 {id:'booking',name:'Booking.com',home:'https://www.booking.com/',mode:'search'},
 {id:'check24',name:'CHECK24',home:'https://hotel.check24.de/',mode:'portal'},
 {id:'fewo',name:'FeWo-direkt',home:'https://www.fewo-direkt.de/',mode:'search'},
 {id:'airbnb',name:'Airbnb',home:'https://www.airbnb.de/',mode:'search'},
 {id:'holidu',name:'Holidu',home:'https://www.holidu.de/',mode:'portal'},
 {id:'direkt',name:'Direkt beim Gastgeber',home:'',mode:'manual'}
];
const FEATURES={sauna:'Sauna / Wellness',kitchen:'Küche',breakfast:'Frühstück inklusive',cancel:'Kostenlos stornierbar',quiet:'Ruhige Lage',accessible:'Barrierefrei',parking:'Parkplatz'};
const FEES={tax:'Kurtaxe',cleaning:'Endreinigung',parking:'Parkgebühr',wellness:'Wellnessgebühr',mandatory:'Weitere Pflichtzuschläge'};
function searchDefaults(t){return {version:1,destination:t.dest||(placeOf(t)||{}).name||'',maxPrice:'',maxDrive:'',minRating:'',type:'',provider:'',sort:'match',onlyFavorites:false,onlyCurrent:false,must:[],wish:['sauna','quiet'],providers:['booking','check24','fewo','airbnb']};}
function searchState(t){return Object.assign(searchDefaults(t),t.search||{});}
function migrateTrip(t){if(t.schemaVersion!=null&&t.schemaVersion!==2&&!(t.schemaVersion===3&&V3)&&!(t.schemaVersion===4&&V3&&window.RPV4))throw new Error('Unbekannte Reiseversion');if(t.schemaVersion===2||t.schemaVersion===3||t.schemaVersion===4)return clone(t);const out=clone(t);out.schemaVersion=2;out.search=out.search||searchDefaults(out);out.offers=out.offers||[];out.searchProfiles=out.searchProfiles||[];return out;}
function safeOfferUrl(value){return /^https:\/\/[^\s<>"']+$/i.test(String(value||''))?String(value):'';}
function providerUrl(p,t,q){
 const dest=q.destination.trim();if(!dest)return p.home;
 const dates=t.dateMode==='fix'&&pd(t.start)&&pd(t.end)&&pd(t.end)>pd(t.start);
 const params=(obj)=>Object.entries(obj).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
 if(p.id==='booking')return 'https://www.booking.com/searchresults.de.html?'+params({ss:dest,checkin:dates?t.start:'',checkout:dates?t.end:'',group_adults:t.persons,no_rooms:1,group_children:0});
 if(p.id==='airbnb')return 'https://www.airbnb.de/s/'+encodeURIComponent(dest)+'/homes?'+params({checkin:dates?t.start:'',checkout:dates?t.end:'',adults:t.persons});
 if(p.id==='fewo')return 'https://www.fewo-direkt.de/search?'+params({destination:dest,startDate:dates?t.start:'',endDate:dates?t.end:'',adults:t.persons});
 return p.home;
}
function offerAmounts(o){
 const n=(pd(o.end)-pd(o.start))/864e5,p=Number(o.persons),b=Number(o.price);
 const base=b*(o.basis==='night'?n:o.basis==='personNight'?n*p:o.basis==='person'?p:1);
 let total=base,unknown=[];Object.entries(FEES).forEach(([k,label])=>{const fee=(o.fees||{})[k];if(!fee||fee.state==='unknown')unknown.push(label);else if(fee.state==='extra')total+=Number(fee.amount);});
 return {base,total,unknown,nights:n};
}
function offerCurrent(o,t,now){return o.start===t.start&&o.end===t.end&&+o.persons===+t.persons&&t.dateMode==='fix'&&(!o.validUntil||o.validUntil>=(now||new Date().toISOString().slice(0,10)));}
function offerEvaluation(o,t,q){
 const amounts=offerAmounts(o),failed=[],unknown=[];let points=0,possible=q.wish.length;
 q.must.forEach(k=>{if((o.features||{})[k]==='no')failed.push(FEATURES[k]);else if((o.features||{})[k]!=='yes')unknown.push(FEATURES[k]);});
 q.wish.forEach(k=>{if((o.features||{})[k]==='yes')points++;});
 if(q.maxPrice!==''){if(amounts.unknown.length)unknown.push('Vollständiger Preis');if(amounts.total>+q.maxPrice)failed.push('Unterkunftsbudget');}
 if(q.maxDrive!==''){if(o.drive==null)unknown.push('Fahrzeit');else if(o.drive>+q.maxDrive)failed.push('Fahrzeit');}
 if(q.minRating!==''){if(o.rating==null)unknown.push('Bewertung');else if(o.rating<+q.minRating)failed.push('Bewertung');}
 if(q.type&&o.type!==q.type)failed.push('Unterkunftsart');if(q.provider&&o.provider!==q.provider)failed.push('Anbieter');
 if(q.destination.trim()&&!String(o.location).toLocaleLowerCase('de').includes(q.destination.trim().toLocaleLowerCase('de')))failed.push('Suchort');
 if(o.availability==='unavailable')failed.push('Nicht verfügbar');
 if(q.onlyCurrent&&(!offerCurrent(o,t)||o.availability!=='available'))failed.push('Zeitraum / Verfügbarkeit');
 if(q.onlyFavorites&&!o.favorite)failed.push('Merkliste');
 return {amounts,failed,unknown,points,possible,match:failed.length===0&&unknown.length===0};
}
function filteredOffers(t,q){return (t.offers||[]).map(o=>({o,e:offerEvaluation(o,t,q)})).filter(x=>x.e.match).sort((a,b)=>q.sort==='price'?a.e.amounts.total-b.e.amounts.total:q.sort==='drive'?(a.o.drive==null?Infinity:a.o.drive)-(b.o.drive==null?Infinity:b.o.drive):q.sort==='rating'?(b.o.rating==null?-1:b.o.rating)-(a.o.rating==null?-1:a.o.rating):b.e.points-a.e.points||a.e.amounts.unknown.length-b.e.amounts.unknown.length||a.e.amounts.total-b.e.amounts.total);}
function validateOffer(o){
 if(!o||typeof o!=='object'||!/^o[a-z0-9]+$/i.test(o.id)||typeof o.name!=='string'||!o.name.trim()||o.name.length>160||typeof o.location!=='string'||!o.location.trim()||o.location.length>160||!PROVIDERS.some(p=>p.id===o.provider)||!['hotel','fewo','pension','other'].includes(o.type))throw new Error('Angebotsname, Ort, Anbieter und Unterkunftsart prüfen.');
 if(!pd(o.start)||!pd(o.end)||pd(o.end)<=pd(o.start)||!Number.isInteger(+o.persons)||+o.persons<1||+o.persons>20)throw new Error('Angebotszeitraum und Personen prüfen.');
 if(!['stay','night','person','personNight'].includes(o.basis)||o.price==null||o.price===''||!Number.isFinite(+o.price)||+o.price<0||+o.price>1e7)throw new Error('Preis und Preisbasis prüfen.');
 if(!safeOfferUrl(o.url)||!pd(o.checkedAt)||o.validUntil&&!pd(o.validUntil)||o.validUntil&&o.validUntil<o.checkedAt)throw new Error('HTTPS-Quelle, Prüfdatum und Gültigkeit prüfen.');
 if(!['unknown','available','unavailable'].includes(o.availability)||typeof o.terms!=='string'||o.terms.length>4000)throw new Error('Verfügbarkeit oder Bedingungen ungültig.');
 for(const k of Object.keys(FEATURES))if(!['yes','no','unknown'].includes((o.features||{})[k]))throw new Error('Angebotsmerkmale ungültig.');
 for(const k of Object.keys(FEES)){const f=(o.fees||{})[k];if(!f||!['included','extra','unknown'].includes(f.state)||f.state==='extra'&&(!Number.isFinite(+f.amount)||f.amount==null||f.amount===''||+f.amount<0||+f.amount>1e7))throw new Error('Gebühren prüfen: '+FEES[k]);}
 for(const k of ['paid','deposit'])if(o[k]==null||!Number.isFinite(+o[k])||+o[k]<0||+o[k]>1e9)throw new Error('Zahlungswerte prüfen.');
 if(o.drive!=null&&(!Number.isFinite(+o.drive)||+o.drive<0||+o.drive>10000)||o.rating!=null&&(!Number.isFinite(+o.rating)||+o.rating<0||+o.rating>10))throw new Error('Fahrzeit oder Bewertung prüfen.');
 if(+o.paid>offerAmounts(o).total)throw new Error('Bezahlt übersteigt die erfassten Kosten.');
 return o;
}
function validateSearch(s){
 if(!s||s.version!==1||typeof s.destination!=='string'||s.destination.length>160||!Array.isArray(s.must)||!Array.isArray(s.wish)||[...s.must,...s.wish].some(k=>!FEATURES[k])||!Array.isArray(s.providers)||s.providers.some(id=>!PROVIDERS.some(p=>p.id===id)))throw new Error('Suchprofil ungültig.');
 for(const k of ['maxPrice','maxDrive','minRating'])if(s[k]!==''&&(!Number.isFinite(+s[k])||+s[k]<0||+s[k]>1e9||k==='minRating'&&+s[k]>10))throw new Error('Suchfilter ungültig.');
 if(!['match','price','drive','rating'].includes(s.sort)||!['','hotel','fewo','pension','other'].includes(s.type)||s.provider&&!PROVIDERS.some(p=>p.id===s.provider))throw new Error('Sortierung oder Anbieter ungültig.');
 return s;
}
function validateExtras(t){
 if(t.schemaVersion!=null&&t.schemaVersion!==2&&!(t.schemaVersion===3&&V3)&&!(t.schemaVersion===4&&V3&&window.RPV4))throw new Error('Unbekannte Reiseversion.');
 /* Format 4 = Format 3 plus Fotos und Reisebücher; unter 4 sind volle v4-Felder verboten (validateV4) */
 if(window.RPV4)window.RPV4.validateV4(t);
 if(t.schemaVersion===3||t.schemaVersion===4)validateV3(t);
 else{if(V3&&V3.needsV3(t))throw new Error('Angaben des Formats 3 in einer Reise des Formats 2.');if(Object.keys(t.ledger||{}).some(k=>k.startsWith('tr:')))throw new Error('Anreise-Abschnitte im Buchungsbuch gibt es erst ab Format 3.');}
 if(t.search)validateSearch(t.search);
 if(t.offers!=null){if(!Array.isArray(t.offers)||t.offers.length>200)throw new Error('Zu viele Angebote.');const ids=new Set();t.offers.forEach(o=>{validateOffer(o);if(ids.has(o.id))throw new Error('Doppelte Angebots-ID');ids.add(o.id)});if(t.activeOfferId&&!ids.has(t.activeOfferId))throw new Error('Aktives Angebot fehlt.');}
 validateLedger(t.ledger);
 if(t.kmSrc!=null&&!['schaetzung','route'].includes(t.kmSrc))throw new Error('Ungültige Herkunft der Fahrstrecke.');
 for(const k of ['routeMin','routeHomeMin'])if(t[k]!=null&&!(Number.isFinite(+t[k])&&+t[k]>=0&&+t[k]<=6000))throw new Error('Ungültige Fahrzeit in der Sicherung.');
 if(t.routeAt!=null&&!/^\d{4}-\d{2}-\d{2}$/.test(t.routeAt))throw new Error('Ungültiges Routendatum.');
 if(t.tz!=null&&!validTz(t.tz))throw new Error('Ungültige Zeitzone in der Sicherung.');
 (t.legs||[]).forEach(l=>{if(l&&l.routeMin!=null&&!(Number.isFinite(+l.routeMin)&&+l.routeMin>=0&&+l.routeMin<=6000))throw new Error('Ungültige Fahrzeit einer Etappe.')});
 for(const k of ['departTime','checkinTime'])if(t[k]!=null&&!TIME_RE.test(t[k]))throw new Error('Ungültige Uhrzeit in der Sicherung.');
 (t.items||[]).forEach(i=>{if(i&&i.time!=null&&!TIME_RE.test(i.time))throw new Error('Ungültige Uhrzeit in der Sicherung.')});
 if(t.originGeo!=null&&!(t.originGeo&&Number.isFinite(+t.originGeo.lat)&&Number.isFinite(+t.originGeo.lon)&&Math.abs(+t.originGeo.lat)<=90&&Math.abs(+t.originGeo.lon)<=180))throw new Error('Ungültige Koordinaten des Abfahrtsorts.');
 if(t.destGeo!=null&&!(t.destGeo&&typeof t.destGeo==='object'&&Math.abs(+t.destGeo.lat)<=90&&Math.abs(+t.destGeo.lon)<=180&&Number.isFinite(+t.destGeo.lat)&&Number.isFinite(+t.destGeo.lon)))throw new Error('Ungültige Zielkoordinaten.');
 (t.customActs||[]).forEach(a=>{if(!a||typeof a!=='object'||a.costOpen!=null&&typeof a.costOpen!=='boolean'||a.km!=null&&!(Number.isFinite(+a.km)&&+a.km>=0&&+a.km<=1e5)||a.hours!=null&&!(Number.isFinite(+a.hours)&&+a.hours>=0&&+a.hours<=24)||a.transit!=null&&typeof a.transit!=='boolean'||a.geo!=null&&!(a.geo&&Number.isFinite(+a.geo.lat)&&Number.isFinite(+a.geo.lon)&&Math.abs(+a.geo.lat)<=90&&Math.abs(+a.geo.lon)<=180)||a.bring!=null&&!(Array.isArray(a.bring)&&a.bring.length<=10&&a.bring.every(x=>typeof x==='string'&&x.length<=80)))throw new Error('Ungültige eigene Unternehmung.')});
 if(t.legs!=null&&!(Array.isArray(t.legs)&&t.legs.length<=12&&t.legs.every(l=>l&&typeof l==='object'&&typeof l.name==='string'&&l.name.length<=120&&Math.abs(+l.lat)<=90&&Math.abs(+l.lon)<=180&&Number.isFinite(+l.lat)&&Number.isFinite(+l.lon)&&Number.isInteger(+l.nights)&&+l.nights>=0&&+l.nights<=60&&Number.isFinite(+l.roadKm)&&+l.roadKm>=0)))throw new Error('Ungültige Etappen der Rundreise.');
 if(t.searchProfiles!=null){if(!Array.isArray(t.searchProfiles)||t.searchProfiles.length>30)throw new Error('Zu viele Profile.');t.searchProfiles.forEach(p=>{if(!p||typeof p.name!=='string'||p.name.length>80||!/^p[a-z0-9]+$/i.test(p.id))throw new Error('Profil ungültig.');validateSearch(p.filters)});}
}
function activeOffer(t){const o=(t.offers||[]).find(o=>o.id===t.activeOfferId);return o&&o.stayId===t.stayId?o:null;}
function filterInput(k,label,value,type,extra){return '<label class="fld"><span>'+label+'</span><input data-search="'+k+'" type="'+(type||'text')+'" value="'+esc(value)+'" '+(extra||'')+'></label>';}
function optionList(options,value){return options.map(([id,label])=>'<option value="'+esc(id)+'"'+(String(value)===String(id)?' selected':'')+'>'+esc(label)+'</option>').join('');}
function searchSelect(k,label,opts,value){return '<label class="fld"><span>'+label+'</span><select data-search="'+k+'">'+optionList(opts,value)+'</select></label>';}
function tSuche(t){
 const q=searchState(t),all=t.offers||[],matches=filteredOffers(t,q),comp=all.filter(o=>o.compare),today=new Date().toISOString().slice(0,10);
 return '<section class="block finder-hero"><span class="eyebrow">Euer persönlicher Reisefinder</span><h2>Ein Wunsch. Viele Möglichkeiten.</h2><p class="lead">Sucht passend zu euch, sammelt konkrete Angebote und entscheidet mit einem gemeinsamen Vergleich.</p><div class="row"><span class="badge">'+esc(rangeText(t))+'</span><span class="badge">'+t.persons+' Personen</span><span class="badge">Reisebudget '+eur(t.budget)+'</span></div></section>'+
 '<section class="block"><div class="between"><h2>1 · Was muss eure Unterkunft können?</h2><button class="btn ghost sm" data-search-act="reset">Filter zurücksetzen</button></div><div class="panel"><div class="form">'+filterInput('destination','Ort / Region (enthält)',q.destination)+filterInput('maxPrice','Unterkunft: maximal gesamt (€)',q.maxPrice,'number','min="0"')+filterInput('maxDrive','Fahrzeit einfach: maximal Minuten',q.maxDrive,'number','min="0"')+filterInput('minRating','Bewertung mindestens (0–10)',q.minRating,'number','min="0" max="10" step="0.1"')+searchSelect('type','Unterkunftsart',[['','Alle'],['hotel','Hotel'],['fewo','Ferienwohnung'],['pension','Pension'],['other','Andere']],q.type)+searchSelect('provider','Angebote dieses Anbieters',[['','Alle'],...PROVIDERS.map(p=>[p.id,p.name])],q.provider)+searchSelect('sort','Sortieren nach',[['match','Persönlicher Passung'],['price','Bekannten Kosten'],['drive','Fahrzeit'],['rating','Bewertung']],q.sort)+'</div><p class="small muted">Muss = nur bestätigte Merkmale. Wunsch = verbessert die Passung. Unbekannte Merkmale erfüllen kein Muss. Filter gelten für eure erfassten Angebote; auf Anbieter-Websites bitte erneut einstellen.</p><div class="criteria">'+Object.entries(FEATURES).map(([k,label])=>'<label class="fld"><span>'+label+'</span><select data-criterion="'+k+'">'+optionList([['any','Egal'],['wish','Wunsch'],['must','Muss']],q.must.includes(k)?'must':q.wish.includes(k)?'wish':'any')+'</select></label>').join('')+'</div><div class="row"><label><input type="checkbox" data-search="onlyFavorites"'+(q.onlyFavorites?' checked':'')+'> Nur Merkliste</label><label><input type="checkbox" data-search="onlyCurrent"'+(q.onlyCurrent?' checked':'')+'> Nur passender Zeitraum & erfasste Verfügbarkeit</label></div></div></section>'+
 '<section class="block"><h2>2 · Auf euren Lieblingsseiten suchen</h2><p class="small muted">Suchlinks öffnen den Anbieter. Es werden hier keine Live-Preise oder Verfügbarkeiten abgerufen. CHECK24 und Holidu öffnen die Startseite; dort Ort, Datum und Belegung selbst einstellen. Linkparameter können sich ändern: alle Suchdaten auf der Zielseite kontrollieren.</p><div class="row">'+PROVIDERS.filter(p=>p.mode!=='manual').map(p=>'<label><input type="checkbox" data-provider="'+p.id+'"'+(q.providers.includes(p.id)?' checked':'')+'> '+p.name+'</label>').join('')+'</div><div class="grid">'+PROVIDERS.filter(p=>q.providers.includes(p.id)).map(p=>'<article class="card"><span class="eyebrow">'+(p.mode==='portal'?'Anbieter-Startseite':'Vorbereiteter Suchlink')+'</span><h3>'+p.name+'</h3><p class="small">'+esc(q.destination||'Ort noch offen')+' · '+t.persons+' Personen</p><a class="btn ghost" target="_blank" rel="noopener noreferrer" href="'+esc(providerUrl(p,t,q))+'">Beim Anbieter öffnen ↗</a></article>').join('')+'</div><details class="panel"><summary>Suchauftrag zum Kopieren</summary><textarea readonly rows="6">'+esc(searchBrief(t,q))+'</textarea></details></section>'+
 '<section class="block"><h2>3 · Eure individuellen Suchprofile</h2><div class="row"><button class="btn ghost sm" data-search-act="preset" data-value="wellness">Wellness & Ruhe</button><button class="btn ghost sm" data-search-act="preset" data-value="budget">FeWo & Ausflüge</button><button class="btn ghost sm" data-search-act="preset" data-value="flex">Flexibel & Komfort</button></div><div class="form"><label class="fld"><span>Name für euren aktuellen Filter</span><input id="profile-name" maxlength="80" placeholder="Zum Beispiel: Winterurlaub mit Wellness"></label><button class="btn" data-search-act="profile-save">Profil speichern</button></div><div class="row">'+(t.searchProfiles||[]).map(p=>'<span class="profile-chip"><button class="btn ghost sm" data-search-act="profile-load" data-value="'+p.id+'">'+esc(p.name)+'</button><button class="btn ghost sm" aria-label="Profil '+esc(p.name)+' löschen" data-search-act="profile-delete" data-value="'+p.id+'">✕</button></span>').join('')+'</div></section>'+
 '<section class="block"><div class="between"><h2>4 · Konkrete Angebote sammeln</h2><button class="btn" data-search-act="offer-new">+ Angebot erfassen</button></div><p class="small muted">'+matches.length+' passende von '+all.length+' erfassten Angeboten. Preisangaben beziehen sich auf die im Angebot gespeicherten Personen und Daten. „Verfügbar“ und „geprüft“ stammen aus eurer Erfassung, nicht aus einer Live-Abfrage.</p>'+(matches.length?'<div class="grid wide">'+matches.map(x=>offerCard(t,x.o,x.e,today)).join('')+'</div>':'<div class="empty"><b>'+ (all.length?'Kein Angebot erfüllt alle Filter.':'Eure Vergleichsliste ist noch leer.')+'</b><span>Erfasst ein Angebot vom Anbieter oder prüft die Muss-Kriterien. Die Vorgaben werden nicht automatisch gelockert.</span></div>')+(all.length&&!matches.length?'<details class="panel"><summary>Warum passen die Angebote nicht?</summary>'+all.map(o=>{const e=offerEvaluation(o,t,q);return '<p><b>'+esc(o.name)+'</b>: '+esc([...e.failed,...e.unknown.map(s=>s+' unbekannt')].join(' · '))+'</p>'}).join('')+'</details>':'')+'</section>'+
 '<section class="block"><h2>5 · Direkt vergleichen</h2><p class="small muted">Markiert bis zu vier Angebote. Unterschiedliche Zeiträume und Belegungen sind ausdrücklich gekennzeichnet. Bekannte Unterkunftskosten allein sind kein Gesamtpreis der Reise.</p>'+comparisonTable(t,comp)+'</section>'+
 '<section class="block"><h2>Eine kreative Abkürzung</h2><div class="grid"><article class="card"><h3>FeWo + Thermentag</h3><p>Küche nutzen, einen besonderen Wellness-Tag einplanen. Zusätzliche Fahrt, Eintritt und Parken als eigene Posten erfassen.</p></article><article class="card"><h3>Nachbarort statt Hotspot</h3><p>Im Nachbarort wohnen und gezielt ausfliegen. Preisvorteile erst nach Fahrtkosten, Maut und Parkplatz vergleichen.</p></article><article class="card"><h3>Ruhe als Programmpunkt</h3><p>Ein Highlight, freie Nachmittage und ein Plan B für Regen. Schneesport bleibt optional; Schnee ist nicht garantiert.</p></article></div></section>'+
 '<section class="block"><h2>Eure Daten gehören euch</h2><p>Suchprofile, Angebote, Merkliste und Zahlungsangaben sind in der Reise-Sicherung enthalten. Lokale Sicherungspunkte helfen bei Änderungen, ersetzen aber keine heruntergeladene Sicherung.</p><div class="row"><button class="btn" data-search-act="backup">Alle Reisen als Datei sichern</button><button class="btn ghost" data-search-act="history">Lokale Sicherungspunkte</button></div><p class="small muted">Im Gastmodus keine Synchronisation zwischen Geräten; mit Konto erfolgt der Abgleich über Supabase. Eine Sicherungsdatei kann private Notizen und Angebotslinks enthalten.</p>'+(Store.historyError?'<p role="alert">Lokale Sicherungspunkte konnten nicht gespeichert werden. Bitte eine Datei herunterladen.</p>':'')+'</section>';
}
function applyOffer(t,o){
 validateOffer(o);if(!offerCurrent(o,t)||o.availability==='unavailable')throw new Error('Zeitraum, Personen, Gültigkeit oder Verfügbarkeit passen nicht.');
 if(stayCommitted(t)&&t.activeOfferId!==o.id)throw new Error('Gebuchte oder bezahlte Unterkunft zuerst prüfen.');
 const keepBooked=!!(t.check&&t.check.stay&&t.activeOfferId===o.id);
 resetStay(t);if(keepBooked){t.check=t.check||{};t.check.stay=true;}const sid=o.stayId||uid('s');o.stayId=sid;t.customStays=t.customStays||[];
 const stay={id:sid,custom:true,name:o.name,ort:o.location,priceNight:offerAmounts(o).base/offerAmounts(o).nights,sauna:o.features.sauna==='yes',kitchen:o.features.kitchen==='yes',breakfast:o.features.breakfast==='yes',card:false,url:o.url};
 const i=t.customStays.findIndex(s=>s.id===sid);if(i<0)t.customStays.push(stay);else t.customStays[i]=stay;t.stayId=sid;t.stayQuote=null;t.activeOfferId=o.id;
 return t;
}
function offerForecast(t,o){if(!offerCurrent(o,t)||o.availability==='unavailable')return null;const x=clone(t);x.check={};x.activeOfferId=null;x.offers=[clone(o)];const y=x.offers[0];applyOffer(x,y);const c=cost(x),f=financeSummary(x);return {total:c.total,open:openCosts(x),remaining:f.open,deposit:Number(o.deposit)};}
function offerFinance(t){
 const o=activeOffer(t);if(!o)return '';const a=offerAmounts(o),view=isV3(t)?financeEntry(t,{kind:'offer',id:o.id}):null,m=view&&view.math,show=n=>n==null?'Unbekannt':eur(n);
 return '<section class="block"><h2>Unterkunft: Buchung & Zahlungen</h2><p>'+esc(o.name)+' · '+(o.cancel?'Storno erfasst':o.booked?'Extern gebucht laut Erfassung':'Keine Buchung erfasst')+'</p><dl class="facts"><dt>'+(m&&m.cancelled?'Stornogebühr':'Bekannte Kosten')+'</dt><dd>'+show(m?m.cost:a.total)+'</dd><dt>Brutto bezahlt</dt><dd>'+eur(o.paid)+'</dd>'+(m?'<dt>Zurückerhalten</dt><dd>'+show(m.refundsReceived)+'</dd><dt>Netto bezahlt</dt><dd>'+show(m.netPaid)+'</dd>':'')+'<dt>Noch zu zahlen</dt><dd>'+show(m?m.open:Math.max(0,a.total-o.paid))+(a.unknown.length?' + offene Gebühren':'')+'</dd>'+(m?'<dt>Erstattung offen</dt><dd>'+show(m.refundOpen)+'</dd>':'')+'<dt>Kaution separat</dt><dd>'+eur(o.deposit)+'</dd></dl><p class="small muted">Buchungen und Zahlungen werden nur dokumentiert. Kaution ist zusätzlicher Geldbedarf, keine Reiseausgabe.</p><button class="btn ghost sm" data-search-act="offer-edit" data-value="'+o.id+'">Zahlungen / Tarif bearbeiten</button>'+v3Actions(t,{kind:'offer',id:o.id})+'</section>';
}
function searchBrief(t,q){return 'Ort / Region: '+q.destination+'\nZeitraum: '+rangeText(t)+' · '+t.persons+' Personen\nReisebudget: '+eur(t.budget)+'; Unterkunftslimit: '+(q.maxPrice===''?'offen':eur(+q.maxPrice))+'\nMuss: '+(q.must.map(k=>FEATURES[k]).join(', ')||'keine')+'\nWünsche: '+(q.wish.map(k=>FEATURES[k]).join(', ')||'keine')+'\nFahrzeit maximal: '+(q.maxDrive===''?'offen':q.maxDrive+' Minuten')+'\nBitte Gesamtpreis, Gebühren, Stornierung, Tarif, genaue Belegung, Quelle und Verfügbarkeit prüfen.';}
function offerCard(t,o,e){const a=e.amounts,current=offerCurrent(o,t),forecast=offerForecast(t,o);return '<article class="card"><div class="between"><span class="eyebrow">'+esc((PROVIDERS.find(p=>p.id===o.provider)||{}).name)+'</span><span class="badge">'+(o.booked?'Buchung erfasst':o.favorite?'♥ Merkliste':'Angebot erfasst')+'</span></div><h3>'+esc(o.name)+'</h3><p>'+esc(o.location)+'</p><p class="small">'+esc(o.start)+' – '+esc(o.end)+' · '+o.persons+' Personen</p><div class="price num">'+eur(a.total)+'</div><p class="small">'+(a.unknown.length?'Bekannte Kosten · offen: '+esc(a.unknown.join(', ')):'Erfasster Unterkunfts-Gesamtpreis')+'</p>'+ (forecast?'<p class="small"><b>Reise mit diesem Angebot: ≈ '+eur(forecast.total)+'</b> · Planwert'+(forecast.total>t.budget?' über Budget':' · offene Kosten prüfen')+'</p>':'')+'<p class="small">'+e.points+'/'+e.possible+' Wünsche erfüllt · '+(current?'Zeitraum / Belegung passen':'Anderer Zeitraum, andere Belegung oder Gültigkeit abgelaufen')+'</p><p class="small muted">Geprüft laut Erfassung: '+esc(o.checkedAt)+' · '+({unknown:'Verfügbarkeit unbestätigt',available:'Verfügbarkeit als gegeben erfasst',unavailable:'Nicht verfügbar'}[o.availability])+'</p><div class="row"><a class="btn ghost sm" href="'+esc(safeOfferUrl(o.url))+'" target="_blank" rel="noopener noreferrer">Quelle ↗</a><button class="btn ghost sm" data-search-act="offer-edit" data-value="'+o.id+'">Details / Bearbeiten</button><button class="btn ghost sm" data-search-act="favorite" data-value="'+o.id+'">'+(o.favorite?'♥ Gemerkt':'♡ Merken')+'</button><button class="btn ghost sm" data-search-act="compare" data-value="'+o.id+'">'+(o.compare?'✓ Im Vergleich':'+ Vergleichen')+'</button><button class="btn ghost sm" data-search-act="offer-use" data-value="'+o.id+'">Für Planung auswählen</button></div></article>';}
function comparisonTable(t,offers){if(!offers.length)return '<div class="empty">Noch kein Angebot zum Vergleich markiert.</div>';const rows=[['Zeitraum',o=>o.start+' – '+o.end+' · '+o.persons+' Personen'],['Passend zur Reise',o=>offerCurrent(o,t)?'Ja':'Nein / abgelaufen'],['Bekannte Kosten',o=>eur(offerAmounts(o).total)],['Reise mit diesem Angebot',o=>{const f=offerForecast(t,o);return f?'≈ '+eur(f.total)+' (Planwert)':'Nicht vergleichbar';}],['Offene Gebühren',o=>offerAmounts(o).unknown.join(', ')||'Keine laut Erfassung'],['Sauna / Wellness',o=>featureLabel(o,'sauna')],['Küche',o=>featureLabel(o,'kitchen')],['Frühstück',o=>featureLabel(o,'breakfast')],['Stornierung',o=>featureLabel(o,'cancel')],['Fahrzeit einfach',o=>o.drive==null?'Unbekannt':o.drive+' Minuten'],['Bewertung',o=>o.rating==null?'Unbekannt':o.rating+'/10'],['Bereits bezahlt',o=>eur(o.paid)],['Noch zu zahlen',o=>eur(Math.max(0,offerAmounts(o).total-o.paid))+(offerAmounts(o).unknown.length?' + offene Gebühren':'')],['Kaution separat',o=>eur(o.deposit)],['Prüfdatum',o=>o.checkedAt],['Bedingungen',o=>o.terms||'Nicht erfasst']];return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kriterium</th>'+offers.map(o=>'<th>'+esc(o.name)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(([label,fn])=>'<tr><th>'+label+'</th>'+offers.map(o=>'<td>'+esc(fn(o))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function featureLabel(o,k){return {yes:'Ja, laut Erfassung',no:'Nein',unknown:'Unbekannt'}[(o.features||{})[k]]||'Unbekannt';}
function offerSheet(t,id){
 const old=(t.offers||[]).find(o=>o.id===id);UI.offerDraft=clone(old||{id:uid('o'),name:'',location:searchState(t).destination,provider:'booking',type:'hotel',start:t.start,end:t.end,persons:t.persons,price:'',basis:'stay',url:'',checkedAt:new Date().toISOString().slice(0,10),validUntil:'',availability:'unknown',features:Object.fromEntries(Object.keys(FEATURES).map(k=>[k,'unknown'])),fees:Object.fromEntries(Object.keys(FEES).map(k=>[k,{state:'unknown',amount:''}])),terms:'',drive:null,rating:null,paid:0,deposit:0,booked:false});
 UI.offerSource=JSON.stringify(t);UI.offerScope=Store.scope;
 const o=UI.offerDraft,inp=(k,label,type,extra)=>'<label class="fld"><span>'+label+'</span><input data-offer="'+k+'" type="'+(type||'text')+'" value="'+esc(o[k]==null?'':o[k])+'" '+(extra||'')+'></label>',sel=(k,label,opts)=>'<label class="fld"><span>'+label+'</span><select data-offer="'+k+'">'+optionList(opts,o[k])+'</select></label>';
 openSheet('<h2>'+(old?'Angebot bearbeiten':'Konkretes Angebot erfassen')+'</h2><p class="small">Übernehmt den tatsächlich angezeigten Tarif. Gebühren nur als inklusive markieren, wenn der Anbieter das bestätigt. Zusätzliche Gebühren immer als Gesamtbetrag für alle Personen und den Aufenthalt.</p><div class="form">'+inp('name','Unterkunft / Tarif','text','maxlength="160"')+inp('location','Ort / Region','text','maxlength="160"')+sel('provider','Quelle / Anbieter',PROVIDERS.map(p=>[p.id,p.name]))+sel('type','Art',[['hotel','Hotel'],['fewo','Ferienwohnung'],['pension','Pension'],['other','Andere']])+inp('start','Anreise','date')+inp('end','Abreise','date')+inp('persons','Personen','number','min="1" max="20"')+inp('price','Preis (€)','number','min="0" step="0.01"')+sel('basis','Preisbasis',[['stay','Gesamter Aufenthalt'],['night','Pro Nacht / Unterkunft'],['person','Pro Person / Aufenthalt'],['personNight','Pro Person / Nacht']])+inp('url','Konkreter Angebotslink (HTTPS)','url')+inp('checkedAt','Beim Anbieter geprüft am','date')+inp('validUntil','Gültig bis (optional)','date')+sel('availability','Verfügbarkeit laut Anbieter',[['unknown','Unbestätigt'],['available','Als verfügbar angezeigt'],['unavailable','Nicht verfügbar']])+inp('drive','Fahrzeit einfach (Minuten, optional)','number','min="0"')+inp('rating','Bewertung (auf 0–10 umgerechnet)','number','min="0" max="10" step="0.1"')+'</div><h3>Merkmale des gewählten Tarifs</h3><div class="criteria">'+Object.entries(FEATURES).map(([k,label])=>'<label class="fld"><span>'+label+'</span><select data-offer-feature="'+k+'">'+optionList([['unknown','Unbekannt'],['yes','Bestätigt ja'],['no','Nein']],o.features[k])+'</select></label>').join('')+'</div><h3>Gebühren ohne Doppelzählung</h3>'+Object.entries(FEES).map(([k,label])=>'<div class="form"><label class="fld"><span>'+label+'</span><select data-offer-fee="'+k+'">'+optionList([['unknown','Noch offen'],['included','Inklusive / entfällt'],['extra','Zusätzlich']],o.fees[k].state)+'</select></label><label class="fld"><span>Zusätzlicher Gesamtbetrag (€)</span><input type="number" min="0" step="0.01" data-offer-amount="'+k+'" value="'+esc(o.fees[k].amount)+'"></label></div>').join('')+'<label class="fld"><span>Tarif, Leistungen, Stornofrist, Einschränkungen</span><textarea data-offer="terms" maxlength="4000" rows="4">'+esc(o.terms)+'</textarea></label><h3>Buchung & Zahlungen</h3><p class="small">Hier dokumentiert ihr eine bereits extern erfolgte Buchung. Die App bucht und bezahlt nichts. Kautionen zählen separat zum Geldbedarf.</p><div class="form">'+inp('paid','Bereits bezahlt (€)','number','min="0" step="0.01"')+inp('deposit','Zusätzlicher Kautionsbedarf (€)','number','min="0" step="0.01"')+'</div><label><input type="checkbox" data-offer="booked"'+(o.booked?' checked':'')+'> Extern gebucht</label><div class="row"><button class="btn" data-search-act="offer-save">Angebot speichern</button><button class="btn ghost" data-act="sheet-x">Abbrechen</button>'+(old?'<button class="btn ghost" data-search-act="offer-delete" data-value="'+o.id+'">Entfernen …</button>':'')+'</div><p id="offer-error" role="alert"></p>');
}
/* Reisen eines Sicherungspunkts: Gastbereich speichert die Reisen direkt, Kontobereich {v,trips,meta,queue} (Review R2).
   Bewusst ohne Gültigkeitsprüfung, damit auch ein später unlesbarer Stand gesichert werden kann; der Import prüft. */
function historyTrips(raw,guest){const s=JSON.parse(raw);const m=guest?s:s&&s.v===1?s.trips:null;if(!m||typeof m!=='object'||Array.isArray(m))throw new Error('Sicherungspunkt ungültig.');return Object.values(m)}
function historySheet(){let history;try{history=JSON.parse(localStorage.getItem(Store.historyKey())||'[]');if(!Array.isArray(history))throw new Error('Ungültige Sicherungspunkte');}catch(e){alertMsg('Sicherungspunkte konnten nicht gelesen werden.');return;}UI.history=history;openSheet('<h2>Lokale Sicherungspunkte</h2><p>Die letzten fünf vorherigen Speicherstände dieses Browsers. Ladet einen Stand herunter und importiert ihn danach mit der vorhandenen Konfliktprüfung. Es wird nichts direkt überschrieben.</p>'+history.map((h,i)=>'<p>'+esc(h.at)+' <button class="btn ghost sm" data-search-act="history-download" data-value="'+i+'">Als Datei herunterladen</button></p>').join('')+(history.length?'':'<p>Noch keine Sicherungspunkte vorhanden.</p>'));}
document.addEventListener('change',e=>{
 const el=e.target,t=cur();if(!t||Store.corruptRaw!==null)return;
 if(el.hasAttribute('data-search')||el.hasAttribute('data-criterion')||el.hasAttribute('data-provider')){if(isV3(t)&&!V3_EDIT){alertMsg(V3_LOCK_TXT);render();return}const q=searchState(t),k=el.getAttribute('data-search');if(k){q[k]=el.type==='checkbox'?el.checked:el.value;}const c=el.getAttribute('data-criterion');if(c){q.must=q.must.filter(k=>k!==c);q.wish=q.wish.filter(k=>k!==c);if(el.value==='must')q.must.push(c);if(el.value==='wish')q.wish.push(c);}const p=el.getAttribute('data-provider');if(p)q.providers=el.checked?[...new Set([...q.providers,p])]:q.providers.filter(id=>id!==p);try{validateSearch(q);t.search=q;if(t.schemaVersion==null)t.schemaVersion=2;save(t);render();}catch(err){alertMsg(err.message);}return;}
 const o=UI.offerDraft;if(!o)return;
 const k=el.getAttribute('data-offer');if(k){o[k]=el.type==='checkbox'?el.checked:['persons','price','drive','rating','paid','deposit'].includes(k)?(el.value===''?null:Number(el.value)):el.value;}
 const f=el.getAttribute('data-offer-feature');if(f)o.features[f]=el.value;
 const fee=el.getAttribute('data-offer-fee');if(fee)o.fees[fee].state=el.value;
 const amt=el.getAttribute('data-offer-amount');if(amt)o.fees[amt].amount=el.value===''?null:Number(el.value);
});
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-search-act]');if(!b)return;e.preventDefault();const act=b.getAttribute('data-search-act'),id=b.getAttribute('data-value'),t=cur();if(!t||Store.corruptRaw!==null)return;
 try{
 if(isV3(t)&&!V3_EDIT&&!['backup','history','history-download','offer-edit'].includes(act))throw new Error(V3_LOCK_TXT);
 if(act==='backup'){downloadBackup(Store.list());return;}
 if(act==='history'){historySheet();return;}
 if(act==='history-download'){const h=UI.history[+id];if(h)downloadText(JSON.stringify(backupData(historyTrips(h.raw,Store.scope==='guest')),null,2),'Reiseplaner-Sicherungspunkt.json','application/json');return;}
 if(act==='offer-new'||act==='offer-edit'){offerSheet(t,id);return;}
 if(act==='offer-save'){
  if(UI.offerScope!==Store.scope||UI.offerSource!==JSON.stringify(t))throw new Error('Die Reise oder der Speicherbereich hat sich geändert. Angebot bitte erneut öffnen.');
  const o=validateOffer(UI.offerDraft),c=clone(t);c.offers=c.offers||[];const i=c.offers.findIndex(x=>x.id===o.id);
  if(i<0){if(c.offers.length>=200)throw new Error('Maximal 200 Angebote je Reise.');c.offers.push(clone(o));}else c.offers[i]=clone(o);
  if(c.schemaVersion==null)c.schemaVersion=2;validateExtras(c);t.offers=c.offers;t.schemaVersion=c.schemaVersion;closeSheet();
 }
 if(act==='reset')t.search=searchDefaults(t);
 if(act==='preset'){const q=searchDefaults(t);if(id==='wellness'){q.must=['sauna'];q.wish=['quiet','breakfast'];q.type='hotel';}if(id==='budget'){q.must=['kitchen'];q.wish=['parking','quiet'];q.type='fewo';}if(id==='flex'){q.must=['cancel'];q.wish=['sauna','breakfast'];}t.search=q;}
 if(act==='profile-save'){const name=($('#profile-name').value||'').trim();if(!name)throw new Error('Bitte einen Profilnamen eingeben.');t.searchProfiles=t.searchProfiles||[];if(t.searchProfiles.length>=30)throw new Error('Maximal 30 Profile.');t.searchProfiles.push({id:uid('p'),name,filters:clone(searchState(t))});}
 if(act==='profile-load'){const p=(t.searchProfiles||[]).find(x=>x.id===id);if(p)t.search=clone(p.filters);}
 if(act==='profile-delete')t.searchProfiles=(t.searchProfiles||[]).filter(p=>p.id!==id);
 const o=(t.offers||[]).find(x=>x.id===id);
 if(act==='favorite'&&o)o.favorite=!o.favorite;
 if(act==='compare'&&o){if(!o.compare&&(t.offers||[]).filter(x=>x.compare).length>=4)throw new Error('Vergleicht maximal vier Angebote gleichzeitig.');o.compare=!o.compare;}
 if(act==='offer-delete'&&o){if(o.booked||num(o.paid,0)>0||t.activeOfferId===o.id)throw new Error('Gebuchte, bezahlte oder ausgewählte Angebote bleiben geschützt. Zuerst Buchungsstatus prüfen bzw. eine andere Unterkunft auswählen.');openSheet('<h2>Angebot entfernen?</h2><p>'+esc(o.name)+' wird aus dieser Reise entfernt.</p><button class="btn" data-search-act="offer-delete-yes" data-value="'+o.id+'">Ja, entfernen</button><button class="btn ghost" data-act="sheet-x">Abbrechen</button>');return;}
 if(act==='offer-delete-yes'&&o){if(o.booked||num(o.paid,0)>0||t.activeOfferId===o.id)throw new Error('Dieses Angebot ist geschützt.');t.offers=t.offers.filter(x=>x.id!==id);closeSheet();}
 if(act==='offer-use'&&o){if(stayCommitted(t)&&t.activeOfferId!==o.id)throw new Error('Eine gebuchte oder bezahlte Unterkunft ist markiert. Erst Buchungsstand im Bereich Unterkunft prüfen.');if(!offerCurrent(o,t)||o.availability==='unavailable')throw new Error('Zeitraum, Personen, Gültigkeit oder Verfügbarkeit passen nicht.');openSheet('<h2>Für die Planung auswählen?</h2><p>'+esc(o.name)+' · '+eur(offerAmounts(o).total)+' bekannte Unterkunftskosten. '+esc(offerAmounts(o).unknown.join(', '))+'</p><p>Das ersetzt die Unterkunft in eurer Kostenplanung. Es wird keine Buchung ausgelöst.</p><button class="btn" data-search-act="offer-use-yes" data-value="'+o.id+'">Unterkunft auswählen</button><button class="btn ghost" data-act="sheet-x">Abbrechen</button>');return;}
 if(act==='offer-use-yes'&&o){if(!offerCurrent(o,t)||o.availability==='unavailable'||t.check&&t.check.stay&&t.activeOfferId!==o.id)throw new Error('Auswahl nicht mehr zulässig.');applyOffer(t,o);closeSheet();}
 if(t.schemaVersion==null)t.schemaVersion=2;save(t);render();
 }catch(err){const box=$('#offer-error');if(box)box.textContent=err.message;else alertMsg(err.message);}
});

/* Optionale verschlüsselte Exportdatei: keine Änderung des lokalen Reiseformats. */
const SECURE_FORMAT='reiseplaner-encrypted-backup', SECURE_ITERATIONS=600000, MAX_BACKUP_BYTES=5*1024*1024, MAX_SECURE_FILE_BYTES=8*1024*1024;
function hasBackupCrypto(){return typeof crypto!=='undefined'&&crypto.subtle&&typeof crypto.getRandomValues==='function'&&typeof TextEncoder!=='undefined'&&typeof TextDecoder!=='undefined';}
function requireBackupCrypto(){if(!hasBackupCrypto())throw new Error('Passwortschutz ist hier nicht verfügbar. Planer über HTTPS oder localhost öffnen; Klartext-Sicherung bleibt möglich.');}
function bytesBase64(bytes){let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);}
function base64Bytes(value,max){if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||!value.length||value.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new Error('Verschlüsselte Sicherung hat ungültige Daten.');const raw=atob(value),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(bytes.length>max||bytesBase64(bytes)!==value)throw new Error('Verschlüsselte Sicherung hat ungültige Daten.');return bytes;}
function secureHeader(raw){return new TextEncoder().encode(JSON.stringify([raw.format,raw.version,raw.cipher,raw.kdf,raw.iterations,raw.salt,raw.iv]));}
function validateSecureBackup(raw){
 if(!raw||raw.format!==SECURE_FORMAT||raw.version!==1||raw.cipher!=='AES-256-GCM'||raw.kdf!=='PBKDF2-SHA-256'||raw.iterations!==SECURE_ITERATIONS)throw new Error('Unbekanntes Passwortschutz-Format oder unzulässige Kryptoparameter.');
 const salt=base64Bytes(raw.salt,16),iv=base64Bytes(raw.iv,12),ciphertext=base64Bytes(raw.ciphertext,MAX_BACKUP_BYTES+16);
 if(salt.length!==16||iv.length!==12||ciphertext.length<16)throw new Error('Verschlüsselte Sicherung ist unvollständig.');
 return {salt,iv,ciphertext};
}
async function backupKey(password,salt){
 requireBackupCrypto();if(typeof password!=='string'||!password.length||password.length>1024)throw new Error('Bitte ein Passwort eingeben (maximal 1024 Zeichen).');
 const bytes=new TextEncoder().encode(password);
 try{const material=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveKey']);return await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:SECURE_ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}finally{bytes.fill(0);}
}
async function encryptBackup(raw,password){
 requireBackupCrypto();validateBackup(raw);if(typeof password!=='string'||password.length<12||password.length>1024)throw new Error('Für eine neue Sicherung mindestens 12 Zeichen verwenden; eine lange, einzigartige Passphrase ist besser.');
 const plain=new TextEncoder().encode(JSON.stringify(raw));if(plain.length>MAX_BACKUP_BYTES)throw new Error('Sicherung ist zu groß (Inhalt maximal 5 MB).');
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const envelope={format:SECURE_FORMAT,version:1,cipher:'AES-256-GCM',kdf:'PBKDF2-SHA-256',iterations:SECURE_ITERATIONS,salt:bytesBase64(salt),iv:bytesBase64(iv)};
 try{const key=await backupKey(password,salt);const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:secureHeader(envelope),tagLength:128},key,plain);envelope.ciphertext=bytesBase64(new Uint8Array(encrypted));return envelope;}finally{plain.fill(0);}
}
async function decryptBackup(raw,password){
 requireBackupCrypto();const {salt,iv,ciphertext}=validateSecureBackup(raw);const key=await backupKey(password,salt);let plain;
 try{plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:secureHeader(raw),tagLength:128},key,ciphertext));}catch(err){throw new Error('Passwort falsch oder Sicherungsdatei beschädigt. Es wurde nichts importiert.');}
 try{if(plain.length>MAX_BACKUP_BYTES)throw new Error('Entschlüsselter Inhalt ist zu groß.');const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain));validateBackup(data);return data;}finally{plain.fill(0);}
}
function stableBackupValue(x){if(Array.isArray(x))return x.map(stableBackupValue);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().filter(k=>k!=='updated').map(k=>[k,stableBackupValue(x[k])]));return x;}
function importPreview(trips){
 /* auch Zahlungsbuch und Format-3-Angaben benennen, sonst wirkt eine abweichende Reise nur „anders“ ohne Grund (Review R2) */
 const fields={title:'Titel',start:'Anreise',end:'Abreise',persons:'Personen',budget:'Budget',notes:'Notizen',stayId:'Unterkunft',items:'Tagesplan',customActs:'Eigene Unternehmungen',extraCosts:'Zusatzkosten',offers:'Angebote',ledger:'Zahlungsbuch',searchProfiles:'Suchprofile',search:'Suchfilter',check:'Checkliste',schemaVersion:'Speicherformat',transport:'Anreise-Abschnitte',party:'Mitreisende',expenses:'Ausgaben unterwegs',journal:'Reisetagebuch',ratings:'Bewertungen',media:'Fotos',books:'Reisebücher'};
 return trips.map(t=>{const old=Store.get(t.id),incoming=migrateTrip(t),existing=old?migrateTrip(old):null,changed=existing?Object.entries(fields).filter(([k])=>JSON.stringify(stableBackupValue(existing[k]))!==JSON.stringify(stableBackupValue(incoming[k]))).map(([,label])=>label):[];
 const same=existing&&JSON.stringify(stableBackupValue(existing))===JSON.stringify(stableBackupValue(incoming));
 return {id:t.id,title:t.title,range:rangeText(t),persons:t.persons,items:t.items.length,offers:(t.offers||[]).length,profiles:(t.searchProfiles||[]).length,state:!old?'Neue Reise':same?'Bereits vorhanden · identischer Inhalt':'Bereits vorhanden · anderer Inhalt',changed};});
}
function acceptImport(raw,protectedFile){
 UI.importDraft=validateBackup(raw);UI.importProtected=!!protectedFile;UI.importInfo='Sicherungsformat v'+raw.version+(raw.version===1?' · wird auf v2 übernommen':'')+(typeof raw.exportedAt==='string'?' · Export: '+raw.exportedAt.slice(0,40):'');sheetImport();
}
async function readBackupFile(file){
 UI.secureJob=(UI.secureJob||0)+1;const read=UI.importRead=(UI.importRead||0)+1;UI.importDraft=null;UI.encryptedImport=null;
 if(file.size>MAX_SECURE_FILE_BYTES){alertMsg('Datei zu groß: maximal 8 MB, entschlüsselter Inhalt maximal 5 MB.');return;}
 try{UI.archive=null;const head=new Uint8Array(await file.slice(0,2).arrayBuffer());if(read!==UI.importRead)return;
 if(f4IsArchive(file,head)){await f4ReadArchive(file);return;}
 const txt=await file.text();if(read!==UI.importRead)return;const raw=JSON.parse(txt);
 if(raw.format===SECURE_FORMAT){requireBackupCrypto();validateSecureBackup(raw);UI.encryptedImport=raw;openSheet('<h2>Passwortgeschützte Sicherung öffnen</h2><p>Die Datei wird nur in diesem Browser geöffnet. Danach könnt ihr die Reisen und Konflikte prüfen, bevor etwas importiert wird.</p><label class="fld"><span>Passwort der Sicherung</span><input type="password" id="secure-import-password" autocomplete="off" maxlength="1024"></label><div class="row"><button class="btn" data-secure-act="decrypt">Entschlüsseln & prüfen</button><button class="btn ghost" data-act="sheet-x">Abbrechen</button></div><p id="secure-error" role="alert"></p>');}
 else{if(file.size>MAX_BACKUP_BYTES)throw new Error('Unverschlüsselte Sicherung ist zu groß (maximal 5 MB).');acceptImport(raw,false);}
 }catch(err){if(read===UI.importRead){UI.importDraft=null;UI.encryptedImport=null;alertMsg('Import nicht möglich: '+err.message);}}
}
function secureBackupSheet(trips){
 try{requireBackupCrypto();const payload=backupData(trips);validateBackup(payload);UI.securePayload=payload;
 openSheet('<h2>Reisen mit Passwort sichern</h2><p>'+trips.length+' Reisen einschließlich Notizen, Angeboten und Suchprofilen. Verwendet eine lange, einzigartige Passphrase. Ohne Passwort lässt sich die Datei nicht wiederherstellen.</p><p class="small muted">Nur die heruntergeladene Datei wird verschlüsselt. Reisedaten und Sicherungspunkte im Browser bleiben unverschlüsselt. Das Passwort wird nicht gespeichert.</p><label class="fld"><span>Neues Passwort (mindestens 12 Zeichen)</span><input type="password" id="secure-export-password" minlength="12" maxlength="1024" autocomplete="new-password"></label><label class="fld"><span>Passwort wiederholen</span><input type="password" id="secure-export-repeat" maxlength="1024" autocomplete="new-password"></label><label><input type="checkbox" id="secure-understood"> Ich bewahre das Passwort getrennt auf. Es gibt keine Passwort-Wiederherstellung.</label><div class="row"><button class="btn" data-secure-act="encrypt">Verschlüsselte Datei herunterladen</button><button class="btn ghost" data-act="sheet-x">Abbrechen</button></div><p id="secure-error" role="alert"></p>');
 }catch(err){alertMsg(err.message);}
}
document.addEventListener('click',async e=>{
 const b=e.target.closest('[data-secure-act]');if(!b)return;e.preventDefault();const act=b.getAttribute('data-secure-act');if(Store.corruptRaw!==null)return;
 if(act==='all'){secureBackupSheet(Store.list());return;}
 if(act==='trip'){const t=cur();if(t)secureBackupSheet([t]);return;}
 if(b.disabled)return;const job=UI.secureJob||0,box=$('#secure-error');b.disabled=true;
 try{
 if(act==='encrypt'){let password=$('#secure-export-password').value;const repeat=$('#secure-export-repeat').value;if(password!==repeat)throw new Error('Die Passwörter stimmen nicht überein.');if(!$('#secure-understood').checked)throw new Error('Bitte den Hinweis zur Passwort-Wiederherstellung bestätigen.');
 const payload=UI.securePayload;const promise=encryptBackup(payload,password);password='';$('#secure-export-password').value='';$('#secure-export-repeat').value='';if(box)box.textContent='Sicherung wird verschlüsselt …';const encrypted=await promise;if(job!==(UI.secureJob||0))return;
 downloadText(JSON.stringify(encrypted),'Reiseplaner-Passwort-Sicherung-'+new Date().toISOString().slice(0,10)+'.json','application/json');closeSheet();alertMsg('Verschlüsselte Datei zum Download bereit. Datei und Passwort getrennt aufbewahren.');}
 if(act==='decrypt'){let password=$('#secure-import-password').value;const envelope=UI.encryptedImport;const promise=decryptBackup(envelope,password);password='';$('#secure-import-password').value='';if(box)box.textContent='Datei wird entschlüsselt …';const raw=await promise;if(job!==(UI.secureJob||0))return;UI.encryptedImport=null;acceptImport(raw,true);}
 }catch(err){if(job===(UI.secureJob||0)&&box)box.textContent=err.message;}finally{if(job===(UI.secureJob||0))b.disabled=false;}
});

