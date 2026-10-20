/* Reiseplaner · Format 4 in der App: Fotos und Reisebücher speichern, sichern und wiederherstellen (Paket 7, SCHEMA_V4 §6).
   Eigener Teil der App, geladen direkt nach app/v3.js. Klassisches Skript ohne Bundler: Alle Teile teilen sich den globalen
   Gültigkeitsbereich und laden in der Reihenfolge aus index.html. Zur Ladezeit nur auf frühere Teile zugreifen.
   Teil A, RPF4 (rein, ohne Store, DOM, Netz; in Node prüfbar):
   - Kandidaten für Fotos und Reisebücher. Eine Reise wird erst mit dem ersten Foto bzw. dem ersten gespeicherten Buch auf
     Format 4 gehoben, nie still: der Kandidat meldet upgrade:true, gespeichert wird erst nach Bestätigung (Teil B).
     Einmal 4, immer 4. Alles außer schemaVersion, media und books bleibt unverändert (Feldtreue).
   - toServer: Format 4 läuft unverändert rund; unter Format 4 werden leere v4-Felder entfernt und volle abgelehnt.
   - ZIP schreiben (ohne Packen, JPEGs schrumpfen ohnehin nicht) und lesen (ohne Packen oder Deflate über eine übergebene
     Funktion), Archiv .reiseplaner planen und vor dem Entpacken prüfen (RPV4.archivePlan/checkArchive).
   Teil B (App): Speichern mit Vorschau und Bestätigung, Grenze des Servers (Format 4 bleibt lokal, solange die Datenbank
   es nicht annimmt), Export/Import .reiseplaner mit der Fotoablage (RPPhotos), Hinweise im JSON-Export.
   Einbindung: pakete/format4-app/EINBINDUNG.md. */
"use strict";
/* Erfassung freigeschaltet (Fotos speichern, Reisebücher speichern). false = reines Lese-Release (SCHEMA_V4 §6 Schritt 4):
   v4-Reisen werden gelesen, geprüft und unverändert zurückgeschrieben, aber keine Reise wird neu auf Format 4 gehoben. */
const F4_WRITE=true;
/* Höchstes Format, das die Datenbank annimmt: CHECK schema_version in (2,3) aus 20261015160000_trips_schema_v3.sql.
   Erst nach einer freigegebenen Migration (Vorschlag in EINBINDUNG.md) auf 4 setzen. */
