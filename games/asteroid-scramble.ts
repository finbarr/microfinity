import { defineGame, move, distance, colors } from '@microfinity/sdk';
export default defineGame({
  meta:{id:'asteroid-scramble',title:'Asteroid Scramble',instruction:'Move + hold SPACE. Shoot the most rocks!',description:'A tiny cosmic free-for-all. Race your friends to every asteroid in a shared sky.',players:[2,4],clock:'realtime',participation:'simultaneous',world:'shared',duration:18,style:'pixel',score:{unit:'asteroids',order:'higher'},controls:{directions:true,action:'Fire'},tags:['space','shooter','shared'],modifiers:[]},
  assets:['asteroid'],audio:{music:'main-loop',soundPack:'lofi-arcade'},
  init(ctx){return {ships:ctx.players.map((p,i)=>({id:p.id,x:110+i*420/Math.max(1,ctx.players.length-1),y:340,cooldown:0})),rocks:[] as {id:number;x:number;y:number;vx:number;vy:number}[],shots:[] as {id:number;owner:string;x:number;y:number}[],schedule:Array.from({length:36},(_,i)=>({time:i*.43,x:ctx.integer(38,602),vx:ctx.integer(-14,14)})),spawned:0,serial:0,time:0};},
  step(s,inputs,ctx){s.time=ctx.time;
    for(const ship of s.ships){const input=inputs[ship.id];move(ship,input,260,ctx.dt,{x:25,y:210,w:590,h:155});ship.cooldown-=ctx.dt;if((input.held.action||input.pressed.action)&&ship.cooldown<=0){ship.cooldown=.20;s.shots.push({id:s.serial++,owner:ship.id,x:ship.x,y:ship.y-22});ctx.feedback('shot',{playerId:ship.id,x:ship.x,y:ship.y-22});}}
    while(s.spawned<s.schedule.length&&s.schedule[s.spawned].time<=ctx.time){const e=s.schedule[s.spawned];s.rocks.push({id:s.spawned++,x:e.x,y:-24,vx:e.vx,vy:45+ctx.difficulty*8});}
    for(const rock of s.rocks){rock.y+=rock.vy*ctx.dt;rock.x+=rock.vx*ctx.dt;}
    for(const shot of s.shots){shot.y-=510*ctx.dt;for(const rock of s.rocks)if(rock.y<450&&distance(shot,rock)<26){ctx.feedback('hit',{playerId:shot.owner,x:rock.x,y:rock.y,text:'+1'});rock.y=500;shot.y=-100;ctx.addScore(shot.owner,1);break;}}
    s.rocks=s.rocks.filter(r=>r.y<425);s.shots=s.shots.filter(p=>p.y>-35);
    if(ctx.time>=17.99){const best=Math.max(...Object.values(ctx.scores));for(const p of ctx.players)ctx.finishPlayer(p.id,best>0&&ctx.scores[p.id]===best?'success':'failure');ctx.finishRound('space-cleared');}
  },
  observe(s,id){return {ships:s.ships.map(({id,x,y})=>({id,x,y})),rocks:s.rocks,shots:s.shots,time:s.time,me:id};},
  draw(v,g){g.backdrop('space',v.time);
    for(const r of v.rocks){if(g.hasAsset('asteroid'))g.sprite('asteroid',r.x-24,r.y-24,48,48);else g.actor('asteroid',r.x,r.y,48,'#b9a2bd');}
    for(const p of v.shots)g.rect(p.x-2,p.y-8,4,14,colors[Number(p.owner.slice(1))]);
    for(const ship of v.ships){g.actor('ship',ship.x,ship.y,36,colors[Number(ship.id.slice(1))]);if(ship.id===v.me)g.text('YOU',ship.x,ship.y+39,12,'#fff','center');}
  }
});
