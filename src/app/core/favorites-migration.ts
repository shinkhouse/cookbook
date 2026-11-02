import { Injectable, inject } from '@angular/core';
import { FAV_SEED } from './mock/recipes.mock';
import { PrefsStore } from './stores/prefs.store';
import { RecipeStore } from './stores/recipe.store';

/**
 * Moves this browser's old favorites list onto the recipes, once per device.
 *
 * Favorites used to live in localStorage, so each device had its own. They are
 * a flag on the recipe now. A device that can write pushes the stars it had and
 * the server does not, then sets a flag so it never does so again.
 *
 * - A device that never stored a list pushes the built-in seed, but only when
 *   the server has no favorites at all. Otherwise a fresh phone would re-star
 *   the seed after someone had deliberately unstarred it elsewhere. The seed
 *   is written down as the stored list first, so a retry after a partial push
 *   finishes it.
 * - Stars are only added, never removed: an unstar on this device that the
 *   server has not seen is not worth overriding another device's star for.
 * - A failed push stops the run with the flag unset and the old list kept, so
 *   the next run picks up where this one stopped.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesMigration {
  private readonly prefs = inject(PrefsStore);
  private readonly recipes = inject(RecipeStore);
  private running = false;

  /** Resolves to how many favorites were pushed. Never rejects. */
  async run(): Promise<number> {
    if (this.prefs.favsMigrated() || !this.recipes.canSave() || this.running) return 0;
    this.running = true;
    try {
      return await this.push();
    } finally {
      this.running = false;
    }
  }

  private async push(): Promise<number> {
    await this.recipes.whenLoaded();
    if (this.recipes.status() !== 'ready') return 0;

    let stored = this.prefs.legacyFavs();
    if (stored === null && this.recipes.favCount() === 0) {
      // Written down before the first push: if one fails, the server then has
      // some favorites, and a retry judging by favCount() would push no more.
      // The stored list makes the retry finish the seed instead.
      this.prefs.writeLegacyFavs(FAV_SEED);
      stored = [...FAV_SEED];
    }
    const local = stored ?? [];
    const todo = local.filter((slug) => this.recipes.bySlug(slug) && !this.recipes.isFav(slug));

    let pushed = 0;
    for (const slug of todo) {
      try {
        await this.recipes.setFavorite(slug, true);
      } catch {
        return pushed;
      }
      pushed++;
    }

    this.prefs.markFavsMigrated();
    if (stored !== null) this.prefs.clearLegacyFavs();
    return todo.length;
  }
}
