import { Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { AISLE_ORDER, Aisle } from '../../core/aisle';
import { Ingredient, Recipe } from '../../core/model/recipes.model';
import { parseIngredient } from '../../core/ingredient-parser';
import { parseJsonLd, parseRecipeText, slugify, splitFrontMatter } from '../../core/recipe-text';
import { formatQty } from '../../core/scale';
import { RecipeStore } from '../../core/stores/recipe.store';
import { describeWriteError } from '../../core/write-error';

type Tab = 'paste' | 'file' | 'url' | 'manual';

/** The badge above the preview, per §6.4. */
type Status = 'waiting' | 'check' | 'clean';

@Component({
  selector: 'app-create-recipe',
  imports: [RouterLink, MatIconModule],
  templateUrl: './create-recipe.component.html',
  styleUrl: './create-recipe.component.scss',
})
export class CreateRecipeComponent {
  protected readonly recipes = inject(RecipeStore);
  private readonly router = inject(Router);

  protected readonly aisles = AISLE_ORDER;
  protected readonly formatQty = formatQty;

  protected readonly tab = signal<Tab>('paste');
  protected readonly pasted = signal('');
  protected readonly urlText = signal('');
  protected readonly dropActive = signal(false);
  protected readonly notice = signal('');
  /** True from pressing Save until the API answers; the button and `save()` both honour it. */
  protected readonly saving = signal(false);

  /**
   * One editable draft behind all four tabs (§6.4). Each tab writes into it;
   * the preview and the manual editor read from it. Nothing saves until the
   * Save button is pressed.
   */
  protected readonly title = signal('');
  protected readonly subtitle = signal('');
  protected readonly servings = signal(4);
  protected readonly time = signal('');
  protected readonly blurb = signal('');
  protected readonly desc = signal('');
  protected readonly tagsText = signal('');
  protected readonly ingredients = signal<Ingredient[]>([]);
  protected readonly steps = signal<string[]>([]);
  protected readonly notes = signal<string[]>([]);
  protected readonly review = signal<readonly string[]>([]);
  private readonly parsedSomething = signal(false);

  protected readonly tags = computed(() =>
    this.tagsText()
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );

  protected readonly slug = computed(() => slugify(this.title()));

  protected readonly status = computed<Status>(() => {
    if (!this.title() && this.ingredients().length === 0 && this.steps().length === 0) {
      return 'waiting';
    }
    // A flagged line or a one-sided parse means a human should look.
    if (this.review().length > 0 || this.ingredients().length === 0 || this.steps().length === 0) {
      return 'check';
    }
    return this.parsedSomething() ? 'clean' : 'check';
  });

  protected readonly statusLabel = computed(
    () =>
      ({ waiting: 'Waiting', check: 'Check the split', clean: 'Parsed cleanly' })[this.status()],
  );

  protected readonly canSave = computed(
    () => this.title().trim().length > 0 && this.ingredients().length > 0,
  );

  protected readonly draft = computed<Recipe>(() => ({
    slug: this.slug(),
    title: this.title().trim(),
    ...(this.subtitle().trim() ? { subtitle: this.subtitle().trim() } : {}),
    tags: this.tags(),
    time: this.time().trim(),
    servings: this.servings(),
    cooked: 0,
    blurb: this.blurb().trim(),
    desc: this.desc().trim(),
    ingredients: this.ingredients(),
    steps: this.steps(),
    notes: this.notes(),
    // Unfiled until this screen offers a cookbook to file into.
    cookbooks: [],
  }));

  protected readonly draftJson = computed(() => JSON.stringify(this.draft(), null, 2));

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  // ---- Paste text tab -----------------------------------------------------

  protected onPaste(text: string): void {
    this.pasted.set(text);
    this.applyDraft(parseRecipeText(text));
  }

  // ---- Markdown file tab -------------------------------------------------

  protected async onFiles(files: FileList | null): Promise<void> {
    this.dropActive.set(false);
    if (!files || files.length === 0) return;

    const accepted = [...files].filter((f) => /\.(md|markdown|txt)$/i.test(f.name));
    if (accepted.length === 0) {
      this.notice.set('Only .md and .txt files are read.');
      return;
    }

    // A folder drop is a bulk import; the first file fills the draft and the
    // rest are saved straight through, since only one can be previewed.
    const [first, ...rest] = accepted;
    await this.loadFile(first);

    // Saving before the collection has loaded would fail, or clash with names
    // already there, so the rest wait for it and give up if it never comes.
    if (rest.length > 0) {
      await this.recipes.whenLoaded();
      if (this.recipes.status() !== 'ready') {
        this.notice.set("Couldn't load the recipe collection, so nothing was imported.");
        return;
      }
    }

    let saved = 0;
    let failed = 0;
    let firstError: unknown;
    for (const file of rest) {
      const text = await file.text();
      const { meta } = splitFrontMatter(text);
      const parsed = parseRecipeText(text);
      if (!parsed.title || parsed.ingredients.length === 0) continue;
      try {
        await this.recipes.add({
          slug: slugify(parsed.title),
          title: parsed.title,
          tags: meta.tags ?? [],
          time: '',
          servings: meta.servings ?? 4,
          cooked: 0,
          blurb: '',
          desc: '',
          ingredients: parsed.ingredients,
          steps: parsed.steps,
          notes: [],
          // Unfiled, matching RecipeTemplate: this screen does not ask which
          // cookbook to import into yet, and guessing would file a folder drop
          // into a cookbook the user never chose.
          cookbooks: [],
        });
        saved++;
      } catch (err) {
        // One bad file must not strand the rest of the folder.
        if (failed === 0) firstError = err;
        failed++;
      }
    }

    if (failed > 0) {
      this.notice.set(
        `Saved ${saved} of ${saved + failed}. The rest failed: ${describeWriteError(firstError)}`,
      );
      return;
    }
    this.notice.set(
      saved > 0
        ? `Loaded ${first.name}, and imported ${saved} more ${saved === 1 ? 'recipe' : 'recipes'}.`
        : `Loaded ${first.name}.`,
    );
  }

  private async loadFile(file: File): Promise<void> {
    const text = await file.text();
    const { meta } = splitFrontMatter(text);
    this.applyDraft(parseRecipeText(text));
    if (meta.servings) this.servings.set(meta.servings);
    if (meta.tags?.length) this.tagsText.set(meta.tags.join(', '));
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dropActive.set(true);
  }

  protected onDragLeave(): void {
    this.dropActive.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    void this.onFiles(event.dataTransfer?.files ?? null);
  }

  // ---- From a URL tab ----------------------------------------------------

  protected onUrlText(text: string): void {
    this.urlText.set(text);
    if (!text.trim()) {
      this.notice.set('');
      return;
    }

    const structured = parseJsonLd(text);
    if (structured) {
      this.applyDraft(structured);
      this.notice.set('Read schema.org Recipe data from the pasted markup.');
      return;
    }

    // Falling back to plain text parsing, per §6.4.
    this.applyDraft(parseRecipeText(text));
    this.notice.set('No recipe markup found, so this was read as plain text.');
  }

  // ---- Manual tab --------------------------------------------------------

  protected addIngredient(): void {
    this.ingredients.update((list) => [
      ...list,
      { qty: null, unit: '', name: '', aisle: 'pantry' as Aisle },
    ]);
  }

  protected updateIngredientName(index: number, raw: string): void {
    // Typing a whole line here should behave like the paste tab does.
    const parsed = parseIngredient(raw);
    this.ingredients.update((list) =>
      list.map((item, i) =>
        i === index
          ? {
              qty: parsed.qty,
              unit: parsed.unit,
              name: parsed.name || raw,
              // Keep a hand-picked aisle rather than re-inferring over it.
              aisle: item.name ? item.aisle : parsed.aisle,
            }
          : item,
      ),
    );
  }

  protected setAisle(index: number, aisle: string): void {
    this.ingredients.update((list) =>
      list.map((item, i) => (i === index ? { ...item, aisle: aisle as Aisle } : item)),
    );
  }

  protected removeIngredient(index: number): void {
    this.ingredients.update((list) => list.filter((_, i) => i !== index));
  }

  protected addStep(): void {
    this.steps.update((list) => [...list, '']);
  }

  protected updateStep(index: number, text: string): void {
    this.steps.update((list) => list.map((s, i) => (i === index ? text : s)));
  }

  protected removeStep(index: number): void {
    this.steps.update((list) => list.filter((_, i) => i !== index));
  }

  protected addNote(): void {
    this.notes.update((list) => [...list, '']);
  }

  protected updateNote(index: number, text: string): void {
    this.notes.update((list) => list.map((n, i) => (i === index ? text : n)));
  }

  protected removeNote(index: number): void {
    this.notes.update((list) => list.filter((_, i) => i !== index));
  }

  // ---- Confirm -----------------------------------------------------------

  protected async save(): Promise<void> {
    // The button is disabled too, but a second call can arrive before the
    // first re-renders, so the guard lives here as well.
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.notice.set('');
    const recipe = this.draft();
    try {
      const slug = await this.recipes.add({
        ...recipe,
        // Drop the blank rows the manual editor leaves behind.
        steps: recipe.steps.map((s) => s.trim()).filter(Boolean),
        notes: recipe.notes.map((n) => n.trim()).filter(Boolean),
        ingredients: recipe.ingredients.filter((i) => i.name.trim()),
      });
      void this.router.navigate(['/recipes', slug]);
    } catch (err) {
      // Stay here with the draft untouched so nothing typed is lost.
      this.notice.set(describeWriteError(err));
    } finally {
      this.saving.set(false);
    }
  }

  protected retry(): void {
    void this.recipes.load();
  }

  protected async copyJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.draftJson());
      this.notice.set('Copied the draft as JSON.');
    } catch {
      this.notice.set('Could not reach the clipboard — select the JSON and copy it.');
    }
  }

  protected amountLabel(ingredient: Ingredient): string {
    if (ingredient.qty === null) return '';
    const amount = formatQty(ingredient.qty);
    return ingredient.unit ? `${amount} ${ingredient.unit}` : amount;
  }

  /** Fills the shared draft from a parse, leaving hand-entered copy alone. */
  private applyDraft(parsed: ReturnType<typeof parseRecipeText>): void {
    this.title.set(parsed.title);
    this.ingredients.set(parsed.ingredients);
    this.steps.set(parsed.steps);
    this.review.set(parsed.review);
    this.parsedSomething.set(parsed.confidence === 'clean');
  }
}
