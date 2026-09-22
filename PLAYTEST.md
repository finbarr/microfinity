# Playtest and acceptance report — work in progress

This is an evidence ledger, not a completion claim. The full acceptance criteria in SPEC.md remain binding. No genuine human win-rate, physical-phone feel, or trained RL-policy result has been measured.

## Current evidence

| Area | Evidence | Current conclusion |
|---|---|---|
| TypeScript / production bundle | `npm run check`, `npm run build` | Initial full app build passed; rerun after substantive changes. |
| Inputs | `tests/input.test.ts` | Aliases, OS-repeat-equivalent duplicate keydowns, ordered short taps, opposites, diagonals, cancellation, transition suppression pass at the adapter level. Real device parity remains to test. |
| Determinism / isolation | `tests/runtime.test.ts` | Toast replay and mid-round restore match, draw does not consume rules RNG, denied imports/APIs/types, infinite-loop interrupt, independent child process smoke pass. More hostile-boundary tests remain. |
| Reusable modes | `tests/modes.test.ts` | Unchanged Toast cartridge completes race, obstruction and pressure; hidden obstruction view and common race schedule checked. |
| Eight games / episodes | `evidence/headless-episodes.json`, `npm run test:episodes` | 100 seeded episodes per cartridge, idle/random/scripted baselines, supported player-count boundaries, four difficulties, representative replay and restore hashes. This is not browser win/loss evidence. |
| Storage / restart | `tests/store.test.ts`, `tests/checkpoint.test.ts`, `evidence/recovery/` | Atomic round results and membership-restricted checkpoints survive graceful and abrupt restarts. Partial rounds award no results; active rooms end on restart. |
| Asset failure / layout | `evidence/recovery/asset-browser-report.json`, browser observations below | A real missing-image load aborts neutrally; the same party recovers to a working game. Landscape canvas distortion was fixed and rechecked at 844×390 and 360×640. Layout evidence is not touch coverage. |
| Concurrent rooms | `evidence/runtime/room-capacity.json` | 1/4/8 concurrent four-seat Asteroid rooms complete at approximately real time with 13 exact replays. Local protocol profile excludes browser rendering, providers and remote networking. |
| Statistics | `tests/stats.test.ts`, browser stats panel | Rule/controller partitions, recorded input-method filters, medians, score bins, attempt completion, replay deduplication, rematch and owner-only repair counts pass targeted checks. |
| Music signals / lifecycle | `tests/music.test.ts`, `tests/music-assets.test.ts`, `tests/audio.test.ts`, `evidence/audio/signal-report.json` | All 12 saved generated PCM16 WAVs pass decode, duration, clipping, leading-silence and seam checks. Mixer fixtures cover priority, background suppression, stale async starts and cached loop bounds. Audible listening remains unverified. |
| Party setup | `tests/party-setup.test.ts`, `tests/playlists.test.ts`, `evidence/party/flow-report.json` | Bot slots, host authorization, compatible filters, revision checks, immutable challenge edits and live in-party music retry pass. Browser host plus protocol peer is not independent multi-browser coverage. |
| Independent browser parties | `evidence/party/browser-report.json` | Three complete input-active mixed parties through Chrome and the in-app browser, each with two distinct browser guests and two live Jev seats. Twelve exact round replays including one additional exploratory party. Both browsers use Chromium; no human-group or touch claim. |
| Jev scheduler | `tests/scheduler.test.ts` | Fixed boundaries, bounded outstanding requests, and stale ownership rejection pass with explicitly simulated promises. |
| Live Jev | `evidence/live-rooms/report.json`, `evidence/jev-observation-*.json` | Six protocol scenarios completed with matching replays, including full/partial human-seat occupancy, action-driven play, obstruction roles and reconnect. Programmatic clients are not genuine human/browser sessions. |
| OpenAI access | `evidence/provider-probe.json` | Supplied key successfully enumerates relevant code/image models. Actual first creation described below. |
| Generation budgets | `tests/generation-budget.test.ts`, `tests/generation.test.ts`, `tests/store.test.ts`, `evidence/generation/creation-budget-live.json` | Shared cancellation, provider reservations, late-result rejection, publication rollback, terminal-write fencing and cache bounds pass. A live music-only job finishes within the default budget and plays/reopens without rebuilding. Storage admission/final persistence are outside the work deadline. |
| Shared visual feedback | `tests/feedback.test.ts`, `tests/feedback-data.test.ts`, `evidence/runtime/feedback-presentation.json` | Bounded particles/reaction text and score pulses now work in live play and forward replay. Actual-canvas pixels confirm rendering and reduced-motion suppression; the OS setting was not changed. |
| SDK control helpers | `tests/sdk-controls.test.ts`, `evidence/generation/sequence-helpers-live.json` | Six helper tests plus live smaller-model authoring, two prompted refinements, keyboard win/wrong-key/timeout, 11 exact browser replays and 16 headless seeds. Source-level touch parity and 390 px layout are not genuine multitouch evidence. |
| RL | `evidence/rl-smoke.json`, `evidence/rl/baselines.json` | Official Gymnasium/PettingZoo checkers, bridge snapshot equality and Cup observation exclusions pass. 384 paired idle/random/scripted episodes report rewards and scores; one difficulty/minimum player count, no training or human learnability claim. |

## Exploratory browser session

Operated through the Codex in-app browser, using the normal UI. This was agent-operated, not a genuine human play session.

1. Opened arcade, inspected the rendered layout, selected Toast Catch, created a solo room, and started a round.
2. Saw procedural scene, timer, score, and controller; it reached normal match results with no browser warnings/errors captured. Primarily a no-input/failure smoke; does not establish a successful played win.
3. Inspected 390×844 layout. DOM measurements were `innerWidth=390`, root/client/scroll width all 390, with no horizontal overflow. This is viewport emulation, not touch testing or physical-device coverage.
4. Submitted the **Moon Laundromat** prompt through the creation UI. Requested a new solo heat-management mechanic, generated washing-machine art, and retro music. The saved job shows code succeeded after one automatic repair and image generation succeeded; **music failed**. A playable draft appeared in the library and was opened through the normal practice flow. The loop used in that preview was a stock fallback, not successfully generated music.
5. Started the generated game in the running backend. Its artwork, focus indicator, meters, countdown and scoring rendered; it reached match results. No captured browser warning/error in that game view. The screenshot exposed an overly long decimal score in the sidebar; number formatting was fixed centrally.

The first creation is **exploratory and incomplete**, not an accepted held-out benchmark: music failed, and an unrelated frontend code edit triggered development hot reload while its job ran. No generated source was manually edited, and the backend did not restart during creation/play, but the full no-HMR benchmark condition was not met. The code branch needed one repair (readonly inferred state, unavailable context property, nullable stroke). A playable preview was ready after about 57.4 seconds. See `evidence/generation/30317daa841211a615aeb77d.json` for original attempts, timings, models and failure. Keep this attempt and run the required three fresh prompts against a production build that remains running throughout.

## Completion matrix

| SPEC criterion | Status | Outstanding evidence/work |
|---|---|---|
| 1. Runnable setup, backend, database, assets | Local production build verified | Production app served the generation benchmark; external PostgreSQL adapter not yet exercised. |
| 2. Parties, pinned/random playlists, interference, persisted results | Partial | Three independent-browser mixed sessions, pinned challenge follow-up, reconnect and consistent results now pass. Wider faults and device feel remain. Compatible playlists, host/seat recovery, score/control partitions, statistics, private replays and restart checkpoints have targeted evidence. |
| 3. Eight polished five-button games | Partial | Keyboard success/failure is verified for Asteroid, Conveyor, Cup, Odd Snack, Patchwork and Skill Continue; Cup/Odd wins use learned fixed challenges. Toast/Umbrella need played wins and held steering. All games still need virtual-pad and full presentation review. |
| 4. Live code/art/music generation | Partial | Three uninterrupted held-out smaller-model UI generations, repair/latency evidence, reopen/remix/music-only UI, provisional/failure/retry/version tests, generated reference loops, audible loop auditions. |
| 5. Engine Jev with measured behavior | Substantial integration verified | Actual browser 4/2/1 occupancy now produces 0/2/3 Jev seats, with zero provider opportunities for continuously connected browser seats. Live action-driven/interference roles, browser reconnect, fixed-interval scheduling and stale/failure fixtures also pass; broader fairness/strength measurements remain. |
| 6. Headless / replay / RL | Substantial implementation verified | More replay sessions and baseline analysis; export generated immutable bundles and document throughput limits. |
| 7. Required playtesting | In progress | Protocol timing at measured 100/200 ms RTT with jitter/stalls and malformed/out-of-role messages now pass. Browser/viewport/touch/audio/recovery cases and second browser engine remain. |
| 8. Limitations and deliverables | In progress | Keep SDK/setup/architecture current; final requirement-by-requirement completion audit. |

## Known limits and next checks

