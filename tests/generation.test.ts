import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {GenerationService} from '../server/generation';import {stockScore} from '../runtime/music';import {hash, type Store} from '../server/store';
import type {GenerationLimits} from '../server/generation-budget';
import type {MusicGenerationAdapter,MusicOutput} from '../server/music-generation';
const pause=()=>new Promise(r=>setTimeout(r,5));
async function until(check:()=>any){const start=Date.now();while(!check()){if(Date.now()-start>25000)throw new Error('Fixture job did not settle');await pause();}}
function fixture(limits:Partial<GenerationLimits>={},providerFetch?:typeof fetch,musicProvider?:MusicGenerationAdapter){
 const sourceMusic={hash:'old-music',score:stockScore('toast-catch'),provenance:{model:'fixture-only'}};
 const original={id:'original',manifest:{gameId:'toast-catch',sdkVersion:'1.0.0',meta:{id:'toast-catch',title:'Toast Catch',description:'Fixture',clock:'realtime',players:[1,1]},assets:[{name:'toast',hash:'original-art'}],audio:{music:'main-loop',soundPack:'soft-toy'},music:sourceMusic,provenance:{}},source:'original-source',code:'original-code'};
 const records:any[]=[],versions:any[]=[],queries:any[]=[];
 const store={async query(_sql:string,params:any[]){queries.push(params);if(params[3]){records.push(JSON.parse(params[3]));return [];}const record=[...records].reverse().find(r=>r.id===params[0]&&r.ownerId===params[1]);return record?[{record:structuredClone(record)}]:[];},async version(id:string){return id==='original'?original:versions.find(v=>v.id===id);},async runtime(){return 'original-runtime';},async putAsset(bytes:Buffer){return {hash:hash(bytes),url:`/assets/${hash(bytes)}.wav`};},async putVersion(source:any,code:any,meta:any,assets:any,music:any,provenance:any,_owner:any,pinned:any,audio:any,guard?:()=>void){guard?.();const id=`version-${versions.length}`;const v={id,source,code,pinned,manifest:{meta,assets,music,provenance,audio}};versions.push(structuredClone(v));return v;}};
 const service=new GenerationService(store as unknown as Store,limits,providerFetch,musicProvider);
 const brief={title:'Toast Catch',premise:'Catch toast',clock:'realtime',minPlayers:1,maxPlayers:1,style:'cartoon',assetName:'toast',assetDescription:'Toast',musicMood:'playful'};
 return {service,store,records,versions,original,brief};
}
test('pending soundtrack leaves an immutable draft; final publication has atomic ready status',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const f=fixture();let resolveMusic!:(s:any)=>void;
  (f.service as any).json=async(_j:any,_m:any,branch:string)=>branch==='brief'?f.brief:new Promise(r=>resolveMusic=r);
  const job=await f.service.create('owner','Give this loop a new soft melody',{remix:'original',musicOnly:true});
  await until(()=>f.versions.length===1&&resolveMusic);const draft=structuredClone(f.versions[0]);
  assert.equal(draft.manifest.music,null);assert.equal(draft.manifest.provenance.draft,true);
  assert.equal((await f.service.get(job.id,'owner')).status,'working');assert.equal(draft.pinned.runtime,'original-runtime');
  resolveMusic(stockScore('toast-catch'));await until(()=>f.records.at(-1)?.status==='ready');
  const final=f.versions.at(-1);assert.notEqual(final.id,draft.id);assert.ok(final.manifest.music.hash);assert.equal(final.source,f.original.source);assert.deepEqual(final.manifest.assets,f.original.manifest.assets);
  assert.deepEqual(f.versions[0],draft);assert.ok(f.records.filter(r=>r.finishedVersion).every(r=>r.status==='ready'));
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('deadline preserves a draft, releases admission and ignores a late non-cancellable adapter',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const f=fixture({timeoutMs:1000});let finishMusic!:(value:any)=>void;
  (f.service as any).json=async(_j:any,_m:any,branch:string)=>branch==='brief'?f.brief:new Promise(resolve=>finishMusic=resolve);
  const job=await f.service.create('owner','Compose a delayed fixture soundtrack',{remix:'original',musicOnly:true});
  await until(()=>f.versions.length===1&&finishMusic);const preview=structuredClone(f.versions[0]);
  await until(()=>f.records.at(-1)?.status==='failed');await pause();
  const failed=await f.service.get(job.id,'owner');assert.match(failed.error!,/work deadline/);assert.ok(failed.previewVersion);assert.equal(failed.finishedVersion,undefined);
  const savedCount=f.records.length;finishMusic(stockScore('toast-catch'));await new Promise(r=>setTimeout(r,30));
  assert.equal(f.versions.length,1);assert.deepEqual(f.versions[0],preview);assert.equal(f.records.length,savedCount);
  (f.service as any).json=async()=>{throw new Error('Next request can run');};
  const next=await f.service.create('owner','New request after an expired job');await until(()=>f.records.at(-1)?.id===next.id&&f.records.at(-1).status==='failed');
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('SDK requests receive cancellation and reserve bounded cost before dispatch',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  let aborted=false,calls=0;
  const slow=fixture({timeoutMs:1000},async(_url,init)=>{calls++;return new Promise((_resolve,reject)=>{const stop=()=>{aborted=true;reject(init!.signal!.reason);};init!.signal!.addEventListener('abort',stop,{once:true});if(init!.signal!.aborted)stop();});});
  const pending=await slow.service.create('owner','Slow SDK request fixture');await until(()=>slow.records.at(-1)?.status==='failed');
  assert.equal(calls,1);assert.equal(aborted,true);assert.match((await slow.service.get(pending.id,'owner')).error!,/work deadline/);
  let overBudgetDispatches=0;
  const limited=fixture({maxOutputTokens:1000},async()=>{overBudgetDispatches++;throw new Error('Must not dispatch');});
  const blocked=await limited.service.create('owner','Too little output budget for brief');await until(()=>limited.records.at(-1)?.status==='failed');
  assert.equal(overBudgetDispatches,0);const failed=await limited.service.get(blocked.id,'owner');assert.match(failed.error!,/output-token budget/);assert.equal(failed.budget?.reserved.calls,0);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('completed job cache is bounded without losing durable owner-only history or active work',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const f=fixture({cachedJobs:2});let stopActive!:(error:Error)=>void;
  (f.service as any).json=async(job:any)=>{if(job.ownerId==='active')return new Promise((_resolve,reject)=>stopActive=reject);throw new Error('Fixture failure');};
  const active=await f.service.create('active','Keep this fixture job active');await until(()=>stopActive);
  const jobs:{id:string}[]=[];for(let i=0;i<4;i++){const job=await f.service.create('owner','Finish another fixture job');jobs.push(job);await until(()=>f.records.at(-1)?.id===job.id&&f.records.at(-1).status==='failed');await pause();}
  assert.equal((f.service as any).jobs.size,3);assert.equal((await f.service.get(active.id,'active')).status,'working');
  assert.equal((f.service as any).jobs.has(jobs[0].id),false);assert.equal((await f.service.get(jobs[0].id,'owner')).status,'failed');await assert.rejects(()=>f.service.get(jobs[0].id,'someone-else'),/not found/);
  stopActive(new Error('Fixture complete'));await until(()=>f.records.at(-1)?.id===active.id&&f.records.at(-1).status==='failed');await pause();assert.equal((f.service as any).jobs.size,2);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('admission reserves pending writes and releases failed initial and terminal saves',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const f=fixture(),save=f.store.query.bind(f.store),writes:{resolve:()=>void;reject:(e:Error)=>void}[]=[],briefs:((e:Error)=>void)[]=[];
  f.store.query=async(sql,params)=>{await new Promise<void>((resolve,reject)=>writes.push({resolve,reject}));return save(sql,params);};
  (f.service as any).json=async()=>new Promise((_resolve,reject)=>briefs.push(reject));
  const first=f.service.create('a','Create a fixture game'),second=f.service.create('b','Create another fixture game');
  await assert.rejects(f.service.create('c','Create a third fixture game'),/already running/);
  await assert.rejects(f.service.create('a','Create a duplicate fixture game'),/already running/);
  assert.equal(writes.length,2);assert.equal(briefs.length,0,'providers wait for durable admission');
  writes[0].reject(new Error('Initial write failed'));await assert.rejects(first,/Initial write failed/);
  const replacement=f.service.create('a','Retry the first fixture game');assert.equal(writes.length,3);
  f.store.query=save;writes[1].resolve();writes[2].resolve();
  const [b,a]=await Promise.all([second,replacement]);await until(()=>briefs.length===2);
  await assert.rejects(f.service.create('c','Still no capacity for another'),/already running/);
  let terminalFailures=0;
  f.store.query=async(sql,params)=>{if(params[2]==='failed'&&terminalFailures++===0)throw new Error('Terminal write failed');return save(sql,params);};
  for(const reject of briefs)reject(new Error('Fixture provider failure'));
  await until(()=>f.records.some(r=>r.id===a.id&&r.status==='failed')&&f.records.some(r=>r.id===b.id&&r.status==='failed'));
  await pause();
  assert.ok([await f.service.get(a.id,'a'),await f.service.get(b.id,'b')].some(j=>j.error?.includes('final status could not be saved')));
  const next=await f.service.create('c','Capacity returns after terminal failure');await until(()=>briefs.length===3);briefs[2](new Error('Fixture complete'));
  await until(()=>f.records.some(r=>r.id===next.id&&r.status==='failed'));
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
test('music failures preserve a preview and retry succeeds; rule remixes can reuse saved audio',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const f=fixture();let musicCalls=0;
  (f.service as any).json=async(_j:any,_m:any,branch:string)=>{if(branch==='brief')return f.brief;musicCalls++;return {...stockScore('toast-catch'),bpm:999};};
  const failed=await f.service.create('owner','Replace only this fixture music',{remix:'original',musicOnly:true});
  await until(()=>f.records.at(-1)?.status==='failed');assert.equal(musicCalls,2);assert.ok(f.records.at(-1).previewVersion);assert.equal(f.records.at(-1).branches.music,'failed');
  await pause();(f.service as any).json=async(_j:any,_m:any,branch:string)=>branch==='brief'?f.brief:stockScore('toast-catch');
  const retried=await f.service.create('owner','Retry the fixture music loop',{remix:failed.previewVersion??'original',musicOnly:true});
  await until(()=>f.records.at(-1)?.id===retried.id&&f.records.at(-1)?.status==='ready');await pause();
  const source=await readFile('games/toast-catch.ts','utf8');
  (f.service as any).json=async(_j:any,_m:any,branch:string)=>{if(branch==='brief')return f.brief;if(branch==='cartridge')return {source};throw new Error('Reuse must not call the music model');};
  const remixed=await f.service.create('owner','Keep this fixture music and art',{remix:'original',art:false,reuseMusic:true});
  await until(()=>f.records.at(-1)?.id===remixed.id&&f.records.at(-1)?.status!=='working');
  assert.equal(f.records.at(-1).status,'ready',f.records.at(-1).error);assert.equal(f.records.at(-1).branches.music,'reused');assert.deepEqual(f.versions.at(-1).manifest.music,f.original.manifest.music);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});


test('injected music adapters share provider reservations and cannot publish late output after cancellation',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  let finish!:(value:MusicOutput)=>void,signal:AbortSignal|undefined;
  const f=fixture({timeoutMs:1000},undefined,{async generate(request,context){context.reserve(request,0);signal=context.signal;return new Promise(resolve=>finish=resolve);}});
  (f.service as any).json=async()=>f.brief;
  const job=await f.service.create('owner','Delayed external music fixture',{remix:'original',musicOnly:true});
  await until(()=>f.versions.length===1&&finish);const preview=structuredClone(f.versions[0]);
  await until(()=>f.records.at(-1)?.status==='failed');await pause();assert.equal(signal?.aborted,true);assert.equal((await f.service.get(job.id,'owner')).budget?.reserved.calls,1);
  const writes=f.records.length;finish({kind:'score',score:stockScore('toast-catch'),provenance:{provider:'fixture-only',model:'late'}});await new Promise(r=>setTimeout(r,30));
  assert.equal(f.records.length,writes);assert.equal(f.versions.length,1);assert.deepEqual(f.versions[0],preview);
  let dispatched=0;
  const limited=fixture({maxCalls:1},undefined,{async generate(request,context){context.reserve(request,0);dispatched++;context.reserve(request,0);throw new Error('Must not reach a second request');}});
  (limited.service as any).json=async()=>limited.brief;
  await limited.service.create('owner','Bound external music requests',{remix:'original',musicOnly:true});await until(()=>limited.records.at(-1)?.status==='failed');
  assert.equal(dispatched,1);assert.equal(limited.records.at(-1).budget.reserved.calls,1);assert.match(limited.records.at(-1).error,/request budget/);assert.equal(limited.records.at(-1).finishedVersion,undefined);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});


test('ready music and artwork are exposed while code is still being created',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const f=fixture();let finishCode!:(value:any)=>void;
  (f.service as any).json=async(_j:any,_m:any,branch:string)=>branch==='brief'?f.brief:branch==='music'?stockScore('toast-catch'):new Promise(resolve=>finishCode=resolve);
  const job=await f.service.create('owner','Change the fixture rules while showing media',{remix:'original',art:false});
  await until(()=>typeof finishCode==='function'&&f.records.some(r=>r.previewMusic&&r.branches.code==='working'));
  const progress=await f.service.get(job.id,'owner');assert.equal(progress.status,'working');assert.equal(progress.previewVersion,undefined);assert.deepEqual(progress.previewArt,f.original.manifest.assets);assert.ok((progress.previewMusic as any).url);assert.equal(progress.branches.music,'ready');
  finishCode({source:await readFile('games/toast-catch.ts','utf8')});await until(()=>f.records.at(-1)?.status!=='working');assert.equal(f.records.at(-1).status,'ready',f.records.at(-1).error);
  assert.deepEqual(f.versions.at(-1).manifest.music,progress.previewMusic);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
