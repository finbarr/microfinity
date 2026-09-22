import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../server/store';import {Room} from '../server/rooms';import {getMatch,listMatches} from '../server/matches';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
class Socket{readyState=1;bufferedAmount=0;messages:any[]=[];send(s:string){this.messages.push(JSON.parse(s));}close(){this.readyState=3;}}
const until=async(predicate:()=>boolean)=>{const end=performance.now()+8000;while(!predicate()&&performance.now()<end)await new Promise(r=>setTimeout(r,20));assert.ok(predicate(),'room reached expected phase');};
test('interrupted parties retain member-only summaries without partial scores or recordings',async()=>{
  const root=await mkdtemp(join(tmpdir(),'microfinity-summary-'));let store=new Store(root,''),room:Room|undefined;
  try{
    await store.init();const [host,friend,owner]=await Promise.all(['Host','Friend','Challenge author'].map(name=>store.guest(undefined,name)));
    const source=await readFile('games/toast-catch.ts','utf8'),code=await compile(source),vm=await Sandbox.create(code,await bootstrap()),meta=vm.call('meta').meta;vm.dispose();const version=await store.putVersion(source,code,meta);
    await store.query('INSERT INTO challenges(id,owner_id,title,definition) VALUES($1,$2,$3,$4)',['shared-challenge',owner.id,'Shared',JSON.stringify({versions:[version.id]})]);
    room=new Room(store,host.id,[version],{targetPlayers:2,botType:'scripted'});room.challengeId='shared-challenge';const a=new Socket(),b=new Socket();
    await room.join(host,a as any);await room.join(friend,b as any);await room.message(b as any,{type:'ready'});await room.message(a as any,{type:'start'});const matchId=room.matchId;
    await assert.rejects(()=>getMatch(store,matchId,friend.id),/only to members/);
    const [initial]=await store.query('SELECT record FROM matches WHERE id=$1',[matchId]);assert.equal(initial.record.participants.length,2);assert.deepEqual(initial.record.rounds,[]);assert.equal(initial.record.activeRound,undefined);
    await room.message(a as any,{type:'loaded',versionId:version.id});await room.message(b as any,{type:'loaded',versionId:version.id});await until(()=>room!.phase==='playing');
    const [during]=await store.query('SELECT record FROM matches WHERE id=$1',[matchId]);assert.deepEqual(during.record,initial.record,'live frames do not create durable recordings');
    await room.close();const match=await getMatch(store,matchId,friend.id);assert.equal(match.status,'interrupted');assert.equal(match.record.termination.kind,'interrupted');assert.deepEqual(match.record.rounds,[]);assert.equal((await store.query('SELECT * FROM results')).length,0);
    assert.ok((await listMatches(store,friend.id)).some(m=>m.id===matchId));assert.equal((await listMatches(store,owner.id)).length,0);await assert.rejects(()=>getMatch(store,matchId,owner.id),/only to members/);
    await store.query('INSERT INTO matches(id,challenge_id,status,record) VALUES($1,$2,$3,$4)',['crashed',room.challengeId,'playing',JSON.stringify({...initial.record,termination:null,finishedAt:null})]);
    await store.query("INSERT INTO round_attempts(match_id,round_index,version_id,status) VALUES('crashed',0,$1,'playing')",[version.id]);
    await store.close();store=new Store(root,'');await store.init();const crashed=await getMatch(store,'crashed',host.id);assert.equal(crashed.status,'interrupted');assert.equal(crashed.record.termination.reason,'server-restart');assert.equal((await store.query("SELECT status FROM round_attempts WHERE match_id='crashed'"))[0].status,'interrupted');
    const records=[{playerId:'p0',guestId:host.id,score:1,partition:'group'},{playerId:'p1',guestId:friend.id,score:null,partition:'group'}] as any;
    await assert.rejects(()=>store.finishRound('crashed',0,version.id,records,{...crashed.record,points:{p0:3}}));assert.equal((await store.query("SELECT * FROM results WHERE match_id='crashed'")).length,0,'partial results roll back');assert.deepEqual((await getMatch(store,'crashed',host.id)).record.points,{});
    const legacy={participants:[{playerId:'p0',guestId:host.id,name:'Host'}],rounds:[{versionId:version.id,seed:123,config:{secret:'old'},journal:[{edges:{}}],snapshot:{private:'old'},status:{time:3,reason:'complete'},records:[{playerId:'p0',guestId:host.id,name:'Host',score:5}]}],activeRound:{snapshot:{private:'unfinished'}},points:{p0:3}};
    await store.query("INSERT INTO matches(id,status,record) VALUES('legacy','complete',$1)",[JSON.stringify(legacy)]);
    const summary=await getMatch(store,'legacy',host.id);assert.equal(summary.record.rounds[0].records[0].score,5);for(const word of ['journal','snapshot','activeRound','secret','seed'])assert.ok(!JSON.stringify(summary).includes(word));
  }finally{await room?.close();await store.close();await rm(root,{recursive:true,force:true});}
});
