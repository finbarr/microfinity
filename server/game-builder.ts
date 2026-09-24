import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {Store,Asset} from './store';

export type CodexSession={threadId:string;files:{path:string;text:string}[]};
export type BuildSnapshot={png:string;sourceHash:string;players:number;seed:number;tick:number};
export type BuildInput={jobId:string;projectId?:string;leaseTag?:string;ownerId?:string;session?:CodexSession;witnesses?:unknown;feedback?:unknown;onSnapshot?:(snapshot:BuildSnapshot)=>Promise<void>;onMessage?:(text:string)=>Promise<void>;prompt:string;brief:any;gameId:string;assets:Asset[];music:unknown;icon?:Asset;parent?:string;signal:AbortSignal;onStage?:(stage:'building'|'validating')=>Promise<void>};
export type BuildResult={session?:CodexSession;witnesses?:unknown;thread?:{threadId:string;resumed:boolean};source:string;code:string;runtime:string;meta:any;assets:string[];audio:any;reports:unknown[];model:string;reasoningEffort?:string;imageId?:string;usage:unknown;screenshots?:{players:number;png:string}[]};
export type GameBuilder={build(input:BuildInput):Promise<BuildResult>};
export function collectCandidate(stdout:string){
  const artifact=JSON.parse(stdout.trim()),traces=JSON.stringify(artifact.witnesses);
  if(typeof artifact.source!=='string'||Buffer.byteLength(artifact.source)>100000||Buffer.from(artifact.source,'utf8').toString('utf8')!==artifact.source||typeof traces!=='string'||Buffer.byteLength(traces)>200000)throw new Error('Invalid builder artifact');
  return {source:artifact.source as string,witnesses:artifact.witnesses};
}

export function command(engine:string,args:string[],options:{input?:string;signal?:AbortSignal;maxBytes?:number;onLine?:(line:string)=>void}={}){
  return new Promise<{stdout:string;stderr:string}>((resolvePromise,reject)=>{
    const child=spawn(engine,args,{stdio:['pipe','pipe','pipe'],signal:options.signal});let stdout='',stderr='',bytes=0,pendingLine='';
    const collect=(chunk:string,error=false)=>{bytes+=Buffer.byteLength(chunk);if(bytes>(options.maxBytes??8_000_000)){child.kill('SIGKILL');reject(new Error('Builder process output limit exceeded'));return;}if(error)stderr+=chunk;else {stdout+=chunk;if(options.onLine){pendingLine+=chunk;let end;while((end=pendingLine.indexOf('\n'))>=0){const line=pendingLine.slice(0,end);pendingLine=pendingLine.slice(end+1);try{options.onLine(line);}catch(error){child.kill('SIGKILL');reject(error);}}}}};
    // Decode across pipe chunk boundaries so non-ASCII source bytes survive intact.
    child.stdout.setEncoding('utf8').on('data',chunk=>collect(chunk));child.stderr.setEncoding('utf8').on('data',chunk=>collect(chunk,true));child.stdin.on('error',()=>{});child.stdin.end(options.input);
    child.once('error',reject);child.once('close',code=>code===0?resolvePromise({stdout,stderr}):reject(Object.assign(new Error(`Builder command failed (exit ${code})`),{stdout,stderr})));
  });
}
const safeName=(name:string)=>name.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,64)||'cartridge';
export async function exportReferences(store:Store,directory:string,ownerId?:string){
  await mkdir(directory,{recursive:true});let bytes=0;
  const write=async(name:string,source:string)=>{bytes+=Buffer.byteLength(source);if(bytes>32_000_000)throw new Error('Cartridge reference collection exceeds 32 MB');await writeFile(join(directory,name),source,{flag:'wx',mode:0o444});};
  for(const file of (await readdir('games')).filter(f=>f.endsWith('.ts')).sort())await write(file,await readFile(join('games',file),'utf8'));
  // All saved source versions, with readable names and immutable ids. No index.
  let after='';for(;;){const rows=await store.query("SELECT v.id,v.game_id,v.manifest,v.source FROM versions v JOIN games g ON g.id=v.game_id WHERE v.id>$1 AND (v.visibility='public' OR g.owner_id=$2) ORDER BY v.id LIMIT 64",[after,ownerId??null]);
    for(const row of rows){if(!/^[a-f0-9]{64}$/.test(row.id))throw new Error('Invalid saved version id');await write(`${safeName(row.manifest.meta.title)}--${safeName(row.game_id)}--${row.id}.ts`,row.source);}
    if(rows.length<64)break;after=rows.at(-1).id;
  }
}

export async function prepareBuildDirectory(store:Store, directory:string, input:BuildInput) {
  for(const dir of ['input','media','references'])await mkdir(join(directory,dir));
  await exportReferences(store,join(directory,'references'),input.ownerId);
  await writeFile(join(directory,'input','brief.json'),JSON.stringify({...input.brief,gameId:input.gameId}));
  await writeFile(join(directory,'input','request.txt'),input.prompt);
  if(input.session){validateSession(input.session);await writeFile(join(directory,'input','session.json'),JSON.stringify(input.session));}
  if(input.witnesses)await writeFile(join(directory,'input','witnesses.json'),JSON.stringify(input.witnesses));
  if(input.feedback)await writeFile(join(directory,'input','feedback.json'),JSON.stringify(input.feedback));
  if(input.parent)await writeFile(join(directory,'input','parent.ts'),input.parent);
  const media=[];for(const asset of input.assets){const file=`${asset.hash}.png`;await writeFile(join(directory,'media',file),await store.assetBytes(asset));media.push({name:asset.name,file,width:asset.width,height:asset.height});}
  const soundtrack=input.music as {hash:string;url:string;name:string}|null;
  if(soundtrack)await writeFile(join(directory,'media',`${soundtrack.hash}.wav`),await store.assetBytes(soundtrack));
  if(input.icon)await writeFile(join(directory,'media',`${input.icon.hash}.png`),await store.assetBytes(input.icon));
  await writeFile(join(directory,'input','media.json'),JSON.stringify({assets:media,music:soundtrack?{...soundtrack,file:`${soundtrack.hash}.wav`}:null,icon:input.icon?{...input.icon,file:`${input.icon.hash}.png`}:null}));
}

export function validateSession(session:CodexSession){
  if(!session||!/^[-a-f0-9]{36}$/.test(session.threadId)||!Array.isArray(session.files)||session.files.length>8||Buffer.byteLength(JSON.stringify(session))>1_600_000)throw Error('Invalid Codex session');
  for(const file of session.files){
    if(!/^sessions\/\d{4}\/\d{2}\/\d{2}\/rollout-[a-zA-Z0-9_.-]+\.jsonl$/.test(file.path)||typeof file.text!=='string'||!file.path.includes(session.threadId))throw Error('Invalid Codex session file');
  }
}
