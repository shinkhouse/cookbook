/**
 * Servings scaling and amount rendering.
 *
 * Scales ingredient amounts only — never step text. A step that says "add half
 * the butter" stays exactly as written.
 */

/** How close a value must be to a fraction before it renders as one. */
const TOLERANCE = 0.04;

/** Ordered low to high so the nearest match wins predictably. */
const FRACTIONS: ReadonlyArray<readonly [number, string]> = [
  [1 / 8, '⅛'],
  [1 / 4, '¼'],
  [1 / 3, '⅓'],
  [3 / 8, '⅜'],
  [1 / 2, '½'],
  [5 / 8, '⅝'],
  [2 / 3, '⅔'],
  [3 / 4, '¾'],
];

export function scaleFactor(chosen: number, base: number): number {
  if (!base) return 1;
  return chosen / base;
}

export function scaleLabel(factor: number): string {
  if (factor === 1) return 'as written';
  return `scaled ×${trimZeros(factor.toFixed(2))}`;
}

/** Renders an amount, preferring vulgar fractions. Null means "to taste". */
export function formatQty(qty: number | null): string {
  if (qty === null) return '';

  const whole = Math.floor(qty);
  const remainder = qty - whole;

  if (remainder < TOLERANCE) {
    return String(whole);
  }

  const fraction = nearestFraction(remainder);
  if (fraction) {
    return whole === 0 ? fraction : `${whole}${fraction}`;
  }

  return trimZeros(qty.toFixed(2));
}

function nearestFraction(remainder: number): string | null {
  for (const [value, glyph] of FRACTIONS) {
    if (Math.abs(remainder - value) <= TOLERANCE) return glyph;
  }
  return null;
}

function trimZeros(value: string): string {
  // Guard the no-decimal case: a bare "100" must not become "1".
  if (!value.includes('.')) return value;
  return value.replace(/0+$/, '').replace(/\.$/, '');
}
