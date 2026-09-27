import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compile, bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {colors, type Edge} from '../sdk/index';

const players = (count: number) => Array.from({length: count}, (_, i) => ({
  id: `p${i}`, name: ['Alex', 'Blair', 'Casey', 'Drew'][i], color: colors[i]
}));
const tap = (button: Edge['button']): Edge[] => [{button, down: true}, {button, down: false}];
const choice = (cursor: number, target: number) => [
  ...Array.from({length: (target - cursor + 3) % 3}, () => tap('right')).flat(), ...tap('action')
];
async function cartridge(id: string) {
  return Sandbox.create(await compile(await readFile(`games/${id}.ts`, 'utf8')), await bootstrap());
}
function until(vm: Sandbox, predicate: (view: any) => boolean) {
  for (let i = 0; i < 1200; i++) {
    const view = vm.call('observe', 'p0');
    if (predicate(view)) return view;
    assert.equal(view.done, false, 'round ended before expected phase');
    vm.call('step', {});
  }
  assert.fail('expected phase was never reached');
}

test('Cup Shuffle isolates selections, hides votes until all lock, then shows every guess', async () => {
  const vm = await cartridge('cup-shuffle');
  try {
    vm.call('init', {seed: 17, difficulty: 1, players: players(4)});
    const pea = vm.call('observe', 'p0').game;
    const identity = pea.cups.find((cup: any) => cup.x === pea.ballX).id;
    const choose = until(vm, view => view.game.phase === 'choose').game;
    const correct = choose.cups.findIndex((cup: any) => cup.id === identity);
    const guesses = [correct, (correct + 1) % 3, correct, (correct + 2) % 3];
    for (let i = 0; i < 4; i++) {
      vm.call('step', {[`p${i}`]: choice(1, guesses[i])});
      if (i === 3) break;
      for (let seat = 0; seat < 4; seat++) {
        const view = vm.call('observe', `p${seat}`).game;
        assert.equal(view.phase, 'choose');
        assert.equal(view.ballX, null);
        assert.equal(view.cursor, seat <= i ? guesses[seat] : 1, 'one controller cannot move another cursor');
        assert.deepEqual(view.votes.map((vote: any) => vote.locked), players(4).map((_, index) => index <= i));
        assert.ok(view.votes.every((vote: any) => vote.choice === null && vote.correct === null));
        assert.ok(!('secret' in view) && !('swaps' in view));
      }
      vm.call('step', {[`p${i}`]: [...tap('left'), ...tap('action')]});
      assert.equal(vm.call('observe', `p${i}`).game.cursor, guesses[i], 'locked votes cannot change');
    }
    const result = vm.call('observe', 'p0');
    assert.equal(result.game.phase, 'result');
    assert.deepEqual(result.game.votes.map((vote: any) => vote.choice), guesses);
    assert.deepEqual(result.game.votes.map((vote: any) => vote.correct), [true, false, true, false]);
    assert.deepEqual(result.scores, {p0: 1, p1: 0, p2: 1, p3: 0});
    for (const player of players(4)) {
      const view = vm.call('observe', player.id);
      assert.deepEqual(view.game.votes, result.game.votes);
      const labels = vm.call('draw', view.game).filter((command: any) => command.op === 'text').map((command: any) => command.args[0]);
      for (const voter of players(4)) assert.ok(labels.includes(voter.name), 'each guess has a visible player label');
    }
    until(vm, view => view.game.phase === 'reveal');
    assert.ok(vm.call('observe', 'p0').game.votes.every((vote: any) => vote.choice === null && !vote.locked));
  } finally {vm.dispose();}
});

test('Cup Shuffle reveals timeouts and fits four voters on one cup', async () => {
  const vm = await cartridge('cup-shuffle');
  try {
    for (const voters of [3, 4]) {
      vm.call('init', {seed: 19, difficulty: 3, players: players(4)});
      until(vm, view => view.game.phase === 'choose');
      vm.call('step', Object.fromEntries(players(voters).map(player => [player.id, tap('action')])));
      const result = until(vm, view => view.game.phase === 'result');
      assert.deepEqual(result.game.votes.map((vote: any) => vote.choice), voters === 3 ? [1, 1, 1, -1] : [1, 1, 1, 1]);
      if (voters === 3) {
        assert.equal(result.game.votes[3].correct, false);
        assert.equal(result.scores.p3, 0);
      }
      for (const reducedMotion of [false, true]) {
        const commands = vm.call('draw', result.game, [], 0, {time: result.time, reducedMotion});
        const labels = commands.filter((command: any) => command.op === 'text' && players(4).some(player => player.name === command.args[0]) && command.args[2] > 280);
        assert.equal(labels.length, voters);
        assert.equal(new Set(labels.map((label: any) => label.args[2])).size, voters, 'shared guesses stack without overlapping');
        assert.ok(labels.every((label: any) => label.args[2] < 400));
      }
    }
  } finally {vm.dispose();}
});

