import test from 'node:test';import assert from 'node:assert/strict';import {AudioEngine} from '../client/audio';
class Param {value=1;events:any[]=[];cancelScheduledValues(t:number){this.events.push(['cancel',t]);}setValueAtTime(v:number,t:number){this.value=v;this.events.push(['set',v,t]);}linearRampToValueAtTime(v:number,t:number){this.value=v;this.events.push(['linear',v,t]);}exponentialRampToValueAtTime(v:number,t:number){this.value=v;this.events.push(['exponential',v,t]);}}
class Node {gain=new Param();frequency=new Param();playbackRate=new Param();onended?:()=>void;loop=false;loopStart=0;loopEnd=0;buffer:any;type='sine';starts:number[][]=[];stops:number[]=[];connect(){}disconnect(){}start(...args:number[]){this.starts.push(args);}stop(t=0){this.stops.push(t);}}
class Context {state='suspended';currentTime=10;destination={};nodes:Node[]=[];sources:Node[]=[];oscillators:Node[]=[];async resume(){this.state='running';}createGain(){const n=new Node();this.nodes.push(n);return n;}createBufferSource(){const n=new Node();this.sources.push(n);return n;}createOscillator(){const n=new Node();this.oscillators.push(n);return n;}createBuffer(_channels:number,length:number,rate:number){return {duration:length/rate,copyToChannel(){}};}}
test('audio starts after activation, deduplicates loops/effects, ducks cues, fades and bounds voices',async()=>{
  const previous=globalThis.AudioContext;globalThis.AudioContext=Context as any;
  try{
    const audio=new AudioEngine();await audio.startLoop('r1','toast-catch');assert.equal(audio.context,undefined);
    await audio.unlock();const ctx=audio.context as unknown as Context;
    await audio.startLoop('r1','toast-catch',undefined,2);await audio.startLoop('r1','toast-catch');assert.equal(ctx.sources.length,1);assert.ok(ctx.sources[0].starts[0][1]>=2);
    audio.effect('one','success');audio.effect('one','success');assert.equal(ctx.oscillators.length,1);assert.ok(ctx.nodes[3].gain.events.some(e=>e[1]===.45));
    for(let i=0;i<30;i++)audio.effect('burst'+i,'shot');assert.equal(ctx.oscillators.length,12);
    await audio.startLoop('r2','cup-shuffle');assert.equal(ctx.sources.length,2);assert.equal(ctx.sources[0].stops[0],10.07);
    audio.set({music:99,effects:NaN,muted:true});assert.equal(audio.settings.music,1);assert.equal(audio.settings.effects,.55);assert.equal(ctx.nodes[0].gain.value,0);
    audio.stop();assert.ok(ctx.sources[1].stops.length);assert.ok(ctx.oscillators.every(n=>n.stops.length===2));
  }finally{globalThis.AudioContext=previous;}
});

test('important cues replace low priority voices; variants and sound packs stay bounded',async()=>{
  const previous=globalThis.AudioContext;globalThis.AudioContext=Context as any;
  try{
    const audio=new AudioEngine();await audio.unlock();const ctx=audio.context as unknown as Context;
    for(let i=0;i<12;i++)audio.effect(`shot:${i}`,'shot');
    audio.effect('crowded','shot');assert.equal(ctx.oscillators.length,12);
    audio.effect('round','round-complete',{pitch:1000,timbre:'sine'});
    assert.equal(ctx.oscillators.length,13);assert.equal(ctx.oscillators[0].stops.length,2);
    assert.equal(ctx.oscillators[12].frequency.events[0][1],880);assert.equal(ctx.oscillators[12].type,'sine');
    audio.effect('round','round-complete');assert.equal(ctx.oscillators.length,13);
    ctx.oscillators[1].onended?.();audio.soundPack='soft-toy';audio.effect('jump','jump');assert.equal(ctx.oscillators[13].type,'sine');
    ctx.oscillators[2].onended?.();audio.effect('crowded','shot');assert.equal(ctx.oscillators.length,14,'dropped events are never played later');
    audio.stop();
  }finally{globalThis.AudioContext=previous;}
});

test('saved audio is decoded and loop points/gain are honored; stopped async starts cannot return',async()=>{
  const previous=globalThis.AudioContext,previousFetch=globalThis.fetch;
  class DecodingContext extends Context{decodes=0;async decodeAudioData(){this.decodes++;return {duration:8};}}
  globalThis.AudioContext=DecodingContext as any;
  let finishFetch!:(value:any)=>void;globalThis.fetch=(()=>new Promise(resolve=>{finishFetch=resolve;})) as any;
  try{
    const audio=new AudioEngine();await audio.unlock();const ctx=audio.context as unknown as DecodingContext;
    const asset={url:`/assets/${'a'.repeat(64)}.wav`,loopStart:1,loopEnd:7,gain:.4};
    const pending=audio.startLoop('slow','ignored-stock',asset);audio.stop();finishFetch({ok:true,arrayBuffer:async()=>new ArrayBuffer(100)});await pending;
    assert.equal(ctx.sources.length,0);assert.equal(ctx.decodes,1);
    await audio.startLoop('next','ignored-stock',asset,2,2);assert.equal(ctx.sources.length,1);assert.equal(ctx.decodes,1);assert.equal(ctx.sources[0].playbackRate.value,2);
    assert.equal(ctx.sources[0].loopStart,1);assert.equal(ctx.sources[0].loopEnd,7);assert.ok(ctx.sources[0].starts[0][1]>=3);
    assert.ok(ctx.nodes.at(-1)!.gain.events.some(e=>e[0]==='linear'&&e[1]===.4));
    audio.setActive(false);audio.effect('hidden','shot');await audio.startLoop('hidden','ignored-stock',asset);assert.equal(ctx.sources.length,1);assert.equal(ctx.oscillators.length,0);
    audio.setActive(true);audio.effect('hidden','shot');assert.equal(ctx.oscillators.length,0);audio.effect('visible','shot');assert.equal(ctx.oscillators.length,1);
    await assert.rejects(()=>audio.prepare({...asset,loopEnd:9}),/loop points/);
    audio.stop();await assert.rejects(()=>audio.prepare({...asset,url:'https://untrusted.invalid/music.wav'}),/Invalid soundtrack/);
  }finally{globalThis.AudioContext=previous;globalThis.fetch=previousFetch;}
});
