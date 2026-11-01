import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FakeRecipeRepository, provideFakeRecipes } from '../../core/testing/fake-repositories';
import { ImportClient, ImportPreview } from '../../core/import-client';
import { Recipe } from '../../core/model/recipes.model';
import { RecipeStore } from '../../core/stores/recipe.store';
import { CreateRecipeComponent } from './create-recipe.component';

const CONFLICT = 'A recipe with that name already exists. Change the title and try again.';

/** Stands in for the API's import endpoint; each test says what it answers. */
function fakeImport(): ImportClient {
  return { previewRecipe: jasmine.createSpy('previewRecipe') } as unknown as ImportClient;
}

/** A fake whose first `list()` never answers until the test says so. */
class SlowListFake extends FakeRecipeRepository {
  release!: () => void;
  private readonly gate = new Promise<void>((resolve) => (this.release = resolve));
  override async list(): Promise<Recipe[]> {
    await this.gate;
    return super.list();
  }
}

/** A fake whose `list()` rejects until the test lets it through. */
class FlakyListFake extends FakeRecipeRepository {
  listCalls = 0;
  down = true;
  private release!: () => void;
  private gate: Promise<void> | null = null;
  override async list(): Promise<Recipe[]> {
    this.listCalls++;
    if (this.down) throw new Error('down');
    if (this.gate) await this.gate;
    return super.list();
  }
  /** The next list() stays pending until `release()`. */
  hold(): void {
    this.down = false;
    this.gate = new Promise<void>((resolve) => (this.release = resolve));
  }
  letThrough(): void {
    this.release();
  }
}

// The draft signals are protected; the spec reaches them the way the template does.
type Internals = {
  title: { set(v: string): void; (): string };
  ingredients: { set(v: unknown[]): void; (): unknown[] };
  notice(): string;
  saving(): boolean;
  save(): Promise<void>;
  onFiles(files: FileList | null): Promise<void>;
};

function filesOf(...named: [string, string][]): FileList {
  const dt = new DataTransfer();
  for (const [name, text] of named) dt.items.add(new File([text], name));
  return dt.files;
}

