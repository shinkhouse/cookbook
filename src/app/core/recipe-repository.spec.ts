import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_COOKBOOK_ID } from './model/cookbooks.model';
import { Recipe } from './model/recipes.model';
import { HttpRecipeRepository, RecipeRepository, provideHttpRecipes } from './recipe-repository';

const URL = '/api/recipes';
/** A writable build, as every dev build is, lists archived recipes too. */
const LIST_URL = `${URL}?includeArchived=true`;

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
    cookbooks: [DEFAULT_COOKBOOK_ID],
  };
}

describe('HttpRecipeRepository', () => {
  let repo: RecipeRepository;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideHttpRecipes()],
    });
    repo = TestBed.inject(RecipeRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('resolves to the concrete Http implementation, writable in development', () => {
    expect(repo).toBeInstanceOf(HttpRecipeRepository);
    expect(repo.writable).toBe(true);
  });

  it('asks for archived recipes too when writable, so slugs stay unique', async () => {
    const result = repo.list();
    httpMock
      .expectOne({ method: 'GET', url: LIST_URL })
      .flush([draft('a')]);
    expect((await result).map((r) => r.slug)).toEqual(['a']);
  });

  it('asks for the plain list when not writable', async () => {
    (repo as { writable: boolean }).writable = false;
    const result = repo.list();
    httpMock.expectOne({ method: 'GET', url: URL }).flush([draft('a')]);
    expect((await result).map((r) => r.slug)).toEqual(['a']);
  });

  it('drops a malformed recipe rather than letting it reach a screen', async () => {
    const result = repo.list();
    httpMock
      .expectOne(LIST_URL)
      .flush([draft('good'), { slug: 'bad', title: 'No arrays here' }, { title: 'no slug' }]);
    // A recipe missing its ingredients array would throw on render.
    expect((await result).map((r) => r.slug)).toEqual(['good']);
  });

  it('drops a record without ingredients', async () => {
    const { ingredients, ...noIngredients } = draft('hollow');
    const result = repo.list();
    httpMock.expectOne(LIST_URL).flush([noIngredients]);
    expect(await result).toEqual([]);
  });

  it('files a recipe without cookbooks into the default cookbook', async () => {
    const { cookbooks, ...legacy } = draft('pre-cookbooks');
    const result = repo.list();
    httpMock.expectOne(LIST_URL).flush([legacy]);
    expect((await result)[0].cookbooks).toEqual([DEFAULT_COOKBOOK_ID]);
  });

  it('keeps a deliberately unfiled recipe unfiled', async () => {
    // An empty array is a decision, not an absence: treating it as missing would
    // make unfiling a recipe silently undo itself on the next load.
    const result = repo.list();
    httpMock.expectOne(LIST_URL).flush([{ ...draft('unfiled'), cookbooks: [] }]);
    expect((await result)[0].cookbooks).toEqual([]);
  });

  it('keeps a recipe filed in several cookbooks in all of them', async () => {
    const result = repo.list();
    httpMock
      .expectOne(LIST_URL)
      .flush([{ ...draft('shared'), cookbooks: ['sams-cookbook', 'grandmas'] }]);
    expect((await result)[0].cookbooks).toEqual(['sams-cookbook', 'grandmas']);
  });

  it('normalises a cookbooks value that is not an array', async () => {
    const result = repo.list();
    httpMock.expectOne(LIST_URL).flush([{ ...draft('corrupt'), cookbooks: 'sams-cookbook' }]);
    // Normalised rather than dropped: the recipe itself is fine, and a string
    // here would break every consumer that expects to iterate.
    expect((await result)[0].cookbooks).toEqual([DEFAULT_COOKBOOK_ID]);
  });

  it('rejects a list that fails', async () => {
    const result = repo.list();
    httpMock.expectOne(LIST_URL).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await expectAsync(result).toBeRejected();
  });

  it('creates with POST /recipes and resolves to the response', async () => {
    const r = draft('weeknight-dal');
    const result = repo.create(r);
    const req = httpMock.expectOne({ method: 'POST', url: URL });
    expect(req.request.body).toEqual(r);
    req.flush({ ...r }, { status: 201, statusText: 'Created' });
    expect(await result).toEqual(r);
  });

  it('rejects a create that conflicts, carrying the status', async () => {
    const result = repo.create(draft('weeknight-dal'));
    httpMock.expectOne(URL).flush({ message: 'exists' }, { status: 409, statusText: 'Conflict' });
    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(409);
  });

  it('updates with PUT /recipes/:slug', async () => {
    const r = draft('weeknight-dal', 'Renamed');
    const result = repo.update(r);
    const req = httpMock.expectOne({ method: 'PUT', url: `${URL}/weeknight-dal` });
    expect(req.request.body).toEqual(r);
    req.flush(r);
    expect(await result).toEqual(r);
  });

  it('resolves an update of a missing recipe to null', async () => {
    const result = repo.update(draft('nope'));
    httpMock
      .expectOne(`${URL}/nope`)
      .flush({ message: 'not found' }, { status: 404, statusText: 'Not Found' });
    expect(await result).toBeNull();
  });

  it('rejects an update that is forbidden', async () => {
    const result = repo.update(draft('a'));
    httpMock
      .expectOne(`${URL}/a`)
      .flush({ message: 'no' }, { status: 403, statusText: 'Forbidden' });
    await expectAsync(result).toBeRejected();
  });

  it('removes with DELETE /recipes/:slug, true on 204', async () => {
    const result = repo.remove('weeknight-dal');
    httpMock
      .expectOne({ method: 'DELETE', url: `${URL}/weeknight-dal` })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await result).toBe(true);
  });

  it('resolves a remove of a missing recipe to false', async () => {
    const result = repo.remove('nope');
    httpMock
      .expectOne(`${URL}/nope`)
      .flush({ message: 'not found' }, { status: 404, statusText: 'Not Found' });
    expect(await result).toBe(false);
  });

  it('rejects a remove that is forbidden', async () => {
    const result = repo.remove('a');
    httpMock
      .expectOne(`${URL}/a`)
      .flush({ message: 'no' }, { status: 403, statusText: 'Forbidden' });
    await expectAsync(result).toBeRejected();
  });

  it('URL-encodes the slug', async () => {
    const result = repo.remove('vanilla-crème brûlée');
    httpMock
      .expectOne({ method: 'DELETE', url: `${URL}/${encodeURIComponent('vanilla-crème brûlée')}` })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await result).toBe(true);
  });

  describe('addNote', () => {
    it('sends the device header with a note', async () => {
      localStorage.setItem('cookbook.deviceKey', JSON.stringify('sesame'));
      // A fresh injector picks the stored key up.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), provideHttpRecipes()],
      });
      const r = TestBed.inject(RecipeRepository);
      const mock = TestBed.inject(HttpTestingController);
      const result = r.addNote('a b', 'less salt');
      const req = mock.expectOne({ method: 'POST', url: `${URL}/a%20b/notes` });
      expect(req.request.body).toEqual({ note: 'less salt' });
      expect(req.request.headers.get('x-device-key')).toBe('sesame');
      req.flush({ ...draft('a b'), notes: ['less salt'] });
      expect((await result)?.notes).toEqual(['less salt']);
      mock.verify();
      localStorage.removeItem('cookbook.deviceKey');
    });

    it('gives null on a 404', async () => {
      const result = repo.addNote('gone', 'x');
      httpMock.expectOne(`${URL}/gone/notes`).flush({}, { status: 404, statusText: 'Not Found' });
      expect(await result).toBeNull();
    });
  });
});
