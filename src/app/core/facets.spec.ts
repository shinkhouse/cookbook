import { OTHER_FACET, buildFacets, facetOf, groupSelection, matchesSelection } from './facets';
import { Recipes } from './mock/recipes.mock';

const ALL_TAGS = [...new Set(Recipes.flatMap((r) => r.tags))].sort();

describe('buildFacets', () => {
  it('groups the real tag list into facets', () => {
    const facets = buildFacets(ALL_TAGS);
    const byId = new Map(facets.map((f) => [f.id, f]));

    expect(byId.get('meal')?.options).toEqual([
      'breakfast',
      'lunch',
      'dinner',
      'dessert',
      'appetizer',
    ]);
    expect(byId.get('cuisine')?.options).toEqual(['italian', 'mexican']);
    expect(byId.get('protein')?.options).toContain('chicken');
    expect(byId.get('protein')?.options).toContain('ground beef');
  });

  it('accounts for every tag in the data, so none becomes unfilterable', () => {
    const covered = buildFacets(ALL_TAGS).flatMap((f) => f.options);
    expect([...covered].sort()).toEqual(ALL_TAGS);
  });

  it('collects anything uncategorised into a trailing Other facet', () => {
    const facets = buildFacets([...ALL_TAGS, 'zzz-brand-new-tag']);
    const other = facets.find((f) => f.id === OTHER_FACET)!;
    // The guard this provides: tags are derived from data, so a new recipe can
    // introduce a tag this file has never heard of. It must still be offered.
    expect(other.options).toContain('zzz-brand-new-tag');
    expect(facets.at(-1)?.id).toBe(OTHER_FACET);
  });

  it('drops a facet with no matching tags rather than offering an empty menu', () => {
    const facets = buildFacets(['italian']);
    expect(facets.map((f) => f.id)).toEqual(['cuisine']);
  });

  it('returns nothing for an empty tag list', () => {
    expect(buildFacets([])).toEqual([]);
  });

  it('is case insensitive about the incoming tags', () => {
    const facets = buildFacets(['Italian', 'DINNER']);
    expect(facets.map((f) => f.id).sort()).toEqual(['cuisine', 'meal']);
  });
});

describe('facetOf', () => {
  it('names the owning facet', () => {
    expect(facetOf('dinner')).toBe('meal');
    expect(facetOf('chicken')).toBe('protein');
    expect(facetOf('italian')).toBe('cuisine');
  });

  it('falls back to the catch-all for an unknown tag', () => {
    expect(facetOf('romantic')).toBe(OTHER_FACET);
    expect(facetOf('never-seen-before')).toBe(OTHER_FACET);
  });
});

describe('groupSelection', () => {
  it('buckets selections by facet', () => {
    const grouped = groupSelection(['dinner', 'lunch', 'italian']);
    expect([...grouped.get('meal')!].sort()).toEqual(['dinner', 'lunch']);
    expect([...grouped.get('cuisine')!]).toEqual(['italian']);
  });

  it('is empty for an empty selection', () => {
    expect(groupSelection([]).size).toBe(0);
  });
});

describe('matchesSelection', () => {
  it('matches everything when nothing is selected', () => {
    expect(matchesSelection(['dinner'], [])).toBe(true);
    expect(matchesSelection([], [])).toBe(true);
  });

  it('widens within a facet — two meals means either meal', () => {
    // The bug this guards: treating every selection as AND, which makes
    // picking two meals return nothing, since no recipe is both.
    expect(matchesSelection(['breakfast'], ['breakfast', 'dessert'])).toBe(true);
    expect(matchesSelection(['dessert'], ['breakfast', 'dessert'])).toBe(true);
    expect(matchesSelection(['dinner'], ['breakfast', 'dessert'])).toBe(false);
  });

  it('narrows across facets — a meal and a cuisine means both', () => {
    expect(matchesSelection(['dinner', 'italian'], ['dinner', 'italian'])).toBe(true);
    expect(matchesSelection(['dinner'], ['dinner', 'italian'])).toBe(false);
    expect(matchesSelection(['italian'], ['dinner', 'italian'])).toBe(false);
  });

  it('combines both rules at once', () => {
    const selected = ['lunch', 'dinner', 'italian'];
    expect(matchesSelection(['dinner', 'italian', 'pasta'], selected)).toBe(true);
    expect(matchesSelection(['lunch', 'italian'], selected)).toBe(true);
    // Right cuisine, wrong meal.
    expect(matchesSelection(['breakfast', 'italian'], selected)).toBe(false);
    // Right meal, wrong cuisine.
    expect(matchesSelection(['dinner', 'mexican'], selected)).toBe(false);
  });

  it('is case insensitive on both sides', () => {
    expect(matchesSelection(['Dinner'], ['dinner'])).toBe(true);
    expect(matchesSelection(['dinner'], ['DINNER'])).toBe(true);
  });

  it('treats catch-all tags as one facet among themselves', () => {
    // 'romantic' and a hypothetical second uncategorised tag share the Other
    // bucket, so selecting both should widen, not narrow to nothing.
    expect(matchesSelection(['romantic'], ['romantic', 'made-up'])).toBe(true);
  });

  it('agrees with the real data', () => {
    const italianDinners = Recipes.filter((r) => matchesSelection(r.tags, ['dinner', 'italian']));
    for (const r of italianDinners) {
      expect(r.tags).toContain('dinner');
      expect(r.tags).toContain('italian');
    }
    expect(italianDinners.length).toBeGreaterThan(0);
  });
});
