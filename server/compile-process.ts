import { fork } from 'node:child_process';import { resolve } from 'node:path';import { existsSync } from 'node:fs';
import { bootstrap } from './compiler';
export async function compileIsolated(source:string,signal?:AbortSignal):Promise<{code:string;meta:any;assets:string[];audio:any}>{
  signal?.throwIfAborted();
  const runtimeSource=await bootstrap();
  signal?.throwIfAborted();
  return new Promise((resolvePromise,reject)=>{
    const built=process.env.NODE_ENV==='production'&&existsSync('dist/server/compile-child.js');
    const child=fork(resolve(built?'dist/server/compile-child.js':'server/compile-child.ts'),[],{execArgv:built?['--max-old-space-size=192']:['--import','tsx','--max-old-space-size=192'],env:{PATH:process.env.PATH,NODE_ENV:'production'},stdio:['ignore','ignore','ignore','ipc']});
    let settled=false;const aborted=()=>done(signal?.reason instanceof Error?signal.reason:new Error('Compilation cancelled'));
    const done=(error:Error|null,value?:any)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',aborted);child.kill('SIGKILL');error?reject(error):resolvePromise(value);};
    const timer=setTimeout(()=>done(new Error('Compilation/preflight exceeded 25 seconds')),25000);
    signal?.addEventListener('abort',aborted,{once:true});
    child.once('message',(m:any)=>done(m.error?new Error(m.error):null,m));child.once('error',e=>done(e));child.once('exit',()=>done(new Error('Compiler exited before completing')));
    if(signal?.aborted){aborted();return;}
    child.send({source,bootstrap:runtimeSource},error=>{if(error)done(error);});
  });
}
