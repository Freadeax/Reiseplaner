/* Reiseplaner · Reisestil: Der Planer passt Teile, Startansicht, Hinweise und Tempo an die Art der Reise an (docs/REISESTIL.md).
   Eigener Teil der App, geladen nach app/kosten.js und vor app/aufbau.js. Klassisches Skript ohne Bundler: Alle Teile teilen sich den
   globalen Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen (TYPES, TEMPLATES).
   Kein neues Speicherfeld: Der Stil ist t.type. Ändert nie eine Reise und keine Berechnung; nur Anzeige und Hinweise.
   - STILE: einzige Quelle je Stil (Name, Satz, Tempo, Bereichsnamen, leise Teile, Startteil).
   - styleOf(t): {key,label,kurz,pace,paceSrc} – Schnittstelle auch für andere Module (Fixpunkte und Puffer lesen pace).
   - stilTeile(t,parts,tab): sichtbare Teile eines Bereichs; Teile mit Inhalt oder der geöffnete Teil bleiben immer sichtbar.
   - stilStart(t,key), stilBereichName(t,key): Startteil und Name eines Bereichs.
   - stilSchritte(t,now): Hinweise für „Als Nächstes“ (app/aufbau.js naechstes).
   - stilHinweis(t), stilBlock(t): ein Satz unter „Art“ in den Eckdaten und der aufklappbare Abschnitt im Überblick.
   Darstellungs-Einstellung „Alle Teile zeigen“ je Browser in localStorage rp-stil (kein Reisedatum, keine Synchronisation). */
"use strict";
const STIL_PACE={ruhig:'ruhig',normal:'normal',aktiv:'aktiv',gemischt:'normal'};
const STIL_PACE_TXT={ruhig:'ruhig: viel freie Zeit, wenige Termine am Tag',normal:'ausgewogen: Programm und Pausen im Wechsel',aktiv:'aktiv: mehr Programm, Wege einplanen'};
const STILE={
 tag:{label:'Tagesausflug',kurz:'Ein Tag unterwegs, abends wieder zu Hause. Ohne Unterkunft, dafür mit Blick auf die Fahrzeit.',pace:'normal',namen:{ziel:'Ziel & Anreise'},leise:['suche'],start:{}},
 wochenende:{label:'Wochenende',kurz:'Zwei, drei Nächte raus. Alle Teile stehen bereit.',pace:'normal',namen:{},leise:[],start:{}},
 stadt:{label:'Städtetrip',kurz:'Viel zu Fuß, mit Bus und Bahn. Ideen sammeln zuerst, Tickets und Öffnungszeiten im Blick.',pace:'normal',namen:{},leise:[],start:{programm:'unternehmen'}},
 wellness:{label:'Wellness-Auszeit',kurz:'Eine gute Unterkunft, viel Ruhe, wenige feste Termine.',pace:'ruhig',namen:{},leise:[],start:{}},
 rund:{label:'Rundreise & Roadtrip',kurz:'Mehrere Stationen: Etappen, Fahrtage und eine Unterkunft je Ort.',pace:'normal',namen:{ziel:'Route & Unterkünfte'},leise:[],start:{}},
 strand:{label:'Bade- & Sommerurlaub',kurz:'Ein Ort, länger bleiben, Programm nach Lust und Wetter.',pace:'normal',namen:{},leise:[],start:{}},
 winter:{label:'Winter & Schnee',kurz:'Schnee, Wärme und kleine Ausflüge. Pakete aus dem Katalog als Abkürzung.',pace:'normal',namen:{},leise:[],start:{}},
 familie:{label:'Familienurlaub',kurz:'Mit Kindern: Pausen, Regenalternativen und Ermäßigungen im Blick.',pace:'ruhig',namen:{},leise:[],start:{}}
};
/* Neue Werte in der Art-Auswahl (TYPES, app/basis.js); bestehende Namen bleiben bis auf die Rundreise unverändert. */
TYPES.rund=STILE.rund.label;
if(!TYPES.wellness)TYPES.wellness=STILE.wellness.label;
if(!TYPES.familie)TYPES.familie=STILE.familie.label;
/* Vorlagen: Wellness legt den passenden Stil an; neue Vorlage Familienurlaub (nur Struktur und Aufgaben, keine Preise). */
TPL_CHECKS.familie=['Ausweise bzw. Kinderreisepässe prüfen','Unterkunft: Kinderbett, Hochstuhl, Familienzimmer anfragen','Ermäßigungen und Familienkarten für Ausflüge prüfen','Pausen auf der Anfahrt einplanen','Eine Idee für Regentage sammeln','Reiseapotheke für Kinder','Beschäftigung für die Fahrt'];
(()=>{const w=TEMPLATES.find(x=>x.id==='wellness');if(w)w.make=()=>tplTrip({title:'Wellness-Auszeit',type:'wellness',nights:2,travel:'auto'},'wellness');
 if(!TEMPLATES.some(x=>x.id==='familie')){const i=TEMPLATES.findIndex(x=>x.id==='silvester');TEMPLATES.splice(i<0?TEMPLATES.length:i,0,{id:'familie',name:'Familienurlaub',sub:'7 Nächte, mit Kindern',make:()=>tplTrip({title:'Familienurlaub',type:'familie',nights:7,persons:4,travel:'auto'},'familie')})}
 const g=TEMPLATE_GROUPS.find(x=>x.id==='urlaub');if(g&&!g.ids.includes('familie'))g.ids.push('familie')})();

