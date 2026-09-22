/** Run only with the local server stopped, so this process exclusively owns PGlite. */
import 'dotenv/config';
import {mkdir,writeFile} from 'node:fs/promises';import {Store} from '../server/store';
const store=new Store();await store.init();await mkdir('evidence/generation',{recursive:true});await mkdir('evidence/matches',{recursive:true});await mkdir('artifacts/cartridges',{recursive:true});
try{
  const jobs=await store.query('SELECT id,record FROM jobs ORDER BY created_at');
  for(const {id,record} of jobs){await writeFile(`evidence/generation/${id}.json`,JSON.stringify(record,null,2));if(record.finishedVersion||record.previewVersion){const version=await store.version(record.finishedVersion??record.previewVersion);await writeFile(`artifacts/cartridges/${version.manifest.gameId}.json`,JSON.stringify({...version,runtime:await store.runtime(version)},null,2));}}
  const matches=await store.query("SELECT id,status,record FROM matches WHERE status<>'playing' ORDER BY created_at");for(const match of matches)await writeFile(`evidence/matches/${match.id}.json`,JSON.stringify(match,null,2));
  console.log(`Exported ${jobs.length} generation records and ${matches.length} completed/interrupted matches.`);
}finally{await store.close();}
