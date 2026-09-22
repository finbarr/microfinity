import { Sandbox } from '../runtime/sandbox';
let vm:Sandbox|undefined;
let assets:string[]=[];
let chain=Promise.resolve();
self.onmessage=(event)=>{chain=chain.then(async()=>{
  const m=event.data;
  try{
    if(m.type==='load'){vm?.dispose();assets=m.assets??[];vm=await Sandbox.create(m.code,m.bootstrap);self.postMessage({type:'loaded',versionId:m.versionId});}
    if(m.type==='draw'&&vm){const commands=m.view===null?[{op:'clear',args:['#272337']},{op:'text',args:['HEY! WHO PUT THAT THERE?',320,200,23,'#f9a8d4','center']}]:vm.call('draw',m.view,assets,m.renderAhead??0,m.presentation??{});self.postMessage({type:'frame',commands,tick:m.tick});}
  }catch(error){self.postMessage({type:'error',message:(error as Error).message});}
});};
