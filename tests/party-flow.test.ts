import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {Store,type Version} from '../server/store';
import {getMatch} from '../server/matches';import {Room,roomRequestSchema} from '../server/rooms';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
class Socket {readyState=1;bufferedAmount=0;messages:any[]=[];send(s:string){this.messages.push(JSON.parse(s));}close(){this.readyState=3;}state(){return this.messages.filter(m=>m.type==='state').at(-1);}}

test('room request contract accepts empty and existing selected/random requests without setup choices',()=>{
  assert.equal(roomRequestSchema.parse({lobby:true}).settings.targetPlayers,1);
  assert.equal(roomRequestSchema.parse({}).versions,undefined);
  assert.deepEqual(roomRequestSchema.parse({versions:[]}).versions,[]);
  assert.deepEqual(roomRequestSchema.parse({versions:['a'.repeat(64)],settings:{targetPlayers:4}}).versions,['a'.repeat(64)]);
  assert.equal(roomRequestSchema.parse({random:{}}).random?.count,4);
  assert.throws(()=>roomRequestSchema.parse({versions:[],random:{}}));
  assert.throws(()=>roomRequestSchema.parse({settings:{targetPlayers:5}}));
});

test('empty lobbies admit four guests, enforce host ownership, start without ready and preserve random/manual parity',async()=>{
  const root=await mkdtemp(join(tmpdir(),'microfinity-party-flow-')),store=new Store(root,''),rooms:Room[]=[];
  try{
    await store.init();const guests:Awaited<ReturnType<Store['guest']>>[]=[];for(let i=0;i<5;i++)guests.push(await store.guest(undefined,`Guest ${i}`));
    const runtime=await bootstrap(),versions:Version[]=[];
    for(const name of ['toast-catch','patchwork-pass']){
      const source=await readFile(`games/${name}.ts`,'utf8'),code=await compile(source),vm=await Sandbox.create(code,runtime);
      try{versions.push(await store.putVersion(source,code,vm.call('meta').meta));}finally{vm.dispose();}
    }
    const make=()=>{const room=new Room(store,guests[0].id,[],{botType:'scripted',seed:41});rooms.push(room);return room;};
    const room=make(),sockets=guests.map(()=>new Socket());
    await room.join(guests[1],sockets[1] as any);assert.equal(sockets[1].state().playerId,'p1','the creator keeps the first seat');
    assert.equal(sockets[1].state().hostId,guests[0].id);assert.deepEqual(sockets[1].state().playlist,[]);assert.equal(sockets[1].state().manifest,undefined);
    await room.join(guests[0],sockets[0] as any);
    await assert.rejects(()=>room.message(sockets[0] as any,{type:'start'}),/Choose games/);
    for(const message of [{type:'start'},{type:'playlist',versions:[versions[0].id]},{type:'random',filters:{}},{type:'add-bot'}])await assert.rejects(()=>room.message(sockets[1] as any,{...message,revision:room.revision}),/Only the host/);
    await room.join(guests[2],sockets[2] as any);await room.join(guests[3],sockets[3] as any);
    await assert.rejects(()=>room.join(guests[4],sockets[4] as any),/full/);
    await room.disconnect(sockets[3] as any);await assert.rejects(()=>room.join(guests[4],sockets[4] as any),/full/);
    await room.join(guests[3],sockets[3] as any);assert.equal(sockets[3].state().playerId,'p3');
    const revision=room.revision;
    await room.message(sockets[0] as any,{type:'playlist',revision,versions:[versions[0].id]});
    await assert.rejects(()=>room.message(sockets[0] as any,{type:'playlist',revision,versions:[versions[1].id]}),/setup changed/);
    await room.message(sockets[0] as any,{type:'start'});assert.equal(room.phase,'preparing');assert.equal(sockets[0].state().mode,'party-v1');
    assert.equal(room.seats.filter(s=>s.controller==='human').length,4);
    await assert.rejects(()=>room.message(sockets[0] as any,{type:'random',revision:room.revision}),/only change in the lobby/);
    await assert.rejects(()=>room.join(guests[4],sockets[4] as any),/started/);
    const resumed=new Socket(),oldEpoch=room.seats[1].epoch;await room.join(guests[1],resumed as any);
    assert.equal(sockets[1].readyState,3);assert.equal(resumed.state().playerId,'p1');assert.ok(room.seats[1].epoch>oldEpoch);
    await room.disconnect(sockets[1] as any);assert.equal(room.seats[1].controller,'human','the replaced connection cannot disconnect the resumed seat');
    await room.disconnect(sockets[0] as any);assert.equal(room.hostId,guests[1].id);
    await assert.rejects(()=>room.message(sockets[2] as any,{type:'start'}),/Only the host/);
    const [persisted]=await store.query('SELECT record FROM matches WHERE id=$1',[room.matchId]);
    assert.equal(persisted.record.participants.length,4);assert.deepEqual(persisted.record.rounds,[]);
    assert.equal(persisted.record.activeRound,undefined);
    await room.close();

    const random=make(),manual=make(),a=new Socket(),b=new Socket(),c=new Socket(),d=new Socket();
    await random.join(guests[0],a as any);await random.join(guests[1],b as any);
    await manual.join(guests[0],c as any);await manual.join(guests[1],d as any);
    await random.message(a as any,{type:'random',revision:random.revision,filters:{seed:81,count:12}});
    assert.equal(random.versions.length,2);assert.ok(random.selection);assert.equal(random.phase,'lobby');
    const ids=random.versions.map(v=>v.id);
    await manual.message(c as any,{type:'start',revision:manual.revision,versions:ids});
    await random.message(a as any,{type:'start'});
    assert.deepEqual(manual.versions.map(v=>v.id),ids);
    const rows=await store.query('SELECT record FROM matches WHERE id IN ($1,$2)',[random.matchId,manual.matchId]);
    assert.equal(rows.length,2);assert.deepEqual(rows.map(row=>row.record.definition.versions),[ids,ids]);
    assert.ok(rows.every(row=>row.record.activeRound===undefined));
    await random.close();await manual.close();

    const quick=make(),q=new Socket();await quick.join(guests[0],q as any);
    await quick.message(q as any,{type:'start',revision:quick.revision,random:{seed:4,count:1}});
    assert.equal(quick.phase,'preparing');assert.equal(quick.versions.length,1);
    assert.equal(quick.seats.filter(s=>s.controller==='human').length,1);
    assert.equal(quick.seats.length,Math.max(1,quick.versions[0].manifest.meta.players[0]));
  }finally{await Promise.all(rooms.map(r=>r.close()));await store.close();await rm(root,{recursive:true,force:true});}
});

