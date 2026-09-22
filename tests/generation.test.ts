import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {GenerationService} from '../server/generation';import {stockScore} from '../runtime/music';import {hash, type Store} from '../server/store';
import type {GenerationLimits} from '../server/generation-budget';
import type {MusicGenerationAdapter,MusicOutput} from '../server/music-generation';
import sharp from 'sharp';
const pause=()=>new Promise(r=>setTimeout(r,5));
async function until(check:()=>any){const start=Date.now();while(!check()){if(Date.now()-start>70000)throw new Error('Fixture job did not settle');await pause();}}
const partySource=(source:string)=>source.replace('players:[1,1]','players:[1,4]').replace("modifiers:['race','obstruction','pressure']",'modifiers:[]');
function fixture(limits:Partial<GenerationLimits>={},providerFetch?:typeof fetch,musicProvider?:MusicGenerationAdapter){
 const sourceMusic={hash:'old-music',score:stockScore('toast-catch'),provenance:{model:'fixture-only'}};
 const original={id:'original',manifest:{gameId:'toast-catch',sdkVersion:'1.0.0',meta:{id:'toast-catch',title:'Toast Catch',description:'Fixture',clock:'realtime',players:[1,1]},assets:[{name:'toast',hash:'original-art'}],audio:{music:'main-loop',soundPack:'soft-toy'},music:sourceMusic,provenance:{}},source:'original-source',code:'original-code'};
 const records:any[]=[],versions:any[]=[],queries:any[]=[];
 const store={async query(_sql:string,params:any[]){queries.push(params);if(params[3]){records.push(JSON.parse(params[3]));return [];}const record=[...records].reverse().find(r=>r.id===params[0]&&r.ownerId===params[1]);return record?[{record:structuredClone(record)}]:[];},async version(id:string){return id==='original'?original:versions.find(v=>v.id===id);},async runtime(){return 'original-runtime';},async putAsset(bytes:Buffer){return {hash:hash(bytes),url:`/assets/${hash(bytes)}.png`};},async putVersion(source:any,code:any,meta:any,assets:any,music:any,provenance:any,_owner:any,pinned:any,audio:any,guard?:()=>void,icon?:any){guard?.();const id=`version-${versions.length}`;const v={id,source,code,pinned,manifest:{meta,assets,music,provenance,audio,...(icon?{icon}:{})}};versions.push(structuredClone(v));return v;}};
 const noExternalImages=(async()=>new Response(JSON.stringify({error:{message:'fixture image unavailable',type:'server_error'}}),{status:500,headers:{'content-type':'application/json'}})) as typeof fetch;
 const service=new GenerationService(store as unknown as Store,limits,providerFetch??noExternalImages,musicProvider);
 const brief={title:'Toast Catch',premise:'Catch toast',clock:'realtime',style:'cartoon',assetName:'toast',assetDescription:'Toast',musicMood:'playful'};
 return {service,store,records,versions,original,brief};
}
test('pending soundtrack leaves an immutable draft; final publication has atomic ready status',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const f=fixture();(f.original.manifest as any).icon={name:'cartridge-icon',hash:'original-icon',url:'/assets/original-icon.png',width:256,height:256};let resolveMusic!:(s:any)=>void;
  (f.service as any).json=async(_j:any,_m:any,branch:string)=>branch==='brief'?f.brief:new Promise(r=>resolveMusic=r);
  const job=await f.service.create('owner','Give this loop a new soft melody',{remix:'original',musicOnly:true});
  await until(()=>f.versions.length===1&&resolveMusic);const draft=structuredClone(f.versions[0]);
  assert.equal(draft.manifest.music,null);assert.equal(draft.manifest.provenance.draft,true);assert.deepEqual(draft.manifest.icon,(f.original.manifest as any).icon);
  assert.equal((await f.service.get(job.id,'owner')).status,'working');assert.equal(draft.pinned.runtime,'original-runtime');
  resolveMusic(stockScore('toast-catch'));await until(()=>f.records.at(-1)?.status==='ready');
  const final=f.versions.at(-1);assert.notEqual(final.id,draft.id);assert.ok(final.manifest.music.hash);assert.equal(final.source,f.original.source);assert.deepEqual(final.manifest.assets,f.original.manifest.assets);assert.deepEqual(final.manifest.icon,(f.original.manifest as any).icon);assert.deepEqual(final.manifest.meta,f.original.manifest.meta);
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
  const source=partySource(await readFile('games/toast-catch.ts','utf8'));
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
  finishCode({source:partySource(await readFile('games/toast-catch.ts','utf8'))});await until(()=>f.records.at(-1)?.status!=='working');assert.equal(f.records.at(-1).status,'ready',f.records.at(-1).error);
  assert.deepEqual(f.versions.at(-1).manifest.music,progress.previewMusic);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('rule creation ignores deprecated format choices and repairs legacy player bounds',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const f=fixture(),solo=await readFile('games/toast-catch.ts','utf8');
  let briefSchema:any,briefPrompt='',codePrompt='',cartridgeCalls=0;
  (f.service as any).json=async(_job:any,_model:any,branch:string,schema:any,prompt:string)=>{
   if(branch==='brief'){briefSchema=schema;briefPrompt=prompt;return f.brief;}
   if(branch==='cartridge'){cartridgeCalls++;codePrompt=prompt;return {source:cartridgeCalls===1?solo:partySource(solo)};}
   throw new Error('Saved music must be reused');
  };
  const job=await f.service.create('owner','Make this breakfast game a timed party challenge',{remix:'original',art:false,reuseMusic:true,format:{clock:'action',minPlayers:2,maxPlayers:2}});
  await until(()=>f.records.at(-1)?.status!=='working');const done=await f.service.get(job.id,'owner');
  assert.equal(done.status,'ready',done.error??'Unexpected failure');assert.equal(done.format,undefined);
  assert.deepEqual(briefSchema.properties.clock.enum,['realtime','action']);
  assert.equal(briefSchema.properties.minPlayers,undefined);assert.equal(briefSchema.properties.maxPlayers,undefined);
  assert.match(briefPrompt,/Infer realtime versus turn-based play from the prompt/);
  assert.doesNotMatch(briefPrompt,/minimum, maximum|Preserve this format/);
  assert.match(codePrompt,/meta.players MUST be \[1,4\]/);assert.match(codePrompt,/process each active seat's input/);
  assert.equal(cartridgeCalls,2);assert.match(done.attempts[0].error!,/players:\[1,4\]/);
  assert.deepEqual(f.versions.at(-1).manifest.meta.players,[1,4]);assert.equal(f.versions.at(-1).manifest.meta.clock,'realtime');
  assert.deepEqual(f.versions.at(-1).manifest.music,f.original.manifest.music);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('media refresh requests a distinct cover image and gameplay sprite, then publishes both',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const sprite=await sharp({create:{width:24,height:24,channels:4,background:{r:220,g:80,b:30,alpha:1}}}).extend({top:20,bottom:20,left:20,right:20,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const cover=await sharp({create:{width:80,height:80,channels:3,background:{r:30,g:80,b:180}}}).png().toBuffer();
  const prompts:string[]=[];
  const fetcher=(async(_url:any,init:any)=>{const body=JSON.parse(String(init.body));prompts.push(body.prompt);const bytes=body.prompt.startsWith('One original game sprite')?sprite:cover;return new Response(JSON.stringify({created:1,data:[{b64_json:bytes.toString('base64')}],usage:{input_tokens:1}}),{headers:{'content-type':'application/json'}});}) as typeof fetch;
  const f=fixture({},fetcher);(f.service as any).json=async(_j:any,_m:any,branch:string)=>branch==='brief'?f.brief:stockScore('toast-catch');
  const job=await f.service.create('owner','Refresh the art and music for this existing game',{remix:'original',mediaOnly:true});
  await until(()=>f.records.at(-1)?.status!=='working');const done=await f.service.get(job.id,'owner');
  assert.equal(done.status,'ready',done.error??'Unexpected failure');assert.equal(done.branches.icon,'ready');assert.equal(done.budget?.reserved.images,2);assert.equal(prompts.length,2);
  assert.ok(prompts.some(p=>p.includes('game sprite')));assert.ok(prompts.some(p=>p.includes('square cover illustration')));
  const final=f.versions.at(-1);assert.ok(final.manifest.icon);assert.equal(final.manifest.icon.name,'cartridge-icon');
  assert.notEqual(final.manifest.icon.hash,final.manifest.assets[0].hash);assert.deepEqual(done.previewIcon,final.manifest.icon);
  assert.equal(final.source,f.original.source);assert.equal(final.pinned.runtime,'original-runtime');assert.deepEqual(final.manifest.meta,f.original.manifest.meta);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('a new game starts a playable draft while its dedicated icon is still pending',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const source=partySource(await readFile('games/toast-catch.ts','utf8'));
  const sprite=await sharp({create:{width:24,height:24,channels:4,background:{r:220,g:80,b:30,alpha:1}}}).extend({top:20,bottom:20,left:20,right:20,background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
  const cover=await sharp({create:{width:80,height:80,channels:3,background:{r:30,g:80,b:180}}}).png().toBuffer();
  let finishIcon!:(response:Response)=>void;
  const requests:string[]=[];
  const fetcher=(async(_url:any,init:any)=>{const body=JSON.parse(String(init.body));requests.push(body.prompt);if(body.prompt.includes('square cover illustration'))return new Promise<Response>(resolve=>finishIcon=resolve);return new Response(JSON.stringify({created:1,data:[{b64_json:sprite.toString('base64')}]}),{headers:{'content-type':'application/json'}});}) as typeof fetch;
  const f=fixture({},fetcher);
  (f.service as any).json=async(job:any,_model:any,branch:string)=>branch==='brief'?f.brief:branch==='cartridge'?{source:source.replace("id:'toast-catch'",`id:'creation-${job.id.slice(0,12)}'`)}:stockScore('toast-catch');
  const job=await f.service.create('owner','Make a fast breakfast catching microgame');
  await until(()=>f.versions.length===1&&finishIcon);const draft=structuredClone(f.versions[0]);
  assert.equal(draft.manifest.provenance.draft,true);assert.equal(draft.manifest.icon,undefined);
  assert.equal((await f.service.get(job.id,'owner')).branches.icon,'working');
  finishIcon(new Response(JSON.stringify({created:1,data:[{b64_json:cover.toString('base64')}]}),{headers:{'content-type':'application/json'}}));
  await until(()=>f.records.at(-1)?.status!=='working');const done=await f.service.get(job.id,'owner');
  assert.equal(done.status,'ready',done.error??'Unexpected failure');assert.equal(done.branches.icon,'ready');assert.equal(requests.length,2);
  assert.ok(f.versions.at(-1).manifest.icon);assert.notEqual(f.versions.at(-1).manifest.icon.hash,f.versions.at(-1).manifest.assets[0].hash);
  assert.deepEqual(f.versions[0],draft);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('a rules remix reuses gameplay art but generates its own cover',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const source=partySource(await readFile('games/toast-catch.ts','utf8'));
  const cover=await sharp({create:{width:80,height:80,channels:3,background:{r:30,g:80,b:180}}}).png().toBuffer();
  const prompts:string[]=[];
  const fetcher=(async(_url:any,init:any)=>{const body=JSON.parse(String(init.body));prompts.push(body.prompt);return new Response(JSON.stringify({created:1,data:[{b64_json:cover.toString('base64')}]}),{headers:{'content-type':'application/json'}});}) as typeof fetch;
  const f=fixture({},fetcher);(f.original.manifest as any).icon={name:'cartridge-icon',hash:'parent-cover',url:'/assets/parent-cover.png',width:256,height:256};
  (f.service as any).json=async(_j:any,_m:any,branch:string)=>branch==='brief'?f.brief:branch==='cartridge'?{source}:stockScore('toast-catch');
  const job=await f.service.create('owner','Change the breakfast rules but retain gameplay art',{remix:'original',art:false});
  await until(()=>f.records.at(-1)?.status!=='working');const done=await f.service.get(job.id,'owner');
  assert.equal(done.status,'ready',done.error??'Unexpected failure');assert.equal(done.branches.art,'reused');assert.equal(done.branches.icon,'ready');
  assert.equal(done.budget?.reserved.images,1);assert.equal(prompts.length,1);assert.match(prompts[0],/square cover illustration/);
  const final=f.versions.at(-1);assert.deepEqual(final.manifest.assets,f.original.manifest.assets);assert.notEqual(final.manifest.icon.hash,'parent-cover');assert.deepEqual(done.previewIcon,final.manifest.icon);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('an icon provider failure keeps an icon-less game playable and records branch failure',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const fetcher=(async()=>new Response(JSON.stringify({error:{message:'fixture icon failure',type:'server_error'}}),{status:500,headers:{'content-type':'application/json'}})) as typeof fetch;
  const f=fixture({},fetcher);(f.original.manifest as any).icon={name:'cartridge-icon',hash:'parent-cover',url:'/assets/parent-cover.png',width:256,height:256};
  const source=partySource(await readFile('games/toast-catch.ts','utf8'));
  (f.service as any).json=async(_j:any,_m:any,branch:string)=>branch==='brief'?f.brief:branch==='cartridge'?{source}:stockScore('toast-catch');
  const job=await f.service.create('owner','Remix the fixture rules and reuse gameplay artwork',{remix:'original',art:false});
  await until(()=>f.records.at(-1)?.status!=='working');const done=await f.service.get(job.id,'owner');
  assert.equal(done.status,'ready',done.error??'Unexpected failure');assert.equal(done.branches.icon,'failed');assert.match(done.iconError!,/fixture icon failure/);
  assert.ok(done.previewVersion);assert.ok(done.finishedVersion);assert.equal(f.versions.at(-1).manifest.icon,undefined);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('an expired icon request cannot publish late output after a playable preview',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  let finish!:(value:Response)=>void,signal:AbortSignal|undefined;
  const fetcher=(async(_url:any,init:any)=>{signal=init.signal;return new Promise<Response>(resolve=>finish=resolve);}) as typeof fetch;
  const f=fixture({timeoutMs:1000},fetcher);(f.service as any).json=async(_j:any,_m:any,branch:string)=>branch==='brief'?f.brief:stockScore('toast-catch');
  const job=await f.service.create('owner','Refresh this fixture without sprite art',{remix:'original',mediaOnly:true,art:false});
  await until(()=>f.versions.length===1&&finish);const preview=structuredClone(f.versions[0]);
  await until(()=>f.records.at(-1)?.status==='failed');assert.equal(signal?.aborted,true);
  const png=await sharp({create:{width:32,height:32,channels:3,background:'#445566'}}).png().toBuffer();
  finish(new Response(JSON.stringify({created:1,data:[{b64_json:png.toString('base64')}]}),{headers:{'content-type':'application/json'}}));await new Promise(r=>setTimeout(r,30));
  assert.equal(f.versions.length,1);assert.deepEqual(f.versions[0],preview);assert.equal((await f.service.get(job.id,'owner')).finishedVersion,undefined);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('generation routes default and overridden models with the expected reasoning and records provider model',async()=>{
 const previous={key:process.env.OPENAI_API_KEY,code:process.env.CODE_MODEL,music:process.env.MUSIC_MODEL};
 process.env.OPENAI_API_KEY='fixture-only';
 try{
  for(const scenario of [
   {code:undefined,music:undefined,models:['gpt-6-sol','gpt-5-mini'],reasoning:['high','low']},
   {code:'gpt-6-astra',music:undefined,models:['gpt-6-astra','gpt-5-mini'],reasoning:['high','low']},
   {code:'gpt-5-mini',music:undefined,models:['gpt-5-mini','gpt-5-mini'],reasoning:['high','low']},
   {code:'gpt-5-mini',music:'gpt-4.1-mini',models:['gpt-5-mini','gpt-4.1-mini'],reasoning:['high',undefined]},
   {code:'gpt-4.1-mini',music:'gpt-6-sol',models:['gpt-4.1-mini','gpt-6-sol'],reasoning:[undefined,'low']},
  ]){
   if(scenario.code===undefined)delete process.env.CODE_MODEL;else process.env.CODE_MODEL=scenario.code;
   if(scenario.music===undefined)delete process.env.MUSIC_MODEL;else process.env.MUSIC_MODEL=scenario.music;
   const requests:any[]=[];
   const f=fixture({},(async(_url,init)=>{
    const body=JSON.parse(String(init?.body));requests.push(body);
    const output=body.text.format.name==='brief'?f.brief:stockScore('toast-catch');
    return new Response(JSON.stringify({id:`fixture-${requests.length}`,object:'response',created_at:1,status:'completed',model:`returned-${body.model}`,output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify(output),annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}),{headers:{'content-type':'application/json'}});
   }) as typeof fetch);
   (f.original.manifest as any).icon={name:'cartridge-icon',hash:'original-icon',url:'/assets/original-icon.png',width:256,height:256};
   const job=await f.service.create('owner','Regenerate this fixture music only',{remix:'original',musicOnly:true});
   await until(()=>f.records.at(-1)?.id===job.id&&f.records.at(-1)?.status!=='working');
   const done=await f.service.get(job.id,'owner');
   assert.equal(done.status,'ready',done.error??'Unexpected failure');
   assert.deepEqual(requests.map(r=>r.model),scenario.models);
   assert.deepEqual(requests.map(r=>r.reasoning?.effort),scenario.reasoning);
   assert.ok(requests.every(r=>r.text.format.type==='json_schema'&&r.text.format.strict===true));
   assert.ok(requests.every(r=>r.background===true&&r.store===false));
   assert.deepEqual([done.models.brief,done.models.music],scenario.models.map(m=>`returned-${m}`));
   assert.deepEqual(done.usage.map((u:any)=>u.model),scenario.models.map(m=>`returned-${m}`));
   assert.deepEqual(done.usage.map((u:any)=>u.reasoningEffort),scenario.reasoning);
   assert.equal(f.versions.at(-1).manifest.music.provenance.model,`returned-${scenario.models[1]}`);
  }
 }finally{
  for(const [name,value] of [['OPENAI_API_KEY',previous.key],['CODE_MODEL',previous.code],['MUSIC_MODEL',previous.music]] as const){if(value===undefined)delete process.env[name];else process.env[name]=value;}
 }
});

test('incomplete provider output is reported rather than published as a valid brief',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 try{
  const f=fixture({},async()=>new Response(JSON.stringify({id:'resp-incomplete',object:'response',status:'incomplete',model:'gpt-6-astra',output:[],incomplete_details:{reason:'max_output_tokens'},usage:{input_tokens:1,output_tokens:2000,total_tokens:2001}}),{headers:{'content-type':'application/json'}}));
  const job=await f.service.create('owner','Build this incomplete fixture game');
  await until(()=>f.records.at(-1)?.status==='failed');
  const failed=await f.service.get(job.id,'owner');
  assert.match(failed.error!,/brief generation incomplete: max_output_tokens/);
  assert.equal(f.versions.length,0);assert.equal(failed.usage.length,1);
 }finally{if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});

test('game requests use GPT-6 Sol high while soundtrack requests retain GPT-5 Mini low',async()=>{
 const env={OPENAI_API_KEY:process.env.OPENAI_API_KEY,CODE_MODEL:process.env.CODE_MODEL,MUSIC_MODEL:process.env.MUSIC_MODEL};
 process.env.OPENAI_API_KEY='fixture-only';delete process.env.CODE_MODEL;delete process.env.MUSIC_MODEL;
 try{
  const originalSource=partySource(await readFile('games/toast-catch.ts','utf8'));
  const badSource=originalSource+'\nconst marker: number = "broken";';
  const requests:any[]=[];let codeCalls=0;
  const f=fixture({codeOutputTokens:20000,maxOutputTokens:75000},async(_url,init)=>{
   const body=JSON.parse(String(init?.body));
   if(!body.text)return new Response(JSON.stringify({error:{message:'fixture icon unavailable'}}),{status:500,headers:{'content-type':'application/json'}});
   requests.push(body);const branch=body.text.format.name;
   const data=branch==='brief'?f.brief:branch==='music'?stockScore('toast-catch'):{source:++codeCalls===1?badSource:originalSource};
   return new Response(JSON.stringify({id:'response-fixture',object:'response',status:'completed',model:body.model,output_text:JSON.stringify(data),output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify(data),annotations:[]}]}],usage:{input_tokens:1,output_tokens:1,total_tokens:2}}),{headers:{'content-type':'application/json'}});
  });
  const job=await f.service.create('owner','Change this fixture game and soundtrack',{remix:'original',art:false});
  await until(()=>f.records.at(-1)?.status!=='working');const done=await f.service.get(job.id,'owner');
  assert.equal(done.status,'ready',done.error??'Unexpected failure');
  assert.deepEqual(requests.map(r=>r.text.format.name).sort(),['brief','cartridge','cartridge','music']);
  for(const request of requests){const music=request.text.format.name==='music';assert.equal(request.model,music?'gpt-5-mini':'gpt-6-sol');assert.equal(request.reasoning.effort,music?'low':'high');if(request.text.format.name==='cartridge')assert.equal(request.max_output_tokens,20000);}
  assert.equal((done.usage.find((u:any)=>u.branch==='cartridge') as any).reasoningEffort,'high');
 }finally{for(const [key,value] of Object.entries(env))if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
