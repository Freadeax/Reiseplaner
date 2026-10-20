/* Reiseplaner · Reisetagebuch und Bewertungen.
   Teil 16 von 22 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Reisetagebuch und Bewertungen (P0.2b, SCHEMA_V3 §4/§5/§9, Claude) =================
   Regeln in v3journal.js (window.RPV3J), hier nur die Anbindung. Einhängepunkte außerhalb dieses Blocks:
   validateV3 → journalValidate · tUeber → journalRetro · todayBlock → journalToday · tPlan → journalSection ·
   tMappe → journalMappeToggle/journalMappe · Exporte in window.__app.
   - Lesen: Format-3-Reisen mit journal/ratings werden geprüft und angezeigt. Fehlt RPV3J, gelten nicht leere Angaben
     weiter als unbekannt (Reise geschützt statt falsch angezeigt).
   - Schreiben nur mit journalCanEdit(): V3_JOURNAL und v3CanEdit (V3_EDIT, Schreibrecht, kein Speicherfehler/Konflikt).
     Die erste Angabe in einer Reise des Formats 2 stellt erst nach ausdrücklicher Bestätigung auf Format 3 um. Danach wird
     direkt gespeichert, immer als geprüfte Kopie der aktuell gespeicherten Reise, in der sich nur journal bzw. ratings
     ändern (Feldtreue, Verpflichtungsschutz über v3Candidate).
   - Entwürfe bleiben je Speicherbereich, Reise und Tag im Arbeitsspeicher (UI.journalDrafts): beim Schließen des Blatts,
     beim Wechsel von Tag oder Bereich und nach Fehlern. Ein Neuladen der Seite verwirft sie.
   - Keine Umschlüsselung: Einträge ohne passenden Reisetag bleiben und erscheinen als „ohne zugehörigen Tag“. */
const V3_JOURNAL=true;
function VJ(){return typeof window!=='undefined'&&window.RPV3J||null}
function journalValidate(t){
 const J=VJ();
 if(!J){['journal','ratings'].forEach(k=>{const v=t[k];if(v!=null&&!(Array.isArray(v)&&!v.length)&&!(typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).length))throw new Error('Angaben „'+k+'“ kennt diese App-Version noch nicht.')});return}
 J.validate(t);
}
function journalCanEdit(t){return !!(V3_JOURNAL&&VJ()&&V3&&t&&v3CanEdit(t))}
function journalHas(t){const J=VJ();return !!(J&&isV3(t)&&!(J.isEmpty(t.journal)&&J.isEmpty(t.ratings)))}
function journalDays(t){return daysOf(t).map(d=>({i:d.i,date:d.date?iso(d.date):null,label:d.label}))}
function journalLayout(t){return VJ().layout(isV3(t)?t.journal:null,journalDays(t))}
function journalEntry(t,key){const j=isV3(t)&&t.journal;return j&&Object.prototype.hasOwnProperty.call(j,key)?j[key]:null}
function journalDraftId(t,key){return Store.scope+'|'+t.id+'|'+key}
function journalDraftOf(t,key){return UI.journalDrafts&&Object.prototype.hasOwnProperty.call(UI.journalDrafts,journalDraftId(t,key))?UI.journalDrafts[journalDraftId(t,key)]:null}
/* Geplante Unternehmungen in Planreihenfolge (ohne Weiterfahrten), mit den Tagen, an denen sie stehen */
function journalActs(t){
 const days=daysOf(t),seen=new Map();
 sortedItems(t).forEach(it=>{const a=actOf(t,it.act);if(!a||a.transit)return;if(!seen.has(a.id))seen.set(a.id,{id:a.id,title:a.t,days:[]});const d=days[it.day],x=seen.get(a.id),l=d?d.label:'nach dem letzten Reisetag';if(!x.days.includes(l))x.days.push(l)});
 return [...seen.values()];
}
/* Wohin gehört ein Schlüssel gerade? null = weder aktueller Reisetag noch vorhandener Eintrag */
function journalSlot(t,key){
 const J=VJ(),L=journalLayout(t);
 for(const d of L.days){if(d.key===key)return {key,kind:'day',label:d.label};if(d.extra.some(x=>x.key===key))return {key,kind:'extra',label:d.label+' · früherer Eintrag für '+J.keyLabel(key)+' (vor dem Festlegen der Daten)'}}
 const o=L.orphans.find(x=>x.key===key);
 if(o)return {key,kind:'orphan',label:o.label+(o.kind==='index'?' (ohne festes Datum)':'')+' · ohne zugehörigen Tag'};
 /* Ungespeicherter Entwurf zu einem Tag, der nach einer Datumsänderung fehlt: bleibt erreichbar (Review R2) */
 return journalDraftOf(t,key)?{key,kind:'draft',label:J.keyLabel(key)+' · ohne zugehörigen Tag'}:null;
}
/* Entwürfe dieser Reise, deren Tag weder aktuell ist noch einen gespeicherten Eintrag hat */
function journalLostDrafts(t,L){
 const pre=Store.scope+'|'+t.id+'|',known=new Set();L.days.forEach(d=>{known.add(d.key);d.extra.forEach(x=>known.add(x.key))});L.orphans.forEach(o=>known.add(o.key));
 return Object.keys(UI.journalDrafts||{}).filter(id=>id.indexOf(pre)===0&&!known.has(id.slice(pre.length))).map(id=>id.slice(pre.length)).sort();
}
function journalPrivacy(){return Store.isAccount()?'Mit Konto wird das Tagebuch mit der Reise synchronisiert. Alle, mit denen ihr die Reise teilt, können es lesen.':'Gespeichert in dieser Reise in diesem Browser.'}