function stilKey(t){const k=t&&t.type;return k&&Object.prototype.hasOwnProperty.call(STILE,k)?k:'wochenende'}
function styleOf(t){
 const key=stilKey(t),s=STILE[key],own=t&&STIL_PACE[t.pace];
 return {key,label:s.label,kurz:s.kurz,pace:own||s.pace,paceSrc:own?'reise':'stil'};
}
/* „Alle Teile zeigen“: Darstellung je Browser */
let stilPrefs={};
try{const raw=typeof localStorage!=='undefined'&&localStorage.getItem('rp-stil');const v=raw?JSON.parse(raw):null;if(v&&typeof v==='object'&&!Array.isArray(v))stilPrefs={alle:v.alle===true}}catch(e){}
function stilAlle(){return stilPrefs.alle===true}
function stilAlleSetzen(on){stilPrefs.alle=!!on;try{localStorage.setItem('rp-stil',JSON.stringify(stilPrefs))}catch(e){}return stilPrefs.alle}

/* Leise Teile einer Reise: Stilregel plus „Pakete nur mit Paket-Katalog“. Ein Teil mit Inhalt ist nie leise. */
function stilHatInhalt(t,part){
 if(part==='suche')return Array.isArray(t.offers)&&t.offers.length>0;
 if(part==='angebote')return !!t.packageId;
 return true;
}
function stilLeise(t){
 if(!t)return [];
 const out=STILE[stilKey(t)].leise.slice();
 if(t.catalog!=='allgaeu'&&!out.includes('angebote'))out.push('angebote');
 return out.filter(p=>!stilHatInhalt(t,p));
}
function stilTeile(t,parts,tab){
 if(!t||stilAlle())return parts.slice();
 const leise=stilLeise(t);
 return parts.filter(p=>p===tab||!leise.includes(p));
}
function stilStart(t,key){return (t&&STILE[stilKey(t)].start[key])||''}
function stilBereichName(t,key,fallback){return (t&&STILE[stilKey(t)].namen[key])||fallback}

/* ---------- Hinweise für „Als Nächstes“ ----------
   Form wie dort: {id,level:'warn'|'info',rank,title,reason,tab,action,value,label}. Reine Ableitung, die Reise bleibt unverändert. */
