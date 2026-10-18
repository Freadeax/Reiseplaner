/* Reiseplaner · Konto, Freigaben, Konflikte.
   Teil 13 von 17 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Konto, Freigaben, Konflikte (Issue #6) ================= */
const ROLE_TXT={owner:'Eigentümer',editor:'Bearbeiten',viewer:'Lesen'};
const SYNC_TXT={'nicht-lesbar':'online nicht lesbar',online:'online gespeichert',ausstehend:'Synchronisation ausstehend',konflikt:'Konflikt',fehler:'Speicherfehler','kein-zugriff':'kein Zugriff mehr'};
function syncBadge(id){const s=tripSyncState(id);if(!s)return '';const cls=s==='online'?'ok':s==='ausstehend'?'est':'bad';return '<span class="badge '+cls+'">'+SYNC_TXT[s]+'</span>'}
/* Anmeldung per E-Mail-Code (P0.7): Adresse → Code senden → Code eingeben. Nur für bestehende Konten,
   die Anzeige ist für unbekannte Adressen gleich. UI.otp: {email,sentAt,wait,err,info}; ohne email = Schritt 1.
   Der Countdown ändert nur den Knopf, nie die ganze Ansicht (eingetippter Code bliebe sonst nicht erhalten). */
const OTP_ENTRY='<div class="row" style="margin-top:12px"><button type="button" class="btn ghost" data-acc="mode" data-val="code">Mit Code aus der E-Mail anmelden</button></div>';
let otpIv=null;
function otpWaitLeft(){const o=UI.otp;if(!o||!o.sentAt)return 0;return Math.max(0,Math.ceil((o.sentAt+(o.wait||0)*1000-Date.now())/1000))}
function otpResendLabel(s){return s>0?'Neuer Code in '+s+' s möglich':'Code erneut senden'}
function otpFocus(id){const x=typeof document!=='undefined'&&document.getElementById?document.getElementById(id):null;if(x&&x.focus)x.focus()}
function otpTimer(){
  if(otpIv||typeof setInterval!=='function'||otpWaitLeft()<=0)return;
  otpIv=setInterval(()=>{const b=document.querySelector('[data-acc="code-resend"]'),s=otpWaitLeft();if(b){b.disabled=s>0;b.textContent=otpResendLabel(s)}if(!b||s<=0){clearInterval(otpIv);otpIv=null}},1000);
}
function otpForm(){
  const o=UI.otp||{},err=o.err?'<p class="note" role="alert" id="acc-code-err">'+esc(o.err)+'</p>':'',inv=o.err?' aria-invalid="true"':'';
  if(!o.email)return '<form class="panel" data-acc-form="code-send" aria-labelledby="acc-code-h"><h2 id="acc-code-h">Mit Code aus der E-Mail anmelden</h2>'+err+
    '<label class="fld"><span>E-Mail</span><input type="email" id="acc-email" autocomplete="email" required value="'+esc(UI.authEmail||'')+'" aria-describedby="'+(o.err?'acc-code-err ':'')+'acc-code-help"'+inv+'></label>'+
    '<p class="small muted" id="acc-code-help">Ihr bekommt eine E-Mail mit einem Zahlencode und gebt ihn hier ein; ein Passwort ist dafür nicht nötig. Das geht nur mit einem bestehenden Konto. Neue Konten über „Registrieren“.</p>'+
    '<button class="btn" type="submit">Code senden</button><button type="button" class="btn ghost" data-acc="mode" data-val="signin">Zurück zur Anmeldung mit Passwort</button></form>';
  const s=otpWaitLeft();if(s>0)otpTimer();
  return '<form class="panel" data-acc-form="code-verify" aria-labelledby="acc-code-h"><h2 id="acc-code-h">Code eingeben</h2>'+
    '<p id="acc-code-sent">Falls zu <b>'+esc(o.email)+'</b> ein Konto besteht, ist eine E-Mail mit einem Code unterwegs.</p>'+(o.info?'<p class="small" role="status">'+esc(o.info)+'</p>':'')+err+
    '<input type="email" autocomplete="username" value="'+esc(o.email)+'" hidden readonly>'+
    '<label class="fld"><span>Code aus der E-Mail</span><input type="text" id="acc-code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" spellcheck="false" autocapitalize="off" required aria-describedby="acc-code-sent '+(o.err?'acc-code-err ':'')+'acc-code-hint"'+inv+'></label>'+
    '<p class="small muted" id="acc-code-hint">Nur Ziffern. Der Code gilt begrenzte Zeit und nur einmal; nach erneutem Senden gilt nur der neueste. Keine E-Mail? Spam-Ordner prüfen. Ist das Konto noch nicht bestätigt, kommt stattdessen die Bestätigungs-E-Mail; dann den Link darin öffnen.</p>'+
    '<button class="btn" type="submit">Anmelden</button>'+
    '<div class="row"><button type="button" class="btn ghost sm" data-acc="code-resend"'+(s>0?' disabled':'')+'>'+otpResendLabel(s)+'</button><button type="button" class="btn ghost sm" data-acc="code-back">Andere Adresse</button><button type="button" class="btn ghost sm" data-acc="mode" data-val="signin">Mit Passwort anmelden</button></div></form>';
}
async function otpSend(email,resend){
  const c=Sync.cloud();if(!c||UI.otpBusy)return;
  UI.otpBusy=true;const btn=document.querySelector(resend?'[data-acc="code-resend"]':'[data-acc-form="code-send"] button[type="submit"]');if(btn)btn.disabled=true;
  try{
    const r=await c.sendCode(email);UI.otpBusy=false;UI.authEmail=r.email;
    UI.otp={email:r.email,sentAt:Date.now(),wait:r.wait,err:'',info:!resend?'':r.throttled?'Ein neuer Code ist erst in '+r.wait+' s möglich. Falls ein Konto besteht, gilt der zuletzt gesendete Code weiter.':'Falls ein Konto besteht, ist ein neuer Code unterwegs. Nur der neueste Code gilt.'};
    render();otpFocus('acc-code');otpTimer();
  }catch(e){
    UI.otpBusy=false;const msg=e&&e.message?e.message:String(e);
    if(resend&&UI.otp&&UI.otp.email){UI.otp.err=msg;UI.otp.info='';if(e.wait){UI.otp.sentAt=Date.now();UI.otp.wait=e.wait}render();otpFocus('acc-code');otpTimer()}
    else{UI.authEmail=String(email||'');UI.otp={err:msg};render();otpFocus('acc-email')}
  }
}
async function otpVerify(code){
  const c=Sync.cloud(),o=UI.otp;if(!c||!o||!o.email||UI.otpBusy)return;
  UI.otpBusy=true;const btn=document.querySelector('[data-acc-form="code-verify"] button[type="submit"]');if(btn)btn.disabled=true;
  try{await c.verifyCode(o.email,code);UI.otpBusy=false;UI.otp=null;UI.authMode='signin';UI.authMsg='';render()}
  catch(e){
    UI.otpBusy=false;if(UI.otp!==o)return;
    o.err=e&&e.message?e.message:String(e);o.info='';render();
    const f=typeof document!=='undefined'&&document.getElementById?document.getElementById('acc-code'):null;if(f&&(e.network||e.code==='rate'))f.value=code;
    otpFocus('acc-code');otpTimer();
  }
}
function vKonto(){
  const c=Sync.cloud(),head='<section class="block"><button type="button" class="lnk" data-go="reisen">← Meine Reisen</button><span class="eyebrow">Konto & Speicher</span><h1>Konto</h1></section>';
  if(!c)return head+'<section class="block"><div class="note"><b>Online-Konto ist für diese Installation noch nicht eingerichtet.</b><p>Die App läuft im Gastmodus: Reisen liegen nur in diesem Browser. Nutzt „Reisen sichern“ für Sicherungsdateien. Einrichtung: docs/SUPABASE_SETUP.md.</p></div></section>';
  if(!Auth.ready)return head+'<section class="block"><p>Konto wird geladen …</p></section>';
  const f=UI.authMsg?'<div class="note" role="status"><p>'+esc(UI.authMsg)+'</p></div>':'';
  if(Auth.recovery&&Auth.user)return head+f+'<section class="block"><h2>Neues Passwort festlegen</h2><form class="panel" data-acc-form="newpw"><input type="email" autocomplete="username" value="'+esc(Auth.user.email||'')+'" hidden readonly><label class="fld"><span>Neues Passwort (mind. 10 Zeichen)</span><input type="password" id="acc-pw" autocomplete="new-password" minlength="10" required></label><label class="fld"><span>Wiederholen</span><input type="password" id="acc-pw2" autocomplete="new-password" minlength="10" required></label><button class="btn" type="submit">Passwort speichern</button></form></section>';
  if(!Auth.user){
    const m=UI.authMode||'signin';
    const tabs='<div class="row" role="tablist">'+[['signin','Anmelden'],['signup','Registrieren'],['reset','Passwort vergessen']].map(x=>'<button type="button" class="chipbtn" data-acc="mode" data-val="'+x[0]+'" aria-pressed="'+(m===x[0]||(m==='code'&&x[0]==='signin'))+'">'+x[1]+'</button>').join('')+'</div>';
    const email='<label class="fld"><span>E-Mail</span><input type="email" id="acc-email" autocomplete="email" required value="'+esc(UI.authEmail||'')+'"></label>';
    const form=m==='code'?otpForm():m==='signin'?'<form class="panel" data-acc-form="signin">'+email+'<label class="fld"><span>Passwort</span><input type="password" id="acc-pw" autocomplete="current-password" required></label><button class="btn" type="submit">Anmelden</button></form>'+OTP_ENTRY
      :m==='signup'?'<form class="panel" data-acc-form="signup">'+email+'<label class="fld"><span>Passwort (mind. 10 Zeichen)</span><input type="password" id="acc-pw" autocomplete="new-password" minlength="10" required></label><label class="fld"><span>Passwort wiederholen</span><input type="password" id="acc-pw2" autocomplete="new-password" minlength="10" required></label><p class="small muted">Ihr bekommt eine E-Mail zur Bestätigung. Erst danach ist die Anmeldung möglich.</p><button class="btn" type="submit">Konto anlegen</button></form>'
      :'<form class="panel" data-acc-form="reset">'+email+'<p class="small muted">Ihr bekommt einen Link, der zurück zu dieser Seite führt. Öffnet ihn im selben Browser.</p><button class="btn" type="submit">Link senden</button></form>';
    return head+f+(UI.invitePending?'<section class="block"><div class="note"><b>Einladung erkannt.</b><p>Meldet euch an oder registriert euch; danach wird die Einladung angenommen.</p></div></section>':'')+
      '<section class="block"><p class="lead muted">Mit Konto werden Reisen online gespeichert und lassen sich mit Mitreisenden teilen. Ohne Konto bleibt alles wie bisher nur in diesem Browser.</p>'+tabs+form+'</section>';
  }
  const n=Store.pending(),gp=guestPendingCount();
  return head+f+'<section class="block"><dl class="facts"><dt>Angemeldet</dt><dd>'+esc(Auth.user.email||'')+'</dd><dt>Speicher</dt><dd>'+esc($('#sync')?$('#sync').textContent:'')+'</dd>'+(Sync.last?'<dt>Letzter Abgleich</dt><dd>'+esc(new Date(Sync.last).toLocaleString('de-DE'))+'</dd>':'')+(Sync.notice?'<dt>Hinweis</dt><dd>'+esc(Sync.notice)+'</dd>':'')+'</dl>'+
    '<div class="row"><button type="button" class="btn sm" data-acc="sync">Jetzt synchronisieren</button><button type="button" class="btn ghost sm" data-acc="signout">Abmelden</button></div>'+
    (UI.confirm==='logout'?'<div class="note" role="alert"><b>'+(n?n+' Änderung'+(n===1?'':'en')+' noch nicht online gespeichert.':(Store.conflict||Store.localError?'Eine andere Ansicht hat neuere Daten gespeichert: ob Änderungen offen sind, ist unbekannt.':'Kontospeicher dieses Browsers nicht lesbar: ob Änderungen offen sind, ist unbekannt.'))+'</b><p>Beim Abmelden bleiben sie in diesem Browser für dieses Konto liegen und werden nach der nächsten Anmeldung übertragen. Sichert sie zusätzlich als Datei, falls ihr das Gerät wechselt.</p><div class="row"><button type="button" class="btn sm" data-acc="sync">Erst synchronisieren</button><button type="button" class="btn ghost sm" data-act="backup-all">Als Datei sichern</button><button type="button" class="btn warn sm" data-acc="signout-force">Trotzdem abmelden</button></div></div>':'')+
    '<p class="small muted">Lokaler Speicher ist keine Datensicherung. Der kostenlose Supabase-Tarif enthält keine automatischen Backups; sichert wichtige Reisen zusätzlich als Datei.</p></section>'+
    (gp?'<section class="block"><h2>Reisen ohne Konto in diesem Browser</h2><p>'+gp+' Reise'+(gp===1?'':'n')+' aus dem Gastmodus. Sie werden nicht automatisch übertragen.</p><button type="button" class="btn ghost sm" data-acc="adopt-open">Ansehen und übernehmen</button></section>':'')+
    '<section class="block"><h2>Meine Daten</h2><p class="small">Kontodaten enthalten alle Reisen, auf die ihr online Zugriff habt, mit eurer Rolle und euren Einladungen. Zum Wiederherstellen in der App dient die Reisesicherung.</p><div class="row"><button type="button" class="btn ghost sm" data-acc="export">Kontodaten herunterladen</button><button type="button" class="btn ghost sm" data-act="backup-all">Reisen als Sicherung speichern</button></div>'+
    '<h2>Konto löschen</h2><p class="small">Löscht euer Konto, eure eigenen Reisen und eure Mitgliedschaften endgültig. Vorher seht ihr genau, was betroffen ist, und könnt geteilte Reisen an Mitreisende übergeben.</p><button type="button" class="btn warn sm" data-acc="delete-open">Konto löschen …</button></section>'+
    '<section class="block"><h2>Einladung annehmen</h2><form class="row" data-acc-form="invite"><input type="text" id="acc-invite" placeholder="Einladungslink oder Code" style="flex:1;min-width:220px"><button class="btn ghost sm" type="submit">Annehmen</button></form></section>';
}
/* Konto löschen: Übersicht vom Server, je geteilter eigener Reise eine bewusste Wahl (übergeben oder mitlöschen),
   Bestätigung mit der E-Mail-Adresse. Nichts wird vorausgewählt. */
