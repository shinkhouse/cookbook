import { TestBed } from '@angular/core/testing';
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
  // The drawer's menu item sits in a closed mat-menu and is not in the DOM, so
  // this asserts on the header button and on any link to the create route.
  it('offers no Add recipe link when the repository is not writable', () => {
    configure(false);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a.btn-primary')).toBeNull();
    expect(el.querySelector('a[href$="/recipes/new"]')).toBeNull();
    expect(el.textContent).not.toContain('Add recipe');
  });

  it('offers the Add recipe button when writable', () => {
    configure(true);
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const wide = !!el.querySelector('nav.site-nav');
    if (wide) expect(el.querySelector('a[href$="/recipes/new"]')).not.toBeNull();
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
});