function stilFahrMin(t,back){
 if(typeof outboundMin!=='function')return 0;
 const out=outboundMin(t);if(!back)return out;
 return num(t.routeHomeMin,0)>0?num(t.routeHomeMin,0):out;
}
function stilDauer(min){const m=Math.round(min),h=Math.floor(m/60),r=m%60;return (h?h+' Std.':'')+(h&&r?' ':'')+(r||!h?r+' Min.':'')}
function stilPreisBekannt(a){return !!a&&(num(a.pp,0)>0||num(a.grp,0)>0||a.custom&&num(a.cost,0)>0)}
function stilSchritte(t,now){
 if(!t)return [];
 const key=stilKey(t),out=[];
 const add=(id,level,rank,title,reason,tab,action,value,label)=>out.push({id:'stil:'+id,level,rank,title,reason,tab:tab||'',action:action||'',value:value||'',label:label||'Ansehen'});
 const items=t.items||[],acts=items.map(i=>typeof actOf==='function'?actOf(t,i.act):null).filter(a=>a&&!a.transit);
 if(key==='rund'){
  const legs=Array.isArray(t.legs)?t.legs:[];
  if(!legs.length)add('etappen','info',40,'Etappen der Rundreise festlegen','Welche Orte, wie viele Nächte je Ort? Danach lassen sich Unterkünfte und Fahrtage je Station planen.','unterkunft');
  else{
   const sum=legs.reduce((n,l)=>n+Math.max(0,Math.round(num(l.nights,0))),0),n=typeof nightsOf==='function'?nightsOf(t):sum;
   if(sum!==n)add('etappen-naechte','warn',22,'Etappen und Reisedauer passen nicht zusammen','Die Etappen ergeben '+sum+(sum===1?' Nacht':' Nächte')+', die Reise hat '+n+'. Nächte je Etappe oder Reisedaten anpassen.','unterkunft');
   const lang=legs.find(l=>{const m=num(l.routeMin,0)>0?num(l.routeMin,0):num(l.roadKm,0)/80*60;return m>300});
   if(lang)add('etappe-lang','info',45,'Lange Etappe nach '+String(lang.name||'').slice(0,60),'Über 5 Stunden Fahrt (geschätzt). Einen Zwischenstopp einplanen oder den Tag ohne weiteres Programm lassen.','plan');
  }
 }
 if(key==='tag'){
  const hin=stilFahrMin(t,false),zus=hin+stilFahrMin(t,true);
  if(hin>0&&zus>240)add('fahrzeit','info',44,'Viel Fahrzeit für einen Tag','Hin und zurück ungefähr '+stilDauer(zus)+' im Auto (Schätzung). Ein näheres Ziel oder eine Übernachtung kann entspannter sein.','','edit-trip','','Eckdaten ansehen');
 }
 if(key==='familie'){
  const hin=stilFahrMin(t,false);
  if(hin>150)add('pause','info',48,'Pausen auf der Anfahrt einplanen','Die Anfahrt dauert geschätzt über 2,5 Stunden. Mit Kindern Pausen und Spielplatz-Halt einrechnen.','plan');
  if(items.length&&!acts.some(a=>a.indoor))add('regen','info',60,'Eine Idee für Regentage sammeln','Noch nichts für drinnen eingeplant. Eine Alternative merken, ohne den Plan zu füllen.','unternehmen');
  if(acts.some(stilPreisBekannt))add('ermaessigung','info',70,'Ermäßigungen und Familienkarten prüfen','Eingeplante Ausflüge haben Preise. Kinder- und Familientarife beim Anbieter prüfen; die Kosten rechnen bisher mit den eingetragenen Preisen.','kosten');
 }
 if(key==='wellness'){
  const st=typeof stayOf==='function'?stayOf(t):null;
  if(st&&t.dateMode==='fix'&&t.start)add('spa','info',46,'Spa- und Behandlungstermine früh anfragen','Massagen und Anwendungen sind oft schneller ausgebucht als Zimmer. Beim Haus nach freien Zeiten fragen.','check');
 }
 if(key==='stadt'){
  if(t.travel==='auto')add('parken','info',58,'Parken in der Stadt klären','Parkplatz an der Unterkunft oder Park & Ride prüfen; Parkgebühren sind noch nicht in den Kosten.','kosten');
  if(acts.length)add('nahverkehr','info',66,'Tages- oder Gästeticket prüfen','Für Wege zwischen den Programmpunkten: Tageskarte, Gästekarte oder Stadtpass beim Verkehrsverbund prüfen.','plan');
 }
 return out;
}

