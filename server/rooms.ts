import type { WebSocket } from 'ws';
import {randomBytes} from 'node:crypto';
import { z } from 'zod';
import { colors, emptyButtons, type Buttons, type Edge } from '../sdk/index';
import { buttonEdges } from '../runtime/input';
import { edgeSchema } from '../runtime/validation';
import type { Mode } from '../runtime/modes';
import { Store, id, hash, type Version } from './store';
import { RuntimeProcess } from './runtime-process';
import { DecisionScheduler, jevDecision, scriptedDecision } from './controllers';
import {selectPlaylist,randomSchema,type Selection} from './playlists';
import {NetworkClock, serverNow, MAX_COMPENSATION_MS} from './network-clock';
import {effectiveMode,participantCounts,type BotType} from '../shared/party';
import {COUNTDOWN_MS} from '../shared/countdown';
type QueuedEdge=Edge & {at?:number;compensate?:boolean};

export const settingsSchema=z.object({targetPlayers:z.number().int().min(1).max(4).default(1),botType:z.enum(['jev','scripted']).default('jev'),botTypes:z.array(z.enum(['jev','scripted'])).max(4).default([]),mode:z.enum(['native','race','obstruction','pressure']).default('native'),difficulty:z.number().int().min(0).max(3).default(1),seed:z.number().int().min(0).max(4294967295).default(()=>randomBytes(4).readUInt32LE())});
const versionIds=z.array(z.string().length(64)).max(12);
export const roomRequestSchema=z.object({versions:versionIds.optional(),random:randomSchema.optional(),lobby:z.boolean().optional(),settings:settingsSchema.prefault({})})
  .refine(v=>v.versions===undefined||v.random===undefined,'Choose a pinned list or a random selection');
