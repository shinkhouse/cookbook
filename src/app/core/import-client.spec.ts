import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { ImportClient, ImportPreview } from './import-client';
import { describeWriteError } from './write-error';

describe('ImportClient', () => {
  let client: ImportClient;
  let http: HttpTestingController;
  const endpoint = `${environment.apiBase}/import/preview`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    client = TestBed.inject(ImportClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts the url and resolves to the preview', async () => {
    const preview: ImportPreview = {
      sourceUrl: 'https://example.com/soup',
      title: 'Soup',
      description: 'Warm.',
      ingredientGroups: [{ name: null, lines: ['1 leek'] }],
      steps: ['Simmer.'],
    };
    const pending = client.previewRecipe('https://example.com/soup');
    const req = http.expectOne(endpoint);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ url: 'https://example.com/soup' });
    req.flush(preview);
    await expectAsync(pending).toBeResolvedTo(preview);
  });

  it('rejects with an error describeWriteError can read', async () => {
    const pending = client.previewRecipe('https://example.com/nothing');
    http
      .expectOne(endpoint)
      .flush({ message: 'No recipe found on that page.' }, { status: 422, statusText: 'Unprocessable' });
    const err = await pending.then(
      () => null,
      (e: unknown) => e,
    );
    expect(describeWriteError(err)).toBe('No recipe found on that page.');
  });
});
