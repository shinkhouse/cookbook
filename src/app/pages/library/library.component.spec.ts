import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { GAP_FACET } from '../../core/facets';
import { photoSrcset, photoUrl } from '../../core/photos';
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

const titleText = (el: HTMLElement) => el.querySelector('h1')?.textContent?.trim();

const cardTitles = (el: HTMLElement) =>
  [...el.querySelectorAll('.grid .card h3')].map((h) => h.textContent?.trim());

describe('LibraryComponent cookbook switcher', () => {
  afterEach(() => localStorage.clear());

  const twoBooks = () =>
    new FakeCookbookRepository([
      { id: 'sam', name: "Sam's Cookbook" },
      { id: 'bob', name: "Bob's Cookbook" },
    ]);
  const filed = () =>
    new FakeRecipeRepository([
      { ...Recipes[0], slug: 'sams', title: 'Sams', cookbooks: ['sam'] },
      { ...Recipes[0], slug: 'bobs', title: 'Bobs', cookbooks: ['bob'] },
    ]);
  const shelfTrigger = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('h1 button');
  const shelfOptions = (el: HTMLElement) => [
    ...el.querySelectorAll<HTMLButtonElement>('.shelf-menu [role="menuitemradio"]'),
  ];

  it('is a plain title with one cookbook', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    expect(titleText(el)).toBe('All Cookbooks');
    expect(shelfTrigger(el)).toBeNull();
  });

  it('switches cookbook from the title instead of a facet', async () => {
    const fixture = await render(twoBooks(), filed());
    const el = fixture.nativeElement as HTMLElement;
    expect(triggers(el).some((t) => t.dataset['facetTrigger'] === 'cookbook')).toBe(false);
    expect(shelfTrigger(el)!.getAttribute('aria-expanded')).toBe('false');

    shelfTrigger(el)!.click();
    fixture.detectChanges();
    expect(shelfOptions(el).map((o) => o.textContent?.trim())).toEqual([
      'All Cookbooks',
      "Sam's Cookbook",
      "Bob's Cookbook",
    ]);
    expect(shelfOptions(el)[0].getAttribute('aria-checked')).toBe('true');

    shelfOptions(el)[2].click();
    fixture.detectChanges();
    expect(titleText(el)).toBe("Bob's Cookbook");
    expect(cardTitles(el)).toEqual(['Bobs']);
    expect(el.querySelector('.shelf-menu')).toBeNull();

    shelfTrigger(el)!.click();
    fixture.detectChanges();
    shelfOptions(el)[0].click();
    fixture.detectChanges();
    expect(titleText(el)).toBe('All Cookbooks');
    expect(cardTitles(el)).toEqual(['Sams', 'Bobs']);
  });

  it('keeps the chosen cookbook through Clear filters', async () => {
    const fixture = await render(twoBooks(), filed());
    const el = fixture.nativeElement as HTMLElement;
    shelfTrigger(el)!.click();
    fixture.detectChanges();
    shelfOptions(el)[2].click();
    TestBed.inject(RecipeStore).setQuery('zzz-no-such-thing');
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.empty .btn-outline')!.click();
    fixture.detectChanges();
    expect(titleText(el)).toBe("Bob's Cookbook");
    expect(cardTitles(el)).toEqual(['Bobs']);
  });
});

describe('LibraryComponent favorites toggle', () => {
  afterEach(() => localStorage.clear());

  it('leads the filter row', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    const first = el.querySelector<HTMLButtonElement>('.facet-bar button')!;
    expect(first.textContent).toContain('Favorites');
    expect(first.getAttribute('aria-pressed')).toBe('false');

    first.click();
    fixture.detectChanges();
    expect(first.getAttribute('aria-pressed')).toBe('true');
    expect(TestBed.inject(RecipeStore).favsOnly()).toBe(true);
  });
});

describe('LibraryComponent More menu', () => {
  afterEach(() => localStorage.clear());

  const tagged = (tags: string[]) =>
    new FakeRecipeRepository([{ ...Recipes[0], slug: 'a', title: 'A', tags }]);
  const ids = (el: HTMLElement) => triggers(el).map((t) => t.dataset['facetTrigger']);

  it('folds Ingredient and Other into More, and chips keep their own names', async () => {
    const fixture = await render(undefined, tagged(['dinner', 'broccoli', 'zzz-odd']));
    const el = fixture.nativeElement as HTMLElement;
    expect(ids(el)).toContain('more');
    expect(ids(el)).not.toContain('ingredient');
    expect(ids(el)).not.toContain('other');

    const more = triggers(el).find((t) => t.dataset['facetTrigger'] === 'more')!;
    more.click();
    fixture.detectChanges();
    const groups = [...el.querySelectorAll('#facet-more .facet-group-label')].map((h) =>
      h.textContent?.trim(),
    );
    expect(groups).toEqual(['Ingredient', 'Other']);

    const broccoli = [...el.querySelectorAll('#facet-more .facet-option')].find((o) =>
      o.textContent?.includes('Broccoli'),
    )!;
    broccoli.querySelector<HTMLInputElement>('input')!.click();
    fixture.detectChanges();
    expect(more.querySelector('.facet-count')?.textContent?.trim()).toBe('1');
    expect(el.querySelector('.active-filters')?.textContent).toContain('Ingredient');
    expect(TestBed.inject(RecipeStore).isTagSelected('broccoli')).toBe(true);
  });

  it('leaves a lone overflow facet as itself', async () => {
    const el = (await render(undefined, tagged(['dinner', 'broccoli']))).nativeElement;
    expect(ids(el)).toContain('ingredient');
    expect(ids(el)).not.toContain('more');
  });
});

