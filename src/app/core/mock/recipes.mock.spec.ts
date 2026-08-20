import { AISLE_ORDER } from '../aisle';
import { FAV_SEED, Recipes } from './recipes.mock';

describe('migrated seed data', () => {
  it('carries all 14 recipes', () => {
    expect(Recipes.length).toBe(14);
  });

  it('gives every recipe the fields the new model requires', () => {
    for (const r of Recipes) {
      expect(r.slug).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(r.time).toBeTruthy();
      expect(r.blurb).toBeTruthy();
      // servings is the scaler's denominator — a zero would divide by zero.
      expect(r.servings).toBeGreaterThan(0);
      expect(r.cooked).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(r.ingredients)).toBe(true);
      expect(r.ingredients.length).toBeGreaterThan(0);
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
    // A name still carrying a leading amount would mean a line escaped the
    // migration and got stored raw.
    const raw = Recipes.flatMap((r) =>
      r.ingredients.filter((i) => /^\s*\d+\s*(\/|tsp|tbsp|cup|oz|lb)\b/i.test(i.name)),
    );
    expect(raw).toEqual([]);
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
