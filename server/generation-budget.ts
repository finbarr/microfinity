import {z} from 'zod';

const limitsSchema=z.object({
  timeoutMs:z.coerce.number().int().min(1000).max(900000).default(900000),
  maxCalls:z.coerce.number().int().min(1).max(16).default(8),
  maxInputBytes:z.coerce.number().int().min(1000).max(1000000).default(300000),
  maxOutputTokens:z.coerce.number().int().min(1000).max(200000).default(54000),
  musicAttempts:z.coerce.number().int().min(1).max(2).default(2),
});
export type GenerationLimits=z.infer<typeof limitsSchema>;
export type GenerationUsage={calls:number;inputBytes:number;reservedOutputTokens:number;images:number};
export function generationLimits(overrides:Partial<GenerationLimits>={},env:NodeJS.ProcessEnv=process.env):GenerationLimits{
  return limitsSchema.parse({timeoutMs:env.GENERATION_TIMEOUT_MS,maxCalls:env.GENERATION_MAX_CALLS,maxInputBytes:env.GENERATION_MAX_INPUT_BYTES,maxOutputTokens:env.GENERATION_MAX_OUTPUT_TOKENS,musicAttempts:env.GENERATION_MUSIC_ATTEMPTS,...overrides});
}

/** A shared work deadline; terminal persistence is awaited separately. */
export class GenerationBudget {
  readonly controller=new AbortController();
  readonly usage:GenerationUsage={calls:0,inputBytes:0,reservedOutputTokens:0,images:0};
  readonly expiresAt:number;
  private readonly timer:ReturnType<typeof setTimeout>;
  constructor(readonly limits:GenerationLimits){
    this.expiresAt=performance.now()+limits.timeoutMs;
    this.timer=setTimeout(()=>this.expire(),limits.timeoutMs);this.timer.unref();
  }
  get signal(){return this.controller.signal;}
  private expire(){this.controller.abort(new Error(`Creation exceeded its ${this.limits.timeoutMs/1000}-second work deadline. Saved media remains available for retry.`));}
  check(){if(performance.now()>=this.expiresAt&&!this.signal.aborted)this.expire();this.signal.throwIfAborted();}
  reserve(body:unknown,outputTokens:number,image=false){
    this.check();const inputBytes=Buffer.byteLength(JSON.stringify(body),'utf8'),next={calls:this.usage.calls+1,inputBytes:this.usage.inputBytes+inputBytes,reservedOutputTokens:this.usage.reservedOutputTokens+outputTokens,images:this.usage.images+Number(image)};
    if(next.calls>this.limits.maxCalls)throw new Error('Creation reached its provider request budget');
    if(next.inputBytes>this.limits.maxInputBytes)throw new Error('Creation reached its provider input-size budget');
    if(next.reservedOutputTokens>this.limits.maxOutputTokens)throw new Error('Creation reached its provider output-token budget');
    if(next.images>2)throw new Error('Creation reached its two-image budget');
    Object.assign(this.usage,next);
  }
  async run<T>(operation:()=>Promise<T>|T):Promise<T>{
    this.check();
    let aborted:()=>void=()=>{};
    const cancelled=new Promise<never>((_,reject)=>{aborted=()=>reject(this.signal.reason);this.signal.addEventListener('abort',aborted,{once:true});});
    try{
      // Attach rejection handlers even if an adapter ignores cancellation and
      // settles late. Callers only see the value while this budget is active.
      const value=await Promise.race([Promise.resolve().then(()=>{this.check();return operation();}),cancelled]);
      this.check();return value;
    }finally{this.signal.removeEventListener('abort',aborted);}
  }
  dispose(){clearTimeout(this.timer);}
}
