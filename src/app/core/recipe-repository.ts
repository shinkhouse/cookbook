import { Injectable, Provider, inject } from '@angular/core';
import { Recipe } from './model/recipes.model';
import { Recipes } from './mock/recipes.mock';
import { Storage } from './storage';

/**
 * Where the recipe collection lives.
 *
 * This exists as a seam rather than having RecipeStore talk to `localStorage`
 * directly, because the collection is expected to move to the MongoDB-backed
 * api.samuelhinkhouse.com. When it does, only a second implementation of this
 * class is needed — the store, and every screen above it, stay as they are.
 *
 * The interface is deliberately async even though the local implementation
 * resolves immediately: a version that has to await the network cannot be
 * retrofitted into a synchronous contract without touching every caller.
 */
export abstract class RecipeRepository {
  /** The whole collection. */
  abstract load(): Promise<Recipe[]>;

  /**
   * Persists the whole collection. Coarse on purpose: the collection is
   * fourteen recipes, so there is nothing to gain from per-recipe writes, and a
   * single call is far easier to make transactional later.
   */
  abstract save(recipes: readonly Recipe[]): Promise<void>;

  /** True when a write here will outlive the tab. */
  abstract readonly durable: boolean;
}

const RECIPES_KEY = 'cookbook.recipes';

/**
 * Keeps the collection in `localStorage`, seeded from the bundled data the
 * first time.
 *
 * The seed is applied only when nothing has been stored, using a null sentinel
 * rather than treating an empty array as unseeded — the same rule PrefsStore
 * uses for favourites, and for the same reason: deleting everything must not
 * silently undo itself on the next load.
 */
@Injectable({ providedIn: 'root' })
export class LocalRecipeRepository extends RecipeRepository {
  private readonly storage = inject(Storage);

  override readonly durable = true;

  override async load(): Promise<Recipe[]> {
    const stored = this.storage.read<Recipe[] | null>(RECIPES_KEY, null);
    if (stored === null) return [...Recipes];
    // A stored value that is not an array means the entry was corrupted by
    // something other than this app; fall back rather than render nothing.
    if (!Array.isArray(stored)) return [...Recipes];
    return stored.filter(isRecipe);
  }

  override async save(recipes: readonly Recipe[]): Promise<void> {
    this.storage.write(RECIPES_KEY, recipes);
  }
}

/**
 * Enough of a shape check to keep a malformed entry from reaching the screens,
 * where a missing `ingredients` array would throw on render.
 */
function isRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== 'object') return false;
  const r = value as Partial<Recipe>;
  return (
    typeof r.slug === 'string' &&
    r.slug.length > 0 &&
    typeof r.title === 'string' &&
    Array.isArray(r.ingredients) &&
    Array.isArray(r.steps)
  );
}

/**
 * Binds the abstract seam to the local implementation.
 *
 * This one line is the swap point: pointing it at an Http-backed repository is
 * all that moving the collection to api.samuelhinkhouse.com requires of the
 * front end.
 */
export const provideLocalRecipes = (): Provider => ({
  provide: RecipeRepository,
  useExisting: LocalRecipeRepository,
});
