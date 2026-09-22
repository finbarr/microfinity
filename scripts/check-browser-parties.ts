/** Offline only: stop the app before opening its PGlite store. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {Store} from '../server/store';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner} from '../runtime/replay';

const matchIds=['f7ca7241980cc5da23ecbceb','a2f5c62b63c453054a5cf3a0','7c411a7826ca0b3cb31566cc',...process.argv.slice(2)];
const store=new Store();await store.init();
try{
 const matches:any[]=[],reports:any[]=[];
 for(const matchId of matchIds){
  const [match]=await store.query('SELECT * FROM matches WHERE id=$1',[matchId]);matches.push(match);
  assert.equal(match.status,'complete');assert.equal(match.record.termination.reason,'playlist-finished');
  const participants=match.record.participants,humans=participants.filter((p:any)=>p.controller==='human');
  assert.equal(humans.length,2);assert.equal(new Set(humans.map((p:any)=>p.guestId)).size,2);
  assert.equal(participants.filter((p:any)=>p.controller==='jev').length,2);
  const rounds:any[]=[];
  for(const [index,round] of match.record.rounds.entries()){
   const version=await store.version(round.versionId),vm=await Sandbox.create(version.code,await store.runtime(version));
   try{const replay=new ReplayRunner(vm,round);replay.seek(round.status.tick);assert.equal(replay.verify(),true);}finally{vm.dispose();}
   const [attempt]=await store.query('SELECT status FROM round_attempts WHERE match_id=$1 AND round_index=$2',[matchId,index]);assert.equal(attempt.status,'complete');
   const players=round.records.map((p:any)=>{
    const edges=round.journal.flatMap((e:any)=>e.edges?.[p.playerId]??[]);
    if(p.controllers.length===1&&p.controllers[0]==='human')assert.equal(p.metrics.length,0,'No controller requests for a continuously connected browser seat');
    return {playerId:p.playerId,guestId:p.guestId,score:p.score,points:p.points,outcome:p.outcome,controllers:p.controllers,inputMethods:p.inputMethods,recordedEdges:edges.length,recordedPresses:edges.filter((e:any)=>e.down).length,providerCalls:p.metrics.filter((m:any)=>m.started).length,models:[...new Set(p.metrics.map((m:any)=>m.model).filter(Boolean))],rejected:p.network.rejected};
   });
   rounds.push({title:version.manifest.meta.title,versionId:round.versionId,clock:version.manifest.meta.clock,mode:round.mode,seed:round.seed,seconds:round.status.time,replayExact:true,handoffs:round.journal.filter((e:any)=>e.type==='handoff'),players});
  }
  const results=await store.query('SELECT id FROM results WHERE match_id=$1',[matchId]);assert.equal(results.length,rounds.length*4);
  const inputActive=humans.every((p:any)=>rounds.some(r=>r.players.find((q:any)=>q.playerId===p.playerId).recordedPresses>0));
  reports.push({matchId,challengeId:match.challenge_id,participants,points:match.record.points,inputActive,rounds});
 }
 assert.equal(reports[0].inputActive,false);assert.ok(reports.slice(1).every(r=>r.inputActive));
 assert.equal(matches[1].challenge_id,matches[2].challenge_id);assert.deepEqual(matches[1].record.definition,matches[2].record.definition);
 for(const [i,round] of matches[1].record.rounds.entries()){const repeated=matches[2].record.rounds[i];assert.equal(round.versionId,repeated.versionId);assert.equal(round.seed,repeated.seed);assert.equal(round.config.difficulty,repeated.config.difficulty);}
 assert.equal(matches[1].record.participants[0].guestId,matches[2].record.participants[1].guestId);
 assert.equal(matches[1].record.participants[1].guestId,matches[2].record.participants[0].guestId);
 const handoffs=reports[2].rounds[0].handoffs;assert.deepEqual(handoffs.map((h:any)=>[h.player,h.controller]),[['p0','jev'],['p0','human']]);
 const report={at:new Date().toISOString(),method:'CUA controls independent Chrome and Codex in-app browser guests through normal keyboard input and visible DOM role labels. Both are Chromium-family. Offline checks verify accepted journals, results and exact replays. Agent-operated play is not genuine human performance or multitouch evidence.',productionLauncher:'npm start (scripts/start.mjs sets NODE_ENV=production)',inputActiveParties:reports.filter(r=>r.inputActive).length,exploratoryParties:reports.filter(r=>!r.inputActive).length,pinnedChallenge:{id:matches[1].challenge_id,versionsSettingsSeedsIdentical:true,browserSeatsSwapped:true},reconnect:{matchId:matches[2].id,seat:'p0',handoffs,observed:'Chrome reload during Conveyor resumed the same guest seat; host controls transferred to the other connected browser.'},matches:reports};
 await mkdir('evidence/party',{recursive:true});await writeFile('evidence/party/browser-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({inputActiveParties:report.inputActiveParties,exploratoryParties:report.exploratoryParties,exactRounds:reports.reduce((n,m)=>n+m.rounds.length,0),pinnedChallenge:report.pinnedChallenge,reconnect:report.reconnect}));
}finally{await store.close();}
