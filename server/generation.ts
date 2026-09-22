import OpenAI from 'openai';
import {normalizeSprite} from './image-assets';
import { readFile } from 'node:fs/promises';
import { Store, id, hash, type Asset, type Version } from './store';
import { compileIsolated } from './compile-process';
import type {Score} from '../runtime/music';
import {prepareMusic,symbolicMusicAdapter,type MusicGenerationAdapter} from './music-generation';
export {wavBuffer} from './music-assets';
import { z } from 'zod';
import {GenerationBudget,generationLimits,type GenerationLimits,type GenerationUsage} from './generation-budget';
export type GameFormat={clock?:'realtime'|'action';minPlayers?:number;maxPlayers?:number};
type Branch='brief'|'code'|'art'|'music';
export type CreationOptions={art?:boolean;remix?:string;musicOnly?:boolean;mediaOnly?:boolean;reuseMusic?:boolean;format?:GameFormat};
export type Job={id:string;ownerId:string;prompt:string;title?:string;status:'working'|'ready'|'failed';branches:Record<Branch,string>;startedAt:number;finishedAt?:number;previewVersion?:string;previewArt?:Asset[];previewMusic?:unknown;finishedVersion?:string;error?:string;attempts:{attempt:number;error?:string;source:string}[];timings:Record<string,number>;models:Record<string,string>;usage:unknown[];brief?:any;remix?:string;musicOnly?:boolean;mediaOnly?:boolean;format?:GameFormat;reuseMusic?:boolean;musicAttempts?:{attempt:number;kind?:'score'|'audio';score?:Score;hash?:string;error?:string}[];budget?:{limits:GenerationLimits;reserved:GenerationUsage}};
const briefSchema={type:'object',properties:{title:{type:'string'},premise:{type:'string'},clock:{type:'string',enum:['realtime','action']},minPlayers:{type:'integer'},maxPlayers:{type:'integer'},style:{type:'string',enum:['pixel','cartoon','doodle','collage']},assetName:{type:'string'},assetDescription:{type:'string'},musicMood:{type:'string'}},required:['title','premise','clock','minPlayers','maxPlayers','style','assetName','assetDescription','musicMood'],additionalProperties:false};
export class GenerationService {
  private jobs=new Map<string,Job>();private runningOwners=new Set<string>();private budgets=new Map<string,GenerationBudget>();
  private readonly limits:GenerationLimits;
  constructor(private store:Store,limits:Partial<GenerationLimits>={},private providerFetch?:typeof fetch,private musicProvider?:MusicGenerationAdapter){this.limits=generationLimits(limits);}
  private budget(job:Job){const budget=this.budgets.get(job.id);if(!budget)throw new Error('Creation work is no longer active');return budget;}
  private work<T>(job:Job,operation:()=>Promise<T>|T){return this.budget(job).run(operation);}
  private trimJobs(){const finished=[...this.jobs.values()].filter(j=>j.status!=='working'&&!this.budgets.has(j.id));for(const old of finished.slice(0,Math.max(0,finished.length-this.limits.cachedJobs)))this.jobs.delete(old.id);}
  async create(ownerId:string,prompt:string,options:CreationOptions={}) {
    z.string().min(12).max(2000).parse(prompt);
    if((options.musicOnly||options.mediaOnly)&&!options.remix)throw new Error('Choose an existing cartridge before regenerating its media');
    if(options.reuseMusic&&(!options.remix||options.musicOnly||options.mediaOnly))throw new Error('Reuse music is available when remixing game rules');
    if(!process.env.OPENAI_API_KEY)throw new Error('OPENAI_API_KEY is not configured');
    if(this.runningOwners.size>=2||this.runningOwners.has(ownerId))throw new Error('A creation is already running. Let it finish first.');
    const job:Job={id:id(),ownerId,prompt,status:'working',branches:{brief:'pending',code:'pending',art:options.art===false?'skipped':'pending',music:'pending'},startedAt:Date.now(),attempts:[],timings:{},models:{},usage:[],remix:options.remix,musicOnly:options.musicOnly,mediaOnly:options.mediaOnly,format:options.format,reuseMusic:options.reuseMusic};
    // Reserve before the first await: concurrent requests must count jobs whose
    // initial database write is still pending, not just running provider calls.
    this.runningOwners.add(ownerId);this.jobs.set(job.id,job);
    try{await this.save(job);}catch(e){this.jobs.delete(job.id);this.runningOwners.delete(ownerId);throw e;}
    const budget=new GenerationBudget(this.limits);this.budgets.set(job.id,budget);job.budget={limits:{...this.limits},reserved:budget.usage};job.timings.workStartedAt=Date.now();
    void this.run(job,options.art!==false).catch(async()=>{
      // A failed terminal write must not become an unhandled rejection or keep
      // the owner locked out. Preserve a readable failure in memory and retry
      // that status once; startup recovery handles a lasting database outage.
      job.status='failed';job.finishedAt=Date.now();job.error='Creation stopped because its final status could not be saved. Any published preview remains available.';
      for(const branch of ['brief','code','art','music'] as Branch[])if(['pending','working'].includes(job.branches[branch]))job.branches[branch]='interrupted';
      try{await this.save(job);}catch{console.error('Could not persist creation status',job.id);}
    }).finally(()=>{budget.dispose();this.budgets.delete(job.id);this.runningOwners.delete(ownerId);this.trimJobs();});
    return this.publicJob(job);
  }
  async get(jobId:string,ownerId:string){const memory=this.jobs.get(jobId);if(memory){if(memory.ownerId!==ownerId)throw new Error('Job not found');return this.publicJob(memory);}const [row]=await this.store.query('SELECT record FROM jobs WHERE id=$1 AND owner_id=$2',[jobId,ownerId]);if(!row)throw new Error('Job not found');const job=row.record;if(job.status==='working'){job.status='failed';job.error='Creation was interrupted by a server restart. Retry to create a new version.';}return this.publicJob(job);}
  private publicJob(job:Job){const {attempts,...safe}=job;return {...safe,attempts:attempts.map(({attempt,error})=>({attempt,error}))};}
  private async save(job:Job){await this.store.query("INSERT INTO jobs(id,owner_id,status,record) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,record=EXCLUDED.record WHERE jobs.status='working'",[job.id,job.ownerId,job.status,JSON.stringify(job)]);}
  private async json(job:Job,model:string,name:string,schema:any,prompt:string,maxTokens=5000){
    const budget=this.budget(job),client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:150000,maxRetries:0,fetch:this.providerFetch});
    const body={model,input:prompt,max_output_tokens:maxTokens,...(model.startsWith('gpt-5')?{reasoning:{effort:'low' as const}}:{}),text:{format:{type:'json_schema' as const,name,schema,strict:true}}};budget.reserve(body,maxTokens);
    const response=await client.responses.create(body,{signal:budget.signal});budget.check();
    job.usage.push({branch:name,model:response.model,usage:response.usage});job.models[name]=response.model;
    if(!response.output_text)throw new Error(`${name} returned no usable output`);return JSON.parse(response.output_text);
  }
  private async run(job:Job,wantArt:boolean){
    const budget=this.budget(job),work=<T>(operation:()=>Promise<T>|T)=>this.work(job,operation);
    try{
      const model=process.env.CODE_MODEL??'gpt-5-mini',musicModel=process.env.MUSIC_MODEL??model;
      job.branches.brief='working';await work(()=>this.save(job));
      const previous=job.remix?await work(()=>this.store.version(job.remix!)):undefined;
      const locked:GameFormat={...(previous?{clock:previous.manifest.meta.clock,minPlayers:previous.manifest.meta.players[0],maxPlayers:previous.manifest.meta.players[1]}:{}),...(!(job.musicOnly||job.mediaOnly)?job.format:{})};
      if(locked.minPlayers&&locked.maxPlayers&&locked.minPlayers>locked.maxPlayers)throw new Error('Minimum players exceeds maximum players');
      const schema={...briefSchema,properties:{...briefSchema.properties,clock:locked.clock?{type:'string',enum:[locked.clock]}:briefSchema.properties.clock,minPlayers:locked.minPlayers?{type:'integer',enum:[locked.minPlayers]}:briefSchema.properties.minPlayers,maxPlayers:locked.maxPlayers?{type:'integer',enum:[locked.maxPlayers]}:briefSchema.properties.maxPlayers}};
      const brief=await work(()=>this.json(job,model,'brief',schema,`Design a small, original browser microgame from this request. Give one clear mechanic within WASD/arrows and Space; no mouse or extra buttons. Allowed player counts are integers 1 through 4; preserve the request's minimum, maximum and explicit realtime/turn-based choice. Use clock realtime for continuously advancing deadlines, timing or movement, even when controls are discrete button presses. Use clock action for turn-based choices, whose step runs only on input or the engine turn deadline. Pick one useful isolated sprite to generate with a transparent background. assetName must be lowercase letters and hyphens. Keep minPlayers/maxPlayers within 1-4. ${previous?`Remix of ${previous.manifest.meta.title}: ${previous.manifest.meta.description}. Preserve this format exactly: ${JSON.stringify(locked)}`:''}\nRequest: ${job.prompt}`,2000));
      z.object({title:z.string().max(80),assetName:z.string().regex(/^[a-z-]{1,40}$/),minPlayers:z.number().int().min(1).max(4),maxPlayers:z.number().int().min(1).max(4)}).passthrough().parse(brief);
      if(previous&&(job.mediaOnly||job.musicOnly||!wantArt)){
        // A remix must be able to repair a prior cartridge that no longer passes
        // preflight. Existing immutable art names need no code execution.
        if(previous.manifest.assets[0])brief.assetName=previous.manifest.assets[0].name;
        else if(job.mediaOnly){const info=await work(()=>compileIsolated(previous.source,budget.signal));if(info.assets.length)brief.assetName=info.assets[0];}
      }
      job.brief=brief;job.title=brief.title;job.branches.brief='ready';job.timings.briefMs=Date.now()-job.startedAt;await work(()=>this.save(job));
      if(job.reuseMusic&&!previous?.manifest.music)throw new Error('This version has no saved soundtrack to reuse');
      const gameId=previous?.manifest.gameId??`creation-${job.id.slice(0,12)}`;
      let compiled:{source:string;code:string;meta:any;audio?:any}|undefined,assets:Asset[]=(job.musicOnly||!wantArt)?previous?.manifest.assets??[]:[],music:any=job.reuseMusic?previous?.manifest.music??null:null;
      job.previewArt=assets;if(music)job.previewMusic=music;
      const publish=async(final:boolean)=>{
        if(!compiled)return;
        budget.check();
        const version=await this.store.putVersion(compiled.source,compiled.code,compiled.meta,assets,music,{kind:previous?.manifest.provenance.kind==='reference'&&(job.musicOnly||job.mediaOnly)?'reference':'generated',jobId:job.id,brief,models:job.models,promptHash:hash(job.prompt),draft:!final,art:job.branches.art,music:job.branches.music},job.ownerId,previous&&(job.musicOnly||job.mediaOnly)?{runtime:await work(()=>this.store.runtime(previous)),sdkVersion:previous.manifest.sdkVersion}:undefined,compiled.audio,()=>budget.check());
        if(!job.previewVersion)job.timings.previewMs=Date.now()-job.startedAt;
        job.previewVersion=version.id;
        if(final){job.finishedVersion=version.id;job.status='ready';job.finishedAt=Date.now();job.timings.totalMs=job.finishedAt-job.startedAt;}
        await this.save(job);return version;
      };
      const codeTask=(async()=>{
        job.branches.code='working';job.timings.codeStart=Date.now();await work(()=>this.save(job));
        if((job.musicOnly||job.mediaOnly)&&previous){compiled={source:previous.source,code:previous.code,meta:previous.manifest.meta,audio:previous.manifest.audio};job.branches.code='reused';job.timings.codeEnd=Date.now();await publish(false);return;}
        const sdk=await work(()=>readFile('sdk/index.ts','utf8')),example=await work(()=>readFile(brief.clock==='action'?'games/patchwork-pass.ts':'games/toast-catch.ts','utf8'));
        const base=`Write one TypeScript cartridge importing ONLY @microfinity/sdk. Return {source}. Follow this SDK exactly:\n${sdk}\nA complete example:\n${example}\nGame brief: ${JSON.stringify(brief)}\nUser request: ${job.prompt}\n${previous?`Original source to remix:\n${previous.source}`:''}\nRequirements: meta.id MUST be "${gameId}". All mutable state lives in init; use explicit state types for nullable fields and empty arrays; never use as const on mutable state; no Date, Math.random, DOM, network, eval, extra keys, or module-level mutations. ctx.players have ids p0,p1,...; use their actual ids. All view state must be strictly JSON-serializable and finite: omit absent fields entirely, never return undefined, functions or placeholder values. Implement the actual observe(state, playerId, ctx) callback; ctx.players is available there for active-player names. Never leave placeholder functions or claim that the engine adds undeclared view fields. Observe only information currently visible to that player; omit future schedules/answers. draw reads its view, not hidden state. 640x400 fixed playfield, all of it available for gameplay; keep sprites within its edges. Instructions under 90 chars, describe actual five-button controls. Give a clear failure and success threshold. Support a bounded ending even with no input. Realtime dt is 1/60; action-driven has ctx.event input/timeout and arbitrary elapsed dt. Render attractive, simple scene using built-in actors/backdrops/labels and readable text. A backdrop clears the canvas: call it before any actors or gameplay cues, never after them. Use dark ink on pale backgrounds or contrasting label panels; keep gameplay cues legible. Collision shapes explicitly match sprite sizes. Emit ctx.feedback for meaningful shot/hit/catch/miss/pickup/confirmation interactions; include playerId and visible x/y at the actual interaction point before deleting or moving an object offscreen. The engine adds sound and small particles automatically. Only supply score text when those points were actually awarded; never emit feedback from draw. Graphics actor kinds ONLY ship,toast,hand,umbrella,cup,snack,parcel,asteroid,star. Use gfx.motion(kind,age,options) for optional bounce/squash/stretch/wobble/recoil poses, gfx.withPose(x,y,pose,draw) for a sprite/group, or actor options {pose,anchor,from,age,blink}. Graphics.time is presentation time; Graphics.reducedMotion is engine-owned. Helpers automatically suppress optional motion. A one-shot age is elapsed seconds since a visible event, not remaining cooldown. Expressions: happy,neutral,sad,angry,surprised,sleepy; gfx.face also works alone. Do not animate hitboxes or hide essential cues with these helpers. actorBounds documents unanimated center/feet bounds. The generated sprite "${brief.assetName}" is one isolated ${brief.assetDescription}. Declare it in assets and use gfx.sprite, using if(gfx.hasAsset(name)) gfx.sprite(...) else gfx.actor(...) for provisional art; do not draw the fallback behind finished art. No sprite sheet. If a one-player realtime game, support reusable race/obstruction/pressure modifiers without implementing them yourself. score unit and direction explicit. Calling finishRound does not specify player outcome; call finishPlayer for success/failure where appropriate. For a moving timing window, use timedPress(input, position, velocity, target, halfWidth) so the engine can compensate bounded network delay; draw its public moving indicator with gfx.project(value, velocity, min, max). Do not invent client timestamps or networking in a cartridge. Use SDK helpers instead of rewriting controller mechanics where appropriate: move for cursors, focusGrid with createDirectionRepeat for realtime held navigation, createButtonHold/trackHold for release charges, aimAngle and projectile/stepProjectile for shooting, createSpawnClock/spawnDue for spawning, createSequence/advanceSequence for ordered prompts. Keep helper state in init, separately per player, call once per step with ctx.time, and reset it when a new interaction begins. Action-driven selection should normally be press-only. One input can contain several ordered press/release cycles: advanceSequence may accept multiple prompts in one call. For one point per accepted prompt, setScore(playerId, sequence.index), or addScore by the full index delta, and emit feedback once for each accepted index. Never count only one point per step. Sequence deadlines need a realtime clock, or an action-driven game must handle the engine timeout event (there is no ctx.setTurn). Use no external dependencies. Draw colored surrounds BEFORE sprites, never an opaque circle covering the sprite. The cabinet already draws the title, countdown, instructions, timer, player names, roles and scores OUTSIDE the canvas; draw ONLY the actual game scene and essential in-world cues. Do not duplicate titles, progress counters, status messages, key legends or player turns inside the playfield. Use optional hud(view) for {message,activePlayerId,items:[{label,value}]}: message <=120 chars, at most 6 items, label <=30 chars, value string <=60 chars or finite number. activePlayerId must be an actual ctx.players id included in observe. hud receives only the same filtered view as draw, never hidden state. Use HUD for progress, phase and active player on rotating games. A timeout must consume a turn just like a move. Only single-player realtime cartridges may declare race/obstruction/pressure modifiers; all other games use modifiers:[]. Keep source concise (<300 lines). Include meta.rules (max 2000 characters): a concise public rulebook with exact timing windows, units, scoring, failure conditions and when to press, keep holding or release. Keep meta.description a short playful catalogue blurb. Rules must match step and never reveal hidden answers or future random values. Observations should use consistent coordinate ranges and clear names. The engine supplies this rulebook and rule source to AI controllers; do not implement AI or provider calls in the cartridge.`;
        let repair='',source='';
        for(let attempt=0;attempt<this.limits.codeAttempts;attempt++){
          const result=await work(()=>this.json(job,model,'cartridge',{type:'object',properties:{source:{type:'string'}},required:['source'],additionalProperties:false},base+repair,13000));source=result.source;
          const record:{attempt:number;source:string;error?:string}={attempt:attempt+1,source};job.attempts.push(record);
          try{const result=await work(()=>compileIsolated(source,budget.signal));if(result.meta.id!==gameId)throw new Error(`meta.id must be ${gameId}`);if(result.meta.clock!==brief.clock||result.meta.players[0]!==brief.minPlayers||result.meta.players[1]!==brief.maxPlayers)throw new Error(`Preserve the brief's exact format: clock=${brief.clock}, players=[${brief.minPlayers},${brief.maxPlayers}]`);if(!result.assets.includes(brief.assetName))throw new Error(`Declare and draw the planned asset ${brief.assetName}`);compiled={source,code:result.code,meta:result.meta,audio:result.audio};break;}
          catch(e){record.error=(e as Error).message;budget.check();repair=`\nRepair the previous attempt using this precise compiler/preflight failure:\n${record.error}\nPrevious source:\n${source}`;await work(()=>this.save(job));if(attempt===this.limits.codeAttempts-1)throw e;}
        }
        job.branches.code='ready';job.timings.codeEnd=Date.now();await publish(false);
      })();
      const artTask=(async()=>{
        if(job.musicOnly){job.branches.art='reused';return;}if(!wantArt){if(previous?.manifest.assets.length)job.branches.art='reused';return;}
        job.branches.art='working';job.timings.artStart=Date.now();await work(()=>this.save(job));
        const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:180000,maxRetries:0,fetch:this.providerFetch}),imageModel=process.env.IMAGE_MODEL??'gpt-image-1.5';
        const body={model:imageModel,prompt:`One original game sprite: ${brief.assetDescription}. For a ${brief.style} retro microgame titled ${brief.title}. Playful clear silhouette, bold outlines, limited warm color palette, readable at 48 pixels. Single isolated object centered with generous transparent margin. Transparent background; no floor, text, watermark, border or collage. Useful gameplay asset, not a screenshot.`,size:'1024x1024' as const,quality:'low' as const,background:'transparent' as const,output_format:'png' as const,n:1};budget.reserve(body,0,true);
        const result=await work(()=>client.images.generate(body,{signal:budget.signal}));
        const encoded=result.data?.[0]?.b64_json;if(!encoded)throw new Error('Image model returned no image');const bytes=await work(()=>normalizeSprite(encoded));
        const asset=await work(()=>this.store.putAsset(bytes,'png'));assets=[{...asset,name:brief.assetName,width:256,height:256,provenance:{model:imageModel,kind:'image-model',jobId:job.id}}];
        job.previewArt=assets;job.models.image=imageModel;job.usage.push({branch:'image',usage:(result as any).usage??null});job.branches.art='ready';job.timings.artEnd=Date.now();await work(()=>this.save(job));
      })();
      const musicTask=(async()=>{
        if(job.reuseMusic){job.branches.music='reused';await work(()=>this.save(job));return;}
        job.branches.music='working';job.timings.musicStart=Date.now();await work(()=>this.save(job));
        const provider=this.musicProvider??symbolicMusicAdapter(async(schema,prompt)=>{
          const score=await this.json(job,musicModel,'music',schema,prompt,6500);
          return {score,model:job.models.music??musicModel};
        });
        let rendered:ReturnType<typeof prepareMusic>|undefined,lastError='';
        for(let attempt=0;attempt<this.limits.musicAttempts;attempt++){
          const attemptRecord:NonNullable<Job['musicAttempts']>[number]={attempt:attempt+1};(job.musicAttempts??=[]).push(attemptRecord);
          try{
            const output=await work(()=>provider.generate({title:brief.title,premise:brief.premise,mood:brief.musicMood,attempt:attempt+1,previousError:lastError},{signal:budget.signal,reserve:(body,tokens)=>budget.reserve(body,tokens)}));
            attemptRecord.kind=output.kind;if(output.kind==='score')attemptRecord.score=output.score;
            rendered=prepareMusic(output);attemptRecord.hash=hash(rendered.bytes);job.models.music=rendered.metadata.provenance.model;
            if(output.kind==='audio')job.usage.push({branch:'music-file',provider:rendered.metadata.provenance.provider,model:job.models.music,bytes:rendered.bytes.length,...(rendered.usage?{usage:rendered.usage}:{})});
            break;
          }catch(e){budget.check();lastError=(e as Error).message;attemptRecord.error=lastError;await work(()=>this.save(job));}
        }
        if(!rendered)throw new Error(lastError);const asset=await work(()=>this.store.putAsset(rendered.bytes,'wav'));
        music={...asset,...rendered.metadata,provenance:{...rendered.metadata.provenance,jobId:job.id}};
        job.previewMusic=music;job.branches.music='ready';job.timings.musicEnd=Date.now();await work(()=>this.save(job));
      })();
      const branches=await Promise.allSettled([codeTask,artTask,musicTask]);for(let i=0;i<branches.length;i++)if(branches[i].status==='rejected'){job.branches[(['code','art','music'] as Branch[])[i]]='failed';}
      const failures=branches.filter(r=>r.status==='rejected') as PromiseRejectedResult[];if(failures.length&&compiled)await publish(false);if(failures.length)throw new Error(failures.map(f=>f.reason.message).join('; '));
      await publish(true);
    }catch(e){job.status='failed';for(const branch of ['brief','code','art','music'] as Branch[])if(job.branches[branch]==='working')job.branches[branch]='failed';else if(job.branches[branch]==='pending')job.branches[branch]='not started';job.error=(budget.signal.aborted?budget.signal.reason:e as Error).message.slice(0,2000);job.finishedAt=Date.now();job.timings.totalMs=job.finishedAt-job.startedAt;}
    finally{budget.dispose();await this.save(job);}
  }
}
