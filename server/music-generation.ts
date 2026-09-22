import {z} from 'zod';
import {synthesize,validateScore,type Score} from '../runtime/music';
import {inspectLoop,wavBuffer} from './music-assets';

export type MusicRequest={title:string;premise:string;mood:string;attempt:number;previousError:string};
export type MusicProvenance={provider:string;model:string};
export type MusicOutput=(
 |{kind:'score';score:Score;provenance:MusicProvenance}
 |{kind:'audio';bytes:Uint8Array;format:'wav';loopStart:number;loopEnd:number;gain:number;bpm:number;beatsPerBar:number;bars:number;renderVersion:string;provenance:MusicProvenance})&{usage?:Record<string,number>};
export type MusicContext={
 signal:AbortSignal;
 /** Reserve each external request before dispatch; pass signal to the provider. */
 reserve:(request:unknown,outputTokens:number)=>void;
};
/** Trusted server integration. Cartridges and browser prompts cannot supply adapters or URLs. */
export interface MusicGenerationAdapter {generate(request:MusicRequest,context:MusicContext):Promise<MusicOutput>}

const scoreSchema={type:'object',properties:{title:{type:'string'},bpm:{type:'number'},beatsPerBar:{type:'integer'},bars:{type:'integer'},notes:{type:'array',items:{type:'object',properties:{pitch:{type:'integer',minimum:24,maximum:96},beat:{type:'number',minimum:0,maximum:15.95},duration:{type:'number',minimum:0.05,maximum:4},velocity:{type:'number',minimum:0.1,maximum:0.65},instrument:{type:'string',enum:['square','triangle','sine','noise']}},required:['pitch','beat','duration','velocity','instrument'],additionalProperties:false}}},required:['title','bpm','beatsPerBar','bars','notes'],additionalProperties:false};
/** The callback owns its provider reservation, cancellation and actual model/usage recording. */
export function symbolicMusicAdapter(compose:(schema:unknown,prompt:string)=>Promise<{score:Score;model:string}>):MusicGenerationAdapter{
 return {async generate(request){
  const {score,model}=await compose(scoreSchema,`Compose an original looping retro chiptune as musical data for ${request.title}: ${request.premise}. Mood: ${request.mood}. Instrumental, sparse, catchy, not an existing tune. Exactly 4 bars of 4/4 at 90-140 BPM, 24-70 notes total. A memorable motif in triangle or square with quiet sine bass and very sparse noise percussion. MIDI pitch24..96, beat>=0<16, duration .05..4 beats, beat+duration<=16, velocity 0.1 to 0.65 (a decimal fraction, NEVER a MIDI 0-127 velocity). No vocals. Smooth ending that leads back to the start. Keep at most 4 notes playing simultaneously. ${request.previousError?`Fix score validation: ${request.previousError}`:''}`);
  return {kind:'score',score,provenance:{provider:'openai',model}};
 }};
}

const provenanceSchema=z.object({provider:z.string().min(1).max(80),model:z.string().min(1).max(160)}).strict();
const renderedSchema=z.object({format:z.literal('wav'),loopStart:z.number().finite().min(0),loopEnd:z.number().finite().positive(),gain:z.number().min(0.01).max(1),bpm:z.number().min(60).max(180),beatsPerBar:z.union([z.literal(3),z.literal(4)]),bars:z.union([z.literal(4),z.literal(8)]),renderVersion:z.string().min(1).max(120)});

/** Both providers publish only decoded, bounded PCM WAVs under local content hashes. */
export function prepareMusic(output:MusicOutput){
 const provenance=provenanceSchema.parse(output.provenance);
 const usage=output.usage===undefined?undefined:z.record(z.string().max(60),z.number().finite().nonnegative()).refine(u=>Object.keys(u).length<=32,'Too many usage fields').parse(output.usage);
 let bytes:Buffer,loopStart:number,loopEnd:number,gain=1,bpm:number,beatsPerBar:number,bars:number,score:Score|undefined,renderVersion:string;
 if(output.kind==='score'){
  score=validateScore(output.score);const pcm=synthesize(score);bytes=wavBuffer(pcm,22050);
  loopStart=0;loopEnd=pcm.length/22050;({bpm,beatsPerBar,bars}=score);renderVersion='symbolic-synth-1.0.0';
 }else if(output.kind==='audio'){
  const meta=renderedSchema.parse(output);
  if(!(output.bytes instanceof Uint8Array)||output.bytes.byteLength>10_000_000)throw new Error('Rendered music must contain at most 10 MB of WAV bytes');
  bytes=Buffer.from(output.bytes);({loopStart,loopEnd,gain,bpm,beatsPerBar,bars,renderVersion}=meta);
 }else throw new Error('Unknown music output kind');
 const validation=inspectLoop(bytes,loopStart,loopEnd);
 loopStart=Math.round(loopStart*validation.sampleRate)/validation.sampleRate;
 loopEnd=Math.min(validation.frames,Math.round(loopEnd*validation.sampleRate))/validation.sampleRate;
 Object.assign(validation,{loopStart,loopEnd});
 // A provider may include codec padding outside the loop, but not a long hidden recording.
 if(validation.duration>34||loopEnd-loopStart<4||loopEnd-loopStart>32)throw new Error('Music must have a 4–32 second loop in a file no longer than 34 seconds');
 if(validation.problems.length)throw new Error(validation.problems.join('; '));
 if(Math.abs((loopEnd-loopStart)-bars*beatsPerBar*60/bpm)>.02)throw new Error('Decoded loop length does not match its tempo and bar count');
 return {bytes,usage,metadata:{name:'main-loop',...(score?{score,synthVersion:'1.0.0'}:{}),renderVersion,format:'wav' as const,duration:validation.duration,sampleRate:validation.sampleRate,channels:validation.channels,bpm,beatsPerBar,bars,loopStart,loopEnd,gain,provenance,validation}};
}
