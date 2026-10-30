import { TestBed } from '@angular/core/testing';
import { FAV_SEED, Recipes } from '../mock/recipes.mock';
import { DEFAULT_COOKBOOK_ID } from '../model/cookbooks.model';
import { Recipe, RecipeTemplate } from '../model/recipes.model';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../testing/fake-repositories';
import { CookbookStore } from './cookbook.store';
import { ListStore, boughtKey } from './list.store';
import { PrefsStore } from './prefs.store';
import { RecipeStore, tagLabel } from './recipe.store';

/** A complete recipe; the fixtures below each take one thing away. */
function fixture(slug: string, over: Partial<Recipe> = {}): Recipe {
  return {
    slug,
    title: slug,
    tags: ['dinner'],
    time: '20 min',
    servings: 2,
    cooked: 0,
    blurb: '',
    desc: '',
    ingredients: [{ qty: 1, unit: 'cup', name: 'water', aisle: 'pantry' }],
    steps: ['Boil it.'],
    notes: [],
    cookbooks: [DEFAULT_COOKBOOK_ID],
    photo: 'photo.jpg',
    ...over,
  };
}

/** One recipe per gap, so each assertion below has a known right answer. */
const GAP_FIXTURES: Recipe[] = [
  fixture('no-method', { steps: [] }),
  fixture('thin-steps', {
    steps: ['Mix.', 'Bake.'],
    ingredients: Array.from({ length: 8 }, (_, i) => ({
      qty: 1,
      unit: 'cup',
      name: `thing-${i}`,
      aisle: 'pantry' as const,
    })),
  }),
  fixture('no-photo', { photo: undefined }),
];

function conflict(): Error {
  return Object.assign(new Error('conflict'), { status: 409 });
}

