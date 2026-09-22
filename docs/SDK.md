# Cartridge authoring guide

A cartridge is one TypeScript file with a default `defineGame(...)` export. Import only `@microfinity/sdk`; the complete supported types are in `sdk/index.ts`. No DOM, sockets, timers, filesystem, provider APIs, ambient randomness, or extra controls are available. A source file is typechecked, compiled, sandbox-preflighted, and stored independently of the application build.

The shortest complete example is `games/toast-catch.ts`. For turns and placement, use `games/patchwork-pass.ts`; for hidden information, `games/cup-shuffle.ts`.

## Rules

- `meta`: identity, title, short instruction, clock, arrangement, duration limit, style, score unit/direction, controller label and tags. New sources omit `players` and `modifiers`; `defineGame` supplies the uniform `[1,4]` party contract and an empty legacy modifier list.
- `init(ctx)`: return all mutable state. Precompute challenge schedules with `ctx.random()` or `ctx.integer(min,max)`; do not mix player-dependent random consumption into shared challenge content.
- `step(state, inputs, ctx)`: mutate the serializable state. Real-time calls have exactly `dt=1/60`. Action-driven calls happen for input or recorded timeouts, with elapsed `dt`.
- `observe(state, playerId, ctx)`: return what that player can currently see. Exclude hidden answers, RNG state, unrevealed schedules, and future events. Both browser rendering and Jev use this view.
- `draw(view, gfx)`: emit graphics commands. It executes in a separate browser sandbox and cannot access the server's hidden state. It must not mutate rules.
- Optional `hud(view)`: return `{message?, activePlayerId?, items?: [{label, value}]}` for the cabinet outside the canvas. This receives only the already filtered observer view. Message is at most 120 characters, at most six items with 30-character labels and 60-character string/finite-number values, and activePlayerId must identify a real player. Invalid output fails preflight/runtime; obstruction hides HUD along with the game view.
- Optional `role(state, playerId)`: return a role label. `waiting`, `finished`, and `eliminated` suppress game input. Role changes invalidate pending controller decisions.

Scores: `ctx.addScore(id, amount)`, `ctx.setScore(id, amount)`, and read-only `ctx.scores`. Outcomes: `ctx.finishPlayer(id, 'success'|'failure'|'complete'|'eliminated')`; end a round using `ctx.finishRound(reason)`. Scores, outcomes, tournament points, and RL rewards are distinct concepts. Define a meaningful success/failure condition and deterministic ties.

Context also supplies players, tick, simulation time, difficulty, and semantic feedback: `ctx.feedback('catch', {playerId, x, y})`. The engine gives feedback stable IDs and handles sounds plus small visual reactions. Never trigger audio from `draw`.

Every cartridge can be selected by a party of one to four people. For `participation:'individual'`, write one attempt using `ctx.players[0]`: the engine gives each participant an isolated attempt with the same seed. Shared `simultaneous` and `rotating` games must handle the actual `ctx.players` array at every length from one through four, including turn rotation and timeouts. Choose the clock from the requested mechanic. Players do not configure clocks, player ranges, or adapters.

Saved sources may retain explicit historical player limits. The party adapter executes their pinned native runtime without rewriting their code or metadata. It preserves shared native play whenever the roster fits, fills required opponents through the engine, and gives each party participant an isolated native attempt when a legacy cartridge has fewer slots. Private attempts use contiguous local IDs; public scores, roles, feedback and HUD ownership are mapped back to the party seats. New recordings identify this adapter as `party-v1`; existing recordings retain their original runtime and mode.

## Five buttons

Every input has `held`, `pressed`, `released`, ordered `edges`, and normalized `x/y`. Buttons are only `up/down/left/right/action`. A fast press and release can both appear in one tick; use `edges` for repeated taps or combinations. OS key repeat is not another press. The keyboard and virtual pad share the same input adapter.

For an action that repeats while held, such as firing, also honor the initial press: `(input.held.action || input.pressed.action) && cooldown <= 0`. This preserves a quick tap that ends before the tick while keeping the same cooldown. For a single confirmation, use `pressed.action`; do not repeat it merely because the button remains held.

Use `move(body,input,speed,dt,bounds)` for a steerable cursor or actor; its normalized movement cancels opposite directions and keeps diagonal speed constant. Use `focusGrid(index,input,count,columns)` for a clamped selection cursor, including incomplete final rows. One column makes a vertical list; `count` columns makes a horizontal list. The original `focus(...)` retains its flat wrapping behavior for existing cartridges. Space confirms; never accept a direct answer index from a player or bot.

### Stateful input and action helpers

Put each helper's state in `init`, separately for each player. Call it once per simulation step with `ctx.time` in seconds. Reset state with its `create...` function when starting a new interaction or role. These are plain JSON values, so saving the game automatically saves their progress and timers.

