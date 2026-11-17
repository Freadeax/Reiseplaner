/* Reiseplaner · Unterkunft-Reiter ausbauen (Claude, 16.11.2026; Projektanweisungen §8–§11, M07 F12, M08).
   Klassisches Skript im gemeinsamen Gültigkeitsbereich der app/*.js-Teile. Ergänzt „Ort & Unterkunft“ (app/ansichten.js
   tUnterkunft) um:
   - Stand oben: gewählte Unterkunft, woher der Preis kommt (Planwert, offen, Angebot, gebucht) und der nächste Schritt.
   - Merkliste: jede Unterkunft (Profil) zeigt ihre Art und ihre Angebote; „Angebot erfassen“ legt ein Angebot für genau
     diese Unterkunft an (Profil und Angebot bleiben getrennt, Buchungsstatus hängt am Angebot).
   - Unterkunftsarten von Hotel bis Iglu mit Prüfpunkten, passenden Portalen (Suchlink oder Startseite, keine
     Live-Abfrage) und echten Einträgen aus dem Register (lodging.js) mit Quelle und Prüfdatum.
   Gespeichert werden nur Felder, die ältere Stände schon tragen: customStays[i] bekommt optional kind, reg und geo
   (customStays werden nicht feldweise geprüft); Angebote nutzen die bestehenden Anbieter-IDs. */
"use strict";
const LG=typeof window!=='undefined'&&window.RPLodging||null;
const U_STALE_DAYS=31;
/* Art einer Unterkunft: eigene Angabe, sonst aus dem Beispielkatalog abgeleitet */
function uKindOf(s){if(!s)return null;if(s.kind&&LG&&LG.kindById(s.kind))return s.kind;return s.custom?null:(s.kitchen&&!s.breakfast?'fewo':'hotel')}
function uKindBadge(s){const k=LG&&LG.kindById(uKindOf(s));return k?'<span class="badge">'+k.icon+' '+esc(k.name)+'</span>':''}
function uOffersFor(t,s){return (t.offers||[]).filter(o=>o&&o.stayId===s.id)}
function uDaysSince(d,now){const a=pd(d),b=pd((now||new Date()).toISOString().slice(0,10));return a&&b?Math.round((b-a)/864e5):null}

