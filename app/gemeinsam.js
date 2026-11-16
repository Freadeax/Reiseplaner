/* Reiseplaner · Gemeinsam planen: Ideen-Pinnwand, Anzeigename, „Was hat sich geändert“, Realtime-Auslöser
   (docs/PLAN_GEMEINSAM.md Stufen G2–G5, Migration 20261116120000_gemeinsam).
   Nur für online gespeicherte Reisen eines angemeldeten Kontos. Ideen ändern den Plan nie selbst; Realtime-Ereignisse lösen nur
   den normalen Abgleich bzw. ein Neuladen der Pinnwand aus, sie sind nie Datenquelle. */

const GM={trips:{},profile:undefined,profileFor:null,stopWatch:null,watchFor:null,editName:false,timer:null,live:false,presFor:null,stopPres:null,here:[],lastPoll:0};
const GM_AREA={eckdaten:'Eckdaten',zeitraum:'Zeitraum',unterkunft:'Unterkunft',anreise:'Anreise',tagesplan:'Tagesplan',kosten:'Kosten',vorbereitung:'Vorbereitung',mitreisende:'Mitreisende',erinnerungen:'Erinnerungen',notizen:'Notizen',sonstiges:'Sonstiges',geloescht:'Reise gelöscht',wiederhergestellt:'Reise wiederhergestellt'};
const GM_STATUS={neu:'neu',eingeplant:'eingeplant',verworfen:'verworfen'};

function gmCloud(){return typeof Sync!=='undefined'&&Sync.active()?Sync.cloud():null}
function gmOnline(t){return !!(t&&gmCloud()&&Store.meta[t.id]&&Store.meta[t.id].version)}
function gmMe(){return Auth.user&&Auth.user.id}

/* Realtime: ein Kanal je Konto. Reise geändert → Abgleich; Idee/Stimme geändert → Pinnwand neu laden. */
function gmEnsureWatch(){
  const c=gmCloud(),me=gmMe();
  if(!c||!c.watch){if(GM.stopWatch){GM.stopWatch();GM.stopWatch=null;GM.watchFor=null}return}
  if(GM.watchFor===me)return;
  if(GM.stopWatch)GM.stopWatch();
  GM.watchFor=me;GM.live=false;
  GM.stopWatch=c.watch(ev=>{
    if(ev.table==='trips'){Sync.schedule(300);if(ev.trip&&GM.trips[ev.trip])GM.trips[ev.trip].changesAt=0;return}
    const tid=ev.trip||Object.keys(GM.trips).find(k=>GM.trips[k].list&&GM.trips[k].list.some(i=>i.id===ev.id));
    if(tid&&GM.trips[tid]){GM.trips[tid].at=0;if(UI.view==='reise'&&UI.tid===tid)gmLoad(tid)}
    else if(UI.view==='reise'&&UI.tid&&GM.trips[UI.tid]){GM.trips[UI.tid].at=0;gmLoad(UI.tid)}
  },st=>{GM.live=st==='SUBSCRIBED'});
}
/* Anwesenheit: nur solange die Reise offen ist. Wechsel oder Verlassen beendet den Kanal. */
function gmPresence(t){
  const c=gmCloud(),want=t&&gmOnline(t)&&c&&c.presence?t.id:null;
  if(GM.presFor===want)return;
  if(GM.stopPres){GM.stopPres();GM.stopPres=null}
  GM.presFor=want;GM.here=[];
  if(!want)return;
  GM.stopPres=c.presence(want,gmMe(),GM.profile||'',list=>{const before=JSON.stringify(GM.here);GM.here=list;
    if(JSON.stringify(list)!==before&&typeof remoteChanged==='function'&&UI.view==='reise'&&UI.tid===want)remoteChanged()});
}
/* Takt: Echtzeit prüfen; ohne Verbindung bei offener geteilter Reise alle 15 s abgleichen (Rückfall, sonst 60 s). */
function gmTick(){
  gmEnsureWatch();
  const t=UI.view==='reise'&&typeof cur==='function'?cur():null;
  gmPresence(t);
  if(t&&gmOnline(t)&&!GM.live&&(typeof document==='undefined'||document.visibilityState!=='hidden')&&Date.now()-GM.lastPoll>=15000){
    GM.lastPoll=Date.now();Sync.schedule(0);if(GM.trips[t.id])GM.trips[t.id].at=0;gmLoad(t.id);
  }
}
if(typeof setInterval==='function'&&typeof window!=='undefined')GM.timer=setInterval(()=>{try{gmTick()}catch(e){}},5000);

