import { Engine, type Configuration } from './engine';
import { advanceInput } from './input';
import { emptyButtons, type Buttons, type Edge, type Game, type Outcome, type Feedback } from '../sdk/index';
export type Mode='native'|'race'|'obstruction'|'pressure';
/** Reusable modes own wrapper state, never rewrite cartridge state. */
export class ModeEngine {
  private engines:Engine[]=[];
  private state={turn:0,tick:0,time:0,pressure:0,obscuredUntil:0,by:'',cooldown:{} as Record<string,number>,held:{} as Record<string,Buttons>,feedback:[] as Feedback[],done:false};
  constructor(private game:Game,private config:Configuration,readonly mode:Mode='native') {
    if(mode!=='native'&&!game.meta.modifiers.includes(mode))throw new Error('Incompatible party mode');
    for(const p of config.players){this.state.held[p.id]=emptyButtons();this.state.cooldown[p.id]=0;}
    this.engines=mode==='native'?[new Engine(game,config)]:config.players.map(p=>new Engine(game,{...config,players:[p]}));
  }
  step(edges:Record<string,Edge[]>={},dt=1/60,event:'tick'|'input'|'timeout'='tick') {
    if(this.state.done)return this.status();this.state.tick++;this.state.time+=dt;this.state.feedback=[];
    const collect=(engine:Engine,index:number)=>this.state.feedback.push(...engine.feedback.map(f=>({...f,id:`${this.mode}:${index}:${f.id}`})));
    if(this.mode==='native'){this.engines[0].step(edges,dt,event);collect(this.engines[0],0);this.state.done=this.engines[0].snapshot.done;}
    else if(this.mode==='race') {for(let i=0;i<this.engines.length;i++){const id=this.config.players[i].id;this.engines[i].step({[id]:edges[id]??[]},dt,event);collect(this.engines[i],i);}this.state.done=this.engines.every(e=>e.snapshot.done);}
    else {
      const active=this.config.players[this.state.turn],engine=this.engines[this.state.turn];
      this.state.pressure=Math.max(0,this.state.pressure-dt*2);
      for(const p of this.config.players){const input=advanceInput(this.state.held[p.id],edges[p.id]??[]);this.state.held[p.id]=input.held;
        if(p.id!==active.id){
          if(this.mode==='obstruction'&&input.pressed.action&&this.state.time>=this.state.cooldown[p.id]&&this.state.time>=this.state.obscuredUntil+1.5){this.state.by=p.name;this.state.obscuredUntil=this.state.time+.7;this.state.cooldown[p.id]=this.state.time+3;this.state.feedback.push({id:`obstruction:${this.state.tick}:${p.id}`,tick:this.state.tick,kind:'interference',playerId:p.id,text:p.name});}
          if(this.mode==='pressure'){const pumps=input.edges.filter(e=>e.button==='action'&&e.down).length;if(pumps>0&&this.state.time>=this.state.cooldown[p.id]){this.state.pressure=Math.min(100,this.state.pressure+8);this.state.by=p.name;this.state.cooldown[p.id]=this.state.time+.2;}}
        }
      }
      engine.step({[active.id]:edges[active.id]??[]},dt,event);collect(engine,this.state.turn);
      if(this.mode==='pressure'&&this.state.pressure>=100){engine.snapshot.done=true;engine.snapshot.reason='pressure-burst';engine.snapshot.outcomes[active.id]='failure';this.state.feedback.push({id:`burst:${this.state.tick}`,tick:this.state.tick,kind:'failure',playerId:active.id});}
      if(engine.snapshot.done){this.state.turn++;this.state.pressure=0;this.state.obscuredUntil=0;
        if(this.state.turn>=this.engines.length){this.state.done=true;this.state.turn=this.engines.length-1;}
        else {const next=this.config.players[this.state.turn].id;this.engines[this.state.turn].snapshot.suppress[next]=this.state.held[next].action;}
      }
    }
    return this.status();
  }
  status(){
    const scores:Record<string,number>={},outcomes:Record<string,Outcome>={},roles:Record<string,string>={};
    for(const engine of this.engines){Object.assign(scores,engine.snapshot.scores);Object.assign(outcomes,engine.snapshot.outcomes);}
    for(const p of this.config.players)roles[p.id]=this.mode==='native'?this.engines[0].snapshot.roles[p.id]:this.mode==='race'?'player':p.id===this.config.players[this.state.turn].id?'challenger':'interferer';
    return {tick:this.state.tick,time:this.state.time,scores,outcomes,roles,done:this.state.done,reason:this.state.done?'complete':'',feedback:this.state.feedback??[]};
  }
  observe(id:string){
    const idx=this.config.players.findIndex(p=>p.id===id);if(idx<0)throw new Error('Unknown observer');
    const index=this.mode==='native'?0:this.mode==='race'?idx:this.state.turn,engine=this.engines[index];
    const viewedId=this.mode==='native'?id:this.config.players[index].id;
    const obscured=this.mode==='obstruction'&&this.state.time<this.state.obscuredUntil;
    const observed=engine.observe(viewedId);
    return {...observed,...this.status(),playerId:id,players:this.config.players,game:obscured?null:observed.game,hud:obscured?{}:observed.hud,
      attemptTime:engine.snapshot.time,mode:this.mode==='native'||this.mode==='race'?{kind:this.mode}:{kind:this.mode,active:this.config.players[this.state.turn].id,pressure:this.state.pressure,obscured,by:this.state.by,remaining:Math.max(0,this.state.obscuredUntil-this.state.time)}};
  }
  save(){return {mode:this.mode,config:this.config,state:this.state,engines:this.engines.map(e=>e.save())};}
  restore(saved:ReturnType<ModeEngine['save']>){if(saved.mode!==this.mode||saved.engines.length!==this.engines.length)throw new Error('Mode snapshot mismatch');this.state=JSON.parse(JSON.stringify(saved.state));this.engines.forEach((e,i)=>e.restore(saved.engines[i]));}
}
