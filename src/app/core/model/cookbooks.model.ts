/**
 * A named collection of recipes — Sam's, Bob's, Grandma's.
 *
 * Metadata only: which recipes belong to it lives on the recipe, as
 * `Recipe.cookbooks`. See the 2026-08-21 design, §2, for why that direction
 * rather than a `recipeSlugs` array here or a join collection.
 */
export interface Cookbook {
  /** Stable key that `Recipe.cookbooks` references. Slug-style. */
  id: string;
  /** Display name, e.g. "Grandma's Cookbook". */
  name: string;
  /** Optional one-line description, for a future cookbook picker. */
  description?: string;
}

/**
 * The cookbook every existing recipe is filed into.
 *
 * Lives here rather than beside the seed data because the repository's migration
 * needs it to backfill records stored before cookbooks existed, and that is a
 * model concern rather than a mock-data one.
 */
export const DEFAULT_COOKBOOK_ID = 'sams-cookbook';

/** Seeded the first time the app runs, the same way recipes are. */
export const CookbookSeed: Cookbook[] = [
  { id: DEFAULT_COOKBOOK_ID, name: "My Cookbooks" },
];
