import {useState} from 'react';

type Member = {guestId?: string; name: string; connected: boolean};
type Props = {
  room: {hostId: string; seats: Member[]};
  isHost: boolean;
  disabled: boolean;
  onLeave: (nextHostId?: string) => void;
  onDisband: () => void;
};

export function PartyActions({room, isHost, disabled, onLeave, onDisband}: Props) {
  const [open, setOpen] = useState(false);
  const friends = room.seats.filter(member => member.connected && member.guestId && member.guestId !== room.hostId);
  if (!isHost) return <button className="text-button" disabled={disabled} onClick={() => onLeave()}>Leave party</button>;
  return <div className="party-actions">
    <button className="text-button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(!open)}>Manage party</button>
    {open && <div className="party-management" aria-label="Manage party">
      {!!friends.length && <><p>Pass hosting to a friend and leave:</p><div className="host-choices">
        {friends.map(friend => <button className="secondary" key={friend.guestId} disabled={disabled} onClick={() => onLeave(friend.guestId)}>Make {friend.name} host & leave</button>)}
      </div></>}
      <p>Disbanding returns everyone to the arcade. Your game ratings and results stay saved.</p>
      <button className="secondary" disabled={disabled} onClick={onDisband}>Disband party</button>
    </div>}
  </div>;
}