describe('LibraryComponent needs-work facet', () => {
  afterEach(() => localStorage.clear());

  const hasGapFacet = (el: HTMLElement) =>
    triggers(el).some((t) => t.dataset['facetTrigger'] === GAP_FACET);

  it('offers Needs work where recipes can be edited', async () => {
    const el = (await render()).nativeElement as HTMLElement;
    expect(hasGapFacet(el)).toBe(true);
  });

  it('leaves Needs work off the read-only site', async () => {
    const recipes = new FakeRecipeRepository();
    recipes.writable = false;
    const el = (await render(undefined, recipes)).nativeElement as HTMLElement;
    expect(hasGapFacet(el)).toBe(false);
    expect(triggers(el).length).toBeGreaterThan(0);
  });
});

describe('LibraryComponent cards', () => {
  afterEach(() => localStorage.clear());

  const photographed = (n: number) =>
    new FakeRecipeRepository(
      Array.from({ length: n }, (_, i) => ({
        ...Recipes[0],
        slug: `r${i}`,
        title: `R${i}`,
        photo: `https://example.com/r${i}.jpg`,
      })),
    );

  it('leaves the title as the one link to a recipe for assistive tech and the keyboard', async () => {
    const el = (await render(undefined, photographed(1))).nativeElement as HTMLElement;
    const photoLink = el.querySelector('.card .card-link')!;
    expect(photoLink.getAttribute('aria-hidden')).toBe('true');
    expect(photoLink.getAttribute('tabindex')).toBe('-1');
    expect(el.querySelector('.card h3 a')?.textContent?.trim()).toBe('R0');
  });

  it('heads the results, so card titles do not skip a level', async () => {
    const el = (await render(undefined, photographed(2))).nativeElement as HTMLElement;
    expect(el.querySelector('.result-bar h2')?.textContent?.trim()).toBe('2 recipes');
  });

  it('shows photos resized by the API, falling back to the original and then the placeholder', async () => {
    const fixture = await render(undefined, photographed(1));
    const el = fixture.nativeElement as HTMLElement;
    const img = () => el.querySelector<HTMLImageElement>('.card-photo img');
    const original = 'https://example.com/r0.jpg';

    expect(img()!.getAttribute('src')).toBe(photoUrl(original, 400));
    expect(img()!.getAttribute('srcset')).toBe(photoSrcset(original, [400, 800]));
    expect(img()!.getAttribute('sizes')).toBeTruthy();

    img()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(img()!.getAttribute('src')).toBe(original);
    expect(img()!.hasAttribute('srcset')).toBe(false);

    img()!.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(img()).toBeNull();
    expect(el.querySelector('.card-photo app-index-card')).not.toBeNull();
  });

  it('shows a recipe with no photo as its index card', async () => {
    const recipe = { ...Recipes[0], slug: 'bare', title: 'Bare Chili', photo: undefined };
    const el = (await render(undefined, new FakeRecipeRepository([recipe]))).nativeElement as HTMLElement;
    const card = el.querySelector('.card-photo app-index-card');
    expect(card?.querySelector('.card-title')?.textContent?.trim()).toBe('Bare Chili');
    expect(card?.querySelectorAll('.card-lines li').length).toBeGreaterThan(0);
  });

  it('leaves a missing photo to the index card, and badges only what else is missing', async () => {
    const steps = ['Brown the beef.', 'Add the beans.', 'Simmer.'];
    const el = (
      await render(
        undefined,
        new FakeRecipeRepository([
          { ...Recipes[0], slug: 'whole', title: 'Whole', photo: undefined, steps },
          { ...Recipes[0], slug: 'bare', title: 'Bare', photo: undefined, steps: [] },
        ]),
      )
    ).nativeElement as HTMLElement;
    const badge = (title: string) =>
      [...el.querySelectorAll('.grid .card')]
        .find((c) => c.querySelector('h3')?.textContent?.trim() === title)!
        .querySelector('.gap-badge')
        ?.textContent?.trim();
    expect(badge('Whole')).toBeUndefined();
    expect(badge('Bare')).toBe('No method');
  });

  it('loads the first row of photos eagerly, the first at high priority', async () => {
    const el = (await render(undefined, photographed(5))).nativeElement as HTMLElement;
    const imgs = [...el.querySelectorAll<HTMLImageElement>('.card-photo img')];
    expect(imgs.map((i) => i.getAttribute('loading'))).toEqual([
      'eager',
      'eager',
      'eager',
      'lazy',
      'lazy',
    ]);
    expect(imgs.map((i) => i.getAttribute('fetchpriority'))).toEqual([
      'high',
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('LibraryComponent surprise me', () => {
  afterEach(() => localStorage.clear());

  const button = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('.controls button[aria-label="Surprise me"]')!;

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
    const toggle = [...el.querySelectorAll<HTMLButtonElement>('.search button')].find((b) =>
      b.textContent?.includes('What can I make?'),
    )!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(el.textContent).not.toContain('Uses');

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(input.placeholder).toBe('List what you have: chicken, rice, broccoli');
    expect(document.activeElement).toBe(input);

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

  it('hides the Sort select in have mode, where results rank by coverage', async () => {
    const fixture = await render();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.sort select')).not.toBeNull();
    TestBed.inject(RecipeStore).mode.set('have');
    fixture.detectChanges();
    expect(el.querySelector('.sort')).toBeNull();
    TestBed.inject(RecipeStore).mode.set('search');
    fixture.detectChanges();
    expect(el.querySelector('.sort select')).not.toBeNull();
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