const F4_SERVER_MAX=3;
const RPF4=(function(){
  const W=typeof window!=='undefined'?window:{};
  const V=()=>{if(!W.RPV4)throw new Error('Format 4 kann diese App-Version nicht prüfen.');return W.RPV4};
  const J=o=>JSON.parse(JSON.stringify(o));
  const fail=m=>{throw new Error(m)};
  const sv=t=>t&&typeof t.schemaVersion==='number'?t.schemaVersion:2;
  /* Alles außer den v4-Feldern und der Version, für den Feldtreue-Vergleich */
  const rest=t=>{const c=J(t);delete c.schemaVersion;delete c.media;delete c.books;delete c.updated;return JSON.stringify(c)};

  /* Kandidat: fn ändert nur media/books einer Kopie. Hebt auf 4, wenn nötig; nie zurück. */
  function candidate(t,fn){
    if(!t||typeof t!=='object'||Array.isArray(t))fail('Reise fehlt.');
    const from=sv(t);if(from>4)fail('Diese Reise hat Format '+from+' und ist neuer als diese App-Version.');
    const c=J(t);fn(c);
    const upgrade=from<4&&V().needsV4(c);
    if(upgrade)c.schemaVersion=4;
    V().assertNoDowngrade(from,c);
    V().validateV4(c);
    if(rest(c)!==rest(t))fail('Interner Fehler: Die Änderung hätte andere Reisedaten berührt. Nichts gespeichert.');
    return {trip:c,upgrade,from,base:JSON.stringify(t)};
  }
  /* Neue Fotos (Einträge aus RPPhotos.prepare, Dateien schon in der Fotoablage). Gleiche Prüfsumme wie ein vorhandenes
     Foto: übersprungen und gemeldet, nicht doppelt. Gleiche ID mit anderem Bild: abgelehnt. */
  function mediaCommit(t,entries){
    if(!Array.isArray(entries)||!entries.length)fail('Keine Fotos übergeben.');
    const have=Array.isArray(t&&t.media)?t.media:[],byId={},bySum={},added=[],duplicates=[];
    have.forEach(m=>{byId[m.id]=m;bySum[m.sha256]=m.id});
    const list=entries.map(e=>V().normalizeMedia(e)).filter(m=>{
      if(Object.prototype.hasOwnProperty.call(bySum,m.sha256)){duplicates.push({id:m.id,existing:bySum[m.sha256]});return false}
      if(Object.prototype.hasOwnProperty.call(byId,m.id))fail('Foto-ID „'+m.id+'“ ist in dieser Reise schon vergeben.');
      bySum[m.sha256]=m.id;byId[m.id]=m;added.push(m.id);return true});
    if(!list.length)return {trip:J(t),upgrade:false,from:sv(t),base:JSON.stringify(t),added,duplicates,noop:true};
    return Object.assign(candidate(t,c=>{c.media=(Array.isArray(c.media)?c.media:[]).concat(list)}),{added,duplicates});
  }
  /* Foto entfernen. Steckt es in Büchern, nur mit confirm (Plätze werden leer). Die Datei löscht die App danach getrennt. */
  function mediaRemove(t,id,opt){
    if(!(t&&Array.isArray(t.media)&&t.media.some(m=>m.id===id)))fail('Dieses Foto gibt es in der Reise nicht mehr.');
    const r=V().removeMedia(t,id,{confirm:!!(opt&&opt.confirm)});
    if(!r.ok)return {needsConfirm:'uses',uses:r.uses,trip:J(t),base:JSON.stringify(t)};
    return Object.assign(candidate(t,c=>{c.media=r.trip.media;if(r.trip.books)c.books=r.trip.books}),{uses:r.uses});
  }
  /* Angaben eines Fotos ändern (Zuordnung nach Bestätigung, Bildunterschrift, Favorit, ausblenden). null entfernt optionale Felder. */
  const PATCH=['caption','day','actId','spotId','by','fav','hidden'],OPTIONAL=['actId','spotId','by'];
  function mediaPatch(t,id,patch){
    if(!patch||typeof patch!=='object')fail('Keine Änderung übergeben.');
    Object.keys(patch).forEach(k=>{if(!PATCH.includes(k))fail('Foto: „'+String(k).slice(0,30)+'“ lässt sich hier nicht ändern.')});
    if(!(t&&Array.isArray(t.media)&&t.media.some(m=>m.id===id)))fail('Dieses Foto gibt es in der Reise nicht mehr.');
    return candidate(t,c=>{const m=c.media.find(x=>x.id===id);Object.keys(patch).forEach(k=>{const v=patch[k];
      if(OPTIONAL.includes(k)&&(v==null||v===''))delete m[k];else m[k]=k==='caption'&&typeof v==='string'?v.trim():v})});
  }
  /* Reisebuch speichern (neu oder ersetzen, gleiche ID). now: UTC-Zeitstempel, wird updatedAt. */
  function bookSave(t,book,opt){
    const now=opt&&opt.now;if(typeof now!=='string')fail('Reisebuch: Zeitpunkt fehlt.');
    if(!book||typeof book!=='object')fail('Reisebuch fehlt.');
    const media=Array.isArray(t&&t.media)?t.media:[];
    const b=V().normalizeBook(Object.assign(J(book),{updatedAt:now}),{now,media});
    const cand=candidate(t,c=>{const list=Array.isArray(c.books)?c.books:[],i=list.findIndex(x=>x.id===b.id);if(i>=0)list[i]=b;else list.push(b);c.books=list});
    return Object.assign(cand,{book:b,replaced:Array.isArray(t.books)&&t.books.some(x=>x.id===b.id),warnings:V().bookWarnings(b,media)});
  }
  function bookRemove(t,id){
    if(!(t&&Array.isArray(t.books)&&t.books.some(b=>b.id===id)))fail('Dieses Reisebuch gibt es nicht mehr.');
    return candidate(t,c=>{c.books=c.books.filter(b=>b.id!==id)});
  }
  /* Für Sync und Sicherung (nach migrateTrip). V3: window.RPV3 oder null. */
  function toServer(d,V3){
    if(sv(d)>4)fail('Format '+sv(d)+' ist neuer als diese App-Version.');
    if(d.schemaVersion===4){V().validateV4(d);return V().serializeTrip4(d)}
    const x=W.RPV4?W.RPV4.serializeTrip4(d):d;
    return V3?V3.serializeTrip(x):x;
  }

  /* ---------- ZIP (PKWARE APPNOTE, ohne ZIP64, ohne Verschlüsselung) ---------- */
  const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})();
  function crc32(u){let c=0xFFFFFFFF;for(let i=0;i<u.length;i++)c=CRC[(c^u[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0}
  const enc=s=>new TextEncoder().encode(s),dec=u=>new TextDecoder('utf-8',{fatal:true}).decode(u);
  const u8=x=>x instanceof Uint8Array?x:x instanceof ArrayBuffer?new Uint8Array(x):ArrayBuffer.isView(x)?new Uint8Array(x.buffer,x.byteOffset,x.byteLength):fail('ZIP: ungültige Daten.');
  function dosTime(iso){const d=iso?new Date(iso):null;if(!d||isNaN(d)||d.getUTCFullYear()<1980)return {t:0,d:(1<<5)|1};
    return {t:(d.getUTCHours()<<11)|(d.getUTCMinutes()<<5)|(d.getUTCSeconds()>>1),d:((d.getUTCFullYear()-1980)<<9)|((d.getUTCMonth()+1)<<5)|d.getUTCDate()}}
  /* entries: [{name, bytes}] → Liste von Uint8Array (für new Blob(chunks)), damit nichts doppelt im Speicher liegt */
  function zipWrite(entries,opt){
    if(entries.length>65534)fail('ZIP: zu viele Dateien.');
    const out=[],cd=[],tm=dosTime(opt&&opt.date),names=new Set();let off=0;
    entries.forEach(e=>{
      const name=enc(e.name),data=u8(e.bytes),crc=crc32(data);
      if(names.has(e.name))fail('ZIP: Datei „'+e.name+'“ doppelt.');names.add(e.name);
      if(data.length>0xFFFFFFFE||off>0xFFFFFFFE-data.length-30-name.length)fail('ZIP: Sicherung zu groß (über 4 GB).');
      const h=new DataView(new ArrayBuffer(30));
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);h.setUint16(10,tm.t,true);h.setUint16(12,tm.d,true);
      h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,name.length,true);h.setUint16(28,0,true);
      const c=new DataView(new ArrayBuffer(46));
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);c.setUint16(12,tm.t,true);c.setUint16(14,tm.d,true);
      c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,off,true);
      out.push(new Uint8Array(h.buffer),name,data);cd.push(new Uint8Array(c.buffer),name);off+=30+name.length+data.length;
    });
    const cdSize=cd.reduce((a,x)=>a+x.length,0);if(off+cdSize>0xFFFFFFFE)fail('ZIP: Sicherung zu groß (über 4 GB).');
    const e=new DataView(new ArrayBuffer(22));
    e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,cdSize,true);e.setUint32(16,off,true);
    return out.concat(cd,[new Uint8Array(e.buffer)]);
  }
  /* Inhaltsverzeichnis lesen, ohne etwas zu entpacken */
  function zipList(buf){
    const u=u8(buf),v=new DataView(u.buffer,u.byteOffset,u.byteLength);let e=-1;
    for(let i=u.length-22;i>=Math.max(0,u.length-22-65535);i--)if(v.getUint32(i,true)===0x06054b50){e=i;break}
    if(e<0)fail('Import: keine ZIP-Datei oder Datei unvollständig.');
    const n=v.getUint16(e+10,true),size=v.getUint32(e+12,true),start=v.getUint32(e+16,true);
    if(v.getUint16(e+4,true)||v.getUint16(e+6,true)||v.getUint16(e+8,true)!==n)fail('Import: mehrteilige ZIP-Dateien werden nicht unterstützt.');
    if(n===0xFFFF||size===0xFFFFFFFF||start===0xFFFFFFFF)fail('Import: ZIP64 wird nicht unterstützt.');
    if(start+size>e)fail('Import: ZIP-Inhaltsverzeichnis beschädigt.');
    const list=[];let p=start;
    for(let k=0;k<n;k++){
      if(p+46>e||v.getUint32(p,true)!==0x02014b50)fail('Import: ZIP-Inhaltsverzeichnis beschädigt.');
      const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),csize=v.getUint32(p+20,true),usize=v.getUint32(p+24,true),
        nl=v.getUint16(p+28,true),xl=v.getUint16(p+30,true),cl=v.getUint16(p+32,true),off=v.getUint32(p+42,true);
      if(p+46+nl>e)fail('Import: ZIP-Inhaltsverzeichnis beschädigt.');
      let name;try{name=dec(u.subarray(p+46,p+46+nl))}catch(x){fail('Import: ungültiger Dateiname im Archiv.')}
      if(flags&1)fail('Import: verschlüsselte ZIP-Dateien werden nicht unterstützt.');
      if(csize===0xFFFFFFFF||usize===0xFFFFFFFF||off===0xFFFFFFFF)fail('Import: ZIP64 wird nicht unterstützt.');
      list.push({name,method,crc,csize,size:usize,offset:off});p+=46+nl+xl+cl;
    }
    return list;
  }
  /* Eine Datei lesen und prüfen (Größe, CRC). inflate: async (Uint8Array, size) → Uint8Array für Methode 8. */
  async function zipRead(buf,x,inflate){
    const u=u8(buf),v=new DataView(u.buffer,u.byteOffset,u.byteLength),p=x.offset;
    if(p+30>u.length||v.getUint32(p,true)!==0x04034b50)fail('Import: Datei „'+x.name+'“ im Archiv beschädigt.');
    const s=p+30+v.getUint16(p+26,true)+v.getUint16(p+28,true);
    if(s+x.csize>u.length)fail('Import: Datei „'+x.name+'“ im Archiv unvollständig.');
    let data=u.subarray(s,s+x.csize);
    if(x.method===8){if(typeof inflate!=='function')fail('Import: Dieses Archiv ist gepackt (Deflate) und kann hier nicht entpackt werden.');data=u8(await inflate(data,x.size))}
    else if(x.method!==0)fail('Import: Packverfahren '+x.method+' wird nicht unterstützt.');
    if(data.length!==x.size||crc32(data)!==x.crc)fail('Import: Datei „'+x.name+'“ im Archiv beschädigt (Prüfsumme).');
    return data;
  }

  /* ---------- Archiv .reiseplaner (SCHEMA_V4 §5) ---------- */
  /* backup: backupData(trips) der App. Fotostandorte werden aus den Kopien entfernt, außer keepLocation === true. */
  function exportPlan(backup,opt){
    if(!backup||!Array.isArray(backup.trips))fail('Export: Sicherung fehlt.');
    const plan=V().archivePlan(backup.trips,{now:opt&&opt.now||null,keepLocation:!!(opt&&opt.keepLocation===true)});
    return {plan,tripsJson:Object.assign(J(backup),{trips:plan.trips})};
  }
  /* files: {Pfad: Uint8Array} der tatsächlich gelesenen und geprüften Bilddateien. Fehlende stehen nicht im Manifest. */
  function exportPack(plan,tripsJson,files,opt){
    const manifest=J(plan.manifest),have=f=>files&&Object.prototype.hasOwnProperty.call(files,f.path)&&files[f.path];
    manifest.files=manifest.files.filter(have);
    const missing=plan.manifest.files.filter(f=>!have(f)).map(f=>f.path);
    const entries=[{name:'manifest.json',bytes:enc(JSON.stringify(manifest,null,2))},{name:'trips.json',bytes:enc(JSON.stringify(tripsJson,null,2))}]
      .concat(manifest.files.map(f=>({name:f.path,bytes:files[f.path]})));
    return {chunks:zipWrite(entries,{date:opt&&opt.now}),manifest,missing};
  }
  /* Archiv prüfen und lesen. Reihenfolge: Inhaltsverzeichnis → Dateinamen und Grenzen (checkArchive) → manifest/trips →
     Bilddateien mit Prüfsumme gegen sha256 des Eintrags. Fehlende oder beschädigte Bilder brechen nicht ab, sie werden gemeldet.
     opt: {inflate, sha256: async bytes → hex, maxBytes, maxJson} */
  async function importParse(buf,opt){
    opt=opt||{};const list=zipList(buf),names=list.map(x=>x.name),by={};list.forEach(x=>{by[x.name]=x});
    const maxBytes=opt.maxBytes||1024*1024*1024,maxJson=opt.maxJson||5*1024*1024;
    if(list.reduce((a,x)=>a+x.size,0)>maxBytes)fail('Import: Archiv ist zu groß (entpackt über '+Math.round(maxBytes/1048576)+' MB).');
    const readJson=async n=>{const x=by[n];if(!x)fail('Import: manifest.json oder trips.json fehlt.');if(x.size>maxJson)fail('Import: '+n+' ist zu groß.');
      try{return JSON.parse(dec(await zipRead(buf,x,opt.inflate)))}catch(e){fail(/^Import:/.test(e.message)?e.message:'Import: '+n+' ist kein gültiges JSON.')}};
    if(!by['manifest.json']||!by['trips.json'])fail('Import: manifest.json oder trips.json fehlt.');
    V().checkArchive(names.filter(n=>n!=='media/'&&n!=='thumbs/'),{format:'reiseplaner-archiv',archiveVersion:0},[]); /* Namen und Anzahl zuerst */
    const manifest=await readJson('manifest.json'),backup=await readJson('trips.json');
    if(!backup||typeof backup!=='object'||!Array.isArray(backup.trips))fail('Import: trips.json enthält keine Reiseliste.');
    const check=V().checkArchive(names,manifest,backup.trips);
    const sums={};backup.trips.forEach(t=>(t&&Array.isArray(t.media)?t.media:[]).forEach(m=>{if(m&&typeof m.id==='string'&&!sums[m.id])sums[m.id]=m.sha256}));
    const files={},damaged=[],thumbFromWork=[];
    for(const id of Object.keys(sums)){
      const w=by['media/'+id+'.jpg'],th=by['thumbs/'+id+'.jpg'];if(!w)continue;
      let work;try{work=await zipRead(buf,w,opt.inflate)}catch(e){damaged.push({id,reason:e.message});continue}
      if(typeof opt.sha256!=='function')fail('Import: Prüfsummenfunktion fehlt.');
      if(await opt.sha256(work)!==sums[id]){damaged.push({id,reason:'Prüfsumme passt nicht zum Foto-Eintrag.'});continue}
      let thumb=null;if(th){try{thumb=await zipRead(buf,th,opt.inflate)}catch(e){thumb=null}}
      if(!thumb){thumb=work;thumbFromWork.push(id)}
      files[id]={work,thumb};
    }
    return {backup,manifest,files,report:{missing:check.missing,missingThumbs:check.missingThumbs,orphans:check.orphans,damaged,thumbFromWork,locationStripped:manifest.locationStripped!==false}};
  }
  return {candidate,mediaCommit,mediaRemove,mediaPatch,bookSave,bookRemove,toServer,crc32,zipWrite,zipList,zipRead,exportPlan,exportPack,importParse,rest};
})();

