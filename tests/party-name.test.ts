import test from 'node:test';
import assert from 'node:assert/strict';
import {Room} from '../server/rooms';
import type {Store} from '../server/store';

class Socket {readyState=1;bufferedAmount=0;messages:any[]=[];send(raw:string){this.messages.push(JSON.parse(raw));}close(){this.readyState=3;}state(){return this.messages.filter(m=>m.type==='state').at(-1);}}

test('name changes reach every party member without changing seats or playlist revisions',async()=>{
  const room=new Room({} as Store,'host',[]),a=new Socket(),b=new Socket();
  try{
    await room.join({id:'host',name:'Old host'},a as any);await room.join({id:'friend',name:'Friend'},b as any);
    const revision=room.revision,epoch=room.seats[0].epoch;
    await room.renameGuest('host','New host');
    for(const socket of [a,b]){assert.equal(socket.state().seats[0].name,'New host');assert.equal(socket.state().seats[1].name,'Friend');}
    assert.equal(room.revision,revision);assert.equal(room.seats[0].epoch,epoch);assert.equal(room.hostId,'host');
    await room.renameGuest('not-in-party','Stranger');assert.equal(room.seats.length,2);
    room.phase='playing';await room.renameGuest('friend','New friend');
    assert.equal(a.state().seats[1].name,'New friend');assert.equal(b.state().seats[1].name,'New friend');
    assert.equal(room.phase,'playing');assert.equal(room.seats[1].controller,'human');
    await assert.rejects(()=>room.renameGuest('host',' '));assert.equal(room.seats[0].name,'New host');
  }finally{await room.close();}
});
