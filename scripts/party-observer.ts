/** A protocol peer for checking a browser-hosted party. This is not a human or a second browser. */
import {WebSocket} from 'ws';import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.TEST_BASE_URL??'http://localhost:3000',roomId=process.argv[2];if(!/^[a-f0-9]{8}$/.test(roomId??''))throw new Error('Supply the browser party ID');
const guest=await fetch(base+'/api/guest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Party check friend'})}).then(r=>r.json()) as any;
const events:any[]=[],started=Date.now();let key='',loaded='',finished=false;
const ws=new WebSocket(base.replace('http','ws')+'/socket');
async function save(){await mkdir('evidence/party',{recursive:true});await writeFile(`evidence/party/observer-${roomId}.json`,JSON.stringify({method:'One normal local HTTP/WebSocket peer observing a browser-hosted party. No second-browser or human-session claim.',started:new Date(started).toISOString(),roomId,events},null,2));}
ws.on('open',()=>ws.send(JSON.stringify({type:'join',roomId,token:guest.token})));
ws.on('message',async raw=>{const m=JSON.parse(raw.toString());if(m.type==='clock-probe'){ws.send(JSON.stringify({type:'clock-reply',id:m.id,clientTime:performance.now()}));return;}if(m.type==='error'){events.push({error:m.message});console.log(m.message);return;}if(m.type!=='state')return;
 const current=JSON.stringify([m.phase,m.revision,m.creating,m.matchId,m.round,m.hostId,m.seats.map((s:any)=>[s.id,s.connected,s.controller,s.ready])]);
 if(current!==key){key=current;events.push({elapsedMs:Date.now()-started,phase:m.phase,revision:m.revision,creating:m.creating,matchId:m.matchId,challengeId:m.challengeId,round:m.round,settings:m.settings,playlist:m.playlist,hostId:m.hostId,seats:m.seats});console.log(JSON.stringify({phase:m.phase,revision:m.revision,creating:m.creating,round:m.round,matchId:m.matchId,connected:m.seats.filter((s:any)=>s.connected).length}));await save();}
 if(m.phase==='lobby'&&!m.seats.find((s:any)=>s.id===m.playerId).ready)ws.send(JSON.stringify({type:'ready'}));
 if(m.phase==='preparing'&&loaded!==`${m.matchId}:${m.round}`){loaded=`${m.matchId}:${m.round}`;ws.send(JSON.stringify({type:'loaded',versionId:m.manifest.id}));}
 if(m.phase==='match-result'&&!finished){finished=true;const match=await fetch(base+'/api/matches/'+m.matchId,{headers:{Authorization:`Bearer ${guest.token}`}}).then(r=>r.json());events.push({match});await save();console.log(JSON.stringify({complete:match.status,matchId:m.matchId,rounds:match.record?.rounds?.length}));ws.close();}
});
ws.on('close',()=>{void save();});process.on('SIGINT',()=>ws.close());
