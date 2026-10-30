import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  CookbookRepository,
  HttpCookbookRepository,
  provideHttpCookbooks,
} from './cookbook-repository';
import { Cookbook } from './model/cookbooks.model';

const URL = '/api/cookbooks';

function draft(id: string, name = 'A Cookbook'): Cookbook {
  return { id, name };
}

describe('HttpCookbookRepository', () => {
  let repo: CookbookRepository;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideHttpCookbooks()],
    });
    repo = TestBed.inject(CookbookRepository);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('resolves to the concrete Http implementation, writable in development', () => {
    expect(repo).toBeInstanceOf(HttpCookbookRepository);
    expect(repo.writable).toBe(true);
  });

  it('lists from GET /cookbooks, dropping entries that cannot be used', async () => {
    const result = repo.list();
    httpMock
      .expectOne({ method: 'GET', url: URL })
      .flush([{ id: 'a', name: 'A' }, { id: '', name: 'x' }, { name: 'no id' }]);
    expect(await result).toEqual([{ id: 'a', name: 'A' }]);
  });

  it('rejects a list that fails', async () => {
    const result = repo.list();
    httpMock.expectOne(URL).flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await expectAsync(result).toBeRejected();
  });

  it('creates with POST /cookbooks and resolves to the response', async () => {
    const c = draft('grandmas');
    const result = repo.create(c);
    const req = httpMock.expectOne({ method: 'POST', url: URL });
    expect(req.request.body).toEqual(c);
    req.flush({ ...c }, { status: 201, statusText: 'Created' });
    expect(await result).toEqual(c);
  });

  it('rejects a create that conflicts, carrying the status', async () => {
    const result = repo.create(draft('grandmas'));
    httpMock.expectOne(URL).flush({ message: 'exists' }, { status: 409, statusText: 'Conflict' });
    const error = await result.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(409);
  });

  it('updates with PUT /cookbooks/:id', async () => {
    const c = draft('grandmas', 'Renamed');
    const result = repo.update(c);
    const req = httpMock.expectOne({ method: 'PUT', url: `${URL}/grandmas` });
    expect(req.request.body).toEqual(c);
    req.flush(c);
    expect(await result).toEqual(c);
  });

  it('resolves an update of a missing cookbook to null', async () => {
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

  it('removes with DELETE /cookbooks/:id, true on 204', async () => {
    const result = repo.remove('grandmas');
    httpMock
      .expectOne({ method: 'DELETE', url: `${URL}/grandmas` })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await result).toBe(true);
  });

  it('resolves a remove of a missing cookbook to false', async () => {
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

  it('URL-encodes the id', async () => {
    const result = repo.remove('a b');
    httpMock
      .expectOne({ method: 'DELETE', url: `${URL}/a%20b` })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(await result).toBe(true);
  });
});
