import type {Store} from './store';
export function isMatchMember(record:any,guestId:string){
  return record.participants?.some((p:any)=>p.guestId===guestId)===true||record.rounds?.some((r:any)=>r.records?.some((p:any)=>p.guestId===guestId))===true;
}
export async function getMatch(store:Store,matchId:string,guestId:string){
  const [match]=await store.query("SELECT * FROM matches WHERE id=$1 AND status<>'playing'",[matchId]);
  if(!match||!isMatchMember(match.record,guestId))throw new Error('This recording is available only to members of that match');return match;
}
export async function listMatches(store:Store,guestId:string){
  return store.query("SELECT id,status,created_at,jsonb_array_length(coalesce(record->'rounds','[]'::jsonb)) + CASE WHEN jsonb_typeof(record->'activeRound')='object' THEN 1 ELSE 0 END AS rounds FROM matches WHERE status<>'playing' AND (record @> $1::jsonb OR record @> $2::jsonb) ORDER BY created_at DESC LIMIT 12",[JSON.stringify({participants:[{guestId}]}),JSON.stringify({rounds:[{records:[{guestId}]}]})]);
}
export async function recordReplayPlay(store:Store,matchId:string,guestId:string){
  const match=await getMatch(store,matchId,guestId);
  if(!match.record.rounds?.length&&!match.record.activeRound)throw new Error('This match has no replay frames');
  await store.query('INSERT INTO replay_plays(match_id,guest_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[matchId,guestId]);return {ok:true};
}
