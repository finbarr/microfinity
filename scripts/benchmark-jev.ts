/** Real provider decisions, fixed seeds, no scripted fallback; latency advances the simulated clock. */
import 'dotenv/config';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';import {jevDecision} from '../server/controllers';import {emptyButtons,colors} from '../sdk/index';import {buttonEdges} from '../runtime/input';
const playerId=process.env.JEV_BENCH_PLAYER??'p0';
const requested=process.argv.slice(2),names=requested.length?requested:['nose-dive','crawl-for-gold','odd-snack-out','toast-catch'];
const boot=await bootstrap(),report:any={at:new Date().toISOString(),method:'Paired seeds, selected seat Jev vs idle opponents. Real provider latency advances realtime simulation before applying each response. 200ms opportunity interval. No scripted fallback.',episodes:[]};
for(const name of names){const source=await readFile(`games/${name}.ts`,'utf8'),code=await compile(source);
 for(const seed of [41,72])await Promise.all(['description-v0','rules-v4'].map(async variant=>{
  const vm=await Sandbox.create(code,boot),meta=vm.call('meta').meta;let status=vm.call('init',{seed,difficulty:1,players:Array.from({length:Math.max(meta.players[0],Number(playerId.slice(1))+1)},(_,i)=>({id:`p${i}`,name:`P${i}`,color:colors[i]}))}),held=emptyButtons(),latency=120;const decisions:any[]=[],history:any[]=[];
  try{while(!status.done&&decisions.length<180){
   const view=vm.call('observe',playerId);history.push({tick:view.tick,game:view.game});if(history.length>6)history.shift();
   let decision;try{decision=await jevDecision(meta,view,held,history,undefined,variant!=='description-v0'?{source,intervalMs:200,expectedLatencyMs:latency,observationAgeMs:0}:undefined);}catch(e){decisions.push({tick:view.tick,error:(e as Error).message});break;}
   latency=latency*.5+decision.latencyMs*.5;const elapsedTicks=Math.max(1,Math.ceil(decision.latencyMs/(1000/60)));
   if(meta.clock==='realtime')for(let i=0;i<elapsedTicks&&!status.done;i++)status=vm.call('step',{});
   decisions.push({tick:view.tick,game:view.game,decision});if(status.done)break;
   status=vm.call('step',{[playerId]:buttonEdges(held,decision.buttons)},meta.clock==='realtime'?1/60:.2,meta.clock==='realtime'?'tick':'input');held=decision.buttons;
   if(meta.clock==='realtime'){const nextBoundary=Math.ceil((view.tick+elapsedTicks+1)/12)*12;while(status.tick<nextBoundary&&!status.done)status=vm.call('step',{});}
  }
  const times=decisions.flatMap(d=>d.decision?[d.decision.latencyMs]:[]).sort((a,b)=>a-b),result={name,seed,variant,done:status.done,playerId,score:status.scores[playerId],outcome:status.outcomes[playerId]??null,seconds:status.time,calls:decisions.length,errors:decisions.filter(d=>d.error).length,latencyMedianMs:times[Math.floor(times.length/2)],latencyP95Ms:times[Math.floor(times.length*.95)],decisions};report.episodes.push(result);console.log(JSON.stringify({...result,decisions:undefined}));
  }finally{vm.dispose();}
 }));
 await mkdir('evidence/jev',{recursive:true});await writeFile('evidence/jev/rules-v4-benchmark.json',JSON.stringify(report,null,2));
}
