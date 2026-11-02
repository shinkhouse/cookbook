import { TestBed } from '@angular/core/testing';
import { Recipes } from '../mock/recipes.mock';
import { DEFAULT_COOKBOOK_ID } from '../model/cookbooks.model';
import { Recipe, RecipeTemplate } from '../model/recipes.model';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../testing/fake-repositories';
import { CookbookStore } from './cookbook.store';
import { DeviceStore } from './device.store';
import { ListStore, OTHER_AISLE, boughtKey } from './list.store';
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
    expect(await store.update({ ...existing, title: 'Chili, Revised' })).toBe(true);
    expect(store.bySlug('grandmas-chili')?.title).toBe('Chili, Revised');
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

  describe('archiving', () => {
    it('hides an archived recipe from every public read', async () => {
      const seed = [
        fixture('kept', { title: 'Kept', tags: ['dinner'], cookbooks: ['c1'] }),
        { ...fixture('gone', { title: 'Gone', tags: ['rareTag'], cookbooks: ['c1'] }), archived: true },
      ];
      const store = setup(new FakeRecipeRepository(seed));
      await store.whenLoaded();
      expect(store.recipes().map((r) => r.slug)).toEqual(['kept']);
      expect(store.results().map((r) => r.slug)).toEqual(['kept']);
      expect(store.bySlug('gone')).toBeUndefined();
      expect(store.inCookbook('c1').map((r) => r.slug)).toEqual(['kept']);
      expect(store.tags()).not.toContain('raretag');
      expect(store.facets().flatMap((f) => f.options)).not.toContain('raretag');
    });

    it('suffixes a new slug that belongs to an archived recipe', async () => {
      const seed = [{ ...fixture('soup', { title: 'Soup' }), archived: true }];
      const fake = new FakeRecipeRepository(seed);
      const store = setup(fake);
      await store.whenLoaded();
      expect(await store.add(fixture('soup', { title: 'Soup' }))).toBe('soup-2');
    });

    it('sends archived: true and drops the recipe from view', async () => {
      const fake = new FakeRecipeRepository();
      const store = setup(fake);
      await store.whenLoaded();
      const updateSpy = spyOn(fake, 'update').and.callThrough();
      expect(await store.archive('grandmas-chili')).toBe(true);
      expect(updateSpy.calls.mostRecent().args[0].archived).toBe(true);
      expect(store.bySlug('grandmas-chili')).toBeUndefined();
    });

    it('returns false for an unknown slug', async () => {
      const store = setup();
      await store.whenLoaded();
      expect(await store.archive('no-such-recipe')).toBe(false);
    });

    it('leaves the list untouched when an archive is rejected', async () => {
      const fake = new FakeRecipeRepository();
      const store = setup(fake);
      await store.whenLoaded();
      const before = store.recipes();
      fake.failNext(new Error('x'));
      await expectAsync(store.archive('grandmas-chili')).toBeRejected();
      expect(store.recipes()).toBe(before);
    });
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

describe('RecipeStore notes', () => {
  function setup(fake = new FakeRecipeRepository()): RecipeStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes(fake)] });
    return TestBed.inject(RecipeStore);
  }
  const SLUG = Recipes[0].slug;

  it('appends and replaces the record', async () => {
    const store = setup();
    await store.whenLoaded();
    const before = store.bySlug(SLUG)!.notes.length;
    expect(await store.addNote(SLUG, '  less salt  ')).toBeTrue();
    const notes = store.bySlug(SLUG)!.notes;
    expect(notes.length).toBe(before + 1);
    expect(notes.at(-1)).toBe('less salt');
  });

  it('ignores a blank note', async () => {
    const fake = new FakeRecipeRepository();
    const spy = spyOn(fake, 'addNote').and.callThrough();
    const store = setup(fake);
    await store.whenLoaded();
    expect(await store.addNote(SLUG, '   ')).toBeFalse();
    expect(spy).not.toHaveBeenCalled();
  });

  it('is false when the recipe is gone', async () => {
    const store = setup();
    await store.whenLoaded();
    expect(await store.addNote('nope', 'x')).toBeFalse();
  });

  it('locks the device on 403 and rethrows', async () => {
    const fake = new FakeRecipeRepository();
    const store = setup(fake);
    await store.whenLoaded();
    const lock = spyOn(TestBed.inject(DeviceStore), 'lock');
    const error = { status: 403 };
    fake.failNext(error);
    await expectAsync(store.addNote(SLUG, 'x')).toBeRejectedWith(error);
    expect(lock).toHaveBeenCalled();
  });

  it('records the lockout wait on 429 and rethrows', async () => {
    const fake = new FakeRecipeRepository();
    const store = setup(fake);
    await store.whenLoaded();
    const record = spyOn(TestBed.inject(DeviceStore), 'recordLockout');
    const error = { status: 429 };
    fake.failNext(error);
    await expectAsync(store.addNote(SLUG, 'x')).toBeRejectedWith(error);
    expect(record).toHaveBeenCalledWith(error);
  });
});

