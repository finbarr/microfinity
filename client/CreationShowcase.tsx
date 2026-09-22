import {useEffect,useRef,useState} from 'react';
import type {Manifest,Asset} from '../server/store';
import {GameCanvas} from './GameCanvas';
import {audio,type MusicAsset} from './audio';

function CreationScene({versionId}:{versionId:string}){
 const [manifest,setManifest]=useState<Manifest|null>(null),[view,setView]=useState<any>(null),[error,setError]=useState('');
 useEffect(()=>{
  let canceled=false;const worker=new Worker(new URL('./creation-preview-worker.ts',import.meta.url),{type:'module'});
  let timer:ReturnType<typeof setTimeout>|undefined;setManifest(null);setView(null);setError('');
  const fail=(message:string)=>{if(!canceled){setError(message);worker.terminate();}};
  worker.onerror=()=>fail('The game preview could not load. You can still try Play.');
  worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();if(canceled)return;if(data.error)fail(data.error);else setView(data.view);};
  const abort=new AbortController();
  void fetch(`/api/versions/${versionId}`,{signal:abort.signal}).then(async r=>{if(!r.ok)throw Error('Could not load your cartridge');const version=await r.json();const runtime=await fetch(version.manifest.runtimeUrl??'/assets/runtime-legacy-1.0.0.js',{signal:abort.signal}).then(r=>{if(!r.ok)throw Error('Could not load the game runtime');return r.text();});if(canceled)return;setManifest(version.manifest);timer=setTimeout(()=>fail('The preview took too long. Try Play to open the game.'),2000);worker.postMessage({code:version.code,runtime,players:version.manifest.meta.players[0]});}).catch(e=>{if(!canceled)fail(e.message);});
  return()=>{canceled=true;abort.abort();clearTimeout(timer);worker.terminate();};
 },[versionId]);
 return <div className="creation-game">{manifest&&view?<GameCanvas manifest={manifest} view={view} onLoaded={()=>{}} onError={setError}/>:<div className="creation-placeholder">{error||'Opening your cartridge…'}</div>}{error&&manifest&&view&&<p role="alert">{error}</p>}</div>;
}

