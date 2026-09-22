import test from 'node:test';import assert from 'node:assert/strict';
import {createDirectionRepeat,directionPresses,focusGrid,createButtonHold,trackHold,aimAngle,projectile,stepProjectile,createSpawnClock,spawnDue,createSequence,advanceSequence,emptyButtons,emptyInput,move,type Button,type Buttons} from '../sdk/index';
import {InputCollector,advanceInput,buttonEdges} from '../runtime/input';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
const tap=(...buttons:Button[])=>advanceInput(emptyButtons(),buttons.flatMap(button=>[{button,down:true},{button,down:false}]));
const held=(...buttons:Button[])=>advanceInput(emptyButtons(),buttons.map(button=>({button,down:true})));
const steady=(buttons:Buttons)=>advanceInput(buttons,[]);
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('selection repeat uses the same simulation timeline for keys, touch sources and bot buttons',()=>{
 const traces=[];
 for(const method of ['keyboard','pad','bot']){
  const collector=new InputCollector(),repeat=createDirectionRepeat();let previous=emptyButtons(),index=0;const trace=[];
  for(let tick=0;tick<=60;tick++){
   if(method==='bot'){
    const next={...emptyButtons(),right:tick<54};const input=advanceInput(previous,buttonEdges(previous,next));previous=input.held;
    index=focusGrid(index,input,20,20,repeat,tick/60);
   }else{
    const source=method==='keyboard'?'ArrowRight':'touch:1';
    if(tick<54)collector.set(source,['right']);else collector.release(source);
    if(method==='keyboard'&&tick===5)collector.set('KeyD',['right']);if(method==='keyboard'&&tick===10)collector.release('KeyD');
    const input=advanceInput(previous,collector.drain());previous=input.held;index=focusGrid(index,input,20,20,repeat,tick/60);
   }
   trace.push(index);
  }
  traces.push(trace);assert.equal(trace[0],1);assert.equal(trace[18],1);assert.equal(trace[20],2);assert.equal(trace[53],6);assert.equal(trace[60],6);
 }
 assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
});

test('grid navigation preserves quick taps, clamps ragged rows and neutralizes held opposites',()=>{
 assert.deepEqual(directionPresses(tap('right','right','down'),0),['right','right','down']);
 assert.equal(focusGrid(0,tap('right','right','down'),5,3),4);
 assert.equal(focusGrid(2,tap('right'),5,3),2);assert.equal(focusGrid(3,tap('left'),5,3),3);
 assert.equal(focusGrid(4,tap('up'),5,3),1);assert.equal(focusGrid(0,tap('up','left'),5,3),0);
 assert.deepEqual(directionPresses(held('left','right'),0,createDirectionRepeat()),[]);
 const quickThenHold=advanceInput(emptyButtons(),[{button:'left',down:true},{button:'left',down:false},{button:'right',down:true}]);
 assert.deepEqual(directionPresses(quickThenHold,0),['left','right']);
 const repeat=createDirectionRepeat();directionPresses(held('right'),0,repeat);const restored=JSON.parse(JSON.stringify(repeat));
 assert.deepEqual(directionPresses(steady(held('right').held),.8,repeat),directionPresses(steady(held('right').held),.8,restored));
 assert.equal(directionPresses(steady(held('right').held),50,repeat).length,4);assert.equal(directionPresses(steady(held('right').held),50,repeat).length,0);
 assert.throws(()=>focusGrid(0,emptyInput(),0),/Grid/);assert.throws(()=>directionPresses(emptyInput(),0,repeat,0),/repeat delay/);
});

test('hold timing records real release cycles and cancels neutralized roles without firing',()=>{
 const state=createButtonHold(),down=held('action');assert.equal(trackHold(state,down,2).seconds,0);
 close(trackHold(state,steady(down.held),2.4).seconds,.4);
 const restored=JSON.parse(JSON.stringify(state)),up=advanceInput(down.held,[{button:'action',down:false}]);
 const release=trackHold(state,up,2.7);close(release.releases[0],.7);assert.deepEqual(trackHold(restored,up,2.7),release);
 assert.deepEqual(trackHold(state,tap('action','action'),3).releases,[0,0]);
 trackHold(state,down,4);assert.deepEqual(trackHold(state,emptyInput(),5),{seconds:0,releases:[]});
});

test('sequences preserve ordered repeated taps, exact deadlines, failure and snapshot continuation',()=>{
 const pattern:Button[]=['up','action','action'],sequence=createSequence(pattern,0,1);pattern[0]='down';
 assert.equal(advanceSequence(sequence,tap('up'),1),'waiting');assert.equal(sequence.index,1);assert.equal(sequence.deadline,2);
 const restored=JSON.parse(JSON.stringify(sequence));assert.equal(advanceSequence(sequence,tap('action','action'),2),'complete');
 assert.equal(advanceSequence(restored,tap('action','action'),2),'complete');assert.deepEqual(restored,sequence);
 assert.equal(advanceSequence(sequence,tap('down'),100),'complete');
 assert.equal(advanceSequence(createSequence(['action'],0,1),tap('action'),1.01),'timeout');
 assert.equal(advanceSequence(createSequence(['action'],0,1),tap('left','action'),.5),'wrong');
 assert.equal(advanceSequence(createSequence(['action'],0,1),emptyInput(),.5),'waiting');
 assert.throws(()=>createSequence([],0),/1..32/);assert.throws(()=>createSequence(['action'],0,NaN),/sequence window/);
});

