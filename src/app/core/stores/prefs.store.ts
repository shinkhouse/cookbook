import { Injectable, computed, inject, signal } from '@angular/core';
import { FAV_SEED } from '../mock/recipes.mock';
import { Storage } from '../storage';

const FAVS_KEY = 'cookbook.favs';

/**
 * Favorites — the one preference that should still be true next time the app
 * opens. Per spec §2.2.
 */
@Injectable({ providedIn: 'root' })
export class PrefsStore {
  private readonly storage = inject(Storage);

  /**
   * Seeded from the old `favorite` flags the first time only. Once the user has
   * touched their favorites the stored list wins, including when they have
   * deliberately emptied it — hence reading a sentinel rather than treating
   * "empty" as "unseeded".
   */
  private readonly _favs = signal<ReadonlySet<string>>(
    new Set(this.storage.read<string[] | null>(FAVS_KEY, null) ?? FAV_SEED),
  );

  readonly favs = computed(() => this._favs());
  readonly favCount = computed(() => this._favs().size);

  isFav(slug: string): boolean {
    return this._favs().has(slug);
  }

  toggleFav(slug: string): void {
    const next = new Set(this._favs());
    if (!next.delete(slug)) next.add(slug);
    this._favs.set(next);
    this.storage.write(FAVS_KEY, [...next]);
  }
}
