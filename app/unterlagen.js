/* Reiseplaner · Buchungen & Tickets: zentraler Speicher für Unterlagen (M11.3, docs/UNTERLAGEN.md).
   Eigener Teil der App, geladen nach app/aufbau.js (Bereiche) und vor app/start.js. Klassisches Skript ohne Bundler: Alle Teile
   teilen sich den globalen Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen.
   - Ablage: docstore.js (window.RPFiles), IndexedDB rp-files, je Konto-Bereich (Store.scope) getrennt. Nur auf diesem Gerät.
   - Die Reise (rp-trips, Sync, Sicherung) wird hier NICHT verändert. Spiegel nach t.docs ist Stufe 2 (docs/UNTERLAGEN.md §3).
   - Teil „buchungen“ im Bereich „Unterlagen“: Buchungsüberblick (Unterkunft, Anreise-Abschnitte, gebuchte/angefragte Posten)
     mit verknüpften Unterlagen, weitere Unterlagen, Hinzufügen/Bearbeiten/Ansehen/Löschen.
   - Heute-Ansicht: untHeuteBlock(t,now) zeigt die Unterlagen des Tages.
   Rein rechnerische Teile (untRows, untForDate, untGroups, untKindFor) sind in tests/unterlagen.cjs geprüft. */
"use strict";
const UNT_PRIVACY='Liegt nur auf diesem Gerät, in diesem Browser. Erscheint nicht in Reisemappe, Teilen-Text, Kalender, Reisebuch oder Sicherungsdatei.';
const UNT_BROWSER='Der Browser kann Website-Daten löschen (z. B. „Verlauf löschen“). Wichtige Tickets zusätzlich dort aufheben, wo sie herkommen (Mail, Anbieter-App).';
const UNT={store:null,cache:new Map(),loading:new Set(),errors:new Map(),reveal:new Set(),urls:[],persistAsked:false,busy:false,del:null};

/* ---------- Einbindung als Teil des Bereichs „Unterlagen“ (wie app/aufbau.js) ---------- */
if(typeof TABS!=='undefined'&&!TABS.some(x=>x[0]==='buchungen')){
 TABS.push(['buchungen','Tickets']);
 if(typeof TEIL_NAMEN!=='undefined')TEIL_NAMEN.buchungen='Tickets';
 if(typeof MODULE_INFO!=='undefined')MODULE_INFO.buchungen=['Unterlagen','Tickets, Bestätigungen, Voucher und Buchungsnummern an einem Ort, auch ohne Netz.'];
 if(typeof BEREICHE!=='undefined'){const b=BEREICHE.find(x=>x.key==='unterlagen');if(b&&!b.parts.includes('buchungen')){b.parts.unshift('buchungen');b.hint='Tickets und Buchungen, Checkliste, Notizen und die Mappe zum Mitnehmen.'}
  if(typeof AREA_GROUPS!=='undefined')AREA_GROUPS.splice(0,AREA_GROUPS.length,...BEREICHE.map(x=>[x.label,x.parts.slice()]))}
}

function UF(){return typeof window!=='undefined'&&window.RPFiles&&window.RPPhotos?window.RPFiles:null}
function untStore(){if(!UNT.store)UNT.store=UF().create({});return UNT.store}
function untScope(){return typeof Store!=='undefined'&&Store.scope?Store.scope:'guest'}
function untKey(tid){return untScope()+'|'+tid}
function untEsc(s){return typeof esc==='function'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function untKinds(){return UF()?UF().KINDS:{ticket:'Ticket',bordkarte:'Bordkarte',bestaetigung:'Buchungsbestätigung',gutschein:'Gutschein / Voucher',versicherung:'Versicherung',sonstiges:'Sonstiges'}}
function untDate(s){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||''));return m?m[3]+'.'+m[2]+'.'+m[1]:''}
function untAddDays(s,n){const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}

