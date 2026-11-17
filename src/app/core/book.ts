import { facetTags } from './facets';
import { Recipe } from './model/recipes.model';
import { tagLabel } from './stores/recipe.store';

/**
 * How a printed cookbook is arranged: one A–Z run, or grouped. A book is one
 * cookbook, so there is no grouping by cookbook.
 */
export type BookOrder = 'title' | 'meal' | 'cuisine';

export const BOOK_ORDERS: readonly { id: BookOrder; label: string }[] = [
  { id: 'title', label: 'A–Z' },
  { id: 'meal', label: 'Meal' },
  { id: 'cuisine', label: 'Cuisine' },
];

export function parseBookOrder(value: string | null | undefined): BookOrder {
  return BOOK_ORDERS.some((o) => o.id === value) ? (value as BookOrder) : 'title';
}

/** A run of recipes under one heading; the A–Z order has a single unheaded one. */
export interface BookSection {
  label: string | null;
  recipes: Recipe[];
}

const OTHER = 'Other';

const byTitle = (a: Recipe, b: Recipe) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/**
 * The recipes a cookbook's book prints: those filed in it, less the component
 * recipes, which each print inside their parent.
 */
export function bookRecipes(recipes: readonly Recipe[], cookbookId: string): Recipe[] {
  return recipes.filter((r) => !r.component && r.cookbooks.includes(cookbookId));
}

/**
 * The book's sections, in print order. Each recipe is printed once: under its
 * first meal or cuisine in the order the library's filters use, with anything
 * unplaced in a last "Other" section. Component recipes are left out, since
 * each prints inside its parent.
 */
export function bookSections(recipes: readonly Recipe[], order: BookOrder): BookSection[] {
  const printable = recipes.filter((r) => !r.component);
  if (order === 'title') return [{ label: null, recipes: [...printable].sort(byTitle) }];

  // Group keys in the order their sections should run, with their headings.
  const groups = facetTags(order).map((tag) => ({ key: tag, label: tagLabel(tag) }));
  const keysOf = (r: Recipe): string[] => r.tags.map((t) => t.toLowerCase());

  const placed = new Map<string, Recipe[]>();
  for (const recipe of printable) {
    const keys = keysOf(recipe);
    const home = groups.find((g) => keys.includes(g.key))?.key ?? OTHER;
    placed.set(home, [...(placed.get(home) ?? []), recipe]);
  }

  return [...groups, { key: OTHER, label: OTHER }]
    .filter((g) => placed.has(g.key))
    .map((g) => ({ label: g.label, recipes: placed.get(g.key)!.sort(byTitle) }));
}
