import { defineGame, colors, timedPress } from '@microfinity/sdk';
export default defineGame({
  meta:{id:'skill-continue',title:'Skill Continue',instruction:'Press SPACE inside the mint zone!',description:'Pass the pulse. Every clean hit speeds up the relay. Rivals can send a little distraction.',players:[2,4],clock:'realtime',participation:'rotating',world:'shared',duration:30,style:'pixel',score:{unit:'clean hits',order:'higher'},controls:{directions:false,action:'Hit / Distract'},tags:['timing','relay','interference'],modifiers:[]},
  audio:{music:'main-loop',soundPack:'pixel-bits'},
  init(ctx){return {turn:0,phase:0,rate:.42+ctx.difficulty*.05,hits:0,lives:ctx.players.map(()=>3),cooldown:ctx.players.map(()=>0),distract:0,by:'',message:'Find the mint zone',messageUntil:0,time:0};},
  role(s,id){return id===`p${s.turn}`?'challenger':s.lives[Number(id.slice(1))]<=0?'eliminated':'interferer';},
  step(s,inputs,ctx){
    const previousPhase=s.phase;s.time=ctx.time;s.phase+=ctx.dt*s.rate;s.distract=Math.max(0,s.distract-ctx.dt);
    // These cues accelerate with the authoritative sweep, independently of music.
    for(const beat of [.35,.65])if(previousPhase<beat&&s.phase>=beat)ctx.feedback('pulse',{sound:{pitch:beat===.35?-5:0,timbre:'sine'}});
    for(let i=0;i<ctx.players.length;i++)if(i!==s.turn&&s.lives[i]>0&&inputs[ctx.players[i].id].pressed.action&&ctx.time>s.cooldown[i]){s.distract=.45;s.by=ctx.players[i].name;s.cooldown[i]=ctx.time+3;ctx.feedback('interference',{playerId:ctx.players[i].id});}
    const active=ctx.players[s.turn],half=Math.max(.09,.15-ctx.difficulty*.015);
    if(inputs[active.id].pressed.action||s.phase>=1){
      const hit=timedPress(inputs[active.id],s.phase,s.rate,.65,half);
      if(hit){s.hits++;ctx.addScore(active.id,1);s.rate=Math.min(1.25,s.rate*1.10);s.message='CLEAN! FASTER!';ctx.feedback('success',{playerId:active.id});}
      else{s.lives[s.turn]--;s.message='OOPS! PASS IT!';ctx.feedback('miss',{playerId:active.id});if(s.lives[s.turn]<=0)ctx.finishPlayer(active.id,'eliminated');}
      s.messageUntil=ctx.time+.5;s.phase=0;
      if(s.lives.filter(n=>n>0).length<=1){for(let i=0;i<ctx.players.length;i++)if(s.lives[i]>0)ctx.finishPlayer(ctx.players[i].id,'success');ctx.finishRound('last-player-standing');return;}
      do{s.turn=(s.turn+1)%ctx.players.length;}while(s.lives[s.turn]<=0);
      ctx.feedback('turn',{playerId:ctx.players[s.turn].id});
    }
    if(ctx.time>=29.9){for(let i=0;i<ctx.players.length;i++)if(s.lives[i]>0)ctx.finishPlayer(ctx.players[i].id,s.hits>0?'success':'failure');ctx.finishRound('relay-complete');}
  },
  observe(s,id,ctx){return {...s,me:id,players:ctx.players,half:Math.max(.09,.15-ctx.difficulty*.015)};},
  hud(v){return {activePlayerId:v.players[v.turn].id,message:v.distract>0?`${v.by}: BOO!`:v.time<v.messageUntil?v.message:'SPACE when the line is in mint',items:v.players.map((p,i)=>({label:p.name.slice(0,24)+' lives',value:Math.max(0,v.lives[i])}))};},
  draw(v,g){g.clear('#18192d');

    g.rect(60,174,520,68,'#2d2e49','#494663',8);g.rect(60+(.65-v.half)*520,178,v.half*1040,60,'#86efac');
    const x=60+g.project(v.phase,v.rate,0,1)*520;g.rect(x-4,161,8,94,'#fff7de');


    if(v.distract>0){g.actor('star',70,100,50,'#f9a8d4');g.actor('star',570,300,50,'#fde047');}
  }
});
