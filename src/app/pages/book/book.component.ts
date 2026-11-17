import { DOCUMENT, DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BOOK_ORDERS, bookRecipes, bookSections, parseBookOrder } from '../../core/book';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import { RecipeDetailComponent } from '../recipe-detail/recipe-detail.component';

/**
 * One cookbook as a printable book: a cover, the contents, then each recipe
 * on its own pages in the recipe page's print layout.
 *
 * It asks which cookbook first. The whole collection is thousands of recipes,
 * and drawing them all as one page stalls the browser, so nothing is drawn
 * until a cookbook is chosen (`?cookbook=<id>`).
 *
 * Printing it from the browser gives the book without page numbers; Chrome
 * cannot number a contents page. `npm run book` prints it twice through
 * Chrome to learn where each recipe lands, fills the contents in, and numbers
 * the footers. It reads the `r<n>` anchors, the `data-book-page` slots, the
 * `data-book-ready` flag and `data-book-title` below, and the chooser's
 * `data-cookbook-id` links, so those are a contract with that script.
 */
@Component({
  selector: 'app-book',
  imports: [RouterLink, DatePipe, RecipeDetailComponent],
  templateUrl: './book.component.html',
  styleUrl: './book.component.scss',
})
export class BookComponent {
  private readonly document = inject(DOCUMENT);
  private readonly recipes = inject(RecipeStore);
  private readonly cookbooks = inject(CookbookStore);

  /** The `order` query parameter. */
  readonly order = input<string>();

  /** The `cookbook` query parameter: the id of the cookbook to print. */
  readonly cookbook = input<string>();

  protected readonly orders = BOOK_ORDERS;
  protected readonly current = computed(() => parseBookOrder(this.order()));
  protected readonly today = new Date();

  protected readonly loaded = computed(
    () => this.recipes.status() === 'ready' && this.cookbooks.status() === 'ready',
  );

  /** The cookbook being printed, or undefined until one is chosen (or when the id is unknown). */
  protected readonly chosen = computed(() => {
    const id = this.cookbook();
    return id ? this.cookbooks.byId(id) : undefined;
  });

  /** An id was given that matches no cookbook, once there is a list to check it against. */
  protected readonly unknown = computed(() => this.loaded() && !!this.cookbook() && !this.chosen());

  protected readonly ready = computed(() => this.loaded() && !!this.chosen());

  /** Each cookbook with how many recipes its book would print, for the chooser. */
  protected readonly choices = computed(() => {
    const all = this.recipes.recipes();
    return this.cookbooks.cookbooks().map((book) => ({ book, count: bookRecipes(all, book.id).length }));
  });

  /** Sections with each recipe's anchor, numbered in print order. */
  protected readonly sections = computed(() => {
    const book = this.chosen();
    if (!book) return [];
    let n = 0;
    return bookSections(bookRecipes(this.recipes.recipes(), book.id), this.current()).map((section) => ({
      label: section.label,
      entries: section.recipes.map((recipe) => ({ recipe, anchor: `r${n++}` })),
    }));
  });

  protected readonly count = computed(() =>
    this.sections().reduce((total, s) => total + s.entries.length, 0),
  );

  /**
   * The contents links are bare fragments because Chrome only keeps a link
   * inside the PDF when it points at the document's base URL. Under the app's
   * <base href> that would send a click on screen to the library, so on screen
   * the click scrolls to the recipe instead.
   */
  protected jump(event: Event, anchor: string): void {
    event.preventDefault();
    this.document.getElementById(anchor)?.scrollIntoView();
  }

  protected print(): void {
    this.document.defaultView?.print();
  }
}