- Current browser-control API supports discrete key presses but has no documented key-hold or independent multitouch interface. A request to use isolated Playwright test sessions is pending. No mouse clicks on the pad are represented as touch evidence.
- Timing inputs now use server-owned clock probes and bounded, validated input-age correction for explicitly supported linear timing windows. Public sweep projection smooths presentation; generic movement prediction and broader browser timing checks remain. Higher RTT still reduces completed turns in a fixed-duration relay.
- Standard loops have not been audibly auditioned. Signal-level tests are insufficient for musical quality.
- Toast Catch, Asteroid Scramble, and Umbrella Panic now have real image-model assets and model-generated music. Their scene composition and audible quality still need full browser/listening checks.
- Generated visual validation currently typechecks/draws/preflights and normalizes images; full screenshot readability/overlap assessment still relies on playtesting.
- Creation history, remixing, artwork reuse, music-only regeneration and media-only regeneration are implemented. An observed remix failure revealed that the previous cartridge was unnecessarily revalidated before it could be repaired; that fix was rechecked in the live UI. A later remix drifted from turn-based to realtime; preserving or explicitly selecting the original format fixed the next attempt.
- Persistence tests use isolated temporary PGlite databases. Never open the live PGlite directory in a second process while the server owns it.

## Shared visual feedback follow-up

`npm run check`, all **52 Node tests**, and `npm run build` pass. The suite now runs at most four test files concurrently after a default-parallel run encountered the existing sandbox wall-time watchdog; runtime CPU/memory/deadline limits were not relaxed. New checks cover deduplication, expiration, 24-burst bounds, transition/rewind scopes, background drops, independent/race perspectives, obstruction suppression, deterministic presentation, text bounds, invalid kinds and canvas-state restoration. Trusted feedback identity and bounded sound-variant coverage remain in `tests/feedback-data.test.ts`.

The actual-browser renderer fixture now passes four checks, including visible pixel changes after drawing a hit and unchanged pixels when reduced motion is passed to the presentation layer. Its static 120 ms sample was inspected for catch/hit/miss appearance. This tests the rendering branch; it does not claim that an OS preference change was exercised.

Normal IAB practice match `e66e1e5f32b3d6b38ff59535`, room `ff5852a3`, used one keyboard guest and one scripted bot. Live screenshots showed an impact `+1` and the authoritative score pulse. The browser replay displayed the same response, paused, rewound, and completed at 4× with the exact-finish confirmation. No browser warnings/errors were captured. Scores were 1/failure for the keyboard guest and 35/success for the scripted bot; this is not a new human win or bot-strength benchmark.

Asteroid's previous hit feedback used a projectile coordinate after moving it offscreen, so effects would appear at the top rather than at impact. New version `daf9c51ddf22657758576803692a43d7c8f2fd777bd5a02f43716f033027f519` records actual impact coordinates. The offline audit verifies 31 visible hits, all per-tick scores/outcomes and the final rule snapshot against the previous pinned version, plus exact artwork/music reuse. Five other hits occurred above the viewport; optional visual bursts intentionally skip offscreen positions. The revised game also completed **100 episodes / 108,000 steps**, four exact replays, four restores and 360 draw samples (`evidence/headless-episodes-asteroid-scramble.json`).

Reproduce the saved-match audit with `node --import tsx scripts/check-feedback-presentation.ts` only while the local server is stopped. The report is `evidence/runtime/feedback-presentation.json`. Audio listening, true multitouch, system-level reduced-motion toggling and broader presentation acceptance remain unfinished.

## Generation deadlines and resource limits

After this change, `npm run check`, all **49 Node tests**, and `npm run build` passed. The targeted fixtures demonstrate: SDK fetch receives the shared abort signal; a non-cancellable late adapter cannot publish; a timed-out job retains its already-published draft and releases admission; compilation can be cancelled and a later compilation succeeds; reservations reject excess input bytes, calls, output tokens and images before dispatch; game/version inserts roll back on expiry before commit; late progress cannot replace a terminal job record; and evicted jobs remain owner-accessible in durable history. These are explicitly fixture-based deadline/failure checks, not claims about a deliberately exhausted live provider request.

Live soundtrack-only job `491f23e80c9b440c74ad5857` used `gpt-5-mini-2025-08-07` for the brief and symbolic score. It finished in **27.301 seconds of budgeted work**, reserving two requests, 3,766 request-body bytes and 8,500 output tokens, with no image call or score repair. Limits were 300 seconds, seven calls, 300,000 request bytes and 54,000 output tokens. Reservations are allowances, not actual token consumption or dollar charges; returned usage is retained in the report.

The finished version `40000f8e6cc9a3b31765d1e39824915ae9fa90d3b8e786b83cd0be4e4cca730a` preserves Firefly's exact source, compiled module, metadata, runtime, artwork and interaction-sound configuration. It contains a new model-generated WAV with a distinct hash and passing decoded signal checks. Browser submission → immediate IAB play → separate Chrome library reopening used a continuously running production server, with no intervening rebuild, restart, HMR or cartridge source edit. Matches `f7904b40ce4bd6f4738d3309` (18 Space presses, score 2) and `c7933cc2f13b7dc1d39d67e8` (one Space press, score 1) ended in ordinary rule-defined failure and replay exactly. This is loading/input/persistence evidence, not a new win or listening claim.

Reproduce the offline audit with `node --import tsx scripts/check-generation-budget-live.ts` only after stopping the local server. Evidence: `evidence/generation/creation-budget-live.json` and the individual job/match exports. The work deadline starts after durable admission; terminal persistence is awaited separately. A database commit already in progress is not cancellable, and resource caps do not establish exact invoice charges or refunds for cancelled requests.

## Firefly Fotomat gameplay and contrast repairs

Two focused repairs ran through the product's live smaller-model remix flow, with artwork and soundtrack reuse selected. Both used `gpt-5-mini-2025-08-07` and succeeded on their first code attempt. The same production process remained running from submission through immediate play and separate Chrome-session reopening; there was no build, restart, HMR or manual generated-source edit during these checks.

- Rules repair `17d5b1fe42d3a296d5d15575`: preview **42.410 s**, ready **42.417 s**, version `9541bc566bf57dd46ed38456c624c31c5537ddd2cdb13e19d9e9b3994b56cb97`. The original photo frame was below almost the entire firefly population and allowed repeated scoring of the same target. The repair moves the frame to y=105–235 and respawns one captured fly per successful shutter press. It also uses supported shot/hit/miss feedback. Browser keyboard play reached **6/success** (`82f0219d102da0b19c6f911d`); a same-challenge idle run scored **0/failure** (`01d92fee72198a182fdb659c`), as did a separate Chrome reopening (`ebd39bd26815d789cc0a3386`). The pale scene still had poor target contrast, so this intermediate version is preserved as an imperfect attempt.
- Drawing refinement `6b37968f4beb675b3f7e6d2d`: preview **50.690 s**, ready **50.693 s**, version `325cb5673f3e0d69916699bb27d3b28296756f581aad40f2b904a65c02db1174`. A dark night scene makes the bright targets and photo frame legible. The generated camera, progress, cooldown and controls rendered at **390×844** with the pad below the scene. That keyboard run scored **3/failure** (`cdbc31afef56e44eecb6fc78`). Reopening the saved version in Chrome and using six ordinary Space taps scored **6/success** (`4b73474599e074dc27060725`); the same challenge with no input scored **0/failure** (`71cf02ad1b8e2d820d56f00a`). No Chrome warnings/errors were captured during these checks. Viewport overrides were reset afterward.

`node --import tsx scripts/check-firefly-repair.ts` verifies all six saved matches and exact replays, matching persisted scores, no Jev opportunities for the solo connected players, and identical assets/music including provenance across both repairs. TypeScript normalization confirms **all source outside `draw` is unchanged** in the second repair; metadata and audio selections also match. Both published repairs are ready versions. The old draft-marked original artifact remains immutable.

Report: `evidence/generation/firefly-repair-report.json`; original and repaired job records and match recordings remain in `evidence/`. The export at this checkpoint contains **19 generation jobs and 65 completed/interrupted matches**. These tests demonstrate keyboard win/loss, responsive rendering, saved art/music reuse and immediate play. They do not verify held steering, genuine touch, physical devices or audible quality, so the full generation benchmark remains incomplete.

## Production creation benchmark, first pass

These attempts ran in the same production app process (PID 18774), without a frontend build, restart, HMR, or manual generated-source edit between creation and initial browser play. Code, art and music overlapped after the brief. Actual code/music model: `gpt-5-mini-2025-08-07`; image model: `gpt-image-1.5`. All records, including failures, are preserved under `evidence/generation/`.

| Game / job | Preview / ready | Code attempts | Observed result |
|---|---:|---:|---|
| Firefly Fotomat, `1826cdd3e26535c5444c7dd1` | 45.151 / 45.154 s | 2 | Real code/art/music; browser no-input failure and normal results. Winning play and full asset/loop review remain. |
| Puddle Post, `5d9dce8352d71e42125919a0` | None | 3, failed | Artwork/music succeeded; code exhausted repairs (random API, duration property, nullable field typing). |
| Puddle Post retry, `d20b56828f8b56ab850a7b7c` | 53.702 / 53.706 s | 2 | Browser shared arena with one guest and one Jev seat. Generated boat visible. Title/postbox and lower text overlapped; no successful delivery in this session. |
| Lantern Ledger, `9f84062d031214dc78ff9268` | 45.495 / 45.498 s | 2 | Browser action-driven match and same-seed rematch. Keyboard Right×3 then Space earned 3 points; final party points 2–0. A circle hid most sprite artwork, and timeouts did not count toward the promised three turns. The round reached the engine duration limit rather than its intended finish. |

