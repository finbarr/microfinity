/** Read public saved cartridges from the running app; never opens its live DB. */
import {mkdir,writeFile} from 'node:fs/promises';import {Sandbox} from '../runtime/sandbox';import {emptyButtons,colors} from '../sdk/index';import {buttonEdges} from '../runtime/input';
const base=process.env.API_BASE??'http://localhost:3000';
const request=async(path:string)=>{const response=await fetch(new URL(path,base));if(!response.ok)throw new Error(`Fixture fetch failed ${response.status}`);return response;};
const manifests=await (await request('/api/library')).json() as any[],results=[];
for(const manifest of manifests){
 const version=await (await request(`/api/versions/${manifest.id}`)).json() as any,runtime=await (await request(manifest.runtimeUrl??'/assets/runtime-legacy-1.0.0.js')).text();
 let frames=0,peakCommands=0;const started=performance.now();
 for(const seed of [31,78]){
  const vm=await Sandbox.create(version.code,runtime);try{
   const count=seed===31?manifest.meta.players[0]:manifest.meta.players[1],players=Array.from({length:count},(_,i)=>({id:`p${i}`,name:`Fixture ${i}`,color:colors[i]}));
   let status=vm.call('init',{seed,difficulty:seed===31?0:3,players}),held=Object.fromEntries(players.map(p=>[p.id,emptyButtons()]));
   for(let step=0;!status.done&&step<8000;step++){
    const edges:any={};if(step%12===0||manifest.meta.clock==='action')for(const p of players){const buttons={...emptyButtons(),right:step%48<24,action:step%24<12};edges[p.id]=buttonEdges(held[p.id],buttons);held[p.id]=buttons;}
    status=vm.call('step',edges,manifest.meta.clock==='action'?1:1/60,manifest.meta.clock==='action'?(step%10===9?'timeout':'input'):'tick');
    if(step%12===0||status.done)for(const p of players){const view=vm.call('observe',p.id);if(view.game!==null)for(const assets of [[],manifest.assets.map((a:any)=>a.name)]){const commands=vm.call('draw',view.game,assets);peakCommands=Math.max(peakCommands,commands.length);frames++;}}
   }
   if(!status.done)throw new Error(`${manifest.meta.title} did not end`);
  }finally{vm.dispose();}
 }
 const entry={game:manifest.meta.title,version:manifest.id,seeds:2,frames,peakCommands,milliseconds:Math.round(performance.now()-started)};results.push(entry);console.log(JSON.stringify(entry));
}
await mkdir('evidence/runtime',{recursive:true});await writeFile('evidence/runtime/saved-draws.json',JSON.stringify({at:new Date().toISOString(),method:'Two deterministic headless runs per current saved cartridge, min/max player counts, mellow/wild difficulties, all player views, stock and available-art branches. This validates commands, not visual quality or browser play.',results},null,2));