describe('CreateRecipeComponent', () => {
  let fake: FakeRecipeRepository;
  let fixture: ComponentFixture<CreateRecipeComponent>;
  let page: Internals;
  let navigate: jasmine.Spy;

  async function setup(repo: FakeRecipeRepository = new FakeRecipeRepository([])): Promise<void> {
    fake = repo;
    TestBed.configureTestingModule({
      imports: [CreateRecipeComponent],
      providers: [
        provideRouter([]),
        ...provideFakeRecipes(fake),
        { provide: ImportClient, useValue: fakeImport() },
      ],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(CreateRecipeComponent);
    page = fixture.componentInstance as unknown as Internals;
    page.title.set('Soup');
    page.ingredients.set([{ qty: 1, unit: '', name: 'leek', aisle: 'produce' }]);
    fixture.detectChanges();
  }

  const button = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('.btn-primary') as HTMLButtonElement;

  it('says saving adds the recipe, and offers the JSON copy, in create mode', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture.detectChanges();
    const t = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(t).toContain('Saving adds this recipe to the shared collection.');
    expect(t).toContain('Copy the JSON');
    expect(t).not.toContain('Saving updates this recipe');
  });

  it('disables Save and says "Saving…" while the write is pending', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    let finish!: () => void;
    const gate = new Promise<void>((r) => (finish = r));
    const create = fake.create.bind(fake);
    spyOn(fake, 'create').and.callFake(async (r) => {
      await gate;
      return create(r);
    });
    fixture.detectChanges();
    expect(button().disabled).toBeFalse();

    const done = page.save();
    fixture.detectChanges();
    expect(button().disabled).toBeTrue();
    expect(button().textContent).toContain('Saving…');

    finish();
    await done;
  });

  it('keeps Save disabled until the store has loaded', async () => {
    const slow = new SlowListFake([]);
    await setup(slow);
    expect(button().disabled).toBeTrue();
    slow.release();
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture.detectChanges();
    expect(button().disabled).toBeFalse();
  });

  it('sends one create for two synchronous saves', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    const create = spyOn(fake, 'create').and.callThrough();
    await Promise.all([page.save(), page.save()]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('stays on the route with the draft intact when the write fails', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    fake.failNext(Object.assign(new Error('conflict'), { status: 409 }));
    await page.save();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(page.title()).toBe('Soup');
    expect(page.ingredients().length).toBe(1);
    expect(page.notice()).toBe(CONFLICT);
    expect(page.saving()).toBeFalse();
    expect(button().disabled).toBeFalse();
  });

  it('navigates to the saved recipe on success', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    await page.save();
    expect(navigate).toHaveBeenCalledOnceWith(['/recipes', 'soup']);
  });

  it('keeps importing after a failed file and reports the count', async () => {
    await setup();
    await TestBed.inject(RecipeStore).whenLoaded();
    const recipe = (n: string): [string, string] => [
      `${n}.md`,
      `# ${n}\n\n## Ingredients\n\n- 1 cup flour\n\n## Method\n\n1. Mix.\n`,
    ];
    // The first file only fills the draft; the next two are saved straight
    // through, and the first of those fails.
    const create = fake.create.bind(fake);
    let calls = 0;
    spyOn(fake, 'create').and.callFake((r) => {
      if (calls++ === 0) return Promise.reject({ status: 403 });
      return create(r);
    });
    await page.onFiles(filesOf(recipe('Alpha'), recipe('Beta'), recipe('Gamma')));

    expect(fake.create).toHaveBeenCalledTimes(2);
    expect(page.notice()).toBe(
      "Saved 1 of 2. The rest failed: The recipe server refused the write. Check RECIPES_WRITE_KEY and that you're on localhost:4200.",
    );
  });

  describe('while the collection is not ready', () => {
    const text = (): string => fixture.nativeElement.textContent as string;
    const tryAgain = (): HTMLButtonElement | undefined =>
      Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
        (b) => b.textContent?.trim() === 'Try again',
      );

    it('says the collection is loading, with Save disabled', async () => {
      await setup(new SlowListFake([]));
      const status = fixture.nativeElement.querySelector('[role="status"][data-state="loading"]');
      expect(status?.textContent).toContain('Loading the collection…');
      expect(button().disabled).toBeTrue();
    });

    it('says saving is paused after a failed load, and Try again reloads', async () => {
      const flaky = new FlakyListFake([]);
      await setup(flaky);
      await TestBed.inject(RecipeStore).whenLoaded();
      fixture.detectChanges();
      const alert = fixture.nativeElement.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain("Couldn't load the recipe collection, so saving is paused.");
      expect(button().disabled).toBeTrue();
      expect(tryAgain()).toBeDefined();

      flaky.hold();
      tryAgain()!.click();
      expect(flaky.listCalls).toBe(2);
      flaky.letThrough();
      await TestBed.inject(RecipeStore).whenLoaded();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
      expect(text()).not.toContain('saving is paused');
      expect(button().disabled).toBeFalse();
    });

    it('imports nothing from a folder drop when the collection fails to load', async () => {
      await setup(new FlakyListFake([]));
      const recipe = (n: string): [string, string] => [
        `${n}.md`,
        `# ${n}\n\n## Ingredients\n\n- 1 cup flour\n\n## Method\n\n1. Mix.\n`,
      ];
      const create = spyOn(fake, 'create').and.callThrough();
      await page.onFiles(filesOf(recipe('Alpha'), recipe('Beta')));
      expect(create).not.toHaveBeenCalled();
      expect(page.notice()).toBe("Couldn't load the recipe collection, so nothing was imported.");
    });
  });
});

