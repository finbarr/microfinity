import {useState} from 'react';
import type {Manifest} from '../server/store';

type Seat={id:string;name:string;color:string;connected:boolean;guestId?:string};
type QueueGame={id:string;meta:Manifest['meta']};

export function Lobby({room,isHost,library,send,onCreate,onRandom,onCopyInvite,onStart,inviteLink,inviteCopied}:{room:any;isHost:boolean;library:Manifest[];send:(message:unknown)=>void;onCreate:()=>void;onRandom:()=>void;onCopyInvite:()=>void;onStart:()=>void;inviteLink:string;inviteCopied:boolean}){
  const [addition,setAddition]=useState('');
  const queue:QueueGame[]=room.playlist??[];
  const members:Seat[]=(room.seats??[]).filter((seat:Seat)=>seat.connected&&seat.guestId);
  const options=library.filter(game=>game.provenance.draft!==true&&!queue.some(item=>item.id===game.id));
  const update=(versions:string[])=>send({type:'playlist',versions,revision:room.revision});
  return <section className="lobby">
    <div className="eyebrow">PARTY ROOM · {room.roomId?.toUpperCase()}</div>
    <h1>{isHost?'Your party is open.':'You’re in the party.'}</h1>
    <p>{isHost?'Share the link, pick some cartridges, then start whenever your friends arrive.':'The host chooses the games and starts the party. Make yourself comfortable.'}</p>

    <div className="party-invite"><div><span className="eyebrow">INVITE LINK</span><strong>{inviteLink}</strong></div><button className="secondary" data-nav-start onClick={onCopyInvite}>{inviteCopied?'Copied!':'Copy invite link'}</button></div>

    <div className="party-members"><div className="eyebrow">HERE NOW · {members.length} / 4</div><div className="party-member-list">{members.map(seat=><div className="party-member" key={seat.id}><span className="mini-face" style={{background:seat.color}} aria-hidden="true">•‿•</span><strong>{seat.name}</strong><small>{seat.guestId===room.hostId?'Host':'Friend'}</small></div>)}</div><p>Open seats can be filled by AI when play begins.</p></div>

    {room.creating&&<p className="creation-in-party" role="status">The host is making another little game. Your places are saved.</p>}
    <div className="lobby-queue"><div className="queue-heading"><div><div className="eyebrow">THE LINEUP</div><h2>{queue.length?`${queue.length} game${queue.length===1?'':'s'} picked`:'No games picked yet'}</h2></div></div>
      {queue.length>0&&<ol>{queue.map((game,index)=><li key={`${index}:${game.id}`}><span className="queue-number">{index+1}</span><div className="queue-game"><strong>{game.meta.title}</strong><small>{game.meta.duration}s · {game.meta.controls.directions?'Directions + action':'Action button'}</small></div>{isHost&&<button aria-label={`Remove ${game.meta.title} from party`} onClick={()=>update(queue.filter((_,i)=>i!==index).map(item=>item.id))}>×</button>}</li>)}</ol>}
      {isHost?<><div className="party-game-picker"><label>Pick a cartridge<select aria-label="Pick a cartridge" value={addition} onChange={event=>setAddition(event.target.value)}><option value="">Choose a game…</option>{options.map(game=><option key={game.id} value={game.id}>{game.meta.title}</option>)}</select></label><button disabled={!addition||queue.length>=12} onClick={()=>{update([...queue.map(game=>game.id),addition]);setAddition('');}}>Add game</button></div><div className="party-choice-actions"><button className="secondary" onClick={onRandom}>Surprise me</button><button className="text-button" onClick={onCreate}>Make a game for this party ↗</button></div></>:<p className="party-waiting" role="status">{queue.length?'Waiting for the host to start.':'Waiting for the host to choose games.'}</p>}
    </div>
    {isHost&&<div className="lobby-actions"><button className="primary" disabled={!queue.length||room.creating} onClick={onStart}>▶ Start party</button><p>{queue.length?'Your friends join the games automatically.':'Pick games or use Surprise me to fill the lineup.'}</p></div>}
  </section>;
}