| Task | SDK calls | Behavior |
| --- | --- | --- |
| Held direction repeat | `createDirectionRepeat()`, `directionPresses(input,ctx.time,state)` | Ordered actual taps, then repeats after 0.32 s at 0.12 s intervals. Opposite held directions are neutral. Action never repeats. A stall emits at most four repeats per direction and skips old repeat debt. |
| Repeating grid/list selection | `focusGrid(index,input,count,columns,state,ctx.time)` | Uses the same repeat rules for keyboard, virtual pad and bots. Omit repeat state for press-only selection, including action-driven games that do not tick while waiting. |
| Hold/release charge | `createButtonHold()`, `trackHold(state,input,ctx.time,button?)` | Returns current held `seconds` and an ordered `releases` array. A quick press/release has duration zero at tick resolution. Neutral input without a release edge resets the hold without reporting a release; synthesized release edges remain ordinary releases. Default button is action. |
| Aim with left/right | `aimAngle(angle,input,speed,ctx.dt,min?,max?)` | Speed is radians/second. Full-circle limits wrap; a smaller allowed arc clamps. |
| Projectile motion | `projectile(x,y,angle,speed,life?)`, `stepProjectile(p,ctx.dt,bounds?)` | Velocity is pixels/second; default lifetime is 3 s. `stepProjectile` returns whether it remains alive and within bounds. Collision/scoring stays in your rules. |
| Scheduled spawning | `createSpawnClock(firstAt?)`, `spawnDue(state,ctx.time,period,limit?)` | Returns stable `{id,time}` entries, up to eight per call by default. Remaining overdue spawns stay queued for later steps. Use `ctx.random()` separately for gameplay variation. |
| Button sequences | `createSequence(pattern,ctx.time,secondsPerPress?)`, `advanceSequence(state,input,ctx.time)` | Processes ordered press edges, including repeated-button tap cycles. Every correct press renews the deadline; wrong input or timeout is terminal. The exact deadline is inclusive. Results: waiting, complete, wrong, timeout. |

For example, a sequence game's state can contain `sequence:createSequence(['up','right','action'],0,2)`. Each realtime step calls `advanceSequence(s.sequence,inputs[id],ctx.time)`, uses `ctx.setScore(id,s.sequence.index)` for one point per accepted prompt, records success when it returns `complete`, and records failure for `wrong` or `timeout`. One call can accept several prompts from ordered edges: adding one point merely because the index changed undercounts quick taps. For individual interaction feedback, iterate from the previous index to the new index. Use realtime steps for continuously advancing sequence deadlines; an action-driven game needs an explicit engine turn deadline to wake without input. Its observation must expose only the prompts intentionally visible to the player, rather than accidentally copying hidden future sequence entries.

For a multi-phase interaction where a confirm press changes how later edges are interpreted, process `input.edges` in order as Patchwork Pass does. `focusGrid` is a single-phase navigation helper; it does not reorder a game's phase changes for you. Continuous repeat needs real-time steps. Action-driven games remain idle between accepted actions/timeouts, and should normally use press-only selection.

## Presentation

Logical coordinates are 640×400. Keep important objects inside x=24..616, y=45..355 and essential text readable on a 360px-wide phone. The platform puts the pad outside the canvas.

Styles: `pixel`, `cartoon`, `doodle`, `collage`. Graphics includes clear, rect, circle, line, path, text, sprite, save/restore, translate, scale, rotate, opacity, clip, label, backdrop, and actor. There is a 1,200-command / 180 KB UTF-8 buffer limit and a balanced transform stack with at most 32 saved levels. Use at most 256 points per path, 240 characters per text command and 32 distinct declared asset names. All coordinates, including path points and sprite-frame rectangles, must be finite and within ±100,000. Text size and line width must be positive and at most 512. Opacity is 0–1; radii and sprite-frame coordinates are nonnegative, and frame dimensions are positive. Cumulative transform coefficients must remain within ±64. A source sprite frame must fit inside its image. Every frame starts with independent canvas state, including clipping.

Backdrops: space, kitchen, rain, paper, stage, factory. Actors: ship, toast, hand, umbrella, cup, snack, parcel, asteroid, star. Actors use center anchors; sprites use top-left coordinates. Sprite assets are immutable manifest names, never arbitrary URLs. Define collision shapes in the rules, not by image pixels.

Emit spatial feedback at the actual visible interaction point, before deleting or moving the affected object offscreen. For example, `ctx.feedback('hit', {playerId, x:rock.x, y:rock.y, text:'+1'})` gives a short particle burst and optional outlined reaction text. Only supply `'+1'` when the rules actually awarded that score. Catch/pickup, hit/shot, miss/invalid and related events have shared visual treatments; no particle simulation is needed in the cartridge. Positions must lie inside the 640×400 playfield. Reaction text is capped at 12 characters. The shell also pulses changed score values.

Shared feedback lasts less than half a second and is bounded to 24 active bursts. Independent/race views show spatial effects only for their own player; an obscured game view shows none. Backgrounding, transitions and replay seeking clear pending effects. Replay triggers them only when moving forward through events. Reduced-motion preference suppresses these optional particles and score animation. These are presentation effects and do not alter collision, scores, timing or RNG. Existing game-specific animation must still keep gameplay legible when optional effects are absent.

