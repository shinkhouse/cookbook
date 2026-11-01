import { Aisle } from '../aisle';

export type { Aisle };

/** `qty: null` means "to taste" — the amount is deliberately unspecified. */
export interface Ingredient {
  qty: number | null;
  /** '' for countables, e.g. "3 scallions". */
  unit: string;
  name: string;
  aisle: Aisle;
  /**
   * The sub-component this belongs to, for recipes built from parts — "For the
   * marinade", "Braised chicken", "Rice". Absent on the majority of recipes.
   *
   * Needed because the imported family cookbook has recipes whose ingredient
   * list is really three lists; without it a marinade's soy sauce sits
   * indistinguishable among the stir-fry ingredients.
   */
  group?: string;
}

export interface Recipe {
  slug: string;
  title: string;
  /** Credit line, rendered italic. Absent when there is no one to credit. */
  subtitle?: string;
  tags: string[];
  /** Display string, e.g. "20–30 min". Not parsed. */
  time: string;
  /** Base yield that the servings scaler multiplies against. */
  servings: number;
  /** Times-cooked counter, shown on the card and the detail rail. */
  cooked: number;
  /** Short card copy. */
  blurb: string;
  /** Longer detail-page copy. */
  desc: string;
  ingredients: Ingredient[];
  steps: string[];
  notes: string[];
  photo?: string;
  /**
   * Ids of the cookbooks this recipe appears in — a recipe can sit in several
   * at once, and in none at all. Empty is legal: an unfiled recipe still
   * belongs to you and still shows in the pooled library.
   *
   * Required rather than optional so consumers need not write
   * `r.cookbooks ?? []` everywhere; records stored before cookbooks existed are
   * normalised by the repository on the way out.
   */
  cookbooks: string[];
  /**
   * Soft delete: an archived recipe is hidden from the site but stays in the
   * database. There is no restore in the app — clear the flag by hand in Mongo.
   */
  archived?: boolean;
  /** Where the recipe was imported from. An http(s) URL; the page links to it. */
  sourceUrl?: string;
  /**
   * True for a sub-recipe ("the sauce") that exists only to be embedded in a
   * parent. It is a full recipe document and is listed and searchable like any
   * other recipe; `componentsOf` is how a parent finds it.
   */
  component?: boolean;
  /** Sub-recipes embedded in this one, in display order. One level deep only. */
  components?: { slug: string; label?: string }[];
}

/**
 * A recipe as authored, before it is filed into any cookbook.
 *
 * The seed data is written in this shape so that filing happens in one place
 * (`fileInto`) rather than being repeated across 72 literals.
 */
export type RecipeSource = Omit<Recipe, 'cookbooks'>;

/** A blank draft for the create flow. */
export const RecipeTemplate: Recipe = {
  slug: '',
  title: '',
  tags: [],
  time: '',
  servings: 4,
  cooked: 0,
  blurb: '',
  desc: '',
  ingredients: [],
  steps: [],
  notes: [],
  // Starts unfiled. Which cookbook a new recipe lands in is a question for the
  // create screen, which does not ask it yet.
  cookbooks: [],
};
