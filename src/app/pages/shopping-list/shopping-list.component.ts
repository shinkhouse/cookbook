import { Component, computed, inject } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
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

  protected readonly groups = computed(() => this.list.groups());
  protected readonly isEmpty = computed(
    () => this.list.recipeCount() === 0 && this.list.extras().length === 0,
  );

  /** Recipe chips across the top, each removable with its items (§6.5). */
  protected readonly chips = computed(() =>
    this.list
      .cart()
      .map((slug) => this.recipes.bySlug(slug))
      .filter((r): r is NonNullable<typeof r> => r !== undefined),
  );

  /** Adds the typed item; the field clears only when it was accepted. */
  protected addItem(input: HTMLInputElement): void {
    if (this.list.addExtra(input.value)) input.value = '';
  }

  protected readonly progress = computed(() => {
    const total = this.list.totalItems();
    return total === 0 ? 0 : Math.round((this.list.boughtCount() / total) * 100);
  });
}
