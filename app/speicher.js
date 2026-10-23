/* Reiseplaner · Speicher (Store), Synchronisation, Anmeldung.
   Teil 11 von 24 der App (P0.6). Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen. */
"use strict";
/* ================= Speicher ================= */
/* Speicher mit getrennten Bereichen (Issue #6):
   * Gast: Schlüssel rp-trips (unverändert, wie bisher nur dieser Browser).
   * Konto: Schlüssel rp-u:<Benutzer-ID> mit {trips, meta, queue} als Offline-Cache. meta hält die zuletzt
     bestätigte Serverversion und Rolle, queue die noch nicht bestätigten Änderungen und Löschungen.
   Beim Wechsel des Bereichs wird der Arbeitsspeicher geleert, damit nie Daten eines anderen Kontos sichtbar bleiben. */
const Store={scope:'guest',trips:{},meta:{},queue:{},corruptRaw:null,
  /* Zweitkopie in IndexedDB über rpstore.js (P0.4). localStorage bleibt Commit-Punkt: jeder Stand wird wie bisher
     synchron dorthin geschrieben und erst danach nach IndexedDB durchgeschrieben; Strategie und Abgleichsregeln im Kopf
     von rpstore.js. backend: null = ohne RPStore (Node-Tests, Datei fehlt; Verhalten wie bisher), 'laden' bis zum
     ersten Abgleich, 'idb', 'local' = Rückfall nur localStorage mit sichtbarem Hinweis (backendNote).
     startRaw: localStorage-Text beim Laden des Bereichs; null heißt leer, nur dann wird aus der Kopie wiederhergestellt. */
  backend:null,backendNote:'',idbBackup:null,backendGen:0,startRaw:undefined,startHist:undefined,loadingShown:false,
  key(){return this.scope==='guest'?'rp-trips':'rp-u:'+this.scope},
  historyKey(){return this.scope==='guest'?'rp-history':'rp-u:'+this.scope+':history'},
  isAccount(){return this.scope!=='guest'},
  setScope(scope){this.scope=scope||'guest';this.trips={};this.meta={};this.queue={};this.lastRaw=undefined;this.conflict=false;this.localError=false;this.corruptRaw=null;this.idbBackup=null;this.loadLocal();this.syncBackend()},
  serialize(){return this.scope==='guest'?JSON.stringify(this.trips):JSON.stringify({v:1,trips:this.trips,meta:this.meta,queue:this.queue})},
  /* Bereichstext prüfen und lesen, ohne den Zustand zu ändern (Laden, Wiederherstellen, Prüfung vor dem Kopieren) */
  parse(raw,guest){
    if(guest){const s=JSON.parse(raw||'{}');if(!s||typeof s!=='object'||Array.isArray(s))throw new Error('Ungültige gespeicherte Reisen');Object.values(s).forEach(t=>{if(t&&typeof t==='object')validateExtras(t);});return {trips:s,meta:{},queue:{}}}
    const s=JSON.parse(raw||'{"v":1,"trips":{},"meta":{},"queue":{}}');if(!s||s.v!==1||[s.trips,s.meta,s.queue].some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw new Error('Ungültiger Kontospeicher');Object.values(s.trips).forEach(t=>validateExtras(t));return s},
  validRaw(k,raw){try{if(/^(rp-history|rp-u:[^:]+:history)$/.test(k))return Array.isArray(JSON.parse(raw));if(k==='rp-trips'||/^rp-u:[^:]+$/.test(k)){this.parse(raw,k==='rp-trips');return true}}catch(e){}return false},
  loadLocal(){
    let raw;
    try{raw=localStorage.getItem(this.key());const s=this.parse(raw,this.scope==='guest');this.trips=s.trips;if(this.isAccount()){this.meta=s.meta;this.queue=s.queue}
      this.lastRaw=raw;this.startRaw=raw;this.corruptRaw=null;this.localError=false}
    catch(e){this.trips={};this.meta={};this.queue={};this.localError=true;this.startRaw=raw;if(raw!=null)this.corruptRaw=raw;setSync('storage-error')}
    /* Sicherungspunkte beim Laden: nur dieser Stand entscheidet, ob die Kopie zurückgeholt wird (Review R2) */
    try{this.startHist=localStorage.getItem(this.historyKey())}catch(e){this.startHist=undefined}
  },
  saveLocal(){
    if(this.corruptRaw!==null){this.localError=true;setSync('storage-error');return false}
    try{const raw=this.serialize(),previous=localStorage.getItem(this.key());
      if(this.lastRaw!==undefined&&previous!==this.lastRaw){this.localError=true;this.conflict=true;setSync('storage-error');alertMsg('Eine andere Ansicht hat neuere Daten gespeichert. Eigene Änderungen als Datei sichern und neu laden.');return false;}
      if(previous&&previous!==raw)this.addHistory(previous);
      localStorage.setItem(this.key(),raw);this.lastRaw=raw;this.mirror(this.key(),raw);this.conflict=false;this.localError=false;setSync();return true}
    catch(e){this.localError=true;setSync('storage-error');return false}
  },
  /* Sicherungspunkt (fünf vorherige Stände). Scheitert er, nur Hinweis; dedupe: Stand nur ergänzen, wenn er noch fehlt. */
  addHistory(raw,at,dedupe){try{const k=this.historyKey();let h=JSON.parse(localStorage.getItem(k)||'[]');if(!Array.isArray(h))throw new Error('Sicherungspunkte ungültig');if(dedupe&&h.some(x=>x&&x.raw===raw))return;h.unshift({at:at||new Date().toISOString(),raw});const hr=JSON.stringify(h.slice(0,5));localStorage.setItem(k,hr);this.mirror(k,hr);this.historyError=false;}catch(e){this.historyError=true;}},
  mergeHistory(raw){try{const k=this.historyKey(),a=JSON.parse(localStorage.getItem(k)||'[]'),b=JSON.parse(raw);if(!Array.isArray(a)||!Array.isArray(b))return;
    const seen=new Set(a.map(x=>x&&x.raw)),all=a.concat(b.filter(x=>x&&typeof x.raw==='string'&&!seen.has(x.raw))).sort((x,y)=>String(y&&y.at||'').localeCompare(String(x&&x.at||'')));
    const hr=JSON.stringify(all.slice(0,5));localStorage.setItem(k,hr);this.mirror(k,hr)}catch(e){this.historyError=true}},
  resetCorrupt(){
    if(this.corruptRaw===null)return false;
    try{const dropped=this.corruptRaw;localStorage.removeItem(this.key());this.corruptRaw=null;this.trips={};this.meta={};this.queue={};this.lastRaw=null;this.startRaw=null;this.idbBackup=null;this.localError=false;setSync('local');
      /* beschädigter Text verschwindet auch aus der Kopie; eine lesbare ältere Kopie wird danach wiederhergestellt */
      this.syncBackend({drop:dropped});return true}
    catch(e){this.localError=true;setSync('storage-error');return false}
  },
  rp(){return this.backend&&typeof window!=='undefined'&&window.RPStore||null},
  mirror(k,raw){const R=this.rp();if(!R||this.backend==='local')return;R.write(k,raw).then(r=>{if(r&&!r.ok)this.backendFailed(r.reason)},e=>this.backendFailed(e&&e.message))},
  /* Start: IndexedDB öffnen, beim ersten Mal alle Bereiche kopieren, zurücklesen, vergleichen und Marker setzen, dann abgleichen. */
  bootBackend(){
    const R=typeof window!=='undefined'&&window.RPStore;if(!R||this.backend)return this.backendReady||Promise.resolve(null);
    this.backend='laden';
    R.onStatus(s=>{if(s&&s.mode==='local')this.backendFailed(s.reason)});
    /* Fremdänderung über BroadcastChannel (ergänzt das storage-Ereignis): nur melden, wenn localStorage wirklich anders ist */
    R.onRemote(m=>{if(!m||m.key!==this.key()||this.conflict)return;let now;try{now=localStorage.getItem(m.key)}catch(e){}if(now!==this.lastRaw){this.conflict=true;setSync('conflict');alertMsg('Reisedaten wurden in einer anderen Ansicht geändert. Sichert offene Änderungen und ladet neu.')}});
    return this.backendReady=R.init({valid:(k,raw)=>this.validRaw(k,raw)}).then(s=>s&&s.mode==='idb'?this.syncBackend():(this.backendFailed(s&&s.reason),null),e=>{this.backendFailed(e&&e.message);return null});
  },
  async syncBackend(o){
    const R=this.rp();if(!R||this.backend==='local')return null;
    const gen=++this.backendGen,scope=this.scope,key=this.key(),hk=this.historyKey();
    try{
      const d=await R.reconcile(key,{absentAtStart:this.startRaw===null,lsValid:this.corruptRaw===null,drop:o&&o.drop});
      if(gen!==this.backendGen||scope!==this.scope)return d; /* Bereich inzwischen gewechselt */
      if(d.state==='local'){this.backendFailed(d.reason);return d}
      if(d.state==='restore')this.applyRestore(d.rec);
      else if(d.state==='adopt'&&d.rec)this.addHistory(d.rec.raw,d.rec.at,true);
      else if(d.state==='backup'){this.idbBackup={at:d.rec.at||''};if(typeof render==='function')remoteChanged()}
      /* Beim Laden leer, inzwischen aber neue Sicherungspunkte geschrieben: ältere aus der Kopie dazunehmen statt verlieren */
      const hd=await R.reconcile(hk,{absentAtStart:this.startHist===null,autoRestore:true});
      if(gen===this.backendGen&&scope===this.scope&&hd&&hd.state==='restore'&&!hd.restored&&hd.lsRaw!=null&&hd.rec)this.mergeHistory(hd.rec.raw);
      if(gen===this.backendGen&&this.backend==='laden'){this.backend='idb';if(this.loadingShown){this.loadingShown=false;if(typeof render==='function'&&UI.view==='reisen')remoteChanged()}}
      return d;
    }catch(e){this.backendFailed(e&&e.message);return null}
  },
  /* localStorage war beim Laden leer, die Kopie stammt aus einer früheren Sitzung: zurückholen. In dieser Sitzung schon
     angelegte Reisen behalten Vorrang (Vereinigung), es wird nichts verworfen. */
  applyRestore(rec){
    /* Ohne Übernahme muss die Kopie wieder dem Browser-Speicher folgen: ein zuvor eingereihter Schreibvorgang wurde verworfen (Review R2) */
    const follow=()=>{if(this.lastRaw!=null&&this.corruptRaw===null)this.mirror(this.key(),this.lastRaw)};
    let s;try{s=this.parse(rec.raw,this.scope==='guest')}catch(e){this.addHistory(rec.raw,rec.at,true);follow();this.backendNote='Die Zweitkopie in IndexedDB ist nicht lesbar und wurde nicht übernommen. Ihr Inhalt liegt unter den lokalen Sicherungspunkten.';if(typeof render==='function')remoteChanged();return false}
    if(!Object.keys(s.trips).length&&!Object.keys(s.queue).length){follow();return false}
    this.trips=Object.assign(s.trips,this.trips);if(this.isAccount()){this.meta=Object.assign(s.meta,this.meta);this.queue=Object.assign(s.queue,this.queue)}
    const ok=this.saveLocal(),when=rec.at?new Date(rec.at).toLocaleString('de-DE'):'';if(ok)this.startRaw=this.lastRaw;
    alertMsg(ok?'Reisen aus der Zweitkopie (IndexedDB'+(when?', Stand '+when:'')+') wiederhergestellt.':'Reisen aus der Zweitkopie angezeigt, aber nicht in den Browser-Speicher zurückgeschrieben. Bitte als Datei sichern.');
    if(this.isAccount())Sync.schedule(0);if(typeof render==='function')remoteChanged();return ok;
  },
  backendFailed(why){if(!this.backend||this.backend==='local')return;this.backend='local';this.loadingShown=false;this.backendNote='Zweitkopie in IndexedDB nicht verfügbar'+(why?' ('+String(why).slice(0,200)+')':'')+'. Reisen werden wie bisher nur im Browser-Speicher (localStorage) gesichert.';alertMsg(this.backendNote);if(typeof render==='function')remoteChanged()},
  /* Kontobereich von diesem Gerät entfernen (Abmelden ohne Ausstehendes, Kontolöschung): localStorage sofort, IndexedDB mit
     Löschmarke, damit ein Abbruch beim nächsten Start nachgeholt wird. Gastdaten (rp-trips, rp-history) nie. */
  forgetScope(scope){
    if(!scope||scope==='guest')return Promise.resolve(false);
    const keys=['rp-u:'+scope,'rp-u:'+scope+':history'];try{keys.forEach(k=>localStorage.removeItem(k))}catch(e){}
    const R=typeof window!=='undefined'&&window.RPStore;if(!R||!this.backend)return Promise.resolve(true);
    return R.remove(keys).then(ok=>{if(!ok)alertMsg('Die Zweitkopie dieses Kontos in IndexedDB konnte noch nicht entfernt werden. Sie wird beim nächsten Start gelöscht und nicht wiederhergestellt.');return ok},()=>false);
  },
  list(){return Object.values(this.trips).sort((a,b)=>(a.start||a.month||'9999').localeCompare(b.start||b.month||'9999'))},
  get(id){return this.trips[id]||null},
  role(id){return this.isAccount()&&this.meta[id]&&this.meta[id].version?this.meta[id].role||'owner':'owner'},
  canEdit(id){return this.role(id)!=='viewer'},
  pending(){return Object.keys(this.queue).length},
  put(t,now){
    /* Keine Rückstufung (SCHEMA_V4 §1): Eine Reise, die als Format 4 gespeichert ist, wird nie mit kleinerer Version überschrieben */
    if(t&&this.lastRaw&&this.lastRaw.indexOf('"schemaVersion":4')>=0&&(t.schemaVersion==null||t.schemaVersion<4)){
      let old=null;try{const s=JSON.parse(this.lastRaw);old=this.scope==='guest'?s&&s[t.id]:s&&s.trips&&s.trips[t.id]}catch(e){}
      if(old&&old.schemaVersion===4){this.trips[t.id]=old;alertMsg('Diese Reise hat Format 4 (Fotos, Reisebücher) und darf nicht auf ein älteres Format zurückgesetzt werden. Nicht gespeichert.');if(typeof render==='function')setTimeout(render,0);return false}}
    if(t&&(t.schemaVersion===3||t.schemaVersion===4)&&!V3_EDIT){
      try{const s=JSON.parse(this.lastRaw||'{}');const old=this.scope==='guest'?s&&s[t.id]:s&&s.trips&&s.trips[t.id];if(old)this.trips[t.id]=old;else delete this.trips[t.id]}catch(e){}
      alertMsg(V3_LOCK_TXT);if(typeof render==='function')setTimeout(render,0);return false}
    if(this.isAccount()&&this.meta[t.id]&&this.meta[t.id].unreadable){
      try{const s=JSON.parse(this.lastRaw||'{}');const old=s&&s.trips&&s.trips[t.id];if(old)this.trips[t.id]=old;else delete this.trips[t.id]}catch(e){}
      alertMsg(UNREADABLE_TXT+' Änderungen werden nicht gespeichert. Ihr könnt den lokalen Stand als eigene Reise behalten.');if(typeof render==='function')setTimeout(render,0);return false}
    if(this.isAccount()&&!this.canEdit(t.id)){const m=this.meta[t.id];if(m&&m.sv)this.trips[t.id]=JSON.parse(m.sv);alertMsg('Nur Leserecht: Änderungen an dieser Reise werden nicht gespeichert.');if(typeof render==='function')setTimeout(render,0);return false}
    t.updated=Date.now();this.trips[t.id]=t;
    if(this.isAccount()){const q=this.queue[t.id];this.queue[t.id]={op:'upsert',at:Date.now()};if(q&&q.op==='delete')this.queue[t.id].op='upsert';if(this.meta[t.id])delete this.meta[t.id].failed}
    if(!this.saveLocal())return false;
    if(this.isAccount())Sync.schedule(now?0:800);
    return true;
  },
  async remove(id){
    if(this.isAccount()){
      const m=this.meta[id];
      if(m&&m.unreadable)throw new Error(UNREADABLE_TXT+' Sie kann erst gelöscht werden, wenn diese App sie lesen kann (Seite neu laden).');
      if(m&&m.version&&this.role(id)!=='owner')throw new Error('Nur der Eigentümer kann die Reise löschen. Ihr könnt die Reise stattdessen verlassen.');
      delete this.trips[id];
      if(m&&m.version)this.queue[id]={op:'delete',at:Date.now()};else{delete this.queue[id];delete this.meta[id]}
      if(!this.saveLocal())return;Sync.schedule(0);return;
    }
    delete this.trips[id];this.saveLocal();
  }
};
/* Abgleich mit Supabase. Grundsätze: Nur der Server bestätigt "online gespeichert"; Änderungen werden nur
   mit der zuletzt bekannten Version geschrieben (atomar in der Datenbank); bei Abweichung entsteht ein
   sichtbarer Konflikt statt eines stillen Überschreibens. Löschungen werden als Markierung übertragen. */
/* Version nie zurückstufen: migrateTrip liefert die gültige Version der Reise (SCHEMA_V3 §5) */
/* Format 4 läuft unverändert rund; darunter werden leere v4-Felder entfernt und volle abgelehnt (RPF4.toServer) */
const toServer=t=>{const d=migrateTrip(clone(t));return RPF4.toServer(d,V3)};
const Sync={state:'idle',error:'',timer:null,running:false,again:false,last:0,notice:'',
  cloud(){return typeof window!=='undefined'&&window.RPCloud&&window.RPCloud.enabled()?window.RPCloud:null},
  active(){return Store.isAccount()&&!!this.cloud()&&!!Auth.user&&Auth.user.id===Store.scope},
  schedule(ms){if(!this.active())return;clearTimeout(this.timer);this.timer=setTimeout(()=>this.run(),ms==null?800:ms)},
  async run(){
    if(!this.active())return;
    if(this.running){this.again=true;return}
    if(typeof navigator!=='undefined'&&navigator.onLine===false){this.state='offline';setSync();return}
    const scope=Store.scope;this.running=true;this.state='syncing';setSync();
    let changed=false;
    try{changed=await this.push(scope);changed=(await this.pull(scope))||changed;if(Store.scope===scope){this.state='ok';this.error='';this.last=Date.now()}}
    catch(e){if(Store.scope===scope){this.state=e&&e.network?'offline':'error';this.error=e&&e.message||'Unbekannter Fehler'}}
    this.running=false;
    if(Store.scope===scope){Store.saveLocal();setSync();if(changed)remoteChanged()}
    if(this.again){this.again=false;this.run()}
  },
  /* Laufenden Abgleich abwarten und danach sicher neu abgleichen (z. B. nach Annahme einer Einladung). */
  async settle(){for(let i=0;i<200&&this.running;i++)await new Promise(r=>setTimeout(r,50));await this.run()},
  apply(row,role){const m=Store.meta[row.id]||{};Store.meta[row.id]={version:row.version,role:role||row.role||m.role||'owner',owner:row.owner_id,updatedAt:row.updated_at,sv:(role||row.role||m.role)==='viewer'?JSON.stringify(row.data):undefined}},
  async push(scope){
    const c=this.cloud();let changed=false;
    for(const id of Object.keys(Store.queue)){
      if(Store.scope!==scope)return changed;
      const q=Store.queue[id],m=Store.meta[id]||{};
      if(m.unreadable||m.conflict||m.lost||(m.failed&&m.failedAt===q.at))continue;
      if(q.op==='delete'){
        if(!m.version){delete Store.queue[id];delete Store.meta[id];continue}
        const row=await c.deleteTrip(id,m.version);if(Store.scope!==scope)return changed;
        if(row||!(await c.getTrip(id))){delete Store.queue[id];delete Store.meta[id];changed=true}
        else{const cur=await c.getTrip(id);if(cur&&cur.deleted_at){delete Store.queue[id];delete Store.meta[id]}else{Store.meta[id]=Object.assign(m,{conflict:{op:'delete',remote:cur}});changed=true}}
        continue;
      }
      const t=Store.trips[id];if(!t){delete Store.queue[id];continue}
      let data;try{data=toServer(t)}catch(e){Store.meta[id]=Object.assign(m,{failed:e.message,failedAt:q.at});continue}
      /* Format über der Grenze des Servers (Paket 7): nicht senden, in der Warteschlange lassen und sichtbar als „nur auf diesem Gerät“ führen */
      if(f4LocalOnly(data)){if(!m.localOnly){Store.meta[id]=Object.assign(m,{localOnly:data.schemaVersion});changed=true}continue}
      if(m.localOnly){delete m.localOnly;changed=true}
      try{
        if(!m.version){
          let row;
          try{row=await c.insertTrip(id,data)}
          catch(e){if(String(e.code)!=='23505')throw e;
            /* Idempotenz: Anlegen kam evtl. schon an, nur die Antwort ging verloren → eigene Zeile übernehmen statt doppelt anlegen */
            const mine=await c.getTrip(id);if(Store.scope!==scope)return changed;
            /* Nur wenn seit dem Anlegen niemand geändert hat (Version 1). Sonst Konflikt statt Überschreiben, z. B. bei einer
               wiederhergestellten Zweitkopie mit altem Eintrag in der Warteschlange (Review 17.10.). */
            if(mine&&mine.owner_id===Store.scope&&!mine.deleted_at&&mine.version>1){Store.meta[id]=Object.assign(m,{conflict:{op:'update',remote:mine}});changed=true;continue}
            if(mine&&mine.owner_id===Store.scope&&!mine.deleted_at){this.apply(mine,'owner');Store.meta[id].version=mine.version;const r2=await c.updateTrip(id,data,mine.version);if(r2)this.apply(r2,'owner');if(Store.queue[id]&&Store.queue[id].at===q.at)delete Store.queue[id];changed=true;continue}
            if(this.reassign(id)){changed=true;continue}throw e}
          if(Store.scope!==scope)return changed;this.apply(row,'owner');
        }else{
          const row=await c.updateTrip(id,data,m.version);if(Store.scope!==scope)return changed;
          if(row)this.apply(row);
          else{const cur=await c.getTrip(id);if(Store.scope!==scope)return changed;
            if(!cur)Store.meta[id]=Object.assign(m,{lost:true});
            else Store.meta[id]=Object.assign(m,{conflict:{op:cur.deleted_at?'deleted':'update',remote:cur}});
            changed=true;continue}
        }
        if(Store.queue[id]&&Store.queue[id].at===q.at)delete Store.queue[id];
      }catch(e){if(e&&e.network)throw e;if(/23514|22P02|22023|23502|check constraint/i.test(String(e.code)+' '+e.message)){Store.meta[id]=Object.assign(Store.meta[id]||{},{failed:e.message,failedAt:q.at});changed=true}else throw e}
    }
    return changed;
  },
  /* ID existiert bereits auf dem Server (z. B. dieselbe Sicherung in zwei Konten importiert): lokale Reise unter neuer ID weiterführen. */
  reassign(id){const t=Store.trips[id];if(!t)return null;let nid;do{nid=uid('t')}while(Store.trips[nid]);const n=clone(t);n.id=nid;Store.trips[nid]=n;Store.queue[nid]={op:'upsert',at:Date.now()};delete Store.trips[id];delete Store.queue[id];delete Store.meta[id];this.notice='Eine Reise bekam eine neue ID, weil die alte bereits vergeben war.';return nid},
  async pull(scope){
    const c=this.cloud(),rows=await c.listTrips(Store.scope);if(Store.scope!==scope)return false;
    let changed=false;const seen=new Set();
    for(const row of rows){
      seen.add(row.id);const q=Store.queue[row.id],m=Store.meta[row.id];
      if(!row.deleted_at&&(!m||m.version!==row.version||m.unreadable)){
        const bad=serverRowProblem(row);
        if(bad){Store.meta[row.id]=Object.assign(m||{},{unreadable:bad});if(!m||!m.version){Store.meta[row.id].role=row.role;Store.meta[row.id].owner=row.owner_id}changed=true;continue}
        if(m&&m.unreadable){delete m.unreadable;changed=true;if(!q){Store.trips[row.id]=clone(row.data);this.apply(row);continue}}
      }
      if(row.deleted_at&&m&&m.unreadable){delete m.unreadable;if(!Store.trips[row.id]&&!m.version){delete Store.meta[row.id];changed=true;continue}}
      if(row.deleted_at){
        if(q&&q.op==='upsert'){if(m&&m.version&&!m.conflict){m.conflict={op:'deleted',remote:row};changed=true}}
        else if(Store.trips[row.id]||m){delete Store.trips[row.id];delete Store.meta[row.id];delete Store.queue[row.id];changed=true}
        continue;
      }
      if(q){if(m)m.role=row.role;continue}
      if(!m||m.version!==row.version||!Store.trips[row.id]){
        Store.trips[row.id]=clone(row.data);this.apply(row);changed=true;
      }else if(m.role!==row.role){this.apply(row);changed=true}
    }
    for(const id of Object.keys(Store.meta)){const m=Store.meta[id];if(m&&m.unreadable&&!seen.has(id)&&!Store.trips[id]){delete Store.meta[id];changed=true}}
    for(const id of Object.keys(Store.trips)){const m=Store.meta[id];
      if(m&&m.version&&!seen.has(id)){if(Store.queue[id])m.lost=true;else{delete Store.trips[id];delete Store.meta[id];this.notice='Eine Reise ist nicht mehr für euch freigegeben und wurde von diesem Gerät entfernt.'}changed=true}}
    return changed;
  },
  /* Konfliktlösung durch den Benutzer */
  resolve(id,how){
    const m=Store.meta[id];if(!m)return;
    const remote=m.conflict&&m.conflict.remote;
    const remoteBad=m.unreadable||(remote&&!remote.deleted_at&&serverRowProblem(remote));
    if(remoteBad){
      if(how!=='copy')throw new Error(UNREADABLE_TXT+' Sie wird weder überschrieben noch übernommen. Den lokalen Stand könnt ihr als eigene Reise behalten.');
      const t=Store.trips[id];
      if(t){let nid;do{nid=uid('t')}while(Store.trips[nid]);const n=clone(t);n.id=nid;n.title=(String(t.title||'Reise').slice(0,64)+' (eigene Kopie)').slice(0,80);Store.trips[nid]=n;Store.queue[nid]={op:'upsert',at:Date.now()}}
      delete Store.trips[id];delete Store.queue[id];delete m.conflict;if(!m.unreadable)m.unreadable=remoteBad;
      Store.saveLocal();this.schedule(0);return;
    }
    if(how==='server'&&remote&&!remote.deleted_at){Store.trips[id]=clone(remote.data);this.apply(remote);delete Store.queue[id]}
    else if(how==='mine'&&remote&&!remote.deleted_at){m.version=remote.version;delete m.conflict;Store.queue[id]={op:'upsert',at:Date.now()}}
    else if(how==='copy'){const t=Store.trips[id]||(remote&&remote.data);if(t){let nid;do{nid=uid('t')}while(Store.trips[nid]);const n=clone(t);n.id=nid;n.title=(String(t.title||'Reise').slice(0,64)+' (eigene Kopie)').slice(0,80);Store.trips[nid]=n;Store.queue[nid]={op:'upsert',at:Date.now()}}
      if(remote&&!remote.deleted_at){Store.trips[id]=clone(remote.data);this.apply(remote);delete Store.queue[id]}else{delete Store.trips[id];delete Store.meta[id];delete Store.queue[id]}}
    else if(how==='discard'){if(remote&&!remote.deleted_at){Store.trips[id]=clone(remote.data);this.apply(remote)}else{delete Store.trips[id];delete Store.meta[id]}delete Store.queue[id]}
    else return;
    Store.saveLocal();this.schedule(0);
  }
};
/* Konto-Zustand. Kein automatisches Übertragen der Gast-Reisen. */
const Auth={user:null,ready:false,recovery:false,gen:0,
  async start(){
    const c=Sync.cloud();if(!c){this.ready=true;return}
    c.onAuth((event,user)=>{if(event==='PASSWORD_RECOVERY'){this.recovery=true;UI.view='konto'}this.switchTo(user)});
    const gen=this.gen;let user=null;try{user=await c.init()}catch(e){Sync.state='error';Sync.error=e.message}
    this.ready=true;if(this.gen===gen)this.switchTo(user);
    else if(typeof document!=='undefined'&&document.querySelector&&!document.querySelector('[data-acc-form]'))render(); /* nur den Ladehinweis ersetzen, nie offene Formulare (Eingaben gingen sonst verloren) */
    else setSync();
    try{const u=new URL(location.href),tok=u.searchParams.get('einladung');if(tok){sessionStorage.setItem('rp-invite',tok);u.searchParams.delete('einladung');history.replaceState(null,'',u.pathname+u.search+u.hash)}}catch(e){}
    this.tryInvite();
    if(typeof window!=='undefined'){window.addEventListener('online',()=>Sync.schedule(0));setInterval(()=>{if(typeof document==='undefined'||document.visibilityState!=='hidden')Sync.schedule(0)},60000);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')Sync.schedule(0)})}
  },
  switchTo(user){
    this.gen++;const next=user?user.id:'guest';
    if(Store.scope===next&&((this.user&&user&&this.user.id===user.id)||(!this.user&&!user))){this.user=user;setSync();return}
    this.user=user;UI.confirm=null;UI.tid=null;if(UI.view==='reise')UI.view='reisen';
    UI.otp=null;UI.authMode='signin'; /* Code-Schritt gehört zur vorherigen Anmeldung (Review R2) */
    Store.setScope(next);setSync();if(typeof render==='function')render();
    if(user){Sync.schedule(0);this.tryInvite()}
  },
  async tryInvite(){
    let tok=null;try{tok=sessionStorage.getItem('rp-invite')}catch(e){}
    if(!tok)return;
    if(!this.user){UI.view='konto';UI.invitePending=true;render();return}
    try{const id=await Sync.cloud().acceptInvite(tok);sessionStorage.removeItem('rp-invite');UI.invitePending=false;await Sync.settle();alertMsg('Einladung angenommen.');if(Store.get(id))go('r-'+id+'-ueber')}
    catch(e){try{sessionStorage.removeItem('rp-invite')}catch(x){}UI.invitePending=false;alertMsg(e.message);render()}
  },
  async signOut(force){
    /* Unlesbarer Kontocache, vorhandene Zweitkopie oder neuerer Stand aus einer anderen Ansicht: Ausstehendes unbekannt,
       also nie als „nichts offen“ behandeln und den Kontobereich nicht löschen (Review 17.10., Runde 2) */
    const unsure=Store.isAccount()&&(Store.corruptRaw!=null||!!Store.idbBackup||!!Store.conflict||!!Store.localError);
    if((Store.pending()||unsure)&&!force){UI.confirm='logout';UI.view='konto';render();return}
    const scope=Store.scope,keep=Store.pending()>0||unsure;
    try{await Sync.cloud().signOut()}catch(e){alertMsg(e.message);return}
    const forget=keep?null:Store.forgetScope(scope); /* localStorage und IndexedDB-Kopie des Kontobereichs, Gastdaten bleiben */
    this.switchTo(null);UI.view='reisen';render();if(forget)await forget;
  }
};
/* Gast-Reisen dieses Browsers lesen (nur lesend), um sie bewusst ins Konto zu übernehmen. */
function guestTrips(){try{const s=JSON.parse(localStorage.getItem('rp-trips')||'{}');return s&&typeof s==='object'&&!Array.isArray(s)?Object.values(s):[]}catch(e){return null}}
function guestPreview(){
  const list=guestTrips();if(list===null)return {error:'Die Gast-Reisen dieses Browsers sind beschädigt und können nicht übernommen werden. Sichert sie zuerst als Rohdaten.',rows:[]};
  return {rows:list.map(t=>{let problem='';try{validateBackup(backupData([t]))}catch(e){problem=e.message}return {trip:t,problem,exists:!!Store.get(t.id)}})};
}
function adoptGuestTrips(ids){
  if(!Store.isAccount())throw new Error('Bitte zuerst anmelden.');
  const pv=guestPreview(),added=[];
  pv.rows.filter(r=>ids.includes(r.trip.id)&&!r.problem).forEach(r=>{const t=migrateTrip(clone(r.trip));
    if(Store.trips[t.id]){let nid;do{nid=uid('t')}while(Store.trips[nid]);t.id=nid;t.title=(String(t.title).slice(0,70)+' (Gast)').slice(0,80)}
    Store.trips[t.id]=t;Store.queue[t.id]={op:'upsert',at:Date.now()};added.push(t.id)});
  if(added.length&&!Store.saveLocal())throw new Error('Übernahme nicht gespeichert.');
  try{const k='rp-adopted:'+Store.scope,done=JSON.parse(localStorage.getItem(k)||'[]');localStorage.setItem(k,JSON.stringify([...new Set(done.concat(ids))]))}catch(e){}
  Sync.schedule(0);return added;
}
function guestPendingCount(){if(!Store.isAccount())return 0;const g=guestTrips();if(!g)return 0;let done=[];try{done=JSON.parse(localStorage.getItem('rp-adopted:'+Store.scope)||'[]')}catch(e){}return g.filter(t=>t&&!done.includes(t.id)).length}
/* Serverzeilen, die diese App nicht validieren kann, werden nie still übersprungen oder überschrieben (Claude, #8).
   newer: Speicherversion höher als bekannt → vermutlich neuere App. Sonst allgemein „nicht lesbar“ mit Prüfgrund. */
const UNREADABLE_TXT='Die Online-Fassung dieser Reise kann diese App-Version nicht lesen.';
function serverRowProblem(row){
  const d=row&&row.data;
  try{if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('Keine gültigen Reisedaten.');if(d.id!==row.id)throw new Error('Reise-ID passt nicht zur Zeile.');validateExtras(d);return null}
  catch(e){const sv=d&&typeof d==='object'?Number(d.schemaVersion):NaN;return {version:row.version,newer:Number.isFinite(sv)&&sv>SCHEMA_MAX,schema:Number.isFinite(sv)?sv:null,reason:String(e&&e.message||e).slice(0,200),title:d&&typeof d.title==='string'?d.title.slice(0,80):''}}
}
function unreadableList(){if(!Store.isAccount())return [];return Object.keys(Store.meta).filter(id=>Store.meta[id]&&Store.meta[id].unreadable).map(id=>({id,local:Store.trips[id]||null,u:Store.meta[id].unreadable}))}
function unreadableText(u){return u.newer?'Online gespeichert mit Speicherversion '+u.schema+'. Vermutlich ist dort eine neuere App-Version im Einsatz. Seite neu laden (ggf. App schließen und wieder öffnen), damit diese App aktualisiert wird.':'Die Online-Fassung ist für diese App nicht lesbar (Prüfung: '+u.reason+'). Sie wurde nicht übernommen und wird nicht überschrieben.'}
function unreadableBlock(t){
  const m=Store.isAccount()&&Store.meta[t.id];if(!m||!m.unreadable)return '';
  return '<section class="block"><div class="note" role="alert"><b>'+esc(UNREADABLE_TXT)+'</b><p>'+esc(unreadableText(m.unreadable))+'</p><p>Was ihr hier seht, ist der letzte lokal lesbare Stand. Er ist schreibgeschützt, damit die neuere Online-Fassung nicht überschrieben wird.</p><div class="row"><button type="button" class="btn sm" data-acc="conf" data-how="copy">Lokalen Stand als eigene Reise behalten</button><button type="button" class="btn ghost sm" data-act="reload-app">Seite neu laden</button></div></div></section>';
}
function unreadableShelf(){
  const L=unreadableList().filter(x=>!x.local);if(!L.length)return '';
  return '<section class="block"><div class="note" role="status"><h2>'+(L.length===1?'Eine Reise':L.length+' Reisen')+' online nicht lesbar</h2><ul class="plain">'+L.map(x=>'<li><b>'+esc(x.u.title||'Reise')+'</b><br><small>'+esc(unreadableText(x.u))+'</small></li>').join('')+'</ul><button type="button" class="btn ghost sm" data-act="reload-app">Seite neu laden</button></div></section>';
}
function tripSyncState(id){if(!Store.isAccount())return '';const m=Store.meta[id]||{},q=Store.queue[id];if(m.unreadable)return 'nicht-lesbar';if(m.conflict)return 'konflikt';if(m.lost)return 'kein-zugriff';if(m.failed&&q&&m.failedAt===q.at)return 'fehler';if(m.localOnly&&q)return 'nur-lokal';if(q)return 'ausstehend';return m.version?'online':'ausstehend'}
function setSync(s){
  if(Store.conflict)s='conflict';else if(Store.localError)s='storage-error';
  const el=$('#sync');if(!el)return;
  let txt,on=false;
  if(s==='conflict')txt='Neuere Daten in anderer Ansicht – Änderungen sichern und neu laden';
  else if(s==='storage-error')txt='Nicht dauerhaft gespeichert – Browser-Speicher fehlgeschlagen';
  else if(!Store.isAccount())txt=Sync.cloud()?'Gast · nur in diesem Browser':'Nur in diesem Browser';
  else{const n=Store.pending(),k=Object.values(Store.meta).filter(m=>m.conflict||m.lost||m.unreadable).length;
    if(k)txt='Konflikt bei '+k+(k===1?' Reise':' Reisen')+' – bitte prüfen';
    else if(Sync.state==='error')txt='Speicherfehler online: '+Sync.error+(n?' · '+n+' lokal gespeichert':'');
    else if(Sync.state==='offline')txt='Offline · '+(n?n+' Änderung'+(n===1?'':'en')+' nur lokal gespeichert':'lokal gespeichert');
    else if(Sync.state==='syncing')txt='Synchronisiere …';
    else if(f4LocalCount())txt=f4LocalCount()+(f4LocalCount()===1?' Reise':' Reisen')+' nur auf diesem Gerät (Format 4)'+(n>f4LocalCount()?' · Synchronisation ausstehend ('+(n-f4LocalCount())+')':'');
    else if(n)txt='Synchronisation ausstehend ('+n+')';
    else if(Sync.last){txt='Online gespeichert';on=true}
    else txt='Lokal gespeichert · noch nicht abgeglichen';}
  el.className='sync'+(on?' on':'');el.querySelector('span').textContent=txt;
}
let deferred=false;
function remoteChanged(){if(UI.view==='konto'&&typeof document!=='undefined'&&document.querySelector&&document.querySelector('[data-acc-form]')){setSync();return} /* offene Kontoformulare nicht durch Hintergrund-Abgleich leeren */if(UI.pending&&UI.view==='reisen'){const h=UI.pending;const id=h.split('-')[1];if(Store.get(id)){UI.pending=null;go(h,true);return}}const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)){deferred=true;return}render()}
document.addEventListener('focusout',()=>{if(deferred){deferred=false;setTimeout(render,0)}});

