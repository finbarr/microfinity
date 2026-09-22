import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile,bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {ReplayRunner,canonical} from '../runtime/replay';
import {scriptedDecision} from '../server/controllers';
import {buttonEdges} from '../runtime/input';
import {colors,emptyButtons,type Buttons} from '../sdk/index';

const players=(count:number)=>Array.from({length:count},(_,i)=>({id:`p${i}`,name:`Player ${i+1}`,color:colors[i]}));
const names=['asteroid-scramble','conveyor-clash','crawl-for-gold','cup-shuffle','nose-dive','odd-snack-out','patchwork-pass','skill-continue','toast-catch','umbrella-panic'];

test('all ten reference cartridges execute for 1–4 participants and reproduce their complete recordings',async t=>{
  const runtime=await bootstrap();
  for(const name of names)await t.test(name,async()=>{
    const code=await compile(await readFile(`games/${name}.ts`,'utf8'));
    const live=await Sandbox.create(code,runtime),replayed=await Sandbox.create(code,runtime);
    try{
      const meta=live.call('meta').meta;
      for(const count of [1,2,3,4]){
        const config={difficulty:1,players:players(count)},seed=71,journal:any[]=[];
        const held:Record<string,Buttons>=Object.fromEntries(config.players.map(p=>[p.id,emptyButtons()]));
        let status=live.call('init',{seed,...config},'party-v1');
        const limit=meta.clock==='action'?Math.ceil(meta.duration)+1:Math.ceil(meta.duration*60)+2;
        while(!status.done&&status.tick<limit){
          const edges:Record<string,any>={};
          if(meta.clock==='action'||status.tick%12===0)for(const p of config.players){
            const view=live.call('observe',p.id);
            assert.equal(view.playerId,p.id);assert.ok(Number.isFinite(view.scores[p.id]));
            const buttons=scriptedDecision(meta,view,held[p.id],status.tick).buttons;
            const changed=buttonEdges(held[p.id],buttons);held[p.id]=buttons;if(changed.length)edges[p.id]=changed;
            if(status.tick===0||status.tick%120===0)live.call('draw',view.game);
          }
          const dt=meta.clock==='action'?1:1/60,event=meta.clock==='action'?(status.tick%10===9?'timeout':'input'):'tick';
          if(Object.keys(edges).length||meta.clock==='action')journal.push({tick:status.tick+1,dt,event,edges});
          status=live.call('step',edges,dt,event);
        }
        assert.equal(status.done,true,`${name}/${count} must finish its actual rules`);
        assert.deepEqual(Object.keys(status.scores),config.players.map(p=>p.id));
        assert.deepEqual(Object.keys(status.outcomes),config.players.map(p=>p.id));
        assert.ok(Object.values(status.scores).every(Number.isFinite));
        const snapshot=live.call('save');
        if(count>=meta.players[0]&&count<=meta.players[1]&&meta.participation!=='individual')assert.equal(snapshot.worlds.length,1,'authored shared interactions use one native world');
        for(const p of config.players)live.call('draw',live.call('observe',p.id).game);
        const replay=new ReplayRunner(replayed,{mode:'party-v1',seed,config,journal,snapshot,status});
        replay.seek(Math.floor(status.tick/2));const checkpoint=replayed.call('save');
        replay.step();replayed.call('restore',checkpoint);replay.status=replayed.call('observe','p0');
        replay.seek(status.tick);assert.equal(replay.verify(),true,`${name}/${count} replay`);
        assert.equal(canonical(replayed.call('save')),canonical(snapshot));
      }
    }finally{live.dispose();replayed.dispose();}
  });
});

const soloSource=(modern=false)=>`import {defineGame} from '${modern?'@microfinity':'@minifinity'}/sdk';
export default defineGame({meta:{id:'legacy-solo',title:'Solo',instruction:'Press twice',description:'Private action fixture',${modern?'':'players:[1,1],modifiers:[],'}clock:'action',participation:'individual',world:'shared',duration:8,style:'pixel',score:{unit:'presses',order:'higher'},controls:{directions:false,action:'Press'},tags:[]},
init(ctx){return {counts:ctx.players.map(()=>0),secret:ctx.integer(100,900),id:ctx.players[0].id};},
step(s,inputs,ctx){if(inputs[s.id].pressed.action){s.counts[0]++;ctx.addScore(s.id,1);}if(s.counts[0]===2||ctx.event==='timeout'){ctx.finishPlayer(s.id,s.counts[0]===2?'success':'failure');ctx.finishRound();}},
observe(s,id){return {count:s.counts[Number(id.slice(1))],me:id};},hud(v){return {activePlayerId:v.me};},draw(v,g){g.text(String(v.count),100,100);}});`;

