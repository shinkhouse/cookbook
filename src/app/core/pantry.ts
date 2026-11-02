/**
 * "What can I make with…" (roadmap item 12): how much of a recipe the
 * ingredients you have cover.
 *
 * Staples are left out of the measure, since nearly every kitchen has them and
 * counting them would rank a recipe higher for needing salt.
 */
import { containsWord } from './aisle';
import { ingredientKey } from './ingredient-key';
import { Ingredient } from './model/recipes.model';

export const PANTRY_STAPLES: ReadonlySet<string> = new Set([
  'salt',
  'kosher salt',
  'sea salt',
  'pepper',
  'black pepper',
  'ground black pepper',
  'salt and pepper',
  'water',
  'oil',
  'olive oil',
  'vegetable oil',
  'cooking spray',
  'sugar',
  'flour',
  'all purpose flour',
  'all-purpose flour',
  'baking soda',
  'baking powder',
]);

export interface Coverage {
  covered: number;
  total: number;
  ratio: number;
}

/** "Chicken, rice and broccoli" -> ['chicken', 'rice', 'broccoli'], keyed like ingredients. */
export function parseHave(text: string): string[] {
  const terms = text
    .toLowerCase()
    .split(/[,;\n]|\band\b/)
    .map((part) => ingredientKey(part))
    .filter((key) => key !== '');
  return [...new Set(terms)];
}

/**
 * The share of a recipe's non-staple ingredients that `have` covers. An
 * ingredient listed twice (say, in two groups) counts once. Null when there is
 * nothing but staples to measure.
 */
export function coverageOf(ingredients: readonly Ingredient[], have: readonly string[]): Coverage | null {
  const keys = new Set<string>();
  for (const i of ingredients) {
    const key = ingredientKey(i.name);
    if (key && !PANTRY_STAPLES.has(key)) keys.add(key);
  }
  if (keys.size === 0) return null;
  let covered = 0;
  for (const key of keys) {
    if (have.some((h) => containsWord(key, h) || containsWord(h, key))) covered++;
  }
  return { covered, total: keys.size, ratio: covered / keys.size };
}

/** Best match first: covered share, then covered count, then fewest ingredients, then title. */
export function compareCoverage(
  a: { title: string; coverage: Coverage },
  b: { title: string; coverage: Coverage },
): number {
  return (
    b.coverage.ratio - a.coverage.ratio ||
    b.coverage.covered - a.coverage.covered ||
    a.coverage.total - b.coverage.total ||
    a.title.localeCompare(b.title)
  );
}