describe('RecipeStore markCooked', () => {
  function setup(fake = new FakeRecipeRepository()): RecipeStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes(fake)] });
    return TestBed.inject(RecipeStore);
  }
  const SLUG = Recipes[0].slug;

  it('replaces the record with the server copy', async () => {
    const store = setup();
    await store.whenLoaded();
    const before = store.bySlug(SLUG)!.cooked;
    expect(await store.markCooked(SLUG)).toBeTrue();
    expect(store.bySlug(SLUG)!.cooked).toBe(before + 1);
    expect(store.bySlug(SLUG)!.lastCooked).toBeTruthy();
  });

  it('is false when the recipe is gone', async () => {
    const store = setup();
    await store.whenLoaded();
    expect(await store.markCooked('nope')).toBeFalse();
  });

  it('locks the device on 403 and rethrows', async () => {
    const fake = new FakeRecipeRepository();
    const store = setup(fake);
    await store.whenLoaded();
    const lock = spyOn(TestBed.inject(DeviceStore), 'lock');
    const error = { status: 403 };
    fake.failNext(error);
    await expectAsync(store.markCooked(SLUG)).toBeRejectedWith(error);
    expect(lock).toHaveBeenCalled();
  });

  it('records the lockout wait on 429 and rethrows', async () => {
    const fake = new FakeRecipeRepository();
    const store = setup(fake);
    await store.whenLoaded();
    const record = spyOn(TestBed.inject(DeviceStore), 'recordLockout');
    const error = { status: 429 };
    fake.failNext(error);
    await expectAsync(store.markCooked(SLUG)).toBeRejectedWith(error);
    expect(record).toHaveBeenCalledWith(error);
  });
});

