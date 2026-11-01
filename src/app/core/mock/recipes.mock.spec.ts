import { AISLE_ORDER } from '../aisle';
import { CookbookSeed, DEFAULT_COOKBOOK_ID } from '../model/cookbooks.model';
import { ImportedRecipes } from './imported-recipes';
import { CuratedRecipes, FAV_SEED, Recipes, fileInto } from './recipes.mock';

describe('migrated seed data', () => {
  it('carries the 14 curated recipes plus the family cookbook import', () => {
    expect(CuratedRecipes.length).toBe(14);
    expect(ImportedRecipes.length).toBe(58);
    expect(Recipes.length).toBe(72);
  });

  it('puts the curated recipes first, since those are the ones with photos', () => {
    // Compared by slug rather than by value: the exported collection is filed
    // into a cookbook, so its records carry a `cookbooks` field the unfiled
    // sources do not.
    expect(Recipes.slice(0, 14).map((r) => r.slug)).toEqual(CuratedRecipes.map((r) => r.slug));
  });

  it('gives every recipe the fields every screen depends on', () => {
    for (const r of Recipes) {
      expect(r.slug).toBeTruthy();
      expect(r.title).toBeTruthy();
      // servings is the scaler's denominator — a zero would divide by zero.
      expect(r.servings).toBeGreaterThan(0);
      expect(r.cooked).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(r.ingredients)).toBe(true);
      expect(r.ingredients.length).toBeGreaterThan(0);
      expect(Array.isArray(r.steps)).toBe(true);
    }
  });

  it('gives the curated recipes their authored copy', () => {
    // time and blurb are hand-written, so they exist only where someone wrote
    // them. The import deliberately leaves them empty rather than inventing.
    for (const r of CuratedRecipes) {
      expect(r.time).toBeTruthy();
      expect(r.blurb).toBeTruthy();
    }
  });

  it('leaves the imported recipes their steps, bar the one the source never wrote', () => {
    // 'Shrimp and pasta' has ingredients but no method in the source document —
    // its steps cell holds the word "Instructions" and nothing else. Kept
    // rather than dropped, since the ingredients are real, and the detail page
    // already says so. Pinned so any *other* recipe losing its steps fails.
    const INCOMPLETE_IN_SOURCE = new Set(['shrimp-and-pasta']);
    for (const r of ImportedRecipes) {
      if (INCOMPLETE_IN_SOURCE.has(r.slug)) {
        expect(r.steps).withContext(r.slug).toEqual([]);
        expect(r.ingredients.length).toBeGreaterThan(0);
        continue;
      }
      expect(r.steps.length).withContext(r.slug).toBeGreaterThan(0);
    }
  });

  it('files every seeded recipe into the default cookbook', () => {
    for (const r of Recipes) {
      expect(r.cookbooks).withContext(r.slug).toEqual([DEFAULT_COOKBOOK_ID]);
    }
  });

  it('seeds exactly one cookbook, and it is the one the recipes are filed into', () => {
    expect(CookbookSeed.length).toBe(1);
    expect(CookbookSeed[0].id).toBe(DEFAULT_COOKBOOK_ID);
    expect(CookbookSeed[0].name).toBeTruthy();
  });

  it('has unique slugs', () => {
    const slugs = Recipes.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('records the times-cooked figure from the design', () => {
    const spaghetti = Recipes.find((r) => r.slug === 'grandmas-spaghetti');
    expect(spaghetti?.cooked).toBe(41);
  });

  it('makes the most-cooked recipe unambiguous, since the library header names it', () => {
    const top = Math.max(...Recipes.map((r) => r.cooked));
    expect(Recipes.filter((r) => r.cooked === top).length).toBe(1);
  });

  it('gives every ingredient a name and a valid aisle', () => {
    for (const r of Recipes) {
      for (const ing of r.ingredients) {
        expect(ing.name.trim()).withContext(`${r.slug}: empty name`).toBeTruthy();
        expect(AISLE_ORDER).withContext(`${r.slug}: ${ing.name}`).toContain(ing.aisle);
        if (ing.qty !== null) {
          expect(ing.qty).withContext(`${r.slug}: ${ing.name}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('leaves no unmigrated free-text ingredient behind', () => {
    // A name still carrying a leading amount usually means a line escaped the
    // parser and got stored raw. The exceptions below are lines where the
    // quantity is a *count* and the measure is the package size — "two 3oz
    // packages" — so the amount legitimately stays in the name. Pinned so a
    // genuine regression still fails here.
    const KNOWN = new Set([
      '5 oz. pkg. Louisiana Brand Cajun Gumbo Mix',
      '16 oz can chopped tomatoes',
      '3oz. packages ramen noodles (seasoning packets discarded)',
      '6 oz. portions of MOWI Salmon',
      '1/2sticks butter (part olive oil)',
    ]);
    const raw = Recipes.flatMap((r) =>
      r.ingredients.filter(
        (i) => /^\s*\d+\s*(\/|tsp|tbsp|cup|oz|lb)\b/i.test(i.name) && !KNOWN.has(i.name),
      ),
    );
    expect(raw).toEqual([]);
  });

  it('never stores a bare step label as a step', () => {
    // The source document numbers its steps with a standalone "Step 1"
    // paragraph followed by the text, so a naive read rendered "1. Step 1"
    // above "2. <the actual step>". The list index supplies the number, so a
    // label on its own carries nothing.
    const labels = Recipes.flatMap((r) =>
      r.steps.filter((s) => /^(?:step|stage|part|direction)\s*\.?\s*\d+\s*[:.)]?$/i.test(s.trim())),
    );
    expect(labels).toEqual([]);
  });

  it('never stores a section header or a bare phase label as a step', () => {
    const headers = Recipes.flatMap((r) =>
      r.steps.filter(
        (s) => /^(?:directions?|instructions?|method|preparation|steps?)\s*:?$/i.test(s.trim())
          || (s.trim().endsWith(':') && s.trim().length < 40),
      ),
    );
    expect(headers).toEqual([]);
  });

  it('carries ingredient sub-groups where the source had them', () => {
    const grouped = ImportedRecipes.filter((r) => r.ingredients.some((i) => i.group));
    // Recipes built from parts — a marinade, a sauce, the thing itself.
    expect(grouped.length).toBeGreaterThanOrEqual(8);
    for (const r of grouped) {
      for (const i of r.ingredients) {
        if (i.group !== undefined) expect(i.group.trim()).toBeTruthy();
      }
    }
  });

  it('never stores a group label as an ingredient of its own', () => {
    // "For the Glaze:" is a heading, not something you buy.
    const labels = Recipes.flatMap((r) =>
      r.ingredients.filter((i) => /^(for the\b|.*:$)/i.test(i.name)),
    );
    expect(labels).toEqual([]);
  });

  it('drops the retired fields', () => {
    for (const r of Recipes as unknown as Record<string, unknown>[]) {
      for (const dead of ['authors', 'calories', 'urls', 'equipment', 'cookTime', 'favorite', 'description', 'coverImage']) {
        expect(r[dead]).withContext(`${r['slug']} still has ${dead}`).toBeUndefined();
      }
    }
  });

  it('seeds favorites from the old flags and only with real slugs', () => {
    expect(FAV_SEED.length).toBe(7);
    const slugs = new Set(Recipes.map((r) => r.slug));
    for (const fav of FAV_SEED) {
      expect(slugs).withContext(`${fav} is not a recipe`).toContain(fav);
    }
  });

  it('never stores a note or step as an empty string', () => {
    for (const r of Recipes) {
      expect(r.steps.filter((s) => !s.trim())).withContext(r.slug).toEqual([]);
      expect(r.notes.filter((n) => !n.trim())).withContext(r.slug).toEqual([]);
    }
  });

  it('has no duplicate steps, which the source data did', () => {
    for (const r of Recipes) {
      expect(new Set(r.steps).size).withContext(r.slug).toBe(r.steps.length);
    }
  });

  it('carries no mojibake from the original paste', () => {
    const suspect = Recipes.flatMap((r) =>
      [...r.steps, ...r.notes, r.desc, r.blurb].filter((t) => /cauli!ower|le"over/.test(t)),
    );
    expect(suspect).toEqual([]);
  });
});

describe('fileInto', () => {
  const source = {
    slug: 'a',
    title: 'A',
    tags: [],
    time: '',
    servings: 1,
    cooked: 0,
    blurb: '',
    desc: '',
    ingredients: [],
    steps: [],
    notes: [],
  };

  it('stamps the cookbook onto every recipe it is given', () => {
    const filed = fileInto('grandmas', [source, { ...source, slug: 'b' }]);
    expect(filed.map((r) => r.cookbooks)).toEqual([['grandmas'], ['grandmas']]);
  });

  it('leaves the source records untouched, since they are shared module state', () => {
    // The sources are exported consts imported by several modules. Mutating
    // them here would file recipes into a cookbook everywhere at once.
    fileInto('grandmas', [source]);
    expect('cookbooks' in source).toBe(false);
  });

  it('keeps everything else about the recipe', () => {
    const [filed] = fileInto('grandmas', [{ ...source, title: 'Kept', cooked: 7 }]);
    expect(filed.title).toBe('Kept');
    expect(filed.cooked).toBe(7);
  });
});
