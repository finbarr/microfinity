import { defineGame, clamp, colors } from '@microfinity/sdk';

const pieces = [[[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]]];
const TURN_SECONDS = 5;
type Pin = {cell: number; landsAt: number};
function placement(grid: number[], buttons: number[], pins: Pin[], time: number, piece: number, x: number, y: number) {
  const cells = pieces[piece].map(([dx, dy]) => [x + dx, y + dy]);
  const valid = cells.every(([cx, cy]) => cx >= 0 && cx < 6 && cy >= 0 && cy < 5 &&
    grid[cy * 6 + cx] === -1 && !pins.some(pin => pin.cell === cy * 6 + cx && pin.landsAt <= time));
  const bonus = valid ? cells.filter(([cx, cy]) => buttons.includes(cy * 6 + cx)).length : 0;
  return {cells, valid, bonus, points: valid ? cells.length + bonus * 2 : 0};
}
function firstFit(grid: number[], buttons: number[], pins: Pin[], time: number, piece: number) {
  for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) {
    if (placement(grid, buttons, pins, time, piece, x, y).valid) return {x, y, valid: true};
  }
  return {x: 0, y: 0, valid: false};
}
function nextPiece(current: number, direction: number, used: number[]) {
  for (let n = 1; n <= 4; n++) {
    const choice = (current + direction * n + 16) % 4;
    if (!used.includes(choice)) return choice;
  }
  return current;
}
export default defineGame({
  meta: {
    id: 'patchwork-pass', title: 'Patchwork Pass',
    instruction: 'Stitcher: fit a patch. Rivals: pin an empty square!',
    description: 'Two quick turns each on a shared quilt. Stitch gold buttons while rivals try to pin your favorite spot.',
    rules: 'Everyone gets two turns of up to five seconds; the second pass reverses seat order. Choose an unused patch with left/right and SPACE. Move its ghost with directions, then SPACE stitches a valid placement. A blocked placement returns to the patch tray, so you can change shape. Each cell scores one, plus two per gold button. Rivals move their own pin cursor with directions and SPACE drops one temporary pin per turn onto an empty cell. Pins warn for 0.35 seconds before blocking and disappear at the turn boundary. They never move another player\'s ghost. Stitches already placed are permanent. Most stitches wins; no points means no winner.',
    players: [2, 4], clock: 'realtime', participation: 'rotating', world: 'shared', duration: 41,
    style: 'doodle', score: {unit: 'stitches', order: 'higher'}, controls: {directions: true, action: 'Stitch / Pin'},
    tags: ['puzzle', 'turns', 'placement', 'interference'], modifiers: []
  },
  audio: {music: 'main-loop', soundPack: 'soft-toy'},
  init(ctx) {
    const pool = [2, 7, 10, 14, 19, 22, 27], buttons: number[] = [];
    for (let i = 0; i < 5; i++) buttons.push(pool.splice(ctx.integer(0, pool.length - 1), 1)[0]);
    const seats = ctx.players.map((_, i) => i);
    return {grid: Array(30).fill(-1) as number[], buttons, used: seats.map(() => [] as number[]),
      order: [...seats, ...seats.slice().reverse()], turn: 0, turns: 0, phase: 'choose', piece: 0, x: 0, y: 0,
      time: 0, turnEndsAt: TURN_SECONDS, pins: seats.map(() => ({cell: -1, landsAt: 0})),
      pinCursors: seats.map(i => 7 + i * 4), message: 'Choose a patch'};
  },
  role(s, id) {return id === `p${s.turn}` ? 'stitcher' : 'pinner';},
  step(s, inputs, ctx) {
    s.time = ctx.time;
    let advance = ctx.time + 1e-9 >= s.turnEndsAt;
    const active = ctx.players[s.turn];
    // Settle the active player's input first: a new rival pin cannot invalidate an already submitted stitch.
    if (!advance) for (const edge of inputs[active.id].edges) if (edge.down) {
      if (s.phase === 'choose') {
        if (edge.button === 'left') s.piece = nextPiece(s.piece, -1, s.used[s.turn]);
        if (edge.button === 'right') s.piece = nextPiece(s.piece, 1, s.used[s.turn]);
        if (edge.button === 'action') {
          const fit = firstFit(s.grid, s.buttons, s.pins, ctx.time, s.piece);
          if (fit.valid) {s.x = fit.x; s.y = fit.y; s.phase = 'place'; s.message = 'Move onto gold buttons!';}
          else s.message = 'That shape is blocked. Choose another.';
          ctx.feedback('select', {playerId: active.id});
        }
      } else {
        if (edge.button === 'left') s.x = clamp(s.x - 1, 0, 5);
        if (edge.button === 'right') s.x = clamp(s.x + 1, 0, 5);
        if (edge.button === 'up') s.y = clamp(s.y - 1, 0, 4);
        if (edge.button === 'down') s.y = clamp(s.y + 1, 0, 4);
        if (edge.button === 'action') {
          const fit = placement(s.grid, s.buttons, s.pins, ctx.time, s.piece, s.x, s.y);
          if (fit.valid) {
            for (const [x, y] of fit.cells) s.grid[y * 6 + x] = s.turn;
            s.used[s.turn].push(s.piece);
            ctx.addScore(active.id, fit.points);
            ctx.feedback('success', {playerId: active.id, x: 58 + s.x * 48, y: 90 + s.y * 48, text: `+${fit.points}`});
            advance = true; break;
          }
          s.phase = 'choose'; s.message = 'Blocked! Choose a different patch.';
          ctx.feedback('invalid', {playerId: active.id});
        }
      }
    }
    if (advance) {
      s.turns++;
      if (s.turns >= s.order.length) {
        const best = Math.max(...Object.values(ctx.scores));
        for (const player of ctx.players) ctx.finishPlayer(player.id, best > 0 && ctx.scores[player.id] === best ? 'success' : 'failure');
        ctx.finishRound('all-turns-finished'); return;
      }
      s.turn = s.order[s.turns]; s.phase = 'choose'; s.piece = nextPiece(3, 1, s.used[s.turn]);
      s.x = 0; s.y = 0; s.turnEndsAt = ctx.time + TURN_SECONDS;
      s.pins = s.pins.map(() => ({cell: -1, landsAt: 0}));
      s.message = 'Choose a patch';
      ctx.feedback('turn', {playerId: ctx.players[s.turn].id});
      return;
    }
    for (let i = 0; i < ctx.players.length; i++) {
      if (i === s.turn || s.pins[i].cell >= 0) continue;
      const input = inputs[ctx.players[i].id];
      for (const edge of input.edges) if (edge.down) {
        let x = s.pinCursors[i] % 6, y = Math.floor(s.pinCursors[i] / 6);
        if (edge.button === 'left') x = Math.max(0, x - 1);
        if (edge.button === 'right') x = Math.min(5, x + 1);
        if (edge.button === 'up') y = Math.max(0, y - 1);
        if (edge.button === 'down') y = Math.min(4, y + 1);
        s.pinCursors[i] = y * 6 + x;
        if (edge.button === 'action' && s.grid[s.pinCursors[i]] === -1 && !s.pins.some(pin => pin.cell === s.pinCursors[i])) {
          s.pins[i] = {cell: s.pinCursors[i], landsAt: ctx.time + .35};
          ctx.feedback('interference', {playerId: ctx.players[i].id}); break;
        }
      }
    }
  },
  observe(s, id, ctx) {
    const preview = placement(s.grid, s.buttons, s.pins, s.time, s.piece, s.x, s.y);
    return {...s, players: ctx.players, me: id, pieces, valid: preview.valid, previewPoints: preview.points, previewBonus: preview.bonus};
  },
  hud(v) {
    const mine = Number(v.me.slice(1)), seconds = Math.max(0, v.turnEndsAt - v.time).toFixed(1);
    const message = mine !== v.turn ? v.pins[mine].cell >= 0 ? 'Pin spent. Watch for your turn!' : 'Move YOUR pin cursor · SPACE blocks one empty cell.' :
      v.phase === 'choose' ? `${v.message} · ← → then SPACE` : v.valid ? 'Green fits! SPACE stitches; gold adds 2.' : 'Blocked! Move, or SPACE chooses another patch.';
    return {activePlayerId: v.players[v.turn].id, message, items: [
      {label: 'Turn', value: `${Math.min(v.turns + 1, v.order.length)} / ${v.order.length}`},
      {label: 'Turn time', value: `${seconds}s`}, {label: 'Patch value', value: v.phase === 'place' ? v.previewPoints : v.pieces[v.piece].length}
    ]};
  },
  draw(v, g) {
    g.backdrop('paper');
    g.text(`${v.players[v.turn].name.slice(0, 16)} stitches`, 36, 34, 20, '#594d64');
    g.rect(36, 43, 284, 8, '#d7c9b5');
    g.rect(36, 43, 284 * Math.max(0, (v.turnEndsAt - v.time) / TURN_SECONDS), 8, colors[v.turn]);
    for (let i = 0; i < 30; i++) {
      const x = 36 + i % 6 * 48, y = 68 + Math.floor(i / 6) * 48;
      g.rect(x, y, 44, 44, v.grid[i] < 0 ? '#e8dcc6' : colors[v.grid[i]], '#b7a58f', 5);
      if (v.grid[i] >= 0) {g.line(x + 5, y + 5, x + 39, y + 39, '#ffffff66', 2); g.line(x + 39, y + 5, x + 5, y + 39, '#ffffff66', 2);}
      else if (v.buttons.includes(i)) {g.circle(x + 22, y + 22, 11, '#ffdf64', '#6b4b36'); g.circle(x + 18, y + 22, 2, '#8a5a34'); g.circle(x + 26, y + 22, 2, '#8a5a34');}
    }
    g.text('PATCH TRAY', 460, 85, 18, '#594d64', 'center');
    for (let i = 0; i < 4; i++) {
      const x = 378 + i % 2 * 88, y = 120 + Math.floor(i / 2) * 83;
      if (i === v.piece) g.rect(x - 8, y - 8, 76, 70, '#fcf4e6', '#594d64', 8);
      if (v.used[v.turn].includes(i)) g.opacity(.3);
      for (const [dx, dy] of v.pieces[i]) g.rect(x + dx * 25, y + dy * 25, 23, 23, colors[v.turn], '#594d64', 3);
      g.opacity(1);
    }
    if (v.phase === 'place') {
      g.opacity(.72);
      for (const [dx, dy] of v.pieces[v.piece]) if (v.x + dx < 6 && v.y + dy < 5) {
        g.rect(36 + (v.x + dx) * 48, 68 + (v.y + dy) * 48, 44, 44, v.valid ? colors[v.turn] : '#fb7185', v.valid ? '#2b9865' : '#9f3452', 5);
      }
      g.opacity(1);
    }
    for (let i = 0; i < v.pins.length; i++) {
      const pin = v.pins[i];
      if (pin.cell < 0) continue;
      const x = 58 + pin.cell % 6 * 48, y = 90 + Math.floor(pin.cell / 6) * 48;
      if (v.time < pin.landsAt) g.circle(x, y, 19, '#ffffff66', colors[i]);
      g.line(x - 7, y + 10, x + 5, y - 7, '#594d64', 4); g.circle(x + 5, y - 7, 8, colors[i], '#594d64');
    }
    const mine = Number(v.me.slice(1));
    if (mine !== v.turn && v.pins[mine].cell < 0) {
      const cell = v.pinCursors[mine];
      g.rect(38 + cell % 6 * 48, 70 + Math.floor(cell / 6) * 48, 40, 40, '#ffffff33', colors[mine], 6);
    }
    g.rect(355, 280, 210, 34, '#594d64', undefined, 8);
    g.text(mine === v.turn ? 'YOUR PATCH' : v.pins[mine].cell < 0 ? 'YOUR PIN: READY' : 'PIN SPENT', 460, 302, 17, colors[mine], 'center');
    g.text('Two turns each · reverse order on pass two', 320, 365, 16, '#594d64', 'center');
  }
});
