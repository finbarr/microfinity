export type ProgressTurn = {
  id: string;
  phase?: string;
  status: string;
  stage: string;
  progress?: {
    startedAt?: number;
    branches?: Record<string, string>;
    timings?: Record<string, number>;
  };
};

type Stage = {
  id: string;
  label: string;
  estimate: string;
  upperMs: number;
  detail: string;
  reusedDetail?: string;
  start: string[];
  end: string[];
};

// Broad ranges from the three instrumented, fresh end-to-end builds. These are
// stage estimates, not a countdown or a percentage of code completed.
const stages: Stage[] = [
  {id: 'brief', label: 'Plan the game', estimate: '15–25 sec', upperMs: 25_000,
    detail: 'Shaping the rules, controls and little world.', reusedDetail: 'Using your game plan',
    start: ['briefStart'], end: ['briefEnd']},
  {id: 'art', label: 'Draw the artwork', estimate: '10–20 sec', upperMs: 20_000,
    detail: 'Drawing your cover and game art.', reusedDetail: 'Using your approved artwork',
    start: ['artStart', 'iconStart'], end: ['artEnd', 'iconEnd']},
  {id: 'music', label: 'Compose the music', estimate: '20–30 sec', upperMs: 30_000,
    detail: 'Composing a soundtrack for your game.', reusedDetail: 'Using your soundtrack',
    start: ['musicStart'], end: ['musicEnd']},
  {id: 'preparing', label: 'Set the stage', estimate: '5–20 sec', upperMs: 20_000,
    detail: 'Getting everything ready to bring your game to life.',
    start: ['prepareStart'], end: ['prepareEnd']},
  {id: 'building', label: 'Build & refine', estimate: '2–4 min', upperMs: 240_000,
    detail: 'Building the game, trying it out and refining the details.',
    start: ['codeStart'], end: ['codeEnd']},
  {id: 'validating', label: 'Final playtest', estimate: '10–30 sec', upperMs: 30_000,
    detail: 'Checking the finished game with one, two, three and four players.',
    start: ['validationStart'], end: ['validationEnd']},
];

const done = (value?: string) => value === 'ready' || value === 'reused';
const timestamps = (keys: string[], timings: Record<string, number>) => keys
  .map(key => timings[key]).filter(value => Number.isFinite(value) && value > 0);

export function buildProgress(turn: ProgressTurn, now: number) {
  const queued = turn.status === 'queued';
  // A queued or newly claimed retry may still have the previous attempt's
  // saved checkpoints until the new attempt publishes its first progress.
  const progress = queued || turn.stage === 'starting' ? undefined : turn.progress;
  const branches = progress?.branches ?? {}, timings = progress?.timings ?? {};
  const visible = turn.phase === 'art' ? stages.slice(0, 2) : stages;
  const codeStages: Record<string, string> = {preparing: 'preparing', working: 'building', checking: 'validating'};
  const codeStage = ['preparing', 'building', 'validating'].includes(turn.stage)
    ? turn.stage : codeStages[branches.code];
  const codeIndex = queued ? -1 : visible.findIndex(stage => stage.id === codeStage);
  const rows = visible.map((stage, index) => {
    const values = stage.id === 'art' ? [branches.art, branches.icon] : [branches[stage.id]];
    const complete = !queued && (values.every(done) || (codeIndex >= 0 && index < codeIndex));
    const active = !queued && !complete && (codeIndex >= 0 ? index === codeIndex : values.includes('working'));
    const reused = complete && values.every(value => value === 'reused');
    const starts = timestamps(stage.start, timings), ends = timestamps(stage.end, timings);
    const start = starts.length ? Math.min(...starts) : undefined;
    const end = complete && ends.length ? Math.max(...ends) : now;
    const elapsedMs = start === undefined || reused || (complete && !ends.length)
      ? undefined : Math.max(0, end - start);
    return {...stage, state: complete ? 'complete' as const : active ? 'active' as const : 'upcoming' as const,
      reused, elapsedMs, overdue: active && elapsedMs !== undefined && elapsedMs > stage.upperMs};
  });
  // Between checkpoints, keep the next real task visible without inventing a
  // start timestamp. Older in-flight jobs still get a useful stage checklist.
  if (!queued && turn.stage !== 'starting' && !rows.some(row => row.state === 'active')) {
    const next = rows.find(row => row.state === 'upcoming');
    if (next) next.state = 'active';
  }
  const active = rows.filter(row => row.state === 'active');
  const elapsedMs = progress?.startedAt && Number.isFinite(progress.startedAt)
    ? Math.max(0, now - progress.startedAt) : undefined;
  return {rows, active, queued, elapsedMs, completed: rows.filter(row => row.state === 'complete').length};
}

export function progressDuration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
