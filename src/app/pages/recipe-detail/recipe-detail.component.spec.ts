import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RecipeStore } from '../../core/stores/recipe.store';
import { FakeRecipeRepository, provideFakeRecipes } from '../../core/testing/fake-repositories';
import { Recipes } from '../../core/mock/recipes.mock';
import { RecipeDetailComponent } from './recipe-detail.component';

const SLUG = 'grandmas-chili';

describe('RecipeDetailComponent archive', () => {
  let fake: FakeRecipeRepository;
  let fixture: ComponentFixture<RecipeDetailComponent>;
  let navigate: jasmine.Spy;

  async function setup(writable = true): Promise<void> {
    fake = new FakeRecipeRepository();
    fake.writable = writable;
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake)],
    });
    navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const byText = (text: string): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  const confirm = (): HTMLElement | null => el().querySelector('.archive-confirm');

  async function openConfirm(): Promise<void> {
    byText('Archive')!.click();
    fixture.detectChanges();
  }

  it('has no archive button when the build is not writable', async () => {
    await setup(false);
    expect(byText('Archive')).toBeUndefined();
  });

  it('asks before archiving, and Cancel hides the question', async () => {
    await setup();
    expect(confirm()).toBeNull();
    await openConfirm();
    expect(confirm()?.textContent).toContain('Archive “');
    expect(confirm()?.textContent).toContain('It will be hidden from the site.');
    byText('Cancel')!.click();
    fixture.detectChanges();
    expect(confirm()).toBeNull();
    expect(byText('Archive')).toBeDefined();
  });

  it('archives and goes back to the library', async () => {
    await setup();
    await openConfirm();
    byText('Archive')!.click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/']);
    expect(TestBed.inject(RecipeStore).bySlug(SLUG)).toBeUndefined();
  });

  it('goes back to the library when the recipe is already gone', async () => {
    await setup();
    await openConfirm();
    spyOn(TestBed.inject(RecipeStore), 'archive').and.resolveTo(false);
    byText('Archive')!.click();
    await fixture.whenStable();
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('disables both buttons and says "Archiving…" while pending', async () => {
    await setup();
    let finish!: () => void;
    const gate = new Promise<void>((r) => (finish = r));
    const update = fake.update.bind(fake);
    spyOn(fake, 'update').and.callFake(async (r) => {
      await gate;
      return update(r);
    });
    await openConfirm();
    byText('Archive')!.click();
    fixture.detectChanges();
    expect(byText('Archiving…')!.disabled).toBeTrue();
    expect(byText('Cancel')!.disabled).toBeTrue();
    finish();
    await fixture.whenStable();
  });

  for (const [status, text] of [
    [409, 'A recipe with that name already exists. Change the title and try again.'],
    [500, "Couldn't reach the recipe server. Is it running?"],
  ] as const) {
    it(`shows the reason and stays put on a ${status}`, async () => {
      await setup();
      await openConfirm();
      fake.failNext(Object.assign(new Error('x'), { status }));
      byText('Archive')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(navigate).not.toHaveBeenCalled();
      expect(el().querySelector('[role="alert"]')?.textContent).toContain(text);
      expect(el().querySelector('h1')).not.toBeNull();
      expect(byText('Archive')!.disabled).toBeFalse();
      expect(byText('Cancel')!.disabled).toBeFalse();
    });
  }
});

describe('RecipeDetailComponent list and layout controls', () => {
  let fixture: ComponentFixture<RecipeDetailComponent>;

  async function setup(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(new FakeRecipeRepository())],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
  }

  const buttonTexts = (): string[] =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map(
      (b) => b.textContent?.trim() ?? '',
    );

  it('offers Add to list in the dev environment', async () => {
    await setup();
    expect(buttonTexts()).toContain('Add to list');
  });

  it('has no Add to list button in a production build', async () => {
    await setup();
    // Simulates a production build, where environment.production is true.
    (fixture.componentInstance as unknown as { showListControls: boolean }).showListControls =
      false;
    // A plain field, so tell the view to look again.
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    // The page still rendered, so the absences below are not a blank render.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Start cooking');
    expect(buttonTexts()).not.toContain('Add to list');
    expect(buttonTexts()).not.toContain('On the list');
  });

  it('renders no Single column or Side by side toggle', async () => {
    await setup();
    expect(buttonTexts()).not.toContain('Single column');
    expect(buttonTexts()).not.toContain('Side by side');
  });
});

describe('RecipeDetailComponent edit link', () => {
  async function render(writable: boolean): Promise<HTMLElement> {
    const fake = new FakeRecipeRepository();
    fake.writable = writable;
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake)],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const edit = (el: HTMLElement): HTMLAnchorElement | undefined =>
    Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Edit');

  it('links to the editor when writable', async () => {
    expect(edit(await render(true))?.getAttribute('href')).toBe(`/recipes/${SLUG}/edit`);
  });

  it('has no Edit link when not writable', async () => {
    expect(edit(await render(false))).toBeUndefined();
  });
});

