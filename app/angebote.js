/* Reiseplaner · Unterkunftsangebote vertiefen (Claude, 16.11.2026; M08 F2/F3/F4/F6/F7, Projektanweisungen §9–§11).
   Klassisches Skript im gemeinsamen Gültigkeitsbereich der app/*.js-Teile. Baut auf dem Reisefinder (app/ereignisse.js)
   und dem Format-5-Schreibweg f5Commit (app/format5.js) auf und nutzt die vorhandenen Format-5-Felder der Angebote:
   - Preis neu prüfen: jeder erneute Blick beim Anbieter wird ein Preisstand (offers[i].history); der erste Stand ist die
     Erfassung. Gebuchte, bezahlte oder stornierte Angebote behalten ihren Buchungsbetrag, der neue Preis ist nur ein Hinweis (O4).
   - Verpflegung (board) und Mindestnächte (minNights) je Angebot; Verpflegung senkt den Essensansatz in cost() (O2).
   - Vergleich nur unter gleichen Annahmen: unterschiedliche Personen oder Nächte werden ausdrücklich genannt (O6),
     dazu Preis je Nacht und je Person und Nacht.
   - Angebotslink einfügen: Anbieter, Daten und Personen werden aus der Adresse gelesen, soweit sie dort stehen.
     Die Seite selbst wird nicht abgerufen; Preise bleiben immer Handeingabe.
   Keine Live-Abfragen, keine Buchung, keine Zahlung. Unbekannt bleibt unbekannt. */
"use strict";
const BOARD={none:'Ohne Verpflegung',breakfast:'Frühstück',half:'Halbpension',full:'Vollpension',allinc:'All inclusive'};
const ANG_HOSTS=[[/(^|\.)booking\.com$/,'booking'],[/(^|\.)check24\.(de|net)$/,'check24'],[/(^|\.)fewo-direkt\.de$/,'fewo'],[/(^|\.)airbnb\.[a-z.]+$/,'airbnb'],[/(^|\.)holidu\.[a-z.]+$/,'holidu']];
const angToday=()=>new Date().toISOString().slice(0,10);
const angEur=v=>v==null||!isFinite(+v)?'unbekannt':(Math.round(+v*100)%100?dec(+v,2):Math.round(+v).toLocaleString('de-DE'))+' €';
const angDate=s=>pd(s)?fmtLong(pd(s)):String(s||'');

/* ---------- rein ---------- */
/* Liest aus einer Angebotsadresse nur, was offen in ihr steht. null bei ungültiger oder nicht verschlüsselter Adresse. */
function angebotAusLink(url){
  let u;try{u=new URL(String(url||'').trim())}catch(e){return null}
  if(u.protocol!=='https:')return null;
  const host=u.hostname.toLowerCase().replace(/^www\./,''),hit=ANG_HOSTS.find(([re])=>re.test(host)),provider=hit?hit[1]:'direkt';
  const q=k=>u.searchParams.get(k),day=v=>v&&pd(v)?v:null;
  let start=null,end=null,persons=null;
  if(provider==='booking'){start=day(q('checkin'));end=day(q('checkout'));persons=q('group_adults')}
  else if(provider==='airbnb'){start=day(q('check_in')||q('checkin'));end=day(q('check_out')||q('checkout'));persons=q('adults')}
  else if(provider==='fewo'){start=day(q('startDate')||q('chkin'));end=day(q('endDate')||q('chkout'));persons=q('adults')}
  persons=persons!=null&&/^\d{1,2}$/.test(persons)&&+persons>=1&&+persons<=20?+persons:null;
  if(start&&end&&end<=start){start=null;end=null}
  return {provider,host,start,end,persons};
}
/* Preis je Nacht und je Person und Nacht aus den bekannten Kosten; offene Gebühren bleiben offen. */
function angebotJeNacht(o){
  const a=offerAmounts(o),n=a.nights,p=+o.persons;
  if(!(n>0))return null;
  return {night:a.total/n,personNight:p>0?a.total/n/p:null,open:a.unknown.length>0};
}
/* Hinweise zu Mindestnächten und Belegung gegenüber der Reise (M08 O5). */
function angebotPassung(t,o){
  const out=[],n=offerAmounts(o).nights,tn=t.dateMode==='fix'&&pd(t.start)&&pd(t.end)?nightsOf(t):null;
  if(o.minNights!=null){
    if(n<o.minNights)out.push('Der Tarif verlangt mindestens '+o.minNights+' Nächte, erfasst sind '+n+'.');
    else if(tn!=null&&tn<o.minNights)out.push('Passt nicht zur Reise: mindestens '+o.minNights+' Nächte, die Reise hat '+tn+'.');
  }
  return out;
}
/* Vergleichbarkeit mehrerer Angebote (M08 O6): Personen und Nächte müssen gleich sein. */
function angebotVergleichbar(offers){
  const rows=offers.map(o=>({persons:+o.persons,nights:offerAmounts(o).nights}));
  if(V5&&V5.comparable)return V5.comparable(rows);
  const diff=[];['persons','nights'].forEach(k=>{if(rows.some(r=>r[k]!==rows[0][k]))diff.push(k==='persons'?'Personen':'Nächte')});
  return {ok:!diff.length,text:diff.length?'nicht vergleichbar: '+diff.join(', '):''};
}
/* Abzug vom Essensansatz je Person und Nacht, wenn die Unterkunft Verpflegung enthält (Planannahme, M08 O2).
   rate = Tagesansatz aus FOOD. Frühstück 7 € wie bisher; Halbpension zusätzlich gut die Hälfte des Rests für das Abendessen;
   Vollpension lässt 5 € für Getränke und Kleinigkeiten; All inclusive deckt den Tagesansatz. */
