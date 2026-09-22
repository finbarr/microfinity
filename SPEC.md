# Microfinity product and implementation specification

Status: implementation in progress. The acceptance criteria below remain the full delivery scope.

This specification records the product discussed in this task. The implementation target is a complete, locally runnable browser product with a real shared backend, multiplayer, prompt-based game creation, generated artwork, Jev opponents, and a headless environment interface. Public hosting is a separate delivery step. The project name follows the current workspace name.

## 1. Product

Microfinity is an online microgame party platform inspired by the short, surprising challenges and varied retro presentation of WarioWare. Players create games with prompts, assemble challenges for friends, or play a random sequence. Individual games may use continuous real-time simulation or discrete turns. Players can compete simultaneously, take turns, cooperate, or interfere while another player attempts a challenge.

The defining experience is:

1. Open a browser and create or join a party using a shareable link.
2. Choose an existing challenge, select games, or request a compatible random playlist.
3. Optionally create or remix a game with a natural-language prompt, including custom artwork.
4. Play a rapid sequence with clear instructions, short countdowns, lively feedback, and minimal waiting.
5. See round results, overall standings, personal bests, and a useful replay or rematch option.

The party experience must keep waiting players engaged. A rotating active player with opponents interfering is a core mode, not a future add-on. Simultaneous shared-arena games are also core.

The SDK must make a small game easy for a capable, lower-cost coding model to generate quickly. A game author should spend most of their effort on the mechanic, premise, and composition. Networking, persistence, input devices, timing infrastructure, common feedback, and asset loading belong to the platform.

All shipped characters, artwork, music, and games should be original. The visual direction borrows the variety, legibility, humor, and economy of retro microgames.

## 2. Scope and defaults

### Required for the first complete release

- Browser UI for a lobby, party, game creation, preview, library, challenges, gameplay, and results.
- One to four participants, with two to four for multiplayer reference games. A participant may be a browser player, a scripted bot, or a Jev-controlled bot.
- A universal five-button gameplay controller: four digital directions plus one action, mapped to WASD/arrow keys and Space on desktop and an on-screen D-pad plus action button on mobile.
- Guest identity with a display name and persistent local identity; no account signup needed to join a private party. Identity and membership must be issued and validated by the backend, not accepted from arbitrary score messages.
- A backend that runs authoritative matches and persists validated scores and statistics.
- Fixed and random playlists, shareable challenges, rematches, and solo practice.
- Continuous-time and action-driven games, simultaneous and rotating participation, shared worlds and independent challenge instances.
- Reusable interference modes and game-specific asymmetric roles.
- Eight polished reference games specified below.
- In-product prompt generation of game code and image assets, with validation and bounded repair.
- Engine-owned lo-fi interaction sounds and a per-game retro soundtrack generation step that can run alongside code and artwork creation.
- Immediate play of newly generated cartridges through runtime compilation/loading, without an application rebuild, server restart, or developer file edit.
- A working Jev adapter and a deterministic scripted controller for development, testing, and fallback.
- Replayable execution, headless simulation, and documented RL adapters.
- Browser playtesting, multiplayer verification, and evidence against the acceptance criteria.

### Deliberately outside this release

- Public matchmaking, large public social systems, payments, and a marketplace.
- A full visual programming editor or a general-purpose game engine.
- Mandatory 3D rendering, motion controls, microphone games, and arbitrary third-party game dependencies.
- Mouse aiming, game-surface clicking/tapping, dragging, analog pointer coordinates, and additional mandatory gameplay keys.
- Training a competitive general-purpose RL model. The release must provide working environments and an adapter smoke test, not claim an unperformed training result.
- Production-scale infrastructure or a public deployment as a prerequisite to local completion.

Gameplay is entirely controller-based: keyboard on desktop and an equivalent virtual controller on mobile. All reference and generated games must work within the same five logical buttons. Games declare which of those controls they use, not a custom mouse/touch interface. All application screens use arcade-style directional keyboard navigation: WASD/arrows select within the current screen and Space/Enter confirm. Directional navigation never enters the header or menu shortcuts. Escape opens Options; within an overlay it goes back, and within text edit mode it finishes editing. The header Options button opens the same screen by pointer. Tab remains supported. Text entry has explicit edit mode. Pointer and touch are optional ways to navigate menus. Random selection must honor participant count and any declared platform limitations.

## 3. Core product flows

### Party and challenge

- Random Party immediately launches four compatible games at normal difficulty with two seats and Jev filling the spare seat. No setup dialog, filters, tags, Ready step or configuration form is shown before play. Each cartridge Play button immediately starts that cartridge, with the minimum supported seats filled by Jev as needed.
- A host may separately assemble an ordered playlist and create an invite lobby for friends. Keep setup out of the immediate-play path; choose sensible defaults.
- Joining players choose a display name, see who is connected, and mark themselves ready.
- The host can add or remove bot seats and choose their controller type.
- The room chooses a target participant count within the cartridge's supported range. Connected, ready real players fill those seats first. The engine automatically fills a shortfall with Jev players so a game can start; no game-specific AI integration is needed. When real players fill the target seats, their actions alone drive those seats and no Jev calls are made for them.
- The host can select an ordered playlist. Random compatibility constraints remain engine capabilities; the default launch screen does not expose them as a form.
- Random playlists are resolved and pinned before their rounds start. Store both the selection seed and the resulting entries.
- A challenge link identifies immutable game versions, settings, ordering, and seed policy. A friend can attempt the same challenge later through the backend without the original host being online.
- The end screen shows scores and only two choices: Play again and Back to arcade. Play again starts the same games with fresh variation; do not expose seeds, multiple rematch choices, editing, sharing or replay as a wall of result buttons. Exact pinned challenges and recorded replays remain available through their dedicated links/history.

### Cartridge ratings and discovery

After a match, show one compact 1–5 star row for each distinct cartridge the player finished. Rating is optional, uses keyboard or touch, saves immediately, and does not add a separate confirmation step. The primary actions remain Play again and Back to arcade. A player may change their rating; repeated plays do not create extra votes.

Store one rating per guest identity and cartridge/game ID across version updates, with the specific version rated recorded for provenance. A newly generated remix with a new game ID is separate. Verify eligibility against a completed result for that authenticated guest and exact version, including a loss; bot-only results, previews, another player's round and interrupted rounds without a result do not qualify. Ratings survive restart.

Display average stars and vote count on cartridge cards. A Top rated library view orders rated games ahead of unrated games, using a conservative weighted average to avoid one vote overwhelming a well-rated established game. Initial ranking is `(sum of stars + 15) / (number of ratings + 5)`, with vote count and average as tie breakers. The visible star value is the actual unadjusted average; explain that ordering accounts for rating count. Keep Random Party as one-button launch, without a new configuration form. Guest identity is not an anti-abuse guarantee.

### Creation and remixing

- The user describes a game, requested player arrangement, and optional visual direction.
- The system produces a small structured game brief, a visual/audio asset plan, and a cartridge.
- The creation screen shows useful progress: designing, generating code/art/music, checking, and ready or failed. Independent branches expose their own readiness so a slow soundtrack does not hide an available preview.
- A runnable preview may initially use matching library assets and a stock retro loop while custom artwork and music are generated. The UI must identify this as a draft and label provisional audio.
- The user can play the preview, revise the prompt, and add the finished version to a challenge.
- A remix starts from an existing cartridge and can reuse its assets. It creates a new version and preserves the original.
- Failed creation produces actionable diagnostics and a retry/edit path. It never silently adds an unchecked cartridge to a match.
- As soon as a cartridge and its required assets pass preflight, the creation screen offers Play. Starting it dynamically creates a runtime instance. This must work in an already-running application, including after a later page reload.

