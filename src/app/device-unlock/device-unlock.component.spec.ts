import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from '../core/testing/fake-repositories';
import { DeviceUnlockComponent } from './device-unlock.component';

const KEY = 'cookbook.deviceKey';
const endpoint = `${environment.apiBase}/device/verify`;

/** Lets the unlock promise chain finish, then renders. */
async function settle(f: ComponentFixture<unknown>): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve));
  f.detectChanges();
}

describe('DeviceUnlockComponent', () => {
  let http: HttpTestingController;

  function render(writable: boolean): ComponentFixture<DeviceUnlockComponent> {
    localStorage.removeItem(KEY);
    const repo = new FakeRecipeRepository([]);
    repo.writable = writable;
    TestBed.configureTestingModule({
      imports: [DeviceUnlockComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...provideFakeRecipes(repo),
        ...provideFakeCookbooks(new FakeCookbookRepository([])),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(DeviceUnlockComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => localStorage.removeItem(KEY));

  const el = (f: ComponentFixture<unknown>): HTMLElement => f.nativeElement;
  const button = (f: ComponentFixture<unknown>, text: string): HTMLButtonElement | undefined =>
    Array.from(el(f).querySelectorAll('button')).find((b) => b.textContent?.trim() === text);

  async function submit(f: ComponentFixture<unknown>, passcode: string, status: number): Promise<void> {
    button(f, 'Unlock this device')!.click();
    f.detectChanges();
    await f.whenStable(); // ngModel registers its control in a microtask
    const input = el(f).querySelector('input') as HTMLInputElement;
    input.value = passcode;
    input.dispatchEvent(new Event('input'));
    button(f, 'Unlock')!.click();
    f.detectChanges();
    http.expectOne(endpoint).flush(null, { status, statusText: 'x' });
    await settle(f);
  }

  it('is absent in a writable build', () => {
    const f = render(true);
    expect(el(f).textContent?.trim()).toBe('');
    expect(el(f).querySelector('button')).toBeNull();
  });

  it('uses a password field that does not offer to save the passcode', () => {
    const f = render(false);
    button(f, 'Unlock this device')!.click();
    f.detectChanges();
    const input = el(f).querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.autocomplete).toBe('off');
  });

  it('unlocks, then shows Lock', async () => {
    const f = render(false);
    await submit(f, 'right', 204);
    expect(el(f).textContent).toContain('This device can save');
    expect(button(f, 'Lock')).toBeDefined();
    button(f, 'Lock')!.click();
    f.detectChanges();
    expect(button(f, 'Unlock this device')).toBeDefined();
  });

  it('shows the wrong-passcode message', async () => {
    const f = render(false);
    await submit(f, 'wrong', 403);
    expect(el(f).textContent).toContain("That passcode didn't work.");
    expect(el(f).querySelector('input')).not.toBeNull();
  });

  it('asks to wait after a lockout', async () => {
    const f = render(false);
    await submit(f, 'wrong', 429);
    expect(el(f).textContent).toContain('Too many tries. Wait 15 minutes and try again.');
  });

  it('uses Retry-After minutes when the server sends them', async () => {
    const f = render(false);
    button(f, 'Unlock this device')!.click();
    f.detectChanges();
    await f.whenStable(); // ngModel registers its control in a microtask
    const input = el(f).querySelector('input') as HTMLInputElement;
    input.value = 'x';
    input.dispatchEvent(new Event('input'));
    button(f, 'Unlock')!.click();
    http.expectOne(endpoint).flush({}, { status: 429, statusText: 'x', headers: { 'Retry-After': '300' } });
    await settle(f);
    expect(el(f).textContent).toContain('Wait 5 minutes and try again.');
  });

  it('says when the server cannot be reached', async () => {
    const f = render(false);
    await submit(f, 'x', 503);
    expect(el(f).textContent).toContain("Couldn't reach the recipe server.");
  });

  it('Cancel closes the form and clears the field', () => {
    const f = render(false);
    button(f, 'Unlock this device')!.click();
    f.detectChanges();
    button(f, 'Cancel')!.click();
    f.detectChanges();
    expect(el(f).querySelector('input')).toBeNull();
  });
});
