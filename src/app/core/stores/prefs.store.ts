import { Injectable, computed, inject, signal } from '@angular/core';
import { FAV_SEED } from '../mock/recipes.mock';
import { Storage } from '../storage';

/** Detail-page reading layout, per spec §6.2. Persisted. */
export type Layout = 'side-by-side' | 'single-column';

const FAVS_KEY = 'cookbook.favs';
const LAYOUT_KEY = 'cookbook.layout';

/**
 * Favourites and the layout preference — the two things that should still be
 * true next time the app opens. Per spec §2.2.
 */
@Injectable({ providedIn: 'root' })
export class PrefsStore {
  private readonly storage = inject(Storage);

  /**
   * Seeded from the old `favorite` flags the first time only. Once the user has
   * touched their favourites the stored list wins, including when they have
   * deliberately emptied it — hence reading a sentinel rather than treating
   * "empty" as "unseeded".
   */
  private readonly _favs = signal<ReadonlySet<string>>(
    new Set(this.storage.read<string[] | null>(FAVS_KEY, null) ?? FAV_SEED),
  );

  private readonly _layout = signal<Layout>(
    this.storage.read<Layout>(LAYOUT_KEY, 'side-by-side'),
  );

  readonly favs = computed(() => this._favs());
  readonly layout = computed(() => this._layout());
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

  setLayout(layout: Layout): void {
    this._layout.set(layout);
    this.storage.write(LAYOUT_KEY, layout);
  }

  toggleLayout(): void {
    this.setLayout(this._layout() === 'side-by-side' ? 'single-column' : 'side-by-side');
  }
}
