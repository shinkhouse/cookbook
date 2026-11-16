import { DecimalPipe } from '@angular/common';
import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { NoPhotoComponent } from '../../no-photo/no-photo.component';
import { PagerComponent } from '../../pager/pager.component';
import { environment } from '../../../environments/environment';
import {
  Facet,
  GAP_FACET,
  OTHER_FACET,
  cookbookFacet,
  GAP_LABELS,
  GapKey,
} from '../../core/facets';
import { photoSrcset, photoUrl, resizable } from '../../core/photos';
import { gapLabel, gapsOf } from '../../core/recipe-health';
import { Recipe } from '../../core/model/recipes.model';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { ListStore } from '../../core/stores/list.store';
import { PAGE_SIZE, RecipeStore, tagLabel } from '../../core/stores/recipe.store';

/** §6.1 — search is debounced 150ms. */
const SEARCH_DEBOUNCE_MS = 150;

/** The long tail of the bar, folded into one More menu when two or more are present. */
const MORE_FACETS: readonly string[] = ['method', 'diet', 'ingredient', OTHER_FACET];

/** The open-menu id the cookbook switcher shares with the facet menus. */
const SHELF = 'shelf';

/** One trigger in the facet bar: a facet, or several folded under one name. */
interface BarItem {
  id: string;
  label: string;
  facets: Facet[];
}

