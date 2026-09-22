import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {Store} from '../server/store';import {playedRatings,rateCartridge,ratingSummaries} from '../server/ratings';
import {compareRatings,summarizeRating} from '../shared/ratings';import type {Metadata} from '../sdk/index';
const meta:Metadata={id:'rated-game',title:'Rated game',instruction:'Go',description:'Rating fixture',players:[1,1],clock:'realtime',participation:'individual',world:'shared',duration:3,style:'pixel',score:{unit:'points',order:'higher'},controls:{directions:false,action:'Go'},tags:[],modifiers:[]};
test('only played completed cartridges are rateable; edits, rematches and new versions preserve one vote',async()=>{
 const root=await mkdtemp(join(tmpdir(),'microfinity-rating-'));let store=new Store(root,'');await store.init();
 try{
  const guest=await store.guest(undefined,'Player'),other=await store.guest(undefined,'Other'),bot=await store.guest(undefined,'Bot owner');
  const version=await store.putVersion('fixture one','fixture',meta),revised=await store.putVersion('fixture two','fixture',meta);
  await assert.rejects(()=>rateCartridge(store,guest.id,{versionId:version.id,stars:5}),/Finish/);
  assert.deepEqual(await playedRatings(store,'unfinished',guest.id),[]);
  await store.finishRound('played',0,version.id,[{playerId:'p0',guestId:guest.id,score:0,partition:'fixture',controllers:['human'],outcome:'failure'}]);
  const first=await rateCartridge(store,guest.id,{versionId:version.id,stars:5});assert.equal(first.summary.average,5);assert.equal(first.summary.count,1);
  await assert.rejects(()=>rateCartridge(store,other.id,{versionId:version.id,stars:5}),/Finish/);
  assert.deepEqual(await playedRatings(store,'played',other.id),[]);
  await store.finishRound('bot-run',0,version.id,[{playerId:'p0',guestId:bot.id,score:50,partition:'fixture',controllers:['jev'],outcome:'success'}]);
  await assert.rejects(()=>rateCartridge(store,bot.id,{versionId:version.id,stars:5}),/Finish/);
  for(const stars of [0,6,2.5,NaN,'5'])await assert.rejects(()=>rateCartridge(store,guest.id,{versionId:version.id,stars}));
  await rateCartridge(store,guest.id,{versionId:version.id,stars:3});await rateCartridge(store,guest.id,{versionId:version.id,stars:3});
  await store.finishRound('other-play',0,version.id,[{playerId:'p0',guestId:other.id,score:2,partition:'fixture',controllers:['human'],outcome:'success'}]);
  assert.equal((await rateCartridge(store,other.id,{versionId:version.id,stars:5})).summary.average,4);
  await assert.rejects(()=>rateCartridge(store,guest.id,{versionId:revised.id,stars:4}),/Finish/);
  await store.finishRound('played',1,revised.id,[{playerId:'p0',guestId:guest.id,score:2,partition:'fixture',controllers:['human'],outcome:'success'}]);
  const update=await rateCartridge(store,guest.id,{versionId:revised.id,stars:4});assert.equal(update.summary.average,4.5);assert.equal(update.summary.count,2);
  const played=await playedRatings(store,'played',guest.id);assert.equal(played.length,1);assert.equal(played[0].versionId,revised.id);assert.equal(played[0].stars,4);
  await store.close();store=new Store(root,'');await store.init();assert.deepEqual((await ratingSummaries(store))[meta.id],summarizeRating(9,2));
  assert.equal((await playedRatings(store,'played',guest.id))[0].stars,4);
 }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
test('top-rated ordering balances star averages with sample size and puts unrated games last',()=>{
 const lone=summarizeRating(5,1),established=summarizeRating(45,10),poor=summarizeRating(10,10);
 assert.equal(lone.average,5);assert.equal(established.average,4.5);assert.ok(compareRatings(established,lone)<0);assert.ok(compareRatings(lone,poor)<0);assert.ok(compareRatings(poor,undefined)<0);assert.equal(compareRatings(undefined,undefined),0);
});
