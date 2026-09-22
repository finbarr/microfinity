import { defineGame, clamp, colors } from '@microfinity/sdk';
const pieces=[[[0,0],[1,0]],[[0,0],[0,1]],[[0,0],[1,0],[0,1]],[[0,0],[1,0],[1,1]]];
function placement(grid:number[],buttons:number[],piece:number,x:number,y:number){
  const cells=pieces[piece].map(([dx,dy])=>[x+dx,y+dy]);
  const valid=cells.every(([cx,cy])=>cx>=0&&cx<6&&cy>=0&&cy<5&&grid[cy*6+cx]===-1);
  const bonus=valid?cells.filter(([cx,cy])=>buttons.includes(cy*6+cx)).length:0;
  return {cells,valid,bonus,points:valid?cells.length+bonus*2:0};
}
function firstFit(grid:number[],buttons:number[],piece:number){
  for(let y=0;y<5;y++)for(let x=0;x<6;x++)if(placement(grid,buttons,piece,x,y).valid)return {x,y,valid:true};
  return {x:0,y:0,valid:false};
}
function nextPiece(current:number,direction:number,used:number[]){
  for(let n=1;n<=4;n++){const choice=(current+direction*n+16)%4;if(!used.includes(choice))return choice;}
  return current;
}
export default defineGame({
  meta:{id:'patchwork-pass',title:'Patchwork Pass',instruction:'Pick a patch, move its ghost, SPACE to stitch gold buttons!',description:'Pass one quilt around the party. Fit a patch, cover gold buttons for bonus stitches, and claim two quick turns each.',rules:'Players take two turns each on one 6x5 quilt. In choose phase, left/right selects an unused patch and SPACE confirms. A player can use each shape only once. In place phase, directions move the ghost and SPACE stitches when every cell is empty and within the quilt. Green preview fits; red preview is blocked. A patch scores its cell count plus two stitches for each visible gold button it covers. Invalid placement scores nothing and keeps the turn. Most stitches wins. The round also ends after 30 seconds, with no-score rounds failing.',players:[2,4],clock:'action',participation:'rotating',world:'shared',duration:30,style:'doodle',score:{unit:'stitches',order:'higher'},controls:{directions:true,action:'Choose / Stitch'},tags:['puzzle','turns','placement'],modifiers:[]},
  audio:{music:'main-loop',soundPack:'soft-toy'},
  init(ctx){const pool=[2,7,10,14,19,22,27],buttons:number[]=[];for(let i=0;i<5;i++)buttons.push(pool.splice(ctx.integer(0,pool.length-1),1)[0]);
    return {grid:Array(30).fill(-1) as number[],buttons,used:ctx.players.map(()=>[] as number[]),turn:0,turns:0,phase:'choose',piece:0,x:0,y:0,time:0,message:'Choose a patch'};},
  role(s,id){return id===`p${s.turn}`?'stitcher':'waiting';},
  step(s,inputs,ctx){
    s.time=ctx.time;const input=inputs[ctx.players[s.turn].id];let advance=false;
    if(ctx.event==='timeout'){advance=true;s.message='Time up. Pass the quilt!';}
    else for(const edge of input.edges)if(edge.down){
      if(s.phase==='choose'){
        if(edge.button==='left')s.piece=nextPiece(s.piece,-1,s.used[s.turn]);
        if(edge.button==='right')s.piece=nextPiece(s.piece,1,s.used[s.turn]);
        if(edge.button==='action'){
          const fit=firstFit(s.grid,s.buttons,s.piece);s.x=fit.x;s.y=fit.y;s.phase='place';s.message='Move the ghost onto a gold button!';ctx.feedback('select',{playerId:ctx.players[s.turn].id});
        }
      }else{
        if(edge.button==='left')s.x=clamp(s.x-1,0,5);
        if(edge.button==='right')s.x=clamp(s.x+1,0,5);
        if(edge.button==='up')s.y=clamp(s.y-1,0,4);
        if(edge.button==='down')s.y=clamp(s.y+1,0,4);
        if(edge.button==='action'){
          const fit=placement(s.grid,s.buttons,s.piece,s.x,s.y);
          if(fit.valid){
            for(const [cx,cy] of fit.cells)s.grid[cy*6+cx]=s.turn;
            s.used[s.turn].push(s.piece);ctx.addScore(ctx.players[s.turn].id,fit.points);
            ctx.feedback(fit.bonus?'success':'catch',{playerId:ctx.players[s.turn].id,x:36+s.x*48+22,y:68+s.y*48+22,text:`+${fit.points}`});
            advance=true;break;
          }
          s.message='Red ghost: move to an empty space.';ctx.feedback('invalid',{playerId:ctx.players[s.turn].id});
        }
      }
    }
    if(advance){
      s.turns++;s.turn=(s.turn+1)%ctx.players.length;s.phase='choose';s.piece=nextPiece(3,1,s.used[s.turn]);s.x=0;s.y=0;
      ctx.feedback('turn',{playerId:ctx.players[s.turn].id});
    }
    const space=pieces.some((_,piece)=>firstFit(s.grid,s.buttons,piece).valid);
    if(s.turns>=ctx.players.length*2||!space||ctx.time>=29.5){
      const best=Math.max(...Object.values(ctx.scores));
      for(const p of ctx.players)ctx.finishPlayer(p.id,best>0&&ctx.scores[p.id]===best?'success':'failure');
      ctx.finishRound('quilt-finished');
    }
  },
  observe(s,id,ctx){const preview=placement(s.grid,s.buttons,s.piece,s.x,s.y);return {...s,players:ctx.players,me:id,pieces,valid:preview.valid,previewPoints:preview.points,previewBonus:preview.bonus};},
  hud(v){return {activePlayerId:v.players[v.turn].id,message:v.phase==='choose'?'← → pick an unused patch · SPACE position it.':v.valid?'Green fits! SPACE to stitch; gold buttons add 2.':'Red is blocked. Move the ghost to empty cells.',items:[{label:'Turn',value:`${Math.min(v.turns+1,v.players.length*2)} / ${v.players.length*2}`},{label:'Patch value',value:v.phase==='place'?(v.valid?`+${v.previewPoints}`:'Blocked'):`${v.pieces[v.piece].length} + buttons`}]};},
  draw(v,g){
    g.backdrop('paper');
    for(let i=0;i<30;i++){
      const x=36+(i%6)*48,y=68+Math.floor(i/6)*48;
      g.rect(x,y,44,44,v.grid[i]<0?'#e8dcc6':colors[v.grid[i]],'#b7a58f',5);
      if(v.grid[i]>=0){g.line(x+5,y+5,x+39,y+39,'#ffffff66',2);g.line(x+39,y+5,x+5,y+39,'#ffffff66',2);}
      else if(v.buttons.includes(i)){
        g.circle(x+22,y+22,11,'#ffdf64','#6b4b36');
        for(const [dx,dy] of [[-4,-4],[4,-4],[-4,4],[4,4]])g.circle(x+22+dx,y+22+dy,1.7,'#8a5a34');
      }
    }
    for(let i=0;i<4;i++){
      const x=378+(i%2)*88,y=120+Math.floor(i/2)*83;
      if(i===v.piece)g.rect(x-8,y-8,76,70,'#fcf4e6','#594d64',8);
      if(v.used[v.turn].includes(i))g.opacity(.30);
      for(const [dx,dy] of v.pieces[i])g.rect(x+dx*25,y+dy*25,23,23,colors[v.turn],'#594d64',3);
      g.opacity(1);
    }
    if(v.phase==='place'){
      g.opacity(.72);
      for(const [dx,dy] of v.pieces[v.piece]){
        const cx=v.x+dx,cy=v.y+dy;
        if(cx<6&&cy<5){const x=36+cx*48,y=68+cy*48;g.rect(x,y,44,44,v.valid?colors[v.turn]:'#fb7185',v.valid?'#2b9865':'#9f3452',5);}
      }
      g.opacity(1);
      if(v.valid&&v.previewBonus)for(const [dx,dy] of v.pieces[v.piece]){
        const cx=v.x+dx,cy=v.y+dy;
        if(v.buttons.includes(cy*6+cx))g.actor('star',36+cx*48+22,68+cy*48+22,22,'#ffdf64');
      }
    }
  }
});
