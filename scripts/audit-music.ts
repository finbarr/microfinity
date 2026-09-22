/** Offline only: stop the server before opening the embedded database here. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';import {Store,hash} from '../server/store';import {inspectLoop} from '../server/music-assets';
const store=new Store();await store.init();
try{
 await mkdir('evidence/audio',{recursive:true});
 const rows=await store.query('SELECT id,manifest FROM versions WHERE manifest->\'music\' IS NOT NULL ORDER BY created_at'),seen=new Map<string,any>();
 for(const {id,manifest} of rows){
  const music=manifest.music;if(!music?.url)continue;
  const previous=seen.get(music.hash);if(previous){previous.versions.push(id);continue;}
  if(!/^\/assets\/[a-f0-9]{64}\.wav$/.test(music.url))throw new Error('Unexpected audio path');
  const bytes=await readFile(`data${music.url}`);if(hash(bytes)!==music.hash)throw new Error('Audio hash mismatch');
  const signal=inspectLoop(bytes,music.loopStart,music.loopEnd),timing=music.score??music,expected=timing.bars*timing.beatsPerBar*60/timing.bpm;
  const record={hash:music.hash,title:music.score?.title??manifest.meta.title,game:manifest.gameId,versions:[id],model:music.provenance.model,jobId:music.provenance.jobId,bytes:bytes.length,signal,musicalDuration:expected,musicalDurationError:Math.abs((signal.loopEnd-signal.loopStart)-expected),listening:'not yet auditioned'};
  seen.set(music.hash,record);
 }
 const report={generatedAt:new Date().toISOString(),method:'Decode the persisted PCM16 WAV bytes; measure signal and exact musical boundaries. This is not a listening test.',loops:[...seen.values()]};
 await writeFile('evidence/audio/signal-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({loops:report.loops.length,issues:report.loops.filter(l=>l.signal.problems.length||l.musicalDurationError>1/l.signal.sampleRate).map(l=>({hash:l.hash,problems:l.signal.problems,durationError:l.musicalDurationError})),listening:'not performed'}));
}finally{await store.close();}
