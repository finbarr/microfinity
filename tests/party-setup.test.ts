import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Store} from '../server/store';import {Room} from '../server/rooms';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
class Socket {readyState=1;bufferedAmount=0;messages:any[]=[];send(s:string){this.messages.push(JSON.parse(s));}close(){this.readyState=3;}}

test('lobby bot ownership, queue revisions and generation phase preserve pinned challenges',async()=>{
  const root=await mkdtemp(join(tmpdir(),'microfinity-party-')),store=new Store(root,'');const rooms:Room[]=[];
  try{
    await store.init();const host=await store.guest(undefined,'Host'),friend=await store.guest(undefined,'Friend'),third=await store.guest(undefined,'Third');
    const versions=[];for(const name of ['toast-catch','asteroid-scramble']){const source=await readFile(`games/${name}.ts`,'utf8'),code=await compile(source),vm=await Sandbox.create(code,await bootstrap());const meta=vm.call('meta').meta;vm.dispose();versions.push(await store.putVersion(source,code,meta));}
    const [toast,asteroid]=versions,room=new Room(store,host.id,[toast],{targetPlayers:2,botType:'scripted',botTypes:['scripted','jev']});rooms.push(room);
    const a=new Socket(),b=new Socket(),c=new Socket();await room.join(host,a as any);
    assert.equal(room.seats.length,2);assert.equal(room.seats[1].controller,'jev');
    await room.message(a as any,{type:'bot-controller',playerId:'p1',controller:'scripted'});assert.deepEqual(room.settings.botTypes,['scripted','scripted']);
    await room.join(friend,b as any);assert.equal(room.seats[1].controller,'human');assert.equal(room.seats.length,2);
    await assert.rejects(()=>room.message(b as any,{type:'add-bot'}),/Only the host/);
    await assert.rejects(()=>room.message(a as any,{type:'remove-bot',playerId:'p1'}),/empty bot seat/);
    await assert.rejects(()=>room.message(a as any,{type:'bot-controller',playerId:'p0',controller:'jev'}),/empty bot seat/);
    await room.message(a as any,{type:'add-bot'});assert.equal(room.seats.length,3);
    await room.message(a as any,{type:'remove-bot',playerId:'p2'});assert.equal(room.seats.length,2);
    await assert.rejects(()=>room.message(a as any,{type:'playlist',revision:room.revision-1,versions:[asteroid.id]}),/setup changed/);
    await room.message(b as any,{type:'ready'});const rev=room.revision;
    await room.message(a as any,{type:'playlist',revision:rev,versions:[asteroid.id,toast.id]});assert.deepEqual(room.versions.map(v=>v.id),[asteroid.id,toast.id]);assert.equal(room.seats[1].ready,false);
    await room.message(a as any,{type:'creating',active:true});assert.equal(a.messages.at(-1).creating,true);
    await assert.rejects(()=>room.message(a as any,{type:'start'}),/Return from game creation/);
    await room.message(a as any,{type:'creating',active:false});await room.message(b as any,{type:'ready'});
    await room.message(a as any,{type:'start'});const original=room.challengeId;
    await assert.rejects(()=>room.message(a as any,{type:'add-bot'}),/only change in the lobby/);
    await room.message(a as any,{type:'asset-error'});assert.equal(room.phase,'match-result');
    await room.message(a as any,{type:'edit-party'});assert.equal(room.phase,'lobby');assert.equal(room.matchId,'');assert.equal(room.challengeId,original);
    await room.message(a as any,{type:'playlist',revision:room.revision,versions:[toast.id]});assert.equal(room.challengeId,'');
    await room.disconnect(b as any);assert.equal(room.seats[1].controller,'scripted');
    await room.message(a as any,{type:'remove-bot',playerId:'p1'});assert.equal(room.seats.length,1);
    await room.message(a as any,{type:'playlist',revision:room.revision,versions:[asteroid.id,toast.id]});assert.equal(room.seats.length,1,'the lobby holds human places until start');
    await room.message(a as any,{type:'start'});assert.equal(room.seats.length,2,'a game needing an opponent adds AI at start');assert.notEqual(room.challengeId,original);
    const [saved]=await store.query('SELECT definition FROM challenges WHERE id=$1',[original]);assert.deepEqual(saved.definition.versions,[asteroid.id,toast.id]);assert.deepEqual(saved.definition.settings.botTypes,['scripted','scripted']);
    await room.message(a as any,{type:'asset-error'});await room.message(a as any,{type:'edit-party'});
    await room.join(friend,b as any);await room.message(a as any,{type:'add-bot'});await room.join(third,c as any);
    await room.message(a as any,{type:'creating',active:true});await room.disconnect(a as any);assert.equal(room.creating,false);assert.equal(room.hostId,friend.id);
    await room.message(b as any,{type:'remove-bot',playerId:'p0'});assert.equal(room.seats[0].guestId,friend.id);assert.equal(b.messages.at(-1).playerId,'p0');assert.equal(c.messages.at(-1).playerId,'p1');
    const incompatible=new Room(store,host.id,[toast],{targetPlayers:2,mode:'pressure',botType:'scripted'});rooms.push(incompatible);const d=new Socket();await incompatible.join(host,d as any);
    await incompatible.message(d as any,{type:'playlist',revision:incompatible.revision,versions:[asteroid.id]});assert.equal(incompatible.versions[0].id,asteroid.id);
    await incompatible.message(d as any,{type:'start'});assert.equal(d.messages.at(-1).mode,'party-v1','legacy mode preference cannot exclude an otherwise playable cartridge');
  }finally{await Promise.all(rooms.map(r=>r.close()));await store.close();await rm(root,{recursive:true,force:true});}
});
