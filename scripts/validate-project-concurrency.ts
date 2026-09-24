import assert from 'node:assert/strict';
import pg from 'pg';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {Store,id} from '../server/store';
import {Projects,ProjectWorker} from '../server/projects';
import {compileIsolated} from '../server/compile-process';
import {bootstrap} from '../server/compiler';

// Real PostgreSQL and independent OS workers; fixture builds isolate queue semantics.
const url=process.env.STUDIO_TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Set STUDIO_TEST_DATABASE_URL to an explicit localhost PostgreSQL test database');
const source=await readFile('games/toast-catch.ts','utf8'),compiled=await compileIsolated(source),runtime=await bootstrap();
if(process.argv.includes('--worker')){
  const store=new Store(process.env.STUDIO_TEST_DATA_DIR!,url);await store.init({recoverMatches:false});
  const worker=new ProjectWorker(new Projects(store),{async run(input){
    await input.onProgress({branches:{code:'working'}},{});
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(resolve,2000);
      input.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(input.signal.reason);},{once:true});
    });
    return {media:{},usage:[],build:{...compiled,meta:{...compiled.meta,id:input.gameId},source,runtime,reports:[{fixture:true}],model:'queue-fixture',usage:[]}};
  }},{concurrency:4,slots:2,leaseMs:1800});
  worker.start();console.log(JSON.stringify({workerId:worker.workerId}));
  process.once('SIGTERM',()=>void worker.close().then(()=>store.close()));
}else{
  const admin=new pg.Client({connectionString:url});await admin.connect();
  const schema='studio_queue_'+Date.now();await admin.query(`CREATE SCHEMA ${schema}`);
  const testUrl=new URL(url);testUrl.searchParams.set('options','-c search_path='+schema);
  const root=await mkdtemp(join(tmpdir(),'microfinity-pg-workers-'));
  const store=new Store(root,testUrl.toString());await store.init({recoverMatches:false});
  const projects=new Projects(store),workers:ReturnType<typeof spawn>[]=[],samples:any[]=[];
  try{
    const owners=await Promise.all(Array.from({length:8},(_,i)=>store.guest(undefined,`Queue ${i}`)));
    const games=await Promise.all(owners.map(owner=>projects.create(owner.id,{requestId:id(),prompt:'Catch a falling toast before it hits the floor.'})));
    const start=()=>{
      const child=spawn(process.execPath,['--import','tsx',resolve('scripts/validate-project-concurrency.ts'),'--worker'],{env:{...process.env,STUDIO_TEST_DATABASE_URL:testUrl.toString(),STUDIO_TEST_DATA_DIR:root,BUILDER_REAPER:'off'},stdio:['ignore','pipe','pipe']});
      workers.push(child);return child;
    };
    const a=start(),b=start();
    let killed=false,killedTurns:string[]=[],healthyId:string|undefined,maxActive=0;
    const deadline=Date.now()+45000;
    for(;;){
      const rows=await store.query('SELECT id,status,worker_id,attempts FROM project_turns ORDER BY created_at,id');
      const working=rows.filter(row=>row.status==='working');maxActive=Math.max(maxActive,working.length);
      samples.push({time:Date.now(),active:working.length,ready:rows.filter(row=>row.status==='ready').length});
      if(!killed&&new Set(working.map(row=>row.worker_id)).size===2){
        // Child a's first stdout line identifies which leases its actual process owns.
        const output=await new Promise<string>(resolve=>{const buffered=a.stdout!.read();if(buffered)resolve(buffered.toString());else a.stdout!.once('data',chunk=>resolve(chunk.toString()));});
        const workerId=JSON.parse(output.trim()).workerId;
        killedTurns=working.filter(row=>row.worker_id===workerId).map(row=>row.id);
        healthyId=working.find(row=>row.worker_id!==workerId)!.id;
        a.kill('SIGKILL');killed=true;
      }
      assert.ok(working.length<=4,'global active cap');
      if(rows.every(row=>row.status==='ready')){
        assert.ok(killed&&killedTurns.length);
        assert.ok(rows.filter(row=>killedTurns.includes(row.id)).every(row=>row.attempts===2),'killed process turns recovered once');
        assert.equal(rows.find(row=>row.id===healthyId).attempts,1,'healthy worker was not restarted');
        break;
      }
      if(Date.now()>deadline)throw Error('Parallel queue test timed out: '+JSON.stringify(rows));
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.equal((await projects.list(owners[0].id)).length,1);
    const report={owners:8,workers:2,maxActive,killedTurnsRecovered:killedTurns.length,healthyWorkerUnaffected:true,seconds:(samples.at(-1).time-samples[0].time)/1000,samples};
    await mkdir('artifacts/interactive-studio',{recursive:true});await writeFile('artifacts/interactive-studio/queue-concurrency.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify({...report,samples:undefined}));
  }finally{
    for(const child of workers)child.kill('SIGTERM');
    await Promise.all(workers.map(child=>child.exitCode!==null||child.signalCode!==null?undefined:new Promise(resolve=>child.once('exit',resolve))));
    await store.close();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();await rm(root,{recursive:true,force:true});
  }
}
