import { Sandbox } from '../runtime/sandbox';
let sandbox:Sandbox|undefined;
process.on('message',async(message:{id:number;method:string;args:any[]})=>{
  try{
    let result;
    if(message.method==='load'){sandbox?.dispose();sandbox=await Sandbox.create(message.args[0],message.args[1]);result=sandbox.call('meta');}
    else {if(!sandbox)throw new Error('Runtime is not loaded');result=sandbox.call(message.method,...message.args);}
    process.send?.({id:message.id,result});
  }catch(error){process.send?.({id:message.id,error:error instanceof Error?error.message:'Runtime failure'});}
});
process.on('disconnect',()=>{sandbox?.dispose();process.exit(0);});
