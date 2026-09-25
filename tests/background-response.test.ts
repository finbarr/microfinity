import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import {backgroundResponse} from '../server/background-response';

const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
const reply=(status:string,extra:Record<string,unknown>={})=>new Response(JSON.stringify({id:'resp-fixture',object:'response',status,model:'gpt-6-astra',output:[],...extra}),{headers:{'content-type':'application/json'}});
const body={model:'gpt-6-astra',input:'Build a game',reasoning:{effort:'high' as const},max_output_tokens:13000};
const client=(fetcher:typeof fetch)=>new OpenAI({apiKey:'fixture-only',timeout:60000,maxRetries:0,fetch:fetcher});

test('a reasoning run can exceed 150 seconds without restarting generation',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let elapsed=0,creates=0,polls=0,settled=false;
  const api=client(async(url,init)=>{
    if(init?.method==='POST'){
      creates++;assert.deepEqual(JSON.parse(String(init.body)),{...body,background:true,store:false});
      return reply('queued');
    }
    polls++;assert.match(String(url),/\/responses\/resp-fixture$/);
    return elapsed<180000?reply('in_progress'):reply('completed',{output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'{"ok":true}',annotations:[]}]}]});
  });
  const result=backgroundResponse(api,body,new AbortController().signal).finally(()=>{settled=true;});
  await flush();
  for(let i=0;i<90;i++){
    elapsed+=2000;t.mock.timers.tick(2000);await flush();
    if(elapsed===152000)assert.equal(settled,false,'work survives the previous 150-second cutoff');
  }
  assert.equal((await result).output_text,'{"ok":true}');
  assert.equal(creates,1);assert.equal(polls,90);
});

test('deadline cancellation stops the remote job without sending an aborted signal',async()=>{
  const abort=new AbortController();let creates=0,cancels=0;
  const api=client(async(url,init)=>{
    if(String(url).endsWith('/cancel')){
      cancels++;assert.equal(init?.signal?.aborted,false);return reply('cancelled');
    }
    creates++;return reply('queued');
  });
  const result=backgroundResponse(api,body,abort.signal);
  const rejection=assert.rejects(result,/Fixture deadline/);
  await flush();abort.abort(new Error('Fixture deadline'));
  await rejection;assert.equal(creates,1);assert.equal(cancels,1);
});

test('a late creation response is cancelled when an adapter ignored the deadline',async()=>{
  const abort=new AbortController();let finish!:(value:Response)=>void,cancels=0;
  const api={responses:{create:()=>new Promise<Response>(resolve=>{finish=resolve;}),cancel:async()=>{cancels++;}}} as unknown as OpenAI;
  const result=backgroundResponse(api,body,abort.signal);
  const rejection=assert.rejects(result,/Fixture deadline|abort/i);
  await flush();abort.abort(new Error('Fixture deadline'));finish(await reply('queued').json());
  await rejection;assert.equal(cancels,1);
});

test('failed status polling cancels existing work and does not duplicate the generation',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let creates=0,cancels=0;
  const api=client(async(url,init)=>{
    if(String(url).endsWith('/cancel')){cancels++;return reply('cancelled');}
    if(init?.method==='POST'){creates++;return reply('in_progress');}
    return new Response(JSON.stringify({error:{message:'Polling unavailable'}}),{status:503,headers:{'content-type':'application/json'}});
  });
  const rejection=assert.rejects(backgroundResponse(api,body,new AbortController().signal),/Polling unavailable/);
  await flush();t.mock.timers.tick(2000);await rejection;
  assert.equal(creates,1);assert.equal(cancels,1);
});

test('terminal provider failures are returned without polling or cancellation',async()=>{
  let calls=0;
  const api=client(async()=>{calls++;return reply('incomplete',{incomplete_details:{reason:'max_output_tokens'}});});
  const result=await backgroundResponse(api,body,new AbortController().signal);
  assert.equal(result.status,'incomplete');assert.equal(result.incomplete_details?.reason,'max_output_tokens');assert.equal(calls,1);
});

test('a phase deadline cancels pending background work without aborting the turn', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  const parent = new AbortController();
  let cancels = 0, polls = 0;
  const api = client(async (url, init) => {
    if (String(url).endsWith('/cancel')) {
      cancels++;
      assert.equal(init?.signal?.aborted, false);
      return reply('cancelled');
    }
    if (init?.method !== 'POST') polls++;
    return reply('in_progress');
  });
  const rejection = assert.rejects(backgroundResponse(api, body, parent.signal, {
    timeoutMs: 6000, message: 'Music generation exceeded its deadline',
  }), /Music generation exceeded its deadline/);
  await flush();
  for (let i = 0; i < 3; i++) {t.mock.timers.tick(2000); await flush();}
  await rejection;
  assert.equal(polls, 2);
  assert.equal(cancels, 1);
  assert.equal(parent.signal.aborted, false, 'The next music attempt can still run');
});
