import { Injectable, computed, inject, signal } from '@angular/core';
import { FAV_SEED } from '../mock/recipes.mock';
import { Storage } from '../storage';
import { UnitSystem } from '../units';

const FAVS_KEY = 'cookbook.favs';
const COOK_INGREDIENTS_KEY = 'cookbook.cookIngredients';
const UNITS_KEY = 'cookbook.units';

/**
 * Preferences that should still be true next time the app opens: the favorites
 * (per spec §2.2) and whether cook mode's ingredients panel is open.
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

  /**
   * Whether cook mode's ingredients panel is open. Open unless the cook has
   * closed it; a stored `false` is the only thing that overrides that.
   */
  private readonly _cookIngredientsOpen = signal(
    this.storage.read<boolean>(COOK_INGREDIENTS_KEY, true),
  );

  readonly cookIngredientsOpen = computed(() => this._cookIngredientsOpen());

  /** US or metric amounts, on the detail page and in cook mode alike. */
  private readonly _units = signal<UnitSystem>(
    this.storage.read<string>(UNITS_KEY, 'us') === 'metric' ? 'metric' : 'us',
  );

  readonly units = computed(() => this._units());

  setUnits(system: UnitSystem): void {
    this._units.set(system);
    this.storage.write(UNITS_KEY, system);
  }

  isFav(slug: string): boolean {
    return this._favs().has(slug);
  }

  toggleFav(slug: string): void {
    const next = new Set(this._favs());
    if (!next.delete(slug)) next.add(slug);
    this._favs.set(next);
    this.storage.write(FAVS_KEY, [...next]);
  }

  toggleCookIngredients(): void {
    const next = !this._cookIngredientsOpen();
    this._cookIngredientsOpen.set(next);
    this.storage.write(COOK_INGREDIENTS_KEY, next);
  }
}
