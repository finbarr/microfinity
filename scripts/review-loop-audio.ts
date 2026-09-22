/** Perceptual model review of exported WAVs. Does not certify device/gameplay audio. */
import 'dotenv/config';import OpenAI from 'openai';import {mkdir,readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
// Remote review requires explicit export authorization, then AUDIO_REVIEW_SEND=1.
const prepareOnly=process.env.AUDIO_REVIEW_SEND!=='1'||process.env.AUDIO_REVIEW_PREPARE_ONLY==='1',model=process.env.AUDIO_REVIEW_MODEL??'gpt-audio-1.5';
const wanted=(process.env.AUDIO_REVIEW_JOBS??'1826cdd3e26535c5444c7dd1,d20b56828f8b56ab850a7b7c,a2c2c496096b28cf506c54fd,a5d52c7bdc68b9562a83adf0,a1224b8eaf92d0e47c5f37fe,af372166fd8d2b869d47b3d8,9eaaf1c2b99afecd74775651').split(',');
const signal=JSON.parse(await readFile('evidence/audio/signal-report.json','utf8')),loops=signal.loops.filter((l:any)=>wanted.includes(l.jobId));
if(loops.length!==wanted.length)throw new Error('A selected loop is missing from the signal report');
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
await mkdir('evidence/audio/model-review',{recursive:true});
for(const loop of loops){
 const wav=await readFile(`data/assets/${loop.hash}.wav`);if(hash(wav)!==loop.hash)throw new Error('Asset hash mismatch');
 // The current synth emits canonical mono PCM16; reject other layouts here.
 if(wav.toString('ascii',12,16)!=='fmt '||wav.readUInt32LE(16)!==16||wav.readUInt16LE(20)!==1||wav.readUInt16LE(22)!==1||wav.readUInt16LE(34)!==16||wav.toString('ascii',36,40)!=='data')throw new Error('Unsupported review WAV layout');
 const rate=wav.readUInt32LE(24),start=44+Math.round(loop.signal.loopStart*rate)*2,end=44+Math.round(loop.signal.loopEnd*rate)*2;
 if(start<44||end>wav.length||end<=start)throw new Error('Invalid loop samples');
 const pcm=wav.subarray(start,end),cycles=Buffer.concat([wav.subarray(0,44),pcm,pcm,pcm]);cycles.writeUInt32LE(cycles.length-8,4);cycles.writeUInt32LE(pcm.length*3,40);
 const seconds=pcm.length/2/rate,reviewPath=`evidence/audio/model-review/${loop.hash}-three-cycles.wav`;await writeFile(reviewPath,cycles);
 const prompt=`Review this actual audio recording as prospective background music for a short browser microgame. It contains three exact repeats of one exported loop; loop boundaries occur at ${seconds.toFixed(4)} and ${(seconds*2).toFixed(4)} seconds. Do not infer quality from this description: attend to the supplied audio. Describe its audible instrumentation, rhythm and melodic character. Assess repetition, harshness, apparent glitches or gaps at those boundaries, and room for short interaction sound effects. Give timestamped concerns only when you can actually identify them; distinguish uncertainty from a detected defect. Do not claim numerical signal measurements, human listening, game UI synchronization or real speaker/device tests. If you cannot assess music or this audio, say so. Keep the review under 300 words.`;
 const at=new Date().toISOString(),started=performance.now();let result:any;
 try{
  if(prepareOnly)result={status:'prepared-locally',model,review:'No audio sent to a provider. Approval is required before running model review.'};
  else{
  const client=new OpenAI({maxRetries:0,timeout:60000});
  const completion=await client.chat.completions.create({model,modalities:['text'],max_completion_tokens:900,store:false,messages:[{role:'user',content:[{type:'text',text:prompt},{type:'input_audio',input_audio:{data:cycles.toString('base64'),format:'wav'}}]}]});
  result={status:'reviewed',model:completion.model,requestId:completion.id,usage:completion.usage,review:completion.choices[0]?.message.content??'',finishReason:completion.choices[0]?.finish_reason};
  }
 }catch(error){const e=error as any;result={status:'failed',model,httpStatus:e.status??null,errorType:e.name??'Error'};}
 const record={at,loop:loop.hash,jobId:loop.jobId,title:loop.title,sourcePath:`data/assets/${loop.hash}.wav`,reviewPath,cycles:3,loopSeconds:seconds,reviewAudioHash:hash(cycles),method:'Audio-input model review of the exact saved PCM loop concatenated three times. No browser capture, gameplay mix, human or device listening. Perceptual judgments are model inferences and may be wrong.',prompt,promptHash:hash(prompt),latencyMs:Math.round(performance.now()-started),...result};
 await writeFile(`evidence/audio/model-review/${loop.hash}-${at.replaceAll(':','-')}.json`,JSON.stringify(record,null,2));console.log(JSON.stringify({title:loop.title,status:result.status,model:result.model,latencyMs:record.latencyMs,review:result.review?.slice(0,180),httpStatus:result.httpStatus}));
}
