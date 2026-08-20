import { Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { Recipe } from '../../core/model/recipes.model';
import { ListStore } from '../../core/stores/list.store';
import { PrefsStore } from '../../core/stores/prefs.store';
import { RecipeStore, tagLabel } from '../../core/stores/recipe.store';

/** §6.1 — search is debounced 150ms. */
const SEARCH_DEBOUNCE_MS = 150;

@Component({
  selector: 'app-library',
  imports: [RouterLink, MatIconModule],
  templateUrl: './library.component.html',
  styleUrl: './library.component.scss',
})
export class LibraryComponent {
  private readonly router = inject(Router);
  protected readonly recipes = inject(RecipeStore);
  protected readonly list = inject(ListStore);
  protected readonly prefs = inject(PrefsStore);

  protected readonly tagLabel = tagLabel;

  /**
   * The input is bound to this, not to the store: the store's query drives the
   * filter and is only updated once typing settles (§6.1).
   */
  protected readonly typed = signal('');

  private debounce?: ReturnType<typeof setTimeout>;

  protected readonly results = computed(() => this.recipes.results());
  protected readonly tags = computed(() => this.recipes.tags());
  protected readonly mostCooked = computed(() => this.recipes.mostCooked());

  /**
   * Slugs whose photo failed to load. Several of the stored URLs are hotlink
   * blocked, and a broken <img> shows its alt text as body copy, which reads as
   * a bug. Falling back to the striped placeholder instead.
   */
  private readonly brokenPhotos = signal<ReadonlySet<string>>(new Set());

  protected showPhoto(slug: string, photo: string | undefined): boolean {
    return !!photo && !this.brokenPhotos().has(slug);
  }

  protected onPhotoError(slug: string): void {
    this.brokenPhotos.update((set) => new Set(set).add(slug));
  }

  protected readonly isFiltered = computed(
    () =>
      this.recipes.query().length > 0 ||
      this.recipes.activeTag() !== null ||
      this.recipes.favsOnly(),
  );

  protected onSearch(value: string): void {
    this.typed.set(value);
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.recipes.setQuery(value), SEARCH_DEBOUNCE_MS);
  }

  protected clearSearch(): void {
    clearTimeout(this.debounce);
    this.typed.set('');
    this.recipes.setQuery('');
  }

  protected selectTag(tag: string | null): void {
    // Single-select: tapping the active pill returns to "All".
    this.recipes.setTag(this.recipes.activeTag() === tag ? null : tag);
  }

  protected clearAll(): void {
    this.clearSearch();
    this.recipes.reset();
  }

  /** "Cook this" goes straight into cook mode, per §6.1. */
  protected cook(recipe: Recipe, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/recipes', recipe.slug, 'cook']);
  }

  protected toggleList(recipe: Recipe, event: Event): void {
    event.stopPropagation();
    this.list.toggleRecipe(recipe.slug);
  }

  protected toggleFav(recipe: Recipe, event: Event): void {
    event.stopPropagation();
    this.prefs.toggleFav(recipe.slug);
  }
}
