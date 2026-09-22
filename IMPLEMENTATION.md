# Implementation ledger

Source of truth: SPEC.md and GOAL.md. This ledger records progress; it does not narrow acceptance.

## Stages

- [x] Deterministic five-button SDK, command renderer, sandbox/compiler, input and replay tests. Initial tests pass; broader browser coverage remains below.
- [ ] All eight reference cartridges, reusable race/interference/pressure modes, 100 episodes each.
- [ ] Authoritative rooms, guest sessions, challenges, durable results, browser UI and mobile pad.
- [ ] Shared sound kit, distinct loops, music generation and playback checks.
- [ ] Live code/image/music pipeline, bounded repair, immutable playable versions and remixes.
- [ ] Engine-managed live Jev scheduling, seat handoff, latency/fallback evidence.
- [ ] RL bridge with Gymnasium and PettingZoo wrappers and baselines.
- [ ] Browser wins/losses, three multiplayer sessions, network/recovery/viewport coverage.
- [ ] Three held-out smaller-model UI generations with art/music and browser playtests.
- [ ] Setup, architecture, SDK guide, evidence-linked playtest completion matrix.

## Decisions

- Start with a compact explicit WebSocket protocol rather than Colyseus. Generated player views are arbitrary validated JSON, so schema synchronization adds little initially. Membership, lifecycle, rate limits and stale-message validation remain mandatory engine responsibilities.
- Use PostgreSQL SQL with an embedded PGlite local default and optional external PostgreSQL adapter. This keeps a complete local setup independent of Docker availability while preserving durable relational storage.
- All cartridge execution occurs in QuickJS, inside a separate process on the server and worker in the browser. The compiler is also a separate bounded process. No cartridge is evaluated as host JavaScript.

## Evidence

Initial implementation is runnable. All 67 Node tests passed after checkpoint/statistics, connection handling, drawing/image bounds, hostile-runtime probes, creation admission/deadlines/resource limits, shared feedback, replay backpressure, Asteroid short-tap/impact-coordinate fixes and SDK control helpers. Every reference game completed 100 headless episodes with representative matching replay/restore hashes; Asteroid received focused additional 100-episode runs after both fixes. The official Gymnasium and both PettingZoo API checks were rerun successfully. See PLAYTEST.md and evidence/ for exact scope.

The first end-user creation attempt, Moon Laundromat, produced code after one repair and generated artwork; music failed validation. Its draft played in the browser. The attempt was interrupted by frontend development hot reload and does not count toward the required uninterrupted three-game benchmark. Its prompts, attempted source, timings and failure are preserved in evidence/generation/30317daa841211a615aeb77d.json.

The full goal remains incomplete: remaining-game browser wins/failures, mobile multitouch, three completed generated-game benchmarks, reference media scene review, loop listening, broader latency/failure checks, and remaining product polish are still required. Three independent-browser mixed parties and browser 4/2/1 occupancy now pass; this does not replace device testing or the other acceptance criteria. Continue from this implementation, not from a smaller redefinition of the spec.

## Next concrete work

1. Clock synchronization, bounded timing-window correction and public sweep projection now pass measured local/100/200 ms protocol checks. Finish browser timing/audio and movement presentation checks; do not imply that all games receive generic rollback or equal high-latency turn opportunities.
2. Puddle Post's focused layout repair now passes desktop/390 px scene inspection and normal no-input endings. Exact art/music reuse and identical rule callbacks were checked for the final repair; winning keyboard/touch play remains. Lantern Ledger's corrected turn-based remix displays the active player and artwork and ends normally; all attempts remain recorded. Firefly's live rules repair and draw-only refinement now pass keyboard success/failure, 390 px rendering and separate-browser reopening; all six new recordings replay exactly, and its exact media and non-draw source reuse are audited.
3. Keyboard success/failure now passes for Asteroid, Conveyor, Cup, Odd Snack, Patchwork and Skill Continue. Cup/Odd wins use choices learned from visible post-match replay. Finish Toast/Umbrella played wins and held steering, all benchmark games, mobile/controller parity, wider recovery cases, secondary-engine coverage, and audible loop auditions. Three mixed parties with two independent browsers plus two Jev seats are verified.
4. Music-only preview/final pinning, two cached-music remixes, and a real failed-soundtrack retry now pass browser and saved-record checks. Complete audible loop and gameplay auditions; signal validation and rendering are not listening evidence.
5. The isolated Playwright test-session authorization question remains pending. Do not treat protocol clients or clicks as browser keyboard/multitouch evidence. CUA remains the authorized UI tool.
6. Score distributions, medians, control-method filters, attempt completion and replay/rematch analytics now have targeted tests and browser evidence. Continue broader hostile-runtime boundaries, renderer polish, timing cues under latency and the remaining SDK ergonomics against SPEC.md; do not narrow acceptance. Recorded-time replay supports pinned music and forward cues; browser pause/rewind/perspective/speed and exact-finish verification passed, without an audible-quality claim.
7. Socket authentication/commands and room operations now serialize; heartbeat and idle cleanup are implemented. Real protocol checks passed host transfer, session replacement, heartbeat timeout and reconnection. Graceful browser shutdown and an isolated production-server SIGKILL preserve checkpoints and completed scores with exact replays. A real Chrome reload in a two-browser party now verifies seat recovery and host transfer; broader failure cases remain.

