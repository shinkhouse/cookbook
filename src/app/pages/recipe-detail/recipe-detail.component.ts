import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { gapSentence, gapsOf } from '../../core/recipe-health';
import { scaleFactor, scaleLabel } from '../../core/scale';
import { DeviceStore } from '../../core/stores/device.store';
import { ListStore } from '../../core/stores/list.store';
import { PrefsStore } from '../../core/stores/prefs.store';
import { RecipeStore, tagLabel } from '../../core/stores/recipe.store';
import { Recipe } from '../../core/model/recipes.model';
import { UnitSystem, amountText } from '../../core/units';
import { describeDeviceError, describeWriteError } from '../../core/write-error';

/** One row of the ingredient card, with its amount already scaled. */
interface DetailIngredient {
  index: number;
  name: string;
  amount: string;
  checked: boolean;
  group?: string;
}

function groupRows(rows: DetailIngredient[]): { name: string | null; items: DetailIngredient[] }[] {
  const groups: { name: string | null; items: DetailIngredient[] }[] = [];
  for (const item of rows) {
    const name = item.group ?? null;
    const last = groups.at(-1);
    if (last && last.name === name) last.items.push(item);
    else groups.push({ name, items: [item] });
  }
  return groups;
}

@Component({
  selector: 'app-recipe-detail',
  imports: [RouterLink, FormsModule, MatIconModule, MatCheckboxModule],
  templateUrl: './recipe-detail.component.html',
  styleUrl: './recipe-detail.component.scss',
})
export class RecipeDetailComponent {
  /** Bound from the route via withComponentInputBinding. */
  readonly slug = input.required<string>();

  private readonly recipes = inject(RecipeStore);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  protected readonly list = inject(ListStore);
  protected readonly prefs = inject(PrefsStore);

  /**
   * The shopping list is a local convenience, and the deployed site is a
   * read-only showcase, so production builds leave its controls out.
   */
  protected readonly showListControls = !environment.production;

  protected readonly tagLabel = tagLabel;
  protected readonly scaleLabel = scaleLabel;

  protected readonly recipe = computed(() => this.recipes.bySlug(this.slug()));

  /** 'loading' until the collection arrives; "not found" is only true after that. */
  protected readonly status = this.recipes.status;

  /** Archiving is a write, so only a writable build offers it. */
  protected readonly writable = this.recipes.writable;

  /** A quick note is one of the narrow writes: a writable build or an unlocked device. */
  protected readonly canSave = this.recipes.canSave;
  private readonly device = inject(DeviceStore);
  protected noteText = '';
  protected readonly noteSaving = signal(false);
  protected readonly noteError = signal('');

  protected readonly confirmingArchive = signal(false);
  protected readonly archiving = signal(false);
  protected readonly archiveError = signal('');

  /** Opens the browser's print dialog; the print stylesheet does the rest. */
  protected print(): void {
    this.document.defaultView?.print();
  }

  protected askArchive(): void {
    this.archiveError.set('');
    this.confirmingArchive.set(true);
  }

  protected cancelArchive(): void {
    this.confirmingArchive.set(false);
    this.archiveError.set('');
  }

  /**
   * Archives, then leaves for the library. A false answer means the recipe is
   * already gone, which is where the user wanted it anyway. A failure stays on
   * the page with the reason, so the recipe is not lost from view.
   */
  protected async archive(): Promise<void> {
    if (this.archiving()) return;
    this.archiving.set(true);
    this.archiveError.set('');
    try {
      await this.recipes.archive(this.slug());
      void this.router.navigate(['/']);
    } catch (err) {
      this.archiveError.set(describeWriteError(err));
    } finally {
      this.archiving.set(false);
    }
  }

  protected async addNote(): Promise<void> {
    if (this.noteSaving() || !this.noteText.trim()) return;
    this.noteSaving.set(true);
    this.noteError.set('');
    try {
      if (await this.recipes.addNote(this.slug(), this.noteText)) this.noteText = '';
      else this.noteError.set('That recipe no longer exists.');
    } catch (err) {
      this.noteError.set(describeDeviceError(err, this.device.lockoutMinutes()));
    } finally {
      this.noteSaving.set(false);
    }
  }

  /** Try again after a failed first load. */
  protected retry(): void {
    void this.recipes.load();
  }

  /** What this recipe is still missing, if anything. */
  protected readonly gapNote = computed(() => {
    const r = this.recipe();
    return r ? gapSentence(gapsOf(r)) : '';
  });

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
  protected readonly ingredients = computed<DetailIngredient[]>(() => {
    const recipe = this.recipe();
    if (!recipe) return [];
    return this.rows(recipe.ingredients, this.componentIngredientCount());
  });

  /**
   * Ingredients grouped by sub-component, for the recipes whose list is really
   * several lists — a marinade, a sauce, the thing itself. Recipes with no
   * groups come back as one unnamed run, so the template has a single shape to
   * render either way.
   */
  protected readonly ingredientGroups = computed(() => groupRows(this.ingredients()));

  /**
   * Each embedded recipe as its own titled section. Rows are numbered on from
   * the parent's, so one check set and one scale factor cover the whole page.
   * A component that no longer resolves is already left out by the store.
   */
  protected readonly componentSections = computed(() => {
    const recipe = this.recipe();
    if (!recipe) return [];
    let offset = 0;
    return this.recipes.componentsOf(recipe.slug).map((part) => {
      const items = this.rows(part.recipe.ingredients, offset);
      offset += items.length;
      return { label: part.label, groups: groupRows(items), steps: part.recipe.steps };
    });
  });

  private readonly componentIngredientCount = computed(() => {
    const recipe = this.recipe();
    if (!recipe) return 0;
    return this.recipes
      .componentsOf(recipe.slug)
      .reduce((sum, part) => sum + part.recipe.ingredients.length, 0);
  });

  protected readonly totalIngredients = computed(
    () => this.ingredients().length + this.componentIngredientCount(),
  );

  private rows(list: Recipe['ingredients'], offset: number): DetailIngredient[] {
    const factor = this.factor();
    const units = this.prefs.units();
    const checked = this.checked();
    return list.map((ingredient, i) => ({
      index: offset + i,
      name: ingredient.name,
      group: ingredient.group,
      amount: amountText(ingredient.qty, ingredient.unit, factor, units),
      checked: checked.has(offset + i),
    }));
  }

  protected readonly checkedCount = computed(() => this.checked().size);

  /** Some stored photo URLs are hotlink blocked; fall back to the placeholder. */
  private readonly photoBroken = signal(false);

  protected readonly showPhoto = computed(() => !!this.recipe()?.photo && !this.photoBroken());

  protected onPhotoError(): void {
    this.photoBroken.set(true);
  }

  protected readonly units = this.prefs.units;

  protected setUnits(system: UnitSystem): void {
    this.prefs.setUnits(system);
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

}
