/* Reiseplaner · Datenvertrag v3: Prüfung, Schreibschutz, Editor-Anbindung.
   Teil 3 von 19 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Datenvertrag v3, Lese-Release (Claude, #8; docs/SCHEMA_V3.md) =================
   Format 3 wird gelesen, geprüft, berechnet und unverändert zurückgeschrieben. Erfassung neuer v3-Angaben gibt es in
   der Oberfläche noch nicht. §3/§4 (Mitreisende, Ausgaben, Tagebuch) kennt diese Version noch nicht: solche Reisen gelten
   als nicht lesbar und werden geschützt statt falsch angezeigt. */
const V3=typeof window!=='undefined'&&window.RPV3?window.RPV3:null;
/* Kompatibilitäts-Gate: Reisen im Format 3 bleiben schreibgeschützt, bis Bedienung und Verpflichtungsschutz vollständig
   verdrahtet und E2 in der Produktion bestätigt ist (Review ChatGPT, #8). Gilt für Import und Sync ebenso. */
const V3_EDIT=true;
let v3Editor=null;
function v3CanEdit(t){const m=t&&Store.meta[t.id];return !!(t&&V3_EDIT&&Store.corruptRaw===null&&!Store.localError&&!Store.conflict&&Store.canEdit(t.id)&&!(m&&(m.unreadable||m.conflict)))}
function v3Controller(){
 if(!window.RPV3Forms||!window.RPV3Editor)throw Error('Die Editorbausteine konnten nicht geladen werden. Bitte neu laden.');
 if(!v3Editor)v3Editor=window.RPV3Editor.create({financeEntry,cancelEntry,addRefund,uncancel,setTransport,cost,openCosts},{getTrip:id=>Store.get(id),scope:()=>Store.scope,enabled:()=>V3_EDIT,canEdit:v3CanEdit,newId:()=>uid('rf'),put:t=>Store.put(t)});
 return v3Editor;
}
function v3Actions(t,target){
 if(!v3CanEdit(t))return '';let view;try{view=financeEntry(t,target)}catch(e){return ''}
 const entry=view.entry||{},attrs=' data-v3-target="'+esc(JSON.stringify(target))+'"';
 return '<div class="row">'+[['cancel',entry.cancel?'Storno ändern':'Storno erfassen'],...(entry.paid>0?[['refund','Erstattung erhalten']]:[]),...(entry.cancel?[['uncancel','Storno zurücknehmen']]:[])].map(([action,label])=>'<button type="button" class="btn ghost sm" data-v3-open="'+action+'"'+attrs+'>'+label+'</button>').join('')+'</div>';
}
function v3TransportBlock(t){return v3CanEdit(t)?'<section class="block"><h2>Anreise in Abschnitten</h2><p class="small muted">Hin- und Rückreise mit eigenen Preisen, Ortszeiten und Zusatzposten vorbereiten. Erst eine geprüfte Vorschau übernehmen.</p><button type="button" class="btn ghost" data-v3-open="transport">Abschnitte bearbeiten</button></section>':''}
function v3Sheet(){
 const s=v3Controller().state();if(!s)return;const F=window.RPV3Forms,t=Store.get(s.tripId);
 const body=s.phase==='preview'?s.preview+'<div class="row"><button type="button" class="btn" data-v3-editor-action="apply" data-token="'+s.token+'">Änderung im Reiseplan speichern</button><button type="button" class="btn ghost" data-v3-editor-action="back">Weiter bearbeiten</button></div>':s.action==='transport'?F.transportForm(s.transport):F.financialForm(s.action,financeEntry(t,s.target));
 openSheet('<div data-v3-sheet><p class="eyebrow">'+(s.phase==='preview'?'2 · Prüfen & bestätigen':'1 · Angaben vorbereiten')+'</p><div id="v3-editor-error" class="note" role="alert" tabindex="-1" hidden></div>'+body+'</div>');
 if(s.phase!=='preview')document.querySelectorAll('[data-v3-sheet] [name]').forEach(el=>{if(Object.hasOwn(s.fields,el.name))el.value=s.fields[el.name]});
}
function v3EditorOpen(t,action,target){v3Controller().begin(t.id,action,target);v3Sheet()}
document.addEventListener('change',e=>{
 if(!e.target.closest('[data-v3-sheet]')||!String(e.target.name||'').endsWith('.mode'))return;
 try{const fields={};document.querySelectorAll('[data-v3-sheet] [name]').forEach(el=>{fields[el.name]=el.value});v3Controller().revise(fields);v3Sheet()}
 catch(err){const box=$('#v3-editor-error');if(box){box.textContent=err.message;box.hidden=false;box.focus()}}
});
document.addEventListener('click',e=>{
 const open=e.target.closest('[data-v3-open]'),button=e.target.closest('[data-v3-editor-action]');if(!open&&!button)return;
 try{
  if(open){const t=cur();if(!t)throw Error('Reise nicht mehr geöffnet.');v3EditorOpen(t,open.getAttribute('data-v3-open'),JSON.parse(open.getAttribute('data-v3-target')||'null'));return}
  if(!button.closest('[data-v3-sheet]'))return;
  const editor=v3Controller(),action=button.getAttribute('data-v3-editor-action'),fields={};
  document.querySelectorAll('[data-v3-sheet] [name]').forEach(el=>{fields[el.name]=el.value});
  if(action==='apply'){editor.apply(Number(button.getAttribute('data-token')));closeSheet();render();return}
  if(action==='back')editor.back();
  else if(action.startsWith('segment-'))editor.segment({action:action.slice(8),dir:button.getAttribute('data-dir'),id:button.getAttribute('data-id'),addonId:button.getAttribute('data-addon')},fields);
  else if(action.startsWith('preview-'))editor.preview(fields);else return;
  v3Sheet();
 }catch(err){const box=$('#v3-editor-error');if(box){box.textContent=err.message;box.hidden=false;box.focus()}else alertMsg(err.message)}
});
const V3_LOCK_TXT='Diese Reise nutzt Angaben aus Format 3 (Anreise-Abschnitte, Storno, Mitreisende/Ausgaben oder Tagebuch). Diese App-Version zeigt sie nur an, Änderungen werden nicht gespeichert.';
function v3Banner(t){if(!isV3(t)||V3_EDIT)return '';const f=financeSummary(t),v=f.v3||{};
  return '<section class="block"><div class="note" role="status"><b>Nur ansehen: Format 3</b><p>'+esc(V3_LOCK_TXT)+' Kosten berücksichtigen Anreise-Abschnitte und Storno. Erstattungen und Stornogebühren stehen getrennt, ohne Verrechnung.</p>'+
   (v.refundOpen||v.feeOpen||v.unknownFee?'<p class="small">'+[v.refundOpen?'Erstattungen offen: '+eur(v.refundOpen):'',v.feeOpen?'Stornogebühren offen: '+eur(v.feeOpen):'',v.unknownFee?v.unknownFee+'× Stornogebühr unbekannt':''].filter(Boolean).join(' · ')+'</p>':'')+'</div></section>'}