async function deleteAccountSheet(){
  const c=Sync.cloud();openSheet('<h2>Konto löschen</h2><p>Lade Übersicht …</p>');
  let s;try{s=await c.accountSummary()}catch(e){openSheet('<h2>Konto löschen</h2><p>'+esc(e.message)+'</p>');return}
  UI.delSummary=s;
  const shared=s.owned.filter(t=>t.members.length),solo=s.owned.filter(t=>!t.members.length),n=Store.pending();
  openSheet('<span class="eyebrow">Endgültig</span><h2>Konto löschen</h2>'+
    (n?'<div class="note" role="alert"><b>'+n+' Änderung'+(n===1?'':'en')+' noch nicht online gespeichert.</b><p>Sie gehen mit dem Konto verloren. Erst synchronisieren oder als Datei sichern.</p></div>':'')+
    '<p class="small">Tipp: Ladet vorher eure Daten herunter. Eine Löschung lässt sich nicht rückgängig machen.</p><div class="row"><button type="button" class="btn ghost sm" data-acc="export">Kontodaten herunterladen</button><button type="button" class="btn ghost sm" data-act="backup-all">Reisen als Sicherung speichern</button></div>'+
    '<h3>Was passiert</h3><ul class="small">'+
    '<li><b>'+solo.length+'</b> eigene Reise'+(solo.length===1?'':'n')+' ohne Mitreisende '+(solo.length===1?'wird':'werden')+' gelöscht.</li>'+
    '<li>Aus <b>'+s.member_of.length+'</b> geteilten Reise'+(s.member_of.length===1?'':'n')+' anderer werdet ihr entfernt. Diese Reisen bleiben für die anderen erhalten.</li>'+
    '<li>Reisen ohne Konto in diesem Browser (Gastmodus) bleiben unberührt.</li></ul>'+
    (shared.length?'<h3>Geteilte eigene Reisen</h3><p class="small">Bitte für jede Reise entscheiden. Bei „mitlöschen“ verlieren auch eure Mitreisenden die Reise.</p><div class="form">'+shared.map(t=>'<label class="fld"><span>'+esc(t.title)+(t.deleted?' (gelöscht markiert)':'')+'</span><select data-del-trip="'+esc(t.id)+'"><option value="">Bitte wählen</option>'+t.members.map(m=>'<option value="u:'+esc(m.user_id)+'">Übergeben an '+esc(m.email||m.user_id)+'</option>').join('')+'<option value="delete">Mitlöschen</option></select></label>').join('')+'</div>':'')+
    '<form class="panel" data-acc-form="delete-account"><p id="acc-del-err" class="note" role="alert" tabindex="-1" hidden></p><label class="fld"><span>Zur Bestätigung eure E-Mail-Adresse</span><input type="email" id="acc-del-email" autocomplete="off" required></label><button class="btn warn" type="submit">Konto endgültig löschen</button></form>');
}
async function deleteAccountDo(email){
  const c=Sync.cloud(),s=UI.delSummary;if(!s)throw new Error('Bitte die Übersicht neu öffnen.');
  if(email.trim().toLowerCase()!==String(s.email||'').toLowerCase())throw new Error('Die E-Mail-Adresse stimmt nicht mit diesem Konto überein.');
  const choice={};document.querySelectorAll('[data-del-trip]').forEach(el=>{choice[el.getAttribute('data-del-trip')]=el.value});
  const shared=s.owned.filter(t=>t.members.length);
  const missing=shared.filter(t=>!choice[t.id]);if(missing.length)throw new Error('Bitte für „'+missing[0].title+'“ wählen: übergeben oder mitlöschen.');
  for(const t of shared){const v=choice[t.id];if(v.startsWith('u:'))await c.transferTrip(t.id,v.slice(2))}
  /* Zwischenzeitlich neu geteilte Reisen nie ungefragt mitlöschen */
  const now=await c.accountSummary(),left=now.owned.filter(t=>t.members.length).map(t=>t.id).sort(),agreed=shared.filter(t=>choice[t.id]==='delete').map(t=>t.id).sort();
  if(JSON.stringify(left)!==JSON.stringify(agreed)){UI.delSummary=null;throw new Error('Inzwischen hat sich eine geteilte Reise geändert. Bitte die Übersicht neu öffnen. Übergaben sind bereits erfolgt.')}
  const res=await c.deleteAccount(email.trim(),agreed.length>0),scope=Store.scope;
  try{await c.signOut()}catch(e){}
  Store.forgetScope(scope); /* Kontocache in localStorage und IndexedDB entfernen, Gastdaten bleiben */
  UI.delSummary=null;closeSheet();Auth.switchTo(null);UI.view='reisen';render();
  alertMsg('Konto gelöscht ('+res.deleted_trips+' eigene Reise'+(res.deleted_trips===1?'':'n')+').');
}
function adoptSheet(){
  const pv=guestPreview();
  if(pv.error){openSheet('<h2>Gast-Reisen übernehmen</h2><p>'+esc(pv.error)+'</p>');return}
  openSheet('<span class="eyebrow">Bewusste Übernahme</span><h2>Gast-Reisen ins Konto übernehmen</h2><p class="small">Ausgewählte Reisen werden in euer Konto kopiert und online gespeichert. Die Gast-Kopie in diesem Browser bleibt unverändert. Gleiche IDs im Konto werden nicht überschrieben, sondern als Kopie angelegt.</p><div class="checks-list">'+
    pv.rows.map(r=>'<label class="chk '+(r.problem?'warn':'info')+'"><input type="checkbox" data-adopt="'+esc(r.trip.id)+'"'+(r.problem?' disabled':'')+'> <span><b>'+esc(r.trip.title||'Ohne Titel')+'</b><br><small class="muted">'+esc(rangeText(r.trip))+(r.exists?' · ID schon im Konto → wird als Kopie übernommen':'')+(r.problem?' · nicht übernehmbar: '+esc(r.problem):'')+'</small></span></label>').join('')+
    '</div><button type="button" class="btn" data-acc="adopt-do">Ausgewählte übernehmen</button>');
}
async function shareSheet(t){
  const c=Sync.cloud(),role=Store.role(t.id),m=Store.meta[t.id]||{};
  if(!m.version){openSheet('<h2>Teilen</h2><p>Die Reise ist noch nicht online gespeichert. Bitte erst synchronisieren.</p>');return}
  openSheet('<h2>Teilen</h2><p>Lade Mitglieder …</p>');
  let members=[],invites=[];
  try{members=await c.members(t.id);if(role==='owner')invites=await c.invites(t.id)}catch(e){openSheet('<h2>Teilen</h2><p>'+esc(e.message)+'</p>');return}
  const now=Date.now();
  openSheet('<span class="eyebrow">'+esc(t.title)+'</span><h2>Mitreisende & Rechte</h2><p class="small">Eure Rolle: <b>'+ROLE_TXT[role]+'</b>. Rechte prüft die Datenbank; der Link zur Website macht keine Reise öffentlich.</p>'+
    '<div class="checks-list">'+members.map(x=>'<div class="chk info"><span><b>'+esc(x.email||x.user_id)+'</b><br><small class="muted">'+ROLE_TXT[x.role]+'</small></span>'+(role==='owner'&&x.role!=='owner'?'<select data-acc-role="'+esc(x.user_id)+'" aria-label="Rolle von '+esc(x.email||'')+'" style="margin-left:auto;width:auto"><option value="editor"'+(x.role==='editor'?' selected':'')+'>Bearbeiten</option><option value="viewer"'+(x.role==='viewer'?' selected':'')+'>Lesen</option></select><button type="button" class="btn ghost sm" data-acc="member-remove" data-val="'+esc(x.user_id)+'">Entfernen</button>':'')+'</div>').join('')+'</div>'+
    (role==='owner'?'<h3>Neue Einladung</h3><div class="form"><label class="fld"><span>Rolle</span><select id="inv-role"><option value="editor">Bearbeiten</option><option value="viewer">Lesen</option></select></label><label class="fld"><span>Gültig</span><select id="inv-hours"><option value="24">24 Stunden</option><option value="72" selected>3 Tage</option><option value="168">7 Tage</option></select></label><label class="fld"><span>Nur für E-Mail (empfohlen)</span><input type="email" id="inv-email" placeholder="name@beispiel.de" autocomplete="off"></label></div><p class="small muted">Ein Link gilt für eine Person und einmalige Verwendung. Mit E-Mail-Angabe kann ihn nur das Konto mit genau dieser bestätigten Adresse annehmen.</p><button type="button" class="btn sm" data-acc="invite-create">Einladungslink erstellen</button>'+(UI.inviteLink?'<div class="copybox" id="inv-link">'+esc(UI.inviteLink)+'</div><button type="button" class="btn ghost sm" data-acc="invite-copy">Link kopieren</button>':'')+
      '<h3>Einladungen</h3>'+(invites.length?'<div class="checks-list">'+invites.map(i=>{const st=i.revoked_at?'widerrufen':i.used_at?'angenommen':new Date(i.expires_at).getTime()<now?'abgelaufen':'offen bis '+new Date(i.expires_at).toLocaleString('de-DE');return '<div class="chk info"><span>'+ROLE_TXT[i.role]+(i.email?' · für '+esc(i.email):'')+' · '+esc(st)+'</span>'+(st.startsWith('offen')?'<button type="button" class="btn ghost sm" style="margin-left:auto" data-acc="invite-revoke" data-val="'+esc(i.id)+'">Widerrufen</button>':'')+'</div>'}).join('')+'</div>':'<p class="muted small">Keine.</p>')
     :'<button type="button" class="btn ghost sm" data-acc="leave" data-val="'+esc(t.id)+'">Reise verlassen</button>'));
}
function conflictBlock(t){
  const m=Store.isAccount()&&Store.meta[t.id];if(!m)return '';
  if(m.lost)return '<section class="block"><div class="note" role="alert"><b>Kein Zugriff mehr auf die Online-Version dieser Reise.</b><p>Eure lokalen Änderungen sind nicht verloren. Ihr könnt sie als eigene neue Reise speichern oder verwerfen.</p><div class="row"><button type="button" class="btn sm" data-acc="conf" data-how="copy">Als eigene Reise speichern</button><button type="button" class="btn ghost sm" data-acc="conf" data-how="discard">Verwerfen</button></div></div></section>';
  if(m.failed&&Store.queue[t.id]&&m.failedAt===Store.queue[t.id].at)return '<section class="block"><div class="note" role="alert"><b>Speicherfehler online:</b><p>'+esc(m.failed)+'. Die Änderung ist lokal gespeichert. Bitte Eckdaten prüfen und erneut ändern.</p></div></section>';
  if(!m.conflict)return '';
  const r=m.conflict.remote,who=r&&r.updated_at?new Date(r.updated_at).toLocaleString('de-DE'):'';
  if(m.conflict.op==='deleted')return '<section class="block"><div class="note" role="alert"><b>Diese Reise wurde online gelöscht, während ihr sie geändert habt.</b><p>Eure Version kann als neue Reise gespeichert oder verworfen werden.</p><div class="row"><button type="button" class="btn sm" data-acc="conf" data-how="copy">Als neue Reise speichern</button><button type="button" class="btn ghost sm" data-acc="conf" data-how="discard">Verwerfen</button></div></div></section>';
  if(m.conflict.op==='delete')return '<section class="block"><div class="note" role="alert"><b>Löschen nicht ausgeführt:</b><p>Die Reise wurde zwischenzeitlich online geändert ('+esc(who)+').</p><div class="row"><button type="button" class="btn sm" data-acc="conf" data-how="server">Aktuelle Version behalten</button></div></div></section>';
  return '<section class="block"><div class="note" role="alert"><b>Gleichzeitige Bearbeitung:</b><p>Diese Reise wurde online geändert ('+esc(who)+', Version '+esc(r.version)+'), während ihr sie hier bearbeitet habt. Nichts wurde überschrieben.</p><div class="row"><button type="button" class="btn sm" data-acc="conf" data-how="server">Online-Version übernehmen</button><button type="button" class="btn ghost sm" data-acc="conf" data-how="copy">Meine Version als Kopie</button><button type="button" class="btn warn sm" data-acc="conf" data-how="mine">Meine Version speichern (überschreibt)</button></div></div></section>';
}
function accErr(e){UI.authMsg=e&&e.message?e.message:String(e);render()}
document.addEventListener('submit',async e=>{
  const f=e.target.closest('[data-acc-form]');if(!f)return;e.preventDefault();
  const kind=f.getAttribute('data-acc-form'),c=Sync.cloud(),val=id=>{const x=document.getElementById(id);return x?x.value:''};
  if(document.getElementById('acc-email'))UI.authEmail=val('acc-email').trim();UI.authMsg='';
  if(kind==='code-send'){await otpSend(UI.authEmail,false);return}
  if(kind==='code-verify'){await otpVerify(val('acc-code'));return}
  try{
    if(kind==='signin'){await c.signIn(UI.authEmail,val('acc-pw'));UI.authMsg=''}
    else if(kind==='signup'){if(val('acc-pw')!==val('acc-pw2'))throw new Error('Passwörter stimmen nicht überein.');if(val('acc-pw').length<10)throw new Error('Mindestens 10 Zeichen.');const r=await c.signUp(UI.authEmail,val('acc-pw'));UI.authMsg=r.needsConfirmation?'Fast fertig: Bitte den Link in der E-Mail an '+UI.authEmail+' öffnen. Danach anmelden.':'Konto angelegt.';UI.authMode='signin'}
    else if(kind==='reset'){await c.resetPassword(UI.authEmail);UI.authMsg='Falls ein Konto zu '+UI.authEmail+' existiert, ist ein Link unterwegs. Bitte im selben Browser öffnen.'}
    else if(kind==='newpw'){if(val('acc-pw')!==val('acc-pw2'))throw new Error('Passwörter stimmen nicht überein.');if(val('acc-pw').length<10)throw new Error('Mindestens 10 Zeichen.');await c.updatePassword(val('acc-pw'));Auth.recovery=false;UI.authMsg='Passwort geändert.'}
    else if(kind==='delete-account'){const btn=f.querySelector('button[type=submit]');if(btn.disabled)return;btn.disabled=true;
      try{await deleteAccountDo(val('acc-del-email'))}catch(err){const box=document.getElementById('acc-del-err');if(box){box.textContent=err.message;box.hidden=false;box.focus()}else alertMsg(err.message)}finally{btn.disabled=false}return}
    else if(kind==='invite'){let v=val('acc-invite').trim();try{const u=new URL(v);v=u.searchParams.get('einladung')||v}catch(x){}if(!v)return;sessionStorage.setItem('rp-invite',v);await Auth.tryInvite();return}
    render();
  }catch(err){accErr(err)}
});
document.addEventListener('change',async e=>{
  const el=e.target;if(!el.hasAttribute||!el.hasAttribute('data-acc-role'))return;const t=cur();if(!t)return;
  try{await Sync.cloud().setRole(t.id,el.getAttribute('data-acc-role'),el.value);alertMsg('Rolle geändert.');shareSheet(t)}catch(err){alertMsg(err.message);shareSheet(t)}
});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-acc]');if(!b)return;
  const act=b.getAttribute('data-acc'),val=b.getAttribute('data-val'),t=cur(),c=Sync.cloud();
  try{
    switch(act){
      case 'mode':{const otp=val==='code'||UI.authMode==='code';if(otp){const ef=document.getElementById('acc-email');if(ef&&ef.value.trim())UI.authEmail=ef.value.trim();else if(UI.otp&&UI.otp.email)UI.authEmail=UI.otp.email;UI.otp=null}UI.authMode=val;UI.authMsg='';render();if(otp)otpFocus('acc-email');return}
      case 'code-resend':if(UI.otp&&UI.otp.email&&otpWaitLeft()<=0)await otpSend(UI.otp.email,true);return;
      case 'code-back':if(UI.otp&&UI.otp.email)UI.authEmail=UI.otp.email;UI.otp=null;render();otpFocus('acc-email');return;
      case 'sync':await Sync.settle();UI.confirm=null;render();return;
      case 'signout':await Auth.signOut(false);return;
      case 'signout-force':UI.confirm=null;await Auth.signOut(true);return;
      case 'adopt-open':adoptSheet();return;
      case 'delete-open':await deleteAccountSheet();return;
      case 'export':{const d=await c.exportAccount();downloadText(JSON.stringify(d,null,2),'reiseplaner-kontodaten-'+new Date().toISOString().slice(0,10)+'.json','application/json');alertMsg('Kontodaten heruntergeladen. Privat aufbewahren.');return}
      case 'adopt-do':{const ids=[...document.querySelectorAll('[data-adopt]')].filter(x=>x.checked).map(x=>x.getAttribute('data-adopt'));if(!ids.length){alertMsg('Keine Reise ausgewählt.');return}const added=adoptGuestTrips(ids);closeSheet();alertMsg(added.length+' Reise'+(added.length===1?'':'n')+' übernommen. Synchronisation läuft.');go('reisen');return}
      case 'share':if(t)await shareSheet(t);return;
      case 'invite-create':UI.inviteLink=await c.createInvite(t.id,$('#inv-role').value,+$('#inv-hours').value,($('#inv-email')&&$('#inv-email').value.trim())||null);await shareSheet(t);return;
      case 'invite-copy':try{await navigator.clipboard.writeText(UI.inviteLink);alertMsg('Link kopiert.')}catch(x){alertMsg('Bitte Link markieren und kopieren.')}return;
      case 'invite-revoke':await c.revokeInvite(val);await shareSheet(t);return;
      case 'member-remove':await c.removeMember(t.id,val);await shareSheet(t);return;
      case 'leave':await c.removeMember(val,Auth.user.id);closeSheet();await Sync.settle();go('reisen');alertMsg('Reise verlassen.');return;
      case 'conf':try{Sync.resolve(t.id,b.getAttribute('data-how'))}catch(err){alertMsg(err.message)}render();return;
    }
  }catch(err){alertMsg(err.message)}
});

