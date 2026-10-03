import {useEffect, useState} from 'react';
import {buildProgress, progressDuration, type ProgressTurn} from './build-progress';

type Props = {turn: ProgressTurn; queueAhead?: number; connected: boolean; busy: boolean; onStop: () => void};

export function BuildProgress({turn, queueAhead = 0, connected, busy, onStop}: Props) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (turn.status !== 'working') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [turn.id, turn.status, turn.progress?.startedAt]);
  const view = buildProgress(turn, now);
  const heading = view.queued ? 'Your game is in line' : view.active.length > 1 ? 'Making art and music'
    : view.active[0]?.label ?? 'Opening your studio';
  const detail = view.queued
    ? queueAhead > 0 ? `${queueAhead} ${queueAhead === 1 ? 'game' : 'games'} ahead of you. Your turn is saved.` : 'Your turn is saved. We’ll get started shortly.'
    : !connected ? 'Reconnecting to your saved progress…'
    : `${view.active.some(row => row.overdue) ? 'Taking a little longer. ' : ''}${view.active.map(row => row.detail).join(' ') || 'Getting ready to start.'}`;
  return <section className="build-progress" aria-label={turn.phase === 'art' ? 'Artwork progress' : 'Game building progress'}>
    <div className="build-progress-heading">
      <div><span className="eyebrow">{turn.phase === 'art' ? 'FINDING THE LOOK' : 'BRINGING IT TO LIFE'}</span>
        <h2 role="status">{heading}<span className="build-progress-dot" aria-hidden="true"/></h2></div>
      <div className="build-progress-actions">
        {view.elapsedMs !== undefined && <span className="build-total-time">{progressDuration(view.elapsedMs)} elapsed</span>}
        <button className="secondary" disabled={busy} onClick={onStop}>Stop</button>
      </div>
    </div>
    <ol className="build-stages" aria-label="Generation stages">
      {view.rows.map((row, index) => <li key={row.id} data-stage={row.id} className={`build-step ${row.state}`} aria-current={row.state === 'active' ? 'step' : undefined}>
        <span className="build-step-number" aria-hidden="true">{row.state === 'complete' ? '✓' : String(index + 1).padStart(2, '0')}</span>
        <div><span className="build-step-label">{row.label}</span>
          <span className="build-step-time">{row.reused ? row.reusedDetail
            : row.state === 'complete' ? row.elapsedMs !== undefined ? `Done in ${progressDuration(row.elapsedMs)}` : 'Done'
            : `About ${row.estimate}`}</span>
          {row.state === 'active' && <span className="build-step-elapsed">{row.elapsedMs !== undefined ? `${progressDuration(row.elapsedMs)} so far` : 'Starting…'}</span>}
        </div>
      </li>)}
    </ol>
    <div className="build-progress-footer"><p>{detail}</p><span>{view.completed}/{view.rows.length} stages complete</span></div>
    <small className="build-time-note">{view.queued ? 'Time estimates start when your turn begins.' : 'Stage times are estimates. Your idea may take a little longer.'}{turn.phase === 'art' && ' You’ll review the art before building.'}</small>
  </section>;
}