describe('RecipeStore', () => {
  let store: RecipeStore;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    store = TestBed.inject(RecipeStore);
    await store.whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('returns every recipe with no filter applied', () => {
    expect(store.results().length).toBe(store.recipes().length);
  });

  it('groups tags into facets for the filter controls', () => {
    const ids = store.facets().map((f) => f.id);
    expect(ids).toContain('meal');
    expect(ids).toContain('cuisine');
    expect(ids).toContain('protein');
  });

  it('derives tags from the data rather than a hardcoded list', () => {
    const tags = store.tags();
    // Real tags off the 14 recipes; the handoff's illustrative set is absent.
    expect(tags).toContain('pasta');
    expect(tags).toContain('italian');
    expect(tags).not.toContain('sheet pan');
    expect(tags).toEqual([...tags].sort());
    expect(new Set(tags).size).toBe(tags.length);
  });

  it('matches on title', () => {
    store.setQuery('spaghetti');
    expect(store.results().map((r) => r.slug)).toContain('grandmas-spaghetti');
  });

  it('matches on an ingredient name, which is the point of the feature', () => {
    store.setQuery('feta');
    const slugs = store.results().map((r) => r.slug);
    expect(slugs).toContain('spicy-shrimp-pasta-in-tomato-cream-sauce');
    // The word appears in no title and no tag, so only the ingredient match
    // could have found it.
    expect(store.results().every((r) => !r.title.toLowerCase().includes('feta'))).toBe(true);
  });

  it('matches on a tag', () => {
    store.setQuery('dessert');
    expect(store.results().map((r) => r.slug)).toContain('vanilla-crème-brûlée');
  });

  it('is case and whitespace insensitive', () => {
    store.setQuery('  SPAGHETTI  ');
    expect(store.results().map((r) => r.slug)).toContain('grandmas-spaghetti');
  });

  it('returns nothing for a query that matches nothing', () => {
    store.setQuery('zzzzz-not-a-food');
    expect(store.results()).toEqual([]);
  });

  it('filters by a selected tag', () => {
    store.toggleTag('dessert');
    expect(store.results().every((r) => r.tags.includes('dessert'))).toBe(true);
    expect(store.results().length).toBeGreaterThan(0);
  });

  it('widens when two tags in the same facet are selected', () => {
    store.toggleTag('dessert');
    const desserts = store.results().length;
    store.toggleTag('breakfast');
    const either = store.results().length;
    // Same facet, so this is dessert OR breakfast — never fewer results.
    expect(either).toBeGreaterThan(desserts);
    expect(store.results().every((r) =>
      r.tags.includes('dessert') || r.tags.includes('breakfast'))).toBe(true);
  });

  it('narrows when tags from different facets are selected', () => {
    store.toggleTag('dinner');
    const dinners = store.results().length;
    store.toggleTag('italian');
    expect(store.results().length).toBeLessThan(dinners);
    expect(store.results().every((r) =>
      r.tags.includes('dinner') && r.tags.includes('italian'))).toBe(true);
  });

  it('untoggles a tag', () => {
    store.toggleTag('dessert');
    store.toggleTag('dessert');
    expect(store.selectedCount()).toBe(0);
    expect(store.results().length).toBe(store.recipes().length);
  });

  it('clears one facet without disturbing the others', () => {
    store.toggleTag('dinner');
    store.toggleTag('italian');
    const cuisine = store.facets().find((f) => f.id === 'cuisine')!;
    store.clearFacet(cuisine);
    expect(store.isTagSelected('italian')).toBe(false);
    expect(store.isTagSelected('dinner')).toBe(true);
  });

  it('counts what is selected inside a facet, for its badge', () => {
    const meal = store.facets().find((f) => f.id === 'meal')!;
    expect(store.facetCount(meal)).toBe(0);
    store.toggleTag('dinner');
    store.toggleTag('lunch');
    store.toggleTag('italian');
    // The italian selection belongs to another facet and must not be counted.
    expect(store.facetCount(meal)).toBe(2);
  });

  it('filters by a gap, which is derived rather than tagged', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository(GAP_FIXTURES))],
    });
    const gapped = TestBed.inject(RecipeStore);
    await gapped.whenLoaded();
    const gaps = gapped.facets().find((f) => f.id === 'gaps')!;
    expect(gaps.kind).toBe('gap');

    gapped.toggleOption(gaps, 'method');
    expect(gapped.results().map((r) => r.slug)).toEqual(['no-method']);
  });

  it('widens within the gap facet, as the tag facets do', () => {
    const gaps = store.facets().find((f) => f.id === 'gaps')!;
    store.toggleOption(gaps, 'method');
    const method = store.results().length;
    store.toggleOption(gaps, 'photo');
    // method OR photo, so never fewer.
    expect(store.results().length).toBeGreaterThan(method);
  });

  it('narrows a gap against a tag, since they are different facets', () => {
    const gaps = store.facets().find((f) => f.id === 'gaps')!;
    store.toggleOption(gaps, 'photo');
    const photoless = store.results().length;
    store.toggleTag('dinner');
    expect(store.results().length).toBeLessThan(photoless);
    for (const r of store.results()) {
      expect(r.tags).toContain('dinner');
      expect(r.photo).toBeFalsy();
    }
  });

  it('counts each gap for the option labels', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository(GAP_FIXTURES))],
    });
    const gapped = TestBed.inject(RecipeStore);
    await gapped.whenLoaded();
    expect(gapped.gapCounts()).toEqual({ method: 1, steps: 1, photo: 1 });
    expect(gapped.needsWorkCount()).toBe(3);
  });

  it('clears the gap facet without disturbing the tag facets', () => {
    const gaps = store.facets().find((f) => f.id === 'gaps')!;
    store.toggleTag('dinner');
    store.toggleOption(gaps, 'photo');
    store.clearFacet(gaps);
    expect(store.isOptionSelected(gaps, 'photo')).toBe(false);
    expect(store.isTagSelected('dinner')).toBe(true);
  });

  it('counts gap selections toward the total, so Clear all shows up', () => {
    const gaps = store.facets().find((f) => f.id === 'gaps')!;
    store.toggleOption(gaps, 'photo');
    expect(store.selectedCount()).toBe(1);
    store.reset();
    expect(store.selectedCount()).toBe(0);
  });

  it('combines a tag filter with a query', () => {
    store.toggleTag('dinner');
    store.setQuery('chicken');
    for (const r of store.results()) {
      expect(r.tags).toContain('dinner');
    }
  });

  it('filters to favourites when asked', () => {
    const prefs = TestBed.inject(PrefsStore);
    store.toggleFavsOnly();
    expect(store.results().length).toBe(FAV_SEED.length);
    // Unfavouriting is reflected immediately — the predicate reads a signal.
    prefs.toggleFav(FAV_SEED[0]);
    expect(store.results().length).toBe(FAV_SEED.length - 1);
  });

  it('names the most-cooked recipe for the library header', () => {
    expect(store.mostCooked()?.slug).toBe('grandmas-spaghetti');
  });

  it('finds a recipe by slug, and nothing for an unknown one', () => {
    expect(store.bySlug('grandmas-chili')?.title).toBe("Grandma's Chili");
    expect(store.bySlug('no-such-recipe')).toBeUndefined();
  });

  it('resets search and filter together', () => {
    store.setQuery('x');
    store.toggleTag('dinner');
    store.toggleFavsOnly();
    store.reset();
    expect(store.query()).toBe('');
    expect(store.selectedCount()).toBe(0);
    expect(store.favsOnly()).toBe(false);
  });

  it('title-cases tags for display', () => {
    expect(tagLabel('ground beef')).toBe('Ground Beef');
    expect(tagLabel('pasta')).toBe('Pasta');
  });
});

