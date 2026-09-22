import test from 'node:test';import assert from 'node:assert/strict';
import {Graphics,type DrawCommand} from '../sdk/index';
import {safeJSON,validateCommands} from '../runtime/validation';
import {drawCommands} from '../client/renderer';

const command=(op:string,...args:any[]):DrawCommand=>({op,args});
test('drawing rejects malformed arguments, nested extremes and cumulative transform growth',()=>{
 const invalid=[
  command('clear',{}),command('text',null,0,0,20,'red','left'),command('text','hello',0,0,100000,'red','left'),
  command('line',0,0,4,4,'red','3'),command('circle',0,0,-1,'red',null),command('opacity',2),
  command('path',[[0,0],[1e200,0]],'red',null),command('path',[[0,0],[2]],'red',null),
  command('sprite','https://example.invalid/a',0,0,10,10,0,null),command('sprite','toast',0,0,10,10,0,{x:0,y:0,w:10}),
  command('sprite','toast',0,0,10,10,0,{x:0,y:0,w:NaN,h:1}),command('clip','0',0,1,1),command('restore'),command('save'),command('toString')
 ];
 for(const c of invalid)assert.throws(()=>validateCommands([c]),/./,c.op);
 assert.throws(()=>validateCommands([command('scale',64,64),command('scale',2,2)]),/transform limit/);
 assert.throws(()=>validateCommands(Array.from({length:1201},()=>command('clear','red'))),/draw buffer/);
 assert.throws(()=>safeJSON('🎮'.repeat(100),300),/Output size/);
 const g=new Graphics();g.clear('#f5ecd6');g.save();g.scale(4);g.clip(0,0,40,40);g.actor('toast',10,10,30);g.restore();g.text('Catch!',320,30,24,'#25213b','center');g.sprite('toast',100,50,40,40,0,{x:0,y:0,w:32,h:32});
 assert.doesNotThrow(()=>validateCommands(g.commands));
});

test('renderer restores frame clipping and nested canvas state after an exception',()=>{
 let clipped=false,throws=false;const stack:boolean[]=[],fills:boolean[]=[];
 const context={save(){stack.push(clipped);},restore(){clipped=stack.pop()!;},resetTransform(){},clearRect(){},beginPath(){},rect(){},clip(){clipped=true;},fillRect(){fills.push(clipped);},fillText(){if(throws)throw new Error('Canvas fixture failure');}};
 const canvas={getContext:()=>context} as unknown as HTMLCanvasElement;
 drawCommands(canvas,[command('clip',0,0,10,10),command('clear','red')],new Map(),'cartoon');
 drawCommands(canvas,[command('clear','blue')],new Map(),'cartoon');assert.deepEqual(fills,[true,false]);assert.equal(stack.length,0);
 throws=true;assert.throws(()=>drawCommands(canvas,[command('save'),command('clip',0,0,1,1),command('text','x',0,0,12,'red','left'),command('restore')],new Map(),'cartoon'),/fixture failure/);assert.equal(stack.length,0);assert.equal(clipped,false);
 const images=new Map([['toast',{naturalWidth:32,naturalHeight:32} as HTMLImageElement]]);
 assert.throws(()=>drawCommands(canvas,[command('sprite','toast',0,0,10,10,0,{x:30,y:0,w:5,h:5})],images,'cartoon'),/exceeds its image/);
});
