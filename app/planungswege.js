/* Reiseplaner · Planungswege (Claude, 16.11.2026; Projektanweisungen §6, docs/PLANUNGSWEGE.md).
   Klassisches Skript ohne Bundler, teilt sich den globalen Gültigkeitsbereich mit den übrigen app/*.js-Teilen.
   Wird nach app/offline.js und vor app/start.js geladen; zur Ladezeit nur auf frühere Teile zugreifen.

   Sechs Einstiege führen zu derselben Reise (newTrip, Store.put, cost, Termine):
     schritte    Geführt: eine Frage nach der anderen, mit Fortschritt, Zurück und Überblick vor dem Anlegen
     frei        Das bisherige Formular (#neu), teilt sich den Entwurf UI.draft mit „schritte“
     ziel        Entdecken (Zielsuche im Umkreis)
     unterkunft  Unterkunft steht schon fest, Reise drumherum
     erlebnis    Ein Erlebnis oder Termin steht fest, Reise drumherum
     vorlage     Vorlagen (sheetTemplate)
   Wünsche & Grenzen werden als Format-5-Feld t.criteria gespeichert (SCHEMA_V5 M10, geprüft über RPV5.candidate5).
   Ohne Wünsche entsteht eine Reise wie bisher (kein Formatwechsel).
   Entwurfszustand liegt nur in UI.pw und sessionStorage (rp-planen-v1), nie in rp-trips, bis „Reise anlegen“. */
"use strict";
const PW_KEY='rp-planen-v1';
const PW_WEGE=[
 {key:'schritte',go:'planen-schritte',titel:'Schritt für Schritt',text:'Wir fragen nacheinander: Art, Ziel, Zeit, Budget, Anreise und was euch wichtig ist.',tag:'Empfohlen für den Anfang'},
 {key:'frei',go:'neu',titel:'Alles auf einer Seite',text:'Ihr wisst schon, wohin. Alle Eckdaten in einem Formular.'},
 {key:'ziel',go:'entdecken',titel:'Ziel finden',text:'Ziele im Umkreis nach Art, Entfernung, Saison und Stimmung suchen.'},
 {key:'unterkunft',go:'planen-unterkunft',titel:'Unterkunft steht schon',text:'Ein Hotel oder eine Ferienwohnung habt ihr im Blick. Die Reise entsteht drumherum.'},
 {key:'erlebnis',go:'planen-erlebnis',titel:'Erlebnis zuerst',text:'Ein Konzert, eine Therme, ein Ausflug: Von dem, was ihr unbedingt erleben wollt, aus planen.'},
 {key:'vorlage',act:'pw-vorlage',titel:'Mit Vorlage starten',text:'Fertige Gerüste für Wellness, Stadt, Winter und mehr. Alles bleibt änderbar.'}
];
const PW_ROUTES=['planen','planen-schritte','planen-unterkunft','planen-erlebnis'];
/* Wünsche: Schlüssel passen zu RPV5 KEY (/^[a-z][a-z0-9_-]{0,39}$/). stay: Merkmal, das an der Unterkunft prüfbar ist. */
const PW_KRIT=[
 {key:'wellness',label:'Wellness & Sauna',stay:'sauna'},{key:'ruhe',label:'Ruhe & Erholung'},{key:'schnee',label:'Schnee'},
 {key:'wintersport',label:'Wintersport'},{key:'natur',label:'Natur & Wandern'},{key:'baden',label:'Baden & See'},
 {key:'kultur',label:'Kultur & Stadt'},{key:'kulinarik',label:'Gutes Essen'},{key:'kinder',label:'Kinderfreundlich'},
 {key:'hund',label:'Mit Hund'},{key:'barrierearm',label:'Barrierearm'},{key:'kueche',label:'Eigene Küche',stay:'kitchen'},
 {key:'fruehstueck',label:'Frühstück',stay:'breakfast'},{key:'parken',label:'Parkplatz'},{key:'ohneauto',label:'Gut ohne Auto'}
];
/* Welche Wünsche zuerst gezeigt werden, je Art der Reise */
const PW_KRIT_ART={winter:['schnee','wellness','wintersport','ruhe'],wellness:['wellness','ruhe','fruehstueck','kulinarik'],stadt:['kultur','kulinarik','ohneauto'],strand:['baden','ruhe','natur'],familie:['kinder','kueche','natur','baden'],aktiv:['natur','wintersport','kueche'],camping:['natur','hund','baden']};
const PW_GRAD=[['must','Muss'],['like','Gern'],['avoid','Lieber nicht']];
const PW_SCHRITTE=[
 {key:'art',titel:'Was für eine Reise?',kurz:'Art'},
 {key:'ziel',titel:'Wohin soll es gehen?',kurz:'Ziel'},
 {key:'zeit',titel:'Wann und wie lange?',kurz:'Zeit'},
 {key:'geld',titel:'Wer fährt mit, was darf es kosten?',kurz:'Budget'},
 {key:'weg',titel:'Anreise und Heimkehr',kurz:'Anreise'},
 {key:'wichtig',titel:'Was ist euch wichtig?',kurz:'Wünsche'},
 {key:'check',titel:'Passt alles?',kurz:'Prüfen'}
];
const pwEsc=s=>typeof esc==='function'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pwLabel=k=>(PW_KRIT.find(x=>x.key===k)||{label:k}).label;

/* ---------- Zustand ---------- */
function pwLeer(){return {must:[],like:[],avoid:[],budgetWish:null,maxDriveMin:null,returnTime:'',cancel:null,notes:''}}
function pwState(){
 if(!UI.pw){let saved=null;try{saved=JSON.parse(sessionStorage.getItem(PW_KEY)||'null')}catch(e){}
  UI.pw=saved&&typeof saved==='object'?Object.assign({step:0,crit:pwLeer(),ziel:'offen',stay:{},acts:[],undo:null},saved):{step:0,crit:pwLeer(),ziel:'offen',stay:{},acts:[],undo:null};
  if(saved&&saved.draft&&!UI.draft)UI.draft=Object.assign(newTrip(),saved.draft);
  UI.pw.crit=Object.assign(pwLeer(),UI.pw.crit);delete UI.pw.draft}
 if(!UI.draft)UI.draft=newTrip();
 return UI.pw;
}
function pwMerken(){try{const s=UI.pw;if(!s)return;sessionStorage.setItem(PW_KEY,JSON.stringify({step:s.step,crit:s.crit,ziel:s.ziel,stay:s.stay,acts:s.acts,draft:UI.draft}))}catch(e){}}
function pwVergessen(){UI.pw=null;UI.draft=null;try{sessionStorage.removeItem(PW_KEY)}catch(e){}}
/* Rückgängig für „Neu beginnen“: genau ein Schritt zurück */
function pwSnapshot(){const s=pwState();return JSON.stringify({step:s.step,crit:s.crit,ziel:s.ziel,stay:s.stay,acts:s.acts,draft:UI.draft})}
function pwRestore(json){const o=JSON.parse(json);UI.draft=Object.assign(newTrip(),o.draft);UI.pw=Object.assign(pwState(),{step:o.step,crit:Object.assign(pwLeer(),o.crit),ziel:o.ziel,stay:o.stay||{},acts:o.acts||[],undo:null});pwMerken()}

