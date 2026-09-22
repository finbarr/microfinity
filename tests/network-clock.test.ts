import test from 'node:test';import assert from 'node:assert/strict';
import {NetworkClock,MAX_COMPENSATION_MS} from '../server/network-clock';import {advanceInput} from '../runtime/input';import {emptyButtons,timedPress,Graphics} from '../sdk/index';import {edgeSchema} from '../runtime/validation';
test('server-owned probes estimate skew, resist queue spikes, expire and reject duplicate replies',()=>{
 const clock=new NetworkClock(),probe=clock.probe(10000)!;
 assert.equal(clock.accept('forged',1050,10100),undefined);
 const sample=clock.accept(probe.id,1050,10100)!;assert.equal(sample.rtt,100);assert.equal(sample.offset,9000);assert.equal(sample.budget,75);
 assert.equal(clock.accept(probe.id,1050,10101),undefined);
 const second=clock.probe(10600)!;clock.accept(second.id,1700,10800);
 assert.equal(clock.estimate(10800).offset,9000);assert.equal(clock.estimate(10800).rtt,100);assert.equal(clock.estimate(10800).budget,125);
 assert.equal(clock.estimate(40000).ready,false);
});
test('claims are bounded, monotonic and measured; unsynchronized clients get no compensation',()=>{
 const clock=new NetworkClock(),probe=clock.probe(10000)!;clock.accept(probe.id,1100,10200);
 assert.equal(clock.estimate(10200).offset,9000);
 assert.deepEqual(clock.input(1300,10400),{accepted:true,at:10300,ageMs:100,reason:'accepted'});
 assert.equal(clock.input(1250,10400).reason,'backwards-time');
 assert.equal(clock.input(1301,10700).reason,'late');assert.equal(clock.input(1900,10400).reason,'future');assert.equal(clock.input(NaN,10400).accepted,false);
 assert.equal(clock.input(undefined,10400).ageMs,0);
 assert.ok(clock.estimate(10400).budget<=MAX_COMPENSATION_MS);
 const slow=new NetworkClock(),p=slow.probe(1000)!;slow.accept(p.id,1500,2000);assert.equal(slow.estimate(2000).budget,150);
});
test('timing helper compensates only a fresh press and public projection never advances rules',()=>{
 const input=advanceInput(emptyButtons(),[{button:'action',down:true,age:.1}]);
 assert.equal(timedPress(input,.76,1,.65,.03),true);
 assert.equal(timedPress({...input,pressAge:{}},.76,1,.65,.03),false);
 assert.equal(timedPress(input,.92,1,.65,.03),false);
 assert.equal(timedPress(advanceInput(input.held,[]),.65,1,.65,.1),false);
 assert.equal(advanceInput(emptyButtons(),[{button:'action',down:true,age:500}]).pressAge.action,.15);
 assert.equal(edgeSchema.safeParse({button:'action',down:true,age:.1}).success,false,'wire clients cannot supply trusted input ages');
 const gfx=new Graphics('pixel',[],.8);assert.equal(gfx.project(.5,1,0,1),.75);assert.equal(gfx.project(.9,1,0,1),1);
});
