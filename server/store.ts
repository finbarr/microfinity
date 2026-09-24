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
  async init(options:{recoverMatches?:boolean}={}){
    const lock=this.db instanceof pg.Pool?await this.db.connect():undefined;
    try{
      if(lock)await lock.query('SELECT pg_advisory_lock(74918302)');
    await mkdir(resolve(this.root,'assets'),{recursive:true});const sql=await readFile('server/migrations/001.sql','utf8');if(this.db instanceof PGlite)await this.db.exec(sql);else await this.db.query(sql);
    if(options.recoverMatches!==false)await this.query("UPDATE matches SET status='interrupted',record=record || $1::jsonb WHERE status='playing'",[JSON.stringify({termination:{kind:'interrupted',reason:'server-restart'},finishedAt:Date.now()})]);
    if(options.recoverMatches!==false)await this.query("UPDATE round_attempts SET status='interrupted',reason='server-restart',ended_at=now() WHERE status IN ('preparing','playing')");
    const projectsSql=await readFile('server/migrations/002-projects.sql','utf8');
    if(this.db instanceof PGlite)await this.db.exec(projectsSql);else await this.db.query(projectsSql);
    // Only formerly public cartridge assets are public. Draft/checkpoint files remain private.
    for(const {manifest} of await this.query<{manifest:Manifest}>("SELECT manifest FROM versions WHERE visibility='public'")){
      for(const file of this.manifestFiles(manifest))await this.query('INSERT INTO stored_assets(file,public) VALUES($1,true) ON CONFLICT(file) DO UPDATE SET public=true',[file]);
    }
    }finally{if(lock){await lock.query('SELECT pg_advisory_unlock(74918302)');lock.release();}}
  }
  async query<T=any>(sql:string,params:any[]=[]):Promise<T[]>{const result=this.db instanceof PGlite?await this.db.query(sql,params):await this.db.query(sql,params);return result.rows as T[];}
  async transaction<T>(operation:(query:(sql:string,params?:any[])=>Promise<any[]>)=>Promise<T>):Promise<T>{
    if(this.db instanceof PGlite)return this.db.transaction(tx=>operation(async(sql,params)=>(await tx.query(sql,params)).rows));
    const client=await this.db.connect();try{await client.query('BEGIN');const result=await operation(async(sql,params)=>(await client.query(sql,params)).rows);await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
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
    const version={id:versionId,game_id:meta.id,manifest,source,code};
    await this.transaction(async query=>{guard?.();await this.insertVersion(query,version,ownerId,provenance.draft===true);guard?.();});
    return this.version(versionId);
  }
  async insertVersion(query:(sql:string,params?:any[])=>Promise<any[]>,version:Version,ownerId?:string,isPrivate=false){
    await query('INSERT INTO games(id,owner_id,title) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING',[version.game_id,ownerId??null,version.manifest.meta.title]);
    const [game]=await query('SELECT owner_id FROM games WHERE id=$1',[version.game_id]);
    if(isPrivate&&game.owner_id!==(ownerId??null))throw Error('Game belongs to another creator');
    await query('INSERT INTO versions(id,game_id,manifest,source,code,visibility) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',[version.id,version.game_id,JSON.stringify(version.manifest),version.source,version.code,isPrivate?'private':'public']);
    if(!isPrivate){
      await query("UPDATE versions SET visibility='public' WHERE id=$1",[version.id]);
      await query('UPDATE games SET published_version=$1 WHERE id=$2',[version.id,version.game_id]);
      for(const file of this.manifestFiles(version.manifest))await query('INSERT INTO stored_assets(file,public) VALUES($1,true) ON CONFLICT(file) DO UPDATE SET public=true',[file]);
    }
  }

  async version(versionId:string):Promise<Version>{const [v]=await this.query<Version>('SELECT * FROM versions WHERE id=$1',[versionId]);if(!v)throw new Error('Cartridge version not found');return v;}
  async library(){return this.query<{manifest:Manifest}>("SELECT v.manifest FROM games g JOIN versions v ON v.id=g.published_version WHERE v.visibility='public' ORDER BY v.created_at DESC");}
  async visibleVersion(versionId:string,ownerId?:string){
    const [row]=await this.query<Version>("SELECT v.* FROM versions v JOIN games g ON g.id=v.game_id WHERE v.id=$1 AND (v.visibility='public' OR g.owner_id=$2)",[versionId,ownerId??null]);
    if(!row)throw new Error('Cartridge version not found');return row;
  }
  manifestFiles(manifest:Manifest){
    return [...manifest.assets,manifest.icon,manifest.music as any,{url:manifest.runtimeUrl}].filter(Boolean).map(a=>a.url?.replace(/^\/assets\//,'')).filter((file):file is string=>typeof file==='string'&&/^[a-f0-9]{64}\.(png|wav|webp|js)$/.test(file));
  }
  async canReadAsset(file:string,ownerId?:string){
    if(file==='runtime-legacy-1.0.0.js')return true;
    if(!/^[a-f0-9]{64}\.(png|wav|webp|js)$/.test(file))return false;
    return !!(await this.query('SELECT a.file FROM stored_assets a WHERE a.file=$1 AND (a.public OR EXISTS (SELECT 1 FROM project_assets pa JOIN projects p ON p.id=pa.project_id WHERE pa.file=a.file AND p.owner_id=$2))',[file,ownerId??null])).length;
  }
  async grantAsset(projectId:string,file:string){
    if(!/^[a-f0-9]{64}\.(png|wav|webp|js)$/.test(file))throw Error('Invalid asset file');
    await this.query('INSERT INTO stored_assets(file) VALUES($1) ON CONFLICT DO NOTHING',[file]);
    await this.query('INSERT INTO project_assets(project_id,file) VALUES($1,$2) ON CONFLICT DO NOTHING',[projectId,file]);
  }
  assetPath(file:string){if(!/^(?:[a-f0-9]{64}\.(png|wav|webp|js)|runtime-legacy-1.0.0.js)$/.test(file))throw Error('Invalid asset file');return resolve(this.root,'assets',file);}

  async runtime(version:Version){const file=version.manifest.runtimeVersion==='1.0.0'?'runtime-legacy-1.0.0.js':`${version.manifest.runtimeVersion}.js`;return readFile(resolve(this.root,'assets',file),'utf8');}
  async putAsset(bytes:Buffer,extension:'png'|'wav'|'webp'|'js',projectId?:string) {
    const digest=hash(bytes),file=`${digest}.${extension}`,path=resolve(this.root,'assets',file);
    try{await access(path);}catch{await writeFile(path,bytes,{flag:'wx'}).catch(error=>{if(error.code!=='EEXIST')throw error;});}
    await this.query('INSERT INTO stored_assets(file,public) VALUES($1,$2) ON CONFLICT(file) DO UPDATE SET public=stored_assets.public OR EXCLUDED.public',[file,!projectId]);
    if(projectId)await this.grantAsset(projectId,file);return {hash:digest,url:`/assets/${file}`};
  }
  async assetBytes(asset:{hash:string;url:string}){
    if(!/^[a-f0-9]{64}$/.test(asset.hash)||!new RegExp(`^/assets/${asset.hash}\\.(png|wav|webp)$`).test(asset.url))throw new Error('Invalid stored asset');
    const bytes=await readFile(resolve(this.root,'assets',asset.url.slice('/assets/'.length)));if(hash(bytes)!==asset.hash)throw new Error('Stored asset hash mismatch');return bytes;
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
