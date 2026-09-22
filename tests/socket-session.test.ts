import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {attachSession} from '../server/socket-session';

class Socket extends EventEmitter{
 readyState=1;messages:any[]=[];code=0;pings=0;terminated=false;
 send(data:string){this.messages.push(JSON.parse(data));}
 ping(){this.pings++;}
 close(code=1000){this.code=code;this.readyState=3;this.emit('close');}
 terminate(){this.terminated=true;this.close(1006);}
 receive(message:any){this.emit('message',Buffer.from(typeof message==='string'?message:JSON.stringify(message)));}
}
const flush=()=>new Promise(r=>setImmediate(r));
const join={type:'join',roomId:'party',token:'fixture-token'};

test('an expired or restarted party closes with a terminal room code',async()=>{
 const ws=new Socket();attachSession(ws as any,{authenticate:async()=>({id:'g',name:'Fixture'}),findRoom:()=>undefined});
 ws.receive(join);await flush();assert.equal(ws.code,4004);assert.equal(ws.readyState,3);
});

test('socket serializes authentication and commands; duplicate joins cannot rebind seats',async()=>{
 const ws=new Socket();let authenticate!:(guest:any)=>void,finishStart!:()=>void;const seen:string[]=[];
 const room={join(){seen.push('join');},async message(_ws:any,m:any){seen.push(m.type);if(m.type==='start')await new Promise<void>(r=>{finishStart=r;});},disconnect(){seen.push('disconnect');}};
 attachSession(ws as any,{authenticate:()=>new Promise(r=>{authenticate=r;}),findRoom:()=>room});
 try{
  ws.receive(join);ws.receive(join);ws.receive({type:'start'});ws.receive({type:'input'});await flush();assert.deepEqual(seen,[]);
  authenticate({id:'g',name:'Fixture'});await flush();assert.deepEqual(seen,['join','start']);assert.match(ws.messages[0].message,/already joined/);
  finishStart();await flush();assert.deepEqual(seen,['join','start','input']);
  ws.receive('null');ws.receive('{broken');ws.receive({type:'ready'});await flush();assert.equal(ws.messages.length,3);assert.equal(seen.at(-1),'ready');
 }finally{ws.close();}assert.equal(seen.at(-1),'disconnect');
});

test('closed authentication cannot claim a seat and a stalled queue is bounded',async()=>{
 let finish!:(guest:any)=>void,joins=0;const ws=new Socket();
 attachSession(ws as any,{authenticate:()=>new Promise(r=>{finish=r;}),findRoom:()=>({join(){joins++;},async message(){},disconnect(){}})});
 ws.receive(join);await flush();for(let i=0;i<64;i++)ws.receive({type:'input'});assert.equal(ws.code,4008);
 finish({id:'g',name:'Fixture'});await flush();assert.equal(joins,0);assert.equal(ws.messages.length,0);
});

test('heartbeat reclaims an unresponsive socket while pong responses keep it connected',async()=>{
 const ws=new Socket();attachSession(ws as any,{authenticate:async()=>({id:'g',name:'Fixture'}),findRoom:()=>undefined,heartbeatMs:10,joinTimeoutMs:1000});
 try{
  const deadline=performance.now()+1000;while(!ws.pings&&performance.now()<deadline)await new Promise(r=>setTimeout(r,2));assert.ok(ws.pings>0);
  ws.emit('pong');const pings=ws.pings;while(ws.pings===pings&&performance.now()<deadline)await new Promise(r=>setTimeout(r,2));assert.equal(ws.terminated,false);
  while(!ws.terminated&&performance.now()<deadline)await new Promise(r=>setTimeout(r,2));assert.equal(ws.terminated,true);
 }finally{ws.close();}
});