async function gmLoad(tid){
  const c=gmCloud();if(!c)return;
  const s=GM.trips[tid]=GM.trips[tid]||{};
  if(s.loading)return;s.loading=true;
  try{
    const me=gmMe();
    const [ideas,members,changes,profile,polls,comments]=await Promise.all([
      c.ideas(tid),
      c.members(tid).catch(()=>[]),
      c.changes(tid).catch(()=>[]),
      GM.profileFor===me?Promise.resolve(GM.profile):c.profile(me).catch(()=>''),
      c.polls?c.polls(tid).catch(()=>null):null,
      c.comments?c.comments(tid).catch(()=>null):null
    ]);
    GM.profile=profile||'';GM.profileFor=me;
    Object.assign(s,{list:ideas.list,votes:ideas.votes,members,changes:changes||[],polls:polls?polls.list:null,pollVotes:polls?polls.votes:[],comments:comments,at:Date.now(),changesAt:Date.now(),error:''});
  }catch(e){s.error=e&&e.message||String(e);s.at=Date.now()}
  s.loading=false;
  gmRefreshThreads(tid);
  if(typeof remoteChanged==='function'&&UI.view==='reise'&&UI.tid===tid)remoteChanged();
}

function gmName(s,uid){
  if(!uid)return 'ehemaliges Mitglied';
  if(uid===gmMe())return 'du';
  const m=(s.members||[]).find(x=>x.user_id===uid);
  if(m&&m.display_name)return m.display_name;
  const i=(s.members||[]).findIndex(x=>x.user_id===uid);
  return i>=0?'Mitglied '+(i+1):'ein Mitglied';
}

/* Hinweis „Seit deinem letzten Besuch“ – nur Änderungen anderer, ohne Inhalte. */
function gmChanges(t,s){
  const other=(s.changes||[]).filter(e=>!e.by_me);
  if(!other.length)return '';
  const rows=other.slice(0,5).map(e=>'<li><b>'+esc(e.actor_name||'Ein Mitglied')+'</b> · '+esc(new Date(e.at).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}))+' · '+esc((e.kinds||[]).map(k=>GM_AREA[k]||k).join(', '))+'</li>').join('');
  return '<div class="note gm-changes" role="status"><b>Seit deinem letzten Besuch '+(other.length===1?'eine Änderung':other.length+' Änderungen')+' von anderen:</b><ul class="plain small">'+rows+'</ul>'+(other.length>5?'<p class="small muted">… und '+(other.length-5)+' weitere.</p>':'')+
    '<button type="button" class="btn ghost sm" data-gm="seen" data-val="'+esc(Math.max(...(s.changes||[]).map(e=>e.version)))+'">Gesehen</button></div>';
}

function gmIdea(t,s,i){
  const me=gmMe(),role=Store.role(t.id),votes=(s.votes||[]).filter(v=>v.idea_id===i.id),mine=votes.some(v=>v.user_id===me);
  const canStatus=role==='owner'||role==='editor',canWithdraw=i.author===me||role==='owner';
  return '<li class="gm-idea'+(i.status!=='neu'?' gm-'+i.status:'')+'"><div class="gm-body"><p>'+esc(i.body)+'</p>'+
    (i.link?'<p class="small"><a href="'+esc(i.link)+'" target="_blank" rel="noopener noreferrer">Link öffnen</a></p>':'')+
    '<p class="small muted">von '+esc(gmName(s,i.author))+(i.status!=='neu'?' · <b>'+esc(GM_STATUS[i.status])+'</b>':'')+'</p></div>'+
    '<div class="row gm-acts"><button type="button" class="btn ghost sm" data-gm="vote" data-val="'+esc(i.id)+'" aria-pressed="'+mine+'" aria-label="'+(mine?'Daumen zurücknehmen':'Daumen hoch')+', bisher '+votes.length+'">👍 '+votes.length+(mine?' · du':'')+'</button>'+
    (canStatus&&i.status!=='eingeplant'?'<button type="button" class="btn ghost sm" data-gm="status" data-how="eingeplant" data-val="'+esc(i.id)+'">Eingeplant</button>':'')+
    (canStatus&&i.status!=='verworfen'?'<button type="button" class="btn ghost sm" data-gm="status" data-how="verworfen" data-val="'+esc(i.id)+'">Verwerfen</button>':'')+
    (canStatus&&i.status!=='neu'?'<button type="button" class="btn ghost sm" data-gm="status" data-how="neu" data-val="'+esc(i.id)+'">Wieder offen</button>':'')+
    (canStatus&&i.status==='neu'?'<button type="button" class="btn ghost sm" data-gm="plan" data-val="'+esc(i.id)+'">In den Plan …</button>':'')+
    (canWithdraw?'<button type="button" class="btn ghost sm" data-gm="withdraw" data-val="'+esc(i.id)+'">Zurückziehen</button>':'')+'</div></li>';
}

