import { defineGame, focus } from '@microfinity/sdk';

const REVEAL_SECONDS = .55;
const CHOOSE_SECONDS = 2.75;
const RESULT_SECONDS = 1.15;
const swapSeconds = (difficulty: number, round: number) => .36 - difficulty * .03 - round * .02;

export default defineGame({
  meta: {
    id: 'cup-shuffle', title: 'Cup Shuffle',
    instruction: 'Follow the pea. Choose with ← → + SPACE.',
    description: 'Three quick shuffles. Track the pea, lock your guess, then see who found it!',
    rules: 'Watch the pea before the cups shuffle. Left/right chooses a cup; SPACE locks your vote. You have 2.75 seconds to choose. Votes stay secret until everyone locks in or time runs out. Each correct guess scores one. Find two of the three peas to succeed.',
    players: [1, 4], clock: 'realtime', participation: 'simultaneous', world: 'shared',
    duration: 19, style: 'collage', score: { unit: 'peas found', order: 'higher' },
    controls: { directions: true, action: 'Choose' }, tags: ['memory', 'choice', 'hidden-info'], modifiers: []
  },
  audio: { music: 'main-loop', soundPack: 'lofi-arcade' },
  init(ctx) {
    return {
      round: 0, phase: 'reveal', phaseTime: 0, secret: ctx.integer(0, 2), cups: [0, 1, 2],
      swaps: Array.from({ length: 3 + ctx.difficulty }, () => {
        const a = ctx.integer(0, 2);
        return [a, (a + ctx.integer(1, 2)) % 3];
      }),
      swap: 0, cursors: ctx.players.map(() => 1), choices: ctx.players.map(() => -1),
      wins: ctx.players.map(() => 0), time: 0
    };
  },
  role(s, id) {
    return s.phase === 'choose' && s.choices[Number(id.slice(1))] < 0 ? 'chooser' : 'waiting';
  },
  step(s, inputs, ctx) {
    s.time = ctx.time;
    s.phaseTime += ctx.dt;
    if (s.phase === 'reveal' && s.phaseTime >= REVEAL_SECONDS) {
      s.phase = 'shuffle';
      s.phaseTime = 0;
    } else if (s.phase === 'shuffle' && s.phaseTime >= swapSeconds(ctx.difficulty, s.round)) {
      const [a, b] = s.swaps[s.swap];
      [s.cups[a], s.cups[b]] = [s.cups[b], s.cups[a]];
      s.swap++;
      s.phaseTime = 0;
      if (s.swap >= s.swaps.length) {
        s.phase = 'choose';
        ctx.feedback('turn');
      }
    } else if (s.phase === 'choose') {
      for (let i = 0; i < ctx.players.length; i++) {
        if (s.choices[i] >= 0) continue;
        const input = inputs[ctx.players[i].id];
        s.cursors[i] = focus(s.cursors[i], input, 3);
        if (input.pressed.action) s.choices[i] = s.cursors[i];
      }
      if (s.choices.every(choice => choice >= 0) || s.phaseTime >= CHOOSE_SECONDS) {
        for (let i = 0; i < ctx.players.length; i++) {
          const correct = s.choices[i] >= 0 && s.cups[s.choices[i]] === s.secret;
          if (correct) {
            s.wins[i]++;
            ctx.addScore(ctx.players[i].id, 1);
          }
          ctx.feedback(correct ? 'success' : 'failure', { playerId: ctx.players[i].id });
        }
        s.phase = 'result';
        s.phaseTime = 0;
      }
    } else if (s.phase === 'result' && s.phaseTime >= RESULT_SECONDS) {
      s.round++;
      if (s.round >= 3) {
        for (let i = 0; i < ctx.players.length; i++) {
          ctx.finishPlayer(ctx.players[i].id, s.wins[i] >= 2 ? 'success' : 'failure');
        }
        ctx.finishRound('three-shuffles');
        return;
      }
      s.phase = 'reveal';
      s.phaseTime = 0;
      s.secret = ctx.integer(0, 2);
      s.swap = 0;
      s.choices = s.choices.map(() => -1);
      s.swaps = Array.from({ length: 3 + ctx.difficulty }, () => {
        const a = ctx.integer(0, 2);
        return [a, (a + ctx.integer(1, 2)) % 3];
      });
    }
  },
  observe(s, id, ctx) {
    const mine = Number(id.slice(1));
    const positions = s.cups.map((cup, i) => {
      let x = 160 + i * 160, y = 205;
      if (s.phase === 'shuffle') {
        const [a, b] = s.swaps[s.swap];
        const t = Math.min(1, s.phaseTime / swapSeconds(ctx.difficulty, s.round));
        if (i === a || i === b) {
          x = 160 + (i + (i === a ? b - a : a - b) * t) * 160;
          y += Math.sin(t * Math.PI) * (i === a ? -42 : 42);
        }
      }
      return { id: cup, x, y };
    });
    return {
      phase: s.phase, round: s.round, cups: positions,
      ballX: s.phase === 'reveal' || s.phase === 'result' ? positions.find(cup => cup.id === s.secret)!.x : null,
      cursor: s.cursors[mine], chosen: s.choices[mine] >= 0, color: ctx.players[mine].color, time: s.time,
      secondsLeft: Math.max(0, CHOOSE_SECONDS - s.phaseTime),
      // Lock status is public; other selections only leave the sandbox after voting closes.
      votes: ctx.players.map((player, i) => ({
        id: player.id, name: player.name, color: player.color, locked: s.choices[i] >= 0,
        choice: s.phase === 'result' ? s.choices[i] : null,
        correct: s.phase === 'result' ? s.choices[i] >= 0 && s.cups[s.choices[i]] === s.secret : null
      }))
    };
  },
  hud(v) {
    return {
      message: v.phase === 'reveal' ? 'Remember this one…' : v.phase === 'shuffle' ? 'Follow it!' :
        v.phase === 'result' ? 'Guesses revealed! Who found the pea?' :
        v.chosen ? 'Locked! Guesses reveal together.' : `Choose now! ${v.secondsLeft.toFixed(1)}s · ← → + SPACE`,
      items: [{ label: 'Shuffle', value: `${Math.min(v.round + 1, 3)} / 3` }]
    };
  },
  draw(v, g) {
    g.backdrop('stage');
    if (v.phase === 'choose' || v.phase === 'result') {
      for (let i = 0; i < v.votes.length; i++) {
        const vote = v.votes[i], x = 320 + (i - (v.votes.length - 1) / 2) * 150;
        g.rect(x - 68, 25, 136, 57, '#392942', vote.color, 8);
        g.text(vote.name.slice(0, 9), x, 47, 14, vote.color, 'center');
        const label = v.phase === 'result' ? vote.choice === -1 ? 'NO GUESS' : vote.correct ? 'FOUND IT!' : 'MISSED' :
          vote.locked ? 'LOCKED' : 'CHOOSING…';
        g.text(label, x, 68, 13, '#fff8e5', 'center');
      }
    }
    for (const cup of v.cups) {
      g.circle(cup.x, 268, 47, '#392942');
      g.actor('cup', cup.x, cup.y, 74, '#f6af84', v.phase === 'result' ? 'surprised' : v.phase === 'shuffle' ? 'neutral' : 'happy', { blink: g.blink(g.time + cup.id * .7) });
    }
    if (v.ballX !== null) g.circle(v.ballX, 266, 12, '#a3e635', '#527927');
    if (v.phase === 'choose') g.rect(114 + v.cursor * 160, 289, 92, 7, v.color);
    if (v.phase === 'result') {
      for (let cup = 0; cup < 3; cup++) {
        const votes = v.votes.filter(vote => vote.choice === cup), x = 160 + cup * 160;
        for (let i = 0; i < votes.length; i++) {
          const vote = votes[i], y = 308 + i * 26;
          g.rect(x - 69, y - 17, 138, 23, '#392942', vote.color, 5);
          g.circle(x - 56, y - 6, 4, vote.color);
          const label = vote.name.length > 6 ? vote.name.slice(0, 5) + '…' : vote.name;
          g.text(label, x - 46, y, 14, '#fff8e5');
          g.text(vote.correct ? '✓' : '×', x + 58, y, 15, vote.color, 'right');
        }
      }
    }
  }
});
