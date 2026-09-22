/** Paired held-out seeds; no database, graphics, providers or real-time waits. */
import assert from 'node:assert/strict';import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
import {HeadlessEnvironment,actionButtons} from '../runtime/headless';import {emptyButtons,type Buttons} from '../sdk/index';
import {allowedChoices,scriptedDecision} from '../server/controllers';import {hash} from '../server/store';
const runtime=await bootstrap(),seeds=Array.from({length:16},(_,i)=>10000+i),games:any[]=[];
const buttonKeys=['up','down','left','right','action'] as const;
const actionIndex=(buttons:Buttons)=>actionButtons.findIndex(b=>buttonKeys.every(k=>b[k]===buttons[k]));
const mean=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
for(const file of (await readdir('games')).filter(f=>f.endsWith('.ts')).sort()){
 const source=await readFile(`games/${file}`,'utf8'),code=await compile(source),vm=await Sandbox.create(code,runtime);
 const env=new HeadlessEnvironment(vm,{difficulty:1,actionRepeat:12,maxDecisions:2000}),meta=env.meta;
 const legal=Object.values(allowedChoices(meta)).map(actionIndex),episodes:any[]=[],start=performance.now();let totalDecisions=0;
 try{
  for(const seed of seeds)for(const policy of ['idle','random','scripted']){
   let result=env.reset(seed),held:Record<string,Buttons>=Object.fromEntries(result.agents.map(id=>[id,emptyButtons()])),decisions=0,random=(seed^0x9e3779b9)>>>0;
   let reward=result.rewards.p0;
   while(!result.terminated&&!result.truncated){
    const actions:Record<string,number>={};
    for(const id of result.agents){
     const view=result.observations[id];
     if(meta.id==='cup-shuffle'){assert.ok(!('secret' in view.game));assert.ok(!('swaps' in view.game));if(['choose','shuffle'].includes(view.game.phase))assert.equal(view.game.ballX,null);}
     let action=0;
     if(id!=='p0'||policy==='scripted')action=actionIndex(scriptedDecision(meta,view,held[id],decisions).buttons);
     else if(policy==='random'){random=(Math.imul(random,1664525)+1013904223)>>>0;action=legal[random%legal.length];}
     assert.ok(action>=0);actions[id]=action;held[id]=actionButtons[action];
    }
    result=env.step(actions);reward+=result.rewards.p0;decisions++;
   }
   assert.equal(result.terminated,true);assert.equal(result.truncated,false);
   const {rawScore,outcome,rewardVersion}=result.infos.p0,sign=meta.score.order==='lower'?-1:1,bonus=outcome==='success'?1:outcome==='failure'?-1:0;
   assert.ok(Math.abs(reward-(rawScore*sign+bonus))<1e-7,'Reward equals the documented score objective and terminal bonus');
   episodes.push({seed,policy,players:result.agents.length,difficulty:1,decisions,score:rawScore,outcome,reward,rewardVersion,terminated:result.terminated,truncated:result.truncated});totalDecisions+=decisions;
  }
  const elapsed=performance.now()-start,policies=Object.fromEntries(['idle','random','scripted'].map(policy=>{const rows=episodes.filter(e=>e.policy===policy);return [policy,{episodes:rows.length,meanScore:mean(rows.map(e=>e.score)),meanReward:mean(rows.map(e=>e.reward)),successes:rows.filter(e=>e.outcome==='success').length,outcomes:rows.reduce((a,e)=>({...a,[e.outcome]:(a[e.outcome]??0)+1}),{} as Record<string,number>)}];}));
  const paired={scriptedBetter:0,tied:0,randomBetter:0};for(const seed of seeds){const a=episodes.find(e=>e.seed===seed&&e.policy==='scripted'),b=episodes.find(e=>e.seed===seed&&e.policy==='random'),delta=(a.score-b.score)*(meta.score.order==='lower'?-1:1);paired[delta>0?'scriptedBetter':delta<0?'randomBetter':'tied']++;}
  games.push({id:meta.id,title:meta.title,sourceHash:hash(source),codeHash:hash(code),players:meta.players[0],difficulty:1,clock:meta.clock,totalDecisions,milliseconds:Math.round(elapsed),decisionsPerSecond:Math.round(totalDecisions*1000/elapsed),policies,pairedScriptedVersusRandom:paired,episodes});
  console.log(JSON.stringify({game:meta.id,policies,paired}));
 }finally{env.close();}
}
const report={at:new Date().toISOString(),runtimeHash:hash(runtime),method:'Same HeadlessEnvironment and QuickJS rules used by the Python bridge. Evaluate p0 with idle, random or the existing observation-only scripted policy, against fixed scripted opponents when required. Pair every policy on the same 16 seeds, normal difficulty and minimum supported player count. Seeds 10000..10015 were not used by scripts/episodes.ts; no policy tuning or training occurs here.',seeds,actionRepeat:12,simulatedDecisionSeconds:.2,cloudLatencyIncluded:false,renderingIncluded:false,databaseUsed:false,trainingPerformed:false,genuineHumansMeasured:false,rewardCheck:'Cumulative versioned reward equals signed final raw score plus the documented terminal bonus. This checks accounting, not the absence of all possible reward exploits.',coverageLimit:'One difficulty, minimum player count and 16 new seeds per game. Shared opponents react to the evaluated player. Results do not establish human learnability, robust policy ranking or live Jev skill.',games};
await mkdir('evidence/rl',{recursive:true});await writeFile('evidence/rl/baselines.json',JSON.stringify(report,null,2));