### Generation during a party

Creation may be an explicit party phase or prepare future rounds while participants play a ready queue. A round only becomes eligible once its code, assets, and validation are complete. Pin its version and preload it before the countdown. Never replace artwork or code beneath an active round.

Music generation is independent of game compilation. A playable version may explicitly select an already-ready stock loop or silence while custom music is pending; the selected version's manifest must be complete. When the custom loop finishes, create a new immutable version and use it for a subsequent preview or newly selected round. Do not mutate a pinned challenge or start new audio unexpectedly during play. A version labeled as having a finished generated soundtrack must contain that actual soundtrack.

## 4. Game cartridge and SDK

A cartridge has one authored TypeScript source file plus a generated asset manifest and referenced media. Authors do not manually manage a project, sockets, a build system, or image URLs. The platform compiles and packages the cartridge.

Game files do not know whether their inputs came from humans or Jev. They never call AI APIs, hold credentials, schedule model polling, or decide whether the party has enough real players. Controller assignment belongs to the engine. A cartridge declares its observable state and supported actions, then receives normalized, validated input for each player.

Separate these identities:

- Game: the continuing creative work, with title and owner.
- Game version: immutable compiled code, source, assets, SDK/runtime version, and content hash.
- Audio asset: an immutable generated score or rendered loop, or a versioned sound preset, with playback metadata and provenance.
- Instance: one execution with players, configuration, initial seed, and runtime state.
- Challenge: a pinned sequence of versions and configuration.
- Match: an actual attempt at a challenge, including participants and recorded results.

### Independent gameplay dimensions

| Dimension | Supported values | Purpose |
| --- | --- | --- |
| Clock | Fixed-step real time; action-driven | Whether simulation advances continuously or on accepted actions |
| Participation | Individual; simultaneous; rotating roles | Who can perform which actions at a given phase |
| World | Shared; independent instances | Whether players directly affect one world or attempt comparable challenges |
| Relationship | Competitive; cooperative; asymmetric | How objectives and outcomes relate |

A timing relay is fixed-step real time with rotating roles. A placement puzzle may advance only after an action. An action-driven game can still have a platform-enforced decision deadline; a recorded timeout is an explicit event in its execution.

### Reference contract

The exact names may be refined during implementation while preserving these responsibilities. Keep the common authoring path small and document any changes in the final SDK reference.

```ts
export default defineGame({
  meta: {
    title: "Asteroid Scramble",
    instruction: "Shoot the most asteroids!",
    players: [2, 4],
    clock: "realtime",
    participation: "simultaneous",
    world: "shared",
    durationSeconds: 15,
    score: { unit: "asteroids", order: "higher" },
    style: "chunky-pixel"
  },

  controls: controls.dpadAndAction({ actionLabel: "Fire" }),
  assets: ["ship", "asteroid", "space"],
  audio: { music: "main-loop", soundPack: "lofi-arcade" },

  init(ctx) { /* Return initial serializable game state. */ },
  step(state, inputs, ctx) { /* Advance rules using accepted inputs. */ },
  observe(state, playerId) { /* Return information available to this player. */ },
  draw(view, gfx) { /* Describe the visible scene without changing rules. */ }
});
```

The SDK supplies:

- Seeded randomness with serializable generator state; separate gameplay and presentation randomness.
- Tick/phase time, timers, duration limits, and explicit decision deadlines.
- Stable player/entity identifiers and role assignment helpers.
- Four digital directions and one action button, with held/pressed/released events and normalized movement derived from that same controller.
- Simple collision shapes, movement, projectile, spawning, timing-window, and sequence helpers.
- `addScore`, `setScore` where appropriate, `finishPlayer`, and `finishRound` equivalents.
- Declared score direction, deterministic ties, individual completion, elimination, and round completion.
- Semantic feedback events for sound, particles, reactions, and score animation, with bounded sound variations and stable event identifiers.
- Optional legal-action enumeration or action masks for discrete actions. Wrong answers remain legal choices; an action mask must never reveal the solution.

For basic games, controls and observation types should supply sensible defaults for bot action construction. More unusual mechanics can provide a bounded action adapter. Avoid making authors implement several parallel representations of the same simple game.

Expose the same control/action descriptions to human controls and the engine's AI adapter. Optional game-specific action metadata only describes the interface; it does not implement a separate bot or bypass engine scheduling.

### Keyboard and mobile input contract

The original GBA microgames used the D-pad and A button for a wide range of interactions. Examples include stopping a rotating mirror with A, steering a crayon with the D-pad, entering direction/action sequences, and operating one pinball flipper with the D-pad and the other with A. The original's separate same-device versus games used shoulder buttons; our online players each have their own controller, so those do not require extra logical controls here.

Use exactly five logical gameplay controls: `up`, `down`, `left`, `right`, and `action`.

| Input pattern | What it supports | SDK treatment |
| --- | --- | --- |
| One timed press | Catching, stopping a dial, jumping at a moment | A single button-down edge |
| Holding and releasing | Sustained movement, charging, braking | Held state, held duration, and release edges |
| Repeated presses | Pumping, chopping, repeated attacks | Actual separate press/release cycles; never OS key repeat |
| One- or two-axis movement | Dodging, positioning, steering, navigating a grid | Digital directions with optional diagonal movement |
| Movement plus action | Move and shoot, move and jump | Concurrent directional and action state |
| Direction/action sequences | Rhythm, combinations, prompted sequences | Ordered edges and simulation-timed windows |
| Selecting or placing | Choosing a cup, finding an odd object, arranging pieces | A visible focus/cursor moved by directions, confirmed with action |

Desktop defaults are W/A/S/D or arrow keys for direction and Space for action. The action label may change between games, but its physical mapping remains stable. Do not require Shift, mouse movement, number keys, a second action button, or hidden control chords. Platform navigation or a pause/menu request can use standard shell controls outside the five game inputs; an online room does not stop because one player opens a menu.

Give generators ready-made cursor, choice-list, grid-selection, aim-angle, and sequence helpers that use these buttons. A game needing precision positioning must supply a steerable cursor or another controller-friendly mechanic. It cannot require pointing at the answer. The renderer's ability to draw arbitrary shapes does not imply arbitrary input devices.

Normalize the opposite directions on each axis to neutral. Where a movement helper supports diagonals, normalize speed so diagonals do not move faster. Games may use directional presses as discrete commands rather than movement, but must state that clearly. A directional mapping must remain usable with a single thumb on the D-pad.

Track keyboard keys independently, including aliases: releasing A must not release the left direction if ArrowLeft is still held. Ignore repeated keydown events for new-press semantics. Preserve short taps and ordered edges that arrive between simulation ticks; do not lose them by sampling only the final held state. Use the same engine-owned repeat rules for keyboard, virtual pad, and bots when a selection helper supports held-direction repeat.