describe('RecipeStore favorites', () => {
  function setup(fake: FakeRecipeRepository): RecipeStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes(fake)] });
    return TestBed.inject(RecipeStore);
  }

  it('toggles favorite through the repository', async () => {
    const fake = new FakeRecipeRepository([fixture('a'), fixture('b', { favorite: true })]);
    const spy = spyOn(fake, 'setFavorite').and.callThrough();
    const store = setup(fake);
    await store.whenLoaded();
    expect(store.isFav('a')).toBeFalse();
    expect(store.favCount()).toBe(1);

    expect(await store.toggleFav('a')).toBeTrue();
    expect(spy).toHaveBeenCalledWith('a', true);
    expect(store.isFav('a')).toBeTrue();
    expect(store.favCount()).toBe(2);

    expect(await store.toggleFav('b')).toBeTrue();
    expect(spy).toHaveBeenCalledWith('b', false);
    expect(store.isFav('b')).toBeFalse();
  });

  it('filters favsOnly by the server flag', async () => {
    const store = setup(
      new FakeRecipeRepository([fixture('a', { favorite: true }), fixture('b'), fixture('c', { favorite: false })]),
    );
    await store.whenLoaded();
    store.toggleFavsOnly();
    expect(store.results().map((r) => r.slug)).toEqual(['a']);
    await store.setFavorite('b', true);
    expect(store.results().map((r) => r.slug)).toEqual(['a', 'b']);
  });

  it('is false for an unknown slug, with no request', async () => {
    const fake = new FakeRecipeRepository([fixture('a')]);
    const spy = spyOn(fake, 'setFavorite').and.callThrough();
    const store = setup(fake);
    await store.whenLoaded();
    expect(await store.toggleFav('nope')).toBeFalse();
    expect(spy).not.toHaveBeenCalled();
  });

  it('locks the device on 403, rethrows and leaves the flag alone', async () => {
    const fake = new FakeRecipeRepository([fixture('a')]);
    const store = setup(fake);
    await store.whenLoaded();
    const lock = spyOn(TestBed.inject(DeviceStore), 'lock');
    const error = { status: 403 };
    fake.failNext(error);
    await expectAsync(store.toggleFav('a')).toBeRejectedWith(error);
    expect(lock).toHaveBeenCalled();
    expect(store.isFav('a')).toBeFalse();
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
    expect(cookbooks.byId(DEFAULT_COOKBOOK_ID)?.name).toBe("My Cookbooks");
    expect(cookbooks.byId('nope')).toBeUndefined();
  });

  it('adds a cookbook', async () => {
    expect(await cookbooks.add({ id: 'grandmas', name: "Grandma's Cookbook" })).toBe('grandmas');
    expect(cookbooks.byId('grandmas')?.name).toBe("Grandma's Cookbook");
  });

  it('suffixes an id that is already taken, and keeps both', async () => {
    const id = await cookbooks.add({ id: DEFAULT_COOKBOOK_ID, name: 'A Clash' });
    expect(id).toBe(`${DEFAULT_COOKBOOK_ID}-2`);
    expect(cookbooks.byId(DEFAULT_COOKBOOK_ID)?.name).toBe("My Cookbooks");
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

  it('has no legacy favorites when nothing was ever stored', () => {
    expect(TestBed.inject(PrefsStore).legacyFavs()).toBeNull();
  });

  it('returns a stored favorites list, even an emptied one', () => {
    localStorage.setItem('cookbook.favs', JSON.stringify(['grandmas-chili']));
    expect(TestBed.inject(PrefsStore).legacyFavs()).toEqual(['grandmas-chili']);
    localStorage.setItem('cookbook.favs', JSON.stringify([]));
    expect(TestBed.inject(PrefsStore).legacyFavs()).toEqual([]);
  });

  it('clears the legacy favorites list', () => {
    localStorage.setItem('cookbook.favs', JSON.stringify(['grandmas-chili']));
    const prefs = TestBed.inject(PrefsStore);
    prefs.clearLegacyFavs();
    expect(prefs.legacyFavs()).toBeNull();
    expect(localStorage.getItem('cookbook.favs')).toBeNull();
  });

  it('remembers that favorites were migrated', () => {
    const prefs = TestBed.inject(PrefsStore);
    expect(prefs.favsMigrated()).toBeFalse();
    prefs.markFavsMigrated();
    expect(prefs.favsMigrated()).toBeTrue();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    expect(TestBed.inject(PrefsStore).favsMigrated()).toBeTrue();
  });

  it('defaults units to US and remembers a change', () => {
    const prefs = TestBed.inject(PrefsStore);
    expect(prefs.units()).toBe('us');
    prefs.setUnits('metric');
    expect(prefs.units()).toBe('metric');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    expect(TestBed.inject(PrefsStore).units()).toBe('metric');
  });

  describe('the cook-mode ingredients panel', () => {
    it('defaults to open', () => {
      expect(TestBed.inject(PrefsStore).cookIngredientsOpen()).toBe(true);
    });

    it('persists a toggle across a fresh injection', () => {
      TestBed.inject(PrefsStore).toggleCookIngredients();
      expect(TestBed.inject(PrefsStore).cookIngredientsOpen()).toBe(false);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
      expect(TestBed.inject(PrefsStore).cookIngredientsOpen()).toBe(false);
    });

    it('respects a stored false', () => {
      localStorage.setItem('cookbook.cookIngredients', 'false');
      expect(TestBed.inject(PrefsStore).cookIngredientsOpen()).toBe(false);
    });

    it('toggles back to open', () => {
      const prefs = TestBed.inject(PrefsStore);
      prefs.toggleCookIngredients();
      prefs.toggleCookIngredients();
      expect(prefs.cookIngredientsOpen()).toBe(true);
    });
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

  it('stops counting an archived recipe but keeps its cart entry', async () => {
    list.addRecipe('grandmas-chili');
    expect(list.recipeCount()).toBe(1);
    await recipes.archive('grandmas-chili');
    expect(list.recipeCount()).toBe(0);
    expect(list.totalItems()).toBe(0);
    expect(list.cart()).toEqual(['grandmas-chili']);
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

  it('merges a duplicate ingredient from two recipes into one row', () => {
    // Both of grandma's recipes call for hamburger: one row, both sources.
    list.addRecipe('grandmas-spaghetti');
    list.addRecipe('grandmas-chili');
    const meat = list.groups().find((g) => g.aisle === 'meat')!;
    expect(meat.rows.length).toBe(1);
    expect(meat.rows[0].sources.map((s) => s.owner)).toEqual(['grandmas-spaghetti', 'grandmas-chili']);
    expect(meat.rows[0].amount).toBe('½ + 1 lb');
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

  it('adds a manual item to an Other group', () => {
    expect(list.addExtra('Paper towels')).toBe(true);
    const groups = list.groups();
    const other = groups[groups.length - 1];
    expect(other.aisle).toBe(OTHER_AISLE);
    expect(other.label).toBe('Other');
    const [row] = other.rows;
    const [extra] = list.extras();
    expect(row).toEqual(
      jasmine.objectContaining({
        key: 'extra:' + extra.id,
        name: 'Paper towels',
        amount: '',
        sources: [],
        sourceTitles: [],
        extraId: extra.id,
        bought: false,
      }),
    );
  });

  it('trims and caps a name at 200 characters', () => {
    list.addExtra('  ' + 'x'.repeat(300) + '  ');
    expect(list.extras()[0].name).toBe('x'.repeat(200));
  });

  it('ignores a blank or repeated name', () => {
    expect(list.addExtra('   ')).toBe(false);
    expect(list.addExtra('Paper towels')).toBe(true);
    expect(list.addExtra('paper towels ')).toBe(false);
    expect(list.extras().length).toBe(1);
  });

  it('checks and removes a manual item', () => {
    list.addExtra('Paper towels');
    const row = () => list.groups()[0].rows[0];
    list.toggleRow(row());
    expect(row().bought).toBe(true);
    expect(list.extras()[0].bought).toBe(true);
    list.toggleRow(row());
    expect(row().bought).toBe(false);
    list.removeExtra(list.extras()[0].id);
    expect(list.extras()).toEqual([]);
    expect(list.groups()).toEqual([]);
  });

  it('persists manual items across a fresh injection', () => {
    list.addExtra('Paper towels');
    list.toggleRow(list.groups()[0].rows[0]);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
    const fresh = TestBed.inject(ListStore);
    expect(fresh.extras().map((e) => [e.name, e.bought])).toEqual([['Paper towels', true]]);
  });

  it('counts manual items in the totals and unchecks them with everything else', () => {
    list.addRecipe('grandmas-chili');
    const recipeItems = list.totalItems();
    list.addExtra('Paper towels');
    expect(list.totalItems()).toBe(recipeItems + 1);
    list.toggleRow(list.groups()[list.groups().length - 1].rows[0]);
    expect(list.boughtCount()).toBe(1);
    list.uncheckAll();
    expect(list.boughtCount()).toBe(0);
    expect(list.extras()[0].bought).toBe(false);
    list.clear();
    expect(list.extras()).toEqual([]);
    expect(list.totalItems()).toBe(0);
  });

  it('treats malformed stored extras as empty', () => {
    for (const bad of ['{"a":1}', '[{"id":1}]', '[null]', '"x"']) {
      localStorage.setItem('cookbook.extras', bad);
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideFakeRecipes()] });
      expect(TestBed.inject(ListStore).extras()).withContext(bad).toEqual([]);
    }
  });

  it('still adds an item when crypto.randomUUID is unavailable', () => {
    const original = crypto.randomUUID;
    (crypto as { randomUUID?: unknown }).randomUUID = undefined;
    try {
      expect(list.addExtra('Paper towels')).toBe(true);
    } finally {
      crypto.randomUUID = original;
    }
    expect(list.extras()[0].id).toBeTruthy();
  });

  it('scopes the bought key per recipe', () => {
    expect(boughtKey('a-recipe', 3)).toBe('a-recipe:3');
  });
});

describe('RecipeStore embedded components', () => {
  let store: RecipeStore;

  const sauce = fixture('red-sauce', {
    title: 'Red sauce',
    component: true,
    tags: ['sauce'],
    photo: undefined,
    ingredients: [{ qty: 2, unit: 'cup', name: 'tomatoes', aisle: 'produce' }],
  });
  const parent = fixture('lasagna', {
    components: [{ slug: 'red-sauce', label: 'For the sauce' }, { slug: 'gone' }],
  });

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository([parent, sauce]))],
    });
    store = TestBed.inject(RecipeStore);
    await store.whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('includes component recipes in the library, search, tags, facets and counts', () => {
    expect(store.recipes().map((r) => r.slug).sort()).toEqual(['lasagna', 'red-sauce']);
    store.setQuery('tomatoes');
    expect(store.results().map((r) => r.slug)).toContain('red-sauce');
    expect(store.tags()).toContain('sauce');
    expect(store.gapCounts()['photo']).toBeGreaterThan(0);
    expect(store.needsWorkCount()).toBeGreaterThan(0);
    expect(store.inCookbook(DEFAULT_COOKBOOK_ID).map((r) => r.slug)).toContain('red-sauce');
  });

  it('keeps an archived component out of the library and search', async () => {
    await store.archive('red-sauce');
    expect(store.recipes().map((r) => r.slug)).toEqual(['lasagna']);
    store.setQuery('tomatoes');
    expect(store.results()).toEqual([]);
  });

  it('still resolves a component by slug', () => {
    expect(store.bySlug('red-sauce')?.title).toBe('Red sauce');
  });

  it('lists a parent\'s components in order, skipping ones that do not resolve', () => {
    const parts = store.componentsOf('lasagna');
    expect(parts.map((p) => p.recipe.slug)).toEqual(['red-sauce']);
    expect(parts[0].label).toBe('For the sauce');
  });

  it('labels a component with its title when no label is given', () => {
    const bare = fixture('bare', { components: [{ slug: 'red-sauce' }] });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository([bare, sauce]))],
    });
    const s = TestBed.inject(RecipeStore);
    return s.whenLoaded().then(() => expect(s.componentsOf('bare')[0].label).toBe('Red sauce'));
  });

  it('answers an empty list for a recipe with no components or an unknown slug', () => {
    expect(store.componentsOf('red-sauce')).toEqual([]);
    expect(store.componentsOf('nope')).toEqual([]);
  });

  it('skips an archived component', async () => {
    await store.archive('red-sauce');
    expect(store.componentsOf('lasagna')).toEqual([]);
  });

  it('still lists a parent whose component slug no longer resolves', () => {
    expect(store.recipes().some((r) => r.slug === 'lasagna')).toBe(true);
    expect(store.componentsOf('lasagna').length).toBe(1);
  });

  it('keeps a component in the library once its parent is archived', async () => {
    await store.archive('lasagna');
    expect(store.recipes().map((r) => r.slug)).toEqual(['red-sauce']);
    expect(store.bySlug('red-sauce')).toBeDefined();
  });
});

