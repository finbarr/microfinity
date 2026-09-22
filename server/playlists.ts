import { z } from 'zod';
import {randomBytes} from 'node:crypto';
import type { Manifest } from './store';
import {eligibleGames,type PartyMode} from '../shared/party';
export const randomSchema=z.object({count:z.number().int().min(1).max(12).default(4),seed:z.number().int().min(0).max(4294967295).default(()=>randomBytes(4).readUInt32LE()),clock:z.enum(['all','realtime','action']).default('all'),controls:z.enum(['all','action-only','directions']).default('all'),minDuration:z.number().min(1).max(180).default(1),maxDuration:z.number().min(1).max(180).default(180),tags:z.array(z.string().max(30)).max(12).default([])}).refine(v=>v.minDuration<=v.maxDuration,'Minimum duration must not exceed maximum duration');
export type Selection={party?:{targetPlayers:number;mode:string};seed:number;constraints:z.infer<typeof randomSchema>;pool:string[];versions:string[]};
export function selectPlaylist(library:Manifest[],settings:{targetPlayers:number;mode:string},input:unknown):Selection{
  const constraints=randomSchema.parse(input);
  const eligible=eligibleGames(library,{targetPlayers:settings.targetPlayers,mode:settings.mode as PartyMode},constraints).map(m=>m.id).sort();
  if(!eligible.length)throw new Error('No finished games match these filters. Try another selection.');
  let state=constraints.seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const picked=[...eligible];for(let i=picked.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[picked[i],picked[j]]=[picked[j],picked[i]];}
  return {party:{targetPlayers:settings.targetPlayers,mode:settings.mode},seed:constraints.seed,constraints,pool:eligible,versions:picked.slice(0,constraints.count)};
}
