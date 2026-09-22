/** Protocol-level integration, not genuine human/browser input evidence. */
import {WebSocket} from 'ws';import {mkdir,writeFile} from 'node:fs/promises';import {emptyButtons} from '../sdk/index';import {buttonEdges} from '../runtime/input';import {scriptedDecision} from '../server/controllers';import {Sandbox} from '../runtime/sandbox';import {ReplayRunner} from '../runtime/replay';
const base=process.env.TEST_BASE_URL??'http://localhost:3000';
async function api(path:string,token?:string,body?:any){const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
const library=await api('/library'),scenarios=[
 {name:'four-connected-seats',game:'asteroid-scramble',humans:4,target:4,mode:'native'},
 {name:'two-connected-plus-jev',game:'asteroid-scramble',humans:2,target:4,mode:'native'},
 {name:'one-connected-plus-jev',game:'asteroid-scramble',humans:1,target:4,mode:'native'},
 {name:'action-driven-jev',game:'patchwork-pass',humans:1,target:2,mode:'native'},
 {name:'jev-challenger-and-interferer',game:'toast-catch',humans:1,target:2,mode:'obstruction'},
 {name:'disconnect-and-return',game:'asteroid-scramble',humans:2,target:2,mode:'native',reconnect:true},
].filter(s=>!process.env.TEST_SCENARIOS||process.env.TEST_SCENARIOS.split(',').includes(s.name));
if(!scenarios.length)throw new Error('No selected scenarios');
const reports:any[]=[];await mkdir('evidence/live-rooms',{recursive:true});
for(const scenario of scenarios){
 const manifest=library.find((v:any)=>v.gameId===scenario.game);if(!manifest)throw new Error('Missing reference game');
 const guests=await Promise.all(Array.from({length:scenario.humans},(_,i)=>api('/guest',undefined,{name:`Protocol ${i+1}`})));
 const room=await api('/rooms',guests[0].token,{versions:[manifest.id],settings:{targetPlayers:scenario.target,botType:'jev',mode:scenario.mode,difficulty:1,seed:93}});
 const clients:any[]=[],errors:string[]=[],handoffs:any[]=[],started=Date.now();let finished:any,reconnected=false,disconnected=false;
 const connect=(guest:any,index:number)=>new Promise<void>((resolve,reject)=>{
  const ws=new WebSocket(base.replace('http','ws')+'/socket'),client=clients[index]??{guest,seq:0,held:emptyButtons(),loaded:'',serial:0};clients[index]=client;client.ws=ws;client.connected=false;
  ws.on('open',()=>ws.send(JSON.stringify({type:'join',roomId:room.id,token:guest.token})));
  ws.on('error',reject);ws.on('message',bytes=>{const m=JSON.parse(bytes.toString());if(m.type==='error')errors.push(m.message);if(m.type!=='state')return;
   if(client.state?.epoch!==m.epoch){handoffs.push({index,epoch:m.epoch,phase:m.phase,elapsed:Date.now()-started});client.seq=0;client.held=emptyButtons();}
   client.state=m;if(!client.connected){client.connected=true;resolve();}if(m.phase==='lobby'&&!client.readySent){client.readySent=true;ws.send(JSON.stringify({type:'ready'}));}
   if(m.phase==='preparing'&&client.loaded!==m.matchId+':'+m.round){client.loaded=m.matchId+':'+m.round;ws.send(JSON.stringify({type:'loaded',versionId:m.manifest.id}));}
   if(m.phase==='match-result')finished=m;
  });
 });
 try{
  for(let i=0;i<guests.length;i++)await connect(guests[i],i);
  await new Promise(r=>setTimeout(r,100));clients[0].ws.send(JSON.stringify({type:'start'}));
  const timer=setInterval(()=>{for(const client of clients){const s=client.state;if(s?.phase!=='playing'||!s.view||client.ws.readyState!==1)continue;
    const buttons=scriptedDecision(s.manifest.meta,s.view,client.held,client.serial++).buttons,edges=buttonEdges(client.held,buttons);client.held=buttons;
    if(edges.length)client.ws.send(JSON.stringify({type:'input',matchId:s.matchId,round:s.round,epoch:s.epoch,seq:++client.seq,method:'keyboard',edges}));
   }
   const elapsed=Date.now()-started;
   if(scenario.reconnect&&elapsed>8000&&!disconnected){clients[1].ws.close();disconnected=true;}
   if(scenario.reconnect&&elapsed>12000&&!reconnected){reconnected=true;void connect(guests[1],1);}
  },200);
  try{while(!finished&&Date.now()-started<150000)await new Promise(r=>setTimeout(r,100));}finally{clearInterval(timer);}
  if(!finished)throw new Error('Match did not finish within integration deadline');
  const match=await api('/matches/'+finished.matchId,guests[0].token);await writeFile(`evidence/live-rooms/${scenario.name}-${match.id}.json`,JSON.stringify(match,null,2));
  const round=match.record.rounds[0];if(!round)throw new Error(match.record.error||'Missing recorded round');
  const version=await api('/versions/'+round.versionId),runtime=await fetch(base+(version.manifest.runtimeUrl??'/assets/runtime-legacy-1.0.0.js')).then(r=>r.text()),vm=await Sandbox.create(version.code,runtime);let replayMatches=false;
  try{const replay=new ReplayRunner(vm,round);replay.seek(round.status.tick);replayMatches=replay.verify()===true;}finally{vm.dispose();}
  const metrics=round.records.flatMap((r:any)=>r.metrics),latencies=metrics.filter((m:any)=>m.source==='jev').map((m:any)=>m.latencyMs).sort((a:number,b:number)=>a-b);
  const report={scenario,roomId:room.id,matchId:match.id,status:match.status,elapsedMs:Date.now()-started,errors,handoffs,replayMatches,observation:'structured player-visible state',clients:'programmatic WebSocket clients; not human or browser play',seats:round.records.map((r:any)=>({player:r.playerId,score:r.score,outcome:r.outcome,controllers:r.controllers,inputMethods:r.inputMethods})),jev:{decisions:latencies.length,models:[...new Set(metrics.map((m:any)=>m.model).filter(Boolean))],p50:latencies[Math.floor(latencies.length*.5)]??null,p95:latencies[Math.min(latencies.length-1,Math.floor(latencies.length*.95))]??null,stale:metrics.filter((m:any)=>m.stale).length,skipped:metrics.filter((m:any)=>m.skipped).length,fallback:metrics.filter((m:any)=>m.source==='scripted').length,choices:metrics.reduce((a:any,m:any)=>{if(m.choice)a[m.choice]=(a[m.choice]??0)+1;return a;},{})}};
  if(!replayMatches||match.status!=='complete'||errors.length)throw new Error('Room evidence failed: '+JSON.stringify(report));
  if(scenario.humans===scenario.target&&!scenario.reconnect&&latencies.length)throw new Error('Jev called for fully connected party');
  reports.push(report);console.log(JSON.stringify(report));await writeFile(`evidence/live-rooms/report${process.env.TEST_SCENARIOS?'-'+scenarios.map(s=>s.name).join('-'):''}.json`,JSON.stringify(reports,null,2));
 }finally{for(const c of clients)c.ws.close();}
}
