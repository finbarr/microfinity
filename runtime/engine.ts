import { Graphics, emptyButtons, type Buttons, type Context, type Edge, type Feedback, type Game, type Hud, type Inputs, type Outcome, type Player } from '../sdk/index';
import { advanceInput } from './input';

export type Configuration = { seed:number; players:Player[]; difficulty:number };
export type Snapshot = {
  runtime:string; gameId:string; config:Configuration; state:any; rng:number; tick:number; time:number;
  scores:Record<string,number>; outcomes:Record<string,Outcome>; done:boolean; reason:string;
  held:Record<string,Buttons>; roles:Record<string,string>; suppress:Record<string,boolean>; eventSerial:number;
};
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function freeze(value:any):any { if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v);}return value; }
function serializable(value:any,path='state',ancestors=new Set<object>(),depth=0):void {
  if(depth>32)throw new Error(`${path}: nesting limit exceeded`);
  if(value===null||typeof value==='boolean'||typeof value==='string')return;
  if(typeof value==='number'&&Number.isFinite(value))return;
  if(typeof value!=='object')throw new Error(`${path}: use JSON values, not ${String(value)}`);
  if(ancestors.has(value))throw new Error(`${path}: cyclic values cannot be restored`);
  if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw new Error(`${path}: use plain JSON objects`);
  ancestors.add(value);for(const key of Object.keys(value))serializable(value[key],`${path}.${key}`,ancestors,depth+1);ancestors.delete(value);
}
export class Engine {
  snapshot:Snapshot;
  feedback:Feedback[]=[];
  constructor(readonly game:Game,config:Configuration) {
    if(config.players.length<game.meta.players[0]||config.players.length>game.meta.players[1])throw new Error('Unsupported player count');
    if(new Set(config.players.map(p=>p.id)).size!==config.players.length)throw new Error('Duplicate player id');
    this.snapshot={runtime:'1.0.0',gameId:game.meta.id,config:clone(config),state:null,rng:config.seed>>>0,tick:0,time:0,scores:{},outcomes:{},done:false,reason:'',held:{},roles:{},suppress:{},eventSerial:0};
    for(const p of config.players){this.snapshot.scores[p.id]=0;this.snapshot.held[p.id]=emptyButtons();this.snapshot.suppress[p.id]=false;}
    this.snapshot.state=game.init(this.context(0,'tick'));
    serializable(this.snapshot.state);
    this.updateRoles();
  }
  private random() {
    let t=this.snapshot.rng=(this.snapshot.rng+0x6d2b79f5)>>>0;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;
  }
  private context(dt:number,event:Context['event']):Context {
    const s=this.snapshot;
    return {players:freeze(clone(s.config.players)),tick:s.tick,time:s.time,duration:this.game.meta.duration,dt,difficulty:s.config.difficulty,event,get scores(){return freeze(clone(s.scores));},
      random:()=>this.random(),integer:(min,max)=>Math.floor(this.random()*(max-min+1))+min,
      addScore:(id,points)=>{if(!(id in s.scores)||!Number.isFinite(points)||Math.abs(points)>1e6)throw new Error('Invalid score');s.scores[id]+=points;},
      setScore:(id,points)=>{if(!(id in s.scores)||!Number.isFinite(points)||Math.abs(points)>1e6)throw new Error('Invalid score');s.scores[id]=points;},
      finishPlayer:(id,outcome)=>{if(!(id in s.scores))throw new Error('Unknown player');s.outcomes[id]=outcome;},
      finishRound:(reason='complete')=>{s.done=true;s.reason=reason.slice(0,100);},
      feedback:(kind,data={})=>{
        if(this.feedback.length>=64)return;
        const feedback:Feedback={id:`${s.tick}:${s.eventSerial++}`,tick:s.tick,kind:String(kind).slice(0,40)};
        // Cartridge data cannot replace engine-owned event IDs or timestamps.
        if(typeof data.playerId==='string'&&s.config.players.some(p=>p.id===data.playerId))feedback.playerId=data.playerId;
        if(Number.isFinite(data.x))feedback.x=data.x;
        if(Number.isFinite(data.y))feedback.y=data.y;
        if(typeof data.text==='string')feedback.text=data.text.slice(0,120);
        if(data.sound){feedback.sound={};if(Number.isFinite(data.sound.pitch))feedback.sound.pitch=Math.max(-12,Math.min(12,data.sound.pitch!));if(['square','triangle','sine'].includes(data.sound.timbre!))feedback.sound.timbre=data.sound.timbre;}
        this.feedback.push(feedback);
      }
    };
  }
  private updateRoles() {
    const s=this.snapshot,roleState=this.game.role?freeze(clone(this.snapshot.state)):null;
    for(const p of s.config.players){
      const role=this.game.role?.(roleState,p.id)??'player';
      if(s.roles[p.id]!==role){s.suppress[p.id]=s.held[p.id].action;s.roles[p.id]=role;}
    }
  }
  step(edges:Record<string,Edge[]>={},dt=1/60,event:Context['event']='tick') {
    const s=this.snapshot;if(s.done)return this.status();
    if(!Number.isFinite(dt)||dt<0||dt>120)throw new Error('Invalid time step');
    if(this.game.meta.clock==='realtime'&&Math.abs(dt-1/60)>1e-9)throw new Error('Realtime games require 60 Hz steps');
    if(this.game.meta.clock==='action'&&event==='tick')throw new Error('Action games only advance on input or timeout');
    if(Object.keys(edges).some(id=>!s.config.players.some(p=>p.id===id)))throw new Error('Unknown input player');
    this.feedback=[];const inputs:Inputs={};
    for(const p of s.config.players){
      const playerEdges=edges[p.id]??[];if(playerEdges.length>64)throw new Error('Input budget exceeded');
      let filtered:Edge[]=[];
      for(const edge of playerEdges){
        if(edge.button==='action'&&s.suppress[p.id]) {if(!edge.down)s.suppress[p.id]=false;else continue;}
        filtered.push(edge);
      }
      const input=advanceInput(s.held[p.id],filtered);s.held[p.id]=input.held;
      if(['waiting','finished','eliminated'].includes(s.roles[p.id]))inputs[p.id]=advanceInput(emptyButtons(),[]);
      else inputs[p.id]=input;
    }
    s.tick++;s.time=Math.min(s.time+dt,this.game.meta.duration);
    this.game.step(s.state,inputs,this.context(dt,event));
    serializable(s.state);
    if(!s.done&&s.time>=this.game.meta.duration){s.done=true;s.reason='time-limit';}
    if(s.done)for(const p of s.config.players)if(!s.outcomes[p.id])s.outcomes[p.id]='complete';
    this.updateRoles();return this.status();
  }
  status(){const s=this.snapshot;return {tick:s.tick,time:s.time,scores:clone(s.scores),outcomes:clone(s.outcomes),done:s.done,reason:s.reason,roles:clone(s.roles),feedback:clone(this.feedback)};}
  observe(playerId:string){
    const s=this.snapshot;if(!(playerId in s.scores))throw new Error('Unknown observer');
    const context={players:clone(s.config.players),tick:s.tick,time:s.time,difficulty:s.config.difficulty};
    const view=this.game.observe(freeze(clone(s.state)),playerId,freeze(context));
    serializable(view,'observe');
    const hud:Hud={};
    if(this.game.hud){
      const value=this.game.hud(freeze(clone(view)));serializable(value,'hud');
      if(!value||Array.isArray(value)||typeof value!=='object')throw new Error('HUD must be an object');
      if(value.message!==undefined){if(typeof value.message!=='string'||value.message.length>120)throw new Error('HUD message limit');hud.message=value.message;}
      if(value.activePlayerId!==undefined){if(!s.config.players.some(p=>p.id===value.activePlayerId))throw new Error('Unknown HUD player');hud.activePlayerId=value.activePlayerId;}
      if(value.items!==undefined){
        if(!Array.isArray(value.items)||value.items.length>6)throw new Error('HUD item limit');
        hud.items=value.items.map(item=>{if(!item||typeof item.label!=='string'||item.label.length>30||!['string','number'].includes(typeof item.value)||String(item.value).length>60)throw new Error('Invalid HUD item');return {label:item.label,value:item.value};});
      }
    }
    return {game:view,hud,playerId,...this.status(),players:clone(s.config.players),instruction:this.game.meta.instruction};
  }
  draw(playerId:string){const gfx=new Graphics(this.game.meta.style,[],0,{time:this.snapshot.time});this.game.draw(freeze(this.observe(playerId).game),gfx);return gfx.commands;}
  save(){return clone(this.snapshot);}
  restore(snapshot:Snapshot){
    if(snapshot.runtime!=='1.0.0'||snapshot.gameId!==this.game.meta.id)throw new Error('Snapshot version mismatch');
    this.snapshot=clone(snapshot);this.feedback=[];
  }
}
