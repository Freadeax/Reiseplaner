/* Reiseplaner · Gästekarten-Rechnung (M09.1, docs/planung M09 §6 und §8).
   Zusatzteil der App, lädt direkt vor app/kosten.js. Klassisches Skript ohne Bundler wie die übrigen Teile.
   cardPricing() ist eine reine Funktion: sie bekommt nur einfache Daten und liest weder Reise, Katalog noch DOM.
   Damit rechnen Kostenübersicht, Reisefinder und Szenarien gleich (M09 §8), und Node kann sie direkt prüfen.
   cardPricingFor() ist die einzige Anbindung an die App (ACTS, actOf, stayOf) und wird nur zur Laufzeit gerufen.

   Regeln mit heutiger Datenlage (ohne Formatänderung):
   - Nur Status 'enthalten' senkt die Hauptrechnung. 'unbestaetigt' rechnet Normalpreis und weist den Vorteil
     getrennt als possible aus, nie in applied. 'nicht' rechnet Normalpreis ohne Vorteil.
   - Gemeinsame Limits je Gruppe (heute nur 'top': eine Top-Leistung je Tag). Alle Termine werden chronologisch
     durchlaufen (Tag, Tageszeit, Uhrzeit, dann uid); die ersten perDay je Tag erhalten den Kartenpreis, die
     übrigen den Normalpreis (Philipp 23.10.: chronologisch). Ein mit der Karte freier Skipass-Tag belegt die
     Top-Leistung dieses Tages, wie bisher in cost().
   - Ein Kurspreis (ppKurs bei gebuchtem Kurs) geht dem Kartenpreis vor, wie bisher in cost(). */
"use strict";
const GC_STATUS=['enthalten','nicht','unbestaetigt'];
const GC_SLOT={morgen:0,mittag:1,nachm:2,abend:3};
const GC_LIMITS={top:{perDay:1}};
function gcMin(s){const m=/^(\d{1,2}):(\d{2})$/.exec(String(s||''));return m?(+m[1])*60+(+m[2]):9999}
function gcEur(v){const r=Math.round((+v||0)*100)/100;return r.toLocaleString('de-DE',{minimumFractionDigits:r%1?2:0,maximumFractionDigits:2})+' €'}
function gcNum(v){return Number.isFinite(+v)?+v:0}
/* Chronologische Reihenfolge für gemeinsame Limits (M09 §6 Regel 6). Gibt Indizes der Eingabe zurück. */
function gcOrder(items){
  return items.map((it,i)=>i).sort((a,b)=>{const x=items[a],y=items[b];
    return x.day-y.day||(GC_SLOT[x.slot]??9)-(GC_SLOT[y.slot]??9)||gcMin(x.time)-gcMin(y.time)||
      (String(x.uid??'')<String(y.uid??'')?-1:String(x.uid??'')>String(y.uid??'')?1:0)||a-b});
}
/* Eingabe:
   { persons, status:'enthalten'|'nicht'|'unbestaetigt', cardName, kursActive:bool,
     pass:{cardPass:bool, passDay:Zahl, days:[Tagindex]}|null,
     limits:{gruppe:{perDay}} (Standard: top 1 je Tag),
     items:[{uid, day, slot, time, label, pp, cardPp|null, ppKurs|null, grp, top:bool}] }
   Ausgabe: { status, items:[{uid, day, normal, applied, possible, reason, text}] in Eingabe-Reihenfolge,
     pass:{days, normal, applied, possible, reason}|null, applied (eingerechnete Ersparnis), possible (getrennter
     möglicher Vorteil), days:{Tag:[Erklärung]} }
   reason: 'frei' | 'kartenpreis' | 'limit' | 'kurs' | 'unbestaetigt' | 'nicht' | 'ohne' (keine Kartenleistung). */
