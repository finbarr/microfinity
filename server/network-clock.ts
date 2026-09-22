import {randomBytes} from 'node:crypto';

/** Wall-compatible monotonic time: changing the OS clock cannot move a round. */
export const serverNow=()=>performance.timeOrigin+performance.now();
export const MAX_COMPENSATION_MS=150;
type Sample={at:number;offset:number;rtt:number};
export class NetworkClock {
  private pending?:{id:string;at:number};private samples:Sample[]=[];private next=0;private lastClaim=-Infinity;
  metrics={samples:0,invalidSamples:0,acceptedInputs:0,untimedInputs:0,staleInputs:0,futureInputs:0,backwardsInputs:0,compensatedInputs:0,maxAgeMs:0};
  probe(now:number){
    if(now<this.next||this.pending&&now-this.pending.at<2500)return;
    this.pending={id:randomBytes(8).toString('hex'),at:now};this.next=now+(this.samples.length<4?500:2000);
    return {type:'clock-probe',id:this.pending.id};
  }
  accept(id:unknown,clientTime:unknown,now:number){
    if(!this.pending||id!==this.pending.id||typeof clientTime!=='number'||!Number.isFinite(clientTime)||clientTime<0){this.metrics.invalidSamples++;return;}
    const pending=this.pending;this.pending=undefined;const rtt=now-pending.at;
    if(rtt<0||rtt>2500){this.metrics.invalidSamples++;return;}
    this.samples=this.samples.filter(s=>now-s.at<20000);this.samples.push({at:now,offset:(pending.at+now)/2-clientTime,rtt});if(this.samples.length>12)this.samples.shift();this.metrics.samples++;
    return {type:'clock',sampleRtt:rtt,...this.estimate(now)};
  }
  estimate(now:number){
    const samples=this.samples.filter(s=>now-s.at<20000).sort((a,b)=>a.rtt-b.rtt),best=samples[0];
    if(!best)return {ready:false,offset:0,rtt:0,uncertainty:0,budget:0};
    // The lowest RTT resists queueing spikes. Half RTT is an uncertainty bound,
    // not a claim that the forward and return paths are exactly symmetrical.
    const jitter=samples.length>1?Math.min(50,(samples.at(-1)!.rtt-best.rtt)/2):0;
    return {ready:true,offset:best.offset,rtt:best.rtt,uncertainty:best.rtt/2,budget:Math.min(MAX_COMPENSATION_MS,best.rtt/2+jitter+25)};
  }
  input(clientTime:unknown,now:number){
    const clock=this.estimate(now);
    if(clientTime===undefined||!clock.ready){this.metrics.untimedInputs++;return {accepted:true,at:now,ageMs:0,reason:'unsynchronized'};}
    if(typeof clientTime!=='number'||!Number.isFinite(clientTime)){this.metrics.staleInputs++;return {accepted:false,at:now,ageMs:0,reason:'invalid-time'};}
    if(clientTime<this.lastClaim){this.metrics.backwardsInputs++;return {accepted:false,at:now,ageMs:0,reason:'backwards-time'};}
    const age=now-(clientTime+clock.offset);
    if(age>clock.budget){this.metrics.staleInputs++;return {accepted:false,at:now,ageMs:0,reason:'late'};}
    if(age < -25){this.metrics.futureInputs++;return {accepted:false,at:now,ageMs:0,reason:'future'};}
    this.lastClaim=clientTime;this.metrics.acceptedInputs++;const ageMs=Math.max(0,age);
    if(ageMs>0)this.metrics.compensatedInputs++;this.metrics.maxAgeMs=Math.max(this.metrics.maxAgeMs,ageMs);
    return {accepted:true,at:now-ageMs,ageMs,reason:'accepted'};
  }
}
