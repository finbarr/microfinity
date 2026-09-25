import type OpenAI from 'openai';
import type {Response,ResponseCreateParamsNonStreaming} from 'openai/resources/responses/responses';
import timers from 'node:timers/promises';

const pending=(response:Response)=>response.status==='queued'||response.status==='in_progress';

/** Poll long reasoning runs without holding a single HTTP request open. */
export async function backgroundResponse(
  client: OpenAI,
  body: ResponseCreateParamsNonStreaming,
  parentSignal: AbortSignal,
  deadline?: {timeoutMs: number; message: string},
): Promise<Response> {
  const controller = new AbortController();
  const timer = deadline && setTimeout(() => controller.abort(Error(deadline.message)), deadline.timeoutMs);
  timer?.unref();
  const signal = AbortSignal.any([parentSignal, controller.signal]);
  let response:Response|undefined;
  try{
    signal.throwIfAborted();
    response=await client.responses.create({...body,background:true,store:false},{signal});
    signal.throwIfAborted();
    while(pending(response)){
      await timers.setTimeout(2000,undefined,{signal});
      response=await client.responses.retrieve(response.id,{}, {signal});
      signal.throwIfAborted();
    }
    return response;
  }catch(error){
    // Aborting our HTTP request does not cancel background model work. Use a
    // fresh, bounded request because the job's signal may already be aborted.
    if(response&&pending(response)){
      try{await client.responses.cancel(response.id,{timeout:5000,maxRetries:0});}
      catch{console.error('Could not cancel background generation response',response.id);}
    }
    throw signal.aborted ? signal.reason : error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
