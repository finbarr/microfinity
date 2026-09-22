import type {Sandbox} from './sandbox';
import type {Feedback} from '../sdk/index';
export type RecordedRound={mode:string;seed:number;config:any;journal:any[];snapshot:any;status:{tick:number;[key:string]:any}};
export function canonical(value:any):string {return JSON.stringify(value,(_key,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);}
/** Replay only accepted engine events, never provider calls or client score claims. */
export class ReplayRunner {
  status:any;private events:Map<number,any>;
  constructor(readonly vm:Sandbox,readonly round:RecordedRound){this.events=new Map(round.journal.filter(e=>e.event&&Number.isInteger(e.tick)).map(e=>[e.tick,e]));this.reset();}
  reset(){this.status=this.vm.call('init',{seed:this.round.seed,...this.round.config},this.round.mode);return this.status;}
  step(){if(this.status.tick>=this.round.status.tick)return this.status;const event=this.events.get(this.status.tick+1);this.status=this.vm.call('step',event?.edges??{},event?.dt??1/60,event?.event??'tick');return this.status;}
  /** Advance the recorded timeline, including the original waits in turn games. */
  advanceTo(time:number){
    const feedback:Feedback[]=[];
    if(!Number.isFinite(time))return feedback;
    while(this.status.tick<this.round.status.tick&&!this.status.done){
      const next=this.events.get(this.status.tick+1),dt=next?.dt??1/60;
      if(this.status.time+dt>time+1e-9)break;
      this.step();feedback.push(...(this.status.feedback??[]));
    }
    return feedback;
  }
  seek(tick:number){tick=Math.max(0,Math.min(this.round.status.tick,Math.floor(tick)));if(tick<this.status.tick)this.reset();while(this.status.tick<tick&&!this.status.done)this.step();return this.status;}
  observe(playerId:string){return this.vm.call('observe',playerId);}
  verify(){if(this.status.tick!==this.round.status.tick)return null;return canonical(this.vm.call('save'))===canonical(this.round.snapshot);}
}
