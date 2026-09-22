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

`npm start` explicitly selects production mode and serves `dist/client`; `npm run dev` enables Vite and hot reload. Keep the repository source and `server/migrations` alongside the production build: runtime compilation reads the SDK type declarations. Assets, the local database, versions, challenges, and results are stored under `data/`; set `DATA_DIR` to use another directory. Stop the server before opening, moving or copying its PGlite database from another process. A restart ends active rooms. Completed scores and member-only recordings survive, including the last saved checkpoint of an unfinished round. An unfinished round receives no final score; persisted challenges can be started again.

Creation limits are configurable with the `GENERATION_*` settings in `.env.example`. Defaults provide five minutes of work after durable admission, eight provider calls, 300 KB of cumulative request bodies, 54,000 reserved output tokens and two images (one gameplay sprite and one cartridge cover). Existing draft previews survive deadline failures. These bound provider work, not exact dollar charges; actual returned usage is retained. Finished jobs remain in the database, with only the latest 32 cached in memory.

To add covers to older local cartridges, run `node --import tsx scripts/backfill-cartridge-icons.ts --data-dir PATH --dry-run`, then rerun without `--dry-run`. Each run processes at most ten icon-less games by default; `--limit N` accepts 1–100 and `--game-id ID` targets one. Pass `--icons-dir artifacts/gallery-icons` to import matching `<gameId>.png` files and their `manifest.json` provenance without another image request. The command reads the root `.env`, prefers bundled covers for reference games, and requests image-model covers only when no supplied cover exists for another game. It publishes an icon-only successor with pinned code, runtime and media; prior versions, scores, ratings and replays stay intact. The explicit data path always selects local PGlite rather than an external `DATABASE_URL`.

## Play

- **Play** starts the selected cartridge directly. **Random Party** starts four compatible games immediately, with Jev filling the spare seat. No configuration or Ready step is required.
- To invite friends before play, add games with **+** and create a separate party lobby. Hosts can reorder the queue and manage seats there.
- The end screen offers **Play again** and **Back to arcade**, plus optional 1–5 star ratings for the cartridges you finished. Play again keeps the playlist and refreshes its variation. Recorded replays are available in recent-party history.
- Menus: WASD/arrows move the highlight within the current screen; they never jump into the header. Space/Enter confirm. Escape opens Options, or closes the current overlay. The Options button opens the same menu by click. Enter a text field to edit; Escape returns to navigation. Tab still works.
- Gameplay: WASD or arrow keys plus Space. Phones use the same logical buttons on a digital pad.
- Toast Catch supports reusable independent races, obstruction, and pressure modes. Other cartridges have their own declared arrangements.
- Use **Make a game for this party** to keep friends connected while creating, then add the finished version to the queue.
- Use **Make a game** for a natural-language prompt. Code, gameplay artwork, a cartridge cover, and music generate in separate branches. A valid draft can be played while assets are pending; finished media creates a new immutable version.

Jev uses only filtered player observations. Its current fallback is a clearly recorded scripted baseline when requests fail; legal decisions do not establish strong play. The first provider probe is recorded in `evidence/provider-probe.json`.

## Implementation and evidence

- [SDK guide](docs/SDK.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Implementation ledger](IMPLEMENTATION.md)
- [Playtest report](PLAYTEST.md)

All eight original reference games plus Nose Dive and Crawl for Gold are present. Toast Catch, Asteroid Scramble, and Umbrella Panic have generated sprites and soundtracks; other reference loops are original synth sketches. Three fresh smaller-model creation attempts reached browser play, with defects and repairs recorded in the playtest report. Measured 100/200 ms protocol checks verify bounded correction for the timing relay. Full browser, touch, rendering/fairness and audible-listening acceptance remains unfinished. Graceful and abrupt restart recovery now have targeted evidence.

Three complete mixed parties have independent Chrome/in-app browser keyboard play and two live Jev opponents, with matching results and exact round replays (`evidence/party/browser-report.json`). Six references have observed keyboard success/failure paths; Cup/Odd wins use learned fixed challenges (`evidence/gameplay/keyboard-report.json`). Both browser clients use Chromium; held steering, touch and a second rendering engine remain coverage gaps. The Node suite currently passes 78 tests, with four test files running concurrently so watchdog checks retain bounded host contention.

