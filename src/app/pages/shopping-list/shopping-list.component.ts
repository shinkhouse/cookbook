import { Component, computed, inject } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { formatQty } from '../../core/scale';
import { ListStore } from '../../core/stores/list.store';
import { RecipeStore } from '../../core/stores/recipe.store';

@Component({
  selector: 'app-shopping-list',
  imports: [RouterLink, MatIconModule, MatCheckboxModule],
  templateUrl: './shopping-list.component.html',
  styleUrl: './shopping-list.component.scss',
})
export class ShoppingListComponent {
  protected readonly list = inject(ListStore);
  private readonly recipes = inject(RecipeStore);

  protected readonly formatQty = formatQty;

  protected readonly groups = computed(() => this.list.groups());
  protected readonly isEmpty = computed(() => this.list.recipeCount() === 0);

  /** Recipe chips across the top, each removable with its items (§6.5). */
  protected readonly chips = computed(() =>
    this.list
      .cart()
      .map((slug) => this.recipes.bySlug(slug))
      .filter((r): r is NonNullable<typeof r> => r !== undefined),
  );

  protected readonly progress = computed(() => {
    const total = this.list.totalItems();
    return total === 0 ? 0 : Math.round((this.list.boughtCount() / total) * 100);
  });

  /** The amount column: "1½ cup", or nothing at all when it is to taste. */
  protected amount(qty: number | null, unit: string): string {
    if (qty === null) return '';
    const value = formatQty(qty);
    return unit ? `${value} ${unit}` : value;
  }
}
