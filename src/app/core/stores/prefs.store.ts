import { Injectable, computed, inject, signal } from '@angular/core';
import { Storage } from '../storage';
import { UnitSystem } from '../units';

const FAVS_KEY = 'cookbook.favs';
const FAVS_MIGRATED_KEY = 'cookbook.favsMigrated';
const COOK_INGREDIENTS_KEY = 'cookbook.cookIngredients';
const UNITS_KEY = 'cookbook.units';

/**
 * Preferences that should still be true next time the app opens: units and
 * whether cook mode's ingredients panel is open. Favorites used to live here
 * too; they are on the recipe now, and only the old list is still read, once,
 * by FavoritesMigration.
 */
@Injectable({ providedIn: 'root' })
export class PrefsStore {
  private readonly storage = inject(Storage);

  /**
   * The favorites this browser stored before they moved onto the recipe, or
   * null when it never stored any. No seed fallback: "nothing stored" and "an
   * emptied list" are different answers, and the migration needs both.
   */
  legacyFavs(): string[] | null {
    const stored = this.storage.read<unknown>(FAVS_KEY, null);
    return Array.isArray(stored) ? stored.filter((s): s is string => typeof s === 'string') : null;
  }

  clearLegacyFavs(): void {
    this.storage.remove(FAVS_KEY);
  }

  /** Whether this device has already pushed its favorites to the server. */
  favsMigrated(): boolean {
    return this.storage.read<boolean>(FAVS_MIGRATED_KEY, false) === true;
  }

  markFavsMigrated(): void {
    this.storage.write(FAVS_MIGRATED_KEY, true);
  }

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

  toggleCookIngredients(): void {
    const next = !this._cookIngredientsOpen();
    this._cookIngredientsOpen.set(next);
    this.storage.write(COOK_INGREDIENTS_KEY, next);
  }
}
