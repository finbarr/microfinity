# Build Microfinity

Implement the complete product defined in [SPEC.md](SPEC.md) in this workspace. The specification is the source of truth for scope, architecture, controls, reference games, generation, integrations, playtesting, and acceptance criteria.

## Execution

- Keep the product as simple as an arcade machine: direct Play/Random Party launch without configuration, a game-only fixed playfield inside a wrapper HUD, whole-site directional keyboard navigation, and a two-choice end screen.
- Build all required features, the eight original reference games, and Nose Dive / Crawl for Gold from the September 22 variety expansion in SPEC.md. Gameplay uses WASD/arrow keys plus Space, with the same five logical controls exposed by an on-screen mobile pad. No mouse gameplay.
- Use the existing backend-only API keys to verify real game/image/music generation and engine-managed Jev players. Include shared lo-fi interaction sounds and distinct retro loops, with soundtrack generation able to run alongside code/art creation. Generated cartridges must become playable without rebuilding or restarting the application.
- Generate and playtest three additional games through the product using a named smaller coding model, as specified.
- Run the specified rule, browser, multitouch, audio/loop listening, multiplayer, network, replay, and integration checks. Fix discovered defects and rerun affected checks. Make routine implementation decisions autonomously and record meaningful deviations.
- Deliver runnable software, setup instructions, an SDK guide, and an evidence-backed playtest report with an acceptance matrix and honest coverage limits.

Complete the goal only when the required acceptance criteria in `SPEC.md` are met. If a required external dependency is unavailable, finish independent work and identify the precise remaining requirement. Fixtures and mocks do not count as verified live integrations.