/* ---------- Darstellung ---------- */
function stilEsc(s){return typeof esc==='function'?esc(s):String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function stilTeilName(p){return typeof aufbauTeilName==='function'?aufbauTeilName(p):p}
/* Ein Satz unter „Art“ in Neue Reise und Eckdaten */
function stilHinweis(t){
 const s=styleOf(t),leise=stilLeise(t);
 return '<p class="small muted stil-hinweis" data-stil="'+s.key+'"><b>So richtet sich der Planer ein:</b> '+stilEsc(s.kurz)+' Tempo '+stilEsc(STIL_PACE_TXT[s.pace])+'.'+(leise.length?' Zunächst ausgeblendet: '+leise.map(p=>stilEsc(stilTeilName(p))).join(', ')+'.':'')+' Alles bleibt änderbar.</p>';
}
/* Überblick: aufklappbarer Abschnitt, standardmäßig zu */
function stilBlock(t){
 if(!t)return '';
 const s=styleOf(t),leise=stilLeise(t),alle=stilAlle();
 const body='<p class="small">'+stilEsc(s.kurz)+'</p><p class="small"><b>Tempo:</b> '+stilEsc(STIL_PACE_TXT[s.pace])+(s.paceSrc==='stil'?' (Vorgabe des Reisestils)':'')+'.</p>'+
  (leise.length?'<p class="small"><b>'+(alle?'Werden trotzdem gezeigt':'Ausgeblendet, weil sie zu dieser Reise wenig beitragen')+':</b></p><div class="row stil-leise">'+leise.map(p=>'<button type="button" class="btn ghost sm" data-go="r-'+stilEsc(t.id)+'-'+p+'">'+stilEsc(stilTeilName(p))+' öffnen</button>').join('')+'</div>':'<p class="small muted">Alle Teile sind für diese Reise sichtbar.</p>')+
  '<div class="row"><label class="small"><input type="checkbox" data-stil-alle'+(alle?' checked':'')+'> Immer alle Teile zeigen (gilt in diesem Browser)</label><button type="button" class="btn ghost sm" data-act="edit-trip">Reisestil ändern</button></div>'+
  '<p class="small muted">Der Reisestil ändert nur Ansicht und Hinweise, nie Kosten, Termine oder Buchungen.</p>';
 const sum=s.label+' · Tempo '+STIL_PACE_TXT[s.pace].split(':')[0]+(leise.length&&!alle?' · '+leise.length+(leise.length===1?' Teil':' Teile')+' ausgeblendet':'');
 return '<section class="block stil">'+(typeof fold==='function'?fold('stil','Reisestil',sum,body):'<h2>Reisestil</h2>'+body)+'</section>';
}
/* Entdecken: Stil aus dem Wunschprofil, sonst null (dann entscheidet catTripType) */
function stilAusProfil(p,nights){
 if(!p||!(nights>0))return null;
 if(p.party==='familie')return 'familie';
 const k=p.kinds||{};if(nights<=3&&(k.therme==='must'||k.therme==='like'&&p.pace==='ruhig'))return 'wellness';
 return null;
}
if(typeof document!=='undefined'&&document.addEventListener){
 document.addEventListener('change',e=>{const el=e.target;if(!el||!el.hasAttribute||!el.hasAttribute('data-stil-alle'))return;stilAlleSetzen(el.checked);if(typeof render==='function'){const y=typeof window!=='undefined'&&typeof window.scrollY==='number'?window.scrollY:0;render();try{window.scrollTo(0,y)}catch(err){}}});
}