/* ---------- Teil 1: reine Logik ---------- */
const UNT_STATUS={gebucht:'✓ Gebucht',angefragt:'Angefragt',offen:'Noch nicht gebucht'};
const UNT_NO_DOC=['auto','rad','taxi'];   /* eigene Fahrt: kein Ticket zu erwarten */
/* Passende Art für eine neue Unterlage zu einer Buchung */
function untKindFor(row){
 if(!row)return 'ticket';
 if(row.type==='stay')return 'bestaetigung';
 if(row.type==='tr')return row.mode==='flug'?'bordkarte':row.mode==='mietwagen'||row.mode==='transfer'?'gutschein':'ticket';
 if(row.type==='act')return 'ticket';
 return 'bestaetigung';
}
/* Tag eines Termins: erstes Vorkommen im Tagesplan, mit Datum nur bei festen Reisedaten */
function untActDate(t,actId){
 const it=(t.items||[]).filter(i=>i&&i.act===actId).sort((a,b)=>a.day-b.day)[0];
 if(!it)return {day:null,date:null};
 const d=typeof daysOf==='function'?daysOf(t)[it.day]:null;
 return {day:it.day,date:d&&d.date?d.date.toISOString().slice(0,10):null,time:it.time||null};
}
/* Buchungen der Reise aus vorhandenen Daten. Kein neuer Status, keine Preise erfunden.
   {key (Verknüpfung), type:'stay'|'tr'|'act'|'ledger', label, sub, date, time, status, needDoc} nach Datum sortiert. */
function untRows(t){
 const rows=[],fixed=t.dateMode==='fix'&&/^\d{4}-\d{2}-\d{2}$/.test(t.start||'');
 const lg=t.ledger||{},o=typeof activeOffer==='function'?activeOffer(t):null;
 if(o)rows.push({key:'offer:'+o.id,type:'stay',label:o.name||'Unterkunft',sub:[o.location,o.start&&o.end?untDate(o.start)+' – '+untDate(o.end):''].filter(Boolean).join(' · '),date:o.start||(fixed?t.start:null),time:null,status:o.booked?'gebucht':'offen',needDoc:true});
 const MODES=(typeof window!=='undefined'&&window.RPV3&&window.RPV3.MODES)||{auto:'Auto',bahn:'Bahn',flug:'Flug',bus:'Fernbus',faehre:'Fähre',mietwagen:'Mietwagen',transfer:'Transfer',taxi:'Taxi',rad:'Fahrrad'};
 const tr=t.transport||{};
 ['out','back'].forEach(dir=>(Array.isArray(tr[dir])?tr[dir]:[]).forEach(s=>{
  if(!s||!s.id)return;
  const e=lg['tr:'+s.id],dep=s.dep||{};
  rows.push({key:'tr:'+s.id,type:'tr',mode:s.mode,label:(dir==='out'?'Hinreise':'Rückreise')+' · '+(MODES[s.mode]||'Abschnitt')+(s.from||s.to?' '+[s.from,s.to].filter(Boolean).join(' → '):''),
   sub:[s.carrier,s.number].filter(Boolean).join(' '),date:dep.date||null,time:dep.time||null,status:e&&UNT_STATUS[e.status]?e.status:'offen',needDoc:!UNT_NO_DOC.includes(s.mode)});
 }));
 const lr=typeof ledgerRows==='function'?ledgerRows(t):[];
 lr.forEach(r=>{
  if(r.orphan||r.key.indexOf('tr:')===0||(r.status!=='gebucht'&&r.status!=='angefragt'))return;
  if(r.key.indexOf('act:')===0){const a=untActDate(t,r.key.slice(4));rows.push({key:r.key,type:'act',label:r.label,sub:'Unternehmung',date:a.date,time:a.time||null,day:a.day,status:r.status,needDoc:true});return}
  rows.push({key:'ledger:'+r.key,type:'ledger',label:r.label,sub:'Kostenposten',date:fixed?t.start:null,time:null,status:r.status,needDoc:false});
 });
 return rows.map((r,i)=>Object.assign(r,{order:i})).sort((a,b)=>(a.date||'9999')<(b.date||'9999')?-1:(a.date||'9999')>(b.date||'9999')?1:((a.time||'99')<(b.time||'99')?-1:(a.time||'99')>(b.time||'99')?1:a.order-b.order));
}
/* Unterlagen den Buchungen zuordnen: {rows:[{…row, docs}], other:[docs ohne Verknüpfung], lost:[docs mit Verknüpfung, die es nicht mehr gibt]} */
function untGroups(t,docs){
 const rows=untRows(t).map(r=>Object.assign({},r,{docs:[]})),by=new Map(rows.map(r=>[r.key,r])),other=[],lost=[];
 (docs||[]).forEach(d=>{if(!d.link)other.push(d);else if(by.has(d.link))by.get(d.link).docs.push(d);else lost.push(d)});
 return {rows,other,lost,missing:rows.filter(r=>r.status==='gebucht'&&r.needDoc&&!r.docs.length).length};
}
/* Unterlagen für ein Datum (YYYY-MM-DD): verknüpfte Buchung an diesem Tag, Unterkunft am Anreisetag,
   oder Gültigkeit beginnt an dem Tag. Gültigkeit ohne Bezug zählt nur am ersten Tag, damit „Heute“ nicht jeden Tag voll ist. */