test('live room inputs finish private attempts independently and persist the right guest scores and summary',async()=>{
  const root=await mkdtemp(join(tmpdir(),'microfinity-party-results-')),store=new Store(root,'');let room:Room|undefined;
  const until=async(predicate:()=>boolean)=>{const end=performance.now()+8000;while(!predicate()&&performance.now()<end)await new Promise(r=>setTimeout(r,20));assert.ok(predicate(),'room reached the expected phase');};
  try{
    await store.init();const host=await store.guest(undefined,'Host'),friend=await store.guest(undefined,'Friend');
    const source=`import {defineGame} from '@microfinity/sdk';export default defineGame({
      meta:{id:'party-score-fixture',title:'Two taps',description:'Independent completion',instruction:'Tap twice',clock:'realtime',participation:'individual',world:'independent',duration:3,style:'pixel',score:{unit:'taps',order:'higher'},controls:{directions:false,action:'Tap'},tags:[]},
      init(ctx){return {id:ctx.players[0].id,count:0};},
      step(s,inputs,ctx){const count=inputs[s.id].edges.filter(e=>e.button==='action'&&e.down).length;s.count+=count;ctx.addScore(s.id,count);if(s.count>=2||ctx.time>=2.9){ctx.finishPlayer(s.id,s.count>=2?'success':'failure');ctx.finishRound();}},
      observe(s){return {count:s.count};},draw(v,g){g.text(String(v.count),100,100);}});`;
    const code=await compile(source),runtime=await bootstrap(),vm=await Sandbox.create(code,runtime);
    const meta=vm.call('meta').meta;vm.dispose();const version=await store.putVersion(source,code,meta);
    room=new Room(store,host.id,[version],{botType:'scripted'});const a=new Socket(),b=new Socket();
    await room.join(host,a as any);await room.join(friend,b as any);await room.message(a as any,{type:'start'});
    await room.message(a as any,{type:'loaded',versionId:version.id});await room.message(b as any,{type:'loaded',versionId:version.id});
    await until(()=>room!.phase==='playing');
    const tap=[{button:'action',down:true},{button:'action',down:false}];
    for(const [index,socket] of [a,b].entries())await room.message(socket as any,{type:'input',matchId:room.matchId,round:0,epoch:room.seats[index].epoch,seq:1,edges:index===0?tap:[...tap,...tap],method:'keyboard'});
    await until(()=>b.state().view?.roles.p1==='finished');
    assert.equal(room.phase,'playing','one finished attempt does not end another participant’s game');
    await until(()=>room!.phase==='round-result');
    const results=await store.query('SELECT guest_id,score,record FROM results WHERE match_id=$1 ORDER BY score',[room.matchId]);
    assert.deepEqual(results.map(r=>[r.guest_id,r.score]),[[host.id,1],[friend.id,2]]);
    assert.deepEqual(results.map(r=>r.record.outcome),['failure','success']);assert.deepEqual(results.map(r=>r.record.points),[0,2]);
    assert.ok(results.every(r=>r.record.dimensions.mode==='party-v1'&&r.record.controllers.join(',')==='human'));
    const [match]=await store.query('SELECT record FROM matches WHERE id=$1',[room.matchId]),round=match.record.rounds[0];
    assert.deepEqual(round.records.map((r:any)=>r.score),[1,2]);
    assert.equal(round.versionId,version.id);assert.equal(round.journal,undefined);assert.equal(round.snapshot,undefined);
    await until(()=>room!.phase==='match-result');
    const summary=await getMatch(store,room.matchId,host.id);assert.deepEqual(summary.record.rounds[0].records.map((r:any)=>r.score),[1,2]);
    assert.equal(summary.record.rounds[0].records[1].outcome,'success');assert.ok(!JSON.stringify(summary).includes('snapshot'));
  }finally{await room?.close();await store.close();await rm(root,{recursive:true,force:true});}
});
