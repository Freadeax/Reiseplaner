const fs=require('fs'),vm=require('vm'),assert=require('assert');
const {webcrypto}=require('crypto');
const script=require("./app-code.cjs")(fs.readFileSync(__dirname+'/../index.html','utf8')).replace("go(location.hash||'reisen',true);",'').replace('if(Store.corruptRaw===null)Store.connect();','');
const memory=new Map();const ctx={crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,window:{addEventListener(){}},document:{addEventListener(){},querySelector(){return null;},createElement(){return {style:{},setAttribute(){}}},body:{appendChild(){}}},localStorage:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},setTimeout:()=>0,clearTimeout(){},console};
vm.createContext(ctx);vm.runInContext(script,ctx);const a=ctx.window.__app;
(async()=>{
 const password='Testpassphrase äöü 123!';const trip=a.newTrip({title:'Private Reise',notes:'Private Buchungsnummer 4711'}),plain=a.backupData([trip]);const original=JSON.stringify(plain);
 const envelope=await a.encryptBackup(plain,password),second=await a.encryptBackup(plain,password);
 assert.equal(envelope.format,'reiseplaner-encrypted-backup');assert.equal(envelope.version,1);assert.equal(envelope.iterations,600000);assert.notEqual(envelope.salt,second.salt);assert.notEqual(envelope.iv,second.iv);assert.notEqual(envelope.ciphertext,second.ciphertext);
 const serialized=JSON.stringify(envelope);assert(!serialized.includes('4711')&&!serialized.includes('Private Reise')&&!serialized.includes(password),'keine privaten Klartextdaten in der Exporthülle');
 assert.equal(JSON.stringify(await a.decryptBackup(envelope,password)),original);assert.equal(JSON.stringify(plain),original,'Export verändert die Quelle nicht');
 await assert.rejects(()=>a.decryptBackup(envelope,'Falsches Passwort 123'),/Passwort falsch/);
 const bytes=Buffer.from(envelope.ciphertext,'base64');bytes[1]^=1;await assert.rejects(()=>a.decryptBackup({...envelope,ciphertext:bytes.toString('base64')},password),/beschädigt/);
 const salt=Buffer.from(envelope.salt,'base64');salt[0]^=1;await assert.rejects(()=>a.decryptBackup({...envelope,salt:salt.toString('base64')},password),/beschädigt/);
 for(const raw of [{...envelope,version:99},{...envelope,iterations:1e9},{...envelope,iv:'YWJj'},{...envelope,ciphertext:'@@=='},{...envelope,cipher:'AES-CBC'}])await assert.rejects(()=>a.decryptBackup(raw,password));
 await assert.rejects(()=>a.encryptBackup(plain,'kurz'),/mindestens 12/);
 const noCrypto=ctx.crypto;ctx.crypto=undefined;await assert.rejects(()=>a.encryptBackup(plain,password),/nicht verfügbar/);ctx.crypto=noCrypto;
 const manyNotes=a.backupData([{...trip,notes:'x'.repeat(a.MAX_BACKUP_BYTES)}]);await assert.rejects(()=>a.encryptBackup(manyNotes,password),/zu groß/);
 const legacy={...plain,version:1};assert.equal((await a.decryptBackup(await a.encryptBackup(legacy,password),password)).version,1);
 // Preview is read-only and distinguishes new, same-ID identical and changed content.
 a.Store.put(trip);const before=JSON.stringify(a.Store.trips);const imported=a.validateBackup(plain);
 assert(a.importPreview(imported)[0].state.includes('identischer'));assert.equal(JSON.stringify(a.Store.trips),before);
 const changed=a.importPreview([{...imported[0],budget:123,notes:'Neu'}])[0];assert(changed.changed.includes('Budget')&&changed.changed.includes('Notizen'));
 const newTrip={...imported[0],id:'tnew123'};assert.equal(a.importPreview([newTrip])[0].state,'Neue Reise');
 // Quota failures and tab conflicts must not report success or leave a partial import.
 const normalSet=ctx.localStorage.setItem;ctx.localStorage.setItem=()=>{throw new Error('quota');};assert.throws(()=>a.importTrips(a.backupData([newTrip]),'skip'),/nicht gespeichert/);assert.equal(JSON.stringify(a.Store.trips),before);ctx.localStorage.setItem=normalSet;
 const newer=JSON.stringify({other:{title:'Neuere Ansicht'}});memory.set('rp-trips',newer);assert.throws(()=>a.importTrips(a.backupData([newTrip]),'skip'),/nicht gespeichert/);assert.equal(memory.get('rp-trips'),newer);assert.equal(JSON.stringify(a.Store.trips),before);
 a.Store.lastRaw=newer;memory.set('rp-trips',before);a.Store.lastRaw=before;assert.equal(a.importTrips(a.backupData([newTrip]),'skip').length,1);assert(a.Store.get('tnew123'));
 assert.throws(()=>a.importTrips(plain,'overwrite'),/Unbekannte/);
 console.log('Passwort-Sicherung: Rundlauf, Zufallssalz/IV, falsches Passwort, Manipulation, Parameter-/Größenlimits, fehlende Kryptounterstützung, v1-Kompatibilität, Importvorschau und Import-Rollback geprüft.');
})().catch(err=>{console.error(err);process.exitCode=1;});