These are **not yet accepted benchmark completions**. They establish live parallel media generation and runtime loading, with recorded defects and missing playtest coverage. All three ready jobs exposed a publication bug: when media completed before code, draft and final versions had identical content hashes and the draft label survived. Publication readiness now participates in the version hash; old pinned artifacts remain immutable. The new check compiles and draws both provisional and finished-asset branches. The SDK now exposes `ctx.duration`, a repeatedly requested and useful authoring property.

Lantern's repair was submitted through the new Remix UI as job `0f3c8cd4e9558ca40b328091`. It failed before generation because the old cartridge's incompatible modifier declaration was revalidated while retrieving artwork names. No source was manually edited. The service now reads existing asset names directly and can repair an old cartridge that fails newer checks. Live retries and their results are recorded below.

## Reference media

`evidence/reference-media.json` records real media jobs for Toast Catch (`a1224b8eaf92d0e47c5f37fe`), Asteroid Scramble (`af372166fd8d2b869d47b3d8`) and Umbrella Panic (`9eaaf1c2b99afecd74775651`). All completed. Rules were reused; artwork and soundtrack generation ran independently. The reference drawing code uses procedural fallback only when the generated sprite is absent. Music is saved as both a symbolic score and a hashed WAV with exact loop metadata. No audible-listening claim is made.

Audio lifecycle tests now cover user activation, duplicate loop/effect suppression, voice limits, gain ducking, transition fades and persisted bounded volume settings. The client preloads and plays the pinned WAV instead of resynthesizing a finished soundtrack with potentially different future synthesizer code. Backgrounding stops playback; resumption uses the current authoritative round offset.

## Live Jev and multiplayer protocol evaluation

`evidence/live-rooms/report.json` and its six match files preserve the actual results. These clients send normal WebSocket inputs using the scripted development controller; despite the server category `human`, they are **automated protocol clients**, not people or browser-controlled keyboard sessions.

| Scenario | Real Jev decisions | Median / p95 latency | Observation |
|---|---:|---:|---|
| Four connected seats, Asteroid | 0 | — | No automated controller drove an occupied seat. |
| Two connected + two Jev, Asteroid | 166 | 152.7 / 231.9 ms | Jev scored 4 and 6; no fallback. |
| One connected + three Jev, Asteroid | 251 | 155.7 / 219.5 ms | Jev scored 4, 5, 6; no fallback. |
| Action-driven Patchwork | 181 | 149.2 / 241.2 ms | Valid calls but weak play; Jev held confirmation repeatedly and scored 0. A follow-up with forced release decisions scored 2; details below. |
| Toast obstruction, both roles | 109 | 137.7 / 193.7 ms | Jev became both interferer and challenger; scored 4; one recorded scripted fallback. |
| Disconnect and return, Asteroid | 20 | 136.3 / 229.8 ms | Seat transferred to Jev and back with new epochs; result marked mixed human/Jev. |

All six matches completed without protocol errors and their accepted-event journals reconstructed exactly the stored final snapshots. Stale responses and skipped opportunities are retained in the records. Model: `jev-1.13.0`; observations were structured player-visible state, not pixels. These results do not establish a competitive policy or human-relative skill.

An earlier browser session produced only neutral Jev actions. `evidence/jev-observation-before.json`, `-after.json`, and `-corrected-mode.json` show the diagnosis: native simultaneous views incorrectly included a wrapper `active` player. Removing that irrelevant field and identifying the controlled player explicitly produced meaningful movement/action decisions. Native/race runtime views now omit it too.

Further implementation fixes have regression coverage: pressure previously decayed below 100 before the burst check; the burst now fires and rotates roles. Feedback from the finishing challenger is preserved across rotation. Renderer requests are bounded to one pending frame, with termination for a hung renderer. New UI parties receive a server-chosen seed instead of sharing the constant 42; live views and public challenge metadata omit it. Fixed challenge replays intentionally retain their recorded seed after the round.

## Corrected turn game and soundtrack publication

- Remix `e2310d9a08d86e0232433260` repaired compilation and reused art, but incorrectly drifted from 2–4-player action-driven play to 1–4-player realtime play. Its view also had placeholder/undefined data and poor contrast. This is a failed quality iteration, not an accepted turn benchmark. Its browser replay (`ba778feeea46d4d7382c5acf`) did reach the UI's verified final-state message.
- The creation flow now preserves the original clock and player range by default, offers explicit format controls, and checks generated metadata against the brief. Strict runtime validation rejects undefined/non-finite/non-JSON state rather than silently losing it during serialization. Role callbacks receive frozen state.
- Corrected remix `a2c2c496096b28cf506c54fd` succeeded on its first code attempt: preview 33.617 s, ready 33.621 s. Normal UI play showed Player/Turn 1/3, readable values and visible lantern sprites. Keyboard Right×2 and Space earned 2 points. Match `9b259e1e48ee2963141ca412` ended normally at 26.34 simulated seconds with Player 2 and Jev 5. Both received the cartridge's positive-score success outcome, and Jev won the party. This shows a remaining distinction between success and outright win, not a human win-rate result.
- Music-only job `03c3c277949741cf3dd0a65a` finished in 21.456 s. A pending preview was observed, but the entered room used the final version: it does not prove pending-music play. The later `d50de3185f58e1d3f3850fe2` also finished before the attempted preview click; both attempts are retained.
- Music-only job `a5d52c7bdc68b9562a83adf0` offered a preview at **6.748 s**, while music was visibly working. The browser opened room `24821ea3` and started the draft. Its canvas showed the generated lantern art and the label **Draft preview · stock soundtrack**. The draft match `e6b61c57c94ca5a91b7e6d65` was created **14.575 s before music completed**. The job finished at **35.243 s**. The running draft and its pinned challenge retained the same version and null custom-music manifest after completion.
- Reloading the creation URL and choosing Play opened the finished version in room `4a2df944`, match `183157f32e765d76d8435c23`, without a draft badge. The round completed; no browser warnings/errors were captured. The production application remained running, with no rebuild, restart, HMR or source edit during either job's creation-to-play interval.

`evidence/audio/pinning-report.json` checks the actual saved original, draft, final, two matches and challenge: source, compiled code, runtime hash, metadata and artwork remain identical; draft and finished versions differ; only the finished version contains the new generated WAV. This was browser-controlled play, not an audible audition or physical-device test.

The generation service now publishes ready status together with its finished-version pointer. A previously possible transient state could label a finished version as a draft. `tests/generation.test.ts` uses clearly labeled provider fixtures to check pending preview, immutable publication, two failed music attempts, successful retry, and a rule remix reusing its exact saved soundtrack without another music call. The UI's independent artwork and soundtrack reuse checkboxes were inspected; live end-to-end cached remix testing remains.

## Follow-up Jev and current regressions

After requiring a release decision between discrete confirmations, the live Patchwork follow-up `f6e0dc34a6474ae5c2a3ecce` finished in 67.8 s with scores 2–2. It made 140 Jev decisions, median 152.49 ms and p95 285.09 ms, without fallback; replay matched. Most decisions still held a direction, so this is improved input behavior rather than strong puzzle play. See `evidence/live-rooms/report-action-driven-jev.json`.

The full Node suite passed **23 tests**. Subsequent background-audio and cached-loop-boundary changes passed their three affected audio tests and TypeScript checking. The production bundle builds. The latest 100 episodes for each of the eight reference cartridges passed, including four replay reconstructions and representative restores per cartridge. Measured rule throughput ranges from about 820 steps/s (Patchwork) to 8,311 steps/s (Toast); see `evidence/headless-episodes.json`. The Gymnasium and PettingZoo API checks were rerun successfully after the strict-state/audio-event changes; PettingZoo warns about player naming convention and absent `render()`. These adapters are intentionally headless; no training was performed.

Audio runtime additions include effect priority at the 12-voice cap, confirmation/jump/round-completion cues, three sound packs, bounded pitch/timbre variants, manifest gain, and suppression of new feedback while backgrounded. Skill Continue emits accelerating pulse cues from its authoritative sweep, independently of music tempo. Eleven real-generated saved WAVs pass `scripts/audit-music.ts`; decoded musical duration error is at most one sample. These checks do **not** establish pleasant melodies, audible seamlessness or real-device audio timing. Required three-cycle listening, gameplay listening and multitouch/second-engine tests remain open.

## Measured timing and protocol boundaries

`scripts/network-checks.ts` runs two automated WebSocket clients through full Skill Continue matches. Each direction uses an ordered FIFO delivery queue: 50 or 100 ms one-way delay, seeded ±20 ms jitter where specified, and an extra 220 ms stall every 80 messages in the stall condition. The second client's monotonic clock is deliberately offset by 37 seconds. Clients act only on their permitted public sweep state and the clock estimate sent by the server. These are application-layer delay tests, not kernel/WAN emulation, browser key presses or human sessions.

Latest full run: `evidence/network/report.json`; each named match also has a separate file containing its report and complete recording.