describe('ListStore with embedded components', () => {
  let list: ListStore;

  beforeEach(async () => {
    localStorage.clear();
    const sauce = fixture('red-sauce', {
      title: 'Red sauce',
      component: true,
      ingredients: [{ qty: 2, unit: 'cup', name: 'tomatoes', aisle: 'produce' }],
    });
    const parent = fixture('lasagna', { components: [{ slug: 'red-sauce' }, { slug: 'gone' }] });
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository([parent, sauce]))],
    });
    list = TestBed.inject(ListStore);
    await TestBed.inject(RecipeStore).whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('includes a parent\'s component ingredients', () => {
    list.addRecipe('lasagna');
    expect(list.totalItems()).toBe(2);
    const produce = list.groups().find((g) => g.aisle === 'produce')!;
    expect(produce.rows[0].name).toBe('tomatoes');
  });

  it('checks off component rows independently and drops their marks with the parent', () => {
    list.addRecipe('lasagna');
    const [source] = list.groups().find((g) => g.aisle === 'produce')!.rows[0].sources;
    list.toggleBought(source.owner, source.index);
    expect(list.boughtCount()).toBe(1);
    list.removeRecipe('lasagna');
    list.addRecipe('lasagna');
    expect(list.boughtCount()).toBe(0);
  });
});

