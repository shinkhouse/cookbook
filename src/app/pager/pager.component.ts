import { DecimalPipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { pageNumbers } from '../core/pagination';

/**
 * Previous, the page numbers and Next, with which results are showing. It only
 * reports the page asked for; the caller decides what changing page means.
 */
@Component({
  selector: 'app-pager',
  imports: [MatIconModule, DecimalPipe],
  templateUrl: './pager.component.html',
  styleUrl: './pager.component.scss',
})
export class PagerComponent {
  /** The current page, from 1. */
  readonly page = input.required<number>();
  readonly pageCount = input.required<number>();
  /** How many results there are across every page. */
  readonly total = input.required<number>();
  readonly pageSize = input.required<number>();

  readonly pageChange = output<number>();

  protected readonly pages = computed(() => pageNumbers(this.page(), this.pageCount()));

  /** Which results this page holds, counting from 1. */
  protected readonly range = computed(() => {
    const first = (this.page() - 1) * this.pageSize() + 1;
    return { first, last: Math.min(first + this.pageSize() - 1, this.total()) };
  });
}
