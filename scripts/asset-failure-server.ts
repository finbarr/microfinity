/** Isolated local fixture for normal-browser failed-image/recovery checks. No provider access. Stop with Ctrl-C to export evidence. */
import {spawn,type ChildProcess} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store,hash} from '../server/store';
import {seed} from './seed';
import {compile,bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner} from '../runtime/replay';

const root=await mkdtemp(join(tmpdir(),'microfinity-asset-failure-'));
const probe=createServer();await new Promise<void>(resolve=>probe.listen(0,'127.0.0.1',resolve));
const port=(probe.address() as {port:number}).port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
let child:ChildProcess|undefined,stopping=false;
const setup=new Store(root,'');await setup.init();
try{
  await seed(setup);
  const source=(await readFile('games/toast-catch.ts','utf8')).replace("id:'toast-catch'","id:'asset-failure-probe'").replace("title:'Toast Catch'","title:'Asset Failure Probe'");
  const code=await compile(source),vm=await Sandbox.create(code,await bootstrap());
  try{
    const {meta,audio}=vm.call('meta'),digest=hash('Deliberately absent sprite for a local recovery fixture.');
    await setup.putVersion(source,code,meta,[{name:'toast',hash:digest,url:`/assets/${digest}.png`,width:256,height:256}],null,{kind:'local-failed-image-fixture'},undefined,undefined,audio);
  }finally{vm.dispose();}
}finally{await setup.close();}

async function finish(){
  if(stopping)return;stopping=true;
  if(child&&child.exitCode===null&&child.signalCode===null){const exit=once(child,'exit');child.kill('SIGTERM');await exit;}
  const store=new Store(root,'');await store.init();
  try{
    const matches=await store.query('SELECT * FROM matches ORDER BY created_at'),results=await store.query('SELECT * FROM results ORDER BY match_id'),attempts=await store.query('SELECT * FROM round_attempts ORDER BY prepared_at');
    const verified=[];
    for(const match of matches)for(const round of match.record.rounds??[]){
      const version=await store.version(round.versionId),vm=await Sandbox.create(version.code,await store.runtime(version));
      try{const replay=new ReplayRunner(vm,round);replay.seek(round.status.tick);verified.push({matchId:match.id,exact:replay.verify()===true});}finally{vm.dispose();}
    }
    await mkdir('evidence/recovery',{recursive:true});
    await writeFile('evidence/recovery/asset-browser-report.json',JSON.stringify({at:new Date().toISOString(),base:`http://127.0.0.1:${port}`,method:'Isolated production server with a deliberately absent PNG in one fixture manifest. Normal browser navigation and actual image-loading path; no request interception or internal browser-state injection. Provider keys disabled. Matches from any concurrent protocol load probe are identified by participant names.',matches,results,attempts,verified},null,2));
    console.log(JSON.stringify({exportedMatches:matches.length,completeReplays:verified.length,allExact:verified.every(v=>v.exact)}));
  }finally{await store.close();await rm(root,{recursive:true,force:true});}
  process.exit(0);
}
process.on('SIGINT',()=>void finish());process.on('SIGTERM',()=>void finish());
child=spawn(process.execPath,['dist/server/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'production',DATA_DIR:root,DATABASE_URL:'',OPENAI_API_KEY:'',TYPESAFE_API_KEY:'',DOTENV_CONFIG_PATH:join(root,'no-provider.env')},stdio:['ignore','pipe','pipe']});
child.stdout?.pipe(process.stdout);child.stderr?.pipe(process.stderr);
child.on('exit',(code,signal)=>{if(!stopping){console.error(`Fixture server exited: ${code??signal}`);void finish();}});
console.log(JSON.stringify({fixtureUrl:`http://127.0.0.1:${port}`,root,providerAccess:false}));
