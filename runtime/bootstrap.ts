import { type Configuration } from './engine';
import { ModeEngine, type Mode } from './modes';
import { Graphics } from '../sdk/index';
import type { Game } from '../sdk/index';
declare const __cartridge:{default:Game};
let engine:ModeEngine|undefined;
export function dispatch(request:{method:string;args:any[]}) {
  const game=__cartridge.default;
  switch(request.method){
    case 'meta':return {meta:game.meta,assets:game.assets??[],audio:game.audio??{music:'stock',soundPack:'lofi-arcade'}};
    case 'init':engine=new ModeEngine(game,request.args[0] as Configuration,request.args[1] as Mode|undefined);return engine.status();
    case 'step':if(!engine)throw new Error('Not initialized');return engine.step(...request.args as Parameters<ModeEngine['step']>);
    case 'observe':if(!engine)throw new Error('Not initialized');return engine.observe(request.args[0]);
    case 'draw':{const gfx=new Graphics(game.meta.style,request.args[1]??[],request.args[2]??0,request.args[3]??{});game.draw(request.args[0],gfx);return gfx.commands;}
    case 'save':if(!engine)throw new Error('Not initialized');return engine.save();
    case 'restore':if(!engine)throw new Error('Not initialized');engine.restore(request.args[0]);return engine.status();
    default:throw new Error('Unknown runtime command');
  }
}
