/**
 * Groups the derived tag list into the facets the library filters by.
 *
 * Tags come from the recipe data rather than a fixed vocabulary (§4.1), so this
 * cannot be a closed list: anything not named below is collected into a trailing
 * catch-all facet. A new recipe introducing a new tag therefore stays filterable
 * instead of silently disappearing from the controls.
 */

export interface FacetDef {
  id: string;
  label: string;
  /** Tags belonging to this facet, in the order they should be offered. */
  tags: readonly string[];
}

export interface Facet {
  id: string;
  label: string;
  /** Only the tags that actually occur in the data, alphabetised. */
  options: string[];
}

/** The catch-all's id, so callers can tell it apart if they need to. */
export const OTHER_FACET = 'other';

/**
 * Ordered most- to least-useful for narrowing this collection. Meal comes first
 * because it is what someone actually asks ("what's for dinner"), even though
 * dinner and lunch are the least selective tags in the data.
 */
const DEFS: readonly FacetDef[] = [
  {
    id: 'meal',
    label: 'Meal',
    tags: ['breakfast', 'lunch', 'dinner', 'dessert', 'appetizer'],
  },
  {
    id: 'protein',
    label: 'Protein',
    tags: ['beef', 'ground beef', 'chicken', 'sausage', 'seafood', 'shrimp', 'eggs'],
  },
  {
    id: 'cuisine',
    label: 'Cuisine',
    tags: ['italian', 'mexican'],
  },
  {
    id: 'dish',
    label: 'Dish',
    tags: ['pasta', 'soup', 'tacos', 'sauces', 'rice', 'tortilla'],
  },
  {
    id: 'ingredient',
    label: 'Ingredient',
    tags: ['broccoli', 'cheese', 'tomato', 'vanilla', 'red pepper flakes'],
  },
];

/**
 * Builds the facets to show for a given tag list. A facet with no matching tags
 * is dropped, so the controls never offer an empty menu.
 */
export function buildFacets(allTags: readonly string[]): Facet[] {
  const available = new Set(allTags.map((t) => t.toLowerCase()));
  const claimed = new Set<string>();
  const facets: Facet[] = [];

  for (const def of DEFS) {
    const options = def.tags.filter((tag) => available.has(tag));
    for (const tag of options) claimed.add(tag);
    if (options.length > 0) {
      facets.push({ id: def.id, label: def.label, options });
    }
  }

  const leftovers = [...available].filter((tag) => !claimed.has(tag)).sort();
  if (leftovers.length > 0) {
    facets.push({ id: OTHER_FACET, label: 'Other', options: leftovers });
  }

  return facets;
}

/**
 * Which facet a tag belongs to, or the catch-all. Needed because the filter
 * combines selections differently within a facet than across facets.
 */
export function facetOf(tag: string): string {
  const needle = tag.toLowerCase();
  for (const def of DEFS) {
    if (def.tags.includes(needle)) return def.id;
  }
  return OTHER_FACET;
}

/**
 * Groups a flat set of selected tags by the facet each belongs to.
 *
 * This is what makes the filter behave the way people expect of facets:
 * selections *within* one facet widen the result (dinner OR lunch), while
 * selections *across* facets narrow it (a dinner AND italian). Treating every
 * selection as AND would make two meals return nothing at all.
 */
export function groupSelection(selected: Iterable<string>): Map<string, Set<string>> {
  const grouped = new Map<string, Set<string>>();
  for (const tag of selected) {
    const id = facetOf(tag);
    const bucket = grouped.get(id);
    if (bucket) bucket.add(tag.toLowerCase());
    else grouped.set(id, new Set([tag.toLowerCase()]));
  }
  return grouped;
}

/** True when the recipe's tags satisfy every facet that has a selection. */
export function matchesSelection(
  recipeTags: readonly string[],
  selected: Iterable<string>,
): boolean {
  const grouped = groupSelection(selected);
  if (grouped.size === 0) return true;

  const owned = new Set(recipeTags.map((t) => t.toLowerCase()));
  for (const wanted of grouped.values()) {
    // OR within the facet: any one of them is enough.
    let hit = false;
    for (const tag of wanted) {
      if (owned.has(tag)) {
        hit = true;
        break;
      }
    }
    // AND across facets: every facet with a selection has to be satisfied.
    if (!hit) return false;
  }
  return true;
}