Four/two/one connected browser guests also pass the zero/two/three Jev-seat fill check, with no AI decisions targeting connected players (`evidence/party/browser-occupancy.json`). Firefly's live-generated repairs now pass keyboard win/loss and saved-version reopening; the final visual refinement preserves its rules, artwork and soundtrack (`evidence/generation/firefly-repair-report.json`).

Creation offers New game and Remix. A remix can reuse gameplay artwork, while every new cartridge requests its own cover icon. Audio uses a shared lo-fi sound kit, persistent desktop/mobile mixer controls, and immutable generated WAV loops. Recent parties retain private member-accessible replays with recorded-time playback, forward sound cues and pinned music; scores are compared within matching rules and controller groups, with keyboard/virtual-pad filters, medians and distributions. New attempts track completion, interruption, abandonment, replay and rematch counts; historical score-only records are excluded from those newer denominators. The six live Jev protocol scenarios and their matching replays are recorded under `evidence/live-rooms/`. Connection/host recovery and measured timing checks are under `evidence/network/`.

Spatial interaction events also receive shared particles and brief reaction text; score changes pulse automatically. Live play and replay use the same bounded effect kit, with optional effects suppressed by reduced motion. The Asteroid impact-position correction preserves its rule outcomes and pinned artwork/music; see `evidence/runtime/feedback-presentation.json`.

For an isolated abrupt-restart check, build first and run `node --import tsx scripts/restart-checks.ts`. It starts temporary local servers with their own `DATA_DIR`, uses practice bots, kills one test process during a round and verifies the recovered recording. It leaves the normal database untouched. See `evidence/recovery/`.

For failed-image browser checks, `node --import tsx scripts/asset-failure-server.ts` starts a separate temporary server and prints its URL. Play **Asset Failure Probe**, return to party setup, and replace it with a working cartridge. Stop the script with Ctrl-C to export recordings and clean up its temporary database. `node --import tsx scripts/room-capacity.ts http://127.0.0.1:PORT` profiles 1/4/8 concurrent protocol rooms against that fixture. These scripts disable provider access and do not modify the normal library. The measured local profile and responsive-layout fixes are documented in the playtest report.


The SDK includes shared helpers for controller focus/repeat, release charges, aiming/projectiles, scheduled spawns and button sequences. A live smaller-model sequence game, Signal Snacks, now passes keyboard success, wrong-key failure, automatic expiry, saved-library reopening and exact replay after two prompted refinements. Its art and generated retro loop were retained unchanged. See `evidence/generation/sequence-helpers-live.json`; this is additional authoring evidence, with genuine touch and audible listening still unverified.

The arcade cabinet displays a fixed 640×400 game surface at desktop size, scales it uniformly on phones, and places scores, roles, active turns and status outside the playfield. The shared `hud(view)` callback is validated from the filtered player view. Reference cartridges use it; old pinned versions keep their original rendering. Static CRT lines/glow have an off switch, while wobble is opt-in and respects reduced motion. The local pixel font license is in `docs/THIRD-PARTY.md`.

Cartridge ratings persist per guest and game, with updates replacing the previous vote. Cards show average stars and vote count; **Top rated** balances quality and sample size. The server verifies a completed human-controlled result for the exact rated version.


The new one-button party games support 2–4 players: lead a rotating nose with a pair of fingers, or time a grip and hold through each crawl. Each has an original scene and retro loop. Jev requests now contain public rules, cartridge rule source, the seat's filtered state/HUD, held controls and timing context. Live comparisons and a four-seat browser run are recorded in PLAYTEST.md; precise timing remains a weakness. Creation now reveals art/music as they finish and automatically opens the ready game.


## License and local records

Microfinity is licensed under the [MIT License](LICENSE). The bundled Press Start 2P font retains its [SIL Open Font License](client/fonts/OFL.txt); see [third-party notices](docs/THIRD-PARTY.md).

The public repository contains the source, ten reference cartridges, tests and development reports. `data/`, `artifacts/` and `evidence/` are local runtime/generated records and are intentionally ignored, along with credentials and build output. References to those paths in playtest reports describe local runs; the raw recordings and provider responses are not shipped. A fresh checkout seeds the reference games with built-in artwork and authored loops. Generate additional artwork/music with your own configured provider keys.
