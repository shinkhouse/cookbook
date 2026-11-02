import { TestBed } from '@angular/core/testing';
import { FavoritesMigration } from './favorites-migration';
import { FAV_SEED, Recipes } from './mock/recipes.mock';
import { Recipe } from './model/recipes.model';
import { RecipeStore } from './stores/recipe.store';
import { PrefsStore } from './stores/prefs.store';
import { FakeRecipeRepository, provideFakeRecipes } from './testing/fake-repositories';

const FAVS_KEY = 'cookbook.favs';
const FLAG_KEY = 'cookbook.favsMigrated';

describe('FavoritesMigration', () => {
  let fake: FakeRecipeRepository;

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  function setup(seed: Recipe[] = Recipes, writable = true): FavoritesMigration {
    fake = new FakeRecipeRepository(seed);
    fake.writable = writable;
    TestBed.configureTestingModule({ providers: [provideFakeRecipes(fake)] });
    return TestBed.inject(FavoritesMigration);
  }

  const store = () => TestBed.inject(RecipeStore);
  const prefs = () => TestBed.inject(PrefsStore);
  const stored = (): string[] => JSON.parse(localStorage.getItem(FAVS_KEY) ?? 'null');
  const favSlugs = () => store().recipes().filter((r) => r.favorite).map((r) => r.slug).sort();

  it('pushes stored favorites once and sets the flag', async () => {
    localStorage.setItem(FAVS_KEY, JSON.stringify(['grandmas-chili', 'marry-me-chicken']));
    const migration = setup();
    const spy = spyOn(fake, 'setFavorite').and.callThrough();

    expect(await migration.run()).toBe(2);
    expect(favSlugs()).toEqual(['grandmas-chili', 'marry-me-chicken']);
    expect(prefs().favsMigrated()).toBeTrue();
    expect(localStorage.getItem(FAVS_KEY)).toBeNull();

    expect(await migration.run()).toBe(0);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('pushes FAV_SEED only when the server has no favorites and nothing is stored', async () => {
    const migration = setup();
    expect(await migration.run()).toBe(FAV_SEED.length);
    expect(favSlugs()).toEqual([...FAV_SEED].sort());
    expect(prefs().favsMigrated()).toBeTrue();
  });

  it('pushes nothing from a device with no stored list once the server has favorites', async () => {
    const seed = Recipes.map((r) => (r.slug === 'grandmas-chili' ? { ...r, favorite: true } : r));
    const migration = setup(seed);
    const spy = spyOn(fake, 'setFavorite').and.callThrough();

    expect(await migration.run()).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(favSlugs()).toEqual(['grandmas-chili']);
    expect(prefs().favsMigrated()).toBeTrue();
  });

  it('skips slugs already favorite or unknown', async () => {
    const seed = Recipes.map((r) => (r.slug === 'grandmas-chili' ? { ...r, favorite: true } : r));
    localStorage.setItem(
      FAVS_KEY,
      JSON.stringify(['grandmas-chili', 'no-such-recipe', 'marry-me-chicken']),
    );
    const migration = setup(seed);
    const spy = spyOn(fake, 'setFavorite').and.callThrough();

    expect(await migration.run()).toBe(1);
    expect(spy).toHaveBeenCalledOnceWith('marry-me-chicken', true);
    expect(favSlugs()).toEqual(['grandmas-chili', 'marry-me-chicken']);
  });

  it('retries next time when a push fails', async () => {
    localStorage.setItem(FAVS_KEY, JSON.stringify(['grandmas-chili', 'marry-me-chicken']));
    const migration = setup();
    await store().whenLoaded();
    fake.failNext({ status: 503 });

    expect(await migration.run()).toBe(0);
    expect(prefs().favsMigrated()).toBeFalse();
    expect(localStorage.getItem(FLAG_KEY)).toBeNull();
    expect(stored()).toEqual(['grandmas-chili', 'marry-me-chicken']);

    expect(await migration.run()).toBe(2);
    expect(favSlugs()).toEqual(['grandmas-chili', 'marry-me-chicken']);
    expect(prefs().favsMigrated()).toBeTrue();
  });

  it('finishes the seed on a retry after a push fails partway through it', async () => {
    const migration = setup();
    await store().whenLoaded();
    const real = fake.setFavorite.bind(fake);
    let calls = 0;
    spyOn(fake, 'setFavorite').and.callFake(async (slug, fav) => {
      // The second push fails: one seed star is on the server, the rest are not.
      if (++calls === 2) throw { status: 503 };
      return real(slug, fav);
    });

    // One star went up before the failure; the flag stays unset.
    expect(await migration.run()).toBe(1);
    expect(favSlugs()).toEqual([FAV_SEED[0]]);
    expect(prefs().favsMigrated()).toBeFalse();

    // The server now has a favorite, so the retry must not judge by favCount().
    expect(await migration.run()).toBe(FAV_SEED.length - 1);
    expect(favSlugs()).toEqual([...FAV_SEED].sort());
    expect(prefs().favsMigrated()).toBeTrue();
    expect(localStorage.getItem(FAVS_KEY)).toBeNull();
  });

  it('does nothing on a locked read-only device', async () => {
    localStorage.setItem(FAVS_KEY, JSON.stringify(['grandmas-chili']));
    const migration = setup(Recipes, false);
    const spy = spyOn(fake, 'setFavorite').and.callThrough();
    await store().whenLoaded();

    expect(store().canSave()).toBeFalse();
    expect(await migration.run()).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    expect(prefs().favsMigrated()).toBeFalse();
    expect(stored()).toEqual(['grandmas-chili']);
  });

  it('runs once when called twice at the same time', async () => {
    localStorage.setItem(FAVS_KEY, JSON.stringify(['grandmas-chili']));
    const migration = setup();
    const spy = spyOn(fake, 'setFavorite').and.callThrough();
    const [a, b] = await Promise.all([migration.run(), migration.run()]);
    expect(a + b).toBe(1);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