/* ================= Teil B: App ================= */
/* Darf diese Reise jetzt Fotos/Bücher bekommen? Gleiche Sperren wie Format 3 (beschädigter Speicher, Konflikt, Leserecht). */
function f4CanEdit(t){return !!(F4_WRITE&&window.RPV4&&v3CanEdit(t))}
/* Liegt diese Serverfassung über dem, was die Datenbank annimmt? Dann bleibt die Reise lokal (Sync.push). */
function f4LocalOnly(data){return !!data&&typeof data.schemaVersion==='number'&&data.schemaVersion>F4_SERVER_MAX}
const F4_LOCAL_TXT='Fotos und Reisebücher (Format 4) können online noch nicht gespeichert werden. Diese Reise bleibt mit allen Änderungen auf diesem Gerät, bis der Server Format 4 annimmt. Sichert sie mit Fotos als .reiseplaner-Datei.';
function f4LocalCount(){return Store.isAccount()?Object.values(Store.meta).filter(m=>m&&m.localOnly).length:0}
/* Hinweis in der Vorschau vor dem Anheben */
function f4UpgradeNotice(cand){
  if(!cand||!cand.upgrade)return '';
  return '<div class="note" role="status" data-f4-upgrade><b>Die Reise wird dabei auf Format 4 umgestellt.</b><p>Das bleibt dauerhaft so, auch wenn später alle Fotos und Reisebücher wieder gelöscht werden. Ältere App-Versionen zeigen die Reise danach nur noch an; auf anderen Geräten die App zuerst neu laden.</p>'+
    (Store.isAccount()&&F4_SERVER_MAX<4?'<p><b>Nur auf diesem Gerät:</b> '+esc(F4_LOCAL_TXT)+(Store.meta[cand.trip.id]&&Store.meta[cand.trip.id].version?' Mitreisende sehen bis dahin den letzten Online-Stand.':'')+'</p>':'')+
    '<p class="small muted">Fotos selbst stehen nie in den Reisedaten, nur ihre Beschreibung. Die Bilder liegen in der Fotoablage dieses Browsers und sind keine Sicherung.</p></div>';
}
/* Kandidat speichern. Ohne confirmed wird ein Anheben auf Format 4 nicht gespeichert, sondern zur Bestätigung zurückgegeben. */
function f4Commit(cand,opt){
  if(!cand||!cand.trip)throw new Error('Nichts zu speichern.');
  if(cand.needsConfirm)return {ok:false,needsConfirm:cand.needsConfirm,uses:cand.uses,candidate:cand};
  if(cand.noop)return {ok:true,trip:Store.get(cand.trip.id),noop:true,added:[],duplicates:cand.duplicates||[]};
  const t=Store.get(cand.trip.id);if(!t)throw new Error('Reise nicht mehr vorhanden.');
  if(!f4CanEdit(t))throw new Error(!F4_WRITE?'Fotos und Reisebücher können in dieser App-Version noch nicht gespeichert werden.':'Diese Reise kann gerade nicht geändert werden.');
  if(JSON.stringify(t)!==cand.base)throw new Error('Die Reise wurde inzwischen geändert. Bitte die Änderung erneut vorbereiten.');
  if(cand.upgrade&&!(opt&&opt.confirmed))return {ok:false,needsConfirm:'format4',notice:f4UpgradeNotice(cand),candidate:cand};
  const next=clone(cand.trip);validateExtras(next);
  const issues=commitmentIssues(t,next);if(issues.length)throw new Error('Nicht möglich: '+issues.join(' · ')+'.');
  if(!Store.put(next))return {ok:false,error:'Nicht gespeichert.'};
  return {ok:true,trip:Store.get(next.id),upgraded:!!cand.upgrade,added:cand.added||[],duplicates:cand.duplicates||[]};
}
/* Schreibwege für Paket 8 (Fotos) und das Reisebuch. Rückgabe wie f4Commit; bei needsConfirm den Hinweis zeigen und
   nach „Speichern“ f4Commit(candidate, {confirmed:true}) aufrufen. Ungültige Eingaben werfen mit deutschem Grund. */
