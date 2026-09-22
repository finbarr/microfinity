/** One worker request at a time; skipped display polls retain recorded time. */
export class ReplayClock {
 private anchor=0;private started=0;private rate=1;private serial=0;
 private pending:{id:number;revision:number;sentAt:number}|undefined;
 start(position:number,now:number,rate:number){this.anchor=position;this.started=now;this.rate=rate;}
 reset(){this.pending=undefined;}
 advance(now:number,revision:number){
  if(this.pending){if(now-this.pending.sentAt>1500)throw new Error('The replay exceeded its playback budget. Reopen it to try again.');return null;}
  this.pending={id:++this.serial,revision,sentAt:now};
  return {type:'advance',time:this.anchor+Math.max(0,now-this.started)/1000*this.rate,revision,requestId:this.pending.id};
 }
 acknowledge(message:{revision:number;requestId?:number}){if(message.requestId===this.pending?.id&&message.revision===this.pending?.revision)this.pending=undefined;}
}
