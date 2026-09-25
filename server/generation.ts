import OpenAI from 'openai';
import {normalizeSprite} from './image-assets';
import {generateCartridgeIcon} from './cartridge-icons';
import { Store, hash, type Asset, type Version } from './store';
import type {GameBuilder,BuildInput,BuildResult} from './game-builder';
import {BlaxelGameBuilder} from './blaxel-game-builder';
import {prepareMusic,symbolicMusicAdapter,type MusicGenerationAdapter} from './music-generation';
export {wavBuffer} from './music-assets';
import {briefSchema, briefPrompt, currentBrief, parseBrief} from './game-brief';
import {GenerationBudget,generationLimits,type GenerationLimits} from './generation-budget';
import {backgroundResponse} from './background-response';
export type MediaState = {
  brief?: any;
  title?: string;
  assets?: Asset[];
  music?: any;
  icon?: Asset;
};
export type GenerationInput = {
  jobId: string;
  projectId: string;
  ownerId: string;
  leaseTag?: string;
  gameId: string;
  prompt: string;
  parent?: Version;
  media: MediaState;
  signal: AbortSignal;
  session?: BuildInput['session'];
  witnesses?: unknown;
  feedback?: unknown;
  onProgress: (progress: any, media: MediaState) => Promise<void>;
  onSnapshot?: BuildInput['onSnapshot'];
  onMessage?: BuildInput['onMessage'];
};
export type GenerationResult = {build: BuildResult; media: MediaState; usage: unknown[]};

