import { defineGame, focus, colors } from '@microfinity/sdk';
export default defineGame({
  meta:{id:'cup-shuffle',title:'Cup Shuffle',instruction:'Follow the pea. Choose with ← → + SPACE.',description:'Eyes on the little pea. Watch the cups trade places, then pick its hiding spot.',players:[1,4],clock:'realtime',participation:'simultaneous',world:'shared',duration:28,style:'collage',score:{unit:'peas found',order:'higher'},controls:{directions:true,action:'Choose'},tags:['memory','choice','hidden-info'],modifiers:[]},
  audio:{music:'main-loop',soundPack:'lofi-arcade'},
  init(ctx){return {round:0,phase:'reveal',phaseTime:0,secret:ctx.integer(0,2),cups:[0,1,2],swaps:Array.from({length:3},()=>{const a=ctx.integer(0,2);return [a,(a+ctx.integer(1,2))%3];}),swap:0,cursors:ctx.players.map(()=>1),choices:ctx.players.map(()=>-1),wins:ctx.players.map(()=>0),time:0};},
  role(s,id){return s.phase==='choose'&&s.choices[Number(id.slice(1))]<0?'chooser':'waiting';},
  step(s,inputs,ctx){s.time=ctx.time;s.phaseTime+=ctx.dt;
    if(s.phase==='reveal'&&s.phaseTime>1){s.phase='shuffle';s.phaseTime=0;}
    else if(s.phase==='shuffle'&&s.phaseTime>.7-ctx.difficulty*.08){const [a,b]=s.swaps[s.swap];[s.cups[a],s.cups[b]]=[s.cups[b],s.cups[a]];s.swap++;s.phaseTime=0;if(s.swap>=s.swaps.length){s.phase='choose';ctx.feedback('turn');}}
    else if(s.phase==='choose'){
      for(let i=0;i<ctx.players.length;i++)if(s.choices[i]<0){s.cursors[i]=focus(s.cursors[i],inputs[ctx.players[i].id],3);if(inputs[ctx.players[i].id].pressed.action)s.choices[i]=s.cursors[i];}
      if(s.choices.every(c=>c>=0)||s.phaseTime>=4){for(let i=0;i<ctx.players.length;i++){const correct=s.choices[i]>=0&&s.cups[s.choices[i]]===s.secret;if(correct){s.wins[i]++;ctx.addScore(ctx.players[i].id,1);}ctx.feedback(correct?'success':'failure',{playerId:ctx.players[i].id});}s.phase='result';s.phaseTime=0;}
    }else if(s.phase==='result'&&s.phaseTime>1){
      s.round++;if(s.round>=3){for(let i=0;i<ctx.players.length;i++)ctx.finishPlayer(ctx.players[i].id,s.wins[i]>=2?'success':'failure');ctx.finishRound('three-shuffles');return;}
      s.phase='reveal';s.phaseTime=0;s.secret=ctx.integer(0,2);s.swap=0;s.choices=s.choices.map(()=>-1);s.swaps=Array.from({length:3+ctx.difficulty},()=>{const a=ctx.integer(0,2);return [a,(a+ctx.integer(1,2))%3];});
    }
  },
  observe(s,id,ctx){const mine=Number(id.slice(1)),duration=.7-ctx.difficulty*.08;
    const positions=s.cups.map((cup,i)=>{let x=160+i*160,y=205;if(s.phase==='shuffle'){const [a,b]=s.swaps[s.swap],t=Math.min(1,s.phaseTime/duration);if(i===a||i===b){x=160+(i+(i===a?b-a:a-b)*t)*160;y+=Math.sin(t*Math.PI)*(i===a?-42:42);}}return {id:cup,x,y};});
    return {phase:s.phase,round:s.round,cups:positions,ballX:s.phase==='reveal'||s.phase==='result'?positions.find(c=>c.id===s.secret)!.x:null,cursor:s.cursors[mine],chosen:s.choices[mine]>=0,color:colors[mine],time:s.time};
  },
  hud(v){return {message:v.phase==='reveal'?'Remember this one…':v.phase==='shuffle'?'Follow it!':v.phase==='result'?'There it is!':v.chosen?'Locked in. Waiting for the others…':'Which cup? ← → + SPACE',items:[{label:'Shuffle',value:`${Math.min(v.round+1,3)} / 3`}]};},
  draw(v,g){g.backdrop('stage');

    for(const cup of v.cups){g.circle(cup.x,268,47,'#392942');g.actor('cup',cup.x,cup.y,74,'#f6af84',v.phase==='result'?'surprised':v.phase==='shuffle'?'neutral':'happy',{blink:g.blink(g.time+cup.id*.7)});}
    if(v.ballX!==null)g.circle(v.ballX,266,12,'#a3e635','#527927');
    if(v.phase==='choose'){g.rect(114+v.cursor*160,289,92,7,v.color);}
  }
});
