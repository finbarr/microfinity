import OpenAI from 'openai';
import sharp from 'sharp';
import {readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {normalizeIcon} from './image-assets';
import type {Asset,Store} from './store';

export const iconName='cartridge-icon';
export type IconSubject={title:string;premise:string;rules?:string;style?:string};

export function iconPrompt({title,premise,rules,style}:IconSubject){
  return `Create one original square cover illustration for the browser microgame "${title}". Premise: ${premise}. ${rules?`Gameplay and visual cues: ${rules.slice(0,1200)}. `:''}${style?`Art direction: ${style}. `:''}Show the game's distinctive action and characters in a bold, lively composition legible at thumbnail size. Full-bleed illustration with a coherent background. No words, letters, numbers, logo, frame, watermark, interface, screenshot, or isolated transparent sprite.`;
}

export async function generateCartridgeIcon(store:Store,subject:IconSubject,context:{signal:AbortSignal;reserve:(body:unknown,tokens:number,image:boolean)=>void;jobId?:string;projectId?:string;fetch?:typeof fetch}){
  const model=process.env.IMAGE_MODEL??'gpt-image-1.5';
  const body={model,prompt:iconPrompt(subject),size:'1024x1024' as const,quality:'low' as const,background:'opaque' as const,output_format:'png' as const,n:1};
  context.reserve(body,0,true);
  const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY,timeout:180000,maxRetries:0,fetch:context.fetch});
  const result=await client.images.generate(body,{signal:context.signal});
  context.signal.throwIfAborted();
  const encoded=result.data?.[0]?.b64_json;
  if(!encoded)throw new Error('Image model returned no cartridge icon');
  const bytes=await normalizeIcon(encoded);
  context.signal.throwIfAborted();
  const stored=await store.putAsset(bytes,'png',context.projectId);
  context.signal.throwIfAborted();
  const icon:Asset={...stored,name:iconName,width:256,height:256,provenance:{kind:'image-model-icon',model,...(context.jobId?{jobId:context.jobId}:{})}};
  return {icon,model,usage:(result as any).usage??null};
}

/** Import a committed or operator-supplied icon without another provider call. */
export async function cartridgeIconFromDirectory(store:Store,directory:string,gameId:string,kind:'bundled-icon'|'pre-generated-icon'):Promise<Asset|undefined>{
  if(!/^[a-z0-9-]+$/.test(gameId))return;
  const path=join(directory,`${gameId}.png`);
  let bytes:Buffer;
  try{
    if((await stat(path)).size>20_000_000)throw new Error(`Icon for ${gameId} exceeds the 20 MB asset limit`);
    bytes=await readFile(path);
  }
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}
  if(bytes.length>20_000_000)throw new Error(`Icon for ${gameId} exceeds the 20 MB asset limit`);
  const source=sharp(bytes,{limitInputPixels:256*256}),metadata=await source.metadata();
  if(metadata.format!=='png'||metadata.width!==256||metadata.height!==256||(metadata.pages??1)!==1)throw new Error(`Icon for ${gameId} must be a 256x256 PNG`);
  await source.stats();
  let recorded:unknown;
  try{
    const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
    const entries=Array.isArray(manifest)?manifest:[manifest?.icons,manifest?.entries,manifest?.files].find(Array.isArray);
    recorded=entries?.find((entry:any)=>entry.gameId===gameId||entry.game_id===gameId||entry.id===gameId||[entry.file,entry.filename,entry.path].some((name:unknown)=>typeof name==='string'&&name.split('/').at(-1)===`${gameId}.png`))??manifest?.[gameId]??manifest?.icons?.[gameId]??manifest?.games?.[gameId];
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const stored=await store.putAsset(bytes,'png');
  return {...stored,name:iconName,width:256,height:256,provenance:{kind,gameId,...(recorded?{source:recorded}:{})}};
}

/** Built-in art is optional while the asset worker's files are being merged. */
export function bundledCartridgeIcon(store:Store,gameId:string){return cartridgeIconFromDirectory(store,join('games','icons'),gameId,'bundled-icon');}
