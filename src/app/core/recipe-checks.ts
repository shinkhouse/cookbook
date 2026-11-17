/**
 * Things worth a second look in a recipe being added or edited: the slips an
 * import or a quick paste leaves behind. None of them blocks saving. Each says
 * what looks wrong beside the row, says it again in a few words for the
 * checklist, and, where the fix is plain, carries it.
 *
 * A row gets one flag at most, the most telling: three bands under one line
 * read as noise, and fixing the first often clears the rest.
 */
import { AISLE_LABELS, Aisle, findFoods, matchAisle } from './aisle';
import { Ingredient } from './model/recipes.model';
import { formatQty } from './scale';
import { unitFor } from './units';

export type IngredientCheckKind =
  | 'stuck'
  | 'dash'
  | 'unclosed'
  | 'dangling'
  | 'no-number'
  | 'no-unit'
  | 'two-in-one'
  | 'aisle'
  | 'several';

/** A change to the row the check is on. */
export type IngredientFix =
  /** The row is replaced by these (one row, or two for a split). */
  | { type: 'replace'; rows: Ingredient[] }
  /** The row and its neighbour become one line. */
  | { type: 'join'; with: 'next' | 'previous' };

export interface IngredientCheck {
  kind: IngredientCheckKind;
  /** Said beside the row. */
  message: string;
  /** Said in the checklist, in a few words. */
  summary: string;
  fix?: { label: string; change: IngredientFix };
}

export type StepCheckKind = 'step-label' | 'one-step' | 'not-listed';

export interface StepCheck {
  kind: StepCheckKind;
  message: string;
  summary: string;
  /** The steps this one becomes, or the ingredient it asks to add. */
  fix?: { label: string; steps?: string[]; ingredient?: Ingredient };
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

/** Units that are an amount on their own: "pinch salt" needs no number. */
const UNCOUNTED_UNITS = new Set(['pinch', 'dash', 'sprig', 'splash', 'handful', 'large', 'small', 'medium']);

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (word: string) => /[^s]s$/.test(word);
const dashes = (text: string) => text.replace(/(\d)\s*-\s*(\d)/g, '$1–$2');
const NUMBER_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** "in Produce", but "at the fish counter". */
function where(aisle: Aisle): string {
  return aisle === 'seafood' ? 'at the fish counter' : `in ${AISLE_LABELS[aisle]}`;
}

/** A trailing "(...)" and what comes before it. */
function splitParenthetical(name: string): { body: string; paren: string } {
  const m = /^(.*?)\s*(\([^()]*\))\s*$/.exec(name);
  return m ? { body: m[1], paren: m[2] } : { body: name, paren: '' };
}

/** The amount as typed: "2 tbsp", "½", "can", or ''. */
export function amountText(ing: Ingredient): string {
  if (ing.qty === null) return ing.unit;
  return ing.unit ? `${formatQty(ing.qty)} ${unitFor(ing.unit, ing.qty)}` : formatQty(ing.qty);
}

/** The whole row as one line, as it would be read aloud. */
export function rowText(ing: Ingredient): string {
  const amount = amountText(ing);
  if (!amount) return ing.name;
  // "7" and "-grain cereal" were one word before the scan cut them apart.
  return ing.name.startsWith('-') ? `${amount}${ing.name}` : `${amount} ${ing.name}`;
}

const short = (ing: Ingredient) => {
  const text = rowText(ing).trim();
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
};

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
    fix: { label: 'Move to the end', change: { type: 'replace', rows: [{ ...ing, name: `${rest} (${inner})` }] } },
  };
}

/** "-grain cereal": the end of a word whose start became the amount, or sits on the row above. */
function dashCheck(ing: Ingredient, prev?: Ingredient): IngredientCheck | null {
  if (!/^\s*-\s*\S/.test(ing.name) || /^\s*-\s*\d/.test(ing.name)) return null;
  if (ing.qty !== null) {
    const whole = rowText(ing).trim();
    return {
      kind: 'dash',
      message: 'The name starts with “-”, as if a word was cut in two.',
      summary: `“${ing.name.trim()}” starts with “-”`,
      fix: {
        label: `Make it “${whole}”`,
        change: { type: 'replace', rows: [{ ...ing, qty: null, unit: '', name: whole }] },
      },
    };
  }
  return {
    kind: 'dash',
    message: 'The name starts with “-”, as if it carries on from the row above.',
    summary: `“${ing.name.trim()}” starts with “-”`,
    ...(prev ? { fix: { label: 'Join with the row above', change: { type: 'join', with: 'previous' } } } : {}),
  };
}

