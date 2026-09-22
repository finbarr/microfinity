import { defineGame, clamp, colors } from '@microfinity/sdk';
export default defineGame({
  meta:{id:'conveyor-clash',title:'Conveyor Clash',instruction:'Collector: catch boxes. Rivals: switch lanes!',description:'One collector, a room full of mischievous operators. Everyone gets a shift.',players:[2,4],clock:'realtime',participation:'rotating',world:'shared',duration:36,style:'collage',score:{unit:'deliveries',order:'higher'},controls:{directions:true,action:'Switch lane'},tags:['roles','interference','factory'],modifiers:[]},
  audio:{music:'main-loop',soundPack:'lofi-arcade'},
  init(ctx){return {turn:0,shift:0,elapsed:0,x:320,parcels:[] as {id:number;lane:number;y:number;bad:boolean;switched:boolean}[],schedule:Array.from({length:13},(_,i)=>({time:.1+i*.5,lane:ctx.integer(0,2),bad:i%5===4})),spawned:0,lanes:ctx.players.map(()=>1),cooldowns:ctx.players.map(()=>0),message:'',messageUntil:0,time:0};},
  role(s,id){return id===`p${s.turn}`?'collector':'operator';},
  step(s,inputs,ctx){s.time=ctx.time;s.elapsed+=ctx.dt;const collector=ctx.players[s.turn];s.x=clamp(s.x+inputs[collector.id].x*390*ctx.dt,95,545);
    while(s.spawned<s.schedule.length&&s.schedule[s.spawned].time<=s.elapsed){const e=s.schedule[s.spawned];s.parcels.push({id:s.shift*100+s.spawned++,lane:e.lane,y:40,bad:e.bad,switched:false});}
    for(let i=0;i<ctx.players.length;i++)if(i!==s.turn){const input=inputs[ctx.players[i].id];if(input.pressed.left)s.lanes[i]=(s.lanes[i]+2)%3;if(input.pressed.right)s.lanes[i]=(s.lanes[i]+1)%3;
      if(input.pressed.action&&ctx.time>=s.cooldowns[i]){const parcel=s.parcels.find(p=>p.lane===s.lanes[i]&&!p.switched&&p.y<230);if(parcel){parcel.lane=(parcel.lane+1)%3;parcel.switched=true;s.cooldowns[i]=ctx.time+2;s.message=`${ctx.players[i].name} switched a parcel!`;s.messageUntil=ctx.time+.8;ctx.feedback('interference',{playerId:ctx.players[i].id});}}
    }
    for(const p of s.parcels){p.y+=(120+ctx.difficulty*12)*ctx.dt;if(p.y>=306&&p.y<342&&Math.abs((160+p.lane*160)-s.x)<48){p.y=500;ctx.addScore(collector.id,p.bad?-1:1);ctx.feedback(p.bad?'miss':'catch',{playerId:collector.id,x:s.x,y:315});}}
    s.parcels=s.parcels.filter(p=>p.y<355);
    if(s.elapsed>=8){s.shift++;if(s.shift>=ctx.players.length){const best=Math.max(...Object.values(ctx.scores));for(const p of ctx.players)ctx.finishPlayer(p.id,best>0&&ctx.scores[p.id]===best?'success':'failure');ctx.finishRound('all-shifts-finished');return;}s.turn=(s.turn+1)%ctx.players.length;s.elapsed=0;s.x=320;s.spawned=0;s.parcels=[];ctx.feedback('turn',{playerId:ctx.players[s.turn].id});}
  },
  observe(s,id,ctx){return {turn:s.turn,elapsed:s.elapsed,x:s.x,parcels:s.parcels,lanes:s.lanes,cooldowns:s.cooldowns,message:ctx.time<s.messageUntil?s.message:'',time:s.time,players:ctx.players,me:id};},
  hud(v){return {activePlayerId:v.players[v.turn].id,message:v.message||(v.me===v.players[v.turn].id?'Catch boxes. Avoid red.':'← → select lane · SPACE switch'),items:[{label:'Shift',value:`${v.turn+1} / ${v.players.length}`}]};},
  draw(v,g){g.backdrop('factory',v.time);
    for(let lane=0;lane<3;lane++){const x=160+lane*160;g.rect(x-46,48,92,288,'#61766a','#96a08b',9);for(let j=0;j<9;j++)g.line(x-38,52+(j*33+v.time*45)%279,x+38,52+(j*33+v.time*45)%279,'#3b5148',3);}
    for(const p of v.parcels){g.actor('parcel',160+p.lane*160,p.y,34,p.bad?'#fb7185':'#fcd99a');if(p.bad)g.text('!',160+p.lane*160,p.y+7,20,'#5c2338','center');}
    g.actor('hand',v.x,340,62,colors[v.turn]);
    const mine=Number(v.me.slice(1));if(mine!==v.turn){g.rect(116+v.lanes[mine]*160,51,88,5,colors[mine]);}

  }
});
