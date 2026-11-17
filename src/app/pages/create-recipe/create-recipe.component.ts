import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  Component,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { Router, RouterLink } from '@angular/router';
import { AISLE_LABELS, AISLE_ORDER, Aisle, inferAisle } from '../../core/aisle';
import { vocabularyTags } from '../../core/facets';
import { Ingredient, Recipe } from '../../core/model/recipes.model';
import { ImportClient, ImportPreview, photoProblem } from '../../core/import-client';
import { parseIngredient } from '../../core/ingredient-parser';
import { IngredientCheck, StepCheck, amountText, checkIngredients, checkNotes, checkSteps, joinRows } from '../../core/recipe-checks';
import { methodGap } from '../../core/recipe-health';
import { parseJsonLd, parseRecipeText, slugify, splitFrontMatter } from '../../core/recipe-text';
import { formatQty } from '../../core/scale';
import { Storage } from '../../core/storage';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { RecipeStore, tagLabel } from '../../core/stores/recipe.store';
import { describePhotoError, describeWriteError } from '../../core/write-error';
import { NoPhotoComponent } from '../../no-photo/no-photo.component';

/** Where the form can be filled from, above the fields. */
type Tab = 'paste' | 'file' | 'url' | 'photo';

/** What last filled the form; the import panel says so. */
type FilledFrom = Tab | 'html';

/**
 * The bookmarklet: opens the local app's create page with the current page's
 * address as `?url=`. Local only, so it points at the dev server.
 */
export const BOOKMARKLET_HREF =
  "javascript:location.href='http://localhost:4200/cookbook/recipes/new?url='+encodeURIComponent(location.href)";

/** The cookbooks the last new recipe was filed in, so the next one goes there too. */
const FILE_IN_KEY = 'cookbook.fileIn';

/** What a few sites are called, for the credit a pasted link fills in. */
const SITE_NAMES: Record<string, string> = {
  'cooking.nytimes.com': 'NYT Cooking',
  'themodernproper.com': 'The Modern Proper',
  'allrecipes.com': 'Allrecipes',
  'seriouseats.com': 'Serious Eats',
  'bonappetit.com': 'Bon Appétit',
  'food52.com': 'Food52',
  'smittenkitchen.com': 'Smitten Kitchen',
  'budgetbytes.com': 'Budget Bytes',
  'foodnetwork.com': 'Food Network',
  'epicurious.com': 'Epicurious',
};

/** "NYT Cooking" for a known site, else its address: "sipandsanity.com". */
export function siteName(url: string): string {
  const host = new URL(url).host.replace(/^www\./, '').toLowerCase();
  return SITE_NAMES[host] ?? host;
}

/** Ingredient group names that only say "the ingredients", which need no heading. */
const PLAIN_GROUPS = /^(ingredients?|main|for the (recipe|dish))$/i;

/**
 * A page address reduced to what identifies the page: no scheme, `www.`,
 * query, fragment or trailing slash. NYT links differ only in their `?smid=`.
 */
