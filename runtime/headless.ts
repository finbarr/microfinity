import { Sandbox } from './sandbox';
import { buttonEdges } from './input';
import { colors, emptyButtons, type Buttons } from '../sdk/index';
import type { Mode } from './modes';
export const actionButtons:Buttons[]=Array.from({length:18},(_,index)=>{
  const dir=Math.floor(index/2),[x,y]=[[0,0],[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]][dir];
  return {up:y<0,down:y>0,left:x<0,right:x>0,action:index%2===1};
});
export class HeadlessEnvironment {
  private held:Record<string,Buttons>={};private scores:Record<string,number>={};private decisions=0;private elapsed=0;private deadline=10;
  private status:any;private players:{id:string;name:string;color:string}[]=[];
  readonly meta:any;
  constructor(readonly vm:Sandbox,readonly options:{players?:number;difficulty?:number;mode?:Mode;actionRepeat?:number;maxDecisions?:number}={}){this.meta=vm.call('meta').meta;}
  reset(seed=0){
    const count=this.options.players??this.meta.players[0];this.players=Array.from({length:count},(_,i)=>({id:`p${i}`,name:`Agent ${i}`,color:colors[i]}));this.held=Object.fromEntries(this.players.map(p=>[p.id,emptyButtons()]));this.scores=Object.fromEntries(this.players.map(p=>[p.id,0]));this.decisions=0;this.elapsed=0;this.deadline=10;
    this.status=this.vm.call('init',{seed,difficulty:this.options.difficulty??1,players:this.players},this.options.mode??'native');return this.result();
  }
  step(actions:Record<string,number>){
    if(this.status?.done)throw new Error('Episode ended; reset before stepping');
    const edges:Record<string,any>={};for(const p of this.players){const action=actions[p.id]??0;if(!Number.isInteger(action)||!actionButtons[action])throw new Error('Action must be an integer 0..17');edges[p.id]=buttonEdges(this.held[p.id],actionButtons[action]);this.held[p.id]={...actionButtons[action]};}
    const repeat=this.options.actionRepeat??12;if(!Number.isInteger(repeat)||repeat<1||repeat>60)throw new Error('actionRepeat must be 1..60');
    const oldRoles=this.status.roles;
    if(this.meta.clock==='action'){
      const dt=repeat/60;this.elapsed+=dt;const timeout=this.elapsed>=this.deadline;
      this.status=this.vm.call('step',edges,dt,timeout?'timeout':'input');if(timeout||JSON.stringify(oldRoles)!==JSON.stringify(this.status.roles))this.deadline=this.elapsed+10;
    }else for(let i=0;i<repeat&&!this.status.done;i++)this.status=this.vm.call('step',i===0?edges:{},1/60,'tick');
    this.decisions++;return this.result();
  }
  private result(){
    const observations:Record<string,any>={},rewards:Record<string,number>={},infos:Record<string,any>={};
    for(const p of this.players){const score=this.status.scores[p.id]??0,sign=this.meta.score.order==='lower'?-1:1;observations[p.id]=this.vm.call('observe',p.id);
      rewards[p.id]=(score-(this.scores[p.id]??0))*sign;
      if(this.status.done)rewards[p.id]+=this.status.outcomes[p.id]==='success'?1:this.status.outcomes[p.id]==='failure'?-1:0;
      this.scores[p.id]=score;infos[p.id]={rawScore:score,outcome:this.status.outcomes[p.id]??null,role:this.status.roles[p.id],rewardVersion:'score-delta-plus-terminal-v1',tick:this.status.tick};
    }
    return {observations,rewards,infos,terminated:Boolean(this.status.done),truncated:!this.status.done&&this.decisions>=(this.options.maxDecisions??2000),agents:this.players.map(p=>p.id),roles:this.status.roles};
  }
  snapshot(){return JSON.parse(JSON.stringify({runtime:this.vm.call('save'),held:this.held,scores:this.scores,decisions:this.decisions,elapsed:this.elapsed,deadline:this.deadline,players:this.players,status:this.status}));}
  restore(snapshot:any){this.vm.call('restore',snapshot.runtime);this.held=snapshot.held;this.scores=snapshot.scores;this.decisions=snapshot.decisions;this.elapsed=snapshot.elapsed;this.deadline=snapshot.deadline;this.players=snapshot.players;this.status=snapshot.status;}
  close(){this.vm.dispose();}
}