Input collection belongs to the engine. Cartridge code never registers DOM/key/touch listeners. Suppress browser scrolling/default actions for gameplay keys only while the game has input focus; typing in the prompt editor remains normal. Reset held state on focus loss, hiding the page, disconnection, and controller cancellation. At round/role transitions, suppress inherited action presses until release and require fresh confirmation so a held key cannot accidentally answer the next game.

### Mobile virtual controller

Render a fixed digital D-pad on the left and one large action button on the right, outside the critical game surface. Keep their placement stable across a playlist. Show the current action label and immediate pressed-state feedback. The pad should support neutral, cardinal directions, and diagonal sectors using one thumb; it is not an analog aiming stick.

Use multitouch so one thumb can steer while the other presses or holds action. Track independent touch identifiers, support sliding a thumb between D-pad directions, and reliably clear state on release, cancellation, capture loss, orientation change, and app backgrounding. Prevent scrolling/selection gestures on the controller surface without disabling normal interaction throughout the application. Raw touch coordinates stay inside this input adapter and are never passed to games or used to select game objects directly.

Provide comfortable controls of at least roughly 48 CSS pixels per effective target, safe-area clearance, and portrait/landscape layouts that preserve a readable playfield. Single-button games may emphasize the action control, but it must not move unexpectedly. Do not require fast three-finger chords or change rules silently by device. Track input method when assessing timing fairness; identical logical controls do not guarantee identical physical feel.

All eight reference games and the generation benchmark must support the virtual pad. Test genuine simultaneous touch input through available browser tooling; a screenshot of mobile controls or mouse-clicking their buttons is not sufficient multitouch evidence. If physical phone testing is unavailable, explicitly distinguish emulated functional coverage from unverified on-device feel.

### Runtime invariants

- All mutable gameplay state is serializable, including timers, RNG state, role state, and scores needed for snapshot restoration.
- Given a pinned runtime, seed, configuration, and accepted input/event sequence, execution reproduces the same authoritative outcomes and state hashes.
- No wall-clock reads, ambient randomness, network requests, browser APIs, or filesystem access inside game rules.
- Rendering never changes gameplay state, consumes gameplay RNG, determines a collision, or records a score.
- Presentation effects may change appearance but not unrecorded game rules. Any effect that changes timing, visibility permissions, or collision is a recorded part of the simulation/mode.
- Client and bot inputs pass through the same role and game-rule validation.
- Every game has a bounded ending, including no-input and disconnected-player cases.
- SDK/runtime versions are pinned. Determinism is tested; sharing TypeScript alone is not sufficient proof.

## 5. Presentation, artwork, and audio

### Renderer

Use Canvas 2D behind a platform-owned drawing API for the first implementation. Keep rendering independent from the SDK's rules contract so another backend can be added later if measurement justifies it.

Generated drawing code runs in the cartridge sandbox and produces a bounded command buffer. The trusted renderer executes that buffer. The generator does not receive the DOM or a raw privileged browser context.

Support shapes, paths, images, text, transforms, layers, opacity, clipping, and sprite frames. Provide higher-level actors, expressions, backdrops, labels, and common game UI. Use a fixed 640×400 playfield, displayed at that size on desktop and uniformly reduced on small screens. The cartridge draws only its game scene and essential in-world cues. The arcade cabinet wrapper owns the border, title, instructions, timer, scores, player roles and active turn, all outside the canvas. A bounded `hud(view)` callback supplies extra status/progress using only that player's filtered view. Reserve space outside the playfield for the mobile virtual controller. Pixel styles support nearest-neighbor scaling and pixel alignment.

Render independently of simulation ticks, interpolate permitted visual state, and avoid frame-rate-dependent rules. Keep React or an equivalent UI framework around the game surface for the application screens.

### Visual kit

The SDK should provide coherent style presets rather than expecting the generator to invent every font, border, and color. Implement at least three visibly different styles across the reference games, drawing from:

- Chunky pixel art.
- Bold, expressive cartoons.
- Rough doodles with a limited palette.
- Cutout collage.

Provide original stock props, expressive features, backgrounds, palettes, and readable fonts. Actors should have useful anchors and documented visual bounds. Include reusable bounce, squash/stretch, wobble, blink, recoil, and expression animation. Common feedback combines restrained particles, hit flashes, short sound effects, and score reactions.

Sound begins after a user gesture, has a persistent mute control, and never carries the only essential instruction. Honor reduced-motion preferences for optional effects. Keep instructions and results legible on all supported layouts. Use a dark arcade cabinet theme with locally hosted pixel lettering, clear focus highlights, and simple screens. Subtle static CRT lines/glow may be enabled by default, with a persistent off switch. Occasional wobble is opt-in and suppressed by reduced-motion preferences; effects never change hitboxes or obscure essential cues.

### Lo-fi interaction sounds

Audio is part of the SDK's presentation kit. Provide short original, configurable arcade sounds for selection/confirmation, countdown, jump, shot, hit, catch, pickup, miss, invalid action, interference deployment, turn change, success, failure, and round completion. Favor a small palette of square/triangle waves, pitch slides, filtered noise, soft percussion, and short envelopes. Sounds should be crisp and playful without harsh peaks or excessive distortion.

Cartridges select a sound pack and emit semantic feedback events such as `ctx.feedback("catch", { entityId })`. The engine maps these to coordinated sounds, particles, and reactions. Allow a bounded pitch/timbre variant or manifest asset override when a game needs character. Basic interactions must work with built-in sounds immediately; authors must not generate or program an entire sound library for every game.

Generated code never constructs an AudioContext, accesses raw Web Audio nodes, loads arbitrary audio URLs, or starts sound on every draw call. Deduplicate confirmed/predicted feedback by event identifier; replay and reconciliation must not play the same hit repeatedly. Bound concurrent voices and repeated effects, prioritize important cues, and clean up every source when the round ends.

### Per-game music generation

Each game should have a short instrumental loop matching its premise, art direction, and pace. Aim for compact four- or eight-bar loops, usually around 8-20 seconds, with a clear motif, sparse arrangement, and room for interaction sounds. Default to retro/chiptune/lo-fi instrumentation and no vocals or spoken instructions. Distinct games should have recognizably different motifs, rhythms, or instrumentation; changing only the pitch or playback speed of one stock loop does not demonstrate per-game music generation.

Run soundtrack creation as a separate bounded job after the shared game brief is available, in parallel with independent code and image work. The music brief includes mood, tempo, meter, bar count, instrument palette, intensity, and whether the game needs unusually clear timing cues. Show pending/failed/ready status and offer soundtrack regeneration without regenerating the game rules or artwork. Cache music for remixes and preserve its generation provenance.

The remix flow offers explicit choices to reuse the existing artwork and soundtrack independently. Reusing a soundtrack means keeping its exact saved asset and provenance, with no new music-model request. Regenerating only the soundtrack preserves the cartridge's rules, runtime, player arrangement, and artwork.

For the first implementation, prefer **model-generated symbolic music**: use the configured generation model to produce a validated declarative score with note pitches, beat positions, durations, velocities, and a small set of approved synth instruments. The engine's sequencer/synth turns this score into a chiptune loop. This is a real model-driven music generation step, not a random preset selector. Use strict bounds on tempo, note count, polyphony, duration, and instrument parameters. The score is data and cannot contain executable audio code.

Support a music-generation adapter whose output can also be a rendered audio file from a dedicated music model. That alternative is an extension point, not an assumption that the supplied OpenAI key exposes an audio-native music service. The symbolic implementation must be fully functional and verified with live model calls; an unavailable optional audio-native provider does not block it.