function boardCut(rate,board,breakfast){
  const r=Math.max(0,+rate||0);
  if(board==='allinc')return r;
  if(board==='full')return Math.max(0,r-5);
  if(board==='half')return Math.min(r,7+Math.round((r-7)*0.55));
  if(board==='breakfast'||breakfast)return Math.min(r,7);
  return 0;
}
/* Neuer Preisstand (M08 F2/F3). Rein: ändert das übergebene Angebot. inp {at, price|null bei unverändert, availability,
   validUntil?, note?, same?}. Gesperrte Angebote (gebucht, bezahlt, storniert) behalten Preis und Verfügbarkeit (O4). */
function angebotStandAnwenden(o,inp,today){
  const at=String(inp&&inp.at||'');
  if(!pd(at))throw new Error('Prüfdatum fehlt oder ist ungültig.');
  if(at>(today||angToday()))throw new Error('Prüfdatum liegt in der Zukunft.');
  const h=Array.isArray(o.history)?o.history.map(x=>Object.assign({},x)):[];
  if(!h.length)h.push({at:o.checkedAt<=at?o.checkedAt:at,price:+o.price,basis:o.basis,availability:o.availability,src:'Erfassung'});
  if(h[h.length-1].at>at)throw new Error('Prüfdatum liegt vor dem letzten Preisstand ('+angDate(h[h.length-1].at)+').');
  const same=!!(inp&&inp.same),last=h[h.length-1];
  let price=same?(last.price!=null?+last.price:+o.price):inp&&inp.price;
  if(price===''||price==null||!isFinite(+price)||+price<0||+price>1e7)throw new Error('Neuen Preis eintragen oder „Unverändert“ wählen.');
  price=Math.round(+price*100)/100;
  const availability=['unknown','available','unavailable'].includes(inp&&inp.availability)?inp.availability:'unknown';
  const note=String(inp&&inp.note||'').trim().slice(0,200);
  const entry={at,price,basis:o.basis,availability,src:same?'Neu geprüft, unverändert':'Neu geprüft'};if(note)entry.note=note;
  h.push(entry);while(h.length>50)h.splice(1,1); /* der erste Stand (Erfassung) bleibt als Bezug */
  o.history=h;
  const locked=angebotGesperrt(o);
  if(!locked){
    o.price=price;o.availability=availability;o.checkedAt=at;
    const vu=inp&&inp.validUntil!=null?String(inp.validUntil):o.validUntil||'';
    o.validUntil=vu&&pd(vu)&&vu>=at?vu:'';
  }
  return {locked,entry};
}
function angebotGesperrt(o){return !!(o&&(o.booked||num(o.paid,0)>0||o.cancel))}

