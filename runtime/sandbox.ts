import { getQuickJS, type QuickJSContext, type QuickJSRuntime } from 'quickjs-emscripten';
import { safeJSON, validateCommands, cartridgeInfoSchema } from './validation';

export class Sandbox {
  private constructor(private vm:QuickJSContext,private runtime:QuickJSRuntime,private quota:{remaining:number;deadline:number}){}
  static async create(code:string,bootstrap:string) {
    if(code.length>200_000||bootstrap.length>500_000)throw new Error('Module size limit exceeded');
    const qjs=await getQuickJS(),runtime=qjs.newRuntime();
    runtime.setMemoryLimit(16*1024*1024);runtime.setMaxStackSize(256*1024);
    const quota={remaining:500,deadline:Date.now()+1000};
    runtime.setInterruptHandler(()=>--quota.remaining<0||Date.now()>quota.deadline);
    const vm=runtime.newContext(),sandbox=new Sandbox(vm,runtime,quota);
    try{
      sandbox.evaluate('globalThis.Date=undefined; Math.random=()=>{throw new Error("Use ctx.random()");}; globalThis.eval=undefined;');
      sandbox.evaluate(code,'cartridge.js');sandbox.evaluate(bootstrap,'runtime.js');
      sandbox.evaluate('globalThis.__dispatch = (json) => JSON.stringify(__engine.dispatch(JSON.parse(json)));');
      sandbox.call('meta');return sandbox;
    }catch(error){sandbox.dispose();throw error;}
  }
  private evaluate(code:string,name='host.js') {
    const result=this.vm.evalCode(code,name);
    if(result.error){const error=this.vm.dump(result.error);result.error.dispose();throw new Error(`${error.name??'CartridgeError'}: ${error.message??String(error)}`);}
    result.value.dispose();
  }
  call(method:string,...args:any[]):any {
    this.quota.remaining=method==='init'?500:200;this.quota.deadline=Date.now()+100;
    const json=safeJSON({method,args},300_000),fn=this.vm.getProp(this.vm.global,'__dispatch'),arg=this.vm.newString(json);
    let result;
    try{result=this.vm.callFunction(fn,this.vm.undefined,arg);}finally{fn.dispose();arg.dispose();}
    if(result.error){const error=this.vm.dump(result.error);result.error.dispose();throw new Error(`${error.name??'CartridgeError'}: ${error.message??String(error)}`);}
    let raw:string;
    try{raw=this.vm.getString(result.value);}finally{result.value.dispose();}
    if(raw.length>300_000)throw new Error('Cartridge output limit exceeded');
    const output=JSON.parse(raw);safeJSON(output,300_000);
    if(method==='meta')return cartridgeInfoSchema.parse(output);
    if(method==='draw')validateCommands(output);return output;
  }
  dispose(){this.vm.dispose();this.runtime.dispose();}
}
