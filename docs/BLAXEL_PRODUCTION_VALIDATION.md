# Blaxel production validation

Initial cutover verified September 24, 2026 (Pacific time), on application release
`77b54b8`. The subsequent release `26f84d3` adds
[multiplayer defaults](MULTIPLAYER_GENERATION_VALIDATION.md) and the
[music deadline fix](GENERATION_MUSIC_STALL.md) at https://microfinity.lol.
Blaxel is the only game-building backend; the web app
and a separate trusted builder worker run on the existing server.

## Deployment

- Installed the explicitly approved dedicated service credential in the existing
  root-owned `0600` providers file. No credential values were printed or included
  in an image or sandbox.
- Verified workspace access and the pinned image before activating the release:
  `sandbox/microfinity-builder-ecr-20260924:be556ffdfe75e855febfb`.
- Ran a fresh database/assets backup. Rehearsed the additive migration twice on
  a disposable production database copy. All 26 existing source/code records
  and 175 completed results retained their hashes through migration.
- Built on the Linux host as the application user. TypeScript, production build,
  and public health/static assets/database/room/WebSocket smoke checks passed.
- Both services are active with no automatic restarts. Admission is four active
  turns, each using separate coding and validation microVMs.

## Live studio acceptance

Created **Moonbell Meadow** through the production browser, generated art and
music, received four development snapshots, played private revisions, submitted
two conversational edits, published the selected revision, and played it from
the public arcade. The public match recorded **3 rings, success**.

Published version:
`63a038735e0541df957283e8f1243042eec768d46002a178673a6ca49a1a5fa2`.

The final game's independent probe ran 48 episodes: three seeds, 1–4 players,
and reactive, idle, held-button, and early-press policies. Every reactive player
earned three rings and succeeded; every other policy failed with zero rings.
The final browser preview also showed a three-ring win with all hearts intact.

Anonymous access to the draft conversation/events was rejected and draft
artwork/screenshots returned 404. After publication, the exact selected source,
runtime, sprite, soundtrack and cover were publicly accessible. The library now
contains 13 cartridges. Existing games remained playable during cloud builds.

| Turn | Time | Result |
| --- | ---: | --- |
| Initial attempt | 72 seconds | Failed before Codex started; saved media retained |
| Retry with saved media | 203 seconds | First playable revision; first snapshot at 115 seconds |
| Automatic bell assignment and clearer cue | 265 seconds | Ready; follow-up corrected unwanted multiplayer key mapping |
| Space for every player's own controller | 143 seconds | Final revision, independently tested and published |

These are observed turn durations, not guaranteed latency. The first successful
turn reused media from the failed attempt; 203 seconds is not a fresh all-in
media-plus-code generation measurement. Code generation used `gpt-6-sol` with
medium reasoning.

The first edit resumed the original Codex thread in fresh VMs. Its saved session
grew to roughly 1 MB, exceeding the existing 650,000-character resume budget.
The next edit therefore started a new thread with the exact selected source,
media, witnesses and accepted change history. Conversation continuity is durable;
an unchanged internal Codex thread ID is not promised indefinitely.

## Issues found and fixed during acceptance

1. The production worker's `umask 0077` made extracted inputs unreadable to UID
   10001. A real cloud regression check reproduced `EACCES`, then verified the
   fix: normalize only uploaded sandbox inputs to read-only, readable modes.
   Host staging remains private. Each sandbox now checks readable inputs before
   starting Codex.
2. Quick press/release pairs could collapse between preview frames. The preview
   now buffers ordered transitions so short taps reach gameplay and saved
   replays. Five focused input tests passed, including the two new regressions.
   Browser taps then produced both penalties and successful timed rings.
3. One generated edit unnecessarily assigned different buttons to different
   players. The independent multiplayer probe caught this despite technical
   validation passing. A conversational correction restored Space for everyone;
   all 48 gameplay probes and the browser win then passed. Technical validation
   does not guarantee that a generated game preserves every requested mechanic.

At completion: zero queued/working turns, zero sandbox leases, and no Blaxel
sandboxes remaining. The server held 13 games, 29 versions and 177 results.
Playing published games does not keep a builder sandbox running.

Local evidence is under the ignored `artifacts/blaxel-release/` directory:
`deployment.json`, `live-status.json`, `live-access.json`,
`permission-regression.json`, and `moonbell-mechanics.json`.
