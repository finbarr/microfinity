# Backend AI players

A match started with one connected human fills to four seats. The backend owns
controller type, decisions, provider calls and movement tracking. Cartridges
receive the same `{id, name, color}` roster and button inputs for every seat.
Generated cartridges must not implement bots or branch on controller type.
The cabinet can identify controllers; cartridges cannot read that information.

Solo navigation uses **Back to arcade**. **Choose new games** returns home.
Explicitly leaving the last occupied seat stops the match and scheduling new provider calls.
A transport disconnect keeps the reconnect grace period.

## Default controller: target-v9

Each AI seat independently receives:

- Its filtered observation, public rules and controls, score direction, role,
  held buttons, HUD, and timestamped visible history. Source is included when
  the cartridge lacks a public rulebook.
- Expected response delay and arithmetic derived from visible motion: projected
  positions/phases, angular distances, timing-window comparisons, and relative
  positions. Assumptions such as constant velocity and radians are explicit.
- Separate movement and action choices. Movement may select ordinary buttons or
  alignment with a visible object's x/y coordinate. Jev chooses the useful target;
  the backend follows that object's current position and stops within 12 canvas
  pixels. Action remains an independent press/hold/release decision.

Navigation updates from the same 20Hz observations used by the room. It tracks
entity IDs across array reordering, releases movement when a target disappears,
expires after one second without a replacement, and clears on role/round/ownership
changes. No game ID, score function, private snapshot or hidden answer is used by
this movement controller. Direct direction choices remain available for discrete
menus and games that do not expose positions.

Party IDs map to local player IDs for independent worlds. An AI request never
receives a random seed, saved runtime state, or another seat's private observation.
The generic arithmetic and movement helpers live in `server/controller-evidence.ts`
and `server/controller-navigation.ts`; cartridge code does not call them.

`JEV_INTERVAL_MS` defaults to 200. Calls have a 1.2 second deadline and share the
bounded `JEV_CONCURRENCY` pool. In-flight answers are discarded after a role,
round or ownership change. Provider failures use the existing explicit backend
scripted fallback and are recorded as `scripted` with an error. They are never
counted as successful Jev decisions in the benchmarks.

