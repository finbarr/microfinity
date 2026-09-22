import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {Store,hash} from '../server/store';
import {compile,bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {backfillCartridgeIcons} from '../scripts/backfill-cartridge-icons';

test('backfill is dry-run safe and publishes a resumable icon-only successor with history pinned',async()=>{
 const key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='fixture-only';
 const root=await mkdtemp(join(tmpdir(),'microfinity-icon-backfill-'));const store=new Store(root,'');
 try{
  await store.init();const guest=await store.guest(undefined,'Icon owner');
  const reference=await readFile('games/toast-catch.ts','utf8'),source=reference.replace("id:'toast-catch'","id:'creation-icon-fixture'");
  const code=await compile(source),vm=await Sandbox.create(code,await bootstrap());const meta=vm.call('meta').meta;vm.dispose();
  const assets=[{name:'toast',hash:'old-art',url:'/assets/old-art.png',width:256,height:256}],music={hash:'old-music',url:'/assets/old-music.wav'};
  const prior=await store.putVersion(source,code,meta,assets,music,{kind:'generated'},guest.id);
  await store.finishRound('icon-match',0,prior.id,[{playerId:'p0',guestId:guest.id,score:4,partition:'icon-fixture'}]);
  await store.query('INSERT INTO cartridge_ratings(game_id,guest_id,version_id,stars) VALUES($1,$2,$3,$4)',[meta.id,guest.id,prior.id,5]);
  const logs:string[]=[];const dry=await backfillCartridgeIcons(store,{limit:5,dryRun:true,log:message=>logs.push(message)});
  assert.equal(dry.created,0);assert.match(logs[0],/Would publish/);assert.equal((await store.query('SELECT id FROM versions')).length,1);
  let subject:any,requested=0;
  const png=await sharp({create:{width:256,height:256,channels:3,background:'#4488aa'}}).png().toBuffer();
  const generate=async(_store:Store,input:any)=>{subject=input;requested++;const file=await store.putAsset(png,'png');return {icon:{...file,name:'cartridge-icon',width:256,height:256},model:'fixture-image',usage:null};};
  const run=await backfillCartridgeIcons(store,{limit:5,generate:generate as any,log:()=>{}});assert.equal(run.created,1);assert.equal(requested,1);
  assert.equal(subject.title,meta.title);assert.equal(subject.premise,meta.description);
  const [latest]=await store.query<{id:string}>('SELECT id FROM versions WHERE game_id=$1 AND id<>$2',[meta.id,prior.id]);
  const next=await store.version(latest.id);assert.equal(next.manifest.icon?.hash,hash(png));
  assert.equal(next.source,prior.source);assert.equal(next.code,prior.code);assert.deepEqual(next.manifest.meta,prior.manifest.meta);
  assert.deepEqual(next.manifest.assets,prior.manifest.assets);assert.deepEqual(next.manifest.music,prior.manifest.music);
  assert.equal(next.manifest.runtimeVersion,prior.manifest.runtimeVersion);assert.deepEqual((await store.version(prior.id)).manifest,prior.manifest);
  assert.equal((await store.query('SELECT owner_id FROM games WHERE id=$1',[meta.id]))[0].owner_id,guest.id);
  assert.equal((await store.query('SELECT version_id FROM results WHERE match_id=$1',['icon-match']))[0].version_id,prior.id);
  assert.equal((await store.query('SELECT version_id FROM cartridge_ratings WHERE game_id=$1',[meta.id]))[0].version_id,prior.id);
  const resumed=await backfillCartridgeIcons(store,{limit:5,generate:generate as any,log:()=>{}});
  assert.equal(resumed.created,0);assert.equal(requested,1);
 }finally{await store.close();await rm(root,{recursive:true,force:true});if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
