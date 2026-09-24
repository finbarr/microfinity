# Interactive game studio: local validation

Validated September 24, 2026. No production configuration, data or deployment was changed.

## Implemented behavior

The former one-shot job creation flow is replaced by one project/turn pipeline.
The studio saves conversations, shows independently rendered progress screenshots,
lets the creator play private revisions, submit short changes with optional replay
feedback, select or undo revisions, stop/retry work and explicitly publish the exact
selected version. Completed art and music are reused unless regeneration is requested.
Published games already in a party remain pinned to their original version.

Codex app-server 0.156.1 runs over stdio in a fresh rootless Podman sandbox per turn.
The browser talks to the authenticated project API and event stream. Bounded private
thread snapshots restore conversation context after every container has been removed;
long contexts rebase from selected source and accepted ancestor requests. Public and
owner-authorized cartridge references are named TypeScript files, with no index.

PostgreSQL supports separate workers with durable claims, one active turn per owner,
global/per-process limits, fenced completions, idempotent submission and lease recovery.
PGlite uses the same pipeline with an embedded worker. Screenshots and final validation
share a separate bounded pool; validation takes priority. Render leases expire within
30 seconds after process loss and renew while live. Cancellation fences the turn before
subprocess cleanup. Private browser play uses no builder slot.

## Real model and browser results

The tests used **GPT-6 Sol / medium** for code, Sol for briefs, the existing image
provider and music pipeline. The default code model remains Astra / high; the measured
Sol configuration was explicitly set for these experiments. The local Podman VM had
four CPUs and 8 GiB RAM. These are individual observations, not latency percentiles.

| Run | Measured duration | Outcome |
| --- | --- | --- |
| Fresh Moon Moth, including new artwork, cover and music | 223 s | Private playable revision, progress screenshots before completion |
| Concurrent second creator, dragon remix with reused media | 151 s | Midnight Marshmallows, independently validated |
| Moon Moth: change win target from three stars to four | 130 s backend / 131 s browser polling | Same Codex thread resumed; media unchanged; playable edited revision |
| Bridge probe: change dragon sky to purple | 93.7 s | First screenshot at 28.0 s; independent validation passed |
| Bridge probe: rename to Midnight Marshmallows after destroying all containers | 60.6 s | Same thread restored; screenshot at 28.2 s; independent validation passed |
| Retry the stopped edit from the UI, using the finished worker/image | 103 s | Ready second revision, exact artwork/music reused, independent validation passed |
| Stop a live edit after its builder started | 3.3 s to observed cleanup | No remaining turn containers, no late revision, prior selection preserved |

The browser completed **create → play → change with attached replay → play → undo →
select → publish → reload**. Real keyboard play caught three stars in the original
and four in the edit. The published version hash was
`fad9e0afc50d30d463005ed8da3e7122400abe94c2b703f6c07c6b8244c8b8cf`;
the public library and version endpoint returned that exact selected revision.

Independent observation-based play policies ran **72 episodes**: two revisions,
1–4 players, seeds 1/713/991, and reactive/idle/held-Space policies. Reactive play won
at exactly the requested target and awarded the expected score to all pressing
players. Idle and continuously held Space failed with zero catches. These checks
were written separately from the model's submitted witness traces.

Browser checks covered desktop, 390×844 portrait and 844×390 landscape, four-player
preview and controlled-seat switching, actual touch events on the virtual pad,
touch release, chat focus releasing held keyboard input, saved conversation reopening,
scroll-to-latest behavior and mobile New game opening the composer. No horizontal
overflow or browser exceptions were observed. Automated audio loading/media identity
was checked; this run did not include subjective listening or a second browser engine.

Local evidence is in `artifacts/interactive-studio/`:

- `browser-refine-report.json`: real play, edit, media reuse, undo, publish and reload.
- `mechanics-episodes.json`: independent rule checks for all 72 episodes.
- `mechanics-and-access.json`: rule results and authenticated HTTP/event-stream checks.
- `ui-final-report.json`: desktop/phone, seat switching, keyboard focus and touch.
- `cancel-report.json`: cancellation and actual Podman cleanup.
- `retry-report.json`: real UI retry through the final worker and tested image.
- `editor-progress.png`, `preview-win.png`, `editor-final-desktop.png`,
  `editor-final-phone-play.png`, `editor-final-phone-chat.png`,
  `editor-final-landscape.png`: actual rendered browser evidence.

The bridge evidence is in `artifacts/interactive-bridge/1790285474592/`. Raw thread
snapshots, model diagnostics and guest storage files are private local records, not
frontend payloads or public repository artifacts.

## Parallel users, recovery and privacy

Two real creators generated concurrently in separate containers. A separate test
used **eight owners and two independent OS worker processes** against real PostgreSQL,
with a global cap of four active turns. One process was killed with SIGKILL while
both were working. Its two turns recovered exactly once; the healthy worker's turn
stayed on attempt one; all eight completed. The fixture queue test took 30 seconds
including process startup. Its builds were deterministic fixtures: this establishes
queue/recovery behavior, **not eight-model throughput**.

HTTP checks denied another owner and an unauthenticated client access to the project,
conversation stream, unpublished source and progress screenshots. Publishing the
edited revision did not expose the older private source or development images. Event
reconnection with a cursor returned only later events; a regression test covers
numeric ordering across 9/10/99/100 and the 100-event page boundary. Thread rollout
files were absent from the project response. The retired `/api/jobs` route returned 404.

Tests also cover duplicate/conflicting request IDs, short messages, per-owner writers,
queued edits choosing the completed base, failed edits preserving saved versions,
selection changes while a turn completes, cancellation rejecting late writes,
healthy leases surviving another Store startup, exhausted attempts, and retries
preserving completed regenerated media and original playtest feedback.

The real sandbox probe passed non-root UID, read-only filesystem, no credentials,
no external network, no engine socket, no capabilities, seccomp, no-new-privileges,
memory/tmpfs/PID limits, external deadline and cancellation cleanup checks. Shared-host
containers still share the host kernel; short prompts are scope limits, not an
injection defense.

## Commands and deployment boundary

Automated validation passed: the 123-test Node suite, the additional event-replay
regression test, three TSX tests, `npm run check`, `npm run build` and `git diff --check`.

```sh
# Real creation and local publication into a fresh isolated PGlite database.
BUILDER_MODEL=gpt-6-sol BUILDER_REASONING_EFFORT=medium \
  node --import tsx scripts/validate-builder.ts "Your short game prompt"

# Two edits across disposable sandboxes, using the saved project above as input.
node --import tsx scripts/probe-interactive-builder.ts artifacts/builder-validation/<run>

# Existing isolation probe; uses the configured/default local toolkit image.
node --import tsx scripts/probe-builder.ts

# Temporary schema, eight owners, two OS workers and SIGKILL recovery.
STUDIO_TEST_DATABASE_URL=postgresql://...@127.0.0.1:55432/microfinity_studio \
  node --import tsx scripts/validate-project-concurrency.ts
```

The tested toolkit image is
`01f2543b9881b070dcf42ddb16ba4c1f337ec3a83e47102f4d1f8c74187db3e0`,
locally tagged `localhost/microfinity-builder:dev` and `:interactive`.

The local app is available on port 3109 with separate PostgreSQL and builder workers.
No production-sized 4/8-model saturation test or live-room latency-under-load claim is
made here. Before choosing production concurrency, measure representative gameplay
alongside compilation and Chromium peaks. The parent cgroup hook is implemented but
its deployment slice is operator-provisioned. Remote workers require shared asset
storage in addition to PostgreSQL; no managed sandbox provider was integrated.