export function CreationShowcase({job,autoPlay,inParty,onPlay,onRetry,onRetryMusic,onEdit,onAdd,adding,canAdd,onSound}:{job:any;autoPlay:boolean;inParty:boolean;onPlay:(version:string)=>void;onRetry:()=>void;onRetryMusic:()=>void;onEdit:()=>void;onAdd:()=>void;adding:boolean;canAdd:boolean;onSound:()=>void}){
 const [manifest,setManifest]=useState<Manifest|null>(null),[sound,setSound]=useState('Waiting for the soundtrack'),[audioError,setAudioError]=useState('');
 const audioErrorRef=useRef(false);
 useEffect(()=>{let canceled=false;setManifest(null);if(job.previewVersion)void fetch(`/api/versions/${job.previewVersion}`).then(r=>{if(!r.ok)throw Error('Preview unavailable');return r.json();}).then(v=>{if(!canceled)setManifest(v.manifest);}).catch(()=>{});return()=>{canceled=true;};},[job.id,job.previewVersion]);
 const art:Asset|undefined=job.previewArt?.[0]??manifest?.assets[0],music:MusicAsset|null=job.previewMusic??manifest?.music??null;
 const musicId=`creation:${job.id}:${music?.hash??'pending'}`;
 useEffect(()=>{
  let canceled=false;audioErrorRef.current=false;setAudioError('');const started=performance.now();
  const update=()=>{
   if(!music){setSound(job.branches.music==='failed'?'Soundtrack needs another take':'Composing your soundtrack');return;}
   if(!document.hidden&&!audioErrorRef.current)void audio.startLoop(musicId,'creation',music,(performance.now()-started)/1000).catch(e=>{if(!canceled){audioErrorRef.current=true;setAudioError(e.message);}});
   setSound(audio.settings.muted?'Sound muted':audio.settings.music===0?'Music volume is zero':audio.context?.state!=='running'?'Ready to listen':audio.isLoopPlaying(musicId)?'Now playing your soundtrack':'Loading your soundtrack');
  };
  update();const timer=setInterval(update,250);return()=>{canceled=true;clearInterval(timer);audio.stopLoop();};
 },[music?.hash,job.id,job.branches.music]);
 const ready=job.status==='ready',failed=job.status==='failed',playing=sound==='Now playing your soundtrack';
 const steps=[['art','ART'],['music','MUSIC'],['code','GAME']];
 const premise=(job.brief?.premise??'First, one tiny game. Then a world and a sound all its own.').split(/(?<=[.!?])\s/)[0];
 return <section className={`creation-showcase ${ready?'ready':''}`} aria-label="Your cartridge taking shape" tabIndex={-1} data-nav-focus>
  <div className="eyebrow">{ready?'CARTRIDGE COMPLETE':failed?'LET’S GIVE IT ANOTHER TRY':'BUILDING YOUR CARTRIDGE'}</div>
  <h1>{job.title??'Here comes your idea.'}</h1><p className="creation-premise">{premise.length>180?`${premise.slice(0,177).trim()}…`:premise}</p>
  <div className="creation-reveal">
   <div className={`creation-art ${art?'arrived':''}`}><span className="creation-label">01 · THE LOOK</span>{art?<img key={art.hash} src={art.url} alt={`Artwork for ${job.title??'your game'}`}/>:<div className="creation-placeholder"><span className="pixel-spark" aria-hidden="true">✦</span>{job.branches.art==='failed'?'Artwork needs another try':'Drawing a little character…'}</div>}<p>{art?'Meet your new little world.':'Your artwork will appear here.'}</p></div>
   <div className={`creation-music ${playing?'playing':''}`}><span className="creation-label">02 · THE SOUND</span><div className="music-visual" aria-hidden="true">{[3,6,4,8,5,7,4,6,3].map((n,i)=><i key={i} style={{'--level':n,'--delay':`${i*-.11}s`} as React.CSSProperties}/>)}</div><strong role="status">{audioError||sound}</strong><p>{music?'Made for this game. Give it a moment to loop.':'An original retro loop is on its way.'}</p>{music&&<button data-nav-start onClick={onSound}>{audio.context?.state!=='running'?'Enable sound':audio.settings.muted?'Unmute':'Mute'}</button>}</div>
  </div>
  <ol className="creation-steps" aria-label="Creation progress">{steps.map(([branch,label])=>{const state=job.branches[branch],done=['ready','reused','skipped'].includes(state);return <li key={branch} className={done?'done':state==='failed'?'failed':''}><span aria-hidden="true">{done?'✓':state==='failed'?'!':'·'}</span>{label}<small>{done?'Ready':state==='failed'?'Try again':state==='working'?'Making…':'Up next'}</small></li>;})}</ol>
  {ready&&job.finishedVersion&&<><p className="creation-ready" role="status">{autoPlay?'Your game is ready. Starting in a moment…':inParty?'Your game is ready for the party.':'Your game is ready.'}</p><CreationScene versionId={job.finishedVersion}/></>}
  {job.error&&<p className="creation-error" role="alert">{job.error}</p>}
  <div className="creation-actions">{failed&&<button className="primary" onClick={onRetry}>Try again</button>}{job.branches.music==='failed'&&job.previewVersion&&<button onClick={onRetryMusic}>Retry soundtrack</button>}{!inParty&&job.previewVersion&&<button className={ready?'primary':'secondary'} onClick={()=>onPlay(job.finishedVersion??job.previewVersion)}>{ready?'▶ Play now':'Try the early preview'}</button>}{ready&&inParty&&<button className="primary" disabled={!canAdd||adding} onClick={onAdd}>{adding?'Adding…':'Add to this party'}</button>}{job.status!=='working'&&<button className="text-button" onClick={onEdit}>Back to your idea</button>}</div>
 </section>;
}
