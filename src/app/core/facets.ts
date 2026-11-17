/**
 * Groups the derived tag list into the facets the library filters by.
 *
 * Tags come from the recipe data rather than a fixed vocabulary (§4.1), so this
 * cannot be a closed list: anything not named below is collected into a trailing
 * catch-all facet. A new recipe introducing a new tag therefore stays filterable
 * instead of silently disappearing from the controls.
 */

export interface FacetDef {
  id: string;
  label: string;
  /** Tags belonging to this facet, in the order they should be offered. */
  tags: readonly string[];
}

export interface Facet {
  id: string;
  label: string;
  /**
   * What the options mean. Tag facets match against a recipe's tags; the gap
   * facet matches against what a recipe is still missing, which is derived
   * rather than stored and so cannot live in the tag list. The cookbook facet
   * matches the cookbook ids a recipe is filed in.
   */
  kind: 'tag' | 'gap' | 'cookbook';
  /** Tag names, or gap keys, depending on `kind`. */
  options: string[];
}

/** The id of the derived completeness facet. */
export const GAP_FACET = 'gaps';

/** The id of the cookbook facet. */
export const COOKBOOK_FACET = 'cookbook';

/**
 * The cookbook facet, or null when there is nothing to choose between: with one
 * cookbook every recipe is in it, so the control would only be noise. Options are
 * the ids, in store order; the library resolves them to names for display.
 */
export function cookbookFacet(cookbooks: readonly { id: string; name: string }[]): Facet | null {
  if (cookbooks.length < 2) return null;
  return {
    id: COOKBOOK_FACET,
    label: 'Cookbook',
    kind: 'cookbook',
    options: cookbooks.map((c) => c.id),
  };
}

/** Gap keys, in the order they are offered. */
export const GAP_OPTIONS = ['method', 'steps', 'photo'] as const;
export type GapKey = (typeof GAP_OPTIONS)[number];

/** Display labels for the gap options. */
export const GAP_LABELS: Record<GapKey, string> = {
  method: 'No method',
  steps: 'Few steps',
  photo: 'No photo',
};

/** The catch-all's id, so callers can tell it apart if they need to. */
export const OTHER_FACET = 'other';

/**
 * Ordered most- to least-useful for narrowing this collection. Meal comes first
 * because it is what someone actually asks ("what's for dinner"), even though
 * dinner and lunch are the least selective tags in the data. The church
 * cookbooks file recipes by course and kind ("main dish", "cookies"), so those
 * tags have homes here too rather than all landing in Other.
 */
const DEFS: readonly FacetDef[] = [
  {
    id: 'meal',
    label: 'Meal',
    tags: [
      'breakfast',
      'lunch',
      'dinner',
      'appetizer',
      'main dish',
      'side dish',
      'dessert',
      'snack',
      'beverage',
    ],
  },
  {
    id: 'protein',
    label: 'Protein',
    tags: [
      'beef',
      'ground beef',
      'chicken',
      'turkey',
      'pork',
      'sausage',
      'seafood',
      'fish',
      'salmon',
      'shrimp',
      'eggs',
    ],
  },
  {
    id: 'cuisine',
    label: 'Cuisine',
    // `asian` is on every East and Southeast Asian recipe as well as its own
    // cuisine, so one option finds them all; it leads the ones it covers.
    tags: [
      'american',
      'italian',
      'mexican',
      'french',
      'german',
      'scandinavian',
      'asian',
      'chinese',
      'korean',
      'thai',
      'indian',
      'mediterranean',
      'cajun',
      'cuban',
    ],
  },
  {
    id: 'dish',
    label: 'Dish',
    tags: [
      'soup',
      'stew',
      'salad',
      'casserole',
      'pasta',
      'noodles',
      'rice',
      'sandwich',
      'tacos',
      'tortilla',
      'vegetables',
      'bread',
      'rolls',
      'muffins',
      'dip',
      'sauce',
      'salsa',
      'dressing',
      'jam',
      'pickles',
    ],
  },
  {
    // Kept apart from Dish: the books hold hundreds of cakes, pies and cookies,
    // and folded in with soups and casseroles they would bury them.
    id: 'sweets',
    label: 'Sweets',
    tags: ['cake', 'cheesecake', 'pie', 'cookies', 'bars', 'candy', 'pudding', 'ice cream', 'frosting'],
  },
  {
    id: 'method',
    label: 'Method',
    tags: [
      'canning',
      'microwave',
      'slow cooker',
      'one pot',
      'skillet',
      'sheet-pan',
      'make-ahead',
      'quick',
      'easy',
      'weeknight',
    ],
  },
  {
    id: 'diet',
    label: 'Diet',
    tags: ['diabetic', 'low calorie'],
  },
  {
    id: 'ingredient',
    label: 'Ingredient',
    tags: [
      'broccoli',
      'cheese',
      'mozzarella',
      'tomato',
      'cherry tomato',
      'grape tomato',
      'corn',
      'zucchini',
      'peach',
      'basil',
      'vanilla',
      'honey',
      'balsamic vinegar',
      'red pepper flakes',
      'orzo',
    ],
  },
];

