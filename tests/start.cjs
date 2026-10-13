const fs=require('fs'),vm=require('vm');
const s=fs.readFileSync(__dirname+'/../index.html','utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const els=Object.fromEntries(['#view','#sheet-root','#dock','#sync','#dock-nm','#dock-sum','#dock-bar'].map(k=>[k,{innerHTML:'',style:{},querySelector(){return {textContent:'',style:{}}}}]));
const ctx={window:{addEventListener(){},scrollTo(){}},location:{hash:''},history:{replaceState(){}},document:{addEventListener(){},querySelector(k){return els[k]||null},createElement(){return {setAttribute(){},style:{}}},body:{appendChild(){}}},localStorage:{getItem(){return null},setItem(){}},setTimeout,clearTimeout,console};
vm.createContext(ctx);vm.runInContext(s,ctx);
if(!els['#view'].innerHTML.includes('Meine Reisen'))throw new Error('Startansicht leer');
console.log('Startansicht mit',els['#view'].innerHTML.length,'Zeichen aufgebaut');
