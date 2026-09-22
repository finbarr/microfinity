import test from 'node:test';import assert from 'node:assert/strict';
import {Engine} from '../runtime/engine';import type {Game} from '../sdk/index';

test('feedback preserves trusted event identity and clamps presentation-only sound options',()=>{
 const game:Game={meta:{id:'feedback-fixture',title:'Fixture',instruction:'Wait',description:'Feedback boundary fixture',players:[1,1],clock:'realtime',duration:2,participation:'individual',world:'shared',style:'cartoon',score:{unit:'points',order:'higher'},controls:{directions:false,action:'Wait'},tags:[],modifiers:[]},init:()=>({}),step(_s:any,_i:any,ctx:any){
  ctx.feedback('catch',{id:'forged',tick:-1,kind:'failure',playerId:'intruder',x:Infinity,y:NaN,text:'x'.repeat(200),sound:{pitch:200,timbre:'sawtooth'}});
  ctx.feedback('hit',{playerId:'p0',x:17,y:32,sound:{pitch:-200,timbre:'triangle'}});
  for(let i=0;i<100;i++)ctx.feedback('shot');
 },observe:()=>({}),draw(){}};
 const engine=new Engine(game,{seed:9,difficulty:1,players:[{id:'p0',name:'Player',color:'#fff'}]}),rng=engine.snapshot.rng;
 const status=engine.step();assert.equal(status.feedback.length,64);assert.equal(new Set(status.feedback.map(f=>f.id)).size,64);
 const first=status.feedback[0];assert.equal(first.id,'1:0');assert.equal(first.tick,1);assert.equal(first.kind,'catch');
 assert.equal(first.playerId,undefined);assert.equal(first.x,undefined);assert.equal(first.y,undefined);assert.equal(first.text?.length,120);assert.deepEqual(first.sound,{pitch:12});
 assert.deepEqual(status.feedback[1],{id:'1:1',tick:1,kind:'hit',playerId:'p0',x:17,y:32,sound:{pitch:-12,timbre:'triangle'}});
 assert.equal(engine.snapshot.rng,rng);assert.equal(engine.snapshot.scores.p0,0);
});
