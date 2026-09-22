import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { resolve } from 'node:path';
import { Store } from './store';
import { Room, roomRequestSchema } from './rooms';
import { selectPlaylist } from './playlists';
import { bootstrap } from './compiler';
import { seed } from '../scripts/seed';
import { z } from 'zod';
import { gameStats,creationStats } from './stats';
import {getMatch,listMatches,recordReplayPlay} from './matches';
import { GenerationService } from './generation';
import {ratingSummaries,playedRatings,rateCartridge} from './ratings';
import {attachSession} from './socket-session';

const store=new Store();await store.init();if(!(await store.library()).length)await seed(store);
const app=express(),server=createServer(app),rooms=new Map<string,Room>();let stopping=false;
app.use((_req,res,next)=>{if(stopping){res.status(503).json({error:'The server is restarting. Try again shortly.'});return;}next();});
app.disable('x-powered-by');app.use(express.json({limit:'120kb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');next();});
app.use('/assets',express.static(resolve(process.env.DATA_DIR??'data','assets'),{immutable:true,maxAge:'1y'}));
app.get('/api/health',(_req,res)=>res.json({ok:true}));
app.post('/api/guest',async(req,res)=>{const input=z.object({token:z.string().max(100).optional(),name:z.string().max(24).optional()}).parse(req.body);res.json(await store.guest(input.token,input.name));});
app.get('/api/library',async(_req,res)=>res.json((await store.library()).map(v=>v.manifest)));
app.get('/api/versions/:id',async(req,res)=>res.json(await store.version(req.params.id)));
app.get('/api/runtime',async(_req,res)=>res.type('application/javascript').send(await bootstrap()));
const auth=async(req:express.Request)=>store.authenticate(req.headers.authorization?.replace(/^Bearer /,'')??'');
app.get('/api/ratings',async(_req,res)=>res.json(await ratingSummaries(store)));
app.get('/api/matches/:id/ratings',async(req,res)=>{const guest=await auth(req);res.json(await playedRatings(store,req.params.id,guest.id));});
app.post('/api/ratings',async(req,res)=>{const guest=await auth(req);res.json(await rateCartridge(store,guest.id,req.body));});
app.post('/api/guest/name',async(req,res)=>{const guest=await auth(req),name=z.string().trim().min(1).max(24).parse(req.body.name);await store.query('UPDATE guests SET name=$1 WHERE id=$2',[name,guest.id]);res.json({name});});
const generation=new GenerationService(store);
app.post('/api/jobs',async(req,res)=>{const guest=await auth(req),body=z.object({prompt:z.string().min(12).max(2000),art:z.boolean().optional(),remix:z.string().optional(),reuseMusic:z.boolean().optional(),musicOnly:z.boolean().optional(),mediaOnly:z.boolean().optional(),format:z.object({clock:z.enum(['realtime','action']).optional(),minPlayers:z.number().int().min(1).max(4).optional(),maxPlayers:z.number().int().min(1).max(4).optional()}).optional()}).parse(req.body);res.json(await generation.create(guest.id,body.prompt,body));});
app.get('/api/jobs',async(req,res)=>{const guest=await auth(req);res.json(await store.query("SELECT id,status,record->>'title' AS title,record->>'prompt' AS prompt,record->>'previewVersion' AS version FROM jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 30",[guest.id]));});
app.get('/api/jobs/:id',async(req,res)=>{const guest=await auth(req);res.json(await generation.get(req.params.id,guest.id));});
app.post('/api/rooms',async(req,res)=>{
  const guest=await auth(req),input=roomRequestSchema.parse(req.body);
  const selection=input.random?selectPlaylist((await store.library()).map(v=>v.manifest),input.settings,input.random):undefined;
  const versions=await Promise.all((selection?.versions??input.versions??[]).map(v=>store.version(v))),room=new Room(store,guest.id,versions,input.settings,selection);rooms.set(room.id,room);res.json({id:room.id,selection:selection??null});
});
app.get('/api/challenges/:id',async(req,res)=>{const [challenge]=await store.query('SELECT id,title,definition FROM challenges WHERE id=$1',[req.params.id]);if(!challenge){res.status(404).json({error:'Challenge not found'});return;}const {seed,...publicSettings}=challenge.definition.settings;res.json({...challenge,definition:{...challenge.definition,settings:publicSettings}});});
app.post('/api/challenges/:id/play',async(req,res)=>{const guest=await auth(req),[challenge]=await store.query('SELECT * FROM challenges WHERE id=$1',[req.params.id]);if(!challenge)throw new Error('Challenge not found');const versions=await Promise.all(challenge.definition.versions.map((v:string)=>store.version(v))),room=new Room(store,guest.id,versions,challenge.definition.settings,challenge.definition.selection);room.challengeId=challenge.id;rooms.set(room.id,room);res.json({id:room.id});});
app.get('/api/stats/:version',async(req,res)=>{const partition=z.string().length(64).optional().parse(req.query.partition),method=z.enum(['all','keyboard','virtual-pad','mixed','none']).default('all').parse(req.query.method);res.json(await gameStats(store,req.params.version,partition,method));});
app.get('/api/creation-stats',async(req,res)=>{const guest=await auth(req);res.json(await creationStats(store,guest.id));});
app.get('/api/matches',async(req,res)=>{const guest=await auth(req);res.json(await listMatches(store,guest.id));});
app.get('/api/matches/:id',async(req,res)=>{const guest=await auth(req);res.json(await getMatch(store,req.params.id,guest.id));});
app.post('/api/matches/:id/replay',async(req,res)=>{const guest=await auth(req);res.json(await recordReplayPlay(store,req.params.id,guest.id));});
const wss=new WebSocketServer({server,path:'/socket',maxPayload:16_384});
const roomCleanup=setInterval(()=>{for(const [id,room] of rooms)if(room.isExpired()){rooms.delete(id);void room.close('room-expired').catch(e=>console.error('Room cleanup failed',e.message));}},30000);roomCleanup.unref();
wss.on('connection',(ws,request)=>{
  if(stopping){ws.close(1001,'server-shutdown');return;}
  const origin=request.headers.origin;
  try{if(origin&&new URL(origin).host!==request.headers.host)throw new Error('Wrong origin');}
  catch{ws.close(4003,'Wrong origin');return;}
  attachSession(ws,{authenticate:token=>store.authenticate(token),findRoom:id=>rooms.get(id)});
});
app.use('/api',(_req,res)=>res.status(404).json({error:'Unknown API route'}));
app.use((error:Error,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{console.error(error.name,error.message.slice(0,300));res.status(400).json({error:error.message.slice(0,1000)});});
if(process.env.NODE_ENV==='production'){app.use(express.static(resolve('dist/client')));app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/client/index.html')));}
else {const {createServer:createViteServer}=await import('vite');const vite=await createViteServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
const port=Number(process.env.PORT)||3000;server.listen(port,'0.0.0.0',()=>console.log(`Microfinity is ready: http://localhost:${port}`));
async function shutdown(){if(stopping)return;stopping=true;server.close();clearInterval(roomCleanup);await Promise.allSettled([...rooms.values()].map(room=>room.close()));for(const ws of wss.clients)ws.terminate();wss.close();server.close();await store.close();process.exit(0);}process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