/* ---------- Schreiben über Format 5 ---------- */
function angebotPreisstand(t,id,inp,opt){
  return f5Commit(t,c=>{
    const o=(c.offers||[]).find(x=>x.id===id);if(!o)throw new Error('Angebot nicht gefunden.');
    angebotStandAnwenden(o,inp);
    /* gewählte, nicht gesperrte Unterkunft: Planwert der zugehörigen eigenen Unterkunft mitziehen */
    if(c.activeOfferId===o.id&&!angebotGesperrt(o)){const s=(c.customStays||[]).find(x=>x.id===o.stayId),a=offerAmounts(o);if(s&&a.nights>0)s.priceNight=a.base/a.nights}
  },opt);
}
function angebotBedingungen(t,id,inp,opt){
  const mn=String(inp&&inp.minNights==null?'':inp.minNights).trim(),board=String(inp&&inp.board||'');
  if(mn!==''&&!(/^\d+$/.test(mn)&&+mn>=1&&+mn<=60))throw new Error('Mindestnächte: ganze Zahl von 1 bis 60, unbekannt leer lassen.');
  if(board&&!BOARD[board])throw new Error('Verpflegung ungültig.');
  return f5Commit(t,c=>{
    const o=(c.offers||[]).find(x=>x.id===id);if(!o)throw new Error('Angebot nicht gefunden.');
    if(mn==='')delete o.minNights;else o.minNights=+mn;
    if(board)o.board=board;else delete o.board;
    if(c.activeOfferId===o.id&&o.minNights!=null&&nightsOf(c)<o.minNights)throw new Error('Die ausgewählte Unterkunft verlangt dann mindestens '+o.minNights+' Nächte, die Reise hat '+nightsOf(c)+'. Erst Zeitraum oder Auswahl ändern.');
  },opt);
}

/* ---------- Anzeige (von app/ereignisse.js aufgerufen) ---------- */
function angebotKarteExtra(t,o){
  const parts=[];
  const info=[o.board?BOARD[o.board]+' inklusive':'',o.minNights!=null?'mind. '+o.minNights+(o.minNights===1?' Nacht':' Nächte'):''].filter(Boolean);
  if(info.length)parts.push('<p class="small">'+esc(info.join(' · '))+'</p>');
  const jn=angebotJeNacht(o);if(jn)parts.push('<p class="small muted">≈ '+angEur(jn.night)+' je Nacht'+(jn.personNight!=null&&+o.persons>1?' · '+angEur(jn.personNight)+' je Person und Nacht':'')+(jn.open?' (ohne offene Gebühren)':'')+'</p>');
  angebotPassung(t,o).forEach(x=>parts.push('<p class="small est-note"><b>! </b>'+esc(x)+'</p>'));
  const h=Array.isArray(o.history)?o.history:[];
  if(V5&&V5.offerPriceState){
    const s=V5.offerPriceState(o,angToday());
    if(h.length>1){
      const ch=s.change?' · '+(s.change.abs>0?'+':'')+angEur(s.change.abs)+(s.change.pct!=null?' ('+(s.change.pct>0?'+':'')+dec(s.change.pct,1)+' %)':'')+' seit '+angDate(s.change.since):'';
      parts.push('<details class="small"><summary>Preisverlauf: '+h.length+' Stände'+esc(ch)+'</summary><ul class="plain small">'+h.slice().reverse().map(x=>'<li>'+esc(angDate(x.at))+' · '+esc(angEur(x.price))+' · '+esc({unknown:'Verfügbarkeit unbestätigt',available:'verfügbar',unavailable:'nicht verfügbar'}[x.availability]||'')+(x.note?' · '+esc(x.note):'')+' <span class="muted">('+esc(x.src||'')+')</span></li>').join('')+'</ul></details>');
    }
    s.hints.forEach(x=>parts.push('<p class="small est-note"><b>! </b>'+esc(x.text)+'</p>'));
  }
  return parts.join('');
}
function angebotKnoepfe(t,o){
  if(typeof f5CanEdit!=='function'||!f5CanEdit(t))return '';
  return '<button class="btn ghost sm" data-ang-act="stand-open" data-value="'+esc(o.id)+'">Preis neu prüfen</button><button class="btn ghost sm" data-ang-act="bed-open" data-value="'+esc(o.id)+'">Verpflegung & Mindestnächte</button>';
}
/* Vergleichstabelle: Hinweis oben und zusätzliche Zeilen */
function angebotVergleichHinweis(t,offers){
  if(offers.length<2)return '';
  const v=angebotVergleichbar(offers);
  return v.ok?'<p class="small muted">Gleiche Personenzahl und gleiche Anzahl Nächte: Die Beträge sind direkt vergleichbar.</p>':'<div class="note" role="status"><b>Achtung, '+esc(v.text)+'.</b><p class="small">Die Gesamtbeträge lassen sich so nicht direkt gegeneinander stellen. Hilfreich sind die Zeilen je Nacht und je Person und Nacht, oder ihr erfasst die Angebote für dieselben Daten und Personen.</p></div>';
}
const ANG_ZEILEN=[
  ['Je Nacht',o=>{const j=angebotJeNacht(o);return j?'≈ '+angEur(j.night)+(j.open?' + offene Gebühren':''):'Unbekannt'}],
  ['Je Person und Nacht',o=>{const j=angebotJeNacht(o);return j&&j.personNight!=null?'≈ '+angEur(j.personNight)+(j.open?' + offene Gebühren':''):'Unbekannt'}],
  ['Verpflegung',o=>o.board?BOARD[o.board]:'Nicht erfasst'],
  ['Mindestnächte',o=>o.minNights!=null?String(o.minNights):'Nicht erfasst'],
  ['Preisverlauf',o=>{const h=Array.isArray(o.history)?o.history:[];if(h.length<2)return 'Ein Stand';const s=V5&&V5.offerPriceState?V5.offerPriceState(o,angToday()):{};return h.length+' Stände'+(s.change?', '+(s.change.abs>0?'+':'')+angEur(s.change.abs)+' seit '+angDate(s.change.since):'')}]
];

