import 'dotenv/config';
import {access,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Store,type Version} from '../server/store';
import {bundledCartridgeIcon,generateCartridgeIcon} from '../server/cartridge-icons';
import {GenerationBudget,generationLimits} from '../server/generation-budget';

type Candidate=Version&{owner_id:string|null};
export type BackfillOptions={limit:number;dryRun?:boolean;gameId?:string;generate?:typeof generateCartridgeIcon;log?:(message:string)=>void};

/** Each run selects only the newest ready, icon-less version of each game. */
export async function backfillCartridgeIcons(store:Store,options:BackfillOptions){
  const log=options.log??console.log;
  if(!Number.isInteger(options.limit)||options.limit<1||options.limit>100)throw new Error('--limit must be between 1 and 100');
  const builtins=new Set((await readdir('games')).filter(name=>name.endsWith('.ts')).map(name=>name.slice(0,-3)));
  const rows=await store.query<Candidate>(`SELECT latest.* FROM (
    SELECT DISTINCT ON (v.game_id) v.*,g.owner_id FROM versions v JOIN games g ON g.id=v.game_id
    WHERE v.manifest->'provenance'->>'draft' IS DISTINCT FROM 'true'
    ORDER BY v.game_id,v.created_at DESC
  ) latest WHERE latest.manifest->'icon' IS NULL AND ($2::text IS NULL OR latest.game_id=$2)
  ORDER BY CASE WHEN latest.manifest->'provenance'->>'kind'='reference' THEN 1 ELSE 0 END,latest.game_id LIMIT $1`,[options.limit,options.gameId??null]);
  const result={scanned:rows.length,created:0,skipped:0,failed:0};
  for(const prior of rows){
    const builtin=builtins.has(prior.game_id);
    let hasBundle=false;
    if(builtin)try{await access(join('games','icons',`${prior.game_id}.png`));hasBundle=true;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(builtin&&!hasBundle){log(`Skip ${prior.game_id}: bundled icon has not arrived`);result.skipped++;continue;}
    if(options.dryRun){log(`Would publish icon-only successor for ${prior.game_id} (${builtin?'bundled':'image model'})`);continue;}
    let budget:GenerationBudget|undefined;
    try{
      let icon=hasBundle?await bundledCartridgeIcon(store,prior.game_id):undefined;
      if(!icon){
        if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY is not configured');
        budget=new GenerationBudget(generationLimits());
        const generated=await budget.run(()=> (options.generate??generateCartridgeIcon)(store,{title:prior.manifest.meta.title,premise:prior.manifest.meta.description,rules:prior.manifest.meta.rules,style:prior.manifest.meta.style},{signal:budget!.signal,reserve:(body,tokens,image)=>budget!.reserve(body,tokens,image)}));
        icon=generated.icon;
      }
      const pinned={runtime:await store.runtime(prior),sdkVersion:prior.manifest.sdkVersion};
      const version=await store.putVersion(prior.source,prior.code,prior.manifest.meta,prior.manifest.assets,prior.manifest.music,{...prior.manifest.provenance,draft:false,icon:'ready',iconBackfill:{fromVersion:prior.id}},prior.owner_id??undefined,pinned,prior.manifest.audio,()=>budget?.check(),icon);
      log(`Published ${prior.game_id}: ${version.id}`);result.created++;
    }catch(error){log(`Failed ${prior.game_id}: ${(error as Error).message}`);result.failed++;}
    finally{budget?.dispose();}
  }
  return result;
}

function argumentsFrom(argv:string[]){
  let dataDir='',limit=10,dryRun=false,gameId:string|undefined;
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--data-dir')dataDir=argv[++i]??'';
    else if(arg==='--limit')limit=Number(argv[++i]);
    else if(arg==='--game-id')gameId=argv[++i];
    else if(arg==='--dry-run')dryRun=true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if(!dataDir)throw new Error('Pass --data-dir PATH for the existing local PGlite data directory');
  if(gameId&&!/^[a-z0-9-]+$/.test(gameId))throw new Error('Invalid --game-id');
  return {dataDir:resolve(dataDir),limit,dryRun,gameId};
}

if(process.argv[1]?.endsWith('backfill-cartridge-icons.ts')){
  const args=argumentsFrom(process.argv.slice(2));
  await access(join(args.dataDir,'db'));
  // An explicit local path and empty URL prevent .env DATABASE_URL from targeting a live server.
  const store=new Store(args.dataDir,'');
  try{const result=await backfillCartridgeIcons(store,args);console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;}
  finally{await store.close();}
}
