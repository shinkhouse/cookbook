import { Recipe } from './model/recipes.model';
import { Recipes } from './mock/recipes.mock';
import { gapLabel, gapSentence, gapsOf } from './recipe-health';

function recipe(over: Partial<Recipe> = {}): Recipe {
  return {
    slug: 'x',
    title: 'X',
    tags: [],
    time: '',
    servings: 4,
    cooked: 0,
    blurb: '',
    desc: '',
    ingredients: [{ qty: 1, unit: '', name: 'water', aisle: 'pantry' }],
    steps: ['Boil it.'],
    notes: [],
    cookbooks: [],
    ...over,
  };
}

const ingredients = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    qty: 1,
    unit: '',
    name: `thing ${i}`,
    aisle: 'pantry' as const,
  }));

describe('gapsOf', () => {
  it('reports nothing for a complete recipe', () => {
    const gaps = gapsOf(recipe({ photo: 'https://example.com/a.jpg' }));
    expect(gaps.any).toBe(false);
    expect(gaps.needsPhoto).toBe(false);
    expect(gaps.needsMethod).toBe(false);
    expect(gaps.thinMethod).toBe(false);
  });

  it('flags a missing photo', () => {
    expect(gapsOf(recipe()).needsPhoto).toBe(true);
    expect(gapsOf(recipe({ photo: 'a.jpg' })).needsPhoto).toBe(false);
  });

  it('flags a recipe with no method at all', () => {
    const gaps = gapsOf(recipe({ steps: [] }));
    expect(gaps.needsMethod).toBe(true);
    // An absent method is a fact, so it must not also read as the heuristic.
    expect(gaps.thinMethod).toBe(false);
  });

  it('flags a method that is short for the ingredient count', () => {
    const gaps = gapsOf(recipe({ ingredients: ingredients(11), steps: ['Mix.', 'Serve.'] }));
    expect(gaps.thinMethod).toBe(true);
    expect(gaps.needsMethod).toBe(false);
  });

  it('leaves a genuinely simple recipe alone', () => {
    // Pico de Gallo is six ingredients and two steps, and that is the recipe.
    const gaps = gapsOf(recipe({ ingredients: ingredients(6), steps: ['Chop.', 'Stir.'] }));
    expect(gaps.thinMethod).toBe(false);
  });

  it('leaves a long method alone however many ingredients there are', () => {
    const gaps = gapsOf(recipe({ ingredients: ingredients(30), steps: ['a', 'b', 'c'] }));
    expect(gaps.thinMethod).toBe(false);
  });

  it('holds the boundary it documents', () => {
    const at = gapsOf(recipe({ ingredients: ingredients(8), steps: ['a', 'b'] }));
    const below = gapsOf(recipe({ ingredients: ingredients(7), steps: ['a', 'b'] }));
    expect(at.thinMethod).toBe(true);
    expect(below.thinMethod).toBe(false);
  });
});

describe('gapLabel', () => {
  it('leads with the method, since it matters more than the picture', () => {
    expect(gapLabel(gapsOf(recipe({ steps: [] })))).toBe('No method');
  });

  it('names both when both apply', () => {
    expect(gapLabel(gapsOf(recipe({ ingredients: ingredients(9), steps: ['a', 'b'] })))).toBe(
      'Needs photo & steps',
    );
  });

  it('names just the photo when that is all', () => {
    expect(gapLabel(gapsOf(recipe()))).toBe('Needs photo');
  });

  it('is empty for a complete recipe', () => {
    expect(gapLabel(gapsOf(recipe({ photo: 'a.jpg' })))).toBe('');
  });
});

describe('gapSentence', () => {
  it('reads as a sentence', () => {
    expect(gapSentence(gapsOf(recipe({ steps: [] })))).toBe(
      'This one has no method written down yet and no photograph.',
    );
  });

  it('is empty when there is nothing to say', () => {
    expect(gapSentence(gapsOf(recipe({ photo: 'a.jpg' })))).toBe('');
  });
});

describe('the real collection', () => {
  it('finds the three recipes with no method', () => {
    const none = Recipes.filter((r) => gapsOf(r).needsMethod).map((r) => r.slug);
    // Two of these are curated, and predate the import.
    expect(none).toContain('grandmas-chili');
    expect(none).toContain('honey-buffalo-sauce');
    expect(none).toContain('shrimp-and-pasta');
    expect(none.length).toBe(3);
  });

  it('flags every imported recipe as needing a photo, and no curated one', () => {
    const noPhoto = Recipes.filter((r) => gapsOf(r).needsPhoto);
    expect(noPhoto.length).toBe(58);
    for (const r of Recipes.slice(0, 14)) {
      expect(gapsOf(r).needsPhoto).withContext(r.slug).toBe(false);
    }
  });

  it('does not flag the whole collection, which would make the flag useless', () => {
    const clean = Recipes.filter((r) => !gapsOf(r).any);
    expect(clean.length).toBeGreaterThan(0);
  });
});
