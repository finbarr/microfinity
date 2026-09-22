import test from 'node:test';import assert from 'node:assert/strict';
import {FeedbackEffects,drawFeedback} from '../client/feedback';
import type {Feedback} from '../sdk/index';
const shared={world:'shared',style:'cartoon'} as const;
const view={game:{},playerId:'p0',mode:{kind:'native'}};
const event=(id:string,extra:Partial<Feedback>={}):Feedback=>({id,tick:1,kind:'catch',playerId:'p0',x:320,y:280,...extra});

test('visual feedback deduplicates, expires, bounds bursts and resets only for a new traversal',()=>{
 const effects=new FeedbackEffects();effects.reset('round1');effects.add([event('a')],100);
 effects.add([event('a')],200);effects.reset('round1');
 assert.equal(effects.frame(200,shared,view).length,1);assert.equal(effects.frame(200,shared,view)[0].started,100);
 assert.equal(effects.frame(580,shared,view).length,0);
 effects.add([event('a')],600);assert.equal(effects.frame(600,shared,view).length,0);
 effects.reset('round2');effects.add([event('a')],600);assert.equal(effects.frame(600,shared,view).length,1);
 effects.clear();effects.add([event('a')],610);assert.equal(effects.frame(610,shared,view).length,0);
 effects.add(Array.from({length:100},(_,i)=>event(`many${i}`)),700);
 assert.equal(effects.frame(700,shared,view).length,24);
});

test('feedback visuals respect perspective, obstruction, background drops and reduced motion',()=>{
 const effects=new FeedbackEffects();effects.add([event('own'),event('other',{playerId:'p1'})],0);
 assert.equal(effects.frame(100,shared,view).length,2);
 assert.equal(effects.frame(100,{...shared,world:'independent'},view).length,1);
 assert.equal(effects.frame(100,shared,{...view,mode:{kind:'race'}}).length,1);
 assert.deepEqual(effects.frame(100,shared,{...view,mode:{kind:'pressure',active:'p1'}}).map(b=>b.event.id),['other']);
 assert.equal(effects.frame(100,shared,{...view,game:null}).length,0);
 assert.equal(effects.frame(100,shared,view,true).length,0);
 effects.clear();effects.add([event('hidden')],200,false);effects.add([event('hidden')],220,true);
 assert.equal(effects.frame(220,shared,view).length,0);
 effects.add([event('outside',{x:Infinity}),event('negative',{x:-1}),event('unknown',{kind:'anything'}),event('prototype',{kind:'constructor'}),event('missing',{y:undefined})],230);
 assert.equal(effects.frame(230,shared,view).length,0);
});

test('feedback draws are reproducible, bounded and isolated from cartridge canvas state',()=>{
 const effects=new FeedbackEffects();effects.add([event('a',{text:'12345678901234567890',x:639,y:1})],0);
 const bursts=effects.frame(200,shared,view);assert.equal(bursts[0].event.text?.length,12);
 const draw=()=>{
  const operations:any[]=[];let depth=0;
  const g:any={save(){depth++;},restore(){depth--;},resetTransform(){operations.push(['reset']);},beginPath(){},rect(...a:any[]){operations.push(['clipBounds',...a]);},clip(){},arc(...a:any[]){operations.push(['arc',...a]);},fill(){},fillRect(...a:any[]){operations.push(['rect',...a]);},strokeText(...a:any[]){operations.push(['strokeText',...a]);},fillText(...a:any[]){operations.push(['text',...a]);}};
  drawFeedback({getContext:()=>g} as any,bursts);assert.equal(depth,0);assert.equal(operations.filter(o=>o[0]==='arc').length,6);
  assert.deepEqual(operations.find(o=>o[0]==='clipBounds'),['clipBounds',0,0,640,400]);
  assert.deepEqual(operations.find(o=>o[0]==='text'),['text','123456789012',568,18]);
  g.arc=()=>{throw new Error('Painter failed');};assert.throws(()=>drawFeedback({getContext:()=>g} as any,bursts),/Painter failed/);assert.equal(depth,0);
  return operations;
 };
 assert.deepEqual(draw(),draw());
});