The audio manifest records logical asset name, content hash, provenance/model, source score where applicable, render/synth version, format/sample rate, duration, tempo/meter, loop-start/end positions, and gain. Bake generated scores into compact playback assets where practical; retain the score for reproduction and later variation. Validate rendered audio for decode errors, unexpected silence, clipping, oversized files, long lead-ins, and audible seams. Loop points must be verified in the decoded audio, including codec padding; a prompt requesting a seamless loop is not proof that it loops cleanly.

Use envelope handling, exact musical boundaries, and suitable tail handling or a short seam crossfade to avoid clicks. Repeatedly listen to the actual exported loop. A fully muted or autoplay-blocked session still plays correctly, and soundtrack-generation failure never blocks an otherwise valid draft preview. Final generation acceptance still requires the real generated loops specified below.

### Audio runtime, mixing, and timing

The engine owns one reusable browser audio context/mixer with persistent master mute and separate music/effects volume controls. Unlock/resume it through an explicit user interaction, including keyboard and virtual-pad gestures, while preserving that interaction's intended control behavior. If playback is blocked or suspended, provide a clear enable/resume control rather than a stream of console errors. The server and headless runner never require an audio device.

Preload and decode selected audio before the round where possible. Play local decoded buffers or approved synth output; never stream a provider response in the gameplay path. Schedule loops and feedback using the audio clock, anchored to the match/round timeline. Use engine-owned starts/stops, short fades, and ducking for important cues so rounds do not leave overlapping music or abruptly cut waveforms.

Music is presentation, not the authoritative clock. Rhythm/timing windows and any tempo ramp come from recorded simulation state, with redundant visual cues and structured events available to controllers. In Skill Continue, explicitly schedule the accelerating cue pattern from that state; a soundtrack of uncertain beat timing must not define when a hit succeeds. Do not change gameplay difficulty based on audio decoding or device latency.

Background/resume, orientation changes, reconnects, replay seeking, and round replacement must not accumulate duplicate loops or leave stuck notes. A resumed client starts or seeks its local music to the appropriate round position. Record enough metadata and feedback events for consistent replay, without claiming sample-perfect cross-device synchronization. Device output latency and physical speaker quality remain measured/reportable limits.

### Generated assets

Image generation is part of the product's creation pipeline, not solely a developer tool used to prebuild examples.

1. Derive a shared visual brief, palette, asset roles, dimensions, and style references from the game brief.
2. Generate backgrounds and individual sprites, using transparent backgrounds where required.
3. Validate file type, dimensions, decodeability, cropping, transparency, and size; normalize output into browser-ready assets.
4. Record logical dimensions, anchors, frame information, and immutable asset hashes in the manifest.
5. Render the real assembled scene and check that key objects are distinct, correctly sized, and readable.

Start with static sprites animated through transforms and expressions. Multi-frame image generation is optional and must be checked for alignment and continuity. Do not assume an image model produces a perfectly aligned sprite sheet or exact collision geometry.

Game code uses stable names such as `gfx.sprite("angry-toaster", ...)`. Explicit simulation shapes determine collisions and controller-driven targeting. Visual art should agree with those shapes, but gameplay must not depend on decoding image pixels.

Cache and reuse assets for remixes. A draft can use placeholders, but a version presented as finished with generated artwork must contain the actual requested assets. All required assets load before countdown; failed loading produces a retry or a defined round skip, not an invisible target.

## 6. Multiplayer and interference

Every connected participant remains an input source throughout a round. Roles determine available actions. Taking a turn never implicitly disables all other players.

### Reusable party modes

Implement these modes around compatible cartridges:

- Solo practice.
- Simultaneous score race using independent instances with comparable seeded content.
- Rotating challenge with interference: one active challenger, other players acting as interferers.
- Pressure mode: other players build pressure toward a shared failure event while the active player tries to finish and pass the turn.

For independent races, equal seeds alone are insufficient if player actions change RNG consumption. Use independent random streams or a precomputed spawn/challenge schedule so one player's actions do not alter another's challenge content.

Implement at least one reusable obstruction interaction and one pressure interaction. Give interference explicit cooldowns or resources, bounded duration, and limits on combined effects. Show who caused an effect and when it ends. The active player must retain understandable counterplay or a reasonable chance to finish.

Interferers use the same D-pad and action button. For example, steer an obstruction with directions and deploy it with action, or pump pressure with separate action presses. No interference mechanic may depend on mouse coordinates, tapping the game surface, or extra keys.

Cartridges declare compatible modifiers. The party layer may surround or overlay a game surface; it cannot arbitrarily rewrite game state. Effects that alter the rules must use a declared interface and be recorded. UI-only cosmetic distractions and actual visibility reduction must be distinguished.

### Custom roles

Games may define asymmetric roles and inputs, such as collector versus conveyor operators or pilot versus asteroid launchers. Roles can rotate, and the platform must validate actions against the current role and phase.

If an effect conceals information from a player, their bot observation must respect the same restriction. A structured bot may retain information it previously observed, just as a human can remember it; it may not receive newly concealed information through raw state.

### Match lifecycle

Use explicit states such as lobby, preparing, instructions, countdown, playing, round result, and match result. Associate messages with match, round, phase, and sequence identifiers. Reject stale and duplicate actions, especially actions arriving after a role swap or game transition.

Preload upcoming rounds and synchronize a future start time. Specify behavior for disconnects, backgrounded tabs, reconnects, host departure, and insufficient remaining participants. A broken cartridge has a defined neutral skip/abort outcome; it must not award a fabricated win or freeze the party.

## 7. Backend and networking

Recommended baseline: TypeScript, Node.js, Colyseus for room/connection lifecycle, PostgreSQL for durable records, and an object-storage interface for assets and replays. Local development may use a filesystem implementation of object storage. Use supported dependency versions verified during implementation.

Keep the game runtime independent of Colyseus. Room metadata can use a stable schema; generated per-player game views can use a versioned, validated message format. Do not expose framework-specific schema definitions to the game-writing model. Sending a complete hidden state to every client is not acceptable.

The room owns player membership, playlist execution, game and mode simulation, input validation, authoritative scores, and final results. WebSockets carry inputs, bounded view snapshots/patches, acknowledgments, and discrete feedback events.

Begin with modest snapshots and measure before adding custom binary protocols. Avoid a database write per simulation tick. Journal accepted inputs/events and use periodic checkpoints, then persist completed results idempotently.

Target fixed-step 60 Hz simulation for the reference action games, with a separately configurable snapshot cadence and display-driven rendering. Action-driven games do not burn simulation ticks while waiting for moves. Profile the chosen runtime and document the measured capacity rather than promising unmeasured scale.

Prediction is allowed for supported local movement using public information, with reconciliation to authoritative state. Remote entities can be interpolated. Do not distribute hidden RNG state or secrets to enable generic prediction.

Timing games need clock-offset estimation, scheduled starts, explicit input deadlines, and bounded compensation. Client timestamps are claims to validate, not authoritative outcomes. Define how late inputs, uncertainty, and ties work. The timing relay may get harder until failure, but the implementation must account for its tick resolution and network precision rather than pretending to measure arbitrarily small differences.

## 8. Generated-code execution

### Runtime compilation and immediate loading

