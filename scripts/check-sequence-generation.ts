/** Offline only: stop the local app before opening its PGlite directory. */
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFile,writeFile} from 'node:fs/promises';
import {Store,hash} from '../server/store';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner} from '../runtime/replay';
import {inspectLoop} from '../server/music-assets';
import {BUTTONS,type Button} from '../sdk/index';

const ids=['5aec13ad05ffd59443ae1756','8094d3e16a956853a719c3db','7044491713b89916870e6ab2'];
function callbacks(source:string){
 const file=ts.createSourceFile('game.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),printer=ts.createPrinter({removeComments:true}),result:Record<string,string>={};
 const visit=(node:ts.Node)=>{if(ts.isMethodDeclaration(node)&&['init','step','observe','role'].includes(node.name.getText(file)))result[node.name.getText(file)]=printer.printNode(ts.EmitHint.Unspecified,node,file);ts.forEachChild(node,visit);};visit(file);return result;
}
const store=new Store();await store.init();
const tap=(buttons:Button[])=>({p0:buttons.flatMap(button=>[{button,down:true},{button,down:false}])});
try{
 const jobs=[];
 for(const id of ids){const [row]=await store.query('SELECT record FROM jobs WHERE id=$1',[id]);assert.equal(row.record.status,'ready');jobs.push(row.record);}
 const original=await store.version(jobs[0].finishedVersion),rulesRepair=await store.version(jobs[1].finishedVersion),repaired=await store.version(jobs[2].finishedVersion);
 assert.equal(jobs[2].remix,rulesRepair.id);assert.deepEqual(callbacks(rulesRepair.source),callbacks(repaired.source));
 for(const job of jobs.slice(1)){assert.equal(job.branches.art,'reused');assert.equal(job.branches.music,'reused');assert.ok(!job.models.image&&!job.models.music);}
 assert.deepEqual(rulesRepair.manifest.assets,repaired.manifest.assets);assert.deepEqual(rulesRepair.manifest.music,repaired.manifest.music);
 assert.equal(original.manifest.meta.clock,'action');assert.equal(repaired.manifest.meta.clock,'realtime');
 assert.equal(jobs[1].remix,original.id);assert.equal(jobs[1].branches.art,'reused');assert.equal(jobs[1].branches.music,'reused');
 assert.deepEqual(original.manifest.assets,repaired.manifest.assets);assert.deepEqual(original.manifest.music,repaired.manifest.music);
 assert.ok(repaired.source.includes('createSequence('));assert.ok(repaired.source.includes('advanceSequence('));
 for(const job of jobs){assert.ok(job.models.cartridge.startsWith('gpt-5-mini'));assert.ok(job.attempts.length>=1&&job.attempts.length<=3);assert.ok(!job.attempts.at(-1).error);}
 const timing=jobs[0].timings;assert.ok(Math.max(timing.codeStart,timing.artStart,timing.musicStart)<Math.min(timing.codeEnd,timing.artEnd,timing.musicEnd));
 const music=original.manifest.music as any,wav=await readFile(`data/assets/${music.hash}.wav`);assert.equal(hash(wav),music.hash);
 const signal=inspectLoop(wav,music.loopStart,music.loopEnd);assert.deepEqual(signal.problems,[]);
 const versions=new Map([[original.id,original],[rulesRepair.id,rulesRepair],[repaired.id,repaired]]),matches=[];
 for(const match of await store.query("SELECT id,record FROM matches WHERE status='complete' ORDER BY created_at")){
  if(match.record.rounds.length!==1)continue;const round=match.record.rounds[0],version=versions.get(round.versionId);if(!version)continue;
  const vm=await Sandbox.create(version.code,await store.runtime(version)),events:Record<string,number>={};
  try{const replay=new ReplayRunner(vm,round);while(replay.status.tick<round.status.tick){replay.step();for(const e of replay.status.feedback)events[e.kind]=(events[e.kind]??0)+1;}assert.equal(replay.verify(),true);}finally{vm.dispose();}
  const [record]=round.records;assert.deepEqual(record.metrics,[]);assert.deepEqual(record.controllers,['human']);
  const rows=await store.query('SELECT score FROM results WHERE match_id=$1',[match.id]);assert.equal(rows.length,1);assert.equal(rows[0].score,record.score);
  matches.push({id:match.id,version:version.id,seed:round.seed,seconds:round.status.time,score:record.score,outcome:record.outcome,inputMethods:record.inputMethods,presses:round.journal.flatMap((j:any)=>j.edges?.p0??[]).filter((e:any)=>e.down).map((e:any)=>e.button),events,exactReplay:true});
 }
 assert.ok(matches.some(m=>m.version===original.id&&m.outcome==='success'&&m.score===3),'Retain the observed original undercount');
 assert.ok(matches.some(m=>m.version===repaired.id&&m.outcome==='success'&&m.score===4));
 assert.ok(matches.some(m=>m.version===repaired.id&&m.outcome==='failure'&&m.presses.length===0&&m.seconds>5&&m.seconds<5.05),'Real browser idle expiry');
 assert.ok(matches.some(m=>m.version===repaired.id&&m.outcome==='failure'&&m.events.miss>0&&m.seconds<5),'Real browser wrong-key failure');
 const vm=await Sandbox.create(repaired.code,await store.runtime(repaired)),headless=[];
 try{
  for(let seed=20000;seed<20016;seed++){
   const config={seed,difficulty:1,players:[{id:'p0',name:'Fixture',color:'#fff'}]};
   vm.call('init',config);const pattern=vm.call('observe','p0').game.prompts.map((p:any)=>p.button) as Button[];assert.equal(pattern.length,4);
   const status=vm.call('step',tap(pattern));assert.equal(status.done,true);assert.equal(status.scores.p0,4);assert.equal(status.outcomes.p0,'success');assert.equal(status.feedback.filter((e:any)=>e.kind==='catch').length,4);
   const complete=vm.call('save');vm.call('init',config);vm.call('step',tap(pattern.slice(0,2)));const checkpoint=vm.call('save');vm.call('step',tap(pattern.slice(2)));const final=vm.call('save');vm.call('restore',checkpoint);vm.call('step',tap(pattern.slice(2)));assert.deepEqual(vm.call('save'),final);assert.equal(vm.call('observe','p0').scores.p0,4);
   vm.call('init',config);let idle:any;for(let tick=0;tick<310;tick++){idle=vm.call('step',{});if(idle.done)break;}assert.ok(idle.time>5&&idle.time<5.05);assert.equal(idle.outcomes.p0,'failure');
   vm.call('init',config);const wrong=vm.call('step',tap([BUTTONS.find(b=>b!==pattern[0])!]));assert.equal(wrong.outcomes.p0,'failure');assert.equal(wrong.scores.p0,0);
   headless.push({seed,pattern,batchedScore:status.scores.p0,catchEvents:4,idleExpiry:idle.time,wrongKeyFailure:true,restoreExact:true,batchedSnapshotHash:hash(JSON.stringify(complete))});
  }
 }finally{vm.dispose();}
 const report={at:new Date().toISOString(),method:'All three jobs submitted through the ordinary creation UI. Initial creation was immediately played in IAB and reopened from the saved library in Chrome without a rebuild/restart. Its defects were repaired through a second live UI job, explicitly locking realtime and reusing media. A third UI job changed only labels/instructions; rule callbacks are compared structurally. The server stayed running during each submission-to-play-and-reopen flow; offline export/audit followed completed matches. No generated source was hand-edited.',jobs:jobs.map(j=>({id:j.id,models:j.models,branches:j.branches,timings:j.timings,usage:j.usage,budget:j.budget,attempts:j.attempts.map((a:any)=>({attempt:a.attempt,error:a.error??null})),version:j.finishedVersion})),originalDefects:['Brief selected action clock despite realtime request; per-press timeout only ran when another input arrived.','Cartridge added one point per step even when multiple prompts advanced; keyboard completion scored three.','Duplicate footer/title/time labels crowded the scene.'],repair:{clock:'realtime',exactMediaReuse:true,batchedScoring:true,perPressDeadline:true,labelRefinementPreservesRuleCallbacks:true},signal,matches,headless,coverage:{additionalAuthoringCheck:true,replacesRequiredThreeGameBenchmark:false,keyboard:true,chromeAndIabBothChromium:true,unlearnedHumanPerformance:false,physicalTouch:false,audibleListening:false}};
 await writeFile('evidence/generation/sequence-helpers-live.json',JSON.stringify(report,null,2));console.log(JSON.stringify({jobs:report.jobs.map(j=>({id:j.id,models:j.models,timings:j.timings})),matches,headlessSeeds:headless.length,signalProblems:signal.problems},null,2));
}finally{await store.close();}
