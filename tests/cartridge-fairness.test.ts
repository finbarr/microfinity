import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile, bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {colors, type Edge} from '../sdk/index';
const players = (count = 4) => colors.slice(0, count).map((color, i) => ({id: `p${i}`, name: `P${i}`, color}));
const tap = (button: Edge['button'] = 'action'): Edge[] => [{button, down: true}, {button, down: false}];
async function game(id: string) {return Sandbox.create(await compile(await readFile(`games/${id}.ts`, 'utf8')), await bootstrap());}

test('Patchwork gives every seat two timed turns even with idle stitchers and rival pin spam', async () => {
  const vm = await game('patchwork-pass');
  try {
    for (const count of [2, 3, 4]) {
      let status = vm.call('init', {seed: 71, difficulty: 1, players: players(count)}, 'party-v1');
      const turns: number[] = [], nativeCount = Math.max(2, count);
      let previous = -1;
      while (!status.done) {
        const v = vm.call('observe', 'p0').game;
        if (v.turns !== previous) {turns.push(v.turn); previous = v.turns;}
        const edges = Object.fromEntries(Array.from({length: nativeCount}, (_, i) => [`p${i}`, i === v.turn ? [] : [...tap('right'), ...tap()]]));
        status = vm.call('step', edges);
        assert.ok(status.time <= nativeCount * 10 + .1);
      }
      assert.deepEqual(turns, [...Array(nativeCount).keys(), ...[...Array(nativeCount).keys()].reverse()]);
      assert.ok(Object.values(status.outcomes).every(outcome => outcome === 'failure'));
      assert.ok(Object.values(status.scores).every(score => score === 0));
    }
    vm.call('init', {seed: 71, difficulty: 1, players: players()});
    vm.call('step', {p0: tap()}); // Ghost at (0, 0).
    vm.call('step', {p1: [...tap('up'), ...tap('left'), ...tap('left'), ...tap('left'), ...tap('left'), ...tap()]});
    let v = vm.call('observe', 'p0').game;
    assert.equal(v.pins[1].cell, 1); assert.equal(v.valid, true, 'a warned pin has not landed');
    for (let i = 0; i < 22; i++) vm.call('step', {});
    v = vm.call('observe', 'p0').game;
    assert.equal(v.valid, false, 'a landed pin blocks its empty cell');
    vm.call('step', {p1: [...tap('right'), ...tap()]});
    assert.equal(vm.call('observe', 'p0').game.pins[1].cell, 1, 'only one fixed pin per rival per turn');
    vm.call('step', {p0: tap()});
    assert.equal(vm.call('observe', 'p0').game.phase, 'choose', 'blocked shapes can be exchanged');
    while (vm.call('observe', 'p0').game.turn === 0) vm.call('step', {});
    assert.ok(vm.call('observe', 'p0').game.pins.every((pin: any) => pin.cell === -1), 'pins clear for the next stitcher');
  } finally {vm.dispose();}
});

test('Skill Continue awards equal personal attempts, never an idle survivor win, and bounds splashes', async () => {
  const vm = await game('skill-continue');
  try {
    for (const count of [2, 3, 4]) for (const difficulty of [0, 3]) for (const skilled of [false, true]) {
      let status = vm.call('init', {seed: 71, difficulty, players: players(count)});
      while (!status.done) {
        const v = vm.call('observe', 'p0').game;
        status = vm.call('step', skilled && v.phase >= .62 && v.phase < .7 ? {[`p${v.turn}`]: tap()} : {});
        assert.ok(status.time < 25);
      }
      const v = vm.call('observe', 'p0').game;
      assert.deepEqual(v.attempts, Array(count).fill(3));
      assert.ok(Object.values(status.scores).every(score => score === (skilled ? 3 : 0)));
      assert.ok(Object.values(status.outcomes).every(outcome => outcome === (skilled ? 'success' : 'failure')));
    }
    vm.call('init', {seed: 71, difficulty: 1, players: players()});
    vm.call('step', {p2: tap()});
    let v = vm.call('observe', 'p0').game;
    const until = v.splashUntil;
    assert.equal(v.phase, null); assert.equal(v.splashed, true);
    for (let i = 0; i < 24; i++) vm.call('step', {p1: tap(), p2: tap(), p3: tap()});
    v = vm.call('observe', 'p0').game;
    assert.equal(v.splashUntil, until, 'rivals cannot stack or extend the blackout');
    assert.equal(typeof v.phase, 'number');
    assert.equal(v.turn, 0); assert.deepEqual(v.attempts, [0, 0, 0, 0]);
    const commands = vm.call('draw', v); assert.ok(commands.length > 0);
  } finally {vm.dispose();}
});