describe('RecipeDetailComponent source link', () => {
  async function render(sourceUrl?: string): Promise<HTMLElement> {
    const base = Recipes.find((r) => r.slug === SLUG)!;
    const fake = new FakeRecipeRepository([{ ...base, ...(sourceUrl ? { sourceUrl } : {}) }]);
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake)],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const source = (el: HTMLElement): HTMLAnchorElement | undefined =>
    Array.from(el.querySelectorAll('a')).find((a) => a.textContent?.trim() === 'Source');

  it('links to the source in a new tab when it is set', async () => {
    const link = source(await render('https://example.com/chili'));
    expect(link?.getAttribute('href')).toBe('https://example.com/chili');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('has no Source link when it is not set', async () => {
    expect(source(await render())).toBeUndefined();
  });
});

describe('RecipeDetailComponent embedded recipes', () => {
  const base = Recipes.find((r) => r.slug === SLUG)!;
  const SAUCE = {
    ...base,
    slug: 'chili-sauce',
    title: 'Sauce Title',
    component: true,
    servings: 4,
    ingredients: [{ qty: 2, unit: 'tbsp', name: 'butter', aisle: 'dairy' as const }],
    steps: ['Melt the butter.'],
    notes: [],
  };
  const PARENT = {
    ...base,
    servings: 4,
    ingredients: [{ qty: 4, unit: 'cup', name: 'beans', aisle: 'pantry' as const }],
    components: [{ slug: 'chili-sauce', label: 'For the sauce' }, { slug: 'gone' }],
  };
  let fixture: ComponentFixture<RecipeDetailComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (n: Element | null | undefined) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(new FakeRecipeRepository([PARENT, SAUCE]))],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
  });

  it('shows a titled section per component, skipping a missing one', () => {
    const sections = el().querySelectorAll('.component-section');
    expect(sections.length).toBe(1);
    expect(text(sections[0].querySelector('h3'))).toBe('For the sauce');
    expect(text(sections[0])).toContain('Melt the butter.');
    expect(text(sections[0])).toContain('butter');
  });

  it('scales component ingredients with the parent servings', () => {
    const amount = () => text(el().querySelector('.component-section .ing-amount'));
    expect(amount()).toBe('2 tbsp');
    (el().querySelector('[aria-label="One more serving"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(amount()).toBe('2½ tbsp');
  });

  it('checks component ingredients and counts them', () => {
    const box = el().querySelector<HTMLInputElement>('.component-section input[type=checkbox]')!;
    box.click();
    fixture.detectChanges();
    expect(text(el().querySelector('.checked-count'))).toBe('1 of 2 in hand');
    expect(el().querySelectorAll('.is-checked').length).toBe(1);
  });

  it('puts the component sections before the parent\'s own ingredients and steps', () => {
    const section = el().querySelector('.component-section')!;
    const own = el().querySelector('.detail-body > .columns')!;
    expect(section.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps a parent ingredient\'s check apart from a component\'s', () => {
    const own = () => el().querySelector<HTMLInputElement>('.detail-body > .columns input[type=checkbox]')!;
    const part = () => el().querySelector<HTMLInputElement>('.component-section input[type=checkbox]')!;
    own().click();
    fixture.detectChanges();
    expect(own().checked).toBeTrue();
    expect(part().checked).toBeFalse();
    own().click();
    part().click();
    fixture.detectChanges();
    expect(own().checked).toBeFalse();
    expect(part().checked).toBeTrue();
  });
});

describe('RecipeDetailComponent units', () => {
  const UNITS_RECIPE = {
    ...Recipes[0],
    slug: 'units-soup',
    title: 'Units Soup',
    servings: 2,
    ingredients: [
      { qty: 2, unit: 'cup', name: 'stock', aisle: 'pantry' as const },
      { qty: 3, unit: '', name: 'onions', aisle: 'produce' as const },
    ],
    components: [],
  };
  let fixture: ComponentFixture<RecipeDetailComponent>;
  let el: HTMLElement;

  async function setup(): Promise<void> {
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(new FakeRecipeRepository([UNITS_RECIPE]))],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', UNITS_RECIPE.slug);
    fixture.detectChanges();
    el = fixture.nativeElement;
  }

  const amounts = (): string[] =>
    Array.from(el.querySelectorAll('.ing-amount')).map((n) => (n.textContent ?? '').trim());
  const unitButton = (label: string) =>
    Array.from(el.querySelectorAll<HTMLButtonElement>('.unit-toggle button')).find(
      (b) => b.textContent?.trim() === label,
    )!;
  const choose = (label: string) => {
    unitButton(label).click();
    fixture.detectChanges();
  };

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('offers a two-button US | Metric group with aria-pressed', async () => {
    await setup();
    expect(unitButton('US').getAttribute('aria-pressed')).toBe('true');
    expect(unitButton('Metric').getAttribute('aria-pressed')).toBe('false');
    choose('Metric');
    expect(unitButton('US').getAttribute('aria-pressed')).toBe('false');
    expect(unitButton('Metric').getAttribute('aria-pressed')).toBe('true');
  });

  it("shows a recipe's cups as ml after switching to Metric", async () => {
    await setup();
    expect(amounts()[0]).toBe('2 cups');
    choose('Metric');
    expect(amounts()[0]).toBe('470 ml');
  });

  it('scales and converts together', async () => {
    await setup();
    choose('Metric');
    (el.querySelector('button[aria-label="One more serving"]') as HTMLElement).click();
    (el.querySelector('button[aria-label="One more serving"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(amounts()[0]).toBe('950 ml');
  });

  it('leaves a countable row as written in Metric', async () => {
    await setup();
    choose('Metric');
    expect(amounts()[1]).toBe('3');
  });
});

describe('RecipeDetailComponent print', () => {
  it('calls window.print from the Print button', async () => {
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(new FakeRecipeRepository())],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
    const print = spyOn(window, 'print');
    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Print',
    );
    button!.click();
    expect(print).toHaveBeenCalledTimes(1);
  });
});

describe('RecipeDetailComponent notes', () => {
  afterEach(() => localStorage.removeItem('cookbook.deviceKey'));

  let fake: FakeRecipeRepository;
  let fixture: ComponentFixture<RecipeDetailComponent>;

  async function setup(writable: boolean, unlocked = false): Promise<void> {
    if (unlocked) localStorage.setItem('cookbook.deviceKey', JSON.stringify('sesame'));
    else localStorage.removeItem('cookbook.deviceKey');
    fake = new FakeRecipeRepository();
    fake.writable = writable;
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake)],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const field = (): HTMLTextAreaElement | null => el().querySelector('textarea');
  const addButton = (): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add note');

  function type(text: string): void {
    const f = field()!;
    f.value = text;
    f.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('hides the note field without unlock on a read-only build', async () => {
    await setup(false);
    expect(field()).toBeNull();
    expect(addButton()).toBeUndefined();
    // A recipe with no notes shows no panel at all.
    expect(el().querySelector('.notes')).toBeNull();
    // One that has notes still shows them, read-only.
    const noted = Recipes.find((r) => r.notes.length > 0)!;
    fixture.componentRef.setInput('slug', noted.slug);
    fixture.detectChanges();
    expect(el().querySelector('.notes')?.textContent).toContain(noted.notes[0]);
    expect(field()).toBeNull();
  });

  it('offers a labelled field, disabled until there is text', async () => {
    await setup(true);
    expect(el().querySelector('label')?.textContent).toBeDefined();
    expect(el().textContent).toContain('Add a note');
    expect(field()!.labels?.[0]?.textContent).toContain('Add a note');
    expect(addButton()!.disabled).toBeTrue();
    type('   ');
    expect(addButton()!.disabled).toBeTrue();
    type('more cumin');
    expect(addButton()!.disabled).toBeFalse();
  });

  it('adds a note and shows it', async () => {
    await setup(true);
    type('more cumin');
    addButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.notes')?.textContent).toContain('more cumin');
    expect(field()!.value).toBe('');
  });

  it('shows the error and keeps the text on failure', async () => {
    await setup(true);
    type('more cumin');
    fake.failNext({ status: 409, error: { message: 'This recipe has too many notes.' } });
    addButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.note-error')?.textContent).toContain('This recipe has too many notes.');
    expect(field()!.value).toBe('more cumin');
    expect(el().querySelector('.notes')?.textContent).not.toContain('more cumin');
  });

  it('keeps the text and says so when the recipe is gone', async () => {
    await setup(true);
    type('more cumin');
    spyOn(TestBed.inject(RecipeStore), 'addNote').and.resolveTo(false);
    addButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.note-error')?.textContent).toContain('That recipe no longer exists.');
    expect(field()!.value).toBe('more cumin');
  });

  it('explains a lost unlock after the form hides on a 403', async () => {
    await setup(false, true);
    expect(field()).not.toBeNull();
    type('more cumin');
    fake.failNext({ status: 403 });
    addButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(field()).toBeNull();
    expect(el().querySelector('.note-error')?.textContent).toContain('Unlock it again from the footer.');
  });

  it('uses the lockout minutes from the device store on a 429', async () => {
    await setup(true);
    type('x');
    fake.failNext(new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '60' }) }));
    addButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.note-error')?.textContent).toContain('Try again in 1 minute.');
  });
});
