/** Offline only: stop the local app before opening its PGlite directory. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import ts from 'typescript';
import {Store,hash} from '../server/store';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner} from '../runtime/replay';

function withoutDraw(source:string){
  const file=ts.createSourceFile('cartridge.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const transformed=ts.transform(file,[context=>root=>{
    const visit:ts.Visitor=node=>ts.isMethodDeclaration(node)&&node.name.getText(file)==='draw'?undefined:ts.visitEachChild(node,visit,context);
    return ts.visitNode(root,visit) as ts.SourceFile;
  }]);
  try{return ts.createPrinter({removeComments:true}).printFile(transformed.transformed[0]);}
  finally{transformed.dispose();}
}

const cases=[
  ['82f0219d102da0b19c6f911d',6,'success','first rules repair, IAB keyboard'],
  ['01d92fee72198a182fdb659c',0,'failure','first rules repair, same challenge idle'],
  ['ebd39bd26815d789cc0a3386',0,'failure','first rules repair, Chrome library reopening idle'],
  ['cdbc31afef56e44eecb6fc78',3,'failure','drawing refinement, IAB 390x844 keyboard'],
  ['4b73474599e074dc27060725',6,'success','drawing refinement, Chrome library reopening keyboard'],
  ['71cf02ad1b8e2d820d56f00a',0,'failure','drawing refinement, same Chrome challenge idle'],
] as const;
const store=new Store();await store.init();
try{
  const jobs=[];
  for(const id of ['17d5b1fe42d3a296d5d15575','6b37968f4beb675b3f7e6d2d']){
    const [{record:job}]=await store.query('SELECT record FROM jobs WHERE id=$1',[id]);
    const prior=await store.version(job.remix),next=await store.version(job.finishedVersion);
    assert.equal(job.status,'ready');assert.equal(job.attempts.length,1);
    assert.equal(job.branches.art,'reused');assert.equal(job.branches.music,'reused');
    assert.deepEqual(next.manifest.assets,prior.manifest.assets);assert.deepEqual(next.manifest.music,prior.manifest.music);
    assert.ok(!job.models.image&&!job.models.music);assert.notEqual(next.id,prior.id);
    assert.notEqual(next.manifest.provenance.draft,true);assert.equal(next.manifest.meta.title,'Firefly Fotomat');
    const before=withoutDraw(prior.source),after=withoutDraw(next.source);
    if(id==='6b37968f4beb675b3f7e6d2d'){
      assert.equal(after,before,'The focused visual repair must preserve all source outside draw, ignoring formatting/comments');
      assert.deepEqual(next.manifest.meta,prior.manifest.meta);assert.deepEqual(next.manifest.audio,prior.manifest.audio);
    }
    jobs.push({jobId:id,from:prior.id,to:next.id,previewMs:job.timings.previewMs,totalMs:job.timings.totalMs,attempts:job.attempts.length,models:job.models,artReused:true,musicReused:true,noNewMediaModelRecorded:true,readyPublication:true,musicHash:(next.manifest.music as {hash?:string})?.hash,nonDraw:{identical:before===after,before:hash(before),after:hash(after)}});
  }
  const matches=[];
  for(const [id,score,outcome,method] of cases){
    const [match]=await store.query('SELECT * FROM matches WHERE id=$1',[id]);
    assert.equal(match.status,'complete');assert.equal(match.record.rounds.length,1);
    const round=match.record.rounds[0],version=await store.version(round.versionId);
    assert.equal(version.id,jobs[cases.findIndex(c=>c[0]===id)<3?0:1].to);
    assert.equal(round.records.length,1);assert.equal(round.records[0].score,score);assert.equal(round.records[0].outcome,outcome);
    assert.equal(round.records[0].metrics.length,0);
    const vm=await Sandbox.create(version.code,await store.runtime(version)),feedback:any[]=[];
    try{const replay=new ReplayRunner(vm,round);while(replay.status.tick<round.status.tick){replay.step();feedback.push(...replay.status.feedback);}assert.equal(replay.verify(),true);}finally{vm.dispose();}
    const results=await store.query('SELECT * FROM results WHERE match_id=$1',[id]);assert.equal(results.length,1);assert.equal(results[0].score,score);
    const p=round.records[0],presses=round.journal.flatMap((j:any)=>j.edges?.[p.playerId]??[]).filter((e:any)=>e.down);
    assert.equal(feedback.filter(f=>f.kind==='hit').length,score);
    if(score===0)assert.equal(presses.length,0);
    matches.push({matchId:id,method,versionId:version.id,challengeId:match.challenge_id,seed:round.seed,seconds:round.status.time,replayExact:true,score,outcome,controllers:p.controllers,inputMethods:p.inputMethods,presses:presses.length,shots:feedback.filter(f=>f.kind==='shot').length,misses:feedback.filter(f=>f.kind==='miss').length,providerOpportunities:p.metrics.length});
  }
  for(const [a,b] of [[0,1],[4,5]]){assert.equal(matches[a].challengeId,matches[b].challengeId);assert.equal(matches[a].seed,matches[b].seed);}
  const report={at:new Date().toISOString(),method:'Two live model remixes submitted through normal creation UI, followed by immediate IAB play and reopening from the saved library in a separate Chrome guest. No application rebuild/restart/HMR or manual generated-source edit between submission and first play/reopening. Ordinary Space taps, no injected semantic action or internal-state mutation. Offline audit follows a clean app shutdown.',claims:{keyboardSuccessAndFailure:true,layout390x844:true,heldSteeringVerified:false,multitouchVerified:false,audibleQualityVerified:false,genuineHumansMeasured:false},jobs,matches};
  await mkdir('evidence/generation',{recursive:true});await writeFile('evidence/generation/firefly-repair-report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({jobs:jobs.length,matches:matches.length,exactReplays:matches.length,onlyDrawChanged:jobs[1].nonDraw.identical,results:matches.map(m=>({match:m.matchId,score:m.score,outcome:m.outcome}))}));
}finally{await store.close();}
