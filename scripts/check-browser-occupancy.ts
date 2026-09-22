/** Offline only: stop the app before opening its PGlite directory. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {Store} from '../server/store';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner} from '../runtime/replay';
const cases=[['6e002e52c56a3bdf01098f36',4],['ae133d2dd08048d79215d622',2],['f6cadfe50c11a45191b0998e',1]] as const;
const store=new Store();await store.init();
function percentiles(values:number[]){const s=[...values].sort((a,b)=>a-b);return {samples:s.length,p50:s[Math.floor(s.length*.5)]??null,p95:s[Math.floor(s.length*.95)]??null,max:s.at(-1)??null};}
try{
  const matches=[];
  for(const [id,humanCount] of cases){
    const [match]=await store.query('SELECT * FROM matches WHERE id=$1',[id]);assert.equal(match.status,'complete');assert.equal(match.record.rounds.length,1);
    const humans=match.record.participants.filter((p:any)=>p.controller==='human'),bots=match.record.participants.filter((p:any)=>p.controller==='jev');
    assert.equal(humans.length,humanCount);assert.equal(new Set(humans.map((p:any)=>p.guestId)).size,humanCount);assert.equal(bots.length,4-humanCount);
    const round=match.record.rounds[0],version=await store.version(round.versionId),vm=await Sandbox.create(version.code,await store.runtime(version));
    try{const replay=new ReplayRunner(vm,round);replay.seek(round.status.tick);assert.equal(replay.verify(),true);}finally{vm.dispose();}
    assert.equal((await store.query('SELECT id FROM results WHERE match_id=$1',[id])).length,4);
    const players=round.records.map((p:any)=>{
      const human=humans.some((h:any)=>h.playerId===p.playerId),metrics=p.metrics;
      const presses=round.journal.flatMap((j:any)=>j.edges?.[p.playerId]??[]).filter((e:any)=>e.down).length;
      if(human){assert.equal(metrics.length,0);assert.ok(presses>0);assert.deepEqual(p.controllers,['human']);assert.deepEqual(p.inputMethods,['keyboard']);}
      else{assert.ok(metrics.some((m:any)=>m.source==='jev'&&m.model));assert.ok(p.controllers.includes('jev'));}
      const boundaries=metrics.map((m:any)=>m.opportunity);assert.ok(boundaries.every((b:number)=>b%200===0));
      const completed=metrics.filter((m:any)=>m.started!==undefined&&m.finished!==undefined);
      for(let i=1;i<completed.length;i++)assert.ok(completed[i].started>=completed[i-1].finished,'One outstanding decision per seat');
      return {playerId:p.playerId,guestId:p.guestId,human,score:p.score,outcome:p.outcome,controllers:p.controllers,inputMethods:p.inputMethods,presses,opportunities:metrics.length,requestsStarted:metrics.filter((m:any)=>m.started!==undefined).length,jevResponses:metrics.filter((m:any)=>m.source==='jev').length,scriptedFallbacks:metrics.filter((m:any)=>m.source==='scripted').length,skippedOutstanding:metrics.filter((m:any)=>m.skipped==='outstanding').length,stale:metrics.filter((m:any)=>m.stale).length,errors:metrics.filter((m:any)=>m.error).map((m:any)=>m.error),models:[...new Set(metrics.map((m:any)=>m.model).filter(Boolean))],latencyMs:percentiles(metrics.filter((m:any)=>m.source==='jev').map((m:any)=>m.latencyMs)),rejected:p.network.rejected};
    });
    matches.push({matchId:id,challengeId:match.challenge_id,definition:match.record.definition,versionId:version.id,seed:round.seed,connectedBrowsers:humanCount,jevSeats:4-humanCount,replayExact:true,players});
  }
  for(const match of matches.slice(1)){assert.equal(match.challengeId,matches[0].challengeId);assert.equal(match.seed,matches[0].seed);assert.deepEqual(match.definition,matches[0].definition);}
  const report={at:new Date().toISOString(),method:'Four CUA-controlled browser tabs with distinct persisted guests: Chrome and IAB, each using localhost and 127.0.0.1 as separate origin storage. All connect to the same backend and use ordinary Space key events. The two 127.0.0.1 tabs close before the two-browser rematch; Chrome localhost leaves before the one-browser rematch. Both browser products use Chromium. No protocol-only seats, simulated provider responses, internal-state injection or genuine-human performance claim.',scheduledIntervalMs:200,pinnedChallengeIdentical:true,matches};
  await mkdir('evidence/party',{recursive:true});await writeFile('evidence/party/browser-occupancy.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(matches.map(m=>({matchId:m.matchId,browsers:m.connectedBrowsers,jevSeats:m.jevSeats,exact:m.replayExact,players:m.players.map((p:any)=>({id:p.playerId,human:p.human,score:p.score,presses:p.presses,requests:p.requestsStarted,jevResponses:p.jevResponses,fallbacks:p.scriptedFallbacks,latency:p.latencyMs}))}))));
}finally{await store.close();}