const SCHEMA_MAX=3;
const isV3=t=>!!t&&t.schemaVersion===3&&!!V3;
function v3Transport(t){const tr=isV3(t)&&t.transport;return tr&&((tr.out||[]).length||(tr.back||[]).length)?tr:null}
function v3Money(t,e){return isV3(t)&&e&&(e.cancel||(e.refunds&&e.refunds.length))?e:null}
function validateV3(t){
  if(!V3)throw new Error('Format 3 kann diese App-Version nicht prüfen.');
  splitValidate(t); /* P0.2a: party, expenses, ledger/offers paidBy (v3split.js) */
  Object.keys(t.ledger||{}).forEach(k=>{const e=t.ledger[k];if(e&&(e.refunds!=null||e.cancel!=null))V3.validateMoneyMoves(e,'Buchungsbuch '+k)});
  (t.offers||[]).forEach(o=>{if(o.refunds!=null||o.cancel!=null)V3.validateMoneyMoves(o,'Angebot '+o.name)});
  journalValidate(t); /* Tagebuch und Bewertungen (§4): Block „Reisetagebuch und Bewertungen“ */
  if(t.transport!=null)V3.validateTransport(t.transport);
  V3.validateReferences(t);
}
/* Mutatoren für die Format-3-Formulare (Claude, #8; Signaturen von ChatGPT). Reine Kandidaten: die Quelle bleibt unverändert,
   kein Store/DOM/Sync. Jeder Kandidat wird vollständig geprüft; mit v3-Angaben wird er Format 3, nie zurück auf 2.
   target: {kind:'offer', id} oder {kind:'ledger', key}. */