/* G6 „Ich bin Mitreisende/r X“: eigenes Konto mit einem Eintrag der Reisegruppe (party[].member) verknüpfen. Nur die Person
   selbst verknüpft sich (Server: trips_party_guard, claim_party). Bearbeiter speichern über f5Commit (geht auch offline und
   hebt die Reise nach Bestätigung auf Format 5), Leser über claim_party. Danach: eigene Aufgaben und eigener Saldo. */
function gmParty(t){return (t.party||[]).filter(p=>p&&p.id)}
function gmMine(t){const me=gmMe();return me?gmParty(t).find(p=>p.member===me)||null:null}
function gmMemberIds(s){return new Set((s.members||[]).map(m=>m.user_id))}
function gmMeBlock(t,s){
  const party=gmParty(t),me=gmMe();if(!me||!party.length)return '';
  const role=(Store.meta[t.id]||{}).role,owner=role==='owner',mine=gmMine(t),ids=gmMemberIds(s);
  const who=p=>p.member===me?'du':(()=>{const m=(s.members||[]).find(x=>x.user_id===p.member);return m?(m.display_name||gmName(s,p.member)):'ehemaliges Mitglied'})();
  const taken=party.filter(p=>p.member);
  const links=taken.length?'<details class="small"><summary>Zuordnungen ('+taken.length+' von '+party.length+')</summary><ul class="plain">'+taken.map(p=>'<li><b>'+esc(p.name)+'</b> · '+esc(who(p))+((p.member!==me&&(owner||!ids.has(p.member)))?' <button type="button" class="lnk" data-gm="unclaim" data-val="'+esc(p.id)+'">Lösen</button>':'')+'</li>').join('')+'</ul></details>':'';
  if(mine){
    const tasks=(t.tasks||[]).filter(x=>x&&x.by===mine.id&&!x.done);
    let bal='';
    try{if(typeof splitResult==='function'&&V3S&&((t.expenses||[]).length||Object.keys(t.ledger||{}).length)){const r=splitResult(t),x=r.persons.find(p=>p.id===mine.id);if(x)bal='<li>Dein Saldo: '+splitBalText(x.balance)+' <a class="lnk" href="#r-'+esc(t.id)+'-kosten">Kosten</a></li>'}}catch(e){}
    const items=(tasks.length?'<li>'+tasks.length+' offene Aufgabe'+(tasks.length>1?'n':'')+' für dich: '+tasks.slice(0,3).map(x=>esc(x.title)).join(', ')+(tasks.length>3?' …':'')+'</li>':'<li class="muted">Keine offenen Aufgaben für dich.</li>')+bal;
    return '<section class="block gm-me"><h2>Du in der Reisegruppe</h2><p>Du bist <b>'+esc(mine.name)+'</b>. <button type="button" class="btn ghost sm" data-gm="unclaim" data-val="'+esc(mine.id)+'">Zuordnung lösen</button></p><ul class="plain small">'+items+'</ul>'+links+'</section>';
  }
  const free=party.filter(p=>!p.member||(p.member!==me&&!ids.has(p.member)));
  const sv=Number(t.schemaVersion)||0,editor=role==='owner'||role==='editor';
  let body;
  if(!free.length)body='<p class="small muted">Alle Personen der Reisegruppe sind schon zugeordnet. Fehlt jemand, tragt ihn unter Kosten bei den Mitreisenden ein.</p>';
  else if(sv<5&&!editor)body='<p class="small muted">Zuordnen geht, sobald die Reise auf Format 5 umgestellt ist. Das passiert, wenn sich jemand mit Bearbeitungsrecht hier zuordnet.</p>';
  else body='<div class="row"><label class="fld" style="flex:1"><span>Wer bist du?</span><select id="gm-party">'+free.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join('')+'</select></label><button type="button" class="btn sm" data-gm="claim">Das bin ich</button></div><p class="small muted">Dann siehst du hier deine Aufgaben und deinen Anteil an den Kosten. Zuordnen kann sich nur jede Person selbst.</p>';
  return '<section class="block gm-me"><h2>Du in der Reisegruppe</h2>'+body+links+'</section>';
}
async function gmClaim(t,pid,link){
  const role=(Store.meta[t.id]||{}).role,me=gmMe(),c=gmCloud();
  if((role==='owner'||role==='editor')&&typeof f5Commit==='function'&&f5CanEdit(t)){
    const msg=link?'Zugeordnet.':'Zuordnung gelöst.';
    const run=o=>f5Commit(t,x=>{const ps=x.party||[],p=ps.find(y=>y.id===pid);if(!p)throw new Error('Person nicht gefunden.');
      if(link){ps.forEach(y=>{if(y.member===me)delete y.member});p.member=me}else delete p.member},o);
    try{const r=run();if(f5Result(r,{run,msg})){render();alertMsg(msg)}}catch(e){alertMsg(e&&e.message||String(e))}
    return;
  }
  if(!c)return;
  try{await c.claimParty(t.id,pid,link);Sync.schedule(0);alertMsg(link?'Zugeordnet.':'Zuordnung gelöst.')}catch(e){alertMsg(e&&e.message||String(e))}
}

