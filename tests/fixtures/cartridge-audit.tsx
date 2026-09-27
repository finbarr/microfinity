import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {drawCommands} from '../../client/renderer';
import {GamePreview} from '../../client/GamePreview';
import type {Manifest} from '../../server/store';
import '../../client/styles.css';
import '../../client/editor.css';

function Capture({frame}: {frame: any}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {drawCommands(canvas.current!, frame.commands, new Map(), frame.style);}, [frame]);
  return <article className="audit-capture">
    <h3>{frame.title} · {frame.label}</h3>
    <p>{frame.time.toFixed(2)}s · {frame.speed ? `${frame.speed.toFixed(2)} rad/s · ${Math.round(frame.windowMs)}ms timing window` : Object.entries(frame.scores).map(([id, score]) => `${id}: ${score}`).join(' · ')}</p>
    <canvas ref={canvas} width="640" height="400" aria-label={`${frame.title}: ${frame.label}`}/>
    <p>{frame.hud.message ?? 'Move + hold SPACE. Shoot the most rocks!'}</p>
  </article>;
}
function Audit() {
  const [report, setReport] = useState<any>(), [library, setLibrary] = useState<Manifest[]>([]);
  const [game, setGame] = useState('cup-shuffle'), [source, setSource] = useState('current'), [error, setError] = useState('');
  useEffect(() => {
    void Promise.all([fetch('/artifacts/cartridge-audit/audit.json').then(r => r.json()), fetch('/api/library').then(r => r.json())])
      .then(([report, library]) => {setReport(report); setLibrary(library);}).catch(error => setError(error.message));
  }, []);
  const manifest = library.find(item => item.gameId === game);
  const frames = report?.games.find((item: any) => item.id === game)?.[source]?.episodes.find((episode: any) => episode.frames.length)?.frames ?? [];
  return <main className="audit-page">
    <style>{`.audit-page{max-width:1380px;margin:0 auto;padding:28px;color:#fff3dc}.audit-page h1{font-size:30px}.audit-page select{margin:0 20px 12px 8px;padding:8px}.audit-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr));gap:20px}.audit-capture{background:#20202e;padding:12px;border:1px solid #49455c;border-radius:14px}.audit-capture h3{font-size:16px;margin:0 0 8px}.audit-capture p{font-size:14px;line-height:1.5}.audit-capture canvas{width:100%;height:auto;display:block}.audit-page .editor-preview{max-width:850px;margin:24px auto}.audit-page h2{margin:30px 0 14px;font-size:23px}`}</style>
    <h1>Standard cartridge audit</h1>
    <p>Local gameplay and captured QuickJS frames. Use the selectors to compare the revised cartridges with the pre-audit captures.</p>
    {error && <p role="alert">{error}</p>}
    <label>Cartridge <select aria-label="Cartridge" value={game} onChange={event => setGame(event.target.value)}>{library.map(item => <option key={item.gameId} value={item.gameId}>{item.meta.title}</option>)}</select></label>
    <label>Captures <select aria-label="Capture source" value={source} onChange={event => setSource(event.target.value)}><option value="current">Local version</option><option value="live">Public version before this audit</option></select></label>
    <section className="audit-grid">{frames.map((frame: any, i: number) => <Capture key={`${game}-${source}-${i}`} frame={frame}/>)}</section>
    <h2>Play the local version</h2>
    {manifest && <GamePreview key={manifest.id} manifest={manifest} revisionId={manifest.id} onReplay={() => {}}/>}
    <h2>Voting, timing, and interference checks</h2>
    <section className="audit-grid">{report?.showcases.map((frame: any, i: number) => <Capture key={i} frame={frame}/>)}</section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Audit/>);
