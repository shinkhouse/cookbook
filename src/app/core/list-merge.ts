/**
 * Folds the shopping list's per-recipe ingredients into one line per
 * ingredient, summing amounts where the units allow it.
 */
import { Aisle } from './aisle';
import { ingredientHead, ingredientKey, stripDescriptors } from './ingredient-key';
import { Ingredient } from './model/recipes.model';
import { Measure, bestUnit, formatMeasure, measurable } from './units';

/** One ingredient of one recipe (or `parent>component`) on the list. */
export interface ListSource {
  owner: string;
  index: number;
  ingredient: Ingredient;
  recipeTitle: string;
}

export interface MergedLine {
  key: string;
  name: string;
  aisle: Aisle;
  amount: string;
  sources: ListSource[];
}

/**
 * "2 + 1 cup": one total per kind of amount. Same unit sums as-is; mixed
 * volume or weight converts to one unit, US if any entry was US. To-taste
 * entries (null qty) contribute nothing, and all of them together read blank.
 */
export function sumAmounts(items: readonly { qty: number | null; unit: string }[]): string {
  const buckets = new Map<string, Measure[]>();
  for (const { qty, unit } of items) {
    // Skipped here, not later: convertMeasure would turn a null qty into 0.
    if (qty === null || qty === undefined) continue;
    const id = measurable(unit)?.dimension ?? (unit === '' ? 'count' : 'other:' + unit.toLowerCase());
    const bucket = buckets.get(id);
    if (bucket) bucket.push({ qty, unit });
    else buckets.set(id, [{ qty, unit }]);
  }

  return [...buckets.values()]
    .map((entries) => formatMeasure(total(entries)))
    .join(' + ');
}

function total(entries: Measure[]): Measure {
  const unit = entries[0].unit;
  const first = measurable(unit);
  if (!first || entries.every((e) => e.unit === unit)) {
    // A non-measurable bucket only differs by case ("Can" vs "can"); keep the first.
    return { qty: entries.reduce((n, e) => n + e.qty, 0), unit };
  }
  const base = entries.reduce((n, e) => n + e.qty * measurable(e.unit)!.base, 0);
  const system = entries.some((e) => measurable(e.unit)!.system === 'us') ? 'us' : 'metric';
  return bestUnit(base, first.dimension, system);
}

/** One line per ingredient key, in first-seen order. */
export function mergeSources(sources: readonly ListSource[]): MergedLine[] {
  const byKey = new Map<string, ListSource[]>();
  for (const source of sources) {
    const name = ingredientKey(source.ingredient.name);
    const key = name === '' ? `${source.owner}:${source.index}` : 'name:' + name;
    const group = byKey.get(key);
    if (group) group.push(source);
    else byKey.set(key, [source]);
  }

  return [...byKey].map(([key, group]) => {
    const first = group[0].ingredient;
    return {
      key,
      name: group.length === 1 ? first.name : stripDescriptors(ingredientHead(first.name)),
      aisle: first.aisle,
      amount: sumAmounts(group.map((s) => s.ingredient)),
      sources: group,
    };
  });
}
