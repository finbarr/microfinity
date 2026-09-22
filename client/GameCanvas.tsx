import { useEffect, useRef, useState } from 'react';
import { drawCommands } from './renderer';
import type { Manifest } from '../server/store';
import { audio, type MusicAsset } from './audio';
import {drawFeedback,type FeedbackEffects} from './feedback';
export function GameCanvas({manifest,view,serverNow,onLoaded,onError,feedback}:{manifest:Manifest;view:any;serverNow?:()=>number;onLoaded:()=>void;onError:(message:string)=>void;feedback?:FeedbackEffects}){
  const canvas=useRef<HTMLCanvasElement>(null),worker=useRef<Worker|null>(null),images=useRef(new Map<string,HTMLImageElement>()),current=useRef(view),[error,setError]=useState('');
  current.current=view;
  const callbacks=useRef({onLoaded,onError,serverNow,feedback});callbacks.current={onLoaded,onError,serverNow,feedback};
  useEffect(()=>{
    let canceled=false,ready=false,failed=false,inFlight=false,lastDraw=0;const renderer=new Worker(new URL('./render-worker.ts',import.meta.url),{type:'module'});worker.current=renderer;setError('');
    const fail=(message:string)=>{if(canceled||failed)return;failed=true;ready=false;renderer.terminate();setError(message);callbacks.current.onError(message);};
    const frame=()=>{const view=current.current;if(!view)return;inFlight=true;lastDraw=performance.now();const renderAhead=manifest.meta.clock==='realtime'&&!view.done&&callbacks.current.serverNow&&Number.isFinite(view.sampleTime)?Math.max(0,Math.min(.25,(callbacks.current.serverNow()-view.sampleTime)/1000)):0;renderer.postMessage({type:'draw',view:view.game,tick:view.tick,renderAhead,presentation:{time:(Number.isFinite(view.time)?view.time:0)+renderAhead,reducedMotion:motion.matches}});};
    renderer.onerror=()=>fail('The cartridge renderer could not start.');
    const motion=matchMedia('(prefers-reduced-motion: reduce)');
    renderer.onmessage=(e)=>{if(canceled)return;if(e.data.type==='loaded'){ready=true;callbacks.current.onLoaded();frame();}if(e.data.type==='frame'&&canvas.current){inFlight=false;try{drawCommands(canvas.current,e.data.commands,images.current,manifest.meta.style);if(callbacks.current.feedback)drawFeedback(canvas.current,callbacks.current.feedback.frame(performance.now(),manifest.meta,current.current,motion.matches));}catch(error){fail((error as Error).message);}}if(e.data.type==='error')fail(e.data.message);};
    void Promise.all([fetch(`/api/versions/${manifest.id}`).then(r=>r.json()),fetch(manifest.runtimeUrl??'/assets/runtime-legacy-1.0.0.js').then(r=>r.text()),Promise.all(manifest.assets.map(asset=>new Promise<[string,HTMLImageElement]>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve([asset.name,img]);img.onerror=()=>reject(new Error(`Could not load ${asset.name}`));img.src=asset.url;}))),audio.prepare(manifest.music as MusicAsset|null)]).then(([version,bootstrap,assets])=>{if(canceled)return;images.current=new Map(assets);renderer.postMessage({type:'load',code:version.code,bootstrap,versionId:manifest.id,assets:manifest.assets.map(a=>a.name)});}).catch(e=>fail(e.message));
    let draw=0;const animate=()=>{if(canceled||failed)return;draw=requestAnimationFrame(animate);if(document.hidden)return;if(inFlight&&performance.now()-lastDraw>1500){fail('The cartridge renderer exceeded its frame budget.');return;}if(ready&&!inFlight&&current.current&&performance.now()-lastDraw>=1000/60)frame();};draw=requestAnimationFrame(animate);
    return()=>{canceled=true;cancelAnimationFrame(draw);renderer.terminate();worker.current=null;};
  },[manifest.id]);
  return <div className="canvas-wrap"><canvas ref={canvas} width="640" height="400" aria-label={`${manifest.meta.title} game display`}/>{error&&<div className="canvas-error">{error}</div>}</div>;
}