/**
 * What recipe sites call things the filters already have a word for. NYT
 * Cooking tags a pasta "pastas" and its chicken "chicken thigh"; read through
 * this, the recipe lands under Pasta and Chicken like every other.
 */
const SYNONYMS: Readonly<Record<string, string>> = {
  // Meal
  'main course': 'main dish',
  main: 'main dish',
  entree: 'main dish',
  'entrée': 'main dish',
  side: 'side dish',
  sides: 'side dish',
  'side dishes': 'side dish',
  appetizers: 'appetizer',
  starter: 'appetizer',
  starters: 'appetizer',
  desserts: 'dessert',
  brunch: 'breakfast',
  snacks: 'snack',
  drink: 'beverage',
  drinks: 'beverage',
  beverages: 'beverage',
  cocktail: 'beverage',
  // Protein
  'chicken breast': 'chicken',
  'chicken thigh': 'chicken',
  'chicken leg': 'chicken',
  'chicken drumstick': 'chicken',
  'chicken wings': 'chicken',
  'ground chicken': 'chicken',
  'roast chicken': 'chicken',
  'beef stew meat': 'beef',
  'beef tenderloin': 'beef',
  steak: 'beef',
  'pork shoulder': 'pork',
  'pork chop': 'pork',
  'ground pork': 'pork',
  ham: 'pork',
  'italian sausage': 'sausage',
  'ground turkey': 'turkey',
  scallops: 'seafood',
  'sea scallop': 'seafood',
  crab: 'seafood',
  shellfish: 'seafood',
  cod: 'fish',
  tilapia: 'fish',
  halibut: 'fish',
  tuna: 'fish',
  egg: 'eggs',
  // Cuisine: `asian` already covers East and Southeast Asian cooking.
  'italian american': 'italian',
  'tex-mex': 'mexican',
  southern: 'american',
  creole: 'cajun',
  japanese: 'asian',
  vietnamese: 'asian',
  greek: 'mediterranean',
  'middle eastern': 'mediterranean',
  // Dish
  soups: 'soup',
  stews: 'stew',
  chili: 'stew',
  salads: 'salad',
  casseroles: 'casserole',
  pastas: 'pasta',
  spaghetti: 'pasta',
  rigatoni: 'pasta',
  fettuccine: 'pasta',
  linguine: 'pasta',
  penne: 'pasta',
  pappardelle: 'pasta',
  lasagna: 'pasta',
  macaroni: 'pasta',
  noodle: 'noodles',
  ramen: 'noodles',
  'ramen noodle': 'noodles',
  udon: 'noodles',
  'udon noodle': 'noodles',
  soba: 'noodles',
  sandwiches: 'sandwich',
  taco: 'tacos',
  breads: 'bread',
  roll: 'rolls',
  muffin: 'muffins',
  dips: 'dip',
  sauces: 'sauce',
  'sauces and gravies': 'sauce',
  gravy: 'sauce',
  pesto: 'sauce',
  'pesto (dish)': 'sauce',
  dressings: 'dressing',
  // Sweets
  cakes: 'cake',
  'gooey butter cake': 'cake',
  pies: 'pie',
  tart: 'pie',
  tarts: 'pie',
  cookie: 'cookies',
  bar: 'bars',
  brownies: 'bars',
  candies: 'candy',
  puddings: 'pudding',
  // Method
  'slow-cooker': 'slow cooker',
  crockpot: 'slow cooker',
  'crock pot': 'slow cooker',
  'crock-pot': 'slow cooker',
  'one-pot': 'one pot',
  'dutch oven': 'one pot',
  'instant pot': 'one pot',
  'sheet pan': 'sheet-pan',
  'cast iron': 'skillet',
  'make ahead': 'make-ahead',
  'plan-ahead': 'make-ahead',
  'freezer friendly': 'make-ahead',
  'freezer-friendly': 'make-ahead',
  'five ingredient': 'easy',
  // Diet
  'low-calorie': 'low calorie',
  // Ingredient
  parmesan: 'cheese',
  ricotta: 'cheese',
  cheddar: 'cheese',
  'cream cheese': 'cheese',
  tomatoes: 'tomato',
  'canned tomato': 'tomato',
  'canned plum tomato': 'tomato',
  'crushed canned tomato': 'tomato',
  'sun-dried tomato': 'tomato',
  'red pepper flake': 'red pepper flakes',
  peaches: 'peach',
};

