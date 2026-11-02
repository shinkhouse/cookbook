import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Facet, GAP_FACET, cookbookFacet, GAP_LABELS, GapKey } from '../../core/facets';
import { gapLabel, gapsOf } from '../../core/recipe-health';
import { Recipe } from '../../core/model/recipes.model';
import { CookbookStore } from '../../core/stores/cookbook.store';
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
  host: {
    // Closing on an outside click and on Escape is what makes a hand-rolled
    // dropdown acceptable; both are handled here rather than per menu.
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeFacet(true)',
  },
})
export class LibraryComponent {
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly recipes = inject(RecipeStore);
  protected readonly cookbooks = inject(CookbookStore);
  protected readonly list = inject(ListStore);
  protected readonly prefs = inject(PrefsStore);

  /**
   * The shopping list is a local convenience, and the deployed site is a
   * read-only showcase, so production builds leave its controls out.
   */
  protected readonly showListControls = !environment.production;

  protected readonly tagLabel = tagLabel;

  /** Placeholder cards shown while the collection is being fetched. */
  protected readonly skeletons = [0, 1, 2, 3, 4, 5];

  /** Option labels differ by facet: tags are title-cased, gaps have names, cookbooks show their name. */
  protected optionLabel(facet: Facet, option: string): string {
    if (facet.kind === 'cookbook') return this.cookbooks.byId(option)?.name ?? option;
    return facet.kind === 'gap' ? GAP_LABELS[option as GapKey] : tagLabel(option);
  }

  /** How many recipes carry a gap, shown beside its option. */
  protected optionCount(facet: Facet, option: string): number | null {
    return facet.kind === 'gap' ? (this.recipes.gapCounts()[option] ?? 0) : null;
  }

  protected readonly gapFacetId = GAP_FACET;

  /** The card badge text for a recipe still missing something, or ''. */
  protected gapFor(recipe: Recipe): string {
    return gapLabel(gapsOf(recipe));
  }

  /**
   * The input is bound to this, not to the store: the store's query drives the
   * filter and is only updated once typing settles (§6.1).
   */
  protected readonly typed = signal('');

  private debounce?: ReturnType<typeof setTimeout>;

  protected readonly results = computed(() => this.recipes.results());
  /** Components are not offered, so a set of only those has nothing to pick. */
  protected readonly canSurprise = computed(() => this.results().some((r) => !r.component));
  /** The cookbook facet leads when there is more than one cookbook to choose. */
  protected readonly facets = computed(() => {
    const cookbook = cookbookFacet(this.cookbooks.cookbooks());
    return cookbook ? [cookbook, ...this.recipes.facets()] : this.recipes.facets();
  });
  protected readonly mostCooked = computed(() => this.recipes.mostCooked());

  /** Which facet menu is open, if any. Only one at a time. */
  protected readonly openFacet = signal<string | null>(null);

  protected toggleFacet(id: string): void {
    this.openFacet.update((current) => (current === id ? null : id));
  }

  /**
   * @param restoreFocus true when the menu was dismissed by a key rather than
   * by pointing somewhere else, in which case focus owes a return to the
   * trigger that opened it.
   */
  protected closeFacet(restoreFocus = false): void {
    const id = this.openFacet();
    if (id === null) return;
    this.openFacet.set(null);
    if (!restoreFocus) return;
    const trigger = this.host.nativeElement.querySelector<HTMLButtonElement>(
      `[data-facet-trigger="${id}"]`,
    );
    trigger?.focus();
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.openFacet() === null) return;
    const target = event.target as Node | null;
    // A click inside the bar is either on a trigger or on an option; both are
    // handled by their own handlers.
    const bar = this.host.nativeElement.querySelector('.facet-bar');
    if (target && bar?.contains(target)) return;
    this.closeFacet();
  }

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
      this.recipes.selectedCount() > 0 ||
      this.recipes.favsOnly(),
  );

  /** Everything selected, as flat chips, so what is on stays visible when closed. */
  protected readonly activeChips = computed(() =>
    this.facets().flatMap((facet) =>
      facet.options
        .filter((option) => this.recipes.isOptionSelected(facet, option))
        .map((option) => ({
          facet,
          option,
          label: this.optionLabel(facet, option),
          facetLabel: facet.label,
        })),
    ),
  );

  protected facetCount(facet: Facet): number {
    return this.recipes.facetCount(facet);
  }

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

  protected clearAll(): void {
    this.clearSearch();
    this.recipes.reset();
    this.closeFacet();
  }

  /** "Cook this" goes straight into cook mode, per §6.1. */
  protected cook(recipe: Recipe, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/recipes', recipe.slug, 'cook']);
  }

  /** Opens a random recipe from the current filtered set. */
  protected surprise(): void {
    const pick = this.recipes.surprise();
    if (pick) this.router.navigate(['/recipes', pick.slug]);
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