/** "cooked grains (my favorites are: rice," with the rest of the line on the next row. */
function unclosedCheck(ing: Ingredient, next?: Ingredient): IngredientCheck | null {
  const opens = (ing.name.match(/\(/g) ?? []).length;
  const closes = (ing.name.match(/\)/g) ?? []).length;
  if (opens <= closes) return null;
  return {
    kind: 'unclosed',
    message: 'The “(” never closes, so the line may go on in the next row.',
    summary: `“${short(ing)}” has an unclosed “(”`,
    ...(next ? { fix: { label: 'Join with the next row', change: { type: 'join', with: 'next' } } } : {}),
  };
}

/** A line that stops on a joining word: "gochujang, plus", "butter or". */
function danglingCheck(ing: Ingredient, next?: Ingredient): IngredientCheck | null {
  const name = ing.name.trim();
  const m = /\b(plus|or|and|with|of|more)\s*$/i.exec(name);
  if (!m) return null;
  const word = m[1].toLowerCase();
  // "plus more" and "or more" are whole phrases; a bare "more" is not.
  if (word === 'more' && /\b(plus|and|or)\s+more\s*$/i.test(name)) return null;
  const fix: IngredientCheck['fix'] =
    word === 'plus'
      ? { label: 'Make it “plus more to taste”', change: { type: 'replace', rows: [{ ...ing, name: `${name} more to taste` }] } }
      : next
        ? { label: 'Join with the next row', change: { type: 'join', with: 'next' } }
        : undefined;
  return {
    kind: 'dangling',
    message: `The line ends in “${word}”.`,
    summary: `“${short(ing)}” — ${word} what?`,
    ...(fix ? { fix } : {}),
  };
}

/** "can tomato juice": a unit with no number in front of it. */
function noNumberCheck(ing: Ingredient): IngredientCheck | null {
  if (ing.qty !== null || !ing.unit || UNCOUNTED_UNITS.has(ing.unit.split(' ')[0])) return null;
  return {
    kind: 'no-number',
    message: `“${ing.unit}” with no number before it.`,
    summary: `“${ing.unit} ${ing.name}” has no number`,
    fix: { label: `Make it 1 ${ing.unit}`, change: { type: 'replace', rows: [{ ...ing, qty: 1 }] } },
  };
}

/** "½ hamburger": part of something bought by weight or measure, with nothing to measure it in. */
function noUnitCheck(ing: Ingredient): IngredientCheck | null {
  if (ing.qty === null || ing.unit || Number.isInteger(ing.qty)) return null;
  const match = matchAisle(ing.name);
  if (!match || match.aisle === 'produce' || /\beggs?\b/i.test(ing.name)) return null;
  return {
    kind: 'no-unit',
    message: `“${formatQty(ing.qty)}” of what? There’s no unit.`,
    summary: `“${formatQty(ing.qty)} ${ing.name}” has no unit`,
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
    fix: { label: `Move to ${AISLE_LABELS[want.aisle]}`, change: { type: 'replace', rows: [{ ...ing, aisle: want.aisle }] } },
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
        type: 'replace',
        rows: [
          { ...ing, name: half(parts[0]), aisle: a.aisle },
          { qty: null, unit: '', name: half(parts[1]), aisle: b.aisle, ...(ing.group ? { group: ing.group } : {}) },
        ],
      },
    },
  };
}

/**
 * "salt + pepper", "each: 1 tsp": signs of a second ingredient. A second
 * measurement ("12 oz/342 g") is one ingredient said twice, so it is not one.
 */
function severalCheck(ing: Ingredient): IngredientCheck | null {
  if (!/\s\+\s|\beach\s*:|\band\s+\d/i.test(ing.name)) return null;
  return {
    kind: 'several',
    message: 'This row may hold more than one ingredient.',
    summary: `“${short(ing)}” may be two rows`,
  };
}

/** The one thing most worth a look in a row, given the rows either side of it. */
export function checkIngredient(ing: Ingredient, prev?: Ingredient, next?: Ingredient): IngredientCheck | null {
  if (!ing.name.trim()) return null;
  return (
    stuckCheck(ing) ??
    dashCheck(ing, prev) ??
    unclosedCheck(ing, next) ??
    danglingCheck(ing, next) ??
    noNumberCheck(ing) ??
    twoInOneCheck(ing) ??
    noUnitCheck(ing) ??
    aisleCheck(ing) ??
    severalCheck(ing)
  );
}

