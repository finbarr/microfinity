/** Protocol-only production-room profile. Use the isolated asset-failure-server URL; never measures browser or provider throughput. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {cpus,totalmem} from 'node:os';
import {WebSocket} from 'ws';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner} from '../runtime/replay';

const base=process.argv[2];
if(!base||!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw new Error('Pass the isolated fixture URL: http://127.0.0.1:PORT');
async function api(path:string,token?:string,body?:unknown){
  const response=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok)throw new Error(data.error);return data;
}
async function until(check:()=>boolean,timeout=15000){const end=performance.now()+timeout;while(!check()){if(performance.now()>end)throw new Error('Capacity profile timed out');await new Promise(r=>setTimeout(r,20));}}
function quantiles(samples:number[]){const s=[...samples].sort((a,b)=>a-b);return {samples:s.length,p50:s[Math.min(s.length-1,Math.floor(s.length*.5))]??null,p95:s[Math.min(s.length-1,Math.floor(s.length*.95))]??null,p99:s[Math.min(s.length-1,Math.floor(s.length*.99))]??null,max:s.at(-1)??null};}
const library=await api('/library');assert.ok(library.some((m:any)=>m.gameId==='asset-failure-probe'),'Use the isolated fixture server');
const game=library.find((m:any)=>m.gameId==='asteroid-scramble'),version=await api('/versions/'+game.id),runtime=await fetch(base+game.runtimeUrl).then(r=>r.text());
const waves:any[]=[];
for(const count of [1,4,8]){
  const sockets:WebSocket[]=[],rooms:any[]=[],health:number[]=[],healthFailures:string[]=[];let stopHealth=false;
  const healthLoop=(async()=>{while(!stopHealth){const start=performance.now();try{await api('/health');health.push(performance.now()-start);}catch(e){healthFailures.push((e as Error).message);}await new Promise(r=>setTimeout(r,250));}})();
  try{
    await Promise.all(Array.from({length:count},async(_,roomIndex)=>{
      const guests=await Promise.all(Array.from({length:4},(_,i)=>api('/guest',undefined,{name:`Load ${count}.${roomIndex}.${i}`})));
      const room=await api('/rooms',guests[0].token,{versions:[game.id],settings:{targetPlayers:4,botType:'scripted',difficulty:3,seed:5200+roomIndex}});
      const entry:any={id:room.id,guests,clients:[]};rooms.push(entry);
      for(const guest of guests){
        const ws=new WebSocket(base.replace('http','ws')+'/socket');sockets.push(ws);
        const client:any={ws,state:null,errors:[],snapshots:[],phaseStarted:0,roundEnded:0,seq:0,epoch:-1,lastSegment:-1,inputs:0};entry.clients.push(client);
        client.send=(m:any)=>{if(ws.readyState===1)ws.send(JSON.stringify(m));};
        ws.on('error',e=>client.errors.push(e.message));
        ws.on('open',()=>client.send({type:'join',roomId:room.id,token:guest.token}));
        ws.on('message',raw=>{
          const m=JSON.parse(raw.toString());if(m.type==='clock-probe'){client.send({type:'clock-reply',id:m.id,clientTime:performance.now()});return;}
          if(m.type==='error'){client.errors.push(m.message);return;}if(m.type!=='state')return;
          const now=performance.now();client.state=m;
          if(m.phase==='lobby'&&!m.seats.find((s:any)=>s.id===m.playerId).ready)client.send({type:'ready'});
          if(m.phase==='preparing'&&client.loaded!==m.matchId){client.loaded=m.matchId;client.send({type:'loaded',versionId:m.manifest.id});}
          if(m.phase==='playing'){
            if(!client.phaseStarted)client.phaseStarted=now;
            if(m.view&&client.snapshots.at(-1)?.tick!==m.view.tick)client.snapshots.push({at:now,tick:m.view.tick,time:m.view.time});
            if(client.epoch!==m.epoch){client.epoch=m.epoch;client.seq=0;client.lastSegment=-1;}
            const segment=Math.floor((m.view?.tick??0)/30);
            if(segment!==client.lastSegment){
              const first=client.lastSegment===-1,right=segment%2===0;
              client.send({type:'input',matchId:m.matchId,round:m.round,epoch:m.epoch,seq:++client.seq,clientTime:performance.now(),method:'keyboard',edges:[{button:'left',down:!right},{button:'right',down:right},...(first?[{button:'action',down:true}]:[])]});
              client.lastSegment=segment;client.inputs++;
            }
          }
          if(m.phase==='round-result'&&!client.roundEnded)client.roundEnded=now;
        });
        await until(()=>client.state?.phase==='lobby');
      }
      await until(()=>entry.clients[0].state.seats.every((s:any)=>s.connected&&s.ready));
    }));
    const start=performance.now();for(const room of rooms)room.clients[0].send({type:'start'});
    await until(()=>rooms.every(r=>r.clients.every((c:any)=>c.state?.phase==='match-result')),50000);
    const elapsedMs=performance.now()-start;stopHealth=true;await healthLoop;
    const matches=[];
    for(const room of rooms){
      const match=await api('/matches/'+room.clients[0].state.matchId,room.guests[0].token);assert.equal(match.status,'complete');assert.equal(match.record.rounds.length,1);
      const round=match.record.rounds[0],vm=await Sandbox.create(version.code,runtime);let exact=false;
      try{const replay=new ReplayRunner(vm,round);replay.seek(round.status.tick);exact=replay.verify()===true;}finally{vm.dispose();}
      assert.equal(exact,true);assert.equal(round.records.length,4);assert.ok(round.records.every((r:any)=>r.metrics.length===0));
      const clients=room.clients.map((c:any)=>{
        assert.deepEqual(c.errors,[]);assert.ok(c.snapshots.length>0);
        const wallSeconds=(c.roundEnded-c.phaseStarted)/1000,gaps=c.snapshots.slice(1).map((v:any,i:number)=>v.at-c.snapshots[i].at);
        return {playerId:c.state.playerId,wallSeconds,simulationSeconds:round.status.time,simulationToWallRatio:round.status.time/wallSeconds,snapshotGapsMs:quantiles(gaps),snapshots:c.snapshots.length,inputEnvelopes:c.inputs};
      });
      matches.push({matchId:match.id,seed:round.seed,replayExact:exact,players:round.records.map((r:any)=>({id:r.playerId,score:r.score,outcome:r.outcome,rejected:r.network.rejected,providerOpportunities:r.metrics.length})),clients});
    }
    const wave={rooms:count,participants:count*4,elapsedMs,healthLatencyMs:quantiles(health),healthFailures,matches};waves.push(wave);
    await mkdir('evidence/runtime',{recursive:true});await writeFile('evidence/runtime/room-capacity.json',JSON.stringify({at:new Date().toISOString(),method:'One isolated production server with PGlite, real permission-restricted runtime children and normal HTTP/WebSocket clients. Four connected protocol seats per room, held firing and alternating movement, 60 Hz Asteroid physics, normal 20 Hz target snapshots and durable match writes. Load clients do not render. No Jev requests, generation, TLS or remote network. Other host activity is not suppressed; record overlapping work separately. Measured profile only, not a maximum-capacity/load guarantee.',host:{platform:process.platform,arch:process.arch,node:process.version,cpu:cpus()[0]?.model,logicalCPUs:cpus().length,totalMemoryBytes:totalmem()},versionId:version.id,waves},null,2));
    console.log(JSON.stringify({rooms:count,participants:count*4,elapsedMs,healthP95:wave.healthLatencyMs.p95,minimumSimulationRatio:Math.min(...matches.flatMap(m=>m.clients.map((c:any)=>c.simulationToWallRatio))),maxSnapshotGap:Math.max(...matches.flatMap(m=>m.clients.map((c:any)=>c.snapshotGapsMs.max))),exactReplays:matches.length}));
    assert.deepEqual(healthFailures,[]);
  }finally{stopHealth=true;await healthLoop;for(const ws of sockets)ws.close();}
}
