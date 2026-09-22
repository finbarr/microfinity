/** Checks the actual PCM playback file, not just the score used to produce it. */
export function inspectLoop(bytes:Buffer,loopStart:number,loopEnd:number){
  if(bytes.length<44||bytes.length>10_000_000||bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WAVE')throw new Error('Invalid WAV container');
  const end=bytes.readUInt32LE(4)+8;if(end!==bytes.length)throw new Error('Truncated WAV container');
  let rate=0,channels=0,bits=0,pcm:Buffer|undefined,offset=12;
  for(;offset+8<=end;){
    const name=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;
    if(start+size>end)throw new Error('Truncated WAV chunk');
    if(name==='fmt '){
      if(rate||size<16||bytes.readUInt16LE(start)!==1)throw new Error('Expected one PCM WAV format');
      channels=bytes.readUInt16LE(start+2);rate=bytes.readUInt32LE(start+4);bits=bytes.readUInt16LE(start+14);
      if(bytes.readUInt16LE(start+12)!==channels*bits/8||bytes.readUInt32LE(start+8)!==rate*channels*bits/8)throw new Error('Inconsistent PCM format');
    }
    if(name==='data'){if(pcm)throw new Error('Expected one PCM data chunk');pcm=bytes.subarray(start,start+size);}
    offset=start+size+(size%2);
  }
  if(offset!==end||!pcm||bits!==16||![1,2].includes(channels)||rate<8000||rate>96000||pcm.length%(2*channels))throw new Error('Invalid PCM format');
  const frames=pcm.length/(2*channels),duration=frames/rate;
  if(!Number.isFinite(loopStart)||!Number.isFinite(loopEnd)||loopStart<0||loopEnd<=loopStart||loopEnd>duration+1/rate)throw new Error('Loop points exceed decoded audio');
  const first=Math.round(loopStart*rate),last=Math.min(frames,Math.round(loopEnd*rate));
  if(last<=first)throw new Error('Loop contains no PCM frames');
  let peak=0,energy=0,clipped=0,firstSound=-1,lastSound=-1,seam=0;
  for(let frame=first;frame<last;frame++)for(let ch=0;ch<channels;ch++){
    const n=pcm.readInt16LE((frame*channels+ch)*2)/32768,abs=Math.abs(n);
    peak=Math.max(peak,abs);energy+=n*n;if(abs>=.999)clipped++;
    if(abs>.001){if(firstSound<0)firstSound=frame;lastSound=frame;}
  }
  for(let ch=0;ch<channels;ch++)seam=Math.max(seam,Math.abs(pcm.readInt16LE((first*channels+ch)*2)-pcm.readInt16LE(((last-1)*channels+ch)*2))/32768);
  const rms=Math.sqrt(energy/((last-first)*channels));
  const leadingSilence=firstSound<0?(last-first)/rate:(firstSound-first)/rate;
  const trailingSilence=lastSound<0?(last-first)/rate:(last-1-lastSound)/rate;
  const problems:string[]=[];
  if(rms<.0001)problems.push('silent soundtrack');
  if(clipped)problems.push('clipped samples');
  if(leadingSilence>.75)problems.push('more than 750 ms leading silence');
  if(seam>.01)problems.push('loop boundary discontinuity');
  return {format:'pcm16',sampleRate:rate,channels,frames,duration,loopStart,loopEnd,peak,rms,clipped,leadingSilence,trailingSilence,seam,problems};
}
export function wavBuffer(pcm:Float32Array,sampleRate:number){const buffer=Buffer.alloc(44+pcm.length*2);buffer.write('RIFF',0);buffer.writeUInt32LE(36+pcm.length*2,4);buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(sampleRate,24);buffer.writeUInt32LE(sampleRate*2,28);buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write('data',36);buffer.writeUInt32LE(pcm.length*2,40);for(let i=0;i<pcm.length;i++)buffer.writeInt16LE(Math.round(Math.max(-1,Math.min(1,pcm[i]))*32767),44+i*2);return buffer;}
