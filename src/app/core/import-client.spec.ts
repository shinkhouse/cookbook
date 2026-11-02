import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { ImportClient, ImportPreview, MAX_PHOTO_BYTES, photoProblem } from './import-client';
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

  it('posts the file as multipart field photo', async () => {
    const file = new File(['x'], 'card.jpg', { type: 'image/jpeg' });
    const pending = client.previewPhoto(file);
    const req = http.expectOne(`${environment.apiBase}/import/photo`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBeTrue();
    expect((req.request.body as FormData).get('photo')).toBe(file);
    expect(Array.from((req.request.body as FormData).keys())).toEqual(['photo']);
    const answer: ImportPreview = { sourceUrl: '', title: 'Soup', description: '', ingredientGroups: [], steps: [] };
    req.flush(answer);
    await expectAsync(pending).toBeResolvedTo(answer);
  });

  for (const [name, type] of [
    ['card.HEIC', 'image/heic'],
    ['card.heif', 'image/heif'],
  ]) {
    it(`labels a typeless ${name} as ${type}, so the API's filter accepts it`, async () => {
      const file = new File(['bytes'], name, { type: '' });
      const pending = client.previewPhoto(file);
      const req = http.expectOne(`${environment.apiBase}/import/photo`);
      const sent = (req.request.body as FormData).get('photo') as File;
      expect(sent.type).toBe(type);
      expect(sent.name).toBe(name);
      expect(await sent.text()).toBe('bytes');
      req.flush({ sourceUrl: '', title: '', description: '', ingredientGroups: [], steps: [] });
      await pending;
    });
  }
});

describe('photoProblem', () => {
  it('flags a photo over 10 MB', () => {
    const big = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'big.jpg', { type: 'image/jpeg' });
    expect(photoProblem(big)).toBe('That photo is over 10 MB.');
  });

  it('flags a GIF', () => {
    expect(photoProblem(new File(['x'], 'a.gif', { type: 'image/gif' }))).toBe(
      'Use a JPEG, PNG, WebP or HEIC photo.',
    );
  });

  it('accepts a nameless-type card.HEIC and a plain JPEG', () => {
    expect(photoProblem(new File(['x'], 'card.HEIC', { type: '' }))).toBe('');
    expect(photoProblem(new File(['x'], 'card.jpg', { type: 'image/jpeg' }))).toBe('');
  });
});