Recent audio work: important cues preempt ordinary effects at the voice cap; bounded pitch/timbre variants and three sound packs are available; background feedback is suppressed; saved WAV gains/loop boundaries are honored. Twelve live-generated WAVs passed decoded signal checks, not listening tests. See `evidence/audio/` and PLAYTEST.md.

Seven three-cycle soundtrack clips and review prompts are prepared locally in `evidence/audio/model-review/`. Automatic approval review rejected uploading a clip to OpenAI for perceptual review because existing generation/test authorization did not specifically cover that export. A user approval question is pending. No clips were sent and no model reviews were performed; do not run `scripts/review-loop-audio.ts` without that approval (its `AUDIO_REVIEW_PREPARE_ONLY=1` path is local-only).

Party controls expose random duration/control/family filters, live compatible counts, per-seat Jev/practice selection, bot addition/removal, queue ordering, and creation without leaving a lobby. A live browser host plus a protocol peer remained connected during Moon Laundromat soundtrack retry `bf0f76b4d0ebda5811090a5f`. Its ready version entered the existing queue without restart/rebuild, then played with a Jev seat. An edited follow-up created a different challenge; three round replays matched exactly. See `evidence/party/flow-report.json`; subsequent independent-browser coverage is recorded below. Real touch remains unverified.

Match persistence now records participants at start, checkpoints every five seconds during play, and commits completed results plus the replay snapshot atomically. Replay access follows actual match membership, including when a different party follows an existing challenge. A restart preserves partial recordings without scores. See `evidence/recovery/restart-report.json`, `evidence/recovery/browser-report.json`, `tests/checkpoint.test.ts` and the statistics section in PLAYTEST.md.

Presentation hardening now rejects malformed nested drawing arguments and cumulative transform growth, checks image size before decoding/statistics, and restores per-frame Canvas clipping even after an exception. All 12 current saved cartridges passed 6,722 sampled draw buffers across 24 headless runs; three actual-browser canvas pixel checks passed. See `evidence/runtime/saved-draws.json`, the new boundary tests and PLAYTEST.md. Generation admission reserves pending writes and handles failed initial/terminal saves with targeted concurrency tests. Shared work deadlines and provider resource limits now pass the tests and live music follow-up below; visual gameplay review remains. A production runtime profile covers 1/4/8 concurrent four-seat Asteroid rooms, with 13 exact replays; it is not a maximum-capacity claim.

A missing-image fixture now passes actual-browser neutral abort, zero result rows, and same-party recovery to a healthy cartridge. Landscape play exposed a distorted canvas; CSS now preserves the 1.6 aspect ratio while fitting controls beside it. The corrected 844×390 and 360×640 layouts passed screenshot and DOM measurements. Four healthy browser fixture matches replay exactly. See `evidence/recovery/asset-browser-report.json` and PLAYTEST.md; touch and audible quality remain unverified.

Independent-browser report: `evidence/party/browser-report.json` records three input-active full mixed parties plus an explicitly excluded exploratory session, twelve exact round replays, identical pinned challenge versions/settings/seeds, and a Chrome reload with human/Jev/human handoff. The corrected production launcher serves static frontend assets. The latest offline export, after the SDK sequence-authoring follow-up, has 23 generation jobs and 84 completed/interrupted matches. Replay advance requests now allow only one outstanding worker request and retain absolute recorded time; a stalled worker has a 1.5-second watchdog.

