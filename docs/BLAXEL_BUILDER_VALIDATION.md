# Blaxel game-builder qualification

Historical local qualification, September 24, 2026, before production integration.
The current app uses Blaxel exclusively; this report preserves the original measurements.

## Measured result

**Drowse & Chomp** was generated in Blaxel, independently validated in another
Blaxel microVM, published to the isolated local arcade, and won through real browser
keyboard input. The published version is
`8cd2992e41db2a23789831a64d0f5499d62aae2d2d30bbec12449ed1b065c1ea`.

| Measurement | Observed result |
| --- | --- |
| Code model | GPT-6 Sol, medium reasoning, Codex 0.156.1 |
| Provisioning, input transfer and isolation checks | 26.1 s |
| Codex build and its own playtests | 186.6 s |
| Independent final validation | 21.5 s |
| Build through sandbox cleanup | **234.2 s (3m 54s)** |
| First independent progress screenshot | **113.7 s (1m 54s)** from builder start |
| New brief, artwork, cover and music | 34.5 s in the first attempt; reused after setup fixes |
| Cancellation after allocating both VMs | 192 ms through deletion; zero model calls |

These are individual observations, not latency percentiles. The successful build
timing excludes earlier setup failures and image construction. Images are prepared
once, rather than built for every game. The tested image was
`sandbox/microfinity-validation-final-20260924:babba1015ee932cc5af9f`.

Independent observation-based play policies passed **66 episodes** across three
seeds and all four player counts. Every seat could independently steer the shared
dragon and catch three marshmallows for the team. Idle play, held Space and movement
without a tap failed; the reactive policy won with exactly three catches. These
checks were separate from the agent's own witnesses.

Browser checks confirmed public library visibility, a keyboard win, loaded audio,
no page errors and no phone-width overflow. The owner studio also replayed its
progress events and displayed both saved screenshots with successfully decoded
images. The compiled local application exposed
an asset-route collision: the private-media route intercepted Vite's JS/CSS. The
local fix lets bundle requests reach static serving while content-addressed game
media retains its owner check. Actual HTTP checks returned 200 with correct MIME
types for bundles, 404 for an anonymous private snapshot, and 200 for its owner.

Evidence is under `artifacts/blaxel-validation/20260924/`: `report.json`,
`mechanics.json`, `browser-report.json`, `asset-routing.json`, `cleanup.json`, and
the successful turn directory `023bf8af45284043125cfc7c/` containing source,
witnesses, isolation proof, lifecycle timings and screenshots. Local guest/session
files are private and are not intended for sharing. Both temporary image
repositories and all test sandboxes were deleted after validation.

TypeScript checking, application build, 18 focused builder/project tests and the
dependency audit passed. The added SDK's pinned YAML parser dependency required a
patched transitive override; `npm audit` reports no vulnerabilities.

## Execution design

`BlaxelGameBuilder` implements the existing `GameBuilder` interface. The same
project/turn pipeline still generates media first, stores private revisions,
streams progress events, and publishes the selected immutable version. The app and local validation script now select this adapter exclusively.

Each build creates two disposable 4 GiB microVMs from a prepared, versioned image:
one for Codex and one for independent screenshots and final validation. Both are
deleted on completion or failure. A 20-minute provider expiration also bounds
orphans after loss of the orchestrator. There are no persistent volumes or public
sandbox previews. The completed game runs in the application without a builder VM.

The image contains the existing SDK, compiler, QuickJS runtime, Chromium, and
Codex app-server 0.156.1. Image preparation uploads an explicit toolkit allowlist,
excluding `.env`, source history, application data, transcripts and local artifacts.
Each turn separately receives its pinned media and a directory of named cartridge
sources, filtered to public versions and the creator's own private versions. There
is no cartridge index.

The OpenAI key and Blaxel login remain in the trusted local orchestrator. A bounded
Unix-socket relay inside the microVM exchanges request/response files over Blaxel's
authenticated management connection. `ModelPolicy` runs locally and fixes the
model, effort, endpoint, tools, token budget and deadline. The qualification bridge
buffers each model response before forwarding it; it is not a streaming transport
benchmark.

