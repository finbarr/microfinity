import type {Feedback,Metadata} from '../sdk/index';

type Burst={event:Feedback;started:number;seed:number};
const palettes:Record<string,string>={hit:'#fde68a',catch:'#86efac',pickup:'#86efac',shot:'#e0f2fe',jump:'#e0f2fe',miss:'#fda4af',invalid:'#fda4af',confirm:'#c4b5fd',select:'#c4b5fd',success:'#86efac',failure:'#fda4af',interference:'#c4b5fd'};
const lifetime=480;
const seedOf=(id:string)=>{let n=2166136261;for(let i=0;i<id.length;i++)n=Math.imul(n^id.charCodeAt(i),16777619);return n>>>0;};

/** Presentation only. No RNG, scores, rules, or cartridge state are advanced. */
export class FeedbackEffects {
  private bursts:Burst[]=[];private seen=new Set<string>();private scope='';
  reset(scope=''){if(scope===this.scope)return;this.scope=scope;this.bursts=[];this.seen.clear();}
  clear(){this.bursts=[];}
  add(events:Feedback[],now:number,visible=true){
    for(const event of events.slice(0,64)){
      if(this.seen.has(event.id))continue;
      this.seen.add(event.id);if(this.seen.size>2048)this.seen.delete(this.seen.values().next().value!);
      // Remember hidden/dropped events so they cannot flash later on resume.
      if(!visible||!Object.hasOwn(palettes,event.kind)||!Number.isFinite(event.x)||!Number.isFinite(event.y)||event.x!<0||event.x!>640||event.y!<0||event.y!>400)continue;
      this.bursts.push({event:{...event,text:event.text?.slice(0,12)},started:now,seed:seedOf(event.id)});
    }
    this.bursts=this.bursts.filter(b=>now-b.started<lifetime).slice(-24);
  }
  frame(now:number,meta:Pick<Metadata,'world'|'style'>,view:any,reducedMotion=false){
    this.bursts=this.bursts.filter(b=>now-b.started<lifetime);
    if(reducedMotion||!view||view.game===null)return [];
    const ownWorld=view.mode?.kind==='race'||meta.world==='independent';
    return this.bursts.filter(b=>!ownWorld||b.event.playerId===view.playerId).filter(b=>!view.mode?.active||!b.event.playerId||b.event.playerId===view.mode.active).map(b=>({
      ...b,age:Math.max(0,now-b.started)/lifetime,color:palettes[b.event.kind],pixel:meta.style==='pixel',
    }));
  }
}

/** Draw after the cartridge frame; effects cannot spend its command allowance. */
export function drawFeedback(canvas:HTMLCanvasElement,bursts:ReturnType<FeedbackEffects['frame']>){
  if(!bursts.length)return;const g=canvas.getContext('2d');if(!g)return;
  g.save();try{
    g.resetTransform();g.beginPath();g.rect(0,0,640,400);g.clip();g.lineWidth=2;
    for(const {event,seed,age,color,pixel} of bursts){
      const x=event.x!,y=event.y!,fade=(1-age)*(1-age),count=event.kind==='shot'?3:6;
      g.globalAlpha=fade;g.fillStyle=color;g.strokeStyle=color;
      for(let i=0;i<count;i++){
        const angle=(seed%628)/100+i*Math.PI*2/count,distance=4+age*(event.kind==='shot'?14:27);
        const px=x+Math.cos(angle)*distance,py=y+Math.sin(angle)*distance+age*age*9,size=2+(i%2);
        if(pixel)g.fillRect(Math.round(px),Math.round(py),size,size);
        else{g.beginPath();g.arc(px,py,size,0,Math.PI*2);g.fill();}
      }
      // Only display explicitly supplied score/reaction text; never invent points.
      if(event.text){
        g.font='800 19px system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=4;g.strokeStyle='#25213b';
        const tx=Math.max(72,Math.min(568,x)),ty=Math.max(18,Math.min(380,y-20-age*12));
        g.strokeText(event.text,tx,ty);g.fillText(event.text,tx,ty);
      }
    }
  }finally{g.restore();}
}
