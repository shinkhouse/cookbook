import { Provider } from '@angular/core';
import { CookbookRepository } from '../cookbook-repository';
import { Cookbook, CookbookSeed } from '../model/cookbooks.model';
import { Recipes } from '../mock/recipes.mock';
import { Recipe } from '../model/recipes.model';
import { RecipeRepository } from '../recipe-repository';

/** What the API answers for a duplicate id or slug. */
function conflict(): Error {
  return Object.assign(new Error('conflict'), { status: 409 });
}

/**
 * In-memory stand-in for the API, with the same contract: null/false only for a
 * missing id, a rejection for everything else. `failNext` is how a test makes
 * "everything else" happen.
 */
export class FakeCookbookRepository extends CookbookRepository {
  private items: Cookbook[];
  private pending: { error: unknown } | null = null;

  override writable = true;

  constructor(seed: Cookbook[] = CookbookSeed) {
    super();
    this.items = seed.map((c) => ({ ...c }));
  }

  /** The next call of any method rejects with this, then behaviour returns to normal. */
  failNext(error: unknown): void {
    this.pending = { error };
  }

  override async list(): Promise<Cookbook[]> {
    this.maybeFail();
    return this.items.map((c) => ({ ...c }));
  }

  override async create(cookbook: Cookbook): Promise<Cookbook> {
    this.maybeFail();
    if (this.items.some((c) => c.id === cookbook.id)) throw conflict();
    this.items.push({ ...cookbook });
    return { ...cookbook };
  }

  override async update(cookbook: Cookbook): Promise<Cookbook | null> {
    this.maybeFail();
    const i = this.items.findIndex((c) => c.id === cookbook.id);
    if (i < 0) return null;
    this.items[i] = { ...cookbook };
    return { ...cookbook };
  }

  override async remove(id: string): Promise<boolean> {
    this.maybeFail();
    const before = this.items.length;
    this.items = this.items.filter((c) => c.id !== id);
    return this.items.length < before;
  }

  private maybeFail(): void {
    if (!this.pending) return;
    const { error } = this.pending;
    this.pending = null;
    throw error;
  }
}

/**
 * Tests that need `failNext` before the store loads construct the fake first
 * and pass it in.
 */
export function provideFakeCookbooks(fake?: FakeCookbookRepository): Provider[] {
  return [{ provide: CookbookRepository, useValue: fake ?? new FakeCookbookRepository() }];
}

/**
 * In-memory stand-in for the recipe API, with the same contract as the cookbook
 * fake: null/false only for a missing slug, a rejection for everything else.
 * Seeded from the bundled recipes by default, so store tests that do not care
 * about the data still have a realistic library.
 */
export class FakeRecipeRepository extends RecipeRepository {
  private items: Recipe[];
  private pending: { error: unknown } | null = null;

  override writable = true;

  constructor(seed: Recipe[] = Recipes) {
    super();
    this.items = seed.map((r) => ({ ...r }));
  }

  /** The next call of any method rejects with this, then behaviour returns to normal. */
  failNext(error: unknown): void {
    this.pending = { error };
  }

  override async list(): Promise<Recipe[]> {
    this.maybeFail();
    return this.items.map((r) => ({ ...r }));
  }

  override async create(recipe: Recipe): Promise<Recipe> {
    this.maybeFail();
    if (this.items.some((r) => r.slug === recipe.slug)) throw conflict();
    this.items.push({ ...recipe });
    return { ...recipe };
  }

  override async update(recipe: Recipe): Promise<Recipe | null> {
    this.maybeFail();
    const i = this.items.findIndex((r) => r.slug === recipe.slug);
    if (i < 0) return null;
    this.items[i] = { ...recipe };
    return { ...recipe };
  }

  override async addNote(slug: string, note: string): Promise<Recipe | null> {
    this.maybeFail();
    const i = this.items.findIndex((r) => r.slug === slug);
    if (i < 0) return null;
    this.items[i] = { ...this.items[i], notes: [...this.items[i].notes, note] };
    return { ...this.items[i] };
  }

  override async markCooked(slug: string): Promise<Recipe | null> {
    this.maybeFail();
    const i = this.items.findIndex((r) => r.slug === slug);
    if (i < 0) return null;
    this.items[i] = {
      ...this.items[i],
      cooked: this.items[i].cooked + 1,
      lastCooked: new Date().toISOString(),
    };
    return { ...this.items[i] };
  }

  override async setFavorite(slug: string, favorite: boolean): Promise<Recipe | null> {
    this.maybeFail();
    const i = this.items.findIndex((r) => r.slug === slug);
    if (i < 0) return null;
    this.items[i] = { ...this.items[i], favorite };
    return { ...this.items[i] };
  }

  override async remove(slug: string): Promise<boolean> {
    this.maybeFail();
    const before = this.items.length;
    this.items = this.items.filter((r) => r.slug !== slug);
    return this.items.length < before;
  }

  private maybeFail(): void {
    if (!this.pending) return;
    const { error } = this.pending;
    this.pending = null;
    throw error;
  }
}

/** As `provideFakeCookbooks`: pass a fake in when a test needs `failNext` early. */
export function provideFakeRecipes(fake?: FakeRecipeRepository): Provider[] {
  return [{ provide: RecipeRepository, useValue: fake ?? new FakeRecipeRepository() }];
}
