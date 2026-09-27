import {defineGame, colors, timedPress} from '@microfinity/sdk';

const ATTEMPTS = 3;
export default defineGame({
  meta: {
    id: 'skill-continue', title: 'Skill Continue', instruction: 'Your turn: SPACE in mint. Rivals: SPACE to splash!',
    description: 'Pass the pulse for three fast laps. Hit the mint zone while rivals splash your timing meter.',
    rules: 'Every player gets three attempts. The sweep starts at zero and advances toward one; press SPACE at phase 0.65, within the visible mint zone. Each hit scores one. Every new lap speeds up equally for all players. Rivals may press SPACE to cover the whole meter for 0.30 seconds; only one splash is allowed per attempt and each rival has a two-second cooldown. Keep the rhythm through the splash. A miss spends the attempt, not another player\'s turn. Highest positive hit count wins after all attempts; everyone fails if nobody scores.',
    players: [2, 4], clock: 'realtime', participation: 'rotating', world: 'shared', duration: 25,
    style: 'pixel', score: {unit: 'clean hits', order: 'higher'}, controls: {directions: false, action: 'Hit / Splash'},
    tags: ['timing', 'relay', 'interference'], modifiers: []
  },
  audio: {music: 'main-loop', soundPack: 'pixel-bits'},
  init(ctx) {
    return {turn: 0, turns: 0, phase: 0, rate: .55 + ctx.difficulty * .05,
      attempts: ctx.players.map(() => 0), results: ctx.players.map(() => [] as boolean[]), cooldown: ctx.players.map(() => 0),
      splashUntil: 0, splashed: false, by: '', message: 'Find the mint zone', nextAt: 0, time: 0};
  },
  role(s, id) {return id === `p${s.turn}` ? 'challenger' : 'interferer';},
  step(s, inputs, ctx) {
    s.time = ctx.time;
    if (ctx.time < s.nextAt) return;
    const previous = s.phase;
    s.phase += ctx.dt * s.rate;
    for (const beat of [.35, .65]) if (previous < beat && s.phase >= beat) ctx.feedback('pulse', {sound: {pitch: beat === .35 ? -5 : 0, timbre: 'sine'}});
    const active = ctx.players[s.turn], half = Math.max(.09, .15 - ctx.difficulty * .015);
    if (inputs[active.id].pressed.action || s.phase >= 1) {
      const hit = timedPress(inputs[active.id], s.phase, s.rate, .65, half);
      if (hit) ctx.addScore(active.id, 1);
      ctx.feedback(hit ? 'success' : 'miss', {playerId: active.id});
      s.message = hit ? 'CLEAN HIT!' : 'MISSED! NEXT PLAYER';
      s.results[s.turn].push(hit); s.attempts[s.turn]++; s.turns++;
      if (s.turns >= ctx.players.length * ATTEMPTS) {
        const best = Math.max(...Object.values(ctx.scores));
        for (const player of ctx.players) ctx.finishPlayer(player.id, best > 0 && ctx.scores[player.id] === best ? 'success' : 'failure');
        ctx.finishRound('all-attempts-finished'); return;
      }
      s.turn = (s.turn + 1) % ctx.players.length;
      s.phase = 0; s.rate = .55 + ctx.difficulty * .05 + Math.floor(s.turns / ctx.players.length) * .2;
      s.splashed = false; s.splashUntil = 0; s.nextAt = ctx.time + .2;
      ctx.feedback('turn', {playerId: ctx.players[s.turn].id}); return;
    }
    for (let i = 0; i < ctx.players.length; i++) {
      if (i === s.turn || s.splashed || ctx.time < s.cooldown[i]) continue;
      if (inputs[ctx.players[i].id].pressed.action) {
        s.splashed = true; s.splashUntil = ctx.time + .30; s.cooldown[i] = ctx.time + 2;
        s.by = ctx.players[i].name;
        ctx.feedback('interference', {playerId: ctx.players[i].id});
      }
    }
  },
  observe(s, id, ctx) {
    // A covered meter hides the exact line position from every participant, including controllers.
    return {...s, phase: s.time < s.splashUntil ? null : s.phase, me: id, players: ctx.players,
      half: Math.max(.09, .15 - ctx.difficulty * .015)};
  },
  hud(v) {
    const mine = Number(v.me.slice(1));
    return {activePlayerId: v.players[v.turn].id,
      message: v.time < v.nextAt ? v.message : v.time < v.splashUntil ? `${v.by.slice(0, 24)} splashed! Keep the beat.` :
        mine === v.turn ? 'SPACE when the line reaches mint.' : v.splashed ? 'Splash spent. Watch the pulse!' : v.time < v.cooldown[mine] ? 'Your splash is recharging.' : 'SPACE splashes the meter for a moment!',
      items: [{label: 'Lap', value: `${Math.min(ATTEMPTS, Math.floor(v.turns / v.players.length) + 1)} / ${ATTEMPTS}`},
        {label: 'Your attempts', value: `${v.attempts[mine]} / ${ATTEMPTS}`}]
    };
  },
  draw(v, g) {
    g.clear('#18192d');
    for (let x = 20; x < 640; x += 40) g.line(x, 0, x, 400, '#22233c', 1);
    g.text('PASS THE PULSE', 320, 47, 25, '#fff7de', 'center');
    g.text(v.players[v.turn].name.slice(0, 18) + ' ON THE METER', 320, 88, 18, colors[v.turn], 'center');
    g.rect(38, 132, 564, 132, '#101124', colors[v.turn], 14);
    g.rect(60, 174, 520, 68, '#2d2e49', '#494663', 8);
    g.rect(60 + (.65 - v.half) * 520, 178, v.half * 1040, 60, '#86efac');
    if (v.phase !== null) {
      const x = 60 + g.project(v.phase, v.time < v.nextAt ? 0 : v.rate, 0, 1) * 520;
      g.rect(x - 4, 161, 8, 94, '#fff7de');
    }
    if (v.time < v.splashUntil) {
      g.rect(52, 153, 536, 104, '#bca4ed', '#eee0ff', 16);
      for (let i = 0; i < 9; i++) g.circle(80 + i * 59, 155 + i % 2 * 99, 15, '#bca4ed');
      g.text('SPLASH! KEEP THE BEAT', 320, 211, 21, '#332544', 'center');
    }
    for (let i = 0; i < v.players.length; i++) {
      const x = 320 + (i - (v.players.length - 1) / 2) * 146;
      g.text(v.players[i].name.slice(0, 9), x, 314, 15, colors[i], 'center');
      for (let n = 0; n < ATTEMPTS; n++) g.circle(x - 22 + n * 22, 337, 7, n < v.attempts[i] ? v.results[i][n] ? '#86efac' : '#fb7185' : '#3b3d59', colors[i]);
    }
    g.text('THREE ATTEMPTS EACH · MOST HITS WINS', 320, 383, 15, '#c3bdd2', 'center');
  }
});
