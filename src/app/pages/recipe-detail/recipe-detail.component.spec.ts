import { DatePipe } from '@angular/common';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RecipeStore } from '../../core/stores/recipe.store';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../../core/testing/fake-repositories';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { Recipes } from '../../core/mock/recipes.mock';
import { Recipe } from '../../core/model/recipes.model';
import { photoSrcset, photoUrl } from '../../core/photos';
import { RecipeDetailComponent } from './recipe-detail.component';

const SLUG = 'grandmas-chili';

/** Opens the More menu and returns the item with this label, which lives in the overlay. */
function menuItem(fixture: ComponentFixture<RecipeDetailComponent>, label: string): HTMLElement | undefined {
  const trigger = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-label="More"]');
  if (!document.querySelector('.mat-mdc-menu-panel')) {
    trigger?.click();
    fixture.detectChanges();
  }
  return Array.from(document.querySelectorAll<HTMLElement>('.mat-mdc-menu-panel .mat-mdc-menu-item')).find(
    (item) => item.textContent?.trim() === label,
  );
}

describe('RecipeDetailComponent archive', () => {
  let fake: FakeRecipeRepository;
  let fixture: ComponentFixture<RecipeDetailComponent>;
  let navigate: jasmine.Spy;

  async function setup(writable = true): Promise<void> {
    fake = new FakeRecipeRepository();
    fake.writable = writable;
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
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
    menuItem(fixture, 'Archive')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('has no archive item when the build is not writable', async () => {
    await setup(false);
    expect(menuItem(fixture, 'Archive')).toBeUndefined();
    expect(menuItem(fixture, 'Print')).toBeDefined();
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
      providers: [provideRouter([]), ...provideFakeRecipes(new FakeRecipeRepository()), ...provideFakeCookbooks()],
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
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const edit = (el: HTMLElement): HTMLAnchorElement | null => el.querySelector('a[aria-label="Edit"]');

  it('links to the editor when writable', async () => {
    expect(edit(await render(true))?.getAttribute('href')).toBe(`/recipes/${SLUG}/edit`);
  });

  it('has no Edit link when not writable', async () => {
    expect(edit(await render(false))).toBeNull();
  });
});

describe('RecipeDetailComponent source link', () => {
  async function render(sourceUrl?: string): Promise<HTMLElement> {
    const base = Recipes.find((r) => r.slug === SLUG)!;
    const fake = new FakeRecipeRepository([{ ...base, ...(sourceUrl ? { sourceUrl } : {}) }]);
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
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

describe('RecipeDetailComponent printed source', () => {
  async function render(extra: Partial<Recipe>, books = [{ id: 'goddard', name: 'Goddard Family Cookbook' }]): Promise<HTMLElement> {
    const base = Recipes.find((r) => r.slug === SLUG)!;
    const { subtitle: _, ...plain } = base;
    const fake = new FakeRecipeRepository([{ ...plain, ...extra }]);
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks(new FakeCookbookRepository(books))],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    await TestBed.inject(CookbookStore).whenLoaded();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const page = (el: HTMLElement) => el.querySelector('.detail-page')?.textContent?.replace(/\s+/g, ' ').trim();
  const credit = (el: HTMLElement) => el.querySelector('.detail-credit')?.textContent?.trim();

  it('names the book and the page the recipe is printed on', async () => {
    const el = await render({ sourcePage: 112, cookbooks: ['goddard', 'sam'] });
    expect(page(el)).toMatch(/^Goddard Family Cookbook\s*·\s*page 112$/);
    expect(el.querySelector('.detail-page a')?.textContent?.trim()).toBe('Goddard Family Cookbook');
  });

  it('still gives the page when the book is no longer in the app', async () => {
    expect(page(await render({ sourcePage: 7, cookbooks: ['gone'] }))).toBe('Page 7 of the printed book');
  });

  it('shows no page for a recipe that has none', async () => {
    expect(page(await render({ cookbooks: ['goddard'] }))).toBeUndefined();
  });

  it('credits the contributor when there is no credit line', async () => {
    expect(credit(await render({ contributor: 'Lisa Reisig' }))).toBe('From Lisa Reisig');
  });

  it('keeps the credit line when there is one', async () => {
    const el = await render({ contributor: 'Lisa Reisig', subtitle: 'From Lisa, daughter of Elda Mae' });
    expect(credit(el)).toBe('From Lisa, daughter of Elda Mae');
  });

  it('names the other cookbooks beside the credit, each opening its shelf in the library', async () => {
    const el = await render({ subtitle: 'In memory of Bernadine', cookbooks: ['goddard', 'sams'] }, [
      { id: 'goddard', name: 'Goddard Family Cookbook' },
      { id: 'sams', name: "Sam's Cookbook" },
    ]);
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('.detail-meta .shelf-link'));
    expect(links.map((a) => a.textContent?.trim())).toEqual(['Goddard Family Cookbook', "Sam's Cookbook"]);
    links[1].click();
    expect([...TestBed.inject(RecipeStore).selectedCookbooks()]).toEqual(['sams']);
  });

  it('leaves the printed book out of the credit line, which has its own', async () => {
    const el = await render({ sourcePage: 9, cookbooks: ['goddard'] });
    expect(el.querySelectorAll('.detail-meta .shelf-link').length).toBe(0);
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
      providers: [provideRouter([]), ...provideFakeRecipes(new FakeRecipeRepository([PARENT, SAUCE])), ...provideFakeCookbooks()],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
  });

  it('lists each part under its own name, skipping a missing one, with its steps on their own', () => {
    const sections = el().querySelectorAll('.component-section');
    expect(sections.length).toBe(1);
    expect(text(sections[0].querySelector('h3'))).toBe('For the sauce');
    expect(text(sections[0])).toContain('butter');
    const steps = el().querySelectorAll('.part-steps');
    expect(steps.length).toBe(1);
    expect(text(steps[0].querySelector('h3'))).toBe('For the sauce');
    expect(text(steps[0])).toContain('Melt the butter.');
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

  it("lists a part after the recipe's own ingredients, and its steps before the recipe's own", () => {
    const ownList = el().querySelector('.ingredients-card > .ingredient-list')!;
    const part = el().querySelector('.component-section')!;
    expect(ownList.compareDocumentPosition(part) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const partSteps = el().querySelector('.part-steps')!;
    const ownSteps = el().querySelector('.steps-body > .step-list')!;
    expect(partSteps.compareDocumentPosition(ownSteps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps a parent ingredient\'s check apart from a component\'s', () => {
    const own = () => el().querySelector<HTMLInputElement>('.ingredients-card > .ingredient-list input[type=checkbox]')!;
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
      providers: [provideRouter([]), ...provideFakeRecipes(new FakeRecipeRepository([UNITS_RECIPE])), ...provideFakeCookbooks()],
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

  it('labels the units toggle as a group of its own', async () => {
    await setup();
    const group = el.querySelector('.unit-toggle') as HTMLElement;
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Units');
    expect(group.querySelector('.stepper')).toBeNull();
  });

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
      providers: [provideRouter([]), ...provideFakeRecipes(new FakeRecipeRepository()), ...provideFakeCookbooks()],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
    const print = spyOn(window, 'print');
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-label="Print"]')!.click();
    expect(print).toHaveBeenCalledTimes(1);
    menuItem(fixture, 'Print')!.click();
    expect(print).toHaveBeenCalledTimes(2);
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
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
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

  /**
   * Opens the field the "Add a note" button hides until wanted, and waits for
   * ngModel's first write, which would otherwise wipe what is typed next.
   */
  async function open(): Promise<void> {
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add a note')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function type(text: string): Promise<void> {
    if (!field()) await open();
    const f = field()!;
    f.value = text;
    f.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('marks an empty notes panel so print leaves it out', async () => {
    await setup(true);
    // SLUG's recipe has no notes; a writable build still shows the panel to add one.
    expect(el().querySelector('.notes')?.classList).toContain('is-empty');
    const noted = Recipes.find((r) => r.notes.length > 0)!;
    fixture.componentRef.setInput('slug', noted.slug);
    fixture.detectChanges();
    expect(el().querySelector('.notes')?.classList).not.toContain('is-empty');
  });

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

  it('says there are none yet, and opens a labelled field disabled until there is text', async () => {
    await setup(true);
    expect(el().querySelector('.notes-none')?.textContent?.trim()).toBe('None yet');
    expect(field()).toBeNull();
    await open();
    expect(el().querySelector('label')?.textContent).toBeDefined();
    expect(field()!.labels?.[0]?.textContent).toContain('Add a note');
    expect(addButton()!.disabled).toBeTrue();
    await type('   ');
    expect(addButton()!.disabled).toBeTrue();
    await type('more cumin');
    expect(addButton()!.disabled).toBeFalse();
  });

  it('adds a note and shows it', async () => {
    await setup(true);
    await type('more cumin');
    addButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.notes')?.textContent).toContain('more cumin');
    expect(field()!.value).toBe('');
  });

  it('shows the error and keeps the text on failure', async () => {
    await setup(true);
    await type('more cumin');
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
    await type('more cumin');
    spyOn(TestBed.inject(RecipeStore), 'addNote').and.resolveTo(false);
    addButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.note-error')?.textContent).toContain('That recipe no longer exists.');
    expect(field()!.value).toBe('more cumin');
  });

  it('explains a lost unlock after the form hides on a 403', async () => {
    await setup(false, true);
    await open();
    expect(field()).not.toBeNull();
    await type('more cumin');
    fake.failNext({ status: 403 });
    addButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(field()).toBeNull();
    expect(el().querySelector('.note-error')?.textContent).toContain('Unlock it again from the footer.');
  });

  it('uses the lockout minutes from the device store on a 429', async () => {
    await setup(true);
    await type('x');
    fake.failNext(new HttpErrorResponse({ status: 429, headers: new HttpHeaders({ 'Retry-After': '60' }) }));
    addButton()!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.note-error')?.textContent).toContain('Try again in 1 minute.');
  });
});

describe('RecipeDetailComponent mark as cooked', () => {
  afterEach(() => localStorage.removeItem('cookbook.deviceKey'));

  let fake: FakeRecipeRepository;
  let fixture: ComponentFixture<RecipeDetailComponent>;
  const SLUG = Recipes[0].slug;

  async function setup(unlocked: boolean): Promise<void> {
    if (unlocked) localStorage.setItem('cookbook.deviceKey', JSON.stringify('sesame'));
    else localStorage.removeItem('cookbook.deviceKey');
    fake = new FakeRecipeRepository();
    fake.writable = false;
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent?.trim() === label);
  const rail = (): string => (el().querySelector('.rail-activity')?.textContent ?? '').replace(/\s+/g, ' ');

  it('marks cooked after Yes and shows the new count and date', async () => {
    await setup(true);
    const before = Recipes[0].cooked;
    expect(rail()).toContain(`Cooked ${before} times`);
    expect(rail()).not.toContain('last on');
    button('Mark as cooked')!.click();
    fixture.detectChanges();
    expect(el().textContent).toContain('Cooked it today?');
    button('Yes')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rail()).toContain(`Cooked ${before + 1} times`);
    const stamp = TestBed.inject(RecipeStore).bySlug(SLUG)!.lastCooked!;
    expect(rail()).toContain(`last on ${new DatePipe('en-US').transform(stamp, 'MMM d')}`);
    expect(el().textContent).not.toContain('Cooked it today?');
  });

  it('counts once when Yes is tapped twice', async () => {
    await setup(true);
    const spy = spyOn(fake, 'markCooked').and.callThrough();
    button('Mark as cooked')!.click();
    fixture.detectChanges();
    const yes = button('Yes')!;
    yes.click();
    yes.click();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('Cancel closes the confirm without writing', async () => {
    await setup(true);
    const spy = spyOn(fake, 'markCooked').and.callThrough();
    button('Mark as cooked')!.click();
    fixture.detectChanges();
    button('Cancel')!.click();
    fixture.detectChanges();
    expect(spy).not.toHaveBeenCalled();
    expect(el().textContent).not.toContain('Cooked it today?');
  });

  it('hides Mark as cooked when the device cannot save', async () => {
    await setup(false);
    expect(button('Mark as cooked')).toBeUndefined();
  });

  it('explains a lost unlock after the controls hide on a 403', async () => {
    await setup(true);
    button('Mark as cooked')!.click();
    fixture.detectChanges();
    fake.failNext({ status: 403 });
    button('Yes')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button('Mark as cooked')).toBeUndefined();
    // Not left armed for a later re-unlock.
    expect((fixture.componentInstance as unknown as { confirmingCooked(): boolean }).confirmingCooked()).toBeFalse();
    expect(el().querySelector('.cooked-error')?.textContent).toContain('Unlock it again from the footer.');
  });
});

describe('RecipeDetailComponent favorite', () => {
  afterEach(() => localStorage.removeItem('cookbook.deviceKey'));

  let fake: FakeRecipeRepository;
  let fixture: ComponentFixture<RecipeDetailComponent>;
  const SLUG = Recipes[0].slug;

  async function setup(unlocked: boolean, favorite = false): Promise<void> {
    if (unlocked) localStorage.setItem('cookbook.deviceKey', JSON.stringify('sesame'));
    else localStorage.removeItem('cookbook.deviceKey');
    fake = new FakeRecipeRepository([{ ...Recipes[0], favorite }]);
    fake.writable = false;
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
  }

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll('button')).find((b) => b.getAttribute('aria-label')?.includes(label));

  it('toggles favorite on an unlocked device', async () => {
    await setup(true);
    const spy = spyOn(fake, 'setFavorite').and.callThrough();
    const toggle = button('Add to favorites')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledOnceWith(SLUG, true);
    expect(button('Favorite')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('explains a failed toggle', async () => {
    await setup(true);
    fake.failNext({ status: 403 });
    button('Add to favorites')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.fav-error')?.textContent).toContain('Unlock it again from the footer.');
  });

  it('shows a static star on a locked device, and nothing when not a favorite', async () => {
    await setup(false, true);
    expect(button('favorites')).toBeUndefined();
    const star = el().querySelector('.tools .fav-static');
    expect(star?.getAttribute('aria-label')).toBe('Favorite');
    expect(star?.getAttribute('fontIcon')).toBe('star');
    TestBed.resetTestingModule();
    await setup(false, false);
    expect(el().querySelector('.fav-static')).toBeNull();
    expect(button('favorites')).toBeUndefined();
  });
});

describe('RecipeDetailComponent photo', () => {
  const PHOTO = 'https://example.com/chili.jpg';

  it('shows the photo resized by the API, falling back to the original and then the placeholder', async () => {
    const fake = new FakeRecipeRepository(
      Recipes.map((r) => (r.slug === SLUG ? { ...r, photo: PHOTO } : r)),
    );
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const img = () => el.querySelector<HTMLImageElement>('.hero img');

    expect(img()!.getAttribute('src')).toBe(photoUrl(PHOTO, 1200));
    expect(img()!.getAttribute('srcset')).toBe(photoSrcset(PHOTO, [800, 1200]));
    expect(img()!.getAttribute('sizes')).toBe('100vw');

    img()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(img()!.getAttribute('src')).toBe(PHOTO);
    expect(img()!.hasAttribute('srcset')).toBe(false);

    img()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el.querySelector('.hero')).toBeNull();
    // With no photo to show, a writable build offers to add one.
    expect(el.querySelector('.photo-slot')?.getAttribute('href')).toBe(`/recipes/${SLUG}/edit`);
  });

  it('crops the photo around its focus point', async () => {
    const fake = new FakeRecipeRepository(
      Recipes.map((r) => (r.slug === SLUG ? { ...r, photo: PHOTO, photoFocus: { x: 20, y: 75 } } : r)),
    );
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
    const img = (fixture.nativeElement as HTMLElement).querySelector<HTMLImageElement>('.hero img')!;
    expect(img.style.objectPosition).toBe('20% 75%');
  });
});

describe('RecipeDetailComponent without a photo', () => {
  async function render(writable: boolean): Promise<ComponentFixture<RecipeDetailComponent>> {
    const fake = new FakeRecipeRepository(
      Recipes.map((r) => (r.slug === SLUG ? { ...r, photo: undefined } : r)),
    );
    fake.writable = writable;
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', SLUG);
    fixture.detectChanges();
    return fixture;
  }

  it('has no hero, and offers to add a photo where the build can', async () => {
    const el = (await render(true)).nativeElement as HTMLElement;
    expect(el.querySelector('.hero')).toBeNull();
    expect(el.querySelector('.photo-slot-title')?.textContent?.trim()).toBe('Add a photo');
    expect(el.querySelector('.photo-slot-note')?.textContent?.trim()).toBe('next time you make it');
  });

  it('offers nothing in its place on a read-only build', async () => {
    const el = (await render(false)).nativeElement as HTMLElement;
    expect(el.querySelector('.photo-slot')).toBeNull();
  });

  it('puts the favorite and More in the action row, with print and edit in the menu', async () => {
    const fixture = await render(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.actions .tools button[aria-label="More"]')).not.toBeNull();
    expect(el.querySelector('button[aria-label="Print"]')).toBeNull();
    expect(menuItem(fixture, 'Print')).toBeDefined();
    expect(menuItem(fixture, 'Edit')?.getAttribute('href')).toBe(`/recipes/${SLUG}/edit`);
  });
});

describe('RecipeDetailComponent steps', () => {
  const base = Recipes.find((r) => r.slug === SLUG)!;
  const STEW: Recipe = {
    ...base,
    servings: 4,
    servingsUnit: 'bowls',
    ingredients: [
      { qty: 1, unit: 'can', name: 'tomato juice', aisle: 'pantry' },
      { qty: 2, unit: 'tbsp', name: 'dried onion', aisle: 'pantry' },
      { qty: null, unit: '', name: 'salt', aisle: 'pantry' },
    ],
    steps: ['Add in tomato juice to thin sauce.', 'Brown the dried onions with salt.'],
    components: [],
  };
  let fixture: ComponentFixture<RecipeDetailComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  async function setup(recipe: Recipe = STEW, writable = true): Promise<void> {
    const fake = new FakeRecipeRepository([recipe]);
    fake.writable = writable;
    TestBed.configureTestingModule({
      imports: [RecipeDetailComponent],
      providers: [provideRouter([]), ...provideFakeRecipes(fake), ...provideFakeCookbooks()],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    fixture = TestBed.createComponent(RecipeDetailComponent);
    fixture.componentRef.setInput('slug', recipe.slug);
    fixture.detectChanges();
  }

  const mentions = () =>
    Array.from(el().querySelectorAll<HTMLElement>('.mention')).map((m) => [m.textContent, m.dataset['amount']]);

  it('dots each ingredient a step names, carrying its amount, and leaves the text intact', async () => {
    await setup();
    expect(mentions()).toEqual([
      ['tomato juice', '1 can tomato juice'],
      ['dried onions', '2 tbsp dried onion'],
    ]);
    expect(el().querySelector('.step-list li p')?.textContent).toBe('Add in tomato juice to thin sauce.');
    expect(el().querySelector('.step-hint')?.textContent).toContain('Dotted words show their amount on hover or tap.');
  });

  it('scales the amount a dotted word shows with the servings', async () => {
    await setup();
    (el().querySelector('[aria-label="One more serving"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(mentions()[1][1]).toBe('2½ tbsp dried onion');
  });

  it('says what the recipe makes', async () => {
    await setup();
    expect(el().querySelector('.makes-unit')?.textContent?.trim()).toBe('bowls');
  });

  it('points a thin method at the editor, on a writable build only', async () => {
    const thin = {
      ...STEW,
      ingredients: Array.from({ length: 8 }, (_, i) => ({ qty: 1, unit: '', name: `thing ${i}`, aisle: 'pantry' as const })),
      steps: ['Mix all together.'],
    };
    await setup(thin);
    const note = el().querySelector('.method-note');
    expect(note?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Just one step for 8 ingredients. Fill in the method');
    expect(note?.querySelector('a')?.getAttribute('href')).toBe(`/recipes/${SLUG}/edit`);
    TestBed.resetTestingModule();
    await setup(thin, false);
    expect(el().querySelector('.method-note')).toBeNull();
  });

  it('clears every check at once', async () => {
    await setup();
    const boxes = () => Array.from(el().querySelectorAll<HTMLInputElement>('.ingredient-list input[type=checkbox]'));
    boxes()[0].click();
    boxes()[1].click();
    fixture.detectChanges();
    const clear = el().querySelector<HTMLButtonElement>('.clear-checks')!;
    expect(clear.textContent?.trim()).toBe('Clear checks');
    clear.click();
    fixture.detectChanges();
    expect(boxes().some((b) => b.checked)).toBeFalse();
    expect(el().querySelector('.clear-checks')).toBeNull();
  });

  it('switches the phone list with tabs that count each one', async () => {
    await setup();
    const tabs = Array.from(el().querySelectorAll<HTMLButtonElement>('.phone-tabs button'));
    expect(tabs.map((t) => t.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'Ingredients · 3',
      'Steps · 2',
      `Notes · ${STEW.notes.length}`,
    ]);
    expect(el().querySelector('.detail')?.getAttribute('data-tab')).toBe('ingredients');
    tabs[1].click();
    fixture.detectChanges();
    expect(el().querySelector('.detail')?.getAttribute('data-tab')).toBe('steps');
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
  });
});
