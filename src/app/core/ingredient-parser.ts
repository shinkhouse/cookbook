/**
 * Parses a free-text ingredient line into structured fields.
 *
 * Powers both the paste-text import flow and the one-off migration of the
 * existing recipe data. Ranges resolve to the upper bound, matching timer.ts.
 *
 * The parser deliberately does not try to split a line that names several
 * ingredients ("salt + black pepper"). It flags those with `needsReview` so the
 * import UI can say "check the split" and a human can decide.
 */

import { Aisle, inferAisle } from './aisle';

export type ParsedIngredient = {
  qty: number | null;
  unit: string;
  name: string;
  aisle: Aisle;
  needsReview: boolean;
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '¼': 1 / 4,
  '½': 1 / 2,
  '¾': 3 / 4,
  '⅐': 1 / 7,
  '⅑': 1 / 9,
  '⅒': 1 / 10,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅕': 1 / 5,
  '⅖': 2 / 5,
  '⅗': 3 / 5,
  '⅘': 4 / 5,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};

/** Long form (and common abbreviations) to the short form we display. */
const UNITS: Record<string, string> = {
  teaspoon: 'tsp', teaspoons: 'tsp', tsp: 'tsp', tsps: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp', tbsp: 'tbsp', tbsps: 'tbsp', tbs: 'tbsp',
  cup: 'cup', cups: 'cup',
  pound: 'lb', pounds: 'lb', lb: 'lb', lbs: 'lb',
  ounce: 'oz', ounces: 'oz', oz: 'oz',
  gram: 'g', grams: 'g', g: 'g',
  kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  pint: 'pint', pints: 'pint',
  quart: 'quart', quarts: 'quart',
  gallon: 'gallon', gallons: 'gallon',
  can: 'can', cans: 'can',
  jar: 'jar', jars: 'jar',
  box: 'box', boxes: 'box',
  bag: 'bag', bags: 'bag',
  package: 'package', packages: 'package', pkg: 'package',
  clove: 'clove', cloves: 'clove',
  slice: 'slice', slices: 'slice',
  stick: 'stick', sticks: 'stick',
  sprig: 'sprig', sprigs: 'sprig',
  bunch: 'bunch', bunches: 'bunch',
  head: 'head', heads: 'head',
  pinch: 'pinch', pinches: 'pinch',
  dash: 'dash', dashes: 'dash',
};

/** Size words that belong to the unit, as in "1 small can tomato paste". */
const QUALIFIERS = new Set(['small', 'medium', 'large', 'big', 'heaping', 'scant']);

/** Markers that a single line is really describing more than one ingredient. */
const MULTI_MARKERS = [/\beach\s*:/i, /\s\+\s/, /\band\s+\d/i];

/**
 * Real data uses U+2044 FRACTION SLASH and U+2215 DIVISION SLASH as well as the
 * plain solidus. Normalising up front means the fraction rules below only ever
 * need to know about '/'.
 */
function normaliseSlashes(text: string): string {
  return text.replace(/[⁄∕]/g, '/');
}

export function parseIngredient(raw: string): ParsedIngredient {
  const line = normaliseSlashes(raw).trim();
  if (!line) {
    return { qty: null, unit: '', name: '', aisle: 'pantry', needsReview: false };
  }

  let rest = line;
  const qty = takeQuantity(rest);
  if (qty) rest = qty.rest;

  const unit = takeUnit(rest);
  if (unit) rest = unit.rest;

  const name = rest.trim() || line;

  return {
    qty: qty ? qty.value : null,
    unit: unit ? unit.value : '',
    name,
    aisle: inferAisle(name),
    needsReview: needsReview(line),
  };
}

type Taken<T> = { value: T; rest: string };

function takeQuantity(text: string): Taken<number> | null {
  // Mixed number first: "1 1/2 cups" must not read as just "1".
  const mixed = /^(\d+)\s+(\d+)\s*\/\s*(\d+)\b/.exec(text);
  if (mixed) {
    const value = Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    return { value, rest: text.slice(mixed[0].length) };
  }

  // Integer followed by a unicode fraction, e.g. "1½".
  const intThenGlyph = /^(\d+)\s*([¼-¾⅐-⅞])/.exec(text);
  if (intThenGlyph) {
    const frac = UNICODE_FRACTIONS[intThenGlyph[2]];
    if (frac !== undefined) {
      return { value: Number(intThenGlyph[1]) + frac, rest: text.slice(intThenGlyph[0].length) };
    }
  }

  const glyph = /^([¼-¾⅐-⅞])/.exec(text);
  if (glyph) {
    const frac = UNICODE_FRACTIONS[glyph[1]];
    if (frac !== undefined) return { value: frac, rest: text.slice(glyph[0].length) };
  }

  // Range before plain fraction/integer so "4-6" yields 6, not 4.
  const range = /^(\d+)\s*(?:-|–|—|to)\s*(\d+)\b/.exec(text);
  if (range) {
    return { value: Number(range[2]), rest: text.slice(range[0].length) };
  }

  // No trailing \b: the real data contains "1/4cup Water" with no space, and a
  // word boundary cannot fall between '4' and 'c'.
  const fraction = /^(\d+)\s*\/\s*(\d+)(?!\d)/.exec(text);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator !== 0) {
      return openRange(Number(fraction[1]) / denominator, text.slice(fraction[0].length));
    }
  }

  const integer = /^(\d+(?:\.\d+)?)\b/.exec(text);
  if (integer) {
    return openRange(Number(integer[1]), text.slice(integer[0].length));
  }

  return null;
}

/**
 * Catches a range whose lower bound was already consumed as a fraction, as in
 * "1/2 -1 tsp chili sauce". Takes the upper bound like every other range.
 */
function openRange(value: number, rest: string): Taken<number> {
  const upper = /^\s*[-–—]\s*(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+))?(?!\d)/.exec(rest);
  if (upper) {
    const bound = upper[2] ? Number(upper[1]) / Number(upper[2]) : Number(upper[1]);
    if (bound > value) return { value: bound, rest: rest.slice(upper[0].length) };
  }
  return { value, rest };
}

function takeUnit(text: string): Taken<string> | null {
  const words = text.trim().split(/\s+/);
  if (!words.length || !words[0]) return null;

  // A size qualifier only counts when a real unit follows it.
  let offset = 0;
  let qualifier = '';
  const first = stripPunctuation(words[0]).toLowerCase();
  if (QUALIFIERS.has(first) && words.length > 1) {
    qualifier = first;
    offset = 1;
  }

  const candidate = stripPunctuation(words[offset] ?? '').toLowerCase();
  const unit = UNITS[candidate];
  if (!unit) return null;

  // Never consume the entire line as a unit — "1 cup" should name "cup".
  const consumed = words.slice(0, offset + 1).join(' ');
  // "can of tomato juice" — the connective belongs to neither unit nor name.
  const remainder = text.trim().slice(consumed.length).replace(/^\s+of\b/i, '').trim();
  if (!remainder) return null;

  return {
    value: qualifier ? `${qualifier} ${unit}` : unit,
    rest: remainder,
  };
}

function stripPunctuation(word: string): string {
  return word.replace(/[.,;:]+$/, '');
}

function needsReview(line: string): boolean {
  if (MULTI_MARKERS.some((re) => re.test(line))) return true;
  // A word followed by "/number" is a second measurement rather than a
  // fraction, as in "3/4 cup/200 ml low fat cream". A fraction slash always
  // sits between two digits, so requiring a letter on the left is enough to
  // tell them apart.
  if (/[a-z]\s*\/\s*\d/i.test(line)) return true;
  return false;
}
