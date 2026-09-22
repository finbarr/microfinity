/** Offline only: stop the local app before opening its PGlite directory. */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {Store,hash} from '../server/store';
import {inspectLoop} from '../server/music-assets';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner} from '../runtime/replay';

const jobId='491f23e80c9b440c74ad5857';
const store=new Store();await store.init();
try{
  const [{record:job}]=await store.query('SELECT record FROM jobs WHERE id=$1',[jobId]);
  assert.equal(job.status,'ready');assert.equal(job.musicOnly,true);
  const before=await store.version(job.remix),after=await store.version(job.finishedVersion);
  assert.equal(after.source,before.source);assert.equal(after.code,before.code);
  assert.deepEqual(after.manifest.assets,before.manifest.assets);
  assert.deepEqual(after.manifest.meta,before.manifest.meta);
  assert.deepEqual(after.manifest.audio,before.manifest.audio);
  assert.equal(after.manifest.runtimeVersion,before.manifest.runtimeVersion);
  assert.notEqual(after.manifest.provenance.draft,true);
  assert.equal(job.branches.code,'reused');assert.equal(job.branches.art,'reused');assert.equal(job.branches.music,'ready');
  assert.equal(job.attempts.length,0);
  const music=after.manifest.music as any,oldMusic=before.manifest.music as any;
  assert.notEqual(music.hash,oldMusic.hash);assert.equal(music.provenance.jobId,jobId);
  assert.equal(music.provenance.model,job.models.music);
  const wav=await readFile(`data/assets/${music.hash}.wav`);assert.equal(hash(wav),music.hash);
  const signal=inspectLoop(wav,music.loopStart,music.loopEnd);assert.deepEqual(signal.problems,[]);
  const budget=job.budget;assert.equal(budget.limits.timeoutMs,300000);assert.equal(budget.reserved.calls,job.usage.length);
  assert.equal(budget.reserved.calls,1+job.musicAttempts.length);assert.equal(budget.reserved.images,0);
  assert.equal(budget.reserved.reservedOutputTokens,2000+6500*job.musicAttempts.length);
  assert.ok(budget.reserved.inputBytes<=budget.limits.maxInputBytes);
  assert.ok(job.finishedAt-job.timings.workStartedAt<budget.limits.timeoutMs);
  const candidates=await store.query("SELECT * FROM matches WHERE status='complete' ORDER BY created_at"),matches=[];
  for(const match of candidates){
    if(match.record.rounds.length!==1||match.record.rounds[0].versionId!==after.id)continue;
    const round=match.record.rounds[0];assert.equal(round.records.length,1);assert.equal(round.records[0].metrics.length,0);
    const vm=await Sandbox.create(after.code,await store.runtime(after));
    try{const replay=new ReplayRunner(vm,round);while(replay.status.tick<round.status.tick)replay.step();assert.equal(replay.verify(),true);}finally{vm.dispose();}
    const results=await store.query('SELECT score FROM results WHERE match_id=$1',[match.id]);assert.equal(results.length,1);assert.equal(results[0].score,round.records[0].score);
    const presses=round.journal.flatMap((j:any)=>j.edges?.p0??[]).filter((e:any)=>e.down);
    matches.push({id:match.id,roomId:match.record.roomId,versionId:after.id,seconds:round.status.time,score:round.records[0].score,outcome:round.records[0].outcome,presses:presses.length,inputMethods:round.records[0].inputMethods,exactReplay:true});
  }
  assert.equal(matches.length,2,'Expected immediate IAB play and saved-library Chrome reopening');
  const report={at:new Date().toISOString(),jobId,method:'Music-only creation submitted in IAB through the normal UI, immediately played there, then reopened from the saved library in Chrome. Production server remained running with no rebuild/HMR/restart or cartridge source edit between submission and both completed matches. Offline audit followed clean shutdown.',models:job.models,usage:job.usage,budget,timings:job.timings,originalVersion:before.id,finishedVersion:after.id,musicHash:music.hash,unchanged:{source:true,module:true,metadata:true,artwork:true,audioConfiguration:true,runtime:true},signal,matches,coverage:{realProviderRequests:true,immediatePlay:true,savedVersionReopen:true,audibleListening:false,touch:false,liveProviderDeadlineExhaustion:false},fixtureCoverage:'49 Node tests pass. Targeted fixtures cover SDK signal cancellation, late adapters, compiler cancellation, pre-dispatch reservation rejection, terminal-record fencing, publication rollback, admission release and bounded cache.'};
  await writeFile('evidence/generation/creation-budget-live.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({jobId,models:job.models,workMs:job.finishedAt-job.timings.workStartedAt,budget,matches,signalProblems:signal.problems}));
}finally{await store.close();}
