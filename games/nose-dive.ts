import { defineGame, colors } from '@microfinity/sdk';
const TAU=Math.PI*2;
const gap=(a:number,b:number)=>Math.abs(((a-b+Math.PI)%TAU+TAU)%TAU-Math.PI);
export default defineGame({
  meta:{id:'nose-dive',title:'Nose Dive',instruction:'SPACE when the white spark reaches your colored gate!',description:'A spinning nose and eager fingers. Lead the nostrils, time your launch, and land the most clean picks before it sneezes!',rules:'The nose rotates clockwise. Angle and each hand angle are radians in 0..2pi. The white spark shows where the nostrils will be after finger travel=0.24 seconds; press SPACE as it reaches your colored gate (tolerance=0.33 radians). A press launches one pair of fingers and the result is fixed from the visible angle and speed at launch, with up to 0.15 seconds of input-age compensation. Release between launches. A miss recoils for 0.55 seconds and briefly slows future nose movement, without changing shots already in flight. Each clean pick scores one. Most clean picks after 14 seconds wins; zero picks loses.',players:[2,4],clock:'realtime',participation:'simultaneous',world:'shared',duration:14,style:'cartoon',score:{unit:'clean picks',order:'higher'},controls:{directions:false,action:'Launch fingers'},tags:['timing','party','one-button'],modifiers:[]},
  audio:{music:'main-loop',soundPack:'pixel-bits'},
  init(ctx){return {angle:ctx.random()*TAU,speed:1.7+ctx.difficulty*.2,time:0,slowUntil:0,sneeze:0,travel:.24,tolerance:.33,hands:ctx.players.map((p,i)=>({id:p.id,angle:[TAU-2.55,.59,TAU-.59,2.55][i],launchAt:-10,recoilUntil:0,hitUntil:0,flying:false,good:false,misses:0,picks:0}))};},
  step(s,inputs,ctx){
    s.time=ctx.time;
    s.speed=Math.max(.7,1.7+ctx.difficulty*.2-ctx.time*.05)*(ctx.time<s.slowUntil?.55:1);
    s.angle=(s.angle+s.speed*ctx.dt)%TAU;
    for(const hand of s.hands){
      if(hand.flying&&ctx.time-hand.launchAt>=s.travel){
        hand.flying=false;
        if(hand.good){hand.picks++;hand.hitUntil=ctx.time+.25;hand.recoilUntil=ctx.time+.35;ctx.addScore(hand.id,1);ctx.feedback('success',{playerId:hand.id,x:320+Math.cos(hand.angle)*76,y:200+Math.sin(hand.angle)*76});}
        else{hand.misses++;hand.recoilUntil=ctx.time+.55;s.slowUntil=ctx.time+.20;s.sneeze=ctx.time+.20;ctx.feedback('miss',{playerId:hand.id,x:320+Math.cos(hand.angle)*82,y:200+Math.sin(hand.angle)*82});}
      }
      const input=inputs[hand.id];
      if(!hand.flying&&ctx.time>=hand.recoilUntil&&input.pressed.action){
        const age=Math.max(0,Math.min(.15,input.pressAge?.action??0));
        const pressedAngle=(s.angle-s.speed*age+TAU)%TAU;
        hand.good=gap((pressedAngle+s.speed*s.travel)%TAU,hand.angle)<=s.tolerance;
        hand.flying=true;hand.launchAt=ctx.time;
        ctx.feedback('shot',{playerId:hand.id,x:320+Math.cos(hand.angle)*215,y:200+Math.sin(hand.angle)*215});
      }
    }
    if(ctx.time>=13.9){
      const best=Math.max(...ctx.players.map(p=>ctx.scores[p.id]??0));
      for(const p of ctx.players)ctx.finishPlayer(p.id,best>0&&ctx.scores[p.id]===best?'success':'failure');
      ctx.finishRound(best>0?'nose-picked':'nose-escaped');
    }
  },
  observe(s,id,ctx){return {angle:s.angle,speed:s.speed,time:s.time,slowUntil:s.slowUntil,sneeze:s.sneeze,travel:s.travel,tolerance:s.tolerance,hands:s.hands.map(({good,...hand})=>hand),me:id,players:ctx.players};},
  hud(v){const hand=v.hands.find(h=>h.id===v.me)!;const ready=gap((v.angle+v.speed*v.travel)%TAU,hand.angle)<=v.tolerance;
    return {message:hand.flying?'Fingers flying!':v.time<hand.recoilUntil?'OUCH! Watch for the next opening.':ready?'GATE OPEN! Launch now.':'Launch when the white spark meets your gate.',items:[{label:'Your picks',value:hand.picks},{label:'Misses',value:hand.misses}]};},
  draw(v,g){
    g.clear('#f5cb54');
    for(let i=0;i<16;i++){const a=i*TAU/16;g.path([[320,200],[320+Math.cos(a)*700,200+Math.sin(a)*700],[320+Math.cos(a+.055)*700,200+Math.sin(a+.055)*700]],'#efb84a');}
    g.circle(320,211,96,'#d9943e');g.circle(320,200,93,'#fff0b5','#4c294b');
    const visualAngle=g.project(v.angle,v.speed,0,TAU*2)%TAU,landing=(visualAngle+v.speed*v.travel)%TAU;
    for(const hand of v.hands){
      const i=v.players.findIndex(p=>p.id===hand.id),color=colors[i],ready=gap(landing,hand.angle)<=v.tolerance;
      const dx=Math.cos(hand.angle),dy=Math.sin(hand.angle),gateX=320+dx*145,gateY=200+dy*145;
      for(let mark=-2;mark<=2;mark++){
        const a=hand.angle+mark*v.tolerance/2;
        g.line(320+Math.cos(a)*128,200+Math.sin(a)*128,320+Math.cos(a)*149,200+Math.sin(a)*149,ready?'#fff8d5':color,mark===0?7:4);
      }
      g.circle(gateX,gateY,ready?10:6,ready?'#fff8d5':color,'#4c294b');
      const flight=hand.flying?Math.min(1,(v.time-hand.launchAt)/v.travel):0;
      const recoil=v.time<hand.recoilUntil?Math.max(0,(hand.recoilUntil-v.time)/.55):0;
      const hitReturn=v.time<hand.hitUntil?Math.max(0,(hand.hitUntil-v.time)/.25):0;
      const radius=hand.flying?235-flight*173:235-Math.max(recoil,hitReturn)*173;
      g.line(320+dx*103,200+dy*103,320+dx*245,200+dy*245,'#d8a047',2);
      g.save();g.translate(320+dx*radius,200+dy*radius);g.rotate(hand.angle-Math.PI/2);
      g.rect(-30,39,60,80,color,'#4c294b',9);g.rect(-28,-2,56,63,'#ffc7a1','#4c294b',13);
      for(const x of [-23,5]){g.rect(x,-44,18,65,'#ffc7a1','#4c294b',9);g.rect(x+3,-38,12,16,'#ffe8d5',undefined,6);g.line(x+4,-12,x+14,-12,'#c88978',2);}
      g.line(-20,27,20,27,'#c88978',2);
      if(hand.id===v.me){g.path([[-7,64],[7,64],[0,54]],'#4c294b');g.circle(0,82,5,'#fff9da');}
      g.restore();
      if(v.time<hand.hitUntil)g.actor('star',gateX,gateY,25,'#fff8d5');
    }
    const sparkX=320+Math.cos(landing)*145,sparkY=200+Math.sin(landing)*145;
    g.circle(sparkX,sparkY,16,'#fff8d5','#4c294b');g.actor('star',sparkX,sparkY,17,'#f7a3a3');
    g.save();g.translate(320,200);g.rotate(visualAngle-Math.PI/2);
    g.path([[-20,-67],[20,-67],[36,13],[52,27],[48,53],[20,63],[-20,63],[-48,53],[-52,27],[-36,13]],'#fba5a4','#4c294b');
    g.circle(-27,32,24,'#fba5a4','#4c294b');g.circle(27,32,24,'#fba5a4','#4c294b');g.circle(0,21,34,'#ffb8a9');
    g.circle(-18,48,12,'#4c294b');g.circle(18,48,12,'#4c294b');g.circle(-19,46,5,'#251d36');g.circle(17,46,5,'#251d36');
    g.line(-10,-46,-15,-10,'#ffddbe',7);g.circle(8,10,7,'#ffddbe');g.restore();
    if(v.time<v.sneeze){for(let i=0;i<6;i++){const a=i*TAU/6;g.line(320+Math.cos(a)*100,200+Math.sin(a)*100,320+Math.cos(a)*116,200+Math.sin(a)*116,'#fff8dc',5);}}
  }
});