| Condition | Measured individual probe RTT median / p95 | Scores | Match |
| --- | --- | --- | --- |
| Local | 0.68 / 1.63 ms | 26, 25 | `bb23398ae04421afd4d76e5d` |
| Nominal 100 ms | 102.76 / 105.13 ms | 24, 23 | `ec34500f88afb64d95bfd43a` |
| Nominal 200 ms with jitter | 205.68 / 231.85 ms | 22, 20 | `0e5884e6551a1d428d1191f6` |
| 200 ms, jitter and delivery stalls | 208.77 / 228.21 ms | 21, 21 | `c4c829e632c2d61533400df9` |
| 200 ms with jitter, input correction disabled | 203.31 / 222.83 ms | 3, 3 | `de26a4c12a7d0fd34c65e2d3` |

All five completed and replayed to their exact saved snapshots. The largest applied correction was 129.26 ms, below the 150 ms hard cap. No sequence, future-time or stale-time rejection occurred in this final run. Reported stale-ownership rejections are releases arriving after the old turn's epoch ended; held controls are cleared when roles change. Network counters currently cover the connection lifetime; rejected-reason counters reset each round.

Clock probes use a low-RTT sample to estimate offset and report half-RTT uncertainty. This does not prove symmetric network paths. The server accepts only bounded monotonic timestamp claims; the cartridge cannot supply its own input age. `timedPress` corrects a declared linear sweep, and `gfx.project` projects declared public motion by at most 250 ms without advancing rules. Higher RTT still delays the start of the following turn and yields fewer turn opportunities during a fixed-duration match. The results do not establish equal fairness across latency or input devices. Audible cue alignment, mobile timing and generic movement reconciliation remain open.

Earlier failures remain in `evidence/network/`. `report-before-sequence-fix.json` exposed inconsistent sequence counters across role epochs, causing scores of 1–1. Counters now reset with ownership epochs. `report-after-sequence-fix-estimated-rtt.json` used minimum-RTT estimates; the current report measures individual probes. `report-before-fifo-transport.json` exposed rare reordering from independent harness timers; the final harness uses an actual FIFO delivery queue.

`scripts/protocol-negative.ts` passed ten grouped checks against the rebuilt production server, match `36a4b025cee8e7b76fc2dcf1` (`evidence/network/protocol-boundaries.json`). Waiting-seat taps cannot advance the action clock. Malformed JSON, unsupported buttons, forged trusted ages, oversized batches, stale ownership, duplicate sequences and future/late times do not produce unauthorized actions. Clients cannot submit scores or outcomes, another member cannot start as host, and strangers cannot join an active match or read a private replay. A renderer failure during play aborts without completed-round score credit. This verifies normal wire boundaries, not every hostile runtime case.

After these changes, the complete 26-test suite, production build, 800 headless episodes (100 per reference), representative replay/restores and the official Gymnasium/PettingZoo checks passed again. Rule throughput ranged from 842 to 8,413 steps/s in this run. The subsequent replay-audio change added a 27th test; its five affected audio/replay tests and TypeScript check passed. Those tests distinguish original action delays, forward feedback, silent seeking, bounded loop speed and stale asynchronous starts. All evidence exports now include 14 generation records and 38 completed/interrupted matches.

## Replay and connection lifecycle follow-up

The saved Lantern Ledger match `183157f32e765d76d8435c23` was reopened in the in-app browser after a production rebuild. Playback at 1× reached the exact recorded finish; replay-again, pause at 6.6 seconds, switching to Jev's perspective, 2× playback, restart and keyboard End on the progress slider were verified. The canvas showed the generated lantern artwork, turn and player labels. No browser warnings/errors were captured. Pinned music and forward-only sound cues are wired into this path and pass mixer/transport tests; this browser observation is not a listening claim.

The subsequent complete Node suite passed **31 tests**, including socket queue ordering, closed-authentication seat prevention, queue caps, ping/pong expiry, serialized room starts, host/seat transfer and idle expiration. TypeScript checking and the production build passed.

`scripts/room-lifecycle-checks.ts` passed against the live local production server, match `e87e83399a131bbaf095fd8a`. Its real WebSocket clients checked host departure/return, repeated start commands, replacing a same-guest connection (old socket closed with 4001), missing protocol pong while continuing application traffic, and reconnecting to the original seat. The unresponsive socket terminated after **29,984.70 ms**; its responding peer stayed connected. The room used scripted fallback seats for this test, not Jev. See `evidence/network/lifecycle-e87e83399a131bbaf095fd8a.json`.

After serializing room operations, the 200 ms+jitter timing regression completed with scores **22, 21**, measured median/p95 RTT **210.27 / 236.22 ms**, and an exact replay (`1f46ee094e0f9f645675b208`, `evidence/network/report-selected.json`). The full five-condition report is preserved separately. The ten protocol-boundary checks also passed again (`f0c6d7b4fa70cb77cb4537f9`, current `evidence/network/protocol-boundaries.json`); the earlier `36a4b025cee8e7b76fc2dcf1` recording remains under `evidence/matches/`.

