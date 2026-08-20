/**
 * The §8 corpus test: every ingredient line in the real recipe data.
 *
 * This is the gate on the §4.1 migration. The parser is about to be run once,
 * destructively, over all 137 lines to produce the seed data — so the standing
 * requirement is that no line parses into nonsense silently, and that the lines
 * a human must look at are a known, enumerated set rather than a surprise.
 */

import { parseIngredient } from './ingredient-parser';
import { Recipes } from './mock/recipes.mock';

const ALL_LINES: { recipe: string; line: string }[] = Recipes.flatMap((r) =>
  (r.ingredients as string[]).map((line) => ({ recipe: r.title, line })),
);

/**
 * Lines that legitimately need a human eye, with the reason. Everything else
 * must parse cleanly. Adding to this list is a deliberate act, not a shrug.
 */
const EXPECTED_REVIEW = new Set([
  '1 can (400 ml/14 oz) crushed tomatoes', // dual measure inside a parenthetical
  '3/4 cup/200 ml low fat cream', // dual measure
  '1/2 tsp each: dried oregano, thyme, smoked paprika', // three ingredients
  'salt + black pepper', // two ingredients
]);

describe('ingredient corpus — the real recipe data', () => {
  // The design spec says 137; the real array holds 136. The count is pinned so
  // that data edits during the migration cannot silently drop a line.
  it('covers all 136 lines', () => {
    expect(ALL_LINES.length).toBe(136);
  });

  it('never produces an empty name', () => {
    const empty = ALL_LINES.filter(({ line }) => !parseIngredient(line).name.trim());
    expect(empty).toEqual([]);
  });

  it('never leaves a quantity stranded at the front of the name', () => {
    // A name starting with a digit means the quantity was not consumed. The one
    // real exception is a dimension: '10 10" corn tortillas' is ten 10-inch
    // tortillas, so the second number is part of the name.
    const stranded = ALL_LINES.filter(({ line }) => {
      const { name } = parseIngredient(line);
      return /^\d/.test(name) && !/^\d+\s*["”′]/.test(name);
    }).map(({ line }) => line);
    expect(stranded).toEqual([]);
  });

  it('never leaves measurement debris at the front of the name', () => {
    // The bug this catches: U+2044 FRACTION SLASH is not '/', so "1⁄4 cup soy
    // sauce" parsed as qty 1 with the name "⁄4 cup soy sauce". A leading slash,
    // dash or fraction glyph always means the quantity was only half-consumed.
    const debris = ALL_LINES.filter(({ line }) =>
      /^[\/⁄∕\-–—.]/.test(parseIngredient(line).name.trim()),
    ).map(({ line }) => line);
    expect(debris).toEqual([]);
  });

  it('never leaves a unit word stranded at the front of the name', () => {
    // "1/4 cup Water" must not name itself "cup Water".
    const units = /^(cups?|tsps?|tbsps?|teaspoons?|tablespoons?|oz|ounces?|lbs?|pounds?|ml|g|grams?)\b/i;
    const stranded = ALL_LINES.filter(({ line }) => {
      const p = parseIngredient(line);
      // Lines already flagged for review are the human's problem by design.
      return p.qty !== null && !p.needsReview && units.test(p.name.trim());
    }).map(({ line }) => line);
    expect(stranded).toEqual([]);
  });

  it('never leaves a connective at the front of the name', () => {
    const dangling = ALL_LINES.filter(({ line }) =>
      /^(of|the|a|an)\b/i.test(parseIngredient(line).name),
    ).map(({ line }) => line);
    expect(dangling).toEqual([]);
  });

  it('flags exactly the known multi-ingredient and dual-measure lines', () => {
    const flagged = ALL_LINES.filter(({ line }) => parseIngredient(line).needsReview)
      .map(({ line }) => line)
      .sort();
    expect(flagged).toEqual([...EXPECTED_REVIEW].sort());
  });

  it('assigns every line a valid aisle', () => {
    const valid = new Set(['produce', 'meat', 'seafood', 'dairy', 'pantry']);
    const bad = ALL_LINES.filter(({ line }) => !valid.has(parseIngredient(line).aisle));
    expect(bad).toEqual([]);
  });

  it('resolves a quantity for every line that opens with a digit', () => {
    const missed = ALL_LINES.filter(
      ({ line }) => /^\s*[\d¼-¾⅐-⅞]/.test(line) && parseIngredient(line).qty === null,
    ).map(({ line }) => line);
    expect(missed).toEqual([]);
  });
});
