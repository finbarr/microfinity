import test from 'node:test';import assert from 'node:assert/strict';import {ReplayClock} from '../client/replay-clock';
test('slow replay workers have one outstanding request and retain elapsed recorded time',()=>{
 const clock=new ReplayClock();clock.start(3,1000,4);
 const first=clock.advance(1050,1)!;assert.equal(first.time,3.2);
 for(let now=1100;now<=1800;now+=50)assert.equal(clock.advance(now,1),null);
 clock.acknowledge({...first,revision:0});assert.equal(clock.advance(1850,1),null,'stale response cannot release capacity');
 clock.acknowledge(first);const next=clock.advance(1900,1)!;assert.equal(next.time,6.6,'no dropped time after a delayed frame');
 clock.acknowledge(first);assert.equal(clock.advance(1950,1),null,'duplicate acknowledgement cannot release a newer request');
 assert.throws(()=>clock.advance(3401,1),/playback budget/);
 clock.reset();clock.start(0,4000,1);assert.equal(clock.advance(4050,2)!.time,.05);
});