TypeScript is the authoring format, not code that the browser must execute directly. New cartridges are data delivered to an existing runtime. Implement this concrete path:

1. The creation service receives generated source and its asset manifest.
2. A bounded compiler task validates allowed imports and types against the pinned SDK, and transforms TypeScript into a JavaScript ES module compatible with the sandbox. A tool such as esbuild can perform transformation; type checking is a separate check.
3. The module may import only approved virtual SDK modules supplied by the runtime. Compiling a game never installs packages or executes game-controlled build configuration.
4. The sandbox loads the compiled module and runs a short bounded preflight with representative seeds, controls, termination, and drawing output. Full regression and stress coverage is performed separately during development; it need not run for every preview.
5. The service stores immutable source, compiled module, runtime/SDK identifiers, and asset hashes, and marks the version ready once required media is available.
6. An existing browser session fetches the manifest/module/assets, instantiates the sandbox, and starts a preview or joins an authoritative match running that same version.

The application bundle contains the SDK host and renderer, not a static import of every game. Adding a game must not require writing into the frontend source tree, restarting the backend, invoking a full app build, or relying on development hot-module reload. Reopening a saved generated game uses the persisted cartridge and does not rerun generation or compilation unnecessarily.

The sandbox's module evaluation is the controlled execution mechanism. Do not evaluate generated source with page-level `eval`/`new Function` or load it as privileged application JavaScript. Preserve useful source locations in diagnostics so the generator can repair failures.

### Isolation and resource limits

Prototype a restricted QuickJS/WebAssembly runtime with CPU, memory, stack, state, and output limits. Use a restricted worker-process boundary on the server and a worker-hosted sandbox in the browser. Measure per-step and drawing overhead before finalizing limits.

Only approved SDK imports and narrowly scoped host functions are available. Keep provider keys and database credentials outside cartridge execution. The runtime has no filesystem/network capabilities. Validate command buffers and all values crossing the boundary, including non-finite numbers, oversized arrays, strings, and images.

Node's `vm`, TypeScript checking, prompt instructions, and a Web Worker by itself are not sufficient isolation for untrusted code. Compilation, linting, and gameplay tests supplement the execution boundary.

Terminate over-budget or invalid cartridges, clean up resources, and surface a useful failure. Test that a malicious or broken cartridge cannot stall other rooms or escape through a host function.

## 9. Controllers and Jev

Define one controller interface around a player's filtered observation, allowed action representation, and decision context. Implement browser input, deterministic scripted bots, and Jev as adapters.

### Engine-owned seats and controller assignment

The engine maintains stable player seats separately from the controller currently driving them. For a configured target participant count, prefer connected, ready real players and fill vacant seats with Jev. If enough real players are present, no automated controller drives their seats. Forward all validated human actions and accepted Jev actions into the same game input path.

Choose a sensible target from the host's settings and each game's supported player range. Do not fill a four-player maximum merely because four is possible if the selected match only requires two participants. A single real player must be able to launch a multiplayer challenge with automatically supplied Jev opponents.

Re-evaluate assignment at explicit safe boundaries, normally before each round. For mid-round disconnect replacement or reconnection, define a deterministic handoff policy, increment a controller-ownership epoch, and invalidate pending inputs/requests from the old controller. Never allow human and AI controllers to drive the same seat at once. Record mixed-controller participation so a returning player is not credited with an unqualified human-only result earned by a bot.

### Predictable decision loop

The Jev adapter runs on the backend using `TYPESAFE_API_KEY`. It formats concise player-visible game state and supplies bounded action choices to Jev's typed decision API. Keep model identifiers, endpoint configuration, credentials, request budgets, and decision cadence configurable. Record the actual model used in results and evaluation evidence.

Use a predictable engine-owned schedule for real-time AI seats, initially targeting one decision opportunity every 200 ms (5 Hz), with the interval configurable and tuned against measured performance. Schedule against clock boundaries rather than waiting a fresh interval after each response, which would accumulate drift. On each opportunity, capture the latest permitted state, request the next action, and apply a valid response at a simulation boundary. The game simulation continues independently. Measure Jev's quick-response behavior rather than assuming an exact latency or deadline guarantee.

Do not call Jev for every rendering frame or block a room while waiting for a response. If the prior request is still outstanding, skip/coalesce a scheduled opportunity instead of creating an unbounded queue. Record missed opportunities and actual action cadence. Action-driven games make a request when a bot has a legal decision to take and must not spam the API while waiting for another player.

At most one useful decision request per bot should be outstanding unless a deliberate bounded strategy is justified. Associate responses with the originating round, role, observation tick, and deadline. Discard obsolete responses. Define input hold/expiry rules; an old button edge must not fire repeatedly.

A party may have several AI seats. Manage their calls centrally with bounded concurrency. Decisions may be batched only where the supplied state is legitimately visible to every affected controller; do not combine different players' private information into one shared Jev request. Controller ownership and role validity are checked again when a response arrives.

For combined movement and firing, use a bounded set of meaningful input combinations from the same five buttons as human players. With opposite directions neutralized, a full digital controller has at most nine directional states (including neutral) times two action-held states: 18 combinations. Games normally use fewer. The engine derives press/release edges from transitions and applies the same repeat rules as human input. Jev must release before a subsequent distinct action press; it cannot submit an instantaneous answer or coordinate that bypasses the cursor movement a human must perform.

Jev only sees the player's observation. Do not expose hidden answers, future events, private opponents' information, or solution-bearing action labels. Structured observations provide different perceptual assistance from pixels, so report them as distinct evaluation conditions.

Fallback behavior must be explicit and recorded. A scripted fallback can keep a party running, but it must not be counted as a successful Jev decision. If a local helper executes a high-level Jev instruction, describe the combined controller honestly.

Test Jev both as a challenger and as an interferer. Its strength is an empirical question; the product must tolerate valid but weak decisions and slow responses.

## 10. Scores, statistics, and replay

The authoritative simulation produces raw scores and outcomes. Only validated results update leaderboards. The backend must handle repeated completion messages or retries without double-counting a result.

Keep these separate:

- Raw game score and direction, such as asteroids destroyed or timing error.
- Win/loss, completion, elimination, and tie outcomes.
- Party placement and tournament points.
- RL rewards.

Do not sum incomparable raw scores across a mixed playlist. Use a documented placement or normalized tournament scheme with deterministic tie handling.

Partition comparable leaderboards by immutable game version, relevant settings/difficulty, player count, party/interference mode, and controller category. Record keyboard versus virtual-pad input method for timing and fairness analysis; do not claim their physical precision is equivalent without testing. Guest identity does not prove a participant is human; record declared/controller type without claiming an anti-bot guarantee.

Persist matches, rounds, participants, scores, duration, completion reason, controller metadata, and relevant generation provenance. Track completion rate, score distribution, replay/rematch rate, abandonment, technical failures, and generation success/repair counts. Display useful user-facing statistics without turning the gameplay UI into a diagnostics console.

Record version/runtime hashes, initial configuration, seeds, accepted inputs, timeout/disconnect events, and controller actions. Replays use recorded actions rather than re-calling Jev. Keep secrets out of live views; replay visibility follows a documented post-round policy.

## 11. Headless simulation and RL

The exact rules and mode composition used by live rooms must execute without graphics, network calls, database access, or real-time sleeping. A headless runner steps them as quickly as available compute permits.