describe('RecipeStore lifecycle and writes', () => {
  function setup(fake = new FakeRecipeRepository()): RecipeStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes(fake)] });
    return TestBed.inject(RecipeStore);
  }

  it('is loading until the repository answers, then ready', async () => {
    const fresh = setup();
    expect(fresh.status()).toBe('loading');
    expect(fresh.recipes()).toEqual([]);
    await fresh.whenLoaded();
    expect(fresh.status()).toBe('ready');
    expect(fresh.recipes().length).toBe(Recipes.length);
  });

  it('ends in error when the first load fails, and recovers on a retry', async () => {
    const fake = new FakeRecipeRepository();
    fake.failNext(new Error('down'));
    const fresh = setup(fake);
    await fresh.whenLoaded();
    expect(fresh.status()).toBe('error');
    expect(fresh.recipes()).toEqual([]);

    await fresh.load();
    expect(fresh.status()).toBe('ready');
    expect(fresh.recipes().length).toBe(Recipes.length);
  });

  it('shares one load between callers while it is in flight', async () => {
    const fake = new FakeRecipeRepository();
    const list = spyOn(fake, 'list').and.callThrough();
    const fresh = setup(fake);
    // The constructor has already started the first load.
    const a = fresh.load();
    const b = fresh.load();
    expect(b).toBe(a);
    await a;
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('mirrors the repository writable flag', () => {
    expect(setup().writable).toBe(true);
  });

  it('adds a recipe and keeps it', async () => {
    const store = setup();
    await store.whenLoaded();
    const slug = await store.add(fixture('weeknight-dal', { title: 'Weeknight Dal' }));
    expect(slug).toBe('weeknight-dal');
    expect(store.bySlug('weeknight-dal')?.title).toBe('Weeknight Dal');
    expect(store.recipes().length).toBe(Recipes.length + 1);
  });

  it('suffixes a slug that is already taken, and keeps both', async () => {
    const store = setup();
    await store.whenLoaded();
    const slug = await store.add(fixture('grandmas-chili', { title: 'My Chili' }));
    expect(slug).toBe('grandmas-chili-2');
    expect(store.bySlug('grandmas-chili')?.title).toBe("Grandma's Chili");
    expect(store.bySlug('grandmas-chili-2')?.title).toBe('My Chili');
  });

  it('rejects an add the server calls a conflict, leaving the list untouched', async () => {
    const fake = new FakeRecipeRepository();
    const store = setup(fake);
    await store.whenLoaded();
    const before = store.recipes();

    const error = conflict();
    fake.failNext(error);
    await expectAsync(store.add(fixture('weeknight-dal'))).toBeRejectedWith(error);
    // No retry under another suffix: the signal and the fake both stay as they were.
    expect(store.recipes()).toBe(before);
    expect(store.bySlug('weeknight-dal-2')).toBeUndefined();
  });

  it('removes a recipe', async () => {
    const store = setup();
    await store.whenLoaded();
    expect(await store.remove('grandmas-chili')).toBe(true);
    expect(store.bySlug('grandmas-chili')).toBeUndefined();
  });

  it('reports false when removing a slug that is not there', async () => {
    const store = setup();
    await store.whenLoaded();
    expect(await store.remove('no-such-recipe')).toBe(false);
  });

  it('leaves the list untouched when a remove is rejected', async () => {
    const fake = new FakeRecipeRepository();
    const store = setup(fake);
    await store.whenLoaded();
    const before = store.recipes();
    fake.failNext(new Error('x'));
    await expectAsync(store.remove('grandmas-chili')).toBeRejected();
    expect(store.recipes()).toBe(before);
  });

  it('updates a recipe in place', async () => {
    const store = setup();
    await store.whenLoaded();
    const existing = store.bySlug('grandmas-chili')!;
    expect(await store.update({ ...existing, cooked: 99 })).toBe(true);
    expect(store.bySlug('grandmas-chili')?.cooked).toBe(99);
    expect(await store.update({ ...existing, slug: 'ghost' })).toBe(false);
  });

  it('leaves the list untouched when an update is rejected', async () => {
    const fake = new FakeRecipeRepository();
    const store = setup(fake);
    await store.whenLoaded();
    const before = store.recipes();
    const existing = store.bySlug('grandmas-chili')!;
    fake.failNext(new Error('x'));
    await expectAsync(store.update({ ...existing, cooked: 99 })).toBeRejected();
    expect(store.recipes()).toBe(before);
  });

  it('keeps the derived facets in step with an added recipe', async () => {
    const store = setup();
    await store.whenLoaded();
    await store.add(fixture('thai-curry', { title: 'Thai Curry', tags: ['thai', 'dinner'] }));
    // Tags are derived, so a new tag has to reach the filter controls. It is
    // not in any defined group, so it belongs to the catch-all.
    expect(store.tags()).toContain('thai');
    expect(store.facets().find((f) => f.id === 'other')?.options).toContain('thai');
  });
});

