import {z} from 'zod';
import {GAMEPLAY_POLICY, GAMEPLAY_POLICY_VERSION} from '../builder/gameplay-policy.mjs';
import type {Version} from './store';

const brief = z.object({
  title: z.string().max(80),
  premise: z.string().min(1),
  clock: z.enum(['realtime', 'action']),
  style: z.enum(['pixel', 'cartoon', 'doodle', 'collage']),
  playStyle: z.enum(['competitive', 'cooperative']),
  controls: z.string().min(1),
  solo: z.string().min(1),
  multiplayer: z.string().min(1),
  offTurn: z.string().min(1),
  assetName: z.string().regex(/^[a-z-]{1,40}$/),
  assetDescription: z.string(),
  musicMood: z.string(),
});

export const briefSchema = z.toJSONSchema(brief, {target: 'draft-7'});

export function currentBrief(value: unknown) {
  if (!value || (value as any).gameplayPolicyVersion !== GAMEPLAY_POLICY_VERSION) return undefined;
  const parsed = brief.safeParse(value);
  return parsed.success ? {...parsed.data, gameplayPolicyVersion: GAMEPLAY_POLICY_VERSION} : undefined;
}

export function parseBrief(value: unknown) {
  return {...brief.parse(value), gameplayPolicyVersion: GAMEPLAY_POLICY_VERSION};
}

export function briefPrompt(request: string, previous?: Version) {
  return `Design a small, original browser microgame from this prompt.
Give one clear mechanic within directions (WASD/arrows) and Space; no mouse or extra buttons.
Infer realtime versus turn-based play: use clock realtime for continuously advancing
deadlines, timing or movement, even with discrete presses; use clock action for
turn-based choices whose step runs on input or the engine turn deadline.
${previous ? 'Preserve the existing round timing unless the request changes it.' : 'Default to one quick 15–30 second round unless the user requests a longer game.'}
Every round, including any tie-break, must end within a fixed bound even with no input.

${GAMEPLAY_POLICY}

In controls, describe one player's controls, identically available on every device.
In solo, explain attainable success and failure with one controlled participant.
In multiplayer, state individual rewards and win/loss, or the explicitly requested
cooperative goal. In offTurn, describe interference and its limits for any turn-based
or rotating-turn game; use 'Not applicable: simultaneous play' otherwise.
Pick one useful isolated sprite with a transparent background; assetName must use
lowercase letters and hyphens.
${previous ? `Existing cartridge: ${previous.manifest.meta.title}. ${previous.manifest.meta.description}. Clock: ${previous.manifest.meta.clock}; round duration: ${previous.manifest.meta.duration} seconds. Use as remix context, but the user's requests and multiplayer rules determine the design.` : ''}
User request and accepted history:
${request}`;
}
