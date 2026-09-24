import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Lobby} from '../client/Lobby';

const baseRoom={roomId:'abcd1234',hostId:'host',revision:0,playlist:[],seats:[{id:'p0',name:'Alex',color:'#eee',connected:true,guestId:'host'},{id:'p1',name:'Jev AI',color:'#aaa',connected:false}]};
const options={inviteLink:'https://example.test/?room=abcd1234',inviteCopied:false,onCopyInvite:()=>{}};

test('the home party panel exposes its invite and connected humans',()=>{
  const html=renderToStaticMarkup(createElement(Lobby,{room:baseRoom,isHost:true,...options}));
  assert.match(html,/https:\/\/example\.test\/\?room=abcd1234/);
  assert.match(html,/1 \/ 4 players/);
  assert.match(html,/Alex/);
  assert.match(html,/Pick cartridges below/);
  assert.doesNotMatch(html,/Jev AI|Pick a cartridge|Start party|<h1/);
});

test('joiners see the shared members and host-controlled waiting state',()=>{
  const room={...baseRoom,playlist:[{id:'fixture'}],seats:[...baseRoom.seats,{id:'p2',name:'Sam',color:'#def',connected:true,guestId:'joiner'}]};
  const html=renderToStaticMarkup(createElement(Lobby,{room,isHost:false,...options}));
  assert.match(html,/Waiting for the host to start/);
  assert.match(html,/Alex/);assert.match(html,/Sam/);assert.match(html,/2 \/ 4 players/);
  assert.doesNotMatch(html,/Surprise me|Start party|Pick a cartridge|Add game|I.m ready/);
});

// Native party support is an engine mode, not the old obstruction modifier.
test('native party cartridges never show an obstruction label',async()=>{
  const {GameCabinet}=await import('../client/GameCabinet');
  const manifest={meta:{title:'Native game',score:{unit:'points',order:'higher'},duration:20,participation:'simultaneous',instruction:'Play'},provenance:{}} as any;
  const html=renderToStaticMarkup(createElement(GameCabinet,{manifest,view:{},round:'ROUND 1',mode:'party-v1',children:null}));
  assert.doesNotMatch(html,/OBSTRUCTION|Rivals press SPACE/);
  const modified=renderToStaticMarkup(createElement(GameCabinet,{manifest,view:{},round:'ROUND 1',mode:'obstruction',children:null}));
  assert.match(modified,/OBSTRUCTION/);
});
