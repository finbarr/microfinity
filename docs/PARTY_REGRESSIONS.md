# Start and playlist regression checks

The client no longer sends an unchanged `creating: false` lobby update after
Quick Play has already sent `start`. Presence synchronization checks the current
room and pending start, and still reports entering and leaving the party studio.
The server continues to reject actual setup changes outside the lobby.

The first-round cartridge intro mounts during preparation, covering the cabinet
while its renderer and assets load. It stays mounted through the authoritative
countdown. Space/Enter cannot dismiss the loading stage; skipping becomes
available during countdown and does not start gameplay early.

Playlist updates retain button focus using `aria-disabled` while the request is
pending, with click handlers enforcing the temporary lock. Permanent restrictions
(non-host, disconnected, unavailable cartridge) still use native `disabled`.
The clicked cartridge anchors selection layout changes before paint, including
in browsers without native scroll anchoring.

## Local verification

Run `node --import tsx scripts/preview-party.ts`, then open
`http://127.0.0.1:4318/tests/fixtures/party-regressions.html`. This uses the actual
application and socket server with a separate temporary database, two short
fixture games, and no generation worker or provider calls.

The **Regression trace** panel records commands (without credentials), painted
screen transitions, scroll position, focus, and PASS/FAIL checks. It can delay
cartridge loading by one second or disable native scroll anchoring. Refreshing
a routed URL outside `/tests/fixtures/` opens the ordinary app; reopen the
fixture URL to resume recording.

Checked locally on 2026-09-26:

- Direct solo Play and random Quick Play finish without a lobby-setting error.
  Neither sends a redundant `creating` command after `start`.
- A deliberately slow load shows the full-screen cartridge loader before the
  cabinet. Both players see the same loading/countdown order; multi-round play
  and rematches finish normally. Space during preparation is ignored, and
  countdown skipping preserves the server's start time.
- The first plus selection, subsequent selection, and last removal keep the
  cartridge in place and retain focus. Measured displacement is **0px**, including
  desktop with native anchoring disabled and a **390 × 844** phone viewport.
  Right-arrow navigation continues to the next cartridge after a party update.
- Studio entry, browser Back/Forward, and Return to party send the expected
  `creating: true/false` transitions. A second guest sees the studio presence and
  stays connected through return to the lobby and another match.
- 23 focused tests pass across routing, party flow/UI, countdown, gameplay timing,
  and preview input. `npm run check`, `npm run build`, and `git diff --check` pass.

Local traces and screenshots are under `artifacts/party-regressions/` (ignored by
Git). These fixes have not been deployed.
