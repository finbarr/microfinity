# Microfinity

An open-source browser arcade for multiplayer microgames and prompt-created cartridges. **In active development; the full goal is not yet complete.** Scope and acceptance remain in [SPEC.md](SPEC.md).

## Run locally

Requires Node.js 22.12 or newer and npm. PostgreSQL runs locally through PGlite by default; Docker is not needed.

```sh
npm ci
cp .env.example .env   # Only for a new setup; do not overwrite an existing .env.
# Add OPENAI_API_KEY and TYPESAFE_API_KEY to .env.
npm run seed
npm run dev
```

Open http://localhost:3000. The library also seeds automatically when the database is empty. Keep API keys in your local `.env`; it must never be committed. Model identifiers are configurable. `DATABASE_URL` switches storage to an external PostgreSQL server.

```sh
npm run check
npm test
npm run test:episodes
npm run build
npm start
```

`npm start` explicitly selects production mode and serves `dist/client`; `npm run dev` enables Vite and hot reload. Keep the repository source and `server/migrations` alongside the production build: runtime compilation reads the SDK type declarations. Assets, the local database, versions, challenges, and results are stored under `data/`; set `DATA_DIR` to use another directory. Stop the server before opening, moving or copying its PGlite database from another process. A restart ends active rooms. Completed scores and member-only match summaries survive. An unfinished round receives no final score; persisted challenges can be started again. Historical recording rows remain in storage but are not served as playback data.

The game studio keeps a conversation beside a playable preview. Creation and follow-up edits use one pipeline: prepare or reuse media, run Codex in a disposable Blaxel microVM, capture progress screenshots, independently validate, and save a private immutable revision. Play, undo or select a revision, then choose **Publish** to put that exact version in the arcade. Existing parties keep their pinned versions.

Sign in with `bl login`, then build the toolkit once:

```sh
node --import tsx scripts/prepare-blaxel-image.ts artifacts/blaxel-image microfinity-builder
(cd artifacts/blaxel-image && bl push -y)
bl get image sandbox/microfinity-builder --latest
```

Set `BLAXEL_BUILDER_IMAGE` to the returned immutable image reference. The image pins Codex 0.156.1, the SDK, compiler, QuickJS and Chromium. Every turn allocates one coding VM and one independent validation VM, then deletes both. Saved conversation data and revisions survive VM deletion. The default model is `gpt-6-sol` with medium reasoning. Blaxel credentials and the model key stay in the trusted worker; local development can use the existing `bl` sign-in. Production uses its protected provider configuration.

Initial ideas accept 12–600 characters; follow-up messages accept 1–600. References are named `.ts` files with no index: built-ins, published cartridges and only the creator's authorized private versions. Changed source is collected at most every 20 seconds and rendered independently. Progress images are work in progress; full validation across 1–4 players gates playable revisions. Chat can queue another change while the last working game remains playable.

The agent has no network, host checkout, credentials or container socket. An external broker pins the model and limits each attempt to 40 requests, 8 MB cumulative model input, 120,000 output tokens and ten minutes. Brief/media work has separate limits. Durable admission caps attempts at 24 per project and messages at 20, including up to two attempts after worker interruption. Cancellation invalidates the lease before stopping execution, so late results cannot publish. Owner checks protect drafts, assets, events and references.

For local single-process development, PGlite and an embedded worker work out of the box. For concurrent worker processes, use PostgreSQL and a shared `DATA_DIR`:

```sh
# Application process, with DATABASE_URL and DATA_DIR configured
BUILDER_WORKER=external npm run dev
# One or more separate worker processes, using the same database, assets and toolkit
BUILDER_CONCURRENCY=4 BUILDER_WORKER_SLOTS=2 npm run builder
```

`BUILDER_CONCURRENCY` is the global active-turn cap; configure the same value on every worker. `BUILDER_WORKER_SLOTS` caps this process. One owner has one active turn. Compilation, rendering and validation run in Blaxel, so open editors and playable games consume no builder VMs. Database leases fence stale workers; recorded sandbox allocations are reaped after lease loss, with a 20-minute VM expiration as a backstop. Moving the trusted worker to another host also requires shared asset storage; the current filesystem backend is not automatically replicated.

