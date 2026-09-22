import test from 'node:test';import assert from 'node:assert/strict';import {DecisionScheduler} from '../server/controllers';import {emptyButtons} from '../sdk/index';
test('decision opportunities align to clock and bound concurrency; handoff rejects stale response',async()=>{
  const scheduler=new DecisionScheduler(200);let calls=0,applied=0,resolve:any,epoch=0;
  const current=()=>({round:'r1',epoch,role:'player',tick:0}),decide=()=>{calls++;return new Promise<any>(r=>resolve=r);},apply=()=>applied++;
  scheduler.opportunity(50,current(),decide,current,apply);scheduler.opportunity(199,current(),decide,current,apply);assert.equal(calls,1);assert.equal(scheduler.next,200);
  scheduler.opportunity(201,current(),decide,current,apply);assert.equal(calls,1);assert.equal(scheduler.metrics[1].skipped,'outstanding');epoch++;
  resolve({buttons:emptyButtons(),source:'jev',latencyMs:100});await new Promise(r=>setImmediate(r));assert.equal(applied,0);assert.equal(scheduler.metrics[0].stale,true);
  scheduler.opportunity(403,current(),async()=>({buttons:emptyButtons(),source:'jev',latencyMs:1}),current,apply);await new Promise(r=>setImmediate(r));assert.equal(applied,1);assert.equal(scheduler.next,600);
});

test('all rooms share bounded Jev capacity without accumulating stale work',async()=>{
  const {DecisionPool}=await import('../server/controllers');const pool=new DecisionPool(2);let doneA!:()=>void,doneB!:()=>void;
  const a=pool.run(()=>new Promise<void>(r=>doneA=r)),b=pool.run(()=>new Promise<void>(r=>doneB=r));
  await assert.rejects(()=>pool.run(async()=>1),/capacity/);assert.equal(pool.active,2);assert.equal(pool.declined,1);
  doneA();await a;await assert.rejects(()=>pool.run(async()=>{throw new Error('provider unavailable');}),/unavailable/);assert.equal(pool.active,1);
  doneB();await b;assert.equal(await pool.run(async()=>42),42);assert.equal(pool.active,0);assert.equal(pool.peak,2);
});