describe('RecipeStore cookbook membership', () => {
  let store: RecipeStore;
  let fake: FakeRecipeRepository;

  beforeEach(async () => {
    localStorage.clear();
    fake = new FakeRecipeRepository();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes(fake)] });
    store = TestBed.inject(RecipeStore);
    await store.whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('starts with every seeded recipe in the default cookbook', () => {
    expect(store.inCookbook(DEFAULT_COOKBOOK_ID).length).toBe(store.recipes().length);
  });

  it('starts a newly drafted recipe unfiled rather than guessing a cookbook', () => {
    // The create screen does not offer a cookbook yet, so a draft must not be
    // filed into one behind the user's back. Pinned here because that screen has
    // no spec of its own, and it builds this literal in two places.
    expect(RecipeTemplate.cookbooks).toEqual([]);
  });

  it('files a recipe into an additional cookbook, keeping the one it had', async () => {
    expect(await store.addToCookbook('grandmas-chili', 'grandmas')).toBe(true);
    expect(store.bySlug('grandmas-chili')?.cookbooks).toEqual([DEFAULT_COOKBOOK_ID, 'grandmas']);
  });

  it('files the same recipe into two cookbooks at once', async () => {
    await store.addToCookbook('grandmas-chili', 'grandmas');
    await store.addToCookbook('grandmas-chili', 'bobs');
    expect(store.inCookbook('grandmas').map((r) => r.slug)).toContain('grandmas-chili');
    expect(store.inCookbook('bobs').map((r) => r.slug)).toContain('grandmas-chili');
  });

  it('ignores a second filing into the same cookbook', async () => {
    await store.addToCookbook('grandmas-chili', 'grandmas');
    expect(await store.addToCookbook('grandmas-chili', 'grandmas')).toBe(false);
    // Without the guard the id would appear twice, and every count derived from
    // membership would double for this recipe.
    expect(store.bySlug('grandmas-chili')?.cookbooks).toEqual([DEFAULT_COOKBOOK_ID, 'grandmas']);
  });

  it('reports false when filing a slug that is not there', async () => {
    expect(await store.addToCookbook('no-such-recipe', 'grandmas')).toBe(false);
  });

  it('leaves the recipe unchanged when filing it is rejected', async () => {
    const before = store.bySlug('grandmas-chili');
    fake.failNext(new Error('x'));
    await expectAsync(store.addToCookbook('grandmas-chili', 'grandmas')).toBeRejected();
    expect(store.bySlug('grandmas-chili')).toBe(before);
    expect(store.bySlug('grandmas-chili')?.cookbooks).toEqual([DEFAULT_COOKBOOK_ID]);
  });

  it('unfiles a recipe without deleting it', async () => {
    expect(await store.removeFromCookbook('grandmas-chili', DEFAULT_COOKBOOK_ID)).toBe(true);
    expect(store.bySlug('grandmas-chili')?.cookbooks).toEqual([]);
    // The point of allowing zero cookbooks: the recipe is still yours.
    expect(store.bySlug('grandmas-chili')).toBeDefined();
  });

  it('reports false when unfiling from a cookbook it was never in', async () => {
    expect(await store.removeFromCookbook('grandmas-chili', 'grandmas')).toBe(false);
  });
});

