import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildProgress, progressDuration, type ProgressTurn} from '../client/build-progress';
import {BuildProgress} from '../client/BuildProgress';

const start = 1_700_000_000_000;
const turn: ProgressTurn = {id: 'build', phase: 'build', status: 'working', stage: 'building',
  progress: {startedAt: start, branches: {brief: 'reused', art: 'reused', icon: 'reused', music: 'ready', code: 'working'},
    timings: {musicStart: start, musicEnd: start + 20_000, prepareStart: start + 20_000,
      prepareEnd: start + 30_000, codeStart: start + 30_000}}};
const row = (view: ReturnType<typeof buildProgress>, id: string) => view.rows.find(row => row.id === id)!;

test('build milestones use saved timings, with reused media and fixed completed durations', () => {
  const view = buildProgress(turn, start + 90_000);
  assert.equal(view.completed, 4);
  assert.deepEqual(view.active.map(row => row.id), ['building']);
  assert.equal(view.elapsedMs, 90_000);
  assert.equal(row(view, 'building').elapsedMs, 60_000);
  assert.equal(row(view, 'brief').reused, true);
  assert.equal(row(view, 'art').elapsedMs, undefined);
  assert.equal(row(view, 'music').elapsedMs, 20_000);
  assert.equal(row(view, 'preparing').elapsedMs, 10_000);
  assert.equal(row(view, 'validating').state, 'upcoming');
  assert.equal(row(buildProgress(turn, start + 180_000), 'music').elapsedMs, 20_000);
});

test('refreshing or reconnecting restores elapsed time and long builds keep counting', () => {
  const first = buildProgress(turn, start + 100_000);
  const reloaded = buildProgress(JSON.parse(JSON.stringify(turn)), start + 100_000);
  assert.deepEqual(first, reloaded);
  const slow = buildProgress(turn, start + 400_000);
  assert.equal(row(slow, 'building').overdue, true);
  assert.equal(row(slow, 'building').elapsedMs, 370_000);
  assert.equal(row(slow, 'validating').state, 'upcoming', 'elapsed time cannot advance the real stage');
});

test('queued retries ignore the previous attempt and a claimed retry uses its own clock', () => {
  const queued = buildProgress({...turn, status: 'queued', stage: 'queued'}, start + 600_000);
  assert.equal(queued.elapsedMs, undefined);
  assert.equal(queued.completed, 0);
  assert.equal(queued.active.length, 0);
  assert.ok(queued.rows.every(row => row.state === 'upcoming'));
  const starting = buildProgress({...turn, stage: 'starting'}, start + 600_000);
  assert.equal(starting.elapsedMs, undefined);
  assert.equal(starting.completed, 0);
  assert.equal(starting.active.length, 0);
  const retry = buildProgress({...turn, stage: 'preparing', progress: {startedAt: start + 600_000,
    branches: {brief: 'reused', art: 'reused', icon: 'reused', music: 'reused', code: 'preparing'},
    timings: {prepareStart: start + 600_000}}}, start + 604_000);
  assert.equal(retry.elapsedMs, 4000);
  assert.equal(row(retry, 'preparing').elapsedMs, 4000);
  assert.equal(row(retry, 'building').state, 'upcoming');
});

test('art review shows only planning and the parallel images, keeping partial artwork active', () => {
  const art = buildProgress({id: 'art', phase: 'art', status: 'working', stage: 'art', progress: {
    startedAt: start, branches: {brief: 'ready', art: 'ready', icon: 'working'},
    timings: {briefStart: start, briefEnd: start + 18_000, artStart: start + 18_000,
      artEnd: start + 25_000, iconStart: start + 19_000}}}, start + 28_000);
  assert.deepEqual(art.rows.map(row => row.id), ['brief', 'art']);
  assert.equal(art.completed, 1);
  assert.equal(row(art, 'art').state, 'active');
  assert.equal(row(art, 'art').elapsedMs, 10_000);
  const parallel = buildProgress({id: 'fresh', phase: 'build', status: 'working', stage: 'media',
    progress: {branches: {brief: 'ready', art: 'working', icon: 'working', music: 'working'}}}, start);
  assert.deepEqual(parallel.active.map(row => row.id), ['art', 'music']);
});

test('legacy jobs show known milestones without inventing elapsed timings or finishing early', () => {
  const legacy = buildProgress({id: 'old', phase: 'build', status: 'working', stage: 'validating'}, start);
  assert.equal(legacy.completed, 5);
  assert.deepEqual(legacy.active.map(row => row.id), ['validating']);
  assert.ok(legacy.rows.every(row => row.elapsedMs === undefined));
  const future = buildProgress(turn, start - 10_000);
  assert.equal(future.elapsedMs, 0);
  assert.equal(row(future, 'building').elapsedMs, 0);
});

test('the progress card explains the queue, reconnection and overruns, with accessible current stages', () => {
  const props = {turn: {...turn, progress: {...turn.progress, startedAt: Date.now() - 500_000,
    timings: {...turn.progress?.timings, codeStart: Date.now() - 400_000}}}, connected: true, busy: false, onStop() {}};
  const working = renderToStaticMarkup(createElement(BuildProgress, props));
  assert.match(working, /Taking a little longer/);
  assert.match(working, /About 2–4 min/);
  assert.match(working, /Using your approved artwork/);
  assert.match(working, /class="build-step active" aria-current="step"/);
  assert.match(working, /4\/6 stages complete/);
  assert.doesNotMatch(working, /100%|0s remaining/);
  const queued = renderToStaticMarkup(createElement(BuildProgress, {...props, turn: {...turn, status: 'queued', stage: 'queued'}, queueAhead: 2}));
  assert.match(queued, /2 games ahead of you/);
  assert.doesNotMatch(queued, /elapsed|aria-current/);
  const reconnecting = renderToStaticMarkup(createElement(BuildProgress, {...props, connected: false}));
  assert.match(reconnecting, /Reconnecting to your saved progress/);
  assert.doesNotMatch(reconnecting, /Taking a little longer/);
});

test('elapsed durations cross minute boundaries without a negative countdown', () => {
  assert.equal(progressDuration(59_900), '59s');
  assert.equal(progressDuration(60_000), '1m 0s');
  assert.equal(progressDuration(141_000), '2m 21s');
  assert.equal(progressDuration(-1000), '0s');
});
