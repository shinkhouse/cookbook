import { Component, computed, inject, input, signal } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { formatQty, scaleFactor, scaleLabel } from '../../core/scale';
import { ListStore } from '../../core/stores/list.store';
import { PrefsStore } from '../../core/stores/prefs.store';
import { RecipeStore, tagLabel } from '../../core/stores/recipe.store';

@Component({
  selector: 'app-recipe-detail',
  imports: [RouterLink, MatIconModule, MatCheckboxModule],
  templateUrl: './recipe-detail.component.html',
  styleUrl: './recipe-detail.component.scss',
})
export class RecipeDetailComponent {
  /** Bound from the route via withComponentInputBinding. */
  readonly slug = input.required<string>();

  private readonly recipes = inject(RecipeStore);
  protected readonly list = inject(ListStore);
  protected readonly prefs = inject(PrefsStore);

  protected readonly tagLabel = tagLabel;
  protected readonly scaleLabel = scaleLabel;

  protected readonly recipe = computed(() => this.recipes.bySlug(this.slug()));

  /**
   * Ephemeral by design (§2.2): the chosen serving count and the checked
   * ingredients are not persisted, so revisiting a recipe starts clean.
   */
  private readonly chosenServings = signal<number | null>(null);
  private readonly checked = signal<ReadonlySet<number>>(new Set());

  protected readonly servings = computed(
    () => this.chosenServings() ?? this.recipe()?.servings ?? 1,
  );

  protected readonly factor = computed(() =>
    scaleFactor(this.servings(), this.recipe()?.servings ?? 1),
  );

  /** Amounts scale; step text never does (§5.1). */
  protected readonly ingredients = computed(() => {
    const recipe = this.recipe();
    if (!recipe) return [];
    const factor = this.factor();
    const checked = this.checked();
    return recipe.ingredients.map((ingredient, index) => ({
      index,
      name: ingredient.name,
      unit: ingredient.unit,
      amount: ingredient.qty === null ? '' : formatQty(ingredient.qty * factor),
      checked: checked.has(index),
    }));
  });

  protected readonly checkedCount = computed(() => this.checked().size);

  /** Some stored photo URLs are hotlink blocked; fall back to the placeholder. */
  private readonly photoBroken = signal(false);

  protected readonly showPhoto = computed(() => !!this.recipe()?.photo && !this.photoBroken());

  protected onPhotoError(): void {
    this.photoBroken.set(true);
  }

  protected stepServings(delta: number): void {
    // One serving is the floor — zero would scale every amount to nothing.
    this.chosenServings.set(Math.max(1, this.servings() + delta));
  }

  protected resetServings(): void {
    this.chosenServings.set(null);
  }

  protected toggleCheck(index: number): void {
    const next = new Set(this.checked());
    if (!next.delete(index)) next.add(index);
    this.checked.set(next);
  }

  protected amountLabel(amount: string, unit: string): string {
    if (!amount) return '';
    return unit ? `${amount} ${unit}` : amount;
  }
}
