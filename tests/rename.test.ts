import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {readSaved} from '../client/storage';import {compile,bootstrap} from '../server/compiler';import {Sandbox} from '../runtime/sandbox';
test('rename preserves the saved guest and preferences without replacing current values',()=>{
 const values=new Map([['minifinity.guest','{"token":"local-fixture","name":"Player"}'],['minifinity.audio','{"muted":true}'],['microfinity.crt','off'],['minifinity.crt','on']]);
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 assert.equal(readSaved('guest',storage),values.get('minifinity.guest'));assert.equal(values.get('microfinity.guest'),values.get('minifinity.guest'));
 assert.equal(readSaved('audio',storage),'{"muted":true}');assert.equal(readSaved('crt',storage),'off');
 assert.equal(readSaved('name',storage),null);assert.equal(readSaved('audio',{...storage,setItem(){throw Error('full');}}),'{"muted":true}');
});
test('saved cartridges using the old SDK namespace still compile and run',async()=>{
 const source=(await readFile('games/toast-catch.ts','utf8')).replace('@microfinity/sdk','@minifinity/sdk');
 const vm=await Sandbox.create(await compile(source),await bootstrap());
 try{vm.call('init',{seed:1,difficulty:1,players:[{id:'p0',name:'Player',color:'#86efac'}]});assert.equal(vm.call('step',{}).tick,1);}finally{vm.dispose();}
});
