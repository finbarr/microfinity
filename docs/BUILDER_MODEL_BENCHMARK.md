# Local builder model comparison

September 24, 2026. Production and the default model were unchanged. These are
small-sample engineering results, not a general ranking of the models.

## Results

Times below cover the Codex build, fresh independent validation, cleanup and local
publication. The saved brief, sprite, cover and soundtrack were reused. Fresh
brief/media generation previously added 37–50 seconds for the quilt and penguin.

| Case | Previous Astra / high | Sol / medium | Luna / medium |
| --- | --- | --- | --- |
| Dragon | 7m13s, published | 4m19s, published | 3m31s, input budget exhausted |
| Quilt | 8m27s, published | 3m35s, published; turn-timeout defect | 6m44s, input budget exhausted |
| Penguin referencing the dragon | 6m43s, published | 4m10s, input budget exhausted | 5m46s, published |

Sol published two of three attempts and Luna one of three. Sol's two published
builds were about 40% and 58% faster than their respective historical Astra builds.
Publication here means passing the existing generic checks; the independent
mechanics review below found a defect in the Sol quilt.

A fresh Luna dragon attempt with clearer witness instructions also exhausted the
input budget, after **5m22s**. It had successfully run its own validator, then
continued inspecting reports and rechecking the source. This follow-up is separate
from the original comparison because its authoring instructions changed.

## Quality review

- **Sol dragon:** passed 66 independent checks across seeds 1, 713 and 991. Each
  individual seat could steer and catch three marshmallows at every party size
  from one through four; idle and held-Space runs failed as intended. Its artwork,
  collision cue and readable night scene were visually inspected. The exact
  published version also won through real browser keyboard input in solo play and
  four separate human browser sessions. The latter synchronized scores 3/3/3/8.
- **Luna penguin:** passed the same 66 independent checks, adapted to its visible
  falling flakes and catch position. It uses the supplied sprite, clear timing
  cues and a coherent winter scene. Its exact published version won through browser
  keyboard play both solo and with four humans, synchronizing scores 3/3/3/6.
- **Sol quilt:** 12 scenario checks exercised two placements per player, four-cell
  patches, gold bonuses, waiting-player isolation, overlap rejection, winners and
  idle paths at all four party sizes. Normal play works. However, the shared
  30-second deadline ends an idle game after three timed-out turns: it grants only
  3/4, 3/6 and 3/8 turns for two, three and four players. Player four can receive no
  useful turn at all. This violates the intended two-turn allocation. A four-human
  browser match with one deliberately timed-out turn and seven subsequent stitches
  completed correctly, with scores 4/14/11/14 and correct tied winners. It therefore
  has a specific slow-play/fairness defect, rather than a generally broken board.

Desktop and phone layouts were inspected; browser checks found no horizontal
overflow or page errors. These checks do not establish general prompt fidelity,
fun, touch-input quality, audio quality, non-Chromium behavior or production load.
No generated game source was hand-edited to obtain these results.

The application checks also passed: 119 Node tests, TypeScript checking and the
production build. No builder containers remained after the experiments. The local
development image now points to the tested 0.156.1 image with clarified witness
instructions; the configured model remains Astra/high. A preview of the three
published comparison games is running at `http://127.0.0.1:3108`.

## What caused the unfinished attempts

All three original failures, plus the follow-up, reached the trusted broker's
**8 MB cumulative request-body limit**. This is cumulative serialized traffic over
the entire conversation, not an 8 MB source file or model context limit. The
40-call, 120,000-output-token and ten-minute limits remained unchanged.

Two workflow problems contributed:

1. The instructions asked for a contrast with idle play, but every submitted solo
   witness must succeed. The validator already synthesizes the idle comparison.
   Luna's first dragon and both penguin agents submitted an idle witness and had
   to diagnose its rejection. The instructions now explicitly separate success
   witnesses from idle/failure experiments; validation itself was not weakened.
2. Agents keep consuming calls after obtaining useful artifacts. Sol's penguin
   passed its own validator, then printed a large report containing image data and
   exhausted its remaining input budget. The clarified Luna follow-up also passed
   its own validator before further inspection consumed the budget. The current
   runner requires a successful Codex exit before collecting an artifact, so these
   were correctly recorded as unpublished, unfinished jobs—not successful games.

These failures do not prove that the underlying generated code was unusable. They
do show that simply changing the model is not yet a reliable replacement under
the current completion and budget rules. Compact tool summaries and a bounded
handoff to the independent validator are the next workflow improvements to test.

## Measurement details

The six new builds ran serially in rootless Podman. Each used the same immutable
toolkit image, broker budgets, original prompt, structured brief and media as its
counterpart. References contained the built-ins plus only the original saved
cartridges that preceded that case; a model could not read another attempt's
solution to its own task. The reference directory still contains named `.ts` files
without an index. Built-in source hashes and input records are saved with the run.

The published Sol dragon spent 156 seconds in model requests and 103 seconds in
the remaining tool, harness and validation work. The Sol quilt split was 139/77
seconds; the Luna penguin split was 212/135 seconds. Model-request time includes
network and streaming time. Smaller/faster requests therefore cannot remove all
of the measured latency.

The earlier Astra runs used Codex 0.156.0. The smaller-model runs used 0.156.1,
whose bundled catalog recognizes Sol and Luna. Initial 0.156.0 compatibility
failures occurred before generation and are excluded. This patch-level CLI change,
single attempt per case/model, sequential run order and historical Astra baseline
limit any causal performance claim. Brief desktop playtests and independent
mechanics checks also ran on the host during some later generation jobs.

## Reproduction and evidence

The benchmark requires the saved local fixtures under
`artifacts/builder-validation/1790270835293`; they are not committed repository
fixtures. It always uses a new explicit local PGlite directory, regardless of
`DATABASE_URL` or the application's `DATA_DIR`.

```sh
podman build -f builder/Containerfile -t localhost/microfinity-builder:benchmark .
BUILDER_BENCHMARK_DIR=artifacts/builder-benchmark/new-run \
  node --import tsx scripts/benchmark-builder.ts
```

Optional benchmark settings are `BUILDER_BENCHMARK_IMAGE`,
`BUILDER_BENCHMARK_MODELS`, `BUILDER_BENCHMARK_CASES` and
`BUILDER_BENCHMARK_EFFORT`. The checked-in instructions include the clarification;
the original comparison used image
`8267c93ae1c5309d367010e640825aeb39a35c80cc749babd6e2b32d426f0dfd`.
The follow-up used image
`69fd4c9e9b3294e54b22d1af194699bde59cfcc9522afa437980b5131a4ce5df`.

- [Original comparison records](../artifacts/builder-benchmark/2026-09-24-medium-v2/summary.json)
- [Frozen inputs and reference hashes](../artifacts/builder-benchmark/2026-09-24-medium-v2/inputs.json)
- [Clarified-instructions follow-up](../artifacts/builder-benchmark/2026-09-24-clarified/summary.json)
- [Sol dragon gameplay checks](../artifacts/builder-benchmark/2026-09-24-medium-v2/dragon-gpt-6-sol-medium/independent-mechanics.json)
- [Sol quilt gameplay checks and defects](../artifacts/builder-benchmark/2026-09-24-medium-v2/quilt-gpt-6-sol-medium/independent-mechanics.json)
- [Luna penguin gameplay checks](../artifacts/builder-benchmark/2026-09-24-medium-v2/penguin-gpt-6-luna-medium/independent-mechanics.json)

Each published case also has its exact source, compiled/pinned publication,
witnesses, independent validation, screenshots and browser reports. Private Codex
diagnostics are excluded from this report.