export type Settings=z.infer<typeof settingsSchema>;
type Seat={id:string;name:string;color:string;guestId?:string;ws?:WebSocket;ready:boolean;loaded:boolean;controller:'human'|'jev'|'scripted';botType:BotType;epoch:number;seq:number;held:Buttons;queued:QueuedEdge[];clock:NetworkClock;rejected:Record<string,number>;scheduler:DecisionScheduler;history:any[];lastInput:number;methods:Set<string>;sources:Set<string>;fallback?:string};
export class Room {
  readonly id=id().slice(0,8);hostId:string;settings:Settings;versions:Version[];
  phase:'lobby'|'preparing'|'countdown'|'playing'|'round-result'|'match-result'='lobby';
  seats:Seat[]=[];round=0;matchId='';challengeId='';startsAt=0;phaseUntil=0;creating=false;revision=0;
  private runner?:RuntimeProcess;private status:any;private views:Record<string,any>={};private busy=false;
  private last=performance.now();private accumulator=0;private lastSnapshot=0;private actionDeadline=0;private mode:Mode='native';
  private rounds:any[]=[];private points:Record<string,number>={};private timer:ReturnType<typeof setInterval>;private error='';
  private commands=Promise.resolve();private closed=false;private lastActivity=serverNow();private emptySince=serverNow();
  private startedAt=0;private finishedAt:number|null=null;private participants:any[]=[];private definition:any;
  private termination:{kind:string;reason:string}|null=null;private rematchOf:string|null=null;
  private sequence<T>(operation:()=>T|Promise<T>):Promise<T>{const next=this.commands.then(operation);this.commands=next.then(()=>{},()=>{});return next;}
  constructor(private store:Store,hostId:string,versions:Version[],settings:unknown={},public selection?:Selection){
    this.hostId=hostId;this.versions=versions;this.settings=settingsSchema.parse(settings??{});
    if(versions.length>12)throw new Error('Choose up to twelve games');
    this.seats=Array.from({length:this.settings.targetPlayers},(_,i)=>this.makeSeat(i));
    // Reserve the creator even when an invitee connects before the host socket.
    this.seats[0].guestId=hostId;this.seats[0].name='Host';this.syncBotSettings();
    this.timer=setInterval(()=>void this.pump(),8);
  }
  private makeSeat(index:number):Seat {const botType=this.settings.botTypes[index]??this.settings.botType;return {id:`p${index}`,name:`${botType==='jev'?'Jev':'Bot'} ${index+1}`,color:colors[index],ready:true,loaded:false,controller:botType,botType,epoch:0,seq:0,held:emptyButtons(),queued:[],clock:new NetworkClock(),rejected:{},scheduler:new DecisionScheduler(Number(process.env.JEV_INTERVAL_MS)||200),history:[],lastInput:0,methods:new Set(),sources:new Set()};}
  private syncBotSettings(){this.settings.targetPlayers=this.seats.length;this.settings.botTypes=this.seats.map(s=>s.botType);}
  private setupChanged(){this.challengeId='';this.revision++;this.syncBotSettings();for(const s of this.seats)s.ready=!s.ws;this.broadcast();}
  join(guest:{id:string;name:string},ws:WebSocket){return this.sequence(()=>{
    if(this.closed||ws.readyState!==1)throw new Error('This party connection has closed');
    let seat=this.seats.find(s=>s.guestId===guest.id);
    if(!seat){
      if(this.phase!=='lobby')throw new Error('This party has started. Join after the host returns to the lobby.');
      seat=this.seats.find(s=>!s.guestId&&!s.ws);
      if(!seat&&this.seats.length<4){seat=this.makeSeat(this.seats.length);this.seats.push(seat);}
      if(!seat)throw new Error('Party is full (four players)');
      seat.guestId=guest.id;this.syncBotSettings();this.challengeId='';this.revision++;
    }
    seat.name=guest.name;seat.ready=false;
    if(seat.ws&&seat.ws!==ws)seat.ws.close(4001,'Session resumed elsewhere');seat.ws=ws;this.handoff(seat,'human');
    this.lastActivity=serverNow();
    this.send(ws,{type:'joined',roomId:this.id,playerId:seat.id});this.broadcast();
  });}
  disconnect(ws:WebSocket){return this.sequence(()=>{if(this.closed)return;const seat=this.seats.find(s=>s.ws===ws);if(!seat)return;seat.ws=undefined;seat.ready=true;this.handoff(seat,seat.botType);
    if(seat.guestId===this.hostId){this.creating=false;const next=this.seats.find(s=>s.ws);if(next?.guestId)this.hostId=next.guestId;}
    this.lastActivity=serverNow();if(!this.seats.some(s=>s.ws))this.emptySince=this.lastActivity;
    this.broadcast();
  });}
  private handoff(seat:Seat,controller:Seat['controller']){seat.epoch++;seat.seq=0;seat.queued.push(...buttonEdges(seat.held,emptyButtons()));seat.held=emptyButtons();seat.controller=controller;seat.history=[];seat.clock=new NetworkClock();seat.sources.add(controller);}
  message(ws:WebSocket,message:any){return this.sequence(()=>this.handleMessage(ws,message));}
  private async handleMessage(ws:WebSocket,message:any){
    if(this.closed)return;
    const seat=this.seats.find(s=>s.ws===ws);if(!seat)throw new Error('Not a room member');
    if(message.type==='clock-reply'){const sample=seat.clock.accept(message.id,message.clientTime,serverNow());if(sample)this.send(ws,sample);return;}
    if(message.type==='ping'){this.send(ws,{type:'pong',clientTime:message.clientTime,serverTime:serverNow()});return;}
    this.lastActivity=serverNow();
    if(['add-bot','remove-bot','bot-controller','playlist','random','creating','edit-party'].includes(message.type)){
      if(seat.guestId!==this.hostId)throw new Error('Only the host can edit this party');
      if(message.type==='edit-party'){
        if(this.phase!=='match-result')throw new Error('Finish this match before changing the party');
        this.runner?.dispose();this.runner=undefined;this.phase='lobby';this.round=0;this.matchId='';this.rounds=[];this.points={};this.views={};this.status=null;this.error='';this.creating=false;
        for(const s of this.seats){s.ready=!s.ws;s.held=emptyButtons();s.queued=[];s.epoch++;s.seq=0;}this.broadcast();return;
      }
      if(this.phase!=='lobby')throw new Error('Party setup can only change in the lobby');
      if(message.type==='creating'){this.creating=z.boolean().parse(message.active);this.broadcast();return;}
      if(message.type==='playlist'||message.type==='random'){
        await this.choosePlaylist(message);return;
      }else if(message.type==='add-bot'){
        if(!participantCounts(this.versions.map(v=>v.manifest),this.settings.mode).includes(this.seats.length+1))throw new Error('This queue cannot support another seat');
        this.seats.push(this.makeSeat(this.seats.length));
      }else{
        const target=this.seats.find(s=>s.id===message.playerId);if(!target||target.ws)throw new Error('Choose an empty bot seat');
        if(message.type==='remove-bot'){
          if(!participantCounts(this.versions.map(v=>v.manifest),this.settings.mode).includes(this.seats.length-1))throw new Error('This queue needs the current number of seats');
          this.seats=this.seats.filter(s=>s!==target);this.seats.forEach((s,i)=>{s.id=`p${i}`;s.color=colors[i];s.epoch++;s.seq=0;s.held=emptyButtons();s.queued=[];if(!s.guestId)s.name=`${s.botType==='jev'?'Jev':'Bot'} ${i+1}`;});
        }else{target.botType=z.enum(['jev','scripted']).parse(message.controller);if(!target.guestId)target.name=`${target.botType==='jev'?'Jev':'Bot'} ${this.seats.indexOf(target)+1}`;this.handoff(target,target.botType);}
      }
      this.setupChanged();return;
    }
    if(message.type==='ready'&&this.phase==='lobby'){seat.ready=true;this.broadcast();return;}
    if(message.type==='loaded'&&this.phase==='preparing'){if(message.versionId!==this.versions[this.round].id)return;seat.loaded=true;return;}
    if(message.type==='asset-error'&&['preparing','countdown','playing'].includes(this.phase)){this.error='A player could not load or render this cartridge. Retry the match.';await this.abort('asset-load-failure');return;}
    if(message.type==='start'){
      if(seat.guestId!==this.hostId)throw new Error('Only the host can start');
      if(this.phase!=='lobby'&&this.phase!=='match-result')return;
      if(message.versions!==undefined||message.random!==undefined){
        if(this.phase!=='lobby')throw new Error('Return to the lobby before changing games');
        if(message.versions!==undefined&&message.random!==undefined)throw new Error('Choose a pinned list or a random selection');
        await this.choosePlaylist({...message,type:message.random!==undefined?'random':'playlist',filters:message.random});
      }
      await this.start(Boolean(message.newSeed));return;
    }
    if(message.type==='input'){
      const reject=(reason:string)=>{seat.rejected[reason]=(seat.rejected[reason]??0)+1;};
      if(this.phase!=='playing'||seat.controller!=='human'||message.matchId!==this.matchId||message.round!==this.round||message.epoch!==seat.epoch){reject('stale-ownership');return;}
      if(!Number.isSafeInteger(message.seq)||message.seq<=seat.seq||message.seq>seat.seq+1000){reject('sequence');return;}
      const edges=z.array(edgeSchema).max(32).parse(message.edges);if(seat.queued.length+edges.length>64)return;
      seat.seq=message.seq;seat.methods.add(message.method==='touch'?'virtual-pad':'keyboard');
      const claim=seat.clock.input(message.clientTime,serverNow()),inactive=['waiting','finished','eliminated'].includes(this.status?.roles[seat.id]);
      if(!claim.accepted||claim.at<this.startsAt||inactive){reject(inactive?'out-of-role':!claim.accepted?claim.reason:'before-start');this.queue(seat,edges.filter(e=>!e.down&&seat.held[e.button]));return;}
      this.queue(seat,edges.map(e=>({...e,at:claim.at,compensate:claim.reason==='accepted'})));return;
    }
    if(message.type==='release'){this.queue(seat,buttonEdges(seat.held,emptyButtons()));return;}
  }
  private async choosePlaylist(message:any){
    if(message.revision!==this.revision)throw new Error('The party setup changed. Review the queue and try again.');
    const selection=message.type==='random'?selectPlaylist((await this.store.library()).map(v=>v.manifest),this.settings,message.filters??{}):undefined;
    const ids=selection?.versions??versionIds.parse(message.versions),versions=await Promise.all(ids.map(id=>this.store.version(id)));
    if(versions.some(v=>v.manifest.provenance.draft===true&&!this.versions.some(old=>old.id===v.id)))throw new Error('Wait for this game to finish before adding it to the party');
    this.versions=versions;this.selection=selection;this.setupChanged();
  }
  private queue(seat:Seat,edges:QueuedEdge[]){if(seat.queued.length+edges.length>64)return;const at=serverNow();seat.queued.push(...edges.map(e=>({at,...e})));for(const e of edges)seat.held[e.button]=e.down;seat.lastInput=performance.now();}
  private async start(newSeed:boolean){
    if(this.creating)throw new Error('Return from game creation before starting the party');
    if(!this.versions.length)throw new Error('Choose games or a random selection before starting');
    this.rematchOf=this.phase==='match-result'?this.matchId:null;
    if(newSeed)this.settings.seed=randomBytes(4).readUInt32LE();
    const count=Math.max(this.settings.targetPlayers,...this.versions.map(v=>v.manifest.meta.players[0]));
    while(this.seats.length<count)this.seats.push(this.makeSeat(this.seats.length));
    this.syncBotSettings();
    this.round=0;this.rounds=[];this.points={};this.error='';this.matchId=id();this.startedAt=serverNow();this.finishedAt=null;this.termination=null;
    this.participants=this.seats.map(s=>({playerId:s.id,guestId:s.guestId,name:s.name,controller:s.controller}));
    const definition={versions:this.versions.map(v=>v.id),settings:this.settings,seedPolicy:'fixed',selection:this.selection??null};
    this.definition=JSON.parse(JSON.stringify(definition));
    if(!this.challengeId||newSeed){this.challengeId=id().slice(0,12);await this.store.query('INSERT INTO challenges(id,owner_id,title,definition) VALUES($1,$2,$3,$4)',[this.challengeId,this.hostId,'A little friendly chaos',JSON.stringify(definition)]);}
    await this.store.query('INSERT INTO matches(id,challenge_id,status,record) VALUES($1,$2,$3,$4)',[this.matchId,this.challengeId,'playing',JSON.stringify(this.record())]);
    try{await this.prepare();}catch(e){this.error=(e as Error).message;await this.abort('technical-failure');}
  }
  private async prepare(){
    this.phase='preparing';this.phaseUntil=serverNow()+15000;this.runner?.dispose();this.runner=undefined;this.views={};this.status=null;
    const version=this.versions[this.round],meta=version.manifest.meta;
    await this.store.query("INSERT INTO round_attempts(match_id,round_index,version_id,status) VALUES($1,$2,$3,'preparing') ON CONFLICT DO NOTHING",[this.matchId,this.round,version.id]);
    const mode=effectiveMode(meta,this.seats.length,this.settings.mode);if(!mode)throw new Error('Playlist incompatible with participant count');this.mode=mode;
    for(const seat of this.seats){seat.loaded=!seat.ws;seat.queued=[];seat.held=emptyButtons();seat.epoch++;seat.seq=0;seat.history=[];seat.methods=new Set();seat.rejected={};seat.fallback=undefined;seat.scheduler=new DecisionScheduler(Number(process.env.JEV_INTERVAL_MS)||200);seat.sources=new Set([seat.controller]);}
    this.broadcast();this.runner=await RuntimeProcess.create(version.code,await this.store.runtime(version));
    this.status=await this.runner.call('init',{seed:(this.settings.seed+this.round)>>>0,difficulty:this.settings.difficulty,players:this.seats.map(({id,name,color})=>({id,name,color}))},this.mode);
    await this.snapshotViews();this.broadcast();
  }
  private async pump(){
    if(this.busy||this.closed)return;this.busy=true;
    try{await this.sequence(()=>this.tick());}catch(error){this.error=(error as Error).message;this.runner?.dispose();this.runner=undefined;this.phase='match-result';this.broadcast();}
    finally{this.busy=false;}
  }
  private async tick(){
    if(this.closed)return;
    try{
      const now=serverNow(),mono=performance.now();
      for(const seat of this.seats)if(seat.ws){const probe=seat.clock.probe(now);if(probe)this.send(seat.ws,probe);}
      if(this.phase==='preparing'&&this.runner&&this.status){if(this.seats.every(s=>s.loaded)||now>=this.phaseUntil){if(this.seats.some(s=>s.ws&&!s.loaded)){await this.abort('asset-preload-timeout');return;}this.phase='countdown';this.startsAt=now+COUNTDOWN_MS;this.broadcast();}}
      else if(this.phase==='countdown'&&now>=this.startsAt){this.phase='playing';this.last=mono;this.accumulator=0;this.actionDeadline=mono+(this.status.nextStepAt??10)*1000;for(const view of Object.values(this.views))view.sampleTime=now;await this.store.query("UPDATE round_attempts SET status='playing',started_at=now() WHERE match_id=$1 AND round_index=$2",[this.matchId,this.round]);this.broadcast();}
      else if(this.phase==='playing'){
        const meta=this.versions[this.round].manifest.meta;
        this.decide(mono);
        if(meta.clock==='realtime'){
          this.accumulator+=Math.min(250,mono-this.last);this.last=mono;
          let steps=0;while(this.accumulator>=1000/60&&steps++<8&&this.phase==='playing'){this.accumulator-=1000/60;await this.step(1/60,'tick');}
        }else {
          const hasInput=this.seats.some(s=>s.queued.length);
          if(hasInput||mono>=this.actionDeadline){const event=mono>=this.actionDeadline?'timeout':'input';await this.step(Math.min(100,(mono-this.last)/1000),event);this.last=mono;if(event==='timeout'&&this.status?.nextStepAt===undefined)this.actionDeadline=mono+10000;}
        }
        if(mono-this.lastSnapshot>=50&&this.phase==='playing'){await this.snapshotViews();this.lastSnapshot=mono;this.broadcast();}
      }else if(this.phase==='round-result'&&now>=this.phaseUntil){this.round++;if(this.round>=this.versions.length){this.phase='match-result';this.runner?.dispose();this.runner=undefined;this.finishedAt=serverNow();this.termination={kind:'complete',reason:'playlist-finished'};await this.persist('complete');this.broadcast();}else await this.prepare();}
    }catch(error){this.error=error instanceof Error?error.message:'Room failure';await this.abort('technical-failure');}
  }
  private async step(dt:number,event:'tick'|'input'|'timeout'){
    if(!this.runner)return;
    const tickTime=this.versions[this.round].manifest.meta.clock==='realtime'?performance.timeOrigin+this.last-this.accumulator:serverNow();
    const edges:Record<string,Edge[]>={};
    for(const s of this.seats){const ready:Edge[]=[];while(s.queued.length&&(s.queued[0].at??tickTime)<=tickTime){const {at,compensate,...edge}=s.queued.shift()!;ready.push({...edge,...(!compensate||at===undefined?{}:{age:Math.min(MAX_COMPENSATION_MS,Math.max(0,tickTime-at))/1000})});}if(ready.length)edges[s.id]=ready;}
    const previousRoles=this.status?.roles??{};this.status=await this.runner.call('step',edges,dt,event);
    for(const s of this.seats)if(previousRoles[s.id]!==this.status.roles[s.id]){s.epoch++;s.seq=0;s.queued=buttonEdges(s.held,emptyButtons());s.held=emptyButtons();this.actionDeadline=performance.now()+10000;}
    if(this.status.nextStepAt!==undefined)this.actionDeadline=performance.now()+Math.max(0,this.status.nextStepAt-this.status.time)*1000;
    if(this.status.feedback.length)this.broadcastEvent({type:'feedback',matchId:this.matchId,round:this.round,events:this.status.feedback});
    if(this.status.done)await this.finishRound();
  }
  private async snapshotViews(){
    if(!this.runner)return;
    const sampleTime=this.phase==='playing'&&this.versions[this.round].manifest.meta.clock==='realtime'?performance.timeOrigin+this.last-this.accumulator:serverNow();
    for(const seat of this.seats){
      const view=await this.runner.call('observe',seat.id);view.sampleTime=sampleTime;this.views[seat.id]=view;
      const phase=typeof view.game?.phase==='string'?`${view.game.round??0}:${view.game.phase}`:null;
      const sample={tick:view.tick,phase,game:view.game},last=seat.history.at(-1);
      // Retain prior visible phases for memory tasks, even when the player's role changes.
      if(phase&&last?.phase===phase)seat.history[seat.history.length-1]=sample;
      else if(phase||!last||view.tick-last.tick>=12)seat.history.push(sample);
      if(seat.history.length>6)seat.history.shift();
    }
  }
  private decide(now:number){
    const version=this.versions[this.round],meta=version.manifest.meta;
    for(const seat of this.seats){if(seat.controller==='human'||!this.views[seat.id]||this.views[seat.id].roles[seat.id]!==this.status?.roles[seat.id]||['waiting','finished','eliminated'].includes(this.status?.roles[seat.id]))continue;
      if(now-seat.lastInput>1000&&Object.values(seat.held).some(Boolean))this.queue(seat,buttonEdges(seat.held,emptyButtons()));
      const stamp=()=>({round:`${this.matchId}:${this.round}:${this.phase}`,epoch:seat.epoch,role:this.status?.roles[seat.id]??'',tick:this.status?.tick??0});
      seat.scheduler.opportunity(now,stamp(),async()=>{
        if(seat.controller==='scripted')return scriptedDecision(meta,this.views[seat.id],seat.held,seat.scheduler.serial);
        try{const latency=[...seat.scheduler.metrics].reverse().find(m=>m.source==='jev'&&m.latencyMs!==undefined)?.latencyMs??120;
          return await jevDecision(meta,this.views[seat.id],seat.held,seat.history,undefined,{source:version.source,intervalMs:seat.scheduler.interval,expectedLatencyMs:Math.min(1200,latency),observationAgeMs:Math.max(0,serverNow()-this.views[seat.id].sampleTime)});}
        catch(e){return {...scriptedDecision(meta,this.views[seat.id],seat.held,seat.scheduler.serial),error:(e as Error).message};}
      },stamp,decision=>{if(seat.controller==='human')return;seat.sources.add(decision.source);seat.fallback=decision.error;this.queue(seat,buttonEdges(seat.held,decision.buttons));});
    }
  }
  private async finishRound(){
    await this.snapshotViews();const version=this.versions[this.round],scores=this.status.scores,oldPoints={...this.points};
    const records=this.seats.map(s=>{
      const score=scores[s.id]??0,better=(a:number,b:number)=>version.manifest.meta.score.order==='higher'?a>b:a<b;
      const points=this.seats.length===1?(this.status.outcomes[s.id]==='success'?3:0):this.seats.filter(o=>o.id!==s.id&&better(score,scores[o.id]??0)).length*2+this.seats.filter(o=>o.id!==s.id&&score===(scores[o.id]??0)).length;
      this.points[s.id]=(this.points[s.id]??0)+points;
      const controllers=[...s.sources].sort(),dimensions={version:version.id,difficulty:this.settings.difficulty,players:this.seats.length,mode:this.mode,controllers};return {playerId:s.id,guestId:s.guestId,name:s.name,score,points,outcome:this.status.outcomes[s.id]??'complete',durationSeconds:this.status.time,completionReason:this.status.reason,controllers,inputMethods:[...s.methods],dimensions,partition:hash(JSON.stringify(dimensions)),metrics:s.scheduler.metrics,network:{...s.clock.estimate(serverNow()),...s.clock.metrics,rejected:s.rejected}};
    });
    this.rounds.push({versionId:version.id,mode:this.mode,durationSeconds:this.status.time,completionReason:this.status.reason,records});
    try{await this.store.finishRound(this.matchId,this.round,version.id,records,this.record());}catch(e){this.rounds.pop();this.points=oldPoints;throw e;}
    this.phase='round-result';this.phaseUntil=serverNow()+3500;this.broadcast();
  }
  private record(){return {schemaVersion:3,challengeId:this.challengeId,definition:this.definition,settings:this.settings,participants:this.participants,startedAt:this.startedAt,finishedAt:this.finishedAt,durationMs:(this.finishedAt??serverNow())-this.startedAt,termination:this.termination,rematchOf:this.rematchOf,rounds:this.rounds,points:this.points,error:this.error};}
  private async persist(status:string){if(this.matchId)await this.store.query('UPDATE matches SET status=$1,record=$2 WHERE id=$3',[status,JSON.stringify(this.record()),this.matchId]);}
  private async abort(reason:string,kind='technical'){
    this.runner?.dispose();this.runner=undefined;this.phase='match-result';this.error=this.error||reason;this.finishedAt=serverNow();this.termination={kind,reason};
    await this.store.query("UPDATE round_attempts SET status=$1,reason=$2,ended_at=now() WHERE match_id=$3 AND status IN ('preparing','playing')",[kind==='interrupted'?'interrupted':'aborted',reason,this.matchId]);
    await this.persist(kind==='interrupted'?'interrupted':'aborted');this.broadcast();
  }
  private send(ws:WebSocket,message:any){if(ws.readyState===1&&ws.bufferedAmount<1_000_000)ws.send(JSON.stringify(message));}
  private broadcastEvent(message:any){for(const s of this.seats)if(s.ws)this.send(s.ws,message);}
  broadcast(){for(const seat of this.seats)if(seat.ws)this.send(seat.ws,{type:'state',roomId:this.id,hostId:this.hostId,phase:this.phase,creating:this.creating,revision:this.revision,participantCounts:participantCounts(this.versions.map(v=>v.manifest),this.settings.mode),playlist:this.versions.map(v=>({id:v.id,meta:v.manifest.meta,icon:v.manifest.icon?.url??null})),settings:((({seed,...publicSettings})=>publicSettings)(this.settings)),round:this.round,roundCount:this.versions.length,matchId:this.matchId,challengeId:this.challengeId,startsAt:this.startsAt,serverTime:serverNow(),phaseUntil:this.phaseUntil,error:this.error,manifest:this.versions[this.round]?.manifest??this.versions.at(-1)?.manifest,mode:this.mode,epoch:seat.epoch,playerId:seat.id,network:seat.clock.estimate(serverNow()),seats:this.seats.map(s=>({id:s.id,name:s.name,color:s.color,ready:s.ready,connected:!!s.ws,controller:s.controller,botType:s.botType,fallback:s.fallback,guestId:s.guestId,points:this.points[s.id]??0})),view:this.views[seat.id]??null,results:this.rounds.at(-1)?.records.map(({metrics,...rest}:any)=>rest)??[]});}
  isExpired(now=serverNow()){
    if(this.closed)return true;
    if(!this.seats.some(s=>s.ws))return now-this.emptySince>=120000;
    return (this.phase==='lobby'||this.phase==='match-result')&&now-this.lastActivity>=1800000;
  }
  async close(reason='server-shutdown'){
    if(this.closed)return;this.closed=true;clearInterval(this.timer);
    await this.sequence(async()=>{
      if(this.matchId&&this.phase!=='match-result'){this.error=reason;await this.abort(reason,reason==='server-shutdown'?'interrupted':reason==='room-expired'?'abandoned':'technical');}
      this.runner?.dispose();this.runner=undefined;
      for(const s of this.seats)if(s.ws){this.send(s.ws,{type:'error',message:reason==='room-expired'?'This idle party has closed. Start a new party from the arcade.':'The game server is restarting. Saved results remain available.'});s.ws.close(1001,reason);}
    });
  }
}