function mediaCommit(t,entries,opt){return f4Commit(RPF4.mediaCommit(t,entries),opt)}
function mediaRemove(t,id,opt){return f4Commit(RPF4.mediaRemove(t,id,opt),opt)}
function mediaPatch(t,id,patch,opt){return f4Commit(RPF4.mediaPatch(t,id,patch),opt)}
function bookSave(t,book,opt){const c=RPF4.bookSave(t,book,{now:opt&&opt.now||new Date().toISOString()});const r=f4Commit(c,opt);r.book=c.book;r.warnings=c.warnings;return r}
function bookRemove(t,id,opt){return f4Commit(RPF4.bookRemove(t,id),opt)}

/* ---------- Sicherung mit Fotos (.reiseplaner) ---------- */
let f4Photos=null;
function f4PhotoStore(){if(!window.RPPhotos)throw new Error('Die Fotoablage konnte nicht geladen werden. Bitte neu laden.');if(!f4Photos)f4Photos=window.RPPhotos.create();return f4Photos}
const f4HasPhotos=trips=>(trips||[]).some(t=>t&&Array.isArray(t.media)&&t.media.length);
/* Hinweis beim JSON-Export (SCHEMA_V4 §5) */
function f4JsonNote(trips){return f4HasPhotos(trips)?'<p class="small" data-f4-json-note><b>Fotos sind in der JSON-Datei nicht enthalten.</b> Die Foto-Einträge bleiben erhalten und zeigen nach einem Import „Datei fehlt“. Mit Fotos sichert die .reiseplaner-Datei.</p>':''}
function f4Download(chunks,name){
  const blob=new Blob(chunks,{type:'application/zip'}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
/* Bilddateien aus der Fotoablage lesen und prüfen. Nie stiller Erfolg: Fehlendes und Beschädigtes steht im Bericht. */
async function f4ExportArchive(trips,opt){
  const keep=!!(opt&&opt.keepLocation===true),now=new Date().toISOString();
  const {plan,tripsJson}=RPF4.exportPlan(backupData(trips),{now,keepLocation:keep});
  const P=window.RPPhotos,files={},problems=[],need=plan.entries.filter(e=>e.kind==='media'||e.kind==='thumb');
  const store=need.length?f4PhotoStore():null,report=(id,reason)=>{if(!problems.some(p=>p.id===id))problems.push({id,reason})};
  for(const e of need){
    let r=null;try{r=await store.get(e.mediaId,e.kind==='media'?'work':'thumb')}catch(x){report(e.mediaId,x.message);continue}
    if(!r||!r.bytes||r.damaged){if(e.kind==='media')report(e.mediaId,'Foto auf diesem Gerät nicht vorhanden.');continue}
    const bytes=new Uint8Array(r.bytes);
    if(e.kind==='media'&&await P.sha256(bytes)!==e.sha256){report(e.mediaId,'Datei passt nicht zum Foto-Eintrag (Prüfsumme).');continue}
    if(!keep&&P.readExif(bytes).gps){report(e.mediaId,'Datei enthält einen Standort und wurde ohne Standortwahl nicht gesichert.');continue}
    files[e.path]=bytes;
  }
  /* Vorschau ohne Arbeitskopie hilft beim Wiederherstellen nicht */
  Object.keys(files).forEach(p=>{const m=/^thumbs\/(.+)\.jpg$/.exec(p);if(m&&!files['media/'+m[1]+'.jpg'])delete files[p]});
  const pack=RPF4.exportPack(plan,tripsJson,files,{now});
  const name='Reiseplaner-Sicherung-'+now.slice(0,10)+'.reiseplaner';
  if(!(opt&&opt.dryRun))f4Download(pack.chunks,name);
  return {name,trips:tripsJson.trips.length,photos:pack.manifest.files.filter(f=>f.kind==='media').length,problems,locationStripped:!keep,chunks:opt&&opt.dryRun?pack.chunks:undefined};
}
/* Deflate über den Browser (Safari ab 16.4, Chrome ab 80). Ohne: nur ungepackte Archive, wie diese App sie schreibt. */
async function f4Inflate(data,size){
  if(typeof DecompressionStream!=='function')throw new Error('Import: Dieser Browser kann gepackte ZIP-Dateien nicht entpacken. Bitte eine mit dem Reiseplaner erstellte Datei verwenden.');
  const out=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  if(out.length!==size)throw new Error('Import: Datei im Archiv hat eine falsche Größe.');
  return out;
}
const F4_MAX_ARCHIVE=1024*1024*1024;
const f4IsArchive=(file,head)=>/\.(reiseplaner|zip)$/i.test(file&&file.name||'')||!!(head&&head[0]===0x50&&head[1]===0x4b);
/* Archiv lesen und prüfen; danach dieselbe Vorschau wie bei der JSON-Sicherung (validateBackup → sheetImport). */
async function f4ReadArchive(file){
  if(file.size>F4_MAX_ARCHIVE)throw new Error('Datei zu groß: höchstens 1 GB.');
  const buf=new Uint8Array(await file.arrayBuffer());
  const res=await RPF4.importParse(buf,{inflate:f4Inflate,sha256:b=>window.RPPhotos.sha256(b),maxBytes:F4_MAX_ARCHIVE});
  const draft=validateBackup(res.backup); /* gleiche Prüfung wie die JSON-Sicherung, vor jeder Anzeige */
  const r=res.report,n=Object.keys(res.files).length,info=[n+' Fotos lesbar'];
  if(r.missing.length)info.push(r.missing.length+' Fotos fehlen im Archiv (Einträge bleiben, „Datei fehlt“)');
  if(r.damaged.length)info.push(r.damaged.length+' Fotos beschädigt, nicht übernommen');
  if(r.orphans.length)info.push(r.orphans.length+' Dateien ohne Eintrag werden ignoriert');
  info.push(r.locationStripped?'ohne Fotostandorte gesichert':'mit Fotostandorten gesichert');
  UI.importDraft=draft;UI.importProtected=false;UI.archive={draft,files:res.files,report:r};
  UI.importInfo='Archiv .reiseplaner · Sicherungsformat v'+res.backup.version+(typeof res.backup.exportedAt==='string'?' · Export: '+res.backup.exportedAt.slice(0,40):'')+' · '+info.join(', ');
  sheetImport();
  return res;
}
/* Import mit Fotos: erst die Bilder der Reisen ablegen, die wirklich übernommen werden, dann die Reisen (importTrips).
   Scheitert etwas, werden nur die in diesem Lauf neu abgelegten Bilder wieder entfernt. Ohne Archiv: wie bisher. */
async function f4ImportTrips(mode){
  const draft=UI.importDraft;if(!draft)throw new Error('Keine Sicherung geöffnet.');
  const arch=UI.archive&&UI.archive.draft===draft?UI.archive:null;
  if(!arch||!Object.keys(arch.files).length)return importTrips(backupData(draft),mode);
  const store=f4PhotoStore(),want=new Set();
  draft.filter(t=>mode==='copy'||!Store.get(t.id)).forEach(t=>(t.media||[]).forEach(m=>{if(arch.files[m.id])want.add(m.id)}));
  const added=[];
  try{
    for(const id of want){const h=await store.has(id);await store.put(id,{work:{bytes:arch.files[id].work,type:'image/jpeg'},thumb:{bytes:arch.files[id].thumb,type:'image/jpeg'}});if(!h.work)added.push(id)}
    return importTrips(backupData(draft),mode);
  }catch(e){for(const id of added){try{await store.remove(id)}catch(x){}}throw e}
  finally{if(UI.archive===arch)UI.archive=null}
}
function f4ExportSheet(scope){
  const trips=scope==='trip'?[cur()].filter(Boolean):Store.list();if(!trips.length)return;
  const n=trips.reduce((a,t)=>a+(Array.isArray(t.media)?t.media.length:0),0);
  openSheet('<div data-f4-sheet><h2>Mit Fotos sichern</h2><p>'+(trips.length===1?'Eine Reise':trips.length+' Reisen')+' mit '+n+' Fotos als .reiseplaner-Datei. Fotos, die nur auf einem anderen Gerät liegen, fehlen darin und werden vorher genannt.</p>'+
    '<label class="fld"><input type="checkbox" id="f4-keep-location"> Fotostandorte mitsichern</label><p class="small muted">Standardmäßig ohne Standorte. Die Reise auf diesem Gerät behält sie.</p>'+
    '<div class="row"><button type="button" class="btn" data-f4="export-run" data-scope="'+(scope==='trip'?'trip':'all')+'">Datei erstellen</button><button type="button" class="btn ghost" data-act="sheet-x">Abbrechen</button></div><p id="f4-error" role="alert"></p></div>');
}
document.addEventListener('click',async e=>{
  const b=e.target.closest&&e.target.closest('[data-f4]');if(!b)return;
  const act=b.getAttribute('data-f4');if(Store.corruptRaw!==null){alertMsg('Gesperrt: Bitte zuerst die Rohdaten sichern.');return}
  if(act==='export-open'){f4ExportSheet(b.getAttribute('data-scope'));return}
  if(act==='export-run'){if(b.disabled)return;b.disabled=true;const box=$('#f4-error');
    try{const scope=b.getAttribute('data-scope'),trips=scope==='trip'?[cur()].filter(Boolean):Store.list(),keep=!!($('#f4-keep-location')||{}).checked;
      if(box)box.textContent='Sicherung wird erstellt …';
      const r=await f4ExportArchive(trips,{keepLocation:keep});closeSheet();
      alertMsg(r.photos+' Fotos und '+r.trips+' Reisen gesichert'+(r.locationStripped?' (ohne Standorte)':' (mit Standorten)')+'.'+(r.problems.length?' Nicht enthalten: '+r.problems.length+' Fotos ('+r.problems[0].reason+(r.problems.length>1?' …':'')+').':''));
    }catch(err){if(box)box.textContent=err.message;else alertMsg(err.message)}finally{b.disabled=false}
  }
});