/* ---------- Blätter ---------- */
function angebotStandSheet(t,id){
  const o=(t.offers||[]).find(x=>x.id===id);if(!o)throw new Error('Angebot nicht gefunden.');
  const locked=angebotGesperrt(o),p=PROVIDERS.find(x=>x.id===o.provider),link=safeOfferUrl(o.url)||(p?providerUrl(p,t,searchState(t)):'');
  const basis={stay:'für den Aufenthalt',night:'je Nacht',person:'je Person',personNight:'je Person und Nacht'}[o.basis]||'';
  return '<h2>Preis neu prüfen</h2><p>'+esc(o.name)+' · '+esc(angDate(o.start))+' bis '+esc(angDate(o.end))+' · '+esc(o.persons)+' Personen</p>'+
   '<dl class="facts"><dt>Bisher</dt><dd>'+esc(angEur(o.price))+' '+esc(basis)+'</dd><dt>Zuletzt geprüft</dt><dd>'+esc(angDate(o.checkedAt))+'</dd></dl>'+
   (link?'<p><a class="btn ghost sm" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Beim Anbieter öffnen ↗</a></p>':'')+
   '<p class="small">Schaut beim Anbieter mit denselben Daten, Personen und demselben Tarif nach. Hier wird nichts automatisch abgerufen.</p>'+
   (locked?'<div class="note" role="status"><p class="small">Dieses Angebot ist gebucht, bezahlt oder storniert. Eure Kosten bleiben beim Buchungsbetrag; der neue Preis wird nur als Hinweis gespeichert.</p></div>':'')+
   '<div class="form"><label class="fld"><span>Preis jetzt ('+esc(basis)+', €)</span><input id="ang-price" type="number" min="0" step="0.01" inputmode="decimal"></label>'+
   '<label class="fld"><span>Verfügbarkeit jetzt</span><select id="ang-avail">'+optionList([['unknown','Unbestätigt'],['available','Als verfügbar angezeigt'],['unavailable','Nicht verfügbar']],o.availability)+'</select></label>'+
   '<label class="fld"><span>Geprüft am</span><input id="ang-at" type="date" value="'+angToday()+'"></label>'+
   (locked?'':'<label class="fld"><span>Gültig bis (optional)</span><input id="ang-valid" type="date" value="'+esc(o.validUntil&&o.validUntil>=angToday()?o.validUntil:'')+'"></label>')+
   '<label class="fld"><span>Notiz (optional)</span><input id="ang-note" maxlength="200" placeholder="z. B. nur noch Zimmer mit Balkon"></label></div>'+
   '<div class="row"><button type="button" class="btn" data-ang-act="stand-save" data-value="'+esc(o.id)+'">Neuen Preis speichern</button><button type="button" class="btn ghost" data-ang-act="stand-same" data-value="'+esc(o.id)+'">Preis unverändert</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div><p id="f5-error" class="small" role="alert" tabindex="-1" hidden></p>';
}
function angebotBedSheet(t,id){
  const o=(t.offers||[]).find(x=>x.id===id);if(!o)throw new Error('Angebot nicht gefunden.');
  return '<h2>Verpflegung & Mindestnächte</h2><p>'+esc(o.name)+'</p><p class="small">So, wie es im Tarif steht. Unbekanntes leer lassen. Enthaltene Verpflegung senkt euren Essensansatz in den Kosten, damit nichts doppelt zählt.</p>'+
   '<div class="form"><label class="fld"><span>Verpflegung im Preis</span><select id="ang-board">'+optionList([['','Nicht erfasst'],...Object.entries(BOARD)],o.board||'')+'</select></label>'+
   '<label class="fld"><span>Mindestnächte</span><input id="ang-min" type="number" min="1" max="60" step="1" inputmode="numeric" value="'+esc(o.minNights==null?'':o.minNights)+'"></label></div>'+
   '<div class="row"><button type="button" class="btn" data-ang-act="bed-save" data-value="'+esc(o.id)+'">Speichern</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div><p id="f5-error" class="small" role="alert" tabindex="-1" hidden></p>';
}

