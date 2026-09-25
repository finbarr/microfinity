# Multiplayer generation defaults

Candidate change, September 24, 2026. Not deployed to production.

## Cause

The reported stacking game's original saved brief explicitly said “Four climbers
share a keyboard” and “One to four people can split the four keys however they
like.” The original user prompt requested jumping on other players to catch a
flying key; it did not request shared controls or cooperative victory.

A replay of that saved source reproduced the problem: with one joined seat, four
climbers spawn, and that seat can jump each climber using a different direction.
Each jump also awards a point. A later user-requested ownership correction fixed
the cartridge's inputs, but its new brief still proposed different key pairs for
different seats and shared victory.

The runtime already routes each controller through `inputs[player.id]`. The
planner had only been told to support 1–4 players with WASD/arrows and Space,
without explaining independent devices or a competitive default. The old generic
validator also accepts shared wins and participation points as evidence of useful
input; it does not establish controller ownership or requested scoring semantics.

## Change

`builder/gameplay-policy.mjs` supplies the same rules to the design planner and
Codex's developer instructions, including resumed sessions:

- Competitive by default; explicit cooperative requests retain shared goals.
- One owned participant per joined seat, with the same controls on each device.
- Solo adapts the environment rather than controlling absent players.
- Turn-based and rotating games provide bounded off-turn interference. These seats
  use `interferer`, since the engine suppresses inputs for `waiting` seats.
- Rewards reflect objectives; separate per-seat winning traces replace invented
  points for moving, jumping, or pressing buttons.

Briefs now explicitly describe play style, controls, solo adaptation, multiplayer
outcomes, and off-turn interaction. A trusted policy version invalidates older or
incomplete cached briefs while preserving their exact generated media.
New games default to quick 15–30 second rounds, unless the user asks for longer.
Edits retain existing timing. All tie-breaks must have a fixed cutoff without input.

`builder/TOOLS.md` requires controller-isolation and interference comparisons.
These are instructions to the coding agent, not a claim that the generic validator
can prove arbitrary gameplay semantics. The targeted probes below independently
check the two generated candidates.

## Validation

- TypeScript check and production build passed.
- 36 focused generation, builder, music, background-response, budget, and project
  lifecycle tests passed, including current brief
  reuse, legacy brief replanning, incomplete checkpoint recovery, and pinned media.
- Live planner calls classified the original stacking prompt as competitive,
  an explicit cooperative variation as cooperative, and a turn-based frog launch
  game as competitive with limited off-turn croaks. All specify own-player control.
- Test image: `sandbox/microfinity-ownership-20260924:b8ce2102808166f28ded1`.
  Built by running `bl push -y` from the fresh allowlisted staging directory produced
  by `scripts/prepare-blaxel-image.ts`; the project checkout was not uploaded.
- Real builds reuse saved media to isolate the design/code changes. The frog
  example therefore uses the existing winged-key sprite; it is a mechanics probe,
  not a claim of finished frog artwork.
- The turn-based build completed in 245 seconds, including independent validation.
  Separate probes for 2, 3, and 4 players changed the same landing from 85 to 67
  points via one off-turn croak. Repeated croaks had no extra effect, and off-turn
  input could neither aim nor skip the active player's launch.
- The first stacking build aborted without an accepted artifact. A fresh retry produced
  `Keyspring`, which passed 90 isolated control checks (every seat across 1–4
  players and three seeds) and ten separate winning traces. Only catches scored.
  It passed the coding agent's validator, but the server's independent validation
  then hit the overall deadline. Both briefs had expanded the idea into 60-second
  rounds with overtime, making all the repeated play traces expensive. This led
  to the shorter new-game default above; no deadline or validation gate was relaxed.
- The subsequent 25-second candidate aborted before returning a validated result.
  Its exact final source was recovered from saved tool calls and matched the last
  server snapshot hash (`e3785b1a4e38267792f9846fef11a81ac1b4299f5a541745420bbe767972e75e`).
  A fresh independent validator rejected its fourth-seat trace: that seat timed
  out without catching the key. The other three four-player traces succeeded.
  This result must not be reported as an accepted generated game.
- A focused repair uses that exact source, its saved traces, and the specific
  fourth-seat failure rather than regenerating the design or media. Its image is
  `sandbox/microfinity-ownership-final-20260924:b1646b63e4e3c90a087a7`, which also
  explicitly tells the agent to bind the pinned soundtrack through `audio.music`.
- The focused repair completed in 190.6 seconds (including 36.3 seconds for the
  server's independent validation). Codex changed only the fourth-seat witness,
  leaving the cartridge source byte-for-byte unchanged. All ten winning traces
  passed, alongside idle comparisons, deterministic replays, stress runs, and
  renders. This is a successful repair of an existing candidate, not a fresh
  generation latency measurement.
- Further local probes on that accepted source passed 90 isolated left/right/jump
  checks, ten competitive wins covering every seat, and three off-turn interference
  comparisons. Each stacking winner actually stood on a head or the solo perch,
  then physically contacted the key. Movement and jumping alone never scored.
  The solo and four-player screenshots were visually inspected.
- The validation-only VM and both repair VMs were deleted. Final Blaxel inventory
  was empty. No validation thresholds or timeouts were relaxed.

Local evidence is in `artifacts/player-ownership/`: the reported source and briefs,
`reproduction.json`, planner outputs, sandbox source/witnesses/validation reports,
screenshots, and probe scripts. No existing creator project was edited or published.

Deployment must pair the updated server planner with the tested builder image;
updating only the server would leave Codex's old instructions in the pinned image.
