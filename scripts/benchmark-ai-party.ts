/** Real Room + child runtime + three concurrent Jev seats. Human seat is idle. */
import 'dotenv/config';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store,hash,type Version} from '../server/store';
import {Room} from '../server/rooms';
import {compile,bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {configuredJevStrategy} from '../server/controllers';

if(!process.env.TYPESAFE_API_KEY)throw Error('TYPESAFE_API_KEY is required');
const names=process.argv.slice(2),root=await mkdtemp(join(tmpdir(),'microfinity-live-ai-'));
const store=new Store(root,''),episodes:any[]=[];
let room:Room|undefined;
const output=process.env.JEV_PARTY_OUTPUT??'evidence/jev/three-ai-party.json';
const strategy=configuredJevStrategy();
const controllerHash=hash(await readFile('server/controllers.ts','utf8')+await readFile('server/controller-evidence.ts','utf8')+await readFile('server/controller-navigation.ts','utf8'));
class Peer {
  readyState=1;bufferedAmount=0;state:any;error='';loaded='';
  send(raw:string){
    const message=JSON.parse(raw);
    if(message.type==='error')this.error=message.message;
    if(message.type==='clock-probe')queueMicrotask(()=>void room?.message(this as any,{type:'clock-reply',id:message.id,clientTime:performance.now()}));
    if(message.type==='state'){
      this.state=message;
      if(message.phase==='preparing'&&message.manifest.id!==this.loaded){
        this.loaded=message.manifest.id;
        queueMicrotask(()=>void room?.message(this as any,{type:'loaded',versionId:this.loaded}));
      }
    }
  }
  close(){this.readyState=3;}
}
try{
  await store.init();const guest=await store.guest(undefined,'Idle human'),versions:Version[]=[];
  for(const name of names.length?names:['nose-dive','crawl-for-gold','odd-snack-out','toast-catch']){
    const source=await readFile(`games/${name}.ts`,'utf8'),code=await compile(source),vm=await Sandbox.create(code,await bootstrap());
    try{versions.push(await store.putVersion(source,code,vm.call('meta').meta));}finally{vm.dispose();}
  }
  for(const version of versions){
    room=new Room(store,guest.id,[version],{seed:Number(process.env.JEV_PARTY_SEED??41)});
    const peer=new Peer();await room.join(guest,peer as any);await room.message(peer as any,{type:'start'});
    const deadline=performance.now()+(version.manifest.meta.duration+25)*1000;
    while(room.phase!=='match-result'&&performance.now()<deadline)await new Promise(resolve=>setTimeout(resolve,50));
    if(room.phase!=='match-result')throw Error(`Room did not finish ${version.game_id}`);
    const [match]=await store.query('SELECT status,record FROM matches WHERE id=$1',[room.matchId]);
    const records=match.record.rounds[0]?.records??[];
    const episode={name:version.game_id,sourceHash:hash(version.source),strategy,status:match.status,error:peer.error||peer.state?.error,results:records.map((record:any)=>({playerId:record.playerId,score:record.score,outcome:record.outcome,controllers:record.controllers,calls:record.metrics.filter((m:any)=>m.started!==undefined).length,errors:record.metrics.filter((m:any)=>m.error),stale:record.metrics.filter((m:any)=>m.stale).length,latencyMedianMs:record.metrics.filter((m:any)=>m.latencyMs!==undefined).map((m:any)=>m.latencyMs).sort((a:number,b:number)=>a-b)[Math.floor(record.metrics.filter((m:any)=>m.latencyMs!==undefined).length/2)]})),record:match.record};
    episodes.push(episode);console.log(JSON.stringify({...episode,record:undefined}));
    await mkdir('evidence/jev',{recursive:true});await writeFile(output,JSON.stringify({at:new Date().toISOString(),controllerHash,seed:Number(process.env.JEV_PARTY_SEED??41),method:'Real Room with one idle human and three concurrent AI seats, production scheduling, realtime latency, child runtime and saved scores. Any fallback is reported as an error.',episodes},null,2));
    await room.close();room=undefined;
  }
  if(episodes.some(e=>e.status!=='complete'||e.error||e.results.length!==4||e.results.slice(1).some((r:any)=>r.errors.length||!r.controllers.includes('jev'))))process.exitCode=1;
}finally{await room?.close();await store.close();await rm(root,{recursive:true,force:true});}