/* ---------- Anzeige ---------- */
function journalEntryHtml(e,full){
 const J=VJ();if(!e)return '<p class="small muted">Noch kein Eintrag.</p>';
 return (e.mood?'<p class="small">Stimmung: <b>'+esc(J.moodText(e.mood))+'</b></p>':'')+(e.text?(full?'<p class="rp-jtext">'+esc(e.text)+'</p>':'<p class="small">'+esc(J.excerpt(e.text))+'</p>'):'');
}
function journalRow(t,row,edit){
 const draft=edit&&journalDraftOf(t,row.key),e=row.entry;
 const one=(key,label,entry,sub)=>'<div data-journal-key="'+esc(key)+'">'+(sub?'<p class="small muted">'+esc(sub)+'</p>':'')+journalEntryHtml(entry,!edit)+
  (edit&&journalDraftOf(t,key)?'<p class="small"><b>Entwurf, noch nicht gespeichert</b></p>':'')+
  (edit?'<div class="row"><button type="button" class="btn ghost sm" data-journal-act="open" data-key="'+esc(key)+'" aria-label="Tagebuch '+esc(label)+(entry?' bearbeiten':' schreiben')+'">'+(entry?'Bearbeiten':draft&&key===row.key?'Entwurf fortsetzen':'Schreiben')+'</button></div>':'')+'</div>';
 return '<li><b>'+esc(row.label)+'</b>'+one(row.key,row.label,e,'')+(row.extra||[]).map(x=>one(x.key,row.label+' früherer Eintrag',x.entry,'Früherer Eintrag für '+VJ().keyLabel(x.key)+' aus der Zeit ohne feste Daten. Er bleibt unter diesem Tag gespeichert.')).join('')+'</li>';
}
function journalStars(t,id,stars,title,edit,settable){
 const J=VJ(),txt='<span class="small rp-stars-txt">'+esc(J.starsText(stars))+'</span>';
 if(!edit)return '<p class="small"><span aria-hidden="true">'+J.starsGlyphs(stars)+'</span> '+esc(J.starsText(stars))+'</p>';
 return '<div class="rp-stars" role="group" aria-label="Bewertung für '+esc(title)+'">'+
  (settable?[1,2,3,4,5].map(n=>'<button type="button" class="rp-star" data-journal-act="rate" data-act-id="'+esc(id)+'" data-stars="'+n+'" aria-pressed="'+(stars===n)+'" aria-label="'+n+' von 5 Sternen"><span aria-hidden="true">'+(stars&&n<=stars?'★':'☆')+'</span></button>').join(''):'<span aria-hidden="true">'+J.starsGlyphs(stars)+'</span>')+
  txt+(stars?'<button type="button" class="btn ghost sm" data-journal-act="unrate" data-act-id="'+esc(id)+'" aria-label="Bewertung für '+esc(title)+' entfernen">Entfernen</button>':'')+'</div>';
}
function journalRatings(t,edit){
 const J=VJ(),R=J.ratingLayout(isV3(t)?t.ratings:null,journalActs(t));
 if(!R.planned.length&&!R.other.length)return '';
 if(!edit&&!R.count)return '';
 const planned=edit?R.planned:R.planned.filter(a=>a.stars);
 const other=R.other.map(o=>{const a=actOf(t,o.id);return {id:o.id,stars:o.stars,title:a?a.t:'Entfernte Unternehmung',sub:a?'nicht mehr im Tagesplan':'nicht mehr in dieser Reise',known:!!a}});
 return '<h3>Unternehmungen bewerten</h3>'+(edit?'<p class="small muted">1 bis 5 Sterne, zum Bewerten antippen. Bewertungen bleiben erhalten, auch wenn eine Unternehmung später aus dem Plan fällt.</p>':'')+
  (planned.length?'<ul class="plain rp-rates">'+planned.map(a=>'<li data-journal-rate="'+esc(a.id)+'"><b>'+esc(a.title)+'</b><small class="muted">'+esc(a.days.join(', '))+'</small>'+journalStars(t,a.id,a.stars,a.title,edit,true)+'</li>').join('')+'</ul>':'')+
  (other.length?'<h4>Weitere Bewertungen</h4><p class="small muted">Zu Unternehmungen, die nicht mehr geplant sind. Sie bleiben gespeichert, bis ihr sie entfernt.</p><ul class="plain rp-rates">'+other.map(o=>'<li data-journal-rate="'+esc(o.id)+'"><b>'+esc(o.title)+'</b><small class="muted">'+esc(o.sub)+'</small>'+journalStars(t,o.id,o.stars,o.title,edit,o.known)+'</li>').join('')+'</ul>':'');
}
/* mode 'plan': aufklappbar im Tagesplan · 'retro': offen im Überblick nach der Reise */
function journalSection(t,mode){
 if(!VJ()||!V3)return '';
 const edit=journalCanEdit(t);if(!edit&&!journalHas(t))return '';
 const L=journalLayout(t),ph=tripPhase(t);
 const intro='<p class="small muted">Je Reisetag ein Eintrag mit optionaler Stimmung von 1 bis 5. '+esc(journalPrivacy())+'</p>';
 /* Sehr lange Reisen (Zeitraum prüfen): nur die ersten VIEW_DAYS Tage als Zeilen, Tage mit Eintrag immer */
 const shown=L.days.filter((d,n)=>n<VIEW_DAYS||d.entry||d.extra.length),hidden=L.days.length-shown.length;
 const days=(hidden?longTripNote(t,'Das Tagebuch'):'')+'<ul class="plain rp-jdays">'+shown.map(d=>journalRow(t,d,edit)).join('')+'</ul>'+(hidden?'<p class="small muted">'+hidden.toLocaleString('de-DE')+' weitere Tage ohne Eintrag ausgeblendet.</p>':'');
 let orphans=L.orphans.length?'<details class="panel" open data-journal-orphans><summary><b>'+L.orphans.length+(L.orphans.length===1?' Eintrag':' Einträge')+' ohne zugehörigen Tag</b></summary><p class="small muted">Sie passen zu keinem aktuellen Reisetag, etwa nach einer Änderung von Zeitraum oder Dauer, und bleiben unverändert gespeichert.</p><ul class="plain rp-jdays">'+L.orphans.map(o=>journalRow(t,{key:o.key,label:o.label+(o.kind==='index'?' (ohne festes Datum)':''),entry:o.entry,extra:[]},edit)).join('')+'</ul></details>':'';
 const lost=edit?journalLostDrafts(t,L):[];
 if(lost.length)orphans+='<details class="panel" open data-journal-lost><summary><b>'+lost.length+(lost.length===1?' ungespeicherter Entwurf':' ungespeicherte Entwürfe')+' ohne zugehörigen Tag</b></summary><p class="small muted">Der Tag gehört nach einer Änderung von Zeitraum oder Dauer nicht mehr zur Reise. Fortsetzen und speichern legt den Eintrag unter seinem bisherigen Tag ab, oder ihr verwerft den Entwurf.</p><ul class="plain rp-jdays">'+lost.map(k=>journalRow(t,{key:k,label:VJ().keyLabel(k),entry:null,extra:[]},edit)).join('')+'</ul></details>';
 const rates=journalRatings(t,edit);
 if(mode==='retro')return '<section class="block" data-journal="retro"><h2>Rückblick: Tagebuch & Bewertungen</h2>'+intro+days+orphans+rates+'</section>';
 /* Auf-/Zugeklappt bleibt beim Neuaufbau erhalten (z. B. nach dem Antippen eines Sterns) */
 const st=journalDetailsState(t),open=st.plan!=null?st.plan:(ph&&ph.phase!=='vor'||L.count>0);
 return '<section class="block" data-journal="plan"><details data-journal-details="plan"'+(open?' open':'')+'><summary><b>Reisetagebuch</b> <small class="muted">'+(L.count?L.count+(L.count===1?' Eintrag':' Einträge'):'noch leer')+'</small></summary>'+intro+days+orphans+(rates?'<details class="panel" data-journal-details="rates"'+(st.rates?' open':'')+'><summary><b>Bewertungen</b></summary>'+rates+'</details>':'')+'</details></section>';
}
function journalDetailsState(t){const all=UI.journalDetails||{};return Object.prototype.hasOwnProperty.call(all,t.id)?all[t.id]:{}}
function journalRetro(t){const ph=tripPhase(t);return ph&&ph.phase==='nach'||t.status==='vorbei'?journalSection(t,'retro'):''}
function journalToday(t,i){
 if(!VJ()||!V3)return '';
 const edit=journalCanEdit(t),d=journalLayout(t).days[i];
 if(!d||!edit&&!d.entry&&!d.extra.length)return '';
 return '<div class="panel" data-journal="today"><h3>Tagebuch heute</h3><ul class="plain rp-jdays">'+journalRow(t,d,edit)+'</ul></div>';
}
function journalMappeToggle(t){return journalHas(t)?'<label class="small"><input type="checkbox" id="mappe-journal"'+(UI.mappeJournal?' checked':'')+'> Tagebuch und Bewertungen aufnehmen (persönliche Einträge)</label>':''}
function journalMappe(t){
 if(!UI.mappeJournal||!journalHas(t))return '';
 const J=VJ(),L=journalLayout(t),R=J.ratingLayout(t.ratings,journalActs(t)),list=[];
 const card=(label,e)=>'<div class="mday"><h4>'+esc(label)+'</h4>'+(e.mood?'<p class="small">Stimmung: '+esc(J.moodText(e.mood))+'</p>':'')+(e.text?'<p class="rp-jtext">'+esc(e.text)+'</p>':'')+'</div>';
 L.days.forEach(d=>{if(d.entry)list.push(card(d.label,d.entry));d.extra.forEach(x=>list.push(card(d.label+' · früherer Eintrag für '+J.keyLabel(x.key),x.entry)))});
 L.orphans.forEach(o=>list.push(card(o.label+' · ohne zugehörigen Tag',o.entry)));
 const rated=R.planned.filter(a=>a.stars).map(a=>[a.title,a.stars]).concat(R.other.map(o=>[(actOf(t,o.id)||{}).t||'Entfernte Unternehmung',o.stars]));
 return (list.length?'<section class="block mappe" data-journal-mappe><h3>Reisetagebuch</h3><div class="mdays">'+list.join('')+'</div></section>':'')+
  (rated.length?'<section class="block mappe" data-journal-mappe-ratings><h3>Bewertungen</h3><ul class="plain">'+rated.map(([n,s])=>'<li>'+esc(n)+': <span aria-hidden="true">'+J.starsGlyphs(s)+'</span> '+esc(J.starsText(s))+'</li>').join('')+'</ul></section>':'');
}

