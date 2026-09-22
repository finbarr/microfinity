import type {Metadata} from '../sdk/index';
export type PartyMode='native'|'race'|'obstruction'|'pressure';
export type BotType='jev'|'scripted';
export type PartySettings={targetPlayers:number;mode:PartyMode;botType:BotType;difficulty:number};
export type RandomFilters={count:number;clock:'all'|'realtime'|'action';controls:'all'|'action-only'|'directions';minDuration:number;maxDuration:number;tags:string[]};
export const defaultRandomFilters:RandomFilters={count:4,clock:'all',controls:'all',minDuration:1,maxDuration:180,tags:[]};
export function effectiveMode(meta:Metadata,count:number,mode:string):PartyMode|null{
 if(!Number.isInteger(count)||count<1||count>4)return null;
 if(mode==='native'){
  if(count>=meta.players[0]&&count<=meta.players[1])return 'native';
  return meta.players[0]===1&&meta.players[1]===1&&meta.clock==='realtime'&&count>1&&meta.modifiers.includes('race')?'race':null;
 }
 if(!['race','obstruction','pressure'].includes(mode)||!meta.modifiers.includes(mode as any))return null;
 if(meta.players[0]!==1||meta.players[1]!==1||meta.clock!=='realtime')return null;
 return mode==='race'||count>=2?mode as PartyMode:null;
}
export function participantCounts(games:{meta:Metadata}[],mode:string){return [1,2,3,4].filter(count=>games.every(g=>effectiveMode(g.meta,count,mode)!==null));}
export function eligibleGames<T extends {meta:Metadata;provenance:{draft?:unknown}}>(games:T[],settings:Pick<PartySettings,'targetPlayers'|'mode'>,filters:RandomFilters){
 return games.filter(g=>g.provenance.draft!==true&&effectiveMode(g.meta,settings.targetPlayers,settings.mode)!==null
  &&g.meta.duration>=filters.minDuration&&g.meta.duration<=filters.maxDuration
  &&(filters.clock==='all'||g.meta.clock===filters.clock)
  &&(filters.controls==='all'||g.meta.controls.directions===(filters.controls==='directions'))
  &&(!filters.tags.length||filters.tags.some(tag=>g.meta.tags.includes(tag))));
}