Seven local three-cycle WAV clips and prompts are prepared under `evidence/audio/model-review/`. An attempted OpenAI audio-input review was rejected by automatic approval review before the command ran; exporting these nonpublic audio files was not specifically covered by the earlier generation/test authorization. User approval is pending. No audio was uploaded and no model listening result exists. The optional review script defaults to local preparation; remote mode requires explicit approval and `AUDIO_REVIEW_SEND=1`. Its proposed [audio-input API](https://developers.openai.com/api/docs/guides/audio-chat-completions) would provide model judgments, not device or gameplay listening evidence.

## Puddle Post repair and exact media reuse

Two additional remixes were submitted through the creation UI with independent artwork and soundtrack reuse enabled. Both used `gpt-5-mini-2025-08-07`, succeeded on their first code attempt and ran in production without an app build/restart/HMR or manual generated-source edit between request and first browser play.

- `1cc9fb58b585d928647eca47`: preview **39.047 s**, finished **39.050 s**, version `c8345b261a5c2f655aac11206d2c909d8bb8623c367287c5e92573c01b6bca95`. The game played and ended normally (`062af64f87a7cd65bfc0a497`, idle browser player 0/failure, Jev 1/success). Inspection found a remaining draw-order defect: the backdrop erased the header, and white footer text overlapped score chips. Preserve this imperfect attempt.
- `d88f6f116bb378aecbd99a79`: preview **49.608 s**, finished **49.611 s**, version `1c21692d22b10527d96511a06390b318954a05a923a2934dfcffd3583d936aed`. A narrower prompt fixed backdrop ordering, removed redundant footer/score text and added contrasting SPACE hints. The generated boat, player markers and carrying envelopes were visible. Desktop and 390×844 viewport rounds ended normally (`46815db61aba8c85e8d89944`, `a4a75beeedadcb39fea3c680`), both 0–0/failure. No browser warnings/errors were captured. This is layout/no-input evidence, not winning, physical-touch, multitouch or audible acceptance.

`scripts/check-remix-reuse.ts` compares the saved versions and records in `evidence/generation/remix-reuse-report.json`. Both preserve the exact artwork and soundtrack manifest/provenance; the WAV hash remains `c79bc2c5b426c23935c9ffa657afaa11abf685c8614ea2d6e0fb2dcf8fc83adc`, and neither records new art/music model calls. The focused second repair's `init`, `step`, `observe` and `role` callbacks match the preceding version after TypeScript printing with comments removed. The first repair changed `init`; do not claim complete source equality across both remixes. The latest offline export contains **16 generation records and 44 completed/interrupted matches**.

A final 320×740 browser check reopened the saved repair and verified that sound settings remain accessible. Master mute and music volume 0 persisted across reload; the original unmuted / music 0.25 / effects 0.55 preferences were restored. The panel fit the viewport and exposed both volume sliders and Enable sound. Opening the saved game lobby and choosing Back to the arcade now returns to the library. The normal viewport was restored. TypeScript checking and the production build passed after these UI/prompt-guide changes; no browser warnings/errors were captured. This verifies controls and persistence, not the audible output of the device.


## Lobby controls, in-party creation and live soundtrack retry

The production browser flow now exposes random playlist duration, clock, controls and family filters. At 390×844, action-only with a 20-second maximum correctly showed no eligible games and disabled Start. Changing to directional controls, a 15-second maximum and the catch family found two games and disclosed that a request for four would play two without repeats. It created room `5ad355d7` with Toast Catch and Umbrella Panic. Desktop and 390 px dialog layouts were inspected; the 320 px edited lobby had `clientWidth=scrollWidth=320`. These are responsive layout checks, not physical-touch evidence.

In the normal lobby UI, changed a practice bot to Jev, added/removed a bot slot, moved Umbrella before Toast, and removed Umbrella. A separate normal WebSocket test peer joined the party and replaced an empty bot slot. The browser then added a third seat with Jev. It entered the creator without closing either connected seat. `scripts/party-observer.ts` and `evidence/party/observer-5ad355d7.json` record queue changes, creation state, two connected seats, preloading and results. The peer made no gameplay inputs and is not a second browser or a human participant.

Opened the saved failed Moon Laundromat job, whose music branch reported **Invalid note**, and selected **Retry soundtrack only**. Job `bf0f76b4d0ebda5811090a5f` completed with code/art **reused** and music **ready**, using `gpt-5-mini-2025-08-07` for the brief and music. Preview was ready at **7.148 s**, final at **27.312 s**. Returning to the lobby while it ran kept the party intact. Reopening the ready job and choosing **Add to this party** appended immutable version `fe71380cd34c7b9189d1280bd10cbaecfad7847ef8c3653f86b87ed68d846ccc`; the app was not rebuilt, restarted or hot-reloaded between retry and first play. No generated source was edited.

Match `c106339029aeb848aa2b1a34` completed Toast and Moon with the browser host, idle protocol peer and Jev. Both connected slots recorded zero provider opportunities. Jev made 58 decisions in Toast and 70 in Moon (`jev-1.13.0`); it scored 34.08 and succeeded in Moon while both idle connected slots scored 27.4 and failed. This is a controller/integration check, not a successful human-play claim. Both games rendered and ended normally; no browser warnings/errors were captured.

From results, **Change the party** returned to setup. Removing Moon and the now-offline test peer left the browser and Jev. The next match `8b480dd520488ee0a06b5133` completed Toast with scores 1 and 4; both were cartridge failures. The original challenge `e986921e947c` still pins two games and three seats. The edited challenge `75f5320ff0ac` pins one game and two seats, with the same simulation seed. Per-slot bot preferences and original random-selection context were retained.

`scripts/check-party-flow.ts` verifies saved jobs, versions, original/edited challenges, controller records and all three exact replay snapshots. Its first audit deliberately compared runtime identifiers and failed: the old cartridge used legacy label `1.0.0`, whereas the retry stores the content hash. The corrected audit compares actual runtime bytes, which are identical; this is identifier normalization, not a runtime upgrade. Source, compiled code, artwork and game metadata also remain identical. Report: `evidence/party/flow-report.json`.

The browser session exposed two small UI issues: retrying a soundtrack displayed the previous creation mode until reopened, and race mode showed obstruction instructions. The UI now restores the returned job's mode immediately and describes race play correctly. Lobby seat contents now align at the top when bot controls make another seat taller. The 34-test suite passed, including host-only mutation, human-seat protection, stale queue rejection, readiness reset, bot fill/reindexing, creation hold and immutable challenge tests. Typechecking and production build also passed.

Twelve unique saved generated WAVs now pass the decoded signal audit. The new soundtrack has not been audibly auditioned; no audio-review export was performed. The saved failed original remains in the evidence, and this recovery does not retrospectively make that interrupted exploratory generation a held-out benchmark pass.


## Statistics and durable interrupted recordings

The complete suite now passes **37 tests**, and TypeScript checking and the production build pass. New checks distinguish normal losses from technical interruption, exercise score distributions/medians and recorded control methods, deduplicate actual replay viewers, count same-room rematches, and isolate creation/repair summaries to their owner. The checkpoint test forces a result insertion failure and proves that neither partial scores nor changed match points commit.

The normal browser statistics panel was inspected at 390×844. Toast Catch's selected three-player human race group showed two scores of 1, median 1 and one distribution bin. Keyboard-only filtering returned no matching scores; restoring all controls restored the two scores. Existing historical results had no attempt-tracking denominator, which the panel explicitly disclosed. The creator showed 11 finished / 3 failed / 0 working jobs, six automatic code repairs and zero music repairs for that browser guest. These counts are an observed snapshot, not global creator totals.

`scripts/restart-checks.ts` starts production servers with an isolated temporary `DATA_DIR` and uses HTTP/WebSocket clients. It completes one match, then has a different host and friend follow the original author's pinned challenge. After both actual clients acknowledge joining, it kills the test server with SIGKILL during play and reopens the same database. Match `749af7e0689329b802b22c76` recovered a 2.483-second checkpoint from a round last observed at 6.050 seconds: 3.567 seconds of play were beyond the last persisted checkpoint. The replay matched exactly, no partial scores existed, completed results/challenge/version survived, and the unrelated challenge author could not read the new party's replay. The actual friend retained listing/read access. Report: `evidence/recovery/restart-report.json`. The first harness attempt started before its second peer had finished joining; the corrected harness waits for acknowledged membership. This was a harness race, not an observed database durability failure.

Three browser-host/practice-bot Patchwork sessions were also interrupted by graceful shutdown:

- `18821bf6affeaa1a553f55df`: the round had already finished at 53.579 seconds, before the party reached final results. Both completed-round records and Bot 2's two party points survived. Do not classify this as a partial round.
- `368b8da79f49e04cbb6fd858`: a 33.484-second partial recording survived with zero completed results. In the normal replay UI, 4× playback stopped at that endpoint with **Replay matches the saved checkpoint**. Home/End on the progress slider rewound and verified the endpoint again. One distinct replay viewer was recorded.
- `80fb7390ada2a81779852517`: the improved connection UI was checked after an ordinary keyboard action. The 21.918-second partial recording retained no completed scores. Rematch, fresh seeds, party editing and invite sharing were disabled after shutdown; saved replay and challenge actions remained available.

Offline assertions and exact replays for these cases are in `scripts/check-browser-recovery.ts` and `evidence/recovery/browser-report.json`. Reopening an expired room now gives a terminal message instead of an unusable reconnect prompt. A final lobby shutdown (`2f6ab5f3`) verified disabled ready/start/controller/queue actions. An observed narrow-screen overlap between two shutdown notices was fixed; the final 390×844 top-of-page layout has one readable notice and a return-to-arcade action. The recent-party list counts saved partial recordings as recorded rounds.

These checks use an agent-operated browser and protocol fixtures. They do not establish independent-browser multiplayer, physical-device controls, multitouch, audible loop quality or real human win rates. A five-second checkpoint interval is a target; storage stalls can enlarge the unsaved tail. Active rooms are not resumed transparently after process restart. New completion/engagement tracking excludes historical records that lack attempt metadata, and legacy interrupted records without participant evidence are not exposed based solely on challenge ownership.


## Drawing, image and hostile-runtime boundaries

The complete Node suite now passes **41 tests**. The new drawing checks reject wrong argument types, nested extreme coordinates, malformed sprite frames, oversized buffers/text, unbalanced saves and cumulative transform growth. JSON budgets now count UTF-8 bytes. Metadata validation bounds asset names/counts and audio identifiers. Image inputs are checked for base64 size and PNG signature before decoding; pixel count, dimensions, animation/page count and transparency are checked before normalization. Invalid PNG, opaque, over-wide and over-pixel-limit fixtures reject; a valid image normalizes to 256×256 RGBA.

A saved-cartridge compatibility probe fetched the normal public local library/version endpoints and ran two deterministic episodes for each of its 12 current cartridges, with minimum/maximum participants, mellow/wild difficulty, all player views, and both stock/generated-art branches. **6,722 sampled drawing buffers passed**, peaking at 219 commands per frame. The report pins every tested version in `evidence/runtime/saved-draws.json`. This covers command validity and bounded endings, not visual polish or played wins.

An actual browser Canvas fixture (`scripts/renderer-checks.ts`) passed three pixel checks through CUA: top-level clipping does not leak into the next frame, a real drawImage exception restores nested state, and a malformed path rejects before any painting. The first fixture expected an undecoded HTMLImageElement to throw, but this browser silently ignored it. The corrected fixture uses a zero-sized canvas source to trigger the actual native exception and initializes each case independently; all three then reported PASS. No application or cartridge state was injected through browser evaluation.

A malicious step loop was run concurrently with a healthy game in separate runtime processes. The loop was interrupted while the healthy process advanced; a later healthy step also succeeded. A 64 MiB typed-array allocation was rejected by the 16 MiB sandbox budget. A raw-module probe (deliberately bypassing TypeScript's API lint) found process, fetch, require, document and AudioContext undefined, including process lookup through a reflected function constructor. Invalid URL-shaped asset declarations reject at load. These tests demonstrate the specific process/capability limits exercised; they do not claim exhaustive escape analysis or public-host certification.


Launch-mode correction: inspection of the main server log showed that plain `npm start` had used the compiled Node entrypoint with the Vite frontend because `NODE_ENV` was unset. `npm start` now sets production mode in `scripts/start.mjs`; development remains explicit through `npm run dev`. The browser recovery/statistics checks in this follow-up were local UI checks and should not be treated as proof of static production serving. No generation job ran during this follow-up. The separate SIGKILL harness explicitly set production mode and is unaffected. Static serving and the permission-restricted runtime are checked again after the final build.

## Independent-browser parties and production follow-up

The corrected `npm start` launcher served hashed static frontend assets throughout these sessions. Chrome and the Codex in-app browser used different persisted guest identities; both were controlled through CUA using ordinary keyboard events. Short input batches followed visible role labels and screenshots. They were not real people, synthetic protocol peers, or a second rendering engine. No build, restart or hot reload occurred inside a party.

| Match | Sequence | Browser evidence |
|---|---|---|
| `f7ca7241980cc5da23ecbceb` | Asteroid → Odd Snack → Patchwork | Exploratory only. Both guests remained connected, but no browser presses reached a playable role. Out-of-role attempts are recorded. Normal failures and matching results do not count as an active session. |
| `a2f5c62b63c453054a5cf3a0` | Conveyor → Patchwork → Skill Continue | Both browser players scored 6 in Conveyor and 4 in Patchwork, receiving success. In Skill Continue, the in-app player scored 1 and succeeded; Chrome was eliminated. Party totals agreed: 16 / 12 / 3 / 5 in seat order. |
| `7c411a7826ca0b3cb31566cc` | Same pinned sequence | Chrome followed the new direct **Play this challenge** link and hosted a new room; browser guest seats were reversed. Both scored 5 in Conveyor. Chrome reloaded mid-round, retained its seat, and transferred host controls to the other browser. Patchwork yielded a 0-point failure and 2-point success. No browser inputs reached Skill Continue in this attempt. |
| `73d5fd6287c5d1225095b4eb` | Same pinned sequence | Both browsers made conveyor inputs: Chrome scored 5/failure, in-app scored 6/success. Both placed 4 points of patches and succeeded. Each made four recorded action presses in Skill Continue and was eliminated. Shared totals agreed: 9 / 13 / 9 / 5 in seat order. |

`scripts/check-browser-parties.ts 73d5fd6287c5d1225095b4eb` checks all four saved matches offline and writes `evidence/party/browser-report.json`. Exactly **three parties contain accepted gameplay presses from both independent browsers**. All **12 completed rounds replay exactly**, each has four persisted result records, and attempts ended normally. The first and repeated challenge `c97ad83a667d` have identical version lists, settings and per-round seeds. Actual participants own replay access; the browser identities are recorded separately from seat numbers.

Continuously connected browser seats recorded zero controller opportunities/provider calls. The Chrome reconnect in match `7c411a7826ca0b3cb31566cc` recorded human → Jev at tick 1883 and Jev → human at tick 1886; exactly one provider request started during that vacancy. Its Conveyor result correctly carries mixed-controller provenance. Other Jev seats made real `jev-1.13.0` requests, with occasional recorded scripted fallback. No cartridge schedules provider work. The final Chrome warning/error log was empty.

These records provide keyboard success and failure evidence for **Conveyor Clash, Patchwork Pass and Skill Continue**. They do not establish skill consistency, genuine human success rates, actual simultaneous touch, four independently operated browsers, or audible sound quality. The remaining reference and generated-game playtests retain their earlier gaps. Clipboard reads returned empty through the browser tools despite the UI's copy-success state, so clipboard contents are not verified; the direct challenge anchor was followed successfully instead.

The complete suite passed **42 tests** after the creation-admission fix. Capacity is reserved before initial persistence: simultaneous different-owner requests cannot exceed two jobs, duplicate-owner requests cannot overlap, and failed initial writes release reservations without starting providers. A failed terminal write is handled and retried once rather than becoming an unhandled promise rejection; a sustained outage leaves a readable in-memory failure and startup recovery handles the durable working record. The targeted test uses delayed writes and injected storage failures, with fixture model responses only. Typechecking and the production build passed.

All eight reference games were rerun after drawing/runtime hardening: **800 total headless episodes**, with four exact replays and four restored continuations per game (`evidence/headless-episodes.json`). The restricted production runtime smoke passed (`evidence/production-runtime.json`). The current offline export contains **17 generation records and 53 completed/interrupted matches**; no new generation job was created during this follow-up.

Replay worker follow-up: `client/replay-clock.ts` now admits only one advance at a time, matches acknowledgements by request/revision, and uses absolute recorded-time targets. Delayed polls retain elapsed time; a stalled worker is terminated after a 1.5-second active-play budget. The new test covers delayed, stale and duplicate acknowledgements and the timeout. The full suite now passes **43 tests**; TypeScript and build pass. In the final static production browser, match `73d5fd6287c5d1225095b4eb` replayed Conveyor to **32.1 / 32.1 seconds** and Patchwork to **99.2 / 99.2 seconds** at 4×, both displaying **Replay matches the recorded finish**. A mid-play Home rewind stopped playback at zero; changing perspective and replaying reached the exact finish again. No Chrome warnings/errors were captured. This verifies UI/timeline behavior, not an audible audition. The completed Chrome test tab was closed; the in-app arcade remains available.

## Paired offline RL baselines

`node --import tsx scripts/rl-baselines.ts` completed **384 episodes** through the same `HeadlessEnvironment` used by the Python bridge. Each existing idle/random/scripted policy controls p0 on the same 16 new seeds (10000–10015), at normal difficulty and minimum supported player count. Any opponents use the fixed observation-only script. All episodes terminated normally without external truncation. Cumulative rewards matched signed raw-score changes plus the versioned terminal bonus; Cup's filtered views excluded the secret and future swaps. Source, compiled-code and runtime hashes, individual outcomes/rewards and exact coverage are retained in `evidence/rl/baselines.json`.

| Game | Random mean score | Scripted mean score | Scripted beats random on paired seeds |
|---|---:|---:|---:|
| Asteroid Scramble | 6.63 | 26.13 | 16 / 16 |
| Conveyor Clash | 1.94 | 8.13 | 16 / 16 |
| Cup Shuffle | 0.81 | 1.13 | 6 / 16 (6 ties) |
| Odd Snack Out | 0.88 | 4.00 | 16 / 16 |
| Patchwork Pass | 8.19 | 5.00 | 1 / 16 |
| Skill Continue | 0.00 | 22.00 | 16 / 16 |
| Toast Catch | 2.75 | 11.81 | 16 / 16 |
| Umbrella Panic | 2.75 | 12.38 | 16 / 16 |

The current heuristic exploits visible objectives in six games. Cup's generic controller is not a memory expert; Patchwork's generic script is worse than random on 15 paired seeds. These are useful baseline weaknesses, not evidence that the games are unlearnable. No policy was tuned on these seeds and no training was performed. Seed changes need not create independent trajectories in deterministic games. Results are specific to p0, the selected difficulty/count, reacting scripted opponents, and 200 ms simulated decisions with no cloud delay; they do not establish human win rates or live Jev strength.

Measured in-process throughput ranged from **240 to 1,355 decisions/second**, including observations/reward calculation and 12-frame repetition but excluding Python IPC, rendering, database and network. The earlier Python smoke measured about **227 decisions/second**; these are different paths/workloads, not a controlled estimate of IPC overhead. Reward accounting passed, but this does not certify that no game-specific reward exploit exists. Typechecking passed after adding the reproducible baseline script.

## Quick taps and additional keyboard win/loss paths

A short-tap regression reproduced Asteroid Scramble dropping a complete Space press/release inside one engine tick: the input adapter retained the press, but the cartridge checked only the final held state. The cartridge now fires when action is held **or freshly pressed**, subject to the original cooldown. `tests/reference-inputs.test.ts` proves quick taps fire, repeated taps cannot bypass cooldown, and held action retains five shots in the first simulated second. The SDK guide documents this authoring pattern. Updated immutable version `429c1564a19e7d85601c32eb6829568b9a2cfdef53859e27917a2aa2cb350447` preserves the exact generated artwork/music from the preceding version. Existing pinned challenges remain unchanged.

The two independent browser guests then completed these normal-UI sessions:

| Match | Game | Observed keyboard result |
|---|---|---|
| `5d80b95c778dff295c4c7b92` | Asteroid Scramble | 52 short Space taps produced 52 shot events, two hits and success. The idle Chrome guest scored 0/failure. Steering/held-key skill is not established by this test. |
| `97e39e2f622d508c2350a4ea` | Odd Snack Out | A fresh screenshot-driven attempt scored 0/failure; actions arrived after the observed puzzle had changed. |
| `92da6529d16da0861978f26a` | Odd Snack Out | A second attempt started its action batch too late and scored 0/failure. Preserved, not counted as a success. |
| `441e9b11d4c200379d1c28a4` | Odd Snack Out | After reviewing the visible saved puzzles, a same-seed rematch selected all four correctly with keyboard directions/Space. Score 4/success; Chrome's wrong selections scored 0/failure. |
| `95f43ad93b455b76ecb5f9fd` | Cup Shuffle | Both guests let the normal no-input timeout path complete, scoring 0/failure. |
| `4e836ea9e93ee778ce7bc870` | Cup Shuffle | The saved replay visibly revealed final cup positions right, center, left. A same-seed keyboard rematch scored 3/success; the other browser scored 1/failure. |

All six saved recordings reconstruct exactly and have two durable results. The two memory/recognition wins use **memorized fixed challenges learned from the product's post-match replay**, followed by ordinary keyboard events at visible chooser roles. They do not establish fresh visual-reaction or tracking skill. No live internal state, game-surface click, semantic answer injection or seed manipulation was used. Controller metrics show no provider requests for either connected browser. `scripts/check-keyboard-games.ts` writes the complete audit to `evidence/gameplay/keyboard-report.json`, including failed attempts and accepted presses.

Replay inspection exposed terminal labels **5/4** in Odd Snack and **4/3** in Cup. New versions `6fe34d10cc65955cf788be157432181f037f991bb5e7259e21296e1b6122ed1e` and `d0ba3ceb14c3bd30bccc88b3efa492e58badc6337f88f7d3ec4250f4f0d80474` clamp only their displayed counter. The audit compares each complete source with its predecessor and proves the sole change is that draw expression; all rule callbacks are identical. Their actual end-state draw buffers contain **4/4** and **3/3**. Old replays retain their original immutable renderer and therefore their original counter.

The corrected Asteroid again passed **100 seeded headless episodes**, four exact replays and four snapshot restores (`evidence/headless-episodes-asteroid-scramble.json`), at approximately 2,021 simulation steps/second in that run. `scripts/episodes.ts` now accepts reference IDs for focused reruns and writes a separate report instead of overwriting the eight-game baseline. The complete suite passed **44 tests**, and TypeScript checking passed. The latest offline export holds **17 generation records and 59 completed/interrupted matches**.

Keyboard win/loss paths are now evidenced for Asteroid, Conveyor, Cup, Odd Snack, Patchwork and Skill Continue. Toast and Umbrella still need played wins and held steering; all games retain the genuine virtual-pad/multitouch and audio-audition gaps. Agent operation and memorization are not genuine human-performance evidence.

## Missing-image recovery and phone sizing

`scripts/asset-failure-server.ts` starts a temporary production server with its own PGlite directory, provider keys disabled, the reference library and one explicitly broken fixture. Its Toast-derived **Asset Failure Probe** declares a PNG that does not exist. This exercises the browser's real image loading and engine error path, without intercepting requests or injecting browser state. The temporary data was exported on shutdown and removed; the normal library was untouched.

In the normal browser UI, match `27c474804e0ba3cbbccabcd7` displayed **Could not load toast** and **A small hiccup**, with a retry/change-party path. The saved match is `aborted`, reason `asset-load-failure`, with **no completed round and no result rows**. Its interrupted replay explains that no result or leaderboard score was awarded. The same room, `09bb00f9`, returned to setup, replaced the failed cartridge with Toast Catch, and completed match `9c1302ae221198a1d45de5eb`. This was idle recovery, not a played win: score 3/failure.

An 844×390 check found that the landscape CSS capped the canvas height independently of width: the measured **485×239** canvas distorted the 640×400 scene. The layout now bounds the scene width by available height and preserves its aspect ratio. After a production build, the same browser reloaded and measured **380.797×237.992** (ratio 1.6), with the canvas and both controls inside the landscape viewport. At **360×640**, the canvas was **328×205**, the D-pad ended at y=623, and action ended at y=579; root and scroll widths were both 360. These scenes were inspected visually. Overrides were reset and the fixture tab closed.

Before-fix landscape match `88c07d38199a11c5d4362ca0`, after-fix landscape `682cc3a5fa94696afbed758f`, and small portrait `81f7a7f2f891ef68eeda82ff` all ended normally at 3/failure. All four healthy browser recordings replay exactly. The report `evidence/recovery/asset-browser-report.json` also includes the separately identified protocol-load matches below: **18 total fixture matches, one asset abort, 17 exact completed replays**. Typechecking and the production build passed. These are actual browser failure/layout checks; held-input orientation safety and genuine touch still require their own tests.

## Measured concurrent-room profile

`node --import tsx scripts/room-capacity.ts http://127.0.0.1:PORT` runs against the isolated fixture server. It opens four normal WebSocket clients per Asteroid Scramble room, holds firing and alternates directional inputs, exercises production runtime child processes, 60 Hz physics, 20 Hz target snapshots, checkpoints and durable results. No Jev or generation requests are made. All **13 matches / 52 player results** completed with no rejected inputs, no provider opportunities and exact final replays.

| Concurrent profiled rooms | Protocol players | Lowest simulation/wall ratio | Largest client snapshot p95 | Largest snapshot gap | Health-request p95 |
|---|---|---|---|---|---|
| 1 | 4 | 0.9987 | 58.91 ms | 145.54 ms | 4.83 ms |
| 4 | 16 | 0.9980 | 59.54 ms | 77.76 ms | 3.46 ms |
| 8 | 32 | 0.9984 | 62.37 ms | 199.23 ms | 7.54 ms |

Report: `evidence/runtime/room-capacity.json`. Host: Apple M2, eight logical CPUs, 24 GiB RAM, Node 22.23.2. This is a brief local profile, not a maximum-capacity, production-host or sustained-load guarantee. Clients and server share the machine. One browser-rendered Toast room overlapped the eight-room wave; its recording/timestamps are in the recovery report. Browser presentation performance is not measured by the protocol clients. TLS, remote network, external PostgreSQL, Jev latency and generation contention are excluded. Health samples include setup/startup, not just steady simulation.

## Four, two and one actual browser guests with Jev fill

Four normal browser tabs joined room `6fc6c18d`: Chrome and the in-app browser each opened both `localhost:3000` and `127.0.0.1:3000`. Separate origin storage gave **four distinct persisted guest identities** connected to the same server. All used ordinary CUA Space key events. This is actual browser-input coverage, with two browser products sharing the Chromium engine; it is not four human people or four physical devices.

| Match | Connected browser guests | Jev seats | Scores p0–p3 | Live Jev responses |
|---|---|---|---|---|
| `6e002e52c56a3bdf01098f36` | 4 | 0 | 2, 2, 2, 1 | 0 |
| `ae133d2dd08048d79215d622` | 2 | 2 | 2, 6, 5, 4 | 169 |
| `f6cadfe50c11a45191b0998e` | 1 | 3 | 3, 8, 5, 2 | 230 |

The two `127.0.0.1` tabs closed before the second match; Chrome's remaining guest returned to the arcade before the third. All three followed the same pinned Asteroid challenge, `b93ae455fc50`, with identical version/settings/seed. Every connected browser recorded accepted keyboard presses and **zero controller opportunities**. Vacated seats used live **`jev-1.13.0`**. The engine recorded 399 Jev responses and no provider failures/scripted fallbacks in these matches. Across bot seats, response median ranged **151.5–168.5 ms**, p95 **193.2–282.2 ms**, maximum **1,042.7 ms**. The 200 ms scheduler skipped 13 outstanding-request opportunities in the two-Jev match and 43 in the three-Jev match; one and three late responses respectively were marked stale. Responses and applied actions are not interchangeable counts.

`node --import tsx scripts/check-browser-occupancy.ts` verifies distinct guest identities, 4/2/1 initial controller assignments, 0/2/3 Jev seats, zero AI work for connected guests, fixed scheduling boundaries, one outstanding decision per seat, accepted input, identical pinned definitions, twelve durable result rows and **three exact replays**. Report: `evidence/party/browser-occupancy.json`. Full recorded telemetry remains in the match exports. The current main-store export contains **19 generation jobs and 68 completed/interrupted matches**; the 18 isolated asset/load fixtures are separate. This fills the browser occupancy gap while leaving touch, audible quality and broader gameplay checks open.


## SDK helpers and live Signal Snacks authoring check

The SDK now has serializable helpers for grid/list navigation, held-direction repeat, hold/release timing, angular aiming, projectiles, scheduled spawns and ordered button sequences. `tests/sdk-controls.test.ts` covers six meaningful cases: equivalent accepted keyboard/touch-source/bot repeat timelines, quick and repeated taps, opposite directions, ragged grids, exact sequence deadlines, hold cancellation, bounded catch-up, and a compiled single-file cartridge with exact QuickJS replay and snapshot restoration. The full **58-test suite**, type-check and production build pass. The touch-source case is an input fixture, not a real multitouch browser test.

Three live UI jobs used **gpt-5-mini-2025-08-07** to author and refine **Signal Snacks**, an additional check of SDK usability. They do not replace the required Firefly/Puddle/Lantern benchmark. No generated source was hand-edited.

| Job | Elapsed / code attempts | Result |
|---|---|---|
| `5aec13ad05ffd59443ae1756` | 44.220 s / 1 | Code, gpt-image-1.5 artwork and model-generated music overlapped. Immediately playable, but the brief chose action-driven despite a realtime request. Several accepted presses in one tick counted as one point. |
| `8094d3e16a956853a719c3db` | 59.994 s / 2 | Explicit realtime selection and a focused prompt corrected no-input deadlines and batched scoring. One automatic repair fixed a `null` stroke argument rejected by TypeScript. Exact artwork/music reused. Labels still needed correction. |
| `7044491713b89916870e6ab2` | 34.363 s / 1 | Labels-only refinement displays SPACE and WASD aliases with an accurate instruction. Init, step and observe callbacks match the preceding version structurally; exact media reused. |

The original completion `5a0f8dc4d50dc6105b91f05d` exposes the three-point undercount. The corrected rules and final labels each passed ordinary keyboard completion with **four points and four catch feedback events**, wrong-key failure and no-input failure at **5.0167 simulation seconds**. Final matches are `a5aac428d0c2740ae173960e` (success), `14edd752000b2f5ca7977ff3` (wrong key), `67dcf04889c12d52513d2220` (idle expiry) and `afc8cd42622b83a5a42ccf7c` (separate Chrome library reopening, idle expiry). Winning rematches used sequences learned from the visible first playthrough; this does not measure first-attempt human performance. All **11 browser recordings** across the three versions replay exactly and agree with durable scores. Each job was followed by immediate play and saved-library reopening without application rebuild/restart during that flow. The app was restarted between the original job and first repair to load improved generic authoring guidance.

The final 390×844 viewport displayed all four panels, actual key labels, per-press bar, generated radio sprite and shared pad. Root and scroll widths were both 390; canvas bounds were 358×223.75. The override was reset. No browser warnings/errors were captured. This is layout plus keyboard coverage, not touch or a second rendering engine: Chrome and IAB both use Chromium.

Offline validation on 16 new seeds checks four correct presses delivered in a single tick (four points/four catch events), repeated-button patterns, wrong-first-button failure, idle expiry and exact mid-sequence restoration. The 8.727-second generated PCM16 loop passes decoded signal/loop-bound checks, with no clipping or unexpected silence; no audible listening claim is made. Both remixes retain the exact saved WAV, score, artwork and provenance and make no new image/music request. Report and reproducible audit: `evidence/generation/sequence-helpers-live.json`, `scripts/check-sequence-generation.ts`. The latest main-store export has **23 generation jobs and 84 completed/interrupted matches**.

Generation guidance now distinguishes realtime deadlines from turn-based choices and explains that sequence scoring must use the full accepted-index delta. These observations improve authoring guidance; compilation/preflight alone is still not a gameplay-quality guarantee. The full goal remains incomplete, including pending audio listening and genuine mobile-input checks.


## Arcade cabinet and direct launch (September 22)

Random Party now starts immediately; room `c831cde7` loaded four games with a Jev-filled second seat. Odd Snack Out and Patchwork Pass showed game content inside the fixed canvas with turn/role information outside it. Toast Catch launched directly in room `eb50c721`, and Play again started another round without configuration. Results retain two main actions, Play again and Back to arcade; the later rating addition is optional.

IAB keyboard checks covered the cabinet menu, Sound and picture, returning to play, leaving, and the creator's explicit text-edit mode. The desktop cabinet measured 936×612 with a 640×400 play area at 1280×800. At 390×844 the page had no horizontal overflow; the 342×213.75 canvas retained its aspect ratio and the controller remained below it. At 844×390, DOM measurements showed a 392×245 canvas and no horizontal overflow, but the screenshot was unexpectedly narrow: complete landscape visual and controller coverage is still open. Viewport overrides were reset. These are layout/keyboard observations, not physical-touch acceptance.

The interactive presentation fixture passed four checks against real canvas pixels: time-varying poses, reduced-motion identity, same-time determinism and visible blink behavior. Its five toast poses, six snack expressions and grouped cup preview were inspected, and the preview's Reduced motion checkbox was exercised. This is not an operating-system accessibility-preference check. After HUD changes, all eight reference cartridges again completed 100 headless episodes each with 32 representative exact replays. See `evidence/runtime/arcade-cabinet.json`, `evidence/runtime/visual-kit-fixture.json` and `evidence/headless-episodes.json`.

## Cartridge ratings and Top rated (September 22)

The production build's Toast Catch room `4573e029` ended with four slices and displayed a compact five-star row. From Play again, W selected the first star; D three times and Space saved four stars. A then Space changed that vote to three stars. Reloading restored the selected third star and 3/5 label. Back in the arcade, Top rated put Toast Catch first with **3.0 (1 rating)**, demonstrating that the update did not add a second vote. This is an explicit local test vote, not evidence of enjoyment.

The 390×844 screenshot displayed the stars and both result actions without clipping. All five star targets measured 44×44 and page width remained 390. The override was reset. No browser warnings/errors were captured. Browser inspection also exposed a spatial-navigation skip from Play again to the header; a distance-based fix and regression case now keep Up on the nearby star row. Focus styling was corrected so transparent navigation buttons retain readable text.

All **67 tests**, the TypeScript check and production build passed. After the navigation correction, the three cabinet tests and build passed again. Rating tests use an isolated database and cover completed-loss eligibility, other guests, AI-only results, interrupted/unplayed games, invalid values, repeat/update counts, version provenance, persistence after reopen and confidence-weighted sorting. The end-to-end browser observations are in `evidence/ratings/browser-report.json`. Broader goal gaps remain unchanged.


## Scoped arrows and shared Options (September 22)

Header navigation is now one explicit Options button. Escape opens the same overlay on the arcade, creator, lobby, play and results screens. Directional candidates come only from the current main screen or dialog; header and cabinet/party shortcuts cannot receive arrow focus. Native Tab activation remains supported.

Actual CUA keyboard checks in IAB covered nine directional moves from Random Party across the filters and back to the top: every focus target remained inside main, with repeated Up stopping at Random Party. Escape opened Options and closing it returned to Random Party. Clicking Options opened the same screen; Down/Space entered Sound + picture, with two successive Escapes returning through Options to the clicked shortcut.

Toast Catch room `9fd12396` verified Escape opening Options during play, Escape returning focus to the game cabinet, and Left/Right retaining gameplay focus. On results, repeated Up stopped on the first rating star; Right/Left moved between stars without entering the header. Opening and closing Options restored that star. At a 390×844 viewport, the options dialog measured 366.59×297.39 within a 390 px page. The screenshot was unexpectedly scaled by the browser tool, so this phone check establishes DOM layout bounds rather than a full visual audit. The viewport override was reset. Type-check, affected cabinet/audio tests and production build passed.


## September 22: party cartridges, Jev context and creation reveal

- `npm run check`, `npm test`, `npm run build`: pass; **76 tests**. Added skill/idle/mash/tied-finish checks, deterministic replay, private-state exclusion and correct-seat highlighting. The music adapter and staged-generation tests also pass.
- `node --import tsx scripts/episodes.ts nose-dive crawl-for-gold`: **200 episodes**, eight exact full replays and eight mid-episode restores, with 2/4 seats and difficulty 0–3. Skill policies win; idle terminates; rapid taps cannot complete a crawl pull. Report: `evidence/headless-episodes-crawl-for-gold-nose-dive.json`.
- CUA browser: Nose Dive's spinning nose/corner hands and keyboard launch were observed in room `c08192b3`; Jev won with 100. Crawl scene was inspected in `bf3dfd7a`, where the earlier controller scored zero. After the rulebook/seat-context improvements, four-seat party `55b06b2c` played both final versions with three actual `jev-1.13.0` seats. All three advanced in Crawl (100/300/300), but none completed seven strides before timeout. Nose ended with a successful Jev pick. Desktop and 390×844 scenes, cabinet readouts, and crawl's rejection of a quick keyboard tap were inspected. Physical touch and a human-controlled held-input win were not verified.
- Offline `node --import tsx scripts/check-new-party-games.ts` verifies both saved browser rounds exactly, zero AI requests for the connected browser, 288 actual Jev responses and zero scripted fallbacks. Every response used context `rules-v4`. Evidence: `evidence/party/new-games-browser.json`.

### Jev experiment, including regressions

`server/controllers.ts` owns the integration; neither new game contains provider calls or a bot policy. The engine sends extracted rule source, optional precise public `meta.rules`, filtered current state/history, the seat's own visible entities and HUD, held buttons, tick/time, 200 ms opportunity interval, observation age and estimated latency. Choices explicitly distinguish fresh press, continued hold and release. The source is never executed by the model adapter. Hidden runtime snapshots and RNG are excluded.

Real calls are measured with `scripts/benchmark-jev.ts`. The harness advances realtime simulation by measured provider latency before applying a decision and has no fallback. Opponents stay idle; these small, variable-latency samples are diagnostic, not a ranking against humans. Initial full-source context hurt timing games (`source-context-benchmark.json`), prompting removal of drawing code. Intermediate reports retain their own conditions; they must not be combined as one controlled comparison. Shortening the public description also exposed a need for a precise rulebook separate from catalogue text.

Final paired second-seat check (`JEV_BENCH_PLAYER=p1 node --import tsx scripts/benchmark-jev.ts nose-dive crawl-for-gold`, `evidence/jev/rules-v4-benchmark.json`):

| Cartridge | Old description-only | Final rules/code/state context |
|---|---|---|
| Nose Dive, seeds 41 / 72 | 100 / 0 | 100 / 100 |
| Crawl for Gold, seeds 41 / 72 | 0 / 200 | 500 / 500 |

All eight final episodes completed without provider errors. Enhanced request median latency was about 161–166 ms across these episodes. Crawl improved but still missed the 700-point finish. Real multiplayer crawl performance was lower than the isolated benchmark. Precision timing remains open work; this is not a claim that Jev is now a strong player in every cartridge.

### Creation reveal and music extension

Star Stamp job `ee29f3b52d7877469ce24a1c` displayed its generated alien artwork while code/music were still pending, completed all branches, and automatically entered room `dc0fc5a1` without an intervening build/restart. It reached the ordinary result screen. Reopening the saved job verified showcase focus, shortened premise, original artwork, actual game preview and the AudioEngine-backed “Now playing your soundtrack” status after audio unlock. Evidence: `evidence/generation/creation-reveal.json`. Playback state was inspected; the audio was not perceptually reviewed.

The default music path still creates a model-authored score and synthesizes a loop. An injected server adapter can now return PCM16 WAV bytes directly. Tests verify stereo and loop offsets, exact bytes, immutable publication/reopen, repair, provider reservations, cancellation and ignored late output. Signal validation is not a listening test; no optional audio-native provider was live-tested.

The original acceptance gaps remain in IMPLEMENTATION.md: held/touch play, a second rendering engine, perceptual audio review, and remaining browser wins for the original/generated-game benchmarks. These new cartridges supplement that scope.


## Microfinity public repository baseline

The project, UI, SDK authoring namespace and Python environment classes now use Microfinity. Legacy SDK imports and browser profile/preferences migrate without losing the existing guest identity. `npm run check`, all **78 tests**, `npm run build`, and `.venv/bin/python rl/smoke.py` pass after the rename. The latter runs Gymnasium and both PettingZoo API checks, snapshot/restore and hidden-state checks. Runtime data, raw evidence/provider records and generated artifacts remain local and are excluded from the public repository.
