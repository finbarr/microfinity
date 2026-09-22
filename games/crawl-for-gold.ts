import { defineGame, colors, timedPress } from '@microfinity/sdk';
const reachTargets=[.62,.73,.56,.68,.60,.72,.64];
export default defineGame({
  meta:{id:'crawl-for-gold',title:'Crawl for Gold',instruction:'Press SPACE in green, hold through the pull, then release!',description:'Tiny crawlers race for one shiny prize. Time the reach, keep your grip through the pull, and let go for another stride!',rules:'Race seven strides to the trophy. Each reach has a visible marker and green timing zone. The reach phase is 0..1 and the target shifts slightly after each successful stride; each crawler exposes its current target, phase and rate. Press SPACE inside target +/- half=0.15, then keep it held for holdSeconds=0.30 to move a stride. Release after the pull to start the next reach. Early/late presses and premature releases stumble for 0.35 seconds. Holding forever and mashing do not advance. First to seven strides wins; same-tick finishers tie. The round times out after 20 seconds.',players:[2,4],clock:'realtime',participation:'simultaneous',world:'shared',duration:20,style:'cartoon',score:{unit:'distance',order:'higher'},controls:{directions:false,action:'Grip / Hold to pull'},tags:['timing','race','hold-release','one-button'],modifiers:[]},
  audio:{music:'main-loop',soundPack:'pixel-bits'},
  init(ctx){return {time:0,winner:'',half:.15,holdSeconds:.30,goal:7,crawlers:ctx.players.map(p=>({id:p.id,phase:0,rate:.63+ctx.difficulty*.035,target:reachTargets[0],strides:0,stage:'reach',until:0,pullStarted:0,message:'Reach…',flashUntil:0}))};},
  step(s,inputs,ctx){
    s.time=ctx.time;const winners:string[]=[];
    for(const c of s.crawlers){const input=inputs[c.id];
      if(c.stage==='stumble'){if(ctx.time>=c.until&&!input.held.action){c.stage='reach';c.phase=0;c.message='Reach…';}continue;}
      if(c.stage==='recover'){if(!input.held.action){c.stage='reach';c.phase=0;c.message='Reach…';}continue;}
      if(c.stage==='pull'){
        if(!input.held.action){c.stage='stumble';c.until=ctx.time+.35;c.message='Grip slipped! Hold through the pull.';ctx.feedback('miss',{playerId:c.id});}
        else if(ctx.time-c.pullStarted>=s.holdSeconds){
          c.strides++;ctx.setScore(c.id,c.strides*100);c.stage='recover';c.message='Release for the next reach!';c.flashUntil=ctx.time+.30;
          c.rate+=.018;c.target=reachTargets[c.strides%reachTargets.length];
          ctx.feedback('success',{playerId:c.id,x:65+c.strides*61,y:115+280*(ctx.players.findIndex(p=>p.id===c.id)+.5)/ctx.players.length});
          if(c.strides>=s.goal)winners.push(c.id);
        }
        continue;
      }
      c.phase=(c.phase+c.rate*ctx.dt)%1;
      if(input.pressed.action){
        if(timedPress(input,c.phase,c.rate,c.target,s.half)&&input.held.action){c.stage='pull';c.pullStarted=ctx.time;c.message='HOLD!';ctx.feedback('hit',{playerId:c.id});}
        else{const age=Math.max(0,Math.min(.15,input.pressAge?.action??0));c.stage='stumble';c.until=ctx.time+.35;c.message=c.phase-c.rate*age<c.target?'Too early! Watch the green zone.':'Too late! Catch the next reach.';ctx.feedback('miss',{playerId:c.id});}
      }
    }
    if(winners.length){s.winner=winners[0];for(const p of ctx.players)ctx.finishPlayer(p.id,winners.includes(p.id)?'success':'failure');ctx.finishRound('trophy-grabbed');}
    else if(ctx.time>=19.9){for(const p of ctx.players)ctx.finishPlayer(p.id,'failure');ctx.finishRound('race-timeout');}
  },
  observe(s,id,ctx){const mine=s.crawlers.find(c=>c.id===id)!;return {...s,target:mine.target,me:id,players:ctx.players};},
  hud(v){const c=v.crawlers.find(c=>c.id===v.me)!;return {message:v.winner?'GOLD!':c.stage==='reach'?'Press in green, hold through the pull, release.':c.message,items:[{label:'Your strides',value:`${c.strides} / ${v.goal}`}]};},
  draw(v,g){
    g.clear('#cce6ed');g.circle(570,35,65,'#fff0a6');
    for(let i=0;i<9;i++){g.circle(20+i*86,52+(i%3)*9,30,'#e9f5f1');g.rect(i*86-10,65,75,20,'#e9f5f1');}
    const mine=v.crawlers.find(c=>c.id===v.me)!,phase=g.project(mine.phase,mine.stage==='reach'?mine.rate:0,0,2)%1;
    g.rect(174,22,292,32,'#4c294b','#fff8dc',8);g.rect(180,28,280,20,'#393b58');
    if(mine.stage==='reach'){
      g.rect(180+(mine.target-v.half)*280,28,v.half*560,20,'#65dc98');
      g.rect(180+phase*280-3,24,6,28,Math.abs(phase-mine.target)<=v.half?'#fff8dc':'#fba5a4');
    }else if(mine.stage==='pull'){
      const pull=Math.min(1,(v.time-mine.pullStarted)/v.holdSeconds);
      g.rect(180,28,280*pull,20,'#65dc98');g.circle(180+280*pull,38,8,'#fff8dc','#4c294b');
    }else if(mine.stage==='recover')g.rect(180,28,280,20,'#65dc98');
    else g.rect(180,28,280,20,'#fb7185');
    g.rect(0,85,640,315,'#efd29c');
    const lane=280/v.players.length;
    for(let i=0;i<v.players.length;i++){
      const c=v.crawlers[i],y=110+i*lane+lane*.5,color=colors[i];
      g.rect(0,y-28,640,52,i%2?'#eac28c':'#f8dcac');g.line(0,y+27,640,y+27,'#c69369',2);
      if(c.id===v.me)g.line(0,y-29,640,y-29,color,4);
      for(let j=0;j<7;j++)g.line(100+j*58,y+22,100+j*58,y+27,'#bc9366',2);
      for(let j=0;j<4;j++){g.rect(550+(j%2)*8,y-27+Math.floor(j/2)*27,8,27,'#644655');g.rect(550+(1-j%2)*8,y-27+Math.floor(j/2)*27,8,27,'#fff8dc');}
      const pull=c.stage==='pull'?Math.min(1,(v.time-c.pullStarted)/v.holdSeconds):0,x=65+(c.strides+pull)*61;
      const reachPhase=c.stage==='reach'?g.project(c.phase,c.rate,0,2)%1:c.phase;
      const extension=c.stage==='reach'?Math.max(0,1-Math.abs(reachPhase-c.target)/.5):c.stage==='pull'?1-pull:.1;
      const ready=c.stage==='reach'&&Math.abs(reachPhase-c.target)<=v.half;
      g.circle(x-8,y+22,26,'#d6af80');g.line(x-15,y+4,x-32,y+13,'#4c294b',12);g.line(x-32,y+13,x-45,y+11,color,9);
      g.rect(x-24,y-13,39,29,color,'#4c294b',12);g.rect(x-29,y-10,13,24,'#fff4da','#4c294b',4);
      g.line(x+3,y+4,x+22+extension*26,y+16,'#4c294b',10);g.line(x+3,y+4,x+22+extension*26,y+16,'#ffc7a1',6);
      if(ready)g.circle(x+24+extension*26,y+15,14,'#65dc98','#4c294b');
      g.circle(x+24+extension*26,y+15,7,ready?'#fff8dc':'#ffc7a1','#4c294b');
      g.circle(x+14,y-17,17,'#ffc7a1','#4c294b');g.path([[x+1,y-30],[x+12,y-38],[x+18,y-31]],color,'#4c294b');
      g.circle(x+21,y-19,2.6,'#4c294b');g.line(x+19,y-7,x+26,y-8,'#4c294b',2);g.circle(x+8,y-11,3,'#f18c8e');
      if(c.id===v.me)g.path([[x-13,y-48],[x+1,y-48],[x-6,y-39]],'#4c294b');
      if(c.stage==='stumble'){g.line(x+20,y-22,x+26,y-16,'#4c294b',2);g.line(x+26,y-22,x+20,y-16,'#4c294b',2);}
      if(v.time<c.flashUntil)g.actor('star',x-16,y-34,20,'#fff8dc');
      g.save();g.translate(597,y);g.circle(-13,-13,10,'#edb845','#6b4b36');g.circle(13,-13,10,'#edb845','#6b4b36');g.path([[-14,-26],[14,-26],[10,-6],[0,2],[-10,-6]],'#ffdf64','#6b4b36');g.rect(-3,0,6,12,'#edb845');g.rect(-14,12,28,6,'#6b4b36');g.restore();
    }
  }
});
