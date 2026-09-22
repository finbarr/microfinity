import test from 'node:test';import assert from 'node:assert/strict';
import {defineGame,type Hud} from '../sdk/index';import {Engine} from '../runtime/engine';import {ModeEngine} from '../runtime/modes';
import {spatialTarget} from '../client/arcade-navigation';
const players=[{id:'p0',name:'One',color:'#fff'},{id:'p1',name:'Two',color:'#f00'}];
const game=defineGame({meta:{id:'hud-fixture',title:'Cabinet',description:'fixture',instruction:'Pick',players:[1,2],clock:'realtime',participation:'rotating',world:'shared',duration:10,style:'pixel',score:{unit:'points',order:'higher'},controls:{directions:true,action:'Pick'},tags:[],modifiers:['obstruction']},init(){return {secret:'never show this',turn:'p0',progress:0};},step(s,_i,ctx){s.progress++;ctx.addScore('p0',1);},observe(s,id){return {progress:s.progress,active:id};},hud(v){return {message:'Go!',activePlayerId:v.active,items:[{label:'Progress',value:v.progress}]};},draw(_v,g){g.clear('#000');}});
test('cabinet HUD gets only the observer view, cannot mutate it, and preserves replay state',()=>{
 let seen:any;
 const fixture={...game,hud:(view:any)=>{seen=view;assert.equal(view.secret,undefined);assert.throws(()=>{view.progress=99;},TypeError);return {activePlayerId:view.active,items:[{label:'Progress',value:view.progress}]};}};
 const engine=new Engine(fixture,{players,seed:42,difficulty:1}),before=engine.save();
 const a=engine.observe('p0'),b=engine.observe('p1');assert.equal(a.hud.activePlayerId,'p0');assert.equal(b.hud.activePlayerId,'p1');assert.ok(Object.isFrozen(seen));assert.deepEqual(engine.save(),before);
 engine.step();const after=engine.save();assert.equal(engine.observe('p0').hud.items?.[0].value,1);engine.restore(before);engine.step();assert.deepEqual(engine.save(),after);
});
test('HUD validates plain bounded output and hides it during obstruction',()=>{
 for(const bad of [{message:'a'.repeat(121)},{activePlayerId:'secret'},{items:Array(7).fill({label:'x',value:1})},{items:[{label:'x',value:Infinity}]},{items:[{label:'x',value:{}}]}]){
  const engine=new Engine({...game,hud:()=>bad as Hud},{players,seed:42,difficulty:1});assert.throws(()=>engine.observe('p0'));
 }
 const mode=new ModeEngine({...game,meta:{...game.meta,players:[1,1]}},{players,seed:42,difficulty:1},'obstruction');
 for(let i=0;i<91;i++)mode.step();mode.step({p1:[{button:'action',down:true}]});
 assert.equal(mode.observe('p0').game,null);assert.deepEqual(mode.observe('p0').hud,{});assert.equal(mode.observe('p0').mode.kind,'obstruction');
});
test('arcade selection follows rows and columns, crosses a grid gap and stops at an edge',()=>{
 const boxes=[{x:0,y:0,width:100,height:40},{x:120,y:0,width:100,height:40},{x:0,y:200,width:100,height:40},{x:120,y:200,width:100,height:40},{x:260,y:100,width:40,height:40}];
 assert.equal(spatialTarget(boxes,0,'right'),1);assert.equal(spatialTarget(boxes,0,'down'),2);assert.equal(spatialTarget(boxes,3,'up'),1);assert.equal(spatialTarget(boxes,0,'left'),0);assert.equal(spatialTarget(boxes,-1,'down'),0);assert.equal(spatialTarget([],0,'up'),-1);
 // The nearby star row must beat a faraway header button aligned with Play again.
 const results=[{x:500,y:432,width:126,height:49},{x:672,y:364,width:38,height:40},{x:570,y:18,width:100,height:40}];
 assert.equal(spatialTarget(results,0,'up'),1);
});