Browser occupancy now passes four/two/one connected guests with zero/two/three live Jev seats. Four independent guest identities use Chrome/IAB with separate localhost/127.0.0.1 origin storage. Three pinned Asteroid rematches replay exactly, and no connected browser seat receives controller opportunities. There are 399 recorded `jev-1.13.0` responses, no fallback in these runs, 56 skipped outstanding opportunities and four stale responses. See `evidence/party/browser-occupancy.json`; this does not measure genuine human skill, touch or a second browser engine.

Paired RL report: `evidence/rl/baselines.json` contains 384 episodes on 16 new seeds per game, comparing idle/random/scripted p0 against fixed scripted opponents. All terminate, reward accounting matches the documented version and Cup observations omit hidden answers. Six games show a clear scripted advantage in this limited evaluation; Cup is mixed and Patchwork's generic script is worse than random. No tuning, training, genuine human measurement or live Jev ranking is claimed. See `rl/README.md` for reproducibility and coverage limits.

Generation now shares a configurable five-minute work deadline across branches/repairs/compiler, reserves cumulative call/input/output/image allowances before dispatch, fences terminal job records, and bounds the completed cache to 32 jobs. Transaction guards roll back publication on expiry before commit; admission and final persistence are explicitly outside the work deadline. All 49 tests, type-check and production build pass. Live soundtrack-only job `491f23e80c9b440c74ad5857` finishes in 27.301 seconds with two actual model requests, exact code/art/runtime reuse and a new signal-valid loop. Immediate IAB play and separate Chrome reopening complete with exact replays, without rebuilding/restarting during the creation-to-play flow. See `evidence/generation/creation-budget-live.json`; audible listening remains unfinished.

Shared semantic feedback now adds bounded particles and optional reaction text to live and replay canvases, plus authoritative-score pulses. Duplicates, background/transition clearing, independent perspectives, obscured views and reduced motion have targeted tests and an actual-canvas fixture. Live Asteroid match `e66e1e5f32b3d6b38ff59535` shows hit text and score reactions; its replay passes pause/rewind/4x finish. Asteroid now emits coordinates before moving destroyed rocks offscreen; 31 visible impacts are checked against actual rock positions. Old/new rule snapshots and media remain identical for the recorded inputs. See `evidence/runtime/feedback-presentation.json`. The current source passes 52 tests, type-check, production build and another 100 Asteroid episodes. Test concurrency is capped at four without relaxing sandbox limits.

The SDK now supplies clamped grid/list focus, simulation-clock directional repeat, hold/release timing, angular aiming, projectiles, bounded scheduled spawns and ordered button sequences. State lives in each cartridge's serializable state, so checkpoints and replay retain helper progress. Six targeted tests cover ordered short taps, alias/touch-source/bot repeat parity, opposing directions, exact deadlines, bounded catch-up and QuickJS save/restore. The full 58-test suite, type-check and production build pass. Source-level touch fixtures do not establish real browser multitouch. See `tests/sdk-controls.test.ts` and `docs/SDK.md`.

The SDK animation/expression helpers are now implemented and browser-checked below. The rendered-file music adapter extension point remains an implementation audit item. Shared visual feedback and control helpers do not replace those requirements or the pending browser/device/audio acceptance checks.


Live SDK authoring check: Signal Snacks was generated with gpt-5-mini in 44.220 seconds with overlapping artwork/music. Browser play exposed an action-clock mismatch and undercounted batched presses. Two normal UI remixes fixed rules and labels, retaining exact media; the latter preserves rule callbacks. All 11 recordings replay exactly. Final keyboard completion scores four with four catch events; wrong-key and idle expiry pass, as do 16 headless seeds with all four presses in one tick and snapshot restoration. A 390 px layout and independent Chrome reopening passed. See `evidence/generation/sequence-helpers-live.json` and PLAYTEST.md. This additional game does not replace the three-game benchmark or claim touch/listening acceptance. Authoring prompts now explain clock selection and batched scoring explicitly.

## Arcade direction and simpler launch (September 22)

