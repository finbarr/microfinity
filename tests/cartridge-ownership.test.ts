import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {compile, bootstrap} from '../server/compiler';
import {Sandbox} from '../runtime/sandbox';
import {colors} from '../sdk/index';

// The shipped multiplayer contract: one participant's controller owns one seat.
// Intentional interference can affect the shared world, but cannot commandeer rivals.
test('every standard cartridge keeps one controller attached to one of four party seats', async t => {
  const players = colors.map((color, i) => ({id: `p${i}`, name: `P${i}`, color}));
  const boot = await bootstrap();
  for (const file of (await readdir('games')).filter(file => file.endsWith('.ts')).sort()) await t.test(file, async () => {
    const vm = await Sandbox.create(await compile(await readFile(`games/${file}`, 'utf8')), boot);
    try {
      const id = vm.call('meta').meta.id;
      vm.call('init', {players, seed: 71, difficulty: 1}, 'party-v1');
      if (id === 'cup-shuffle') {
        for (let tick = 0; vm.call('observe', 'p0').game.phase !== 'choose'; tick++) {
          assert.ok(tick < 300); vm.call('step', {});
        }
      }
      const before = players.map(player => vm.call('observe', player.id).game);
      const status = vm.call('step', {p2: [{button: 'right', down: true}, {button: 'action', down: true}]},
        1 / 60, 'tick');
      const after = players.map(player => vm.call('observe', player.id).game);
      assert.ok(Object.values(status.scores).every(score => score === 0), 'an opening control change cannot award a rival points');
      if (['toast-catch', 'umbrella-panic'].includes(id)) {
        for (let seat = 0; seat < 4; seat++) {
          if (seat === 2) assert.ok(after[seat].x > before[seat].x);
          else assert.equal(after[seat].x, before[seat].x);
        }
      } else if (id === 'asteroid-scramble') {
        for (let seat = 0; seat < 4; seat++) {
          if (seat === 2) assert.ok(after[0].ships[seat].x > before[0].ships[seat].x);
          else assert.equal(after[0].ships[seat].x, before[0].ships[seat].x);
        }
        assert.deepEqual(after[0].shots.map((shot: any) => shot.owner), ['p2']);
      } else if (id === 'nose-dive') {
        assert.deepEqual(after[0].hands.map((hand: any) => hand.flying), [false, false, true, false]);
      } else if (id === 'crawl-for-gold') {
        assert.deepEqual(after[0].crawlers.map((crawler: any) => crawler.stage), ['reach', 'reach', 'stumble', 'reach']);
      } else if (['cup-shuffle', 'odd-snack-out'].includes(id)) {
        for (let seat = 0; seat < 4; seat++) {
          assert.equal(after[seat].cursor, before[seat].cursor + (seat === 2 ? 1 : 0));
          assert.equal(after[seat].chosen, id === 'cup-shuffle' ? seat === 2 : seat === 2 ? 1 : -1);
        }
      } else if (id === 'conveyor-clash') {
        assert.equal(after[0].x, before[0].x, 'an operator cannot move the collector');
        assert.deepEqual(after[0].lanes, [1, 1, 2, 1]);
      } else if (id === 'skill-continue') {
        assert.deepEqual(after[0].cooldown.map((time: number) => time > 0), [false, false, true, false]);
        assert.equal(after[0].turn, 0);
        assert.deepEqual(after[0].attempts, [0, 0, 0, 0]);
        assert.equal(after[0].phase, null, 'the rival splash covers the meter');
      } else if (id === 'patchwork-pass') {
        assert.equal(after[0].turn, 0);
        assert.equal(after[0].phase, 'choose');
        assert.equal(after[0].piece, before[0].piece);
        assert.deepEqual(after[0].grid, before[0].grid);
        assert.deepEqual(after[0].pins.map((pin: any) => pin.cell >= 0), [false, false, true, false]);
        assert.deepEqual(after[0].pinCursors, before[0].pinCursors.map((cell: number, i: number) => cell + (i === 2 ? 1 : 0)));
      } else assert.fail(`Add an ownership probe for ${id}`);
    } finally {vm.dispose();}
  });
});
