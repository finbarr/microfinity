import 'dotenv/config';import {readFile,writeFile} from 'node:fs/promises';import {Sandbox} from '../runtime/sandbox';import {emptyButtons} from '../sdk/index';import {jevDecision} from '../server/controllers';
const report=[];
for(const gameId of ['creation-d20b56828f8b','creation-9f84062d0312']){
 const v=JSON.parse(await readFile(`artifacts/cartridges/${gameId}.json`,'utf8')),vm=await Sandbox.create(v.code,v.runtime);
 try{vm.call('init',{seed:42,difficulty:1,players:[{id:'p0',name:'Player',color:'#86efac'},{id:'p1',name:'Jev 2',color:'#f9a8d4'}]});
  if(v.manifest.meta.clock==='action')vm.call('step',{p0:[{button:'action',down:true}]},.1,'input');
  const observation=vm.call('observe','p1');const decision=await jevDecision(v.manifest.meta,observation,emptyButtons());report.push({gameId,observation,decision});
 }finally{vm.dispose();}
}
const target=process.argv[2]??'evidence/jev-observation-probe.json';await writeFile(target,JSON.stringify(report,null,2));console.log(JSON.stringify(report.map(({gameId,decision})=>({gameId,decision})),null,2));
