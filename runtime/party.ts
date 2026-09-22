import {emptyButtons,type Buttons,type Edge,type Feedback,type Metadata,type Player} from '../sdk/index';
import type {Configuration} from './engine';
import {buttonEdges} from './input';

type Call=(method:string,...args:any[])=>any;
type Status={tick:number;time:number;scores:Record<string,number>;outcomes:Record<string,string>;roles:Record<string,string>;done:boolean;reason:string;feedback:Feedback[];nextStepAt?:number};
type World={players:Player[];members:{id:string;local:string}[];bots:Record<string,Buttons>;snapshot:any;status:Status;pendingDt:number;deadline:number;nextBotAt:number};
type Saved={adapter:'party-v1';gameId:string;config:Configuration;tick:number;time:number;feedback:Feedback[];worlds:World[]};
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const canonical=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);

/** Runs pinned cartridge runtimes unchanged. Its in-memory snapshots let the
 * live adapter switch between private worlds without losing their state.
 * A supported shared game keeps its authored world. A small legacy game gets
 * equal-seed independent attempts with local p0.. IDs and required AI opponents. */
export class PartyRuntime {
  private saved:Saved;
  private readonly independent:boolean;
  private activeWorld:number|undefined;
  constructor(private call:Call,private meta:Metadata,config:Configuration){
    if(!Number.isInteger(config.players.length)||config.players.length<1||config.players.length>4)throw new Error('A party needs one to four players');
    if(new Set(config.players.map(p=>p.id)).size!==config.players.length)throw new Error('Duplicate player id');
    this.independent=meta.participation==='individual'||config.players.length>meta.players[1];
    const groups=this.independent?config.players.map(p=>[p]):[config.players];
    const worlds=groups.map(group=>{
      const players=group.map((p,i)=>({...p,id:`p${i}`})),members=group.map((p,i)=>({id:p.id,local:`p${i}`}));
      const bots:Record<string,Buttons>={};
      while(players.length<meta.players[0]){const id=`p${players.length}`;players.push({id,name:`Practice rival ${players.length}`,color:'#a1a1aa'});bots[id]=emptyButtons();}
      const status=call('init',{...config,players},'native');
      return {players,members,bots,status,snapshot:call('save'),pendingDt:0,deadline:Math.min(10,meta.duration),nextBotAt:.2};
    });
    this.saved={adapter:'party-v1',gameId:meta.id,config:clone(config),tick:0,time:0,feedback:[],worlds};
    this.activeWorld=worlds.length-1;
  }
  private activate(index:number){
    if(this.activeWorld===index)return;
    if(this.activeWorld!==undefined)this.saved.worlds[this.activeWorld].snapshot=this.call('save');
    const world=this.saved.worlds[index];
    // Old ModeEngine.restore restores rule state but retains its constructor's
    // outer player configuration. Recreate that configuration before restore.
    this.call('init',{...this.saved.config,players:world.players},'native');
    this.call('restore',world.snapshot);this.activeWorld=index;
  }
  private activeBot(world:World){return Object.keys(world.bots).some(id=>!['waiting','finished','eliminated'].includes(world.status.roles[id]));}
  step(edges:Record<string,Edge[]>={},dt=1/60,event:'tick'|'input'|'timeout'='tick'){
    if(this.status().done)return this.status();
    if(Object.keys(edges).some(id=>!this.saved.config.players.some(p=>p.id===id)))throw new Error('Unknown input player');
    if(!Number.isFinite(dt)||dt<0||dt>120)throw new Error('Invalid time step');
    if(this.meta.clock==='action'&&event==='tick')throw new Error('Action games only advance on input or timeout');
    if(this.meta.clock==='realtime'&&Math.abs(dt-1/60)>1e-9)throw new Error('Realtime games require 60 Hz steps');
    this.saved.feedback=[];const time=this.saved.time+dt;
    for(const [index,world] of this.saved.worlds.entries()){
      if(world.status.done)continue;
      const input:Record<string,Edge[]>={};
      for(const member of world.members)input[member.local]=edges[member.id]??[];
      world.pendingDt+=dt;
      const timeout=this.meta.clock==='action'&&time+1e-9>=world.deadline;
      const botDue=this.meta.clock!=='action'||this.activeBot(world)&&time+1e-9>=world.nextBotAt;
      // Another private world's input must not call this action game's rules.
      // Accumulate its elapsed time until its own input, opponent or deadline.
      if(this.meta.clock==='action'&&!timeout&&!botDue&&!Object.values(input).some(list=>list.length))continue;
      this.activate(index);
      for(const [id,held] of Object.entries(world.bots)){
        // Deliberately simple, deterministic practice input. It reads only the
        // visible role and clock, never answers, RNG, or hidden cartridge state.
        const visible=this.call('observe',id),buttons=emptyButtons();
        if(botDue&&!['waiting','finished','eliminated'].includes(visible.roles[id])){
          const beat=this.meta.clock==='action'?world.status.tick:Math.floor((this.saved.time+1e-8)*5);
          buttons.action=beat%2===0;
          if(this.meta.controls.directions){const direction=['right','down','left','up'][Math.floor(beat/4)%4] as keyof Buttons;buttons[direction]=true;}
        }
        input[id]=buttonEdges(held,buttons);world.bots[id]=buttons;
      }
      const previousRoles=world.status.roles;
      world.status=this.call('step',input,this.meta.clock==='action'?Math.min(world.pendingDt,this.meta.duration-world.status.time):dt,this.meta.clock==='action'?(timeout?'timeout':'input'):event);
      world.pendingDt=0;world.nextBotAt=time+.2;
      if(timeout||canonical(previousRoles)!==canonical(world.status.roles))world.deadline=Math.min(time+10,this.meta.duration);
      for(const feedback of world.status.feedback){
        const owner=world.members.find(m=>m.local===feedback.playerId)?.id;
        // Every cue in a private attempt belongs on that participant's canvas.
        const playerId=this.independent?world.members[0].id:owner;
        const {playerId:ignored,...cue}=feedback;
        this.saved.feedback.push({...cue,id:`party-v1:${index}:${feedback.id}`,tick:this.saved.tick+1,...(playerId?{playerId}:{})});
      }
    }
    this.saved.tick++;this.saved.time+=dt;
    return this.status();
  }
  status():Status{
    const scores:Record<string,number>={},outcomes:Record<string,string>={},roles:Record<string,string>={};
    for(const world of this.saved.worlds)for(const member of world.members){
      scores[member.id]=world.status.scores[member.local];
      if(world.status.outcomes[member.local])outcomes[member.id]=world.status.outcomes[member.local];
      roles[member.id]=world.status.done?'finished':world.status.roles[member.local];
    }
    const done=this.saved.worlds.every(w=>w.status.done);
    const nextStepAt=this.meta.clock==='action'&&!done?Math.min(...this.saved.worlds.filter(w=>!w.status.done).map(w=>Math.min(w.deadline,this.activeBot(w)?w.nextBotAt:Infinity))):undefined;
    return {tick:this.saved.tick,time:this.saved.time,scores,outcomes,roles,done,reason:done?(this.saved.worlds.length===1?this.saved.worlds[0].status.reason:'complete'):'',feedback:clone(this.saved.feedback),...(nextStepAt===undefined?{}:{nextStepAt})};
  }
  observe(id:string){
    const world=this.saved.worlds.find(w=>w.members.some(m=>m.id===id));if(!world)throw new Error('Unknown observer');
    const local=world.members.find(m=>m.id===id)!.local;
    this.activate(this.saved.worlds.indexOf(world));const view=this.call('observe',local),hud={...view.hud};
    if(hud.activePlayerId){const member=world.members.find(m=>m.local===hud.activePlayerId);if(member)hud.activePlayerId=member.id;else delete hud.activePlayerId;}
    return {...view,...this.status(),hud,playerId:id,players:clone(this.saved.config.players),gamePlayerId:local,gameScores:view.scores,
      attemptTime:world.status.time,mode:{kind:this.independent?'race':'native',adapter:'party-v1'}};
  }
  save(){if(this.activeWorld!==undefined)this.saved.worlds[this.activeWorld].snapshot=this.call('save');return clone(this.saved);}
  restore(saved:Saved){
    if(saved.adapter!=='party-v1'||saved.gameId!==this.meta.id||canonical(saved.config)!==canonical(this.saved.config)
      ||saved.worlds.length!==this.saved.worlds.length)throw new Error('Party snapshot mismatch');
    for(let i=0;i<saved.worlds.length;i++)if(canonical(saved.worlds[i].members)!==canonical(this.saved.worlds[i].members)
      ||canonical(saved.worlds[i].players)!==canonical(this.saved.worlds[i].players))throw new Error('Party snapshot players mismatch');
    this.saved=clone(saved);this.activeWorld=undefined;return this.status();
  }
}
