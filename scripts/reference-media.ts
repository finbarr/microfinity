/** Server must be stopped: this script owns the local PGlite database. */
import 'dotenv/config';import {mkdir,writeFile} from 'node:fs/promises';import {Store} from '../server/store';import {GenerationService} from '../server/generation';import {seed} from './seed';
const store=new Store();await store.init();const report=[];
try{
 await seed(store);const service=new GenerationService(store),guest=await store.guest(undefined,'Reference studio');
 const prompts:Record<string,string>={
  'toast-catch':'Create finished media for Toast Catch without changing its code or rules. The toast asset is one happy golden toast slice with a bold brown crust and a simple smiling face, transparent background. Use warm chunky cartoon shapes readable at 40 pixels. Compose an original cheerful breakfast chiptune, triangle melody and gentle bouncy bass. Four bars that loop smoothly.',
  'asteroid-scramble':'Create finished media for Asteroid Scramble without changing its code or rules. The asteroid asset is one round chunky purple gray space rock, a bold irregular silhouette filling its square, craters, transparent background. Retro pixel illustration readable at 48 pixels. Compose an original tense cosmic arcade loop, square lead and sine bass, sparse sharp percussion. Four seamless bars.',
  'umbrella-panic':'Create finished media for Umbrella Panic without changing its code or rules. The umbrella asset is one lavender open umbrella with white hooked handle, wide canopy, bold dark outlines, a hand-drawn look and transparent background. Readable at 72 pixels. Compose an original wistful rainy-day chiptune, mellow triangle arpeggios with a little syncopation, different from a cheerful breakfast song. Four seamless bars.'
 };
 for(const [gameId,prompt] of Object.entries(prompts)){
  const manifest=(await store.library()).find(v=>v.manifest.gameId===gameId)!.manifest;
  if(manifest.assets.some(a=>(a.provenance as any)?.kind==='image-model')&&(manifest.music as any)?.provenance?.model){report.push({gameId,reused:manifest.id});continue;}
  let job=await service.create(guest.id,prompt,{remix:manifest.id,mediaOnly:true});console.log(`${gameId}: ${job.id}`);
  while(job.status==='working'){await new Promise(r=>setTimeout(r,500));job=await service.get(job.id,guest.id);}
  report.push({gameId,job});console.log(`${gameId}: ${job.status}${job.error?` — ${job.error}`:''}`);
 }
 await mkdir('evidence',{recursive:true});await writeFile('evidence/reference-media.json',JSON.stringify(report,null,2));if(report.some((r:any)=>r.job?.status==='failed'))process.exitCode=1;
}finally{await store.close();}
