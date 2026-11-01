import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';
import { AISLE_ORDER, Aisle } from '../../core/aisle';
import { Ingredient, Recipe } from '../../core/model/recipes.model';
import { ImportClient, ImportPreview } from '../../core/import-client';
import { parseIngredient } from '../../core/ingredient-parser';
import { parseJsonLd, parseRecipeText, slugify, splitFrontMatter } from '../../core/recipe-text';
import { formatQty } from '../../core/scale';
import { RecipeStore } from '../../core/stores/recipe.store';
import { describeWriteError } from '../../core/write-error';

type Tab = 'paste' | 'file' | 'url' | 'manual';

/** The badge above the preview, per §6.4. */
type Status = 'waiting' | 'check' | 'clean';

/**
 * A sub-recipe being edited inside its parent ("For the sauce"). It is saved as
 * its own recipe with `component: true` and listed on the parent.
 */
interface SectionDraft {
  /**
   * The slug it is stored under: set when loaded for editing, and set as soon
   * as a new section is created, so a retry after a failed save updates it
   * rather than creating it a second time. Null until then.
   */
  slug: string | null;
  /**
   * What the parent calls this part: the reference's label. For a new section
   * it also becomes the component's own title; an existing component's title is
   * never rewritten from here, since another recipe may embed it too.
   */
  title: string;
  ingredients: Ingredient[];
  steps: string[];
  /** The stored component's own title; null for a section not yet loaded from one. */
  ownTitle: string | null;
  /** Whether the stored reference carried a label, so an unchanged save keeps it as it was. */
  hadLabel: boolean;
}

/** A draft field a paste, file or import writes. */
type FillField =
  | 'title'
  | 'desc'
  | 'servings'
  | 'time'
  | 'tagsText'
  | 'photo'
  | 'sourceUrl'
  | 'ingredients'
  | 'steps'
  | 'sections';

/** Which list an editor row belongs to: the recipe itself, or section n. */
type Owner = number | undefined;

@Component({
  selector: 'app-create-recipe',
  imports: [RouterLink, MatIconModule, NgTemplateOutlet],
  templateUrl: './create-recipe.component.html',
  styleUrl: './create-recipe.component.scss',
})
export class CreateRecipeComponent {
  /** Bound from the route on `recipes/:slug/edit`; absent when adding. */
  readonly slug_ = input<string | undefined>(undefined, { alias: 'slug' });

  protected readonly recipes = inject(RecipeStore);
  private readonly router = inject(Router);
  private readonly importer = inject(ImportClient);

  protected readonly aisles = AISLE_ORDER;
  protected readonly formatQty = formatQty;

  protected readonly tab = signal<Tab>('paste');
  protected readonly pasted = signal('');
  protected readonly urlText = signal('');
  protected readonly importUrl = signal('');
  /** True from pressing Import until the API answers. */
  protected readonly importing = signal(false);
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
  protected readonly sections = signal<SectionDraft[]>([]);
  /** No form field: set by an import or carried from the recipe being edited. */
  private readonly photo = signal('');
  private readonly sourceUrl = signal('');
  /**
   * References on the stored recipe whose component no longer resolves. They
   * have no section to edit, but saving must not quietly drop them.
   */
  private readonly unresolved = signal<{ slug: string; label?: string }[]>([]);
  protected readonly review = signal<readonly string[]>([]);
  private readonly parsedSomething = signal(false);

  protected readonly tags = computed(() =>
    this.tagsText()
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );

  /** The stored recipe being edited; null when adding, or until it has loaded. */
  private readonly original = signal<Recipe | null>(null);
  protected readonly editing = computed(() => this.slug_() !== undefined);
  /** An edit whose slug matched nothing once the collection loaded. */
  protected readonly missing = signal(false);