Provide reset, step, observation, action-space, reward, termination, truncation, seed, and snapshot/restore interfaces. Include a working Gymnasium wrapper for an individual environment and PettingZoo examples for simultaneous and sequential multi-agent interaction. A bridge to the JavaScript runtime is acceptable; benchmark and document its overhead. Do not rewrite game rules in Python.

Represent actual in-game time limits as part of the task's rules; distinguish normal terminal outcomes from an externally interrupted or capped training rollout. Record action repetition, observation cadence, and controller latency assumptions so a fast offline evaluation is not confused with live cloud-controlled performance.

Keep RL rewards versioned and separate from the visible score. Include random and simple scripted baselines. Check that reward improvements reflect the stated objective and that observations/action masks do not leak answers.

Use human success as one signal of learnability, together with skill sensitivity, performance on held-out seeds, and improvement over baselines. Agent-operated browser playtesting is not evidence of genuine human performance. Instrument future human play; do not invent human win-rate claims.

## 12. Generation system and smaller-model usability

Use configurable code-model, image-model, and music-generation adapters. Implement real code/image provider paths and a real model-generated symbolic music path as specified in section 5. The browser submits a prompt to the backend creation pipeline; manually adding developer-generated code, images, or music does not demonstrate this product feature.

The user has supplied `OPENAI_API_KEY` and `TYPESAFE_API_KEY` in the workspace `.env` for implementation and live integration testing. Use the OpenAI key for the initial code, image, and symbolic-score generation paths and the TypeSafe key for Jev. Select currently available model identifiers during implementation and keep them configurable. Key presence is not proof of provider access; verify the relevant live paths. Load secrets only in backend services, exclude `.env` files from version control, and never put keys in client bundles, generated cartridges, logs, screenshots, or playtest reports.

The pipeline is:

1. Brief and compatibility selection.
2. Visual/audio asset plan, shared style brief, and a separate music brief.
3. Single-file code, image, and soundtrack generation as independently scheduled branches. Music generation must not unnecessarily delay a runnable draft preview.
4. Compilation, SDK validation, and execution limits.
5. Headless simulation across seeds, malformed-input checks, and termination checks.
6. Bounded automatic repair with precise diagnostics.
7. Rendered preview, image/audio validation, loop audition, and readiness status for each branch.
8. Immutable version creation and optional addition to a challenge.

Supply the code model with a concise SDK reference and a small relevant set of complete examples. Prefer plain TypeScript and familiar control flow. Use reusable mechanic helpers and style/assets rather than requiring long drawing code or framework boilerplate. Preserve enough flexibility for genuinely new mechanics.

All generation prompts, examples, and validation enforce the D-pad-plus-action contract. Game instructions must describe the actual keys/control labels. Reject cartridges requiring mouse/pointer input, direct game-surface touch, extra gameplay buttons, or unsupported control chords. Automatically include the shared virtual pad; generators do not author a second mobile input implementation.

Set limits for request size, asset count/size, provider spend per job, retries, and job duration. Configuration must support real use and clear failure reporting. Provider errors do not silently become successful generations.

Record model/provider/version, prompts or reproducible prompt hashes, asset provenance, total creation latency, first runnable-preview latency, soundtrack-ready latency, repair count, validation outcomes, and estimated/actual usage when available. Record overlapping branch execution and provisional-audio use so music-generation performance can be assessed separately. Keep credentials out of all such records.

Benchmark at least three new prompts with a named lower-cost coding model, beyond the shipped reference examples: one real-time challenge compatible with interference, one shared multiplayer game, and one action-driven turn game. The finished games must be produced through the creation flow without manual source edits. At least two must include image-model-generated assets produced by that flow. Report first-pass results and all repair attempts honestly; if generation is unreliable, improve the SDK/examples/pipeline and rerun held-out prompts.

All three benchmark games must also receive a distinct model-generated retro loop through the soundtrack branch, with meaningful interaction sounds from the SDK. Use these runs to prove that code and audio jobs can overlap, an early preview works with clearly identified provisional music, and the finished soundtrack persists and plays on reopening. No developer-authored loop may substitute for the live generation evidence.

## 13. Required reference games

Each game has an immediately understandable instruction, a distinctive visual premise, clear feedback, configurable difficulty, bounded completion, and an explicit score/tie policy. Reuse SDK helpers. Do not solve each game with a separate networking or rendering architecture.

| Game | Arrangement and mechanic | What it proves |
| --- | --- | --- |
| Asteroid Scramble | Two to four players move and fire in a shared arena; highest asteroid count wins a short round | Real-time simultaneous play, projectiles, contested scoring, collision, movement prediction |
| Skill Continue | Players take turns hitting a moving timing window; pace increases after success; a miss costs a life or eliminates under a declared mode | Real-time turns, role changes, narrow deadlines, acceleration, limited opponent distractions |
| Toast Catch | Catch launched toast with a hand; playable solo and unchanged inside reusable interference/pressure modes | Sprite-based art, expressive feedback, cartridge/mode separation, reuse of a simple game |
| Umbrella Panic | Catch desirable falling objects and avoid hazards in independent simultaneous instances with a common spawn schedule | Comparable score races, seeded content, movement, good/bad target readability |
| Cup Shuffle | Observe a short shuffle, then choose the cup hiding an object; compatible with declared distraction rules | Memory, phases, hidden information, meaningful observation history, no answer leakage |
| Odd Snack Out | Move focus among snacks with directions and press action to identify the different visible property before the deadline | Recognition, discrete choice through the controller, virtual-pad/keyboard equivalence, clear visual distinctions |
| Patchwork Pass | Players alternate choosing a piece/orientation from a small tray with left/right and action, then position its ghost on a shared grid with directions and confirm with action | Action-driven turns, spatial reasoning, controller-based selection/placement, legal placement, decision timeout |
| Conveyor Clash | One collector catches useful parcels while opponents operate bounded lane switches; collector role rotates | Game-specific interference, asymmetric action spaces, custom role validation, fair opportunity across a match |

Asteroid Scramble and Skill Continue implement the user's two examples. At least three reference games should visibly use original image-model-generated artwork, including useful sprites rather than only decorative backgrounds. Their generation may be part of development, while the separate generation benchmark proves end-user creation.

The reference library must demonstrate at least three distinct visual styles and multiple sound/animation treatments. Every game must be playable through the normal UI; a headless-only implementation does not count.

Every reference game must have appropriate interaction sounds and its own short loop. Suggested music briefs, adjustable during playtesting:

| Game | Music direction |
| --- | --- |
| Asteroid Scramble | Bright space arpeggios, crunchy bass, brisk pulse |
| Skill Continue | Sparse pulse and dry percussion, leaving room for engine-timed accelerating cues |
| Toast Catch | Bouncy toy-keyboard melody and playful kitchen-like percussion |
| Umbrella Panic | Soft rainy bleeps and a light, busy rhythm |
| Cup Shuffle | Sneaky plucked motif and restrained syncopation |
| Odd Snack Out | Comical call-and-response melody with short phrases |
| Patchwork Pass | Mellow lo-fi puzzle groove that remains pleasant during longer turns |
| Conveyor Clash | Mechanical percussion and a chugging bass pattern |

Generate at least three reference soundtracks through the implemented music-generation pipeline; the remaining reference loops may be original authored material. Sound packs and small stingers may be shared. The separate three-game generation benchmark proves that end-user creation also produces distinct music.

