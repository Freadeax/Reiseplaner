/* Reiseplaner · Varianten anlegen (M05.1, docs/planung M05 §3 F1, §6 V1, §8).
   Zusatzteil der App, lädt nach app/kosten.js (braucht uid, clone). Klassisches Skript ohne Bundler wie die übrigen Teile.

   variantCopy(t,o) ist rein: sie liest nur die Reise und gibt eine neue Reise zurück, ändert nichts und speichert nichts.
   Eine Variante ist eine vollständige normale Reise (M05 §5), damit Kosten, Sync, Export und Rechte unverändert gelten.
   Kopiert werden nur Planinhalte (Positivliste VARIANT_PLAN). Nicht kopiert wird alles, was schon passiert ist:
   Buchungsstatus, Zahlungen, Erstattungen, Storno, Zahler, Ausgaben, Tagebuch, Bewertungen, Fotos, Reisebücher,
   abgehakte Checkliste und erledigte Fristen. Unbekannte Felder (neuere App-Version) werden nicht still übernommen,
   sondern in `unknown` genannt, damit die Vorschau sie zeigt. Feldtreue gilt für die Quelle, die unverändert bleibt.
   Kein neues Datenfeld: der Verweis auf die Gruppe (t.variant) kommt erst mit Format 5 (M05.2). */
"use strict";
const VARIANT_PLAN=['type','dateMode','start','end','month','nights','persons','budget','origin','originGeo','dest','destGeo','place','catalog','tz','legs',
  'travel','km','kmSrc','routeKm','routeMin','routeHomeMin','routeAt','verb','preis','ticket','departTime','checkinTime',
  'stayId','stayQuote','customStays','cardConfirmed','items','customActs','food','puffer','online','extraCosts','customChecks',
  'packageId','search','searchProfiles','transport','party','schemaVersion'];
/* Felder, die die Kopie bewusst neu setzt oder auf Wunsch übernimmt */
const VARIANT_RESET=['id','title','status','created','updated','check','offers','activeOfferId','notes'];
/* Geschichte und Serverangaben: nie kopiert */
const VARIANT_HISTORY=['ledger','expenses','journal','ratings','media','books','deadlineAck','members','owner_id','role','deleted'];
const VARIANT_LABELS={ledger:'Buchungsstatus und Zahlungen',expenses:'Ausgaben unterwegs',journal:'Reisetagebuch',ratings:'Bewertungen',media:'Fotos',
  books:'Reisebücher',deadlineAck:'erledigte Fristen',check:'abgehakte Checkliste',notes:'Notizen',members:'Freigaben',owner_id:'Eigentümer',role:'Rolle',deleted:'Löschvermerk'};
/* Angebot ohne Buchung, Zahlung, Storno und Erstattung; Preis, Gebühren, Kaution und Bedingungen bleiben Planwerte */
function variantOffer(o){
  const c=clone(o);c.booked=false;c.paid=0;delete c.paidBy;delete c.refunds;delete c.cancel;return c;
}
function offerCommitted(t,o){return !!(o&&(o.booked||+o.paid>0||o.cancel||(o.refunds||[]).length||t.check&&t.check.stay))}
/* activeOfferId (V1): das gewählte Angebot bleibt gewählt, aber nur als bereinigte Kopie ohne Buchung und Zahlung,
   damit die Variante mit demselben Planpreis (inkl. bekannter Gebühren) rechnet. Ein storniertes Angebot wird nicht gewählt. */
/* o: {label?, notes?:bool, today?:'JJJJ-MM-TT'}. Ergebnis: {trip, from, dropped:[Text], unknown:[Feld], notes:[Text]} */
function variantCopy(t,o){
  o=o||{};
  if(!t||typeof t!=='object'||typeof t.id!=='string')throw new Error('Keine Reise zum Kopieren.');
  const n={};
  VARIANT_PLAN.forEach(k=>{if(t[k]!==undefined)n[k]=clone(t[k])});
  const label=String(o.label==null?'':o.label).trim().slice(0,60);
  n.id=uid('t');
  n.title=(label?String(t.title||'Reise').slice(0,80-label.length-3)+' · '+label:String(t.title||'Reise').slice(0,70)+' (Variante)').slice(0,80);
  n.status=t.status==='idee'?'idee':'planung';
  n.created=o.today||new Date().toISOString().slice(0,10);
  n.check={};
  n.notes=o.notes===true&&typeof t.notes==='string'?t.notes:'';
  const notes=[];
  if(Array.isArray(t.offers)){
    n.offers=t.offers.map(variantOffer);
    const act=t.activeOfferId?t.offers.find(x=>x&&x.id===t.activeOfferId):null;
    n.activeOfferId=act&&!act.cancel?act.id:null;
    if(act&&act.cancel)notes.push('Die Unterkunft „'+String(act.name||'')+'“ ist in der Quelle storniert und in der Variante nicht gewählt.');
    else if(offerCommitted(t,act))notes.push('Die Unterkunft „'+String(act.name||'')+'“ ist in der Quelle gebucht oder bezahlt. In der Variante ist sie nur geplant, nicht gebucht.');
  }else if(t.activeOfferId!==undefined)n.activeOfferId=null;
  const dropped=[];
  VARIANT_HISTORY.forEach(k=>{const v=t[k];if(v==null)return;if(typeof v==='object'&&!Object.keys(v).length)return;dropped.push(VARIANT_LABELS[k]||k)});
  if(t.check&&Object.values(t.check).some(Boolean))dropped.push(VARIANT_LABELS.check);
  if(o.notes!==true&&typeof t.notes==='string'&&t.notes.trim())dropped.push(VARIANT_LABELS.notes);
  if(Array.isArray(t.offers)&&t.offers.some(x=>x&&(x.booked||+x.paid>0||x.cancel||x.paidBy!=null||(x.refunds||[]).length)))dropped.push('Buchung und Zahlungen der Angebote');
  const known=new Set([...VARIANT_PLAN,...VARIANT_RESET,...VARIANT_HISTORY]);
  const unknown=Object.keys(t).filter(k=>!known.has(k)&&t[k]!==undefined);
  return {trip:n,from:t.id,dropped,unknown,notes};
}
