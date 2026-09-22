/** The lineup intro and countdown share the server's absolute start deadline. */
export const COUNTDOWN_BEAT_MS = 1000;
export const COUNTDOWN_MS = 3 * COUNTDOWN_BEAT_MS;

/** Keep the final beat visible until the authoritative phase becomes playing. */
export function countdownValue(startsAt: number, serverNow: number): 3 | 2 | 1 {
  return Math.max(1, Math.min(3, Math.ceil((startsAt - serverNow) / COUNTDOWN_BEAT_MS))) as 3 | 2 | 1;
}
