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
