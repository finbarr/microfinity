import type {MediaState} from '../server/generation';
import {useRef, useState} from 'react';
import {audio} from './audio';

type Props = {
  media?: MediaState;
  title?: string;
  stage?: string;
  artPhase?: boolean;
  reviewing: boolean;
  ready: boolean;
  busy: boolean;
  hasFeedback?: boolean;
  compact?: boolean;
  snapshot?: string;
  onBuild: () => void;
  onRefine: () => void;
};

export function CreationCartridge({media, title, stage, artPhase, reviewing, ready, busy, hasFeedback, compact,
  snapshot, onBuild, onRefine}: Props) {
  const artWorking = stage === 'art' || (artPhase && ['queued', 'starting'].includes(stage ?? ''));
  const loading = !artWorking && ['queued', 'starting', 'media', 'building', 'validating'].includes(stage ?? '') && !reviewing;
  const dialog = useRef<HTMLDialogElement>(null);
  const [inspection, setInspection] = useState<{url: string; label: string} | null>(null);
  const inspect = (url: string, label: string) => {setInspection({url, label}); dialog.current?.showModal();};
  const steps = [
    {label: 'Artwork', done: !!(media?.icon && media.assets?.length)},
    {label: 'Sound', done: !!media?.music},
    {label: 'Play', done: ready},
  ];
  const state = ready ? 'ready' : reviewing ? 'review' : loading ? 'loading' : artWorking ? 'drawing' : 'blank';
  return <div className={`cartridge-workbench ${compact ? 'compact' : ''}`} data-cartridge-state={state}>
    {!compact && <div className="workbench-heading"><span className="eyebrow">A LITTLE WORLD, IN YOUR HANDS</span><p>{reviewing ? 'Like the look? Let’s bring it to life.' : loading ? 'Loading a little life into your cartridge.' : artWorking ? 'First, a face for your game.' : 'Every great game starts with a blank cartridge.'}</p></div>}
    <article className="studio-cartridge" aria-label={`${title ?? 'Your new game'} cartridge`}>
      <div className="cartridge-ridge" aria-hidden="true"/>
      <span className="shell-screw screw-left" aria-hidden="true"/><span className="shell-screw screw-right" aria-hidden="true"/>
      <div className="studio-cartridge-label">
        <div className="studio-label-band"><span>MICROFINITY</span><span>{ready ? 'READY TO PLAY' : 'WORK IN PLAY'}</span></div>
        <div className="studio-cover">
          {media?.icon ? <button className="studio-inspect-cover" aria-label="Inspect cover artwork" onClick={() => inspect(media.icon!.url, 'Cover artwork')}><img key={media.icon.hash} src={media.icon.url} alt={`Cover artwork for ${title ?? 'your game'}`}/></button> : <div className="studio-cover-placeholder"><span aria-hidden="true">✦</span><p>{artWorking ? 'Dreaming in pixels…' : 'Your idea goes here.'}</p></div>}
          <span className="studio-edition">{reviewing ? 'ART PROOF' : ready ? 'PLAYABLE EDITION' : 'FIRST EDITION'}</span>
        </div>
        <div className="studio-label-copy"><h2>{title ?? 'Untitled adventure'}</h2><p>{media?.brief?.premise ?? 'A tiny world. A big idea. Entirely yours.'}</p></div>
      </div>
      <div className="studio-cartridge-parts">
        <div className="studio-sprites">
          {media?.assets?.length ? media.assets.map(asset => <button className="studio-inspect-sprite" key={asset.hash} aria-label={`Inspect game artwork: ${asset.name}`} onClick={() => inspect(asset.url, `Game artwork: ${asset.name}`)}><img src={asset.url} alt={`Gameplay artwork: ${asset.name}`}/><span>IN THE GAME ↗</span></button>) : <div className="studio-sprite-empty"><span aria-hidden="true">＋</span><small>CAST TO COME</small></div>}
        </div>
        <ol className="cartridge-load-list" aria-label="Cartridge contents">{steps.map(step => <li key={step.label} className={step.done ? 'loaded' : ''}><i aria-hidden="true"/><span>{step.label}</span><small>{step.done ? 'Loaded' : step.label === 'Artwork' && artWorking ? 'Drawing' : loading ? 'Loading' : 'To come'}</small></li>)}</ol>
      </div>
      <div className="studio-cartridge-bottom"><span>1–4 PLAYERS · ENDLESS POSSIBILITIES</span><span aria-hidden="true">▼</span></div>
      <div className="cartridge-contacts" aria-hidden="true"/>
    </article>
    {media?.music && <div className="cartridge-sound"><label htmlFor="cartridge-soundtrack">♫ Your soundtrack is loaded</label><audio id="cartridge-soundtrack" controls src={media.music.url} preload="none" onPlay={() => audio.stopLoop()}/></div>}
    {reviewing && <div className="cartridge-approval"><p>The cover and game art are ready for your eye.<br/>Tweak the look, or give this cartridge a heartbeat.</p><div><button className="secondary" disabled={busy} onClick={onRefine}>Tweak the artwork</button><button className="primary" disabled={busy || hasFeedback} onClick={onBuild}>Build this game <span aria-hidden="true">↗</span></button></div><small>Music and game building start when you’re happy with the art.</small></div>}
    {!compact && snapshot && <figure className="cartridge-live-window"><figcaption><span aria-hidden="true">●</span> A PEEK INSIDE · LATEST PLAYTEST</figcaption><img src={snapshot} alt="Latest game development snapshot"/></figure>}
    <dialog className="studio-art-dialog" ref={dialog} aria-labelledby="studio-art-dialog-title"><div><h2 id="studio-art-dialog-title">{inspection?.label}</h2><button onClick={() => dialog.current?.close()} aria-label="Close artwork preview">×</button></div>{inspection && <img src={inspection.url} alt={inspection.label}/>}<p>Close this preview to tell us what you’d change.</p></dialog>
  </div>;
}
