/** Wire-level adversarial checks against the local app; no browser-play claim. */
import {WebSocket} from 'ws';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL??'http://localhost:3000';
async function api(path:string,token?:string,body?:any){const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
async function until(check:()=>boolean){const start=Date.now();while(!check()){if(Date.now()-start>12000)throw new Error('Protocol check timed out');await new Promise(r=>setTimeout(r,20));}}
const guests=await Promise.all([0,1,2].map(i=>api('/guest',undefined,{name:`Boundary fixture ${i+1}`}))),library=await api('/library'),manifest=library.find((m:any)=>m.gameId==='patchwork-pass'),room=await api('/rooms',guests[0].token,{versions:[manifest.id],settings:{targetPlayers:2,botType:'scripted',mode:'native',difficulty:1}});
const clients:any[]=[],checks:string[]=[],errors:string[]=[];
const connect=(index:number)=>{const ws=new WebSocket(base.replace('http','ws')+'/socket'),c:any={ws,state:null,errors:[],ready:false,loaded:false};clients.push(c);const send=(m:any)=>ws.send(JSON.stringify(m));c.send=send;
 ws.on('open',()=>send({type:'join',roomId:room.id,token:guests[index].token}));
 ws.on('message',bytes=>{const m=JSON.parse(bytes.toString());if(m.type==='clock-probe'){send({type:'clock-reply',id:m.id,clientTime:performance.now()});return;}if(m.type==='error'){c.errors.push(m.message);errors.push(m.message);return;}if(m.type!=='state')return;c.state=m;
  if(m.phase==='lobby'&&!c.ready){c.ready=true;send({type:'ready'});}if(m.phase==='preparing'&&!c.loaded){c.loaded=true;send({type:'loaded',versionId:m.manifest.id});}
 });return c;};
const tap=(button='action')=>[{button,down:true},{button,down:false}];
const packet=(c:any,seq:number,edges:any[],extra:any={})=>({type:'input',matchId:c.state.matchId,round:c.state.round,epoch:c.state.epoch,seq,edges,method:'keyboard',clientTime:performance.now(),...extra});
const settle=()=>new Promise(r=>setTimeout(r,150));
try{
 const host=connect(0),other=connect(1);await until(()=>Boolean(host.state&&other.state&&host.state.seats.length===2&&host.state.seats.every((s:any)=>s.ready)));host.send({type:'start'});await until(()=>host.state?.phase==='playing'&&other.state?.phase==='playing');
 const beforeWaitingInput=host.state.view.tick;other.send(packet(other,1,tap()));await settle();assert.equal(host.state.view.game.phase,'choose');assert.equal(host.state.view.game.turn,0);assert.equal(host.state.view.tick,beforeWaitingInput);checks.push('Waiting-seat press cannot choose, place or advance the action clock');
 host.ws.send('{invalid-json');host.send(packet(host,1,[{button:'mouse',down:true}]));host.send(packet(host,1,[{button:'action',down:true,age:.15}]));host.send(packet(host,1,Array(33).fill({button:'right',down:true})));await until(()=>host.errors.length>=4);checks.push('Malformed JSON, unknown buttons, forged ages and oversized edge batches rejected');
 host.send({type:'score',score:999999});host.send({type:'finishRound',winner:'p0'});other.send({type:'start'});await settle();assert.equal(host.state.phase,'playing');assert.equal(host.state.view.scores.p0,0);checks.push('Clients cannot submit authoritative scores, finish a round or start another host’s match');
 const stale=packet(host,1,tap(),{matchId:'old-match'});host.send(stale);host.send(packet(host,0,tap()));await settle();assert.equal(host.state.view.game.phase,'choose');checks.push('Stale match and non-increasing sequence rejected');
 const first=packet(host,1,tap());host.send(first);await until(()=>host.state.view.game.phase==='place');host.send(first);await settle();assert.equal(host.state.view.scores.p0,0);assert.equal(host.state.view.game.phase,'place');checks.push('Duplicate action cannot score a second operation');
 host.send(packet(host,2,tap(),{clientTime:performance.now()+5000}));await settle();host.send(packet(host,3,tap(),{clientTime:performance.now()-150}));await settle();assert.equal(host.state.view.scores.p0,0);assert.equal(host.state.view.game.turn,0);checks.push('Future and late timestamp claims do not place a patch');
 host.send(packet(host,4,tap()));await until(()=>host.state.view.game.turn===1&&other.state.view.game.turn===1);assert.equal(host.state.view.scores.p0,2);
 other.send(packet(other,1,tap()));await until(()=>other.state.view.game.phase==='place');checks.push('New role epoch accepts its first sequence after an earlier rejected waiting-seat input');
 const stranger=connect(2);await until(()=>stranger.errors.length>0);assert.equal(stranger.state,null);checks.push('Late guest cannot enter an active party');
 other.send({type:'asset-error'});await until(()=>host.state.phase==='match-result');assert.match(host.state.error,/load or render/);
 const match=await api('/matches/'+host.state.matchId,guests[0].token);assert.equal(match.status,'aborted');assert.equal(match.record.rounds.length,0);assert.deepEqual(match.record.points,{});checks.push('Renderer failure during play aborts without fabricated score/result credit');
 await assert.rejects(()=>api('/matches/'+match.id,guests[2].token),/party members/);assert.equal((await api('/health')).ok,true);checks.push('Replay access remains member-only and the service survives invalid traffic');
 const report={at:new Date().toISOString(),method:'Normal local HTTP/WebSocket clients sending explicitly adversarial messages; not browser input evidence.',roomId:room.id,matchId:match.id,checks,expectedErrors:errors,match};await mkdir('evidence/network',{recursive:true});await writeFile('evidence/network/protocol-boundaries.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,matchId:match.id,checks}));
}finally{for(const c of clients)c.ws.close();}
