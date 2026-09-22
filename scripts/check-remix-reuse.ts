/** Offline only: the app must be stopped before this script opens PGlite. */
import {Store,hash} from '../server/store';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import ts from 'typescript';
function callbacks(source:string){
 const file=ts.createSourceFile('cartridge.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),printer=ts.createPrinter({removeComments:true}),result:Record<string,string>={};
 const visit=(node:ts.Node)=>{if(ts.isMethodDeclaration(node)&&node.name&&['init','step','update','observe','role'].includes(node.name.getText(file)))result[node.name.getText(file)]=printer.printNode(ts.EmitHint.Unspecified,node,file);ts.forEachChild(node,visit);};visit(file);return result;
}
const store=new Store();await store.init();const checks:any[]=[];
try{
 for(const id of ['1cc9fb58b585d928647eca47','d88f6f116bb378aecbd99a79']){
  const [row]=await store.query('SELECT record FROM jobs WHERE id=$1',[id]),job=row.record,prior=await store.version(job.remix),next=await store.version(job.finishedVersion);
  assert.equal(job.branches.art,'reused');assert.equal(job.branches.music,'reused');assert.equal(job.reuseMusic,true);
  assert.deepEqual(next.manifest.assets,prior.manifest.assets);assert.deepEqual(next.manifest.music,prior.manifest.music);assert.ok(!job.models.music&&!job.models.image);assert.notEqual(next.id,prior.id);
  const before=callbacks(prior.source),after=callbacks(next.source),ruleCallbacks=Object.fromEntries(Object.keys(before).map(name=>[name,{identical:before[name]===after[name],before:hash(before[name]),after:hash(after[name]??'')} ]));
  checks.push({jobId:id,from:prior.id,to:next.id,previewMs:job.timings.previewMs,totalMs:job.timings.totalMs,attempts:job.attempts.length,models:job.models,artReused:true,musicReused:true,noNewMediaModelRecorded:true,musicHash:(next.manifest.music as {hash?:string}|null)?.hash,ruleCallbacks});
 }
 await mkdir('evidence/generation',{recursive:true});await writeFile('evidence/generation/remix-reuse-report.json',JSON.stringify({at:new Date().toISOString(),method:'Compare actual saved versions and provider-stage records. Callback equality uses TypeScript printer output with comments removed; unequal output is not proof of changed behavior.',checks},null,2));console.log(JSON.stringify(checks));
}finally{await store.close();}
