import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../testing/fake-repositories';
import { DeviceStore } from './device.store';
import { RecipeStore } from './recipe.store';

const KEY = 'cookbook.deviceKey';
const endpoint = `${environment.apiBase}/device/verify`;

describe('DeviceStore', () => {
  let store: DeviceStore;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem(KEY);
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(DeviceStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(KEY);
  });

  it('stores the passcode on 204 and reports ok', async () => {
    const pending = store.unlock('open sesame');
    const req = http.expectOne(endpoint);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('x-device-key')).toBe('open sesame');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(await pending).toBe('ok');
    expect(store.unlocked()).toBeTrue();
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify('open sesame'));
  });

  it('reports wrong on 403 and stores nothing', async () => {
    const pending = store.unlock('nope');
    http.expectOne(endpoint).flush({ message: 'Writes are not permitted.' }, { status: 403, statusText: 'Forbidden' });
    expect(await pending).toBe('wrong');
    expect(store.unlocked()).toBeFalse();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('reports locked-out on 429', async () => {
    const pending = store.unlock('nope');
    http.expectOne(endpoint).flush({}, { status: 429, statusText: 'Too Many Requests' });
    expect(await pending).toBe('locked-out');
    expect(store.unlocked()).toBeFalse();
  });

  it('reads Retry-After as whole minutes, rounding up, defaulting to 15', async () => {
    expect(store.lockoutMinutes()).toBe(15);
    const pending = store.unlock('nope');
    http
      .expectOne(endpoint)
      .flush({}, { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '125' } });
    expect(await pending).toBe('locked-out');
    expect(store.lockoutMinutes()).toBe(3);
  });

  it('reports unreachable on anything else', async () => {
    const pending = store.unlock('x');
    http.expectOne(endpoint).flush('', { status: 502, statusText: 'Bad Gateway' });
    expect(await pending).toBe('unreachable');
  });

  it('answers wrong for a blank passcode without a request', async () => {
    expect(await store.unlock('   ')).toBe('wrong');
    http.expectNone(endpoint);
  });

  it('sends the header only once unlocked', async () => {
    expect(store.headers()).toEqual({});
    const pending = store.unlock('k1');
    http.expectOne(endpoint).flush(null, { status: 204, statusText: 'No Content' });
    await pending;
    expect(store.headers()).toEqual({ 'x-device-key': 'k1' });
  });

  it('lock() forgets the passcode', async () => {
    const pending = store.unlock('k1');
    http.expectOne(endpoint).flush(null, { status: 204, statusText: 'No Content' });
    await pending;
    store.lock();
    expect(store.unlocked()).toBeFalse();
    expect(store.headers()).toEqual({});
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('starts unlocked when a passcode was stored earlier', () => {
    localStorage.setItem(KEY, JSON.stringify('kept'));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const again = TestBed.inject(DeviceStore);
    expect(again.unlocked()).toBeTrue();
    expect(again.headers()).toEqual({ 'x-device-key': 'kept' });
  });
});

describe('RecipeStore.canSave', () => {
  function build(writable: boolean): { recipes: RecipeStore; device: DeviceStore } {
    localStorage.removeItem(KEY);
    const repo = new FakeRecipeRepository([]);
    repo.writable = writable;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideFakeRecipes(repo),
        ...provideFakeCookbooks(new FakeCookbookRepository([])),
      ],
    });
    return { recipes: TestBed.inject(RecipeStore), device: TestBed.inject(DeviceStore) };
  }

  it('is true in a writable build without unlock, and follows unlock in a read-only build', async () => {
    expect(build(true).recipes.canSave()).toBeTrue();
    TestBed.resetTestingModule();

    const { recipes, device } = build(false);
    expect(recipes.canSave()).toBeFalse();
    const pending = device.unlock('k');
    TestBed.inject(HttpTestingController)
      .expectOne(endpoint)
      .flush(null, { status: 204, statusText: 'No Content' });
    await pending;
    expect(recipes.canSave()).toBeTrue();
    device.lock();
    expect(recipes.canSave()).toBeFalse();
  });
});
