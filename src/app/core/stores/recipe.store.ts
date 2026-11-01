import { Injectable, computed, inject, signal } from '@angular/core';
import { Recipe } from '../model/recipes.model';
import { Facet, buildFacets, matchesSelection } from '../facets';
import { gapKeys, gapsOf } from '../recipe-health';
import { RecipeRepository } from '../recipe-repository';
import { PrefsStore } from './prefs.store';

/**
 * The recipe collection plus the library's search and filter state.
 *
 * The collection lives behind RecipeRepository, i.e. in the API. Writes go there
 * first and the signal changes only once it has answered, so a rejected write
 * leaves what is on screen matching what is stored. The search text and the tag
 * selection are not stored anywhere (§2.2), so a reload lands on the full
 * library rather than on whatever was last filtered.
 */
@Injectable({ providedIn: 'root' })
export class RecipeStore {
  // Favorites are a preference, so they live in PrefsStore; the dependency
  // runs this way only (PrefsStore knows nothing about recipes).
  private readonly prefs = inject(PrefsStore);
  private readonly repo = inject(RecipeRepository);

  /**
   * Empty until the API answers; `status` says whether that has happened. Holds
   * archived recipes too (a writable build loads them), so slugs stay unique.
   */
  private readonly _recipes = signal<readonly Recipe[]>([]);
  /** What the library sees: everything loaded except the archived and embedded components. */
  private readonly visible = computed(() =>
    this._recipes().filter((r) => !r.archived && !r.component),
  );
  /** Everything that can be opened by slug: components included, archived not. */
  private readonly resolvable = computed(() => this._recipes().filter((r) => !r.archived));
  private readonly _status = signal<'loading' | 'ready' | 'error'>('loading');
  private inflight: Promise<void> | null = null;

  readonly recipes = this.visible;
  readonly status = this._status.asReadonly();

  /** Whether this build may write; screens omit add/edit/delete when not. */
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
        this._recipes.set(loaded);
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

  readonly query = signal('');
  /**
   * Multi-select across grouped facets. Selections widen within a facet and
   * narrow across facets — see core/facets.ts for why.
   */
  readonly selectedTags = signal<ReadonlySet<string>>(new Set());
  readonly favsOnly = signal(false);
  /**
   * Selected gap keys from the Needs-work facet. Held apart from selectedTags
   * because a gap is derived from the recipe rather than stored on it, so it
   * cannot be matched by the tag rules.
   */
  readonly selectedGaps = signal<ReadonlySet<string>>(new Set());

  /**
   * Tag list derived from the data rather than hardcoded (§4.1), deduped and
   * alphabetised. Stored lowercase; display title-cases via `tagLabel`.
   */
  readonly tags = computed(() => {
    const seen = new Set<string>();
    for (const r of this.visible()) for (const t of r.tags) seen.add(t.toLowerCase());
    return [...seen].sort();
  });

  /** The filter controls, grouped and pruned to what the data actually has. */
  readonly facets = computed<Facet[]>(() => buildFacets(this.tags()));

  readonly selectedCount = computed(() => this.selectedTags().size + this.selectedGaps().size);