function pageKey(url: string | undefined): string {
  if (!url) return '';
  try {
    const { host, pathname } = new URL(url);
    return `${host.replace(/^www\./, '')}${pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return '';
  }
}

/** True for an address the API will store: http or https, and parseable. */
function isWebAddress(text: string): boolean {
  if (!/^https?:\/\//i.test(text)) return false;
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads what is typed in an Amount box: "2 tbsp", "1 large", "pinch", or
 * nothing at all, which is "to taste". A unit the parser does not know is kept
 * as typed rather than dropped.
 */
export function parseAmount(text: string): { qty: number | null; unit: string } {
  const typed = text.trim();
  if (!typed || /^to taste$/i.test(typed)) return { qty: null, unit: '' };
  const parsed = parseIngredient(`${typed} x`);
  if (parsed.name === 'x') return { qty: parsed.qty, unit: parsed.unit };
  if (parsed.qty === null) return { qty: null, unit: typed };
  const words = /^[\d\s/.½¼¾⅓⅔⅛⅜⅝⅞–-]+(.*)$/.exec(typed);
  return { qty: parsed.qty, unit: (words?.[1] ?? '').trim() };
}

/** "13 ingredients", "1 step". */
const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** "a, b and c". */
function listed(items: readonly string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

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
  | 'subtitle'
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

/** A check on a row, with what the checklist needs to find the row again. */
export interface RowCheck extends IngredientCheck {
  /** Stable across reorders: the owner, the kind and the row's text. */
  id: string;
  owner: Owner;
  index: number;
}

/** A check on a step, placed the same way. */
export interface StepRowCheck extends StepCheck {
  id: string;
  owner: Owner;
  index: number;
}

/** One line of the checklist beside the form. */
interface ChecklistItem {
  id: string;
  text: string;
  /** The element to bring into view, and the part tab it is on. */
  target: string;
  owner: Owner;
  /** A fix short enough to offer in the list itself: "Split". */
  action?: { label: string; run: () => void };
}

/** The API refuses a recipe with more embedded components than this. */
const MAX_SECTIONS = 20;

@Component({
  selector: 'app-create-recipe',
  imports: [RouterLink, MatIconModule, MatMenuModule, NgTemplateOutlet, DatePipe, NoPhotoComponent],
  templateUrl: './create-recipe.component.html',
  styleUrl: './create-recipe.component.scss',
  host: {
    '(document:click)': 'closePicker($event)',
    '(document:keydown.escape)': 'cookbooksOpen.set(false)',
  },
})
export class CreateRecipeComponent {
  /** Bound from the route on `recipes/:slug/edit`; absent when adding. */
  readonly slug_ = input<string | undefined>(undefined, { alias: 'slug' });

  /** An address to import on arrival, from the bookmarklet's `?url=`. */
  readonly url = input<string | undefined>(undefined);

  protected readonly recipes = inject(RecipeStore);
  protected readonly cookbooks = inject(CookbookStore);
  private readonly storage = inject(Storage);
  private readonly router = inject(Router);
  /** Angular strips `javascript:` hrefs as unsafe; this one is a constant of ours. */
  protected readonly bookmarklet = inject(DomSanitizer).bypassSecurityTrustUrl(BOOKMARKLET_HREF);
  private handledUrl: string | undefined;
  private readonly importer = inject(ImportClient);

  protected readonly aisles = AISLE_ORDER;
  protected readonly aisleLabels = AISLE_LABELS;
  protected readonly tagLabel = tagLabel;
  protected readonly sources: readonly { id: Tab; label: string; icon: string }[] = [
    { id: 'paste', label: 'Pasted text', icon: 'notes' },
    { id: 'file', label: 'A file', icon: 'description' },
    { id: 'url', label: 'A link', icon: 'link' },
    { id: 'photo', label: 'A photo', icon: 'photo_camera' },
  ];

  /** Links are what most recipes arrive as, so the panel opens on one. */
  protected readonly tab = signal<Tab>('url');
  protected readonly pasted = signal('');
  protected readonly urlText = signal('');
  protected readonly importUrl = signal('');
  /** The address the last import read, so its button offers to read it again. */
  protected readonly importedUrl = signal('');
  /** Whether the "paste its HTML" box is open under a link that will not load. */
  protected readonly htmlOpen = signal(false);
  /** True from pressing Import until the API answers. */
  protected readonly importing = signal(false);
  protected readonly dropActive = signal(false);
  /** What the import panel says: an import's trouble, or a folder's result. */
  protected readonly notice = signal('');
  /** What the save box says: a failed save, or the JSON copied. */
  protected readonly saveMessage = signal('');
  /** True from pressing Save until the API answers; the button and `save()` both honour it. */
  protected readonly saving = signal(false);
  protected readonly filledFrom = signal<FilledFrom | null>(null);
  /** The credit line an import wrote, so the form can say where it came from. */
  protected readonly filledCredit = signal('');

  /**
   * One editable draft behind the import panel and the fields (§6.4). Each
   * import writes into it; the fields edit it. Nothing saves until Save.
   */
  protected readonly title = signal('');
  protected readonly subtitle = signal('');
  protected readonly servings = signal(4);
  /** What the yield counts when not servings: "loaves". '' is servings. */
  protected readonly servingsUnit = signal('');
  protected readonly time = signal('');
  protected readonly blurb = signal('');
  protected readonly desc = signal('');
  protected readonly tagsText = signal('');
  protected readonly ingredients = signal<Ingredient[]>([]);
  protected readonly steps = signal<string[]>([]);
  protected readonly notes = signal<string[]>([]);
  protected readonly sections = signal<SectionDraft[]>([]);
  protected readonly photo = signal('');
  /** The point of the photo a crop keeps; null is the middle. */
  protected readonly photoFocus = signal<{ x: number; y: number } | null>(null);
  protected readonly sourceUrl = signal('');
  /** The page of the printed cookbook, for a recipe from one. */
  protected readonly sourcePage = signal<number | null>(null);
  /**
   * References on the stored recipe whose component no longer resolves. They
   * have no section to edit, but saving must not quietly drop them.
   */
  private readonly unresolved = signal<{ slug: string; label?: string }[]>([]);

  protected readonly tags = computed(() =>
    this.tagsText()
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
  );

  /** The stored recipe being edited; null when adding, or until it has loaded. */
  protected readonly original = signal<Recipe | null>(null);
  protected readonly editing = computed(() => this.slug_() !== undefined);
  /** An edit whose slug matched nothing once the collection loaded. */
  protected readonly missing = signal(false);

  /** Editing never renames: the slug is the stored one, whatever the title says. */
  protected readonly slug = computed(() => this.slug_() ?? slugify(this.title()));

  /** The part whose ingredients and steps are showing; undefined is the recipe itself. */
  protected readonly part = signal<Owner>(undefined);

  protected readonly sourceValid = computed(() => !this.sourceUrl() || isWebAddress(this.sourceUrl()));

  protected readonly canSave = computed(
    () =>
      this.title().trim().length > 0 &&
      (this.ingredients().length > 0 ||
        this.sections().some((x) => x.ingredients.length > 0)) &&
      this.sections().every((s) => s.title.trim().length > 0) &&
      this.sourceValid(),
  );

  /**
   * The cookbooks the recipe is filed in. Editing starts from where it is
   * filed; a new recipe from the shelf open in the library, or else where the
   * last new recipe went. Recomputed when the cookbooks load, since until then
   * no id can be checked.
   */
  protected readonly cookbookIds = linkedSignal<string[]>(() => {
    const ids = new Set(this.cookbooks.cookbooks().map((c) => c.id));
    const original = this.original();
    if (original) return [...original.cookbooks];
    const shelf = [...untracked(this.recipes.selectedCookbooks)];
    if (shelf.length === 1 && ids.has(shelf[0])) return [shelf[0]];
    const last = untracked(() => this.storage.read<unknown>(FILE_IN_KEY, []));
    // Stored as one id before a recipe could be filed in several.
    return (Array.isArray(last) ? last : [last]).filter((id): id is string => typeof id === 'string' && ids.has(id));
  });
  protected readonly cookbooksOpen = signal(false);

  /** "Crowded Closet Cookbook", or "Sam's Cookbook, Stokes Recipes", for the picker's button. */
  protected readonly cookbookSummary = computed(() => {
    const names = this.cookbookIds().map((id) => this.cookbooks.byId(id)?.name ?? id);
    return names.length ? names.join(', ') : 'Not in a cookbook';
  });

  /**
   * A recipe already in the collection that this new one repeats: one from
   * the same page, or else one with the same title. Saving is still allowed,
   * since two recipes can share a name.
   */
  protected readonly duplicate = computed(() => {
    if (this.editing()) return null;
    const all = this.recipes.recipes();
    const page = pageKey(this.sourceUrl());
    const bySource = page ? all.find((r) => pageKey(r.sourceUrl) === page) : undefined;
    if (bySource) return { recipe: bySource, samePage: true };
    const title = this.title().trim().toLowerCase();
    const byTitle = title ? all.find((r) => r.title.trim().toLowerCase() === title) : undefined;
    return byTitle ? { recipe: byTitle, samePage: false } : null;
  });

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
      ...(this.photo() && this.photoFocus() ? { photoFocus: this.photoFocus()! } : {}),
      ...(this.sourceUrl() ? { sourceUrl: this.sourceUrl() } : {}),
      ...(this.sourcePage() ? { sourcePage: this.sourcePage()! } : {}),
      ...(this.unitWord() ? { servingsUnit: this.unitWord() } : {}),
      cookbooks: this.cookbookIds(),
    };
    // The spread above would otherwise keep a stored value the form cleared.
    if (!this.subtitle().trim()) delete draft.subtitle;
    if (!this.photo()) delete draft.photo;
    if (!this.photo() || !this.photoFocus()) delete draft.photoFocus;
    if (!this.sourceUrl()) delete draft.sourceUrl;
    if (!this.sourcePage()) delete draft.sourcePage;
    if (!this.unitWord()) delete draft.servingsUnit;
    return draft;
  });

  protected readonly draftJson = computed(() => JSON.stringify(this.draft(), null, 2));

  /** The yield unit worth storing: "servings" is what no unit means already. */
  private readonly unitWord = computed(() => {
    const unit = this.servingsUnit().trim();
    return /^servings?$/i.test(unit) ? '' : unit;
  });

  /** Everything a save would write, to tell an edited form from the one loaded. */
  private readonly snapshot = computed(() => JSON.stringify([this.draft(), this.sections()]));
  private readonly baseline = signal<string | null>(null);
  protected readonly dirty = computed(() => this.baseline() !== null && this.snapshot() !== this.baseline());

  // ---- Checks -------------------------------------------------------------

  /** Checks the user has answered with Keep, by id, for as long as the form is open. */
  private readonly kept = signal<ReadonlySet<string>>(new Set());

  /** Every row check still standing, the recipe's own rows first, then each part's. */
  protected readonly rowChecks = computed<RowCheck[]>(() => {
    const kept = this.kept();
    const lists: [Owner, Ingredient[]][] = [
      [undefined, this.ingredients()],
      ...this.sections().map((s, n): [Owner, Ingredient[]] => [n, s.ingredients]),
    ];
    return lists.flatMap(([owner, list]) =>
      checkIngredients(list).flatMap((check, index): RowCheck[] => {
        if (!check) return [];
        const id = `${owner ?? 'main'}|${check.kind}|${list[index].name}`;
        return kept.has(id) ? [] : [{ ...check, owner, index, id }];
      }),
    );
  });

  /** Row checks by row, for the bands under each row. */
  protected readonly checksByRow = computed(() => {
    const byRow = new Map<string, RowCheck[]>();
    for (const check of this.rowChecks()) {
      const key = this.rowId(check.owner, check.index);
      byRow.set(key, [...(byRow.get(key) ?? []), check]);
    }
    return byRow;
  });

  /** Every step check still standing, keyed like the rows. */
  protected readonly stepChecks = computed<StepRowCheck[]>(() => {
    const kept = this.kept();
    const everything = [...this.ingredients(), ...this.sections().flatMap((s) => s.ingredients)];
    const lists: [Owner, string[]][] = [
      [undefined, this.steps()],
      ...this.sections().map((s, n): [Owner, string[]] => [n, s.steps]),
    ];
    return lists.flatMap(([owner, steps]) =>
      checkSteps(steps, everything).flatMap((check, index): StepRowCheck[] => {
        if (!check) return [];
        const id = `${owner ?? 'main'}|${check.kind}|${steps[index]}`;
        return kept.has(id) ? [] : [{ ...check, owner, index, id }];
      }),
    );
  });

  protected readonly stepChecksByRow = computed(() => {
    const byRow = new Map<string, StepRowCheck>();
    for (const check of this.stepChecks()) byRow.set(this.stepId(check.owner, check.index), check);
    return byRow;
  });

  protected readonly noteChecks = computed(() =>
    checkNotes(
      [...this.ingredients(), ...this.sections().flatMap((s) => s.ingredients)],
      [...this.steps(), ...this.sections().flatMap((s) => s.steps)],
      this.notes(),
    ).filter((c) => !this.kept().has(`note|${c.summary}`)),
  );

  protected readonly checkCount = computed(
    () => this.rowChecks().length + this.stepChecks().length + this.noteChecks().length,
  );

  /**
   * A method too short for its ingredient list, said as the recipe page says
   * it (`methodGap`), with the one-step split offered beside it when there is one.
   */
  private readonly methodItem = computed<ChecklistItem | null>(() => {
    const split = this.stepChecks().find((c) => c.owner === undefined && c.kind === 'one-step');
    const text = methodGap(this.draft()) || split?.summary;
    if (!text) return null;
    return {
      id: 'method',
      text,
      target: 'steps',
      owner: undefined,
      ...(split ? { action: { label: 'Split', run: () => this.applyStepFix(split) } } : {}),
    };
  });

  /** The checklist beside the form: each check, said briefly, pointing at its row. */
  protected readonly checklist = computed<ChecklistItem[]>(() => {
    const parts = this.sections();
    const named = (owner: Owner, text: string) =>
      owner === undefined ? text : `${parts[owner]?.title || 'Untitled part'}: ${text}`;
    const method = this.methodItem();
    const items: ChecklistItem[] = method ? [method] : [];
    for (const c of this.rowChecks()) {
      items.push({ id: c.id, text: named(c.owner, c.summary), target: this.rowId(c.owner, c.index), owner: c.owner });
    }
    for (const c of this.stepChecks()) {
      // The one-step split is already the method line above.
      if (method && c.owner === undefined && c.kind === 'one-step') continue;
      items.push({ id: c.id, text: named(c.owner, c.summary), target: this.stepId(c.owner, c.index), owner: c.owner });
    }
    for (const c of this.noteChecks()) {
      items.push({ id: `note|${c.summary}`, text: c.summary, target: 'notes', owner: undefined });
    }
    return items;
  });

  /** "Dressing heading kept", or "2 headings kept", when the list has any. */
  private readonly headingNote = computed(() => {
    const names = [...new Set(this.ingredients().map((i) => i.group).filter((g): g is string => !!g))];
    if (names.length === 0) return '';
    return names.length === 1 ? `${names[0]} heading kept` : `${names.length} headings kept`;
  });

  /** What saving needs and has; unmet, these are the only things that block it. */
  protected readonly requirements = computed(() => {
    const items: { ok: boolean | null; text: string; aside?: string }[] = [];
    const title = !!this.title().trim();
    const ingredientCount =
      this.ingredients().length + this.sections().reduce((n, s) => n + s.ingredients.length, 0);
    const headings = this.headingNote();
    if (this.editing()) {
      if (ingredientCount > 0) {
        items.push({ ok: true, text: [count(ingredientCount, 'ingredient'), headings].filter(Boolean).join(' · ') });
      }
    } else if (title && ingredientCount > 0) {
      items.push({ ok: true, text: `Title and ${count(ingredientCount, 'ingredient')}`, aside: '(all that’s required)' });
      if (headings) items.push({ ok: true, text: headings.replace(/^./, (c) => c.toUpperCase()) });
    }
    if (!title) items.push({ ok: false, text: 'A title' });
    if (ingredientCount === 0) items.push({ ok: false, text: 'At least one ingredient' });
    if (this.sections().some((s) => !s.title.trim())) items.push({ ok: false, text: 'A name for each part' });
    if (!this.sourceValid()) items.push({ ok: false, text: 'A source link that starts with http:// or https://' });
    // Not a problem, just the one thing a cook can add next time.
    if (!this.photo()) items.push({ ok: null, text: 'No photo — add one next time you make it' });
    return items;
  });

  /** "13 ingredients, 3 steps, photo and tags", for the line under the import panel. */
  protected readonly fillSummary = computed(() => {
    if (!this.filledFrom()) return '';
    const ingredientCount =
      this.ingredients().length + this.sections().reduce((n, s) => n + s.ingredients.length, 0);
    return `${listed([
      count(ingredientCount, 'ingredient'),
      count(this.steps().length, 'step'),
      ...(this.photo() ? ['photo'] : []),
      ...(this.tags().length ? ['tags'] : []),
    ])}.`;
  });

  // ---- Photo --------------------------------------------------------------

  /** The address being typed for a new photo; null when the box is closed. */
  protected readonly photoDraft = signal<string | null>(null);
  /** Set when the photo fails to load, and cleared when it changes. */
  protected readonly photoBroken = linkedSignal({ source: this.photo, computation: () => false });

  // ---- Steps ----------------------------------------------------------------

  /** Where the caret last sat in a step, for "Split here". */
  protected readonly caret = signal<{ owner: Owner; index: number; pos: number } | null>(null);

  // ---- Rows being dragged ---------------------------------------------------

  private dragging: { owner: Owner; index: number } | null = null;
  protected readonly dropTarget = signal<string | null>(null);

  /** The "paste several" box, open under the ingredients being shown. */
  protected readonly pasteOpen = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly deleting = signal(false);

  constructor() {
    effect(() => {
      const slug = this.slug_();
      if (slug === undefined) return;
      untracked(() => void this.loadForEdit(slug));
    });
    effect(() => {
      const url = this.url();
      if (this.slug_() !== undefined || !url || url === this.handledUrl) return;
      if (!/^https?:\/\//i.test(url)) return;
      this.handledUrl = url;
      untracked(() => void this.importFromAddress(url));
    });
  }

  /** Imports an address handed over in `?url=`, then drops it so a reload doesn't repeat it. */
  private async importFromAddress(url: string): Promise<void> {
    this.tab.set('url');
    this.importUrl.set(url);
    await this.importFromUrl();
    await this.router.navigate([], {
      queryParams: { url: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
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
    this.servingsUnit.set(recipe.servingsUnit ?? '');
    this.time.set(recipe.time);
    this.blurb.set(recipe.blurb);
    this.desc.set(recipe.desc);
    this.tagsText.set(recipe.tags.join(', '));
    this.ingredients.set(recipe.ingredients.map((i) => ({ ...i })));
    this.steps.set([...recipe.steps]);
    this.notes.set([...recipe.notes]);
    this.photo.set(recipe.photo ?? '');
    this.photoFocus.set(recipe.photoFocus ?? null);
    this.sourceUrl.set(recipe.sourceUrl ?? '');
    this.sourcePage.set(recipe.sourcePage ?? null);
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
    this.baseline.set(this.snapshot());
  }

  /**
   * The draft fields a paste, file or import can write, each with the value it
   * goes back to when cleared.
   */
  private readonly fillable = {
    title: [this.title, ''],
    subtitle: [this.subtitle, ''],
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
    this.filledCredit.set(typeof values.subtitle === 'string' ? values.subtitle : '');
  }

  /** True when a fill may write the field: it is blank, or still holds what a fill wrote. */
  private untouched(field: FillField): boolean {
    const [target] = this.fillable[field] as unknown as [WritableSignal<unknown>];
    const value = target();
    return value === '' || value === this.lastFill.get(field);
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  // ---- Pasted text -----------------------------------------------------------

  protected onPaste(text: string): void {
    this.pasted.set(text);
    this.applyDraft(parseRecipeText(text));
    this.filledFrom.set(text.trim() ? 'paste' : null);
  }

  // ---- A file ----------------------------------------------------------------

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
          // Unfiled, matching RecipeTemplate: a folder drop never sees the
          // cookbook choice, which belongs to the one recipe being shown.
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
    this.filledFrom.set('file');
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

  // ---- A link ----------------------------------------------------------------

  /**
   * Fills the form from the API's reading of a page. Saves nothing: the result
   * is a draft like any other, and only Save writes.
   */
  protected async importFromUrl(): Promise<void> {
    const url = this.importUrl().trim();
    if (!url) return;
    if (await this.runImport(() => this.importer.previewRecipe(url))) {
      this.importedUrl.set(url);
      this.filledFrom.set('url');
    }
  }

  // ---- A photo ---------------------------------------------------------------

  /** Reads the chosen photo through the API into the same draft a URL import fills. */
  protected async importPhoto(files: FileList | null): Promise<void> {
    const file = files?.item(0);
    if (!file || this.importing()) return;
    const problem = photoProblem(file);
    if (problem) {
      this.notice.set(problem);
      return;
    }
    if (await this.runImport(() => this.importer.previewPhoto(file), describePhotoError)) {
      this.filledFrom.set('photo');
    }
  }

  /** The flow both imports share: busy flag, fill, notice. True when it filled the form. */
  private async runImport(
    read: () => Promise<ImportPreview>,
    describe: (err: unknown) => string = describeWriteError,
  ): Promise<boolean> {
    if (this.importing()) return false;
    this.importing.set(true);
    this.notice.set('');
    try {
      const preview = await read();
      this.applyPreview(preview);
      return true;
    } catch (err) {
      this.notice.set(
        (err as { status?: unknown } | null)?.status === 404
          ? "Import isn't switched on in the local API. Add RECIPE_IMPORT_ENABLED=true to its .env and restart it."
          : describe(err),
      );
      return false;
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

    // Named groups ("Dressing") become headings in the one list: the page
    // gives them no steps of their own, which is what a part would be for.
    // A lone group, or one called "Ingredients", is just the list itself.
    const groups = (preview.ingredientGroups ?? []).filter((g) => g.lines.length > 0);
    const named = groups.filter((g) => g.name && !PLAIN_GROUPS.test(g.name.trim()));
    const headed = named.length > 0 && groups.length > 1;
    const ingredients = groups.flatMap((g) => {
      const group = headed && g.name && !PLAIN_GROUPS.test(g.name.trim()) ? g.name.trim() : undefined;
      return toIngredients(parse(g.lines)).map((i) => (group ? { ...i, group } : i));
    });

    // Only what the page supplied is written, so an empty description never
    // wipes one typed by hand. Tags are put in the filters' words.
    const tags = vocabularyTags(preview.tags ?? []).join(', ');
    // A credit typed by hand outranks the site's name.
    const credit = preview.siteName && this.untouched('subtitle') ? `From ${preview.siteName}` : '';
    this.fill({
      title: preview.title ?? '',
      ingredients,
      steps: [...(preview.steps ?? [])],
      ...(credit ? { subtitle: credit } : {}),
      ...(preview.description ? { desc: preview.description } : {}),
      ...(typeof preview.servings === 'number' && preview.servings > 0
        ? { servings: Math.round(preview.servings) }
        : {}),
      ...(preview.time ? { time: preview.time } : {}),
      ...(tags ? { tagsText: tags } : {}),
      ...(preview.image ? { photo: preview.image } : {}),
      // A photo import answers sourceUrl '' on purpose: there is no page and no
      // image, so whatever an earlier import or edit left there is cleared.
      ...(preview.sourceUrl ? { sourceUrl: preview.sourceUrl } : {}),
      ...(preview.sourceUrl === '' ? { sourceUrl: '', ...(preview.image ? {} : { photo: '' }) } : {}),
    });
    this.part.set(undefined);
  }

  protected onUrlText(text: string): void {
    this.urlText.set(text);
    if (!text.trim()) {
      this.notice.set('');
      return;
    }

    const structured = parseJsonLd(text);
    this.filledFrom.set('html');
    if (structured) {
      this.applyDraft(structured);
      this.notice.set('Read schema.org Recipe data from the pasted markup.');
      return;
    }

    // Falling back to plain text parsing, per §6.4.
    this.applyDraft(parseRecipeText(text));
    this.notice.set('No recipe markup found, so this was read as plain text.');
  }

  // ---- Details ---------------------------------------------------------------

  protected stepServings(delta: number): void {
    this.servings.update((n) => Math.max(1, n + delta));
  }

  /** Adds typed tags: several at once when separated by commas. */
  protected addTags(text: string): void {
    const next = [...this.tags()];
    for (const tag of text.split(',').map((t) => t.trim().toLowerCase())) {
      if (tag && !next.includes(tag)) next.push(tag);
    }
    this.tagsText.set(next.join(', '));
  }

  protected removeTag(tag: string): void {
    this.tagsText.set(this.tags().filter((t) => t !== tag).join(', '));
  }

  /** Enter or a comma makes a chip; Backspace in an empty box takes the last one back. */
  protected onTagKey(event: KeyboardEvent): void {
    const box = event.target as HTMLInputElement;
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addTags(box.value);
      box.value = '';
    } else if (event.key === 'Backspace' && box.value === '' && this.tags().length > 0) {
      this.removeTag(this.tags().at(-1)!);
    }
  }

  protected onTagBlur(box: HTMLInputElement): void {
    this.addTags(box.value);
    box.value = '';
  }

  protected usePhoto(): void {
    const address = (this.photoDraft() ?? '').trim();
    if (!isWebAddress(address)) return;
    this.photo.set(address);
    this.photoFocus.set(null);
    this.photoDraft.set(null);
  }

  protected removePhoto(): void {
    this.photo.set('');
    this.photoFocus.set(null);
    this.photoDraft.set(null);
    this.focusing.set(false);
  }

  /** True while the next click on the photo sets what its crop keeps. */
  protected readonly focusing = signal(false);

  /** The photo's crop, as CSS: "50% 30%". */
  protected readonly focusPosition = computed(() => {
    const f = this.photoFocus();
    return f ? `${f.x}% ${f.y}%` : '50% 50%';
  });

  /** Sets the focus where the photo was clicked, as whole percentages across and down. */
  protected setFocus(event: MouseEvent): void {
    if (!this.focusing()) return;
    const frame = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const at = (n: number) => Math.round(Math.min(100, Math.max(0, n)));
    this.photoFocus.set({
      x: at(((event.clientX - frame.left) / frame.width) * 100),
      y: at(((event.clientY - frame.top) / frame.height) * 100),
    });
    this.focusing.set(false);
  }

  /** A pasted source link fills an empty credit with the site's name. */
  protected setSource(text: string): void {
    const url = text.trim();
    this.sourceUrl.set(url);
    if (!isWebAddress(url) || !this.untouched('subtitle')) return;
    const credit = `From ${siteName(url)}`;
    this.subtitle.set(credit);
    this.lastFill.set('subtitle', credit);
    this.filledCredit.set(credit);
  }

  /** A page number, or nothing for anything that is not a whole page. */
  protected setPage(text: string): void {
    const page = Number(text);
    this.sourcePage.set(text.trim() && Number.isInteger(page) && page > 0 && page <= 10000 ? page : null);
  }

  protected toggleCookbook(id: string): void {
    this.cookbookIds.update((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  protected closePicker(event: Event): void {
    if (!this.cookbooksOpen()) return;
    if (!(event.target as Element | null)?.closest?.('.cookbook-picker')) this.cookbooksOpen.set(false);
  }

  // ---- Parts -----------------------------------------------------------------

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

  protected readonly atSectionLimit = computed(() => this.sections().length >= MAX_SECTIONS);

  /** Adds a part and shows it. */
  protected addSection(): void {
    if (this.atSectionLimit()) return;
    this.sections.update((list) => [
      ...list,
      { slug: null, title: '', ingredients: [], steps: [], ownTitle: null, hadLabel: true },
    ]);
    this.part.set(this.sections().length - 1);
  }

  protected setSectionTitle(index: number, title: string): void {
    this.editSection(index, (s) => ({ ...s, title }));
  }

  /**
   * Takes the section off this recipe. A section already saved stays stored as
   * a component recipe; it just stops being listed here.
   */
  protected removeSection(index: number): void {
    this.sections.update((list) => list.filter((_, i) => i !== index));
    this.part.set(undefined);
  }

  /** The ingredients of the part being shown. */
  protected listOf(owner: Owner): Ingredient[] {
    return owner === undefined ? this.ingredients() : (this.sections()[owner]?.ingredients ?? []);
  }

  protected stepsOf(owner: Owner): string[] {
    return owner === undefined ? this.steps() : (this.sections()[owner]?.steps ?? []);
  }

  // ---- Ingredients -------------------------------------------------------------

  /** The element id of an ingredient row, which the checklist scrolls to. */
  protected rowId(owner: Owner, index: number): string {
    return `ing-${owner ?? 'main'}-${index}`;
  }

  /** Adds a row at the end, under the last heading if there is one. */
  protected addIngredient(owner?: Owner): void {
    this.editIngredients(owner, (list) => {
      const group = list.at(-1)?.group;
      return [...list, { qty: null, unit: '', name: '', aisle: 'pantry' as Aisle, ...(group ? { group } : {}) }];
    });
  }

  // ---- Headings ----------------------------------------------------------------
  //
  // A heading is not a row of its own: it is the `group` its ingredients share,
  // shown above the first of them. That keeps the stored shape the recipe page,
  // cook mode and the shopping list already read.

  /** The heading to show above row i: its group, where the group starts. */
  protected headingAt(list: readonly Ingredient[], i: number): string {
    const group = list[i]?.group;
    return group && (i === 0 || list[i - 1].group !== group) ? group : '';
  }

  protected hasHeadings(owner: Owner): boolean {
    return this.listOf(owner).some((i) => !!i.group);
  }

  /** The rows under the heading that starts at `first`. */
  private runOf(list: readonly Ingredient[], first: number): number {
    let end = first;
    while (end < list.length && list[end].group === list[first].group) end++;
    return end;
  }

  /** Starts a heading at the end, with a row under it ready to fill. */
  protected addHeading(owner?: Owner): void {
    const taken = new Set(this.listOf(owner).map((i) => i.group));
    let name = 'New heading';
    for (let n = 2; taken.has(name); n++) name = `New heading ${n}`;
    this.editIngredients(owner, (list) => [...list, { qty: null, unit: '', name: '', aisle: 'pantry', group: name }]);
    const first = this.listOf(owner).length - 1;
    setTimeout(() => {
      const box = document.getElementById(`heading-${owner ?? 'main'}-${first}`) as HTMLInputElement | null;
      box?.focus();
      box?.select();
    });
  }

  protected renameHeading(first: number, name: string, owner?: Owner): void {
    const next = name.trim();
    if (!next) {
      this.removeHeading(first, owner);
      return;
    }
    this.editIngredients(owner, (list) => {
      const end = this.runOf(list, first);
      return list.map((item, i) => (i >= first && i < end ? { ...item, group: next } : item));
    });
  }

  /** Takes a heading away; its rows join whatever is above them. */
  protected removeHeading(first: number, owner?: Owner): void {
    this.editIngredients(owner, (list) => {
      const end = this.runOf(list, first);
      const above = list[first - 1]?.group;
      return list.map((item, i) => {
        if (i < first || i >= end) return item;
        const { group: _, ...rest } = item;
        return above ? { ...rest, group: above } : rest;
      });
    });
  }

  protected setAmount(index: number, text: string, owner?: Owner): void {
    const { qty, unit } = parseAmount(text);
    this.editIngredients(owner, (list) => list.map((item, i) => (i === index ? { ...item, qty, unit } : item)));
  }

  /**
   * Sets a row's name. A whole line typed into a row with no amount yet ("2
   * tbsp olive oil") is read the way a paste is, amount and all.
   */
  protected updateIngredientName(index: number, raw: string, owner?: Owner): void {
    const parsed = parseIngredient(raw);
    this.editIngredients(owner, (list) =>
      list.map((item, i) => {
        if (i !== index) return item;
        const whole = item.qty === null && !item.unit && parsed.qty !== null;
        return {
          qty: whole ? parsed.qty : item.qty,
          unit: whole ? parsed.unit : item.unit,
          name: whole ? parsed.name || raw : raw.trim(),
          // Keep a hand-picked aisle rather than re-inferring over it.
          aisle: item.name ? item.aisle : whole ? parsed.aisle : inferAisle(raw),
          ...(item.group ? { group: item.group } : {}),
        };
      }),
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

  /** Moves a row to where row `to` is, into that row's heading. */
  protected moveIngredient(from: number, to: number, owner?: Owner): void {
    this.editIngredients(owner, (list) => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [moved] = next.splice(from, 1);
      const { group: _, ...plain } = moved;
      const group = list[to].group;
      next.splice(to, 0, group ? { ...plain, group } : plain);
      return next;
    });
  }

  /**
   * Adds a row for each pasted line, read the way the paste tab reads them. A
   * line ending in a colon ("Dressing:") is a heading over the lines after it.
   */
  protected pasteIngredients(text: string, owner?: Owner): void {
    let group = this.listOf(owner).at(-1)?.group;
    const rows: Ingredient[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.replace(/^\s*[-*•]\s*/, '').trim();
      if (!line) continue;
      const heading = /^([^\d].*?):$/.exec(line);
      if (heading) {
        group = heading[1].trim();
        continue;
      }
      const p = parseIngredient(line);
      rows.push({ qty: p.qty, unit: p.unit, name: p.name || line, aisle: p.aisle, ...(group ? { group } : {}) });
    }
    if (rows.length > 0) this.editIngredients(owner, (list) => [...list, ...rows]);
    this.pasteOpen.set(false);
  }

  protected applyFix(check: RowCheck): void {
    const change = check.fix?.change;
    if (!change) return;
    this.editIngredients(check.owner, (list) => {
      const at = check.index;
      if (change.type === 'replace') return [...list.slice(0, at), ...change.rows, ...list.slice(at + 1)];
      // A join keeps the upper row's amount and aisle, and reads the lower one into its name.
      const upper = change.with === 'next' ? at : at - 1;
      if (upper < 0 || upper + 1 >= list.length) return list;
      return [...list.slice(0, upper), joinRows(list[upper], list[upper + 1]), ...list.slice(upper + 2)];
    });
  }

  protected keep(id: string): void {
    this.kept.update((set) => new Set(set).add(id));
  }

  protected rowDragStart(event: DragEvent, owner: Owner, index: number): void {
    this.dragging = { owner, index };
    const row = (event.target as HTMLElement).closest('.ing-row');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(index));
      if (row) event.dataTransfer.setDragImage(row, 16, 16);
    }
  }

  protected rowDragOver(event: DragEvent, owner: Owner, index: number): void {
    if (!this.dragging || this.dragging.owner !== owner) return;
    event.preventDefault();
    this.dropTarget.set(this.rowId(owner, index));
  }

  protected rowDrop(event: DragEvent, owner: Owner, index: number): void {
    event.preventDefault();
    if (this.dragging && this.dragging.owner === owner) this.moveIngredient(this.dragging.index, index, owner);
    this.rowDragEnd();
  }

  protected rowDragEnd(): void {
    this.dragging = null;
    this.dropTarget.set(null);
  }

  // ---- Steps --------------------------------------------------------------------

  /** The element id of a step, which the checklist scrolls to. */
  protected stepId(owner: Owner, index: number): string {
    return `step-${owner ?? 'main'}-${index}`;
  }

  protected applyStepFix(check: StepRowCheck): void {
    const fix = check.fix;
    if (fix?.steps) {
      const replacement = fix.steps;
      this.editSteps(check.owner, (list) => [...list.slice(0, check.index), ...replacement, ...list.slice(check.index + 1)]);
    }
    if (fix?.ingredient) {
      const row = fix.ingredient;
      this.editIngredients(check.owner, (list) => [...list, row]);
    }
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

  protected moveStep(from: number, to: number, owner?: Owner): void {
    this.editSteps(owner, (list) => {
      if (to < 0 || to >= list.length || from === to) return list;
      const next = [...list];
      const [step] = next.splice(from, 1);
      next.splice(to, 0, step);
      return next;
    });
  }

  protected noteCaret(owner: Owner, index: number, box: HTMLTextAreaElement): void {
    this.caret.set({ owner, index, pos: box.selectionStart });
  }

  /** Where "Split here" would cut this step, or null when the caret is not inside it. */
  protected splitPoint(owner: Owner, index: number): number | null {
    const caret = this.caret();
    const text = this.stepsOf(owner)[index] ?? '';
    if (!caret || caret.owner !== owner || caret.index !== index) return null;
    const head = text.slice(0, caret.pos).trim();
    const tail = text.slice(caret.pos).trim();
    return head && tail ? caret.pos : null;
  }

  protected splitStep(index: number, owner?: Owner): void {
    const at = this.splitPoint(owner, index);
    if (at === null) return;
    this.editSteps(owner, (list) =>
      list.flatMap((s, i) => (i === index ? [s.slice(0, at).trim(), s.slice(at).trim()] : [s])),
    );
    this.caret.set(null);
  }

  /** Moves a step that is really advice ("Can be made a day ahead") to the notes. */
  protected stepToNote(index: number, owner?: Owner): void {
    const text = this.stepsOf(owner)[index]?.trim();
    this.removeStep(index, owner);
    if (text) this.notes.update((list) => [...list, text]);
  }

  // ---- Notes ----------------------------------------------------------------------

  protected addNote(text = ''): void {
    this.notes.update((list) => [...list, text]);
    const at = this.notes().length - 1;
    // Focused once it is drawn, with the caret after any text it starts with.
    setTimeout(() => {
      const box = document.getElementById(`note-${at}`) as HTMLTextAreaElement | null;
      box?.focus();
      box?.setSelectionRange(text.length, text.length);
    });
  }

  protected updateNote(index: number, text: string): void {
    this.notes.update((list) => list.map((n, i) => (i === index ? text : n)));
  }

  protected removeNote(index: number): void {
    this.notes.update((list) => list.filter((_, i) => i !== index));
  }

  // ---- Checklist --------------------------------------------------------------------

  /** Brings a checked row into view, switching to its part first. */
  protected show(item: { target: string; owner: Owner }): void {
    this.part.set(item.owner);
    setTimeout(() => {
      const el = document.getElementById(item.target);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLElement>('input, textarea, button')?.focus({ preventScroll: true });
    });
  }

  protected jump(id: string): void {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Confirm ----------------------------------------------------------------------

  protected async save(): Promise<void> {
    // The button is disabled too, but a second call can arrive before the
    // first re-renders, so the guard lives here as well.
    if (!this.canSave() || this.saving()) return;
    if (this.editing() && !this.original()) return;
    this.saving.set(true);
    this.saveMessage.set('');
    const recipe = this.draft();
    const cleaned: Recipe = {
      ...recipe,
      // Drop the blank rows the editor leaves behind.
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
        // Against the copy the form loaded, so notes a device added since are
        // kept and notes deleted here stay deleted.
        if (!(await this.recipes.update(cleaned, this.original() ?? undefined))) {
          this.saveMessage.set('That recipe no longer exists, so nothing was saved.');
          return;
        }
        void this.router.navigate(['/recipes', cleaned.slug]);
        return;
      }
      const slug = await this.recipes.add(cleaned);
      this.storage.write(FILE_IN_KEY, this.cookbookIds());
      void this.router.navigate(['/recipes', slug]);
    } catch (err) {
      // Stay here with the draft untouched so nothing typed is lost.
      this.saveMessage.set(describeWriteError(err));
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
          this.saveMessage.set(`The part “${title}” no longer exists, so nothing more was saved.`);
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
        // Filed with its parent, so it does not turn up as unfiled.
        cookbooks: parent.cookbooks,
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

  /**
   * Archives the recipe: it leaves the app everywhere, and the record stays in
   * the database, which is where it can be brought back.
   */
  protected async deleteRecipe(): Promise<void> {
    const slug = this.slug_();
    if (!slug || this.deleting()) return;
    this.deleting.set(true);
    this.saveMessage.set('');
    try {
      if (await this.recipes.archive(slug)) {
        void this.router.navigate(['/']);
        return;
      }
      this.saveMessage.set('That recipe no longer exists.');
    } catch (err) {
      this.saveMessage.set(describeWriteError(err));
    } finally {
      this.deleting.set(false);
      this.confirmingDelete.set(false);
    }
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
      this.saveMessage.set('Copied the draft as JSON.');
    } catch {
      this.saveMessage.set('Could not reach the clipboard, so nothing was copied.');
    }
  }

  protected amountLabel(ingredient: Ingredient): string {
    return amountText(ingredient);
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
    this.part.set(undefined);
  }
}
