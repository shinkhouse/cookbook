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
}

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
};