describe('ListStore with a component shared by two parents', () => {
  let list: ListStore;
  let recipes: RecipeStore;

  beforeEach(async () => {
    localStorage.clear();
    const sauce = fixture('red-sauce', {
      component: true,
      ingredients: [{ qty: 2, unit: 'cup', name: 'tomatoes', aisle: 'produce' }],
    });
    const a = fixture('lasagna', { components: [{ slug: 'red-sauce' }] });
    const b = fixture('pizza', { components: [{ slug: 'red-sauce' }] });
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository([a, b, sauce]))],
    });
    list = TestBed.inject(ListStore);
    recipes = TestBed.inject(RecipeStore);
    await recipes.whenLoaded();
    list.addRecipe('lasagna');
    list.addRecipe('pizza');
  });

  afterEach(() => localStorage.clear());

  const tomatoes = () =>
    list.groups().find((g) => g.aisle === 'produce')!.rows;

  it('removing one parent keeps the other\'s marks', () => {
    for (const r of tomatoes()) list.toggleRow(r);
    list.removeRecipe('lasagna');
    expect(tomatoes().length).toBe(1);
    expect(tomatoes()[0].bought).toBe(true);
  });

  it('removing an archived parent still clears its component marks', async () => {
    const [first] = tomatoes()[0].sources;
    list.toggleBought(first.owner, first.index);
    await recipes.archive('lasagna');
    list.removeRecipe('lasagna');
    await recipes.update({ ...recipes.bySlug('pizza')! });
    expect(list.boughtCount()).toBe(0);
    expect(list.isBought(first.owner, first.index)).toBe(false);
  });
});

