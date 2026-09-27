import { defineGame, clamp } from '@microfinity/sdk';
export default defineGame({
  meta:{id:'umbrella-panic',title:'Umbrella Panic',instruction:'Catch stars. Dodge the red storm drops!',description:'Same strange weather, separate umbrellas. Race to six points, dodge the red drops, and chase the leader.',players:[1,4],clock:'realtime',participation:'simultaneous',world:'independent',duration:15,style:'doodle',score:{unit:'shelter points',order:'higher'},controls:{directions:true,action:'Cheer'},tags:['catch','dodge','race'],modifiers:[]},
  assets:['umbrella'],audio:{music:'main-loop',soundPack:'lofi-arcade'},
  init(ctx){return {people:ctx.players.map(p=>({id:p.id,x:320,items:[] as {id:number;x:number;y:number;bad:boolean}[],flash:0,cheerUntil:0})),schedule:Array.from({length:22},(_,i)=>({x:ctx.integer(42,598),bad:i%4===3,time:.3+i*.56})),spawned:0,scores:ctx.players.map(()=>0),time:0};},
  step(s,inputs,ctx){s.time=ctx.time;
    while(s.spawned<s.schedule.length&&s.schedule[s.spawned].time<=ctx.time){const e=s.schedule[s.spawned];for(const p of s.people)p.items.push({id:s.spawned,x:e.x,y:20,bad:e.bad});s.spawned++;}
    for(const p of s.people){
      if(inputs[p.id].pressed.action&&ctx.time>=p.cheerUntil){p.cheerUntil=ctx.time+.45;ctx.feedback('cheer',{playerId:p.id,x:p.x,y:280});}
      p.x=clamp(p.x+inputs[p.id].x*370*ctx.dt,35,605);p.flash=Math.max(0,p.flash-ctx.dt);
      for(const item of p.items){item.y+=(135+ctx.difficulty*15)*ctx.dt;if(item.y>=296&&item.y<330&&Math.abs(item.x-p.x)<41){item.y=500;ctx.addScore(p.id,item.bad?-2:1);p.flash=item.bad?.5:0;ctx.feedback(item.bad?'miss':'catch',{playerId:p.id,x:p.x,y:300});}}
      p.items=p.items.filter(i=>i.y<360);
    }
    s.scores=ctx.players.map(p=>ctx.scores[p.id]);
    if(ctx.time>=14.99){for(const p of ctx.players)ctx.finishPlayer(p.id,ctx.scores[p.id]>=6?'success':'failure');ctx.finishRound('storm-passed');}
  },
  observe(s,id,ctx){
    return {...s.people.find(p=>p.id===id)!,time:s.time,players:ctx.players.length,score:s.scores[Number(id.slice(1))],leader:Math.max(...s.scores),place:1+s.scores.filter(score=>score>s.scores[Number(id.slice(1))]).length};
  },
  hud(v){return {message:v.flash>0?'OUCH! Dodge the red storm drops.':'Catch stars. Dodge the red drops.',items:[{label:'Star',value:'+1'},{label:'Storm',value:'−2'},{label:'Target',value:'6 points'},...(v.players>1?[{label:'Place',value:`${v.place} / ${v.players}`},{label:'Leader',value:v.leader}]:[])]};},
  draw(v,g){g.backdrop('rain',v.time);
    for(const item of v.items)if(item.bad){g.circle(item.x,item.y,14,'#fb7185','#fff1f2');g.text('!',item.x,item.y+6,19,'#63273b','center');}else g.actor('star',item.x,item.y,29,'#fde68a');
    const bounce=v.time<v.cheerUntil?Math.sin((v.cheerUntil-v.time)/.45*Math.PI)*10:0;
    g.line(0,354,640,354,'#7184ac',4);
    if(g.hasAsset('umbrella'))g.sprite('umbrella',v.x-36,280-bounce,72,72);else g.actor('umbrella',v.x,323-bounce,62,v.flash>0?'#fb7185':'#c4b5fd');
    if(bounce>0)g.text('GO!',v.x,267-bounce,20,'#fff8e5','center');
    if(v.players>1)g.text(`PLACE ${v.place}/${v.players} · YOU ${v.score} · LEADER ${v.leader}`,320,35,19,'#fff8e5','center');
  }
});