The queue persists in PostgreSQL, renews leases and recovers only expired work. HTTP/browser disconnects do not cancel a turn. Draft play runs in an isolated browser worker and consumes no builder slot. Completed media survives retries; editing reuses it unless new artwork/music is explicitly requested. There is no older job creation endpoint or alternate generator.

Run `node --import tsx scripts/validate-builder.ts "Your short game prompt"` for a real generation and publication into a fresh isolated local database under `artifacts/builder-validation/`. It never uses `DATABASE_URL` or the app's data directory. See [the studio architecture](docs/INTERACTIVE_GAME_BUILDER.md), [sandbox controls](docs/SANDBOXED_GAME_BUILDER.md), and [local validation](docs/INTERACTIVE_BUILDER_VALIDATION.md).

The [Blaxel qualification](docs/BLAXEL_BUILDER_VALIDATION.md) records measured timings and independent gameplay checks. Blaxel is the sole builder for both the app and validation scripts.

To add covers to older local cartridges, run `node --import tsx scripts/backfill-cartridge-icons.ts --data-dir PATH --dry-run`, then rerun without `--dry-run`. Each run processes at most ten icon-less games by default; `--limit N` accepts 1–100 and `--game-id ID` targets one. Pass `--icons-dir artifacts/gallery-icons` to import matching `<gameId>.png` files and their `manifest.json` provenance without another image request. The command reads the root `.env`, prefers bundled covers for reference games, and requests image-model covers only when no supplied cover exists for another game. It publishes an icon-only successor with pinned code, runtime and media; prior versions, scores and ratings stay intact. The explicit data path always selects local PGlite rather than an external `DATABASE_URL`.

## Play

- **Quick Play** picks games when nothing is selected; **Play selected** starts the cartridges picked with **+**. A cartridge's **Play** button starts that game directly.
- **Create Party** keeps you on the home screen, with the invite link and connected players between the start controls and cartridge selector. The host selects games there and presses **Start Party** to launch the whole playlist for everyone. Guests see the shared selections. Header name changes update the connected party immediately.
- The end screen offers **Play again** and **Back to arcade**, plus optional 1–5 star ratings for the cartridges you finished. Play again keeps the playlist and refreshes its variation. Recent-party history shows completed scores and challenge links.
- Menus: WASD/arrows move the highlight within the current screen; they never jump into the header. Space/Enter confirm. Escape opens Options, or closes the current overlay. The Options button opens the same menu by click. Enter a text field to edit; Escape returns to navigation. Tab still works.
- Gameplay: WASD or arrow keys plus Space. Phones use the same logical buttons on a digital pad.
- Toast Catch supports reusable independent races, obstruction, and pressure modes. Other cartridges have their own declared arrangements.
- In a party, **Make a game** and **Remix** keep friends connected while the host creates, then the finished version can be added to the shared playlist.
- Briefs default to GPT-6 Sol; sandboxed Codex builds default to GPT-6 Astra. Music keeps its separate GPT-5 Mini default; artwork uses the configured image model.
- Use **Make a game** for a natural-language prompt. Artwork, cover and music appear first. Codex then builds and playtests the cartridge before an immutable version becomes playable.

Jev uses only filtered player observations. Its current fallback is a clearly recorded scripted baseline when requests fail; legal decisions do not establish strong play. The first provider probe is recorded in `evidence/provider-probe.json`.

## Implementation and evidence

- [SDK guide](docs/SDK.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Sandboxed builder](docs/SANDBOXED_GAME_BUILDER.md) and [local validation](docs/BUILDER_VALIDATION.md)
- [Implementation ledger](IMPLEMENTATION.md)
- [Playtest report](PLAYTEST.md)

All eight original reference games plus Nose Dive and Crawl for Gold are present. Toast Catch, Asteroid Scramble, and Umbrella Panic have generated sprites and soundtracks; other reference loops are original synth sketches. Three fresh smaller-model creation attempts reached browser play, with defects and repairs recorded in the playtest report. Measured 100/200 ms protocol checks verify bounded correction for the timing relay. Full browser, touch, rendering/fairness and audible-listening acceptance remains unfinished. Graceful and abrupt restart recovery now have targeted evidence.