describe('ListStore merging duplicates', () => {
  let list: ListStore;
  let recipes: RecipeStore;

  const onion = (qty: number, unit: string, name = 'onion') => ({
    qty,
    unit,
    name,
    aisle: 'produce' as const,
  });
  const soup = fixture('soup', { title: 'Soup', ingredients: [onion(2, '')] });
  const stew = fixture('stew', { title: 'Stew', ingredients: [onion(1, 'cup', 'onions')] });
  const salsa = fixture('salsa', { title: 'Salsa', ingredients: [onion(1, '', 'onion, minced')] });
  const sauce = fixture('sauce', {
    component: true,
    ingredients: [{ qty: 2, unit: 'cup', name: 'tomatoes', aisle: 'produce' }],
  });
  const a = fixture('a', { title: 'A', ingredients: [], components: [{ slug: 'sauce' }] });
  const b = fixture('b', { title: 'B', ingredients: [], components: [{ slug: 'sauce' }] });

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideFakeRecipes(new FakeRecipeRepository([soup, stew, salsa, sauce, a, b])),
      ],
    });
    list = TestBed.inject(ListStore);
    recipes = TestBed.inject(RecipeStore);
    await recipes.whenLoaded();
  });

  afterEach(() => localStorage.clear());

  const onionRow = () => list.groups().find((g) => g.aisle === 'produce')!.rows[0];

  it('merges a duplicate ingredient from two recipes into one row', () => {
    list.addRecipe('soup');
    list.addRecipe('stew');
    expect(list.totalItems()).toBe(1);
    const row = onionRow();
    expect(row.sourceTitles).toEqual(['Soup', 'Stew']);
    expect(row.amount).toBe('2 + 1 cup');
  });

  it('checks a merged row as one item', () => {
    list.addRecipe('soup');
    list.addRecipe('stew');
    list.toggleRow(onionRow());
    expect(list.isBought('soup', 0)).toBe(true);
    expect(list.isBought('stew', 0)).toBe(true);
    expect(onionRow().bought).toBe(true);
    expect(list.boughtCount()).toBe(1);

    list.toggleRow(onionRow());
    expect(list.isBought('soup', 0)).toBe(false);
    expect(list.isBought('stew', 0)).toBe(false);
  });

  it('unchecks a merged row when a new recipe adds to it', () => {
    list.addRecipe('soup');
    list.addRecipe('stew');
    list.toggleRow(onionRow());
    list.addRecipe('salsa');
    expect(onionRow().sources.length).toBe(3);
    expect(onionRow().bought).toBe(false);
  });

  it('rechecks it when that recipe leaves', () => {
    list.addRecipe('soup');
    list.addRecipe('stew');
    list.toggleRow(onionRow());
    list.addRecipe('salsa');
    list.removeRecipe('salsa');
    expect(onionRow().bought).toBe(true);
  });

  it('merges a component shared by two parents into one row with two sources', () => {
    list.addRecipe('a');
    list.addRecipe('b');
    const rows = list.groups().find((g) => g.aisle === 'produce')!.rows;
    expect(rows.length).toBe(1);
    expect(rows[0].sources.map((s) => s.owner)).toEqual(['a>sauce', 'b>sauce']);
    expect(rows[0].amount).toBe('4 cups');
  });
});


