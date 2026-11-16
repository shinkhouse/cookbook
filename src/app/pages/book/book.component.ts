import { DOCUMENT, DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BOOK_ORDERS, bookSections, parseBookOrder } from '../../core/book';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import { RecipeDetailComponent } from '../recipe-detail/recipe-detail.component';

/**
 * Every recipe as one printable book: a cover, the contents, then each recipe
 * on its own pages in the recipe page's print layout.
 *
 * Printing it from the browser gives the book without page numbers; Chrome
 * cannot number a contents page. `npm run book` prints it twice through
 * Chrome to learn where each recipe lands, fills the contents in, and numbers
 * the footers. It reads the `r<n>` anchors, the `data-book-page` slots and the
 * `data-book-ready` flag below, so those are a contract with that script.
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

  protected readonly orders = BOOK_ORDERS;
  protected readonly current = computed(() => parseBookOrder(this.order()));
  protected readonly today = new Date();

  protected readonly ready = computed(
    () => this.recipes.status() === 'ready' && this.cookbooks.status() === 'ready',
  );

  /** Sections with each recipe's anchor, numbered in print order. */
  protected readonly sections = computed(() => {
    let n = 0;
    return bookSections(this.recipes.recipes(), this.current(), this.cookbooks.cookbooks()).map(
      (section) => ({
        label: section.label,
        entries: section.recipes.map((recipe) => ({ recipe, anchor: `r${n++}` })),
      }),
    );
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
