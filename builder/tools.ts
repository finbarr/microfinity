import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {z} from 'zod';
import {compileIsolated} from '../server/compile-process';
import {bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {HeadlessEnvironment} from '../runtime/headless';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

export const traceSchema=z.object({name:z.string().min(1).max(80),players:z.number().int().min(1).max(4),seed:z.number().int().min(0).max(100000),steps:z.array(z.object({frames:z.number().int().min(1).max(60),actions:z.record(z.string().regex(/^p[0-3]$/),z.number().int().min(0).max(17))}).strict()).max(1200)}).strict();
export const witnessesSchema=z.array(traceSchema).min(4).max(12);
type Trace=z.infer<typeof traceSchema>;

export async function simulate(code:string,runtime:string,trace:Trace,assetNames:string[],random=false){
  const vm=await Sandbox.create(code,runtime),env=new HeadlessEnvironment(vm,{players:trace.players,mode:'party-v1',actionRepeat:1,maxDecisions:8000});
  try{
    let result=env.reset(trace.seed),ticks=0,rng=trace.seed+1;
    const samples:any[]=[];const capture=()=>{
      for(const player of result.agents){const view=result.observations[player].game;vm.call('draw',view,[]);const commands=vm.call('draw',view,assetNames);if(player==='p0'&&samples.length<6)samples.push({tick:ticks,view,commands});}
    };capture();
    for(const step of trace.steps){for(let frame=0;frame<step.frames&&!result.terminated;frame++){
      result=env.step(step.actions);ticks++;if(ticks%120===0)capture();
    }if(result.terminated)break;}
    // Idle remainder, or deterministic independent stress input. No arbitrary JS tests.
    while(!result.terminated&&ticks<8000){
      rng=(Math.imul(rng,1664525)+1013904223)>>>0;
      result=env.step(random?Object.fromEntries(result.agents.map((p,i)=>[p,(rng>>>(i*5))%18])):{});ticks++;if(ticks%120===0)capture();
    }
    if(!result.terminated)throw new Error(`${trace.name}: did not terminate within 8000 ticks`);
    capture();
    for(const info of Object.values(result.infos) as any[])if(!Number.isFinite(info.rawScore)||!['success','failure'].includes(info.outcome))throw new Error('Each player needs a finite score and explicit success/failure outcome');
    return {name:trace.name,players:trace.players,seed:trace.seed,ticks,infos:result.infos,final:result.observations,samples};
  }finally{env.close();}
}

async function render(samples:any[],style:string,output:string){
  const media=JSON.parse(await readFile('/input/media.json','utf8'));
  const assets=await Promise.all(media.assets.map(async(a:any)=>({name:a.name,data:'data:image/png;base64,'+(await readFile('/media/'+a.file)).toString('base64')})));
  const bundle=await build({entryPoints:['client/renderer.ts'],bundle:true,write:false,format:'iife',globalName:'Renderer'});
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  try{const page=await browser.newPage({viewport:{width:640,height:400}});await page.setContent('<style>body{margin:0}canvas{display:block}</style><canvas width="640" height="400"></canvas>');await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.evaluate(async(assets)=>{(window as any).images=new Map();for(const a of assets){const image=new Image();image.src=a.data;await image.decode();(window as any).images.set(a.name,image);}},assets);
    const sample=samples[Math.min(samples.length-1,2)];
    await page.evaluate(({sample,style})=>(window as any).Renderer.drawCommands(document.querySelector('canvas'),sample.commands,(window as any).images,style),{sample,style});
    await page.screenshot({path:output});
  }finally{await browser.close();}
}

const [command,file,extra]=process.argv.slice(2);
if(command==='--help'||command==='help')console.log(await readFile('/kit/builder/TOOLS.md','utf8'));
else if(command){
  try{
    const source=await readFile(resolve(file),'utf8'),compiled=await compileIsolated(source),runtime=await bootstrap();
    if(command==='check')console.log(JSON.stringify({ok:true,meta:compiled.meta,assets:compiled.assets}));
    else if(command==='simulate'||command==='render'){
      const trace=traceSchema.parse(JSON.parse(await readFile(extra,'utf8'))),result=await simulate(compiled.code,runtime,trace,compiled.assets);
      if(command==='render'){const output=process.argv[5]??'/scratch/preview.png';await render(result.samples,compiled.meta.style,output);console.log(JSON.stringify({ok:true,path:output}));}
      else console.log(JSON.stringify(result));
    }else if(command==='snapshot'){
      const vm=await Sandbox.create(compiled.code,runtime);
      const env=new HeadlessEnvironment(vm,{players:1,mode:'party-v1',actionRepeat:1,maxDecisions:300});
      try{
        let result=env.reset(42);const samples:any[]=[];
        for(let tick=0;tick<=240;tick++){
          if(tick%120===0||result.terminated){const view=result.observations.p0.game;samples.push({tick,view,commands:vm.call('draw',view,compiled.assets)});}
          if(result.terminated)break;
          result=env.step({p0:tick%120<60?8:6});
        }
        const path='/scratch/snapshot.png';await render(samples,compiled.meta.style,path);
        console.log(JSON.stringify({ok:true,players:1,seed:42,tick:samples[Math.min(samples.length-1,2)].tick,png:(await readFile(path)).toString('base64')}));
      }finally{env.close();}
    }else if(command==='validate'){
      const brief=JSON.parse(await readFile('/input/brief.json','utf8')),media=JSON.parse(await readFile('/input/media.json','utf8'));
      if(compiled.meta.id!==brief.gameId||compiled.meta.clock!==brief.clock||JSON.stringify(compiled.meta.players)!=='[1,4]'||compiled.meta.modifiers.length)throw new Error('Metadata must match brief, support [1,4], and use modifiers:[]');
      if(!compiled.meta.rules)throw new Error('A public rulebook is required');
      if(media.music&&compiled.audio.music!==media.music.name)throw new Error('Use the supplied soundtrack name in audio.music');
      if(compiled.assets.length!==media.assets.length||!media.assets.every((a:any)=>compiled.assets.includes(a.name)))throw new Error('Declare exactly the supplied sprites');
      const traces=witnessesSchema.parse(JSON.parse(await readFile(extra,'utf8'))),reports:any[]=[],screenshots:any[]=[];
      for(let players=1;players<=4;players++){
        const witnesses=traces.filter(t=>t.players===players);if(!witnesses.length)throw new Error(`Provide a useful play trace for ${players} players`);
        let changed=false;const participating=new Set<string>();
        for(const trace of witnesses){
          const result=await simulate(compiled.code,runtime,trace,compiled.assets),replay=await simulate(compiled.code,runtime,trace,compiled.assets);
          if(JSON.stringify(result)!==JSON.stringify(replay))throw new Error('Nondeterministic replay');
          const idle=await simulate(compiled.code,runtime,{...trace,name:'idle',steps:[]},compiled.assets);
          if(JSON.stringify(result.infos)!==JSON.stringify(idle.infos))changed=true;
          for(const [id,info] of Object.entries(result.infos) as [string,any][])if(info.rawScore!==idle.infos[id].rawScore||info.outcome!==idle.infos[id].outcome)participating.add(id);
          if(players===1&&result.infos.p0.outcome!=='success')throw new Error('Solo witness must succeed');
          if(players===1&&idle.infos.p0.outcome!=='failure')throw new Error('Solo idle must fail');
          if(!media.assets.every((a:any)=>result.samples.some(s=>s.commands.some((c:any)=>c.op==='sprite'&&c.args[0]===a.name))))throw new Error('Draw each supplied sprite during play');
          reports.push({name:trace.name,players,seed:trace.seed,ticks:result.ticks,infos:result.infos,idle:idle.infos});
          if(players===1||players===4){await mkdir('/scratch/renders',{recursive:true});const path=`/scratch/renders/${players}.png`;await render(result.samples,compiled.meta.style,path);screenshots.push({players,png:(await readFile(path)).toString('base64')});}
        }
        if(!changed||participating.size!==players)throw new Error(`Witnesses must show input changing each of ${players} players' scores or outcomes`);
        await simulate(compiled.code,runtime,{name:'independent-stress',players,seed:7281+players,steps:[]},compiled.assets,true);
      }
      const artifact={ok:true,...compiled,runtime,reports,screenshots};
      await writeFile('/scratch/validation.json',JSON.stringify(artifact));
      console.log(JSON.stringify(process.argv.includes('--artifact')?artifact:{ok:true,reports,path:'/scratch/validation.json',screenshots:screenshots.map(s=>({players:s.players,path:`/scratch/renders/${s.players}.png`}))}));
    }else throw new Error('Use check, simulate, render or validate');
  }catch(e){console.error((e as Error).message);process.exitCode=1;}
}