function untForDate(t,docs,date){
 if(!date)return [];
 const rows=untRows(t),by=new Map(rows.map(r=>[r.key,r])),out=[];
 (docs||[]).forEach(d=>{
  const r=d.link?by.get(d.link):null;
  if(r&&r.date===date){out.push({doc:d,row:r,why:r.time?'heute '+r.time:'heute'});return}
  if(r&&r.type==='stay'&&t.dateMode==='fix'&&t.end===date){out.push({doc:d,row:r,why:'Abreise'});return}
  if(d.valid&&d.valid.from===date&&!(r&&r.date)){out.push({doc:d,row:r||null,why:'gültig ab heute'})}
 });
 return out.sort((a,b)=>String(a.row&&a.row.time||'99').localeCompare(String(b.row&&b.row.time||'99')));
}
/* Gültigkeit als Text; abgelaufen vor dem Datum ref */
function untValidText(v,ref){
 if(!v||(!v.from&&!v.to))return '';
 const s=v.from&&v.to?(v.from===v.to?'gültig am '+untDate(v.from):'gültig '+untDate(v.from)+' – '+untDate(v.to)):v.from?'gültig ab '+untDate(v.from):'gültig bis '+untDate(v.to);
 return s+(ref&&v.to&&v.to<ref?' · abgelaufen':'');
}

/* ---------- Teil 2: Laden ---------- */
function untBlocked(){return UF()?'':'Diese App-Version kann noch keine Unterlagen speichern.'}
function untList(tid){return UNT.cache.get(untKey(tid))||null}
function untLoad(tid,force){
 const k=untKey(tid);
 if(!UF()||UNT.loading.has(k)||(!force&&UNT.cache.has(k)))return Promise.resolve(UNT.cache.get(k)||null);
 UNT.loading.add(k);UNT.errors.delete(k);
 const scope=untScope();
 return untStore().list(scope,tid).then(async list=>{let usage=null;try{usage=await untStore().usage(scope,tid)}catch(e){}UNT.cache.set(k,{list,usage});return UNT.cache.get(k)})
  .catch(e=>{UNT.errors.set(k,String(e&&e.message||e));return null})
  .finally(()=>{UNT.loading.delete(k);if(typeof render==='function'&&untShowing(tid))untRerender()});
}
function untShowing(tid){return typeof UI!=='undefined'&&((UI.view==='reise'&&UI.tid===tid&&UI.tab==='buchungen')||UI.view==='heute')}
function untRerender(){if(typeof document!=='undefined'&&document.querySelector('.sheet'))return;try{render()}catch(e){}}
function untEnsure(t){const k=untKey(t.id);if(!UNT.cache.has(k)&&!UNT.loading.has(k)&&!UNT.errors.has(k))setTimeout(()=>untLoad(t.id),0)}

