import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm,symlink,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ModelPolicy} from '../builder/policy.mjs';
import {readArtifact} from '../builder/artifact.mjs';
import {exportReferences,collectCandidate,command} from '../server/game-builder';
import type {Store} from '../server/store';
import {projectCreateSchema} from '../server/projects';

test('broker pins provider options and rejects hosted tools, remote images and conversations',()=>{
 const policy=new ModelPolicy({model:'pinned',maxCalls:5,maxOutputTokens:60000});
 const body=policy.reserve({model:'other',input:[{role:'user',content:'test'}],tools:[{type:'function',name:'shell'}],store:true,max_output_tokens:999999,reasoning:{effort:'low'},service_tier:'priority'});
 assert.equal(body.model,'pinned');assert.equal(body.store,false);assert.equal(body.max_output_tokens,12000);assert.equal(body.reasoning.effort,'high');assert.equal((body as any).service_tier,undefined);
 for(const extra of [{tools:[{type:'web_search'}]},{tools:[{type:'mcp'}]},{previous_response_id:'other-account-response'},{conversation:'other'},{input:[{type:'input_image',image_url:'https://example.com/private'}]},{input:[{type:'input_file',file_url:'https://example.com/private'}]},{input:[{type:'input_file',file_id:'file-other'}]},{input:[{type:'item_reference',id:'msg-other'}]}])assert.throws(()=>policy.reserve({input:[],...extra}));
 assert.equal(policy.usage.calls,1);
});
test('broker budgets reserve before dispatch and release only confirmed unused output',()=>{
 const policy=new ModelPolicy({model:'pinned',maxCalls:2,maxInputBytes:10000,maxOutputTokens:13000});
 policy.reserve({input:[]});assert.throws(()=>policy.reserve({input:[]}),/budget/);assert.equal(policy.usage.calls,1);
 policy.settle(1000);policy.reserve({input:[]});assert.equal(policy.usage.reservedOutputTokens,13000);assert.throws(()=>policy.reserve({input:[]}),/budget/);
 const expired=new ModelPolicy({model:'pinned',deadline:Date.now()-1});assert.throws(()=>expired.reserve({input:[]}),/deadline/);
 const small=new ModelPolicy({model:'pinned',maxInputBytes:100});assert.throws(()=>small.reserve({input:['é'.repeat(100)]}),/budget/);assert.equal(small.usage.calls,0);
});
test('broker enforces configured effort even when the agent requests another effort', () => {
  const policy = new ModelPolicy({model: 'gpt-6-luna', reasoningEffort: 'medium'});
  const body = policy.reserve({input: [], reasoning: {effort: 'max'}});
  assert.equal(body.reasoning.effort, 'medium');
  assert.throws(() => new ModelPolicy({model: 'gpt-6-luna', reasoningEffort: 'invalid'}), /reasoning effort/);
});
test('artifact boundary rejects symlinks, hardlinks, oversized and invalid UTF-8 files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'builder-artifact-'));
 try{
  const file=join(root,'output.ts');await writeFile(file,'valid source');assert.equal(await readArtifact(file,100),'valid source');
  await symlink(file,join(root,'symbolic'));await assert.rejects(()=>readArtifact(join(root,'symbolic'),100));
  await link(file,join(root,'hard'));await assert.rejects(()=>readArtifact(file,100),/Invalid/);await rm(join(root,'hard'));
  await assert.rejects(()=>readArtifact(file,2),/Invalid/);await writeFile(file,Buffer.from([0xff]));await assert.rejects(()=>readArtifact(file,100));
  await assert.rejects(()=>readArtifact(root,100),/Invalid/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('reference folder contains every built-in and saved source, named safely, without an index',async()=>{
 const root=await mkdtemp(join(tmpdir(),'builder-references-'));
 const rows=[{id:'a'.repeat(64),game_id:'../../bad',manifest:{meta:{title:'A Game / Escape'}},source:'saved source one'},{id:'b'.repeat(64),game_id:'../../bad',manifest:{meta:{title:'A Game / Escape'}},source:'saved source two'}];
 try{
  await exportReferences({query:async()=>rows} as unknown as Store,root);const files=await readdir(root),builtins=(await readdir('games')).filter(f=>f.endsWith('.ts'));
  assert.equal(files.length,builtins.length+2);assert.ok(files.every(f=>f.endsWith('.ts')));assert.ok(!files.some(f=>/index/i.test(f)));
  for(const file of builtins)assert.equal(await readFile(join(root,file),'utf8'),await readFile(join('games',file),'utf8'));
  for(const row of rows){const file=files.find(f=>f.includes(row.id))!;assert.ok(file.startsWith('a-game-escape--bad--'));assert.equal(await readFile(join(root,file),'utf8'),row.source);}
 }finally{await rm(root,{recursive:true,force:true});}
});
test('HTTP schema shares trimmed 600-character limits and rejects retired creation modes',()=>{
 assert.equal(projectCreateSchema.parse({requestId:'fixture-request',prompt:'  A lovely toast game  '}).prompt,'A lovely toast game');
 assert.throws(()=>projectCreateSchema.parse({requestId:'fixture-request',prompt:'x'.repeat(601)}));
 for(const key of ['musicOnly','mediaOnly','format','reuseMusic'])assert.throws(()=>projectCreateSchema.parse({requestId:'fixture-request',prompt:'A lovely toast game',[key]:true}));
});
test('forged collector records cannot change source during UTF-8 transfer or exceed byte limits',()=>{
 assert.throws(()=>collectCandidate(JSON.stringify({source:'\ud800',witnesses:[]})),/Invalid builder artifact/);
 assert.throws(()=>collectCandidate(JSON.stringify({source:'é'.repeat(50001),witnesses:[]})),/Invalid builder artifact/);
 assert.throws(()=>collectCandidate(JSON.stringify({source:'valid',witnesses:'é'.repeat(100001)})),/Invalid builder artifact/);
 assert.deepEqual(collectCandidate(JSON.stringify({source:'const label="雪";',witnesses:[]})),{source:'const label="雪";',witnesses:[]});
});
test('subprocess collection preserves UTF-8 split across pipe chunks',async()=>{
 const result=await command(process.execPath,['-e','process.stdout.write(Buffer.from([0xe9]));setTimeout(()=>process.stdout.write(Buffer.from([0x9b,0xaa])),30);']);
 assert.equal(result.stdout,'雪');
 await assert.rejects(()=>command(process.execPath,['-e','process.stdout.write("雪");'],{maxBytes:2}),/output limit/);
});