test('legacy solo and uniform individual cartridges isolate input, IDs, hidden observations and early finishes',async()=>{
  const runtime=await bootstrap();
  for(const modern of [false,true]){
    const vm=await Sandbox.create(await compile(soloSource(modern)),runtime);
    try{
      assert.deepEqual(vm.call('meta').meta.players,modern?[1,4]:[1,1]);
      vm.call('init',{seed:17,difficulty:1,players:players(4)},'party-v1');
      const initial=vm.call('save');for(const p of players(4))vm.call('observe',p.id);
      assert.deepEqual(vm.call('save'),initial,'switching private viewpoints cannot alter a checkpoint');
      const tap=[{button:'action',down:true},{button:'action',down:false}];
      vm.call('step',{p3:tap},1,'input');let status=vm.call('step',{p3:tap},1,'input');
      assert.deepEqual(status.scores,{p0:0,p1:0,p2:0,p3:2});assert.equal(status.done,false);assert.equal(status.roles.p3,'finished');
      assert.equal(vm.call('save').worlds[0].status.tick,0,'another player’s input cannot execute an idle private action game');
      assert.equal(status.nextStepAt,8,'other players cannot reset this attempt’s deadline');
      for(const p of players(4)){
        const view=vm.call('observe',p.id);assert.deepEqual(view.game,{count:p.id==='p3'?2:0,me:'p0'});
        assert.equal(view.gamePlayerId,'p0');assert.equal(view.hud.activePlayerId,p.id);assert.ok(!('secret' in view.game));
      }
      const saved=vm.call('save');vm.call('step',{},6,'timeout');vm.call('restore',saved);
      status=vm.call('step',{},6,'timeout');assert.equal(status.done,true);
      assert.deepEqual(status.outcomes,{p0:'failure',p1:'failure',p2:'failure',p3:'success'});
      assert.deepEqual(status.scores,{p0:0,p1:0,p2:0,p3:2});
    }finally{vm.dispose();}
  }
});

const pairSource=`import {defineGame} from '@minifinity/sdk';
export default defineGame({meta:{id:'legacy-pair',title:'Pair',instruction:'Take turns pressing',description:'Exactly two native slots',players:[2,2],clock:'action',participation:'rotating',world:'shared',duration:12,style:'pixel',score:{unit:'turns',order:'higher'},controls:{directions:false,action:'Press'},tags:[],modifiers:[]},
init(ctx){return {ids:ctx.players.map(p=>p.id),turn:0,moves:0};},role(s,id){return s.ids[s.turn]===id?'player':'waiting';},
step(s,inputs,ctx){const id=s.ids[s.turn];if(inputs[id].pressed.action||ctx.event==='timeout'){if(inputs[id].pressed.action)ctx.addScore(id,1);s.turn=1-s.turn;s.moves++;if(s.moves===4){for(const p of ctx.players)ctx.finishPlayer(p.id,ctx.scores[p.id]>0?'success':'failure');ctx.finishRound();}}},
observe(s,id){return {...s,me:id};},hud(v){return {activePlayerId:v.ids[v.turn]};},draw(v,g){g.text(v.me,100,100);}});`;

test('saved min-two games preserve turn ownership, fill an opponent and adapt excess party seats with exact replay',async()=>{
  const runtime=await bootstrap(),code=await compile(pairSource);
  for(const count of [1,2,3,4]){
    const vm=await Sandbox.create(code,runtime),other=await Sandbox.create(code,runtime);
    try{
      const config={difficulty:1,players:players(count)},seed=2,journal:any[]=[];
      let status=vm.call('init',{seed,...config},'party-v1');
      if(count===2){
        assert.equal(status.roles.p1,'waiting');
        const edges={p1:[{button:'action',down:true},{button:'action',down:false}]};
        status=vm.call('step',edges,1,'input');journal.push({tick:1,edges,dt:1,event:'input'});assert.equal(status.scores.p1,0,'out-of-turn input cannot score');
      }
      while(!status.done&&status.tick<12){
        const edges=Object.fromEntries(config.players.map(p=>[p.id,[{button:'action',down:true},{button:'action',down:false}]]));
        const event=status.tick%3===2?'timeout':'input';journal.push({tick:status.tick+1,edges,dt:1,event});status=vm.call('step',edges,1,event);
      }
      assert.equal(status.done,true);assert.ok(Object.values(status.scores).every(n=>Number(n)>0));
      const snapshot=vm.call('save');assert.equal(snapshot.worlds.length,count>2?count:1);
      if(count===1)assert.equal(snapshot.worlds[0].status.scores.p1,2,'engine opponent takes real native turns');
      const replay=new ReplayRunner(other,{mode:'party-v1',seed,config,journal,snapshot,status});replay.seek(status.tick);assert.equal(replay.verify(),true);
    }finally{vm.dispose();other.dispose();}
  }
});
