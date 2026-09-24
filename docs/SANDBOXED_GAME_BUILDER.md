# Sandboxed Codex game builder

Blaxel is the sole execution provider. The trusted worker stays beside PostgreSQL
and asset storage; compilation, browser rendering and model-authored commands run
in disposable cloud microVMs. There is no local container fallback.

## Turn lifecycle

1. Claim a queued project turn under a renewable database lease.
2. Generate the brief, artwork, cover and soundtrack, or reuse the selected revision's media.
3. Package read-only inputs, media and named cartridge `.ts` references. There is no index.
4. Allocate two 4 GiB microVMs from the same immutable toolkit image: Codex and validation.
5. Run Codex app-server over private stdio. Collect changed source every 20 seconds;
   render it independently and persist owner-only progress screenshots.
6. Collect only bounded `output.ts`, JSON input witnesses and session data. The
   independent validator compiles, simulates and renders the final source.
7. Save a private playable revision and delete both VMs. Publish promotes the exact
   selected validated version; existing rooms keep their pinned versions.

The app and `scripts/validate-builder.ts` use this same implementation. A complete
local example with independent gameplay evidence is recorded in
[Blaxel qualification](BLAXEL_BUILDER_VALIDATION.md).

## Toolkit and credentials

Follow the image commands in [README](../README.md). Preparation copies an explicit
allowlist, excluding application state, `.env`, transcripts, artifacts and Git
history. Pin `BLAXEL_BUILDER_IMAGE` to the returned version tag. The image contains
Codex 0.156.1, the SDK, compiler, QuickJS, Chromium and the trusted authoring tools.
`BUILDER_MODEL` defaults to `gpt-6-sol`; reasoning defaults to `medium`.

Local development uses `bl login`. The service needs an approved Blaxel service
credential in its protected environment. Model and Blaxel credentials stay in the
trusted application worker, never in the image, input archive or coding process.
A credential-free root supervisor exchanges bounded files over Blaxel's management
connection and serves one Unix socket inside the coding VM. The trusted worker
applies `ModelPolicy` before each model call and buffers the response for the relay.

## Isolation

Each VM starts the workload as UID 10001 before entering separate user, network,
PID and mount namespaces through bubblewrap. The workload has no capabilities,
no privilege escalation, no external network and no access to the management API.
Startup actively probes these boundaries. A failed probe fails the turn.

| Path | Access |
| --- | --- |
| `/kit` | Read-only SDK, tools and runtime |
| `/input`, `/media`, `/references` | Read-only turn data |
| `/work`, `/scratch` | Writable, confined to this disposable VM |
| `/control`, `/bl`, `/root` | Hidden from the workload |
| `/bridge/model.sock` | Bounded model request capability, coding VM only |

The reference folder contains every built-in, public saved version and this owner's
private versions as named `.ts` files. Names include immutable hashes. The 32 MB
collection limit fails explicitly rather than silently omitting games.

The broker pins endpoint, model and reasoning, rejects hosted tools, remote files,
stored conversations and item references, and enforces 40 calls, 8 MB cumulative
input, 120,000 output tokens and a ten-minute deadline. The whole turn allows
fifteen minutes including media. Agent stdout and stderr have independent byte
limits. The VM bounds memory and disk; it expires after 20 minutes even if the
orchestrator disappears. Prompts are short for scope and cost, not security.

Model-authored `output.ts` never executes as Node code on the app host. Rules run
in QuickJS inside the outer VM. Independent validation enforces strict types and
imports, deterministic replays, bounded termination, finite scores, explicit
outcomes, artwork use, useful play versus idle for 1–4 players, solo winning and
losing traces, additional seeded inputs, and Chromium screenshots. Only the
validator's compiled bytes and metadata enter the immutable revision.

These checks establish runnable interactive cartridges. They cannot prove fidelity
to every arbitrary request or visual quality. Release acceptance also checks the
requested mechanics independently and exercises actual browser input.

## Recovery and concurrent creators

The database queue admits one active turn per owner and a configurable global
count, with per-process slots. Worker leases last 30 seconds and renew every
second. Every write verifies worker identity, lease generation and expiry. Cancel
invalidates the lease first, preventing late results from becoming revisions.
Expired work is retried at most once, retaining successful media checkpoints.

`builder_sandboxes` records allocation intent before each cloud request. The
reaper deletes only resources whose recorded turn no longer owns its lease; it
never scans or deletes unrelated workspace resources. Failed deletion remains
retryable. A tombstone survives through the VM expiration window to catch a late
allocation from a crashed worker. Normal completion removes both VMs and records.
No VM remains allocated while the creator plays or thinks about the next edit.

Bounded Codex session files restore conversation state in a fresh VM. Only rollout
data files are restored, never settings, hooks, credentials or executable tools.
Long histories continue from the selected source and accepted ancestor requests.

## Validation commands

```sh
npm run check
npm test
node --import tsx --test tests/*.test.tsx
npm run build
node --import tsx scripts/validate-builder.ts 'Describe a short game here.'
node --import tsx scripts/probe-interactive-builder.ts artifacts/builder-validation/RUN
node --import tsx scripts/validate-blaxel-cancellation.ts artifacts/builder-validation/RUN
```

Validation scripts use explicitly isolated local data and real Blaxel VMs; they
never publish into production. Private guest/session files stay in ignored
artifacts. `scripts/validate-project-concurrency.ts` additionally tests PostgreSQL
queue admission and process-death recovery with fixture builds.
