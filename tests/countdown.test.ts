import test from 'node:test';
import assert from 'node:assert/strict';
import {ClientClock,MAX_CLOCK_SLEW} from '../client/network-clock';
import {COUNTDOWN_MS,COUNTDOWN_BEAT_MS,countdownValue} from '../shared/countdown';

const sample=(offset:number)=>({ready:true,offset,rtt:20,uncertainty:10});
test('three complete beats use one absolute deadline and wait for the playing phase',()=>{
  assert.equal(COUNTDOWN_MS,3000);assert.equal(COUNTDOWN_BEAT_MS,1000);
  const startsAt=13000;
  for(const [now,value] of [[10000,3],[10999,3],[11000,2],[11999,2],[12000,1],[12999,1],[13000,1],[14000,1]])assert.equal(countdownValue(startsAt,now),value);
  assert.equal(countdownValue(startsAt,9000),3,'a stale clock cannot render or sound a fourth beat');
  assert.equal(countdownValue(startsAt,11500),2,'joining an existing countdown uses its remaining time');
});

test('the first snapshot hydrates a stale clock before the countdown renders, even without a probe',()=>{
  let local=100,wall=999999;
  const clock=new ClientClock(()=>local,()=>wall),startsAt=13000;
  const stale=clock.now();local+=100;
  clock.observeState({serverTime:10000,network:{...sample(0),ready:false}});
  const fresh=clock.now();assert.equal(fresh,10000);assert.notEqual(fresh,stale);
  assert.equal(countdownValue(startsAt,fresh),3);assert.equal(clock.ready,false);
  wall=-999999;local+=1000;assert.equal(clock.now(),11000,'wall time changes do not affect the running clock');
  clock.observeState({serverTime:11050});assert.equal(clock.now(),11000,'later receipt time is not a new anchor');
});

test('a synchronized first snapshot uses the probe time base rather than packet receipt time',()=>{
  let local=100;
  const clock=new ClientClock(()=>local,()=>0);
  clock.observeState({serverTime:10000,network:sample(10000)});
  assert.equal(clock.now(),10100);assert.equal(clock.ready,true);
  local+=50;clock.observeState({serverTime:10200,network:sample(10000)});
  assert.equal(clock.now(),10150);
});

for(const correction of [-600,600])test(`a ${correction} ms probe correction cannot jump, repeat, or compress countdown beats`,()=>{
  let local=0;
  const clock=new ClientClock(()=>local,()=>0);clock.observeState({serverTime:10000});
  const startsAt=10000+COUNTDOWN_MS,changes:{at:number;value:number}[]=[];
  let previous=clock.now();
  for(local=0;local<=3500;local+=10){
    // Correct both during the first beat and after reaching the second beat.
    if(local===300||local===1200){const before=clock.now();clock.update(sample(10000+(local===300?correction:-correction)));assert.equal(clock.now(),before);}
    const now=clock.now();assert.ok(now>=previous);assert.ok(now-previous<=10*(1+MAX_CLOCK_SLEW)+.001);previous=now;
    const value=countdownValue(startsAt,now);
    if(changes.at(-1)?.value!==value)changes.push({at:local,value});
    if(local===1600)clock.observeState({serverTime:11600,network:sample(10000-correction)});
  }
  assert.deepEqual(changes.map(c=>c.value),[3,2,1]);
  for(let i=1;i<changes.length;i++)assert.ok(changes[i].at-changes[i-1].at>=950&&changes[i].at-changes[i-1].at<=1060,JSON.stringify(changes));
});

test('repeated snapshots and same-page reconnect preserve progress and converge to a new estimate',()=>{
  let local=0;
  const clock=new ClientClock(()=>local,()=>0);clock.update(sample(10000));
  local=1500;const before=clock.now();
  // The shell retains this clock across sockets; epoch and network readiness
  // can reset on the server without restarting the local time base.
  clock.observeState({serverTime:11500,network:{...sample(0),ready:false}});
  assert.equal(clock.now(),before);assert.equal(countdownValue(13000,clock.now()),2);
  clock.update(sample(10100));assert.equal(clock.now(),before);
  local+=2000;assert.equal(clock.now(),local+10100);
  const stable=clock.now();
  for(const bad of [{...sample(NaN)},{...sample(0),rtt:-1},{...sample(0),uncertainty:Infinity},{...sample(0),ready:false}])clock.update(bad);
  assert.equal(clock.now(),stable);
  assert.equal(countdownValue(clock.now()+COUNTDOWN_MS,clock.now()),3,'a new server deadline starts the next countdown');
});
