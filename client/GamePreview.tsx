import {useEffect, useRef, useState} from 'react';
import type {Manifest} from '../server/store';
import {GameCanvas} from './GameCanvas';
import {GameCabinet} from './GameCabinet';
import {Controller} from './Controller';
import {audio} from './audio';

export function GamePreview({manifest, revisionId, onReplay}: {
  manifest: Manifest; revisionId: string; onReplay: (replay: any) => void;
}) {
  const [run, setRun] = useState(0), [players, setPlayers] = useState(1), [seat, setSeat] = useState('p0');
  const [view, setView] = useState<any>(null), [done, setDone] = useState(false), [error, setError] = useState('');
  const [visible, setVisible] = useState(!document.hidden);
  const worker = useRef<Worker | null>(null), field = useRef<HTMLDivElement>(null);
  const frameAt=useRef(performance.now());
  const replay = useRef(onReplay); replay.current = onReplay;
  useEffect(() => {
    const visibility = () => {frameAt.current=performance.now();setVisible(!document.hidden); worker.current?.postMessage({type: 'pause', paused: document.hidden});};
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    setView(null); setDone(false); setError(''); setSeat('p0'); replay.current(null);
    if (!run) return;
    const abort = new AbortController();
    const vm = new Worker(new URL('./editor-play-worker.ts', import.meta.url), {type: 'module'});
    worker.current = vm;
    let loaded = false, ended=false;frameAt.current=performance.now();
    vm.onerror = () => setError('The game preview stopped. Try restarting it.');
    vm.onmessage = ({data}) => {
      if (data.type === 'error') {setError(data.message); vm.terminate(); return;}
      if (data.type === 'frame') {
        frameAt.current=performance.now();loaded=true;ended=data.done; setView(data.view); setDone(data.done);
        replay.current(data.replay.truncated ? null : {revisionId, seed: data.replay.seed, players, steps: data.replay.steps});
      }
    };
    void Promise.all([
      fetch(`/api/versions/${manifest.id}`, {signal: abort.signal}).then(async r => {if (!r.ok) throw Error('Preview unavailable'); return r.json();}),
      fetch(manifest.runtimeUrl!, {signal: abort.signal}).then(async r => {if (!r.ok) throw Error('Preview runtime unavailable'); return r.text();}),
    ]).then(([version, runtime]) => {
      if (abort.signal.aborted) return;
      vm.postMessage({type: 'load', code: version.code, runtime, players, seed: 42});
      field.current?.querySelector<HTMLElement>('[data-game-input]')?.focus();
    }).catch(error => {if (!abort.signal.aborted) setError(error.message);});
    const watchdog = setInterval(() => {
      if (!document.hidden && loaded && !ended && performance.now()-frameAt.current>2000) {
        setError('The game exceeded its preview time budget. Restart to try again.');vm.terminate();
      }
      if (!loaded && performance.now()-frameAt.current>10000) {setError('Preview took too long to load');vm.terminate();}

    }, 1000);
    return () => {abort.abort(); clearInterval(watchdog); vm.terminate(); worker.current = null; audio.stopLoop();};
  }, [manifest.id, run, players, revisionId]);
  useEffect(() => {
    if (run && !done && visible && view) void audio.startLoop(`editor:${revisionId}:${run}`, manifest.meta.id, manifest.music as any, view.time ?? 0).catch(() => {});
    else audio.stopLoop();
  }, [run, done, visible, revisionId, !!view]);
  const start = () => {void audio.unlock().catch(() => {}); setRun(n => n + 1);};
  return <div className="editor-preview" ref={field} data-editor-surface>
    <div className="preview-toolbar">
      <button className="primary" onClick={start}>{run ? 'Restart' : '▶ Play this version'}</button>
      <label>Players <select aria-label="Preview player count" value={players} onChange={e => setPlayers(Number(e.target.value))}>{[1,2,3,4].map(n => <option key={n}>{n}</option>)}</select></label>
      {players > 1 && <label>Control <select aria-label="Preview controlled player" value={seat} onChange={e => {setSeat(e.target.value); worker.current?.postMessage({type: 'seat', seat: e.target.value});}}>{Array.from({length: players}, (_, i) => <option key={i} value={`p${i}`}>Player {i + 1}</option>)}</select></label>}
    </div>
    <GameCabinet manifest={manifest} view={view} round="PRIVATE PLAYTEST" network="PRACTICE" mode="party-v1"
      controls={<Controller active={!!run && !done && !error && visible} epoch={run * 10 + players} label={manifest.meta.controls.action} send={edges => worker.current?.postMessage({type: 'input', edges})}/>}>
      {view ? <GameCanvas manifest={manifest} view={view} onLoaded={() => {}} onError={setError}/> : <div className="preview-start"><p>{run ? 'Opening your game…' : 'Your game is ready to try.'}</p>{!run && <button onClick={start}>Play</button>}</div>}
      {done && <div className="game-overlay"><h2>{view?.outcomes?.[seat] === 'success' ? 'Nice round!' : 'Try again?'}</h2><button onClick={start}>Play again</button></div>}
    </GameCabinet>
    {error && <p role="alert">{error}</p>}
    <p className="preview-note">Click the game to use arrows or WASD and Space. Chatting releases your controls. Practice scores stay here.</p>
  </div>;
}
