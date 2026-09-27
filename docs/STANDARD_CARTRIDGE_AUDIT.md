# Standard cartridge audit and polish

Reviewed 26 September 2026. All ten bundled cartridges were inspected, simulated, and compared with the exact versions in the public catalog. The follow-up release changes nine cartridges and also publishes the already-improved Crawl for Gold source. The findings below are supported by automated checks and browser inspection, rather than a human party playtest.

## Changes by cartridge

| Cartridge | Finding | Revised behavior |
| --- | --- | --- |
| Cup Shuffle | Too much waiting; no multiplayer guess reveal. | Shorter reveal, swaps, and voting. Names and colored guesses appear together after everyone locks or time expires. Locked choices stay private beforehand, and missed votes are explicit. |
| Nose Dive | Opening timing was too forgiving and barely slowed. | Normal spin starts at 5.8 rad/s and smoothly slows to 1.2. Its timing window widens from about 114 ms to 550 ms. Retains repeat picks, the prediction spark, fixed launch outcomes, and bounded input-age compensation. |
| Crawl for Gold | The public version lacked the checkout's clearer timing cues. | Publish the reviewed 20-second version with a visible timing bar and changing targets. No new source change; press/hold/release already rewards deliberate timing and treats identical successful inputs as ties. |
| Conveyor Clash | Slow four-player round; final parcel disappeared before reaching the collector. | Equal 6.5-second shifts, 12 earlier parcels, a 26-second four-player round, and explicit selected-lane/cooldown cues for operators. Every parcel reaches the catch line at every difficulty. |
| Asteroid Scramble | Same-tick hits favored the first projectile owner; overlapping ships obscured ownership. | Every distinct owner hitting the same rock in the same tick receives one point. All colliding projectiles are consumed. Your ship draws last with a ring and an unclipped YOU label. |
| Odd Snack Out | Repetitive tiny sprinkle counts; no shared vote payoff. | Larger outlined sprinkles, frown and closed-eye rounds, accurate clue text, and named votes revealed together. Closed eyes remain a real expression with reduced motion enabled. |
| Toast Catch | Final easy-mode toast was unreachable; Cheer did nothing. | All 12 slices arrive before time expires. Cheer visibly bounces the hand without altering its hitbox or scoring. |
| Umbrella Panic | Private playfields felt disconnected; Cheer did nothing. | Own place/score and leader score make the race visible. Cheer animates only your umbrella; target is six points. Catching and dodging remain separate per seat with identical weather. |
| Patchwork Pass | Idle clocks could exclude player four; rivals had no interference. | Everyone gets two turns of up to five seconds, with reversed order on pass two. Each rival controls a separate pin cursor and may block one empty cell per turn after a 0.35-second warning. Pins clear between turns. Blocked selections return to the tray so shapes can be exchanged. Button bonuses remain. |
| Skill Continue | Idle players could win for surviving; interference missed the actual task. | Three attempts each, equal speed per lap, and victory requires personal points. Rivals may cover the entire timing bar for 0.30 seconds, once per attempt, with per-rival cooldowns. Exact phase is hidden while covered. A fuller meter display shows names and each person's hit/miss history. |

## Pacing and fairness evidence

- Normal four-player Cup Shuffle: idle duration **25.02 → 17.20 seconds**; prompt correct votes **13.12 → 9.07 seconds**, about 31% faster. These exclude the app's loading/intro screens.
- Cup privacy tests cover partial votes, locked-vote immutability, timeouts, four names on one cup, reduced-motion drawing, and every 1–4 player / difficulty 0–3 combination.
- Nose's undisturbed slowdown is monotonic at every difficulty. Successful compensated launches are checked separately for every seat, with no accidental rival launches or scores.
- Patchwork's idle native four-player order is `0,1,2,3,3,2,1,0`, ending at 40 seconds. Pin spam cannot consume the stitcher's turn, move their ghost, stack extra pins, or erase stitches. Tests also exercise warning/landing, pin reset, shape exchange, and button bonuses.
- Skill Continue gives all 2–4 native participants exactly three attempts at both difficulty extremes. Skilled identical inputs yield three hits each; idle input gives everyone zero and failure. Repeated rival inputs cannot extend a splash.
- Controlled Asteroid collisions with reversed projectile order give all four owners one point. Duplicate shots by one owner do not multiply that owner's award.
- All 12 Toast slices and all 48 parcels across four Conveyor shifts cross their catch line before the clock ends at difficulties 0–3.
- All ten cartridges retain one-controller/one-seat ownership. Intentional effects on a shared world remain visible and bounded.

## Interpretation limits

The 16-seed baseline is an observation-only development policy comparison, not a human difficulty rating. The generic Patchwork policy is not a placement optimizer and loses to random input on many seeds. Umbrella's higher target does not eliminate every lucky stationary success; deliberate catching still beats random input on all 16 tested seeds. Asteroid remains a target race, not a survival game. Human feedback should guide further balance changes.

## Publishing the actual games

The app only seeds an empty library on startup. Deploying application code alone does not update existing immutable cartridge versions. Before this release, Nose Dive, Crawl for Gold, and Patchwork Pass were behind the checkout.

Use the release's explicit `npm run seed` under the production service environment while the app and worker are stopped. It precompiles all references and rejects creator-owned IDs or non-reference published collisions before moving any published pointer. It preserves each cartridge's assets/music, all prior versions, and user-created games. Maintenance initialization does not interrupt matches. A disposable-database test covers repeat publication, preserved media/results, immutable old source, and collision rejection.

The deployment procedure must back up first, wait for no active matches/builds, record old published pointers, and restore those pointers along with the previous app if activation fails. After publication, compare all ten public sources with the release, complete an actual four-player party, return the party to its lobby, and verify historical source/result/asset hashes.

## Local verification

Type checking and the production build pass. The full suite passes **163 tests**. The headless sweep passes **1,000 episodes**, **908,779 simulation steps**, **4,384 render checks**, **40 deterministic replays**, and **40 checkpoint restores**. The additional audit covers all ten cartridges at 1–4 party seats and compares the pinned pre-release versions.

## Reproduction

- `npm run check`, `npm test`, and `npm run build`.
- `npm run test:episodes`: 100 episodes per game across difficulty levels, native player counts, idle/random/scripted policies, rendering, deterministic replay, and snapshot restoration.
- `node --import tsx scripts/audit-cartridges.ts`: 80 current party episodes, plus 20 pinned pre-release episodes when their downloaded artifacts are present. Writes captures, pacing, and edge-case evidence to `artifacts/cartridge-audit/audit.json`; does not download or publish anything.
- `node --import tsx scripts/rl-baselines.ts`: 16 paired seeds × three policies × ten games.
- `node --import tsx scripts/preview-cartridges.ts`: a disposable, provider-disabled local app at port 4319. `/tests/fixtures/cartridge-audit.html` displays real QuickJS draw captures and interactive worker previews.

Bulk evidence, screenshots, downloaded pre-release cartridges, and deployment logs live in ignored `artifacts/cartridge-audit/`. Source, tests, fixture, and audit tooling are retained in Git. A successful automated run does not establish human enjoyment or model-controller quality.
