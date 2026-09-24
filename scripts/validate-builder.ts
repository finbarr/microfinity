import 'dotenv/config';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Store,id} from '../server/store';
import {GenerationService} from '../server/generation';
import {BlaxelGameBuilder} from '../server/blaxel-game-builder';
import {Projects,ProjectWorker} from '../server/projects';

// Always isolated local data. This script never reads DATABASE_URL or app data.
const directory=resolve(process.env.BUILDER_VALIDATION_DIR??`artifacts/builder-validation/${Date.now()}`);
await mkdir(directory,{recursive:true});
const store=new Store(resolve(directory,'data'),'');await store.init();
const previous=process.env.BUILDER_VALIDATION_RETRY==='1'
  ? JSON.parse(await readFile(resolve(directory,'owner.private.json'),'utf8')) : undefined;
const owner=previous?.owner??await store.guest(undefined,'Local builder validation');
const builder=new BlaxelGameBuilder(store,{evidenceDirectory:directory});
const projects=new Projects(store),worker=new ProjectWorker(projects,new GenerationService(store,{},undefined,undefined,builder));
try{
  let project;
  if(previous){
    const saved=await projects.get(previous.projectId,owner.id),last=saved.turns.at(-1)!;
    project=await projects.submit(saved.id,owner.id,{requestId:id(),message:last.message,retryOf:last.id});
  }else project=await projects.create(owner.id,{requestId:id(),prompt:process.argv.slice(2).join(' ')||'A sleepy dragon catches falling marshmallows. Move left and right, press Space to catch one in your mouth, and catch three to win.'});
  await writeFile(resolve(directory,'owner.private.json'),JSON.stringify({owner,projectId:project.id}),{mode:0o600});
  worker.start();console.log(JSON.stringify({directory,projectId:project.id}));let last='';
  while(project.turns.some(turn=>['working','queued'].includes(turn.status))){
    const state=JSON.stringify(project.turns.map(turn=>({status:turn.status,stage:turn.stage})));if(state!==last){console.log(state);last=state;}
    await new Promise(resolve=>setTimeout(resolve,2000));project=await projects.get(project.id,owner.id);
  }
  if(project.selected_revision)project=await projects.publish(project.id,owner.id,project.selected_revision);
  await writeFile(resolve(directory,'project.json'),JSON.stringify(project,null,2));
  console.log(JSON.stringify({status:project.turns.at(-1)?.status,revision:project.published_revision,error:project.turns.at(-1)?.error}));
  if(!project.published_revision)process.exitCode=1;
}finally{await worker.close();await store.close();}
