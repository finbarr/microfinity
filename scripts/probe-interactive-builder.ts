import 'dotenv/config';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,basename,resolve} from 'node:path';
import {Store} from '../server/store';
import {BlaxelGameBuilder} from '../server/blaxel-game-builder';

const baseline=process.argv[2];
if(!baseline)throw Error('Usage: node --import tsx scripts/probe-interactive-builder.ts artifacts/builder-validation/<run>');
const project=JSON.parse(await readFile(resolve(baseline,'project.json'),'utf8'));
const revision=project.revisions.find((r:any)=>r.id===project.selected_revision);
if(!revision)throw Error('Choose a completed local validation project');
const saved=new Store(resolve(baseline,'data'),'');
let version;
try{await saved.init({recoverMatches:false});version=await saved.version(revision.version_id);}finally{await saved.close();}
const root=resolve('artifacts/interactive-bridge',String(Date.now()));
await mkdir(root,{recursive:true});
const store=new Store(join(root,'data'),'');await store.init();
const manifest=version.manifest;
for(const asset of [...manifest.assets,manifest.music,manifest.icon].filter(Boolean) as any[])await store.putAsset(await readFile(resolve(baseline,'data/assets',basename(asset.url))),asset.url.endsWith('wav')?'wav':'png');
let source=version.source,witnesses:unknown,session:any;
const builder=new BlaxelGameBuilder(store,{model:process.env.BUILDER_MODEL??'gpt-6-sol',reasoningEffort:process.env.BUILDER_REASONING_EFFORT??'medium',evidenceDirectory:root});
try{
  for(const [index,prompt] of ['Change the sky background to deep purple. Preserve all gameplay, timing, scoring, and controls.','Keep the purple sky. Change the public title to Midnight Marshmallows. Preserve every gameplay mechanic.'].entries()){
    const started=Date.now();console.log(JSON.stringify({root,turn:index+1,event:'start'}));
    const result=await builder.build({jobId:`turn-${index+1}`,prompt:project.idea+'\nCurrent edit: '+prompt,brief:manifest.provenance.brief,gameId:manifest.meta.id,assets:manifest.assets,music:manifest.music,icon:manifest.icon,parent:source,session,witnesses,signal:AbortSignal.timeout(600000),onMessage:async()=>{},onStage:async stage=>{console.log(JSON.stringify({turn:index+1,event:stage,ms:Date.now()-started}));},onSnapshot:async snapshot=>{await writeFile(join(root,`turn-${index+1}-${Date.now()}.png`),Buffer.from(snapshot.png,'base64'));console.log(JSON.stringify({turn:index+1,event:'snapshot',hash:snapshot.sourceHash,ms:Date.now()-started}));}});
    source=result.source;session=result.session;witnesses=result.witnesses;
    await writeFile(join(root,`result-${index+1}.json`),JSON.stringify(result),{mode:0o600});
    console.log(JSON.stringify({turn:index+1,event:'complete',ms:Date.now()-started,thread:result.thread,sessionBytes:JSON.stringify(session)?.length}));
  }
}finally{await store.close();}
