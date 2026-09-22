import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
const config={seed:12,difficulty:1,players:[{id:'p0',name:'A',color:'#86efac'},{id:'p1',name:'B',color:'#f9a8d4'}]};
const tap=[{button:'action',down:true},{button:'action',down:false}];
test('Asteroid fires on a short tap without bypassing its cooldown or changing held fire',async()=>{
 const vm=await Sandbox.create(await compile(await readFile('games/asteroid-scramble.ts','utf8')),await bootstrap());
 try{
  vm.call('init',config);let status=vm.call('step',{p0:tap});
  assert.equal(status.feedback.filter((f:any)=>f.kind==='shot'&&f.playerId==='p0').length,1,'a press and release within one tick still fires');
  status=vm.call('step',{p0:tap});assert.equal(status.feedback.filter((f:any)=>f.kind==='shot').length,0,'quick taps cannot bypass cooldown');
  for(let i=0;i<14;i++)vm.call('step',{});
  status=vm.call('step',{p0:tap});assert.equal(status.feedback.filter((f:any)=>f.kind==='shot').length,1);
  vm.call('init',config);let shots=0;for(let i=0;i<60;i++){status=vm.call('step',i===0?{p0:[{button:'action',down:true}]}:{});shots+=status.feedback.filter((f:any)=>f.kind==='shot').length;}
  assert.equal(shots,5,'held action retains the five-shots-per-second cadence');
  vm.call('init',config);let hits=0;
  for(let tick=0;tick<1080&&hits===0;tick++){
    const before=vm.call('observe','p0').game;
    status=vm.call('step',tick===0?{p0:[{button:'action',down:true}],p1:[{button:'action',down:true}]}:{});
    for(const hit of status.feedback.filter((f:any)=>f.kind==='hit'&&f.y>=0)){
      hits++;assert.ok(before.rocks.some((r:any)=>Math.abs(r.x+r.vx/60-hit.x)<1e-8&&Math.abs(r.y+r.vy/60-hit.y)<1e-8),'The hit effect must use the actual rock position at impact');
    }
  }
  assert.ok(hits>0,'The seeded held-fire run must hit a visible rock');
 }finally{vm.dispose();}
});
