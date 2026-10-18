/* Reiseplaner · Ansichten.
   Teil 10 von 18 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Ansichten ================= */
const SHELF_FILTERS={all:'Alle',current:'Unterwegs',next:'Kommend',open:'Datum offen',past:'Vergangen'};
function shelfText(value){return String(value||'').toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss')}
function tripShelf(trips,options,now){
 const o=options||{},filter=Object.prototype.hasOwnProperty.call(SHELF_FILTERS,o.filter)?o.filter:'all',query=shelfText(o.query).trim(),sort=['next','name','recent'].includes(o.sort)?o.sort:'next';
 const counts={all:trips.length,current:0,next:0,open:0,past:0},rank={current:0,next:1,open:2,past:3};
 const rows=trips.map(t=>{const phase=tripPhase(t,now),key=!phase?'open':phase.phase==='unterwegs'?'current':phase.phase==='vor'?'next':'past';counts[key]++;return {trip:t,phase,key}});
 const title=(a,b)=>String(a.trip.title||'').localeCompare(String(b.trip.title||''),'de')||String(a.trip.id).localeCompare(String(b.trip.id));
 const order=(a,b)=>rank[a.key]-rank[b.key]||(a.key==='past'?String(b.trip.end).localeCompare(String(a.trip.end)):a.key!=='open'?String(a.trip.start).localeCompare(String(b.trip.start)):0)||title(a,b);
 const ordered=rows.slice().sort(order),spotlight=ordered.find(r=>r.key==='current'||r.key==='next')||null;
 const shown=rows.filter(r=>{const t=r.trip,place=placeOf(t),stay=stayOf(t);return (filter==='all'||r.key===filter)&&(!query||shelfText([t.title,t.dest,place&&place.name,place&&place.region,stay&&stay.name].join(' ')).includes(query))});
 shown.sort(sort==='name'?title:sort==='recent'?(a,b)=>String(b.trip.created||'').localeCompare(String(a.trip.created||''))||title(a,b):order);
 return {rows:shown,counts,spotlight,filter,query,sort};
}
function tripShelfTools(shelf){
 return '<div class="panel shelf-tools"><form id="trip-search" class="row" role="search"><label class="fld" style="flex:1"><span>Reise, Ziel oder Unterkunft</span><input type="search" id="trip-q" maxlength="120" value="'+esc(UI.tripQuery||'')+'" placeholder="Welche Auszeit suchst du?"></label><button type="submit" class="btn ghost sm">Suchen</button><label class="fld"><span>Sortieren</span><select id="trip-sort"><option value="next"'+(shelf.sort==='next'?' selected':'')+'>Als Nächstes</option><option value="name"'+(shelf.sort==='name'?' selected':'')+'>Name A–Z</option><option value="recent"'+(shelf.sort==='recent'?' selected':'')+'>Zuletzt angelegt</option></select></label></form><div class="row" aria-label="Reisen nach Zeitraum">'+Object.entries(SHELF_FILTERS).map(([key,label])=>chipb('trip-filter',key,label+' ('+shelf.counts[key]+')',shelf.filter===key)).join('')+'</div><div class="between"><p class="small muted" role="status">'+shelf.rows.length+' von '+shelf.counts.all+' Reisen sichtbar. Zeitgruppen folgen dem Datum, nicht dem Buchungsstatus.</p><button type="button" class="lnk" data-act="trip-reset"'+(shelf.query||shelf.filter!=='all'||shelf.sort!=='next'?'':' disabled')+'>Ansicht zurücksetzen</button></div></div>';
}
function tripSpotlight(row){
 if(!row)return '';const t=row.trip;
 return '<aside class="trip-spotlight"><div><span class="eyebrow">'+(row.key==='current'?'Gerade unterwegs':'Eure nächste Auszeit')+'</span><h2>'+esc(t.title)+'</h2><p class="small muted">'+esc(rangeText(t))+' · '+esc(phaseText(row.phase))+'</p></div><button type="button" class="btn" data-go="r-'+esc(t.id)+'-'+(row.key==='current'?'plan':'ueber')+'">'+(row.key==='current'?'Zum Tagesplan':'Weiterplanen')+' <span aria-hidden="true">↗</span></button></aside>';
}
function storageRecoveryBlock(){if(Store.corruptRaw===null)return '';return '<section class="block" data-storage-recovery><div class="note" role="alert"><h2>Gespeicherte Reisen konnten nicht gelesen werden</h2><p>Die ursprünglichen Daten wurden nicht überschrieben. Lade zuerst die Rohdaten herunter und bewahre sie auf. Bis zur Entscheidung sind Änderungen gesperrt.</p>'+(Store.idbBackup?'<p>Eine lesbare Zweitkopie in IndexedDB'+(Store.idbBackup.at?' vom '+esc(new Date(Store.idbBackup.at).toLocaleString('de-DE')):'')+' ist vorhanden. „Speicher zurücksetzen“ entfernt nur die beschädigte Kopie und holt danach diesen Stand zurück.</p>':'')+'<div class="row"><button type="button" class="btn" data-act="corrupt-download">Rohdaten sichern</button><button type="button" class="btn ghost" data-act="corrupt-confirm">Speicher zurücksetzen</button></div>'+(UI.confirm==='corrupt-reset'?'<p>Nur fortfahren, wenn die Rohdaten gesichert sind. Das Zurücksetzen entfernt die beschädigte lokale Kopie von diesem Gerät.</p><div class="row"><button type="button" class="btn warn" data-act="corrupt-reset">Ja, lokale Daten entfernen</button><button type="button" class="btn ghost" data-act="corrupt-cancel">Abbrechen</button></div>':'')+'</div></section>'}
/* Speicherhinweise (P0.4): Rückfall ohne IndexedDB-Zweitkopie sichtbar machen; Ladezustand statt „keine Reise“, solange
   bei leerem Browser-Speicher die Zweitkopie noch geprüft wird. */
function storageNotice(){return Store.backendNote?'<section class="block" data-storage-backend><div class="note" role="status"><b>Speicherhinweis:</b> '+esc(Store.backendNote)+' Wichtige Reisen zusätzlich als Datei sichern.</div></section>':''}
function emptyShelf(){if(Store.backend==='laden'&&Store.startRaw===null){Store.loadingShown=true;return '<div class="empty" role="status" data-storage-loading><b>Gespeicherte Reisen werden geladen …</b><span>Der Browser-Speicher wird geprüft.</span></div>'}return '<div class="empty"><b>Noch keine Reise angelegt</b><span>Legt eine neue Reise an oder startet mit einer Vorlage.</span></div>'}
function vReisen(){
  const list=Store.list(),shelf=tripShelf(list,{filter:UI.tripFilter,query:UI.tripQuery,sort:UI.tripSort});
  const card=t=>{const c=cost(t),ph=tripPhase(t),b=num(t.budget,0),pct=b?Math.min(100,c.total/b*100):0,pl=placeOf(t),st=stayOf(t);
    return '<button type="button" class="card click trip-card" data-go="r-'+t.id+'-ueber"><div class="between"><span class="eyebrow">'+esc(TYPES[t.type]||'Reise')+'</span><span class="badge">'+esc(STATUS[t.status]||'')+'</span></div><h3>'+esc(t.title)+'</h3>'+(Store.isAccount()?'<div class="badges">'+syncBadge(t.id)+(Store.role(t.id)!=='owner'?'<span class="badge">'+ROLE_TXT[Store.role(t.id)]+'</span>':'')+'</div>':'')+'<p class="small muted">'+esc(rangeText(t))+'</p>'+
    '<p class="small">'+esc(pl?pl.name:(t.dest||'Ziel offen'))+(st?' · '+esc(st.name):'')+'</p>'+
    (ph?'<p class="small"><b>'+esc(phaseText(ph))+'</b></p>':'')+
    '<div class="between trip-price"><span><span class="small muted">Planwert gesamt</span><br><span class="price num">'+eur(c.total)+'</span></span><span class="small muted num">'+(b?'von '+eur(b):'kein Budget')+'</span></div>'+(b?'<div class="bar'+(c.total>b?' bad':c.total>b*.92?' warn':'')+'"><i style="width:'+pct+'%"></i></div>':'')+(openCosts(t).length?'<span class="small" style="color:var(--warn)">Weitere Kosten sind noch offen</span>':'')+'<span class="trip-open"><span>Reise öffnen</span><span aria-hidden="true">↗</span></span></button>'};
  return unreadableShelf()+storageNotice()+
   '<section class="block home-hero"><svg class="hero-art" viewBox="0 0 280 280" fill="none" aria-hidden="true"><circle cx="140" cy="140" r="120" stroke="currentColor"/><circle cx="140" cy="140" r="86" stroke="currentColor" stroke-dasharray="3 9"/><path d="M140 12v28m0 200v28M12 140h28m200 0h28M184 92l-29 63-63 29 29-63Z" stroke="currentColor" stroke-width="2"/><path d="m140 140 44-48-29 63Z" fill="currentColor"/></svg><span class="eyebrow">Dein nächstes schönes Stück Auszeit</span><h1>Die Vorfreude beginnt hier.</h1><p class="lead muted">Ideen sammeln, gemeinsam abwägen und entspannt losfahren. Alles für eure Reise an einem Ort.</p><div class="hero-meta"><span>'+list.length+(list.length===1?' gespeicherte Reise':' gespeicherte Reisen')+'</span><span>Ausflug · Wochenende · Urlaub</span></div>'+
   (Store.isAccount()&&guestPendingCount()?'<div class="note"><b>'+guestPendingCount()+' Reise(n) ohne Konto in diesem Browser.</b><p>Sie werden nicht automatisch übertragen.</p><div class="row"><button type="button" class="btn ghost sm" data-acc="adopt-open">Ansehen und ins Konto übernehmen</button></div></div>':'')+(!Store.isAccount()&&Sync.cloud()?'<p class="small muted">Gastmodus: Reisen nur in diesem Browser. <button type="button" class="lnk" data-go="konto">Anmelden für Online-Speicherung und Teilen</button></p>':'')+
   '<div class="row"><button type="button" class="btn" data-go="neu">+ Neue Reise</button><button type="button" class="btn ghost" data-go="entdecken">Ziele im Umkreis entdecken</button></div><details class="panel"'+(list.length?'':' open')+'><summary><b>Mit einer Vorlage starten</b></summary><p class="small muted">Vorlagen bereiten Reiseart, Dauer und passende Aufgaben vor. In der Vorschau seht ihr, was enthalten ist. Das Silvester-Beispiel enthält eine geplante Reise mit Schätzwerten.</p>'+tplButtons()+'</details></section>'+
   '<section class="block"><div class="section-heading"><h2>Meine Reisen</h2><p>Eure Pläne, ein Griff entfernt.</p></div>'+(list.length?(!shelf.query&&shelf.filter==='all'?tripSpotlight(shelf.spotlight):'')+tripShelfTools(shelf)+(shelf.rows.length?'<div class="grid wide">'+shelf.rows.map(r=>card(r.trip)).join('')+'</div>':'<div class="empty"><b>Keine Reise passt zu dieser Ansicht</b><span>Suchwort oder Zeitgruppe ändern. Eure Reisen wurden nicht gelöscht.</span><button type="button" class="btn ghost" data-act="trip-reset">Alle Reisen zeigen</button></div>'):emptyShelf())+'</section>'+
   '<section class="block"><h2>Reisen sichern & übertragen</h2><p class="small muted">Eine JSON-Datei enthält eure Reisepläne einschließlich Notizen. Bewahrt sie privat auf. Die Datei kann auf dem anderen Gerät importiert werden; das ist eine manuelle Übertragung, keine automatische Synchronisation.</p><div class="row"><button type="button" class="btn ghost sm" data-act="backup-all"'+(list.length?'':' disabled')+'>Alle Reisen sichern</button><button type="button" class="btn ghost sm" data-act="import-open">Sicherung importieren</button><input id="import-file" type="file" accept=".json,application/json" hidden aria-label="Reiseplaner-Sicherung wählen"></div></section>'+
   '<details class="panel home-support"><summary><b>Neu hier? So funktioniert’s</b></summary><div class="grid"><div class="card"><h4>1 · Reise anlegen</h4><p class="small">Art, Zeitraum, Personen, Budget. Datum fest, flexibel oder offen.</p></div><div class="card"><h4>2 · Angebot oder frei planen</h4><p class="small">Fertiges Paket übernehmen oder Ort, Unterkunft und Unternehmungen selbst wählen.</p></div><div class="card"><h4>3 · Tagesplan & Kosten</h4><p class="small">Jeden Tag in vier Zeitfenstern füllen, Kosten und Spartipps live.</p></div><div class="card"><h4>4 · Abhaken</h4><p class="small">Buchungen und Packliste entstehen aus eurem Plan.</p></div></div></details>';
}
function tripForm(t,prefix){
  const dm=t.dateMode;
  return '<div class="stack">'+
  '<div class="fld"><span>Name der Reise</span><input type="text" data-f="title" value="'+esc(t.title)+'" maxlength="80"></div>'+
  '<div class="fld"><span>Art</span><div class="opts">'+Object.keys(TYPES).map(k=>opt(prefix+'type',k,TYPES[k],'',t.type===k)).join('')+'</div></div>'+
  '<div class="fld"><span>Zeitraum</span><div class="opts">'+opt(prefix+'dm','fix','Festes Datum','von – bis',dm==='fix')+opt(prefix+'dm','flex','Nur Zeitraum','Monat + Nächte',dm==='flex')+opt(prefix+'dm','open','Noch offen','nur Dauer',dm==='open')+'</div></div>'+
  '<div class="form">'+
   (dm==='fix'?'<label class="fld"><span>Anreise</span><input type="date" data-f="start" value="'+esc(t.start)+'"></label><label class="fld"><span>Abreise</span><input type="date" data-f="end" value="'+esc(t.end)+'"></label>':'')+
   (dm==='flex'?'<label class="fld"><span>Monat</span><input type="month" data-f="month" value="'+esc(t.month)+'"></label>':'')+
   (dm!=='fix'?'<label class="fld"><span>Nächte</span><input type="number" min="0" data-f="nights" value="'+esc(t.nights)+'"></label>':'')+
   '<label class="fld"><span>Personen</span><input type="number" min="1" max="20" data-f="persons" value="'+esc(t.persons)+'"></label>'+
   '<label class="fld"><span>Budget gesamt (€)</span><input type="number" min="0" step="50" data-f="budget" value="'+esc(t.budget)+'"></label>'+
   '<label class="fld"><span>Start-Ort</span><input type="text" data-f="origin" value="'+esc(t.origin)+'"></label>'+
   '<label class="fld"><span>Zeitzone am Ziel</span><select data-f="tz">'+TZ_LIST.map(z=>'<option value="'+z[0]+'"'+((t.tz||'')===z[0]?' selected':'')+'>'+esc(z[1])+'</option>').join('')+'</select></label>'+
   '<label class="fld"><span>Abfahrt am Anreisetag (optional)</span><input type="time" data-f="departTime" value="'+esc(t.departTime||'')+'"></label>'+
   (num(t.nights,1)>0||t.dateMode==='fix'?'<label class="fld"><span>Check-in ab (optional)</span><input type="time" data-f="checkinTime" value="'+esc(t.checkinTime||'')+'"></label>':'')+
  '</div>'+
  '<div class="fld"><span>Anreise mit</span><div class="opts">'+opt(prefix+'travel','auto','Auto','',t.travel==='auto')+opt(prefix+'travel','bahn','Bahn','',t.travel==='bahn')+opt(prefix+'travel','flug','Flug / Bus','',t.travel==='flug')+'</div></div>'+
  '<div class="fld"><span>Ideen-Katalog</span><div class="opts">'+opt(prefix+'catalog','allgaeu','Allgäu & Tirol im Winter','4 Orte, 13 Unterkünfte, 30+ Ideen',t.catalog==='allgaeu')+opt(prefix+'catalog','none','Ohne Katalog','eigene Unterkünfte und Ideen eintragen',t.catalog!=='allgaeu')+'</div></div>'+
  '</div>';
}
function vNeu(){
  const t=UI.draft;
  return '<section class="block"><button type="button" class="lnk" data-go="reisen">← Meine Reisen</button><h1>Neue Reise</h1><p class="lead muted">Alles lässt sich später ändern.</p></section>'+
  '<section class="block"><div class="panel" id="draft">'+tripForm(t,'d-')+'<div class="row"><button type="button" class="btn" data-act="create">Reise anlegen</button></div><details><summary class="small"><b>Oder mit einer Vorlage starten</b></summary>'+tplButtons()+'</details></div></section>';
}
function tripHead(t){
  const ph=tripPhase(t);
  return '<section class="block trip-header'+(UI.tab==='mappe'?' noprint':'')+'">'+
  '<span class="eyebrow">'+esc(TYPES[t.type]||'')+' · '+esc(rangeText(t))+'</span><h1>'+esc(t.title)+'</h1>'+
  (ph&&ph.phase==='vor'?'<p class="muted small">Noch <b>'+ph.days+(ph.days===1?' Tag':' Tage')+'</b> bis zur Abreise</p>':ph&&ph.phase==='unterwegs'?'<p class="small"><b>'+esc(phaseText(ph))+'</b></p>':'')+
  '<div class="trip-actions noprint"><button type="button" class="lnk" data-go="reisen">← Reisen</button><select data-f="status" aria-label="Status">'+Object.keys(STATUS).map(k=>'<option value="'+k+'"'+(t.status===k?' selected':'')+'>'+STATUS[k]+'</option>').join('')+'</select><button type="button" class="btn ghost sm" data-act="edit-trip">Eckdaten</button></div></section>'+
  '<nav class="tabs" aria-label="Bereiche">'+areaPicker(t)+'<div class="tab-links">'+AREA_GROUPS.map(([group,keys])=>'<div class="tab-group"><span class="eyebrow">'+group+'</span>'+keys.map(key=>{const x=TABS.find(tab=>tab[0]===key);let n='';if(key==='plan')n=(t.items||[]).length;if(key==='check'){const g=checklist(t);let all=0,done=0;g.forEach(gr=>gr[1].forEach(i=>{all++;if(t.check&&t.check[i[0]])done++}));n=done+'/'+all}
    return '<button type="button" class="tab" data-go="r-'+t.id+'-'+key+'"'+(UI.tab===key?' aria-current="page"':'')+'>'+x[1]+(n!==''?'<span class="n">'+n+'</span>':'')+'</button>'}).join('')+'</div>').join('')+'</div></nav>';
}
function stackBar(c){
  const tot=c.total||1, keys=Object.keys(c.byCat).filter(k=>c.byCat[k]>0);
  return '<div class="sbar" role="img" aria-label="Kosten nach Kategorie">'+keys.map(k=>'<i style="width:'+(c.byCat[k]/tot*100)+'%;background:'+COSTCAT[k][1]+'"></i>').join('')+'</div><div class="legend">'+keys.map(k=>'<span><i style="background:'+COSTCAT[k][1]+'"></i>'+COSTCAT[k][0]+' <b class="num">'+eur(c.byCat[k])+'</b></span>').join('')+'</div>';
}
/* Abgeleitete Orientierung ohne Fortschrittsprozente oder automatische Planänderung. */
function activityGaps(t){
 const planned=new Set((t.items||[]).map(i=>i.act));
 return actsFor(t).filter(a=>!a.transit).map(a=>({act:a,planned:planned.has(a.id),price:!!(a.custom&&a.costOpen&&!num(a.cost,0)),duration:actHours(a)==null,locked:activityCommitted(t,a.id)}));
}
function planningNextSteps(t){
 const out=[],c=cost(t),f=financeSummary(t),o=activeOffer(t),load=dayLoad(t),oc=openCosts(t);
 const add=(id,priority,title,reason,tab,action='',value='',label='Ansehen')=>out.push({id,priority,title,reason,tab,action,value,label});
 const late=f.due.filter(r=>r.overdue),soon=f.due.filter(r=>!r.overdue&&r.days<=14);
 if(late.length)add('payments',10,'Überfällige Zahlung klären',late.length+' Posten mit offenem Betrag und vergangener Fälligkeit. Keine Zahlung wird automatisch ausgelöst.','kosten');
 else if(soon.length)add('payments',15,'Anstehende Zahlung prüfen',soon.length+' Posten werden innerhalb von 14 Tagen fällig.','kosten');
 if(f.detachedPaid>0)add('detached',12,'Zahlungen für entfernte Posten klären',eur(f.detachedPaid)+' sind keinem aktuellen Planposten zugeordnet. Erstattung oder verbleibende Kosten gesondert klären.','kosten');
 if(!placeOf(t)&&!String(t.dest||'').trim()&&!t.destGeo&&!(t.legs||[]).length)add('destination',20,'Ein Reiseziel wählen','Unterkunft, Ideen und Anfahrt lassen sich anschließend passend vergleichen.','unterkunft');
 if(t.dateMode!=='fix'||!pd(t.start)||!pd(t.end))add('dates',25,'Zeitraum konkretisieren','Ein offener oder flexibler Zeitraum reicht zum Ideen sammeln. Vor Angeboten und Buchungen konkrete Daten wählen.','','edit-trip');
 if(o&&(!offerCurrent(o,t)||o.availability!=='available'))add('offer',30,'Ausgewähltes Angebot erneut prüfen','Datum, Personen, Gültigkeit und Verfügbarkeit müssen zum Aufenthalt passen.','suche');
 if(nightsOf(t)>0&&!stayOf(t))add('stay',35,'Eine Unterkunft vergleichen','Für die Übernachtungen fehlt eine Unterkunft. Noch kein vollständiger Gesamtpreis.','suche');
 if(!String(t.origin||'').trim())add('origin',40,'Abfahrtsort ergänzen','Ohne Startort ist die Anfahrt nicht vollständig planbar.','','edit-trip');
 if(t.travel==='auto'&&(!routeKm(t)||t.kmSrc==='schaetzung'&&t.routeKm==null))add('route',45,'Fahrstrecke prüfen',routeKm(t)?'Die Kilometer sind geschätzt. Echte Strecke, Parken und Maut prüfen.':'Hin- und Rückfahrt brauchen eine Strecke ab eurem Startort.','kosten');
 if(num(t.budget,0)>0&&c.total>num(t.budget,0))add('budget',18,'Plan liegt über dem Budget',eur(c.total-num(t.budget,0))+' über der Vorgabe – zusätzlich können noch Kosten offen sein.','kosten');
 else if(!num(t.budget,0))add('budget',55,'Gesamtbudget festlegen','Eine Obergrenze hilft beim Vergleich; Kosten ohne Budget sind weiterhin Planwerte.','','edit-trip');
 if(oc.length)add('costs',50,'Offene Kosten und Gebühren prüfen',oc.slice(0,3).join(' · ')+(oc.length>3?' · '+(oc.length-3)+' weitere Hinweise in den Kosten':''),'kosten');
 const gaps=activityGaps(t).filter(x=>x.planned),prices=gaps.filter(x=>x.price),price=prices.find(x=>!x.locked);
 if(prices.length)add('activity-prices',42,'Preise der Unternehmungen ergänzen',prices.length+' eingeplante Idee(n) ohne Preis.'+(price?' Beginnt mit „'+price.act.t+'“.':' Bestehende Verpflichtungen zunächst im Zahlungsbuch klären.'),'kosten',price?'act-view':'',price?price.act.id:'',price?'Preis eintragen':'Zahlungsbuch prüfen');
 const busy=load.filter(d=>d.over),unknown=load.reduce((n,d)=>n+d.unknown,0);
 if(busy.length)add('load',32,'Überladene Tage entlasten',busy.length+' Tag(e) haben mehr Programm als nach geschätzter Fahrtzeit verfügbar ist. Pausen und Wege zusätzlich prüfen.','plan');
 if(unknown){const duration=gaps.find(x=>x.duration&&x.act.custom&&!x.locked);add('duration',65,'Dauer der Unternehmungen prüfen',unknown+' eingeplante Punkt(e) ohne bekannte Dauer. Freie Zeit ist dadurch nicht bestätigt.'+(duration?' Ergänzt zuerst „'+duration.act.t+'“.':''),'unternehmen',duration?'act-edit':'',duration?duration.act.id:'',duration?'Dauer ergänzen':'Unternehmungen prüfen');}
 if(!(t.items||[]).length)add('ideas',80,'Ein Highlight sammeln','Optional: eine passende Idee wählen und Erholungszeit frei lassen. Ihr müsst den Tagesplan nicht füllen.','unternehmen');
 return out.sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
}
function nextStepsBlock(t){
 const rows=planningNextSteps(t),row=x=>'<article class="card" data-next-step="'+esc(x.id)+'"><h3>'+esc(x.title)+'</h3><p class="small">'+esc(x.reason)+'</p><div class="foot"><button type="button" class="btn ghost sm" '+(x.action?'data-act="'+esc(x.action)+'" data-val="'+esc(x.value)+'"':'data-go="r-'+esc(t.id)+'-'+x.tab+'"')+'>'+esc(x.label)+'</button></div></article>';
 return '<section class="block" data-next-steps><div class="between"><h2>Was jetzt sinnvoll ist</h2><span class="badge">Aus eurem aktuellen Plan</span></div><p class="small muted">Die wichtigsten nächsten Schritte zuerst. Hinweise sind keine Buchungsfreigabe und ändern euren Plan nicht.</p>'+(rows.length?'<div class="grid">'+rows.slice(0,3).map(row).join('')+'</div>'+(rows.length>3?'<details class="panel"><summary><b>'+ (rows.length-3)+' weitere Hinweise</b></summary><div class="grid">'+rows.slice(3).map(row).join('')+'</div></details>':''):'<p>Keine zusätzlichen Schritte aus diesen Kriterien. Öffnungen, Tarife, genaue Zeiten und Buchungsbedingungen trotzdem beim Anbieter prüfen.</p>')+'</section>';
}
function tUeber(t){
  const c=cost(t), b=num(t.budget,0), pl=placeOf(t), st=stayOf(t), ch=checks(t), pk=PKGS.find(p=>p.id===t.packageId);
  const open=[];checklist(t)[0][1].forEach(i=>{if(!(t.check&&t.check[i[0]]))open.push(i)});
  return journalRetro(t)+todayBlock(t)+departureBlock(t)+nextStepsBlock(t)+'<section class="block"><div class="kpis"><div class="kpi"><small>Geplant gesamt</small><b class="num">'+eur(c.total)+'</b><small>'+eur(c.total/c.P)+' pro Person</small></div>'+
  '<div class="kpi"><small>Budget</small><b class="num" style="color:'+(b&&c.total>b?'var(--bad)':'var(--ok)')+'">'+(b?eur(b-c.total):'–')+'</b><small>'+(b?(c.total>b?'über':'übrig von')+' '+eur(b):'kein Budget gesetzt')+'</small></div>'+
  '<div class="kpi"><small>Dauer</small><b class="num">'+c.N+' Nächte</b><small>'+c.P+' Personen</small></div>'+
  '<div class="kpi"><small>Unternehmungen</small><b class="num">'+(t.items||[]).length+'</b><small>über '+daysOf(t).length+' Tage verteilt</small></div></div>'+
  stackBar(c)+(c.saved?'<p class="small" style="color:var(--ok)">Durch die Gästekarte spart ihr beim Skipass ≈ '+eur(c.saved)+'.</p>':'')+'</section>'+
  '<section class="block"><h2>Plan-Check</h2><div class="checks-list">'+ch.map(x=>'<div class="chk '+x[0]+'"><b>'+(x[0]==='warn'?'!':x[0]==='ok'?'OK':'i')+'</b><span>'+esc(x[1])+'</span><button type="button" class="lnk" style="margin-left:auto" data-go="r-'+t.id+'-'+x[2]+'">Ansehen</button></div>').join('')+'</div></section>'+
  legsBlock(t)+
  '<section class="block"><h2>Euer Plan</h2><div class="grid">'+
   '<div class="card"><span class="eyebrow">Ort</span><h3>'+esc(pl?pl.name:(t.dest||'Noch offen'))+'</h3><p class="small muted">'+esc(pl?pl.short:'')+'</p><div class="foot"><button type="button" class="btn ghost sm" data-go="r-'+t.id+'-unterkunft">Ändern</button></div></div>'+
   '<div class="card"><span class="eyebrow">Unterkunft</span><h3>'+esc(st?st.name:'Noch keine')+'</h3><p class="small muted">'+esc(st?(st.ort||'')+(num(t.stayQuote,0)>0?' · Angebot '+eur(t.stayQuote):''):'Im Bereich Ort & Unterkunft wählen')+'</p><div class="foot">'+(st&&st.url?lk(st.url,'Inserat'):'')+'<button type="button" class="btn ghost sm" data-go="r-'+t.id+'-unterkunft">Ändern</button></div></div>'+
   '<div class="card"><span class="eyebrow">Angebot</span><h3>'+esc(pk?pk.name:'Frei geplant')+'</h3><p class="small muted">'+esc(pk?pk.pitch:'Pakete als Startpunkt im Bereich Angebote')+'</p><div class="foot"><button type="button" class="btn ghost sm" data-go="r-'+t.id+'-angebote">Angebote</button></div></div>'+
  '</div></section>'+
  '<section class="block"><h2>Nächste Schritte</h2>'+(open.length?'<div class="checks-list">'+open.slice(0,5).map(i=>'<label class="chk info"><input type="checkbox" data-act="check" data-val="'+esc(i[0])+'"> <span>'+esc(i[1])+(i[2]?'<br><small class="muted">'+esc(i[2])+'</small>':'')+'</span></label>').join('')+'</div>':'<p class="muted">Keine offenen Buchungen.</p>')+'</section>'+
  '<section class="block"><h2>Reise verwalten</h2>'+(Store.isAccount()?'<p class="small">'+syncBadge(t.id)+' · Eure Rolle: '+ROLE_TXT[Store.role(t.id)]+'</p>':'')+'<div class="row">'+(Store.isAccount()?'<button type="button" class="btn ghost sm" data-acc="share">Teilen & Rechte</button>':'')+'<button type="button" class="btn ghost sm" data-act="dup">Reise duplizieren</button><button type="button" class="btn ghost sm" data-act="backup-trip">Diese Reise sichern</button>'+(UI.confirm==='del'?'<span class="small">Wirklich löschen?</span><button type="button" class="btn warn sm" data-act="del-yes">Ja, löschen</button><button type="button" class="btn ghost sm" data-act="del-no">Abbrechen</button>':'<button type="button" class="btn ghost sm" data-act="del">Reise löschen</button>')+'</div></section>';
}
function tAngebote(t){
  if(t.catalog!=='allgaeu') return '<section class="block"><div class="empty"><b>Für diese Reise gibt es noch keine fertigen Angebote</b><span>Angebote gibt es bisher für den Katalog „Allgäu & Tirol im Winter“. Plant frei über Unterkunft und Unternehmungen.</span><button type="button" class="btn ghost" data-go="r-'+t.id+'-unternehmen">Zu den Unternehmungen</button></div></section>';
  let list=PKGS.map(p=>({p,tot:pkgTotal(t,p)}));
  if(UI.pkgf==='mit') list=list.filter(x=>x.p.kurs); if(UI.pkgf==='ohne') list=list.filter(x=>!x.p.kurs);
  if(UI.pkgfocus) list=list.filter(x=>x.p.focus.includes(UI.pkgfocus));
  list.sort((a,b)=>a.tot-b.tot);
  const b=num(t.budget,0);
  return '<section class="block"><h2>Angebote</h2><p class="lead muted">Geschätzte Wintervorlagen, keine buchbaren Angebote. Übernehmen ersetzt den Tagesplan. Datumsgebundene Punkte (z. B. Silvester am 31.12.) landen auf ihrem Datum und entfallen außerhalb eures Zeitraums. Saison und freie Tage selbst prüfen.</p>'+
  '<div class="row">'+chipb('pkgf','alle','Alle',UI.pkgf==='alle')+chipb('pkgf','mit','Mit Ski-/Snowboardkurs',UI.pkgf==='mit')+chipb('pkgf','ohne','Ohne Kurs',UI.pkgf==='ohne')+'</div>'+
  '<div class="row">'+chipb('pkgfocus','','Jeder Schwerpunkt',!UI.pkgfocus)+Object.keys(FOCUS).map(k=>chipb('pkgfocus',k,FOCUS[k],UI.pkgfocus===k)).join('')+'</div>'+
  (list.length?'<div class="grid wide">'+list.map(x=>{const p=x.p,pl=PLACES[p.place],st=STAYS.find(s=>s.id===p.stay),active=t.packageId===p.id;
   return '<div class="card'+(active?' sel':'')+'"><div class="between"><span class="eyebrow">'+esc(pl.name)+'</span><span class="badge'+(p.kurs?' plus':' ok')+'">'+(p.kurs?'mit Kurs':'ohne Kurs')+'</span></div><h3>'+esc(p.name)+'</h3><p class="small">'+esc(p.pitch)+'</p>'+
   '<p class="small muted">'+esc(st.name)+' · '+p.items.length+' Programmpunkte</p><div class="badges">'+p.focus.map(f=>'<span class="badge">'+FOCUS[f]+'</span>').join('')+'</div>'+
   '<div class="foot"><span class="price num" style="color:'+(b&&x.tot>b?'var(--bad)':'var(--ok)')+'">'+eur(x.tot)+'</span>'+
   (active?'<span class="badge ok">übernommen</span>':(UI.confirm==='pkg-'+p.id?'<button type="button" class="btn sm" data-act="pkg-apply" data-val="'+p.id+'">Ja, ersetzen</button><button type="button" class="btn ghost sm" data-act="pkg-cancel">Nein</button>':'<button type="button" class="btn sm" data-act="pkg-ask" data-val="'+p.id+'">Übernehmen</button>'))+
   '<button type="button" class="btn ghost sm" data-act="pkg-view" data-val="'+p.id+'">Ablauf</button></div></div>'}).join('')+'</div>':'<div class="empty">Kein Angebot passt zu diesen Filtern.</div>')+'</section>';
}
function stayCard(t,s){
  const sel=t.stayId===s.id, N=nightsOf(t);
  const perks=[s.card===true?'<span class="badge plus">Gästekarte</span>':s.card==='?'?'<span class="badge est">Gästekarte erfragen</span>':'',s.sauna?'<span class="badge ok">Sauna</span>':'',s.kitchen?'<span class="badge">Küche</span>':'',s.breakfast?'<span class="badge">Frühstück</span>':''].join('');
  const sn=stayNight(t,s),pn=sn.pn;
  return '<div class="card'+(sel?' sel':'')+'"><span class="eyebrow">'+esc(s.ort||'')+'</span><h3>'+esc(s.name)+'</h3><p class="small">'+esc(s.info||'')+'</p><div class="badges">'+perks+'</div>'+
  (s.gone?'<p class="small" style="color:var(--bad)"><b>! Inserat am '+esc(fmtLong(pd(s.gone)))+' nicht mehr auffindbar</b></p>':'')+'<p class="small muted">'+esc(s.custom?(s.ab||'eigener Eintrag'):sn.txt)+'</p><div class="between"><span class="price num">'+eur(pn*N)+'</span><span class="small muted">'+N+' Nächte · '+(sn.sample?'laut Abfrage':'Planwert')+'</span></div>'+
  '<div class="foot">'+(sel?'<span class="badge ok">ausgewählt</span>':'<button type="button" class="btn sm" data-act="stay" data-val="'+esc(s.id)+'">Auswählen</button>')+(s.url&&!s.gone?lk(s.url,'Inserat'):'')+(s.map?lk(mp(s.map),'Karte'):'')+(s.custom?'<button type="button" class="btn ghost sm" data-act="stay-del" data-val="'+esc(s.id)+'">Entfernen</button>':'')+'</div></div>';
}
function inquiry(t){
  const st=stayOf(t), pl=placeOf(t), a=pd(t.start), b=pd(t.end);
  const when=t.dateMode==='fix'&&a&&b?'vom '+fmtLong(a)+' bis '+fmtLong(b)+' ('+nightsOf(t)+' Nächte)':'für '+nightsOf(t)+' Nächte im Zeitraum '+rangeText(t);
  return 'Hallo,\n\nwir sind '+t.persons+' Erwachsene und interessieren uns für '+(st?st.name:'Ihre Unterkunft')+' '+when+'.\n\n'+
   '• Ist die Unterkunft in diesem Zeitraum frei?\n• Was kostet der Aufenthalt insgesamt, inklusive Endreinigung und Kurtaxe?\n'+
   (pl&&pl.card?'• Ist die Gästekarte '+pl.card+' inklusive?\n':'')+'• Gibt es eine Sauna, und ist die Küche komplett ausgestattet?\n• Ab wann ist die Anreise am ersten Tag möglich?\n\nVielen Dank und viele Grüße';
}
function tUnterkunft(t){
  const pl=placeOf(t), st=stayOf(t);
  let html='';
  if(t.catalog==='allgaeu'){
    html+='<section class="block"><h2>1 · Ort wählen</h2><div class="grid">'+Object.keys(PLACES).map(k=>{const p=PLACES[k],sel=t.place===k;return '<div class="card'+(sel?' sel':'')+'"><span class="eyebrow">'+esc(p.region)+' · '+esc(p.time)+'</span><h3>'+esc(p.name)+'</h3><p class="small">'+esc(p.short)+'</p><ul class="plain small">'+p.pros.map(x=>'<li>'+esc(x)+'</li>').join('')+p.cons.map(x=>'<li class="muted">'+esc(x)+'</li>').join('')+'</ul><div class="foot">'+(sel?'<span class="badge ok">gewählt</span>':'<button type="button" class="btn sm" data-act="place" data-val="'+k+'">Diesen Ort wählen</button>')+(t.origin?lk(route(t.origin,p.map),'Route'):'<span class="small muted">Startort für eine Route eintragen</span>')+'</div></div>'}).join('')+'</div>'+
    (UI.confirm==='place'?'<div class="note"><b>Ort wechseln?</b><p>Unternehmungen vom alten Ort werden aus dem Tagesplan entfernt.</p><div class="row"><button type="button" class="btn sm" data-act="place-yes">Ja, wechseln</button><button type="button" class="btn ghost sm" data-act="place-no">Abbrechen</button></div></div>':'')+'</section>';
  } else {
    html+='<section class="block"><h2>Ziel</h2><div class="form"><label class="fld"><span>Ort / Stadt</span><input type="text" data-f="dest" value="'+esc(t.dest)+'" placeholder="z. B. Wien"></label>'+(t.travel==='auto'?'<label class="fld"><span>Entfernung einfach (km)'+(t.kmSrc==='schaetzung'?' · geschätzt':'')+'</span><input type="number" min="0" data-f="km" value="'+esc(t.km)+'"></label>':'')+'</div>'+(t.kmSrc==='schaetzung'?'<p class="small muted">Aus dem Umkreis-Katalog geschätzt (Luftlinie × 1,3). Mit „Strecke berechnen“ prüfen oder selbst eintragen.</p>':'')+routeBlock(t)+(t.dest?'<div class="row">'+lk(route(t.origin,t.dest),'Route')+lk(mp(t.dest),'Karte')+'</div>':'')+'</section>';
  }
  let stays=(t.catalog==='allgaeu'&&pl?STAYS.filter(s=>s.place===t.place):[]).concat(t.customStays||[]);
  const f=UI.sflt; if(f.sauna)stays=stays.filter(s=>s.sauna);if(f.card)stays=stays.filter(s=>s.card===true);if(f.kitchen)stays=stays.filter(s=>s.kitchen);
  stays.sort((a,b)=>num(a.plan!=null?a.plan:a.priceNight,0)-num(b.plan!=null?b.plan:b.priceNight,0));
  html+='<section class="block"><h2>'+(t.catalog==='allgaeu'?'2 · ':'')+'Unterkunft</h2>'+
   (t.catalog==='allgaeu'&&!pl?'<p class="muted">Erst einen Ort wählen.</p>':'<p class="lead muted small">Wo vorhanden, stammen die Preise aus Portalabfragen vom '+fmtLong(pd(PRICE_CHECKED))+' (2 Erwachsene, Vergleichszeitraum derselben Saison). Sonst stehen Planwerte, geschätzt für den Jahreswechsel'+(holidayStay(t)===true?'':', die für eure Daten deutlich abweichen können')+'. Preise ändern sich; sobald ihr ein Angebot habt, tragt den echten Preis unten ein.</p><div class="row">'+chipb('sflt','sauna','Mit Sauna',f.sauna)+chipb('sflt','card','Gästekarte sicher',f.card)+chipb('sflt','kitchen','Mit Küche',f.kitchen)+'</div>'+
   (stays.length?'<div class="grid">'+stays.map(s=>stayCard(t,s)).join('')+'</div>':'<div class="empty">Keine Unterkunft passt zu den Filtern.</div>')+
   (pl?'<div class="row">'+pl.portal.map(x=>lk(x[1],x[0])).join('')+'</div>':''))+
   '<details class="panel"><summary><b>+ Eigene Unterkunft eintragen</b></summary><div class="form" id="cs-form"><label class="fld"><span>Name</span><input type="text" id="cs-name"></label><label class="fld"><span>Ort</span><input type="text" id="cs-ort"></label><label class="fld"><span>Preis pro Nacht (€)</span><input type="number" min="0" id="cs-price"></label><label class="fld"><span>Link</span><input type="url" id="cs-url" placeholder="https://"></label></div><div class="row"><label class="small"><input type="checkbox" id="cs-sauna"> Sauna</label><label class="small"><input type="checkbox" id="cs-kitchen" checked> Küche</label><label class="small"><input type="checkbox" id="cs-bf"> Frühstück</label><label class="small"><input type="checkbox" id="cs-card"> Gästekarte</label></div><button type="button" class="btn sm" data-act="stay-add">Hinzufügen</button></details></section>';
  if(st) html+='<section class="block"><h2>3 · Anfragen & Angebot</h2><div class="panel"><div class="form"><label class="fld"><span>Angebotspreis gesamt (€), sobald bekannt</span><input type="number" min="0" data-f="stayQuote" value="'+esc(t.stayQuote||'')+'" placeholder="leer = Planwert"></label></div>'+
   '<label class="small"><input type="checkbox" data-act="card-confirm"'+(t.cardConfirmed?' checked':'')+'> Gästekarte und Leistungen für diesen Aufenthalt beim Anbieter bestätigt</label><span class="eyebrow">Anfrage-Text zum Kopieren</span><div class="copybox" id="inq">'+esc(inquiry(t))+'</div><div class="row"><button type="button" class="btn sm" data-act="copy">Text kopieren</button>'+(st.url?lk(st.url,'Zum Inserat'):'')+'</div></div></section>';
  return html;
}
function actCost(t,a){
  const P=Math.max(1,Math.round(num(t.persons,2))), st=stayOf(t), pl=placeOf(t);
  if(a.kurs&&pl) return {txt:pl.kurs[1]+' € p. P. (1 Tag) · 2 Tage '+pl.kurs[2]+' €',free:false,n:num(pl.kurs[1],0)*P};
  if(a.custom){const c=num(a.cost,0);if(!c&&a.costOpen)return {txt:'Preis offen, vor Ort prüfen',free:false,open:true,n:null};return {txt:c?eur(c)+(a.per==='pp'?' p. P.':' gesamt'):'kostenlos',free:!c,n:a.per==='pp'?c*P:c}}
  let pp=a.pp||0;if(a.cardPp!=null&&st&&t.cardConfirmed===true)pp=a.cardPp;if(a.ppKurs!=null&&(t.items||[]).some(it=>actOf(t,it.act)&&actOf(t,it.act).kurs))pp=a.ppKurs;
  const c=pp*P+(a.grp||0);
  if(a.pass){const passTxt=pl&&pl.cardPass&&st&&t.cardConfirmed===true?'Skipass inkl.':pl&&pl.passTable?'Skipass '+pl.passTable[1]+' € p. P.':'';return {txt:'Verleih + '+passTxt,free:false,n:null}}
  return {txt:c?eur(c)+' für '+P+(a.top&&st&&t.cardConfirmed===true&&pp===0?' (an Tagen ohne Skipass)':''):'kostenlos'+(a.cardPp===0&&st&&t.cardConfirmed===true?' mit Gästekarte':''),free:!c,n:c};
}
/* Eigene Ideen nutzen dieselben optionalen Felder wie der Katalog; leer ist nicht kostenlos. */
function customActFromForm(f,id){
  const title=String(f.title||'').trim(),price=String(f.cost==null?'':f.cost).trim(),duration=String(f.hours==null?'':f.hours).trim();
  if(!title||title.length>80)throw new Error('Bitte einen Titel mit höchstens 80 Zeichen eintragen.');
  if(!Object.hasOwn(CAT,f.cat))throw new Error('Bitte eine gültige Kategorie wählen.');
  if(!['pp','grp'].includes(f.per))throw new Error('Bitte eine gültige Preisbasis wählen.');
  if(price!==''&&(!Number.isFinite(Number(price))||Number(price)<0||Number(price)>1e9))throw new Error('Bitte einen gültigen, nicht negativen Preis eintragen.');
  if(price!==''&&Number(price)===0&&!f.free)throw new Error('Bei bestätigtem Gratis-Angebot bitte „Ist kostenlos“ wählen. Sonst den Preis offen lassen.');
  if(f.free&&price!==''&&Number(price)>0)throw new Error('Preis und „Ist kostenlos“ widersprechen sich. Bitte eines davon wählen.');
  if(duration!==''&&(!Number.isFinite(Number(duration))||Number(duration)<=0||Number(duration)>24))throw new Error('Dauer muss über 0 und höchstens 24 Stunden sein; unbekannte Dauer leer lassen.');
  const link=String(f.link||'').trim();
  if(link&&!/^https?:\/\//i.test(link))throw new Error('Link muss mit https:// oder http:// beginnen.');
  const bring=String(f.bring||'').split('\n').map(x=>x.trim()).filter(Boolean);
  if(bring.length>10||bring.some(x=>x.length>80))throw new Error('Höchstens 10 Packhinweise mit je 80 Zeichen eintragen, einen pro Zeile.');
  const a={id,custom:true,t:title,cat:f.cat,cost:f.free?0:price===''?0:Number(price),costOpen:!f.free&&price==='',per:f.per,dur:duration?'ca. '+String(Number(duration)).replace('.',',')+' Std.':'',indoor:!!f.indoor,bring:Array.from(new Set(bring)),link,note:String(f.note||'').trim(),slot:'nachm'};
  if(duration!=='')a.hours=Number(duration);
  return a;
}
function activityCommitted(t,id){
  const e=(t.ledger||{})['act:'+id];
  return !!(t.check&&t.check['b-'+id]||e&&(e.status==='gebucht'||e.status==='angefragt'||num(e.paid,0)>0||e.due));
}
function activityChangePreview(t,id,form,remove=false){
  const old=(t.customActs||[]).find(a=>a.id===id);
  if(!old)throw new Error('Diese eigene Unternehmung existiert nicht mehr.');
  if(old.transit)throw new Error('Weiterfahrt gehört zur Rundreise und kann hier nicht geändert werden.');
  const candidate=clone(t),index=candidate.customActs.findIndex(a=>a.id===id);
  if(remove){
    if(activityCommitted(t,id))throw new Error('Nicht gelöscht: Buchung, Anfrage, Zahlung oder Fälligkeit vorhanden. Zuerst Verpflichtung im Zahlungsbuch klären.');
    candidate.customActs.splice(index,1);candidate.items=(candidate.items||[]).filter(i=>i.act!==id);
  }else{
    const legacyZero=old.hours===0&&String(form.hours)==='0';
    const fresh=customActFromForm(legacyZero?Object.assign({},form,{hours:''}):form,id),next=Object.assign({},old,fresh);
    if(legacyZero){fresh.hours=0;next.hours=0;next.dur=old.dur||'';}
    if(fresh.hours==null){delete next.hours;if(old.hours==null)next.dur=old.dur||'';}
    const fixed=['t','cat','cost','costOpen','per','hours','dur'];
    if(activityCommitted(t,id)&&fixed.some(k=>JSON.stringify(old[k]??(k==='costOpen'?false:null))!==JSON.stringify(next[k]??(k==='costOpen'?false:null))))throw new Error('Titel, Kategorie, Preis und Dauer sind bei einer Verpflichtung geschützt. Notiz, Link, Indoor und Packhinweise können ergänzt werden.');
    candidate.customActs[index]=next;
  }
  return {trip:t.id,id,remove,source:JSON.stringify(t),candidate,before:cost(t).total,after:cost(candidate).total,count:(t.items||[]).filter(i=>i.act===id).length};
}
function applyActivityChange(t,draft){
  if(!draft||draft.trip!==t.id||draft.source!==JSON.stringify(t))throw new Error('Die Reise hat sich geändert. Bitte Änderung erneut öffnen.');
  const issues=commitmentIssues(t,draft.candidate);if(issues.length)throw new Error(issues.join(' · '));
  Object.assign(t,clone(draft.candidate));return t;
}
function sheetActivityEdit(t,id){
  const a=(t.customActs||[]).find(x=>x.id===id);if(!a||a.transit)return;
  UI.activityEditSource=JSON.stringify(t);
  openSheet('<h2>Unternehmung bearbeiten</h2><p class="small muted">Die Idee behält ihre ID und ihre Plätze im Tagesplan. Erst die Vorschau übernehmen speichert Änderungen.</p>'+(activityCommitted(t,id)?'<div class="note">Buchung oder Zahlung vorhanden: Titel, Kategorie, Preis und Dauer sind geschützt. Weitere Hinweise lassen sich ergänzen.</div>':'')+
   '<div class="form"><label class="fld"><span>Titel</span><input id="ae-title" type="text" maxlength="80" value="'+esc(a.t)+'"></label><label class="fld"><span>Kategorie</span><select id="ae-cat">'+Object.keys(CAT).map(k=>'<option value="'+k+'"'+(a.cat===k?' selected':'')+'>'+esc(CAT[k])+'</option>').join('')+'</select></label><label class="fld"><span>Preis (€), leer = offen</span><input id="ae-cost" type="number" min="0" step="0.01" value="'+(a.costOpen||!num(a.cost,0)?'':num(a.cost,0))+'"></label><label class="fld"><span>Preisbasis</span><select id="ae-per"><option value="pp"'+(a.per!=='grp'?' selected':'')+'>pro Person</option><option value="grp"'+(a.per==='grp'?' selected':'')+'>gesamt</option></select></label><label class="fld"><span>Dauer in Stunden (optional)</span><input id="ae-hours" type="number" min="0" max="24" step="any" value="'+(a.hours==null?'':a.hours)+'"></label><label class="fld"><span>Link</span><input id="ae-link" type="url" value="'+esc(a.link||'')+'"></label></div>'+
   '<div class="row"><label><input type="checkbox" id="ae-free"'+(!a.costOpen&&!num(a.cost,0)?' checked':'')+'> Ist kostenlos</label><label><input type="checkbox" id="ae-indoor"'+(a.indoor?' checked':'')+'> Drinnen</label></div>'+
   '<label class="fld"><span>Packhinweise, ein Hinweis pro Zeile</span><textarea id="ae-bring" style="min-height:90px">'+esc((a.bring||[]).join('\n'))+'</textarea></label><label class="fld"><span>Notiz</span><textarea id="ae-note" style="min-height:90px">'+esc(a.note||'')+'</textarea></label><button type="button" class="btn" data-act="act-edit-preview" data-val="'+esc(id)+'">Änderung prüfen</button>');
}
function sheetActivityPreview(t,draft){
  const before=(t.customActs||[]).find(a=>a.id===draft.id),after=(draft.candidate.customActs||[]).find(a=>a.id===draft.id);
  openSheet('<h2>'+ (draft.remove?'Unternehmung löschen?':'Änderung prüfen')+'</h2><p><b>'+esc(before.t)+'</b></p>'+(draft.remove?'<p>Die Idee und '+draft.count+' eingeplante(r) Termin(e) werden entfernt. Angaben im Zahlungsbuch werden nicht gelöscht.</p>':'<dl class="facts"><dt>Titel danach</dt><dd>'+esc(after.t)+'</dd><dt>Preis vorher</dt><dd>'+esc(actCost(t,before).txt)+'</dd><dt>Preis danach</dt><dd>'+esc(actCost(draft.candidate,after).txt)+'</dd><dt>Dauer danach</dt><dd>'+esc(after.dur||'unbekannt')+'</dd></dl><p class="small">Termine und Aktivitäts-ID bleiben erhalten. Prüft Öffnung und tatsächliche Dauer beim Anbieter.</p>')+
   '<dl class="facts"><dt>Plan vorher</dt><dd>'+eur(draft.before)+'</dd><dt>Plan danach</dt><dd>'+eur(draft.after)+'</dd></dl><p class="small muted">Planwerte; offene Preise sind nicht enthalten. Keine Stornierung oder Erstattung wird ausgelöst.</p><div class="row"><button type="button" class="btn'+(draft.remove?' warn':'')+'" data-act="act-change-confirm">'+(draft.remove?'Ja, Idee und Termine löschen':'Änderung übernehmen')+'</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div>');UI.activityDraft=draft;
}
/* Fahrplan bis zur Abreise (Claude, #8, Plan D1): nur aus vorhandenen Daten abgeleitet, keine erfundenen Fristen.
   Datiert: Zahlungsfälligkeiten (offen), Gültigkeit des gewählten, nicht gebuchten Angebots, Packtag, Winter-Hinweis, Abfahrt.
   Ohne Datum: offene Buchungsaufgaben aus der Checkliste. */
function departurePlan(t,now){
  const a=pd(t.start);if(t.dateMode!=='fix'||!a)return null;
  const today=todayUTC(now),todayIso=iso(today),startIso=iso(a),out=[],undated=[];
  const add=(date,kind,label,detail,go)=>{if(!date)return;out.push({date,kind,label,detail:detail||'',go:go||'',overdue:date<todayIso,days:Math.round((pd(date)-today)/864e5)})};
  const f=financeSummary(t);
  f.due.forEach(d=>add(d.due,'zahlung','Zahlung fällig: '+d.label,eur(d.open)+' offen','kosten'));
  const o=activeOffer(t);
  if(o&&!o.booked&&o.validUntil&&pd(o.validUntil))add(o.validUntil,'angebot','Angebot gilt bis: '+o.name,'Danach Preis und Verfügbarkeit neu prüfen','angebote');
  const g=checklist(t),chk=t.check||{};
  let packAll=0,packOpen=0;g.forEach(x=>{if(/^Packliste/.test(x[0]))x[1].forEach(i=>{packAll++;if(!chk[i[0]])packOpen++})});
  const pack=new Date(a.getTime()-864e5);
  if(packAll&&iso(pack)>=todayIso)add(iso(pack),'packen','Packen',packOpen?packOpen+' von '+packAll+' Punkten offen · Ausweise und Versicherungskarten bereitlegen':'Packliste vollständig abgehakt','check');
  if(t.type==='winter'&&t.travel==='auto'){const w=new Date(a.getTime()-7*864e5);if(iso(w)>=todayIso)add(iso(w),'auto','Auto winterfest?','Winterreifen, Schneeketten, Frostschutz prüfen')}
  if(v3Transport(t))[].concat(v3Transport(t).out||[],v3Transport(t).back||[]).forEach(sg=>{const ci=sg.checkin&&sg.checkin.opens;if(ci&&ci.date&&ci.date>=todayIso)add(ci.date,'checkin','Online-Check-in'+(sg.number?' '+sg.number:'')+(ci.time?' ab '+ci.time+(ci.tz?' ('+ci.tz+')':''):''),sg.checkin.note||'Frist laut Airline','unterkunft')});
  add(startIso,'abfahrt','Abfahrt'+(t.departTime?' um '+t.departTime:''),t.origin?'ab '+t.origin:'');
  (g[0]?g[0][1]:[]).forEach(i=>{if(!chk[i[0]])undated.push({label:i[1],detail:i[2]||'',go:'check'})});
  out.sort((x,y)=>x.date.localeCompare(y.date)||(x.kind==='abfahrt')-(y.kind==='abfahrt'));
  return {items:out,undated,daysLeft:Math.round((a-today)/864e5)};
}
function departureBlock(t,now){
  const ph=tripPhase(t,now);if(!ph||ph.phase!=='vor')return '';
  const p=departurePlan(t,now);if(!p)return '';
  const when=x=>x.overdue?'<b style="color:var(--bad)">! überfällig seit '+esc(fmtLong(pd(x.date)))+'</b>':x.days===0?'<b>heute</b>':x.days===1?'morgen':'in '+x.days+' Tagen · '+esc(fmtLong(pd(x.date)));
  const row=x=>'<li class="dp-'+x.kind+'"><span class="eyebrow">'+when(x)+'</span><br><b>'+esc(x.label)+'</b>'+(x.detail?' <small class="muted">· '+esc(x.detail)+'</small>':'')+(x.go?' <button type="button" class="lnk" data-go="r-'+t.id+'-'+x.go+'">Ansehen</button>':'')+'</li>';
  return '<section class="block" data-departure><details class="panel"'+(p.items.some(x=>x.overdue||x.days<=7&&x.kind!=='abfahrt')?' open':'')+'><summary><b>Fahrplan bis zur Abreise</b> <small class="muted">noch '+p.daysLeft+(p.daysLeft===1?' Tag':' Tage')+' · '+p.items.filter(x=>x.kind!=='abfahrt').length+' Termine'+(p.undated.length?' · '+p.undated.length+' offene Buchungen':'')+'</small></summary>'+
   '<ol class="plain timeline">'+p.items.map(row).join('')+'</ol>'+
   (p.undated.length?'<h3>Noch zu buchen (ohne Frist)</h3><ul class="plain">'+p.undated.map(x=>'<li>'+esc(x.label)+(x.detail?' <small class="muted">· '+esc(x.detail)+'</small>':'')+'</li>').join('')+'</ul>':'')+
   '<p class="small muted">Nur Fristen, die ihr eingetragen habt, plus Packtag und Abfahrt. Stornofristen und Zahlungsziele aus Buchungsbestätigungen bitte unter „Buchungen & Zahlungen“ als Fälligkeit eintragen. Im Kalenderexport der Mappe erscheinen Zahlungen und Packtag mit Erinnerung.</p></details></section>';
}
/* Programmkosten je Tag (Claude, #8): Unternehmungen direkt, Kurs/Skipass/Verleih anteilig über ihre Tage, gebuchte Beträge
   im Verhältnis der Planwerte verteilt. Unterkunft, Essen, Anreise und Puffer sind nicht tagesbezogen und fehlen bewusst. */
function dayCosts(t){
  const c=cost(t),n=daysOf(t).length,out=Array.from({length:n},(_,i)=>({day:i,direct:0,shared:0,total:0,open:0}));
  const put=(d,v,shared)=>{if(d==null||d<0||d>=n||!v)return;out[d][shared?'shared':'direct']+=v};
  c.lines.forEach(l=>{
    if(l.split&&l.split.length){l.split.forEach(x=>put(x.day,l.c*x.share,l.split.length>1));return}
    if(l.day!=null){put(l.day,l.c,false);return}
    if(l.days&&l.days.length)l.days.forEach(d=>put(d,l.c/l.days.length,true));
  });
  (t.items||[]).forEach(it=>{const a=actOf(t,it.act);if(a&&a.custom&&a.costOpen&&!num(a.cost,0)&&out[it.day])out[it.day].open++});
  out.forEach(x=>{x.direct=Math.round(x.direct*100)/100;x.shared=Math.round(x.shared*100)/100;x.total=Math.round((x.direct+x.shared)*100)/100});
  return out;
}
function freeSlots(t,day){const used=new Set((t.items||[]).filter(i=>i.day===day).map(i=>i.slot));return SLOTS.filter(([k])=>!used.has(k)).map(([k,l])=>l)}
/* Unternehmungen filtern, suchen und sortieren (Claude, #8). Reine Ableitung, Eingaben sind flüchtige UI-Felder. */
function activityList(t,f){
  f=f||{};let list=actsFor(t).slice();
  const gaps=activityGaps(t),cnt={};(t.items||[]).forEach(i=>cnt[i.act]=(cnt[i.act]||0)+1);
  if(f.cat&&f.cat!=='alle')list=list.filter(a=>(a.cat||'eigen')===f.cat);
  if(f.free)list=list.filter(a=>actCost(t,a).free);
  if(f.indoor)list=list.filter(a=>a.indoor);
  if(f.card)list=list.filter(a=>a.cardPp!=null||a.src==='plus');
  if(f.missing==='price'){const ids=new Set(gaps.filter(x=>x.price).map(x=>x.act.id));list=list.filter(a=>ids.has(a.id))}
  if(f.missing==='duration'){const ids=new Set(gaps.filter(x=>x.duration).map(x=>x.act.id));list=list.filter(a=>ids.has(a.id))}
  if(f.planned==='offen')list=list.filter(a=>!cnt[a.id]);
  if(f.planned==='geplant')list=list.filter(a=>cnt[a.id]);
  const q=shelfText(f.q).trim();
  if(q){const words=q.split(/\s+/);list=list.filter(a=>{const h=shelfText([a.t,a.s,a.note,a.ort,CAT[a.cat||'eigen']].filter(Boolean).join(' '));return words.every(w=>h.includes(w))})}
  const nm=a=>shelfText(a.t);
  if(f.sort==='preis'){const pr=a=>{const n=actCost(t,a).n;return n==null||!Number.isFinite(n)?Infinity:n};list=list.map((a,i)=>[a,i]).sort((x,y)=>pr(x[0])-pr(y[0])||x[1]-y[1]).map(x=>x[0])}
  if(f.sort==='dauer'){const du=a=>{const h=actHours(a);return h>0?h:Infinity};list=list.map((a,i)=>[a,i]).sort((x,y)=>du(x[0])-du(y[0])||x[1]-y[1]).map(x=>x[0])}
  if(f.sort==='name')list.sort((x,y)=>nm(x).localeCompare(nm(y),'de'));
  return list;
}
function tUnternehmen(t){
  if(t.catalog==='allgaeu'&&!t.place) return '<section class="block"><div class="empty"><b>Erst einen Ort wählen</b><button type="button" class="btn" data-go="r-'+t.id+'-unterkunft">Ort wählen</button></div></section>';
  const all=actsFor(t),gaps=activityGaps(t),priceIds=new Set(gaps.filter(x=>x.price).map(x=>x.act.id)),durationIds=new Set(gaps.filter(x=>x.duration).map(x=>x.act.id));
  const cnt={};(t.items||[]).forEach(i=>cnt[i.act]=(cnt[i.act]||0)+1);
  const list=activityList(t,{cat:UI.fcat,free:UI.ffree,indoor:UI.findoor,card:UI.fcard,missing:UI.fmissing,q:UI.aq,planned:UI.aplanned,sort:UI.asort});
  const nPlanned=all.filter(a=>cnt[a.id]).length;
  const cats=['alle'].concat(Object.keys(CAT));
  return '<section class="block"><h2>Unternehmungen</h2><p class="lead muted small">Antippen für Ablauf, Kosten und Links. „Einplanen“ legt sie in den Tagesplan.</p>'+(t.destGeo?'<div class="row"><button type="button" class="btn ghost sm" data-act="cat-trip-ideas">Mehr Ideen aus dem Katalog rund ums Ziel</button></div>':'')+
  '<div class="row">'+cats.map(c=>chipb('fcat',c,c==='alle'?'Alle':CAT[c],UI.fcat===c)).join('')+'</div>'+
  '<div class="row">'+chipb('ffree','1','Kostenlos',UI.ffree)+chipb('findoor','1','Bei Schlechtwetter',UI.findoor)+(t.catalog==='allgaeu'?chipb('fcard','1','Mit Gästekarte',UI.fcard):'')+'</div>'+
  '<div class="row">'+chipb('fmissing','price','Preis offen ('+priceIds.size+')',UI.fmissing==='price')+chipb('fmissing','duration','Dauer fehlt ('+durationIds.size+')',UI.fmissing==='duration')+'<button type="button" class="lnk" data-act="activity-filters-reset">Filter zurücksetzen</button></div>'+
  '<form id="act-search" class="row" role="search"><label class="fld" style="flex:1 1 12em"><span>Suchen</span><input type="search" id="act-q" maxlength="80" value="'+esc(UI.aq||'')+'" placeholder="Titel, Ort, Beschreibung"></label><button type="submit" class="btn ghost sm">Suchen</button>'+
  '<label class="fld"><span>Sortierung</span><select id="act-sort">'+[['','Vorschlag'],['preis','Preis aufsteigend'],['dauer','Dauer kurz zuerst'],['name','Name A–Z']].map(o=>'<option value="'+o[0]+'"'+((UI.asort||'')===o[0]?' selected':'')+'>'+o[1]+'</option>').join('')+'</select></label></form>'+
  '<div class="row">'+chipb('aplanned','offen','Noch nicht eingeplant ('+(all.length-nPlanned)+')',UI.aplanned==='offen')+chipb('aplanned','geplant','Eingeplant ('+nPlanned+')',UI.aplanned==='geplant')+'</div><p class="small muted" role="status">'+list.length+' von '+all.length+' Ideen sichtbar. Die Filter ändern eure Planung nicht.</p>'+
  (list.length?'<div class="grid">'+list.map(a=>{const c=actCost(t,a);return '<div class="card" style="border-top:4px solid '+CATCOL[a.cat||'eigen']+'"><span class="eyebrow">'+esc(CAT[a.cat||'eigen'])+(a.ort?' · '+esc(a.ort):'')+'</span><h3>'+esc(a.t)+'</h3><p class="small">'+esc(a.s||a.note||'')+'</p>'+
    '<div class="badges">'+(a.dur?'<span class="badge">'+esc(a.dur)+'</span>':'')+(a.indoor?'<span class="badge">drinnen</span>':'')+(a.book?'<span class="badge">buchen</span>':'')+(a.warn?'<span class="badge bad">Hinweis</span>':'')+(a.custom?'':srcBadge(a.src))+(cnt[a.id]?'<span class="badge ok">'+cnt[a.id]+'× eingeplant</span>':'')+'</div>'+
    '<p class="small"><b>'+esc(c.txt)+'</b></p><div class="foot"><button type="button" class="btn sm" data-act="plan-act" data-val="'+esc(a.id)+'">+ Einplanen</button><button type="button" class="btn ghost sm" data-act="act-view" data-val="'+esc(a.id)+'">Details</button></div></div>'}).join('')+'</div>':'<div class="empty">Nichts passt zu den Filtern.</div>')+
  '<details class="panel"><summary><b>+ Eigene Unternehmung anlegen</b></summary><div class="form"><label class="fld"><span>Titel</span><input type="text" id="ca-t" maxlength="80"></label><label class="fld"><span>Kategorie</span><select id="ca-cat">'+Object.keys(CAT).map(k=>'<option value="'+k+'"'+(k==='eigen'?' selected':'')+'>'+CAT[k]+'</option>').join('')+'</select></label><label class="fld"><span>Preis (€), wenn bekannt</span><input type="number" min="0" step="0.01" id="ca-cost" placeholder="leer = Preis offen"></label><label class="fld"><span>Kosten gelten</span><select id="ca-per"><option value="pp">pro Person</option><option value="grp">gesamt</option></select></label><label class="fld"><span>Dauer in Stunden</span><input type="number" min="0.25" max="24" step="0.25" id="ca-hours" placeholder="z. B. 1,5; leer = unbekannt"></label><label class="fld"><span>Link</span><input type="url" id="ca-link" placeholder="https://"></label></div><div class="row"><label><input type="checkbox" id="ca-free"> Ist ausdrücklich kostenlos</label><label><input type="checkbox" id="ca-indoor"> Drinnen / bei Regen geeignet</label></div><p class="small muted">Ein leerer Preis bleibt offen. Dauer und Packhinweise ergänzen Tagesauslastung und Packliste; Öffnung und Eignung bitte selbst prüfen.</p><label class="fld"><span>Mitnehmen – ein Hinweis pro Zeile (max. 10)</span><textarea id="ca-bring" placeholder="z. B. Badesachen&#10;Handtuch" style="min-height:90px"></textarea></label><label class="fld"><span>Notiz</span><input type="text" id="ca-note"></label><button type="button" class="btn sm" data-act="act-add">Anlegen</button></details></section>';
}
function planDayPicker(t){const days=viewDays(t);UI.planDay=Math.max(0,Math.min(days.length-1,Number.isInteger(UI.planDay)?UI.planDay:0));return '<label class="plan-day-picker noprint"><span>Reisetag</span><select id="plan-day" aria-label="Reisetag wählen">'+days.map(d=>'<option value="'+d.i+'"'+(UI.planDay===d.i?' selected':'')+'>'+esc(d.label)+'</option>').join('')+'</select></label>'}
function tPlan(t){
  const days=viewDays(t), lastDay=daysOf(t).length-1, st=stayOf(t), pl=placeOf(t), warnIds=new Set();
  const items=sortedItems(t);
  const isWarn=(it,a,d)=>{if(!d)return true;if(a.onlyDate&&d.md&&d.md!==a.onlyDate)return true;if(a.dow&&d.date&&!a.dow.includes(d.date.getUTCDay()))return true;if((a.rules||[]).some(r=>d.md===r.date&&r.bad.includes(it.slot)))return true;if(a.kitchen&&st&&!st.kitchen)return true;if(a.needSauna&&st&&!st.sauna)return true;return false};
  const special=d=>d.md==='12-31'?'Silvester':d.md==='01-01'?'Neujahr':d.md==='12-24'?'Heiligabend':'';
  const dcost=dayCosts(t),load=dayLoad(t),gaps={};transferGaps(t).forEach(g=>{gaps[g.to.it.uid]=g});
  if(!window.RP_CATALOG&&CATX&&(t.customActs||[]).some(a=>a.catalogSpot&&!a.geo)&&(t.items||[]).some(i=>i.time))catLoadLocal().then(()=>{if(cur()&&cur().id===t.id&&UI.tab==='plan')render()}).catch(()=>{});
  return '<section class="block"><div class="between"><h2>Tagesplan</h2><div class="row">'+(UI.confirm==='clear'?'<span class="small">Plan leeren?</span><button type="button" class="btn warn sm" data-act="clear-yes">Ja</button><button type="button" class="btn ghost sm" data-act="clear-no">Nein</button>':'<button type="button" class="btn ghost sm" data-act="clear">Plan leeren</button>')+(t.destGeo&&CATX?'<button type="button" class="btn ghost sm" data-act="plan-fill">Lücken füllen</button>':'')+'</div></div>'+
  '<p class="lead muted small">Wischen für weitere Tage. Antippen eines Punktes zum Verschieben oder Entfernen, „+“ zum Hinzufügen. Gelb umrandet = Konflikt.</p>'+
  longTripNote(t,'Der Tagesplan')+planDayPicker(t)+'<div class="board">'+days.map(d=>{const sp=special(d);
    const L=load[d.i],ru=dayRouteUrl(t,d.i);
    return '<div class="dcol'+(UI.planDay===d.i?' day-selected':'')+'" data-day="'+d.i+'"><div class="dhead"><b>'+esc(d.label)+'</b><span class="eyebrow">'+(d.i===0?'Anreise':d.i===lastDay?'Abreise':sp)+(d.i===0&&sp||d.i===lastDay&&sp?' · '+sp:'')+'</span>'+
    (()=>{const dc=dcost[d.i],fs=freeSlots(t,d.i),hrs=v=>String(v).replace('.',','),
      /* Tageskopf (Claude, #8): eine kurze Zeile mit Warnungen sichtbar, alles Weitere aufklappbar */
      short=[L.planned||L.unknown?'≈ '+hrs(L.planned)+'/'+hrs(L.cap)+' Std.':'',dc&&dc.total?'≈ '+eur(dc.total):'',fs.length===SLOTS.length?'frei':fs.length?'frei: '+fs.length+'×':''].filter(Boolean).join(' · ');
      return '<span class="dload'+(L.over?' over':'')+'">'+(L.over?'! zu voll · ':'')+(dc&&dc.open?'! '+dc.open+'× Preis offen · ':'')+(L.unknown?'! '+L.unknown+'× Dauer offen · ':'')+esc(short||'noch nichts geplant')+'</span>'+
      '<details class="dmore"><summary>Details & Werkzeuge</summary>'+
      (L.planned||L.unknown||L.drive?'<span class="small">Programm ≈ '+hrs(L.planned)+' von '+hrs(L.cap)+' Std.'+(L.drive?' · Fahrt ca. '+hrs(Math.round(L.drive/6)/10)+' Std.':'')+(L.unknown?' · '+L.unknown+'× Dauer offen':'')+'</span><br>':'')+
      '<span class="small muted dcost">'+(dc&&dc.total?'Programm ≈ '+eur(dc.total)+(dc.shared?' (davon '+eur(dc.shared)+' anteilig)':''):'Programm ohne Kosten')+(dc&&dc.open?' · '+dc.open+'× Preis offen':'')+(fs.length&&fs.length<SLOTS.length?' · frei: '+esc(fs.join(', ')):fs.length===SLOTS.length?' · ganzer Tag frei':'')+'</span>'+
      '<span class="dtools">'+(days.length>1?'<button type="button" class="lnk" data-act="day-swap-open" data-val="'+d.i+'" aria-label="'+esc(d.label)+' mit anderem Tag tauschen">⇄ Tauschen</button>':'')+(ru?lk(ru,'Tagesroute'):'')+'</span></details></div>'})()+
    SLOTS.map(([k,lab])=>{const its=items.filter(it=>it.day===d.i&&it.slot===k);
      let fixed='';
      if(d.i===0&&k==='morgen'){const arr=arrivalMin(t);fixed='<div class="item fixed">Anreise'+(pl?' · '+esc(pl.time):'')+'<small>ab '+esc(t.origin||'')+(t.departTime?' um '+esc(t.departTime):'')+(arr!=null?' · Ankunft ca. '+minTime(arr)+' (Schätzung)':'')+(t.checkinTime?' · Check-in ab '+esc(t.checkinTime):'')+'</small></div>'}
      if(d.i===lastDay&&lastDay>0&&k==='morgen') fixed='<div class="item fixed">Packen & Abreise<small>'+(pl?'zuhause ≈ 2–2,5 Std. später':'')+'</small></div>';
      return '<div class="dslot"><span class="lbl">'+lab+'</span>'+fixed+its.map(it=>{const a=actOf(t,it.act);if(!a)return '';return '<button type="button" class="item'+(isWarn(it,a,d)?' warn':'')+'" style="border-left-color:'+CATCOL[a.cat||'eigen']+'" data-act="item" data-val="'+it.uid+'">'+(it.time?'<b class="num">'+esc(it.time)+'</b> ':'')+esc(a.t)+'<small>'+esc(a.dur||'')+(a.ort?' · '+esc(a.ort):'')+(gaps[it.uid]?' · '+(gaps[it.uid].short?'! ':'')+'≈ '+gaps[it.uid].need+' Min. Weg davor':'')+'</small></button>'}).join('')+
      '<button type="button" class="add" data-act="slot-add" data-val="'+d.i+'|'+k+'" aria-label="'+esc(d.label+' '+lab)+' hinzufügen">+</button></div>'}).join('')+'</div>'}).join('')+'</div></section>'+journalSection(t,'plan');
}
function costEntryCommitted(t,id){const e=(t.ledger||{})['xc:'+id];return !!(e&&(e.status==='gebucht'||e.status==='angefragt'||num(e.paid,0)>0||e.due));}
function costEntryFromForm(f,id){
 const title=String(f.title||'').trim(),note=String(f.note||'').trim(),raw=String(f.amount==null?'':f.amount).trim(),amount=Number(raw);
 if(!title||title.length>80)throw new Error('Bezeichnung mit höchstens 80 Zeichen eintragen.');
 if(raw===''||!Number.isFinite(amount)||amount<0||amount>1e9)throw new Error('Einen gültigen Betrag zwischen 0 und 1 Milliarde Euro eintragen.');
 if(note.length>1000)throw new Error('Notiz mit höchstens 1000 Zeichen eintragen.');
 return {id,t:title,c:amount,note};
}
function costEntryPreview(t,id,form,remove=false){
 const old=(t.extraCosts||[]).find(e=>e.id===id);if(!old)throw new Error('Kostenposten nicht mehr vorhanden.');
 const c=clone(t),index=c.extraCosts.findIndex(e=>e.id===id);
 if(remove){if(costEntryCommitted(t,id))throw new Error('Nicht entfernt: Anfrage, Buchung, Zahlung oder Fälligkeit vorhanden. Zuerst Zahlungsbuch klären.');c.extraCosts.splice(index,1);}
 else{const fresh=costEntryFromForm(form,id);if(costEntryCommitted(t,id)&&(old.t!==fresh.t||num(old.c,0)!==fresh.c))throw new Error('Bezeichnung und Betrag sind durch eine Verpflichtung geschützt. Notiz kann ergänzt werden.');c.extraCosts[index]=Object.assign({},old,fresh);}
 return {trip:t.id,id,remove,source:JSON.stringify(t),candidate:c,before:cost(t).total,after:cost(c).total};
}
function applyCostEntry(t,draft){if(!draft||draft.trip!==t.id||draft.source!==JSON.stringify(t))throw new Error('Die Reise hat sich geändert. Kostenposten erneut öffnen.');adoptPlanChange(t,clone(draft.candidate));return t;}
function sheetCostEntry(t,id){
 const e=(t.extraCosts||[]).find(x=>x.id===id);if(!e)return;
 openSheet('<h2>Kostenposten bearbeiten</h2>'+(costEntryCommitted(t,id)?'<div class="note">Verpflichtung vorhanden: Bezeichnung und Betrag sind geschützt. Ergänzt bei Bedarf die Notiz.</div>':'')+'<div class="form"><label class="fld"><span>Bezeichnung</span><input type="text" id="ce-title" maxlength="80" value="'+esc(e.t)+'"></label><label class="fld"><span>Planbetrag gesamt (€)</span><input type="number" id="ce-amount" min="0" step="0.01" value="'+esc(e.c)+'"></label></div><label class="fld"><span>Notiz</span><textarea id="ce-note" maxlength="1000">'+esc(e.note||'')+'</textarea></label><p class="small muted">Gebuchte Beträge im Zahlungsbuch haben Vorrang vor dem Planbetrag. Erst Übernehmen in der Vorschau speichert.</p><button type="button" class="btn" data-act="xc-preview" data-val="'+esc(id)+'">Änderung prüfen</button>');UI.costEntrySource=JSON.stringify(t);
}
function sheetCostEntryPreview(t,draft){
 const before=(t.extraCosts||[]).find(e=>e.id===draft.id),after=(draft.candidate.extraCosts||[]).find(e=>e.id===draft.id);
 openSheet('<h2>'+ (draft.remove?'Kostenposten entfernen?':'Kostenänderung prüfen')+'</h2><p><b>'+esc(before.t)+'</b></p><dl class="facts"><dt>Posten vorher</dt><dd>'+eur(before.c)+'</dd><dt>Posten danach</dt><dd>'+ (after?esc(after.t)+' · '+eur(after.c):'entfernt')+'</dd><dt>Reiseplan vorher</dt><dd>'+eur(draft.before)+'</dd><dt>Reiseplan danach</dt><dd>'+eur(draft.after)+'</dd></dl><p class="small muted">Zahlungsbuchangaben bleiben erhalten. Das ist keine Stornierung, Erstattung oder Preisbestätigung.</p><div class="row"><button type="button" class="btn'+(draft.remove?' warn':'')+'" data-act="xc-confirm">'+(draft.remove?'Ja, Posten entfernen':'Änderung übernehmen')+'</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div>');UI.costEntryDraft=draft;
}
function tKosten(t){
  const c=cost(t), groups={};
  c.lines.forEach(l=>{(groups[l.cat]=groups[l.cat]||[]).push(l)});
  const order=['unterkunft','anreise','gebuehren','schnee','wellness','ausflug','genuss','essen','eigen','puffer'];
  const tips=savingTips(t);
  return '<section class="block"><h2>Einstellungen</h2><div class="panel">'+
   '<div class="fld"><span>Essen</span><div class="opts">'+Object.keys(FOOD).map(k=>opt('food',k,FOOD[k][0],'≈ '+FOOD[k][1]+' € p. P. / Tag',t.food===k)).join('')+'</div></div>'+
   '<div class="fld"><span>Puffer</span><div class="opts">'+[0,5,10].map(p=>opt('puffer',p,p?p+' %':'Kein Puffer','',num(t.puffer,0)===p)).join('')+'</div></div>'+
   (t.travel==='auto'?'<div class="form"><label class="fld"><span>Strecke einfach (km, manuell)</span><input type="number" min="0" data-f="routeKm" value="'+routeKm(t)+'"></label><label class="fld"><span>Verbrauch l/100 km</span><input type="text" inputmode="decimal" data-f="verb" value="'+dec(num(t.verb,7.5),1)+'"></label><label class="fld"><span>€ pro Liter</span><input type="text" inputmode="decimal" data-f="preis" value="'+dec(num(t.preis,2.15),2)+'"></label></div><p class="small muted">Strecke ab eurem Startort eintragen. Katalogstrecken gelten nur ab Hattenhofen. Kraftstoffpreis ist eine anpassbare Annahme.</p>':'<div class="form"><label class="fld"><span>Ticketkosten gesamt (€)</span><input type="number" min="0" data-f="ticket" value="'+esc(t.ticket)+'"></label></div>')+
   (placeOf(t)&&placeOf(t).onlineRent?'<label class="small"><input type="checkbox" data-act="online"'+(t.online!==false?' checked':'')+'> Verleih online buchen (−10 %)</label>':'')+
  '</div></section>'+
  '<section class="block"><h2>Aufstellung</h2>'+stackBar(c)+'<div class="tbl-wrap"><table><thead><tr><th>Posten</th><th>Quelle</th><th class="r">Betrag</th></tr></thead><tbody>'+
   order.filter(k=>groups[k]).map(k=>'<tr class="grp"><td>'+COSTCAT[k][0]+'</td><td></td><td class="r">'+eur(c.byCat[k])+'</td></tr>'+groups[k].map(l=>'<tr><td>'+esc(l.t)+'<small>'+esc(l.s)+'</small></td><td>'+srcBadge(l.src)+'</td><td class="r">'+eur(l.c)+'</td></tr>').join('')).join('')+
   '<tr class="total"><td>Gesamt</td><td></td><td class="r">'+eur(c.total)+'</td></tr><tr><td>pro Person</td><td></td><td class="r">'+eur(c.total/c.P)+'</td></tr></tbody></table></div>'+
   (c.saved?'<p class="small" style="color:var(--ok)">Gästekarte spart beim Skipass ≈ '+eur(c.saved)+'.</p>':'')+'</section>'+
  budgetSection(t)+scenarioSection(t)+v3TransportBlock(t)+offerFinance(t)+ledgerSection(t)+splitSection(t)+'<section class="block"><h2>Eigene Kostenposten</h2><div class="checks-list">'+(t.extraCosts||[]).map(e=>'<div class="chk info"><span>'+esc(e.t)+' · <b class="num">'+eur(e.c)+'</b></span><button type="button" class="lnk" style="margin-left:auto" data-act="xc-edit" data-val="'+esc(e.id)+'">Bearbeiten</button><button type="button" class="lnk" data-act="xc-del" data-val="'+esc(e.id)+'">Entfernen</button></div>').join('')+'</div><div class="form"><label class="fld"><span>Bezeichnung</span><input type="text" id="xc-t" placeholder="z. B. Parken, Vignette"></label><label class="fld"><span>Betrag (€)</span><input type="number" min="0" step="0.01" id="xc-c"></label></div><button type="button" class="btn sm" data-act="xc-add">Posten hinzufügen</button></section>'+
  '<section class="block"><h2>Spartipps</h2>'+(tips.length?'<div class="checks-list">'+tips.map((x,i)=>'<div class="chk ok"><b>−'+eur(x.save)+'</b><span>'+esc(x.t)+'</span><button type="button" class="btn ghost sm" style="margin-left:auto" data-act="tip" data-val="'+i+'">Änderung prüfen</button></div>').join('')+'</div>':'<p class="muted">Keine sichere automatische Einsparung gefunden. Das bedeutet nicht, dass der Plan bereits optimal ist.</p>')+'<p class="small muted">Spartipps verändern keine gebuchten Termine, Zahlungen oder Fälligkeiten. Selbstkochen wird nur mit bestätigter Küche vorgeschlagen. Puffer entfernen ist keine Einsparung.</p></section>';
}
/* Bestehende Verpflichtungen dürfen automatische Spartipps nicht verändern. */
/* Format 3: ein storniertes aktives Angebot darf verlassen werden (canLeaveOffer); seine Geld-/Stornoangaben bleiben über commitmentIssues geschützt. */
function stayCommitted(t){const o=activeOffer(t);if(isV3(t)&&o&&o.cancel)return false;return !!(t.check&&t.check.stay||o&&(o.booked||num(o.paid,0)>0));}
function commitmentIssues(before,after){
 const out=[], old=activeOffer(before), fresh=activeOffer(after);
 if(stayCommitted(before)&&(before.stayId!==after.stayId||before.activeOfferId!==after.activeOfferId||!after.check?.stay&&before.check?.stay||old&&fresh&&JSON.stringify(old)!==JSON.stringify(fresh)))out.push('Unterkunft ist gebucht oder bereits bezahlt');
 const basis=t=>[t.dateMode,t.start||'',t.end||'',t.month||'',nightsOf(t),t.persons];
 if(stayCommitted(before)&&JSON.stringify(basis(before))!==JSON.stringify(basis(after)))out.push('Zeitraum oder Belegung der gebuchten Unterkunft würde verändert');
 const signature=(t,k)=>{const days=daysOf(t);return sortedItems(t).filter(it=>{const a=actOf(t,it.act);return a&&(k==='kurs'?a.kurs:k==='verleih'?a.gear:k==='skipass'?a.pass||a.kurs:k==='act:'+it.act);}).map(it=>{const d=days[it.day];return [it.uid,it.act,it.day,it.slot,it.time||'',d&&d.date?iso(d.date):[t.dateMode,t.month||'',t.start||''],t.persons];}).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));};
 Object.entries(before.check||{}).forEach(([k,done])=>{if(done&&k.startsWith('b-')&&JSON.stringify(signature(before,'act:'+k.slice(2)))!==JSON.stringify(signature(after,'act:'+k.slice(2))))out.push('Gebuchte Unternehmung würde verändert');});
 /* Format 3: Erstattungen und Storno sind selbst Verpflichtung/Historie; abgeschlossen stornierte Posten binden den Termin nicht mehr,
    ihre Zahlungsangaben bleiben aber unveränderlich. Anreise-Abschnitte (tr:) werden über ihren Inhalt verglichen.
    Online-Check-in (Öffnung/Hinweis) ist reine Anbieterinformation und darf auch bei gebuchten Abschnitten nachgetragen werden
    (Entscheidung Claude, #8, 16.10.); Zeiten, Strecke, Preis, Anbieter und Nummer bleiben geschützt. */
 const normTr=t=>{if(!t.transport||!V3)return null;try{return V3.validateTransport(t.transport)}catch(e){return t.transport}};
 const segSig=(t,k)=>{const m=k.match(/^tr:([a-z0-9]+)(?::([a-z0-9]+))?$/),tr=normTr(t);if(!m||!tr)return null;const seg=[].concat(tr.out||[],tr.back||[]).find(x=>x.id===m[1]);if(!seg)return null;return m[2]?(seg.addons||[]).find(a=>a.id===m[2])||null:Object.assign({},seg,{addons:undefined,checkin:undefined})};
 Object.entries(before.ledger||{}).forEach(([k,e])=>{const v3m=v3Money(before,e);if(!(e.status==='gebucht'||e.status==='angefragt'||num(e.paid,0)>0||e.due||v3m))return;
  const settled=v3m&&e.cancel&&V3.cancelSettled(V3.cancelMath(e,null));
  if(!settled&&k.startsWith('tr:')&&JSON.stringify(segSig(before,k))!==JSON.stringify(segSig(after,k)))out.push('Gebuchter Anreise-Abschnitt würde verändert oder entfernt');
  if(!settled&&JSON.stringify(signature(before,k))!==JSON.stringify(signature(after,k)))out.push('Termin mit Buchung, Zahlung oder Fälligkeit würde verändert');
  if(JSON.stringify(e)!==JSON.stringify((after.ledger||{})[k]))out.push('Zahlungsangaben würden verändert');
 });
 if(isV3(before))(before.offers||[]).forEach(o=>{if(!(o.booked||num(o.paid,0)>0||o.cancel||(o.refunds&&o.refunds.length)))return;const n=(after.offers||[]).find(x=>x.id===o.id);
  if(!n||JSON.stringify([o.booked,o.paid,o.cancel,o.refunds])!==JSON.stringify([n.booked,n.paid,n.cancel,n.refunds]))out.push('Zahlungs- oder Stornoangaben eines Angebots würden verändert oder entfernt')});
 return [...new Set(out)];
}
/* Erst einen geprüften Kandidaten bilden; abgewiesene Aktionen verändern die Reise nicht. */
function protectedPlanChange(t,action,args={}){
 const c=clone(t);
 if(action==='move'){
  const it=(c.items||[]).find(i=>i.uid===args.uid);
  if(!it)throw new Error('Termin nicht mehr vorhanden. Bitte neu öffnen.');
  if(!Number.isInteger(args.day)||args.day<0||args.day>=daysOf(c).length||!SLOTS.some(s=>s[0]===args.slot))throw new Error('Bitte gültigen Tag und Tageszeit wählen.');
  it.day=args.day;it.slot=args.slot;c.packageId='';
  if(args.time!==undefined){if(args.time===''||args.time==null)delete it.time;else{if(!TIME_RE.test(args.time))throw new Error('Bitte eine gültige Uhrzeit (HH:MM) eingeben.');it.time=args.time;it.slot=slotForTime(args.time)}}
 }else if(action==='remove'){if(!(c.items||[]).some(i=>i.uid===args.uid))throw new Error('Termin nicht mehr vorhanden.');c.items=c.items.filter(i=>i.uid!==args.uid);c.packageId='';}
 else if(action==='clear'){c.items=[];c.packageId='';}
 else if(action==='package'){const p=PKGS.find(x=>x.id===args.id);if(!p)throw new Error('Paket nicht mehr vorhanden.');applyPkg(c,p);}
 else if(action==='edit'){
  const o=clone(args.draft);
  if(!o||o.id!==t.id)throw new Error('Reiseentwurf nicht mehr vorhanden.');
  if(o.dateMode==='fix'&&!(pd(o.start)&&pd(o.end)&&pd(o.end)>=pd(o.start)))throw new Error('Bitte gültige Daten wählen: Abreise nicht vor Anreise.');
  if(t.start!==o.start||t.end!==o.end||t.persons!==o.persons||t.dateMode!==o.dateMode||t.month!==o.month||nightsOf(t)!==nightsOf(o))resetStay(o);
  Object.assign(c,o);if(!('kmSrc' in o))delete c.kmSrc;if(!('originGeo' in o))delete c.originGeo;if(!('destGeo' in o))delete c.destGeo;
  invalidateEndpointRoute(t,c);
 }else throw new Error('Unbekannte Planänderung.');
 const issues=commitmentIssues(t,c);
 if(issues.length)throw new Error('Nicht geändert: '+issues.join(' · ')+'. Buchungen oder Zahlungen zuerst prüfen.');
 return c;
}
function adoptPlanChange(t,c){Object.keys(t).forEach(k=>{if(!(k in c))delete t[k]});Object.assign(t,c);}
function stayChangePreview(t,action,value){
 const c=clone(t);let title='Unterkunft wechseln';
 if(action==='place'){
  if(!PLACES[value])throw new Error('Ort nicht mehr vorhanden.');
  if(c.place!==value){resetStay(c);c.routeKm=null;c.place=value;c.stayId='';c.packageId='';c.items=(c.items||[]).filter(i=>{const a=actOf(c,i.act);return a&&(a.custom||a.place==='*'||String(a.place||'').split('|').includes(value))});}
  title='Ort wechseln';
 }else if(action==='select'){
  if(!STAYS.some(s=>s.id===value)&&!(c.customStays||[]).some(s=>s.id===value))throw new Error('Unterkunft nicht mehr vorhanden.');
  if(c.stayId!==value){resetStay(c);c.stayId=value;}
 }else if(action==='add'){
  if(!value||!value.id||!String(value.name||'').trim()||!Number.isFinite(value.priceNight)||value.priceNight<0)throw new Error('Name und gültigen Nachtpreis eintragen.');
  resetStay(c);c.customStays=(c.customStays||[]).concat([clone(value)]);c.stayId=value.id;
 }else if(action==='remove'){
  if(!(c.customStays||[]).some(s=>s.id===value))throw new Error('Eigene Unterkunft nicht mehr vorhanden.');
  c.customStays=c.customStays.filter(s=>s.id!==value);if(c.stayId===value){resetStay(c);c.stayId='';}title='Eigene Unterkunft entfernen';
 }else throw new Error('Unbekannter Unterkunftswechsel.');
 const issues=commitmentIssues(t,c);if(issues.length)throw new Error('Nicht geändert: '+issues.join(' · ')+'. Bestehende Verpflichtungen zuerst klären.');
 return {trip:t.id,source:JSON.stringify(t),candidate:c,title,before:cost(t).total,after:cost(c).total,removed:(t.items||[]).length-(c.items||[]).length,open:openCosts(c)};
}
function applyStayChange(t,draft){
 if(!draft||draft.trip!==t.id||draft.source!==JSON.stringify(t))throw new Error('Die Reise hat sich geändert. Wechsel bitte erneut öffnen.');
 const issues=commitmentIssues(t,draft.candidate);if(issues.length)throw new Error(issues.join(' · '));
 adoptPlanChange(t,clone(draft.candidate));return t;
}
function sheetStayChange(t,draft){
 const old=stayOf(t),fresh=stayOf(draft.candidate);
 openSheet('<h2>'+esc(draft.title)+'?</h2><dl class="facts"><dt>Unterkunft vorher</dt><dd>'+esc(old?old.name:'Noch keine')+'</dd><dt>Unterkunft danach</dt><dd>'+esc(fresh?fresh.name:'Noch keine')+'</dd><dt>Plan vorher</dt><dd>'+eur(draft.before)+'</dd><dt>Plan danach</dt><dd>'+eur(draft.after)+'</dd><dt>Termine entfernt</dt><dd>'+draft.removed+'</dd></dl><p class="small">Es wird keine Buchung, Stornierung oder Erstattung ausgelöst. Ein Wechsel setzt unterkunftsgebundene Angebotspreise und Gästekartenbestätigungen zurück.</p>'+(draft.open.length?'<div class="note"><b>Noch offene Kosten</b><p>'+esc(draft.open.join(' · '))+'</p></div>':'')+'<div class="row"><button type="button" class="btn" data-act="stay-change-confirm">Wechsel übernehmen</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div>');UI.stayDraft=draft;
}
function savingPreview(t,index){
 const tip=savingTips(t)[index];if(!tip)return null;
 const candidate=clone(t);tip.fn(candidate);const issues=commitmentIssues(t,candidate);if(issues.length)return null;
 return {title:tip.t,before:cost(t).total,after:cost(candidate).total,saved:cost(t).total-cost(candidate).total,open:openCosts(candidate),candidate,source:JSON.stringify(t)};
}
function applySavingPreview(t,draft){
 if(!draft||draft.source!==JSON.stringify(t))throw new Error('Der Plan hat sich geändert. Spartipp bitte neu öffnen.');
 const issues=commitmentIssues(t,draft.candidate);if(issues.length)throw new Error(issues.join(' · '));
 Object.assign(t,clone(draft.candidate));return t;
}
function sheetSaving(t,index){
 const draft=savingPreview(t,index);if(!draft){alertMsg('Dieser Spartipp ist nicht mehr verfügbar.');return;}
 openSheet('<h2>Spartipp prüfen</h2><p>'+esc(draft.title)+'</p><dl class="facts"><dt>Plan vorher</dt><dd>'+eur(draft.before)+'</dd><dt>Plan danach</dt><dd>'+eur(draft.after)+'</dd><dt>Rechnerische Ersparnis</dt><dd>'+eur(draft.saved)+'</dd></dl><p class="small">Das ist ein Planvergleich, kein neues Angebot. Verfügbarkeit, Gebühren und Bedingungen vor einer Entscheidung prüfen. Bestehende Buchungen und Zahlungen bleiben geschützt.</p>'+(draft.open.length?'<p class="small">Noch offen: '+esc(draft.open.join(' · '))+'</p>':'')+'<button type="button" class="btn" data-act="tip-confirm">Änderung übernehmen</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button>');
 UI.savingDraft=draft;
}
function savingTips(t){
  const base=cost(t).total, out=[], st=stayOf(t), pl=placeOf(t);
  const tryT=(label,fn)=>{const c=clone(t);if(fn(c)===false)return;if(commitmentIssues(t,c).length)return;const s=base-cost(c).total;if(s>=5)out.push({t:label,save:s,fn})};
  const needs=k=>(t.items||[]).some(i=>actOf(t,i.act)&&actOf(t,i.act)[k]);
  if(pl){const cheapest=STAYS.filter(s=>s.place===t.place&&(s.kitchen||!(needs('kitchen')||t.food==='selbst'))&&(s.sauna||!needs('needSauna'))).filter(s=>!s.gone).sort((a,b)=>stayNight(t,a).pn-stayNight(t,b).pn)[0];
    if(cheapest&&st&&cheapest.id!==st.id&&!num(t.stayQuote,0)) tryT('Günstigere Katalog-Unterkunft (Planvergleich): '+cheapest.name,c=>{resetStay(c);c.stayId=cheapest.id})}
  const kurs=sortedItems(t).filter(i=>actOf(t,i.act)&&actOf(t,i.act).kurs);
  if(kurs.length>=2) tryT('Einen Kurstag weniger (bisher '+kurs.length+' Termine)',c=>{const last=kurs[kurs.length-1];c.items=c.items.filter(i=>i.uid!==last.uid);const ue=Object.values(ACTS).find(a=>a.pass&&a.place===t.place);if(ue&&!c.items.some(i=>i.act===ue.id))c.items.push({uid:uid('i'),act:ue.id,day:last.day,slot:'morgen'})});
  const swap=(from,to,label)=>{if((t.items||[]).some(i=>i.act===from)&&ACTS[to])tryT(label,c=>{c.items.forEach(i=>{if(i.act===from)i.act=to})})};
  swap('oj-kristall','oj-wsauna','Wonnemar-Sauna statt Kristall-Therme');
  swap('oj-wsauna','oj-wbad','Wonnemar-Bad'+(st&&t.cardConfirmed===true?' (mit bestätigter Gästekarte frei)':'')+' statt Saunawelt');
  if(st&&st.kitchen){swap('silv-menu','silv-raclette','Raclette in der Wohnung statt Silvestermenü');swap('silv-huette','silv-raclette','Raclette in der Wohnung statt Hütten-Silvester')}
  if(t.food!=='selbst'&&st&&st.kitchen) tryT('Mehr selbst kochen statt auswärts essen',c=>{c.food='selbst'});
  if(pl&&pl.onlineRent&&t.online===false) tryT('Verleih online buchen (−10 %)',c=>{c.online=true});

  return out.sort((a,b)=>b.save-a.save);
}
function checklistView(t,filter,query){
 const mode=['all','open','done'].includes(filter)?filter:'all',q=String(query||'').trim().toLocaleLowerCase('de');
 let total=0,done=0,visible=0;
 const groups=checklist(t).map(([name,items])=>{
  const rows=items.map(i=>{total++;const checked=!!(t.check&&t.check[i[0]]);if(checked)done++;return {item:i,done:checked}});
  const shown=rows.filter(r=>(mode==='all'||(mode==='done')===r.done)&&(!q||[name,r.item[1],r.item[2]].join(' ').toLocaleLowerCase('de').includes(q)));
  visible+=shown.length;
  return {name,rows:shown,total:rows.length,done:rows.filter(r=>r.done).length};
 });
 return {groups,total,done,visible,mode,query:q};
}
function tCheck(t){
 const v=checklistView(t,UI.checkFilter,UI.checkQuery),active=v.mode!=='all'||v.query;
 return '<section class="block"><div class="between"><h2>Checkliste</h2><span class="badge num">'+v.done+' von '+v.total+' abgehakt</span></div><p class="small muted">Buchungen prüfen, Vorbereitungen erledigen und die Tasche packen. Häkchen dokumentieren nur euren eigenen Stand.</p><div class="bar" role="img" aria-label="'+v.done+' von '+v.total+' Punkten abgehakt"><i style="width:'+(v.total?v.done/v.total*100:0)+'%"></i></div>'+
 '<div class="module-tools"><form id="check-search" class="row" role="search"><label class="fld" style="flex:1"><span>Checkliste durchsuchen</span><input type="search" id="check-q" value="'+esc(UI.checkQuery||'')+'" maxlength="120" placeholder="z. B. Handtuch, Unterkunft …"></label><button type="submit" class="btn ghost sm">Suchen</button></form><div class="row" aria-label="Checklistenstatus">'+[['all','Alle'],['open','Offen'],['done','Erledigt']].map(([key,label])=>chipb('check-filter',key,label,v.mode===key)).join('')+'<button type="button" class="lnk" data-act="check-reset"'+(active?'':' disabled')+'>Zurücksetzen</button></div><p class="small muted" role="status">'+v.visible+' von '+v.total+' Punkten sichtbar · '+(v.total-v.done)+' insgesamt offen</p></div>'+
 (v.visible?v.groups.filter(g=>g.rows.length).map(g=>'<details class="panel check-group" open><summary><strong>'+esc(g.name)+'</strong><span class="small muted">'+(g.total-g.done)+' offen · '+g.done+' erledigt</span></summary><div class="checks-list">'+g.rows.map(({item:i,done})=>'<div class="check-row"><label class="chk '+(done?'ok':'info')+'"><input type="checkbox" data-act="check" data-val="'+esc(i[0])+'"'+(done?' checked':'')+'><span>'+esc(i[1])+(i[2]?'<br><small class="muted">'+esc(i[2])+'</small>':'')+'</span></label>'+(i[3]?'<button type="button" class="lnk" data-act="cc-del" data-val="'+esc(i[3])+'" aria-label="Eigenen Punkt '+esc(i[1])+' entfernen">Entfernen</button>':'')+'</div>').join('')+'</div></details>').join(''):'<div class="empty"><b>'+ (v.mode==='open'&&!v.query?'Alle aktuellen Punkte abgehakt':'Keine passenden Punkte')+'</b><span>'+ (v.mode==='open'&&!v.query?'Das bestätigt keine Buchungen oder vollständige Reisebereitschaft.':'Suchwort oder Statusfilter ändern. Eure Punkte wurden nicht gelöscht.')+'</span><button type="button" class="btn ghost sm" data-act="check-reset">Alle Punkte zeigen</button></div>')+
 '<div class="panel"><h3>Eigene Vorbereitung ergänzen</h3><label class="fld"><span>Neuer Checklistenpunkt</span><input type="text" id="cc-t" maxlength="160" placeholder="z. B. Ladegerät einpacken"></label><div class="row"><button type="button" class="btn sm" data-act="cc-add">Hinzufügen</button></div></div></section>';
}
/* Notizen (Claude, #8): Links und Telefonnummern aus dem Freitext erkennen, Bausteine anhängen. Bleibt im Feld notes. */
const NOTE_BLOCKS={
  kontakte:['Kontakte',t=>{const st=stayOf(t);return 'Kontakte\n- Unterkunft: '+(st&&st.name?st.name:'')+' · Telefon: · Adresse:\n- Gastgeber/Rezeption:\n- Mitreisende:'}],
  anreise:['Anreise & Ankunft',t=>'Anreise & Ankunft\n- Parken:\n- Check-in / Schlüssel:'+(t.checkinTime?' ab '+t.checkinTime:'')+'\n- WLAN:'],
  buchungen:['Buchungen (privat)',()=>'Buchungen (privat, nicht teilen)\n- Unterkunft: Buchungsnr.\n- Tickets/Kurse:\n- Stornofrist:'],
  notfall:['Notfall',()=>'Notfall\n- Notruf in der EU: 112\n- Ärztlicher Bereitschaftsdienst in Deutschland: 116117\n- Krankenversicherung / Auslandsschutz:\n- Sperrnotruf Karten (Deutschland): 116 116']
};
function notesLinks(text){
  const out=[],seen=new Set();
  String(text||'').replace(/https?:\/\/[^\s<>"']+/gi,m=>{const u=m.replace(/[.,;:!?)\]]+$/,''),x=u.match(/^https?:\/\/([a-z0-9.-]+\.[a-z]{2,}|\[[0-9a-f:]+\])(?::\d+)?(\/[^?#]*)?/i);
    if(x&&!seen.has(u)&&out.length<20){const path=x[2]||'';seen.add(u);out.push({url:u,label:x[1].toLowerCase().replace(/^www\./,'')+(path.length>1?path.slice(0,24)+(path.length>24?'…':''):'')})}return m});
  return out;
}
function notesPhones(text){
  const out=[],seen=new Set();
  String(text||'').replace(/https?:\/\/\S+/gi,' ').replace(/(?:\+|\b0)[\d][\d \/()-]{5,}\d/g,m=>{const d=m.replace(/[^\d+]/g,'');const digits=d.replace(/\D/g,'').length;
    if(digits>=7&&digits<=15&&!/^\d{4}-\d{2}-\d{2}/.test(m.trim())&&!seen.has(d)&&out.length<10){seen.add(d);out.push({tel:d,label:m.trim()})}return m});
  return out;
}
function notesHas(t,key){const h=NOTE_BLOCKS[key][1](t).split('\n')[0];return String(t.notes||'').split('\n').some(l=>l.trim()===h)}
function addNoteBlock(t,key){
  if(!NOTE_BLOCKS[key])throw new Error('Unbekannter Baustein.');
  if(notesHas(t,key))throw new Error('Der Baustein „'+NOTE_BLOCKS[key][0]+'“ steht schon in den Notizen.');
  const cur=String(t.notes||'').replace(/\s+$/,'');
  const next=(cur?cur+'\n\n':'')+NOTE_BLOCKS[key][1](t);
  if(next.length>20000)throw new Error('Notizen sind zu lang für einen weiteren Baustein.');
  t.notes=next;return t;
}
function notesExtras(t){
  const L=notesLinks(t.notes),P=notesPhones(t.notes);
  if(!L.length&&!P.length)return '<p class="small muted">Links (https://…) und Telefonnummern in den Notizen erscheinen hier zum Antippen.</p>';
  return (L.length?'<h3>Links aus den Notizen</h3><ul class="plain">'+L.map(x=>'<li>'+lk(x.url,x.label)+'</li>').join('')+'</ul>':'')+
   (P.length?'<h3>Telefon</h3><ul class="plain">'+P.map(x=>'<li><a class="lnk" href="tel:'+esc(x.tel)+'">'+esc(x.label)+' anrufen</a></li>').join('')+'</ul><p class="small muted">Erkannt am Zahlenformat, bitte vor dem Anruf prüfen.</p>':'');
}
function tNotiz(t){
  return '<section class="block"><h2>Notizen</h2><p class="muted small">Ideen und wichtige Angaben zur Reise. Der Speicherstatus steht oben. Beim Teilen der Kurzfassung werden Notizen nur auf Wunsch aufgenommen.</p><textarea data-f="notes" aria-label="Notizen">'+esc(t.notes)+'</textarea>'+
   '<div class="row noprint" aria-label="Bausteine einfügen">'+Object.keys(NOTE_BLOCKS).map(k=>notesHas(t,k)?'<span class="badge ok">✓ '+esc(NOTE_BLOCKS[k][0])+'</span>':'<button type="button" class="btn ghost sm" data-act="note-add" data-val="'+k+'">+ '+esc(NOTE_BLOCKS[k][0])+'</button>').join('')+'</div>'+
   '<p class="small muted">Bausteine hängen eine Gliederung an das Ende der Notizen an, die ihr dann ausfüllt. Buchungsnummern bleiben privat: Sie erscheinen nur in Mappe und Teilen-Text, wenn ihr Notizen dort ausdrücklich einschließt.</p>'+
   '<div id="notes-extra" aria-live="polite">'+notesExtras(t)+'</div></section>';
}
/* Unterwegs: was heute und morgen ansteht, ohne Wischen durch den ganzen Plan */
function dayList(t,d,last){
  const its=dayItems(t,d.i),fixed=[];
  if(d.i===0){const arr=arrivalMin(t);fixed.push('Anreise ab '+(t.origin||'Start')+(t.departTime?' um '+t.departTime:'')+(arr!=null?', Ankunft ca. '+minTime(arr):''))}
  if(d.i===last&&last>0)fixed.push('Packen & Abreise');
  if(!its.length&&!fixed.length)return '<p class="muted small">Nichts eingeplant.</p>';
  return '<ul class="plain">'+fixed.map(x=>'<li><b>'+esc(x)+'</b></li>').join('')+its.map(it=>{const a=actOf(t,it.act),u=actUrl(a);
    return '<li><span class="eyebrow">'+esc(it.time||SLOTNAME[it.slot]||'')+'</span> '+esc(a.t)+(a.dur||a.ort?' <small class="muted">· '+esc([a.dur,a.ort].filter(Boolean).join(' · '))+'</small>':'')+(openHoursText(a)?'<br><small class="muted">Laut Katalog (unbestätigt): '+esc(openHoursText(a))+'</small>':'')+(u?' '+lk(u,'Info'):'')+(a.map?' '+lk(mp(a.map),'Karte'):'')+'</li>'}).join('')+'</ul>';
}
function rainBlock(t,i){
  const ideas=rainIdeas(t,i,3);if(!ideas.length)return '';
  return '<details class="panel"><summary><b>Plan B bei schlechtem Wetter</b> <small class="muted">'+ideas.length+' Ideen drinnen</small></summary><ul class="plain">'+ideas.map(a=>'<li>'+esc(a.t)+' <small class="muted">· '+esc([a.dur,a.ort].filter(Boolean).join(' · '))+'</small>'+(openHoursText(a)?'<br><small class="muted">Laut Katalog (unbestätigt): '+esc(openHoursText(a))+'</small>':'')+(a.warn?'<br><small class="muted">! '+esc(a.warn)+'</small>':'')+' <button type="button" class="lnk noprint" data-act="rain-plan" data-val="'+esc(a.id)+'|'+i+'">Einplanen</button></li>').join('')+'</ul><p class="small muted">Nur Ideen aus dem Katalog mit Merkmal „drinnen“. Öffnung und Wetter selbst prüfen.</p></details>';
}
function todayBlock(t,now){
  const ph=tripPhase(t,now);if(!ph||ph.phase!=='unterwegs')return '';
  const days=daysOf(t),d=days[ph.day],next=days[ph.day+1],last=days.length-1;
  const L=dayLoad(t)[ph.day],ru=dayRouteUrl(t,ph.day);
  /* Draußen-Ideen aus dem Katalog: direkter Weg zum Regenzwilling im Punkt-Blatt (Tausch dort geschützt) */
  const outs=dayItems(t,ph.day).map(it=>({it,a:actOf(t,it.act)})).filter(x=>x.a&&x.a.catalogSpot&&!x.a.indoor&&!x.a.transit&&CATX);
  return '<section class="block"><span class="eyebrow">'+esc(phaseText(ph))+'</span><h2>Heute · '+esc(d.label)+'</h2><div class="panel">'+dayList(t,d,last)+
   (L&&(L.planned||L.drive)?'<p class="small muted">Programm ≈ '+String(L.planned).replace('.',',')+' Std.'+(L.drive?' · Fahrt ca. '+String(Math.round(L.drive/6)/10).replace('.',',')+' Std.':'')+(L.over?' · <b>zu voll</b>, einen Punkt verschieben':'')+'</p>':'')+
   (ru||outs.length?'<div class="row">'+(ru?lk(ru,'Route für heute'):'')+outs.map(x=>'<button type="button" class="btn ghost sm" data-act="item" data-val="'+esc(x.it.uid)+'">☂ Regen-Alternative: '+esc(x.a.t)+'</button>').join('')+'</div>':'')+'</div>'+
   rainBlock(t,ph.day)+journalToday(t,ph.day)+
   (next?'<h3>Morgen · '+esc(next.label)+'</h3><div class="panel">'+dayList(t,next,last)+'</div>':'')+
   '<div class="row"><button type="button" class="btn ghost sm" data-go="r-'+t.id+'-plan">Ganzer Tagesplan</button><button type="button" class="btn ghost sm" data-go="r-'+t.id+'-mappe">Reisemappe</button></div></section>';
}
/* Reisemappe: druckbare Zusammenfassung, Kalenderdatei und Text zum Teilen */
function tMappe(t){
  const days=daysOf(t),pl=placeOf(t),st=stayOf(t),c=cost(t),ics=icsData(t,undefined,{reminders:true}),book=checklist(t)[0][1],warn=checks(t).filter(x=>x[0]==='warn'),last=days.length-1;
  const keys=Object.keys(c.byCat).filter(k=>c.byCat[k]>0);
  return '<section class="block noprint"><h2>Reisemappe</h2><p class="lead muted small">Alles Wichtige kompakt: zum Drucken oder Speichern als PDF, als Kalenderdatei oder als Text für den Messenger. Daten verlassen das Gerät nur, wenn ihr Datei oder Text selbst weitergebt.</p>'+
   '<div class="row"><button type="button" class="btn sm" data-act="mappe-print">Drucken / PDF</button>'+
   '<button type="button" class="btn ghost sm" data-act="mappe-ics"'+(ics?'':' disabled')+'>Kalender (.ics)</button>'+
   '<button type="button" class="btn ghost sm" data-act="mappe-share">Als Text teilen</button></div>'+
   (ics?'<p class="small muted">Kalender: '+ics.events+' Einträge'+(ics.reminders?', davon '+ics.reminders+' Erinnerungen (Zahlungen, Packtag) mit Alarm um 9 Uhr':'')+'. Zeitfenster sind grob (Vormittag 9–12, Mittag 12–14, Nachmittag 14–18, Abend 18–22 Uhr) und als vorläufig markiert.'+(ics.skipped?' '+ics.skipped+' Punkt(e) nach dem letzten Reisetag werden nicht exportiert.':'')+'</p>':'<p class="small muted">Kalenderexport nur mit festem An- und Abreisedatum möglich. Unter „Eckdaten“ einstellen.</p>')+
   '<label class="small"><input type="checkbox" data-act="mappe-notes"'+(UI.mappeNotes?' checked':'')+'> Notizen in Mappe und Text aufnehmen (können Buchungsnummern enthalten)</label>'+journalMappeToggle(t)+'</section>'+
   '<section class="block mappe"><span class="eyebrow">Reisemappe · Stand '+esc(fmtLong(todayUTC()))+'</span><h2>'+esc(t.title)+'</h2>'+
   '<dl class="facts"><dt>Zeitraum</dt><dd>'+esc(rangeText(t))+'</dd><dt>Personen</dt><dd>'+c.P+'</dd><dt>Ziel</dt><dd>'+esc(pl?pl.name+' · '+pl.region:(t.dest||'noch offen'))+'</dd>'+
   '<dt>Anreise</dt><dd>'+esc(({auto:'Auto',bahn:'Bahn'})[t.travel]||'Ticket')+(t.origin?' ab '+esc(t.origin):'')+'</dd>'+
   '<dt>Unterkunft</dt><dd>'+(st?esc(st.name)+(st.ort?', '+esc(st.ort):'')+' · '+(num(t.stayQuote,0)>0?'Angebot '+eur(t.stayQuote):'nur Planwert'):'noch offen')+'</dd>'+
   '<dt>Status</dt><dd>'+esc(STATUS[t.status]||'')+'</dd></dl>'+
   (Array.isArray(t.legs)&&t.legs.length?'<h3>Etappen</h3><ol class="steps">'+t.legs.map(l=>'<li>'+esc(l.name)+' · '+num(l.nights,1)+' Nacht/Nächte · Anfahrt ≈ '+num(l.roadKm,0)+' km (geschätzt)</li>').join('')+'</ol>':'')+'</section>'+
   '<section class="block mappe"><h3>Tagesplan</h3>'+longTripNote(t,'Die Reisemappe')+'<div class="mdays">'+viewDays(t).map(d=>{const rb=rainIdeas(t,d.i,2),ld=dayLoad(t)[d.i],ru=dayRouteUrl(t,d.i);return '<div class="mday"><h4>'+esc(d.label)+(d.i===0?' · Anreise':d.i===last&&last>0?' · Abreise':'')+'</h4>'+dayList(t,d,last)+
     (ld&&(ld.planned||ld.drive)?'<p class="small muted">Programm ≈ '+String(ld.planned).replace('.',',')+' Std.'+(ld.drive?', Fahrt ca. '+String(Math.round(ld.drive/6)/10).replace('.',',')+' Std.':'')+(ld.over?' · zu voll':'')+'</p>':'')+(ru?'<p class="small">'+lk(ru,'Tagesroute in Karte')+'</p>':'')+(rb.length?'<p class="small muted">Plan B drinnen: '+esc(rb.map(a=>a.t).join(' · '))+'</p>':'')+'</div>'}).join('')+'</div>'+
   '<p class="small muted">Zeitfenster sind grob. Öffnungszeiten aus dem Katalog sind nicht für eure Daten geprüft.</p></section>'+
   (warn.length?'<section class="block mappe"><h3>Hinweise aus dem Plan-Check</h3><ul class="plain">'+warn.map(x=>'<li>! '+esc(x[1])+'</li>').join('')+'</ul></section>':'')+
   '<section class="block mappe"><h3>Kosten · Planwerte</h3><div class="tbl-wrap"><table><tbody>'+keys.map(k=>'<tr><td>'+esc(COSTCAT[k][0])+'</td><td class="r">'+eur(c.byCat[k])+'</td></tr>').join('')+
   '<tr class="total"><td>Gesamt</td><td class="r">'+eur(c.total)+'</td></tr></tbody></table></div><p class="small">≈ '+eur(c.total/c.P)+' pro Person'+(num(t.budget,0)?' · Budget '+eur(t.budget):'')+'. Kein bestätigter Gesamtpreis.</p>'+(openCosts(t).length?'<p class="small muted">Noch offen: '+esc(openCosts(t).join(' · '))+'</p>':'')+'</section>'+
   (Object.keys(t.ledger||{}).length||activeOffer(t)?(()=>{const fs=financeSummary(t);return '<section class="block mappe"><h3>Zahlungen</h3><div class="tbl-wrap"><table><thead><tr><th>Posten</th><th>Status</th><th class="r">Betrag</th><th class="r">Bezahlt</th><th class="r">Offen</th></tr></thead><tbody>'+
     (fs.stay?'<tr><td>Unterkunft: '+esc(fs.stay.label)+'</td><td>'+(fs.stay.booked?'gebucht':'nicht gebucht')+'</td><td class="r">'+eur(fs.stay.cost)+'</td><td class="r">'+eur(fs.stay.paid)+'</td><td class="r">'+eur(Math.max(0,fs.stay.cost-fs.stay.paid))+'</td></tr>':'')+
     fs.rows.filter(r=>r.status!=='offen'||r.paid||r.amount!=null||r.due).map(r=>'<tr><td>'+esc(r.label)+(r.due&&r.open>0.005?'<small>fällig '+esc(fmtLong(pd(r.due)))+'</small>':'')+'</td><td>'+esc(r.status)+'</td><td class="r">'+eur(r.cost)+'</td><td class="r">'+eur(r.paid)+'</td><td class="r">'+eur(r.open)+'</td></tr>').join('')+
     '</tbody></table></div><p class="small">Bezahlt gesamt '+eur(fs.paid)+' · noch offen bis Reiseende '+eur(fs.open)+(fs.detachedPaid?' · davon '+eur(fs.detachedPaid)+' für entfernte Posten bezahlt; separat klären':'')+(fs.deposit?' · Kaution separat '+eur(fs.deposit):'')+'</p></section>'})():'')+
   '<section class="block mappe"><h3>Buchungen & Anfragen</h3><ul class="plain">'+book.map(i=>{const done=!!(t.check&&t.check[i[0]]);return '<li>'+(done?'☑ erledigt: ':'☐ offen: ')+esc(i[1])+'</li>'}).join('')+'</ul></section>'+
   (UI.mappeNotes&&String(t.notes||'').trim()?'<section class="block mappe"><h3>Notizen</h3><div class="copybox">'+esc(t.notes)+'</div></section>':'')+journalMappe(t);
}
function vReise(){
  const t=cur(); if(!t) return vReisen();
  const body={ueber:tUeber,suche:tSuche,angebote:tAngebote,unterkunft:tUnterkunft,unternehmen:tUnternehmen,plan:tPlan,kosten:tKosten,check:tCheck,notiz:tNotiz,mappe:tMappe}[UI.tab]||tUeber;
  return '<div class="trip-workspace">'+tripHead(t)+'<div class="trip-content">'+unreadableBlock(t)+v3Banner(t)+conflictBlock(t)+(Store.isAccount()&&!Store.canEdit(t.id)?'<section class="block"><div class="note"><b>Nur Leserecht.</b> Änderungen werden nicht gespeichert.</div></section>':'')+moduleGuide(t)+costNotice(t)+body(t)+'</div></div>';
}
function render(){
  const v=$('#view');
  try{
    v.innerHTML=storageRecoveryBlock()+(UI.view==='neu'?vNeu():UI.view==='reise'?vReise():UI.view==='konto'?vKonto()+kontoDarstellung():UI.view==='entdecken'?vEntdecken():UI.view==='heute'?vHeute():UI.view==='erinnerungen'?vErinnerungen():vReisen());
    renderNav();
    renderDock();
  }catch(err){
    console.error('Reiseplaner: Ansicht konnte nicht aufgebaut werden',err);
    v.innerHTML=storageRecoveryBlock()+'<section class="block"><h1>Die Ansicht konnte nicht geladen werden</h1><p>Deine gespeicherten Reisen wurden nicht gelöscht. Schließe die Vorschau und öffne die App im Browser. Falls es dort genauso aussieht, sende uns diese Fehlermeldung: '+esc(err&&err.message||'Unbekannter Fehler')+'</p><button type="button" class="btn" data-go="reisen">Zur Reiseübersicht</button></section>';
    $('#dock').hidden=true;
  }
}
function renderDock(){
  const t=UI.view==='reise'?cur():null, d=$('#dock');
  if(!t){d.hidden=true;return}
  const c=cost(t), b=num(t.budget,0);
  d.hidden=false;$('#dock-nm').textContent=t.title;$('#dock-sum').textContent=eur(c.total)+(b?' / '+eur(b):'');
  const bar=$('#dock-bar');bar.className='bar'+(b&&c.total>b?' bad':b&&c.total>b*.92?' warn':'');bar.querySelector('i').style.width=(b?Math.min(100,c.total/b*100):0)+'%';
}

