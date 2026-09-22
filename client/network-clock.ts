/** Server-measured probe samples use this client's performance.now time base. */
export class ClientClock {
  private offset:number;ready=false;rtt=0;uncertainty=0;
  constructor(private localNow=()=>performance.now()){this.offset=Date.now()-localNow();}
  update(sample:{ready:boolean;offset:number;rtt:number;uncertainty:number}){
    if(!sample.ready||![sample.offset,sample.rtt,sample.uncertainty].every(Number.isFinite))return;
    this.offset=sample.offset;this.ready=true;this.rtt=sample.rtt;this.uncertainty=sample.uncertainty;
  }
  now(){return this.localNow()+this.offset;}
}
