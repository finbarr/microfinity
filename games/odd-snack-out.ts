import { defineGame, focus } from '@microfinity/sdk';
export default defineGame({
  meta:{id:'odd-snack-out',title:'Odd Snack Out',instruction:'Find the odd face! Directions + SPACE.',description:'One snack has a different number of sprinkles. Spot it before snack time is over.',players:[1,4],clock:'realtime',participation:'simultaneous',world:'independent',duration:22,style:'cartoon',score:{unit:'odd snacks',order:'higher'},controls:{directions:true,action:'Pick'},tags:['recognition','choice','snacks'],modifiers:[]},
  assets:['snack'],audio:{music:'main-loop',soundPack:'lofi-arcade'},
  init(ctx){const answer=ctx.integer(0,5);return {round:0,time:0,elapsed:0,answer,snacks:Array.from({length:6},(_,i)=>({sprinkles:i===answer?2:3})),cursors:ctx.players.map(()=>0),chosen:ctx.players.map(()=>-1),wins:ctx.players.map(()=>0),reveal:false};},
  role(s,id){return s.chosen[Number(id.slice(1))]<0&&!s.reveal?'chooser':'waiting';},
  step(s,inputs,ctx){s.time=ctx.time;s.elapsed+=ctx.dt;
    if(!s.reveal){for(let i=0;i<ctx.players.length;i++)if(s.chosen[i]<0){s.cursors[i]=focus(s.cursors[i],inputs[ctx.players[i].id],6,3);if(inputs[ctx.players[i].id].pressed.action){s.chosen[i]=s.cursors[i];ctx.feedback('select',{playerId:ctx.players[i].id});}}
      if(s.chosen.every(x=>x>=0)||s.elapsed>=4.2){s.reveal=true;s.elapsed=0;for(let i=0;i<ctx.players.length;i++){const hit=s.chosen[i]===s.answer;if(hit){s.wins[i]++;ctx.addScore(ctx.players[i].id,1);}ctx.feedback(hit?'success':'failure',{playerId:ctx.players[i].id});}}
    }else if(s.elapsed>.8){s.round++;if(s.round>=4){for(let i=0;i<ctx.players.length;i++)ctx.finishPlayer(ctx.players[i].id,s.wins[i]>=2?'success':'failure');ctx.finishRound('snack-time');return;}
      s.answer=ctx.integer(0,5);s.snacks=Array.from({length:6},(_,i)=>({sprinkles:i===s.answer?2:3}));s.chosen=s.chosen.map(()=>-1);s.reveal=false;s.elapsed=0;
    }
  },
  observe(s,id){const i=Number(id.slice(1));return {round:s.round,snacks:s.snacks,cursor:s.cursors[i],chosen:s.chosen[i],reveal:s.reveal,answer:s.reveal?s.answer:null};},
  hud(v){return {message:v.reveal?'The odd snack is revealed.':v.chosen>=0?'Locked in.':'Count the sprinkles · Directions + SPACE',items:[{label:'Snack',value:`${Math.min(v.round+1,4)} / 4`}]};},
  draw(v,g){g.clear('#f8dfd7');
    for(let i=0;i<6;i++){const x=160+(i%3)*160,y=143+Math.floor(i/3)*142;
      if(v.cursor===i)g.rect(x-54,y-52,108,113,'#fff5df','#bd5574',18);
      g.actor('snack',x,y,68,'#f4a8a0');g.sprite('snack',x-34,y-35,68,68);
      for(let j=0;j<v.snacks[i].sprinkles;j++)g.circle(x-12+j*12,y-18,3.5,'#7a3f62');
      if(v.reveal&&v.answer===i)g.text('ODD ONE!',x,y+52,14,'#7a3f62','center');
    }

  }
});
