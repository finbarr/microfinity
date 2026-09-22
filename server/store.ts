import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { Metadata, Game } from '../sdk/index';
export const hash=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
export const id=()=>randomBytes(12).toString('hex');
export type Asset={name:string;hash:string;url:string;width:number;height:number;provenance?:unknown};
export type Manifest={id:string;gameId:string;meta:Metadata;sdkVersion:string;runtimeVersion:string;runtimeUrl?:string;codeHash:string;assets:Asset[];icon?:Asset;audio?:Game['audio'];music?:unknown;provenance:Record<string,unknown>;createdAt:string};
export type Version={id:string;game_id:string;manifest:Manifest;source:string;code:string};
export class Store {
  private db:PGlite|pg.Pool;
  constructor(private root=resolve(process.env.DATA_DIR??'data'),url=process.env.DATABASE_URL){mkdirSync(root,{recursive:true});this.db=url?new pg.Pool({connectionString:url}):new PGlite(resolve(root,'db'));}
  async init(){
    await mkdir(resolve(this.root,'assets'),{recursive:true});const sql=await readFile('server/migrations/001.sql','utf8');if(this.db instanceof PGlite)await this.db.exec(sql);else await this.db.query(sql);
    await this.query("UPDATE matches SET status='interrupted',record=record || $1::jsonb WHERE status='playing'",[JSON.stringify({termination:{kind:'interrupted',reason:'server-restart'},finishedAt:Date.now()})]);
    await this.query("UPDATE round_attempts SET status='interrupted',reason='server-restart',ended_at=now() WHERE status IN ('preparing','playing')");
    for(const row of await this.query("SELECT id,record FROM jobs WHERE status='working'")){
      const record={...row.record,status:'failed',error:'Creation was interrupted by a server restart. Retry to create a new version.',finishedAt:Date.now(),branches:Object.fromEntries(Object.entries(row.record.branches??{}).map(([k,v])=>[k,['pending','working'].includes(String(v))?'interrupted':v]))};
      await this.query("UPDATE jobs SET status='failed',record=$1 WHERE id=$2",[JSON.stringify(record),row.id]);
    }
  }
  async query<T=any>(sql:string,params:any[]=[]):Promise<T[]>{const result=this.db instanceof PGlite?await this.db.query(sql,params):await this.db.query(sql,params);return result.rows as T[];}
  private async transaction<T>(operation:(query:(sql:string,params?:any[])=>Promise<unknown>)=>Promise<T>):Promise<T>{
    if(this.db instanceof PGlite)return this.db.transaction(tx=>operation((sql,params)=>tx.query(sql,params)));
    const client=await this.db.connect();try{await client.query('BEGIN');const result=await operation((sql,params)=>client.query(sql,params));await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }
  async guest(token?:string,name='Player') {
    if(token){const existing=await this.query('SELECT id,name FROM guests WHERE token_hash=$1',[hash(token)]);if(existing[0])return {...existing[0],token};}
    const guest={id:id(),name:name.trim().slice(0,24)||'Player',token:randomBytes(32).toString('base64url')};
    await this.query('INSERT INTO guests(id,token_hash,name) VALUES($1,$2,$3)',[guest.id,hash(guest.token),guest.name]);return guest;
  }
  async authenticate(token:string){const [guest]=await this.query('SELECT id,name FROM guests WHERE token_hash=$1',[hash(token)]);if(!guest)throw new Error('Invalid guest session');return guest as {id:string;name:string};}
  async putVersion(source:string,code:string,meta:Metadata,assets:Asset[]=[],music:unknown=null,provenance:Record<string,unknown>={},ownerId?:string,pinned?:{runtime:string;sdkVersion:string},audio?:Game['audio'],guard?:()=>void,icon?:Asset){
    guard?.();
    const {bootstrap}=await import('./compiler'),runtimeSource=pinned?.runtime??await bootstrap(),runtime=await this.putAsset(Buffer.from(runtimeSource),'js'),sdkVersion=pinned?.sdkVersion??'1.0.0';
    // Readiness is immutable too: fast media branches can finish before code,
    // leaving a preview with identical bytes to the subsequent publication.
    const publication=provenance.draft===true?'draft':'ready';
    const versionId=hash(JSON.stringify({source,code,meta,assets,music,audio,publication,sdk:sdkVersion,runtime:runtime.hash,...(icon?{icon}:{})}));
    const manifest:Manifest={id:versionId,gameId:meta.id,meta,sdkVersion,runtimeVersion:runtime.hash,runtimeUrl:runtime.url,codeHash:hash(code),assets,...(icon?{icon}:{}),...(audio?{audio}:{}),music,provenance,createdAt:new Date().toISOString()};
    await this.transaction(async query=>{
      guard?.();await query('INSERT INTO games(id,owner_id,title) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[meta.id,ownerId??null,meta.title]);
      guard?.();await query('INSERT INTO versions(id,game_id,manifest,source,code) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[versionId,meta.id,JSON.stringify(manifest),source,code]);guard?.();
    });return this.version(versionId);
  }
  async version(versionId:string):Promise<Version>{const [v]=await this.query<Version>('SELECT * FROM versions WHERE id=$1',[versionId]);if(!v)throw new Error('Cartridge version not found');return v;}
  async library(){return this.query<{manifest:Manifest}>('SELECT DISTINCT ON (game_id) manifest FROM versions ORDER BY game_id,created_at DESC');}
  async runtime(version:Version){const file=version.manifest.runtimeVersion==='1.0.0'?'runtime-legacy-1.0.0.js':`${version.manifest.runtimeVersion}.js`;return readFile(resolve(this.root,'assets',file),'utf8');}
  async putAsset(bytes:Buffer,extension:'png'|'wav'|'webp'|'js') {
    const digest=hash(bytes),file=`${digest}.${extension}`,path=resolve(this.root,'assets',file);
    try{await access(path);}catch{await writeFile(path,bytes,{flag:'wx'});}return {hash:digest,url:`/assets/${file}`};
  }
  async finishRound(matchId:string,round:number,versionId:string,records:{playerId:string;guestId?:string;score:number;partition:string;[key:string]:unknown}[],matchRecord?:unknown){
    await this.transaction(async query=>{
      for(const record of records)await query('INSERT INTO results(id,match_id,version_id,guest_id,score,partition_key,record) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO NOTHING',[
        `${matchId}:${round}:${record.playerId}`,matchId,versionId,record.guestId??null,record.score,record.partition,JSON.stringify(record)]);
      if(matchRecord){await query("UPDATE matches SET record=$1 WHERE id=$2",[JSON.stringify(matchRecord),matchId]);await query("UPDATE round_attempts SET status='complete',reason='rules-finished',ended_at=now() WHERE match_id=$1 AND round_index=$2",[matchId,round]);}
    });
  }
  async close(){if(this.db instanceof PGlite)await this.db.close();else await this.db.end();}
}