  /** How many recipes carry each gap, for the counts beside the options. */
  readonly gapCounts = computed(() => {
    const counts: Record<string, number> = { method: 0, steps: 0, photo: 0 };
    for (const r of this.visible()) {
      for (const key of gapKeys(r)) counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  });

  readonly needsWorkCount = computed(
    () => this.visible().filter((r) => gapsOf(r).any).length,
  );

  /** The recipe the library header's stat block names. */
  readonly mostCooked = computed(() =>
    this.visible().reduce<Recipe | null>(
      (best, r) => (best === null || r.cooked > best.cooked ? r : best),
      null,
    ),
  );

  /** Resolves components too, so a parent page can open its sub-recipes. */
  bySlug(slug: string): Recipe | undefined {
    return this.resolvable().find((r) => r.slug === slug);
  }

  /**
   * A recipe's embedded sub-recipes, in order. A component that is missing or
   * archived is skipped rather than failing the parent. The label falls back to
   * the component's own title.
   */
  componentsOf(slug: string): { label: string; recipe: Recipe }[] {
    const parts: { label: string; recipe: Recipe }[] = [];
    for (const ref of this.bySlug(slug)?.components ?? []) {
      const recipe = this.bySlug(ref.slug);
      if (recipe) parts.push({ label: ref.label || recipe.title, recipe });
    }
    return parts;
  }

  /**
   * Adds a recipe from the create flow.
   *
   * Returns the slug actually used, which may be suffixed to stay unique. The
   * suffix is chosen against what is loaded, so it avoids a clash we can see; a
   * clash only the server can see (409) rejects as it is, with no retry under
   * another suffix — silently filing the recipe somewhere the user did not ask
   * for is worse than telling them. Throws if the API refuses, leaving the list
   * as it was.
   */
  async add(recipe: Recipe): Promise<string> {
    const slug = this.uniqueSlug(recipe.slug);
    const stored = await this.repo.create({ ...recipe, slug });
    this._recipes.update((list) => [stored, ...list]);
    return stored.slug;
  }

  /**
   * Removes a recipe. Returns false if the server did not know the slug; the
   * stale local entry is dropped either way, since the server has just said it
   * is gone. Throws if the API refuses, leaving the list as it was.
   */
  async remove(slug: string): Promise<boolean> {
    const removed = await this.repo.remove(slug);
    this._recipes.update((list) => list.filter((r) => r.slug !== slug));
    return removed;
  }

  /**
   * Replaces an existing recipe, matched on slug. Archived records are found
   * too, so `archive` can reach them and a record sent with `archived: false`
   * would restore one. Returns false if the slug was unknown, here or on the
   * server. Throws if the API refuses.
   */
  async update(recipe: Recipe): Promise<boolean> {
    if (!this._recipes().some((r) => r.slug === recipe.slug)) return false;
    const stored = await this.repo.update(recipe);
    if (!stored) return false;
    this._recipes.update((list) => list.map((r) => (r.slug === stored.slug ? stored : r)));
    return true;
  }

  /**
   * Soft-deletes a recipe: sets `archived` and sends the whole record, so it
   * disappears from every screen but stays stored. Favorites and list entries
   * are kept; they just stop resolving while it is archived.
   *
   * Returns false when the slug is unknown, here or on the server. Throws if the
   * API refuses, leaving the list as it was.
   */
  async archive(slug: string): Promise<boolean> {
    const recipe = this._recipes().find((r) => r.slug === slug);
    if (!recipe) return false;
    return this.update({ ...recipe, archived: true });
  }

  /**
   * The recipes filed in a cookbook.
   *
   * A scan rather than an index: membership lives on the recipe (design §2), and
   * at 72 records an index would cost more to keep correct than it saves.
   */
  inCookbook(cookbookId: string): Recipe[] {
    return this.visible().filter((r) => r.cookbooks.includes(cookbookId));
  }

  /**
   * Files a recipe into a cookbook.
   *
   * Returns false when the slug is unknown or the recipe is already filed there,
   * so a repeat call is a no-op rather than a duplicate id — every count derived
   * from membership would otherwise double for that recipe. Throws if the API
   * refuses, leaving the recipe's cookbooks as they were.
   */
  async addToCookbook(slug: string, cookbookId: string): Promise<boolean> {
    const recipe = this.bySlug(slug);
    if (!recipe || recipe.cookbooks.includes(cookbookId)) return false;
    return this.update({ ...recipe, cookbooks: [...recipe.cookbooks, cookbookId] });
  }

  /**
   * Takes a recipe out of a cookbook, leaving the recipe alone. Removing its
   * last cookbook is allowed — an unfiled recipe is still yours.
   *
   * Returns false when the slug is unknown or it was never filed there. Throws
   * if the API refuses.
   */
  async removeFromCookbook(slug: string, cookbookId: string): Promise<boolean> {
    const recipe = this.bySlug(slug);
    if (!recipe || !recipe.cookbooks.includes(cookbookId)) return false;
    return this.update({
      ...recipe,
      cookbooks: recipe.cookbooks.filter((id) => id !== cookbookId),
    });
  }

  private uniqueSlug(desired: string): string {
    const base = desired || 'untitled';
    // Against everything loaded, archived included: their slugs are still taken.
    const taken = (slug: string) => this._recipes().some((r) => r.slug === slug);
    if (!taken(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base}-${n}`;
      if (!taken(candidate)) return candidate;
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
    const gaps = this.selectedGaps();

    return this.visible().filter((r) => {
      if (!matchesSelection(r.tags, selected)) return false;
      if (favsOnly && !this.prefs.isFav(r.slug)) return false;
      // OR within the gap facet, matching how the tag facets behave.
      if (gaps.size > 0 && !gapKeys(r).some((k) => gaps.has(k))) return false;
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

  /** True when the option is on, for either kind of facet. */
  isOptionSelected(facet: Facet, option: string): boolean {
    const set = facet.kind === 'gap' ? this.selectedGaps() : this.selectedTags();
    return set.has(option.toLowerCase());
  }

  toggleOption(facet: Facet, option: string): void {
    const target = facet.kind === 'gap' ? this.selectedGaps : this.selectedTags;
    const next = new Set(target());
    const key = option.toLowerCase();
    if (!next.delete(key)) next.add(key);
    target.set(next);
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
    const target = facet.kind === 'gap' ? this.selectedGaps : this.selectedTags;
    const next = new Set(target());
    for (const option of facet.options) next.delete(option.toLowerCase());
    target.set(next);
  }

  clearTags(): void {
    this.selectedTags.set(new Set());
    this.selectedGaps.set(new Set());
  }

  /** How many of a facet's options are currently on, for its button badge. */
  facetCount(facet: Facet): number {
    const selected = facet.kind === 'gap' ? this.selectedGaps() : this.selectedTags();
    return facet.options.reduce((n, o) => n + (selected.has(o.toLowerCase()) ? 1 : 0), 0);
  }

  toggleFavsOnly(): void {
    this.favsOnly.update((v) => !v);
  }

  reset(): void {
    this.query.set('');
    this.selectedTags.set(new Set());
    this.selectedGaps.set(new Set());
    this.favsOnly.set(false);
  }
}

/** Stored lowercase, displayed title-cased (§4.1). */
export function tagLabel(tag: string): string {
  return tag.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
