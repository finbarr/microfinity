import { compile, bootstrap } from './compiler';
import { Sandbox } from '../runtime/sandbox';
import { colors } from '../sdk/index';
process.once('message',async(message:{source:string;bootstrap:string})=>{
  try{
    const code=await compile(message.source),vm=await Sandbox.create(code,message.bootstrap);
    let info;
    try{info=vm.call('meta');const meta=info.meta;
      if(meta.modifiers.length&&(meta.players[0]!==1||meta.players[1]!==1||meta.clock!=='realtime'))throw new Error('Reusable modifiers require a single-player realtime cartridge; use modifiers:[] for this game');
      for(let seed=1;seed<=3;seed++){
        const players=Array.from({length:seed===3?meta.players[1]:meta.players[0]},(_,i)=>({id:`p${i}`,name:`Player ${i+1}`,color:colors[i]}));
        let status=vm.call('init',{seed,difficulty:seed-1,players}),steps=0;
        while(!status.done&&steps<8000){
          const edges:Record<string,any>={};if(seed>1&&steps%12===0)for(const p of players)edges[p.id]=[{button:'action',down:steps%24===0},{button:'right',down:steps%48===0}];
          status=vm.call('step',edges,meta.clock==='action'?1:1/60,meta.clock==='action'?(steps%10===9?'timeout':'input'):'tick');
          if(steps%60===0){const view=vm.call('observe',players[0].id);vm.call('draw',view.game);vm.call('draw',view.game,info.assets);}steps++;
        }
        if(!status.done)throw new Error('Preflight: game failed to terminate');
        vm.call('draw',vm.call('observe',players[0].id).game);
      }
    }finally{vm.dispose();}
    process.send?.({code,...info});
  }catch(error){process.send?.({error:(error as Error).message});}
  finally{process.disconnect?.();}
});