/* ---------- Teil 3: Darstellung ---------- */
function untDocChip(d){
 const k=untKinds()[d.kind]||'Unterlage',f=d.file?(d.file.mime==='application/pdf'?'PDF':'Bild')+' · '+UF().fmtBytes(d.file.bytes):'ohne Datei';
 return '<button type="button" class="btn ghost sm unt-doc" style="display:block;width:100%;text-align:left" data-unt-act="view" data-id="'+untEsc(d.id)+'"><span>'+untEsc(d.title)+'</span><span class="small muted"> · '+untEsc(k)+' · '+f+(d.secret?' · mit Code':'')+'</span></button>';
}
function untRowHtml(t,r){
 const when=r.date?untDate(r.date)+(r.time?' · '+r.time:''):'Datum offen';
 const hint=r.status==='gebucht'&&r.needDoc&&!r.docs.length?'<p class="small" data-unt-missing><b>Hinweis:</b> gebucht, aber noch keine Unterlage auf diesem Gerät.</p>':'';
 return '<li class="unt-row" style="padding:12px 0;border-top:1px solid var(--line,rgba(0,0,0,.1))" data-unt-row="'+untEsc(r.key)+'"><div class="between"><div><b>'+untEsc(r.label)+'</b>'+(r.sub?'<div class="small muted">'+untEsc(r.sub)+'</div>':'')+'<div class="small">'+untEsc(when)+'</div></div>'+
  '<span class="badge'+(r.status==='gebucht'?' ok':'')+'">'+untEsc(UNT_STATUS[r.status]||r.status)+'</span></div>'+hint+
  (r.docs.length?'<div class="row unt-docs">'+r.docs.map(untDocChip).join('')+'</div>':'')+
  '<div class="row"><button type="button" class="btn ghost sm" data-unt-act="add" data-link="'+untEsc(r.key)+'">+ Unterlage</button></div></li>';
}
function tBuchungen(t){
 const head='<section class="block"><h2>Buchungen & Tickets</h2><p class="lead muted small">Tickets, Bordkarten, Hotelbestätigung, Mietwagen-Voucher, Eintrittskarten und Buchungsnummern an einem Ort. Einmal geladen, auch ohne Netz.</p>';
 const blocked=untBlocked();
 if(blocked)return head+'<div class="note">'+untEsc(blocked)+'</div></section>';
 const k=untKey(t.id),err=UNT.errors.get(k),c=untList(t.id);
 if(err)return head+'<div class="note" role="alert" data-unt-error><b>Unterlagen konnten nicht geladen werden.</b> '+untEsc(err)+'</div><div class="row"><button type="button" class="btn ghost sm" data-unt-act="reload">Erneut versuchen</button></div></section>';
 if(!c){untEnsure(t);return head+'<p class="small muted" data-unt-loading>Unterlagen werden geladen …</p></section>'}
 const G=untGroups(t,c.list),today=typeof todayUTC==='function'?todayUTC().toISOString().slice(0,10):null;
 const use=c.usage?c.usage.count+' '+(c.usage.count===1?'Unterlage':'Unterlagen')+' · '+UF().fmtBytes(c.usage.bytes)+' auf diesem Gerät':'';
 return head+'<div class="note small" data-unt-privacy><b>🔒 Nur auf diesem Gerät.</b> '+untEsc(UNT_PRIVACY)+'</div>'+
  '<div class="row"><button type="button" class="btn" data-unt-act="add">+ Unterlage hinzufügen</button>'+(use?'<span class="small muted" data-unt-usage>'+untEsc(use)+'</span>':'')+'</div></section>'+
  '<section class="block" data-unt-bookings><h3>Eure Buchungen</h3>'+
  (G.rows.length?(G.missing?'<p class="small">'+G.missing+' '+(G.missing===1?'Buchung hat':'Buchungen haben')+' noch keine Unterlage.</p>':'')+'<ul class="plain unt-rows" style="list-style:none;padding:0;margin:0">'+G.rows.map(r=>untRowHtml(t,r)).join('')+'</ul>'
   :'<p class="small muted">Noch keine Buchungen erfasst. Unterkunft unter „Ort & Unterkunft“, Bahn- und Flugabschnitte unter „Anreise“, gebuchte Unternehmungen im Zahlungsbuch unter „Kosten“. Unterlagen könnt ihr trotzdem schon ablegen.</p>')+'</section>'+
  (G.other.length||G.lost.length?'<section class="block" data-unt-other><h3>Weitere Unterlagen</h3><div class="row unt-docs">'+G.other.map(untDocChip).join('')+'</div>'+
   (G.lost.length?'<p class="small muted">Verknüpfung nicht mehr vorhanden (Buchung entfernt), Unterlage bleibt:</p><div class="row unt-docs">'+G.lost.map(untDocChip).join('')+'</div>':'')+'</section>':'')+
  (c.list.some(d=>d.valid&&d.valid.to&&today&&d.valid.to<today)?'<section class="block"><p class="small muted">Abgelaufene Unterlagen könnt ihr nach der Reise löschen. Nichts wird automatisch entfernt.</p></section>':'')+
  '<section class="block"><p class="small muted">'+untEsc(UNT_BROWSER)+'</p></section>';
}
/* Heute: Unterlagen des Tages je laufender Reise */
function untHeuteBlock(t,now){
 if(!UF())return '';
 const c=untList(t.id);if(!c){untEnsure(t);return ''}
 const date=(typeof todayUTC==='function'?todayUTC(now):new Date()).toISOString().slice(0,10),list=untForDate(t,c.list,date);
 if(!list.length)return c.list.length?'<section class="block" data-unt-heute><div class="row"><button type="button" class="btn ghost sm" data-go="r-'+untEsc(t.id)+'-buchungen">Tickets & Unterlagen ('+c.list.length+')</button></div></section>':'';
 return '<section class="block" data-unt-heute><h3>Unterlagen für heute</h3><ul class="plain" style="list-style:none;padding:0;margin:0">'+list.map(x=>'<li><button type="button" class="btn ghost sm unt-doc" data-unt-act="view" data-tid="'+untEsc(t.id)+'" data-id="'+untEsc(x.doc.id)+'"><span>'+untEsc(x.doc.title)+'</span><span class="small muted"> · '+untEsc(x.why)+(x.row?' · '+untEsc(x.row.label):'')+'</span></button></li>').join('')+'</ul></section>';
}

