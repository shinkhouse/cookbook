import { containsWord } from './aisle';
import { ingredientHead, ingredientKey, stripDescriptors } from './ingredient-key';
import { Ingredient } from './model/recipes.model';

/**
 * The ingredients a step's text names, each once, in list order. Matching is
 * by whole word on the ingredient's head ("large onion" -> "onion"), so "oil"
 * does not claim "olive oil" and "pea" does not claim "peach".
 */
export function ingredientsInStep(step: string, ingredients: readonly Ingredient[]): Ingredient[] {
  const haystack = step.toLowerCase();
  return ingredients.filter((ingredient) => {
    const head = stripDescriptors(ingredientHead(ingredient.name));
    if (head.length < 3 || head.split(' ').length > 4 || head === 'water') return false;
    const key = ingredientKey(ingredient.name);
    return [head, key, key + 's', key + 'es'].some((p) => containsWord(haystack, p));
  });
}
