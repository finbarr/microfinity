import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';import {RuntimeProcess} from '../server/runtime-process';
const config={seed:41,difficulty:1,players:[{id:'p0',name:'Toastie',color:'#86efac'}]};
test('compiled rules step and restore deterministically; drawing does not consume RNG',async()=>{
  const source=await readFile('games/toast-catch.ts','utf8'),code=await compile(source),boot=await bootstrap();
  const a=await Sandbox.create(code,boot),b=await Sandbox.create(code,boot);
  try{a.call('init',config);b.call('init',config);
    for(let i=0;i<720;i++){
      const edges=i%60===0?{p0:[{button:'right',down:i%120===0}]}:{};
      a.call('step',edges);b.call('step',edges);
      if(i===350){const saved=a.call('save');a.call('step',{});a.call('restore',saved);}
      if(i%30===0){const view=a.call('observe','p0');a.call('draw',view.game);}
    }
    assert.deepEqual(a.call('save'),b.call('save'));assert.equal(a.call('observe','p0').done,true);
    assert.ok(!('schedule' in a.call('observe','p0').game));
  }finally{a.dispose();b.dispose();}
});
test('compiler rejects privileged APIs, invalid types and imports',async()=>{
  for(const source of ['import fs from "node:fs";','const now=Date.now();','const x: number = "oops";','let bad=1;'])await assert.rejects(()=>compile(source));
});
test('infinite cartridge is interrupted and another process continues',async()=>{
  const boot=await bootstrap();await assert.rejects(()=>Sandbox.create('while(true){}',boot),/interrupted/);
  const code=await compile(await readFile('games/toast-catch.ts','utf8')),worker=await RuntimeProcess.create(code);
  try{await worker.call('init',config);assert.equal((await worker.call('step',{})).tick,1);}finally{worker.dispose();}
});

test('runtime isolation survives a looping or allocating cartridge and has no host capabilities',async()=>{
  const code=await compile(await readFile('games/toast-catch.ts','utf8'));
  const [healthy,looping]=await Promise.all([RuntimeProcess.create(code),RuntimeProcess.create(code+'\n__cartridge.default.step=function(){while(true){}};')]);
  try{
    await Promise.all([healthy.call('init',config),looping.call('init',config)]);
    const [bad,good]=await Promise.allSettled([looping.call('step',{}),healthy.call('step',{})]);assert.equal(bad.status,'rejected');assert.equal(good.status,'fulfilled');
    if(bad.status==='rejected')assert.match(bad.reason.message,/interrupted|deadline/);if(good.status==='fulfilled')assert.equal(good.value.tick,1);
    assert.equal((await healthy.call('step',{})).tick,2);
  }finally{healthy.dispose();looping.dispose();}
  const boot=await bootstrap();
  const probe=await Sandbox.create(code+'\n__cartridge.default.hud=()=>({});__cartridge.default.observe=()=>({process:typeof process,network:typeof fetch,filesystem:typeof require,browser:typeof document,audio:typeof AudioContext,reflectedHost:("".constructor.constructor("return typeof process"))()});',boot);
  try{probe.call('init',config);const v=probe.call('observe','p0').game;assert.ok(Object.values(v).every(x=>x==='undefined'));}finally{probe.dispose();}
  const allocation=await Sandbox.create(code+'\n__cartridge.default.step=function(){const data=new Uint8Array(64*1024*1024);data.fill(1);};',boot);
  try{allocation.call('init',config);assert.throws(()=>allocation.call('step',{}),/memory|allocation|interrupted/i);}finally{allocation.dispose();}
  await assert.rejects(()=>Sandbox.create(code+'\n__cartridge.default.assets=["https://example.invalid/sprite.png"];',boot),/pattern|Invalid|format/i);
});

test('undefined observations and non-finite state are rejected before JSON can silently erase them',async()=>{
  const original=await readFile('games/toast-catch.ts','utf8'),boot=await bootstrap();
  const missing=await Sandbox.create(await compile(original.replace('return {x:s.x,slices:','return {missing:undefined,x:s.x,slices:')),boot);
  try{missing.call('init',config);assert.throws(()=>missing.call('observe','p0'),/observe.missing.*JSON/);}finally{missing.dispose();}
  const invalid=await Sandbox.create(await compile(original.replace('return {x:320,','return {x:NaN,')),boot);
  try{assert.throws(()=>invalid.call('init',config),/state.x.*JSON/);}finally{invalid.dispose();}
});