function gemeinsamBlock(t){
  if(!gmOnline(t))return '';
  gmEnsureWatch();
  const s=GM.trips[t.id];
  if(!s||(!s.loading&&Date.now()-(s.at||0)>60000)){gmLoad(t.id)}
  const head='<section class="block gm"><div class="between"><h2>Ideen von allen</h2><span class="small muted">für alle Mitglieder sichtbar</span></div>';
  if(!s||!s.list){return head+(s&&s.error?'<p class="small">Pinnwand nicht geladen: '+esc(s.error)+'</p>':'<p class="small muted">Lade Pinnwand …</p>')+'</section>'}
  const open=s.list.filter(i=>i.status==='neu'),done=s.list.filter(i=>i.status!=='neu');
  const score=i=>(s.votes||[]).filter(v=>v.idea_id===i.id).length;
  open.sort((a,b)=>score(b)-score(a)||String(a.created_at).localeCompare(String(b.created_at)));
  const name=GM.profile,me=gmMe();
  gmPresence(t);
  const others=GM.here.filter(h=>h.user_id!==me).map(h=>{const m=(s.members||[]).find(x=>x.user_id===h.user_id);return (m&&m.display_name)||h.name||gmName(s,h.user_id)});
  const here=others.length?'<p class="gm-here small" role="status"><span aria-hidden="true">●</span> Gerade in der Reise: <b>'+esc(others.join(', '))+'</b></p>':'';
  const ask=!name&&!GM.editName&&(s.members||[]).length>1?'<div class="note gm-ask"><b>Wie sollen dich die anderen sehen?</b><div class="row"><label class="fld" style="flex:1"><span>Anzeigename (freiwillig)</span><input id="gm-name" maxlength="40" autocomplete="nickname" placeholder="z. B. Anna"></label><button type="button" class="btn sm" data-gm="name-save">Speichern</button></div><p class="small muted">Ohne Namen sehen die anderen „Mitglied 2“ o. Ä. Deine E-Mail-Adresse sieht nur der Eigentümer.</p></div>':'';
  return gmChanges(t,s)+gmMeBlock(t,s)+head+here+ask+
    '<p class="small muted">Was wollt ihr unbedingt machen? Ideen ändern den Plan nicht, sie sammeln nur. Alle Mitglieder, auch mit Leserecht, können eintragen und mit 👍 abstimmen.</p>'+
    '<form class="form gm-form" data-gm-form="idea"><label class="fld"><span>Neue Idee</span><textarea id="gm-body" maxlength="500" rows="2" placeholder="z. B. Rodeln am Abend, Therme am Regentag"></textarea></label>'+
    '<label class="fld"><span>Link (optional, https)</span><input type="url" id="gm-link" maxlength="500" placeholder="https://…" inputmode="url"></label>'+
    '<button type="submit" class="btn sm">Idee eintragen</button></form>'+
    (open.length?'<ul class="plain gm-list">'+open.map(i=>gmIdea(t,s,i)).join('')+'</ul>':'<p class="small muted">Noch keine offenen Ideen.</p>')+
    (done.length?'<details><summary>Erledigt ('+done.length+')</summary><ul class="plain gm-list">'+done.map(i=>gmIdea(t,s,i)).join('')+'</ul></details>':'')+
    gmPolls(t,s)+gmComments(t,s)+
    (ask?'':'<p class="small gm-name">'+(GM.editName?
      '<span class="row"><label class="fld" style="flex:1"><span>Dein Anzeigename</span><input id="gm-name" maxlength="40" value="'+esc(name||'')+'" autocomplete="nickname"></label><button type="button" class="btn sm" data-gm="name-save">Speichern</button><button type="button" class="btn ghost sm" data-gm="name-cancel">Abbrechen</button></span><span class="muted">Leer lassen, um keinen Namen zu zeigen. Die anderen sehen dann „Mitglied 2“ o. Ä.</span>':
      'So sehen dich die anderen: <b>'+esc(name||'ohne Namen')+'</b> <button type="button" class="btn ghost sm" data-gm="name-edit">'+(name?'Ändern':'Namen festlegen')+'</button>')+'</p>')+'</section>';
}

