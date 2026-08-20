import { Recipe } from './model/recipes.model';

/**
 * What a recipe is still missing.
 *
 * Derived rather than stored: a flag on the record would need maintaining, and
 * would go stale the moment someone added the photo. These read the recipe, so
 * they are right by construction and a gap disappears from the list the moment
 * it is actually filled.
 */
export interface RecipeGaps {
  /** No photograph, so the card and hero fall back to the placeholder. */
  needsPhoto: boolean;
  /** No method at all — the recipe cannot be cooked from what is here. */
  needsMethod: boolean;
  /**
   * Has a method, but suspiciously little of it for the number of ingredients.
   * A heuristic, and deliberately a separate flag from `needsMethod`: a short
   * method is a judgement, an absent one is a fact.
   */
  thinMethod: boolean;
  /** Anything at all worth doing. */
  any: boolean;
}

/**
 * An ingredient count above which two steps stops looking like brevity and
 * starts looking like something got lost. Chosen from the collection: at eight
 * or more ingredients every two-step recipe in the data reads as truncated,
 * while the genuinely simple ones — Pico de Gallo at six, Black Beans at four —
 * sit below it.
 */
const BUSY_INGREDIENTS = 8;
const FEW_STEPS = 2;

export function gapsOf(recipe: Recipe): RecipeGaps {
  const needsPhoto = !recipe.photo;
  const needsMethod = recipe.steps.length === 0;
  const thinMethod =
    !needsMethod &&
    recipe.steps.length <= FEW_STEPS &&
    recipe.ingredients.length >= BUSY_INGREDIENTS;

  return {
    needsPhoto,
    needsMethod,
    thinMethod,
    any: needsPhoto || needsMethod || thinMethod,
  };
}

/** Short label for the card badge, or '' when there is nothing to say. */
export function gapLabel(gaps: RecipeGaps): string {
  // Ordered by how much it matters: a missing method beats a missing photo.
  if (gaps.needsMethod) return 'No method';
  if (gaps.thinMethod && gaps.needsPhoto) return 'Needs photo & steps';
  if (gaps.thinMethod) return 'Few steps';
  if (gaps.needsPhoto) return 'Needs photo';
  return '';
}

/** The fuller sentence used on the recipe itself. */
export function gapSentence(gaps: RecipeGaps): string {
  const parts: string[] = [];
  if (gaps.needsMethod) parts.push('no method written down yet');
  else if (gaps.thinMethod) parts.push('a method that looks shorter than the ingredient list');
  if (gaps.needsPhoto) parts.push('no photograph');
  if (parts.length === 0) return '';
  return `This one has ${parts.join(' and ')}.`;
}
