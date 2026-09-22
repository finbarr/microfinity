import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { compile, bootstrap } from '../server/compiler';
import { Sandbox } from '../runtime/sandbox';
import { buttonEdges } from '../runtime/input';
import { colors, emptyButtons, type Buttons } from '../sdk/index';
import { scriptedDecision, choices } from '../server/controllers';
import { hash } from '../server/store';
const requested=process.argv.slice(2),files=(await readdir('games')).filter(f=>f.endsWith('.ts')).sort();
for(const name of requested)assert.ok(files.includes(`${name}.ts`),`Unknown reference game: ${name}`);
const report:any={at:new Date().toISOString(),episodesPerGame:100,games:[]},boot=await bootstrap();
for(const file of files.filter(f=>!requested.length||requested.includes(f.slice(0,-3)))){
  const code=await compile(await readFile(`games/${file}`,'utf8')),vm=await Sandbox.create(code,boot),{meta}=vm.call('meta');
  const started=performance.now();let ticks=0,replays=0,restores=0,renderChecks=0;const scores:number[]=[],outcomes:Record<string,number>={},coverage:any[]=[];
  try{
    for(let episode=0;episode<100;episode++){
      const count=Math.floor(episode/4)%2?meta.players[1]:meta.players[0],difficulty=episode%4,policy=['idle','random','scripted'][episode%3];
      const config={seed:episode+100,difficulty,players:Array.from({length:count},(_,i)=>({id:`p${i}`,name:`Tester ${i+1}`,color:colors[i]}))};
      let status=vm.call('init',config),held:Record<string,Buttons>=Object.fromEntries(config.players.map(p=>[p.id,emptyButtons()]));
      const journal:any[]=[];let saved:any,saveIndex=0,rng=episode+13,steps=0;
      while(!status.done&&steps<8000){
        let edges:Record<string,any>={};
        if(meta.clock==='action'||steps%12===0)for(const p of config.players){
          const view=vm.call('observe',p.id);let target=emptyButtons();
          if(policy==='scripted')target=scriptedDecision(meta,view,held[p.id],steps).buttons;
          if(policy==='random'){rng=(Math.imul(rng,1664525)+1013904223)>>>0;target=Object.values(choices)[rng%18];}
          edges[p.id]=buttonEdges(held[p.id],target);held[p.id]=target;
        }
        const dt=meta.clock==='action'?1:1/60,event=meta.clock==='action'?(steps%10===9?'timeout':'input'):'tick';
        status=vm.call('step',edges,dt,event);ticks++;steps++;
        if(episode<4)journal.push({edges,dt,event});
        if(episode<4&&steps===20){saved=vm.call('save');saveIndex=journal.length;}
        if(episode<4&&steps%24===0){for(const p of config.players){const view=vm.call('observe',p.id);if(view.game!==null){vm.call('draw',view.game,[],0,{time:view.time});vm.call('draw',view.game,[],0,{time:view.time,reducedMotion:true});renderChecks+=2;}if(meta.id==='cup-shuffle'){assert.ok(!('secret'in view.game));assert.ok(!('swaps'in view.game));if(view.game.phase==='choose'||view.game.phase==='shuffle')assert.equal(view.game.ballX,null);}}}
      }
      assert.equal(status.done,true,`${meta.id} seed ${config.seed} did not end`);const final=vm.call('save'),digest=hash(JSON.stringify(final));
      scores.push(...Object.values(status.scores) as number[]);for(const outcome of Object.values(status.outcomes))outcomes[outcome as string]=(outcomes[outcome as string]??0)+1;
      if(episode<4){
        vm.call('init',config);for(const j of journal)vm.call('step',j.edges,j.dt,j.event);assert.equal(hash(JSON.stringify(vm.call('save'))),digest);replays++;
        if(saved){vm.call('restore',saved);for(const j of journal.slice(saveIndex))vm.call('step',j.edges,j.dt,j.event);assert.equal(hash(JSON.stringify(vm.call('save'))),digest);restores++;}
      }
      coverage.push({seed:config.seed,players:count,difficulty,policy,steps,done:status.done,hash:episode<4?digest:undefined});
    }
    const elapsed=performance.now()-started;report.games.push({game:meta.id,episodes:100,ticks,milliseconds:Math.round(elapsed),stepsPerSecond:Math.round(ticks/(elapsed/1000)),replays,restores,renderChecks,outcomes,minScore:Math.min(...scores),maxScore:Math.max(...scores),meanScore:scores.reduce((a,b)=>a+b,0)/scores.length,coverage});console.log(`${meta.title}: 100 episodes, ${ticks} steps, ${Math.round(ticks/(elapsed/1000))} steps/s, ${replays} replays match`);
  }finally{vm.dispose();}
}
await mkdir('evidence',{recursive:true});const output=requested.length?`evidence/headless-episodes-${[...new Set(requested)].sort().join('-')}.json`:'evidence/headless-episodes.json';await writeFile(output,JSON.stringify(report,null,2));
