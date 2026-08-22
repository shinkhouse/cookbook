import { Injectable, computed, inject, signal } from '@angular/core';
import { CookbookRepository } from '../cookbook-repository';
import { Cookbook, CookbookSeed } from '../model/cookbooks.model';
import { Recipe } from '../model/recipes.model';
import { RecipeStore } from './recipe.store';

/**
 * The cookbooks themselves — Sam's, Bob's, Grandma's.
 *
 * Which recipes belong to a cookbook is not held here: membership lives on the
 * recipe as `Recipe.cookbooks` (design §2), so this store owns identity and
 * naming, and derives anything recipe-shaped from RecipeStore.
 *
 * The dependency runs this way — CookbookStore → RecipeStore, never the reverse
 * — because deleting a cookbook is the one operation that has to touch both
 * collections, so it belongs in the store that can see both. RecipeStore stays
 * ignorant of cookbooks, handling `cookbooks` as an opaque string list exactly
 * as it handles `tags`. ListStore depends on RecipeStore the same way.
 */
@Injectable({ providedIn: 'root' })
export class CookbookStore {
  private readonly repo = inject(CookbookRepository);
  private readonly recipes = inject(RecipeStore);

  /**
   * Starts from the seed so the first paint has something to show, then the
   * repository's answer replaces it — the same reasoning as RecipeStore.
   */
  private readonly _cookbooks = signal<readonly Cookbook[]>(CookbookSeed);

  readonly cookbooks = computed(() => this._cookbooks());

  constructor() {
    void this.repo.load().then((loaded) => {
      if (loaded.length > 0) this._cookbooks.set(loaded);
    });
  }

  byId(id: string): Cookbook | undefined {
    return this._cookbooks().find((c) => c.id === id);
  }

  /** The recipes filed in a cookbook. */
  recipesIn(id: string): Recipe[] {
    return this.recipes.inCookbook(id);
  }

  /** How many recipes are filed in a cookbook, for a picker's subtitle. */
  countIn(id: string): number {
    return this.recipesIn(id).length;
  }

  /**
   * Adds a cookbook. Returns the id actually used, which may be suffixed to stay
   * unique — the same rule RecipeStore.add uses for slugs, and for the same
   * reason: an id collision would silently merge two cookbooks' memberships.
   */
  add(cookbook: Cookbook): string {
    const id = this.uniqueId(cookbook.id);
    this._cookbooks.update((list) => [...list, { ...cookbook, id }]);
    this.persist();
    return id;
  }

  /** Renames a cookbook. Returns false if the id was unknown. */
  rename(id: string, name: string): boolean {
    let found = false;
    this._cookbooks.update((list) =>
      list.map((c) => {
        if (c.id !== id) return c;
        found = true;
        return { ...c, name };
      }),
    );
    if (found) this.persist();
    return found;
  }

  /**
   * Deletes a cookbook and takes its id off every recipe that carried it. The
   * recipes themselves survive — a recipe left in no cookbook is unfiled, not
   * deleted.
   *
   * This cascade is the reason cookbook deletion must go through here rather
   * than being done by editing the collection directly: any other path leaves
   * recipes pointing at a cookbook that no longer exists.
   *
   * Returns false if the id was unknown.
   */
  remove(id: string): boolean {
    const before = this._cookbooks().length;
    this._cookbooks.update((list) => list.filter((c) => c.id !== id));
    if (this._cookbooks().length === before) return false;
    this.recipes.stripCookbook(id);
    this.persist();
    return true;
  }

  private persist(): void {
    // Fire and forget, as with recipes: the signal is already the truth for this
    // session, and a failed write must not take the interaction down with it.
    void this.repo.save(this._cookbooks());
  }

  private uniqueId(desired: string): string {
    const base = desired || 'cookbook';
    if (!this.byId(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!this.byId(candidate)) return candidate;
    }
  }
}
