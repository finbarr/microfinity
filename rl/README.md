# Headless environments

```sh
python3 -m venv .venv
.venv/bin/pip install -r rl/requirements.txt
.venv/bin/python rl/smoke.py
```

`MicrofinityEnv` implements Gymnasium for a single player (Toast Catch by default). `MicrofinityParallel` implements simultaneous PettingZoo play (Asteroid Scramble). `MicrofinityAEC` follows actual active-player roles in action-driven Patchwork Pass; selecting a piece and positioning it can require several consecutive decisions by the same agent.

The Python code never reimplements rules. A JSON-lines Node bridge compiles the same cartridges and steps the same QuickJS ModeEngine used by live rooms. No audio, browser, database or provider calls occur during rollouts. `cartridge=` can load a saved JSON bundle containing immutable `code` and `runtime` strings instead of compiling a reference file.

Actions are Discrete(18): neutral, up, down, left, right, up-left, up-right, down-left, down-right, each paired with action released/held (even/odd index). Edges derive from transitions; a repeated press requires a release. Default action repetition is 12 simulation frames (200 ms), configurable 1–60. Action-driven decisions advance that amount of simulated time and produce explicit 10-second decision timeouts. No real-time sleeping or cloud latency is added.

Observations are UTF-8 JSON padded with zeros in a 65,536-byte uint8 Box space, containing only the player's filtered view, roles, scores and public feedback. The `decode()` helper recovers the structured object. This is an interface baseline for arbitrary cartridges; a training pipeline should build a game-specific numeric encoder using only these observations. The fixed byte representation interoperates with array-oriented Gymnasium/PettingZoo consumers and checkers. Snapshots are privileged environment controls, never part of observations or `info`. No answer-bearing action mask is supplied.

Reward version `score-delta-plus-terminal-v1`: signed raw-score delta (sign reversed for lower-is-better), plus +1 success / −1 failure at normal termination. Visible scores remain unchanged. A game's intrinsic time limit is termination; a configured external `max_decisions` cap is truncation. This simple reward is documented, not a claim of trained policy quality. Terminal bonuses and score scales differ by game and require task-specific assessment before comparing learning curves.

`rl/smoke.py` runs the official API checkers, a bridge snapshot test, random episodes, a throughput measurement, and Cup Shuffle observation leakage checks. There is no claim of genuine human success or completed RL training.

Run `node --import tsx scripts/rl-baselines.ts` for paired policy evaluation through the same `HeadlessEnvironment`. It compares p0's idle, random and existing scripted controllers on seeds 10000–10015, normal difficulty and each game's minimum player count, against fixed scripted opponents where needed. All policies receive only filtered observations. The report pins code/runtime hashes in `evidence/rl/baselines.json`; its 384 episodes include raw scores, outcomes, versioned rewards and termination/truncation. The accounting check verifies cumulative reward against the documented objective.

This run found a strong scripted advantage over random on six games, mixed results in Cup Shuffle, and a weaker scripted baseline in Patchwork. Patchwork's random policy beat the current generic script on 15 of 16 paired seeds. Do not treat the practice controller as an expert or these results as proof of learnability. The evaluation uses one seat, difficulty and player count; deterministic games may repeat the same trajectory across different seeds. No policies were tuned on these seeds. Measured in-process decision throughput was 240–1,355 decisions/second with 12-frame action repetition; this excludes Python IPC, rendering, room transport and cloud latency. The separate Python bridge smoke remains the relevant bridge-overhead measurement.
