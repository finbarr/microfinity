import { defineGame, colors } from '@microfinity/sdk';
const TAU=Math.PI*2;
const gap=(a:number,b:number)=>Math.abs(((a-b+Math.PI)%TAU+TAU)%TAU-Math.PI);
export default defineGame({
  meta:{id:'nose-dive',title:'Nose Dive',instruction:'SPACE: stick both fingers in!',description:'One spinning nose. Four very eager hands. Lead the nostrils, launch your fingers, and be the first to get a clean pick!',rules:'The nose rotates clockwise: angle and each hand angle are radians in 0..2pi. Press launches fingers from your hand angle; they arrive after travel=0.24 seconds. At arrival the nose angle must match your hand angle within tolerance=0.25 radians. Anticipate rotation during flight. Misses recoil for 0.65 seconds and briefly slow the nose for everyone. Release between launches. First clean pick wins.',players:[2,4],clock:'realtime',participation:'simultaneous',world:'shared',duration:20,style:'cartoon',score:{unit:'pick points',order:'higher'},controls:{directions:false,action:'Launch fingers'},tags:['timing','party','one-button'],modifiers:[]},
  audio:{music:'main-loop',soundPack:'pixel-bits'},
  // All visible angles share the 0..2pi range. Fingers arrive travel seconds after launch.
  init(ctx){return {angle:ctx.random()*TAU,speed:1.7+ctx.difficulty*.2,time:0,slowUntil:0,sneeze:0,winner:'',travel:.24,tolerance:.25,hands:ctx.players.map((p,i)=>({id:p.id,angle:[TAU-2.55,.59,TAU-.59,2.55][i],launchAt:-10,recoilUntil:0,flying:false,misses:0}))};},
  step(s,inputs,ctx){
    s.time=ctx.time;s.speed=Math.max(.7,1.7+ctx.difficulty*.2-ctx.time*.05)*(ctx.time<s.slowUntil?.55:1);s.angle=(s.angle+s.speed*ctx.dt)%TAU;
    const winners:string[]=[];
    for(const hand of s.hands){
      if(hand.flying&&ctx.time-hand.launchAt>=s.travel){
        hand.flying=false;
        if(gap(s.angle,hand.angle)<=s.tolerance){winners.push(hand.id);ctx.setScore(hand.id,100);ctx.feedback('success',{playerId:hand.id,x:320,y:200});}
        else{hand.misses++;hand.recoilUntil=ctx.time+.65;s.slowUntil=ctx.time+.22;s.sneeze=ctx.time+.22;ctx.feedback('miss',{playerId:hand.id,x:320+Math.cos(hand.angle)*65,y:200+Math.sin(hand.angle)*65});}
      }
      if(!hand.flying&&ctx.time>=hand.recoilUntil&&inputs[hand.id].pressed.action){hand.flying=true;hand.launchAt=ctx.time;ctx.feedback('shot',{playerId:hand.id});}
    }
    if(winners.length){s.winner=winners[0];for(const p of ctx.players)ctx.finishPlayer(p.id,winners.includes(p.id)?'success':'failure');ctx.finishRound('clean-pick');}
    else if(ctx.time>=19.9){for(const p of ctx.players)ctx.finishPlayer(p.id,'failure');ctx.finishRound('nose-escaped');}
  },
  observe(s,id,ctx){return {...s,me:id,players:ctx.players};},
  hud(v){const hand=v.hands.find(h=>h.id===v.me)!;return {message:v.winner?'GOT IT!':hand.flying?'INCOMING!':v.time<hand.recoilUntil?'OUCH! Try the next turn.':'Lead the nose. SPACE to pick!',items:[]};},
  draw(v,g){
    g.clear('#f5cb54');
    for(let i=0;i<20;i++){const a=i*TAU/20;g.path([[320,200],[320+Math.cos(a)*700,200+Math.sin(a)*700],[320+Math.cos(a+.08)*700,200+Math.sin(a+.08)*700]],'#efb84a');}
    g.circle(320,211,96,'#d9943e');g.circle(320,200,93,'#fff0b5','#4c294b');
    for(const hand of v.hands){const i=v.players.findIndex(p=>p.id===hand.id),color=colors[i];
      const progress=hand.flying?Math.min(1,(v.time-hand.launchAt)/v.travel):v.time<hand.recoilUntil?Math.max(0,(hand.recoilUntil-v.time)/.65):0;
      const radius=hand.flying?235-progress*173:v.time<hand.recoilUntil?235-progress*173:235;
      const dx=Math.cos(hand.angle),dy=Math.sin(hand.angle);
      g.line(320+dx*102,200+dy*102,320+dx*245,200+dy*245,'#d8a047',2);
      g.save();g.translate(320+dx*radius,200+dy*radius);g.rotate(hand.angle-Math.PI/2);
      // Two fingers, nails, knuckles and a colored cuff, all pointing inward.
      g.rect(-30,39,60,80,color,'#4c294b',9);g.rect(-28,-2,56,63,'#ffc7a1','#4c294b',13);
      for(const x of [-23,5]){g.rect(x,-44,18,65,'#ffc7a1','#4c294b',9);g.rect(x+3,-38,12,16,'#ffe8d5',undefined,6);g.line(x+4,-12,x+14,-12,'#c88978',2);}
      g.line(-20,27,20,27,'#c88978',2);
      if(hand.id===v.me){g.path([[-7,64],[7,64],[0,54]],'#4c294b');g.circle(0,82,5,'#fff9da');}
      g.restore();
    }
    g.save();g.translate(320,200);g.rotate(g.project(v.angle,v.speed,0,TAU)-Math.PI/2);
    g.path([[-20,-67],[20,-67],[36,13],[52,27],[48,53],[20,63],[-20,63],[-48,53],[-52,27],[-36,13]],'#fba5a4','#4c294b');
    g.circle(-27,32,24,'#fba5a4','#4c294b');g.circle(27,32,24,'#fba5a4','#4c294b');g.circle(0,21,34,'#ffb8a9');
    g.circle(-18,48,12,'#4c294b');g.circle(18,48,12,'#4c294b');g.circle(-19,46,5,'#251d36');g.circle(17,46,5,'#251d36');
    g.line(-10,-46,-15,-10,'#ffddbe',7);g.circle(8,10,7,'#ffddbe');g.restore();
    if(v.time<v.sneeze){for(let i=0;i<6;i++){const a=i*TAU/6;g.line(320+Math.cos(a)*100,200+Math.sin(a)*100,320+Math.cos(a)*116,200+Math.sin(a)*116,'#fff8dc',5);}}
  }
});
