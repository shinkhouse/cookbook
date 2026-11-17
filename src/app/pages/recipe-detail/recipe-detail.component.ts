import { DOCUMENT, DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, computed, inject, input, signal } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { NoPhotoComponent } from '../../no-photo/no-photo.component';
import { environment } from '../../../environments/environment';
import { photoSrcset, photoUrl, resizable } from '../../core/photos';
import { StepPiece, mentionPieces } from '../../core/mentions';
import { methodNote } from '../../core/recipe-health';
import { scaleFactor, scaleLabel } from '../../core/scale';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { DeviceStore } from '../../core/stores/device.store';
import { ListStore } from '../../core/stores/list.store';
import { PrefsStore } from '../../core/stores/prefs.store';
import { RecipeStore, tagLabel } from '../../core/stores/recipe.store';
import { Recipe } from '../../core/model/recipes.model';
import { UnitSystem, amountText } from '../../core/units';
import { describeDeviceError, describeWriteError } from '../../core/write-error';

/** The list a phone shows at a time; a wider screen shows all three. */
type PhoneTab = 'ingredients' | 'steps' | 'notes';

/** A run of step text, with the amount to show when it names an ingredient. */
interface ShownPiece {
  text: string;
  amount?: string;
}

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
  imports: [
    RouterLink,
    FormsModule,
    MatIconModule,
    MatCheckboxModule,
    MatMenuModule,
    NgTemplateOutlet,
    DatePipe,
    NoPhotoComponent,
  ],
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

  protected readonly cookbooks = inject(CookbookStore);
  /**
   * The credit line. Book recipes carry it as their subtitle already; the
   * contributor stands in when a recipe has only that.
   */
  protected readonly credit = computed(() => {
    const r = this.recipe();
    return r?.subtitle || (r?.contributor ? `From ${r.contributor}` : '');
  });

  /**
   * The printed book a recipe came from and its page there. The import filed
   * it in its book first; a later filing is appended after, so the first
   * cookbook is the book. Null when the recipe has no page.
   */
  protected readonly printedBook = computed(() => {
    const r = this.recipe();
    if (!r?.sourcePage) return null;
    return { book: this.cookbooks.byId(r.cookbooks[0] ?? '') ?? null, page: r.sourcePage };
  });

  /** The cookbooks to name beside the credit: all of them, less the printed book given its own line. */
  protected readonly shelves = computed(() => {
    const r = this.recipe();
    if (!r) return [];
    const printed = this.printedBook()?.book?.id;
    return r.cookbooks
      .map((id) => this.cookbooks.byId(id))
      .filter((book): book is NonNullable<typeof book> => !!book && book.id !== printed);
  });

  /** Opens the library on one cookbook's shelf. */
  protected openShelf(id: string): void {
    this.recipes.selectedCookbooks.set(new Set([id]));
  }

  protected readonly isFav = computed(() => this.recipe()?.favorite === true);
  protected readonly favSaving = signal(false);
  protected readonly favError = signal('');

  protected readonly confirmingCooked = signal(false);
  protected readonly cookedSaving = signal(false);
  protected readonly cookedError = signal('');

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

  protected askCooked(): void {
    this.cookedError.set('');
    this.confirmingCooked.set(true);
  }

  protected cancelCooked(): void {
    this.confirmingCooked.set(false);
    this.cookedError.set('');
  }

  /** The star changes once the server answers; a failure says why. */
  protected async toggleFav(): Promise<void> {
    if (this.favSaving()) return;
    this.favSaving.set(true);
    this.favError.set('');
    try {
      if (!(await this.recipes.toggleFav(this.slug()))) {
        this.favError.set('That recipe no longer exists.');
      }
    } catch (err) {
      this.favError.set(describeDeviceError(err, this.device.lockoutMinutes()));
    } finally {
      this.favSaving.set(false);
    }
  }

  /** Confirms rather than undoes: the server has no decrement. */
  protected async markCooked(): Promise<void> {
    if (this.cookedSaving()) return;
    this.cookedSaving.set(true);
    this.cookedError.set('');
    try {
      if (await this.recipes.markCooked(this.slug())) this.confirmingCooked.set(false);
      else this.cookedError.set('That recipe no longer exists.');
    } catch (err) {
      this.cookedError.set(describeDeviceError(err, this.device.lockoutMinutes()));
      // A lost unlock must not leave the confirm armed for the next unlock.
      if ((err as { status?: unknown } | null)?.status === 403) this.confirmingCooked.set(false);
    } finally {
      this.cookedSaving.set(false);
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

  /** "Just one step for 8 ingredients.", for the note under a thin method. */
  protected readonly methodNote = computed(() => {
    const r = this.recipe();
    return r ? methodNote(r) : '';
  });

  /** On a phone, which list is showing. */
  protected readonly tab = signal<PhoneTab>('ingredients');
  /** On a phone, whether the description is shown in full. */
  protected readonly descOpen = signal(false);
  /** Whether the add-a-note field is open. */
  protected readonly noteOpen = signal(false);

  protected openNote(): void {
    this.noteOpen.set(true);
    this.tab.set('notes');
  }

  /** Where the photo's crop sits: its focus point, or the middle. */
  protected readonly photoFocus = computed(() => {
    const focus = this.recipe()?.photoFocus;
    return focus ? `${focus.x}% ${focus.y}%` : '50% 50%';
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
   * Each embedded recipe, listed under its own name below the parent's
   * ingredients, with any steps of its own before the parent's. Rows are
   * numbered on from the parent's, so one check set and one scale factor cover
   * the whole page. A component that no longer resolves is already left out by
   * the store.
   */
  protected readonly componentSections = computed(() => {
    const recipe = this.recipe();
    if (!recipe) return [];
    let offset = 0;
    return this.recipes.componentsOf(recipe.slug).map((part) => {
      const items = this.rows(part.recipe.ingredients, offset);
      offset += items.length;
      return {
        label: part.label,
        groups: groupRows(items),
        steps: part.recipe.steps.map((step) => this.pieces(step, items)),
      };
    });
  });

  /**
   * The recipe's own steps, each split where it names an ingredient. Its steps
   * often use what its parts list ("add the chicken" from the soup base), so
   * every list on the page counts.
   */
  protected readonly steps = computed(() => {
    const recipe = this.recipe();
    if (!recipe) return [];
    const items = [...this.ingredients(), ...this.componentSections().flatMap((part) => part.groups.flatMap((g) => g.items))];
    return recipe.steps.map((step) => this.pieces(step, items));
  });

  /** True when some step names an ingredient, so the hint under the steps has something to explain. */
  protected readonly hasMentions = computed(() =>
    [this.steps(), ...this.componentSections().map((part) => part.steps)].some((steps) =>
      steps.some((pieces) => pieces.some((p) => p.amount)),
    ),
  );

  /**
   * A step as text runs. A run naming an ingredient carries what the list says
   * of it, scaled and in the chosen units: "1 can tomato juice". One with no
   * amount ("salt, to taste") is left plain, as there is nothing to add.
   */
  private pieces(step: string, items: readonly DetailIngredient[]): ShownPiece[] {
    return mentionPieces(step, items.map((i) => i.name)).map((piece: StepPiece): ShownPiece => {
      const item = piece.ingredient === undefined ? undefined : items[piece.ingredient];
      return item?.amount ? { text: piece.text, amount: `${item.amount} ${item.name}` } : { text: piece.text };
    });
  }

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

  protected clearChecks(): void {
    this.checked.set(new Set());
  }

  /** Some stored photo URLs are hotlink blocked; fall back to the placeholder. */
  private readonly photoBroken = signal(false);

  /** The resized photo failed, so the original URL gets a try. */
  private readonly photoUnresized = signal(false);

  protected readonly showPhoto = computed(() => !!this.recipe()?.photo && !this.photoBroken());

  private readonly resized = computed(
    () => resizable(this.recipe()?.photo) && !this.photoUnresized(),
  );

  /** The hero runs the full width, so it asks for the larger sizes. */
  protected readonly heroPhoto = computed(() => {
    const photo = this.recipe()?.photo ?? '';
    return this.resized() ? photoUrl(photo, 1200) : photo;
  });

  protected readonly heroSrcset = computed(() =>
    this.resized() ? photoSrcset(this.recipe()!.photo!, [800, 1200]) : null,
  );

  protected onPhotoError(): void {
    (this.resized() ? this.photoUnresized : this.photoBroken).set(true);
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
