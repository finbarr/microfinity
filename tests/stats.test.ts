import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {Store} from '../server/store';import {gameStats} from '../server/stats';import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
import {creationStats} from '../server/stats';test('leaderboards isolate rules groups and keep each player best score in the declared direction',async()=>{
 const root=await mkdtemp(join(tmpdir(),'microfinity-stats-')),store=new Store(root,'');await store.init();
 try{const source=await readFile('games/toast-catch.ts','utf8'),code=await compile(source),vm=await Sandbox.create(code,await bootstrap()),meta=vm.call('meta').meta;vm.dispose();
  for(const order of ['higher','lower']){const version=await store.putVersion(source,code,{...meta,score:{...meta.score,order}});
   for(const [index,[guestId,score,partition]] of [['A',10,'human'],['A',20,'human'],['B',15,'human'],['AI',99,'jev']].entries())await store.finishRound(order+'-'+index,0,version.id,[{playerId:'p0',guestId:String(guestId),name:guestId,score:Number(score),partition:String(partition),dimensions:{mode:'native',controllers:[partition]},outcome:'success'}]);
   const stats=await gameStats(store,version.id,'human');assert.equal(stats.partitions.length,2);assert.equal(stats.summary[0].plays,3);assert.equal(stats.leaders.length,2);assert.equal(stats.leaders[0].score,order==='higher'?20:10);assert.equal(stats.leaders[0].record.guestId,'A');assert.ok(!stats.leaders.some(l=>l.score===99));
  }
 }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
test('statistics distinguish completed losses, interruption, control methods, rematches and repairs',async()=>{
 const root=await mkdtemp(join(tmpdir(),'microfinity-metrics-')),store=new Store(root,'');await store.init();
 try{
  const guest=await store.guest(undefined,'Tester'),other=await store.guest(undefined,'Other');
  const source=await readFile('games/toast-catch.ts','utf8'),code=await compile(source),vm=await Sandbox.create(code,await bootstrap()),meta=vm.call('meta').meta;vm.dispose();const version=await store.putVersion(source,code,meta);
  for(const [i,status] of ['complete','complete','aborted','aborted','interrupted','playing'].entries()){
   const record={participants:[{guestId:guest.id}],rounds:i<2?[{records:[{guestId:guest.id}]}]:[],termination:{kind:i===2?'abandoned':i===3?'technical':status},rematchOf:i===1?'metrics-0':null};
   await store.query('INSERT INTO matches(id,status,record) VALUES($1,$2,$3)',['metrics-'+i,status,JSON.stringify(record)]);
   await store.query('INSERT INTO round_attempts(match_id,round_index,version_id,status) VALUES($1,0,$2,$3)',['metrics-'+i,version.id,status]);
  }
  for(const [i,[score,method]] of [[10,['keyboard']],[20,['virtual-pad']],[10,['keyboard','virtual-pad']],[30,[]]].entries())await store.finishRound('metrics-'+i,1,version.id,[{playerId:'p0',guestId:guest.id,name:'Tester',score:score as number,inputMethods:method,partition:'human',outcome:i===3?'success':'failure'}]);
  const stats=await gameStats(store,version.id,'human');assert.equal(stats.summary[0].median_score,15);assert.equal(stats.summary[0].plays,4);assert.equal(stats.summary[0].successes,1);assert.equal(stats.distribution.reduce((n,b)=>n+b.count,0),4);
  assert.deepEqual({...stats.lifecycle,tracked_since:null},{tracked:6,completed:2,active:1,interrupted:1,abandoned:1,technical_failures:1,tracked_since:null});assert.deepEqual(stats.engagement,{completed_parties:2,rematched_parties:1});
  for(const method of ['keyboard','virtual-pad','mixed','none'] as const){const subset=await gameStats(store,version.id,'human',method);assert.equal(subset.summary[0].plays,1);assert.equal(subset.distribution[0].low,subset.distribution[0].high);}
  for(const [id,owner,status,attempts,musicAttempts] of [['a',guest.id,'ready',2,1],['b',guest.id,'failed',3,3],['c',guest.id,'working',0,0],['d',other.id,'ready',3,3]] as const)await store.query('INSERT INTO jobs(id,owner_id,status,record) VALUES($1,$2,$3,$4)',[id,owner,status,JSON.stringify({attempts:Array(attempts).fill({}),musicAttempts:Array(musicAttempts).fill({})})]);
  assert.deepEqual(await creationStats(store,guest.id),{total:3,ready:1,failed:1,working:1,code_repairs:3,repaired_jobs:2,music_repairs:2});
 }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
