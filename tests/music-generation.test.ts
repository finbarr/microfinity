import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {prepareMusic,symbolicMusicAdapter,type MusicOutput,type MusicGenerationAdapter} from '../server/music-generation';
import {inspectLoop,wavBuffer} from '../server/music-assets';
import {stockScore,synthesize} from '../runtime/music';
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
test('rendered adapter repairs invalid audio, pins exact files and preserves preview, rules, art and durable history',async()=>{
 const priorKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 const root=await mkdtemp(join(tmpdir(),'microfinity-music-adapter-'));let store=new Store(root,'');await store.init();
 try{
  const guest=await store.guest(undefined,'Music fixture'),source=await readFile('games/toast-catch.ts','utf8'),compiled=await compileIsolated(source);
  const original=await store.putVersion(source,compiled.code,compiled.meta,[],null,{kind:'fixture'},guest.id,undefined,compiled.audio);
  let finish:((value:MusicOutput)=>void)|undefined;const requests:any[]=[];
  const adapter:MusicGenerationAdapter={async generate(request,context){context.reserve({title:request.title,attempt:request.attempt},0);requests.push(request);return requests.length===1?{...renderedFixture(),bytes:Buffer.from('invalid file')}:new Promise(resolve=>finish=resolve);}};
  const service=new GenerationService(store,{},undefined,adapter);
  (service as any).json=async()=>({title:'Toast Catch',premise:'Catch toast',clock:'realtime',minPlayers:1,maxPlayers:1,style:'cartoon',assetName:'toast',assetDescription:'Toast',musicMood:'bouncy'});
  const job=await service.create(guest.id,'Generate a new fixture-only audio file',{remix:original.id,musicOnly:true});
  const working=await until(async()=>{const j=await service.get(job.id,guest.id);return finish&&j.previewVersion?j:undefined;});
  const preview=await store.version(working.previewVersion!);assert.equal(preview.manifest.music,null);assert.equal(preview.manifest.provenance.draft,true);assert.match(requests[1].previousError,/Invalid WAV/);
  const file=renderedFixture();finish!(file);
  const done=await until(async()=>{const j=await service.get(job.id,guest.id);return j.status!=='working'?j:undefined;});assert.equal(done.status,'ready',done.error??'Unexpected job failure');
  assert.equal(done.budget?.reserved.calls,2);assert.equal(done.models.music,file.provenance.model);assert.equal(done.musicAttempts?.length,2);
  const version=await store.version(done.finishedVersion!),music=version.manifest.music as any;
  assert.notEqual(version.id,preview.id);assert.equal(version.source,original.source);assert.equal(version.code,original.code);assert.deepEqual(version.manifest.assets,original.manifest.assets);assert.equal(version.manifest.runtimeVersion,original.manifest.runtimeVersion);
  assert.equal(music.hash,hash(Buffer.from(file.bytes)));assert.equal(music.score,undefined);assert.equal(music.name,'main-loop');assert.equal(music.provenance.jobId,job.id);assert.equal(music.provenance.provider,'fixture-only');assert.equal(music.loopStart,.2);
  assert.deepEqual(await store.version(preview.id),preview);assert.deepEqual(await store.version(original.id),original);
  assert.deepEqual(await readFile(join(root,music.url)),Buffer.from(file.bytes));
  await store.close();store=new Store(root,'');await store.init();assert.deepEqual((await store.version(version.id)).manifest.music,music);
  const [saved]=await store.query('SELECT record FROM jobs WHERE id=$1',[job.id]);assert.equal(saved.record.status,'ready');assert.equal(saved.record.finishedVersion,version.id);assert.ok(saved.record.usage.some((u:any)=>u.branch==='music-file'&&u.usage.audioSeconds===8));
 }finally{await store.close();await rm(root,{recursive:true,force:true});if(priorKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=priorKey;}
});
