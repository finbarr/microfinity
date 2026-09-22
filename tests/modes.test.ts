import test from 'node:test';import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
test('Toast Catch runs unchanged in independent races, obstruction and pressure',async()=>{
  const code=await compile(await readFile('games/toast-catch.ts','utf8')),boot=await bootstrap();
  for(const mode of ['race','obstruction','pressure']){
    const vm=await Sandbox.create(code,boot);try{
      vm.call('init',{seed:100,difficulty:1,players:[{id:'p0',name:'A',color:'#fff'},{id:'p1',name:'B',color:'#000'}]},mode);
      let status:any;
      for(let tick=0;tick<1500;tick++){
        status=vm.call('step',tick%15===0?{p1:[{button:'action',down:(tick/15)%2===0}]}:{});
        if(mode==='obstruction'&&tick===121){const view=vm.call('observe','p0');assert.equal(view.game,null);assert.equal(view.mode.obscured,true);}
        if(mode==='race'&&tick===60)assert.deepEqual(vm.call('observe','p0').game.slices,vm.call('observe','p1').game.slices);
        if(status.done)break;
      }
      assert.equal(status.done,true);assert.deepEqual(Object.keys(status.scores),['p0','p1']);
    }finally{vm.dispose();}
  }
});

test('pressure reaches a burst and native observations do not invent an active player',async()=>{
  const code=await compile(await readFile('games/toast-catch.ts','utf8')),boot=await bootstrap(),vm=await Sandbox.create(code,boot);
  try{
    vm.call('init',{seed:1,difficulty:1,players:[{id:'p0',name:'A',color:'#fff'},{id:'p1',name:'B',color:'#000'}]},'pressure');
    let status:any;
    for(let tick=0;tick<240;tick++){const edge=tick%14===0?[{button:'action',down:true}]:tick%14===1?[{button:'action',down:false}]:[];status=vm.call('step',{p1:edge});if(status.roles.p1==='challenger')break;}
    assert.equal(status.outcomes.p0,'failure');assert.equal(status.roles.p1,'challenger');assert.ok(status.feedback.some((f:any)=>f.kind==='failure'));assert.ok(status.time<4);
    vm.call('init',{seed:1,difficulty:1,players:[{id:'p0',name:'A',color:'#fff'}]},'native');assert.deepEqual(vm.call('observe','p0').mode,{kind:'native'});
  }finally{vm.dispose();}
});