Control expectations: Asteroid Scramble uses movement plus action to fire; Skill Continue uses a timed action press, with the same controller assigned to distraction actions for opponents; Toast Catch and Umbrella Panic use directional positioning; Cup Shuffle and Odd Snack Out use focus movement plus action to confirm; Patchwork Pass uses explicit selection and placement phases; Conveyor Clash uses directional collector movement and direction/action commands for conveyor operators. Cover timed presses, holding/releasing, repeated presses, direction changes, and movement-plus-action in the reference games or reusable pressure mode. Add focused input fixtures for ordered sequences and all other input patterns in section 4.

## 14. Validation and playtesting

Testing must cover mechanics, actual browser interaction, network behavior, presentation, and generation. Passing type checks alone does not satisfy this specification. Fix reproducible defects and rerun the affected checks.

### SDK and runtime

- Meaningful tests for inputs and button edges, role transitions, score updates, termination, seeded randomness, snapshots, and mode composition.
- Verify five-button input parity across keyboard, virtual pad, and Jev; alias handling; ignored OS repeat; fast press/release edges; opposite-direction neutralization; diagonal speed; focus/cancel release; and transition suppression. Test repeated-button and sequence mechanics against known event timelines.
- For every reference cartridge, run at least 100 seeded headless episodes spanning supported player-count boundaries and difficulty settings; record the exact coverage.
- Test no input, random legal input, scripted input, malformed/stale input, and appropriate win/loss paths.
- Replay recorded episodes and restore representative mid-round snapshots; compare authoritative state hashes and outcomes.
- Verify resource limits, host-function boundaries, and recovery from nontermination or oversized output without blocking another room.

### Browser gameplay

- Actually play all eight games using WASD/arrow keys and Space, and exercise each game through the mobile virtual controller. Browser-driven agents are acceptable; identify them as such in the report. Direct game-surface clicks/taps or injected semantic answers do not count as gameplay input.
- Exercise a win and a loss/failure path for every game, with normal UI navigation. Direct internal-state mutation is not a substitute for this test.
- Complete at least three full mixed-game party sessions with two or more independently controlled browser clients. Include simultaneous play, rotating interference, custom roles, and transitions between real-time and action-driven games.
- Exercise four-participant behavior using independent clients and/or clearly identified bot seats.
- Create and follow a challenge link in a separate session, replay the pinned challenge, and verify consistent version/settings/seed policy.
- Check reconnect during a round, host departure, background/resume, a late join attempt, and failed asset loading. Verify documented recovery behavior.
- Test representative desktop, small-phone portrait, and phone landscape layouts; include approximately 1440x900, 390x844, 360x640, and 844x390, or document equivalent actual viewports.
- Inspect rendered frames for every game: instruction legibility, clipping, image transparency, target/collider agreement, score placement, and feedback. Check mute and reduced motion.
- Exercise simultaneous virtual D-pad plus action with independent touch contacts, slide-to-change direction, rapid action taps, held action, diagonal steering, pointer cancellation, orientation change, and background/resume. Verify no stuck keys, duplicate presses, page scrolling, accidental next-round actions, or game objects hidden beneath controls. Distinguish emulator/browser touch-event coverage from physical-device testing.
- Exercise audio unlock using keyboard and virtual-pad interaction, persistent master/music/effects settings, autoplay denial, and suspension/resume. Check repeated shots/catches, interference, success/failure cues, round transitions, and reconnects for duplicate effects, missing important cues, overlapping loops, or stuck notes. Verify muted play remains understandable.
- Use Chromium and at least one other browser engine for smoke coverage when available. Any unavailable engine is a named coverage gap, not a passed check.

### Network and results

- Test local conditions and injected approximately 100 ms and 200 ms round-trip latency, with jitter/delivery stalls. Record the method and measured conditions.
- Check duplicate, stale, out-of-role, and out-of-range inputs; no client may directly submit a trusted final score.
- Check that round-completion retries update scores/statistics once.
- Verify that private views do not disclose Cup Shuffle answers or future events.
- Assess the timing relay under latency and document the fairness limits. Do not claim equivalence between local play and high-latency play without evidence.
- Restart the application services and verify durable challenges, versions, results, and statistics remain available. Active-room restart behavior must be explicit; transparent failover is not required.

### Jev and RL

- With valid access, run real Jev calls during at least one shared action game, one action-driven game, and one interference role.
- Verify automatic fill for a four-seat match with four, two, and one connected browser players: respectively zero, two, and three Jev seats. Confirm that no Jev requests target human-controlled seats and that game files contain no provider calls or bot scheduling.
- Verify fixed-interval decision opportunities, bounded outstanding requests, applied-action cadence, and clean ownership transfer after disconnect/reconnect. Old AI responses must not affect a seat after a human takes it over.
- Report decision latency distribution, request failures, stale responses, action validity, actual fallback use, model identifiers, and observed game results. Do not equate legal choices with strong play.
- Separately test delay, failure, and stale-response behavior with fixtures, clearly labeled as simulated.
- Run random/scripted baselines and demonstrate the Gymnasium and PettingZoo adapters stepping the same game rules.
- Report a headless throughput measurement, replay agreement, and checks against observation/reward leakage.

### Generation benchmark

- Complete the three held-out creation prompts described in section 12 through the actual product flow using the selected smaller coding model.
- Keep the application running throughout generation. Play each resulting cartridge from the creation screen without a full frontend build, server restart, development hot reload, or manual source edit. Reopen it in a fresh session and verify it remains playable from persisted artifacts.
- Play the resulting games through their UI, including their required multiplayer arrangement.
- Verify every generated game works with keyboard-only gameplay and the shared mobile pad; no generated mouse/touch-specific gameplay code or extra required buttons are allowed.
- Verify generated art is loaded from pinned assets and persists across reopening the game.
- Generate and audition a distinct soundtrack for each benchmark game. Listen to at least three consecutive loop cycles and a real gameplay segment for each; inspect decoded duration/loop points and clipping/silence checks. Record the listening/capture method and any coverage limit; metadata validation alone is not an audible-quality check.
- Demonstrate overlapping code/art/music jobs, playable previews while music is pending, clean soundtrack failure/retry, and reuse after reopening. Verify completed audio creates a new version and does not change an in-progress round or an existing pinned challenge.
- Report time to playable preview, time to finished cartridge, first-pass/repair outcomes, and actual defects found.
- Preserve failed attempts as benchmark evidence. Successful hand-edited games cannot be substituted for pipeline results.

### External dependencies

Implement and validate all independent work when credentials or provider access are unavailable. Fixtures are useful for development, but they do not satisfy live code/image/symbolic-music generation or Jev acceptance. Record the exact unavailable dependency and the remaining check, and request only the access needed. Do not mark the full goal achieved while a required live integration remains unverified. A dedicated audio-native music provider is optional because the required model-generated score/synth path supplies music generation.

## 15. Completion criteria and deliverables

The implementation is complete when:

