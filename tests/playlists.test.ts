import test from 'node:test';import assert from 'node:assert/strict';
import {selectPlaylist} from '../server/playlists';import type {Manifest} from '../server/store';
import {effectiveMode,participantCounts} from '../shared/party';
const game=(id:string,players:number[],clock='realtime',modifiers:string[]=[],draft=false)=>({id,meta:{players,clock,modifiers,duration:15,tags:['space'],controls:{directions:true,action:'Fire'}},provenance:{draft}} as unknown as Manifest);
test('random playlists are reproducible, ordered independently of the library query, and compatible',()=>{
  const library=[game('a',[2,4]),game('b',[1,1],'realtime',['race','obstruction']),game('c',[1,1]),game('d',[2,2],'action'),game('e',[2,4],'realtime',[],true)];
  const settings={targetPlayers:3,mode:'native'},selection=selectPlaylist(library,settings,{seed:123,count:12});
  assert.deepEqual(selection.pool,['a','b']);assert.deepEqual(selectPlaylist([...library].reverse(),settings,{seed:123,count:12}),selection);
  assert.deepEqual(selectPlaylist(library,{targetPlayers:2,mode:'obstruction'},{seed:3}).versions,['b']);
  assert.throws(()=>selectPlaylist(library,settings,{seed:2,clock:'action'}),/No finished games/);
  assert.throws(()=>selectPlaylist(library,settings,{seed:2,minDuration:30,maxDuration:10}));
});
test('random constraints cover controls, duration and any selected family with a pinned selection context',()=>{
  const a=game('a',[2,4]),b=game('b',[2,4]),c=game('c',[2,4]);
  a.meta.controls.directions=false;b.meta.duration=40;b.meta.tags=['memory'];c.meta.duration=10;c.meta.tags=['timing'];
  const settings={targetPlayers:2,mode:'native'};
  assert.deepEqual(selectPlaylist([a,b,c],settings,{seed:4,controls:'action-only'}).versions,['a']);
  assert.deepEqual(selectPlaylist([a,b,c],settings,{seed:4,controls:'directions',minDuration:20,maxDuration:60,tags:['memory','space']}).versions,['b']);
  assert.deepEqual(selectPlaylist([a,b,c],settings,{seed:4}).party,settings);
  assert.throws(()=>selectPlaylist([a],settings,{seed:4,controls:'directions'}),/No finished games/);
});
test('party compatibility rejects invalid wrapper declarations and unsupported player counts',()=>{
  const solo=game('solo',[1,1],'realtime',['race','obstruction']),multi=game('multi',[2,4],'realtime',['obstruction']),turn=game('turn',[1,1],'action',['race']);
  assert.equal(effectiveMode(solo.meta,2,'native'),'race');
  assert.equal(effectiveMode(solo.meta,1,'obstruction'),null);
  assert.equal(effectiveMode(multi.meta,3,'obstruction'),null);
  assert.equal(effectiveMode(turn.meta,2,'race'),null);
  assert.deepEqual(participantCounts([solo,multi],'native'),[2,3,4]);
  assert.deepEqual(participantCounts([solo,game('pair',[2,2])],'native'),[2]);
});
