import {z} from 'zod';
import type {Store} from './store';
import {summarizeRating,type RatingSummary} from '../shared/ratings';
export const ratingSchema=z.object({versionId:z.string().length(64),stars:z.number().int().min(1).max(5)}).strict();
export async function ratingSummaries(store:Store):Promise<Record<string,RatingSummary>>{
 const rows=await store.query('SELECT game_id,count(*)::int AS count,sum(stars)::int AS total FROM cartridge_ratings GROUP BY game_id');
 return Object.fromEntries(rows.map(row=>[row.game_id,summarizeRating(row.total,row.count)]));
}
export async function playedRatings(store:Store,matchId:string,guestId:string){
 // Only successfully recorded rounds can be rated, including a loss. A replay or AI-only seat cannot create eligibility.
 return store.query(`SELECT DISTINCT ON (v.game_id) v.game_id AS "gameId",r.version_id AS "versionId",v.manifest->'meta'->>'title' AS title,c.stars
  FROM results r JOIN versions v ON v.id=r.version_id LEFT JOIN cartridge_ratings c ON c.game_id=v.game_id AND c.guest_id=$2
  WHERE r.match_id=$1 AND r.guest_id=$2 AND r.record->'controllers' @> '["human"]'::jsonb
  ORDER BY v.game_id,r.created_at DESC,r.id DESC`,[matchId,guestId]);
}
export async function rateCartridge(store:Store,guestId:string,input:unknown){
 const {versionId,stars}=ratingSchema.parse(input);
 // Eligibility and upsert happen in one statement; repeated requests replace the one vote per guest/cartridge.
 const [saved]=await store.query(`INSERT INTO cartridge_ratings(game_id,guest_id,version_id,stars)
  SELECT v.game_id,$1,v.id,$3 FROM versions v WHERE v.id=$2 AND EXISTS (
   SELECT 1 FROM results r WHERE r.version_id=v.id AND r.guest_id=$1 AND r.record->'controllers' @> '["human"]'::jsonb)
  ON CONFLICT(game_id,guest_id) DO UPDATE SET stars=excluded.stars,version_id=excluded.version_id,updated_at=now()
  RETURNING game_id`,[guestId,versionId,stars]);
 if(!saved)throw new Error('Finish this cartridge before rating it.');
 const [row]=await store.query('SELECT count(*)::int AS count,sum(stars)::int AS total FROM cartridge_ratings WHERE game_id=$1',[saved.game_id]);
 return {gameId:saved.game_id,stars,summary:summarizeRating(row.total,row.count)};
}