test('cursor, aiming, projectiles and scheduled spawning stay bounded and reproducible',()=>{
 const cursor={x:100,y:100};move(cursor,held('up','right'),100,1,{x:0,y:0,w:640,h:400});close(Math.hypot(cursor.x-100,cursor.y-100),100);
 close(aimAngle(0,held('up','right'),Math.PI,0.25),Math.PI/4);
 close(aimAngle(1,held('left','right'),Math.PI,1),1);close(aimAngle(0,held('right'),2,1,-.5,.5),.5);
 close(aimAngle(Math.PI-.1,held('right'),1,.2),-Math.PI+.1);
 const shot=projectile(50,50,-Math.PI/2,100,1);assert.equal(stepProjectile(shot,.25),true);close(shot.y,25);
 assert.equal(stepProjectile(shot,2),false);close(shot.y,-50);assert.equal(shot.life,0);
 const outside=projectile(639,20,0,200,2);assert.equal(stepProjectile(outside,1,{x:0,y:0,w:640,h:400}),false);
 const spawn=createSpawnClock(.5);assert.deepEqual(spawnDue(spawn,.4,.2),[]);
 assert.deepEqual(spawnDue(spawn,1,.2,2).map(s=>s.id),[0,1]);const restored=JSON.parse(JSON.stringify(spawn));
 assert.deepEqual(spawnDue(spawn,1,.2),spawnDue(restored,1,.2));close(spawn.next,1.1);assert.equal(spawn.serial,3);
 assert.throws(()=>spawnDue(spawn,1,0),/spawn period/);assert.throws(()=>projectile(0,0,NaN,1),/angle/);
});

test('a single-file cartridge compiles the helpers and restores/replays its full state in QuickJS',async()=>{
 const source=`import {defineGame,createSequence,advanceSequence,createDirectionRepeat,focusGrid,createButtonHold,trackHold,createSpawnClock,spawnDue,projectile,stepProjectile,aimAngle} from '@microfinity/sdk';
 export default defineGame({meta:{id:'sdk-helper-fixture',title:'Helper fixture',instruction:'Follow the sequence',description:'Local authoring fixture',players:[1,1],clock:'realtime',participation:'individual',world:'shared',duration:3,style:'pixel',score:{unit:'presses',order:'higher'},controls:{directions:true,action:'Confirm'},tags:[],modifiers:[]},
 init(){return {sequence:createSequence(['right','action','action'],0,1),repeat:createDirectionRepeat(),hold:createButtonHold(),spawn:createSpawnClock(.1),shots:[] as {x:number;y:number;vx:number;vy:number;life:number}[],focus:0,angle:0};},
 step(s,inputs,ctx){const input=inputs[ctx.players[0].id];s.focus=focusGrid(s.focus,input,6,3,s.repeat,ctx.time);s.angle=aimAngle(s.angle,input,1,ctx.dt);trackHold(s.hold,input,ctx.time);for(const e of spawnDue(s.spawn,ctx.time,.2))s.shots.push(projectile(320,200,s.angle,30,.5));s.shots=s.shots.filter(p=>stepProjectile(p,ctx.dt));advanceSequence(s.sequence,input,ctx.time);ctx.setScore(ctx.players[0].id,s.sequence.index);},
 observe(s){return {focus:s.focus,shots:s.shots,index:s.sequence.index};},draw(v,g){g.backdrop('space');g.text(String(v.index),320,80);for(const p of v.shots)g.circle(p.x,p.y,3,'#fff');}});`;
 const code=await compile(source),vm=await Sandbox.create(code,await bootstrap()),config={seed:123,difficulty:1,players:[{id:'p0',name:'Fixture',color:'#fff'}]};
 try{
  vm.call('init',config);const journal:any[]=[];let checkpoint:any;
  for(let i=0;i<180;i++){const edges=i===2?tap('right').edges:i===8?tap('action','action').edges:[];journal.push({p0:edges});vm.call('step',{p0:edges});if(i===50)checkpoint=vm.call('save');}
  const final=vm.call('save');assert.equal(vm.call('observe','p0').scores.p0,3);
  vm.call('restore',checkpoint);for(const edges of journal.slice(51))vm.call('step',edges);assert.deepEqual(vm.call('save'),final);
  vm.call('init',config);for(const edges of journal)vm.call('step',edges);assert.deepEqual(vm.call('save'),final);
 }finally{vm.dispose();}
});