/* ---------- Erfassen ---------- */
function journalSheet(t,key){
 const J=VJ();if(!J)throw new Error('Das Tagebuch konnte nicht geladen werden. Bitte neu laden.');
 const slot=journalSlot(t,key);if(!slot)throw new Error('Diesen Reisetag gibt es nicht mehr. Bitte neu öffnen.');
 const edit=journalCanEdit(t),saved=journalEntry(t,key),draft=edit?journalDraftOf(t,key):null;
 if(!edit){openSheet('<span class="eyebrow">Reisetagebuch</span><h2>'+esc(slot.label)+'</h2>'+journalEntryHtml(saved,true));return}
 const v=draft||{text:saved?saved.text:'',mood:saved&&saved.mood?String(saved.mood):''};
 UI.journalOpen={scope:Store.scope,trip:t.id,key,base:draft?draft.base:JSON.stringify(saved)};
 const mood=['',1,2,3,4,5].map(n=>'<label class="opt"><input type="radio" name="journal-mood" value="'+n+'"'+(String(v.mood||'')===String(n)?' checked':'')+'> '+(n?n+' · '+esc(J.MOODS[n]):'Keine Angabe')+'</label>').join('');
 openSheet('<div data-journal-sheet><span class="eyebrow">Reisetagebuch</span><h2>'+esc(slot.label)+'</h2>'+
  (slot.kind==='orphan'?'<p class="note">Dieser Eintrag passt zu keinem aktuellen Reisetag. Er bleibt unter seinem bisherigen Tag gespeichert.</p>':'')+
  (slot.kind==='draft'?'<p class="note">Dieser Entwurf passt zu keinem aktuellen Reisetag. Beim Speichern bleibt er unter seinem bisherigen Tag und erscheint als Eintrag ohne zugehörigen Tag.</p>':'')+
  (isV3(t)?'':'<p class="note">Erster Eintrag dieser Reise: Vor dem Speichern fragen wir einmal nach, weil die Reise dafür im neueren Format 3 gespeichert wird.</p>')+
  (draft?'<div class="note" role="status"><p>Ungespeicherter Entwurf wiederhergestellt.</p><div class="row"><button type="button" class="btn ghost sm" data-journal-act="discard">Entwurf verwerfen</button></div></div>':'')+
  '<div id="journal-error" class="note" role="alert" tabindex="-1" hidden></div>'+
  '<label class="fld"><span>Tagebucheintrag</span><textarea id="journal-text" maxlength="'+J.LIMITS.text+'" rows="8" aria-describedby="journal-count">'+esc(v.text)+'</textarea></label>'+
  '<p class="small muted" id="journal-count">'+String(v.text||'').length+' von '+J.LIMITS.text+' Zeichen</p>'+
  '<fieldset class="rp-mood"><legend>Stimmung (optional)</legend><div class="opts">'+mood+'</div></fieldset>'+
  '<p class="small muted">Ohne Text und ohne Stimmung wird der Eintrag entfernt. '+esc(journalPrivacy())+'</p>'+
  '<div class="row"><button type="button" class="btn" data-journal-act="save">Speichern</button>'+(saved?'<button type="button" class="btn ghost" data-journal-act="delete-ask">Eintrag löschen</button>':'')+'</div>'+
  '<div id="journal-delete" class="note" hidden><p>Eintrag für '+esc(slot.label)+' wirklich löschen?</p><div class="row"><button type="button" class="btn warn sm" data-journal-act="delete">Ja, löschen</button><button type="button" class="btn ghost sm" data-journal-act="delete-no">Behalten</button></div></div></div>');
}
function journalRead(){const box=$('[data-journal-sheet]'),ta=$('#journal-text');if(!box||!ta)return null;const m=box.querySelector('input[name="journal-mood"]:checked');return {text:ta.value,mood:m?m.value:''}}
/* Jede Eingabe sofort als Entwurf merken: Schließen, Tag- oder Bereichswechsel verlieren nichts */
function journalKeep(){
 const o=UI.journalOpen,f=journalRead();if(!o||!f||o.scope!==Store.scope)return;
 UI.journalDrafts=UI.journalDrafts||{};const id=o.scope+'|'+o.trip+'|'+o.key,prev=UI.journalDrafts[id];
 UI.journalDrafts[id]={text:f.text,mood:f.mood,base:prev?prev.base:o.base};
 const c=$('#journal-count');if(c)c.textContent=f.text.length+' von '+VJ().LIMITS.text+' Zeichen';
}
function journalDropDraft(scope,trip,key){if(UI.journalDrafts)delete UI.journalDrafts[scope+'|'+trip+'|'+key]}
/* Kandidat aus der gerade gespeicherten Reise; nur journal bzw. ratings ändern sich. Leere Felder fallen weg, Format 3 bleibt. */
function journalCommit(t,change){
 const field=change.kind==='journal'?'journal':'ratings',value=change.kind==='journal'?change.journal:change.ratings;
 const next=v3Candidate(t,c=>{if(VJ().isEmpty(value))delete c[field];else c[field]=clone(value)});
 if(Store.put(next)!==true)throw new Error('Nicht gespeichert. Bitte Speicherstatus prüfen. Euer Entwurf bleibt erhalten.');
 if(change.kind==='journal')journalDropDraft(Store.scope,t.id,change.key);
 return next;
}
function journalAsk(t,change){
 const J=VJ();UI.journalToken=(UI.journalToken||0)+1;
 UI.journalPending=Object.assign({token:UI.journalToken,trip:t.id,scope:Store.scope,source:JSON.stringify(t)},change);
 const what=change.kind==='journal'?'Tagebucheintrag für '+(journalSlot(t,change.key)||{label:J.keyLabel(change.key)}).label:'Bewertung „'+((actOf(t,change.actId)||{}).t||'Unternehmung')+'“: '+J.starsText(change.stars);
 openSheet('<div data-journal-confirm><span class="eyebrow">Einmal bestätigen</span><h2>Reise auf Format 3 umstellen?</h2><p>'+esc(what)+'</p>'+
  '<div class="note"><p>Tagebuch und Bewertungen gibt es erst im Speicherformat 3. Mit dem Speichern wird diese Reise dauerhaft auf Format 3 umgestellt.</p><p><b>Ältere App-Versionen</b>, etwa auf einem noch nicht aktualisierten Gerät, können die Reise danach höchstens ansehen, aber nicht mehr bearbeiten.</p></div>'+
  '<p class="small muted">Alle übrigen Angaben der Reise bleiben unverändert. Es wird nichts gebucht oder versendet.</p><div id="journal-error" class="note" role="alert" tabindex="-1" hidden></div>'+
  '<div class="row"><button type="button" class="btn" data-journal-act="confirm" data-token="'+UI.journalToken+'">Umstellen und speichern</button><button type="button" class="btn ghost" data-journal-act="'+(change.kind==='journal'?'back':'cancel')+'">'+(change.kind==='journal'?'Zurück zum Eintrag':'Abbrechen')+'</button></div></div>');
}
/* Rückgabe: 'saved' | 'ask' (Bestätigung offen) | 'empty' (nichts zu speichern) */
function journalSave(force,remove){
 const o=UI.journalOpen,J=VJ();if(!o||!J)throw new Error('Kein Tagebucheintrag geöffnet.');
 if(!remove)journalKeep();
 if(o.scope!==Store.scope)throw new Error('Der Speicherbereich hat sich geändert. Bitte den Eintrag neu öffnen.');
 const t=Store.get(o.trip);if(!t)throw new Error('Die Reise ist nicht mehr vorhanden.');
 if(!journalCanEdit(t))throw new Error('Das Tagebuch dieser Reise kann gerade nicht gespeichert werden (nur Lesen, Speicherfehler oder Konflikt).');
 if(!journalSlot(t,o.key))throw new Error('Diesen Reisetag gibt es nicht mehr. Euer Entwurf bleibt erhalten.');
 const saved=journalEntry(t,o.key);
 if(!force&&JSON.stringify(saved)!==o.base){const err=new Error('Dieser Eintrag wurde inzwischen an anderer Stelle geändert. Euer Entwurf bleibt erhalten.');err.journalSaved=saved;throw err}
 const f=remove?{text:'',mood:''}:journalRead()||{text:'',mood:''};
 if(!J.normalizeEntry(f)&&!saved){journalDropDraft(o.scope,o.trip,o.key);return 'empty'}
 const change={kind:'journal',key:o.key,journal:J.setEntry(isV3(t)&&t.journal||{},o.key,f)};
 if(!isV3(t)){journalAsk(t,change);return 'ask'}
 journalCommit(t,change);UI.journalOpen=null;return 'saved';
}
function journalRate(t,actId,stars){
 const J=VJ();if(!J||!journalCanEdit(t))throw new Error('Bewertungen können in dieser Reise gerade nicht gespeichert werden.');
 const known=journalActs(t).some(a=>a.id===actId)||!!actOf(t,actId)&&!!(isV3(t)&&t.ratings&&Object.prototype.hasOwnProperty.call(t.ratings,actId));
 if(stars!=null&&!known)throw new Error('Diese Unternehmung steht nicht mehr im Plan.');
 const change={kind:'rating',actId,stars,ratings:J.setRating(isV3(t)&&t.ratings||{},actId,stars)};
 if(!isV3(t)){journalAsk(t,change);return 'ask'}
 journalCommit(t,change);return 'saved';
}
function journalConfirm(token){
 const p=UI.journalPending;if(!p||p.token!==token)throw new Error('Diese Bestätigung ist nicht mehr aktuell. Bitte erneut speichern.');
 const t=Store.get(p.trip);
 if(!t||p.scope!==Store.scope||p.source!==JSON.stringify(t))throw new Error('Die Reise hat sich inzwischen geändert. Bitte erneut speichern; euer Entwurf bleibt erhalten.');
 if(!journalCanEdit(t))throw new Error('Die Reise kann gerade nicht gespeichert werden.');
 journalCommit(t,p);UI.journalPending=null;if(p.kind==='journal')UI.journalOpen=null;return p;
}
function journalFocus(selector){try{const n=document.querySelector(selector);if(n&&n.focus)n.focus()}catch(e){}}
function journalError(err){
 const box=$('#journal-error');if(!box){alertMsg(err.message);return}
 box.innerHTML='<p>'+esc(err.message)+'</p>'+(err.journalSaved!==undefined?'<p class="small">Inzwischen gespeichert:</p>'+journalEntryHtml(err.journalSaved,true)+'<div class="row"><button type="button" class="btn sm" data-journal-act="force">Meinen Entwurf trotzdem speichern</button><button type="button" class="btn ghost sm" data-journal-act="discard">Entwurf verwerfen</button></div>':'');
 box.hidden=false;if(box.focus)box.focus();
}
document.addEventListener('toggle',e=>{const d=e.target,k=d&&d.getAttribute&&d.getAttribute('data-journal-details'),t=k&&cur();if(!t)return;
 UI.journalDetails=UI.journalDetails||Object.create(null);const st=Object.prototype.hasOwnProperty.call(UI.journalDetails,t.id)?UI.journalDetails[t.id]:(UI.journalDetails[t.id]={});st[k]=!!d.open},true);
