import {Sandbox} from '../runtime/sandbox';
self.onmessage=async({data})=>{
 let vm:Sandbox|undefined;
 try{
  vm=await Sandbox.create(data.code,data.runtime);
  vm.call('init',{seed:42,difficulty:1,players:Array.from({length:data.players},(_,i)=>({id:`p${i}`,name:i?'Player '+(i+1):'You',color:['#dcff6c','#6edce5','#ff79b8','#c4b5fd'][i]}))},'native');
  self.postMessage({view:vm.call('observe','p0')});
 }catch(e){self.postMessage({error:(e as Error).message});}finally{vm?.dispose();}
};