const VOCABULARY: ReadonlySet<string> = new Set(DEFS.flatMap((def) => def.tags));

/**
 * An imported recipe's tags, in the filters' words. Each maps to its word
 * where it has one, and is dropped where it has none: sites tag every
 * ingredient and occasion ("heavy cream", "super bowl"), and kept, those
 * would fill the Other menu. Only imports are read through this; a tag typed
 * by hand is kept as typed, which is what Other is for.
 */
export function vocabularyTags(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of raw) {
    const needle = tag.trim().toLowerCase();
    const word = VOCABULARY.has(needle) ? needle : SYNONYMS[needle];
    if (word && !out.includes(word)) out.push(word);
  }
  return out;
}

/** A defined facet's tags in the order they are offered, or [] for an unknown id. */
export function facetTags(id: string): readonly string[] {
  return DEFS.find((def) => def.id === id)?.tags ?? [];
}

/**
 * Builds the facets to show for a given tag list. A facet with no matching tags
 * is dropped, so the controls never offer an empty menu.
 */
export function buildFacets(allTags: readonly string[]): Facet[] {
  const available = new Set(allTags.map((t) => t.toLowerCase()));
  const claimed = new Set<string>();
  const facets: Facet[] = [];

  for (const def of DEFS) {
    const options = def.tags.filter((tag) => available.has(tag));
    for (const tag of options) claimed.add(tag);
    if (options.length > 0) {
      facets.push({ id: def.id, label: def.label, kind: 'tag', options });
    }
  }

  const leftovers = [...available].filter((tag) => !claimed.has(tag)).sort();
  if (leftovers.length > 0) {
    facets.push({ id: OTHER_FACET, label: 'Other', kind: 'tag', options: leftovers });
  }

  // Last in the bar: what a recipe still needs is a different question from
  // what it is, so it reads better after the descriptive facets.
  facets.push({
    id: GAP_FACET,
    label: 'Needs work',
    kind: 'gap',
    options: [...GAP_OPTIONS],
  });

  return facets;
}

/**
 * Which facet a tag belongs to, or the catch-all. Needed because the filter
 * combines selections differently within a facet than across facets.
 */
export function facetOf(tag: string): string {
  const needle = tag.toLowerCase();
  for (const def of DEFS) {
    if (def.tags.includes(needle)) return def.id;
  }
  return OTHER_FACET;
}

/**
 * Groups a flat set of selected tags by the facet each belongs to.
 *
 * This is what makes the filter behave the way people expect of facets:
 * selections *within* one facet widen the result (dinner OR lunch), while
 * selections *across* facets narrow it (a dinner AND italian). Treating every
 * selection as AND would make two meals return nothing at all.
 */
export function groupSelection(selected: Iterable<string>): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const tag of selected) {
    const id = facetOf(tag);
    const bucket = grouped.get(id);
    if (bucket) bucket.add(tag.toLowerCase());
    else grouped.set(id, new Set([tag.toLowerCase()]));
  }
  return grouped;
}

/** True when the recipe's tags satisfy every facet that has a selection. */
export function matchesSelection(
  recipeTags: readonly string[],
  selected: Iterable<string>,
): boolean {
  const grouped = groupSelection(selected);
  if (grouped.size === 0) return true;

  const owned = new Set(recipeTags.map((t) => t.toLowerCase()));
  for (const wanted of grouped.values()) {
    // OR within the facet: any one of them is enough.
    let hit = false;
    for (const tag of wanted) {
      if (owned.has(tag)) {
        hit = true;
        break;
      }
    }
    // AND across facets: every facet with a selection has to be satisfied.
    if (!hit) return false;
  }
  return true;
}