Choose `audio: {music:'main-loop', soundPack:'lofi-arcade'}`. Other supported packs are `soft-toy` (sine effects) and `pixel-bits` (square effects). Emit semantic events such as select, confirm, countdown, jump, shot, hit, catch, pickup, miss, invalid, interference, turn, success, or failure. The shell adds round completion. Timing games can emit `pulse` when their simulation crosses a cue point. `ctx.feedback('catch', {playerId, sound:{pitch:3, timbre:'triangle'}})` supplies an optional bounded semitone offset (-12..12) and square/triangle/sine override. The engine owns event IDs, sound priority, voice limits, ducking, and lifecycle. For a moving timing target, use `timedPress(input, position, velocityPerSecond, target, halfWidth)`. It tests a fresh action press against the position at the engine-validated press time, capped at 150 ms. A held action does not repeat. Use `gfx.project(position, velocityPerSecond, min, max)` for the matching public indicator. The engine supplies display lead time; never build timestamps, network calls, or client scoring into a cartridge. The linear velocity must describe the same sweep over that small interval. These helpers do not rewind discontinuous state transitions, and stale presses never migrate across roles. Input edges in saved journals can include an engine-owned age; browser messages cannot provide it.

Music is a bounded declarative score rendered by the engine. It never defines authoritative timing windows.

Draw the backdrop first: `gfx.backdrop(...)` clears the canvas. The full fixed 640×400 surface is for gameplay. The cabinet renders title, instructions, timer, scores, roles and active player outside it. Do not draw duplicate HUD text inside the canvas. Use `hud(view)` for phase, turn, lives, progress and transient status. Essential in-world cues, object labels and selection indicators belong in the game scene.

## Runtime bounds

Source ≤100 KB; compiled cartridge ≤200,000 JavaScript string units; sandbox heap 16 MiB; stack 256 KiB; bounded CPU interrupts, wall-time guard, process watchdog, state/output and command limits. One cartridge cannot install dependencies. Module-level mutable variables are rejected. Keep module constants immutable and put all changing values in the returned state.

Generated media can finish after a draft preview. The finished version receives a new content hash; an active match or pinned challenge retains its original version.


`ctx.duration` is the cartridge's duration in seconds. Use explicit types for mutable nullable fields and arrays. `gfx.hasAsset(name)` lets a scene choose a generated sprite or its procedural fallback without drawing both. Only one-player realtime cartridges declare reusable `race`, `obstruction` and `pressure` modifiers; native multiplayer/turn games use an empty modifiers list. Draw colored surrounds before sprites, keep opaque labels clear of game objects, and let the platform provide the outer title/timer/score HUD. A discrete game's timeout must consume a turn if its rules promise a fixed number of turns.

Generated image inputs are PNG only, at most 20 MB encoded image bytes, 4.5 million decoded pixels and 4096 pixels on either side. Bounds are checked before pixel statistics/normalization. Sprites must contain transparency and are normalized to 256×256 RGBA assets. These limits are platform responsibilities; cartridges only use declared asset names.

## Presentation motion and expressions

`gfx.time` is presentation time and `gfx.reducedMotion` is supplied by the host. `gfx.motion(kind, age, options)` provides bounce, squash, stretch, wobble and recoil poses; reduced motion returns a neutral pose. One-shot ages are elapsed seconds since an event, not remaining cooldowns. Use a pose with an actor's final options argument, or `gfx.withPose(x, y, pose, () => drawGroup())` for sprites/groups. These helpers never change hitboxes or rules.

`gfx.actor(kind,x,y,size,color,expression,{pose,anchor,from,age,blink})` supports center/feet anchoring, expression transitions and optional blinking. Expressions are happy, neutral, sad, angry, surprised and sleepy; `gfx.face` can draw a standalone expression. `gfx.blink()` supplies a periodic blink; `actorBounds(kind,size,anchor)` documents conservative unanimated visual bounds, not collision geometry. Reduced motion freezes optional backdrop animation and blinking and draws expression targets immediately. All mutable gameplay state still belongs in `init`.


### Rulebooks for controllers

Keep `meta.description` a short catalogue blurb. Optional `meta.rules` (up to 2,000 characters) explains the public rules precisely: timing windows and units, win/failure/scoring conditions, and when the action must be pressed, held or released. Keep it consistent with `step`; do not include hidden answers or a bot policy. The engine sends this plus the cartridge rule source and filtered observation to Jev. Prefer consistent coordinate ranges (for example, every angle in 0..2π), explicit units, and stable player IDs on visible entities. The engine can then highlight the current seat without game-specific controller code. Generated games are prompted to include this rulebook.


New cartridges use `@microfinity/sdk`. The compiler also accepts the original `@minifinity/sdk` namespace so locally saved cartridges can still be recompiled or remixed after the project rename. Both names resolve to the same restricted SDK.
