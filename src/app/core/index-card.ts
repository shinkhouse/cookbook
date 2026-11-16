import { displayHead } from './ingredient-key';
import { Ingredient } from './model/recipes.model';
import { measurable } from './units';

/**
 * Most recipes have no photo, so their photo slot shows the recipe as a family
 * cookbook keeps it: an index card, with the title on the header line and the
 * ingredients written down the rules. These are the lines on that card.
 */

/** Ingredient names as they would be written on a card: short, and once each. */
export function cardLines(ingredients: readonly Ingredient[], max = 6): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const { name } of ingredients) {
    const head = displayHead(name);
    // Imports leave stray units behind as names ("cup"); on a card they read as noise.
    if (head.length < 3 || measurable(head)) continue;
    const key = head.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(head[0].toUpperCase() + head.slice(1));
    if (lines.length === max) break;
  }
  return lines;
}

/**
 * A small, steady lean for each card, in degrees, so a grid of them looks set
 * down by hand. Derived from the slug, so a card never shifts between visits.
 */
export function cardTilt(seed: string): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % 25) - 12) / 10;
}
