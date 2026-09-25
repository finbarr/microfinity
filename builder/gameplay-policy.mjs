// Shared by the design brief and the coding agent. Bump when cached briefs need replanning.
export const GAMEPLAY_POLICY_VERSION = 1;

export const GAMEPLAY_POLICY = `Microfinity multiplayer rules:
- Competitive by default. Use cooperative goals/shared victory only when the user's
  original idea or accepted requests explicitly ask for cooperation. Stacking,
  sharing an arena, or interacting with another character does not imply cooperation.
  Attribute competitive rewards and outcomes to the player who earns them.
- Each human has an independent controller/device with the SAME directions and Space.
  Each player controls only their own single character, paddle, cursor, or equivalent
  participant at a time. Shared world means shared simulation, never shared controls.
  Read inputs[player.id] only for that player's actions. Never pool inputs, switch
  between other players' characters, assign different keyboard keys to different
  seats, or let one human control all characters. This also applies to cooperation.
- ctx.players is the actual joined roster. Support 1, 2, 3, and 4 players without a
  player-count question or join-on-key mechanic. Solo adapts the objective/environment
  so one character can succeed and fail; do not hand absent players to the solo human.
- Turn-based and rotating-turn games must give non-active players meaningful,
  bounded interference through their OWN controls: for example a cooldown-limited
  obstacle, gust, or distraction that can hinder the active player. Explain its
  effect and limit in the rules and HUD. Never let interferers directly control the
  active character, make its choice, or consume/skip its turn by spamming input.
  Use role 'interferer' for these players: role 'waiting' has its input suppressed
  by the engine. For explicitly cooperative games keep these off-turn actions
  compatible with the requested shared goal while still affecting the active turn.
- Score the actual objective. Do not invent rewards for moving/jumping/pressing
  buttons merely to pass tests. Competitive witnesses can use separate traces with
  a different winning seat in each, so every seat can demonstrate useful play.
- Existing briefs, source revisions, and reference cartridges may predate these
  rules. Correct conflicting control ownership and inferred cooperative defaults
  when building or editing; preserve the user's explicit cooperative intent and
  unrelated requested mechanics. These rules also apply to resumed sessions.`;