Three complete mixed parties have independent Chrome/in-app browser keyboard play and two live Jev opponents, with matching results (historical evidence also contains round recordings) (`evidence/party/browser-report.json`). Six references have observed keyboard success/failure paths; Cup/Odd wins use learned fixed challenges (`evidence/gameplay/keyboard-report.json`). Both browser clients use Chromium; held steering, touch and a second rendering engine remain coverage gaps. The Node suite runs test files serially to bound contention during watchdog checks; current builder acceptance is recorded separately.

Four/two/one connected browser guests also pass the zero/two/three Jev-seat fill check, with no AI decisions targeting connected players (`evidence/party/browser-occupancy.json`). Firefly's live-generated repairs now pass keyboard win/loss and saved-version reopening; the final visual refinement preserves its rules, artwork and soundtrack (`evidence/generation/firefly-repair-report.json`).

Creation offers New game and Remix. A new game requests artwork, a cover and music; a remix can reuse its source media. Edits can explicitly request replacement artwork or music. Audio uses a shared lo-fi sound kit, persistent desktop/mobile mixer controls, and immutable generated WAV loops. Recent parties retain private member-accessible score summaries and challenge links; scores are compared within matching rules and controller groups, with keyboard/virtual-pad filters, medians and distributions. New attempts track completion, interruption, abandonment and rematch counts; historical score-only records are excluded from those newer denominators. The six live Jev protocol scenarios are recorded under `evidence/live-rooms/` as historical evidence. Connection/host recovery and measured timing checks are under `evidence/network/`.

Spatial interaction events also receive shared particles and brief reaction text; score changes pulse automatically. Live play uses a bounded effect kit, with optional effects suppressed by reduced motion. The Asteroid impact-position correction preserves its rule outcomes and pinned artwork/music; see `evidence/runtime/feedback-presentation.json`.

The active test suite covers interrupted rooms, crash recovery, score transactions, ratings, one-to-four-player parties and reconnect. Earlier replay-dependent diagnostic scripts were retired with playback support; their existing reports remain historical evidence under `evidence/`.

The SDK includes shared helpers for controller focus/repeat, release charges, aiming/projectiles, scheduled spawns and button sequences. A live smaller-model sequence game, Signal Snacks, passed keyboard success, wrong-key failure, automatic expiry and saved-library reopening after two prompted refinements. Its art and generated retro loop were retained unchanged. See `evidence/generation/sequence-helpers-live.json`; this is additional authoring evidence, with genuine touch and audible listening still unverified.

The arcade cabinet displays a fixed 640×400 game surface at desktop size, scales it uniformly on phones, and places scores, roles, active turns and status outside the playfield. The shared `hud(view)` callback is validated from the filtered player view. Reference cartridges use it; old pinned versions keep their original rendering. Static CRT lines/glow have an off switch, while wobble is opt-in and respects reduced motion. The local pixel font license is in `docs/THIRD-PARTY.md`.

Cartridge ratings persist per guest and game, with updates replacing the previous vote. Cards show average stars and vote count; **Top rated** balances quality and sample size. The server verifies a completed human-controlled result for the exact rated version.


The new one-button party games support 2–4 players: lead a rotating nose with a pair of fingers, or time a grip and hold through each crawl. Each has an original scene and retro loop. Jev requests now contain public rules, cartridge rule source, the seat's filtered state/HUD, held controls and timing context. Live comparisons and a four-seat browser run are recorded in PLAYTEST.md; precise timing remains a weakness. Creation reveals art/music and progress snapshots as they finish, then offers the ready game for private playtesting.


## License and local records

Microfinity is licensed under the [MIT License](LICENSE). The bundled Press Start 2P font retains its [SIL Open Font License](client/fonts/OFL.txt); see [third-party notices](docs/THIRD-PARTY.md).

The public repository contains the source, ten reference cartridges, tests and development reports. `data/`, `artifacts/` and `evidence/` are local runtime/generated records and are intentionally ignored, along with credentials and build output. References to those paths in playtest reports describe local runs; the raw recordings and provider responses are not shipped. A fresh checkout seeds the reference games with built-in artwork and authored loops. Generate additional artwork/music with your own configured provider keys.
