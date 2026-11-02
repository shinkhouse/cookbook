/**
 * Unit table and US/metric conversion.
 *
 * Only exact units convert. Qualified units ("small can", "heaping tbsp") and
 * counted units ("clove", "pinch") are left alone by design.
 */
import { formatQty } from './scale';

export type UnitSystem = 'us' | 'metric';
export type Dimension = 'volume' | 'weight';
export interface Measure {
  qty: number;
  unit: string;
}

interface UnitInfo {
  dimension: Dimension;
  system: UnitSystem;
  /** ml or g per unit. */
  base: number;
}

const UNITS: Readonly<Record<string, UnitInfo>> = {
  tsp: { dimension: 'volume', system: 'us', base: 4.92892 },
  tbsp: { dimension: 'volume', system: 'us', base: 14.7868 },
  cup: { dimension: 'volume', system: 'us', base: 236.588 },
  pint: { dimension: 'volume', system: 'us', base: 473.176 },
  quart: { dimension: 'volume', system: 'us', base: 946.353 },
  gallon: { dimension: 'volume', system: 'us', base: 3785.41 },
  ml: { dimension: 'volume', system: 'metric', base: 1 },
  l: { dimension: 'volume', system: 'metric', base: 1000 },
  oz: { dimension: 'weight', system: 'us', base: 28.3495 },
  lb: { dimension: 'weight', system: 'us', base: 453.592 },
  g: { dimension: 'weight', system: 'metric', base: 1 },
  kg: { dimension: 'weight', system: 'metric', base: 1000 },
};

const US_FRACTIONS = [0, 1 / 8, 1 / 4, 1 / 3, 3 / 8, 1 / 2, 5 / 8, 2 / 3, 3 / 4, 7 / 8, 1];

export function measurable(unit: string): UnitInfo | null {
  const key = unit.toLowerCase();
  return Object.prototype.hasOwnProperty.call(UNITS, key) ? { ...UNITS[key] } : null;
}

export function bestUnit(baseAmount: number, dimension: Dimension, system: UnitSystem): Measure {
  if (system === 'us') {
    if (dimension === 'volume') {
      if (baseAmount >= 59.147) return usMeasure(baseAmount, 'cup');
      if (baseAmount >= 14.7868) return usMeasure(baseAmount, 'tbsp');
      return usMeasure(baseAmount, 'tsp');
    }
    return baseAmount >= 453.592 ? usMeasure(baseAmount, 'lb') : usMeasure(baseAmount, 'oz');
  }

  if (dimension === 'volume') {
    if (baseAmount >= 1000) return roundTo(baseAmount / 1000, 0.05, 'l');
    return roundTo(baseAmount, baseAmount < 10 ? 0.5 : baseAmount < 100 ? 5 : 10, 'ml');
  }
  if (baseAmount >= 1000) return roundTo(baseAmount / 1000, 0.05, 'kg');
  return roundTo(baseAmount, baseAmount < 10 ? 0.5 : baseAmount < 100 ? 1 : 5, 'g');
}

export function convertMeasure(m: Measure, system: UnitSystem): Measure {
  const info = measurable(m.unit);
  if (!info || info.system === system) return m;
  return bestUnit(m.qty * info.base, info.dimension, system);
}

export function formatMeasure(m: Measure): string {
  const info = measurable(m.unit);
  const qty = info?.system === 'metric' ? trimDecimals(m.qty) : formatQty(m.qty);
  return m.unit ? `${qty} ${m.unit}` : qty;
}

function usMeasure(baseAmount: number, unit: string): Measure {
  const qty = baseAmount / UNITS[unit].base;
  const whole = Math.floor(qty);
  const remainder = qty - whole;
  let nearest = US_FRACTIONS[0];
  for (const f of US_FRACTIONS) {
    if (Math.abs(remainder - f) < Math.abs(remainder - nearest)) nearest = f;
  }
  const rounded = whole + nearest;
  // Never round a positive amount to nothing.
  return { qty: rounded > 0 || qty <= 0 ? rounded : 1 / 8, unit };
}

function roundTo(value: number, step: number, unit: string): Measure {
  const rounded = Math.round(value / step) * step;
  // Trim float noise from the multiplication (22.68 -> 23 * 0.05).
  const qty = Number((rounded > 0 || value <= 0 ? rounded : step).toFixed(2));
  return { qty, unit };
}

function trimDecimals(qty: number): string {
  return String(Number(qty.toFixed(2)));
}
