import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { compile, bootstrap } from '../server/compiler';
import { Sandbox } from '../runtime/sandbox';
import { HeadlessEnvironment } from '../runtime/headless';
let env:HeadlessEnvironment|undefined;
const lines=createInterface({input:process.stdin});
for await(const line of lines){
  try{
    if(line.length>500_000)throw new Error('Message size exceeded');const request=JSON.parse(line);let result:any;
    if(request.method==='load'){
      env?.close();let code:string,boot:string;
      if(request.cartridge){const saved=JSON.parse(await readFile(request.cartridge,'utf8'));code=saved.code;boot=saved.runtime;}
      else {if(!/^[a-z0-9-]+$/.test(request.game))throw new Error('Invalid game id');code=await compile(await readFile(`games/${request.game}.ts`,'utf8'));boot=await bootstrap();}
      env=new HeadlessEnvironment(await Sandbox.create(code,boot),request.options??{});result={meta:env.meta};
    }else if(request.method==='reset')result=env!.reset(request.seed);
    else if(request.method==='step')result=env!.step(request.actions);
    else if(request.method==='snapshot')result=env!.snapshot();
    else if(request.method==='restore'){env!.restore(request.snapshot);result={ok:true};}
    else if(request.method==='close'){env?.close();process.stdout.write(JSON.stringify({ok:true})+'\n');break;}
    else throw new Error('Unknown method');
    process.stdout.write(JSON.stringify({result})+'\n');
  }catch(e){process.stdout.write(JSON.stringify({error:(e as Error).message})+'\n');}
}