/** One bounded turn. Scheduling, ownership and publication belong to Projects. */
export class GenerationService {
  private readonly limits: GenerationLimits;
  constructor(
    private store: Store,
    limits: Partial<GenerationLimits> = {},
    private providerFetch?: typeof fetch,
    private musicProvider?: MusicGenerationAdapter,
    private builder: GameBuilder = new BlaxelGameBuilder(store),
  ) { this.limits = generationLimits(limits); }
  private async json(job:any,model:string,name:string,schema:any,prompt:string,maxTokens=5000){
    const budget=job.budgetController,client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:60000,maxRetries:0,fetch:this.providerFetch});
    const reasoningEffort=name==='music'?'low' as const:'high' as const;
    const body={model,input:prompt,max_output_tokens:maxTokens,...(/^gpt-[56]/.test(model)?{reasoning:{effort:reasoningEffort}}:{}),text:{format:{type:'json_schema' as const,name,schema,strict:true}}};budget.reserve(body,maxTokens);
    // HTTP timeouts bound each poll, not the background job. Leave time for a
    // music retry and the game builder instead of spending the whole turn here.
    const response=await backgroundResponse(client,body,budget.signal,name==='music'?{
      timeoutMs:120_000,message:'Music generation exceeded its 120-second deadline',
    }:undefined);budget.check();
    job.usage.push({branch:name,model:response.model,reasoningEffort:body.reasoning?.effort,usage:response.usage});job.models[name]=response.model;
    if(response.status!=='completed')throw new Error(`${name} generation ${response.status}: ${response.error?.message??response.incomplete_details?.reason??'no completed response'}`);
    if(!response.output_text)throw new Error(`${name} returned no usable output`);return JSON.parse(response.output_text);
  }
  async run(input: GenerationInput): Promise<GenerationResult> {
    const budget = new GenerationBudget(this.limits);
    const abort = () => budget.controller.abort(input.signal.reason);
    input.signal.addEventListener('abort', abort, {once: true});
    if (input.signal.aborted) abort();
    const job: any = {
      id: input.jobId, prompt: input.prompt, startedAt: Date.now(),
      branches: {}, timings: {}, models: {}, usage: [], budgetController: budget,
      brief: input.media.brief, title: input.media.title,
      previewArt: input.media.assets, previewMusic: input.media.music,
      previewIcon: input.media.icon,
    };
    const work = <T>(operation: () => Promise<T> | T) => budget.run(operation);
    const mediaState = (): MediaState => ({
      brief: job.brief, title: job.title, assets: job.previewArt,
      music: job.previewMusic, icon: job.previewIcon,
    });
    const save = async () => {
      budget.check();
      await input.onProgress({branches: {...job.branches}, title: job.title,
        models: {...job.models}, usage: job.usage, timings: {...job.timings},
        musicAttempts: job.musicAttempts,
        budget: {limits: this.limits, reserved: {...budget.usage}},
      }, mediaState());
    };
    try {
      const model=process.env.BRIEF_MODEL??'gpt-6-sol',musicModel=process.env.MUSIC_MODEL??'gpt-5-mini';
      job.branches.brief='working';await work(()=>save());
      const previous=input.parent;
      const brief = currentBrief(job.brief) ?? parseBrief(await work(() => this.json(
        job, model, 'brief', briefSchema, briefPrompt(job.prompt, previous), 4000,
      )));
      if(job.previewArt?.[0])brief.assetName=job.previewArt[0].name;
      job.brief=brief;job.title=brief.title;job.branches.brief='ready';job.timings.briefMs=Date.now()-job.startedAt;await work(()=>save());
      const gameId=input.gameId;job.buildGameId=gameId;
      let assets:Asset[]=job.previewArt??[],music:any=job.previewMusic??null,icon:Asset|undefined=job.previewIcon;
      job.previewArt=assets;
      const artTask=(async()=>{
        if(assets.length){job.branches.art='reused';return;}
        job.branches.art='working';job.timings.artStart=Date.now();await work(()=>save());
        const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:180000,maxRetries:0,fetch:this.providerFetch}),imageModel=process.env.IMAGE_MODEL??'gpt-image-1.5';
        const body={model:imageModel,prompt:`One original game sprite: ${brief.assetDescription}. For a ${brief.style} retro microgame titled ${brief.title}. Playful clear silhouette, bold outlines, limited warm color palette, readable at 48 pixels. Single isolated object centered with generous transparent margin. Transparent background; no floor, text, watermark, border or collage. Useful gameplay asset, not a screenshot.`,size:'1024x1024' as const,quality:'low' as const,background:'transparent' as const,output_format:'png' as const,n:1};budget.reserve(body,0,true);
        const result=await work(()=>client.images.generate(body,{signal:budget.signal}));
        const encoded=result.data?.[0]?.b64_json;if(!encoded)throw new Error('Image model returned no image');const bytes=await work(()=>normalizeSprite(encoded));
        const asset=await work(()=>this.store.putAsset(bytes,'png',input.projectId));assets=[{...asset,name:brief.assetName,width:256,height:256,provenance:{model:imageModel,kind:'image-model',jobId:job.id}}];
        job.previewArt=assets;job.models.image=imageModel;job.usage.push({branch:'image',usage:(result as any).usage??null});job.branches.art='ready';job.timings.artEnd=Date.now();await work(()=>save());
      })();
      const iconTask=(async()=>{
        if(icon){job.branches.icon='reused';await work(()=>save());return;}
        job.branches.icon='working';job.timings.iconStart=Date.now();await work(()=>save());
        const subject={title:brief.title,premise:brief.premise,rules:job.prompt,style:brief.style};
        const result=await work(()=>generateCartridgeIcon(this.store,subject,{signal:budget.signal,reserve:(body,tokens,image)=>budget.reserve(body,tokens,image),jobId:job.id,projectId:input.projectId,fetch:this.providerFetch}));
        icon=result.icon;job.previewIcon=icon;job.models.icon=result.model;job.usage.push({branch:'icon',model:result.model,usage:result.usage});job.branches.icon='ready';job.timings.iconEnd=Date.now();await work(()=>save());
      })();
      const musicTask=(async()=>{
        if(music){job.branches.music='reused';await work(()=>save());return;}
        job.branches.music='working';job.timings.musicStart=Date.now();await work(()=>save());
        const provider=this.musicProvider??symbolicMusicAdapter(async(schema,prompt)=>{
          const score=await this.json(job,musicModel,'music',schema,prompt,6500);
          return {score,model:job.models.music??musicModel};
        });
        let rendered:ReturnType<typeof prepareMusic>|undefined,lastError='';
        for(let attempt=0;attempt<this.limits.musicAttempts;attempt++){
          const attemptRecord:any={attempt:attempt+1};(job.musicAttempts??=[]).push(attemptRecord);
          try{
            const output=await work(()=>provider.generate({title:brief.title,premise:brief.premise,mood:brief.musicMood,attempt:attempt+1,previousError:lastError},{signal:budget.signal,reserve:(body,tokens)=>budget.reserve(body,tokens)}));
            attemptRecord.kind=output.kind;if(output.kind==='score')attemptRecord.score=output.score;
            rendered=prepareMusic(output);attemptRecord.hash=hash(rendered.bytes);job.models.music=rendered.metadata.provenance.model;
            if(output.kind==='audio')job.usage.push({branch:'music-file',provider:rendered.metadata.provenance.provider,model:job.models.music,bytes:rendered.bytes.length,...(rendered.usage?{usage:rendered.usage}:{})});
            break;
          }catch(e){budget.check();lastError=(e as Error).message;attemptRecord.error=lastError;await work(()=>save());}
        }
        if(!rendered)throw new Error(lastError);const asset=await work(()=>this.store.putAsset(rendered.bytes,'wav',input.projectId));
        music={...asset,...rendered.metadata,provenance:{...rendered.metadata.provenance,jobId:job.id}};
        job.previewMusic=music;job.branches.music='ready';job.timings.musicEnd=Date.now();await work(()=>save());
      })();
      const branches=await Promise.allSettled([artTask,musicTask,iconTask]);
      const failures:Error[]=[];for(let i=0;i<branches.length;i++)if(branches[i].status==='rejected'){job.branches[(['art','music','icon'] as string[])[i]]='failed';failures.push((branches[i] as PromiseRejectedResult).reason);}
      if(failures.length)throw new Error(failures.map(f=>f.message).join('; '));
      await work(save);
      const result = await this.builder.build({
        jobId: input.jobId, projectId: input.projectId, ownerId: input.ownerId, leaseTag: input.leaseTag,
        prompt: input.prompt, brief, gameId, assets, music, icon,
        parent: previous?.source, session: input.session, witnesses: input.witnesses,
        feedback: input.feedback, signal: budget.signal,
        onSnapshot: input.onSnapshot, onMessage: input.onMessage,
        onStage: async stage => {
          job.branches.code = stage === 'building' ? 'working' : 'checking';
          await work(save);
        },
      });
      budget.check();
      return {build: result, media: mediaState(), usage: job.usage};
    } finally {
      input.signal.removeEventListener('abort', abort);
      budget.dispose();
    }
  }
}
