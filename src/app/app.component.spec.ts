import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { AppComponent } from './app.component';
import { routes } from './app.routes';
import {
  FakeCookbookRepository,
  FakeRecipeRepository,
  provideFakeCookbooks,
  provideFakeRecipes,
} from './core/testing/fake-repositories';

/** The shell reads matchMedia once at construction, so stub it before creating it. */
function stubNarrow(narrow: boolean): void {
  spyOn(window, 'matchMedia').and.returnValue({
    matches: narrow,
    media: '',
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  } as unknown as MediaQueryList);
}

function configure(writable: boolean, withRoutes = false): void {
  const recipes = new FakeRecipeRepository([]);
  recipes.writable = writable;
  TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [
      provideRouter(withRoutes ? routes : []),
      ...provideFakeRecipes(recipes),
      ...provideFakeCookbooks(new FakeCookbookRepository([])),
    ],
  });
}

describe('read-only build', () => {
  function shell(narrow: boolean, writable: boolean): ComponentFixture<AppComponent> {
    stubNarrow(narrow);
    configure(writable);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.isNarrow()).toBe(narrow);
    return fixture;
  }

  async function openDrawer(fixture: ComponentFixture<AppComponent>): Promise<void> {
    (fixture.nativeElement.querySelector('button.drawer-trigger') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const addLinks = (root: ParentNode): NodeListOf<Element> =>
    root.querySelectorAll('a[href$="/recipes/new"]');

  it('wide layout offers the Add recipe button when writable', () => {
    const el = shell(false, true).nativeElement as HTMLElement;
    const link = el.querySelector('a.btn-primary');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toMatch(/\/recipes\/new$/);
  });

  it('wide layout offers no Add recipe link when not writable', () => {
    const el = shell(false, false).nativeElement as HTMLElement;
    expect(el.querySelector('nav.site-nav')).not.toBeNull();
    expect(el.querySelector('a.btn-primary')).toBeNull();
    expect(addLinks(el).length).toBe(0);
  });

  it('narrow layout lists Add recipe in the open drawer when writable', async () => {
    const fixture = shell(true, true);
    await openDrawer(fixture);
    expect(addLinks(document.body).length).toBe(1);
  });

  it('narrow layout leaves Add recipe out of the open drawer when not writable', async () => {
    const fixture = shell(true, false);
    await openDrawer(fixture);
    // The drawer really opened: its other items are there.
    expect(document.body.textContent).toContain('Shopping list');
    expect(addLinks(document.body).length).toBe(0);
  });

  it('sends /recipes/new home when not writable', async () => {
    configure(false, true);
    await RouterTestingHarness.create('/recipes/new');
    expect(TestBed.inject(Router).url).toBe('/');
  });

  it('keeps /recipes/new when writable', async () => {
    configure(true, true);
    await RouterTestingHarness.create('/recipes/new');
    expect(TestBed.inject(Router).url).toBe('/recipes/new');
  });

  it('shows the footer unlock entry when not writable, and not in cook mode', async () => {
    stubNarrow(false);
    const recipes = new FakeRecipeRepository([]);
    recipes.writable = false;
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        ...provideFakeRecipes(recipes),
        ...provideFakeCookbooks(new FakeCookbookRepository([])),
      ],
    });
    const fixture = TestBed.createComponent(AppComponent);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/anywhere');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('footer.site-footer')?.textContent).toContain(
      'Unlock this device',
    );
    await router.navigateByUrl('/recipes/anything/cook');
    fixture.detectChanges();
    expect(fixture.componentInstance.isCookMode()).toBeTrue();
    expect(fixture.nativeElement.querySelector('footer.site-footer')).toBeNull();
  });
});