test('Cup Shuffle has three winnable rounds and a short idle cap for every player count and difficulty', async () => {
  const vm = await cartridge('cup-shuffle');
  try {
    for (const count of [1, 2, 3, 4]) for (const difficulty of [0, 1, 2, 3]) {
      const config = {seed: 100 + count * 10 + difficulty, difficulty, players: players(count)};
      let status = vm.call('init', config), identity: number | undefined;
      while (!status.done) {
        const view = vm.call('observe', 'p0').game;
        if (view.phase === 'reveal') identity = view.cups.find((cup: any) => cup.x === view.ballX).id;
        const edges = view.phase === 'choose' ? Object.fromEntries(config.players.map(player => {
          const own = vm.call('observe', player.id).game;
          return [player.id, choice(own.cursor, own.cups.findIndex((cup: any) => cup.id === identity))];
        })) : {};
        status = vm.call('step', edges);
      }
      assert.ok(status.time < 10, 'prompt guesses keep the game moving');
      assert.ok(Object.values(status.scores).every(score => score === 3));
      assert.ok(Object.values(status.outcomes).every(outcome => outcome === 'success'));
      status = vm.call('init', config);
      while (!status.done) status = vm.call('step', {});
      assert.ok(status.time < 18.5, 'timeouts cannot stretch the game back to its old 25-second pace');
      assert.ok(Object.values(status.outcomes).every(outcome => outcome === 'failure'));
    }
  } finally {vm.dispose();}
});

test('Nose Dive starts three times faster, steadily widens the timing window, and preserves its short round', async () => {
  const vm = await cartridge('nose-dive');
  try {
    for (const difficulty of [0, 1, 2, 3]) {
      let status = vm.call('init', {seed: 17, difficulty, players: players(4)});
      const opening = vm.call('observe', 'p0').game;
      assert.ok(opening.speed >= (1.7 + difficulty * .2) * 2.7);
      assert.ok(2 * opening.tolerance / opening.speed < .13, 'the opening requires a fast reaction');
      let previous = opening.speed;
      while (!status.done) {
        status = vm.call('step', {});
        const view = vm.call('observe', 'p0').game;
        assert.ok(view.speed <= previous, 'undisturbed spin slows smoothly without speeding back up');
        previous = view.speed;
      }
      const closing = vm.call('observe', 'p0').game;
      assert.ok(2 * closing.tolerance / closing.speed > .45, 'late picks are more forgiving');
      assert.ok(status.time >= 13.9 && status.time < 14.1);
      assert.ok(Object.values(status.outcomes).every(outcome => outcome === 'failure'));
    }
  } finally {vm.dispose();}
});

test('Nose Dive accepts compensated launches for each seat without launching anyone else', async () => {
  const vm = await cartridge('nose-dive');
  const tau = Math.PI * 2, gap = (a: number, b: number) => Math.abs(((a - b + Math.PI) % tau + tau) % tau - Math.PI);
  try {
    for (const seat of [0, 1, 2, 3]) for (const age of [0, .05, .15, .3]) {
      vm.call('init', {seed: 71, difficulty: 1, players: players(4)});
      const ready = until(vm, view => {
        const game = view.game, hand = game.hands[seat];
        return gap(game.angle + game.speed * (game.travel - Math.min(.15, age)), hand.angle) < .06;
      });
      vm.call('step', {[`p${seat}`]: [{button: 'action', down: true, age}, {button: 'action', down: false}]});
      const launch = vm.call('observe', `p${seat}`).game;
      assert.deepEqual(launch.hands.map((hand: any) => hand.flying), players(4).map((_, i) => i === seat));
      assert.ok(launch.hands.every((hand: any) => !('good' in hand)));
      const landed = until(vm, view => view.time > ready.time + .3);
      assert.equal(landed.scores[`p${seat}`], 1, 'a centered compensated shot still lands while the nose slows');
      assert.ok(players(4).filter((_, i) => i !== seat).every(player => landed.scores[player.id] === 0));
    }
  } finally {vm.dispose();}
});
