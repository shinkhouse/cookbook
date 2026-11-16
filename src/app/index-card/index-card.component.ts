import { Component, computed, input } from '@angular/core';
import { cardLines, cardTilt } from '../core/index-card';
import { Ingredient } from '../core/model/recipes.model';

/**
 * Stands in for a missing recipe photo: the recipe as an index card from the
 * family recipe box. Decorative, since the page around it already gives the
 * title and ingredients, so it stays out of the accessibility tree.
 */
@Component({
  selector: 'app-index-card',
  templateUrl: './index-card.component.html',
  styleUrl: './index-card.component.scss',
  host: { 'aria-hidden': 'true' },
})
export class IndexCardComponent {
  readonly title = input.required<string>();
  readonly ingredients = input.required<readonly Ingredient[]>();
  /** Usually the slug: what the card's lean is derived from. */
  readonly seed = input('');

  protected readonly lines = computed(() => cardLines(this.ingredients()));
  protected readonly tilt = computed(() => `${cardTilt(this.seed())}deg`);
}