function cardPricing(input){
  const o=input||{}, P=Math.max(1,Math.round(gcNum(o.persons)||1));
  const status=GC_STATUS.includes(o.status)?o.status:'unbestaetigt';
  const name=String(o.cardName||'Gästekarte'), limits=o.limits||GC_LIMITS, items=Array.isArray(o.items)?o.items:[];
  const pass=o.pass&&o.pass.cardPass?o.pass:null, passDays=pass?[...new Set(pass.days||[])]:[];
  /* Kartenrechnung für einen angenommenen Status 'enthalten'; für 'unbestaetigt' nur als Vergleich. */
  const simulate=()=>{
    const used={}, res=new Array(items.length), take=(g,day)=>{const lim=limits[g]||{};const k=g+'|'+day;used[k]=(used[k]||0)+1;return lim.perDay==null||used[k]<=lim.perDay};
    passDays.forEach(d=>take('top',d));
    gcOrder(items).forEach(i=>{const it=items[i], pp=gcNum(it.pp), grp=gcNum(it.grp);
      const kurs=it.ppKurs!=null&&o.kursActive, normalPp=kurs?gcNum(it.ppKurs):pp;
      let cardPpUsed=pp, reason='ohne';
      if(it.cardPp!=null){
        if(it.top){if(take('top',it.day)){cardPpUsed=gcNum(it.cardPp);reason=gcNum(it.cardPp)===0?'frei':'kartenpreis'}else reason='limit'}
        else{cardPpUsed=gcNum(it.cardPp);reason=gcNum(it.cardPp)===0?'frei':'kartenpreis'}
      }
      if(kurs){cardPpUsed=gcNum(it.ppKurs);if(it.cardPp!=null)reason='kurs'}
      res[i]={normal:normalPp*P+grp,card:cardPpUsed*P+grp,reason};
    });
    return res;
  };
  const sim=simulate(), out={status,items:[],pass:null,applied:0,possible:0,days:{}};
  const note=(day,text)=>{(out.days[day]=out.days[day]||[]).push(text)};
  /* Erste Top-Leistung je Tag für die Erklärung beim Limit */
  const firstTop={};passDays.forEach(d=>{firstTop[d]='Skipass'});
  gcOrder(items).forEach(i=>{const it=items[i];if(it.top&&it.cardPp!=null&&sim[i].reason!=='limit'&&firstTop[it.day]==null)firstTop[it.day]=String(it.label||'Leistung')});
  items.forEach((it,i)=>{const s=sim[i], label=String(it.label||'Leistung');
    let applied=s.normal, possible=0, reason=s.reason, text='';
    const saving=Math.max(0,s.normal-s.card);
    if(it.cardPp==null)reason='ohne';
    else if(status==='enthalten'){applied=s.card;
      if(reason==='frei')text=label+': mit '+name+' frei'+(it.top?' (Top-Leistung des Tages)':'');
      else if(reason==='kartenpreis')text=label+': mit '+name+' '+gcEur(it.cardPp)+' p. P. statt '+gcEur(it.pp);
      else if(reason==='limit')text=label+': zählt ebenfalls als Top-Leistung, heute schon '+firstTop[it.day]+' → Normalpreis '+gcEur(it.pp)+' p. P.';
      else if(reason==='kurs')text=label+': Kurspreis '+gcEur(it.ppKurs)+' p. P., die Karte wirkt hier nicht';
    }else if(status==='unbestaetigt'){possible=saving;reason='unbestaetigt';
      text=label+': Normalpreis eingerechnet, '+name+' unbestätigt'+(saving>0?' · möglicher Vorteil −'+gcEur(saving):'');
    }else reason='nicht';
    if(text)note(it.day,text);
    out.applied+=s.normal-applied;out.possible+=possible;
    out.items.push({uid:it.uid,day:it.day,normal:s.normal,applied,possible,reason,text});
  });
  if(pass&&passDays.length){const n=passDays.length, normal=gcNum(pass.passDay)*P*n;
    const applied=status==='enthalten'?0:normal, possible=status==='unbestaetigt'?normal:0;
    out.pass={days:n,normal,applied,possible,reason:status==='enthalten'?'frei':status};
    passDays.forEach(d=>note(d,status==='enthalten'?'Skipass: in '+name+' enthalten (zählt als Top-Leistung)':status==='unbestaetigt'?'Skipass: Normalpreis eingerechnet, '+name+' unbestätigt · möglicher Vorteil −'+gcEur(gcNum(pass.passDay)*P):'Skipass: ohne Gästekarte zum Normalpreis'));
    out.applied+=normal-applied;out.possible+=possible;
  }
  return out;
}
/* Status aus heutiger Datenlage (Format 2–4): 'enthalten' nur mit Unterkunft und t.cardConfirmed===true,
   genau wie bisher in cost(). Sonst 'unbestaetigt', wenn die Unterkunft eine Karte hat oder haben könnte
   (card true oder '?'), sonst 'nicht'. Format 5 (t.guestCards, M09.3) ersetzt diese Ableitung. */
function cardStatusOf(t,st){
  if(st&&t&&t.cardConfirmed===true)return 'enthalten';
  if(st&&(st.card===true||st.card==='?'))return 'unbestaetigt';
  return 'nicht';
}
/* Anbindung an cost(): items sind die bereits gefilterten Termine aus cost(). Liefert das Ergebnis von
   cardPricing plus forItem(it) für die Zeile eines Termins (null für Kurse und eigene Unternehmungen). */
function cardPricingFor(t,ctx){
  const c=ctx||{}, st=c.stay, pl=c.place, list=[], map=new Map();
  (c.items||[]).forEach(it=>{const a=actOf(t,it.act);if(!a||a.kurs||a.custom)return;
    map.set(it,list.length);list.push({uid:it.uid,day:it.day,slot:it.slot,time:it.time,label:a.t,pp:a.pp||0,cardPp:a.cardPp,ppKurs:a.ppKurs,grp:a.grp||0,top:!!a.top})});
  const res=cardPricing({persons:c.persons,status:cardStatusOf(t,st),cardName:pl&&pl.card,kursActive:!!c.kursActive,
    pass:pl&&pl.cardPass?{cardPass:true,passDay:pl.passDay,days:[...(c.passDays||[])]}:null,items:list});
  res.forItem=it=>map.has(it)?res.items[map.get(it)]:null;
  return res;
}
if(typeof module==='object'&&module&&module.exports)module.exports={cardPricing,cardStatusOf,GC_STATUS,GC_LIMITS};