describe('RecipeStore cookbook facet', () => {
  const facet = { id: 'cookbook', label: 'Cookbook', kind: 'cookbook' as const, options: ['a', 'b', 'Bobs'] };
  let store: RecipeStore;

  async function setup(recipes: Recipe[]) {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository(recipes))],
    });
    store = TestBed.inject(RecipeStore);
    await store.whenLoaded();
  }

  afterEach(() => localStorage.clear());

  it('filters by cookbook, OR within the facet', async () => {
    await setup([
      fixture('one', { cookbooks: ['a'] }),
      fixture('two', { cookbooks: ['a'] }),
      fixture('three', { cookbooks: ['b'] }),
    ]);
    store.toggleOption(facet, 'a');
    expect(store.results().length).toBe(2);
    store.toggleOption(facet, 'b');
    expect(store.results().length).toBe(3);
    expect(store.facetCount(facet)).toBe(2);
    expect(store.selectedCount()).toBe(2);
    store.clearFacet(facet);
    expect(store.selectedCookbooks().size).toBe(0);
  });

  it('ANDs the cookbook facet with tags', async () => {
    await setup([
      fixture('one', { cookbooks: ['a'], tags: ['dinner'] }),
      fixture('two', { cookbooks: ['a'], tags: ['lunch'] }),
      fixture('three', { cookbooks: ['b'], tags: ['dinner'] }),
    ]);
    store.toggleOption(facet, 'a');
    store.toggleTag('dinner');
    expect(store.results().map((r) => r.slug)).toEqual(['one']);
    store.reset();
    expect(store.selectedCookbooks().size).toBe(0);
  });

  it('does not lowercase cookbook ids', async () => {
    await setup([fixture('one', { cookbooks: ['Bobs'] }), fixture('two', { cookbooks: ['a'] })]);
    store.toggleOption(facet, 'Bobs');
    expect(store.isOptionSelected(facet, 'Bobs')).toBe(true);
    expect(store.results().map((r) => r.slug)).toEqual(['one']);
  });
});

describe('RecipeStore surprise', () => {
  let store: RecipeStore;

  const seed = [
    fixture('first', { tags: ['soup'] }),
    fixture('sauce', { component: true }),
    fixture('last', { tags: ['pasta'] }),
  ];

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository(seed))],
    });
    store = TestBed.inject(RecipeStore);
    await store.whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('picks from the filtered results', () => {
    expect(store.surprise(() => 0.99)?.slug).toBe('last');
    expect(store.surprise(() => 0)?.slug).toBe('first');
    store.setQuery('soup');
    expect(store.surprise(() => 0.99)?.slug).toBe('first');
  });

  it('never picks a component', () => {
    for (const r of [0, 0.4, 0.5, 0.99]) {
      expect(store.surprise(() => r)?.component).toBeFalsy();
    }
  });

  it('returns null when nothing matches', () => {
    store.setQuery('zzz-no-such-thing');
    expect(store.surprise()).toBeNull();
  });
});

describe('RecipeStore what can I make', () => {
  let store: RecipeStore;

  const ing = (name: string) => ({ qty: 1, unit: '', name, aisle: 'pantry' as const });
  const seed = [
    fixture('half', { tags: ['dinner'], ingredients: [ing('chicken'), ing('peas'), ing('salt')] }),
    fixture('full', { tags: ['lunch'], ingredients: [ing('chicken breasts'), ing('rice')] }),
    fixture('none', { ingredients: [ing('tofu'), ing('kale')] }),
    fixture('staples', { ingredients: [ing('salt'), ing('water')] }),
    fixture('stew', {
      ingredients: [ing('beef'), ing('carrots')],
      components: [{ slug: 'gravy' }],
    }),
    fixture('gravy', { component: true, ingredients: [ing('rice'), ing('stock')] }),
  ];

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository(seed))],
    });
    store = TestBed.inject(RecipeStore);
    await store.whenLoaded();
    store.mode.set('have');
  });

  afterEach(() => localStorage.clear());

  it('defaults to search mode, and reset returns to it', () => {
    store.reset();
    expect(store.mode()).toBe('search');
  });

  it('ranks by covered share in have mode', () => {
    store.setQuery('chicken, rice');
    expect(store.results().map((r) => r.slug)).toEqual(['full', 'half', 'stew']);
    expect(store.coverage().get('half')).toEqual({ covered: 1, total: 2, ratio: 0.5 });
  });

  it('drops recipes with no coverage and all components', () => {
    store.setQuery('rice; stock');
    const slugs = store.results().map((r) => r.slug);
    expect(slugs).not.toContain('gravy');
    expect(slugs).not.toContain('none');
    expect(slugs).not.toContain('staples');
  });

  it('still applies facets in have mode', () => {
    store.setQuery('chicken');
    store.toggleTag('dinner');
    expect(store.results().map((r) => r.slug)).toEqual(['half']);
  });

  it('counts a parent\'s component ingredients', () => {
    store.setQuery('rice and stock');
    expect(store.coverage().get('stew')).toEqual({ covered: 2, total: 4, ratio: 0.5 });
  });

  it('searches as usual with nothing listed', () => {
    store.setQuery('  ');
    expect(store.results().length).toBe(seed.length);
  });
});