/* Link im Angebotsformular erkannt: Formularwerte nur setzen, wo die Adresse etwas hergibt. */
function angebotLinkErkennen(o){
  const r=angebotAusLink(o&&o.url);if(!r)return;
  const set=(k,v)=>{o[k]=v;const el=document.querySelector('[data-offer="'+k+'"]');if(el)el.value=v};
  const said=[];
  if(o.provider!==r.provider){set('provider',r.provider);}
  said.push((PROVIDERS.find(p=>p.id===r.provider)||{}).name||r.host);
  if(r.start&&r.end){set('start',r.start);set('end',r.end);said.push(angDate(r.start)+' bis '+angDate(r.end))}
  if(r.persons){set('persons',r.persons);said.push(r.persons+' Personen')}
  alertMsg('Aus dem Link erkannt: '+said.join(' · ')+'. Preis und Gebühren bitte selbst eintragen.');
}

if(typeof document!=='undefined')document.addEventListener('click',e=>{
  const el=e.target&&e.target.closest&&e.target.closest('[data-ang-act]');if(!el)return;
  const t=cur();if(!t)return;e.preventDefault();
  const act=el.getAttribute('data-ang-act'),id=el.getAttribute('data-value');
  try{
    if(act==='stand-open'){openSheet(angebotStandSheet(t,id));return}
    if(act==='bed-open'){openSheet(angebotBedSheet(t,id));return}
    let run=null,msg='';
    if(act==='stand-save'||act==='stand-same'){
      const same=act==='stand-same',vEl=$('#ang-valid');
      const inp={at:f5Val('ang-at'),price:same?null:f5Val('ang-price'),availability:f5Val('ang-avail'),note:f5Val('ang-note'),same};
      if(vEl)inp.validUntil=f5Val('ang-valid');
      run=o=>angebotPreisstand(t,id,inp,o);msg=same?'Preis als unverändert vermerkt.':'Neuer Preisstand gespeichert.';
    }
    else if(act==='bed-save'){const inp={minNights:f5Val('ang-min'),board:f5Val('ang-board')};run=o=>angebotBedingungen(t,id,inp,o);msg='Verpflegung und Mindestnächte gespeichert.'}
    if(!run)return;
    const r=run();
    if(f5Result(r,{run,msg})){if($('.sheet'))closeSheet();render();alertMsg(msg)}
  }catch(err){f5Error(err)}
});