/* ---------- G7 Abstimmungen und Kommentare (Migration 20261116220000, PLAN_GEMEINSAM §9c) ----------
   Ändern den Reiseplan nie. Alle Mitglieder, auch Leser, legen an, stimmen ab und kommentieren. Kommentare hängen an der
   Reise ('trip'), einem Tag ('day:<Datum>' bzw. 'day:<Nummer>' ohne festes Datum) oder einer Unternehmung ('item:<uid>'). */
const GM7={editComment:null};
function gmDayTarget(t,i){const d=daysOf(t)[i];return 'day:'+(d&&d.date?iso(d.date):i)}
function gmTargetLabel(t,target){
  if(target==='trip')return 'die Reise';
  let m=/^day:(.+)$/.exec(target);
  if(m){const ds=daysOf(t),d=/^\d+$/.test(m[1])?ds[+m[1]]:ds.find(x=>x.date&&iso(x.date)===m[1]);return d?d.label:(/^\d+$/.test(m[1])?'Tag '+(+m[1]+1):fmtLong(pd(m[1])))+' (nicht mehr im Zeitraum)'}
  m=/^item:(.+)$/.exec(target);
  if(m){const it=(t.items||[]).find(i=>i.uid===m[1]),a=it&&actOf(t,it.act);return a?a.t:'entfernte Unternehmung'}
  return target;
}
const gmAt=x=>new Date(x).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
function gmState(t){
  const s=GM.trips[t.id];
  if(!s||(!s.loading&&Date.now()-(s.at||0)>60000))gmLoad(t.id);
  return GM.trips[t.id];
}
function gmThread(t,target){
  if(!gmOnline(t))return '';
  const s=gmState(t),id=' class="gm-thread" data-gm-target="'+esc(target)+'"';
  if(!s||s.comments===undefined)return '<div'+id+'><p class="small muted">Lade Kommentare …</p></div>';
  if(s.comments===null)return '<div'+id+'><p class="small muted">Kommentare sind gerade nicht verfügbar.</p></div>';
  const me=gmMe(),role=Store.role(t.id),list=s.comments.filter(c=>c.target===target);
  const rows=list.map(c=>GM7.editComment===c.id?
    '<li class="gm-comment"><form class="form" data-gm-form="comment-edit" data-val="'+esc(c.id)+'"><label class="fld"><span>Kommentar ändern</span><textarea name="body" maxlength="1000" rows="2">'+esc(c.body)+'</textarea></label><div class="row"><button type="submit" class="btn sm">Speichern</button><button type="button" class="btn ghost sm" data-gm="c-cancel">Abbrechen</button></div></form></li>':
    '<li class="gm-comment"><p>'+esc(c.body)+'</p><p class="small muted">'+esc(gmName(s,c.author))+' · '+esc(gmAt(c.created_at))+(c.edited_at?' · bearbeitet':'')+
    (c.author===me?' <button type="button" class="lnk" data-gm="c-edit" data-val="'+esc(c.id)+'">Ändern</button>':'')+
    (c.author===me||role==='owner'?' <button type="button" class="lnk" data-gm="c-del" data-val="'+esc(c.id)+'">Zurückziehen</button>':'')+'</p></li>').join('');
  return '<div'+id+'>'+(rows?'<ul class="plain gm-comments">'+rows+'</ul>':'<p class="small muted">Noch keine Kommentare.</p>')+
    '<form class="form gm-form" data-gm-form="comment" data-target="'+esc(target)+'"><label class="fld"><span>'+(target==='trip'?'Dein Kommentar':'Kommentar zu '+esc(gmTargetLabel(t,target)))+'</span><textarea name="body" maxlength="1000" rows="2" placeholder="z. B. Bitte früh los, der Parkplatz ist klein."></textarea></label><button type="submit" class="btn sm">Senden</button></form></div>';
}
/* Kommentar-Knopf im Tageskopf des Tagesplans: Anzahl, öffnet das Gespräch zum Tag im Blatt */
function gmDayBadge(t,i){
  if(!gmOnline(t))return '';
  const s=gmState(t),target=gmDayTarget(t,i),n=s&&s.comments?s.comments.filter(c=>c.target===target).length:0;
  if(s&&s.comments===null)return '';
  return ' <button type="button" class="lnk gm-badge" data-gm="thread" data-val="'+esc(target)+'" aria-label="Kommentare zu '+esc(gmTargetLabel(t,target))+': '+n+'">💬'+(n?' '+n:'')+'</button>';
}
/* Gespräch im Blatt der Unternehmung (app/blaetter.js sheetItem) */
function gmItemThread(t,u){return gmOnline(t)?'<div class="panel gm-item-thread"><h4>Kommentare</h4>'+gmThread(t,'item:'+u)+'</div>':''}
/* Offene Blätter mit Gespräch nach dem Laden neu zeichnen; begonnene Eingaben bleiben stehen. */
function gmRefreshThreads(tid){
  if(typeof document==='undefined'||!document.querySelectorAll)return;
  const t=Store.get(tid);if(!t)return;
  document.querySelectorAll('.sheet .gm-thread[data-gm-target]').forEach(el=>{
    const ta=el.querySelector('form[data-gm-form="comment"] textarea'),keep=ta?ta.value:'',focus=ta&&document.activeElement===ta;
    const box=document.createElement('div');box.innerHTML=gmThread(t,el.getAttribute('data-gm-target'));
    const fresh=box.firstElementChild;if(!fresh)return;el.replaceWith(fresh);
    const nt=fresh.querySelector('form[data-gm-form="comment"] textarea');if(nt&&keep){nt.value=keep;if(focus)nt.focus()}
  });
}
function gmOtherThreads(t,s){
  const by={};(s.comments||[]).forEach(c=>{if(c.target!=='trip')by[c.target]=(by[c.target]||0)+1});
  const ks=Object.keys(by);if(!ks.length)return '';
  ks.sort((a,b)=>{const la=(s.comments||[]).filter(c=>c.target===a).pop(),lb=(s.comments||[]).filter(c=>c.target===b).pop();return String(lb.created_at).localeCompare(String(la.created_at))});
  return '<p class="small">Gespräche an Tagen und Unternehmungen: '+ks.slice(0,8).map(k=>'<button type="button" class="lnk" data-gm="thread" data-val="'+esc(k)+'">'+esc(gmTargetLabel(t,k))+' ('+by[k]+')</button>').join(' · ')+'</p>';
}
function gmPoll(t,s,p){
  const me=gmMe(),role=Store.role(t.id),votes=(s.pollVotes||[]).filter(v=>v.poll_id===p.id),closed=!!p.closed_at;
  const voters=new Set(votes.map(v=>v.user_id)).size,counts=p.options.map((o,i)=>votes.filter(v=>v.option===i).length),max=Math.max(0,...counts);
  const opts=p.options.map((o,i)=>{const vs=votes.filter(v=>v.option===i),mine=vs.some(v=>v.user_id===me),n=vs.length,pct=voters?Math.round(n/voters*100):0;
    return '<li><button type="button" class="gm-opt'+(mine?' mine':'')+(closed&&n&&n===max?' win':'')+'" data-gm="poll-vote" data-val="'+esc(p.id)+'" data-opt="'+i+'" aria-pressed="'+mine+'"'+(closed?' disabled':'')+'>'+
      '<span class="gm-bar" aria-hidden="true" style="width:'+pct+'%"></span><span class="gm-optt">'+(mine?'✓ ':'')+esc(o)+'</span><b class="num">'+n+'</b></button>'+
      (n?'<span class="small muted gm-who">'+esc(vs.map(v=>gmName(s,v.user_id)).join(', '))+'</span>':'')+'</li>'}).join('');
  const canClose=p.author===me||role==='owner'||role==='editor',canDel=p.author===me||role==='owner';
  return '<li class="gm-poll'+(closed?' gm-closed':'')+'"><p><b>'+esc(p.question)+'</b></p><p class="small muted">von '+esc(gmName(s,p.author))+' · '+(p.multi?'mehrere Antworten möglich':'eine Antwort')+(p.target!=='trip'?' · zu '+esc(gmTargetLabel(t,p.target)):'')+' · '+voters+(voters===1?' Person hat':' Personen haben')+' abgestimmt'+(closed?' · <b>geschlossen</b>':'')+'</p>'+
    '<ul class="plain gm-opts">'+opts+'</ul>'+(canClose||canDel?'<div class="row gm-acts">'+
    (canClose?'<button type="button" class="btn ghost sm" data-gm="poll-close" data-val="'+esc(p.id)+'" data-how="'+(closed?'open':'close')+'">'+(closed?'Wieder öffnen':'Abstimmung schließen')+'</button>':'')+
    (canDel?'<button type="button" class="btn ghost sm" data-gm="poll-del" data-val="'+esc(p.id)+'">Zurückziehen</button>':'')+'</div>':'')+'</li>';
}
function gmPolls(t,s){
  if(!s.polls)return '';
  const open=s.polls.filter(p=>!p.closed_at),closed=s.polls.filter(p=>p.closed_at);
  return '<h3>Abstimmungen</h3>'+(open.length?'<ul class="plain gm-list">'+open.map(p=>gmPoll(t,s,p)).join('')+'</ul>':'<p class="small muted">Keine offene Abstimmung. Gut für Fragen mit festen Antworten, z. B. „Wohin am Samstag?“.</p>')+
    (closed.length?'<details><summary>Abgeschlossen ('+closed.length+')</summary><ul class="plain gm-list">'+closed.map(p=>gmPoll(t,s,p)).join('')+'</ul></details>':'')+
    '<details class="panel gm-pollform"><summary><b>+ Neue Abstimmung</b></summary><form class="form" data-gm-form="poll"><label class="fld"><span>Frage</span><input id="gm-pq" maxlength="200" placeholder="z. B. Wohin am Samstag?"></label>'+
    '<label class="fld"><span>Antworten, eine je Zeile (2 bis 8)</span><textarea id="gm-po" rows="3" maxlength="700" placeholder="Therme&#10;Rodeln&#10;Museum"></textarea></label>'+
    '<label class="chk"><input type="checkbox" id="gm-pm"> Mehrere Antworten erlaubt</label><button type="submit" class="btn sm">Abstimmung starten</button></form></details>';
}
function gmComments(t,s){
  if(s.comments===null||s.comments===undefined)return '';
  return '<h3>Kommentare</h3>'+gmThread(t,'trip')+gmOtherThreads(t,s);
}

