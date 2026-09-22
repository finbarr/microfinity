export type Connection = {
  status: 'idle' | 'connecting' | 'connected' | 'lost' | 'ended' | 'replaced';
  message: string;
};

export function closedConnection(code: number, reason: string): Connection {
  if (reason === 'server-shutdown') return {status:'ended',message:'The server restarted and this party has ended. Saved results remain available from the arcade.'};
  if (reason === 'room-expired' || code === 4004) return {status:'ended',message:'This party has closed. Return to the arcade to find your saved results or start another party.'};
  if (code === 4001) return {status:'replaced',message:'Your seat is open in another tab. Rejoin here to move it back to this tab.'};
  if (code === 4003) return {status:'ended',message:'This connection could not join the party. Return to the arcade and open the invite again.'};
  if (code === 4008) return {status:'lost',message:'Too many inputs arrived at once. Reconnect to resume your seat.'};
  return {status:'lost',message:'Connection lost. Reconnect to resume your seat if this party is still running.'};
}

export function resultMessage(reason: string): string {
  if (reason === 'server-shutdown' || reason === 'server-restart') return 'The server restarted. Completed rounds are saved; the unfinished round has no final score.';
  if (reason === 'room-expired') return 'This idle party has closed. Your completed rounds are saved.';
  return reason;
}
