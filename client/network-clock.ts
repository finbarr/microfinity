type ClockSample = {ready:boolean;offset:number;rtt:number;uncertainty:number};
// Corrections change a one-second beat by at most about 53 ms. Input claims
// still use raw performance.now(); the server owns their compensation budget.
export const MAX_CLOCK_SLEW = .05;

/** Server-measured samples use this client's performance.now time base. */
export class ClientClock {
  private offset:number;private target:number;private lastLocal:number;private anchored=false;
  ready=false;rtt=0;uncertainty=0;
  constructor(private localNow=()=>performance.now(),wallNow=()=>Date.now()){
    this.lastLocal=localNow();this.offset=this.target=wallNow()-this.lastLocal;
  }
  /** Call before rendering a state, including the first state after reconnect. */
  observeState(state:{serverTime:number;network?:ClockSample}){
    if(state.network)this.update(state.network);
    // A first snapshot supplies a wall-clock-independent fallback when the
    // probe has not returned yet. Later packets must not re-anchor the clock.
    if(!this.anchored&&Number.isFinite(state.serverTime))this.anchor(state.serverTime-this.localNow());
  }
  update(sample:ClockSample){
    if(!sample.ready||![sample.offset,sample.rtt,sample.uncertainty].every(Number.isFinite)||sample.rtt<0||sample.uncertainty<0)return;
    if(!this.anchored)this.anchor(sample.offset);
    else {this.now();this.target=sample.offset;}
    this.ready=true;this.rtt=sample.rtt;this.uncertainty=sample.uncertainty;
  }
  private anchor(offset:number){this.offset=this.target=offset;this.lastLocal=this.localNow();this.anchored=true;}
  now(){
    const local=this.localNow(),limit=Math.max(0,local-this.lastLocal)*MAX_CLOCK_SLEW;
    this.offset+=Math.max(-limit,Math.min(limit,this.target-this.offset));this.lastLocal=local;
    return local+this.offset;
  }
}
