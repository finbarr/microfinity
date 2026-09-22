import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';import {emptyButtons,colors} from '../sdk/index';import {buttonEdges} from '../runtime/input';import {scriptedDecision,jevState,playerEntities} from '../server/controllers';
for(const name of ['nose-dive','crawl-for-gold'])test(`${name}: skill wins, idle terminates, replay and same-tick ties are fair`,async()=>{
 const source=await readFile(`games/${name}.ts`,'utf8'),vm=await Sandbox.create(await compile(source),await bootstrap()),meta=vm.call('meta').meta;
 try{
  for(const count of [2,4])for(const difficulty of [0,3]){
   const config={seed:17,difficulty,players:Array.from({length:count},(_,i)=>({id:`p${i}`,name:`P${i}`,color:colors[i]}))};
   let status=vm.call('init',config),held=emptyButtons();const journal:any[]=[];
   while(!status.done){const view=vm.call('observe','p0'),buttons=scriptedDecision(meta,view,held).buttons,edges={p0:buttonEdges(held,buttons)};held=buttons;journal.push(edges);status=vm.call('step',edges);if(status.tick%30===0)vm.call('draw',vm.call('observe','p0').game);}
   assert.equal(status.outcomes.p0,'success');assert.ok(status.scores.p0>0);assert.ok(config.players.slice(1).every(p=>status.scores[p.id]===0));
   const final=vm.call('save');vm.call('init',config);for(const edges of journal)vm.call('step',edges);assert.deepEqual(vm.call('save'),final);
   status=vm.call('init',config);while(!status.done)status=vm.call('step',{});assert.ok(Object.values(status.outcomes).every(o=>o==='failure'));
  }
  if(name==='crawl-for-gold'){
   const config={seed:1,difficulty:1,players:[{id:'p0',name:'A',color:colors[0]},{id:'p1',name:'B',color:colors[1]}]};
   let status=vm.call('init',config);while(!status.done)status=vm.call('step',{p0:[{button:'action',down:true},{button:'action',down:false}]});assert.equal(status.scores.p0,0,'rapid taps cannot finish a pull');
   status=vm.call('init',config);let held=emptyButtons();while(!status.done){const buttons=scriptedDecision(meta,vm.call('observe','p0'),held).buttons,edges=buttonEdges(held,buttons);held=buttons;status=vm.call('step',{p0:edges,p1:edges});}assert.deepEqual(status.outcomes,{p0:'success',p1:'success'},'same-tick finishes are tied');
  }
 }finally{vm.dispose();}
});
test('controller highlights the requested seat using only visible entities',()=>{
 const game={crawlers:[{id:'p0',stage:'reach'},{id:'p1',stage:'pull'}],target:.65};
 assert.deepEqual(playerEntities(game,'p1'),[{path:'visibleNow.crawlers.1',entity:game.crawlers[1]}]);assert.deepEqual(playerEntities(game,'p3'),[]);
});
test('Jev receives source and timing but never unfiltered runtime fields',async()=>{
 const source=await readFile('games/cup-shuffle.ts','utf8'),vm=await Sandbox.create(await compile(source),await bootstrap());
 try{vm.call('init',{seed:91,difficulty:1,players:[{id:'p0',name:'A',color:colors[0]}]});const view=vm.call('observe','p0'),meta=vm.call('meta').meta;
  const state=jevState(meta,{...view,seed:91,secret:999},emptyButtons(),[],{source,intervalMs:200,expectedLatencyMs:110,observationAgeMs:33});
  assert.match(state.game.cartridgeSource!,/step\(s,inputs,ctx\)/);assert.ok(!state.game.cartridgeSource!.includes('draw(v,g)'));assert.deepEqual(state.visibleNow,view.game);assert.ok(!('seed' in state));assert.ok(!('secret' in state));assert.ok(!('secret' in state.visibleNow));assert.equal(state.clock?.decisionIntervalMs,200);assert.match(state.controllerContract!,/does NOT press/);
 }finally{vm.dispose();}
});