/* ---------- rein: Stand der gewählten Unterkunft ---------- */
function uStand(t,now){
  const st=stayOf(t),o=activeOffer(t),N=nightsOf(t);
  if(!st)return {state:'keine',title:'Noch keine Unterkunft gewählt',text:N>0?'Für '+N+(N===1?' Nacht':' Nächte')+' fehlt eine Unterkunft. Merkt euch unten ein paar Möglichkeiten und wählt eine aus.':'Für eine Tagesreise braucht ihr keine Unterkunft.',next:N>0?{act:'scroll-arten',label:'Unterkunftsarten ansehen'}:null};
  if(o){
    const age=uDaysSince(o.checkedAt,now),a=offerAmounts(o);
    if(o.cancel)return {state:'storniert',title:o.name,text:'Storno erfasst. Prüft Erstattung und sucht eine neue Unterkunft.',next:{act:'go-suche',label:'Zu den Angeboten'}};
    if(o.booked)return {state:'gebucht',title:o.name,text:'Gebucht laut eurer Erfassung'+(num(o.paid,0)>0?', '+eur(o.paid)+' bezahlt':'')+'.'+(a.unknown.length?' Noch offen: '+a.unknown.join(', ')+'.':''),next:null};
    if(!offerCurrent(o,t,now&&now.toISOString().slice(0,10))||o.availability==='unavailable')return {state:'pruefen',title:o.name,text:'Das Angebot passt nicht mehr zu Datum, Personen oder Gültigkeit.',next:{act:'stand',id:o.id,label:'Preis neu prüfen'}};
    if(age!=null&&age>U_STALE_DAYS)return {state:'alt',title:o.name,text:'Angebot zuletzt vor '+age+' Tagen geprüft. Preise ändern sich.',next:{act:'stand',id:o.id,label:'Preis neu prüfen'}};
    return {state:'angebot',title:o.name,text:'Konkretes Angebot: '+eur(a.total)+(a.unknown.length?' + offen: '+a.unknown.join(', '):'')+'. Noch nicht als gebucht erfasst.',next:{act:'go-suche',label:'Buchung am Angebot erfassen'}};
  }
  if(num(t.stayQuote,0)>0)return {state:'preis',title:st.name,text:'Euer Angebotspreis gesamt: '+eur(t.stayQuote)+'. Für Gebühren, Storno und Zahlungen ein konkretes Angebot erfassen.',next:{act:'offer-for',id:st.id,label:'Angebot erfassen'}};
  if(st.custom&&st.priceOpen)return {state:'offen',title:st.name,text:'Preis noch unbekannt. Er zählt nicht als 0 €.',next:{act:'offer-for',id:st.id,label:'Angebot erfassen'}};
  return {state:'planwert',title:st.name,text:'Nur ein Planwert, kein Angebot. Vor der Buchung den echten Preis erfassen.',next:{act:'offer-for',id:st.id,label:'Angebot erfassen'}};
}
/* Startwerte für ein neues Angebot zu einer Unterkunft der Merkliste */
function uOfferSeed(t,s){
  const k=LG&&LG.kindById(uKindOf(s));
  const seed={name:s.name,location:s.ort||'',type:k?k.offerType:'other'};
  if(s.custom)seed.stayId=s.id; /* Katalog-Unterkünfte bekommen beim Auswählen eine eigene Kopie (applyOffer) */
  if(s.url&&/^https:\/\//.test(s.url))seed.url=s.url;
  return seed;
}
/* Eintrag aus dem Register auf die Merkliste, ohne die Auswahl zu ändern. Rein bis auf die übergebene Reise. */
function uRegAdd(t,id){
  const e=LG&&LG.ENTRIES.find(x=>x.id===id);if(!e)throw new Error('Eintrag nicht gefunden.');
  t.customStays=t.customStays||[];
  if(t.customStays.some(s=>s.reg===id))throw new Error(e.name+' steht schon auf eurer Merkliste.');
  const s={id:uid('s'),custom:true,name:e.name,ort:e.place,kind:e.kinds[0],reg:e.id,url:e.url,priceNight:0,priceOpen:true,info:e.summary,ab:'Aus dem Register · Quelle geprüft am '+fmtLong(pd(e.src.checked)),sauna:!!(e.facts.sauna&&e.facts.sauna.v),kitchen:false,breakfast:!!(e.facts.fruehstueck&&e.facts.fruehstueck.v),card:false,map:e.name+' '+e.place};
  if(isFinite(+e.lat)&&isFinite(+e.lon))s.geo={lat:+e.lat,lon:+e.lon};
  t.customStays.push(s);return s;
}
function uFrom(t){const g=t.originGeo;return g&&isFinite(+g.lat)&&isFinite(+g.lon)?{lat:+g.lat,lon:+g.lon}:null}
/* Suchlink je Portal: vorhandene geprüfte Muster (providerUrl), sonst Startseite */
function uPortalUrl(p,t){const q=Object.assign(searchState(t),{destination:t.dest||(placeOf(t)||{}).name||searchState(t).destination||''});const prov=p.mode==='search'&&PROVIDERS.find(x=>x.id===p.offerProvider);return prov?providerUrl(prov,t,q):p.home}

/* ---------- Anzeige ---------- */
function uStatus(t){
  const s=uStand(t),st=stayOf(t);
  const nx=s.next?'<button type="button" class="btn sm" data-u-act="'+esc(s.next.act)+'"'+(s.next.id?' data-value="'+esc(s.next.id)+'"':'')+'>'+esc(s.next.label)+'</button>':'';
  const n=(t.customStays||[]).length+(t.catalog==='allgaeu'&&t.place?STAYS.filter(x=>x.place===t.place).length:0),no=(t.offers||[]).length;
  return '<section class="block u-stand" data-u-stand="'+esc(s.state)+'"><span class="eyebrow">Eure Unterkunft</span><h2>'+esc(s.title)+'</h2>'+(st?'<div class="badges">'+uKindBadge(st)+'</div>':'')+'<p>'+esc(s.text)+'</p><div class="row">'+nx+(no?'<button type="button" class="btn ghost sm" data-u-act="go-suche">Zu den Angeboten ('+no+')</button>':'')+'</div><p class="small muted">'+n+' auf der Merkliste · '+no+' konkrete '+(no===1?'Angebot':'Angebote')+'. Preise und Verfügbarkeit stammen aus eurer Erfassung, nicht aus einer Live-Abfrage.</p></section>';
}
/* Ergänzung jeder Unterkunftskarte: Art, Angebote dieser Unterkunft, Angebot erfassen */
function uStayExtra(t,s){
  const offs=uOffersFor(t,s),known=offs.map(o=>offerAmounts(o).total).filter(x=>isFinite(x));
  const reg=s.reg&&LG?LG.ENTRIES.find(e=>e.id===s.reg):null;
  return '<div class="badges">'+uKindBadge(s)+(reg?'<span class="badge est">Register</span>':'')+'</div>'+
   (offs.length?'<p class="small">'+offs.length+(offs.length===1?' Angebot':' Angebote')+' erfasst'+(known.length?', ab '+eur(Math.min.apply(null,known))+' bekannte Kosten':'')+(offs.some(o=>o.booked)?' · gebucht':'')+'</p>':'')+
   (reg?'<p class="small muted">Quelle: '+lk(reg.src.url,((LG&&LG.SRC_TYPES||{})[reg.src.type]||'Quelle'))+' · geprüft '+esc(fmtLong(pd(reg.src.checked)))+'</p>':'')+
   '<div class="row"><button type="button" class="btn ghost sm" data-u-act="offer-for" data-value="'+esc(s.id)+'">Angebot erfassen</button></div>';
}
function uArten(t){
  if(!LG)return '';
  const sel=UI.uKind||'',k=LG.kindById(sel),from=uFrom(t);
  const chips=LG.GROUPS.map(g=>'<div class="u-group"><span class="eyebrow">'+esc(g.name)+'</span><div class="row">'+LG.KINDS.filter(x=>x.group===g.id).map(x=>'<button type="button" class="chipbtn" aria-pressed="'+(x.id===sel)+'" data-u-act="kind" data-value="'+x.id+'">'+x.icon+' '+esc(x.name)+'</button>').join('')+'</div></div>').join('');
  let body='';
  if(k){
    const portals=LG.portalsFor(k.id),hits=LG.find({kind:k.id,from});
    body='<div class="panel u-kind"><h3>'+k.icon+' '+esc(k.name)+'</h3><p>'+esc(k.text)+'</p><span class="eyebrow">Vor dem Buchen klären</span><ul class="plain small">'+k.check.map(c=>'<li>'+esc(c)+'</li>').join('')+'</ul>'+
     '<span class="eyebrow">Hier suchen</span>'+(portals.length?'<div class="row">'+portals.map(p=>lk(uPortalUrl(p,t),p.name)).join('')+'</div>':'<p class="small">Dafür gibt es kein allgemeines Buchungsportal. Bucht direkt beim Betrieb, Beispiele stehen unten.</p>')+'<p class="small muted">Booking, Airbnb und FeWo-direkt öffnen mit eurem Ziel und Datum, die übrigen ihre Startseite. Es gibt keine Live-Anbindung: Preis und Verfügbarkeit seht ihr erst beim Anbieter.</p>'+
     '<span class="eyebrow">Aus dem Register ('+hits.length+')</span>'+(hits.length?'<div class="grid">'+hits.map(x=>uRegCard(t,x)).join('')+'</div>':'<p class="small muted">Für diese Art gibt es noch keine geprüften Einträge. Nutzt die Portale oben oder tragt eine eigene Unterkunft ein.</p>')+'</div>';
  }
  /* Am Handy ist die Liste lang: mit gewählter Art steht sie gefaltet unter den Details */
  return '<section class="block" id="u-arten"><h2>Unterkunftsarten</h2><p class="lead muted small">Von Hotel bis Iglu: Wählt eine Art für Tipps, passende Portale und geprüfte Beispiele.</p>'+(k?body+'<details class="panel"><summary><b>Andere Art wählen</b></summary>'+chips+'</details>':chips)+'</section>';
}
function uRegCard(t,x){
  const e=x.e,have=(t.customStays||[]).some(s=>s.reg===e.id);
  const facts=Object.keys(e.facts||{}).map(f=>LG.factText(e,f)).filter(Boolean);
  return '<div class="card"><span class="eyebrow">'+esc(e.place)+' · '+esc(e.region)+(x.km!=null?' · ≈ '+x.km+' km Luftlinie':'')+'</span><h3>'+esc(e.name)+'</h3><div class="badges">'+e.kinds.map(id=>{const k=LG.kindById(id);return '<span class="badge">'+k.icon+' '+esc(k.name)+'</span>'}).join('')+'</div><p class="small">'+esc(e.summary)+'</p>'+
   (facts.length?'<ul class="plain small">'+facts.map(f=>'<li>'+esc(f)+'</li>').join('')+'</ul>':'')+(e.note?'<p class="small est-note">'+esc(e.note)+'</p>':'')+
   '<p class="small muted">Kein Preis im Register. Quelle: '+lk(e.src.url,((LG&&LG.SRC_TYPES||{})[e.src.type]||'Quelle'))+' · geprüft '+esc(fmtLong(pd(e.src.checked)))+'</p>'+
   '<div class="foot">'+(have?'<span class="badge ok">auf der Merkliste</span>':'<button type="button" class="btn sm" data-u-act="reg-add" data-value="'+esc(e.id)+'">Auf die Merkliste</button>')+lk(e.url,'Website')+'</div></div>';
}
/* Angebote sammeln und vergleichen: der frühere Teil „Angebote vergleichen“ (tSuche) im Reiter, ohne Wiederholungen */
function uAngebote(t){
  if(typeof tSuche!=='function')return '';
  const quick=LG?LG.PORTALS.filter(p=>p.mode==='search').map(p=>lk(uPortalUrl(p,t),p.name)).join(''):'';
  return '<section class="block u-angebote-kopf" id="u-angebote"><span class="eyebrow">Angebote</span><h2>Sammeln und vergleichen</h2><p class="small">Erfasst den Preis, den euch ein Anbieter für eure Daten zeigt. Hier stehen Filter, eure Angebote und der Vergleich. Gebuchtes bleibt am jeweiligen Angebot.</p>'+(quick?'<div class="row">'+quick+'</div><p class="small muted">Öffnet mit eurem Ziel, Datum und Personen. Weitere Portale je Unterkunftsart weiter unten.</p>':'')+'</section>'+tSuche(t,{embedded:true});
}
/* Formular „Eigene Unterkunft“: Art wählen */
function uKindSelect(){
  if(!LG)return '';
  return '<label class="fld"><span>Art</span><select id="cs-kind"><option value="">Bitte wählen</option>'+LG.GROUPS.map(g=>'<optgroup label="'+esc(g.name)+'">'+LG.KINDS.filter(x=>x.group===g.id).map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join('')+'</optgroup>').join('')+'</select></label>';
}

if(typeof document!=='undefined')document.addEventListener('click',e=>{
  const el=e.target&&e.target.closest&&e.target.closest('[data-u-act]');if(!el)return;
  const t=cur();if(!t)return;e.preventDefault();
  const act=el.getAttribute('data-u-act'),id=el.getAttribute('data-value');
  try{
    if(act==='kind'){UI.uKind=UI.uKind===id?'':id;render();const n=document.getElementById('u-arten');if(n&&n.scrollIntoView)n.scrollIntoView({block:'start'});return}
    if(act==='scroll-arten'){const n=document.getElementById('u-arten');if(n&&n.scrollIntoView)n.scrollIntoView({behavior:'smooth',block:'start'});return}
    if(act==='go-suche'){const n=document.getElementById('u-angebote');if(n&&n.scrollIntoView)n.scrollIntoView({behavior:'smooth',block:'start'});else go('r-'+t.id+'-suche');return}
    if(act==='stand'){if(typeof angebotStandSheet!=='function')return;openSheet(angebotStandSheet(t,id));return}
    if(typeof v3CanEdit==='function'&&isV3(t)&&!v3CanEdit(t))throw new Error(typeof V3_LOCK_TXT!=='undefined'?V3_LOCK_TXT:'Diese Reise kann gerade nicht geändert werden.');
    if(act==='offer-for'){const s=STAYS.find(x=>x.id===id)||(t.customStays||[]).find(x=>x.id===id);if(!s)throw new Error('Unterkunft nicht mehr vorhanden.');offerSheet(t,null,uOfferSeed(t,s));return}
    if(act==='reg-add'){const s=uRegAdd(t,id);if(t.schemaVersion==null)t.schemaVersion=2;save(t);render();alertMsg(s.name+' steht jetzt auf eurer Merkliste. Preis noch offen.');return}
  }catch(err){alertMsg(err.message)}
});