function v3Candidate(t,fn,ref){
  if(!V3)throw new Error('Format 3 kann diese App-Version nicht bearbeiten.');
  const c=clone(t);fn(c);
  if(t.schemaVersion===3||V3.needsV3(c))c.schemaVersion=3;
  validateExtras(c);
  /* Die bewusst geänderte Geldangabe des Zielpostens ist gewollt; alles andere bleibt durch den Verpflichtungsschutz geprüft */
  const cmp=clone(c);if(ref)ref.restore(cmp,t);
  const issues=commitmentIssues(t,cmp);if(issues.length)throw new Error('Nicht möglich: '+issues.join(' · ')+'.');
  return c;
}
function v3Ref(t,target){
  if(!target||typeof target!=='object')throw new Error('Unbekannter Posten.');
  if(target.kind==='offer'){const o=(t.offers||[]).find(x=>x.id===target.id);if(!o)throw new Error('Angebot nicht gefunden.');const oa=offerAmounts(o);
    return {label:o.name,entry:o,planCost:oa.unknown.length?null:oa.total,get:c=>(c.offers||[]).find(x=>x.id===target.id),
      restore:(c,src)=>{const i=(c.offers||[]).findIndex(x=>x.id===target.id),j=(src.offers||[]).findIndex(x=>x.id===target.id);if(i>=0&&j>=0)c.offers[i]=clone(src.offers[j])}}}
  if(target.kind==='ledger'){
    if(typeof target.key!=='string'||!LEDGER_KEY.test(target.key))throw new Error('Unbekannter Posten.');
    const row=ledgerRows(t).find(r=>r.key===target.key);
    if(!row)throw new Error('Posten nicht gefunden.');
    const e=(t.ledger||{})[target.key]||{status:'offen',amount:null,paid:0,due:''};
    return {label:row.label,entry:e,planCost:row.amount!=null?row.amount:row.planOpen||row.orphan?null:row.plan,
      get:c=>{c.ledger=c.ledger||{};if(!c.ledger[target.key])c.ledger[target.key]={status:'offen',amount:null,paid:0,due:''};return c.ledger[target.key]},
      restore:(c,src)=>{c.ledger=c.ledger||{};if(src.ledger&&src.ledger[target.key])c.ledger[target.key]=clone(src.ledger[target.key]);else delete c.ledger[target.key]}}}
  throw new Error('Unbekannter Posten.');
}
function financeEntry(t,target){const r=v3Ref(t,target),e=clone(r.entry);return {label:r.label,entry:e,planCost:r.planCost,math:V3.cancelMath(e,r.planCost),warnings:V3.cancelWarnings(e,r.planCost)}}
function cancelEntry(t,target,f){
  const r=v3Ref(t,target),fee=f&&f.fee!==''&&f.fee!=null?Math.round(num(f.fee,NaN)*100)/100:null;
  if(f&&f.fee!==''&&f.fee!=null&&!(fee>=0))throw new Error('Stornogebühr ungültig.');
  return v3Candidate(t,c=>{r.get(c).cancel={on:String(f&&f.on||''),fee}},r);
}
function addRefund(t,target,f){
  const r=v3Ref(t,target),amount=Math.round(num(f&&f.amount,NaN)*100)/100;
  if(!(amount>0))throw new Error('Erstattung muss größer als 0 € sein.');
  return v3Candidate(t,c=>{const e=r.get(c);e.refunds=(e.refunds||[]).concat([{id:String(f&&f.id||''),on:String(f&&f.on||''),amount}])},r);
}
function uncancel(t,target){
  const r=v3Ref(t,target);if(!r.entry.cancel)throw new Error('Dieser Posten ist nicht storniert.');
  /* Erstattungen bleiben immer erhalten (SCHEMA_V3 S10) */
  return v3Candidate(t,c=>{delete r.get(c).cancel},r);
}
function setTransport(t,transport){
  const tr=V3?V3.validateTransport(transport):null;
  /* gebundene Abschnitte: weder entfernen noch tauschen, ändern oder umsortieren (Inhalt über commitmentIssues, Reihenfolge hier) */
  const bound=id=>Object.keys(t.ledger||{}).some(k=>(k==='tr:'+id||k.startsWith('tr:'+id+':'))&&V3.segmentRemovalCheck({[k]:t.ledger[k]},id).ok===false);
  ['out','back'].forEach(dir=>{const before=(t.transport&&t.transport[dir]||[]).map(x=>x.id).filter(bound),after=(tr&&tr[dir]||[]).map(x=>x.id).filter(id=>before.includes(id));
    if(before.length&&JSON.stringify(before)!==JSON.stringify(after))throw new Error('Gebuchte Anreise-Abschnitte dürfen nicht entfernt, verschoben oder umsortiert werden.')});
  /* volle Schlüssel tr:<abschnitt> und tr:<abschnitt>:<zusatz>: auch ein entfernter Zusatzposten eines bleibenden Abschnitts */
  const keep=new Set([].concat(tr&&tr.out||[],tr&&tr.back||[]).flatMap(s=>['tr:'+s.id,...(s.addons||[]).map(a=>'tr:'+s.id+':'+a.id)]));
  return v3Candidate(t,c=>{c.transport=tr;
    /* Planwerte entfernter Abschnitte ohne Historie verschwinden; Geld-/Stornohistorie bleibt immer am ursprünglichen Posten */
    Object.keys(c.ledger||{}).forEach(k=>{if(!k.startsWith('tr:')||keep.has(k))return;const e=c.ledger[k];
      if(!(e.status==='gebucht'||e.status==='angefragt'||num(e.paid,0)>0||e.due||e.cancel||(e.refunds&&e.refunds.length)||e.paidBy!=null))delete c.ledger[k]})});
}