/* ---------- Teil 4: Blätter (Formular, Ansicht) ---------- */
function untForm(t,d,link){
 const K=untKinds(),rows=untRows(t),cur=d?d.link:(link||''),row=rows.find(r=>r.key===cur),kind=d?d.kind:untKindFor(row);
 const L=UF().LIMITS,v=d&&d.valid||{},s=d&&d.secret||{};
 const opt=(val,label,sel)=>'<option value="'+untEsc(val)+'"'+(sel?' selected':'')+'>'+untEsc(label)+'</option>';
 const linkOpts=opt('','Keine (allgemeine Unterlage)',!cur)+rows.map(r=>opt(r.key,r.label+(r.date?' · '+untDate(r.date):''),r.key===cur)).join('')+(cur&&!row?opt(cur,'Verknüpfung nicht mehr vorhanden',true):'');
 return '<span class="eyebrow">'+(d?'Unterlage bearbeiten':'Neue Unterlage')+'</span><h2>'+(d?untEsc(d.title):'Ticket, Bestätigung oder Code ablegen')+'</h2>'+
  '<form class="form" data-unt-form data-tid="'+untEsc(t.id)+'"'+(d?' data-id="'+untEsc(d.id)+'"':'')+' novalidate>'+
  '<label>Art<select name="kind">'+Object.keys(K).map(x=>opt(x,K[x],x===kind)).join('')+'</select></label>'+
  '<label>Titel<input name="title" type="text" required maxlength="'+L.title+'" value="'+untEsc(d?d.title:row?row.label.replace(/^(Hinreise|Rückreise) · /,''):'')+'" placeholder="z. B. Bahnticket Stuttgart → Oberstdorf"></label>'+
  '<label>Gehört zu<select name="link">'+linkOpts+'</select></label>'+
  (d?(d.file?'<p class="small">Datei: '+untEsc(d.file.name||'ohne Namen')+' · '+UF().fmtBytes(d.file.bytes)+'. Eine andere Datei? Neue Unterlage anlegen und diese löschen.</p>':''):
   '<label>Datei (PDF, JPEG oder PNG, höchstens '+UF().fmtBytes(L.fileBytes)+')<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"></label><p class="small muted">Ohne Datei geht auch: nur Buchungsnummer oder Code ablegen.</p>')+
  '<fieldset><legend>Buchungsnummer oder Code (optional)</legend><label>Bezeichnung<input name="slabel" type="text" maxlength="'+L.secretLabel+'" value="'+untEsc(s.label||'')+'" placeholder="Buchungsnummer"></label>'+
  '<label>Code<input name="svalue" type="text" maxlength="'+L.secretValue+'" autocomplete="off" spellcheck="false" value="'+untEsc(s.value||'')+'"></label></fieldset>'+
  '<div class="row"><label>Gültig ab<input name="from" type="date" value="'+untEsc(v.from||'')+'"></label><label>Gültig bis<input name="to" type="date" value="'+untEsc(v.to||'')+'"></label></div>'+
  '<label>Notiz (optional)<textarea name="note" rows="2" maxlength="'+L.note+'" placeholder="z. B. Wagen 7, Platz 45">'+untEsc(d&&d.note||'')+'</textarea></label>'+
  '<p class="small muted">'+untEsc(UNT_PRIVACY)+'</p><p class="small" role="alert" data-unt-form-error></p>'+
  '<div class="row"><button type="submit" class="btn" data-unt-save>Speichern</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div></form>';
}
function untOpenForm(t,d,link){if(typeof openSheet==='function')openSheet(untForm(t,d,link))}
function untRevokeAll(){const U=typeof URL!=='undefined'?URL:null;UNT.urls.forEach(u=>{try{U&&U.revokeObjectURL(u)}catch(e){}});UNT.urls=[]}
function untBlobUrl(bytes,mime){if(typeof Blob==='undefined'||typeof URL==='undefined'||!URL.createObjectURL)return null;const u=URL.createObjectURL(new Blob([bytes],{type:mime}));UNT.urls.push(u);return u}
function untFileName(m){const F=UF();return (m.file&&m.file.name)||((typeof fileSafe==='function'?fileSafe(m.title):'unterlage')+'.'+F.ext(m.file&&m.file.mime))}
function untViewHtml(t,r){
 const m=r.meta,K=untKinds(),rows=untRows(t),row=m.link?rows.find(x=>x.key===m.link):null,today=typeof todayUTC==='function'?todayUTC().toISOString().slice(0,10):null;
 let file='';
 if(r.state==='ok'){const url=untBlobUrl(r.bytes,m.file.mime),nm=untFileName(m);
  file=(m.file.mime!=='application/pdf'&&url?'<figure class="unt-image"><img src="'+url+'" alt="'+untEsc(m.title)+'" style="max-width:100%;height:auto"></figure>':'')+
   (url?'<div class="row"><a class="btn" href="'+url+'" target="_blank" rel="noopener">'+(m.file.mime==='application/pdf'?'PDF öffnen':'Vollbild')+'</a><a class="btn ghost" href="'+url+'" download="'+untEsc(nm)+'">Datei speichern</a></div>':'')+
   '<p class="small muted">'+untEsc((m.file.mime==='application/pdf'?'PDF':'Bild')+' · '+UF().fmtBytes(m.file.bytes))+'. Für Barcodes am Schalter: Bildschirmhelligkeit hochdrehen.</p>'}
 else if(r.state==='missing')file='<div class="note" role="alert">Die Datei fehlt auf diesem Gerät. Der Eintrag bleibt. Bitte die Datei als neue Unterlage erneut hinzufügen.</div>';
 else if(r.state==='damaged')file='<div class="note" role="alert"><b>Datei beschädigt</b> (Prüfsumme stimmt nicht). Bitte erneut hinzufügen. Der Eintrag bleibt.</div>';
 const shown=UNT.reveal.has(m.id);
 const sec=m.secret?'<div class="unt-secret" data-unt-secret><span class="small muted">'+untEsc(m.secret.label)+'</span><div class="row"><code class="num" data-unt-secret-value>'+untEsc(shown?m.secret.value:UF().mask(m.secret.value))+'</code>'+
  '<button type="button" class="btn ghost sm" data-unt-act="reveal" data-tid="'+untEsc(t.id)+'" data-id="'+untEsc(m.id)+'" aria-pressed="'+(shown?'true':'false')+'">'+(shown?'Verbergen':'Anzeigen')+'</button>'+
  '<button type="button" class="btn ghost sm" data-unt-act="copy" data-id="'+untEsc(m.id)+'">Kopieren</button></div></div>':'';
 const del=UNT.del===m.id;
 return '<span class="eyebrow">'+untEsc(K[m.kind]||'Unterlage')+(row?' · '+untEsc(row.label):m.link?' · Verknüpfung nicht mehr vorhanden':'')+'</span><h2>'+untEsc(m.title)+'</h2>'+
  (m.valid?'<p class="small">'+untEsc(untValidText(m.valid,today))+'</p>':'')+sec+(m.note?'<p>'+untEsc(m.note)+'</p>':'')+file+
  '<div class="row"><button type="button" class="btn ghost sm" data-unt-act="edit" data-tid="'+untEsc(t.id)+'" data-id="'+untEsc(m.id)+'">Bearbeiten</button>'+
  (del?'<button type="button" class="btn sm warn" data-unt-act="delete-confirm" data-tid="'+untEsc(t.id)+'" data-id="'+untEsc(m.id)+'">Ja, endgültig löschen</button><button type="button" class="btn ghost sm" data-unt-act="delete-cancel" data-tid="'+untEsc(t.id)+'" data-id="'+untEsc(m.id)+'">Nicht löschen</button>'
   :'<button type="button" class="btn ghost sm" data-unt-act="delete" data-tid="'+untEsc(t.id)+'" data-id="'+untEsc(m.id)+'">Löschen</button>')+'</div>'+
  '<p class="small muted">🔒 Nur auf diesem Gerät.</p>';
}
async function untOpenView(t,id){
 let r;try{r=await untStore().get(id)}catch(e){if(typeof alertMsg==='function')alertMsg(String(e&&e.message||e));return}
 if(!r||r.meta.trip!==t.id||r.meta.scope!==untScope()){if(typeof alertMsg==='function')alertMsg('Unterlage nicht gefunden.');return}
 untRevokeAll();if(typeof openSheet==='function')openSheet(untViewHtml(t,r));
}

