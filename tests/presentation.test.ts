import test from 'node:test';import assert from 'node:assert/strict';
import {Graphics,actorBounds,type Motion,type Expression,type ActorKind} from '../sdk/index';
import {validateCommands} from '../runtime/validation';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
const identity={x:0,y:0,scaleX:1,scaleY:1,rotation:0};

test('optional motion is bounded, reproducible and neutral under reduced motion',()=>{
 const g=new Graphics(),reduced=new Graphics('pixel',[],0,{time:5,reducedMotion:true});
 for(const kind of ['bounce','squash','stretch','wobble','recoil'] as Motion[]){
  assert.deepEqual(g.motion(kind,-1),identity);assert.deepEqual(reduced.motion(kind,.12),identity);
  for(let tick=0;tick<600;tick++){
   const pose=g.motion(kind,tick/60);assert.deepEqual(pose,g.motion(kind,tick/60));
   assert.ok(Math.abs(pose.x)<=6&&Math.abs(pose.y)<=7&&Math.abs(pose.rotation)<=.12);
   assert.ok(pose.scaleX>=.7&&pose.scaleX<=1.3&&pose.scaleY>=.7&&pose.scaleY<=1.3);
   assert.ok(Math.abs(pose.scaleX*pose.scaleY-1)<1e-9);
  }
 }
 for(const kind of ['squash','stretch','recoil'] as Motion[])assert.deepEqual(g.motion(kind,.22),identity);
 assert.equal(g.motion('bounce',.3).y,-7);assert.equal(g.motion('recoil',0).x,-6);
 assert.throws(()=>g.motion('wobble',1,{amount:20}),/animation amount/);assert.throws(()=>g.motion('bounce',NaN),/animation age/);
 assert.equal(g.blink(2.9),true);assert.equal(g.blink(3.05),false);assert.equal(reduced.blink(2.9),false);
 assert.equal(new Graphics('pixel',[],0,{time:NaN}).time,0);
});

test('expressions morph deterministically while reduced motion draws the target directly',()=>{
 const face=(expression:Expression,options:any={},reducedMotion=false)=>{const g=new Graphics('cartoon',[],0,{reducedMotion});g.face(expression,100,100,60,options);validateCommands(g.commands);return g.commands;};
 const names:Expression[]=['happy','neutral','sad','angry','surprised','sleepy'];
 assert.equal(new Set(names.map(n=>JSON.stringify(face(n)))).size,names.length);
 assert.deepEqual(face('sad',{from:'happy',age:0}),face('happy'));
 assert.deepEqual(face('sad',{from:'happy',age:.18}),face('sad'));
 assert.notDeepEqual(face('sad',{from:'happy',age:.09}),face('sad'));
 assert.deepEqual(face('sad',{from:'happy',age:0,blink:true},true),face('sad',{},true));
 assert.notDeepEqual(face('happy',{blink:true}),face('happy',{blink:false}));
 const g=new Graphics();g.face('constructor',0,0);assert.doesNotThrow(()=>validateCommands(g.commands));
});

test('actors have documented feet anchors and pose scopes restore after callback failures',()=>{
 for(const kind of ['ship','toast','hand','umbrella','cup','snack','parcel','asteroid','star'] as ActorKind[]){
  const normal=actorBounds(kind),double=actorBounds(kind,80),feet=actorBounds(kind,80,'feet');assert.equal(double.w,normal.w*2);assert.equal(feet.y+feet.h,0);
  const g=new Graphics('cartoon',[],0,{time:2.9});g.actor(kind,320,300,60,'#ffd782','surprised',{anchor:'feet',pose:g.motion('bounce',.3)});validateCommands(g.commands);
 }
 const g=new Graphics();assert.throws(()=>g.withPose(0,0,identity,()=>{g.circle(0,0,2,'red');throw new Error('fixture');}),/fixture/);validateCommands(g.commands);
 assert.throws(()=>actorBounds('ship',NaN),/actor size/);
 const reduced=new Graphics('pixel',[],0,{reducedMotion:true}),a=new Graphics('pixel',[],0,{reducedMotion:true});reduced.backdrop('rain',100);a.backdrop('rain',0);assert.deepEqual(reduced.commands,a.commands);
});

test('sandbox presentation time and reduced motion affect drawing without changing rules or RNG',async()=>{
 const source=`import {defineGame} from '@microfinity/sdk';
 export default defineGame({meta:{id:'presentation-fixture',title:'Faces',instruction:'Wait',description:'SDK fixture',players:[1,1],clock:'realtime',participation:'individual',world:'shared',duration:3,style:'cartoon',score:{unit:'ticks',order:'higher'},controls:{directions:false,action:'Wait'},tags:[],modifiers:[]},
 init(ctx){return {value:ctx.random()};},step(s,i,ctx){s.value=ctx.random();},observe(s){return {value:s.value};},draw(v,g){g.backdrop('space',g.time);g.actor('toast',320,220,60,'#ffd782','happy',{pose:g.motion('bounce'),blink:g.blink()});g.withPose(100,100,g.motion('wobble'),()=>g.face('surprised',0,0,40,{from:'happy',age:g.time}));}});`;
 const vm=await Sandbox.create(await compile(source),await bootstrap());try{
  vm.call('init',{seed:101,difficulty:1,players:[{id:'p0',name:'Fixture',color:'#fff'}]});const view=vm.call('observe','p0').game,snapshot=vm.call('save');
  const frame=(time:number,reducedMotion=false)=>vm.call('draw',view,[],0,{time,reducedMotion});
  assert.notDeepEqual(frame(.1),frame(.3));assert.deepEqual(frame(.1,true),frame(.3,true));assert.deepEqual(frame(.1),frame(.1));
  assert.deepEqual(vm.call('save'),snapshot);vm.call('step',{});const after=vm.call('save');vm.call('restore',snapshot);vm.call('step',{});assert.deepEqual(vm.call('save'),after);
 }finally{vm.dispose();}
});
