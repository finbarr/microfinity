import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';import {ReplayRunner} from '../runtime/replay';
test('replay reconstructs recorded inputs, supports seeking, and verifies the saved finish',async()=>{
 const code=await compile(await readFile('games/toast-catch.ts','utf8')),runtime=await bootstrap(),live=await Sandbox.create(code,runtime),replayed=await Sandbox.create(code,runtime);
 const config={difficulty:1,players:[{id:'p0',name:'Player',color:'#86efac'}]},seed=100,journal:any[]=[];
 try{
  let status=live.call('init',{seed,...config},'native');
  while(!status.done){const tick=status.tick+1,edges=tick%90===0?{p0:[{button:'left',down:tick%180===0}]}:{};if(Object.keys(edges).length)journal.push({tick,edges,dt:1/60,event:'tick'});status=live.call('step',edges);}
  const snapshot=live.call('save'),replay=new ReplayRunner(replayed,{mode:'native',seed,config,journal,snapshot,status});
  replay.seek(250);assert.equal(replay.verify(),null);replay.seek(90);assert.equal(replay.status.tick,90);replay.seek(status.tick);assert.equal(replay.verify(),true);assert.deepEqual(replay.observe('p0').scores,status.scores);
 }finally{live.dispose();replayed.dispose();}
});

test('replay uses recorded action waits and collects each crossed feedback cue exactly once',()=>{
 let current:any;
 const vm={call(method:string,...args:any[]){
  if(method==='init')return current={tick:0,time:0,done:false,feedback:[]};
  if(method==='step'){const tick=current.tick+1;return current={tick,time:current.time+args[1],done:tick===3,feedback:[{id:`cue:${tick}`,kind:'catch',tick}]};}
  throw new Error(method);
 }} as any;
 const replay=new ReplayRunner(vm,{mode:'native',seed:1,config:{},journal:[{tick:1,event:'input',dt:2},{tick:2,event:'input',dt:.5},{tick:3,event:'timeout',dt:10}],snapshot:null,status:{tick:3,time:12.5}});
 assert.deepEqual(replay.advanceTo(1.9),[]);assert.equal(replay.status.tick,0);
 assert.deepEqual(replay.advanceTo(2.5).map(e=>e.id),['cue:1','cue:2']);
 assert.deepEqual(replay.advanceTo(2.6),[]);assert.equal(replay.status.tick,2);
 assert.deepEqual(replay.advanceTo(NaN),[]);
 assert.deepEqual(replay.advanceTo(12.5).map(e=>e.id),['cue:3']);assert.equal(replay.status.done,true);
 assert.deepEqual(replay.advanceTo(100),[]);
 replay.seek(0);assert.deepEqual(replay.advanceTo(2).map(e=>e.id),['cue:1'],'explicit rewind permits a new traversal');
});
