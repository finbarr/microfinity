import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';import { tmpdir } from 'node:os';import { join } from 'node:path';
import { Store, hash } from '../server/store';import { compile, bootstrap } from '../server/compiler';import { Sandbox } from '../runtime/sandbox';
import {GenerationService} from '../server/generation';
test('durable guest identity, immutable runtime versions, and idempotent results survive reopening',async()=>{
  const root=await mkdtemp(join(tmpdir(),'microfinity-store-'));let store=new Store(root,'');
  try{
    await store.init();const guest=await store.guest(undefined,'Evidence');const source=await readFile('games/toast-catch.ts','utf8'),code=await compile(source),vm=await Sandbox.create(code,await bootstrap());
    const meta=vm.call('meta').meta;vm.dispose();const version=await store.putVersion(source,code,meta);assert.equal(hash(await store.runtime(version)),version.manifest.runtimeVersion);
    const identical=await store.putVersion(source,code,meta);assert.equal(identical.id,version.id);
    const draft=await store.putVersion(source,code,meta,[],null,{draft:true});
    const published=await store.putVersion(source,code,meta,[],null,{draft:false});
    assert.notEqual(draft.id,published.id);assert.equal(published.id,version.id);
    assert.equal((await store.version(draft.id)).manifest.provenance.draft,true);
    assert.notEqual(published.manifest.provenance.draft,true);
    const later=await store.putVersion(source,code,meta,[],{title:'new audio'});assert.notEqual(later.id,version.id);
    const iconBytes=Buffer.from('icon fixture'),iconFile=await store.putAsset(iconBytes,'png'),icon={...iconFile,name:'cartridge-icon',width:256,height:256};
    const withIcon=await store.putVersion(source,code,meta,[],null,{},guest.id,undefined,undefined,undefined,icon);
    assert.notEqual(withIcon.id,version.id);assert.deepEqual(withIcon.manifest.icon,icon);
    assert.equal((await store.version(version.id)).manifest.icon,undefined,'legacy immutable manifest remains untouched');
    assert.equal((await store.putVersion(source,code,meta,[],null,{},guest.id,undefined,undefined,undefined,icon)).id,withIcon.id);
    const priorRuntime='// A previously pinned runtime\n'+await bootstrap();
    const audioOnly=await store.putVersion(source,code,meta,[],{title:'media edit'}, {},guest.id,{runtime:priorRuntime,sdkVersion:'1.0.0'});
    assert.equal(audioOnly.manifest.runtimeVersion,hash(priorRuntime));assert.equal(audioOnly.source,source);assert.equal(await store.runtime(audioOnly),priorRuntime);
    let guards=0;await assert.rejects(()=>store.putVersion(source,code,{...meta,id:'expired-publication'},[],null,{},guest.id,undefined,undefined,()=>{if(++guards===4)throw new Error('Work deadline before commit');}),/deadline/);
    assert.equal((await store.query("SELECT id FROM versions WHERE game_id='expired-publication'")).length,0);assert.equal((await store.query("SELECT id FROM games WHERE id='expired-publication'")).length,0);
    const generation=new GenerationService(store),job={id:'status-fence',ownerId:guest.id,status:'working',attempts:[]};
    await (generation as any).save(job);await (generation as any).save({...job,status:'failed',error:'Work deadline'});await (generation as any).save(job);
    assert.equal((await store.query("SELECT status FROM jobs WHERE id='status-fence'"))[0].status,'failed');
    const records=[{playerId:'p0',guestId:guest.id,score:5,partition:'test'}];await store.finishRound('match',0,version.id,records);await store.finishRound('match',0,version.id,records);assert.equal((await store.query('SELECT * FROM results')).length,1);
    await store.close();store=new Store(root,'');await store.init();assert.equal((await store.authenticate(guest.token)).name,'Evidence');assert.equal((await store.version(version.id)).manifest.music,null);assert.equal((await store.query('SELECT * FROM results'))[0].score,5);
  }finally{await store.close();await rm(root,{recursive:true,force:true});}
});
