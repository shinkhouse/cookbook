import { TestBed } from '@angular/core/testing';
import { FAV_SEED } from '../mock/recipes.mock';
import { ListStore, boughtKey } from './list.store';
import { PrefsStore } from './prefs.store';
import { RecipeStore, tagLabel } from './recipe.store';

describe('RecipeStore', () => {
  let store: RecipeStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(RecipeStore);
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

describe('PrefsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
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
    TestBed.configureTestingModule({});
    expect(TestBed.inject(PrefsStore).isFav('grandmas-spaghetti')).toBe(false);
  });

  it('respects a deliberately emptied favourites list rather than reseeding', () => {
    const prefs = TestBed.inject(PrefsStore);
    for (const slug of [...prefs.favs()]) prefs.toggleFav(slug);
    expect(prefs.favCount()).toBe(0);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
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
    TestBed.configureTestingModule({});
    expect(TestBed.inject(PrefsStore).layout()).toBe('single-column');
  });
});

describe('ListStore', () => {
  let list: ListStore;
  let recipes: RecipeStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    list = TestBed.inject(ListStore);
    recipes = TestBed.inject(RecipeStore);
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

  it('ignores a stored slug that no longer matches a recipe', () => {
    localStorage.setItem('cookbook.cart', JSON.stringify(['deleted-recipe']));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(ListStore);
    expect(fresh.cart()).toEqual(['deleted-recipe']);
    expect(() => fresh.groups()).not.toThrow();
    expect(fresh.totalItems()).toBe(0);
  });

  it('persists the cart and bought marks across a fresh injection', () => {
    list.addRecipe('grandmas-chili');
    list.toggleBought('grandmas-chili', 1);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fresh = TestBed.inject(ListStore);
    expect(fresh.cart()).toEqual(['grandmas-chili']);
    expect(fresh.isBought('grandmas-chili', 1)).toBe(true);
  });

  it('scopes the bought key per recipe', () => {
    expect(boughtKey('a-recipe', 3)).toBe('a-recipe:3');
  });
});