1. A documented setup starts the frontend, backend, database, and local asset storage; configuration examples contain no secrets.
2. A player can create/join a party, play a pinned or random compatible playlist, use interference, finish a match, and view persisted results.
3. All eight reference games are polished, available through the UI, operate entirely through the five-button keyboard/virtual-pad controller, and pass their gameplay checks.
4. The creation flow generates usable code, artwork, and distinct looping retro music, dynamically compiles/loads immediately playable cartridges without rebuild/restart, supports preview/remix and independent soundtrack generation, and passes the smaller-model benchmark. Interaction sounds and music playback pass the audio checks.
5. The engine automatically fills missing player seats with Jev and controls the required roles through real API calls on a predictable schedule, with measured behavior and honest fallback reporting.
6. Headless execution, deterministic replay, and the documented RL adapters work against the live rules implementation.
7. Required test/playtest evidence exists, and discovered blocking defects have been fixed and rechecked.
8. Remaining limitations are concrete, documented, and consistent with this specification. Required missing integrations are reported as incomplete, not reclassified as optional.

Deliver source code, migrations, original reference-game cartridges and assets, setup/configuration instructions, a concise SDK authoring guide with examples, an architecture note describing actual implementation choices, and a playtest report.

The playtest report must link each acceptance area to commands, fixtures, screenshots or replay evidence, and observed results. Include a completion matrix, browser/network coverage, provider/model details, generation measurements, and unresolved issues. Evidence should distinguish automated rule tests, browser-controlled play, scripted bots, Jev play, and genuine human sessions.

## 16. Suggested build sequence

1. Establish cartridge contract, deterministic runtime, drawing surface, and a headless runner using Toast Catch and Skill Continue.
2. Add rooms, authoritative input/results, Asteroid Scramble, and an end-to-end two-browser match.
3. Add reusable interference/pressure modes, role transitions, and Conveyor Clash.
4. Complete the reference library, styles, asset/audio pipeline, shared sound kit, library/challenge UI, and persistence.
5. Integrate live code/image/music generation, including overlapping soundtrack jobs, and improve authoring ergonomics using the smaller-model benchmark.
6. Integrate Jev and RL adapters using the same observation/action contract.
7. Complete browser, multiplayer, latency, replay, and provider playtesting; fix defects and write the final evidence report.

Refine implementation details when evidence warrants it, and document the reason. Preserve the agreed product behavior and acceptance criteria. The build sequence is guidance rather than an excuse to deliver only the first phase.

## 17. Research basis

The earlier research reviewed descriptions for all 213 original microgames and sampled detailed mechanics; it was not a full playthrough. These references inform the design, while recommendations and acceptance thresholds above are project decisions.

- [Original WarioWare microgame catalogue](https://www.mariowiki.com/List_of_WarioWare,_Inc.:_Mega_Microgame$!_microgames): broad mechanical coverage.
- [Original controls guide](https://gamefaqs.gamespot.com/gba/589714-warioware-inc-mega-microgame/faqs/24737), [Whoop-De-Doodle](https://www.mariowiki.com/Whoop-De-Doodle), [Mirror Mirror](https://www.mariowiki.com/Mirror_Mirror), [Code Buster](https://www.mariowiki.com/Code_Buster), and [Wario Pinball](https://www.mariowiki.com/Wario_Pinball): directional movement/drawing, timed action, sequences, and separate control functions using the original D-pad and A button.
- [Nintendo: D.I.Y. and combining essential functions](https://iwataasks.nintendo.com/interviews/ds/diy/0/2/): a constrained, composable creation system.
- [Nintendo: sharing and remixing microgames](https://www.nintendo.com/en-gb/Iwata-Asks/Iwata-Asks-WarioWare-D-I-Y-/Iwata-Asks-WarioWare-D-I-Y-/4-Sharing-New-Microgames/4-Sharing-New-Microgames-215173.html): inspectable examples and reuse.
- [Outta My Way](https://www.mariowiki.com/Outta_My_Way_%28multiplayer_mode%29) and [Balloon Bang](https://www.mariowiki.com/Balloon_Bang_%28WarioWare%2C_Inc.%3A_Mega_Party_Game%24%21%29): interference around microgames in Mega Party Game$!.
- [Jev Choice documentation](https://docs.typesafe.ai/primitives/choice) and [TypeSafe launch report](https://typesafe.ai/blog/introducing-system-one-models-and-jev): typed decisions and vendor-reported latency; live performance still requires measurement.
- [Colyseus state synchronization](https://docs.colyseus.io/state) and [fixed-step input](https://docs.colyseus.io/netcode/server-input): authoritative rooms and input processing.
- [QuickJS/WebAssembly bindings](https://github.com/justjake/quickjs-emscripten) and [Node VM documentation](https://nodejs.org/api/vm.html): execution options and isolation boundaries.
- [Canvas image smoothing](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingEnabled): crisp pixel-art rendering.
- [Web Audio looping](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loop), [audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices), and [AudioContext resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume): loop playback, user activation, and engine-owned audio lifecycle.
- [Multitouch input](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Multi-touch_interaction) and [keyboard repeat](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat): platform input behavior that the engine must normalize.
- [Gymnasium environment API](https://gymnasium.farama.org/api/env/), [PettingZoo parallel API](https://pettingzoo.farama.org/api/parallel/), and [AEC API](https://pettingzoo.farama.org/api/aec/): single- and multi-agent environment interfaces.


## September 22: multiplayer variety and controller context

Add two original-art cartridges inspired by the multiplayer mechanics in WarioWare, Inc.: Mega Party Game$!:

- **Nose Dive:** 2–4 simultaneous players launch two fingers from their colored corners toward a rotating nose. Launch travel time requires anticipation; misses recoil and briefly slow the shared nose. First clean pick wins, with same-tick ties allowed and a bounded timeout. One action button, with release between launches.
- **Crawl for Gold:** 2–4 simultaneous crawlers race along lanes. Press at full arm extension, keep holding through the pull, then release before reaching again. Early presses, rapid taps and premature releases stumble. Seven strides win; simultaneous finishes tie. One action button; all scores and prompts stay in the cabinet.

Both use original drawings, interaction cues and distinct authored retro loops. Apply the existing deterministic replay and 100-episode-per-cartridge checks. Browser inspection must include real game rendering and ordinary controller input; protocol or headless holds do not establish physical touch coverage.

Jev remains an engine service. Each seat's request includes the pinned cartridge's rule source (drawing/HUD/audio declarations omitted), an optional precise public `meta.rules` rulebook, current filtered observation, visible history, own entity highlights, own HUD, held controls and simulation/cadence/latency context. Source is reference data; no model output runs as code. Decisions are bounded five-button states, with explicit fresh-press/keep-holding/release meanings. Preserve human-seat suppression, fixed opportunities, one outstanding request per seat, global concurrency, stale-response rejection, fallback labels and replayed input edges. Do not pass the raw engine snapshot, RNG seed or hidden answers. Compare live provider decisions with the former description-only request and record weak games as well as improvements.

Creation should reveal artwork as it arrives, start a ready soundtrack through the shared audio engine, then show the actual game preview and launch a newly created solo-session cartridge automatically. Respect mute, background state, Escape/options and browser audio unlock. Reopened completed jobs stay available to inspect/play; party creation adds to the current party instead of unexpectedly leaving it.

Gameplay references: [Pick the Rotating Nose / Grab the Trophy guide](https://gamefaqs.gamespot.com/gamecube/918882-warioware-inc-mega-party-game/faqs/29816), [Mega Party Game$! multiplayer descriptions](https://gamefaqs.gamespot.com/gamecube/918882-warioware-inc-mega-party-game/faqs/26891). These are mechanic references, not copied art or code.
