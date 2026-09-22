/** Offline only: stop the application before opening its PGlite store. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {Store} from '../server/store';
import {gameStats} from '../server/stats';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner} from '../runtime/replay';

const store=new Store();await store.init();
try{
 const cases=[];
 for(const [matchId,partial] of [['18821bf6affeaa1a553f55df',false],['368b8da79f49e04cbb6fd858',true],['80fb7390ada2a81779852517',true]] as const){
  const [match]=await store.query('SELECT * FROM matches WHERE id=$1',[matchId]);
  assert.equal(match.status,'interrupted');assert.equal(match.record.termination.reason,'server-shutdown');
  assert.equal(match.record.rounds.length,partial?0:1);assert.equal(!!match.record.activeRound,partial);
  const scores=await store.query('SELECT score,record FROM results WHERE match_id=$1',[matchId]);assert.equal(scores.length,partial?0:2);
  const [attempt]=await store.query('SELECT * FROM round_attempts WHERE match_id=$1',[matchId]);assert.equal(attempt.status,partial?'interrupted':'complete');
  const round=partial?match.record.activeRound:match.record.rounds[0],version=await store.version(round.versionId);
  const vm=await Sandbox.create(version.code,await store.runtime(version));
  try{const replay=new ReplayRunner(vm,round);replay.seek(round.status.tick);assert.equal(replay.verify(),true);assert.equal(replay.status.done,!partial);}finally{vm.dispose();}
  const replayPlays=await store.query('SELECT * FROM replay_plays WHERE match_id=$1',[matchId]);if(matchId==='368b8da79f49e04cbb6fd858')assert.equal(replayPlays.length,1);
  cases.push({matchId,game:version.manifest.meta.title,partial,recordedSeconds:round.status.time,recordedTicks:round.status.tick,attemptStatus:attempt.status,resultCount:scores.length,uniqueReplayViewers:replayPlays.length,replayExact:true,points:match.record.points});
 }
 const [version]=await store.query("SELECT id FROM versions WHERE game_id='patchwork-pass' ORDER BY created_at DESC LIMIT 1");
 const stats=await gameStats(store,version.id);
 const report={at:new Date().toISOString(),method:'CUA browser host and a practice bot, graceful server shutdown, reload and saved replay. Offline queries check durable state; no separate-browser or human-group claim.',cases,lifecycle:stats.lifecycle};
 await mkdir('evidence/recovery',{recursive:true});await writeFile('evidence/recovery/browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await store.close();}