/* ---------- Teil 5: Speichern ---------- */
function untFormInput(f){
 const g=n=>{const el=f.querySelector('[name="'+n+'"]');return el?el.value:''};
 return {kind:g('kind'),title:g('title'),link:g('link')||null,valid:{from:g('from')||null,to:g('to')||null},secret:g('svalue').trim()?{label:g('slabel'),value:g('svalue')}:null,note:g('note')};
}
async function untReadFile(file){if(!file)return null;const bytes=file.arrayBuffer?await file.arrayBuffer():await new Response(file).arrayBuffer();return {bytes,name:file.name||''}}
async function untPersist(){if(UNT.persistAsked)return;UNT.persistAsked=true;try{const nav=typeof navigator!=='undefined'?navigator:null;if(nav&&nav.storage&&typeof nav.storage.persist==='function')await nav.storage.persist()}catch(e){}}
async function untSubmit(f){
 if(UNT.busy)return;
 const t=Store.get(f.getAttribute('data-tid')),id=f.getAttribute('data-id'),out=f.querySelector('[data-unt-form-error]'),btn=f.querySelector('[data-unt-save]');
 if(!t)return;
 UNT.busy=true;if(btn)btn.disabled=true;if(out)out.textContent='';
 try{
  const input=untFormInput(f);
  if(id)await untStore().update(id,input);
  else{const fi=f.querySelector('[name="file"]'),file=fi&&fi.files&&fi.files[0]?await untReadFile(fi.files[0]):null;await untStore().add(untScope(),t.id,input,file);untPersist()}
  await untLoad(t.id,true);
  if(typeof closeSheet==='function')closeSheet();
  untRerender();if(typeof alertMsg==='function')alertMsg(id?'Unterlage geändert.':'Unterlage gespeichert, auf diesem Gerät.');
 }catch(e){if(out)out.textContent=String(e&&e.message||e)}
 finally{UNT.busy=false;if(btn)btn.disabled=false}
}
async function untDelete(t,id){
 try{await untStore().remove(id)}catch(e){if(typeof alertMsg==='function')alertMsg(String(e&&e.message||e));return}
 UNT.del=null;UNT.reveal.delete(id);untRevokeAll();await untLoad(t.id,true);
 if(typeof closeSheet==='function')closeSheet();untRerender();if(typeof alertMsg==='function')alertMsg('Unterlage gelöscht.');
}

