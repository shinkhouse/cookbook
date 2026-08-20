import { AISLE_ORDER } from '../aisle';
import { ImportedRecipes } from './imported-recipes';
import { CuratedRecipes, FAV_SEED, Recipes } from './recipes.mock';

describe('migrated seed data', () => {
  it('carries the 14 curated recipes plus the family cookbook import', () => {
    expect(CuratedRecipes.length).toBe(14);
    expect(ImportedRecipes.length).toBe(58);
    expect(Recipes.length).toBe(72);
  });

  it('puts the curated recipes first, since those are the ones with photos', () => {
    expect(Recipes.slice(0, 14)).toEqual(CuratedRecipes);
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

  it('leaves the imported recipes their steps, which is what they do carry', () => {
    for (const r of ImportedRecipes) {
      expect(r.steps.length).withContext(r.slug).toBeGreaterThan(0);
    }
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

  it('seeds favourites from the old flags and only with real slugs', () => {
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