async function gmAct(fn,tid,msg){
  try{await fn();if(msg)alertMsg(msg)}catch(e){alertMsg(e&&e.message||String(e))}
  if(GM.trips[tid])GM.trips[tid].at=0;await gmLoad(tid);
}
if(typeof document!=='undefined'&&document.addEventListener){
  document.addEventListener('submit',e=>{
    const g=e.target.closest&&e.target.closest('[data-gm-form="poll"],[data-gm-form="comment"],[data-gm-form="comment-edit"]');if(!g)return;e.preventDefault();
    const t=cur(),c=gmCloud();if(!t||!c)return;
    const kind=g.getAttribute('data-gm-form');
    if(kind==='poll'){
      const q=($('#gm-pq')&&$('#gm-pq').value||'').trim(),opts=($('#gm-po')&&$('#gm-po').value||'').split('\n').map(x=>x.trim()).filter(Boolean),multi=!!($('#gm-pm')&&$('#gm-pm').checked);
      if(!q){alertMsg('Bitte eine Frage eingeben.');return}
      if(opts.length<2||opts.length>8){alertMsg('Bitte 2 bis 8 Antworten eingeben, eine je Zeile.');return}
      if(opts.some(o=>o.length>80)){alertMsg('Antworten höchstens 80 Zeichen.');return}
      if(new Set(opts.map(o=>o.toLowerCase())).size!==opts.length){alertMsg('Jede Antwort nur einmal.');return}
      gmAct(()=>c.addPoll(t.id,q,opts,multi,'trip'),t.id,'Abstimmung gestartet.');return}
    const ta=g.querySelector('textarea'),body=(ta&&ta.value||'').trim();
    if(!body){alertMsg('Bitte einen Kommentar eingeben.');return}
    if(body.length>1000){alertMsg('Höchstens 1000 Zeichen.');return}
    if(kind==='comment'){const target=g.getAttribute('data-target');gmAct(async()=>{await c.addComment(t.id,target,body);if(ta)ta.value=''},t.id,'Kommentar gesendet.');return}
    GM7.editComment=null;gmAct(()=>c.setComment(g.getAttribute('data-val'),{body}),t.id,'Kommentar geändert.');
  });
  document.addEventListener('submit',e=>{
    const f=e.target.closest&&e.target.closest('[data-gm-form="idea"]');if(!f)return;e.preventDefault();
    const t=cur(),c=gmCloud();if(!t||!c)return;
    const body=($('#gm-body')&&$('#gm-body').value||'').trim(),link=($('#gm-link')&&$('#gm-link').value||'').trim();
    if(!body){alertMsg('Bitte eine Idee eingeben.');return}
    if(link&&!/^https:\/\/\S+$/.test(link)){alertMsg('Links bitte mit https:// angeben.');return}
    gmAct(()=>c.addIdea(t.id,body,link),t.id,'Idee eingetragen.');
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('[data-gm]');if(!b)return;
    const t=cur(),c=gmCloud();if(!t||!c)return;
    const act=b.getAttribute('data-gm'),val=b.getAttribute('data-val'),s=GM.trips[t.id]||{};
    if(act==='vote'){const mine=(s.votes||[]).some(v=>v.idea_id===val&&v.user_id===gmMe());gmAct(()=>c.vote(val,!mine),t.id);return}
    if(act==='status'){gmAct(()=>c.setIdea(val,{status:b.getAttribute('data-how')}),t.id,'Status geändert.');return}
    if(act==='withdraw'){gmAct(()=>c.setIdea(val,{deleted_at:new Date().toISOString()}),t.id,'Idee zurückgezogen.');return}
    if(act==='plan'){const i=(s.list||[]).find(x=>x.id===val);if(!i)return;
      /* Normaler Planweg: Ideen-Bereich öffnen, Text der Idee als Vorlage merken; Status setzt die Person danach selbst. */
      try{if(navigator.clipboard)navigator.clipboard.writeText(i.body).catch(()=>{})}catch(x){}
      go('r-'+t.id+'-unternehmen');alertMsg('Idee kopiert. Tragt sie hier als Unternehmung ein und setzt sie danach auf „Eingeplant“.');return}
    if(act==='claim'){const sel=$('#gm-party');if(sel&&sel.value)gmClaim(t,sel.value,true);return}
    if(act==='unclaim'){gmClaim(t,val,false);return}
    if(act==='poll-vote'){const p=(s.polls||[]).find(x=>x.id===val);if(!p)return;const i=Number(b.getAttribute('data-opt'));
      const mine=(s.pollVotes||[]).filter(v=>v.poll_id===val&&v.user_id===gmMe()).map(v=>v.option);
      const next=p.multi?(mine.includes(i)?mine.filter(x=>x!==i):mine.concat(i)):(mine.includes(i)?[]:[i]);
      gmAct(()=>c.votePoll(val,next),t.id);return}
    if(act==='poll-close'){const how=b.getAttribute('data-how');gmAct(()=>c.setPoll(val,{closed_at:how==='close'?new Date().toISOString():null}),t.id,how==='close'?'Abstimmung geschlossen.':'Abstimmung wieder offen.');return}
    if(act==='poll-del'){gmAct(()=>c.setPoll(val,{deleted_at:new Date().toISOString()}),t.id,'Abstimmung zurückgezogen.');return}
    if(act==='thread'){openSheet('<span class="eyebrow">Kommentare</span><h2>'+esc(gmTargetLabel(t,val))+'</h2>'+gmThread(t,val));return}
    if(act==='c-edit'){GM7.editComment=val;render();gmRefreshThreads(t.id);return}
    if(act==='c-cancel'){GM7.editComment=null;render();gmRefreshThreads(t.id);return}
    if(act==='c-del'){gmAct(()=>c.setComment(val,{deleted_at:new Date().toISOString()}),t.id,'Kommentar zurückgezogen.');return}
    if(act==='seen'){gmAct(()=>c.markSeen(t.id,Number(val)),t.id);return}
    if(act==='name-edit'){GM.editName=true;render();const x=$('#gm-name');if(x)x.focus();return}
    if(act==='name-cancel'){GM.editName=false;render();return}
    if(act==='name-save'){const v=($('#gm-name')&&$('#gm-name').value||'').trim();if(v.length>40){alertMsg('Höchstens 40 Zeichen.');return}
      GM.editName=false;gmAct(async()=>{GM.profile=await c.setProfile(gmMe(),v);GM.profileFor=gmMe();GM.presFor='neu';Object.values(GM.trips).forEach(x=>x.at=0)},t.id,v?'Anzeigename gespeichert.':'Anzeigename entfernt.');return}
  });
}
