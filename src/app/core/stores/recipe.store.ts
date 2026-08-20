import { Injectable, computed, inject, signal } from '@angular/core';
import { Recipe } from '../model/recipes.model';
import { Recipes } from '../mock/recipes.mock';
import { Facet, buildFacets, matchesSelection } from '../facets';
import { RecipeRepository } from '../recipe-repository';
import { PrefsStore } from './prefs.store';

/**
 * The recipe collection plus the library's search and filter state.
 *
 * The collection persists through RecipeRepository. The search text and the tag
 * selection deliberately do not (§2.2), so a reload lands on the full library
 * rather than on whatever was last filtered.
 */
@Injectable({ providedIn: 'root' })
export class RecipeStore {
  // Favourites are a preference, so they live in PrefsStore; the dependency
  // runs this way only (PrefsStore knows nothing about recipes).
  private readonly prefs = inject(PrefsStore);
  private readonly repo = inject(RecipeRepository);

  /**
   * Starts from the bundled data so the first paint has something to show, then
   * the repository's answer replaces it. Without the synchronous seed the
   * library would flash empty on every load.
   */
  private readonly _recipes = signal<readonly Recipe[]>(Recipes);

  readonly recipes = computed(() => this._recipes());

  constructor() {
    void this.repo.load().then((loaded) => {
      if (loaded.length > 0) this._recipes.set(loaded);
    });
  }

  readonly query = signal('');
  /**
   * Multi-select across grouped facets. Selections widen within a facet and
   * narrow across facets — see core/facets.ts for why.
   */
  readonly selectedTags = signal<ReadonlySet<string>>(new Set());
  readonly favsOnly = signal(false);

  /**
   * Tag list derived from the data rather than hardcoded (§4.1), deduped and
   * alphabetised. Stored lowercase; display title-cases via `tagLabel`.
   */
  readonly tags = computed(() => {
    const seen = new Set<string>();
    for (const r of this._recipes()) for (const t of r.tags) seen.add(t.toLowerCase());
    return [...seen].sort();
  });

  /** The filter controls, grouped and pruned to what the data actually has. */
  readonly facets = computed<Facet[]>(() => buildFacets(this.tags()));

  readonly selectedCount = computed(() => this.selectedTags().size);

  /** The recipe the library header's stat block names. */
  readonly mostCooked = computed(() =>
    this._recipes().reduce<Recipe | null>(
      (best, r) => (best === null || r.cooked > best.cooked ? r : best),
      null,
    ),
  );

  bySlug(slug: string): Recipe | undefined {
    return this._recipes().find((r) => r.slug === slug);
  }

  /**
   * Adds a recipe from the create flow and persists the collection.
   *
   * Returns the slug actually used, which may be suffixed to stay unique.
   */
  add(recipe: Recipe): string {
    const slug = this.uniqueSlug(recipe.slug);
    this._recipes.update((list) => [{ ...recipe, slug }, ...list]);
    this.persist();
    return slug;
  }

  /** Removes a recipe and persists. Returns false if the slug was unknown. */
  remove(slug: string): boolean {
    const before = this._recipes().length;
    this._recipes.update((list) => list.filter((r) => r.slug !== slug));
    if (this._recipes().length === before) return false;
    this.persist();
    return true;
  }

  /** Replaces an existing recipe, matched on slug. */
  update(recipe: Recipe): boolean {
    let found = false;
    this._recipes.update((list) =>
      list.map((r) => {
        if (r.slug !== recipe.slug) return r;
        found = true;
        return recipe;
      }),
    );
    if (found) this.persist();
    return found;
  }

  /** Throws away local changes and goes back to the bundled collection. */
  resetToSeed(): void {
    this._recipes.set([...Recipes]);
    this.persist();
  }

  private persist(): void {
    // Fire and forget: the in-memory signal is already the truth for this
    // session, and a failed write must not take the interaction down with it.
    // The Storage wrapper degrades to memory rather than throwing.
    void this.repo.save(this._recipes());
  }

  private uniqueSlug(desired: string): string {
    const base = desired || 'untitled';
    if (!this.bySlug(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!this.bySlug(candidate)) return candidate;
    }
  }

  /**
   * Search matches title, tags and ingredient names. The ingredient match is
   * the point of the feature (§6.1) — "what can I make with feta".
   *
   * Debouncing is the caller's business; this is a pure derivation.
   */
  readonly results = computed(() => {
    const needle = this.query().trim().toLowerCase();
    const selected = this.selectedTags();
    const favsOnly = this.favsOnly();

    return this._recipes().filter((r) => {
      if (!matchesSelection(r.tags, selected)) return false;
      if (favsOnly && !this.prefs.isFav(r.slug)) return false;
      if (!needle) return true;
      return (
        r.title.toLowerCase().includes(needle) ||
        r.tags.some((t) => t.toLowerCase().includes(needle)) ||
        r.ingredients.some((i) => i.name.toLowerCase().includes(needle))
      );
    });
  });

  setQuery(query: string): void {
    this.query.set(query);
  }

  isTagSelected(tag: string): boolean {
    return this.selectedTags().has(tag.toLowerCase());
  }

  toggleTag(tag: string): void {
    const next = new Set(this.selectedTags());
    const key = tag.toLowerCase();
    if (!next.delete(key)) next.add(key);
    this.selectedTags.set(next);
  }

  /** Clears one facet's selections, leaving the others alone. */
  clearFacet(facet: Facet): void {
    const next = new Set(this.selectedTags());
    for (const tag of facet.options) next.delete(tag.toLowerCase());
    this.selectedTags.set(next);
  }

  clearTags(): void {
    this.selectedTags.set(new Set());
  }

  /** How many of a facet's options are currently on, for its button badge. */
  facetCount(facet: Facet): number {
    const selected = this.selectedTags();
    return facet.options.reduce((n, tag) => n + (selected.has(tag) ? 1 : 0), 0);
  }

  toggleFavsOnly(): void {
    this.favsOnly.update((v) => !v);
  }

  reset(): void {
    this.query.set('');
    this.selectedTags.set(new Set());
    this.favsOnly.set(false);
  }
}

/** Stored lowercase, displayed title-cased (§4.1). */
export function tagLabel(tag: string): string {
  return tag.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