/* ---------- Reine Funktionen (Node-Tests: tests/planungswege.cjs) ---------- */
/* Wünsche ändern: ein Schlüssel steht höchstens in einer Gruppe; grad '' entfernt ihn. */
function pwSetGrad(crit,key,grad){
 if(!PW_KRIT.some(x=>x.key===key))throw new Error('Unbekannter Wunsch.');
 const c=Object.assign(pwLeer(),crit);PW_GRAD.forEach(([g])=>{c[g]=(c[g]||[]).filter(k=>k!==key)});
 if(grad){if(!PW_GRAD.some(x=>x[0]===grad))throw new Error('Unbekannte Stufe.');c[grad]=c[grad].concat([key])}
 return c;
}
function pwGradOf(crit,key){const g=PW_GRAD.find(([g])=>(crit&&crit[g]||[]).includes(key));return g?g[0]:''}
/* Form t.criteria aus dem Entwurf; null, wenn nichts angegeben ist. budget = Obergrenze (t.budget). */
function pwCriteria(crit,t){
 const c=crit||{},out={};
 PW_GRAD.forEach(([g])=>{const l=(c[g]||[]).filter(k=>PW_KRIT.some(x=>x.key===k));if(l.length)out[g]=Array.from(new Set(l))});
 const wish=c.budgetWish==null||c.budgetWish===''?null:Number(c.budgetWish);
 if(wish!=null){if(!Number.isFinite(wish)||wish<0)throw new Error('Wunschbudget: bitte einen Betrag ab 0 € eintragen.');
  const max=num(t&&t.budget,0);if(max>0&&wish>max)throw new Error('Das Wunschbudget liegt über der Obergrenze. Bitte eines von beiden anpassen.');out.budgetWish=Math.round(wish*100)/100}
 if(c.maxDriveMin!=null&&c.maxDriveMin!==''){const m=Math.round(Number(c.maxDriveMin));if(!(m>=1&&m<=3000))throw new Error('Maximale Fahrzeit ungültig.');out.maxDriveMin=m}
 if(c.returnTime){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(c.returnTime))throw new Error('Heimkehr: Uhrzeit als HH:MM eintragen.');out.returnBy=Object.assign(t&&t.dateMode==='fix'&&pd(t.end)?{date:t.end}:{},{time:c.returnTime})}
 if(c.cancel==='frei'||c.cancel==='egal')out.cancel=c.cancel;
 const n=String(c.notes||'').trim();if(n)out.notes=n.slice(0,2000);
 return Object.keys(out).length?out:null;
}
/* Fertige Reise aus Entwurf und Wünschen. Rein: speichert nichts. Mit Wünschen über RPV5.candidate5 auf Format 5 geprüft. */
function pwBuildTrip(draft,crit,opt){
 const t=Object.assign(newTrip(),clone(draft||{}));t.id=opt&&opt.id||uid('t');t.created=(opt&&opt.today)||new Date().toISOString().slice(0,10);
 t.title=String(t.title||'').trim().slice(0,80);
 if(!t.title||t.title==='Neue Reise')t.title=String(t.dest||'').trim().split(',')[0].slice(0,80)||(TYPES[t.type]||'Neue Reise');
 if(t.dateMode==='fix'&&!(pd(t.start)&&pd(t.end)&&pd(t.end)>=pd(t.start)))throw new Error('Bitte gültige Daten wählen: Abreise nicht vor Anreise.');
 const len=tripLengthError(t);if(len)throw new Error(len);
 if(num(t.persons,0)<1)throw new Error('Mindestens eine Person.');
 if(num(t.budget,0)<0)throw new Error('Negative Werte sind nicht erlaubt.');
 const c=pwCriteria(crit,t);
 if(!c)return t;
 if(!V5)throw new Error('Wünsche & Grenzen brauchen eine neuere App-Version. Bitte die Seite neu laden.');
 return V5.candidate5(t,x=>{x.criteria=c}).trip;
}
/* Eigene Unterkunft als Ausgangspunkt. Preis: gesamt, je Nacht oder unbekannt (unbekannt bleibt offen, nie 0 €). */
function pwStay(s,nights){
 const name=String(s&&s.name||'').trim();if(!name||name.length>80)throw new Error('Bitte den Namen der Unterkunft eintragen (höchstens 80 Zeichen).');
 const url=String(s.url||'').trim();if(url&&!/^https?:\/\//i.test(url))throw new Error('Link muss mit https:// oder http:// beginnen.');
 const raw=String(s.price==null?'':s.price).trim(),N=Math.max(1,Math.round(num(nights,1)));
 let priceNight=0,priceOpen=true;
 if(raw!==''){const v=Number(raw.replace(',','.'));if(!Number.isFinite(v)||v<0)throw new Error('Preis: bitte einen Betrag ab 0 € oder leer lassen.');priceNight=Math.round((s.per==='gesamt'?v/N:v)*100)/100;priceOpen=false}
 const st={id:s.id||uid('s'),custom:true,name,ort:String(s.ort||'').trim().slice(0,120),priceNight,sauna:!!s.sauna,kitchen:!!s.kitchen,breakfast:!!s.breakfast,card:false,url};
 if(priceOpen)st.priceOpen=true;
 return st;
}
function pwStayTrip(draft,s,crit,opt){
 const d=Object.assign({},clone(draft||{}));const st=pwStay(s,typeof nightsOf==='function'?nightsOf(Object.assign(newTrip(),d)):d.nights);
 if(!String(d.title||'').trim()||d.title==='Neue Reise')d.title=st.name;
 if(!String(d.dest||'').trim()&&st.ort)d.dest=st.ort;
 d.customStays=(d.customStays||[]).concat([st]);d.stayId=st.id;d.catalog='none';
 return pwBuildTrip(d,crit,opt);
}
/* Erlebnis als Ausgangspunkt: eine oder mehrere Unternehmungen, optional an einem Reisetag. Unbekannter Preis bleibt offen. */
function pwAct(e){
 const title=String(e&&e.t||'').trim();if(!title||title.length>80)throw new Error('Bitte einen Titel mit höchstens 80 Zeichen eintragen.');
 const cat=Object.hasOwn(CAT,e.cat)?e.cat:'eigen',raw=String(e.cost==null?'':e.cost).trim();
 let cost=0,costOpen=true;if(raw!==''){const v=Number(raw.replace(',','.'));if(!Number.isFinite(v)||v<0)throw new Error('Preis: bitte einen Betrag ab 0 € oder leer lassen.');cost=v;costOpen=false}
 const link=String(e.link||'').trim();if(link&&!/^https?:\/\//i.test(link))throw new Error('Link muss mit https:// oder http:// beginnen.');
 return {id:e.id||uid('ca'),custom:true,t:title,cat,cost,costOpen,per:e.per==='grp'?'grp':'pp',dur:'',indoor:false,bring:[],link,note:String(e.note||'').trim().slice(0,500),slot:['morgen','mittag','nachm','abend'].includes(e.slot)?e.slot:'nachm'};
}
function pwErlebnisTrip(draft,acts,crit,opt){
 if(!Array.isArray(acts)||!acts.length)throw new Error('Bitte mindestens ein Erlebnis eintragen.');
 const d=clone(draft||{}),list=acts.map(pwAct),probe=Object.assign(newTrip(),d),days=typeof daysOf==='function'?daysOf(probe).length:1;
 if(!String(d.title||'').trim()||d.title==='Neue Reise')d.title=list[0].t;
 d.customActs=(d.customActs||[]).concat(list);
 d.items=(d.items||[]).concat(list.map((a,i)=>{const e=acts[i];let day=0;
  if(e.date&&probe.dateMode==='fix'&&pd(e.date)&&pd(probe.start)){day=Math.round((pd(e.date)-pd(probe.start))/864e5);if(day<0||day>=days)throw new Error('„'+a.t+'“: Datum liegt außerhalb der Reise.')}
  return {uid:uid('i'),act:a.id,day,slot:a.slot}}));
 return pwBuildTrip(d,crit,opt);
}
/* Was zum Schritt noch fehlt (Text) oder ''. Nur Pflichtangaben, alles andere ist überspringbar. */
function pwFehlt(key,d,crit){
 if(key==='zeit'){if(d.dateMode==='fix'&&!(pd(d.start)&&pd(d.end)&&pd(d.end)>=pd(d.start)))return 'Bitte An- und Abreise wählen (Abreise nicht vor Anreise).';const l=tripLengthError(Object.assign(newTrip(),d));if(l)return l}
 if(key==='geld'){if(num(d.persons,0)<1)return 'Mindestens eine Person.';try{pwCriteria({budgetWish:crit.budgetWish},d)}catch(e){return e.message}}
 if(key==='weg'){try{pwCriteria({maxDriveMin:crit.maxDriveMin,returnTime:crit.returnTime},d)}catch(e){return e.message}}
 return '';
}
/* Abgleich der Wünsche mit dem aktuellen Plan. Unbekanntes zählt nie als Treffer. state: ok | warn | bad | open */
function pwPruefung(t){
 const c=t&&t.criteria;if(!c)return [];
 const rows=[],P=(state,label,text)=>rows.push({state,label,text});
 /* Budget */
 const max=V5&&V5.budgetMax?V5.budgetMax(t):num(t.budget,0)||null;
 if(max!=null||c.budgetWish!=null){const k=cost(t),oc=openCosts(t),tot=k.total;
  if(max!=null&&tot>max)P('bad','Obergrenze',eur(tot)+' geplant, '+eur(tot-max)+' über '+eur(max)+'.');
  else if(oc.length)P('open','Obergrenze','Bisher '+eur(tot)+(max!=null?' von '+eur(max):'')+'. Noch '+oc.length+(oc.length===1?' Angabe':' Angaben')+' offen, daher keine sichere Aussage.');
  else if(max!=null)P('ok','Obergrenze',eur(tot)+' geplant, '+eur(max-tot)+' Luft bis '+eur(max)+'.');
  if(c.budgetWish!=null&&!oc.length)P(tot<=c.budgetWish?'ok':'warn','Wunschbudget',tot<=c.budgetWish?'Auch das Wunschbudget von '+eur(c.budgetWish)+' passt.':eur(tot-c.budgetWish)+' über dem Wunschbudget von '+eur(c.budgetWish)+'.')}
 /* Fahrzeit */
 if(c.maxDriveMin){const lim=c.maxDriveMin,txt=m=>Math.floor(m/60)+':'+String(m%60).padStart(2,'0')+' Std.';
  if(t.travel!=='auto')P('open','Fahrzeit','Grenze '+txt(lim)+'. Bei Bahn, Bus oder Flug bitte die Verbindung prüfen.');
  else if(t.kmSrc==='route'&&num(t.routeMin,0)>0){const m=num(t.routeMin,0);P(m<=lim?'ok':'bad','Fahrzeit','Berechnet ca. '+txt(m)+' einfach, Grenze '+txt(lim)+'.')}
  else if(num(t.km,0)>0){const m=Math.round(num(t.km,0)/80*60);P(m<=lim?'open':'warn','Fahrzeit','Geschätzt ca. '+txt(m)+' bei '+num(t.km,0)+' km, Grenze '+txt(lim)+'. Route berechnen für einen belastbaren Wert.')}
  else P('open','Fahrzeit','Grenze '+txt(lim)+'. Noch keine Strecke eingetragen.')}
 if(c.returnBy)P('open','Heimkehr','Zuhause sein bis '+(c.returnBy.date?fmtLong(pd(c.returnBy.date))+', ':'')+c.returnBy.time+' Uhr. Rückfahrt im Tagesplan einplanen.');
 /* Unterkunft: nur echte Merkmale; eigene Unterkunft ohne Haken = unbestätigt */
 const st=stayOf(t);
 [['must','Muss'],['like','Gern']].forEach(([g,gl])=>(c[g]||[]).forEach(k=>{const def=PW_KRIT.find(x=>x.key===k);if(!def||!def.stay)return;
  if(!st){P('open',pwLabel(k)+' ('+gl+')','Noch keine Unterkunft gewählt.');return}
  if(st[def.stay])P('ok',pwLabel(k)+' ('+gl+')',st.name+': laut '+(st.custom?'eurer Angabe':'Katalog')+' vorhanden.');
  else if(st.custom)P('open',pwLabel(k)+' ('+gl+')',st.name+': nicht bestätigt. Beim Anbieter prüfen.');
  else P(g==='must'?'bad':'warn',pwLabel(k)+' ('+gl+')',st.name+': laut Katalog nicht vorhanden.')}));
 if(c.cancel==='frei')P('open','Stornierbar','Kostenlose Stornierung beim konkreten Angebot prüfen, bevor ihr bucht.');
 const rest=[].concat(c.must||[]).filter(k=>!(PW_KRIT.find(x=>x.key===k)||{}).stay);
 if(rest.length)P('open','Weitere Muss-Wünsche',rest.map(pwLabel).join(', ')+': beim Ort, bei Unterkunft und Ideen selbst prüfen.');
 return rows;
}
function pwKurz(c){
 if(!c)return '';const p=[];
 if((c.must||[]).length)p.push('Muss: '+c.must.map(pwLabel).join(', '));
 if((c.like||[]).length)p.push('Gern: '+c.like.map(pwLabel).join(', '));
 if((c.avoid||[]).length)p.push('Lieber nicht: '+c.avoid.map(pwLabel).join(', '));
 if(c.budgetWish!=null)p.push('Wunschbudget '+eur(c.budgetWish));
 if(c.maxDriveMin)p.push('höchstens '+Math.floor(c.maxDriveMin/60)+':'+String(c.maxDriveMin%60).padStart(2,'0')+' Std. Fahrt');
 if(c.returnBy)p.push('zuhause bis '+c.returnBy.time);
 if(c.cancel==='frei')p.push('stornierbar');
 return p.join(' · ');
}

/* ---------- Oberfläche ---------- */
function pwHub(o){
 const opts=o||{};
 return '<div class="pw-hub" role="group" aria-label="Wie wollt ihr planen?">'+PW_WEGE.map(w=>'<button type="button" class="start-weg pw-weg" data-pw-weg="'+w.key+'" '+(w.go?'data-go="'+w.go+'"':'data-pw="'+w.act+'"')+'><b>'+pwEsc(w.titel)+'</b>'+(w.tag&&!opts.compact?'<span class="pw-tag">'+pwEsc(w.tag)+'</span>':'')+'<span class="small muted">'+pwEsc(w.text)+'</span><span class="start-pfeil" aria-hidden="true">→</span></button>').join('')+'</div>';
}
function pwKopf(titel,lead,back){return '<section class="block pw-kopf"><button type="button" class="lnk" data-go="'+(back||'planen')+'">← '+(back==='reisen'?'Meine Reisen':'Andere Wege')+'</button><h1>'+titel+'</h1>'+(lead?'<p class="lead muted">'+lead+'</p>':'')+'</section>'}
function pwFortsetzen(){
 let s=null;try{s=JSON.parse(sessionStorage.getItem(PW_KEY)||'null')}catch(e){}
 if(!s||!s.draft)return '';
 const d=s.draft,name=d.title&&d.title!=='Neue Reise'?d.title:(TYPES[d.type]||'Reise');
 return '<div class="note pw-weiter" role="status"><b>Angefangene Planung: '+pwEsc(name)+'</b><span class="small">Eure Eingaben sind noch da (nur in diesem Browser-Tab).</span><div class="row"><button type="button" class="btn sm" data-go="planen-schritte">Weiter planen</button><button type="button" class="btn ghost sm" data-pw="verwerfen">Verwerfen</button></div></div>';
}
function vPlanen(){
 const r=UI.pwRoute||'planen';
 if(r==='planen-schritte')return vPlanenSchritte();
 if(r==='planen-unterkunft')return vPlanenUnterkunft();
 if(r==='planen-erlebnis')return vPlanenErlebnis();
 return pwKopf('Wie wollt ihr planen?','Jeder Weg führt zur selben Reise mit Kosten, Terminen und Tagesplan. Ihr könnt jederzeit wechseln.','reisen')+
  '<section class="block">'+pwFortsetzen()+pwHub()+'</section>'+
  '<section class="block"><details class="panel start-vorlagen pw-vorlagen"'+(UI.pwVorlagen?' open':'')+'><summary><b>Vorlagen</b></summary><p class="small muted">Vorlagen bereiten Reiseart, Dauer und passende Aufgaben vor. In der Vorschau seht ihr, was enthalten ist.</p>'+(typeof tplButtons==='function'?tplButtons():'')+'</details></section>';
}
function pwFortschritt(i){
 return '<ol class="pw-steps" aria-label="Fortschritt">'+PW_SCHRITTE.map((s,k)=>'<li'+(k===i?' aria-current="step"':'')+' class="'+(k<i?'done':k===i?'now':'')+'"><button type="button" class="pw-dot" data-pw="step" data-val="'+k+'" aria-label="Schritt '+(k+1)+': '+pwEsc(s.kurz)+(k<i?' (erledigt)':'')+'"><span>'+(k<i?'✓':k+1)+'</span></button><small>'+pwEsc(s.kurz)+'</small></li>').join('')+'</ol>';
}
function pwGradZeile(crit,k){
 const g=pwGradOf(crit,k);
 return '<div class="pw-krit" role="group" aria-label="'+pwEsc(pwLabel(k))+'"><span class="pw-krit-name">'+pwEsc(pwLabel(k))+'</span><span class="pw-krit-wahl">'+PW_GRAD.map(([v,l])=>'<button type="button" class="opt pw-grad" data-pw="grad" data-key="'+k+'" data-val="'+v+'" aria-pressed="'+(g===v)+'">'+l+'</button>').join('')+'</span></div>';
}
function pwWunschEditor(crit,type){
 const first=(PW_KRIT_ART[type]||[]).slice(),rest=PW_KRIT.map(x=>x.key).filter(k=>!first.includes(k)),gewaehlt=rest.filter(k=>pwGradOf(crit,k));
 return '<p class="small muted">Muss = darf nicht fehlen. Gern = wäre schön. Lieber nicht = möglichst vermeiden. Nochmal tippen hebt die Wahl auf.</p>'+
  '<div class="pw-krits">'+first.concat(gewaehlt).map(k=>pwGradZeile(crit,k)).join('')+'</div>'+
  '<details class="pw-mehr"'+(UI.pwMehr?' open':'')+'><summary class="small"><b>Weitere Wünsche</b></summary><div class="pw-krits">'+rest.filter(k=>!gewaehlt.includes(k)).map(k=>pwGradZeile(crit,k)).join('')+'</div></details>'+
  '<div class="fld"><span>Kostenlos stornierbar?</span><div class="opts">'+[['frei','Ja, wichtig'],['egal','Egal'],['','Noch offen']].map(([v,l])=>'<button type="button" class="opt" data-pw="cancel" data-val="'+v+'" aria-pressed="'+((crit.cancel||'')===v)+'">'+l+'</button>').join('')+'</div></div>'+
  '<label class="fld"><span>Sonst noch etwas? (optional)</span><textarea data-pw-f="notes" rows="2" maxlength="2000" placeholder="z. B. Abends nicht mehr Auto fahren">'+pwEsc(crit.notes||'')+'</textarea></label>';
}
function pwSchrittHtml(key,d,s){
 const c=s.crit,o=(act,val,label,sub,on)=>opt(act,val,label,sub,on);
 if(key==='art')return '<div class="fld"><span>Art der Reise</span><div class="opts">'+Object.keys(TYPES).map(k=>o('d-type',k,TYPES[k],'',d.type===k)).join('')+'</div>'+(typeof stilHinweis==='function'?stilHinweis(d):'')+'</div>'+
  '<label class="fld"><span>Name der Reise (optional)</span><input type="text" data-f="title" value="'+pwEsc(d.title==='Neue Reise'?'':d.title)+'" maxlength="80" placeholder="z. B. Silvester im Schnee"></label>';
 if(key==='ziel')return '<div class="fld"><span>Wie weit seid ihr?</span><div class="opts pw-col">'+
   o('pw-ziel','fest','Wir wissen, wohin','Ort oder Region eintragen',s.ziel==='fest')+
   o('pw-ziel','katalog','Ideen-Katalog Allgäu & Tirol','4 Orte, 13 Unterkünfte, 30+ Ideen',s.ziel==='katalog')+
   o('pw-ziel','offen','Noch offen','später suchen oder vergleichen',s.ziel==='offen')+'</div></div>'+
  (s.ziel==='fest'?'<label class="fld"><span>Ziel</span><input type="text" data-f="dest" value="'+pwEsc(d.dest||'')+'" maxlength="120" placeholder="z. B. Oberstdorf"></label>':'')+
  (s.ziel==='offen'?'<p class="small muted">Nach dem Anlegen findet ihr unter „Ziel & Unterkunft“ Orte und Angebote. Oder ihr sucht zuerst im Bereich <b>Entdecken</b>; eure Angaben hier bleiben gespeichert.</p>':'');
 if(key==='zeit'){const dm=d.dateMode;return '<div class="fld"><span>Zeitraum</span><div class="opts">'+o('d-dm','fix','Festes Datum','von – bis',dm==='fix')+o('d-dm','flex','Ungefähr','Monat + Nächte',dm==='flex')+o('d-dm','open','Noch offen','nur Dauer',dm==='open')+'</div></div><div class="form">'+
   (dm==='fix'?'<label class="fld"><span>Anreise</span><input type="date" data-f="start" value="'+pwEsc(d.start)+'"></label><label class="fld"><span>Abreise</span><input type="date" data-f="end" value="'+pwEsc(d.end)+'"></label>':'')+
   (dm==='flex'?'<label class="fld"><span>Monat</span><input type="month" data-f="month" value="'+pwEsc(d.month)+'"></label>':'')+
   (dm!=='fix'?'<label class="fld"><span>Nächte</span><input type="number" min="0" data-f="nights" value="'+pwEsc(d.nights)+'"></label>':'')+'</div>'+
   (dm==='fix'&&pd(d.start)&&pd(d.end)&&pd(d.end)>=pd(d.start)?'<p class="small">'+nightsOf(d)+(nightsOf(d)===1?' Nacht':' Nächte')+'</p>':'')}
 if(key==='geld')return '<div class="form"><label class="fld"><span>Personen</span><input type="number" min="1" max="20" data-f="persons" value="'+pwEsc(d.persons)+'"></label>'+
  '<label class="fld"><span>Obergrenze gesamt (€)</span><input type="number" min="0" step="50" data-f="budget" value="'+pwEsc(d.budget)+'"><small class="muted">Mehr darf es nicht kosten. Danach richtet sich „im Budget“.</small></label>'+
  '<label class="fld"><span>Wunschbudget (€, optional)</span><input type="number" min="0" step="50" data-pw-f="budgetWish" value="'+pwEsc(c.budgetWish==null?'':c.budgetWish)+'"><small class="muted">Schön wäre, wenn es nur so viel kostet.</small></label></div>';
 if(key==='weg'){const h=c.maxDriveMin?String(c.maxDriveMin):'';return '<div class="fld"><span>Anreise mit</span><div class="opts">'+o('d-travel','auto','Auto','',d.travel==='auto')+o('d-travel','bahn','Bahn','',d.travel==='bahn')+o('d-travel','flug','Flug / Bus','',d.travel==='flug')+'</div></div>'+
  '<div class="form"><label class="fld"><span>Start-Ort</span><input type="text" data-f="origin" value="'+pwEsc(d.origin)+'" placeholder="z. B. 73110 Hattenhofen"></label>'+
  '<label class="fld"><span>Höchstens so lange unterwegs (einfach)</span><select data-pw-f="maxDriveMin"><option value="">Egal</option>'+[60,90,120,150,180,240,300,360,480].map(m=>'<option value="'+m+'"'+(h===String(m)?' selected':'')+'>'+Math.floor(m/60)+':'+String(m%60).padStart(2,'0')+' Std.</option>').join('')+'</select></label>'+
  '<label class="fld"><span>Am letzten Tag zuhause sein bis (optional)</span><input type="time" data-pw-f="returnTime" value="'+pwEsc(c.returnTime||'')+'"><small class="muted">Damit noch Zeit zum Ankommen bleibt.</small></label></div>'}
 if(key==='wichtig')return pwWunschEditor(c,d.type);
 return pwUeberblick(d,s);
}
function pwUeberblick(d,s){
 const zeile=(i,titel,wert)=>'<div class="pw-sum"><div><span class="eyebrow">'+titel+'</span><b>'+wert+'</b></div><button type="button" class="lnk" data-pw="step" data-val="'+i+'">Ändern</button></div>';
 const zeit=d.dateMode==='fix'?rangeText(d):d.dateMode==='flex'?(d.month?rangeText(d):'Monat noch offen')+'':'Noch offen · '+num(d.nights,0)+' Nächte';
 let crit='';try{crit=pwKurz(pwCriteria(s.crit,d))||'Keine besonderen Wünsche'}catch(e){crit='<span class="bad">'+pwEsc(e.message)+'</span>'}
 return '<div class="pw-sums">'+zeile(0,'Art',pwEsc(TYPES[d.type]||d.type)+(d.title&&d.title!=='Neue Reise'?' · '+pwEsc(d.title):''))+
  zeile(1,'Ziel',s.ziel==='fest'?pwEsc(d.dest||'noch nicht eingetragen'):s.ziel==='katalog'?'Ideen-Katalog Allgäu & Tirol':'Noch offen')+
  zeile(2,'Zeit',pwEsc(zeit))+
  zeile(3,'Budget',num(d.persons,1)+(num(d.persons,1)===1?' Person':' Personen')+' · Obergrenze '+(num(d.budget,0)>0?eur(d.budget):'keine')+(s.crit.budgetWish!=null&&s.crit.budgetWish!==''?' · Wunsch '+eur(s.crit.budgetWish):''))+
  zeile(4,'Anreise',pwEsc({auto:'Auto',bahn:'Bahn',flug:'Flug / Bus'}[d.travel]||d.travel)+(d.origin?' ab '+pwEsc(d.origin):''))+
  zeile(5,'Wünsche',typeof crit==='string'&&crit.indexOf('<span')===0?crit:pwEsc(crit))+'</div>'+
  (pwCriteriaSafe(s.crit,d)?'<p class="small muted">Wünsche & Grenzen werden mit der Reise gespeichert (Format 5). Ältere Stände der Website zeigen die Reise dann nur an.</p>':'');
}
function pwCriteriaSafe(c,d){try{return !!pwCriteria(c,d)}catch(e){return false}}
function vPlanenSchritte(){
 const s=pwState(),d=UI.draft,i=Math.max(0,Math.min(PW_SCHRITTE.length-1,s.step|0)),step=PW_SCHRITTE[i],last=i===PW_SCHRITTE.length-1;
 const fehlt=pwFehlt(step.key,d,s.crit);
 return pwKopf('Schritt für Schritt','')+
  '<section class="block"><div class="panel pw-wizard">'+pwFortschritt(i)+
  '<div class="pw-frage" data-pw-step="'+step.key+'"><span class="eyebrow">Schritt '+(i+1)+' von '+PW_SCHRITTE.length+'</span><h2 id="pw-titel" tabindex="-1">'+pwEsc(step.titel)+'</h2>'+
  '<div id="draft">'+pwSchrittHtml(step.key,d,s)+'</div></div>'+
  (fehlt&&!last?'<p class="small pw-fehlt" role="status">'+pwEsc(fehlt)+'</p>':'')+
  '<p id="pw-error" class="pw-fehlt" role="alert" hidden></p>'+
  '<div class="pw-nav">'+(i>0?'<button type="button" class="btn ghost" data-pw="zurueck">Zurück</button>':'<span></span>')+
  (last?'<button type="button" class="btn" data-pw="anlegen">Reise anlegen</button>':'<button type="button" class="btn" data-pw="weiter"'+(fehlt?' aria-disabled="true"':'')+'>'+'Weiter'+'</button>')+'</div>'+
  '<div class="row pw-neben">'+(i<PW_SCHRITTE.length-1&&i>0?'<button type="button" class="lnk small" data-pw="step" data-val="'+(PW_SCHRITTE.length-1)+'">Direkt zum Überblick</button>':'')+
  '<button type="button" class="lnk small" data-go="neu">Alles auf einer Seite zeigen</button>'+
  (s.undo?'<button type="button" class="lnk small" data-pw="undo">Rückgängig: Eingaben wiederherstellen</button>':'<button type="button" class="lnk small" data-pw="reset">Neu beginnen</button>')+'</div>'+
  '</div></section>';
}
function vPlanenUnterkunft(){
 const s=pwState(),d=UI.draft,st=s.stay||{},dm=d.dateMode;
 return pwKopf('Unterkunft steht schon','Tragt ein, was ihr wisst. Unbekannte Preise bleiben offen und werden nicht als 0 € gerechnet.')+
  '<section class="block"><div class="panel pw-wizard"><h2>Die Unterkunft</h2><div class="form">'+
  '<label class="fld"><span>Name</span><input type="text" data-pw-s="name" value="'+pwEsc(st.name||'')+'" maxlength="80" placeholder="z. B. Landhaus Alpenblick"></label>'+
  '<label class="fld"><span>Ort</span><input type="text" data-pw-s="ort" value="'+pwEsc(st.ort||'')+'" maxlength="120"></label>'+
  '<label class="fld"><span>Link zum Inserat (optional)</span><input type="url" data-pw-s="url" value="'+pwEsc(st.url||'')+'" placeholder="https://"></label>'+
  '<label class="fld"><span>Preis (optional)</span><input type="number" min="0" step="1" data-pw-s="price" value="'+pwEsc(st.price==null?'':st.price)+'"></label></div>'+
  '<div class="fld"><span>Preis gilt</span><div class="opts">'+[['nacht','pro Nacht'],['gesamt','für den ganzen Aufenthalt']].map(([v,l])=>'<button type="button" class="opt" data-pw="stay-per" data-val="'+v+'" aria-pressed="'+((st.per||'nacht')===v)+'">'+l+'</button>').join('')+'</div></div>'+
  '<div class="fld"><span>Laut Anbieter vorhanden</span><div class="opts">'+[['sauna','Sauna / Wellness'],['kitchen','Küche'],['breakfast','Frühstück']].map(([v,l])=>'<button type="button" class="opt" data-pw="stay-feat" data-val="'+v+'" aria-pressed="'+!!st[v]+'">'+l+'</button>').join('')+'</div><small class="muted">Nur antippen, was der Anbieter wirklich nennt.</small></div>'+
  '<h2>Wann und wer?</h2><div id="draft"><div class="fld"><div class="opts">'+opt('d-dm','fix','Festes Datum','von – bis',dm==='fix')+opt('d-dm','open','Noch offen','nur Dauer',dm!=='fix')+'</div></div><div class="form">'+
  (dm==='fix'?'<label class="fld"><span>Anreise</span><input type="date" data-f="start" value="'+pwEsc(d.start)+'"></label><label class="fld"><span>Abreise</span><input type="date" data-f="end" value="'+pwEsc(d.end)+'"></label>':'<label class="fld"><span>Nächte</span><input type="number" min="0" data-f="nights" value="'+pwEsc(d.nights)+'"></label>')+
  '<label class="fld"><span>Personen</span><input type="number" min="1" max="20" data-f="persons" value="'+pwEsc(d.persons)+'"></label>'+
  '<label class="fld"><span>Obergrenze gesamt (€)</span><input type="number" min="0" step="50" data-f="budget" value="'+pwEsc(d.budget)+'"></label>'+
  '<label class="fld"><span>Start-Ort</span><input type="text" data-f="origin" value="'+pwEsc(d.origin)+'"></label></div></div>'+
  '<p id="pw-error" class="pw-fehlt" role="alert" hidden></p>'+
  '<div class="pw-nav"><span></span><button type="button" class="btn" data-pw="anlegen-unterkunft">Reise anlegen</button></div>'+
  '<p class="small muted">Danach: konkretes Angebot mit Gebühren und Storno unter „Angebote vergleichen“ erfassen, Ideen für die Tage sammeln.</p></div></section>';
}
function vPlanenErlebnis(){
 const s=pwState(),d=UI.draft,dm=d.dateMode,acts=s.acts||[];
 const liste=acts.length?'<ul class="pw-acts">'+acts.map((a,i)=>'<li><b>'+pwEsc(a.t)+'</b><small class="muted">'+pwEsc((CAT[a.cat]||'Eigene')+(a.date?' · '+fmtLong(pd(a.date)):'')+' · '+(String(a.cost==null?'':a.cost).trim()===''?'Preis offen':eur(Number(String(a.cost).replace(',','.')))+(a.per==='grp'?' gesamt':' p. P.')))+'</small><button type="button" class="lnk small" data-pw="act-del" data-val="'+i+'">Entfernen</button></li>').join('')+'</ul>':'';
 const e=UI.pwAct||{};
 return pwKopf('Erlebnis zuerst','Was wollt ihr unbedingt erleben? Die Reise wird darum herum gebaut: Unterkunft, Anreise und weitere Ideen kommen danach.')+
  '<section class="block"><div class="panel pw-wizard"><h2>Eure Erlebnisse</h2>'+liste+
  '<div class="form pw-act-form">'+
  '<label class="fld"><span>Was?</span><input type="text" id="pw-a-t" value="'+pwEsc(e.t||'')+'" maxlength="80" placeholder="z. B. Therme Erding, Konzert, Rodeln"></label>'+
  '<label class="fld"><span>Art</span><select id="pw-a-cat">'+Object.keys(CAT).map(k=>'<option value="'+k+'"'+((e.cat||'eigen')===k?' selected':'')+'>'+pwEsc(CAT[k])+'</option>').join('')+'</select></label>'+
  (dm==='fix'?'<label class="fld"><span>Datum (optional)</span><input type="date" id="pw-a-date" value="'+pwEsc(e.date||'')+'" min="'+pwEsc(d.start)+'" max="'+pwEsc(d.end)+'"></label>':'')+
  '<label class="fld"><span>Preis (optional)</span><input type="number" min="0" step="1" id="pw-a-cost" value="'+pwEsc(e.cost||'')+'"></label>'+
  '<label class="fld"><span>Preis gilt</span><select id="pw-a-per"><option value="pp">pro Person</option><option value="grp"'+(e.per==='grp'?' selected':'')+'>für alle zusammen</option></select></label>'+
  '<label class="fld"><span>Link (optional)</span><input type="url" id="pw-a-link" value="'+pwEsc(e.link||'')+'" placeholder="https://"></label></div>'+
  '<div class="row"><button type="button" class="btn ghost sm" data-pw="act-add">'+(acts.length?'Weiteres Erlebnis hinzufügen':'Erlebnis hinzufügen')+'</button></div>'+
  '<h2>Wann und wer?</h2><div id="draft"><div class="fld"><div class="opts">'+opt('d-dm','fix','Festes Datum','von – bis',dm==='fix')+opt('d-dm','open','Noch offen','nur Dauer',dm!=='fix')+'</div></div><div class="form">'+
  (dm==='fix'?'<label class="fld"><span>Anreise</span><input type="date" data-f="start" value="'+pwEsc(d.start)+'"></label><label class="fld"><span>Abreise</span><input type="date" data-f="end" value="'+pwEsc(d.end)+'"></label>':'<label class="fld"><span>Nächte</span><input type="number" min="0" data-f="nights" value="'+pwEsc(d.nights)+'"></label>')+
  '<label class="fld"><span>Personen</span><input type="number" min="1" max="20" data-f="persons" value="'+pwEsc(d.persons)+'"></label>'+
  '<label class="fld"><span>Ziel / Ort</span><input type="text" data-f="dest" value="'+pwEsc(d.dest||'')+'"></label>'+
  '<label class="fld"><span>Start-Ort</span><input type="text" data-f="origin" value="'+pwEsc(d.origin)+'"></label></div></div>'+
  '<p id="pw-error" class="pw-fehlt" role="alert" hidden></p>'+
  '<div class="pw-nav"><span></span><button type="button" class="btn" data-pw="anlegen-erlebnis">Reise anlegen</button></div>'+
  '<p class="small muted">Tipp: Im Bereich <b>Entdecken</b> findet ihr Ideen im Umkreis und könnt sie später zu dieser Reise hinzufügen.</p></div></section>';
}
/* In der Reise (Überblick): Wünsche & Grenzen mit Abgleich gegen den Plan */
function pwWuenscheBlock(t){
 if(!t)return '';
 const c=t.criteria,rows=pwPruefung(t),edit=typeof f5CanEdit==='function'&&f5CanEdit(t);
 const icon={ok:'✓',warn:'!',bad:'✕',open:'?'},word={ok:'passt',warn:'Achtung',bad:'passt nicht',open:'offen'};
 const krit=c?['must','like','avoid'].map(g=>(c[g]||[]).length?'<div class="pw-chips"><span class="eyebrow">'+PW_GRAD.find(x=>x[0]===g)[1]+'</span>'+c[g].map(k=>'<span class="pw-chip" data-grad="'+g+'">'+pwEsc(pwLabel(k))+'</span>').join('')+'</div>':'').join(''):'';
 const body=(c?krit+(rows.length?'<ul class="pw-checks">'+rows.map(r=>'<li data-state="'+r.state+'"><span class="pw-ico" aria-hidden="true">'+icon[r.state]+'</span><span><b>'+pwEsc(r.label)+'</b> <small class="pw-state">'+word[r.state]+'</small><br><span class="small">'+pwEsc(r.text)+'</span></span></li>').join('')+'</ul>':'')+(c.notes?'<p class="small"><b>Notiz:</b> '+pwEsc(c.notes)+'</p>':''):
   '<p class="small muted">Was muss sein, was wäre schön, was lieber nicht? Der Planer gleicht das mit Budget, Fahrzeit und Unterkunft ab.</p>')+
  (edit?'<div class="row"><button type="button" class="btn ghost sm" data-pw="krit-open">'+(c?'Wünsche ändern':'Wünsche & Grenzen festlegen')+'</button></div>':'');
 const bad=rows.filter(r=>r.state==='bad').length,open=rows.filter(r=>r.state==='open').length;
 const sum=c?(bad?bad+' passt nicht':rows.length?(open?open+' offen':'alles passt'):'festgelegt'):'noch keine';
 return '<section class="block pw-block">'+(typeof fold==='function'?fold('pw-wuensche','Wünsche & Grenzen',sum,body,{open:!!bad}):'<h2>Wünsche & Grenzen</h2>'+body)+'</section>';
}
function pwKritSheet(t){
 UI.pwEdit={tid:t.id,src:JSON.stringify(t),crit:pwAusCriteria(t.criteria,t),budget:num(t.budget,0)};
 pwKritSheetRender();
}
function pwAusCriteria(c,t){const x=pwLeer();if(!c)return x;['must','like','avoid'].forEach(g=>x[g]=(c[g]||[]).slice());x.budgetWish=c.budgetWish==null?null:c.budgetWish;x.maxDriveMin=c.maxDriveMin||null;x.returnTime=c.returnBy?c.returnBy.time:'';x.cancel=c.cancel||null;x.notes=c.notes||'';return x}
function pwKritSheetRender(){
 const e=UI.pwEdit,t=e&&Store.get(e.tid);if(!t)return;const c=e.crit,h=c.maxDriveMin?String(c.maxDriveMin):'';
 openSheet('<span class="eyebrow">'+pwEsc(t.title)+'</span><h2>Wünsche & Grenzen</h2><div class="pw-sheet">'+pwWunschEditor(c,t.type)+
  '<div class="form"><label class="fld"><span>Wunschbudget (€, optional)</span><input type="number" min="0" step="50" data-pw-f="budgetWish" value="'+pwEsc(c.budgetWish==null?'':c.budgetWish)+'"><small class="muted">Obergrenze: '+(num(t.budget,0)>0?eur(t.budget)+' (in den Eckdaten)':'keine')+'</small></label>'+
  '<label class="fld"><span>Höchstens so lange unterwegs (einfach)</span><select data-pw-f="maxDriveMin"><option value="">Egal</option>'+[60,90,120,150,180,240,300,360,480].map(m=>'<option value="'+m+'"'+(h===String(m)?' selected':'')+'>'+Math.floor(m/60)+':'+String(m%60).padStart(2,'0')+' Std.</option>').join('')+'</select></label>'+
  '<label class="fld"><span>Am letzten Tag zuhause sein bis</span><input type="time" data-pw-f="returnTime" value="'+pwEsc(c.returnTime||'')+'"></label></div>'+
  (e.confirm?'<div class="note" role="alert"><b>Format 5</b><p class="small">'+pwEsc(e.confirm)+'</p></div>':'')+
  '<p id="pw-error" class="pw-fehlt" role="alert" hidden></p><div class="row"><button type="button" class="btn" data-pw="krit-save">'+(e.confirm?'Umstellen und speichern':'Speichern')+'</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div></div>');
}
function pwFehler(msg){const b=document.getElementById('pw-error');if(b){b.textContent=msg;b.hidden=false;if(b.scrollIntoView)try{b.scrollIntoView({block:'center'})}catch(e){}}else alertMsg(msg)}
function pwAnlegen(t,ziel){
 if(!Store.put(t,true))throw new Error('Die Reise konnte nicht gespeichert werden. Eure Eingaben bleiben erhalten.');
 pwVergessen();go('r-'+t.id+'-'+ziel);
 alertMsg('Reise „'+t.title+'“ angelegt.');
}
/* Ereignisse: eigene Attribute data-pw, data-pw-f, data-pw-s; Reisefelder laufen über #draft und data-f (app/ereignisse.js). */
if(typeof document!=='undefined'&&document.addEventListener){
 document.addEventListener('click',e=>{
  const dAct=e.target.closest&&e.target.closest('[data-act^="d-"]');if(dAct&&UI.view==='planen'){setTimeout(pwMerken,0);return}
  const b=e.target.closest&&e.target.closest('[data-pw],[data-act^="pw-ziel"]');if(!b)return;
  if(Store.corruptRaw!==null)return;
  const a=b.getAttribute('data-pw')||b.getAttribute('data-act'),v=b.getAttribute('data-val');
  if(UI.pwEdit&&['grad','cancel','krit-save'].includes(a)&&document.querySelector('.pw-sheet')){pwSheetClick(a,b,v);return}
  const s=pwState();
  switch(a){
   case 'pw-vorlage':UI.pwVorlagen=true;if(UI.view!=='planen'||UI.pwRoute!=='planen')go('planen');else render();setTimeout(()=>{const d=document.querySelector('.pw-vorlagen');if(d&&d.scrollIntoView)try{d.scrollIntoView({block:'start'})}catch(err){}},0);return;
   case 'verwerfen':pwVergessen();render();return;
   case 'pw-ziel':s.ziel=v;if(v==='katalog')UI.draft.catalog='allgaeu';else UI.draft.catalog='none';break;
   case 'step':s.step=Math.max(0,Math.min(PW_SCHRITTE.length-1,+v||0));pwMerken();render();pwFokus();return;
   case 'zurueck':s.step=Math.max(0,s.step-1);pwMerken();render();pwFokus();return;
   case 'weiter':{const f=pwFehlt(PW_SCHRITTE[s.step].key,UI.draft,s.crit);if(f){pwFehler(f);return}s.step=Math.min(PW_SCHRITTE.length-1,s.step+1);pwMerken();render();pwFokus();return}
   case 'reset':{s.undo=pwSnapshot();const u=s.undo;UI.draft=newTrip();UI.pw=Object.assign({step:0,crit:pwLeer(),ziel:'offen',stay:{},acts:[]},{undo:u});pwMerken();render();return}
   case 'undo':if(s.undo){pwRestore(s.undo);render()}return;
   case 'grad':{const now=pwGradOf(s.crit,b.getAttribute('data-key'));s.crit=pwSetGrad(s.crit,b.getAttribute('data-key'),now===v?'':v);UI.pwMehr=!!b.closest('.pw-mehr');break}
   case 'cancel':s.crit.cancel=v||null;break;
   case 'anlegen':{try{const t=pwBuildTrip(UI.draft,s.crit);pwAnlegen(t,s.ziel==='katalog'?'angebote':'ueber')}catch(err){pwFehler(err.message)}return}
   case 'stay-per':s.stay.per=v;break;
   case 'stay-feat':s.stay[v]=!s.stay[v];break;
   case 'anlegen-unterkunft':{try{pwStayRead();const t=pwStayTrip(UI.draft,s.stay,null);pwAnlegen(t,'unterkunft')}catch(err){pwFehler(err.message)}return}
   case 'act-add':{try{const x=pwActRead();pwAct(x);s.acts=(s.acts||[]).concat([x]);UI.pwAct=null;pwMerken();render();const f=document.getElementById('pw-a-t');if(f)f.focus()}catch(err){pwFehler(err.message)}return}
   case 'act-del':s.acts=(s.acts||[]).filter((x,i)=>i!==+v);break;
   case 'anlegen-erlebnis':{try{let acts=(s.acts||[]).slice();const x=pwActRead();if(String(x.t||'').trim())acts=acts.concat([x]);const t=pwErlebnisTrip(UI.draft,acts,null);pwAnlegen(t,'plan')}catch(err){pwFehler(err.message)}return}
   case 'krit-open':{const t=cur();if(t)pwKritSheet(t);return}
   default:return;
  }
  pwMerken();render();
 });
 const feld=e=>{
  const el=e.target;if(!el||!el.getAttribute)return;
  const f=el.getAttribute('data-pw-f'),sf=el.getAttribute('data-pw-s');
  if(f){const c=UI.pwEdit&&el.closest('.pw-sheet')?UI.pwEdit.crit:pwState().crit;
   if(f==='budgetWish')c.budgetWish=el.value===''?null:Number(el.value);
   else if(f==='maxDriveMin')c.maxDriveMin=el.value===''?null:Number(el.value);
   else if(f==='returnTime')c.returnTime=el.value;
   else if(f==='notes')c.notes=el.value;
   if(!el.closest('.pw-sheet'))pwMerken();return}
  if(sf){pwState().stay[sf]=el.value;pwMerken();return}
  if(el.closest&&el.closest('#draft')&&UI.view==='planen')setTimeout(pwMerken,0);
  if(el.closest&&el.closest('.pw-act-form')){UI.pwAct=pwActRead()}
 };
 document.addEventListener('input',feld);document.addEventListener('change',feld);
}
function pwFokus(){const h=document.getElementById('pw-titel');if(h)try{h.focus({preventScroll:false})}catch(e){}}
function pwStayRead(){document.querySelectorAll('[data-pw-s]').forEach(el=>{pwState().stay[el.getAttribute('data-pw-s')]=el.value})}
function pwActRead(){const g=id=>{const el=document.getElementById(id);return el?el.value:''};return {t:g('pw-a-t'),cat:g('pw-a-cat')||'eigen',date:g('pw-a-date'),cost:g('pw-a-cost'),per:g('pw-a-per')||'pp',link:g('pw-a-link')}}
function pwSheetClick(a,b,v){
 const e=UI.pwEdit,t=Store.get(e.tid);if(!t){closeSheet();return}
 if(a==='grad'){const k=b.getAttribute('data-key'),now=pwGradOf(e.crit,k);e.crit=pwSetGrad(e.crit,k,now===v?'':v);UI.pwMehr=!!b.closest('.pw-mehr');pwKritSheetRender();return}
 if(a==='cancel'){e.crit.cancel=v||null;pwKritSheetRender();return}
 if(a==='krit-save'){
  try{
   if(e.src!==JSON.stringify(t))throw new Error('Die Reise hat sich inzwischen geändert. Bitte erneut öffnen.');
   const c=pwCriteria(e.crit,t);
   const r=f5Commit(t,x=>{if(c)x.criteria=c;else delete x.criteria},{confirmed:!!e.confirm});
   if(!r.ok&&r.needsConfirm){e.confirm=r.notice;pwKritSheetRender();return}
   if(!r.ok)throw new Error(r.error||'Nicht gespeichert.');
   UI.pwEdit=null;closeSheet();render();alertMsg('Wünsche & Grenzen gespeichert.');
  }catch(err){pwFehler(err.message)}
 }
}
