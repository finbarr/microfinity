import {useState} from 'react';
import type {Manifest} from '../server/store';
import {participantCounts} from '../shared/party';

export function Lobby({room,isHost,library,send,onCreate,onReady}:{room:any;isHost:boolean;library:Manifest[];send:(message:unknown)=>void;onCreate:()=>void;onReady:()=>void}){
  const [addition,setAddition]=useState('');
  const queue:{id:string;meta:Manifest['meta']}[]=room.playlist;
  const options=library.filter(g=>g.provenance.draft!==true&&participantCounts([...queue,g],room.settings.mode).some(n=>n>=room.seats.length));
  const update=(versions:string[])=>send({type:'playlist',versions,revision:room.revision});
  const move=(from:number,to:number)=>{const ids=queue.map(g=>g.id);[ids[from],ids[to]]=[ids[to],ids[from]];update(ids);};
  return <section className="lobby"><div className="eyebrow">ASSEMBLE YOUR LITTLE MENACES</div><h1>Room for<br/><em>more trouble.</em></h1>
    <p>Friends join with your invite link and take an empty seat. The bots are ready whenever you are.</p>
    {room.creating&&<p className="creation-in-party" role="status">The host is making another little game. Your seats are saved.</p>}
    <div className="seat-grid">{room.seats.map((s:any)=><div className="seat" key={s.id}>
      <div className="seat-face" style={{background:s.color}}>•‿•</div><strong>{s.name}</strong><small>{s.connected?s.guestId===room.hostId?'Host':s.ready?'Ready to go':'Getting ready':`${s.botType==='jev'?'Jev AI':'Practice bot'}${s.guestId?' · friend offline':''}`}</small>
      {isHost&&!s.connected&&<div className="bot-controls"><label><span className="sr-only">Controller for {s.name}</span><select aria-label={`Controller for ${s.name}`} value={s.botType} onChange={e=>send({type:'bot-controller',playerId:s.id,controller:e.target.value})}><option value="jev">Jev AI</option><option value="scripted">Practice bot</option></select></label><button aria-label={`Remove ${s.name} seat`} disabled={!room.participantCounts.includes(room.seats.length-1)} onClick={()=>send({type:'remove-bot',playerId:s.id})}>Remove seat</button></div>}
    </div>)}</div>
    {isHost&&room.participantCounts.includes(room.seats.length+1)&&<button className="secondary" onClick={()=>send({type:'add-bot'})}>+ Add a bot seat</button>}
    <div className="lobby-queue"><div className="queue-heading"><div><div className="eyebrow">THE RUNNING ORDER</div><h2>{queue.length} little game{queue.length===1?'':'s'}</h2></div>{isHost&&<button className="secondary" onClick={onCreate} disabled={queue.length>=12}>Make a game for this party ↗</button>}</div>
      <ol>{queue.map((g,i)=><li key={`${i}:${g.id}`}><span className="queue-number">{i+1}</span><div className="queue-game"><strong>{g.meta.title}</strong><small>{g.meta.clock==='action'?'Take turns':'Real time'} · {g.meta.duration}s · {g.meta.controls.directions?'Directions + action':'Action button'}</small></div>{isHost&&<div className="queue-controls"><button aria-label={`Move ${g.meta.title} up, round ${i+1}`} disabled={i===0} onClick={()=>move(i,i-1)}>↑</button><button aria-label={`Move ${g.meta.title} down, round ${i+1}`} disabled={i===queue.length-1} onClick={()=>move(i,i+1)}>↓</button><button aria-label={`Remove ${g.meta.title}, round ${i+1}`} disabled={queue.length===1} onClick={()=>update(queue.filter((_,j)=>j!==i).map(g=>g.id))}>×</button></div>}</li>)}</ol>
      {isHost&&<div className="queue-add"><label><span className="sr-only">Add a saved game</span><select aria-label="Add a saved game" value={addition} onChange={e=>setAddition(e.target.value)}><option value="">Choose another game…</option>{options.map(g=><option key={g.id} value={g.id}>{g.meta.title}</option>)}</select></label><button className="secondary" disabled={!addition||queue.length>=12} onClick={()=>{update([...queue.map(g=>g.id),addition]);setAddition('');}}>Add game</button></div>}
      <p className="subtle">{['Mellow','Normal','Spicy','Wild'][room.settings.difficulty]} difficulty · {room.settings.mode==='native'?'Original rules, with races for solo games':room.settings.mode}. Editing a shared challenge saves a new one when you start.</p>
    </div>
    <div className="lobby-actions"><button onClick={onReady} className="secondary">I’m ready</button>{isHost&&<button className="primary" disabled={room.creating} onClick={()=>send({type:'start'})}>Let the tiny chaos begin ↗</button>}</div>
  </section>;
}