@Component({
  selector: 'app-library',
  imports: [RouterLink, MatIconModule, NoPhotoComponent, PagerComponent, DecimalPipe],
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
  private readonly injector = inject(Injector);
  protected readonly recipes = inject(RecipeStore);
  protected readonly cookbooks = inject(CookbookStore);
  protected readonly list = inject(ListStore);

  /**
   * The shopping list is a local convenience, and the deployed site is a
   * read-only showcase, so production builds leave its controls out.
   */
  protected readonly showListControls = !environment.production;

  protected readonly tagLabel = tagLabel;

  /** Placeholder cards shown while the collection is being fetched. */
  protected readonly skeletons = [0, 1, 2, 3, 4, 5];

  /** The widest grid shows three cards a row; those photos are on screen at load. */
  protected readonly eagerPhotos = 3;

  /** Option labels differ by facet: tags are title-cased, gaps have names. */
  protected optionLabel(facet: Facet, option: string): string {
    return facet.kind === 'gap' ? GAP_LABELS[option as GapKey] : tagLabel(option);
  }

  /** How many recipes carry a gap, shown beside its option. */
  protected optionCount(facet: Facet, option: string): number | null {
    return facet.kind === 'gap' ? (this.recipes.gapCounts()[option] ?? 0) : null;
  }

  protected readonly gapFacetId = GAP_FACET;

  /**
   * The card badge text for a recipe still missing something, or ''. A missing
   * photo goes unsaid: the placeholder in its place already says it.
   */
  protected gapFor(recipe: Recipe): string {
    return gapLabel({ ...gapsOf(recipe), needsPhoto: false });
  }

  /**
   * The input is bound to this, not to the store: the store's query drives the
   * filter and is only updated once typing settles (§6.1).
   */
  protected readonly typed = signal('');

  private debounce?: ReturnType<typeof setTimeout>;

  protected readonly results = computed(() => this.recipes.results());
  /** The search box takes a list of what you have, and results rank by coverage. */
  protected readonly haveMode = computed(() => this.recipes.mode() === 'have');
  /** Components are not offered, so a set of only those has nothing to pick. */
  protected readonly canSurprise = computed(() => this.results().some((r) => !r.component));
  /**
   * The filter facets. Needs work is a prompt to whoever edits the recipes, so
   * the read-only site leaves it out.
   */
  protected readonly facets = computed(() =>
    this.recipes.writable
      ? this.recipes.facets()
      : this.recipes.facets().filter((f) => f.kind !== 'gap'),
  );

  /** The bar's triggers, in facet order, with the long tail folded into More. */
  protected readonly barItems = computed<BarItem[]>(() => {
    const facets = this.facets();
    const folded = facets.filter((f) => MORE_FACETS.includes(f.id));
    const items: BarItem[] = [];
    for (const facet of facets) {
      if (folded.length < 2 || !folded.includes(facet)) {
        items.push({ id: facet.id, label: facet.label, facets: [facet] });
      } else if (facet === folded[0]) {
        items.push({ id: 'more', label: 'More', facets: folded });
      }
    }
    return items;
  });

  /**
   * The cookbook is the shelf being browsed rather than a filter on it, so it
   * is chosen from the title. Null with one cookbook: there is nothing to switch.
   */
  protected readonly shelf = computed(() => cookbookFacet(this.cookbooks.cookbooks()));

  /** The cookbook on the shelf, or null for all of them. */
  protected readonly shelfId = computed(() => {
    const shelf = this.shelf();
    const on = shelf?.options.filter((id) => this.recipes.isOptionSelected(shelf, id)) ?? [];
    return on.length === 1 ? on[0] : null;
  });

  protected readonly title = computed(() => {
    const id = this.shelfId();
    return (id && this.cookbooks.byId(id)?.name) || 'All Cookbooks';
  });

  protected toggleShelf(): void {
    this.toggleFacet(SHELF);
    if (this.openFacet() !== SHELF) return;
    // A menu takes focus on opening, landing on the current choice.
    afterNextRender(
      () =>
        this.host.nativeElement
          .querySelector<HTMLElement>('.shelf-menu [aria-checked="true"]')
          ?.focus(),
      { injector: this.injector },
    );
  }

  protected chooseShelf(id: string | null): void {
    const shelf = this.shelf();
    if (!shelf) return;
    this.recipes.clearFacet(shelf);
    if (id) this.recipes.toggleOption(shelf, id);
    this.closeFacet(true);
  }

  /** Up and down move through the menu, wrapping at either end. */
  protected onShelfKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const items = [
      ...this.host.nativeElement.querySelectorAll<HTMLElement>('.shelf-menu [role="menuitemradio"]'),
    ];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + step + items.length) % items.length]?.focus();
  }

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
    // A click inside the bar or the title is either on a trigger or on an
    // option; both are handled by their own handlers.
    const menus = this.host.nativeElement.querySelectorAll('.facet-bar, .shelf');
    if (target && [...menus].some((m) => m.contains(target))) return;
    this.closeFacet();
  }

  /**
   * Slugs whose photo failed to load. Several of the stored URLs are hotlink
   * blocked, and a broken <img> shows its alt text as body copy, which reads as
   * a bug. Falling back to the striped placeholder instead.
   */
  private readonly brokenPhotos = signal<ReadonlySet<string>>(new Set());

  /** Slugs whose resized photo failed; those try the original URL next. */
  private readonly unresized = signal<ReadonlySet<string>>(new Set());

  protected showPhoto(slug: string, photo: string | undefined): boolean {
    return !!photo && !this.brokenPhotos().has(slug);
  }

  private resized(recipe: Recipe): boolean {
    return resizable(recipe.photo) && !this.unresized().has(recipe.slug);
  }

  /** A card is about 380px wide at most, so 400 and 800 cover 1x and 2x screens. */
  protected cardPhoto(recipe: Recipe): string {
    return this.resized(recipe) ? photoUrl(recipe.photo!, 400) : recipe.photo!;
  }

  protected cardSrcset(recipe: Recipe): string | null {
    return this.resized(recipe) ? photoSrcset(recipe.photo!, [400, 800]) : null;
  }

  protected onPhotoError(recipe: Recipe): void {
    const failed = this.resized(recipe) ? this.unresized : this.brokenPhotos;
    failed.update((set) => new Set(set).add(recipe.slug));
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

  /** What a trigger's badge counts: everything chosen under it. */
  protected itemCount(item: BarItem): number {
    return item.facets.reduce((n, facet) => n + this.facetCount(facet), 0);
  }

  protected clearItem(item: BarItem): void {
    for (const facet of item.facets) this.recipes.clearFacet(facet);
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

  /** Leaves the chosen cookbook alone: it is the shelf, not one of the filters. */
  protected clearAll(): void {
    const shelf = this.recipes.selectedCookbooks();
    this.clearSearch();
    this.recipes.reset();
    this.recipes.selectedCookbooks.set(shelf);
    this.closeFacet();
  }

  /**
   * Keeps what was typed: a search word is often an ingredient you have. Either
   * way the next thing to do is type, so the field takes focus.
   */
  protected toggleHave(): void {
    this.recipes.mode.update((m) => (m === 'have' ? 'search' : 'have'));
    this.host.nativeElement.querySelector<HTMLInputElement>('.search input')?.focus();
  }

  protected readonly pageSize = PAGE_SIZE;

  /** A new page starts at its top, under the result count, not where the old one ended. */
  protected goToPage(page: number): void {
    this.recipes.page.set(page);
    this.host.nativeElement.querySelector('.result-bar')?.scrollIntoView({ block: 'start' });
  }

  /** "Cook this" goes straight into cook mode, per §6.1. */
  protected cook(recipe: Recipe, event: Event): void {
    event.stopPropagation();
    this.router.navigate(['/recipes', recipe.slug, 'cook']);
  }

  protected onSort(value: string): void {
    this.recipes.sort.set(value === 'stale' ? 'stale' : 'default');
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

  /**
   * The star only changes once the server answers, so a failed write leaves it
   * as it was; on a card that is enough, and no message is shown.
   */
  protected toggleFav(recipe: Recipe, event: Event): void {
    event.stopPropagation();
    this.recipes.toggleFav(recipe.slug).catch(() => undefined);
  }
}
