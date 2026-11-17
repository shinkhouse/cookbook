/**
 * Things worth a second look in a recipe being added or edited: the slips an
 * import or a quick paste leaves behind. None of them blocks saving. Each says
 * what looks wrong beside the row, says it again in a few words for the
 * checklist, and, where the fix is plain, carries it.
 */
import { AISLE_LABELS, Aisle, matchAisle } from './aisle';
import { Ingredient } from './model/recipes.model';
import { parseIngredient } from './ingredient-parser';

export type IngredientCheckKind = 'plus' | 'stuck' | 'aisle' | 'two-in-one' | 'several';

/** A change to the row the check is on. */
export type IngredientFix =
  | { type: 'name'; name: string }
  | { type: 'aisle'; aisle: Aisle }
  /** The row is replaced by these. */
  | { type: 'split'; rows: Ingredient[] };

export interface IngredientCheck {
  kind: IngredientCheckKind;
  /** Said beside the row. */
  message: string;
  /** Said in the checklist, in a few words. */
  summary: string;
  fix?: { label: string; change: IngredientFix };
}

export interface NoteCheck {
  kind: 'missing-note';
  message: string;
  summary: string;
  /** The note to start, e.g. "Tip: ". */
  fix: { label: string; note: string };
}

/** Units that mean the thing comes in a tin or a jar, whatever it is. */
const SHELF_UNITS = new Set(['can', 'jar']);

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (word: string) => /[^s]s$/.test(word);
const dashes = (text: string) => text.replace(/(\d)\s*-\s*(\d)/g, '$1–$2');

/** "in Produce", but "at the fish counter". */
function where(aisle: Aisle): string {
  return aisle === 'seafood' ? 'at the fish counter' : `in ${AISLE_LABELS[aisle]}`;
}

/** A trailing "(...)" and what comes before it. */
function splitParenthetical(name: string): { body: string; paren: string } {
  const m = /^(.*?)\s*(\([^()]*\))\s*$/.exec(name);
  return m ? { body: m[1], paren: m[2] } : { body: name, paren: '' };
}

function plusCheck(ing: Ingredient): IngredientCheck | null {
  if (!/\bplus\s*$/i.test(ing.name)) return null;
  const name = ing.name.trim();
  return {
    kind: 'plus',
    message: 'The line ends in “plus”.',
    summary: `“${name}” — plus what?`,
    fix: { label: 'Make it “plus more to taste”', change: { type: 'name', name: `${name} more to taste` } },
  };
}

/** "(5-6) boneless skinless chicken thighs": a count read in ahead of the name. */
function stuckCheck(ing: Ingredient): IngredientCheck | null {
  const m = /^\(([^()]+)\)\s*(.+)$/.exec(ing.name.trim());
  if (!m) return null;
  const [, inner, rest] = m;
  const noun = splitParenthetical(rest).body.split(/[\s,]+/).filter(Boolean).pop() ?? rest;
  return {
    kind: 'stuck',
    message: `Looks like “${dashes(inner)} ${noun}” got stuck in the name.`,
    summary: `“(${dashes(inner)})” is in the name`,
    fix: { label: 'Move to the end', change: { type: 'name', name: `${rest} (${inner})` } },
  };
}

/** Where the row's name says it belongs, or null when the name says nothing. */
function expected(ing: Ingredient): { aisle: Aisle; subject: string } | null {
  const match = matchAisle(ing.name);
  if (SHELF_UNITS.has(ing.unit)) {
    return { aisle: 'pantry', subject: match ? `Canned ${match.word}` : 'Canned goods' };
  }
  return match ? { aisle: match.aisle, subject: capitalise(match.word) } : null;
}

function aisleCheck(ing: Ingredient): IngredientCheck | null {
  const want = expected(ing);
  if (!want || want.aisle === ing.aisle) return null;
  const are = plural(want.subject) ? 'are' : 'is';
  return {
    kind: 'aisle',
    message: `${want.subject} ${are} usually ${where(want.aisle)}.`,
    summary: `${want.subject} filed under ${AISLE_LABELS[ing.aisle]}`,
    fix: { label: `Move to ${AISLE_LABELS[want.aisle]}`, change: { type: 'aisle', aisle: want.aisle } },
  };
}

/** "Sour cream and parsley (both optional)": two things from two aisles in one row. */
function twoInOneCheck(ing: Ingredient): IngredientCheck | null {
  const { body, paren } = splitParenthetical(ing.name);
  const parts = body.split(/\s+(?:and|&|\+)\s+/i);
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) return null;
  const [a, b] = parts.map((p) => matchAisle(p));
  if (!a || !b || a.aisle === b.aisle) return null;
  // "(both optional)" belongs to each half as "(optional)".
  const shared = paren.replace(/\(\s*both\s+/i, '(');
  const half = (text: string) => (shared ? `${text.trim()} ${shared}` : text.trim());
  return {
    kind: 'two-in-one',
    message: 'Two ingredients in one row, in different aisles.',
    summary: `${capitalise(a.word)} and ${b.word} are one row`,
    fix: {
      label: 'Split into two',
      change: {
        type: 'split',
        rows: [
          { ...ing, name: half(parts[0]), aisle: a.aisle },
          { qty: null, unit: '', name: half(parts[1]), aisle: b.aisle, ...(ing.group ? { group: ing.group } : {}) },
        ],
      },
    },
  };
}

/** What the parser flags as maybe more than one thing, when nothing above explains it. */
function severalCheck(ing: Ingredient): IngredientCheck | null {
  if (!parseIngredient(ing.name).needsReview) return null;
  return {
    kind: 'several',
    message: 'This row may hold more than one ingredient.',
    summary: `“${ing.name.trim()}” may be two rows`,
  };
}

/** What is worth a look in one ingredient row, most specific first. */
export function checkIngredient(ing: Ingredient): IngredientCheck[] {
  if (!ing.name.trim()) return [];
  const checks = [plusCheck(ing), stuckCheck(ing)];
  const split = twoInOneCheck(ing);
  // A row holding two things has no one aisle to be right or wrong about.
  checks.push(split ?? aisleCheck(ing));
  if (!split) checks.push(severalCheck(ing));
  return checks.filter((c): c is IngredientCheck => c !== null);
}

/**
 * A pointer to a note that is not there: "cherry tomatoes (see Tip)" with no
 * tip among the notes.
 */
export function checkNotes(
  ingredients: readonly Ingredient[],
  steps: readonly string[],
  notes: readonly string[],
): NoteCheck[] {
  const checks: NoteCheck[] = [];
  const texts = [
    ...ingredients.map((i) => ({ text: i.name, who: `“${splitParenthetical(i.name).body.trim()}”` })),
    ...steps.map((s, n) => ({ text: s, who: `Step ${n + 1}` })),
  ];
  for (const word of ['Tip', 'Note']) {
    const pointer = new RegExp(`\\bsee\\s+(?:the\\s+)?${word}s?\\b`, 'i');
    const from = texts.find((t) => pointer.test(t.text));
    if (!from) continue;
    const present = notes.some((n) => new RegExp(`^\\s*${word}s?\\b`, 'i').test(n));
    if (present) continue;
    checks.push({
      kind: 'missing-note',
      message: `${from.who} says “see ${word}”, but there’s no ${word.toLowerCase()} yet.`,
      summary: `“see ${word}” points nowhere`,
      fix: { label: `Add the ${word}`, note: `${word}: ` },
    });
  }
  return checks;
}