/* ---------- Teil 6: Ereignisse ---------- */
function untTrip(el){const id=el&&el.getAttribute('data-tid');return id?Store.get(id):(typeof cur==='function'?cur():null)}
if(typeof document!=='undefined'){
 document.addEventListener('click',e=>{
  const el=e.target&&e.target.closest?e.target.closest('[data-unt-act]'):null;if(!el)return;
  const act=el.getAttribute('data-unt-act'),t=untTrip(el),id=el.getAttribute('data-id');if(!t)return;
  e.preventDefault();
  if(act==='add'){untOpenForm(t,null,el.getAttribute('data-link')||'');return}
  if(act==='reload'){UNT.errors.delete(untKey(t.id));untLoad(t.id,true);return}
  if(act==='view'){UNT.del=null;untOpenView(t,id);return}
  if(act==='reveal'){if(UNT.reveal.has(id))UNT.reveal.delete(id);else UNT.reveal.add(id);untOpenView(t,id);return}
  if(act==='copy'){untStore().meta(id).then(m=>{const v=m&&m.secret?m.secret.value:'';const c=typeof navigator!=='undefined'&&navigator.clipboard;return c&&c.writeText?c.writeText(v).then(()=>alertMsg('Code kopiert.')):alertMsg('Kopieren wird hier nicht unterstützt. Bitte „Anzeigen“ und abschreiben.')}).catch(()=>alertMsg('Kopieren nicht möglich.'));return}
  if(act==='edit'){untStore().meta(id).then(m=>{if(m)untOpenForm(t,m)});return}
  if(act==='delete'){UNT.del=id;untOpenView(t,id);return}
  if(act==='delete-cancel'){UNT.del=null;untOpenView(t,id);return}
  if(act==='delete-confirm'){untDelete(t,id);return}
 });
 document.addEventListener('submit',e=>{const f=e.target&&e.target.closest?e.target.closest('[data-unt-form]'):null;if(!f)return;e.preventDefault();untSubmit(f)});
}
/* Konto-Wechsel: Zwischenspeicher leeren, weil der Bereich wechselt */
function untReset(){UNT.cache.clear();UNT.errors.clear();UNT.reveal.clear();UNT.del=null;untRevokeAll()}
