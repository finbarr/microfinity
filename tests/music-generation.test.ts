import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {prepareMusic,symbolicMusicAdapter,type MusicOutput,type MusicGenerationAdapter} from '../server/music-generation';
import {inspectLoop,wavBuffer} from '../server/music-assets';
import {stockScore,synthesize} from '../runtime/music';
import sharp from 'sharp';
import {Projects,ProjectWorker} from '../server/projects';
import {GenerationService} from '../server/generation';import {Store,hash} from '../server/store';import {compileIsolated} from '../server/compile-process';

function renderedFixture():Extract<MusicOutput,{kind:'audio'}>{
 const rate=8000,pcm=synthesize({...stockScore('toast-catch'),bpm:120},rate),prefix=1600,suffix=800,frames=prefix+pcm.length+suffix;
 const bytes=Buffer.alloc(44+frames*4);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(2,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*4,28);bytes.writeUInt16LE(4,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(frames*4,40);
 for(let i=0;i<pcm.length;i++){const n=Math.round(pcm[i]*32767);bytes.writeInt16LE(n,44+(i+prefix)*4);bytes.writeInt16LE(Math.round(n*.5),46+(i+prefix)*4);}
 return {kind:'audio',bytes,format:'wav',loopStart:.2,loopEnd:8.2,gain:.6,bpm:120,beatsPerBar:4,bars:4,renderVersion:'fixture-decoder-1',provenance:{provider:'fixture-only',model:'stereo-loop-fixture'},usage:{audioSeconds:8}};
}

test('score and rendered music share validation; stereo padding stays outside measured loop points',async()=>{
 const score=stockScore('toast-catch');let requested='';
 const adapter=symbolicMusicAdapter(async(_schema,prompt)=>{requested=prompt;return {score,model:'fixture-score-model'};});
 const output=await adapter.generate({title:'Toast',premise:'Catch breakfast',mood:'bouncy',attempt:2,previousError:'too many notes'},{signal:new AbortController().signal,reserve(){throw new Error('The compose callback owns reservations');}});
 const symbolic=prepareMusic(output);assert.match(requested,/Fix score validation: too many notes/);
 assert.equal(hash(symbolic.bytes),hash(wavBuffer(synthesize(score),22050)),'The adapter preserves existing synth output');assert.deepEqual(symbolic.metadata.score,score);assert.equal(symbolic.metadata.provenance.model,'fixture-score-model');
 const file=renderedFixture(),result=prepareMusic(file);
 assert.deepEqual(result.bytes,file.bytes);assert.equal(result.metadata.channels,2);assert.equal(result.metadata.sampleRate,8000);assert.equal(result.metadata.duration,8.3);
 assert.equal(result.metadata.loopStart,.2);assert.equal(result.metadata.loopEnd,8.2);assert.equal(result.metadata.gain,.6);assert.equal(result.metadata.score,undefined);assert.equal(result.metadata.synthVersion,undefined);
 assert.equal(result.metadata.renderVersion,'fixture-decoder-1');assert.deepEqual(result.metadata.validation.problems,[]);assert.deepEqual(result.usage,{audioSeconds:8});
});

test('rendered music rejects bad encoding, inconsistent headers, oversized or unusable loops',()=>{
 const file=renderedFixture(),bytes=Buffer.from(file.bytes);
 assert.throws(()=>prepareMusic({...file,bytes:new Uint8Array(10_000_001)}),/10 MB/);
 assert.throws(()=>prepareMusic({...file,bytes:bytes.subarray(0,100)}),/Truncated/);
 assert.throws(()=>prepareMusic({...file,loopEnd:9}),/Loop points/);
 assert.throws(()=>prepareMusic({...file,bpm:100}),/tempo and bar count/);
 assert.throws(()=>prepareMusic({...file,gain:NaN}));
 const silent=wavBuffer(new Float32Array(64000),8000);assert.throws(()=>prepareMusic({...file,bytes:silent,loopStart:0,loopEnd:8}),/silent soundtrack/);
 const clipped=wavBuffer(new Float32Array(64000).fill(1),8000);assert.throws(()=>prepareMusic({...file,bytes:clipped,loopStart:0,loopEnd:8}),/clipped samples/);
 const lead=new Float32Array(64000);lead.set(synthesize({...stockScore('toast-catch'),bpm:120},8000).subarray(0,56000),8000);assert.throws(()=>prepareMusic({...file,bytes:wavBuffer(lead,8000),loopStart:0,loopEnd:8}),/leading silence/);
 const badRate=Buffer.from(bytes);badRate.writeUInt32LE(16000,28);assert.throws(()=>prepareMusic({...file,bytes:badRate}),/Inconsistent PCM/);
 const duplicate=Buffer.concat([bytes,bytes.subarray(36)]);duplicate.writeUInt32LE(duplicate.length-8,4);assert.throws(()=>inspectLoop(duplicate,.2,8.2),/one PCM data chunk/);
 const junk=Buffer.concat([bytes,Buffer.from([1])]);junk.writeUInt32LE(junk.length-8,4);assert.throws(()=>inspectLoop(junk,.2,8.2),/Invalid PCM format/);
});

const pause=()=>new Promise(r=>setTimeout(r,10));
async function until<T>(check:()=>Promise<T|undefined>){const start=Date.now();for(;;){const value=await check();if(value)return value;if(Date.now()-start>20000)throw new Error('Fixture job did not settle');await pause();}}
test('rendered adapter repairs invalid audio and pins exact files after builder validation',async()=>{
 const priorKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 const root=await mkdtemp(join(tmpdir(),'microfinity-music-adapter-'));let store=new Store(root,'');await store.init();
 try{
  const guest=await store.guest(undefined,'Music fixture'),source=await readFile('games/toast-catch.ts','utf8'),compiled=await compileIsolated(source);
  const original=await store.putVersion(source,compiled.code,compiled.meta,[],null,{kind:'fixture'},guest.id,undefined,compiled.audio);
  let finish:((value:MusicOutput)=>void)|undefined;const requests:any[]=[];
  const adapter:MusicGenerationAdapter={async generate(request,context){context.reserve({title:request.title,attempt:request.attempt},0);requests.push(request);return requests.length===1?{...renderedFixture(),bytes:Buffer.from('invalid file')}:new Promise(resolve=>finish=resolve);}};
  const png=(await sharp({create:{width:256,height:256,channels:4,background:'#aabbcc'}}).png().toBuffer()).toString('base64');
  const service=new GenerationService(store,{},async()=>new Response(JSON.stringify({data:[{b64_json:png}]}),{headers:{'content-type':'application/json'}}),adapter,{async build(input){return {...compiled,meta:{...compiled.meta,id:input.gameId},source,runtime:await store.runtime(original),reports:[],model:'fixture',usage:[]};}});
  (service as any).json=async()=>({title:'Toast Catch',premise:'Catch toast',clock:'realtime',
   playStyle:'competitive',controls:'Each player moves their own plate.',solo:'Catch toast or lose.',
   multiplayer:'The catcher wins.',offTurn:'Not applicable: simultaneous play',
   style:'cartoon',assetName:'toast',assetDescription:'Toast',musicMood:'bouncy'});
  const projects=new Projects(store),worker=new ProjectWorker(projects,service);
  const created=await projects.create(guest.id,{requestId:'music-fixture-request',prompt:'Generate a new fixture-only audio file',remix:original.id,reuseMedia:true});
  // This fixture tests rendered audio. Reuse a saved sprite to avoid image-model semantics.
  const sprite=await store.putAsset(Buffer.from(png,'base64'),'png',created.id);
  await store.query('UPDATE projects SET media=$1 WHERE id=$2',[JSON.stringify({assets:[{...sprite,name:'toast',width:256,height:256}]}),created.id]);
  worker.start();
  const working=await until(async()=>{const p=await projects.get(created.id,guest.id);return finish?p:undefined;});
  assert.equal(working.revisions.length,0);assert.match(requests[1].previousError,/Invalid WAV/);
  const file=renderedFixture();finish!(file);
  const done=await until(async()=>{const p=await projects.get(created.id,guest.id);return p.turns[0].status!=='working'&&p.turns[0].status!=='queued'?p:undefined;});
  await worker.close();assert.equal(done.turns[0].status,'ready',done.turns[0].error??'Unexpected turn failure');
  const job={id:done.turns[0].id};
  const progress=done.turns[0].progress;
  assert.equal(progress.budget.reserved.calls,3);assert.equal(progress.models.music,file.provenance.model);assert.equal(progress.musicAttempts.length,2);
  const version=await store.version(done.revisions[0].version_id),music=version.manifest.music as any;
  assert.notEqual(version.id,original.id);assert.equal(version.source,original.source);assert.equal(version.code,original.code);assert.equal(version.manifest.assets[0].hash,sprite.hash);assert.equal(version.manifest.runtimeVersion,original.manifest.runtimeVersion);
  assert.equal(music.hash,hash(Buffer.from(file.bytes)));assert.equal(music.score,undefined);assert.equal(music.name,'main-loop');assert.equal(music.provenance.jobId,job.id);assert.equal(music.provenance.provider,'fixture-only');assert.equal(music.loopStart,.2);
  assert.deepEqual(await store.version(original.id),original);
  assert.deepEqual(await readFile(join(root,music.url)),Buffer.from(file.bytes));
  await store.close();store=new Store(root,'');await store.init();assert.deepEqual((await store.version(version.id)).manifest.music,music);
  const [saved]=await store.query('SELECT * FROM project_turns WHERE id=$1',[job.id]);assert.equal(saved.status,'ready');assert.ok(saved.progress.public.usage.some((u:any)=>u.branch==='music-file'&&u.usage.audioSeconds===8));
 }finally{await store.close();await rm(root,{recursive:true,force:true});if(priorKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=priorKey;}
});
