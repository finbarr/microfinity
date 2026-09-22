// Run from a built release directory. BASE_URL defaults to the private service.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require=createRequire(`${process.cwd()}/package.json`);
const WebSocket=require('ws');
const base=process.env.BASE_URL??'http://127.0.0.1:3000';
async function api(path,body,token){
  const response=await fetch(`${base}${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:`Bearer ${token}`}:{})},body:body?JSON.stringify(body):undefined});
  assert.equal(response.status,200,`${path} returned ${response.status}`);
  return response.json();
}
assert.equal((await api('/api/health')).ok,true);
const library=await api('/api/library');
assert.ok(library.length>=10,'Bundled cartridges are missing');
const page=await fetch(base);assert.equal(page.status,200);
const html=await page.text();assert.match(html,/Microfinity/i);
for(const asset of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)){
  assert.equal((await fetch(new URL(asset[1],base))).status,200,asset[1]);
}
const guest=await api('/api/guest',{name:'Deployment check'});
const cartridge=library.find(game=>game.gameId==='asteroid-scramble');
assert.ok(cartridge);
const room=await api('/api/rooms',{versions:[cartridge.id],settings:{targetPlayers:2,botType:'scripted'}},guest.token);
await new Promise((resolve,reject)=>{
  const socket=new WebSocket(`${base.replace(/^http/,'ws')}/socket`,{origin:base});
  const timer=setTimeout(()=>{socket.terminate();reject(new Error('No lobby state arrived'));},10000);
  socket.on('open',()=>socket.send(JSON.stringify({type:'join',roomId:room.id,token:guest.token})));
  socket.on('error',reject);
  socket.on('message',raw=>{
    const message=JSON.parse(String(raw));
    if(message.type==='error'){clearTimeout(timer);socket.close();reject(new Error(message.message));}
    if(message.type==='state'){
      try{assert.equal(message.phase,'lobby');assert.equal(message.hostId,guest.id);assert.equal(message.playlist[0].id,cartridge.id);clearTimeout(timer);socket.close();resolve();}
      catch(error){clearTimeout(timer);socket.close();reject(error);}
    }
  });
});
console.log(JSON.stringify({ok:true,cartridges:library.length,checks:['health','built homepage','static assets','PostgreSQL guest write','room creation','WebSocket authentication and lobby state']}));