The API request follows the [TypeSafe API reference](https://docs.typesafe.ai/api).

## Strategies compared

`JEV_STRATEGY` supports these reproducible alternatives:

| Strategy | Context and control |
| --- | --- |
| `rules-v4` | Established source/rule context and one joint button-state choice |
| `compact-v5` | Structured rules, timing, ownership and recent visible history |
| `source-v5` | Structured context plus source reference |
| `motion-v6` | Structured context plus visible-motion arithmetic |
| `factor-v7` | Motion arithmetic and separate movement/action questions |
| `evidence-v8` | Established source context plus arithmetic and spatial relationships |
| `target-v9` | Separate decisions, arithmetic and backend target following; default |

The initial three prompt formats struggled with timing and movement. Arithmetic
helped the timing games. Separate questions improved movement, but holding a
direction across network latency still caused overshoot. Target following removed
that source of overshoot without adding any cartridge AI logic.

## Live results

The final real-room run used seed 41, one idle human and three concurrent Jev
seats, the child-process runtime, production scheduling, and actual provider
latency. All six rooms completed; 762 calls were started, with no provider errors
or scripted fallback. Pending answers discarded at round/role transitions are
recorded separately as stale.

| Game | AI seat 1 | AI seat 2 | AI seat 3 |
| --- | ---: | ---: | ---: |
| Toast Catch | 11 | 8 | 10 |
| Nose Dive | 1 | 1 | 1 |
| Crawl for Gold | 600 | 700 | 400 |
| Odd Snack Out | 3 | 2 | 2 |
| Umbrella Panic | 9 | 6 | 7 |
| Asteroid Scramble | 9 | 12 | 16 |

All three seats passed Toast Catch, Nose Dive, Odd Snack Out and Umbrella Panic.
Crawl for Gold and Asteroid Scramble produced an AI winner with other AI seats
also scoring. In the preceding `factor-v7` real-room run, Toast Catch scores were
4, 3 and 5; the target-following run scored 11, 8 and 10. An initial target-following
run also scored 9, 9 and 8. These are small gameplay comparisons, not a guarantee
of optimal play on arbitrary generated cartridges. Noisy provider latency still
affects tight timing windows. The earlier factor run had two provider timeouts;
the final run had none.

The same real-room harness also ran `rules-v4` on seed 41:

| Game | Earlier controller, three AI scores | New controller, three AI scores |
| --- | --- | --- |
| Toast Catch | 4, 3, 4 | 11, 8, 10 |
| Nose Dive | 2, 1, 1 | 1, 1, 1 |
| Crawl for Gold | 300, 100, 0 | 600, 700, 400 |
| Odd Snack Out | 3, 3, 2 | 3, 2, 2 |

The earlier-controller run had two provider errors in Toast Catch and two in
Nose Dive, invoking scripted fallback. Those rounds are mixed-controller results,
not pure Jev scores. The new controller improved movement and hold timing in this
sample; there is no consistent gain demonstrated for choice accuracy or every
angular timing seat. The baseline uses the shared current instruction wording,
including explicit left/right semantics, so it is a stronger comparison than the
initial source-context screen.

A second seed (72) also passed both movement games with all three AI seats:
Toast Catch scored 9, 10 and 11; Umbrella Panic scored 11, 11 and 7. Across the
six-game final run and this two-game follow-up, all eight matches completed with
1,013 started AI calls, zero provider errors, and zero scripted fallback.

Detailed local evidence:

- `evidence/jev/context-v5-benchmark.json`: initial three-strategy, paired-seed screen.
- `evidence/jev/motion-v6-benchmark.json`: arithmetic experiment.
- `evidence/jev/factor-v7-benchmark.json`: separate-question experiment.
- `evidence/jev/evidence-v8-benchmark.json`: source plus spatial evidence experiment.
- `evidence/jev/three-ai-rules-v4.json`: same-harness earlier controller comparison.
- `evidence/jev/three-ai-factor-v7.json`: first real-room comparison.
- `evidence/jev/three-ai-target-v9-final.json`: six-game final run above.
- `evidence/jev/three-ai-target-v9-seed72.json`: second-seed movement verification.

The initial single-seat screening harness did not reset held controls at every
role transition; the current harness does. Use the real-room reports for final
acceptance. All reports retain source hashes, decisions or scheduler metrics,
actual model versions, scores, latency and errors. Historical evidence from before
this change used older cartridge versions and is not part of this comparison.

## Reproduce

These commands send game rules/source and simulated observations to
`api.typesafe.ai` using `TYPESAFE_API_KEY`. They do not touch production data.

```sh
# One AI seat against idle opponents, paired seeds, measured latency.
JEV_BENCH_VARIANTS=rules-v4,target-v9 JEV_BENCH_SEEDS=41,72 \
  node --import tsx scripts/benchmark-jev.ts \
  nose-dive crawl-for-gold odd-snack-out toast-catch

# Three concurrent AI players in real local Rooms with an isolated temporary DB.
JEV_STRATEGY=target-v9 JEV_PARTY_OUTPUT=evidence/jev/three-ai-rerun.json \
  node --import tsx scripts/benchmark-ai-party.ts \
  toast-catch nose-dive crawl-for-gold odd-snack-out umbrella-panic asteroid-scramble
```

The single-seat benchmark simulates elapsed provider latency and the navigation
feedback interval. The room benchmark uses actual wall time. Both exit nonzero
for provider errors or incomplete runs; ordinary gameplay losses remain results.
The room benchmark also fails on scripted fallback. `JEV_BENCH_PLAYER=p2` or `p3`
selects a different isolated seat; `JEV_PARTY_SEED` selects another live-room seed.

Local regression checks cover solo fill/rematch/exit, multiplayer continuity,
UI labels, observation isolation, ID mapping, holds/releases, response validation,
role/ownership changes, target tracking/reordering/removal, and all three AI seats
scoring through ordinary cartridge inputs with a mocked provider.
