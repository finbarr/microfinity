import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import type {Manifest} from '../server/store';
import {Lobby} from '../client/Lobby';

const game={id:'a'.repeat(64),provenance:{},meta:{title:'Star Hop',duration:20,controls:{directions:true}}} as Manifest;
const baseRoom={roomId:'abcd1234',hostId:'host',revision:0,playlist:[],seats:[{id:'p0',name:'Alex',color:'#eee',connected:true,guestId:'host'},{id:'p1',name:'Jev AI',color:'#aaa',connected:false}]};
const callbacks={send:()=>{},onCreate:()=>{},onRandom:()=>{},onCopyInvite:()=>{},onStart:()=>{}};

test('an empty host room exposes the invite before game selection and cannot start',()=>{
  const html=renderToStaticMarkup(createElement(Lobby,{room:baseRoom,isHost:true,library:[game],inviteLink:'https://example.test/?room=abcd1234',inviteCopied:false,...callbacks}));
  assert.match(html,/https:\/\/example\.test\/\?room=abcd1234/);
  assert.match(html,/No games picked yet/);
  assert.match(html,/Surprise me/);
  assert.match(html,/<button[^>]*disabled=""[^>]*>▶ Start party<\/button>/);
  assert.doesNotMatch(html,/I.m ready|Minimum players|Maximum players/);
});

test('joiners see members and the host-controlled waiting state',()=>{
  const room={...baseRoom,playlist:[{id:game.id,meta:game.meta}],seats:[...baseRoom.seats,{id:'p2',name:'Sam',color:'#def',connected:true,guestId:'joiner'}]};
  const html=renderToStaticMarkup(createElement(Lobby,{room,isHost:false,library:[game],inviteLink:'https://example.test/?room=abcd1234',inviteCopied:false,...callbacks}));
  assert.match(html,/Waiting for the host to start/);
  assert.match(html,/Alex/);
  assert.match(html,/Sam/);
  assert.doesNotMatch(html,/Surprise me|Start party|Pick a cartridge|Add game|I.m ready/);
});