describe('CookbookStore', () => {
  let cookbooks: CookbookStore;
  let recipes: RecipeStore;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(), provideFakeCookbooks()],
    });
    cookbooks = TestBed.inject(CookbookStore);
    recipes = TestBed.inject(RecipeStore);
    await cookbooks.whenLoaded();
    await recipes.whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('starts with the seeded cookbook', () => {
    expect(cookbooks.cookbooks().map((c) => c.id)).toEqual([DEFAULT_COOKBOOK_ID]);
  });

  it('is loading until the repository answers, then ready', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(), provideFakeCookbooks()],
    });
    const fresh = TestBed.inject(CookbookStore);
    expect(fresh.status()).toBe('loading');
    expect(fresh.cookbooks()).toEqual([]);
    await fresh.whenLoaded();
    expect(fresh.status()).toBe('ready');
  });

  it('ends in error when the first load fails, and recovers on a retry', async () => {
    const fake = new FakeCookbookRepository();
    fake.failNext(new Error('down'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(), provideFakeCookbooks(fake)],
    });
    const fresh = TestBed.inject(CookbookStore);
    await fresh.whenLoaded();
    expect(fresh.status()).toBe('error');
    expect(fresh.cookbooks()).toEqual([]);

    await fresh.load();
    expect(fresh.status()).toBe('ready');
    expect(fresh.cookbooks().map((c) => c.id)).toEqual([DEFAULT_COOKBOOK_ID]);
  });

  it('shares one load between callers while it is in flight', async () => {
    const fake = new FakeCookbookRepository();
    const list = spyOn(fake, 'list').and.callThrough();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(), provideFakeCookbooks(fake)],
    });
    const fresh = TestBed.inject(CookbookStore);
    // The constructor has already started the first load.
    const a = fresh.load();
    const b = fresh.load();
    expect(b).toBe(a);
    await a;
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('mirrors the repository writable flag', () => {
    expect(cookbooks.writable).toBe(true);
  });

  it('finds a cookbook by id', () => {
    expect(cookbooks.byId(DEFAULT_COOKBOOK_ID)?.name).toBe("Sam's Cookbook");
    expect(cookbooks.byId('nope')).toBeUndefined();
  });

  it('adds a cookbook', async () => {
    expect(await cookbooks.add({ id: 'grandmas', name: "Grandma's Cookbook" })).toBe('grandmas');
    expect(cookbooks.byId('grandmas')?.name).toBe("Grandma's Cookbook");
  });

  it('suffixes an id that is already taken, and keeps both', async () => {
    const id = await cookbooks.add({ id: DEFAULT_COOKBOOK_ID, name: 'A Clash' });
    expect(id).toBe(`${DEFAULT_COOKBOOK_ID}-2`);
    expect(cookbooks.byId(DEFAULT_COOKBOOK_ID)?.name).toBe("Sam's Cookbook");
    expect(cookbooks.byId(`${DEFAULT_COOKBOOK_ID}-2`)?.name).toBe('A Clash');
  });

  it('leaves the list untouched when an add is rejected', async () => {
    const fake = new FakeCookbookRepository();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(), provideFakeCookbooks(fake)],
    });
    const store = TestBed.inject(CookbookStore);
    await store.whenLoaded();
    const before = store.cookbooks();

    fake.failNext(new Error('x'));
    await expectAsync(store.add({ id: 'grandmas', name: 'G' })).toBeRejected();
    expect(store.cookbooks()).toBe(before);
  });

  it('renames a cookbook', async () => {
    expect(await cookbooks.rename(DEFAULT_COOKBOOK_ID, "Sam's Recipes")).toBe(true);
    expect(cookbooks.byId(DEFAULT_COOKBOOK_ID)?.name).toBe("Sam's Recipes");
    expect(await cookbooks.rename('nope', 'Ghost')).toBe(false);
  });

  it('counts the recipes filed in a cookbook', () => {
    expect(cookbooks.countIn(DEFAULT_COOKBOOK_ID)).toBe(72);
    expect(cookbooks.countIn('grandmas')).toBe(0);
  });

  it('lists the recipes filed in a cookbook', async () => {
    await cookbooks.add({ id: 'grandmas', name: "Grandma's Cookbook" });
    await recipes.addToCookbook('grandmas-chili', 'grandmas');
    expect(cookbooks.recipesIn('grandmas').map((r) => r.slug)).toEqual(['grandmas-chili']);
  });

  it('removes a cookbook without touching any recipe', async () => {
    await cookbooks.add({ id: 'grandmas', name: "Grandma's Cookbook" });
    await recipes.addToCookbook('grandmas-chili', 'grandmas');
    const before = recipes.recipes().map((r) => [...r.cookbooks]);

    expect(await cookbooks.remove('grandmas')).toBe(true);
    expect(cookbooks.byId('grandmas')).toBeUndefined();
    // Spec §4: readers skip dangling ids, so the recipes keep theirs.
    expect(recipes.recipes().map((r) => [...r.cookbooks])).toEqual(before);
    expect(recipes.bySlug('grandmas-chili')?.cookbooks).toContain('grandmas');
  });

  it('reports false when removing an id that is not there', async () => {
    expect(await cookbooks.remove('nope')).toBe(false);
  });
});

