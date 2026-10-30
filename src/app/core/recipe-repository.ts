import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Provider, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { DEFAULT_COOKBOOK_ID } from './model/cookbooks.model';
import { Recipe } from './model/recipes.model';

/**
 * Where the recipe collection lives: the MongoDB-backed api.samuelhinkhouse.com.
 *
 * A seam rather than RecipeStore calling HttpClient directly, so the store and
 * every screen above it stay ignorant of transport, and tests can swap in an
 * in-memory fake.
 *
 * Per-record rather than whole-collection, because the API is. The failure
 * contract is the same for every method: a 404 on `update` or `remove` is an
 * ordinary answer ("that recipe is not there") and comes back as null/false;
 * every other failure rejects, so a caller can never mistake an outage or a
 * refused write for success.
 */
export abstract class RecipeRepository {
  /** The whole collection. Rejects if the API cannot be reached. */
  abstract list(): Promise<Recipe[]>;

  /** Adds a recipe and resolves to what the API stored. */
  abstract create(recipe: Recipe): Promise<Recipe>;

  /** Replaces a recipe, matched on slug. Null when the slug is unknown (404). */
  abstract update(recipe: Recipe): Promise<Recipe | null>;

  /** Deletes a recipe. False when the slug is unknown (404). */
  abstract remove(slug: string): Promise<boolean>;

  /** True when this build is allowed to write; screens hide editing otherwise. */
  abstract readonly writable: boolean;
}

/**
 * Talks to `${environment.apiBase}/recipes`.
 *
 * In development the dev server proxies `/api` to the API and attaches the
 * write key, so no secret ever ships in the bundle; a production build can read
 * but is not `writable`.
 */
@Injectable({ providedIn: 'root' })
export class HttpRecipeRepository extends RecipeRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBase}/recipes`;

  override readonly writable = !environment.production;

  /**
   * A writable build asks for archived recipes too. Slugs are unique across
   * them, so without them `uniqueSlug` could pick a taken slug and the API would
   * answer 409. The store hides them from every screen.
   */
  override async list(): Promise<Recipe[]> {
    const url = this.writable ? `${this.url}?includeArchived=true` : this.url;
    const all = await firstValueFrom(this.http.get<unknown[]>(url));
    return all.filter(isRecipe).map(withCookbooks);
  }

  override create(recipe: Recipe): Promise<Recipe> {
    return firstValueFrom(this.http.post<Recipe>(this.url, recipe));
  }

  override async update(recipe: Recipe): Promise<Recipe | null> {
    try {
      return await firstValueFrom(
        this.http.put<Recipe>(`${this.url}/${encodeURIComponent(recipe.slug)}`, recipe),
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  override async remove(slug: string): Promise<boolean> {
    try {
      await firstValueFrom(this.http.delete<void>(`${this.url}/${encodeURIComponent(slug)}`));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 404;
}

/**
 * Backfills `cookbooks` on records stored before cookbooks existed.
 *
 * Runs on every list rather than behind a version flag: it is idempotent, so
 * there is no migration state to get out of step with the data.
 *
 * The test on `Array.isArray` is deliberate, and not a length or truthiness
 * check. An empty array is a decision — the recipe was taken out of its last
 * cookbook — and must survive the round trip. Treating `[]` as absent here would
 * make unfiling a recipe silently undo itself on the next load.
 */
function withCookbooks(recipe: Recipe): Recipe {
  if (Array.isArray(recipe.cookbooks)) return recipe;
  return { ...recipe, cookbooks: [DEFAULT_COOKBOOK_ID] };
}

/**
 * Enough of a shape check to keep a malformed entry from reaching the screens,
 * where a missing `ingredients` array would throw on render.
 *
 * Deliberately says nothing about `cookbooks`: a record without it is the normal
 * migration case rather than a malformed one, and rejecting on it would discard
 * every recipe stored before cookbooks existed. `withCookbooks` above repairs it
 * instead.
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
 * Binds the abstract seam to the API implementation. This one line is the swap
 * point between it and a fake in tests.
 */
export const provideHttpRecipes = (): Provider => ({
  provide: RecipeRepository,
  useExisting: HttpRecipeRepository,
});
