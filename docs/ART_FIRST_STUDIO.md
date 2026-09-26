# Art-first cartridge studio

Implemented and validated locally on September 26, 2026. This change has not been
deployed to production.

Creation now has a durable art-review checkpoint:

1. The creator describes a game. The planner, gameplay sprite and cartridge cover
   run first. No music request or coding sandbox starts in this turn.
2. The cartridge displays its cover, title, description and game art. Images can
   be inspected at full size. Feedback can replace the cover, game art, or both;
   untouched assets are retained. The latest direction is passed directly to image
   requests so a long conversation cannot truncate it away.
3. **Build this game** approves the exact completed art turn. Only then does a new
   turn compose music and invoke the existing builder and independent validator.
   The cartridge fills with actual progress and gameplay snapshots.
4. The playable version supports the existing conversational edits and publication.
   Requesting new artwork returns to art review. The last playable version remains
   accessible while its next look is being reviewed.

`art_ready` is terminal for the art turn: no worker slot, live sandbox, or timer is
held during review. Reopening restores the cartridge and review actions. Approval
is owner-scoped, checks the latest art and selected game, and is idempotent. Stale
or duplicate approvals cannot start another build. Retries preserve the original
phase and any completed media. All generated versions remain private until the
creator publishes them. No database migration or builder-image change is needed.

The product routes are shared between production and the isolated local acceptance
studio. `POST /api/projects/:id/build` takes `{requestId, artTurnId}`; ordinary
messages cannot supply an internal build phase or bypass initial art approval.
The old direct new-project-to-code flow and detached media strip are removed.

## Validation

- TypeScript and production build passed.
- 35 distinct focused tests passed across projects, generation, music, background
  responses, budgets, and cartridge icons. Coverage includes owner isolation,
  idempotency, stale approval, saved review, cover-only refinement, retry checkpoints,
  media deadlines, publication, and preserving the latest image feedback.
- Browser acceptance used the real UI, HTTP project routes, storage and orchestration
  with deterministic image/music/builder replacements. Before approval: two brief
  calls, three image calls (initial pair plus cover revision), zero music calls,
  zero builds. After approval: one music call and one build. The game rendered in
  the browser and was published only into the isolated local database.
- Reopening preserved the review. Full-size image inspection and feedback focus
  worked. At 390px width the document was also 390px wide, with review actions and
  feedback accessible. The temporary mobile viewport was reset afterward.
- Reduced-motion styling disables cartridge reveal/loading animations. Existing
  game-preview behavior and production model routing are unchanged.

Run the offline studio with:

```sh
node --import tsx scripts/preview-art-studio.ts
```

Open `http://127.0.0.1:4317/tests/fixtures/art-studio.html`. The preview is explicitly
labeled as fixture art and game; it makes no real model calls or cloud allocations.
It uses a fresh temporary database, and its game builder returns the built-in toast
cartridge to exercise the creation/play/publication path. It is not evidence of
new model-generated game quality or generation latency.

Screenshot evidence: `artifacts/art-first-studio/desktop-review.png`.
