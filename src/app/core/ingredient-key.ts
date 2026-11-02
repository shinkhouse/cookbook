/**
 * A loose identity for an ingredient name, so "Onions, diced" and "onion" land
 * on the same shopping-list row. Deliberately simple: it only has to agree
 * with itself across recipes, not understand English.
 */

const DESCRIPTORS = /^(?:(?:small|medium|large|fresh|chopped|diced|minced|sliced)\s+)+/;

/** Plurals that look like they end in a removable "s" but do not. */
const INVARIANT = ['molasses', 'hummus', 'asparagus', 'couscous', 'swiss'];

/** The text before the first comma, without parentheticals, lowercased. */
export function ingredientHead(name: string): string {
  // Parentheticals go first so a comma inside "(12 oz, 342 g)" is not the cut.
  return name
    .replace(/\([^)]*\)/g, ' ')
    .split(',')[0]
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Drops leading size and prep words: "large diced tomatoes" -> "tomatoes". */
export function stripDescriptors(head: string): string {
  return head.replace(DESCRIPTORS, '');
}

export function singular(word: string): string {
  if (INVARIANT.includes(word)) return word;
  if (word.length > 4 && word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('oes')) return word.slice(0, -2);
  if (/(?:ch|sh|x|z)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

/** The merge key: '' when the name has nothing to key on. */
export function ingredientKey(name: string): string {
  const words = stripDescriptors(ingredientHead(name)).split(' ');
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}
