import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CookbookStore } from '../../core/stores/cookbook.store';
import { RecipeStore } from '../../core/stores/recipe.store';
import { Recipes } from '../../core/mock/recipes.mock';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../../core/testing/fake-repositories';
import { LibraryComponent } from './library.component';

async function render(cookbooks?: FakeCookbookRepository, recipes?: FakeRecipeRepository) {
  localStorage.clear();
  TestBed.configureTestingModule({
    imports: [LibraryComponent],
    providers: [provideFakeRecipes(recipes), provideFakeCookbooks(cookbooks), provideRouter([])],
  });
  await TestBed.inject(RecipeStore).whenLoaded();
  await TestBed.inject(CookbookStore).whenLoaded();
  const fixture = TestBed.createComponent(LibraryComponent);
  fixture.detectChanges();
  return fixture;
}

const triggers = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>('[data-facet-trigger]')];

describe('LibraryComponent cookbook facet', () => {
  afterEach(() => localStorage.clear());

  it('hides the Cookbook facet with one cookbook', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    expect(triggers(el).some((t) => t.dataset['facetTrigger'] === 'cookbook')).toBe(false);
  });

  it('shows it first, named, with two', async () => {
    const fixture = await render(
      new FakeCookbookRepository([
        { id: 'sam', name: "Sam's Cookbook" },
        { id: 'bob', name: "Bob's Cookbook" },
      ]),
    );
    const el = fixture.nativeElement as HTMLElement;
    const first = triggers(el)[0];
    expect(first.dataset['facetTrigger']).toBe('cookbook');
    expect(first.textContent).toContain('Cookbook');
    first.click();
    fixture.detectChanges();
    const labels = [...el.querySelectorAll('#facet-cookbook .facet-option')].map((o) =>
      o.textContent?.trim(),
    );
    expect(labels).toEqual(["Sam's Cookbook", "Bob's Cookbook"]);
  });
});

describe('LibraryComponent surprise me', () => {
  afterEach(() => localStorage.clear());

  const button = (el: HTMLElement) =>
    [...el.querySelectorAll<HTMLButtonElement>('.controls button')].find((b) =>
      b.textContent?.includes('Surprise me'),
    )!;

  it('disables Surprise me with no results', async () => {
    const fixture = await render();
    TestBed.inject(RecipeStore).setQuery('zzz-no-such-thing');
    fixture.detectChanges();
    expect(button(fixture.nativeElement).disabled).toBe(true);
  });

  it('navigates to the picked recipe', async () => {
    const fixture = await render();
    const store = TestBed.inject(RecipeStore);
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    spyOn(store, 'surprise').and.returnValue(store.recipes()[0]);
    const el = fixture.nativeElement as HTMLElement;
    expect(button(el).disabled).toBe(false);
    button(el).click();
    expect(navigate).toHaveBeenCalledWith(['/recipes', store.recipes()[0].slug]);
  });
});

describe('LibraryComponent what can I make', () => {
  afterEach(() => localStorage.clear());

  const ing = (name: string) => ({ qty: 1, unit: '', name, aisle: 'pantry' as const });

  it('switches the placeholder and shows "Uses 2 of 3" on cards in have mode', async () => {
    const recipe = {
      ...Recipes[0],
      slug: 'stir-fry',
      title: 'Stir fry',
      component: false,
      components: undefined,
      ingredients: [ing('chicken'), ing('rice'), ing('broccoli'), ing('salt')],
    };
    const fixture = await render(undefined, new FakeRecipeRepository([recipe]));
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('.search input')!;
    const toggle = [...el.querySelectorAll<HTMLButtonElement>('.controls button')].find((b) =>
      b.textContent?.includes('What can I make?'),
    )!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(el.textContent).not.toContain('Uses');

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(input.placeholder).toBe('List what you have: chicken, rice, broccoli');

    TestBed.inject(RecipeStore).setQuery('chicken, rice');
    fixture.detectChanges();
    expect(el.querySelector('.card-meta')?.textContent).toContain('Uses 2 of 3');
  });
});

describe('LibraryComponent sort', () => {
  afterEach(() => localStorage.clear());

  it('changes the order from the Sort select', async () => {
    const base = Recipes[0];
    const fixture = await render(
      undefined,
      new FakeRecipeRepository([
        { ...base, slug: 'fresh', title: 'Fresh', cooked: 1, lastCooked: '2026-10-30T00:00:00.000Z' },
        { ...base, slug: 'stale', title: 'Stale', cooked: 1, lastCooked: '2026-01-01T00:00:00.000Z' },
      ]),
    );
    const el = fixture.nativeElement as HTMLElement;
    const store = TestBed.inject(RecipeStore);
    const titlesOf = () =>
      [...el.querySelectorAll('.grid .card h3')].map((h) => h.textContent?.trim());
    expect(titlesOf()).toEqual(['Fresh', 'Stale']);
    const select = el.querySelector<HTMLSelectElement>('.sort select')!;
    expect([...select.options].map((o) => o.textContent?.trim())).toEqual([
      'Library order',
      'Not cooked lately',
    ]);
    select.value = 'stale';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(store.sort()).toBe('stale');
    expect(titlesOf()).toEqual(['Stale', 'Fresh']);
  });
});

describe('LibraryComponent favorites', () => {
  afterEach(() => localStorage.clear());

  const seed = () => [
    { ...Recipes[0], slug: 'fav', title: 'Fav', favorite: true },
    { ...Recipes[0], slug: 'plain', title: 'Plain' },
  ];
  const card = (el: HTMLElement, title: string) =>
    [...el.querySelectorAll<HTMLElement>('.grid .card')].find(
      (c) => c.querySelector('h3')?.textContent?.trim() === title,
    )!;

  it('shows a static star, not a button, on a locked device', async () => {
    const fake = new FakeRecipeRepository(seed());
    fake.writable = false;
    const fixture = await render(undefined, fake);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button.fav-toggle')).toBeNull();
    const star = card(el, 'Fav').querySelector('.fav-static');
    expect(star?.getAttribute('aria-label')).toBe('Favorite');
    expect(star?.getAttribute('fontIcon')).toBe('star');
    expect(card(el, 'Plain').querySelector('.fav-static')).toBeNull();
  });

  it('toggles through the store on an unlocked device', async () => {
    localStorage.clear();
    localStorage.setItem('cookbook.deviceKey', JSON.stringify('sesame'));
    const fake = new FakeRecipeRepository(seed());
    fake.writable = false;
    TestBed.configureTestingModule({
      imports: [LibraryComponent],
      providers: [provideFakeRecipes(fake), provideFakeCookbooks(), provideRouter([])],
    });
    await TestBed.inject(RecipeStore).whenLoaded();
    const fixture = TestBed.createComponent(LibraryComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = card(el, 'Plain').querySelector<HTMLButtonElement>('button.fav-toggle')!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(TestBed.inject(RecipeStore).isFav('plain')).toBeTrue();
    expect(card(el, 'Plain').querySelector('button.fav-toggle')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('restores the star silently when the write fails', async () => {
    const fake = new FakeRecipeRepository(seed());
    const fixture = await render(undefined, fake);
    const el = fixture.nativeElement as HTMLElement;
    fake.failNext({ status: 503 });
    card(el, 'Fav').querySelector<HTMLButtonElement>('button.fav-toggle')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(card(el, 'Fav').querySelector('button.fav-toggle')!.getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});
