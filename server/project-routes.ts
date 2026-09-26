import {Router, type Request} from 'express';
import {z} from 'zod';
import type {Projects} from './projects';

export function projectRoutes(projects: Projects, auth: (request: Request) => Promise<{id: string}>) {
  const app = Router();
  app.get('/',async(req,res)=>res.json(await projects.list((await auth(req)).id)));
  app.post('/',async(req,res)=>res.json(await projects.create((await auth(req)).id,req.body)));
  app.get('/:id',async(req,res)=>{res.setHeader('Cache-Control','no-store');res.json(await projects.get(req.params.id,(await auth(req)).id));});
  app.post('/:id/turns',async(req,res)=>res.json(await projects.submit(req.params.id,(await auth(req)).id,req.body)));
  app.post('/:id/build',async(req,res)=>res.json(await projects.build(req.params.id,(await auth(req)).id,req.body)));
  app.post('/:id/turns/:turn/cancel',async(req,res)=>res.json(await projects.cancel(req.params.id,(await auth(req)).id,req.params.turn)));
  app.post('/:id/select',async(req,res)=>res.json(await projects.select(req.params.id,(await auth(req)).id,req.body.revisionId)));
  app.post('/:id/publish',async(req,res)=>res.json(await projects.publish(req.params.id,(await auth(req)).id,req.body.revisionId)));
  app.get('/:id/events',async(req,res)=>{
    const owner=(await auth(req)).id;
    await projects.owned(req.params.id,owner);
    let cursor=z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(req.query.after??0),closed=false;
    res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('X-Accel-Buffering','no');res.flushHeaders();
    res.on('close',()=>{closed=true;});
    while(!closed){
      try{
        const events=await projects.events(req.params.id,owner,cursor);
        for(const event of events){if(closed)break;res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);cursor=Number(event.id);}
        if(!events.length)res.write(': keepalive\n\n');
        if(res.writableLength>256000)break;
      }catch{break;}
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    res.end();
  });
  return app;
}
