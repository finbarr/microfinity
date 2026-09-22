import { fork, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { bootstrap } from './compiler';
export class RuntimeProcess {
  private child:ChildProcess;
  private serial=0;
  private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  private disposed=false;
  constructor(){
    const built=process.env.NODE_ENV==='production'&&existsSync('dist/server/runtime-child.js');
    this.child=fork(resolve(built?'dist/server/runtime-child.js':'server/runtime-child.ts'),[],{
      execArgv:built?['--max-old-space-size=96','--experimental-permission',`--allow-fs-read=${resolve('dist')}`,`--allow-fs-read=${resolve('node_modules')}`,`--allow-fs-read=${resolve('package.json')}`]:['--import','tsx','--max-old-space-size=96'],
      env:{PATH:process.env.PATH,NODE_ENV:'production'},stdio:['ignore','ignore','ignore','ipc']
    });
    this.child.on('message',(m:any)=>{const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result);});
    this.child.on('exit',()=>this.fail(new Error('Cartridge process exited')));
    this.child.on('error',error=>this.fail(error));
  }
  static async create(code:string,runtimeSource?:string){const runner=new RuntimeProcess();try{await runner.call('load',code,runtimeSource??await bootstrap());return runner;}catch(e){runner.dispose();throw e;}}
  call(method:string,...args:any[]):Promise<any>{
    if(this.disposed)return Promise.reject(new Error('Runtime disposed'));
    if(this.pending.size>=8)return Promise.reject(new Error('Runtime queue limit exceeded'));
    return new Promise((resolve,reject)=>{const id=++this.serial,timer=setTimeout(()=>{this.fail(new Error('Cartridge process deadline exceeded'));this.dispose();},method==='load'?8000:1500);this.pending.set(id,{resolve,reject,timer});this.child.send({id,method,args},error=>{if(error)this.fail(error);});});
  }
  private fail(error:Error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
  dispose(){if(this.disposed)return;this.disposed=true;this.fail(new Error('Runtime disposed'));this.child.kill('SIGKILL');}
}
