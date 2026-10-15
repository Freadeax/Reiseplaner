/* Editorzustand, unabhängig von DOM und Store. Produktive Bearbeitung noch gesperrt.
   App übergibt Kandidaten-API und synchrone Speicher-/Rechte-Hooks. */
(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory(require('./v3forms.js'));
 else root.RPV3Editor=factory(root.RPV3Forms);
})(typeof self!=='undefined'?self:this,function(F){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x));
 function create(api,hooks){
  let draft=null,serial=0,busy=false;
  function current(){
   if(!draft)throw Error('Dieser Entwurf ist nicht mehr geöffnet.');
   if(!hooks.enabled())throw Error('Die Bearbeitung von Format 3 ist noch nicht freigegeben.');
   const t=hooks.getTrip(draft.session.tripId);
   F.assertFresh(draft.session,t,hooks.scope());
   if(!hooks.canEdit(t))throw Error('Die Reise ist nicht mehr zum Bearbeiten freigegeben.');
   return t;
  }
  function state(){return draft?{token:draft.token,tripId:draft.session.tripId,action:draft.action,target:clone(draft.target),transport:clone(draft.transport),phase:draft.candidate?'preview':'edit',fields:clone(draft.fields),preview:draft.preview}:null}
  function begin(tripId,action,target){
   if(busy)throw Error('Speichern läuft bereits.');
   if(!['transport','cancel','refund','uncancel'].includes(action))throw Error('Unbekannte Editoraktion.');
   if(!hooks.enabled())throw Error('Die Bearbeitung von Format 3 ist noch nicht freigegeben.');
   const t=hooks.getTrip(tripId);if(!t||!hooks.canEdit(t))throw Error('Die Reise ist nicht zum Bearbeiten freigegeben.');
   const session=F.session(t,hooks.scope()),ref=action==='transport'?null:api.financeEntry(t,target);
   draft={session,transport:clone(session.transport),action,target:target?clone(target):null,ref,candidate:null,preview:'',fields:{},token:++serial};return state();
  }
  function preview(fields){
   if(busy)throw Error('Speichern läuft bereits.');
   const t=current();
   /* Eine fehlgeschlagene neue Vorschau darf keinen alten Kandidaten freigeben. */
   draft.candidate=null;draft.preview='';draft.fields=clone(fields||{});draft.token=++serial;
   let next;
   if(draft.action==='transport')next=api.setTransport(t,F.readTransport(draft.fields,draft.transport));
   else if(draft.action==='cancel')next=api.cancelEntry(t,draft.target,F.cancelPayload(draft.fields,draft.ref.entry));
   else if(draft.action==='refund')next=api.addRefund(t,draft.target,F.refundPayload(draft.fields,hooks.newId(),draft.ref.entry));
   else next=api.uncancel(t,draft.target);
   if(next.id!==t.id)throw Error('Die geprüfte Änderung gehört zu einer anderen Reise.');
   const html=draft.action==='transport'?F.transportPreview(t.transport,next.transport):F.financialPreview(draft.ref,api.financeEntry(next,draft.target));
   draft.candidate=clone(next);draft.preview=html;return state();
  }
  function apply(token){
   if(busy)throw Error('Speichern läuft bereits.');
   current();
   if(!draft.candidate||draft.token!==token)throw Error('Bitte die aktuelle Änderung zuerst prüfen.');
   busy=true;
   try{
    /* Niemals den privaten Vorschaukandidaten selbst an mutierenden Store reichen. */
    const next=clone(draft.candidate);
    if(hooks.put(next)!==true)throw Error('Die Änderung wurde nicht gespeichert. Bitte Speicherstatus prüfen.');
    draft=null;return true;
   }finally{busy=false}
  }
  function back(){if(busy)throw Error('Speichern läuft bereits.');current();draft.candidate=null;draft.preview='';draft.token=++serial;return state()}
  function segment(op,fields){
   if(busy)throw Error('Speichern läuft bereits.');const t=current();
   if(draft.action!=='transport')throw Error('Kein Anreiseentwurf geöffnet.');
   draft.candidate=null;draft.preview='';draft.token=++serial;
   const tr=F.changeTransport(F.readTransport(fields||{},draft.transport),Object.assign({},op,{newId:op.action==='add'?hooks.newId():undefined}));
   api.setTransport(t,tr); /* auch innerhalb des Entwurfs keine versteckte Verpflichtungsverletzung */
   draft.transport=tr;draft.fields={};return state();
  }
  function close(){if(busy)throw Error('Speichern läuft bereits.');draft=null;serial++}
  function revise(fields){
   if(busy)throw Error('Speichern läuft bereits.');const t=current();
   if(draft.action!=='transport')throw Error('Kein Anreiseentwurf geöffnet.');
   draft.candidate=null;draft.preview='';draft.token=++serial;
   const tr=F.readTransport(fields,draft.transport);api.setTransport(t,tr);
   draft.transport=tr;draft.fields={};return state();
  }
  return {begin,preview,apply,back,segment,revise,close,state};
 }
 return {create};
});
