import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { jevDecision } from '../server/controllers';
import { emptyButtons } from '../sdk/index';
const report:Record<string,unknown>={at:new Date().toISOString()};
try{
  const response=await fetch('https://api.openai.com/v1/models',{headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},signal:AbortSignal.timeout(20000)});
  const body=await response.json() as any;report.openai={status:response.status,available:body.data?.map((m:any)=>m.id).filter((s:string)=>/gpt-5-mini|gpt-image|gpt-4.1-mini/.test(s))??[],error:response.ok?null:body.error?.code??'request-failed'};
}catch(e){report.openai={error:(e as Error).message};}
try {report.jev=await jevDecision({title:'Controller probe',instruction:'Move right to the visible target.',description:'A controller integration probe.',controls:{directions:true,action:'Confirm'}} as any,{playerId:'p0',game:{x:20,targetX:80}},emptyButtons());}
catch(e){report.jev={error:(e as Error).message};}
await mkdir('evidence',{recursive:true});await writeFile('evidence/provider-probe.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
