# Interactive game builder

A game is a durable project with a conversation and immutable revisions. The
creator can play the last working revision while another edit runs. Blaxel
microVMs exist only during active coding or validation, not for open editors.

## Creator flow

1. Enter an idea of 12–600 characters. Media appears as it is generated.
2. Watch actual independently rendered source checkpoints in the conversation.
3. Play a validated revision in the editor, with 1–4-player simulation available.
4. Request a change using 1–600 characters. Reuse media unless explicitly regenerated.
5. Select or undo revisions without rerunning the builder.
6. Publish the exact selected revision. Later edits remain private until published.

Desktop shows chat and play together; phones have Chat and Play tabs. Playtest
feedback carries the revision, seed, player count and bounded input replay so a
reported problem can be reproduced. Editor play does not record public scores.

## Durable state and scheduling

`projects` stores ownership, original idea, selected/published revision and media.
`project_turns` stores queued work, leases, attempts and media checkpoints.
`project_revisions` stores immutable versions, parent links, validation and private
Codex session snapshots. `project_events` stores ordered SSE progress, assistant
messages and owner-only screenshots. Request IDs make browser retries idempotent.

PostgreSQL admission serializes claims across workers, limits global active turns,
and permits one active turn per owner. Per-process slots can further limit a
worker. The current admission bounds are 64 queued/working turns globally, four
per owner, 24 attempts and 20 messages per project, plus request-rate limits.
These are admission controls, not a measured claim of unlimited capacity.

All writes are fenced by worker identity, lease generation and expiry. The
30-second lease renews every second; cancellation invalidates it immediately.
Recovery requeues expired work once and reuses saved media. `builder_sandboxes`
records cloud allocation intent and lets another worker reclaim stale resources.
A provider-enforced 20-minute expiration independently bounds orphan lifetimes.

## Agent bridge

Each turn uploads the selected source, bounded conversation data, media and a
folder of named reference cartridges to fresh Blaxel microVMs. The source of
truth after undo is the selected revision and its ancestor requests. Large
session histories start a clean thread from that state.

Codex app-server uses private stdio inside a namespace-isolated unprivileged
process. The microVM's trusted relay has no model credential. It exchanges bounded
request/response files with the application worker through Blaxel's authenticated
connection. The worker pins model access and budgets outside agent control.
No browser-to-sandbox bridge or public sandbox preview is required.

A separate microVM renders source checkpoints and validates the final artifact.
Only the validator's compiled output becomes playable. Both VMs are deleted at
turn completion, failure or cancellation. See [sandbox controls](SANDBOXED_GAME_BUILDER.md).

## Privacy and publication

Owner checks apply to projects, draft source, progress events, media and references.
The reference directory includes public games and this owner's private games,
with no index. Codex rollouts never appear in the public API. Publication changes
the selected version and its assets to public atomically; existing parties retain
the exact versions with which they started.

The prior job-generation endpoints and showcase UI have been removed. Historical
completed jobs are migrated into project history, retaining old project links and
published cartridges. Legacy rows remain only as data, not an executable flow.

## Operations and evidence

The app may embed a worker for local PGlite development. Production runs a separate
systemd worker against the same PostgreSQL and filesystem assets. Rendering and
compilation consume cloud VM resources rather than competing with live matches.
The trusted worker still handles media generation, model brokering and storage;
its concurrency remains bounded and can be increased after measurement.

See [local studio validation](INTERACTIVE_BUILDER_VALIDATION.md),
[Blaxel validation](BLAXEL_BUILDER_VALIDATION.md), and
[deployment](../deploy/README.md). Historical Podman measurements document the
prototype; the current application has one builder implementation, Blaxel.