  /** Editing never renames: the slug is the stored one, whatever the title says. */
  protected readonly slug = computed(() => this.slug_() ?? slugify(this.title()));

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
    () =>
      this.title().trim().length > 0 &&
      this.ingredients().length > 0 &&
      this.sections().every((s) => s.title.trim().length > 0),
  );

  protected readonly draft = computed<Recipe>(() => {
    const draft: Recipe = {
      // Edit mode keeps what the form has no field for: cooked, archived,
      // components, cookbooks. Components are rebuilt from the sections on save.
      ...this.original(),
      slug: this.slug(),
      title: this.title().trim(),
      ...(this.subtitle().trim() ? { subtitle: this.subtitle().trim() } : {}),
      tags: this.tags(),
      time: this.time().trim(),
      servings: this.servings(),
      cooked: this.original()?.cooked ?? 0,
      blurb: this.blurb().trim(),
      desc: this.desc().trim(),
      ingredients: this.ingredients(),
      steps: this.steps(),
      notes: this.notes(),
      ...(this.photo() ? { photo: this.photo() } : {}),
      ...(this.sourceUrl() ? { sourceUrl: this.sourceUrl() } : {}),
      // Unfiled until this screen offers a cookbook to file into.
      cookbooks: this.original()?.cookbooks ?? [],
    };
    // The spread above would otherwise keep a stored value the form cleared.
    if (!this.subtitle().trim()) delete draft.subtitle;
    if (!this.photo()) delete draft.photo;
    if (!this.sourceUrl()) delete draft.sourceUrl;
    return draft;
  });

  protected readonly draftJson = computed(() => JSON.stringify(this.draft(), null, 2));

  constructor() {
    effect(() => {
      const slug = this.slug_();
      if (slug === undefined) return;
      untracked(() => void this.loadForEdit(slug));
    });
  }

  private async loadForEdit(slug: string): Promise<void> {
    this.missing.set(false);
    await this.recipes.whenLoaded();
    if (this.slug_() !== slug) return;
    const recipe = this.recipes.bySlug(slug);
    if (!recipe) {
      this.missing.set(true);
      return;
    }
    this.original.set(recipe);
    this.title.set(recipe.title);
    this.subtitle.set(recipe.subtitle ?? '');
    this.servings.set(recipe.servings);
    this.time.set(recipe.time);
    this.blurb.set(recipe.blurb);
    this.desc.set(recipe.desc);
    this.tagsText.set(recipe.tags.join(', '));
    this.ingredients.set(recipe.ingredients.map((i) => ({ ...i })));
    this.steps.set([...recipe.steps]);
    this.notes.set([...recipe.notes]);
    this.photo.set(recipe.photo ?? '');
    this.sourceUrl.set(recipe.sourceUrl ?? '');
    const sections: SectionDraft[] = [];
    const unresolved: { slug: string; label?: string }[] = [];
    for (const ref of recipe.components ?? []) {
      const part = this.recipes.bySlug(ref.slug);
      if (!part) {
        unresolved.push({ ...ref });
        continue;
      }
      sections.push({
        slug: part.slug,
        title: ref.label || part.title,
        ingredients: part.ingredients.map((i) => ({ ...i })),
        steps: [...part.steps],
        ownTitle: part.title,
        hadLabel: ref.label !== undefined,
      });
    }
    this.sections.set(sections);
    this.unresolved.set(unresolved);
    this.tab.set('manual');
  }

  /**
   * The draft fields a paste, file or import can write, each with the value it
   * goes back to when cleared.
   */
  private readonly fillable = {
    title: [this.title, ''],
    desc: [this.desc, ''],
    servings: [this.servings, 4],
    time: [this.time, ''],
    tagsText: [this.tagsText, ''],
    photo: [this.photo, ''],
    sourceUrl: [this.sourceUrl, ''],
    ingredients: [this.ingredients, []],
    steps: [this.steps, []],
    sections: [this.sections, []],
  } as const;

  /** What the last fill wrote, field by field, so the next one knows what is its to clear. */
  private lastFill = new Map<FillField, unknown>();

  /**
   * Writes a fill into the draft. A field the previous fill wrote, that this
   * one does not, and that still holds exactly what was written, is cleared, so
   * an import's source, photo or sections never ride along onto a different
   * recipe. A field the user typed, or edited since the fill, is never touched;
   * arrays are replaced on every edit, so identity tells the two apart.
   */
  private fill(values: Partial<Record<FillField, unknown>>): void {
    for (const [field, written] of this.lastFill) {
      if (field in values) continue;
      const [target, blank] = this.fillable[field] as unknown as [WritableSignal<unknown>, unknown];
      if (target() === written) target.set(blank);
    }
    for (const [field, value] of Object.entries(values) as [FillField, unknown][]) {
      (this.fillable[field][0] as unknown as WritableSignal<unknown>).set(value);
    }
    this.lastFill = new Map(Object.entries(values) as [FillField, unknown][]);
  }

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
    this.applyDraft(parseRecipeText(text), {
      ...(meta.servings ? { servings: meta.servings } : {}),
      ...(meta.tags?.length ? { tagsText: meta.tags.join(', ') } : {}),
    });
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

  /**
   * Fills the form from the API's reading of a page. Saves nothing: the result
   * is a draft like any other, and only Save writes.
   */
  protected async importFromUrl(): Promise<void> {
    const url = this.importUrl().trim();
    if (!url || this.importing()) return;
    this.importing.set(true);
    this.notice.set('');
    try {
      const preview = await this.importer.previewRecipe(url);
      this.applyPreview(preview);
      this.notice.set('Imported. Check it over, fill in the sections\' steps, then Save.');
      this.tab.set('manual');
    } catch (err) {
      this.notice.set(describeWriteError(err));
    } finally {
      this.importing.set(false);
    }
  }

  private applyPreview(preview: ImportPreview): void {
    const parse = (lines: readonly string[]) =>
      lines.map((line) => ({ line, result: parseIngredient(line) }));
    const toIngredients = (parsed: ReturnType<typeof parse>): Ingredient[] =>
      parsed.map(({ line, result }) => ({
        qty: result.qty,
        unit: result.unit,
        name: result.name || line,
        aisle: result.aisle,
      }));

    const groups = preview.ingredientGroups ?? [];
    const own = parse(groups.filter((g) => !g.name).flatMap((g) => g.lines));
    const named = groups
      .filter((g): g is { name: string; lines: string[] } => !!g.name)
      .map((g) => ({ name: g.name, parsed: parse(g.lines) }));

    // Only what the page supplied is written, so an empty description never
    // wipes one typed by hand.
    const tags = (preview.tags ?? []).map((t) => t.toLowerCase()).join(', ');
    const sections: SectionDraft[] = named.map((g) => ({
      slug: null,
      title: g.name,
      ingredients: toIngredients(g.parsed),
      steps: [],
      ownTitle: null,
      hadLabel: true,
    }));
    this.fill({
      title: preview.title ?? '',
      ingredients: toIngredients(own),
      steps: [...(preview.steps ?? [])],
      ...(preview.description ? { desc: preview.description } : {}),
      ...(typeof preview.servings === 'number' && preview.servings > 0
        ? { servings: Math.round(preview.servings) }
        : {}),
      ...(preview.time ? { time: preview.time } : {}),
      ...(tags ? { tagsText: tags } : {}),
      ...(preview.image ? { photo: preview.image } : {}),
      ...(preview.sourceUrl ? { sourceUrl: preview.sourceUrl } : {}),
      ...(sections.length > 0 ? { sections } : {}),
    });
    this.review.set(
      [own, ...named.map((g) => g.parsed)]
        .flat()
        .filter(({ result }) => result.needsReview)
        .map(({ line }) => line),
    );
    this.parsedSomething.set(true);
  }

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

  /** Edits the ingredient list of the recipe itself, or of section `owner`. */
  private editIngredients(owner: Owner, change: (list: Ingredient[]) => Ingredient[]): void {
    if (owner === undefined) {
      this.ingredients.update(change);
      return;
    }
    this.editSection(owner, (s) => ({ ...s, ingredients: change(s.ingredients) }));
  }

  private editSteps(owner: Owner, change: (list: string[]) => string[]): void {
    if (owner === undefined) {
      this.steps.update(change);
      return;
    }
    this.editSection(owner, (s) => ({ ...s, steps: change(s.steps) }));
  }

  private editSection(index: number, change: (s: SectionDraft) => SectionDraft): void {
    this.sections.update((list) => list.map((s, i) => (i === index ? change(s) : s)));
  }

  protected addIngredient(owner?: Owner): void {
    this.editIngredients(owner, (list) => [
      ...list,
      { qty: null, unit: '', name: '', aisle: 'pantry' as Aisle },
    ]);
  }

  protected updateIngredientName(index: number, raw: string, owner?: Owner): void {
    // Typing a whole line here should behave like the paste tab does.
    const parsed = parseIngredient(raw);
    this.editIngredients(owner, (list) =>
      list.map((item, i) =>
        i === index
          ? {
              qty: parsed.qty,
              unit: parsed.unit,
              name: parsed.name || raw,
              // Keep a hand-picked aisle rather than re-inferring over it.
              aisle: item.name ? item.aisle : parsed.aisle,
              ...(item.group ? { group: item.group } : {}),
            }
          : item,
      ),
    );
  }

  protected setAisle(index: number, aisle: string, owner?: Owner): void {
    this.editIngredients(owner, (list) =>
      list.map((item, i) => (i === index ? { ...item, aisle: aisle as Aisle } : item)),
    );
  }

  protected removeIngredient(index: number, owner?: Owner): void {
    this.editIngredients(owner, (list) => list.filter((_, i) => i !== index));
  }

  protected addStep(owner?: Owner): void {
    this.editSteps(owner, (list) => [...list, '']);
  }

  protected updateStep(index: number, text: string, owner?: Owner): void {
    this.editSteps(owner, (list) => list.map((s, i) => (i === index ? text : s)));
  }

  protected removeStep(index: number, owner?: Owner): void {
    this.editSteps(owner, (list) => list.filter((_, i) => i !== index));
  }

  protected addSection(): void {
    this.sections.update((list) => [
      ...list,
      { slug: null, title: '', ingredients: [], steps: [], ownTitle: null, hadLabel: true },
    ]);
  }

  protected setSectionTitle(index: number, title: string): void {
    this.editSection(index, (s) => ({ ...s, title }));
  }

  /**
   * Takes the section off this recipe. A section already saved stays stored as
   * a hidden component; it just stops being listed here.
   */
  protected removeSection(index: number): void {
    this.sections.update((list) => list.filter((_, i) => i !== index));
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
    if (this.editing() && !this.original()) return;
    this.saving.set(true);
    this.notice.set('');
    const recipe = this.draft();
    const cleaned: Recipe = {
      ...recipe,
      // Drop the blank rows the manual editor leaves behind.
      steps: recipe.steps.map((s) => s.trim()).filter(Boolean),
      notes: recipe.notes.map((n) => n.trim()).filter(Boolean),
      ingredients: recipe.ingredients.filter((i) => i.name.trim()),
    };
    try {
      // Sections first, so the parent never lists a component that is not stored.
      const refs = await this.saveSections(cleaned);
      if (!refs) return;
      if (refs.length > 0) cleaned.components = refs;
      else delete cleaned.components;

      if (this.editing()) {
        if (!(await this.recipes.update(cleaned))) {
          this.notice.set('That recipe no longer exists, so nothing was saved.');
          return;
        }
        void this.router.navigate(['/recipes', cleaned.slug]);
        return;
      }
      const slug = await this.recipes.add(cleaned);
      void this.router.navigate(['/recipes', slug]);
    } catch (err) {
      // Stay here with the draft untouched so nothing typed is lost.
      this.notice.set(describeWriteError(err));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Creates or updates each section as a component recipe, in order, and
   * returns the references for the parent. Stops at the first failure by
   * throwing, before the parent is written; sections saved before it stay
   * stored, and their slugs are kept on the draft so the retry updates them.
   * Returns null, having said why, when a section has vanished from the server.
   */
  private async saveSections(parent: Recipe): Promise<{ slug: string; label?: string }[] | null> {
    const refs: { slug: string; label?: string }[] = [];
    const sections = this.sections();
    for (let index = 0; index < sections.length; index++) {
      const section = sections[index];
      const title = section.title.trim();
      const body = {
        ingredients: section.ingredients.filter((i) => i.name.trim()),
        steps: section.steps.map((s) => s.trim()).filter(Boolean),
      };
      if (section.slug !== null) {
        // The component keeps its own title; the section title is only the label.
        const stored = this.recipes.bySlug(section.slug);
        const ok =
          stored !== undefined && (await this.recipes.update({ ...stored, ...body }));
        if (!ok) {
          this.notice.set(`The section “${title}” no longer exists, so nothing more was saved.`);
          return null;
        }
        // An unlabelled reference stays unlabelled until the label is changed.
        const unlabelled = !section.hadLabel && title === section.ownTitle;
        refs.push(unlabelled ? { slug: section.slug } : { slug: section.slug, label: title });
        continue;
      }
      const slug = await this.recipes.add({
        slug: `${parent.slug}-${slugify(title) || 'section'}`,
        title,
        ...body,
        tags: [],
        time: '',
        servings: parent.servings,
        cooked: 0,
        blurb: '',
        desc: '',
        notes: [],
        cookbooks: [],
        component: true,
      });
      // Remembered at once: if a later section or the parent fails, the retry
      // must update this one rather than create it again.
      this.editSection(index, (s) => ({ ...s, slug }));
      refs.push({ slug, label: title });
    }
    // A dangling reference's slug is free, so a new section may have taken it;
    // listing it twice would make the API refuse the parent on every retry.
    const seen = new Set<string>();
    return [...refs, ...this.unresolved()].filter((ref) => {
      if (seen.has(ref.slug)) return false;
      seen.add(ref.slug);
      return true;
    });
  }

  protected retry(): void {
    void this.recipes.load().then(() => {
      const slug = this.slug_();
      if (slug !== undefined && !this.original()) void this.loadForEdit(slug);
    });
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

  /**
   * Fills the shared draft from a parse, leaving hand-entered copy alone. What
   * an earlier fill wrote and this one does not is cleared; see `fill`.
   */
  private applyDraft(
    parsed: ReturnType<typeof parseRecipeText>,
    extra: Partial<Record<FillField, unknown>> = {},
  ): void {
    this.fill({
      title: parsed.title,
      ingredients: parsed.ingredients,
      steps: parsed.steps,
      ...extra,
    });
    this.review.set(parsed.review);
    this.parsedSomething.set(parsed.confidence === 'clean');
  }
}
