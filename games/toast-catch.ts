import { defineGame, clamp } from '@microfinity/sdk';
export default defineGame({
  meta:{id:'toast-catch',title:'Toast Catch',instruction:'Catch the toast! Move with ← →',description:'Breakfast has escaped. Catch six golden slices before they hit the floor.',players:[1,1],clock:'realtime',participation:'individual',world:'shared',duration:12,style:'cartoon',score:{unit:'slices',order:'higher'},controls:{directions:true,action:'Cheer'},tags:['catch','movement','breakfast'],modifiers:['race','obstruction','pressure']},
  assets:['toast'],audio:{music:'main-loop',soundPack:'lofi-arcade'},
  init(ctx){return {x:320,slices:[] as {id:number;x:number;y:number;vy:number}[],schedule:Array.from({length:12},(_,i)=>({time:0.5+i*0.85,x:ctx.integer(70,570)})),spawned:0,caught:0,missed:0,flash:0,time:0};},
  step(s,inputs,ctx){
    const id=ctx.players[0].id,input=inputs[id];s.time=ctx.time;s.flash=Math.max(0,s.flash-ctx.dt);
    s.x=clamp(s.x+input.x*400*ctx.dt,36,604);
    while(s.spawned<s.schedule.length&&s.schedule[s.spawned].time<=ctx.time){const e=s.schedule[s.spawned];s.slices.push({id:s.spawned++,x:e.x,y:25,vy:125+ctx.difficulty*20});}
    for(const slice of s.slices){slice.y+=slice.vy*ctx.dt;
      if(slice.y>=300&&slice.y<340&&Math.abs(slice.x-s.x)<43){slice.y=500;s.caught++;s.flash=.22;ctx.addScore(id,1);ctx.feedback('catch',{playerId:id,x:s.x,y:300});}
      else if(slice.y>=340&&slice.y<500){slice.y=500;s.missed++;ctx.feedback('miss',{playerId:id,x:slice.x,y:338});}
    }
    s.slices=s.slices.filter(t=>t.y<400);
    if(ctx.time>=11.9){ctx.finishPlayer(id,s.caught>=6?'success':'failure');ctx.finishRound(s.caught>=6?'breakfast-saved':'toast-on-floor');}
  },
  observe(s,_id){return {x:s.x,slices:s.slices,caught:s.caught,missed:s.missed,flash:s.flash,time:s.time};},
  hud(v){return {message:v.flash>0?'YUM!':'Catch six slices to save breakfast.',items:[{label:'Saved',value:`${v.caught} / 6`},{label:'Missed',value:v.missed}]};},
  draw(v,g){g.backdrop('kitchen',v.time);
    for(const t of v.slices){if(g.hasAsset('toast'))g.sprite('toast',t.x-20,t.y-22,40,44);else g.actor('toast',t.x,t.y,38);}
    g.actor('hand',v.x,324,54,'#f5ad87','happy',{pose:g.motion('squash',v.flash>0?.22-v.flash:-1)});

  }
});
