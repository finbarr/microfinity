import { defineGame, clamp, colors } from '@microfinity/sdk';
const pieces=[[[0,0],[1,0]],[[0,0],[0,1]],[[0,0],[1,0],[0,1]],[[0,0],[1,0],[1,1]]];
export default defineGame({
  meta:{id:'patchwork-pass',title:'Patchwork Pass',instruction:'Pick a patch, move it, SPACE to stitch!',description:'Take turns stitching a shared quilt. Choose a shape and find a space. Big patches score more.',players:[2,4],clock:'action',participation:'rotating',world:'shared',duration:100,style:'doodle',score:{unit:'stitches',order:'higher'},controls:{directions:true,action:'Choose / Stitch'},tags:['puzzle','turns','placement'],modifiers:[]},
  audio:{music:'main-loop',soundPack:'soft-toy'},
  init(){return {grid:Array(30).fill(-1) as number[],turn:0,turns:0,phase:'choose',piece:0,x:0,y:0,message:'Choose a patch',lastTurn:0};},
  role(s,id){return id===`p${s.turn}`?'stitcher':'waiting';},
  step(s,inputs,ctx){const input=inputs[ctx.players[s.turn].id];let advance=false;
    if(ctx.event==='timeout'){advance=true;s.message='Time up. Pass the quilt!';}
    else for(const edge of input.edges)if(edge.down){
      if(s.phase==='choose'){
        if(edge.button==='left')s.piece=(s.piece+3)%4;if(edge.button==='right')s.piece=(s.piece+1)%4;
        if(edge.button==='action'){s.phase='place';s.message='Move the ghost. SPACE to stitch.';ctx.feedback('select');}
      }else {
        if(edge.button==='left')s.x=clamp(s.x-1,0,5);if(edge.button==='right')s.x=clamp(s.x+1,0,5);if(edge.button==='up')s.y=clamp(s.y-1,0,4);if(edge.button==='down')s.y=clamp(s.y+1,0,4);
        if(edge.button==='action'){
          const cells=pieces[s.piece].map(([x,y])=>[x+s.x,y+s.y]);
          if(cells.every(([x,y])=>x<6&&y<5&&s.grid[y*6+x]<0)){for(const [x,y] of cells)s.grid[y*6+x]=s.turn;ctx.addScore(ctx.players[s.turn].id,cells.length);ctx.feedback('catch',{playerId:ctx.players[s.turn].id});advance=true;break;}
          s.message='That patch will not fit. Try another spot.';ctx.feedback('invalid');
        }
      }
    }
    if(advance){s.turns++;s.turn=(s.turn+1)%ctx.players.length;s.phase='choose';s.x=0;s.y=0;s.lastTurn=ctx.time;ctx.feedback('turn',{playerId:ctx.players[s.turn].id});}
    const anySpace=s.grid.some((c,i)=>c<0&&((i%6<5&&s.grid[i+1]<0)||(i<24&&s.grid[i+6]<0)));
    if(s.turns>=ctx.players.length*4||!anySpace||ctx.time>=99){const best=Math.max(...Object.values(ctx.scores));for(const p of ctx.players)ctx.finishPlayer(p.id,best>0&&ctx.scores[p.id]===best?'success':'failure');ctx.finishRound('quilt-finished');}
  },
  observe(s,id,ctx){return {...s,players:ctx.players,me:id,pieces};},
  hud(v){return {activePlayerId:v.players[v.turn].id,message:v.phase==='choose'?'← → choose a patch · SPACE confirm':v.message,items:[{label:'Phase',value:v.phase==='choose'?'Choose a patch':'Position + stitch'},{label:'Turns',value:v.turns}]};},
  draw(v,g){g.backdrop('paper');
    for(let i=0;i<30;i++){const x=36+(i%6)*48,y=68+Math.floor(i/6)*48;g.rect(x,y,44,44,v.grid[i]<0?'#e8dcc6':colors[v.grid[i]],'#b7a58f',5);if(v.grid[i]>=0){g.line(x+5,y+5,x+39,y+39,'#ffffff66',2);g.line(x+39,y+5,x+5,y+39,'#ffffff66',2);}}
    g.text('PATCH TRAY',462,88,17,'#594d64','center');
    for(let i=0;i<4;i++){const x=378+(i%2)*88,y=120+Math.floor(i/2)*83;if(i===v.piece)g.rect(x-8,y-8,76,70,'#fcf4e6','#594d64',8);for(const [dx,dy] of v.pieces[i])g.rect(x+dx*25,y+dy*25,23,23,colors[v.turn],'#594d64',3);}
    if(v.phase==='place'){g.opacity(.6);for(const [dx,dy] of v.pieces[v.piece])g.rect(36+(v.x+dx)*48,68+(v.y+dy)*48,44,44,colors[v.turn],'#594d64',5);g.opacity(1);}

  }
});