describe('CreateRecipeComponent edit mode', () => {
  const stored: Recipe = {
    slug: 'old-soup',
    title: 'Old Soup',
    tags: ['dinner'],
    time: '30 min',
    servings: 4,
    cooked: 7,
    blurb: 'b',
    desc: 'd',
    ingredients: [{ qty: 1, unit: '', name: 'leek', aisle: 'produce' }],
    steps: ['Simmer.'],
    notes: [],
    cookbooks: ['cb1'],
    photo: 'https://example.com/p.jpg',
    sourceUrl: 'https://example.com/soup',
    components: [{ slug: 'stock' }],
  };
  type Edit = {
    title: { set(v: string): void; (): string };
    save(): Promise<void>;
    notice(): string;
    subtitle: { set(v: string): void };
    updateIngredientName(i: number, raw: string): void;
    ingredients(): { name: string; group?: string }[];
  };
  let fake: FakeRecipeRepository;
  let fixture: ComponentFixture<CreateRecipeComponent>;
  let navigate: jasmine.Spy;
  let page: Edit;

  async function setup(
    slug = 'old-soup',
    repo: FakeRecipeRepository = new FakeRecipeRepository([stored]),
  ): Promise<void> {
    fake = repo;
    TestBed.configureTestingModule({
      imports: [CreateRecipeComponent],
      providers: [
        provideRouter([]),
        ...provideFakeRecipes(fake),
        { provide: ImportClient, useValue: fakeImport() },
      ],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(CreateRecipeComponent);
    fixture.componentRef.setInput('slug', slug);
    page = fixture.componentInstance as unknown as Edit;
    fixture.detectChanges();
    await TestBed.inject(RecipeStore).whenLoaded();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const text = (): string => (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('loads the recipe into the form under an "Edit recipe" heading', async () => {
    await setup();
    expect(text()).toContain('Edit recipe');
    expect(page.title()).toBe('Old Soup');
    expect(text()).toContain('/old-soup');
  });

  it('says saving updates the recipe, without the JSON sentence, in edit mode', async () => {
    await setup();
    expect(text()).toContain('Saving updates this recipe in the shared collection.');
    expect(text()).not.toContain('Saving adds');
    expect(text()).not.toContain('Copy the JSON');
  });

  it('saves with update, keeps the slug when the title changes, and preserves hidden fields', async () => {
    await setup();
    page.title.set('New Name');
    const update = spyOn(fake, 'update').and.callThrough();
    const create = spyOn(fake, 'create').and.callThrough();
    await page.save();
    expect(create).not.toHaveBeenCalled();
    const sent = update.calls.mostRecent().args[0];
    expect(sent.slug).toBe('old-soup');
    expect(sent.title).toBe('New Name');
    expect(sent.cooked).toBe(7);
    expect(sent.photo).toBe(stored.photo);
    expect(sent.sourceUrl).toBe(stored.sourceUrl);
    expect(sent.components).toEqual([{ slug: 'stock' }]);
    expect(sent.cookbooks).toEqual(['cb1']);
    expect(navigate).toHaveBeenCalledWith(['/recipes', 'old-soup']);
  });

  it('stays open with the error when the update fails', async () => {
    await setup();
    fake.failNext(Object.assign(new Error('x'), { status: 0 }));
    await page.save();
    expect(navigate).not.toHaveBeenCalled();
    expect(page.notice()).toContain("Couldn't reach the recipe server");
    expect(page.title()).toBe('Old Soup');
  });

  it('shows not-found for an unknown slug', async () => {
    await setup('nope');
    expect(text()).toContain('No recipe by that name.');
  });

  it('sends no subtitle once the field is cleared', async () => {
    fake = new FakeRecipeRepository([{ ...stored, subtitle: 'From Mum' }]);
    await setup('old-soup', fake);
    page.subtitle.set('  ');
    const update = spyOn(fake, 'update').and.callThrough();
    await page.save();
    expect('subtitle' in update.calls.mostRecent().args[0]).toBeFalse();
  });

  it('shows the manual form straight away, with no tab strip', async () => {
    await setup();
    expect((fixture.nativeElement as HTMLElement).querySelector('.tabs')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('#paste-area')).toBeNull();
  });

  it('keeps Save disabled until the store has loaded', async () => {
    const slow = new SlowListFake([stored]);
    TestBed.configureTestingModule({
      imports: [CreateRecipeComponent],
      providers: [
        provideRouter([]),
        ...provideFakeRecipes(slow),
        { provide: ImportClient, useValue: fakeImport() },
      ],
    });
    fixture = TestBed.createComponent(CreateRecipeComponent);
    fixture.componentRef.setInput('slug', 'old-soup');
    fixture.detectChanges();
    const btn = (): HTMLButtonElement =>
      (fixture.nativeElement as HTMLElement).querySelector('.btn-primary') as HTMLButtonElement;
    expect(btn().disabled).toBeTrue();
    slow.release();
    await TestBed.inject(RecipeStore).whenLoaded();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(btn().disabled).toBeFalse();
  });

  it('says so when the update finds no recipe', async () => {
    await setup();
    spyOn(fake, 'update').and.resolveTo(null);
    await page.save();
    expect(page.notice()).toContain('That recipe no longer exists');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('shows the load error, not not-found, when the collection fails to load', async () => {
    const flaky = new FlakyListFake([stored]);
    await setup('old-soup', flaky);
    expect(text()).toContain("Couldn't load the recipe.");
    expect(text()).not.toContain('No recipe by that name.');
  });

  it('keeps an ingredient group through an edit', async () => {
    fake = new FakeRecipeRepository([
      { ...stored, ingredients: [{ qty: 1, unit: '', name: 'leek', aisle: 'produce', group: 'Sauce' }] },
    ]);
    await setup('old-soup', fake);
    page.updateIngredientName(0, '2 leeks');
    expect(page.ingredients()[0].group).toBe('Sauce');
  });
});

type Section = {
  slug: string | null;
  title: string;
  ingredients: { qty: number | null; unit: string; name: string; aisle: string }[];
  steps: string[];
};
type Full = {
  title: { set(v: string): void; (): string };
  desc(): string;
  servings(): number;
  time(): string;
  tagsText(): string;
  ingredients: { set(v: unknown[]): void; (): Section['ingredients'] };
  steps(): string[];
  sections(): Section[];
  draft(): Recipe;
  notice(): string;
  importing(): boolean;
  importUrl: { set(v: string): void };
  canSave(): boolean;
  setTab(tab: string): void;
  importFromUrl(): Promise<void>;
  save(): Promise<void>;
  addSection(): void;
  setSectionTitle(i: number, title: string): void;
  updateIngredientName(i: number, raw: string, section?: number): void;
  updateStep(i: number, text: string, section?: number): void;
  addStep(section?: number): void;
  addIngredient(section?: number): void;
  subtitle: { set(v: string): void; (): string };
  blurb: { set(v: string): void; (): string };
  notes: { set(v: string[]): void; (): string[] };
  onPaste(text: string): void;
};

const PREVIEW: ImportPreview = {
  sourceUrl: 'https://example.com/soup',
  title: 'Leek Soup',
  description: 'Warming.',
  servings: 6,
  time: '1 hr',
  image: 'https://example.com/soup.jpg',
  tags: ['Dinner', 'Soup'],
  ingredientGroups: [
    { name: null, lines: ['2 tbsp olive oil', '3 leeks'] },
    { name: 'For the croutons', lines: ['2 slices bread'] },
    { name: 'For the cream', lines: ['1 cup cream'] },
  ],
  steps: ['Sweat the leeks.', 'Simmer.'],
};

describe('CreateRecipeComponent import and sections', () => {
  let fake: FakeRecipeRepository;
  let importer: ImportClient;
  let fixture: ComponentFixture<CreateRecipeComponent>;
  let navigate: jasmine.Spy;
  let page: Full;

  async function setup(slug?: string, seed: Recipe[] = []): Promise<void> {
    fake = new FakeRecipeRepository(seed);
    importer = fakeImport();
    TestBed.configureTestingModule({
      imports: [CreateRecipeComponent],
      providers: [
        provideRouter([]),
        ...provideFakeRecipes(fake),
        { provide: ImportClient, useValue: importer },
      ],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(CreateRecipeComponent);
    if (slug !== undefined) fixture.componentRef.setInput('slug', slug);
    page = fixture.componentInstance as unknown as Full;
    fixture.detectChanges();
    await TestBed.inject(RecipeStore).whenLoaded();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const preview = (): jasmine.Spy => importer.previewRecipe as jasmine.Spy;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  async function importIt(answer: ImportPreview = PREVIEW): Promise<void> {
    preview().and.resolveTo(answer);
    page.importUrl.set('https://example.com/soup');
    await page.importFromUrl();
    fixture.detectChanges();
  }

  /** A new recipe with two sections, ready to save. */
  function twoSections(): void {
    page.title.set('Soup');
    page.ingredients.set([{ qty: 1, unit: '', name: 'leek', aisle: 'produce' }]);
    page.addSection();
    page.setSectionTitle(0, 'Sauce');
    page.addIngredient(0);
    page.updateIngredientName(0, '1 cup cream', 0);
    page.addSection();
    page.setSectionTitle(1, 'Topping');
    page.addIngredient(1);
    page.updateIngredientName(0, '1 slice bread', 1);
  }

  it('fills the form from the preview', async () => {
    await setup();
    await importIt();
    expect(preview()).toHaveBeenCalledOnceWith('https://example.com/soup');
    expect(page.title()).toBe('Leek Soup');
    expect(page.desc()).toBe('Warming.');
    expect(page.servings()).toBe(6);
    expect(page.time()).toBe('1 hr');
    expect(page.tagsText()).toBe('dinner, soup');
    expect(page.steps()).toEqual(['Sweat the leeks.', 'Simmer.']);
    expect(page.ingredients().map((i) => [i.qty, i.unit, i.name])).toEqual([
      [2, 'tbsp', 'olive oil'],
      [3, '', 'leeks'],
    ]);
    const draft = page.draft();
    expect(draft.sourceUrl).toBe('https://example.com/soup');
    expect(draft.photo).toBe('https://example.com/soup.jpg');
  });

  it('turns each named group into a section draft with no steps', async () => {
    await setup();
    await importIt();
    const sections = page.sections();
    expect(sections.map((s) => s.title)).toEqual(['For the croutons', 'For the cream']);
    expect(sections.every((s) => s.slug === null && s.steps.length === 0)).toBeTrue();
    expect(sections[1].ingredients.map((i) => [i.qty, i.unit, i.name])).toEqual([[1, 'cup', 'cream']]);
    expect(el().querySelectorAll('.section-block').length).toBe(2);
  });

  it('saves nothing by importing', async () => {
    await setup();
    const create = spyOn(fake, 'create').and.callThrough();
    await importIt();
    expect(create).not.toHaveBeenCalled();
  });

  it('shows the error and keeps the form when the import fails', async () => {
    await setup();
    page.title.set('Mine');
    preview().and.rejectWith({ status: 422, error: { message: 'No recipe found on that page.' } });
    page.importUrl.set('https://example.com/none');
    await page.importFromUrl();
    expect(page.notice()).toBe('No recipe found on that page.');
    expect(page.title()).toBe('Mine');
    expect(page.importing()).toBeFalse();
  });

  it('disables Import and says "Importing…" while the preview is pending', async () => {
    await setup();
    page.setTab('url');
    fixture.detectChanges();
    let answer!: (p: ImportPreview) => void;
    preview().and.returnValue(new Promise<ImportPreview>((r) => (answer = r)));
    const input = el().querySelector('#import-url') as HTMLInputElement;
    input.value = 'https://example.com/soup';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const btn = el().querySelector('.import-button') as HTMLButtonElement;
    expect(btn.disabled).toBeFalse();
    btn.click();
    fixture.detectChanges();
    expect(btn.disabled).toBeTrue();
    expect(btn.textContent).toContain('Importing…');
    // The paste-the-source fallback stays on the same tab.
    expect(el().querySelector('#url-area')).not.toBeNull();
    answer(PREVIEW);
    await fixture.whenStable();
    expect(page.title()).toBe('Leek Soup');
  });

  it('needs a title on every section before it can save', async () => {
    await setup();
    page.title.set('Soup');
    page.ingredients.set([{ qty: 1, unit: '', name: 'leek', aisle: 'produce' }]);
    expect(page.canSave()).toBeTrue();
    page.addSection();
    expect(page.canSave()).toBeFalse();
    page.setSectionTitle(0, 'Sauce');
    expect(page.canSave()).toBeTrue();
  });

  it('creates each section as a component first, then the parent that lists them', async () => {
    await setup();
    twoSections();
    const order: string[] = [];
    const create = spyOn(fake, 'create').and.callFake(async (r: Recipe) => {
      order.push(r.slug);
      return { ...r };
    });
    await page.save();
    expect(order).toEqual(['soup-sauce', 'soup-topping', 'soup']);
    const [sauce, , parent] = create.calls.allArgs().map(([r]) => r);
    expect(sauce.component).toBeTrue();
    expect(sauce.title).toBe('Sauce');
    expect(sauce.ingredients.map((i) => i.name)).toEqual(['cream']);
    expect(parent.component).toBeUndefined();
    expect(parent.components).toEqual([
      { slug: 'soup-sauce', label: 'Sauce' },
      { slug: 'soup-topping', label: 'Topping' },
    ]);
    expect(navigate).toHaveBeenCalledOnceWith(['/recipes', 'soup']);
  });

  it('uses the unique-slug rule for a section whose slug is taken', async () => {
    await setup(undefined, [
      { ...PARENT, slug: 'soup-sauce', title: 'Someone else', components: undefined },
    ]);
    twoSections();
    await page.save();
    const store = TestBed.inject(RecipeStore);
    expect(store.bySlug('soup-sauce-2')?.component).toBeTrue();
    expect(store.bySlug('soup')?.components?.[0]).toEqual({ slug: 'soup-sauce-2', label: 'Sauce' });
  });

  it('stops before the parent when a section fails, and a retry reuses what was saved', async () => {
    await setup();
    twoSections();
    const create = fake.create.bind(fake);
    let calls = 0;
    spyOn(fake, 'create').and.callFake((r: Recipe) => {
      // The second section fails the first time round.
      if (calls++ === 1) return Promise.reject({ status: 0 });
      return create(r);
    });
    const update = spyOn(fake, 'update').and.callThrough();
    await page.save();

    const store = TestBed.inject(RecipeStore);
    expect(navigate).not.toHaveBeenCalled();
    expect(page.notice()).toContain("Couldn't reach the recipe server");
    expect(store.bySlug('soup')).toBeUndefined();
    // The saved section stays, listed like any recipe, and the form remembers it.
    expect(store.bySlug('soup-sauce')?.component).toBeTrue();
    expect(store.recipes().some((r) => r.slug === 'soup-sauce')).toBeTrue();
    expect(page.sections().map((s) => s.slug)).toEqual(['soup-sauce', null]);
    expect(page.title()).toBe('Soup');

    await page.save();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.calls.mostRecent().args[0].slug).toBe('soup-sauce');
    expect(store.bySlug('soup-sauce-2')).toBeUndefined();
    expect(store.bySlug('soup-topping')?.component).toBeTrue();
    expect(store.bySlug('soup')?.components).toEqual([
      { slug: 'soup-sauce', label: 'Sauce' },
      { slug: 'soup-topping', label: 'Topping' },
    ]);
    expect(navigate).toHaveBeenCalledOnceWith(['/recipes', 'soup']);
  });

  it('does not duplicate sections when the parent itself fails and is retried', async () => {
    await setup();
    twoSections();
    const create = fake.create.bind(fake);
    let calls = 0;
    const spy = spyOn(fake, 'create').and.callFake((r: Recipe) => {
      if (calls++ === 2) return Promise.reject({ status: 0 });
      return create(r);
    });
    await page.save();
    expect(TestBed.inject(RecipeStore).bySlug('soup')).toBeUndefined();
    await page.save();
    expect(spy.calls.allArgs().map(([r]) => r.slug)).toEqual([
      'soup-sauce',
      'soup-topping',
      'soup',
      'soup',
    ]);
  });

  it('loads the existing sections in edit mode and updates them before the parent', async () => {
    await setup('old-soup', [PARENT, STOCK]);
    expect(page.sections()).toEqual([
      jasmine.objectContaining({
        slug: 'old-soup-stock',
        title: 'The stock',
        ingredients: STOCK.ingredients,
        steps: STOCK.steps,
      }),
    ]);
    expect(el().querySelectorAll('.section-block').length).toBe(1);

    page.updateStep(0, 'Simmer for two hours.', 0);
    const order: string[] = [];
    const update = spyOn(fake, 'update').and.callFake(async (r: Recipe) => {
      order.push(r.slug);
      return { ...r };
    });
    const create = spyOn(fake, 'create').and.callThrough();
    await page.save();
    expect(create).not.toHaveBeenCalled();
    expect(order).toEqual(['old-soup-stock', 'old-soup']);
    const [stock, parent] = update.calls.allArgs().map(([r]) => r);
    expect(stock.steps).toEqual(['Simmer for two hours.']);
    expect(stock.component).toBeTrue();
    expect(stock.cooked).toBe(3);
    expect(parent.components).toEqual([{ slug: 'old-soup-stock', label: 'The stock' }]);
  });

  it('adds a new section to a recipe being edited', async () => {
    await setup('old-soup', [PARENT, STOCK]);
    page.addSection();
    page.setSectionTitle(1, 'Garnish');
    await page.save();
    const store = TestBed.inject(RecipeStore);
    expect(store.bySlug('old-soup-garnish')?.component).toBeTrue();
    expect(store.bySlug('old-soup')?.components).toEqual([
      { slug: 'old-soup-stock', label: 'The stock' },
      { slug: 'old-soup-garnish', label: 'Garnish' },
    ]);
  });

  it('keeps the component title and the parent label apart on an unchanged edit save', async () => {
    await setup('old-soup', [PARENT, STOCK]);
    await page.save();
    const store = TestBed.inject(RecipeStore);
    expect(store.bySlug('old-soup-stock')?.title).toBe('Stock');
    expect(store.bySlug('old-soup')?.components).toEqual([
      { slug: 'old-soup-stock', label: 'The stock' },
    ]);
  });

  it('edits only the label when a loaded section is renamed', async () => {
    await setup('old-soup', [PARENT, STOCK]);
    page.setSectionTitle(0, 'Broth');
    await page.save();
    const store = TestBed.inject(RecipeStore);
    expect(store.bySlug('old-soup-stock')?.title).toBe('Stock');
    expect(store.bySlug('old-soup')?.components).toEqual([{ slug: 'old-soup-stock', label: 'Broth' }]);
  });

  it('leaves an unlabelled reference unlabelled on an unchanged save', async () => {
    await setup('old-soup', [{ ...PARENT, components: [{ slug: 'old-soup-stock' }] }, STOCK]);
    await page.save();
    expect(TestBed.inject(RecipeStore).bySlug('old-soup')?.components).toEqual([
      { slug: 'old-soup-stock' },
    ]);
  });

  it('never lists a slug twice when a new section takes a dangling reference\'s slug', async () => {
    // The parent still points at old-soup-garnish, whose record is gone, so the
    // slug is free and the new "Garnish" section is created under it.
    await setup('old-soup', [
      { ...PARENT, components: [...PARENT.components!, { slug: 'old-soup-garnish', label: 'Gone' }] },
      STOCK,
    ]);
    page.addSection();
    page.setSectionTitle(1, 'Garnish');
    const update = spyOn(fake, 'update').and.callThrough();
    await page.save();
    const parent = update.calls.mostRecent().args[0];
    expect(parent.slug).toBe('old-soup');
    expect(parent.components).toEqual([
      { slug: 'old-soup-stock', label: 'The stock' },
      { slug: 'old-soup-garnish', label: 'Garnish' },
    ]);
    expect(navigate).toHaveBeenCalledWith(['/recipes', 'old-soup']);
  });

  it('clears what an import set when a different recipe is pasted', async () => {
    await setup();
    await importIt();
    page.onPaste('Toast\n\nIngredients\n1 slice bread\n\nSteps\nToast it.');
    const draft = page.draft();
    expect(page.title()).toBe('Toast');
    expect(draft.sourceUrl).toBeUndefined();
    expect(draft.photo).toBeUndefined();
    expect(page.sections()).toEqual([]);
    expect(page.desc()).toBe('');
    expect(page.time()).toBe('');
    expect(page.tagsText()).toBe('');
  });

  it('keeps a hand-typed blurb when the paste text is edited', async () => {
    await setup();
    page.onPaste('Toast\n\nIngredients\n1 slice bread\n\nSteps\nToast it.');
    page.blurb.set('Crunchy.');
    page.subtitle.set('From Mum');
    page.notes.set(['Use stale bread.']);
    page.onPaste('Toast\n\nIngredients\n2 slices bread\n\nSteps\nToast it.');
    expect(page.blurb()).toBe('Crunchy.');
    expect(page.subtitle()).toBe('From Mum');
    expect(page.notes()).toEqual(['Use stale bread.']);
    expect(page.ingredients()[0].qty).toBe(2);
  });

  it('keeps hand-typed copy across an import, which writes none of it', async () => {
    await setup();
    page.onPaste('Toast\n\nIngredients\n1 slice bread\n\nSteps\nToast it.');
    page.blurb.set('Crunchy.');
    await importIt();
    expect(page.blurb()).toBe('Crunchy.');
    expect(page.title()).toBe('Leek Soup');
  });

  it('clears what the previous import wrote when the next import has none of it', async () => {
    await setup();
    await importIt();
    await importIt({
      sourceUrl: 'https://example.com/toast',
      title: 'Toast',
      description: '',
      ingredientGroups: [{ name: null, lines: ['1 slice bread'] }],
      steps: ['Toast it.'],
    });
    const draft = page.draft();
    expect(draft.sourceUrl).toBe('https://example.com/toast');
    expect(draft.photo).toBeUndefined();
    expect(page.sections()).toEqual([]);
    expect(page.desc()).toBe('');
    expect(page.time()).toBe('');
    expect(page.tagsText()).toBe('');
    expect(page.servings()).toBe(4);
  });

  it('keeps a field the user edited after the import that wrote it', async () => {
    await setup();
    await importIt();
    page.setSectionTitle(0, 'Croutons');
    page.onPaste('Toast\n\nIngredients\n1 slice bread\n\nSteps\nToast it.');
    expect(page.sections().map((x) => x.title)).toEqual(['Croutons', 'For the cream']);
    expect(page.draft().sourceUrl).toBeUndefined();
  });

  it('sends no components when a recipe has no sections', async () => {
    await setup();
    page.title.set('Plain');
    page.ingredients.set([{ qty: 1, unit: '', name: 'leek', aisle: 'produce' }]);
    const create = spyOn(fake, 'create').and.callThrough();
    await page.save();
    expect('components' in create.calls.mostRecent().args[0]).toBeFalse();
  });
});

const PARENT: Recipe = {
  slug: 'old-soup',
  title: 'Old Soup',
  tags: [],
  time: '',
  servings: 4,
  cooked: 0,
  blurb: '',
  desc: '',
  ingredients: [{ qty: 1, unit: '', name: 'leek', aisle: 'produce' }],
  steps: ['Simmer.'],
  notes: [],
  cookbooks: [],
  components: [{ slug: 'old-soup-stock', label: 'The stock' }],
};

const STOCK: Recipe = {
  slug: 'old-soup-stock',
  title: 'Stock',
  tags: [],
  time: '',
  servings: 4,
  cooked: 3,
  blurb: '',
  desc: '',
  ingredients: [{ qty: 2, unit: 'l', name: 'water', aisle: 'pantry' }],
  steps: ['Simmer bones.'],
  notes: [],
  cookbooks: [],
  component: true,
};