describe('RecipeStore full writes keep device writes', () => {
  let store: RecipeStore;
  let fake: FakeRecipeRepository;
  const SLUG = 'soup';

  beforeEach(async () => {
    localStorage.clear();
    fake = new FakeRecipeRepository([fixture(SLUG, { notes: ['first', 'second'], cooked: 2 })]);
    TestBed.configureTestingModule({ providers: [provideFakeRecipes(fake)] });
    store = TestBed.inject(RecipeStore);
    await store.whenLoaded();
    // A phone writes to the server behind this tab's back: its cache is now stale.
    await fake.addNote(SLUG, 'from the phone');
    await fake.markCooked(SLUG);
    await fake.setFavorite(SLUG, true);
  });

  afterEach(() => localStorage.clear());

  const onServer = async () => (await fake.get(SLUG))!;
  const expectPhoneWritesKept = async (notes = ['first', 'second', 'from the phone']) => {
    const server = await onServer();
    expect(server.notes).toEqual(notes);
    expect(server.cooked).toBe(3);
    expect(server.lastCooked).toBeTruthy();
    expect(server.favorite).toBeTrue();
    // The cache takes the server's answer, so the screen shows them too.
    const cached = store.bySlug(SLUG) ?? (await onServer());
    expect(cached.favorite).toBeTrue();
  };

  it('keeps them through an archive', async () => {
    expect(await store.archive(SLUG)).toBeTrue();
    await expectPhoneWritesKept();
    expect((await onServer()).archived).toBeTrue();
  });

  it('keeps them through filing into a cookbook', async () => {
    expect(await store.addToCookbook(SLUG, 'grandmas')).toBeTrue();
    await expectPhoneWritesKept();
    expect((await onServer()).cookbooks).toEqual([DEFAULT_COOKBOOK_ID, 'grandmas']);
    expect(store.bySlug(SLUG)!.notes).toEqual(['first', 'second', 'from the phone']);
  });

  it('keeps them through unfiling from a cookbook', async () => {
    expect(await store.removeFromCookbook(SLUG, DEFAULT_COOKBOOK_ID)).toBeTrue();
    await expectPhoneWritesKept();
    expect((await onServer()).cookbooks).toEqual([]);
  });

  it('keeps them through an edit built from an older copy, without restoring a deleted note', async () => {
    const base = fixture(SLUG, { notes: ['first', 'second'], cooked: 2 });
    // The editor deleted "first" and changed the title.
    const edited = { ...base, title: 'Better Soup', notes: ['second'] };
    expect(await store.update(edited, base)).toBeTrue();
    await expectPhoneWritesKept(['second', 'from the phone']);
    expect((await onServer()).title).toBe('Better Soup');
  });

  it('still saves, as before, when the fresh copy cannot be fetched', async () => {
    fake.failNextGet(new Error('down'));
    expect(await store.addToCookbook(SLUG, 'grandmas')).toBeTrue();
    expect((await onServer()).cookbooks).toEqual([DEFAULT_COOKBOOK_ID, 'grandmas']);
  });
});

describe('RecipeStore stale sort', () => {
  let store: RecipeStore;

  const seed = [
    fixture('never-b', { title: 'B never' }),
    fixture('recent', { cooked: 2, lastCooked: '2026-10-30T10:00:00.000Z' }),
    fixture('undated', { cooked: 4 }),
    fixture('old', { cooked: 1, lastCooked: '2026-01-05T10:00:00.000Z' }),
    fixture('never-a', { title: 'A never' }),
  ];

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideFakeRecipes(new FakeRecipeRepository(seed))],
    });
    store = TestBed.inject(RecipeStore);
    await store.whenLoaded();
  });

  afterEach(() => localStorage.clear());

  it('orders cooked-but-undated, then oldest first, then never cooked', () => {
    store.sort.set('stale');
    expect(store.results().map((r) => r.slug)).toEqual([
      'undated',
      'old',
      'recent',
      'never-a',
      'never-b',
    ]);
  });

  it('keeps library order by default', () => {
    expect(store.results().map((r) => r.slug)).toEqual(seed.map((r) => r.slug));
  });

  it('ignores the sort in have mode', () => {
    store.mode.set('have');
    store.setQuery('water');
    const before = store.results().map((r) => r.slug);
    store.sort.set('stale');
    expect(store.results().map((r) => r.slug)).toEqual(before);
  });

  it('ignores the sort in have mode with nothing listed yet', () => {
    store.mode.set('have');
    store.sort.set('stale');
    expect(store.results().map((r) => r.slug)).toEqual(seed.map((r) => r.slug));
  });

  it('survives reset', () => {
    store.sort.set('stale');
    store.reset();
    expect(store.sort()).toBe('stale');
  });
});
