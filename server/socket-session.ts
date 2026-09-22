import type {WebSocket} from 'ws';

type Guest={id:string;name:string};
type Party={join(guest:Guest,ws:WebSocket):void|Promise<void>;message(ws:WebSocket,message:any):Promise<void>;disconnect(ws:WebSocket):void|Promise<void>};
type Options={authenticate(token:string):Promise<Guest>;findRoom(id:string):Party|undefined;heartbeatMs?:number;joinTimeoutMs?:number};

/** One bounded, ordered command stream per connection, including authentication. */
export function attachSession(ws:WebSocket,options:Options){
 let room:Party|undefined,closed=false,alive=true,pending=0,count=0,window=performance.now(),queue=Promise.resolve();
 const sendError=(error:unknown)=>{if(!closed&&ws.readyState===1)ws.send(JSON.stringify({type:'error',message:(error instanceof Error?error.message:'Invalid message').slice(0,500)}));};
 const disconnect=()=>{if(room)void Promise.resolve(room.disconnect(ws)).catch(()=>{});};
 const joinTimer=setTimeout(()=>{if(!room)ws.close(4003,'Join required');},options.joinTimeoutMs??8000);
 const heartbeat=setInterval(()=>{
  if(closed||ws.readyState!==1)return;
  if(!alive){ws.terminate();return;}
  alive=false;ws.ping();
 },options.heartbeatMs??15000);
 joinTimer.unref();heartbeat.unref();
 ws.on('pong',()=>{alive=true;});
 ws.on('error',()=>ws.terminate());
 ws.on('message',raw=>{
  if(closed||ws.readyState!==1)return;
  const now=performance.now();if(now-window>=1000){window=now;count=0;}
  if(++count>100||pending>=64){ws.close(4008,'Input rate limit');return;}
  pending++;
  queue=queue.then(async()=>{
   if(closed||ws.readyState!==1)return;
   const message=JSON.parse(raw.toString());
   if(!message||typeof message!=='object'||Array.isArray(message)||typeof message.type!=='string')throw new Error('Expected a message object');
   if(room){if(message.type==='join')throw new Error('This connection already joined a party');await room.message(ws,message);return;}
   if(message.type!=='join')throw new Error('Join first');
   if(typeof message.token!=='string'||message.token.length>100||typeof message.roomId!=='string'||message.roomId.length>32)throw new Error('Invalid join request');
   const guest=await options.authenticate(message.token);
   if(closed||ws.readyState!==1)return;
   const candidate=options.findRoom(message.roomId);
   if(!candidate){ws.close(4004,'Party no longer exists');return;}
   // Set ownership before an async join so close can always release the seat.
   room=candidate;
   try{await candidate.join(guest,ws);}catch(error){room=undefined;throw error;}
   if(closed||ws.readyState!==1){disconnect();return;}
   clearTimeout(joinTimer);
  }).catch(sendError).finally(()=>{pending--;});
 });
 ws.on('close',()=>{closed=true;clearTimeout(joinTimer);clearInterval(heartbeat);disconnect();});
}
