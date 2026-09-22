import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { compile, bootstrap } from '../server/compiler';
import { Sandbox } from '../runtime/sandbox';
import { Store } from '../server/store';
import {bundledCartridgeIcon} from '../server/cartridge-icons';
export async function seed(store:Store){
  const existing=new Map((await store.library()).map(v=>[v.manifest.gameId,v.manifest]));
  for(const file of (await readdir('games')).filter(f=>f.endsWith('.ts')).sort()){
    const source=await readFile(`games/${file}`,'utf8'),code=await compile(source),vm=await Sandbox.create(code,await bootstrap());
    try{const {meta,audio}=vm.call('meta'),saved=existing.get(meta.id),icon=await bundledCartridgeIcon(store,meta.id)??saved?.icon;await store.putVersion(source,code,meta,saved?.assets??[],saved?.music??null,{...saved?.provenance,kind:'reference',art:saved?.assets.length?'ready':'pending',music:saved?.music?'ready':'pending',icon:icon?'ready':'pending'},undefined,undefined,audio,undefined,icon);console.log(`Ready: ${meta.title}`);}finally{vm.dispose();}
  }
}
if(process.argv[1]?.endsWith('seed.ts')){const store=new Store();await store.init();try{await seed(store);}finally{await store.close();}}