The agent runs as UID 10001, without capabilities or privilege escalation, inside
separate network, PID, mount and other Linux namespaces. Only its work and scratch
directories are writable. Toolkit, inputs and references are read-only; management
metadata and control files are hidden. Its only model access is the bounded Unix
socket. This is necessary because Blaxel's documented
[domain filtering](https://docs.blaxel.ai/Sandboxes/Proxy-domains) currently depends
on clients respecting proxy variables and is not a routing-level boundary.
Short prompts remain a UX/budget limit, not the injection defense.

## Setup failures exercised and corrected

- Nested user namespaces initially mapped the writable directories to the wrong
  identity. Dropping to UID 10001 *before* creating namespaces fixed this. Startup
  now verifies writable work/scratch directories as well as denied access.
- Applying a file-size rlimit to the whole agent broke Chromium's temporary
  shared-memory files. The same game/media failed with the limit and passed without
  it. A trusted supervisor now caps exported stdout/stderr instead, leaving browser
  temporary files usable. See `chromium-limit-regression.json` in the run artifacts.
- Failed starts deleted both microVMs. No model requests were made by the first
  two failed starts. The later renderer-debugging attempt was explicitly stopped;
  its timings are not included in the successful-run timing.

## Reproduce locally

The official `blaxel-cli` and `blaxel-sdk` skills, `bl` sign-in and an existing
local model-provider configuration are prerequisites. No credentials are put in
the sandbox or the image.

```sh
node --import tsx scripts/prepare-blaxel-image.ts artifacts/blaxel-image microfinity-builder-check
(cd artifacts/blaxel-image && bl push -y)
bl get image sandbox/microfinity-builder-check --latest
```

Use the returned versioned image reference, not `:latest`:

```sh
BLAXEL_BUILDER_IMAGE=sandbox/microfinity-builder-check:RETURNED_TAG \
BUILDER_VALIDATION_DIR=artifacts/blaxel-validation/new-run \
node --import tsx scripts/validate-builder.ts 'Describe a short game here.'
```

This script uses an isolated local PGlite database even if `DATABASE_URL` is set,
generates media, builds, validates and publishes locally. A failed run can be
retried with the same directory and `BUILDER_VALIDATION_RETRY=1`, preserving media.
`scripts/validate-blaxel-cancellation.ts <run-directory>` separately verifies cleanup
after cancellation with both VMs allocated, without spending another model call.

These original measurements do not establish high-concurrency capacity or latency
percentiles. Current worker-crash cleanup also uses database-owned sandbox leases;
see [the current architecture](SANDBOXED_GAME_BUILDER.md).


## Release integration checks

The release adapter uses Blaxel exclusively, with pinned image
`sandbox/microfinity-builder-ecr-20260924:be556ffdfe75e855febfb`.
Two owners built revisions concurrently in 167.3 and 185.4 seconds; the first
owner then resumed the same Codex thread in new VMs and published the next
revision in another 136.6 seconds. The published local version is
`1cc1e2d047089d760656af7b67e4785fcfde6de249fa6dcb4905a82a8e981b96`.
These runs reused media; they are not fresh-media timing measurements.

The revised game's mechanics passed 66 independent episodes across 1–4 players
and three seeds. Chrome displayed the published Midnight Marshmallows cartridge
and rendered its changed purple sky. HTTP checks confirmed built JavaScript and
legacy cartridge runtime serving, owner screenshot access, and anonymous denial.
The real recovery probe retained a healthy VM, replaced its expired worker lease,
then removed that VM in 2.7 seconds without a model call. All test VMs were removed.

The full server suite passed 124 tests, UI suite passed three, and the final
project suite passed ten. Typechecking, production builds and dependency audit
passed. The migration ran twice against an isolated production database copy,
preserving source/compiled hashes for 26 versions and record hashes for 175 results;
three historical creations became project histories. The temporary database was
removed. Production's backup completed successfully before release preparation.

Evidence: `artifacts/blaxel-release/studio/report.json`,
`studio/mechanics.json`, `recovery-verified/report.json`, `asset-routing.json`,
`migration.json`, and test/build logs. This is release preparation evidence, not
proof that the production switch or credential setup has occurred.

The toolkit's original Docker Hub base pull failed without provider diagnostics;
using the same Node version from the public ECR mirror built successfully.
Run image pushes from inside the clean staging directory: the Blaxel `--directory`
flag archives the process working directory. Preparation now refuses nonempty
staging folders, and the checkout has an additional explicit upload allowlist.
