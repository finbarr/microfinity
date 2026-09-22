/** Offline: stop the app before opening its PGlite database. */
import assert from 'node:assert/strict';import {writeFile} from 'node:fs/promises';import {Store} from '../server/store';import {Sandbox} from '../runtime/sandbox';import {ReplayRunner} from '../runtime/replay';
const store=new Store();await store.init();
try{
 const matches=await store.query("SELECT id,status,record FROM matches WHERE status='complete' ORDER BY created_at DESC LIMIT 10");let found:any;
 for(const match of matches){if(match.record.rounds.length!==2||match.record.participants.length!==4)continue;
  const versions=await Promise.all(match.record.rounds.map((r:any)=>store.version(r.versionId)));if(versions.map(v=>v.manifest.gameId).join(',')!=='nose-dive,crawl-for-gold')continue;
  const rounds=[];
  for(let i=0;i<2;i++){const round=match.record.rounds[i],version=versions[i],vm=await Sandbox.create(version.code,await store.runtime(version));
   try{const replay=new ReplayRunner(vm,round);replay.seek(round.status.tick);assert.equal(replay.verify(),true);}finally{vm.dispose();}
   assert.equal(round.records[0].metrics.length,0,'No Jev decisions for the connected browser');
   const players=round.records.map((p:any)=>({id:p.playerId,score:p.score,outcome:p.outcome,controllers:p.controllers,inputMethods:p.inputMethods,jevResponses:p.metrics.filter((m:any)=>m.source==='jev').length,fallbacks:p.metrics.filter((m:any)=>m.source==='scripted').length,models:[...new Set(p.metrics.map((m:any)=>m.model).filter(Boolean))],contextVersions:[...new Set(p.metrics.map((m:any)=>m.contextVersion).filter(Boolean))],presses:round.journal.flatMap((j:any)=>j.edges?.[p.playerId]??[]).filter((e:any)=>e.down).length}));
   for(const p of players.slice(1)){assert.ok(p.jevResponses>0);assert.deepEqual(p.contextVersions,['rules-v4']);}
   rounds.push({game:version.manifest.gameId,version:version.id,replayExact:true,seconds:round.status.time,players});
  }
  found={at:new Date().toISOString(),roomId:'55b06b2c',matchId:match.id,method:'CUA in-app browser: one connected browser, three live Jev seats, ordinary keyboard tap in crawl, original 640x400 scenes inspected at desktop and 390x844 viewport. No internal browser-state injection. Exact saved-round replays. Phone layout is not physical touch evidence.',rounds};break;
 }
 assert.ok(found,'Expected the completed four-seat two-game browser party');await writeFile('evidence/party/new-games-browser.json',JSON.stringify(found,null,2));console.log(JSON.stringify(found,null,2));
}finally{await store.close();}