describe('PrefsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
  });

  afterEach(() => localStorage.clear());

  it('seeds favourites from the old flags on a first run', () => {
    const prefs = TestBed.inject(PrefsStore);
    expect(prefs.favCount()).toBe(FAV_SEED.length);
    expect(prefs.isFav(FAV_SEED[0])).toBe(true);
  });

  it('toggles a favourite both ways', () => {
    const prefs = TestBed.inject(PrefsStore);
    prefs.toggleFav('grandmas-chili');
    expect(prefs.isFav('grandmas-chili')).toBe(false);
    prefs.toggleFav('grandmas-chili');
    expect(prefs.isFav('grandmas-chili')).toBe(true);
  });

  it('persists favourites across a fresh injection', () => {
    TestBed.inject(PrefsStore).toggleFav('grandmas-spaghetti');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    expect(TestBed.inject(PrefsStore).isFav('grandmas-spaghetti')).toBe(false);
  });

  it('respects a deliberately emptied favourites list rather than reseeding', () => {
    const prefs = TestBed.inject(PrefsStore);
    for (const slug of [...prefs.favs()]) prefs.toggleFav(slug);
    expect(prefs.favCount()).toBe(0);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    // The bug this guards: treating "empty" as "unseeded" and handing back the
    // seed, so clearing favourites silently undid itself on reload.
    expect(TestBed.inject(PrefsStore).favCount()).toBe(0);
  });

  it('defaults to the side-by-side layout and persists a change', () => {
    const prefs = TestBed.inject(PrefsStore);
    expect(prefs.layout()).toBe('side-by-side');
    prefs.toggleLayout();
    expect(prefs.layout()).toBe('single-column');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    expect(TestBed.inject(PrefsStore).layout()).toBe('single-column');
  });
});

