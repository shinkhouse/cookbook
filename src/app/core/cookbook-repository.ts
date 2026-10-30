import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, Provider, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { Cookbook } from './model/cookbooks.model';

/**
 * Where the cookbook collection lives.
 *
 * Deliberately a parallel seam to RecipeRepository rather than a second method
 * on it: the two collections are separate resources on api.samuelhinkhouse.com,
 * and keeping them apart means either can be swapped on its own.
 *
 * Per-record rather than whole-collection, because the API is. The failure
 * contract is the same for every method: a 404 on `update` or `remove` is an
 * ordinary answer ("that cookbook is not there") and comes back as null/false;
 * every other failure rejects, so a caller can never mistake an outage or a
 * refused write for success.
 */
export abstract class CookbookRepository {
  /** The whole collection. Rejects if the API cannot be reached. */
  abstract list(): Promise<Cookbook[]>;

  /** Adds a cookbook and resolves to what the API stored. */
  abstract create(cookbook: Cookbook): Promise<Cookbook>;

  /** Replaces a cookbook. Null when the id is unknown (404). */
  abstract update(cookbook: Cookbook): Promise<Cookbook | null>;

  /** Deletes a cookbook. False when the id is unknown (404). */
  abstract remove(id: string): Promise<boolean>;

  /** True when this build is allowed to write; screens hide editing otherwise. */
  abstract readonly writable: boolean;
}

/**
 * Talks to `${environment.apiBase}/cookbooks`.
 *
 * In development the dev server proxies `/api` to the API and attaches the
 * write key, so no secret ever ships in the bundle; a production build can read
 * but is not `writable`.
 */
@Injectable({ providedIn: 'root' })
export class HttpCookbookRepository extends CookbookRepository {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBase}/cookbooks`;

  override readonly writable = !environment.production;

  override async list(): Promise<Cookbook[]> {
    const all = await firstValueFrom(this.http.get<unknown[]>(this.url));
    return all.filter(isCookbook);
  }

  override create(cookbook: Cookbook): Promise<Cookbook> {
    return firstValueFrom(this.http.post<Cookbook>(this.url, cookbook));
  }

  override async update(cookbook: Cookbook): Promise<Cookbook | null> {
    try {
      return await firstValueFrom(
        this.http.put<Cookbook>(`${this.url}/${encodeURIComponent(cookbook.id)}`, cookbook),
      );
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  override async remove(id: string): Promise<boolean> {
    try {
      await firstValueFrom(this.http.delete<void>(`${this.url}/${encodeURIComponent(id)}`));
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
 * Binds the abstract seam to the API implementation. This one line is the swap
 * point between it and a fake in tests.
 */
export const provideHttpCookbooks = (): Provider => ({
  provide: CookbookRepository,
  useExisting: HttpCookbookRepository,
});
