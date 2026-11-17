/**
 * Finds where a step names one of the recipe's ingredients, so the recipe page
 * can show that ingredient's amount on the word itself ("add tomato juice" →
 * 1 can tomato juice) without sending the cook back up the list.
 *
 * Each ingredient is known by its core name, the part before a bracket and the
 * first comma that is not only description ("dried onion" for "dried onion,
 * minced"; "skinless chicken breasts" for "boneless, skinless chicken
 * breasts"), and by any shorter phrase
 * inside it that no other ingredient shares ("spaghetti" for "spaghetti
 * noodles", "chicken" for "boneless chicken thighs"). A phrase two ingredients
 * share, like "tomato" in tomato paste and tomato juice, names neither; nor does
 * a shorter phrase with a general noun after it, since "spaghetti sauce" is not
 * the spaghetti. Matching ignores case, takes whole words only, allows a plural
 * or a singular, and prefers the longest match where two overlap.
 */

/** A run of step text, which names ingredient `ingredient` when it is set. */
export interface StepPiece {
  text: string;
  ingredient?: number;
}

/**
 * Words that describe an ingredient rather than name it. A shorter phrase may
 * not start or end with one: "chopped" alone names nothing.
 */
const DESCRIPTORS = new Set([
  'a', 'an', 'and', 'or', 'of', 'the', 'to', 'for', 'with', 'in', 'plus', 'more', 'taste', 'optional',
  'chopped', 'minced', 'diced', 'sliced', 'grated', 'shredded', 'crushed', 'peeled', 'halved', 'quartered',
  'fresh', 'freshly', 'dried', 'ground', 'whole', 'cooked', 'frozen', 'canned', 'boneless', 'skinless',
  'large', 'small', 'medium', 'big', 'extra', 'virgin', 'packed', 'softened', 'melted', 'divided',
  'unsalted', 'salted', 'light', 'dark', 'hot', 'cold', 'warm', 'finely', 'coarsely', 'thinly', 'roughly',
]);

/**
 * Nouns too general to stand alone: "paste" could be any paste, "juice" any
 * juice. They still count inside a longer phrase ("tomato paste").
 */
const GENERIC = new Set([
  'paste', 'juice', 'powder', 'sauce', 'oil', 'leaves', 'leaf', 'seeds', 'flakes', 'mix', 'extract',
  'water', 'stock', 'broth', 'zest', 'spray', 'meat', 'seasoning',
]);

/** The name before any bracket, in its first comma-separated part that names something, as lowercase words. */
function coreWords(name: string): string[] {
  const parts = name
    .split('(')[0]
    .split(',')
    .map((part) =>
      part
        .toLowerCase()
        .replace(/[^a-z0-9'\- ]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean),
    );
  return parts.find((words) => words.some((w) => !DESCRIPTORS.has(w))) ?? [];
}

/** Every run of words in `words` with the word after it, longest first. */
function runs(words: readonly string[]): { run: string[]; next?: string }[] {
  const out: { run: string[]; next?: string }[] = [];
  for (let len = words.length; len >= 1; len--) {
    for (let start = 0; start + len <= words.length; start++) {
      out.push({ run: words.slice(start, start + len), next: words[start + len] });
    }
  }
  return out;
}

/** True when `next` turns the words before it into something else: "chicken" + "broth". */
const qualifies = (next: string | undefined) => !!next && (GENERIC.has(next) || GENERIC.has(stem(next)));

/** A pattern for one word that also takes its plural or singular. */
function wordPattern(word: string): string {
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (/ies$/.test(word)) return `${esc(word.slice(0, -3))}(?:y|ies)`;
  if (/(?:o|ch|sh|x|s)es$/.test(word)) return `${esc(word.slice(0, -2))}(?:es)?`;
  if (/[^s]s$/.test(word)) return `${esc(word.slice(0, -1))}s?`;
  if (/[^aeiou]y$/.test(word)) return `${esc(word.slice(0, -1))}(?:y|ies)`;
  if (/(?:o|ch|sh|x|s)$/.test(word)) return `${esc(word)}(?:es)?`;
  return `${esc(word)}s?`;
}

/** The phrase as words in a pattern: whole words, any spacing, the last one either number. */
function phrasePattern(words: readonly string[]): RegExp {
  const parts = words.map((w, i) => (i === words.length - 1 ? wordPattern(w) : w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`(?<![a-z0-9])${parts.join('\\s+')}(?![a-z0-9])`, 'gi');
}

/** A word with its plural ending taken off, so "onions" and "onion" compare equal. */
const stem = (word: string) => word.replace(/(?:ies|es|s)$/, '');

/**
 * The phrases that name each ingredient: its core name, then shorter runs no
 * other ingredient shares. A run with a general noun after it ("tomato" in
 * "tomato paste") names neither ingredient, and so is shared by neither.
 */
function namesFor(ingredients: readonly string[]): { words: string[]; ingredient: number; core: boolean }[] {
  const cores = ingredients.map(coreWords);
  const stemmedCores = cores.map((words) => words.map(stem));
  const claims = (other: readonly string[], key: readonly string[]) =>
    runs(other).some(({ run, next }) => run.join(' ') === key.join(' ') && !qualifies(next));
  const names: { words: string[]; ingredient: number; core: boolean }[] = [];
  cores.forEach((words, i) => {
    if (words.length === 0) return;
    names.push({ words, ingredient: i, core: true });
    for (const { run, next } of runs(words)) {
      if (run.length === words.length || qualifies(next)) continue;
      if (DESCRIPTORS.has(run[0]) || DESCRIPTORS.has(run.at(-1)!)) continue;
      if (run.length === 1 && (GENERIC.has(run[0]) || run[0].length < 3)) continue;
      const key = run.map(stem);
      const shared = stemmedCores.some((other, j) => j !== i && claims(other, key));
      if (!shared) names.push({ words: run, ingredient: i, core: false });
    }
  });
  return names;
}

/** Splits a step into plain text and the runs that name an ingredient. */
export function mentionPieces(step: string, ingredients: readonly string[]): StepPiece[] {
  const found: { start: number; end: number; ingredient: number }[] = [];
  for (const { words, ingredient, core } of namesFor(ingredients)) {
    for (const m of step.matchAll(phrasePattern(words))) {
      const end = m.index + m[0].length;
      // "spaghetti sauce", "chicken broth": the next word makes it something else.
      const next = /^\s+([a-z]+)/i.exec(step.slice(end))?.[1]?.toLowerCase();
      if (!core && next && (GENERIC.has(next) || GENERIC.has(stem(next)))) continue;
      found.push({ start: m.index, end, ingredient });
    }
  }
  // Longest first, then earliest; a match overlapping one already taken is dropped.
  found.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken: typeof found = [];
  for (const m of found) {
    if (!taken.some((t) => m.start < t.end && t.start < m.end)) taken.push(m);
  }
  taken.sort((a, b) => a.start - b.start);

  const pieces: StepPiece[] = [];
  let at = 0;
  for (const m of taken) {
    if (m.start > at) pieces.push({ text: step.slice(at, m.start) });
    pieces.push({ text: step.slice(m.start, m.end), ingredient: m.ingredient });
    at = m.end;
  }
  if (at < step.length) pieces.push({ text: step.slice(at) });
  return pieces;
}
