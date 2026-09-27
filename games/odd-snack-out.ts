import {defineGame, focus} from '@microfinity/sdk';

type Clue = 'sprinkles' | 'frown' | 'sleepy';
const clues: Clue[] = ['sprinkles', 'frown', 'sleepy'];
function snacks(answer: number, clue: Clue) {
  return Array.from({length: 6}, (_, i) => ({
    sprinkles: clue === 'sprinkles' && i === answer ? 2 : 3,
    mood: clue === 'frown' && i === answer ? 'sad' as const : 'happy' as const,
    sleepy: clue === 'sleepy' && i === answer
  }));
}
export default defineGame({
  meta: {
    id: 'odd-snack-out', title: 'Odd Snack Out', instruction: 'Find the odd snack! Directions + SPACE.',
    description: 'Missing sprinkles, a little frown, or sleepy eyes. Spot the odd snack, then compare everybody\'s picks!',
    rules: 'Four rounds, each with six snacks and one visible difference. The clue names what to look for: two rather than three sprinkles, the only frown, or the only pair of closed eyes. Directions move your own selection and SPACE locks it. Other votes are secret until everybody locks or the timer expires. Each correct choice earns one point; two correct choices succeeds. Higher difficulties shorten the choice timer. All snack details are drawn from the same rules that determine the answer.',
    players: [1, 4], clock: 'realtime', participation: 'simultaneous', world: 'independent', duration: 18,
    style: 'cartoon', score: {unit: 'odd snacks', order: 'higher'}, controls: {directions: true, action: 'Pick'},
    tags: ['recognition', 'choice', 'snacks'], modifiers: []
  },
  audio: {music: 'main-loop', soundPack: 'lofi-arcade'},
  init(ctx) {
    const answer = ctx.integer(0, 5), clue = clues[0];
    return {round: 0, time: 0, elapsed: 0, answer, clue, snacks: snacks(answer, clue),
      cursors: ctx.players.map(() => 0), chosen: ctx.players.map(() => -1), wins: ctx.players.map(() => 0), reveal: false};
  },
  role(s, id) {return s.chosen[Number(id.slice(1))] < 0 && !s.reveal ? 'chooser' : 'waiting';},
  step(s, inputs, ctx) {
    s.time = ctx.time; s.elapsed += ctx.dt;
    if (!s.reveal) {
      for (let i = 0; i < ctx.players.length; i++) if (s.chosen[i] < 0) {
        const input = inputs[ctx.players[i].id];
        s.cursors[i] = focus(s.cursors[i], input, 6, 3);
        if (input.pressed.action) {s.chosen[i] = s.cursors[i]; ctx.feedback('select', {playerId: ctx.players[i].id});}
      }
      if (s.chosen.every(choice => choice >= 0) || s.elapsed >= 3.2 - ctx.difficulty * .2) {
        s.reveal = true; s.elapsed = 0;
        for (let i = 0; i < ctx.players.length; i++) {
          const hit = s.chosen[i] === s.answer;
          if (hit) {s.wins[i]++; ctx.addScore(ctx.players[i].id, 1);}
          ctx.feedback(hit ? 'success' : 'failure', {playerId: ctx.players[i].id});
        }
      }
    } else if (s.elapsed >= 1.05) {
      s.round++;
      if (s.round >= 4) {
        for (let i = 0; i < ctx.players.length; i++) ctx.finishPlayer(ctx.players[i].id, s.wins[i] >= 2 ? 'success' : 'failure');
        ctx.finishRound('snack-time'); return;
      }
      s.answer = ctx.integer(0, 5);
      s.clue = s.round < 3 ? clues[s.round] : clues[ctx.integer(0, 2)];
      s.snacks = snacks(s.answer, s.clue);
      s.chosen = s.chosen.map(() => -1); s.reveal = false; s.elapsed = 0;
    }
  },
  observe(s, id, ctx) {
    const i = Number(id.slice(1));
    return {round: s.round, clue: s.clue, snacks: s.snacks, cursor: s.cursors[i], chosen: s.chosen[i], reveal: s.reveal,
      answer: s.reveal ? s.answer : null, secondsLeft: Math.max(0, 3.2 - ctx.difficulty * .2 - s.elapsed),
      votes: ctx.players.map((player, index) => ({name: player.name, color: player.color, locked: s.chosen[index] >= 0,
        choice: s.reveal ? s.chosen[index] : null, correct: s.reveal ? s.chosen[index] === s.answer : null}))};
  },
  hud(v) {
    const clue = v.clue === 'sprinkles' ? 'Find TWO sprinkles' : v.clue === 'frown' ? 'Find the FROWN' : 'Find CLOSED eyes';
    return {message: v.reveal ? 'Picks revealed! Compare your snacks.' : v.chosen >= 0 ? 'Locked! Picks reveal together.' : `${clue} · ${v.secondsLeft.toFixed(1)}s · Directions + SPACE`,
      items: [{label: 'Snack', value: `${Math.min(v.round + 1, 4)} / 4`}]};
  },
  draw(v, g) {
    g.clear('#f8dfd7');
    const clue = v.clue === 'sprinkles' ? 'WHO HAS ONLY TWO SPRINKLES?' : v.clue === 'frown' ? 'WHO IS FROWNING?' : 'WHO HAS SLEEPY EYES?';
    g.text(clue, 320, 34, 21, '#7a3f62', 'center');
    for (let i = 0; i < 6; i++) {
      const x = 160 + i % 3 * 160, y = 119 + Math.floor(i / 3) * 141;
      if (v.cursor === i) g.rect(x - 58, y - 53, 116, 112, '#fff5df', '#bd5574', 18);
      // Procedural faces keep the visible clue exact; decorative images must not overwrite it.
      g.actor('snack', x, y, 68, '#f4a8a0', v.snacks[i].sleepy ? 'sleepy' : v.snacks[i].mood, {blink: false});
      for (let j = 0; j < v.snacks[i].sprinkles; j++) g.circle(x - 16 + j * 16, y - 23, 5, '#6e3359', '#fff5df');
      g.text(String(i + 1), x + 43, y - 37, 15, '#7a3f62', 'center');
      if (v.reveal && v.answer === i) g.text('ODD ONE!', x, y + 53, 15, '#7a3f62', 'center');
    }
    for (let i = 0; i < v.votes.length; i++) {
      const vote = v.votes[i], x = 320 + (i - (v.votes.length - 1) / 2) * 150;
      g.rect(x - 68, 341, 136, 51, '#573348', vote.color, 7);
      g.text(vote.name.slice(0, 9), x, 362, 14, vote.color, 'center');
      const label = v.reveal ? vote.choice === -1 ? 'NO PICK' : `SNACK ${vote.choice! + 1} ${vote.correct ? '✓' : '×'}` : vote.locked ? 'LOCKED' : 'CHOOSING…';
      g.text(label, x, 383, 14, '#fff5df', 'center');
    }
  }
});
