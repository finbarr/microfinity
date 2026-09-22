import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../server/store';
import {Room} from '../server/rooms';
import {compile,bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {NetworkClock,serverNow} from '../server/network-clock';
import {COUNTDOWN_MS} from '../shared/countdown';

class Socket {
  readyState=1;bufferedAmount=0;messages:any[]=[];
  send(s:string){this.messages.push(JSON.parse(s));}close(){this.readyState=3;}
  state(){return this.messages.filter(m=>m.type==='state').at(-1);}
}

test('the room preserves a common three-second deadline through updates and reconnect, rejecting early input',async t=>{
  const root=await mkdtemp(join(tmpdir(),'microfinity-countdown-test-')),store=new Store(root,'');let room:Room|undefined;
  try{
    await store.init();const host=await store.guest(undefined,'Host'),friend=await store.guest(undefined,'Friend');
    const source=`import {defineGame} from '@microfinity/sdk';export default defineGame({
      meta:{id:'countdown-test',title:'Countdown',description:'Timing fixture',instruction:'Tap after the countdown',clock:'realtime',participation:'simultaneous',world:'shared',duration:5,style:'pixel',score:{unit:'taps',order:'higher'},controls:{directions:false,action:'Tap'},tags:[]},
      init(){return {};},step(s,inputs,ctx){for(const p of ctx.players)if(inputs[p.id].pressed.action)ctx.addScore(p.id,1);},observe(){return {};},draw(v,g){g.clear('#123456');}});`;
    const code=await compile(source),vm=await Sandbox.create(code,await bootstrap());
    const meta=vm.call('meta').meta;vm.dispose();const version=await store.putVersion(source,code,meta);
    room=new Room(store,host.id,[version],{botType:'scripted'});
    // Stop the real pump and advance the real Room state machine at exact
    // monotonic instants. Runtime execution and persistence remain real.
    clearInterval((room as any).timer);
    const a=new Socket(),b=new Socket();await room.join(host,a as any);await room.join(friend,b as any);
    await room.message(a as any,{type:'start'});assert.equal(room.phase,'preparing');
    let mono=performance.now();t.mock.method(performance,'now',()=>mono);
    const tick=()=>((room as any).tick() as Promise<void>);
    await room.message(a as any,{type:'loaded',versionId:version.id});await tick();assert.equal(room.phase,'preparing');
    await room.message(b as any,{type:'loaded',versionId:version.id});
    const began=serverNow(),beginMono=mono;await tick();assert.equal(room.phase,'countdown');
    assert.equal(room.startsAt,began+COUNTDOWN_MS);assert.equal(a.state().startsAt,b.state().startsAt);
    const startsAt=room.startsAt;
    const input=(socket:Socket,seq:number,clientTime?:number)=>room!.message(socket as any,{type:'input',matchId:room!.matchId,round:room!.round,epoch:room!.seats[0].epoch,seq,clientTime,edges:[{button:'action',down:true},{button:'action',down:false}]});
    for(const elapsed of [0,999,1000,1999,2000,2999]){
      mono=beginMono+elapsed;await tick();await input(a,1);
      assert.equal(room.phase,'countdown');assert.equal((room as any).status.tick,0);assert.equal(room.seats[0].held.action,false);assert.equal(room.seats[0].queued.length,0);
      room.broadcast();assert.equal(a.state().startsAt,startsAt);assert.equal(b.state().view.tick,0);
    }
    const resumed=new Socket();await room.join(host,resumed as any);
    assert.equal(resumed.state().phase,'countdown');assert.equal(resumed.state().startsAt,startsAt);
    assert.equal(room.seats[0].queued.length,0);
    mono=beginMono+COUNTDOWN_MS;await tick();
    assert.equal(room.phase,'playing');assert.equal(resumed.state().serverTime,startsAt);assert.equal(b.state().serverTime,startsAt);
    assert.equal((room as any).status.tick,0,'rules do not advance before the deadline');
    const clock=room.seats[0].clock=new NetworkClock(),probe=clock.probe(serverNow())!;
    clock.accept(probe.id,mono,serverNow());
    await input(resumed,1,mono-10);
    assert.equal(room.seats[0].rejected['before-start'],1,'a pre-start press arriving after start cannot be compensated into gameplay');
    assert.equal(room.seats[0].queued.length,0);
    await input(resumed,2,mono);assert.equal(room.seats[0].queued.length,2);
    mono+=20;await tick();assert.equal((room as any).status.scores.p0,1);assert.equal((room as any).status.scores.p1,0);
  }finally{t.mock.restoreAll();await room?.close();await store.close();await rm(root,{recursive:true,force:true});}
});
