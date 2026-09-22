import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../server/store';import {Room} from '../server/rooms';import {getMatch,listMatches,recordReplayPlay} from '../server/matches';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';import {ReplayRunner} from '../runtime/replay';
class Socket{readyState=1;bufferedAmount=0;messages:any[]=[];send(s:string){this.messages.push(JSON.parse(s));}close(){this.readyState=3;}}
test('periodic checkpoints survive interruption, remain private to match members and never award partial scores',async()=>{
  const root=await mkdtemp(join(tmpdir(),'microfinity-checkpoint-'));let store=new Store(root,''),room:Room|undefined;
  try{
    await store.init();const [host,friend,owner]=await Promise.all(['Host','Friend','Challenge author'].map(name=>store.guest(undefined,name)));
    const source=await readFile('games/toast-catch.ts','utf8'),code=await compile(source),vm=await Sandbox.create(code,await bootstrap()),meta=vm.call('meta').meta;vm.dispose();const version=await store.putVersion(source,code,meta);
    await store.query('INSERT INTO challenges(id,owner_id,title,definition) VALUES($1,$2,$3,$4)',['shared-challenge',owner.id,'Shared',JSON.stringify({versions:[version.id]})]);
    room=new Room(store,host.id,[version],{targetPlayers:2,botType:'scripted'});room.challengeId='shared-challenge';const a=new Socket(),b=new Socket();
    await room.join(host,a as any);await room.join(friend,b as any);await room.message(b as any,{type:'ready'});await room.message(a as any,{type:'start'});const matchId=room.matchId;
    await assert.rejects(()=>getMatch(store,matchId,friend.id),/only to members/);
    const [initial]=await store.query('SELECT record FROM matches WHERE id=$1',[matchId]);assert.equal(initial.record.participants.length,2);assert.equal(initial.record.activeRound.status.tick,0);
    await room.message(a as any,{type:'loaded',versionId:version.id});await room.message(b as any,{type:'loaded',versionId:version.id});
    let periodic:any;const deadline=performance.now()+10000;while(performance.now()<deadline){[periodic]=await store.query('SELECT record FROM matches WHERE id=$1',[matchId]);if(periodic.record.activeRound?.status.tick>0)break;await new Promise(r=>setTimeout(r,80));}
    assert.ok(periodic.record.activeRound.status.tick>0);assert.ok(periodic.record.activeRound.checkpointAt>initial.record.activeRound.checkpointAt);
    assert.equal(a.messages.find(m=>m.type==='state'&&m.phase==='playing').activeRound,undefined,'hidden checkpoint is not broadcast');
    await room.close();const match=await getMatch(store,matchId,friend.id);assert.equal(match.status,'interrupted');assert.equal(match.record.termination.kind,'interrupted');assert.equal(match.record.rounds.length,0);assert.equal((await store.query('SELECT * FROM results')).length,0);
    assert.ok((await listMatches(store,friend.id)).some(m=>m.id===matchId));assert.equal((await listMatches(store,owner.id)).length,0);await assert.rejects(()=>getMatch(store,matchId,owner.id),/only to members/);
    await recordReplayPlay(store,matchId,friend.id);await recordReplayPlay(store,matchId,friend.id);assert.equal((await store.query('SELECT * FROM replay_plays')).length,1);
    await store.query('INSERT INTO matches(id,challenge_id,status,record) VALUES($1,$2,$3,$4)',['crashed',room.challengeId,'playing',JSON.stringify({...periodic.record,termination:null,finishedAt:null})]);
    await store.query("INSERT INTO round_attempts(match_id,round_index,version_id,status) VALUES('crashed',0,$1,'playing')",[version.id]);
    await store.close();store=new Store(root,'');await store.init();const crashed=await getMatch(store,'crashed',host.id);assert.equal(crashed.status,'interrupted');assert.equal(crashed.record.termination.reason,'server-restart');assert.equal((await store.query("SELECT status FROM round_attempts WHERE match_id='crashed'"))[0].status,'interrupted');
    for(const round of [match.record.activeRound,crashed.record.activeRound]){const vm=await Sandbox.create(code,await store.runtime(version));try{const replay=new ReplayRunner(vm,round);replay.seek(round.status.tick);assert.equal(replay.verify(),true);assert.equal(replay.status.done,false);}finally{vm.dispose();}}
    const records=[{playerId:'p0',guestId:host.id,score:1,partition:'group'},{playerId:'p1',guestId:friend.id,score:null,partition:'group'}] as any;
    await assert.rejects(()=>store.finishRound('crashed',0,version.id,records,{...crashed.record,points:{p0:3}}));assert.equal((await store.query("SELECT * FROM results WHERE match_id='crashed'")).length,0,'partial results roll back');assert.deepEqual((await getMatch(store,'crashed',host.id)).record.points,{});
  }finally{await room?.close();await store.close();await rm(root,{recursive:true,force:true});}
});
