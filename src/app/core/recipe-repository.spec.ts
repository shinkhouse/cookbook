import { TestBed } from '@angular/core/testing';
import { Recipe } from './model/recipes.model';
import { Recipes } from './mock/recipes.mock';
import { LocalRecipeRepository, RecipeRepository, provideLocalRecipes } from './recipe-repository';
import { RecipeStore } from './stores/recipe.store';

const KEY = 'cookbook.recipes';

function draft(slug: string, title = 'A Recipe'): Recipe {
  return {
    slug,
    title,
    tags: ['dinner'],
    time: '20 min',
    servings: 2,
    cooked: 0,
    blurb: 'A test recipe.',
    desc: '',
    ingredients: [{ qty: 1, unit: 'cup', name: 'water', aisle: 'pantry' }],
    steps: ['Boil it.'],
    notes: [],
  };
}

describe('LocalRecipeRepository', () => {
  let repo: RecipeRepository;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideLocalRecipes()] });
    repo = TestBed.inject(RecipeRepository);
  });

  afterEach(() => localStorage.clear());

  it('resolves to the concrete local implementation', () => {
    expect(repo).toBeInstanceOf(LocalRecipeRepository);
    expect(repo.durable).toBe(true);
  });

  it('hands back the bundled collection when nothing is stored', async () => {
    const loaded = await repo.load();
    expect(loaded.length).toBe(Recipes.length);
  });

  it('round-trips a saved collection', async () => {
    await repo.save([draft('a'), draft('b')]);
    const loaded = await repo.load();
    expect(loaded.map((r) => r.slug)).toEqual(['a', 'b']);
  });

  it('respects a deliberately emptied collection rather than reseeding', async () => {
    await repo.save([]);
    // The same rule PrefsStore uses for favourites: an empty array is a
    // decision, not an absence, so the seed must not come back.
    expect(await repo.load()).toEqual([]);
  });

  it('falls back to the seed when the stored entry is not an array', async () => {
    localStorage.setItem(KEY, JSON.stringify({ not: 'an array' }));
    expect((await repo.load()).length).toBe(Recipes.length);
  });

  it('falls back to the seed when the stored entry is corrupt', async () => {
    localStorage.setItem(KEY, '{ broken json');
    expect((await repo.load()).length).toBe(Recipes.length);
  });

  it('drops a malformed recipe rather than letting it reach a screen', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([draft('good'), { slug: 'bad', title: 'No arrays here' }]),
    );
    const loaded = await repo.load();
    // A recipe missing its ingredients array would throw on render.
    expect(loaded.map((r) => r.slug)).toEqual(['good']);
  });
});

describe('RecipeStore persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideLocalRecipes()] });
  });

  afterEach(() => localStorage.clear());

  /** The store loads asynchronously, so give the microtask queue a turn. */
  const settled = () => new Promise<void>((r) => setTimeout(r, 0));

  it('adds a recipe and keeps it across a fresh injection', async () => {
    const store = TestBed.inject(RecipeStore);
    await settled();
    const slug = store.add(draft('weeknight-dal', 'Weeknight Dal'));
    expect(slug).toBe('weeknight-dal');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideLocalRecipes()] });
    const fresh = TestBed.inject(RecipeStore);
    await settled();
    // The gap this closes: a saved recipe used to vanish on reload.
    expect(fresh.bySlug('weeknight-dal')?.title).toBe('Weeknight Dal');
    expect(fresh.recipes().length).toBe(Recipes.length + 1);
  });

  it('suffixes a slug that is already taken, and keeps both', async () => {
    const store = TestBed.inject(RecipeStore);
    await settled();
    const slug = store.add(draft('grandmas-chili', 'My Chili'));
    expect(slug).toBe('grandmas-chili-2');
    expect(store.bySlug('grandmas-chili')?.title).toBe("Grandma's Chili");
    expect(store.bySlug('grandmas-chili-2')?.title).toBe('My Chili');
  });

  it('removes a recipe, and the removal survives too', async () => {
    const store = TestBed.inject(RecipeStore);
    await settled();
    expect(store.remove('grandmas-chili')).toBe(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideLocalRecipes()] });
    const fresh = TestBed.inject(RecipeStore);
    await settled();
    expect(fresh.bySlug('grandmas-chili')).toBeUndefined();
  });

  it('reports false when removing a slug that is not there', async () => {
    const store = TestBed.inject(RecipeStore);
    await settled();
    expect(store.remove('no-such-recipe')).toBe(false);
  });

  it('updates a recipe in place', async () => {
    const store = TestBed.inject(RecipeStore);
    await settled();
    const existing = store.bySlug('grandmas-chili')!;
    expect(store.update({ ...existing, cooked: 99 })).toBe(true);
    expect(store.bySlug('grandmas-chili')?.cooked).toBe(99);
    expect(store.update({ ...existing, slug: 'ghost' })).toBe(false);
  });

  it('goes back to the bundled collection on request', async () => {
    const store = TestBed.inject(RecipeStore);
    await settled();
    store.add(draft('extra'));
    store.remove('grandmas-chili');
    store.resetToSeed();
    expect(store.recipes().length).toBe(Recipes.length);
    expect(store.bySlug('extra')).toBeUndefined();
    expect(store.bySlug('grandmas-chili')).toBeDefined();
  });

  it('keeps the derived facets in step with an added recipe', async () => {
    const store = TestBed.inject(RecipeStore);
    await settled();
    store.add({ ...draft('thai-curry', 'Thai Curry'), tags: ['thai', 'dinner'] });
    // Tags are derived, so a new tag has to reach the filter controls. It is
    // not in any defined group, so it belongs to the catch-all.
    expect(store.tags()).toContain('thai');
    expect(store.facets().find((f) => f.id === 'other')?.options).toContain('thai');
  });
});
