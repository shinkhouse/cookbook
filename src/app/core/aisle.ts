/**
 * Maps an ingredient name onto a supermarket aisle.
 *
 * Longest keyword match wins, so "chicken broth" lands in pantry rather than
 * being dragged into meat by the word "chicken".
 */

export type Aisle = 'produce' | 'meat' | 'seafood' | 'dairy' | 'pantry';

/** Display order in the shopping list. */
export const AISLE_ORDER: readonly Aisle[] = [
  'produce',
  'meat',
  'seafood',
  'dairy',
  'pantry',
];

/** Storage key to display label. Note seafood reads as "Fish counter". */
export const AISLE_LABELS: Record<Aisle, string> = {
  produce: 'Produce',
  meat: 'Meat',
  seafood: 'Fish counter',
  dairy: 'Dairy',
  pantry: 'Pantry',
};

/**
 * Keyword table. Multi-word entries are what make the longest-match rule useful:
 * "chicken broth" is listed under pantry and outranks bare "chicken" in meat.
 */
const KEYWORDS: ReadonlyArray<readonly [Aisle, readonly string[]]> = [
  [
    'produce',
    [
      'basil', 'parsley', 'cilantro', 'thyme', 'rosemary', 'oregano', 'sage',
      'garlic', 'onion', 'onions', 'shallot', 'scallion', 'scallions', 'leek',
      'tomato', 'tomatoes', 'potato', 'potatoes', 'carrot', 'carrots', 'celery',
      'pepper', 'peppers', 'bell pepper', 'jalapeno', 'jalapeño', 'chili pepper',
      'broccoli', 'spinach', 'kale', 'lettuce', 'cabbage', 'zucchini', 'squash',
      'mushroom', 'mushrooms', 'cucumber', 'lemon', 'lime', 'orange', 'apple',
      'avocado', 'ginger', 'corn', 'peas', 'green beans', 'asparagus',
    ],
  ],
  [
    'meat',
    [
      'chicken', 'chicken breast', 'chicken breasts', 'chicken thigh',
      'chicken thighs', 'beef', 'ground beef', 'hamburger', 'steak', 'pork',
      'bacon', 'sausage', 'ham', 'turkey', 'lamb', 'prosciutto', 'pancetta',
      'chorizo', 'ribs', 'brisket',
    ],
  ],
  [
    'seafood',
    [
      'shrimp', 'prawn', 'prawns', 'salmon', 'tuna', 'cod', 'halibut', 'tilapia',
      'trout', 'scallop', 'scallops', 'crab', 'lobster', 'clam', 'clams',
      'mussel', 'mussels', 'oyster', 'oysters', 'anchovy', 'anchovies', 'fish',
    ],
  ],
  [
    'dairy',
    [
      'milk', 'cream', 'heavy cream', 'half and half', 'butter', 'cheese',
      'parmesan', 'mozzarella', 'cheddar', 'ricotta', 'feta', 'yogurt',
      'sour cream', 'cream cheese', 'egg', 'eggs', 'buttermilk', 'mascarpone',
    ],
  ],
  [
    'pantry',
    [
      // Listed explicitly so they outrank shorter matches in other aisles.
      'chicken broth', 'chicken stock', 'beef broth', 'beef stock',
      'vegetable broth', 'fish sauce', 'oyster sauce', 'clam juice',
      'cream of mushroom', 'coconut milk', 'evaporated milk', 'condensed milk',
      'tomato paste', 'tomato sauce', 'tomato juice', 'crushed tomatoes',
      'canned tomatoes', 'garlic powder', 'onion powder', 'dried onion',
      'dried basil', 'dried oregano', 'chili powder',
      'flour', 'sugar', 'salt', 'olive oil', 'vegetable oil', 'sesame oil',
      'vinegar', 'soy sauce', 'pasta', 'spaghetti', 'noodles', 'rice', 'beans',
      'broth', 'stock', 'yeast', 'baking soda', 'baking powder', 'cornstarch',
      'honey', 'maple syrup', 'mustard', 'ketchup', 'mayonnaise', 'sriracha',
      'paprika', 'cumin', 'cinnamon', 'nutmeg', 'bay leaf', 'red pepper flakes',
      'sesame seeds', 'breadcrumbs', 'panko', 'wine', 'stockpot',
    ],
  ],
];

/** Flattened and pre-sorted longest-first so the first hit is the best hit. */
const RANKED: ReadonlyArray<readonly [string, Aisle]> = KEYWORDS.flatMap(
  ([aisle, words]) => words.map((word) => [word, aisle] as const),
).sort((a, b) => b[0].length - a[0].length);

export function inferAisle(name: string): Aisle {
  const haystack = name.toLowerCase();
  for (const [word, aisle] of RANKED) {
    if (containsWord(haystack, word)) return aisle;
  }
  return 'pantry';
}

/**
 * Whole-word containment, so "creamy dressing" does not match "cream" and
 * "creamer" does not match "cream" either.
 */
function containsWord(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return false;

    const before = at === 0 ? '' : haystack[at - 1];
    const afterIndex = at + needle.length;
    const after = afterIndex >= haystack.length ? '' : haystack[afterIndex];

    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = at + 1;
  }
}

function isWordChar(ch: string): boolean {
  return ch !== '' && /[a-z0-9]/.test(ch);
}
