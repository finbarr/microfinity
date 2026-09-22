/** Offline only: stop the local app before opening its PGlite directory. */
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Store} from '../server/store';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner,canonical} from '../runtime/replay';

const matchId='e66e1e5f32b3d6b38ff59535';
const store=new Store();await store.init();
try{
 const [match]=await store.query('SELECT * FROM matches WHERE id=$1',[matchId]);assert.equal(match.status,'complete');
 const round=match.record.rounds[0],version=await store.version(round.versionId);
 const previous=await store.version('429c1564a19e7d85601c32eb6829568b9a2cfdef53859e27917a2aa2cb350447');
 assert.notEqual(version.id,previous.id);assert.deepEqual(version.manifest.assets,previous.manifest.assets);assert.deepEqual(version.manifest.music,previous.manifest.music);
 const vm=await Sandbox.create(version.code,await store.runtime(version)),old=await Sandbox.create(previous.code,await store.runtime(previous));
 const kinds:Record<string,number>={};let visibleHits=0;
 try{
  const replay=new ReplayRunner(vm,round),before=new ReplayRunner(old,round);
  while(replay.status.tick<round.status.tick){
   const view=replay.observe('p0').game;replay.step();before.step();
   assert.deepEqual(replay.status.scores,before.status.scores);assert.deepEqual(replay.status.outcomes,before.status.outcomes);
   for(const event of replay.status.feedback){
    kinds[event.kind]=(kinds[event.kind]??0)+1;
    if(event.kind==='hit'&&event.y>=0){visibleHits++;assert.ok(view.rocks.some((r:any)=>Math.abs(r.x+r.vx/60-event.x)<1e-8&&Math.abs(r.y+r.vy/60-event.y)<1e-8));}
   }
  }
  assert.equal(replay.verify(),true);assert.equal(canonical(vm.call('save')),canonical(old.call('save')));
 }finally{vm.dispose();old.dispose();}
 assert.ok(visibleHits>0);const results=await store.query('SELECT record FROM results WHERE match_id=$1',[matchId]);assert.equal(results.length,2);
 const report={at:new Date().toISOString(),matchId,versionId:version.id,previousVersionId:previous.id,unchangedMedia:true,identicalOldAndNewRulesSnapshot:true,exactReplay:true,kinds,visibleHitsWithCorrectCoordinates:visibleHits,results:results.map(r=>({playerId:r.record.playerId,score:r.record.score,outcome:r.record.outcome,controllers:r.record.controllers,inputMethods:r.record.inputMethods})),browser:{method:'CUA in-app browser, normal Asteroid practice match with one keyboard guest and one scripted bot. Live screenshot showed impact +1 and the score pulse; replay screenshot showed the reaction again. Paused, rewound and finished at 4x with exact-finish confirmation and no captured browser warnings/errors.',roomId:'ff5852a3',independentCanvasFixture:'All four renderer fixture checks passed, including actual canvas pixel changes for a hit and unchanged pixels with reduced motion requested.',reducedMotionSystemSettingChanged:false,audibleQualityVerified:false,multitouchVerified:false},tests:{nodeTests:52,asteroidEpisodes:100,replays:4,restores:4,commands:['npm run check','npm test','npm run build','node --import tsx scripts/episodes.ts asteroid-scramble']}};
 await writeFile('evidence/runtime/feedback-presentation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await store.close();}