/** A check for each row of a list, or null where there is nothing to say. */
export function checkIngredients(list: readonly Ingredient[]): (IngredientCheck | null)[] {
  return list.map((ing, i) => checkIngredient(ing, list[i - 1], list[i + 1]));
}

/** Two rows read as one: the first keeps its amount and aisle, the second its words. */
export function joinRows(first: Ingredient, second: Ingredient): Ingredient {
  const tail = rowText(second).trim();
  const glue = first.name.endsWith('-') || tail.startsWith('-') ? '' : ' ';
  return { ...first, name: `${first.name.trim()}${glue}${tail}`.trim() };
}

/** A step cut at its sentences: "Mix. Chill 2 hours." is two. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z(“"])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Taken for granted, or not food at all, so a step may use them unlisted. */
const ASSUMED = new Set([
  'salt',
  'kosher salt',
  'sea salt',
  'pepper',
  'black pepper',
  'white pepper',
  'salt and pepper',
  'oil',
  'vegetable oil',
  'stockpot',
]);

/** Words a list may use for what a step calls by a general name. */
const KINDS: Record<string, readonly string[]> = {
  beef: ['hamburger', 'chuck', 'steak', 'sirloin', 'brisket', 'roast', 'ground round'],
  chicken: ['thigh', 'breast', 'drumstick', 'wing', 'hen'],
  pork: ['ham', 'bacon', 'sausage', 'chop', 'tenderloin', 'ribs', 'shoulder'],
  pasta: ['spaghetti', 'penne', 'macaroni', 'noodles', 'rigatoni', 'linguine', 'fettuccine', 'orzo', 'lasagna'],
  noodles: ['spaghetti', 'pasta', 'macaroni', 'ramen', 'udon', 'egg noodles'],
  cheese: ['cheddar', 'mozzarella', 'parmesan', 'ricotta', 'feta', 'jack', 'velveeta', 'swiss'],
  fish: ['cod', 'salmon', 'tuna', 'halibut', 'tilapia', 'trout'],
  onion: ['shallot', 'scallion'],
  onions: ['shallot', 'scallion'],
};

/** One spelling for "tomatoes" and "tomato", "peaches" and "peach". */
function singular(word: string): string {
  if (/(ches|shes|xes|oes)$/.test(word)) return word.slice(0, -2);
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
}
const normal = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map(singular)
    .join(' ');

/** Whether a step's food word names something on the list. */
function listed(word: string, list: string): boolean {
  const wanted = normal(word);
  if (` ${list} `.includes(` ${wanted} `)) return true;
  return (KINDS[word] ?? []).some((kind) => ` ${list} `.includes(` ${normal(kind)} `));
}

/**
 * What is worth a look in each step. `ingredients` is every ingredient the
 * steps may use, the parts' included.
 */
export function checkSteps(steps: readonly string[], ingredients: readonly Ingredient[]): (StepCheck | null)[] {
  const list = normal(ingredients.map((i) => i.name).join(' | '));
  return steps.map((step, index) => {
    const label = /^\s*step\s*\d+\s*[:.)\-–]\s*/i.exec(step);
    if (label) {
      const said = label[0].trim();
      return {
        kind: 'step-label',
        message: `Starts with “${said}”, and the number is already shown.`,
        summary: `Step ${index + 1} starts with “${said}”`,
        fix: { label: `Remove “${said}”`, steps: [step.slice(label[0].length).trim()] },
      };
    }
    const parts = sentences(step);
    if (steps.length === 1 && parts.length > 1) {
      return {
        kind: 'one-step',
        message: `This step has ${numberWord(parts.length)} sentences — one per step reads better in cooking mode.`,
        summary: 'Method is one step',
        fix: { label: `Split into ${parts.length} steps`, steps: parts },
      };
    }
    if (ingredients.length === 0) return null;
    const missing = findFoods(step).find((f) => !ASSUMED.has(f.word) && !listed(f.word, list));
    if (!missing) return null;
    return {
      kind: 'not-listed',
      message: `Uses “${missing.word}”, which isn’t in the ingredients.`,
      summary: `Step ${index + 1} uses “${missing.word}”, not on the list`,
      fix: {
        label: 'Add it to the ingredients',
        ingredient: { qty: null, unit: '', name: missing.word, aisle: missing.aisle },
      },
    };
  });
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
