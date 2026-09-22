import test from 'node:test';import assert from 'node:assert/strict';
import {GenerationBudget,generationLimits} from '../server/generation-budget';
import {compileIsolated} from '../server/compile-process';
import {readFile} from 'node:fs/promises';

test('provider reservations enforce cumulative UTF-8, token, request and image bounds',()=>{
 const budget=new GenerationBudget(generationLimits({maxCalls:3,maxInputBytes:1000,maxOutputTokens:2000},{}));
 try{
  budget.reserve({prompt:'é'.repeat(100)},1000,true);const first=structuredClone(budget.usage);assert.ok(first.inputBytes>200);
  assert.throws(()=>budget.reserve({prompt:'x'},0,true),/one-image budget/);assert.deepEqual(budget.usage,first);
  assert.throws(()=>budget.reserve({prompt:'é'.repeat(500)},0),/input-size budget/);assert.deepEqual(budget.usage,first);
  assert.throws(()=>budget.reserve({},1001),/output-token budget/);assert.deepEqual(budget.usage,first);
  budget.reserve({},1000);budget.reserve({},0);assert.throws(()=>budget.reserve({},0),/request budget/);
 }finally{budget.dispose();}
 assert.throws(()=>generationLimits({}, {GENERATION_TIMEOUT_MS:'NaN'}));assert.throws(()=>generationLimits({}, {GENERATION_CODE_ATTEMPTS:'100'}));
});

test('compiler cancellation interrupts active work and leaves later compilation usable',async()=>{
 const source=await readFile('games/toast-catch.ts','utf8'),cancelled=new AbortController();cancelled.abort(new Error('Already cancelled'));
 await assert.rejects(()=>compileIsolated(source,cancelled.signal),/Already cancelled/);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('Fixture work deadline')),25),start=performance.now();
 try{await assert.rejects(()=>compileIsolated(source,controller.signal),/Fixture work deadline/);assert.ok(performance.now()-start<2000,'Cancellation must not wait for the compiler watchdog');}finally{clearTimeout(timer);}
 assert.equal((await compileIsolated(source)).meta.id,'toast-catch');
});