test('same-tick asteroid hits credit every distinct owner independently of projectile order', async () => {
  const vm = await game('asteroid-scramble');
  try {
    for (const owners of [['p0', 'p1', 'p2', 'p3', 'p0'], ['p3', 'p2', 'p1', 'p0', 'p0']]) {
      vm.call('init', {seed: 71, difficulty: 1, players: players()});
      const saved = vm.call('save'), s = saved.engines[0].state;
      s.schedule = []; s.rocks = [{id: 999, x: 320, y: 210, vx: 0, vy: 0}];
      s.shots = owners.map((owner, id) => ({id, owner, x: 320, y: 220}));
      vm.call('restore', saved);
      assert.deepEqual(vm.call('step', {}).scores, {p0: 1, p1: 1, p2: 1, p3: 1});
      assert.equal(vm.call('observe', 'p0').game.shots.length, 0, 'every colliding projectile is consumed');
      assert.deepEqual(vm.call('step', {}).scores, {p0: 1, p1: 1, p2: 1, p3: 1});
    }
  } finally {vm.dispose();}
});

test('all toast slices and conveyor parcels reach the catch line before their clock ends', async () => {
  for (const id of ['toast-catch', 'conveyor-clash']) {
    const vm = await game(id);
    try {
      for (const difficulty of [0, 1, 2, 3]) {
        let status = vm.call('init', {seed: 71, difficulty, players: players(id === 'toast-catch' ? 1 : 4)});
        const reached = new Set<number>();
        while (!status.done) {
          const v = vm.call('observe', 'p0').game;
          for (const item of v.slices ?? v.parcels) if (item.y >= (id === 'toast-catch' ? 300 : 306)) reached.add(item.id);
          // Keep the catcher away so crossing objects remain observable.
          status = vm.call('step', Object.fromEntries(players(id === 'toast-catch' ? 1 : 4).map(p => [p.id, [{button: 'left', down: true}]])));
        }
        assert.equal(reached.size, id === 'toast-catch' ? 12 : 48, `${id}, difficulty ${difficulty}`);
      }
    } finally {vm.dispose();}
  }
});

test('cheers are visible and seat-local without changing either catching hitbox', async () => {
  for (const id of ['toast-catch', 'umbrella-panic']) {
    const vm = await game(id);
    try {
      vm.call('init', {seed: 71, difficulty: 1, players: players()}, 'party-v1');
      const before = vm.call('observe', 'p2').game;
      const status = vm.call('step', {p2: tap()});
      const after = vm.call('observe', 'p2').game;
      assert.ok(after.cheerUntil > after.time); assert.equal(after.x, before.x);
      assert.equal(vm.call('observe', 'p0').game.cheerUntil, 0);
      assert.deepEqual(status.scores, {p0: 0, p1: 0, p2: 0, p3: 0});
      assert.ok(status.feedback.some((event: any) => event.kind === 'cheer' && event.playerId === 'p2'));
    } finally {vm.dispose();}
  }
});

test('Odd Snack rotates readable clues and hides each vote until the joint reveal', async () => {
  const vm = await game('odd-snack-out');
  try {
    let status = vm.call('init', {seed: 71, difficulty: 1, players: players()}), clues = new Set<string>();
    while (!status.done) {
      const v = vm.call('observe', 'p0').game;
      if (!v.reveal) {
        clues.add(v.clue);
        const matches = v.snacks.map((snack: any, i: number) => ({snack, i})).filter(({snack}: any) => v.clue === 'sprinkles' ? snack.sprinkles === 2 : v.clue === 'frown' ? snack.mood === 'sad' : snack.sleepy);
        assert.equal(matches.length, 1);
        const answer = matches[0].i;
        for (const player of players()) {
          let mine = vm.call('observe', player.id).game;
          while (mine.cursor !== answer) {vm.call('step', {[player.id]: tap('right')}); mine = vm.call('observe', player.id).game;}
          status = vm.call('step', {[player.id]: tap()});
          const next = vm.call('observe', 'p0').game;
          if (player.id !== 'p3') {
            assert.equal(next.answer, null); assert.ok(next.votes.every((vote: any) => vote.choice === null && vote.correct === null));
          } else {assert.equal(next.reveal, true); assert.ok(next.votes.every((vote: any) => vote.choice === answer && vote.correct));}
        }
      } else status = vm.call('step', {});
      assert.ok(status.time <= 18);
    }
    assert.equal(clues.size, 3); assert.deepEqual(status.scores, {p0: 4, p1: 4, p2: 4, p3: 4});
  } finally {vm.dispose();}
});
