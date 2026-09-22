type Seat={id:string;name:string;color:string;connected:boolean;guestId?:string};

export function Lobby({room,isHost,onCopyInvite,inviteLink,inviteCopied}:{room:any;isHost:boolean;onCopyInvite:()=>void;inviteLink:string;inviteCopied:boolean}){
  const members:Seat[]=(room.seats??[]).filter((seat:Seat)=>seat.connected&&seat.guestId);
  return <section className="home-party" aria-label="Your party">
    <div className="home-party-heading"><h2>PARTY {room.roomId?.toUpperCase()}</h2><span>{members.length} / 4 players</span></div>
    <div className="party-invite"><div><span className="eyebrow">INVITE YOUR FRIENDS</span><strong>{inviteLink}</strong></div><button className="secondary" onClick={onCopyInvite}>{inviteCopied?'Copied!':'Copy invite link'}</button></div>
    <div className="party-member-list" aria-label="Party players">{members.map(seat=><div className="party-member" key={seat.id}><span className="mini-face" style={{background:seat.color}} aria-hidden="true">•‿•</span><strong>{seat.name}</strong><small>{seat.guestId===room.hostId?'Host':'Friend'}</small></div>)}</div>
    <p className="home-party-hint" role="status">{room.creating?'The host is making another little game. Your places are saved.':isHost?'Pick cartridges below, then start the party when everyone is here.':room.playlist?.length?'Waiting for the host to start. The selected games are shown below.':'Waiting for the host to choose games.'}</p>
  </section>;
}
