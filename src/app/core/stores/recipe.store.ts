import { Injectable, computed, inject, signal } from '@angular/core';
import { Recipe } from '../model/recipes.model';
import { Recipes } from '../mock/recipes.mock';
import { PrefsStore } from './prefs.store';

/** The "All" pill — no tag filter applied. */
export const ALL_TAGS = null;

/**
 * The recipe collection plus the library's search and filter state, per spec
 * §2.2. Not persisted: search text and the active tag are deliberately
 * ephemeral, so a reload lands on the full library.
 */
@Injectable({ providedIn: 'root' })
export class RecipeStore {
  // Favourites are a preference, so they live in PrefsStore; the dependency
  // runs this way only (PrefsStore knows nothing about recipes).
  private readonly prefs = inject(PrefsStore);

  private readonly _recipes = signal<readonly Recipe[]>(Recipes);

  readonly recipes = computed(() => this._recipes());

  readonly query = signal('');
  readonly activeTag = signal<string | null>(ALL_TAGS);
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
   * Adds a recipe from the create flow. Session-scoped: RecipeStore is not
   * persisted (§2.2) and there is no backend (§1), so a saved recipe lives
   * until reload. "Copy JSON" in the create flow is how a recipe is actually
   * kept — paste it into the seed data.
   *
   * Returns the slug actually used, which may be suffixed to stay unique.
   */
  add(recipe: Recipe): string {
    const slug = this.uniqueSlug(recipe.slug);
    this._recipes.update((list) => [{ ...recipe, slug }, ...list]);
    return slug;
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
    const tag = this.activeTag();
    const favsOnly = this.favsOnly();

    return this._recipes().filter((r) => {
      if (tag !== null && !r.tags.some((t) => t.toLowerCase() === tag)) return false;
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

  setTag(tag: string | null): void {
    this.activeTag.set(tag);
  }

  toggleFavsOnly(): void {
    this.favsOnly.update((v) => !v);
  }

  reset(): void {
    this.query.set('');
    this.activeTag.set(ALL_TAGS);
    this.favsOnly.set(false);
  }
}

/** Stored lowercase, displayed title-cased (§4.1). */
export function tagLabel(tag: string): string {
  return tag.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
