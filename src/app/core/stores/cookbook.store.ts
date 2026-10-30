import { Injectable, computed, inject, signal } from '@angular/core';
import { CookbookRepository } from '../cookbook-repository';
import { Cookbook } from '../model/cookbooks.model';
import { Recipe } from '../model/recipes.model';
import { RecipeStore } from './recipe.store';

/**
 * The cookbooks themselves — Sam's, Bob's, Grandma's.
 *
 * Which recipes belong to a cookbook is not held here: membership lives on the
 * recipe as `Recipe.cookbooks` (design §2), so this store owns identity and
 * naming, and derives anything recipe-shaped from RecipeStore.
 *
 * Deleting a cookbook does not touch recipes (spec §4). The id stays on any
 * recipe that carried it and readers skip ids that resolve to nothing, so a
 * delete is one API call rather than a cascade that could half-finish over the
 * network. The dependency still runs CookbookStore → RecipeStore, never the
 * reverse, because the derived views (`recipesIn`, `countIn`) need both.
 * RecipeStore stays ignorant of cookbooks, handling `cookbooks` as an opaque
 * string list exactly as it handles `tags`.
 *
 * Writes go to the API first and the signal changes only once it has answered,
 * so a rejected write leaves what is on screen matching what is stored.
 */
@Injectable({ providedIn: 'root' })
export class CookbookStore {
  private readonly repo = inject(CookbookRepository);
  private readonly recipes = inject(RecipeStore);

  /** Empty until the API answers; `status` says whether that has happened. */
  private readonly _cookbooks = signal<readonly Cookbook[]>([]);
  private readonly _status = signal<'loading' | 'ready' | 'error'>('loading');
  private inflight: Promise<void> | null = null;

  readonly cookbooks = computed(() => this._cookbooks());
  readonly status = this._status.asReadonly();

  /** Whether this build may write; screens omit create/rename/delete when not. */
  readonly writable = this.repo.writable;

  constructor() {
    void this.load();
  }

  /**
   * Fetches the collection and sets `status`. Never rejects — a failure is
   * `status === 'error'`, and calling this again is how the UI retries. While a
   * load is in flight, calling it again returns that same promise.
   */
  load(): Promise<void> {
    // One load at a time: a second caller shares the first's promise, so an
    // older, slower response can never land after a newer one and overwrite it.
    if (this.inflight) return this.inflight;
    this._status.set('loading');
    const run = this.repo.list().then(
      (loaded) => {
        this._cookbooks.set(loaded);
        this._status.set('ready');
      },
      () => this._status.set('error'),
    );
    this.inflight = run;
    void run.then(() => (this.inflight = null));
    return run;
  }

  /** Resolves once `status` has left 'loading'. */
  async whenLoaded(): Promise<void> {
    while (this._status() === 'loading' && this.inflight) await this.inflight;
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
   * Throws if the API refuses, leaving the list as it was.
   */
  async add(cookbook: Cookbook): Promise<string> {
    const id = this.uniqueId(cookbook.id);
    const stored = await this.repo.create({ ...cookbook, id });
    this._cookbooks.update((list) => [...list, stored]);
    return id;
  }

  /**
   * Renames a cookbook. Returns false if the id was unknown, here or on the
   * server. Throws if the API refuses.
   */
  async rename(id: string, name: string): Promise<boolean> {
    const current = this.byId(id);
    if (!current) return false;
    const stored = await this.repo.update({ ...current, name });
    if (!stored) return false;
    this._cookbooks.update((list) => list.map((c) => (c.id === id ? stored : c)));
    return true;
  }

  /**
   * Deletes a cookbook. Recipes are not edited: one left carrying the id is
   * simply filed in a cookbook that no longer resolves, and readers skip it.
   *
   * Returns false if the server did not know the id; the stale local entry is
   * dropped either way, since the server has just said it is gone. Throws if
   * the API refuses, leaving the list as it was.
   */
  async remove(id: string): Promise<boolean> {
    const removed = await this.repo.remove(id);
    this._cookbooks.update((list) => list.filter((c) => c.id !== id));
    return removed;
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
