import {Sandbox} from '../runtime/sandbox';import {ReplayRunner} from '../runtime/replay';
let runner:ReplayRunner|undefined,vm:Sandbox|undefined,player='p0',position=0;let queue=Promise.resolve();
self.onmessage=event=>{queue=queue.then(async()=>{try{const m=event.data;if(m.type==='load'){vm?.dispose();vm=await Sandbox.create(m.code,m.runtime);runner=new ReplayRunner(vm,m.round);player=m.playerId??'p0';}if(!runner)return;
 let feedback:any[]=[];
 if(m.type==='load')position=0;
 if(m.type==='seek'){runner.seek(m.tick);position=runner.status.time;}
 if(m.type==='advance'){if(!Number.isFinite(m.time))throw new Error('Invalid replay time');position=Math.max(position,Math.min(runner.round.status.time,m.time));feedback=runner.advanceTo(position);}
 if(m.type==='player')player=m.playerId;
 // Seeking and changing view are silent. Only traversed events produce cues.
 self.postMessage({type:'frame',revision:m.revision,requestId:m.requestId,view:runner.observe(player),position,feedback,verified:runner.verify(),atEnd:runner.status.tick>=runner.round.status.tick});
 }catch(e){self.postMessage({type:'error',revision:event.data.revision,requestId:event.data.requestId,message:(e as Error).message});}});};
