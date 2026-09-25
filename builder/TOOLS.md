# Local game tools

Run `game-tool check /work/output.ts` for strict TypeScript, SDK restrictions and
bounded preflight for every party size. Errors are real compiler/runtime errors.
Tool runs are serialized to fit the worker memory budget. Wait for each to finish.

Write a trace JSON, e.g. `{"name":"press","players":1,"seed":1,"steps":[{"frames":1,"actions":{"p0":1}},{"frames":1,"actions":{"p0":0}}]}`.
Run `game-tool simulate /work/output.ts /scratch/trace.json` to see sampled player
observations, draw commands, final scores and outcomes. One frame is 1/60 second.
Unlisted players are idle; after your steps the simulation idles until termination.
Each action is a number: 0 idle, 1 Space, 2 up, 3 up+Space, 4 down, 5 down+Space,
6 left, 7 left+Space, 8 right, 9 right+Space, 10 up-left, 11 up-left+Space,
12 up-right, 13 up-right+Space, 14 down-left, 15 down-left+Space,
16 down-right, 17 down-right+Space. Release (0) between repeated presses.

Run `game-tool render /work/output.ts /scratch/trace.json /scratch/game.png`.
It renders real draw commands with the supplied sprite, using the browser renderer.
Inspect the PNG with your image tool. Images are 640x400, just like the actual game.

Write an array of 4–12 traces to `/scratch/witnesses.json`, covering 1,2,3,4 players.
Every solo entry must win. Keep idle/failure experiments in separate files;
`validate` automatically runs a same-seed idle comparison for every witness.
Run `game-tool validate /work/output.ts /scratch/witnesses.json` (redirect stdout to
/scratch/validation.json because the report includes PNGs). Validation requires:

- Matching id/clock, native [1,4] support, public rules, supplied sprite declared/drawn.
- Finite scores, explicit outcomes, bounded endings and deterministic replays.
- Solo success with useful inputs and failure when idle at the same seed.
- For each party size, witnesses where each player's score/outcome differs from idle.
- Independent stress runs. Valid draw buffers for every seat with and without assets.

These checks do not prove requested mechanics or visual quality; inspect and play the
game yourself. Use traces to exercise the specific mechanic in the original request.
For ownership, compare same-seed runs with only one seat moving/jumping at a time:
its input must directly control only its own participant, including with 1–4 seats.
Allow physical interactions with others, but never route that input to their controls.
For rotating/turn-based play, compare identical active-player inputs with versus
without an off-turn player's action. Verify the advertised interference changes
play, respects its limit, and cannot take over or skip the active player's turn.
For competitive games, use separate winning traces per seat where needed (1+2+3+4
is ten traces). Do not add unrelated participation points to satisfy validation.
All checks run in the container; /kit is immutable. Only output.ts is published.
