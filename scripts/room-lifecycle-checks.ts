/** Real local WebSocket lifecycle checks; not browser or human play evidence. */
import {WebSocket} from 'ws';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL??'http://localhost:3000';
async function api(path:string,token?:string,body?:unknown){const r=await fetch(base+'/api'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw new Error(data.error);return data;}
async function until(check:()=>boolean,timeout=10000){const deadline=performance.now()+timeout;while(!check()){if(performance.now()>deadline)throw new Error('Lifecycle check timed out');await new Promise(r=>setTimeout(r,20));}}
const guests=await Promise.all(['First host','New host'].map(name=>api('/guest',undefined,{name}))),library=await api('/library'),manifest=library.find((m:any)=>m.gameId==='patchwork-pass');
const room=await api('/rooms',guests[0].token,{versions:[manifest.id],settings:{targetPlayers:2,botType:'scripted',difficulty:1}}),clients:any[]=[],checks:string[]=[];
function connect(index:number,autoPong=true){
 const ws=new WebSocket(base.replace('http','ws')+'/socket',{autoPong}),c:any={ws,state:null,errors:[],closeCode:null,pings:0,loaded:'',ready:false};clients.push(c);
 c.send=(m:any)=>ws.send(JSON.stringify(m));ws.on('open',()=>c.send({type:'join',roomId:room.id,token:guests[index].token}));
 ws.on('ping',()=>c.pings++);ws.on('close',code=>c.closeCode=code);
 ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.type==='clock-probe'){c.send({type:'clock-reply',id:m.id,clientTime:performance.now()});return;}if(m.type==='error'){c.errors.push(m.message);return;}if(m.type!=='state')return;
  c.state=m;if(m.phase==='lobby'&&!c.ready){c.ready=true;c.send({type:'ready'});}if(m.phase==='preparing'&&c.loaded!==m.matchId){c.loaded=m.matchId;c.send({type:'loaded',versionId:m.manifest.id});}
 });return c;
}
try{
 const original=connect(0),friend=connect(1);await until(()=>original.state?.seats.length===2&&friend.state?.seats.every((s:any)=>s.ready));
 original.ws.close(1000);await until(()=>friend.state.hostId===guests[1].id);checks.push('Host departure transfers authority to the connected friend');
 const resumed=connect(0);await until(()=>resumed.state?.seats.every((s:any)=>s.ready));assert.equal(resumed.state.hostId,guests[1].id);checks.push('Returning original host resumes its seat without stealing host authority');
 friend.send({type:'start'});friend.send({type:'start'});await until(()=>friend.state.phase==='playing'&&resumed.state.phase==='playing');const matchId=friend.state.matchId;
 friend.send({type:'start'});await new Promise(r=>setTimeout(r,100));assert.equal(friend.state.matchId,matchId);checks.push('Rapid repeated start requests retain one active match');
 const priorEpoch=resumed.state.epoch,unresponsive=connect(0,false);await until(()=>unresponsive.state?.phase==='playing'&&resumed.closeCode!==null);assert.equal(resumed.closeCode,4001);assert.ok(unresponsive.state.epoch>priorEpoch);checks.push('Same-guest connection replacement closes the old socket and advances its ownership epoch');
 const heartbeatStarted=performance.now();await until(()=>unresponsive.closeCode!==null,35000);const heartbeatMs=performance.now()-heartbeatStarted;assert.ok(unresponsive.pings>=1);assert.equal(unresponsive.closeCode,1006);
 await until(()=>friend.state.seats.find((s:any)=>s.guestId===guests[0].id).controller==='scripted');assert.equal(friend.closeCode,null);checks.push('Missing protocol pong terminates a live-data connection and gives its seat to the configured bot; responding peer stays connected');
 const back=connect(0);await until(()=>back.state?.phase==='playing');assert.equal(back.state.matchId,matchId);assert.equal(back.state.playerId,'p0');assert.equal(back.state.seats[0].controller,'human');checks.push('Reconnection after heartbeat timeout restores the original seat in the same match');
 friend.send({type:'asset-error'});await until(()=>friend.state.phase==='match-result');const match=await api('/matches/'+matchId,guests[1].token);assert.equal(match.status,'aborted');assert.equal(match.record.rounds.length,0);
 const report={at:new Date().toISOString(),method:'Normal local HTTP/WebSocket clients; one client deliberately disables automatic protocol pong while continuing application traffic. No browser, real-human or audible test claim.',roomId:room.id,matchId,heartbeatMs,checks,errors:clients.flatMap(c=>c.errors),match};
 assert.deepEqual(report.errors,[]);await mkdir('evidence/network',{recursive:true});await writeFile(`evidence/network/lifecycle-${matchId}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,matchId,heartbeatMs,checks}));
}finally{for(const c of clients)c.ws.close();}