document.addEventListener('input',e=>{if(e.target&&e.target.id==='journal-text'&&e.target.closest('[data-journal-sheet]'))journalKeep()});
document.addEventListener('change',e=>{
 const el=e.target;if(!el)return;
 if(el.name==='journal-mood'&&el.closest('[data-journal-sheet]')){journalKeep();return}
 if(el.id==='mappe-journal'){UI.mappeJournal=!!el.checked;render();journalFocus('#mappe-journal')}
});
document.addEventListener('click',e=>{
 const b=e.target&&e.target.closest&&e.target.closest('[data-journal-act]');if(!b)return;
 const act=b.getAttribute('data-journal-act'),t=cur();if(Store.corruptRaw!==null){alertMsg('Änderungen gesperrt: Bitte zuerst die Rohdaten sichern.');return}
 try{
  if(act==='open'){if(!t)throw new Error('Reise nicht mehr geöffnet.');journalSheet(t,b.getAttribute('data-key'));return}
  if(act==='rate'||act==='unrate'){if(!t)throw new Error('Reise nicht mehr geöffnet.');const id=b.getAttribute('data-act-id'),n=act==='rate'?Number(b.getAttribute('data-stars')):null;
   if(journalRate(t,id,n)==='saved'){render();journalFocus('[data-journal-rate="'+id+'"] '+(n?'[data-stars="'+n+'"]':'[data-stars="1"]'))}return}
  if(act==='cancel'){UI.journalPending=null;closeSheet();return}
  if(act==='back'){const p=UI.journalPending,x=p&&Store.get(p.trip);UI.journalPending=null;if(x&&p.kind==='journal')journalSheet(x,p.key);else closeSheet();return}
  if(act==='confirm'){const p=journalConfirm(Number(b.getAttribute('data-token')));closeSheet();render();alertMsg('Gespeichert. Die Reise nutzt jetzt Format 3.');journalFocus(p.kind==='journal'?'[data-journal-act="open"][data-key="'+p.key+'"]':'[data-journal-rate="'+p.actId+'"] [data-stars="'+(p.stars||1)+'"]');return}
  if(!b.closest('[data-journal-sheet]')&&act!=='force'&&act!=='discard')return;
  const o=UI.journalOpen;
  if(act==='delete-ask'){const d=$('#journal-delete');if(d){d.hidden=false;const y=d.querySelector('button');if(y)y.focus()}return}
  if(act==='delete-no'){const d=$('#journal-delete');if(d)d.hidden=true;return}
  if(act==='discard'){if(o){journalDropDraft(o.scope,o.trip,o.key);const x=Store.get(o.trip);if(x&&journalSlot(x,o.key))journalSheet(x,o.key);else{UI.journalOpen=null;closeSheet();render();alertMsg('Entwurf verworfen.')}}return}
  if(act==='save'||act==='force'||act==='delete'){
   const key=o&&o.key,r=journalSave(act==='force',act==='delete');if(r==='ask')return;
   closeSheet();render();alertMsg(r==='empty'?'Leerer Eintrag, nichts gespeichert.':act==='delete'?'Eintrag gelöscht.':'Tagebucheintrag gespeichert.');journalFocus('[data-journal-act="open"][data-key="'+key+'"]');return}
 }catch(err){journalError(err)}
});

