import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../server/store';import {Room} from '../server/rooms';import {serverNow} from '../server/network-clock';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';

class Socket {readyState=1;bufferedAmount=0;messages:any[]=[];send(s:string){this.messages.push(JSON.parse(s));}close(){this.readyState=3;}}
test('room serializes starts, transfers host and controller ownership, expires idle rooms, and aborts neutrally',async()=>{
 const root=await mkdtemp(join(tmpdir(),'microfinity-room-')),store=new Store(root,'');let room:Room|undefined;
 try{
  await store.init();const host=await store.guest(undefined,'Host'),friend=await store.guest(undefined,'Friend');
  const source=await readFile('games/toast-catch.ts','utf8'),code=await compile(source),vm=await Sandbox.create(code,await bootstrap());
  const meta=vm.call('meta').meta;vm.dispose();const version=await store.putVersion(source,code,meta);
  room=new Room(store,host.id,[version],{targetPlayers:2,botType:'scripted'});
  assert.equal(room.isExpired(serverNow()+119000),false);assert.equal(room.isExpired(serverNow()+121000),true);
  const a=new Socket(),b=new Socket();await room.join(host,a as any);await room.join(friend,b as any);
  assert.equal(room.isExpired(serverNow()+121000),false);assert.equal(room.isExpired(serverNow()+1801000),true);
  await room.disconnect(a as any);assert.equal(room.hostId,friend.id);assert.equal(room.seats[0].controller,'scripted');
  const oldEpoch=room.seats[0].epoch;await room.join(host,a as any);assert.equal(room.hostId,friend.id);assert.equal(room.seats[0].controller,'human');assert.ok(room.seats[0].epoch>oldEpoch);
  await room.message(a as any,{type:'ready'});await room.message(b as any,{type:'ready'});
  await Promise.all([room.message(b as any,{type:'start'}),room.message(b as any,{type:'start'})]);
  assert.equal((await store.query('SELECT id FROM matches')).length,1);assert.equal(room.phase,'preparing');
  await room.message(a as any,{type:'loaded',versionId:version.id});await room.message(b as any,{type:'loaded',versionId:version.id});
  const deadline=performance.now()+7000;while(room.phase as string!=='playing'&&performance.now()<deadline)await new Promise(r=>setTimeout(r,10));assert.equal(room.phase,'playing');
  assert.equal(room.isExpired(serverNow()+1801000),false,'a connected active game follows its rules deadline');
  await room.message(b as any,{type:'asset-error'});assert.equal(room.phase,'match-result');
  const [record]=await store.query('SELECT status,record FROM matches');assert.equal(record.status,'aborted');assert.equal(record.record.rounds.length,0);assert.equal((await store.query('SELECT * FROM results')).length,0);
  await room.disconnect(a as any);await room.disconnect(b as any);assert.equal(room.isExpired(serverNow()+119000),false);assert.equal(room.isExpired(serverNow()+121000),true);
  await room.close('room-expired');await assert.rejects(()=>room!.join(host,a as any),/closed/);
 }finally{await room?.close();await store.close();await rm(root,{recursive:true,force:true});}
});