User steering replaces the earlier configuration-heavy launch and result screens. Random Party now launches four normal-difficulty compatible games directly with a Jev-filled second seat. Cartridge Play chooses the minimum supported seats and launches without a lobby/Ready step. An explicitly built friend playlist still creates an invite lobby. Results show only Play again and Back to arcade; Play again refreshes variation, without exposing seed terminology. Single-game results show the actual cartridge score.

The UI now uses a dark cabinet, local pixel display lettering, whole-site spatial keyboard navigation, explicit form-edit mode, focus confinement/restoration for dialogs and automatic gameplay focus. The fixed 640×400 canvas contains only gameplay for all newly seeded reference cartridges. A shared cabinet supplies score, time, instructions, roles and active-player/progress readouts. Optional `hud(view)` is computed from frozen filtered observations, bounded, and hidden during obstruction; pinned legacy recordings retain their original runtime. Shared optional pose/expression/blink helpers are documented and tested. CRT lines can be disabled; wobble is optional and honors reduced motion.

Current validation: 67 Node tests, TypeScript check, production build, 800 refreshed headless episodes/32 exact replays, four real-canvas presentation checks, and browser observations in `evidence/runtime/arcade-cabinet.json`. Required broader goal coverage remains as listed above; this is not a completion claim.

## Cartridge ratings

Optional post-match star rows now cover each distinct completed cartridge. One authenticated guest contributes one editable vote per game ID; the exact played version is retained, and eligibility comes from that guest's completed human-controller result. Bot-only and unplayed versions are rejected. Public summaries drive average/count labels and a confidence-weighted Top rated view without changing random-party launch. Temp-database tests cover ineligible voters, limits, revisions, loss eligibility, persistence and ranking. See `tests/ratings.test.ts` and `evidence/ratings/browser-report.json`. Browser keyboard voting, vote replacement, reload persistence, Top rated ordering and a 390 px layout passed.


## Latest navigation correction and work in progress

Arrow focus now stays within the current main screen/dialog and excludes header, party-top and cabinet-menu shortcuts. Escape or a click opens shared Options. Browser checks covered library boundaries, nested settings, live play and rating-row boundaries with focus restoration; see the latest PLAYTEST.md section.

The rendered-file music adapter is now wired into GenerationService, with exact-byte/stereo persistence, retry, provider reservation, deadline/cancellation and late-output tests. The symbolic provider remains the production default. See docs/ARCHITECTURE.md and tests/music-generation.test.ts; no optional audio-native provider or perceptual listening result is claimed.


## September 22: creation reveal, new party games and Jev

Creation now reveals ready art and music before code completes, plays the soundtrack through the shared mixer, shows a sandboxed game preview and auto-launches a newly completed cartridge. Star Stamp job `ee29f3b52d7877469ce24a1c` revealed artwork while music/code were pending and automatically reached a normal match result in room `dc0fc5a1`, without rebuilding/restarting during generation. Reopening verified the actual game canvas, focused showcase and “Now playing your soundtrack” state. This confirms playback state, not listening quality. See evidence/generation/creation-reveal.json.

Nose Dive and Crawl for Gold add corner aiming/travel timing and press/hold/release racing. Both have original canvas drawings, distinct authored loops, shared effects, 2–4 seats, ordinary scoring/rating/replay support, and deterministic simultaneous-finish handling. Automated skill beats idle/mashing; 200 headless episodes and eight replay/restore comparisons pass. Browser scenes and Nose keyboard launch were inspected. Genuine held-key/touch play remains separately limited by the existing browser-tool coverage boundary.

Jev receives a precise public rulebook, extracted rule code, filtered state/history, own visible entities/HUD, held controls and timing context through the engine. Full unfiltered source initially regressed timing games, so that experiment is retained separately from the rule-only controller. Paired live-provider reports and their limitations are in evidence/jev and PLAYTEST.md. Results are a small evaluation, not a general playing-strength guarantee. Original-spec acceptance gaps above remain open.


Final validation for this increment: 76 tests, type-check and production build pass. Final four-seat browser party `55b06b2c` has two exact saved replays, 288 Jev responses and no fallback; the human seat has zero controller requests. Nose succeeds; crawler scores are 100/300/300 without a finish. Final paired second-seat checks improve Nose from 1/2 to 2/2 successes and Crawl from 0/200 to 500/500, still below a seven-stride finish. Do not present this small comparison as universal AI competence. See PLAYTEST.md and evidence/party/new-games-browser.json.
