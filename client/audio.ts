import {readSaved} from './storage';
import { synthesize, stockScore, type Score } from '../runtime/music';
import type { SoundVariant } from '../sdk/index';
export type MusicAsset={url?:string;hash?:string;score?:Score;loopStart?:number;loopEnd?:number;gain?:number};
type Loop={source:AudioBufferSourceNode;gain:GainNode};
type Voice={source:AudioScheduledSourceNode;gain:GainNode;priority:number};
const sounds:Record<string,[number,number,number,OscillatorType,number]>={
  select:[460,600,.05,'sine',0],confirm:[540,810,.12,'triangle',1],
  countdown:[520,520,.07,'sine',2],jump:[210,760,.13,'square',0],
  shot:[780,140,.06,'square',0],hit:[160,65,.09,'triangle',0],
  catch:[520,880,.11,'triangle',1],pickup:[560,980,.1,'sine',1],
  success:[660,990,.24,'triangle',3],failure:[240,80,.26,'triangle',3],
  miss:[210,90,.15,'triangle',1],invalid:[110,80,.09,'triangle',1],
  interference:[90,390,.15,'square',2],turn:[390,590,.12,'triangle',2],
  'round-complete':[440,880,.32,'triangle',3],pulse:[660,660,.055,'sine',2],
};
const unit=(n:unknown,fallback:number)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
/** One engine owns sound; cartridges emit only semantic feedback events. */
export class AudioEngine {
  context?:AudioContext;
  private music?:Loop;private master?:GainNode;private musicGain?:GainNode;private fxGain?:GainNode;private duckGain?:GainNode;
  private voices=new Set<Voice>();private seen=new Set<string>();private musicId='';private generation=0;
  soundPack='lofi-arcade';private active=true;
  private encoded=new Map<string,Promise<ArrayBuffer>>();private decoded=new Map<string,AudioBuffer>();
  settings={muted:false,music:.25,effects:.55};
  constructor(){
    try{const saved=JSON.parse(readSaved('audio')??'{}');this.settings={muted:saved.muted===true,music:unit(saved.music,.25),effects:unit(saved.effects,.55)};}catch{}
  }
  async unlock(){
    if(!this.context){
      const ctx=this.context=new AudioContext();this.master=ctx.createGain();this.musicGain=ctx.createGain();this.fxGain=ctx.createGain();this.duckGain=ctx.createGain();
      this.musicGain.connect(this.duckGain);this.duckGain.connect(this.master);this.fxGain.connect(this.master);this.master.connect(ctx.destination);this.apply();
    }
    if(this.context.state!=='running')await this.context.resume();
  }
  private ramp(param:AudioParam,value:number,seconds=.04){const now=this.context!.currentTime;param.cancelScheduledValues(now);param.setValueAtTime(param.value,now);param.linearRampToValueAtTime(value,now+seconds);}
  private apply(){if(!this.context)return;this.ramp(this.master!.gain,this.settings.muted?0:1);this.ramp(this.musicGain!.gain,this.settings.music);this.ramp(this.fxGain!.gain,this.settings.effects);}
  set(settings:Partial<typeof this.settings>){this.settings={muted:settings.muted??this.settings.muted,music:unit(settings.music,this.settings.music),effects:unit(settings.effects,this.settings.effects)};this.apply();try{localStorage.setItem('microfinity.audio',JSON.stringify(this.settings));}catch{}}
  isLoopPlaying(id:string){return this.active&&this.context?.state==='running'&&this.musicId===id&&!!this.music;}
  /** Fetch during asset preloading, even before a joiner's first sound gesture. */
  async prepare(asset?:MusicAsset|null){
    if(!asset?.url)return;
    if(!/^\/assets\/[a-f0-9]{64}\.wav$/.test(asset.url))throw new Error('Invalid soundtrack asset URL');
    const key=asset.url;
    if(!this.encoded.has(key)){
      const pending=fetch(key).then(async r=>{if(!r.ok)throw new Error('Could not load this soundtrack');const bytes=await r.arrayBuffer();if(bytes.byteLength>10_000_000||bytes.byteLength<44)throw new Error('Invalid soundtrack size');return bytes;}).catch(e=>{this.encoded.delete(key);throw e;});
      this.encoded.set(key,pending);
      if(this.encoded.size>24)this.encoded.delete(this.encoded.keys().next().value!);
    }
    await this.encoded.get(key);
    if(this.context)await this.buffer('',asset);
  }
  private async buffer(gameId:string,asset?:MusicAsset|null){
    const ctx=this.context!,key=asset?.url??`${gameId}:${JSON.stringify(asset?.score??null)}`;
    let buffer=this.decoded.get(key);
    if(!buffer){
      if(asset?.url){const encoded=await this.encoded.get(asset.url);if(!encoded)throw new Error('Soundtrack was not preloaded');buffer=await ctx.decodeAudioData(encoded.slice(0));}
      else{const pcm=synthesize(asset?.score??stockScore(gameId));buffer=ctx.createBuffer(1,pcm.length,22050);buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>,0);}
    }
    const start=asset?.loopStart??0,end=asset?.loopEnd??buffer.duration;
    if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>buffer.duration+.002)throw new Error('Soundtrack loop points do not match its audio');
    this.decoded.set(key,buffer);if(this.decoded.size>24)this.decoded.delete(this.decoded.keys().next().value!);return buffer;
  }
  async startLoop(roundId:string,gameId:string,asset?:MusicAsset|null,offset=0,rate=1){
    if(!this.active||!this.context||this.context.state!=='running'||this.musicId===roundId)return;
    this.stopLoop();this.musicId=roundId;const generation=this.generation,requestedAt=performance.now();
    try{
      await this.prepare(asset);const buffer=await this.buffer(gameId,asset);
      if(generation!==this.generation||this.musicId!==roundId||this.context.state!=='running')return;
      const ctx=this.context,source=ctx.createBufferSource(),gain=ctx.createGain(),start=asset?.loopStart??0,end=asset?.loopEnd??buffer.duration;
      source.buffer=buffer;source.loop=true;source.loopStart=start;source.loopEnd=end;
      rate=Number.isFinite(rate)?Math.max(.25,Math.min(4,rate)):1;source.playbackRate.setValueAtTime(rate,ctx.currentTime);
      source.connect(gain);gain.connect(this.musicGain!);gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.linearRampToValueAtTime(unit(asset?.gain,1),ctx.currentTime+.06);
      // Offset follows the authoritative round, including loading/background time.
      const elapsed=offset+(performance.now()-requestedAt)/1000*rate;source.start(ctx.currentTime+.01,start+Math.max(0,elapsed)%(end-start));
      source.onended=()=>{source.disconnect();gain.disconnect();};this.music={source,gain};
    }catch(e){if(generation===this.generation)this.musicId='';throw e;}
  }
  stopLoop(){
    this.generation++;const loop=this.music;this.music=undefined;this.musicId='';
    if(loop&&this.context){this.ramp(loop.gain.gain,0,.06);try{loop.source.stop(this.context.currentTime+.07);}catch{}}
  }
  stop(){this.stopLoop();for(const voice of this.voices){try{voice.source.stop();}catch{}}this.voices.clear();}
  setActive(active:boolean){this.active=active;if(!active)this.stop();}
  effect(key:string,kind:string,variant:SoundVariant={}){
    const ctx=this.context;if(!ctx||ctx.state!=='running'||this.seen.has(key))return;
    // Remember dropped events as well: a retransmit must not produce a late sound.
    this.seen.add(key);if(this.seen.size>2000)this.seen.delete(this.seen.values().next().value!);
    if(!this.active)return;
    const [from,to,duration,type,priority]=sounds[kind]??sounds.select;
    if(this.voices.size>=12){
      // Preserve a result/turn cue even while four players are firing together.
      const victim=[...this.voices].filter(v=>v.priority<priority).sort((a,b)=>a.priority-b.priority)[0];
      if(!victim)return;
      victim.gain.gain.cancelScheduledValues(ctx.currentTime);victim.gain.gain.setValueAtTime(0,ctx.currentTime);
      try{victim.source.stop();}catch{}this.voices.delete(victim);
    }
    const osc=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
    const pitch=typeof variant.pitch==='number'&&Number.isFinite(variant.pitch)?Math.max(-12,Math.min(12,variant.pitch)):0;
    const ratio=Math.pow(2,pitch/12);
    osc.type=['square','triangle','sine'].includes(variant.timbre!)?variant.timbre!:this.soundPack==='soft-toy'?'sine':this.soundPack==='pixel-bits'?'square':type;
    osc.frequency.setValueAtTime(from*ratio,now);osc.frequency.exponentialRampToValueAtTime(to*ratio,now+duration);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.10,now+.005);gain.gain.exponentialRampToValueAtTime(.001,now+duration);
    osc.connect(gain);gain.connect(this.fxGain!);osc.start();osc.stop(now+duration+.01);const voice={source:osc,gain,priority};this.voices.add(voice);
    if(priority>=2){
      const duck=this.duckGain!.gain;duck.cancelScheduledValues(now);duck.setValueAtTime(duck.value,now);duck.linearRampToValueAtTime(.45,now+.015);duck.linearRampToValueAtTime(1,now+duration+.15);
    }
    osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices.delete(voice);};
  }
}
export const audio=new AudioEngine();
