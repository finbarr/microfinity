/** One AI seat against idle seats. No fallback; measured latency advances simulation. */
import 'dotenv/config';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {compile,bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {jevDecision,JEV_STRATEGIES,type JevContext} from '../server/controllers';
import {emptyButtons,colors,type Edge} from '../sdk/index';
import {navigationButtons,type NavigationTarget} from '../server/controller-navigation';
import {buttonEdges} from '../runtime/input';

const playerId=process.env.JEV_BENCH_PLAYER??'p1';
if(!/^p[0-3]$/.test(playerId))throw Error('JEV_BENCH_PLAYER must be p0..p3');
const names=process.argv.length>2?process.argv.slice(2):['nose-dive','crawl-for-gold','odd-snack-out','toast-catch'];
const variants=(process.env.JEV_BENCH_VARIANTS??'rules-v4,factor-v7').split(',');
if(variants.some(v=>![...JEV_STRATEGIES,'description-v0'].includes(v as any)))throw Error('Unknown benchmark strategy');
const seeds=(process.env.JEV_BENCH_SEEDS??'41,72').split(',').map(Number);
if(seeds.some(seed=>!Number.isInteger(seed)||seed<0||seed>0xffffffff))throw Error('Invalid benchmark seed');
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
const boot=await bootstrap(),report:any={at:new Date().toISOString(),controllerHash:digest(await readFile('server/controllers.ts','utf8')+await readFile('server/controller-evidence.ts','utf8')+await readFile('server/controller-navigation.ts','utf8')),method:'Four seats through party-v1. One selected AI vs idle opponents. Measured response latency advances realtime simulation before inputs. 200ms opportunities, role handoffs release controls, inactive roles skip inference. No scripted fallback.',episodes:[]};
for(const name of names){
  const source=await readFile(`games/${name}.ts`,'utf8'),code=await compile(source);
  for(const seed of seeds)for(const variant of variants){
    const vm=await Sandbox.create(code,boot),meta=vm.call('meta').meta;
    let status=vm.call('init',{seed,difficulty:1,players:Array.from({length:4},(_,i)=>({id:`p${i}`,name:`P${i}`,color:colors[i]}))},'party-v1');
    let held=emptyButtons(),pending:Edge[]=[],latency=120,epoch=0;
    let navigation:{target:NavigationTarget;until:number}|undefined;
    const decisions:any[]=[],history:any[]=[];
    const step=(edges:Edge[]=[],dt=1/60,event:'tick'|'input'|'timeout'='tick')=>{
      const role=status.roles[playerId];
      if(navigation&&!edges.length&&status.tick%3===0){
        const buttons=status.time<navigation.until?navigationButtons(vm.call('observe',playerId).game,navigation.target,held):emptyButtons();
        if(status.time>=navigation.until)navigation=undefined;
        edges=buttonEdges(held,buttons);held=buttons;
      }
      status=vm.call('step',{[playerId]:[...pending,...edges]},dt,event);pending=[];
      if(role!==status.roles[playerId]){epoch++;navigation=undefined;pending=buttonEdges(held,emptyButtons());held=emptyButtons();}
    };
    try{
      while(!status.done&&decisions.length<180){
        if(['waiting','finished','eliminated'].includes(status.roles[playerId])){
          if(meta.clock==='realtime')for(let i=0;i<12&&!status.done;i++)step();
          else step([],Math.max(0,Math.min(status.nextStepAt??status.time+10,meta.duration)-status.time),'timeout');
          continue;
        }
        const view=vm.call('observe',playerId),role=status.roles[playerId],requestEpoch=epoch;
        const phase=typeof view.game?.phase==='string'?`${view.game.round??0}:${view.game.phase}`:null;
        const sample={tick:view.tick,time:view.time,phase,game:view.game,buttons:{...held}};
        if(phase&&history.at(-1)?.phase===phase)history[history.length-1]=sample;else history.push(sample);
        if(history.length>6)history.shift();
        let decision;
        try{decision=await jevDecision(meta,view,held,history,undefined,variant==='description-v0'?undefined:{source,strategy:variant as JevContext['strategy'],intervalMs:200,expectedLatencyMs:latency,observationAgeMs:0});}
        catch(error){decisions.push({tick:view.tick,error:(error as Error).message});break;}
        latency=decision.latencyMs;
        const elapsedTicks=Math.max(1,Math.ceil(decision.latencyMs/(1000/60)));
        if(meta.clock==='realtime')for(let i=0;i<elapsedTicks&&!status.done;i++)step();
        const stale=status.done||requestEpoch!==epoch||status.roles[playerId]!==role||status.tick-view.tick>90;
        decisions.push({tick:view.tick,game:view.game,decision,stale});
        if(status.done)break;
        if(!stale){navigation=decision.navigation?{target:decision.navigation,until:status.time+1}:undefined;const buttons=decision.navigation?navigationButtons(vm.call('observe',playerId).game,decision.navigation,decision.buttons):decision.buttons;const edges=buttonEdges(held,buttons);held={...buttons};step(edges,meta.clock==='realtime'?1/60:Math.max(.2,decision.latencyMs/1000),meta.clock==='realtime'?'tick':'input');}
        if(meta.clock==='realtime'){
          const nextBoundary=Math.ceil((view.tick+elapsedTicks+1)/12)*12;
          while(status.tick<nextBoundary&&!status.done)step();
        }
      }
      const times=decisions.flatMap(d=>d.decision?[d.decision.latencyMs]:[]).sort((a,b)=>a-b);
      const result={name,sourceHash:digest(source),seed,variant,done:status.done,playerId,score:status.scores[playerId],outcome:status.outcomes[playerId]??null,seconds:status.time,calls:decisions.length,errors:decisions.filter(d=>d.error).length,latencyMedianMs:times[Math.floor(times.length/2)],latencyP95Ms:times[Math.floor(times.length*.95)],decisions};
      report.episodes.push(result);console.log(JSON.stringify({...result,decisions:undefined,providerErrors:decisions.filter(d=>d.error).map(d=>d.error)}));
    }finally{vm.dispose();}
    await mkdir('evidence/jev',{recursive:true});await writeFile(process.env.JEV_BENCH_OUTPUT??'evidence/jev/context-comparison.json',JSON.stringify(report,null,2));
  }
}
if(report.episodes.some((episode:any)=>!episode.done||episode.errors))process.exitCode=1;
