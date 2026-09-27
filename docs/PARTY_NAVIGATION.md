# Party continuation and browser navigation

Implemented and validated locally. Not deployed.

The arcade now uses URL-backed history for the studio, saved projects, remixes,
library filters, party invites and saved match results. Back and Forward restore
the corresponding screen. Closing a results dialog returns to its parent history
entry. A challenge link resolves to a room once and replaces its URL so history
does not repeatedly create parties.

The host can create a party, share its invite, choose up to twelve games or start
an empty selection with a random lineup. After a match, **Choose new games** takes
everyone to the same lobby with an empty playlist. **Play these games again**
remains available. **Manage party** offers a connected friend as the next host
while leaving in the same server operation, or disbands the party for everyone.
Friends can leave independently. All authority checks happen on the server.

Ratings are optional and individual. They remain accessible in the returned
lobby and in saved results after leaving or disbanding. Completed results retain
the original names and scores. Departed lobby seats are removed, and returning
to the lobby drops leftover AI seats before the next lineup determines its needs.

## Validation

- TypeScript and the production build pass.
- 27 distinct focused tests pass across routing, party setup/lifecycle, ratings,
  socket sequencing, name updates, countdown timing, checkpoints and preview input.
- Two independent guests used the full local app and WebSocket server to create
  and join a party, select two cartridges, complete both rounds, return together,
  submit independent ratings (5 and 3 stars), and complete another random lineup.
- The original host handed off and left. Browser Back rejoined as a friend without
  reclaiming hosting. Disband returned both users home. A fresh disbanded invite
  immediately displayed the closed-party recovery action before the cleanup sweep.
- Browser Back/Forward restored the studio and saved-results dialog. Studio visits
  retained the party connection. Saved results still offered ratings after disband.
- At 390px, host-management actions fit without horizontal overflow. The viewport
  override was reset. Local screenshots and test logs are under
  `artifacts/party-navigation/`.

Run `node --import tsx scripts/preview-party.ts` and open
`http://127.0.0.1:4318/`. This starts the actual app on a fresh temporary database
with two clearly labeled three-second fixture cartridges and no generation worker
or model credentials. For a second independent local guest, use `localhost:4318`
with the same invite's room ID. The browser verification uses fixture games to
exercise multiplayer lifecycle and navigation, not to evaluate generated quality.
