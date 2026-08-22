import { Injectable, Provider, inject } from '@angular/core';
import { Cookbook, CookbookSeed } from './model/cookbooks.model';
import { Storage } from './storage';

/**
 * Where the cookbook collection lives.
 *
 * Deliberately a parallel seam to RecipeRepository rather than a second method
 * on it: the two collections move to api.samuelhinkhouse.com as separate
 * resources, and keeping them apart means either can be swapped for an
 * Http-backed version on its own.
 *
 * Async for the same reason as the recipe seam — a networked implementation
 * cannot be retrofitted into a synchronous contract without touching every
 * caller.
 */
export abstract class CookbookRepository {
  /** The whole collection. */
  abstract load(): Promise<Cookbook[]>;

  /** Persists the whole collection. Coarse on purpose, as with recipes. */
  abstract save(cookbooks: readonly Cookbook[]): Promise<void>;

  /** True when a write here will outlive the tab. */
  abstract readonly durable: boolean;
}

const COOKBOOKS_KEY = 'cookbook.cookbooks';

/**
 * Keeps the collection in `localStorage`, seeded the first time.
 *
 * Uses the same null sentinel as recipes and favourites: the seed applies only
 * when nothing has been stored, so deleting every cookbook does not silently
 * undo itself on the next load.
 */
@Injectable({ providedIn: 'root' })
export class LocalCookbookRepository extends CookbookRepository {
  private readonly storage = inject(Storage);

  override readonly durable = true;

  override async load(): Promise<Cookbook[]> {
    const stored = this.storage.read<Cookbook[] | null>(COOKBOOKS_KEY, null);
    if (stored === null) return [...CookbookSeed];
    // Corrupted by something other than this app; fall back rather than leave
    // the recipes pointing at cookbooks that cannot be named.
    if (!Array.isArray(stored)) return [...CookbookSeed];
    return stored.filter(isCookbook);
  }

  override async save(cookbooks: readonly Cookbook[]): Promise<void> {
    this.storage.write(COOKBOOKS_KEY, cookbooks);
  }
}

/**
 * An id-less cookbook can never be referenced by a recipe, and a nameless one
 * has nothing to render, so neither is worth keeping.
 */
function isCookbook(value: unknown): value is Cookbook {
  if (!value || typeof value !== 'object') return false;
  const c = value as Partial<Cookbook>;
  return (
    typeof c.id === 'string' && c.id.length > 0 && typeof c.name === 'string' && c.name.length > 0
  );
}

/**
 * Binds the abstract seam to the local implementation. This one line is the swap
 * point for moving cookbooks to api.samuelhinkhouse.com.
 */
export const provideLocalCookbooks = (): Provider => ({
  provide: CookbookRepository,
  useExisting: LocalCookbookRepository,
});
