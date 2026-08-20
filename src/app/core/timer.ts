/**
 * Pulls a cook timer out of step text.
 *
 * Ranges resolve to the upper bound — "20–25 minutes" is a 25 minute timer —
 * matching how the ingredient parser treats quantity ranges, so the two rules
 * are not surprising in opposite directions.
 */

/**
 * Optional leading number plus range separator, then the unit. Requires the unit
 * word so a bare "2 tablespoons" is never read as a duration.
 */
const DURATION =
  /(\d+)\s*(?:(?:-|–|—|to)\s*(\d+))?\s*(hours?|hrs?|minutes?|mins?)\b/i;

const SECONDS_PER: Record<string, number> = { hour: 3600, minute: 60 };

/** Duration in seconds, or null when the step has none. */
export function parseDuration(text: string): number | null {
  const match = DURATION.exec(text);
  if (!match) return null;

  const [, low, high, rawUnit] = match;
  // Upper bound of a range, else the single value.
  const amount = Number(high ?? low);
  if (!Number.isFinite(amount)) return null;

  const unit = rawUnit.toLowerCase().startsWith('h') ? 'hour' : 'minute';
  return amount * SECONDS_PER[unit];
}

/** `m:ss`. Minutes carry past sixty rather than rolling into an hours field. */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
