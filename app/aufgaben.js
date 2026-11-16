/* Reiseplaner · Eigene Aufgaben (M02.4, Claude 16.11.2026). Format 5: t.tasks [{id, title, due, done, doneAt, by, doneBy, src}].
   Klassisches Skript ohne Bundler, teilt sich den globalen Gültigkeitsbereich mit den übrigen app/*.js-Teilen.
   Schreiben nur über f5Commit (app/format5.js): Anheben auf Format 5 nach Bestätigung, Prüfung durch validateV5.
   Fristen: deadlines() (app/fristen.js) zeigt Aufgaben als task:<id>, „Als Nächstes“ und Kalender nehmen sie mit. */
"use strict";
const TASK_ID_RE=/^[a-z][a-z0-9]{3,40}$/;
function taskNewId(list){const have=new Set((list||[]).map(x=>x&&x.id));let id;do{id='task'+Math.random().toString(36).slice(2,10).replace(/[^a-z0-9]/g,'')}while(have.has(id)||!TASK_ID_RE.test(id));return id}
/* Eingabe prüfen und in die gespeicherte Form bringen (rein) */
function taskFromInput(t,inp){
  const title=String(inp&&inp.title||'').trim();
  if(!title)throw new Error('Aufgabe: Titel fehlt.');
  if(title.length>120)throw new Error('Aufgabe: Titel höchstens 120 Zeichen.');
  const date=String(inp.date||'').trim(),time=String(inp.time||'').trim();
  if(time&&!date)throw new Error('Aufgabe: Uhrzeit nur mit Datum.');
  if(date&&!pd(date))throw new Error('Aufgabe: Datum ungültig.');
  if(time&&timeMin(time)==null)throw new Error('Aufgabe: Uhrzeit ungültig.');
  const by=String(inp.by||'').trim()||null;
  if(by&&!(t.party||[]).some(p=>p.id===by))throw new Error('Aufgabe: Person gibt es in dieser Reise nicht.');
  return {title,due:date?{date,time:time||null,tz:null}:null,by};
}
function taskAdd(t,inp,opt){
  const x=taskFromInput(t,inp);
  return f5Commit(t,c=>{const list=Array.isArray(c.tasks)?c.tasks.slice():[];if(list.length>=300)throw new Error('Höchstens 300 Aufgaben je Reise.');
    const e={id:taskNewId(list),title:x.title,due:x.due,done:false,src:'user'};if(x.by)e.by=x.by;list.push(e);c.tasks=list},opt);
}
function taskUpdate(t,id,inp,opt){
  const x=taskFromInput(t,inp);
  return f5Commit(t,c=>{const e=(c.tasks||[]).find(k=>k.id===id);if(!e)throw new Error('Aufgabe nicht gefunden.');
    e.title=x.title;e.due=x.due;if(x.by)e.by=x.by;else delete e.by},opt);
}
function taskToggle(t,id,done,opt){
  return f5Commit(t,c=>{const e=(c.tasks||[]).find(k=>k.id===id);if(!e)throw new Error('Aufgabe nicht gefunden.');
    e.done=!!done;if(done){e.doneAt=f5Stamp(opt&&opt.now)}else{delete e.doneAt;delete e.doneBy}},opt);
}
function taskRemove(t,id,opt){
  return f5Commit(t,c=>{const list=(c.tasks||[]).filter(k=>k.id!==id);if(list.length===(c.tasks||[]).length)throw new Error('Aufgabe nicht gefunden.');
    if(list.length)c.tasks=list;else delete c.tasks;
    if(c.deadlineAck&&c.deadlineAck['task:'+id]){const a=Object.assign({},c.deadlineAck);delete a['task:'+id];if(Object.keys(a).length)c.deadlineAck=a;else delete c.deadlineAck}},opt);
}
/* Sortierung: offen vor erledigt, datiert chronologisch, dann ohne Datum in Erfassungsreihenfolge */
function taskList(t){
  const l=(Array.isArray(t.tasks)?t.tasks:[]).map((x,i)=>[x,i]);
  const key=x=>x.due&&x.due.date?x.due.date+(x.due.time||''):'\uffff';
  const cmp=(x,y)=>x<y?-1:x>y?1:0;
  return l.sort(([a,i],[b,j])=>(a.done-b.done)||cmp(key(a),key(b))||i-j).map(p=>p[0]);
}
/* ---------- Anzeige: Abschnitt in der Checkliste ---------- */
function aufgabenPanel(t){
  if(!V5)return '';
  const list=taskList(t),edit=typeof f5CanEdit==='function'&&f5CanEdit(t),party=t.party||[],today=iso(todayUTC());
  if(!list.length&&!edit)return '';
  const who=id=>{const p=party.find(x=>x.id===id);return p?p.name:''};
  const when=x=>{if(!x.due)return '';const d=x.due.date,lbl=fmtLong(pd(d))+(x.due.time?' '+x.due.time:'');return !x.done&&d<today?'<b style="color:var(--bad)">! überfällig seit '+esc(lbl)+'</b>':'fällig '+esc(lbl)};
  const row=x=>'<div class="chk'+(x.done?' ok':'')+'" data-task="'+esc(x.id)+'"><label class="row" style="flex:1;gap:.5rem"><input type="checkbox" data-task-act="toggle" data-id="'+esc(x.id)+'"'+(x.done?' checked':'')+(edit?'':' disabled')+'> <span><b>'+esc(x.title)+'</b>'+
    ([when(x),x.by?'zuständig: '+esc(who(x.by)):''].filter(Boolean).length?'<br><small class="muted">'+[when(x),x.by?'zuständig: '+esc(who(x.by)):''].filter(Boolean).join(' · ')+'</small>':'')+'</span></label>'+
    (edit?'<button type="button" class="lnk" data-task-act="edit" data-id="'+esc(x.id)+'">Ändern</button> <button type="button" class="lnk" data-task-act="remove" data-id="'+esc(x.id)+'">Entfernen</button>':'')+'</div>';
  const open=list.filter(x=>!x.done).length;
  return '<section class="block" data-tasks><div class="between"><h2>Aufgaben</h2><span class="badge num">'+open+' offen</span></div><p class="small muted">Eigene To-dos mit Termin und Zuständigkeit. Datierte Aufgaben erscheinen unter „Als Nächstes“ und im Kalenderexport.</p>'+
    (list.length?'<div class="checks-list">'+list.map(row).join('')+'</div>':'')+
    (edit?'<div class="row"><button type="button" class="btn sm" data-task-act="new">Aufgabe hinzufügen</button></div>':'')+'</section>';
}
function aufgabeSheet(t,id){
  const x=id?(t.tasks||[]).find(k=>k.id===id):null,party=t.party||[];
  return '<h2>'+(x?'Aufgabe ändern':'Neue Aufgabe')+'</h2>'+
    '<label class="fld"><span>Was ist zu tun?</span><input id="task-title" type="text" maxlength="120" value="'+esc(x?x.title:'')+'" placeholder="z. B. Winterreifen prüfen"></label>'+
    '<div class="row"><label class="fld"><span>Bis wann (optional)</span><input id="task-date" type="date" value="'+esc(x&&x.due?x.due.date:'')+'"></label><label class="fld"><span>Uhrzeit (optional)</span><input id="task-time" type="time" value="'+esc(x&&x.due&&x.due.time||'')+'"></label></div>'+
    (party.length?'<label class="fld"><span>Zuständig</span><select id="task-by"><option value="">niemand Bestimmtes</option>'+party.map(p=>'<option value="'+esc(p.id)+'"'+(x&&x.by===p.id?' selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></label>':'<p class="small muted">Zuständigkeit gibt es, sobald unter „Kosten“ Mitreisende eingetragen sind.</p>')+
    (t.schemaVersion===5?'':'<div class="note" role="status"><p>'+esc(F5_UPGRADE_TXT)+'</p></div>')+'<p id="f5-error" class="small" role="alert" hidden></p>'+
    '<div class="row"><button type="button" class="btn" data-task-act="save"'+(x?' data-id="'+esc(x.id)+'"':'')+'>Speichern</button></div>';
}
if(typeof document!=='undefined'){
  const taskRead=()=>({title:f5Val('task-title'),date:f5Val('task-date'),time:f5Val('task-time'),by:f5Val('task-by')});
  const runTask=(run,msg)=>{const r=run();if(f5Result(r,{run,msg})){if($('.sheet'))closeSheet();render();alertMsg(msg)}};
  document.addEventListener('click',e=>{
    const el=e.target&&e.target.closest&&e.target.closest('[data-task-act]');if(!el)return;
    const t=cur();if(!t)return;const act=el.getAttribute('data-task-act'),id=el.getAttribute('data-id');
    try{
      if(act==='toggle')return; /* über change */
      if(act==='new'||act==='edit'){openSheet(aufgabeSheet(t,act==='edit'?id:null));return}
      if(act==='save'){const inp=taskRead();runTask(o=>id?taskUpdate(t,id,inp,o):taskAdd(t,inp,o),id?'Aufgabe geändert.':'Aufgabe hinzugefügt.');return}
      if(act==='remove'){runTask(o=>taskRemove(t,id,o),'Aufgabe entfernt.');return}
    }catch(err){f5Error(err)}
  });
  document.addEventListener('change',e=>{
    const el=e.target&&e.target.closest&&e.target.closest('[data-task-act="toggle"]');if(!el)return;
    const t=cur();if(!t)return;const id=el.getAttribute('data-id'),done=!!el.checked;
    try{runTask(o=>taskToggle(t,id,done,o),done?'Aufgabe erledigt.':'Aufgabe wieder offen.')}catch(err){el.checked=!done;alertMsg(err.message)}
  });
}
