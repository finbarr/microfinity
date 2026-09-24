import 'dotenv/config';
import {Store} from './store';
import {Projects, ProjectWorker} from './projects';

if(!process.env.DATABASE_URL)throw Error('A separate builder worker requires DATABASE_URL. Local PGlite uses the embedded worker.');
const store=new Store();
await store.init({recoverMatches:false});
const worker=new ProjectWorker(new Projects(store));
worker.start();
console.log('Builder worker ready',worker.workerId);
let closing=false;
async function close(){if(closing)return;closing=true;await worker.close();await store.close();}
process.once('SIGINT',()=>void close());
process.once('SIGTERM',()=>void close());
