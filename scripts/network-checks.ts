/** Full local matches with delayed normal WebSocket messages. No browser/human claim. */
import {WebSocket} from 'ws';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {ClientClock} from '../client/network-clock';import {Sandbox} from '../runtime/sandbox';import {ReplayRunner} from '../runtime/replay';
const base=process.env.TEST_BASE_URL??'http://localhost:3000';
async function api(path:string,token?:string,body?:unknown){const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw new Error(result.error);return result;}
const library=await api('/library'),game=library.find((m:any)=>m.gameId==='skill-continue');if(!game)throw new Error('Seed Skill Continue first');
const conditions:{name:string;oneWay:number;jitter:number;stall:number;untimed?:boolean}[]=[{name:'local',oneWay:0,jitter:0,stall:0},{name:'rtt-100',oneWay:50,jitter:0,stall:0},{name:'rtt-200-jitter',oneWay:100,jitter:20,stall:0},{name:'rtt-200-stalls',oneWay:100,jitter:20,stall:220},{name:'rtt-200-no-correction',oneWay:100,jitter:20,stall:0,untimed:true}].filter(c=>!process.env.TEST_SCENARIOS||process.env.TEST_SCENARIOS.split(',').includes(c.name));
const reports:any[]=[];await mkdir('evidence/network',{recursive:true});
for(const condition of conditions){
 const guests=await Promise.all([0,1].map(i=>api('/guest',undefined,{name:`Timing probe ${i+1}`}))),room=await api('/rooms',guests[0].token,{versions:[game.id],settings:{targetPlayers:2,botType:'scripted',mode:'native',difficulty:3,seed:808}});
 let finished:any;const clients:any[]=[],timers=new Set<ReturnType<typeof setTimeout>>(),errors:string[]=[],started=Date.now();
 // Each direction preserves order, like one TCP stream. A stall blocks later
 // messages rather than unrealistically allowing snapshots to overtake it.
 function transport(deliver:(m:any)=>void,seed:number){
  let next=0,count=0,rng=seed,scheduled:ReturnType<typeof setTimeout>|undefined;const queue:{at:number;message:any}[]=[];
  const drain=()=>{while(queue.length&&queue[0].at<=performance.now())deliver(queue.shift()!.message);if(queue.length&&!scheduled){scheduled=setTimeout(()=>{timers.delete(scheduled!);scheduled=undefined;drain();},Math.max(1,Math.ceil(queue[0].at-performance.now())));timers.add(scheduled);}};
  return (message:any)=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;count++;const jitter=(rng/4294967296*2-1)*condition.jitter,stall=condition.stall&&count%80===0?condition.stall:0;next=Math.max(next+.01,performance.now()+Math.max(0,condition.oneWay+jitter)+stall);queue.push({at:next,message});drain();};
 }
 try{
  for(let index=0;index<2;index++)await new Promise<void>((resolve,reject)=>{
   const localNow=()=>performance.now()+index*37000,clock=new ClientClock(localNow),ws=new WebSocket(base.replace('http','ws')+'/socket');
   const client:any={ws,clock,localNow,seq:0,loaded:'',ready:false,joined:false,pressed:false,samples:[],presses:[]};clients.push(client);
   client.send=transport(m=>{if(ws.readyState===1)ws.send(JSON.stringify(m));},index+3);
   ws.on('open',()=>client.send({type:'join',roomId:room.id,token:guests[index].token}));ws.on('error',reject);
   const receive=transport((m:any)=>{
    if(m.type==='clock-probe'){client.send({type:'clock-reply',id:m.id,clientTime:localNow()});return;}
    if(m.type==='clock'){clock.update(m);client.samples.push({rtt:m.sampleRtt??m.rtt,sampleMeasured:m.sampleRtt!==undefined,uncertainty:m.uncertainty,offset:m.offset});return;}
    if(m.type==='error'){errors.push(m.message);return;}if(m.type!=='state')return;
    if(client.state?.epoch!==m.epoch){client.seq=0;client.pressed=false;}
    client.state=m;if(!client.joined){client.joined=true;resolve();}
    if(m.phase==='lobby'&&!client.ready){client.ready=true;client.send({type:'ready'});}
    if(m.phase==='preparing'&&client.loaded!==m.matchId+':'+m.round){client.loaded=m.matchId+':'+m.round;client.send({type:'loaded',versionId:m.manifest.id});}
    if(m.phase==='match-result')finished=m;
   },index+11);ws.on('message',bytes=>receive(JSON.parse(bytes.toString())));
  });
  await new Promise(r=>setTimeout(r,1800));clients[0].send({type:'start'});
  const tick=setInterval(()=>{for(const c of clients){const s=c.state,v=s?.view?.game;if(s?.phase!=='playing'||!v||s.view.roles[s.playerId]!=='challenger'||c.pressed)continue;
   const ahead=Math.max(0,Math.min(.25,(c.clock.now()-s.view.sampleTime)/1000)),phase=v.phase+ahead*v.rate;
   if(phase<.65)continue;c.pressed=true;c.presses.push({tick:s.view.tick,shownPhase:phase,rawPhase:v.phase,rate:v.rate,ahead,epoch:s.epoch});
   const envelope={type:'input',matchId:s.matchId,round:s.round,epoch:s.epoch,method:'keyboard'};
   c.send({...envelope,seq:++c.seq,...(condition.untimed?{}:{clientTime:c.localNow()}),edges:[{button:'action',down:true}]});
   const releaseSeq=++c.seq;const release=setTimeout(()=>{timers.delete(release);c.send({...envelope,seq:releaseSeq,...(condition.untimed?{}:{clientTime:c.localNow()}),edges:[{button:'action',down:false}]});},30);timers.add(release);
  }},8);
  try{while(!finished&&Date.now()-started<60000)await new Promise(r=>setTimeout(r,100));}finally{clearInterval(tick);}
  assert.ok(finished,'Match must complete');assert.deepEqual(errors,[]);
  const match=await api('/matches/'+finished.matchId,guests[0].token),round=match.record.rounds[0];assert.ok(round);assert.equal(match.status,'complete');
  const version=await api('/versions/'+round.versionId),runtime=await fetch(base+version.manifest.runtimeUrl).then(r=>r.text()),vm=await Sandbox.create(version.code,runtime);let replayMatches=false;
  try{const replay=new ReplayRunner(vm,round);replay.seek(round.status.tick);replayMatches=replay.verify()===true;}finally{vm.dispose();}assert.equal(replayMatches,true);
  const samples=clients.flatMap(c=>c.samples).map(s=>s.rtt).sort((a,b)=>a-b),ages=round.journal.flatMap((j:any)=>Object.values(j.edges??{}).flatMap((edges:any)=>edges.filter((e:any)=>e.down).map((e:any)=>e.age??0)));
  assert.ok(ages.every((age:number)=>age>=0&&age<=.15));
  if(!condition.stall&&!condition.untimed)assert.ok(round.records.every((r:any)=>r.score>=8),'Synchronized centered timing presses should continue to succeed across role epochs');
  const report={condition,method:'Ordered application-layer delay on both directions of normal WebSocket messages; clients use only public phase/rate and synchronized time. Not browser or human play.',matchId:match.id,versionId:round.versionId,elapsedMs:Date.now()-started,replayMatches,measuredRtt:{kind:clients.every(c=>c.samples.every((s:any)=>s.sampleMeasured))?'individual probe RTT':'minimum RTT estimates (legacy response)',samples:samples.length,p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)]},seats:round.records.map((r:any)=>({player:r.playerId,score:r.score,outcome:r.outcome,network:r.network})),presses:clients.map(c=>c.presses),appliedAges:ages};
  await writeFile(`evidence/network/${condition.name}-${match.id}.json`,JSON.stringify({report,match},null,2));reports.push(report);console.log(JSON.stringify({condition:condition.name,match:match.id,rtt:report.measuredRtt,scores:report.seats.map((s:any)=>s.score),replayMatches,rejected:report.seats.map((s:any)=>s.network.rejected)}));
  const reportName=process.env.TEST_SCENARIOS?'report-selected.json':'report.json';
  await writeFile(`evidence/network/${reportName}`,JSON.stringify(reports,null,2));
 }finally{for(const timer of timers)clearTimeout(timer);for(const c of clients)c.ws.close();}
}