describe('ListStore', () => {
  let list: ListStore;
  let recipes: RecipeStore;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    list = TestBed.inject(ListStore);
    recipes = TestBed.inject(RecipeStore);
    await recipes.whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('starts empty', () => {
    expect(list.cart()).toEqual([]);
    expect(list.groups()).toEqual([]);
    expect(list.totalItems()).toBe(0);
  });

  it('adds a recipe and aggregates its ingredients', () => {
    list.addRecipe('grandmas-spaghetti');
    const expected = recipes.bySlug('grandmas-spaghetti')!.ingredients.length;
    expect(list.totalItems()).toBe(expected);
  });

  it('does not add the same recipe twice', () => {
    list.addRecipe('grandmas-spaghetti');
    list.addRecipe('grandmas-spaghetti');
    expect(list.cart().length).toBe(1);
  });

  it('groups rows by aisle in the display order from the spec', () => {
    list.addRecipe('grandmas-spaghetti');
    list.addRecipe('spicy-shrimp-pasta-in-tomato-cream-sauce');
    const order = list.groups().map((g) => g.aisle);
    expect(order).toEqual([...order].sort(
      (a, b) => ['produce', 'meat', 'seafood', 'dairy', 'pantry'].indexOf(a)
             - ['produce', 'meat', 'seafood', 'dairy', 'pantry'].indexOf(b),
    ));
    expect(list.groups().find((g) => g.aisle === 'seafood')?.label).toBe('Fish counter');
  });

  it('keeps a duplicate ingredient from two recipes as two rows', () => {
    // Both of grandma's recipes call for hamburger; merging is out of scope.
    list.addRecipe('grandmas-spaghetti');
    list.addRecipe('grandmas-chili');
    const meat = list.groups().find((g) => g.aisle === 'meat')!;
    expect(meat.rows.filter((r) => r.ingredient.name === 'hamburger').length).toBe(2);
  });

  it('checks off one recipe\'s item without touching the other\'s', () => {
    list.addRecipe('grandmas-spaghetti');
    list.addRecipe('grandmas-chili');
    list.toggleBought('grandmas-spaghetti', 0);

    expect(list.isBought('grandmas-spaghetti', 0)).toBe(true);
    // The bug this guards: keying by ingredient name instead of by recipe, so
    // checking one garlic checked every garlic.
    expect(list.isBought('grandmas-chili', 0)).toBe(false);
  });

  it('unchecks an item', () => {
    list.addRecipe('grandmas-spaghetti');
    list.toggleBought('grandmas-spaghetti', 1);
    list.toggleBought('grandmas-spaghetti', 1);
    expect(list.isBought('grandmas-spaghetti', 1)).toBe(false);
  });

  it('counts what has been bought', () => {
    list.addRecipe('grandmas-spaghetti');
    list.toggleBought('grandmas-spaghetti', 0);
    list.toggleBought('grandmas-spaghetti', 2);
    expect(list.boughtCount()).toBe(2);
  });

  it('unchecks everything at once', () => {
    list.addRecipe('grandmas-spaghetti');
    list.toggleBought('grandmas-spaghetti', 0);
    list.uncheckAll();
    expect(list.boughtCount()).toBe(0);
    expect(list.totalItems()).toBeGreaterThan(0);
  });

  it('removing a recipe drops its rows and its bought marks', () => {
    list.addRecipe('grandmas-spaghetti');
    list.addRecipe('grandmas-chili');
    list.toggleBought('grandmas-spaghetti', 0);
    list.removeRecipe('grandmas-spaghetti');

    expect(list.cart()).toEqual(['grandmas-chili']);
    expect(list.isBought('grandmas-spaghetti', 0)).toBe(false);
    // Re-adding must not resurrect the old check state.
    list.addRecipe('grandmas-spaghetti');
    expect(list.isBought('grandmas-spaghetti', 0)).toBe(false);
  });

  it('toggles a recipe on and off the list', () => {
    list.toggleRecipe('grandmas-chili');
    expect(list.has('grandmas-chili')).toBe(true);
    list.toggleRecipe('grandmas-chili');
    expect(list.has('grandmas-chili')).toBe(false);
  });

  it('ignores a stored slug that no longer matches a recipe', async () => {
    localStorage.setItem('cookbook.cart', JSON.stringify(['deleted-recipe']));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    const fresh = TestBed.inject(ListStore);
    await TestBed.inject(RecipeStore).whenLoaded();
    expect(fresh.cart()).toEqual(['deleted-recipe']);
    expect(() => fresh.groups()).not.toThrow();
    expect(fresh.totalItems()).toBe(0);
  });

  it('persists the cart and bought marks across a fresh injection', () => {
    list.addRecipe('grandmas-chili');
    list.toggleBought('grandmas-chili', 1);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    const fresh = TestBed.inject(ListStore);
    expect(fresh.cart()).toEqual(['grandmas-chili']);
    expect(fresh.isBought('grandmas-chili', 1)).toBe(true);
  });

  it('scopes the bought key per recipe', () => {
    expect(boughtKey('a-recipe', 3)).toBe('a-recipe:3');
  });
});
