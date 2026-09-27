/** Reproducible local gameplay probes; no providers, credentials, or database writes. */
import assert from 'node:assert/strict';
import {readdir, readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compile, bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {scriptedDecision} from '../server/controllers';
import {buttonEdges} from '../runtime/input';
import {colors, emptyButtons, type Buttons, type Edge} from '../sdk/index';

const output = 'artifacts/cartridge-audit';
const boot = await bootstrap();
const players = (count: number) => Array.from({length: count}, (_, i) => ({id: `p${i}`, name: ['Alex', 'Blair', 'Casey', 'Drew'][i], color: colors[i]}));
const tap = (button: Edge['button']): Edge[] => [{button, down: true}, {button, down: false}];
const hash = (source: string) => createHash('sha256').update(source).digest('hex');
const games: any[] = [], showcases: any[] = [];
function frame(vm: Sandbox, id: string, label: string) {
  const view = vm.call('observe', 'p0'), meta = vm.call('meta').meta;
  return {id, label, title: meta.title, style: meta.style, time: view.time, hud: view.hud, scores: view.scores,
    commands: vm.call('draw', view.game, [], 0, {time: view.time}),
    ...(id === 'nose-dive' ? {speed: view.game.speed, windowMs: 2000 * view.game.tolerance / view.game.speed} : {})};
}
function episode(vm: Sandbox, count: number, policy: string, capture = false) {
  const meta = vm.call('meta').meta, config = {seed: 71, difficulty: 1, players: players(count)};
  let status = vm.call('init', config, 'party-v1'), held: Record<string, Buttons> = Object.fromEntries(config.players.map(p => [p.id, emptyButtons()]));
  const memory: Record<string, number> = {}, frames: any[] = [], turns: string[] = [];
  let firstScore: number | null = null, lastTurn: number | undefined;
  for (let steps = 0; !status.done && steps < 8000; steps++) {
    const edges: Record<string, Edge[]> = {};
    const current = vm.call('observe', 'p0').game;
    if (meta.id === 'patchwork-pass' && current.turns !== lastTurn) {
      turns.push(`p${current.turn}`); lastTurn = current.turns;
    }
    if (capture && ((frames.length === 0 && status.time >= 1) || (frames.length === 1 && status.time >= 5))) frames.push(frame(vm, meta.id, `${count} players · ${policy}`));
    if (policy !== 'idle' && (meta.clock === 'action' || steps % 6 === 0)) for (const p of config.players) {
      const view = vm.call('observe', p.id);
      if (meta.id === 'cup-shuffle') {
        const game = view.game;
        if (game.phase === 'reveal') memory[p.id] = game.cups.find((cup: any) => cup.x === game.ballX).id;
        if (game.phase === 'choose' && !game.chosen) {
          const target = game.cups.findIndex((cup: any) => cup.id === memory[p.id]);
          assert.ok(target >= 0, 'memory player only follows a cup it saw revealed');
          edges[p.id] = [...Array.from({length: (target - game.cursor + 3) % 3}, () => tap('right')).flat(), ...tap('action')];
        }
      } else {
        const buttons = scriptedDecision(meta, view, held[p.id], steps).buttons;
        edges[p.id] = buttonEdges(held[p.id], buttons); held[p.id] = buttons;
      }
    }
    status = meta.clock === 'action' ? vm.call('step', edges, policy === 'idle' ? 10 : 1, policy === 'idle' || steps % 10 === 9 ? 'timeout' : 'input') : vm.call('step', edges);
    if (firstScore === null && Object.values(status.scores).some(score => score !== 0)) firstScore = status.time;
  }
  assert.ok(status.done, `${meta.id} did not finish`);
  if (capture) frames.push(frame(vm, meta.id, 'Round finished'));
  return {players: count, policy, duration: status.time, firstScore, scores: status.scores, outcomes: status.outcomes, reason: status.reason,
    ...(turns.length ? {turns, expectedTurns: vm.call('observe', 'p0').game.order?.length ?? Math.max(count, meta.players[0]) * (meta.rules?.includes('two turns each') ? 2 : 4)} : {}), frames};
}

for (const file of (await readdir('games')).filter(name => name.endsWith('.ts')).sort()) {
  const id = file.slice(0, -3), source = await readFile(`games/${file}`, 'utf8');
  const vm = await Sandbox.create(await compile(source), boot);
  try {
    const current = {sourceHash: hash(source), meta: vm.call('meta').meta,
      episodes: [1, 2, 3, 4].flatMap(count => ['idle', 'scripted'].map(policy => episode(vm, count, policy, count === 4 && policy === 'scripted')))};
    let live: any = null;
    // Optional exact production versions downloaded read-only; never fetched implicitly.
    const saved = await readFile(`${output}/live/${id}.json`, 'utf8').catch(() => null);
    if (saved) {
      const version = JSON.parse(saved), runtime = await readFile(`${output}/live/${version.manifest.runtimeUrl.split('/').at(-1)}`, 'utf8');
      const publicVM = await Sandbox.create(version.code, runtime);
      try {live = {versionId: version.id, sourceHash: hash(version.source), matchesCurrent: source === version.source,
        meta: publicVM.call('meta').meta, episodes: ['idle', 'scripted'].map(policy => episode(publicVM, 4, policy, policy === 'scripted'))};}
      finally {publicVM.dispose();}
    }
    games.push({id, current, live});
    console.log(`${id}: 1–4 local seats exercised${live ? '; pinned public version checked' : ''}`);
  } finally {vm.dispose();}
}

const cups = await Sandbox.create(await compile(await readFile('games/cup-shuffle.ts', 'utf8')), boot);
try {
  for (const scenario of ['Split votes', 'Four votes on one cup', 'One player times out']) {
    cups.call('init', {seed: 71, difficulty: 1, players: players(4)});
    while (cups.call('observe', 'p0').game.phase !== 'choose') cups.call('step', {});
    const choices = scenario === 'Split votes' ? [0, 1, 2, 0] : scenario === 'Four votes on one cup' ? [1, 1, 1, 1] : [0, 1, 2];
    for (let i = 0; i < choices.length; i++) {
      cups.call('step', {[`p${i}`]: [...Array.from({length: (choices[i] - 1 + 3) % 3}, () => tap('right')).flat(), ...tap('action')]});
      if (i === 0 && scenario === 'Split votes') showcases.push(frame(cups, 'cup-shuffle', 'Only lock status is public'));
    }
    while (cups.call('observe', 'p0').game.phase !== 'result') cups.call('step', {});
    showcases.push(frame(cups, 'cup-shuffle', scenario));
  }
} finally {cups.dispose();}

const nose = await Sandbox.create(await compile(await readFile('games/nose-dive.ts', 'utf8')), boot);
try {
  nose.call('init', {seed: 71, difficulty: 1, players: players(4)});
  showcases.push(frame(nose, 'nose-dive', 'Fast opening'));
  while (nose.call('observe', 'p0').time < 13) nose.call('step', {});
  showcases.push(frame(nose, 'nose-dive', 'Forgiving finish'));
} finally {nose.dispose();}

// Showcase role feedback and the new recognition clues, using ordinary player inputs.
for (const id of ['patchwork-pass', 'skill-continue', 'odd-snack-out']) {
  const vm = await Sandbox.create(await compile(await readFile(`games/${id}.ts`, 'utf8')), boot);
  try {
    vm.call('init', {seed: 71, difficulty: 1, players: players(4)});
    if (id === 'patchwork-pass') {
      vm.call('step', {p0: tap('action'), p1: tap('action'), p2: tap('action'), p3: tap('action')});
      for (let i = 0; i < 22; i++) vm.call('step', {});
      showcases.push(frame(vm, id, 'Three rival pins; one active patch'));
    } else if (id === 'skill-continue') {
      vm.call('step', {p2: tap('action')});
      showcases.push(frame(vm, id, 'Brief splash covers the meter'));
      for (let i = 0; i < 25; i++) vm.call('step', {});
      showcases.push(frame(vm, id, 'Meter returns; splash spent'));
    } else {
      for (let round = 0; round < 3; round++) {
        while (vm.call('observe', 'p0').game.round < round) vm.call('step', {});
        showcases.push(frame(vm, id, `${vm.call('observe', 'p0').game.clue} clue`));
        vm.call('step', Object.fromEntries(players(4).map(player => [player.id, tap('action')])));
        showcases.push(frame(vm, id, 'Votes revealed together'));
      }
    }
  } finally {vm.dispose();}
}

// Controlled, reachable edge cases separate concrete defects from design opinions.
const edgeCases: any = {};
const asteroids = await Sandbox.create(await compile(await readFile('games/asteroid-scramble.ts', 'utf8')), boot);
try {
  const collisionResults = [];
  for (const order of [players(4), players(4).reverse()]) {
    asteroids.call('init', {seed: 71, difficulty: 1, players: players(4)});
    const saved = asteroids.call('save'), state = saved.engines[0].state;
    state.schedule = [];
    state.rocks = [{id: 999, x: 320, y: 210, vx: 0, vy: 0}];
    state.shots = order.map((player, i) => ({id: i, owner: player.id, x: 320, y: 220}));
    asteroids.call('restore', saved);
    collisionResults.push({shotOrder: order.map(player => player.id), scores: asteroids.call('step', {}).scores});
  }
  edgeCases.asteroidSimultaneousHit = collisionResults;
} finally {asteroids.dispose();}

const toast = await Sandbox.create(await compile(await readFile('games/toast-catch.ts', 'utf8')), boot);
try {
  let status = toast.call('init', {seed: 71, difficulty: 0, players: players(1)});
  while (!status.done) status = toast.call('step', {});
  edgeCases.toastEasyLastSlice = {time: status.time, catchLine: 300, slice: toast.call('observe', 'p0').game.slices.find((slice: any) => slice.id === 11)};
} finally {toast.dispose();}

const conveyor = await Sandbox.create(await compile(await readFile('games/conveyor-clash.ts', 'utf8')), boot);
try {
  for (const difficulty of [0, 1]) {
    conveyor.call('init', {seed: 71, difficulty, players: players(4)});
    let view = conveyor.call('observe', 'p0');
    while (view.game.turn === 0) {
      const previous = view;
      conveyor.call('step', {});
      view = conveyor.call('observe', 'p0');
      if (view.game.turn !== 0) edgeCases[`conveyorLastParcelDifficulty${difficulty}`] = {
        shiftEnded: view.time, catchLine: 306, lastParcelBeforeClear: previous.game.parcels.find((parcel: any) => parcel.id === 11)
      };
    }
  }
} finally {conveyor.dispose();}

await mkdir(output, {recursive: true});
await writeFile(`${output}/audit.json`, JSON.stringify({at: new Date().toISOString(),
  method: 'QuickJS; seed 71; normal difficulty; 1–4 local party seats with idle or observation-only scripted input every 100ms. Cup bot remembers visible cup identity; other games use the existing development policy. Pinned public cartridges use their downloaded code and runtime. Action probes use 1s inputs / 10s idle timeouts. Captures use the real cartridge draw callback and production canvas renderer. No humans or cloud controllers measured.',
  games, showcases, edgeCases}, null, 2));
