import {useEffect,useRef,useState} from 'react';
import {GameCabinet} from './GameCabinet';
import {GameCanvas} from './GameCanvas';
import {audio,type MusicAsset} from './audio';
import type {Manifest} from '../server/store';
import {ReplayClock} from './replay-clock';
import {FeedbackEffects} from './feedback';

export function Replay({match,close,onPlay}:{match:any;close:()=>void;onPlay:()=>void}){
 const [roundIndex,setRoundIndex]=useState(0),[manifest,setManifest]=useState<Manifest|null>(null),[view,setView]=useState<any>(null);
 const [playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[player,setPlayer]=useState('p0');
 const [error,setError]=useState(''),[verified,setVerified]=useState<boolean|null>(null),[ready,setReady]=useState(false),[seeking,setSeeking]=useState(false);
 const [position,setPosition]=useState(0);
 const worker=useRef<Worker|null>(null),revision=useRef(0),traversal=useRef(0),positionRef=useRef(0),playingRef=useRef(false),playAfterSeek=useRef(false);
 const playbackClock=useRef(new ReplayClock());
 const feedback=useRef(new FeedbackEffects());
 const rounds=[...(match.record.rounds??[]),...(match.record.activeRound?[match.record.activeRound]:[])],round=rounds[roundIndex];
 const pause=()=>{playingRef.current=false;playAfterSeek.current=false;setPlaying(false);audio.stop();feedback.current.clear();};
 const play=()=>{playingRef.current=true;setPlaying(true);};
 const seek=(tick:number,resume=false)=>{
  pause();setSeeking(true);traversal.current++;playAfterSeek.current=resume;
  feedback.current.reset(`replay:${match.id}:${roundIndex}:${traversal.current}`);
  worker.current?.postMessage({type:'seek',tick,revision:++revision.current});
 };

 useEffect(()=>{
  if(!round)return;
  let canceled=false;const w=new Worker(new URL('./replay-worker.ts',import.meta.url),{type:'module'});
  worker.current=w;revision.current++;playbackClock.current.reset();pause();setView(null);setManifest(null);setReady(false);setSeeking(false);setVerified(null);setError('');setPosition(0);positionRef.current=0;
  feedback.current.reset(`replay:${match.id}:${roundIndex}:${traversal.current}`);
  const viewed=round.config.players.some((p:any)=>p.id===player)?player:round.config.players[0].id;setPlayer(viewed);
  const fail=(message:string)=>{if(canceled)return;setError(message);pause();};
  w.onerror=()=>fail('The replay worker could not continue.');
  w.onmessage=e=>{
   if(canceled)return;playbackClock.current.acknowledge(e.data);
   if(canceled||e.data.revision!==revision.current)return;
   const m=e.data;if(m.type==='error'){fail(m.message);return;}
   setView(m.view);setVerified(m.verified);setPosition(m.position);positionRef.current=m.position;setSeeking(false);
   if(playingRef.current){
    feedback.current.add(m.feedback,performance.now(),!document.hidden);
    for(const event of m.feedback)audio.effect(`replay:${match.id}:${roundIndex}:${traversal.current}:${event.id}`,event.kind,event.sound);
    if(m.view.done)audio.effect(`replay:${match.id}:${roundIndex}:${traversal.current}:complete`,'round-complete');
   }
   if(m.atEnd){playingRef.current=false;setPlaying(false);}
   else if(playAfterSeek.current){playAfterSeek.current=false;play();}
  };
  void fetch(`/api/versions/${round.versionId}`).then(async r=>{if(!r.ok)throw new Error('Could not load the recorded cartridge');return r.json();}).then(async version=>{
   const response=await fetch(version.manifest.runtimeUrl??'/assets/runtime-legacy-1.0.0.js');if(!response.ok)throw new Error('Could not load the recorded runtime');
   const runtime=await response.text();if(canceled)return;setManifest(version.manifest);
   w.postMessage({type:'load',code:version.code,runtime,round,playerId:viewed,revision:revision.current});
  }).catch(e=>fail(e.message));
  return()=>{canceled=true;w.terminate();worker.current=null;audio.stop();};
 },[round,match.id]);

 useEffect(()=>{
  const visibility=()=>{if(document.hidden)pause();};
  document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility);
 },[]);

 useEffect(()=>{
  if(!playing||!manifest){audio.stopLoop();return;}
  audio.soundPack=manifest.audio?.soundPack??'lofi-arcade';
  const ensureLoop=()=>void audio.startLoop(`replay:${match.id}:${roundIndex}:${traversal.current}:${speed}`,manifest.meta.id,manifest.music as MusicAsset|null,positionRef.current,speed).catch(e=>{setError(e.message);pause();});
  ensureLoop();
  playbackClock.current.start(positionRef.current,performance.now(),speed);
  const timer=setInterval(()=>{
   // Browser suspension pauses replay rather than jumping past unseen actions.
   if(document.hidden)return;
   ensureLoop();
   try{const request=playbackClock.current.advance(performance.now(),revision.current);if(request)worker.current?.postMessage(request);}
   catch(e){worker.current?.terminate();setError((e as Error).message);pause();}
  },50);
  return()=>{clearInterval(timer);audio.stopLoop();};
 },[playing,speed,manifest?.id]);

 return <div className="modal-backdrop"><section className="replay-modal" role="dialog" aria-modal="true" aria-label="Match replay">
  <button className="close" aria-label="Close replay" onClick={()=>{pause();close();}}>×</button><div className="eyebrow">ONE MORE LOOK</div><h2>Party replay</h2>
  {!round?<p>This match ended before a round was recorded.</p>:<>
   <div className="replay-controls">
    <label>Round<select value={roundIndex} onChange={e=>{pause();revision.current++;setRoundIndex(+e.target.value);}}>{rounds.map((r:any,i:number)=><option key={i} value={i}>{i+1}{r.incomplete?' · interrupted':''}</option>)}</select></label>
    <label>View as<select value={player} onChange={e=>{setPlayer(e.target.value);worker.current?.postMessage({type:'player',playerId:e.target.value,revision:revision.current});}}>{round.config.players.map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Speed<select value={speed} onChange={e=>setSpeed(+e.target.value)}>{[1,2,4].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>
    <button className="secondary" disabled={!view||!ready||seeking||!!error||round.status.tick===0} onClick={()=>{
     if(playing){pause();return;}
     void audio.unlock().catch(()=>{});onPlay();
     if(view.tick>=round.status.tick)seek(0,true);else play();
    }}>{playing?'Pause':'Play'}</button>
    <button className="text-button" disabled={!view||seeking} onClick={()=>seek(0)}>Restart</button>
   </div>
   {manifest&&<GameCabinet manifest={manifest} view={view} round={`REPLAY ${roundIndex+1} / ${rounds.length}`} mode={round.mode}><GameCanvas manifest={manifest} view={view} feedback={feedback.current} onLoaded={()=>setReady(true)} onError={message=>{setError(message);pause();}}/></GameCabinet>}
   <input aria-label="Replay progress" type="range" min="0" max={round.status.tick} value={view?.tick??0} disabled={!view} onChange={e=>seek(+e.target.value)}/>
   <p>{position.toFixed(1)} / {Number(round.status.time).toFixed(1)} sec · {verified===true?round.incomplete?'Replay matches the saved checkpoint.':'Replay matches the recorded finish.':verified===false?'Replay mismatch — this recording needs investigation.':'See the round through each player’s original view.'}</p>
   {round.incomplete&&<p className="replay-interrupted">This round was interrupted. Its recording ends at the last saved checkpoint; no result or leaderboard score was awarded.</p>}
  </>}{error&&<p role="alert">{error}</p>}
 </section></div>;
}
