/** Offline only: stop the local app before opening its PGlite directory. */
import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
import {Store} from '../server/store';import {Sandbox} from '../runtime/sandbox';import {ReplayRunner} from '../runtime/replay';
const cases=[['5d80b95c778dff295c4c7b92',2,'success'],['97e39e2f622d508c2350a4ea',0,'failure'],['92da6529d16da0861978f26a',0,'failure'],['441e9b11d4c200379d1c28a4',4,'success'],['95f43ad93b455b76ecb5f9fd',0,'failure'],['4e836ea9e93ee778ce7bc870',3,'success']] as const;
const store=new Store();await store.init();
try{
 const matches:any[]=[];
 for(const [id,score,outcome] of cases){
  const [match]=await store.query('SELECT * FROM matches WHERE id=$1',[id]);assert.equal(match.status,'complete');assert.equal(match.record.rounds.length,1);
  const round=match.record.rounds[0],version=await store.version(round.versionId),vm=await Sandbox.create(version.code,await store.runtime(version)),feedback:any[]=[];
  try{const replay=new ReplayRunner(vm,round);while(replay.status.tick<round.status.tick){replay.step();feedback.push(...replay.status.feedback);}assert.equal(replay.verify(),true);}finally{vm.dispose();}
  assert.equal(round.records[0].score,score);assert.equal(round.records[0].outcome,outcome);
  assert.ok(round.records.every((p:any)=>p.metrics.length===0));
  const results=await store.query('SELECT * FROM results WHERE match_id=$1',[id]);assert.equal(results.length,2);
  const players=round.records.map((p:any)=>({playerId:p.playerId,guestId:p.guestId,score:p.score,outcome:p.outcome,controllers:p.controllers,inputMethods:p.inputMethods,presses:round.journal.flatMap((j:any)=>j.edges?.[p.playerId]??[]).filter((e:any)=>e.down).length,shots:feedback.filter(f=>f.kind==='shot'&&f.playerId===p.playerId).length,rejected:p.network.rejected}));
  if(id===cases[0][0]){assert.equal(players[0].presses,52);assert.ok(players[0].shots>0);assert.equal(players[1].presses,0);const old=await store.version('4820a4f8b2c41a9a0b93c40354bd0b9912d1191e836fdc8a4087b36d77661398');assert.notEqual(old.id,version.id);assert.deepEqual(old.manifest.assets,version.manifest.assets);assert.deepEqual(old.manifest.music,version.manifest.music);}
  matches.push({matchId:id,game:version.manifest.meta.title,versionId:version.id,challengeId:match.challenge_id,seed:round.seed,seconds:round.status.time,replayExact:true,players});
 }
 for(const [a,b] of [[1,3],[4,5]]){assert.equal(matches[a].challengeId,matches[b].challengeId);assert.equal(matches[a].versionId,matches[b].versionId);assert.equal(matches[a].seed,matches[b].seed);}
 const presentationCorrections=[];
 for(const [oldId,newId,total] of [['ff400d65cc68de19e6f7312b38ff2eccbd8109bac9ddd6aaa7773854c2961bed','d0ba3ceb14c3bd30bccc88b3efa492e58badc6337f88f7d3ec4250f4f0d80474',3],['89ccd9f235b84f7018892b9a9ed24952246733de72970b5faf6c6a382192a0bb','6fe34d10cc65955cf788be157432181f037f991bb5e7259e21296e1b6122ed1e',4]] as const){
  const old=await store.version(oldId),version=await store.version(newId);
  assert.equal(version.source,old.source.replace('${v.round+1}',`\u0024{Math.min(v.round+1,${total})}`));
  const vm=await Sandbox.create(version.code,await store.runtime(version));let label='';
  try{let status=vm.call('init',{seed:7,difficulty:0,players:[{id:'p0',name:'A',color:'#86efac'}]});while(!status.done)status=vm.call('step',{});label=vm.call('draw',vm.call('observe','p0').game).find((c:any)=>c.op==='text'&&String(c.args[0]).includes('/'+total))?.args[0];assert.ok(label.includes(`${total}/${total}`));}finally{vm.dispose();}
  presentationCorrections.push({game:version.manifest.meta.title,oldVersion:oldId,newVersion:newId,onlyDrawLabelChanged:true,finishedLabel:label});
 }
 const report={at:new Date().toISOString(),method:'Ordinary CUA keyboard input in two independent browser guests. Asteroid uses quick Space taps against an idle seat. Odd Snack and Cup success runs use choices learned from visible post-match replay frames, then perform ordinary keys at visible chooser roles. Failed visual-reaction and late-start attempts are preserved. No internal live state, direct semantic action or future seed was injected.',claims:{keyboardWinLossPaths:true,memorizedFixedChallenges:['Odd Snack Out','Cup Shuffle'],freshVisualReactionVerified:false,heldSteeringVerified:false,multitouchVerified:false,audibleQualityVerified:false,genuineHumansMeasured:false},matches,presentationCorrections};
 await mkdir('evidence/gameplay',{recursive:true});await writeFile('evidence/gameplay/keyboard-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({matches:matches.length,exactReplays:matches.length,games:[...new Set(matches.map(m=>m.game))],asteroidShots:matches[0].players[0].shots}));
}finally{await store.close();}
