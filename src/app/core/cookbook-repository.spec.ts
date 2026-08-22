import { TestBed } from '@angular/core/testing';
import {
  CookbookRepository,
  LocalCookbookRepository,
  provideLocalCookbooks,
} from './cookbook-repository';
import { Cookbook, CookbookSeed, DEFAULT_COOKBOOK_ID } from './model/cookbooks.model';

const KEY = 'cookbook.cookbooks';

function draft(id: string, name = 'A Cookbook'): Cookbook {
  return { id, name };
}

describe('LocalCookbookRepository', () => {
  let repo: CookbookRepository;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideLocalCookbooks()] });
    repo = TestBed.inject(CookbookRepository);
  });

  afterEach(() => localStorage.clear());

  it('resolves to the concrete local implementation', () => {
    expect(repo).toBeInstanceOf(LocalCookbookRepository);
    expect(repo.durable).toBe(true);
  });

  it('hands back the seeded cookbook when nothing is stored', async () => {
    const loaded = await repo.load();
    expect(loaded.map((c) => c.id)).toEqual([DEFAULT_COOKBOOK_ID]);
    expect(loaded.length).toBe(CookbookSeed.length);
  });

  it('round-trips a saved collection', async () => {
    await repo.save([draft('sams-cookbook'), draft('grandmas', "Grandma's Cookbook")]);
    const loaded = await repo.load();
    expect(loaded.map((c) => c.name)).toEqual(['A Cookbook', "Grandma's Cookbook"]);
  });

  it('respects a deliberately emptied collection rather than reseeding', async () => {
    await repo.save([]);
    // Same null-sentinel rule the recipe and favourites stores use: an empty
    // array is a decision, not an absence.
    expect(await repo.load()).toEqual([]);
  });

  it('falls back to the seed when the stored entry is not an array', async () => {
    localStorage.setItem(KEY, JSON.stringify({ not: 'an array' }));
    expect((await repo.load()).map((c) => c.id)).toEqual([DEFAULT_COOKBOOK_ID]);
  });

  it('falls back to the seed when the stored entry is corrupt', async () => {
    localStorage.setItem(KEY, '{ broken json');
    expect((await repo.load()).map((c) => c.id)).toEqual([DEFAULT_COOKBOOK_ID]);
  });

  it('drops a cookbook with no usable id or name', async () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([draft('good'), { id: '', name: 'No id' }, { id: 'no-name' }]),
    );
    // An id-less cookbook can never be referenced by a recipe, and a nameless
    // one has nothing to render in a picker.
    expect((await repo.load()).map((c) => c.id)).toEqual(['good']);
  });

  it('keeps an optional description when one is set', async () => {
    await repo.save([{ ...draft('grandmas'), description: 'Everything she wrote down.' }]);
    expect((await repo.load())[0].description).toBe('Everything she wrote down.');
  });
});
