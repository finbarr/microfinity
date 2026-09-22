import type {Store} from './store';

export function isMatchMember(record:any,guestId:string){
  return record.participants?.some((p:any)=>p.guestId===guestId)===true||record.rounds?.some((r:any)=>r.records?.some((p:any)=>p.guestId===guestId))===true;
}

const resultSummary=(result:any)=>({playerId:result.playerId,name:result.name,score:result.score,points:result.points,outcome:result.outcome,durationSeconds:result.durationSeconds,completionReason:result.completionReason,controllers:result.controllers,inputMethods:result.inputMethods});
export function matchSummary(match:any){
  const record=match.record??{};
  return {id:match.id,status:match.status,created_at:match.created_at,challenge_id:match.challenge_id,record:{
    participants:(record.participants??[]).map((p:any)=>({playerId:p.playerId,name:p.name})),
    rounds:(record.rounds??[]).map((round:any)=>({versionId:round.versionId,mode:round.mode,durationSeconds:round.durationSeconds??round.status?.time,completionReason:round.completionReason??round.status?.reason,records:(round.records??[]).map(resultSummary)})),
    points:record.points??{},startedAt:record.startedAt,finishedAt:record.finishedAt,durationMs:record.durationMs,
    termination:record.termination,rematchOf:record.rematchOf
  }};
}

export async function getMatch(store:Store,matchId:string,guestId:string){
  const [match]=await store.query("SELECT * FROM matches WHERE id=$1 AND status<>'playing'",[matchId]);
  if(!match||!isMatchMember(match.record,guestId))throw new Error('This match summary is available only to members of that match');
  return matchSummary(match);
}
export async function listMatches(store:Store,guestId:string){
  return store.query("SELECT id,status,created_at,challenge_id,jsonb_array_length(coalesce(record->'rounds','[]'::jsonb)) AS rounds FROM matches WHERE status<>'playing' AND (record @> $1::jsonb OR record @> $2::jsonb) ORDER BY created_at DESC LIMIT 12",[JSON.stringify({participants:[{guestId}]}),JSON.stringify({rounds:[{records:[{guestId}]}]})]);
}
